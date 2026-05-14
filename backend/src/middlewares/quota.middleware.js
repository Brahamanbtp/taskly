const { pool } = require('../db');
const { PLANS } = require('../controllers/billing.controller');


function checkQuota(resourceType) {
  return async (req, res, next) => {
    const workspaceId = req.workspace.id;
    const client = await pool.connect();

    try {
      const wsRes = await client.query('SELECT plan FROM workspaces WHERE id = $1', [workspaceId]);
      const plan = wsRes.rows[0]?.plan || 'FREE';
      const quota = PLANS[plan];

      let currentCount = 0;
      if (resourceType === 'tasks') {
        const r = await client.query('SELECT COUNT(*) FROM tasks WHERE workspace_id = $1', [workspaceId]);
        currentCount = parseInt(r.rows[0].count);
        if (currentCount >= quota.maxTasks) {
          return res.status(402).json({ error: `Quota exceeded. Your ${plan} plan allows only ${quota.maxTasks} tasks. Please upgrade.` });
        }
      } else if (resourceType === 'members') {
        const r = await client.query('SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1', [workspaceId]);
        currentCount = parseInt(r.rows[0].count);
        if (currentCount >= quota.maxMembers) {
          return res.status(402).json({ error: `Quota exceeded. Your ${plan} plan allows only ${quota.maxMembers} members.` });
        }
      } else if (resourceType === 'webhooks') {
        const r = await client.query('SELECT COUNT(*) FROM webhooks WHERE workspace_id = $1', [workspaceId]);
        currentCount = parseInt(r.rows[0].count);
        if (currentCount >= quota.maxWebhooks) {
          return res.status(402).json({ error: `Quota exceeded. Your ${plan} plan allows only ${quota.maxWebhooks} webhooks.` });
        }
      }

      next();
    } finally {
      client.release();
    }
  };
}

module.exports = { checkQuota };
