const { pool } = require('../db');

async function getWorkspaceAnalytics(req, res) {
  const workspaceId = req.workspace.id;

  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    // 1. Velocity (Tasks completed per day/week)
    const velocityQ = `
      SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as count
      FROM task_events
      WHERE workspace_id = $1 AND event_type = 'STATUS_CHANGED' AND (new_payload->>'status') = 'DONE'
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 30
    `;
    const velocity = await client.query(velocityQ, [workspaceId]);

    // 2. Status Distribution (For Burndown/Pie charts)
    const statusQ = `
      SELECT status, COUNT(*) as count
      FROM tasks
      WHERE workspace_id = $1
      GROUP BY status
    `;
    const statusDist = await client.query(statusQ, [workspaceId]);

    // 3. Cycle Time (Average time from TODO to DONE) - simplified
    const cycleTimeQ = `
      WITH task_start AS (
        SELECT task_id, MIN(created_at) as start_time
        FROM task_events
        WHERE workspace_id = $1 AND event_type = 'STATUS_CHANGED' AND (new_payload->>'status') = 'IN_PROGRESS'
        GROUP BY task_id
      ),
      task_end AS (
        SELECT task_id, MIN(created_at) as end_time
        FROM task_events
        WHERE workspace_id = $1 AND event_type = 'STATUS_CHANGED' AND (new_payload->>'status') = 'DONE'
        GROUP BY task_id
      )
      SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) as avg_hours
      FROM task_start s
      JOIN task_end e ON s.task_id = e.task_id
    `;
    const cycleTime = await client.query(cycleTimeQ, [workspaceId]);

    // 4. Summary Stats
    const summaryQ = `SELECT COUNT(*) as total FROM tasks WHERE workspace_id = $1`;
    const summary = await client.query(summaryQ, [workspaceId]);

    return res.json({
      velocity: velocity.rows,
      statusDistribution: statusDist.rows,
      averageCycleTimeHours: cycleTime.rows[0]?.avg_hours ? parseFloat(cycleTime.rows[0].avg_hours).toFixed(1) : "0",
      totalTasks: parseInt(summary.rows[0]?.total || 0)
    });
  } finally {
    client.release();
  }
}

module.exports = { getWorkspaceAnalytics };
