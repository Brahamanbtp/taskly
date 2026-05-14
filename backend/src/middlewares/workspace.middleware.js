const { pool } = require('../db');

async function requireWorkspace(req, res, next) {
  const workspaceId = req.headers['x-workspace-id'];
  
  if (!workspaceId) {
    return res.status(400).json({ error: 'x-workspace-id header is required' });
  }

  const userId = req.user.id;
  const client = await pool.connect();
  
  try {
    const q = 'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2';
    const result = await client.query(q, [workspaceId, userId]);
    
    if (result.rowCount === 0) {
      return res.status(403).json({ error: 'Access to this workspace denied' });
    }
    
    req.workspace = {
      id: workspaceId,
      role: result.rows[0].role
    };
    
    next();
  } catch (err) {
    console.error('Workspace Middleware Error:', err);
    res.status(500).json({ error: 'Internal server error validating workspace' });
  } finally {
    client.release();
  }
}

module.exports = {
  requireWorkspace
};
