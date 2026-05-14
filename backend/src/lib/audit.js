const { pool } = require('../db');

async function logSystemEvent({ userId, workspaceId, eventType, details, req }) {
  const client = await pool.connect();
  try {
    const ip = req?.ip || req?.headers['x-forwarded-for'] || 'unknown';
    const ua = req?.headers['user-agent'] || 'unknown';

    await client.query(
      `INSERT INTO system_logs (user_id, workspace_id, event_type, details, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, workspaceId || null, eventType, JSON.stringify(details || {}), ip, ua]
    );
    console.log(`[AuditLog] ${eventType} for user ${userId || 'guest'}`);
  } catch (err) {
    console.error('Audit Log failed:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { logSystemEvent };
