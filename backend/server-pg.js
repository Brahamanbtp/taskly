// backend/server-pg.js
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) console.warn('⚠️ JWT_SECRET not set; use .env in production');

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// Postgres pool
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set in env');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

// Helpers
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateEmail(e){ return typeof e === 'string' && EMAIL_RE.test(e); }
function validatePassword(p){ return typeof p === 'string' && p.length >= 6; }
function safeJsonString(obj){ try { return JSON.stringify(obj); } catch (e) { return null; } }

// Auth middleware
async function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing auth token' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid auth format' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET || 'dev_secret_replace_in_prod');
    req.user = payload;
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Invalid/expired token' });
  }
}

// Persist log helper
async function persistLog(client, method, path, userId, body){
  const b = safeJsonString(body);
  try {
    await client.query(
      `INSERT INTO logs(method, path, user_id, body) VALUES ($1,$2,$3,$4)`,
      [method, path, userId || null, b]
    );
  } catch(err){
    console.error('persistLog err', err);
  }
}

// --------------------
// Simple in-memory per-user cache (30s)
// --------------------
const cache = new Map();
const CACHE_TTL_MS = 30 * 1000;
let cacheHits = 0, cacheMisses = 0;

function getCachedTasks(userId){
  const entry = cache.get(userId);
  const now = Date.now();
  if (entry && (now - entry.ts) < CACHE_TTL_MS) {
    cacheHits++;
    return entry.tasks;
  }
  cacheMisses++;
  return null;
}
function setCachedTasks(userId, tasks){
  cache.set(userId, { ts: Date.now(), tasks });
}
function invalidateCache(userId){ cache.delete(userId); }

// --------------------
// Routes
// --------------------

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/metrics', (req, res) => res.json({ cacheHits, cacheMisses, cacheSize: cache.size }));

// Signup
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!validateEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ error: 'Invalid email or password (min 6 chars)' });
  }
  const id = uuidv4();
  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash(password, 10);
    const q = `INSERT INTO users(id, email, password_hash) VALUES($1,$2,$3) RETURNING id, email`;
    const r = await client.query(q, [id, email.toLowerCase(), hash]);
    const token = jwt.sign({ id, email }, JWT_SECRET || 'dev_secret_replace_in_prod', { expiresIn: '7d' });
    return res.json({ token, user: { id: r.rows[0].id, email: r.rows[0].email } });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(400).json({ error: 'Email already in use' });
    }
    console.error('signup err', err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!validateEmail(email) || !validatePassword(password)) return res.status(400).json({ error: 'Invalid email or password (min 6 chars)' });
  const client = await pool.connect();
  try {
    const q = `SELECT id, password_hash FROM users WHERE email=$1`;
    const r = await client.query(q, [email.toLowerCase()]);
    if (r.rowCount === 0) return res.status(400).json({ error: 'Invalid credentials' });
    const row = r.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: row.id, email }, JWT_SECRET || 'dev_secret_replace_in_prod', { expiresIn: '7d' });
    return res.json({ token, user: { id: row.id, email } });
  } catch (err) {
    console.error('login err', err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Create task
app.post('/api/tasks', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { title } = req.body || {};
  if (!title || typeof title !== 'string' || title.trim().length === 0) return res.status(400).json({ error: 'title required' });

  const client = await pool.connect();
  try {
    const id = uuidv4();
    const q = `INSERT INTO tasks(id, user_id, title, status) VALUES($1,$2,$3,$4) RETURNING id, user_id, title, status, created_at`;
    const r = await client.query(q, [id, userId, title.trim(), 'TODO']);
    invalidateCache(userId);
    await persistLog(client, 'POST', '/api/tasks', userId, { title });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('create task err', err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// List tasks (with cache)
app.get('/api/tasks', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const cached = getCachedTasks(userId);
  if (cached) {
    // note: we still log that this request happened (cached)
    // use a client to persist log
    const client = await pool.connect();
    try { await persistLog(client, 'GET', '/api/tasks (cached)', userId, {}); } catch(e){/*ignore*/} finally { client.release(); }
    return res.json({ cached: true, tasks: cached });
  }
  const client = await pool.connect();
  try {
    const q = `SELECT id, title, status, created_at, updated_at FROM tasks WHERE user_id=$1 ORDER BY created_at DESC`;
    const r = await client.query(q, [userId]);
    setCachedTasks(userId, r.rows);
    await persistLog(client, 'GET', '/api/tasks', userId, {});
    return res.json({ cached: false, tasks: r.rows });
  } catch (err) {
    console.error('list tasks err', err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Update task status
app.patch('/api/tasks/:id/status', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const taskId = req.params.id;
  const { status } = req.body || {};
  if (!['TODO','IN_PROGRESS','DONE'].includes(status)) return res.status(400).json({ error: 'invalid status' });

  const client = await pool.connect();
  try {
    const check = await client.query(`SELECT id FROM tasks WHERE id=$1 AND user_id=$2`, [taskId, userId]);
    if (check.rowCount === 0) return res.status(404).json({ error: 'task not found' });
    await client.query(`UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2`, [status, taskId]);
    invalidateCache(userId);
    await persistLog(client, 'PATCH', `/api/tasks/${taskId}/status`, userId, { status });
    return res.json({ id: taskId, status });
  } catch (err) {
    console.error('update status err', err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Edit title
app.patch('/api/tasks/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const taskId = req.params.id;
  const { title } = req.body || {};
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title required' });
  const client = await pool.connect();
  try {
    const check = await client.query(`SELECT id FROM tasks WHERE id=$1 AND user_id=$2`, [taskId, userId]);
    if (check.rowCount === 0) return res.status(404).json({ error: 'task not found' });
    await client.query(`UPDATE tasks SET title=$1, updated_at=NOW() WHERE id=$2`, [title.trim(), taskId]);
    invalidateCache(userId);
    await persistLog(client, 'PATCH', `/api/tasks/${taskId}`, userId, { title });
    return res.json({ id: taskId, title });
  } catch (err) {
    console.error('edit title err', err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Delete
app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const taskId = req.params.id;
  const client = await pool.connect();
  try {
    const r = await client.query(`DELETE FROM tasks WHERE id=$1 AND user_id=$2 RETURNING id`, [taskId, userId]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
    invalidateCache(userId);
    await persistLog(client, 'DELETE', `/api/tasks/${taskId}`, userId, {});
    return res.json({ success: true });
  } catch (err) {
    console.error('delete err', err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Recent logs for current user (demo)
app.get('/api/logs/recent', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    const r = await client.query(`SELECT id, method, path, body, created_at FROM logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [userId]);
    return res.json({ rows: r.rows });
  } catch (err) {
    console.error('logs err', err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

app.get('/', (req, res) => res.send('Taskly backend (postgres) running'));

app.listen(PORT, HOST, () => console.log(`Server listening on http://${HOST}:${PORT}`));
