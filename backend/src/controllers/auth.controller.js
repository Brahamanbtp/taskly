const { pool } = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { logSystemEvent } = require('../lib/audit');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_replace_in_prod';

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

async function signup(req, res) {
  const { email, password } = authSchema.parse(req.body);

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    const q = `INSERT INTO users(id, email, password_hash) VALUES($1, $2, $3) RETURNING id, email`;
    const r = await client.query(q, [id, email.toLowerCase(), hash]);
    
    const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ token, user: { id: r.rows[0].id, email: r.rows[0].email } });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(400).json({ error: 'Email already in use' });
    }
    throw err; // Caught by error middleware
  } finally {
    client.release();
  }
}

async function login(req, res) {
  const { email, password } = authSchema.parse(req.body);

  const client = await pool.connect();
  try {
    const q = `SELECT id, password_hash FROM users WHERE email=$1`;
    const r = await client.query(q, [email.toLowerCase()]);
    
    if (r.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const row = r.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: row.id, email }, JWT_SECRET, { expiresIn: '7d' });
    
    // Audit Log
    await logSystemEvent({ userId: row.id, eventType: 'LOGIN', details: { method: 'password' }, req });

    return res.json({ token, user: { id: row.id, email } });
  } finally {
    client.release();
  }
}

async function googleCallback(req, res) {
  // Passport already verified the user and attached to req.user
  const user = req.user;
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  
  // Audit Log
  await logSystemEvent({ userId: user.id, eventType: 'LOGIN', details: { method: 'google' }, req });

  // Redirect to frontend with token in a way the client can grab it
  // In a real app, you might use a cookie or a secure redirect
  res.send(`
    <html>
      <script>
        localStorage.setItem('taskly_token', '${token}');
        window.location.href = '/tasks';
      </script>
    </html>
  `);
}

async function me(req, res) {
  // Returns current user based on token
  return res.json({ user: req.user });
}

module.exports = { signup, login, me, googleCallback };
