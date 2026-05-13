const { pool } = require('../db');
const { getUploadUrl, getDownloadUrl } = require('../lib/storage');
const { v4: uuidv4 } = require('uuid');

async function getPresignedUploadUrl(req, res) {
  const workspaceId = req.workspace.id;
  const { taskId, fileName, contentType } = req.body;

  if (!taskId || !fileName) {
    return res.status(400).json({ error: 'taskId and fileName are required' });
  }

  const fileKey = `workspaces/${workspaceId}/tasks/${taskId}/${uuidv4()}-${fileName}`;
  const uploadUrl = await getUploadUrl(fileKey, contentType);

  return res.json({ uploadUrl, fileKey });
}

async function registerAttachment(req, res) {
  const workspaceId = req.workspace.id;
  const { taskId, fileName, fileKey, fileSize, mimeType } = req.body;

  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const r = await client.query(
      `INSERT INTO task_attachments (task_id, workspace_id, file_name, file_key, file_size, mime_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [taskId, workspaceId, fileName, fileKey, fileSize, mimeType]
    );
    return res.status(201).json(r.rows[0]);
  } finally {
    client.release();
  }
}

async function listAttachments(req, res) {
  const workspaceId = req.workspace.id;
  const { taskId } = req.params;

  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const r = await client.query('SELECT * FROM task_attachments WHERE task_id = $1 AND workspace_id = $2', [taskId, workspaceId]);
    
    // Generate download URLs for each
    const attachments = await Promise.all(r.rows.map(async (a) => ({
      ...a,
      downloadUrl: await getDownloadUrl(a.file_key)
    })));

    return res.json(attachments);
  } finally {
    client.release();
  }
}

module.exports = {
  getPresignedUploadUrl,
  registerAttachment,
  listAttachments
};
