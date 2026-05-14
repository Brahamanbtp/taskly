const { pool } = require('../db');

async function listNotifications(req, res) {
  const userId = req.user.id;
  const workspaceId = req.workspace.id;

  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const r = await client.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND workspace_id = $2 ORDER BY created_at DESC LIMIT 50',
      [userId, workspaceId]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error('Notification List Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function markAsRead(req, res) {
  const userId = req.user.id;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    const workspaceId = req.workspace.id;
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    await client.query('UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2', [id, userId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Notification MarkRead Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listNotifications, markAsRead };
