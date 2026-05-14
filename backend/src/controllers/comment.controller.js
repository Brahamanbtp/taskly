const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');

const commentSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty"),
  mentions: z.array(z.string()).optional().default([]),
});

async function listComments(req, res) {
  const { taskId } = req.params;
  const workspaceId = req.workspace.id;

  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const q = `
      SELECT c.*, u.email as user_email 
      FROM task_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = $1 AND c.workspace_id = $2
      ORDER BY c.created_at ASC
    `;
    const r = await client.query(q, [taskId, workspaceId]);
    return res.json(r.rows);
  } finally {
    client.release();
  }
}

async function addComment(req, res) {
  const { taskId } = req.params;
  const workspaceId = req.workspace.id;
  const userId = req.user.id;
  const { content, mentions } = commentSchema.parse(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    const id = uuidv4();
    const q = `
      INSERT INTO task_comments (id, task_id, workspace_id, user_id, content, mentions)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const r = await client.query(q, [id, taskId, workspaceId, userId, content, mentions]);
    const newComment = r.rows[0];

    // Create notifications for mentioned users
    for (const mentionedUserId of mentions) {
      if (mentionedUserId === userId) continue;
      const notifId = uuidv4();
      await client.query(
        `INSERT INTO notifications (id, user_id, workspace_id, type, title, body, link) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [notifId, mentionedUserId, workspaceId, 'MENTION', 'New Mention', `${req.user.email} mentioned you in a comment`, `/tasks?taskId=${taskId}`]
      );
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      io.to(workspaceId).emit('comment_added', { taskId, comment: { ...newComment, user_email: req.user.email } });
      // Notify mentioned users specifically
      mentions.forEach(mId => {
        if (mId !== userId) io.to(mId).emit('notification', { type: 'MENTION', taskId });
      });
    }

    return res.status(201).json(newComment);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listComments, addComment };
