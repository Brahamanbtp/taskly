const { pool } = require('../db');
const axios = require('axios');
const { z } = require('zod');

const addWebhookSchema = z.object({
  url: z.string().url("Valid URL is required"),
  event_types: z.array(z.string()).optional().default(['task.created', 'task.updated', 'task.deleted']),
  secret: z.string().optional(),
});

async function listWebhooks(req, res) {
  const workspaceId = req.workspace.id;
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const r = await client.query('SELECT * FROM webhooks WHERE workspace_id = $1', [workspaceId]);
    return res.json(r.rows);
  } finally {
    client.release();
  }
}

async function addWebhook(req, res) {
  const workspaceId = req.workspace.id;
  const { url, event_types, secret } = addWebhookSchema.parse(req.body);
  
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const r = await client.query(
      `INSERT INTO webhooks (workspace_id, url, event_types, secret) VALUES ($1, $2, $3, $4) RETURNING *`,
      [workspaceId, url, event_types || '{task.created, task.updated, task.deleted}', secret || null]
    );
    return res.status(201).json(r.rows[0]);
  } finally {
    client.release();
  }
}

async function deleteWebhook(req, res) {
  const workspaceId = req.workspace.id;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    await client.query('DELETE FROM webhooks WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
    return res.json({ message: 'Webhook deleted' });
  } finally {
    client.release();
  }
}

const { webhookQueue } = require('../lib/queue');

// Utility function to trigger webhooks
async function triggerWebhooks(workspaceId, eventType, data) {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const r = await client.query(
      'SELECT url, secret FROM webhooks WHERE workspace_id = $1 AND active = TRUE AND $2 = ANY(event_types)',
      [workspaceId, eventType]
    );

    const payload = {
      event: eventType,
      workspace_id: workspaceId,
      timestamp: new Date().toISOString(),
      data: data
    };

    for (const wh of r.rows) {
      await webhookQueue.add(`webhook-${wh.id}`, {
        url: wh.url,
        payload,
        secret: wh.secret,
        eventType
      }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 }
      });
    }
  } catch (err) {
    console.error('Error queueing webhooks:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { listWebhooks, addWebhook, deleteWebhook, triggerWebhooks };
