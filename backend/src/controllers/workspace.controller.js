const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { logSystemEvent } = require('../lib/audit');

const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required").trim(),
});
const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'BILLING_ADMIN', 'MEMBER', 'VIEWER', 'EXTERNAL_GUEST']).default('MEMBER'),
});

async function listWorkspaces(req, res) {
  const userId = req.user.id;
  console.log(`[Debug] Listing workspaces for user: ${userId}`);
  const client = await pool.connect();
  try {
    const q = `
      SELECT w.id, w.name, w.owner_id, w.created_at, wm.role 
      FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE wm.user_id = $1
      ORDER BY w.created_at ASC
    `;
    const r = await client.query(q, [userId]);
    console.log(`[Debug] Found ${r.rowCount} workspaces`);
    return res.json(r.rows);
  } catch (err) {
    console.error(`[Error] listWorkspaces failed:`, err);
    throw err;
  } finally {
    client.release();
  }
}

async function createWorkspace(req, res) {
  const userId = req.user.id;
  const { name } = createWorkspaceSchema.parse(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const wsId = uuidv4();
    const q1 = `INSERT INTO workspaces(id, name, owner_id) VALUES($1, $2, $3) RETURNING *`;
    const r1 = await client.query(q1, [wsId, name, userId]);
    
    const q2 = `INSERT INTO workspace_members(workspace_id, user_id, role) VALUES($1, $2, 'OWNER')`;
    await client.query(q2, [wsId, userId]);

    await client.query('COMMIT');
    
    await logSystemEvent({ userId, workspaceId: wsId, eventType: 'WORKSPACE_CREATED', details: { name }, req });

    return res.status(201).json({ ...r1.rows[0], role: 'OWNER' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listMembers(req, res) {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    
    const q = `
      SELECT u.id, u.email, wm.role, wm.created_at as joined_at 
      FROM workspace_members wm
      JOIN users u ON wm.user_id = u.id
      WHERE wm.workspace_id = $1
      ORDER BY wm.created_at ASC
    `;
    const r = await client.query(q, [workspaceId]);
    return res.json(r.rows);
  } catch (err) {
    console.error('List Members Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function addMember(req, res) {
  const workspaceId = req.workspace.id;
  const adminId = req.user.id;
  const { email, role } = addMemberSchema.parse(req.body);

  const client = await pool.connect();
  try {
    // 1. Find user by email
    const userRes = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User with this email not found. They must sign up first.' });
    }
    const targetUserId = userRes.rows[0].id;

    // 2. Check if already a member
    const checkRes = await client.query('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, targetUserId]);
    if (checkRes.rowCount > 0) {
      return res.status(400).json({ error: 'User is already a member of this workspace' });
    }

    // 3. Add member
    await client.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
      [workspaceId, targetUserId, role]
    );

    await logSystemEvent({ 
      userId: adminId, 
      workspaceId, 
      eventType: 'MEMBER_ADDED', 
      details: { targetUserId, targetEmail: email, role }, 
      req 
    });

    return res.status(201).json({ message: 'Member added successfully' });
  } finally {
    client.release();
  }
}

async function removeMember(req, res) {
  const workspaceId = req.workspace.id;
  const adminId = req.user.id;
  const { userId: targetUserId } = req.params;

  if (targetUserId === adminId) {
    return res.status(400).json({ error: 'You cannot remove yourself from the workspace here' });
  }

  const client = await pool.connect();
  try {
    await client.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, targetUserId]);
    
    await logSystemEvent({ 
      userId: adminId, 
      workspaceId, 
      eventType: 'MEMBER_REMOVED', 
      details: { targetUserId }, 
      req 
    });

    return res.json({ message: 'Member removed successfully' });
  } finally {
    client.release();
  }
}

async function deleteWorkspace(req, res) {
  const workspaceId = req.workspace.id;
  const adminId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Get info for audit log
    const infoRes = await client.query('SELECT name FROM workspaces WHERE id = $1', [workspaceId]);
    const wsName = infoRes.rows[0]?.name;

    // 2. Delete (Cascade handles members, tasks, etc)
    await client.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);

    await client.query('COMMIT');

    await logSystemEvent({ 
      userId: adminId, 
      workspaceId, 
      eventType: 'WORKSPACE_DELETED', 
      details: { name: wsName }, 
      req 
    });

    return res.json({ message: 'Workspace deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listWorkspaces,
  createWorkspace,
  listMembers,
  addMember,
  removeMember,
  deleteWorkspace
};
