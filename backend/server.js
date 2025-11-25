// backend/server.js
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('⚠️  Warning: JWT_SECRET not set. Set JWT_SECRET in .env in production!');
}
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0'; // bind to all interfaces for Codespaces / Docker

const app = express();
app.use(cors());
app.use(express.json()); // use built-in body parser

// Simple request logger middleware (method, path, timestamp)
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// --------------------
// DB init
// --------------------
const DB_PATH = process.env.DB_PATH || './data.sqlite';
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('DB init error', err);
    process.exit(1);
  }
});
db.serialize(() => {
  db.run(`PRAGMA foreign_keys = ON;`);
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'TODO',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  // logs table for persisted logs
  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    method TEXT,
    path TEXT,
    user_id TEXT,
    body TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
});

// --------------------
// Utilities & Validation
// --------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateEmail(e){ return typeof e === 'string' && EMAIL_RE.test(e); }
function validatePassword(p){ return typeof p === 'string' && p.length >= 6; }
function safeJsonString(obj){
  try { return JSON.stringify(obj); } catch(e){ return null; }
}

// auth middleware
function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing auth token' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid auth format' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET || 'dev_secret_replace_in_prod');
    req.user = payload; // { id, email }
    return next();
  } catch(e){
    return res.status(401).json({ error: 'Invalid/expired token' });
  }
}

// Persist request logs for task-related APIs (helper)
function persistLog(method, path, userId, body){
  const b = safeJsonString(body);
  const stmt = db.prepare(`INSERT INTO logs (method, path, user_id, body) VALUES (?, ?, ?, ?)`);
  stmt.run([method, path, userId || null, b], (err) => {
    if (err) console.error('persistLog err', err);
  });
}

// --------------------
// In-memory per-user cache (30s) with counters
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

// health + metrics
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/metrics', (req, res) => res.json({
  cacheHits, cacheMisses, cacheSize: cache.size
}));

// Signup
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!validateEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ error: 'Invalid email or password (min 6 chars)' });
  }
  const id = uuidv4();
  try {
    const hash = await bcrypt.hash(password, 10);
    const stmt = db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)`);
    stmt.run([id, email.toLowerCase(), hash], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already in use' });
        console.error('signup err', err);
        return res.status(500).json({ error: 'DB error' });
      }
      const token = jwt.sign({ id, email }, JWT_SECRET || 'dev_secret_replace_in_prod', { expiresIn: '7d' });
      return res.json({ token, user: { id, email } });
    });
  } catch(e){
    console.error('signup error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!validateEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ error: 'Invalid email or password (min 6 chars)' });
  }
  const q = `SELECT id, password_hash FROM users WHERE email = ?`;
  db.get(q, [email.toLowerCase()], async (err, row) => {
    if (err) {
      console.error('login err', err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!row) return res.status(400).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: row.id, email }, JWT_SECRET || 'dev_secret_replace_in_prod', { expiresIn: '7d' });
    return res.json({ token, user: { id: row.id, email } });
  });
});

// Create task
app.post('/api/tasks', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { title } = req.body || {};
  if (!title || typeof title !== 'string' || title.trim().length === 0) return res.status(400).json({ error: 'title required' });
  const id = uuidv4();
  db.run(`INSERT INTO tasks (id, user_id, title, status) VALUES (?, ?, ?, ?)`, [id, userId, title.trim(), 'TODO'], function(err) {
    if (err) {
      console.error('create task err', err);
      return res.status(500).json({ error: 'DB error' });
    }
    invalidateCache(userId);
    persistLog('POST', '/api/tasks', userId, { title });
    return res.json({ id, user_id: userId, title, status: 'TODO' });
  });
});

// List tasks (with cache)
app.get('/api/tasks', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const cached = getCachedTasks(userId);
  if (cached) {
    persistLog('GET', '/api/tasks (cached)', userId, {});
    return res.json({ cached: true, tasks: cached });
  }
  const q = `SELECT id, title, status, created_at, updated_at FROM tasks WHERE user_id = ? ORDER BY created_at DESC`;
  db.all(q, [userId], (err, rows) => {
    if (err) {
      console.error('list tasks err', err);
      return res.status(500).json({ error: 'DB error' });
    }
    setCachedTasks(userId, rows);
    persistLog('GET', '/api/tasks', userId, {});
    return res.json({ cached: false, tasks: rows });
  });
});

// Update task status
app.patch('/api/tasks/:id/status', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const taskId = req.params.id;
  const { status } = req.body || {};
  if (!['TODO','IN_PROGRESS','DONE'].includes(status)) return res.status(400).json({ error: 'invalid status' });

  const q = `SELECT id FROM tasks WHERE id = ? AND user_id = ?`;
  db.get(q, [taskId, userId], (err, row) => {
    if (err) { console.error('check task err', err); return res.status(500).json({ error: 'DB error' }); }
    if (!row) return res.status(404).json({ error: 'task not found' });

    const upd = `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(upd, [status, taskId], function(uerr) {
      if (uerr) { console.error('update status err', uerr); return res.status(500).json({ error: 'DB error' }); }
      invalidateCache(userId);
      persistLog('PATCH', `/api/tasks/${taskId}/status`, userId, { status });
      return res.json({ id: taskId, status });
    });
  });
});

// Optional: edit title
app.patch('/api/tasks/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const taskId = req.params.id;
  const { title } = req.body || {};
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title required' });

  const q = `SELECT id FROM tasks WHERE id = ? AND user_id = ?`;
  db.get(q, [taskId, userId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'task not found' });
    db.run(`UPDATE tasks SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [title.trim(), taskId], function(uerr) {
      if (uerr) return res.status(500).json({ error: 'DB error' });
      invalidateCache(userId);
      persistLog('PATCH', `/api/tasks/${taskId}`, userId, { title });
      return res.json({ id: taskId, title });
    });
  });
});

// Optional: delete
app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const taskId = req.params.id;
  db.run(`DELETE FROM tasks WHERE id = ? AND user_id = ?`, [taskId, userId], function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (this.changes === 0) return res.status(404).json({ error: 'not found' });
    invalidateCache(userId);
    persistLog('DELETE', `/api/tasks/${taskId}`, userId, {});
    return res.json({ success: true });
  });
});

// Endpoint to read recent logs (for demo / admin). Limit to small number.
app.get('/api/logs/recent', authMiddleware, (req, res) => {
  // NOTE: in a real app this would require admin role. For demo, only return logs for this user.
  const userId = req.user.id;
  db.all(`SELECT id, method, path, body, created_at FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    return res.json({ rows });
  });
});

app.get('/', (req, res) => res.send('Tasks backend is running'));

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
