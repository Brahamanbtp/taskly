const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { generateEmbedding, isAvailable: isAIAvailable } = require('../lib/embeddings');
const { triggerWebhooks } = require('./webhook.controller');
const { embeddingQueue, storageQueue } = require('../lib/queue');

// Background: add task to embedding queue
async function updateTaskEmbedding(taskId, text) {
  if (!isAIAvailable()) return;
  await embeddingQueue.add('generate-embedding', { taskId, text });
}

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").trim(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  due_date: z.string().nullable().optional().transform(v => v === "" ? null : v),
  description: z.string().optional(),
  tags: z.array(z.string()).optional()
});

const updateStatusSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
});

const reorderTaskSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
  position: z.number(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1, "Title is required").trim(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  due_date: z.string().nullable().optional().transform(v => v === "" ? null : v),
  description: z.string().optional(),
  tags: z.array(z.string()).optional()
});

const dependencySchema = z.object({
  taskId: z.string().min(1),
  dependsOnId: z.string().min(1),
});

async function listTasks(req, res) {
  const workspaceId = req.workspace.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const q = `SELECT id, title, description, tags, status, priority, due_date, position, created_at, updated_at FROM tasks WHERE workspace_id=$1 ORDER BY position ASC`;
    const r = await client.query(q, [workspaceId]);
    await client.query('COMMIT');
    return res.json(r.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function createTask(req, res) {
  const userId = req.user.id;
  const workspaceId = req.workspace.id;
  const { title, priority, due_date, description, tags } = createTaskSchema.parse(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const posRes = await client.query("SELECT COALESCE(MAX(position), 0) + 1000 as next_pos FROM tasks WHERE workspace_id = $1 AND status = 'TODO'", [workspaceId]);
    const nextPos = posRes.rows[0].next_pos;

    const id = uuidv4();
    const q = `INSERT INTO tasks(id, user_id, workspace_id, title, status, priority, due_date, description, tags, position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`;
    const r = await client.query(q, [id, userId, workspaceId, title, 'TODO', priority, due_date || null, description || '', tags || [], nextPos]);
    const newTask = r.rows[0];

    const eventId = uuidv4();
    await client.query(
      `INSERT INTO task_events (id, task_id, user_id, workspace_id, event_type, old_payload, new_payload) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, id, userId, workspaceId, 'CREATED', null, JSON.stringify(newTask)]
    );

    await client.query('COMMIT');
    const io = req.app.get('io');
    if (io) io.to(workspaceId).emit('task_created', newTask);

    // Generate embedding in the background (non-blocking)
    updateTaskEmbedding(id, `${title} ${description || ''}`);

    // Trigger Webhooks
    triggerWebhooks(workspaceId, 'task.created', newTask);

    return res.status(201).json(newTask);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateTaskStatus(req, res) {
  const userId = req.user.id;
  const workspaceId = req.workspace.id;
  const taskId = req.params.id;
  const { status } = updateStatusSchema.parse(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const check = await client.query(`SELECT * FROM tasks WHERE id=$1 AND workspace_id=$2`, [taskId, workspaceId]);
    if (check.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'task not found' });
    }
    const oldTask = check.rows[0];
    
    const posRes = await client.query("SELECT COALESCE(MAX(position), 0) + 1000 as next_pos FROM tasks WHERE workspace_id = $1 AND status = $2", [workspaceId, status]);
    const nextPos = posRes.rows[0].next_pos;

    const r = await client.query(`UPDATE tasks SET status=$1, position=$2, updated_at=NOW() WHERE id=$3 RETURNING *`, [status, nextPos, taskId]);
    const updatedTask = r.rows[0];

    const eventId = uuidv4();
    await client.query(
      `INSERT INTO task_events (id, task_id, user_id, workspace_id, event_type, old_payload, new_payload) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, taskId, userId, workspaceId, 'STATUS_CHANGED', JSON.stringify(oldTask), JSON.stringify(updatedTask)]
    );

    await client.query('COMMIT');
    const io = req.app.get('io');
    if (io) io.to(workspaceId).emit('task_updated', updatedTask);

    // Trigger Webhooks
    triggerWebhooks(workspaceId, 'task.updated', updatedTask);

    return res.json(updatedTask);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function reorderTask(req, res) {
  const userId = req.user.id;
  const workspaceId = req.workspace.id;
  const taskId = req.params.id;
  const { status, position } = reorderTaskSchema.parse(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const check = await client.query(`SELECT * FROM tasks WHERE id=$1 AND workspace_id=$2`, [taskId, workspaceId]);
    if (check.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'task not found' });
    }
    const oldTask = check.rows[0];
    
    const r = await client.query(`UPDATE tasks SET status=$1, position=$2, updated_at=NOW() WHERE id=$3 RETURNING *`, [status, position, taskId]);
    const updatedTask = r.rows[0];

    const eventId = uuidv4();
    await client.query(
      `INSERT INTO task_events (id, task_id, user_id, workspace_id, event_type, old_payload, new_payload) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, taskId, userId, workspaceId, 'REORDERED', JSON.stringify(oldTask), JSON.stringify(updatedTask)]
    );

    await client.query('COMMIT');
    const ioReorder = req.app.get('io');
    if (ioReorder) ioReorder.to(workspaceId).emit('task_updated', updatedTask);
    return res.json(updatedTask);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function editTask(req, res) {
  const userId = req.user.id;
  const workspaceId = req.workspace.id;
  const taskId = req.params.id;
  const { title, priority, due_date, description, tags } = updateTaskSchema.parse(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const check = await client.query(`SELECT * FROM tasks WHERE id=$1 AND workspace_id=$2`, [taskId, workspaceId]);
    if (check.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'task not found' });
    }
    const oldTask = check.rows[0];
    
    const r = await client.query(`UPDATE tasks SET title=$1, priority=$2, due_date=$3, description=$4, tags=$5, updated_at=NOW() WHERE id=$6 RETURNING *`, [title, priority, due_date || null, description || '', tags || [], taskId]);
    const updatedTask = r.rows[0];

    const eventId = uuidv4();
    await client.query(
      `INSERT INTO task_events (id, task_id, user_id, workspace_id, event_type, old_payload, new_payload) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, taskId, userId, workspaceId, 'EDITED', JSON.stringify(oldTask), JSON.stringify(updatedTask)]
    );

    await client.query('COMMIT');
    const ioEdit = req.app.get('io');
    if (ioEdit) ioEdit.to(workspaceId).emit('task_updated', updatedTask);

    // Regenerate embedding in background
    updateTaskEmbedding(taskId, `${title} ${description || ''}`);

    // Trigger Webhooks
    triggerWebhooks(workspaceId, 'task.updated', updatedTask);

    return res.json(updatedTask);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteTask(req, res) {
  const userId = req.user.id;
  const workspaceId = req.workspace.id;
  const taskId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    
    // Get attachment keys for cleanup BEFORE deletion (due to ON DELETE CASCADE)
    const attachRes = await client.query('SELECT file_key FROM task_attachments WHERE task_id = $1', [taskId]);

    const r = await client.query(`DELETE FROM tasks WHERE id=$1 AND workspace_id=$2 RETURNING *`, [taskId, workspaceId]);
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not found' });
    }
    const deletedTask = r.rows[0];
    
    const eventId = uuidv4();
    await client.query(
      `INSERT INTO task_events (id, task_id, user_id, workspace_id, event_type, old_payload, new_payload) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, taskId, userId, workspaceId, 'DELETED', JSON.stringify(deletedTask), null]
    );

    await client.query('COMMIT');
    
    // Enqueue file deletions in the background
    for (const row of attachRes.rows) {
      await storageQueue.add('delete-file', { fileKey: row.file_key });
    }
    const io = req.app.get('io');
    if (io) io.to(workspaceId).emit('task_deleted', taskId);

    // Trigger Webhooks
    triggerWebhooks(workspaceId, 'task.deleted', { id: taskId });

    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getTaskEvents(req, res) {
  const workspaceId = req.workspace.id;
  const taskId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    const check = await client.query(`SELECT id FROM tasks WHERE id=$1 AND workspace_id=$2`, [taskId, workspaceId]);
    if (check.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'task not found' });
    }

    const q = `
      SELECT te.*, u.email as user_email 
      FROM task_events te
      JOIN users u ON te.user_id = u.id
      WHERE te.task_id = $1 
      ORDER BY te.created_at DESC
    `;
    const r = await client.query(q, [taskId]);
    await client.query('COMMIT');
    return res.json(r.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getBoardHistory(req, res) {
  const workspaceId = req.workspace.id;
  const timestamp = req.query.timestamp;
  if (!timestamp) return res.status(400).json({ error: 'timestamp is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    const q = `
      SELECT * FROM task_events 
      WHERE workspace_id = $1 AND created_at <= $2 
      ORDER BY created_at ASC
    `;
    const r = await client.query(q, [workspaceId, timestamp]);
    
    const tasksMap = new Map();
    
    for (const ev of r.rows) {
      if (ev.event_type === 'CREATED') {
        tasksMap.set(ev.task_id, ev.new_payload);
      } else if (ev.event_type === 'STATUS_CHANGED' || ev.event_type === 'REORDERED' || ev.event_type === 'EDITED') {
        const existing = tasksMap.get(ev.task_id);
        if (existing) {
           const update = ev.new_payload;
           tasksMap.set(ev.task_id, { ...existing, ...update });
        }
      } else if (ev.event_type === 'DELETED') {
        tasksMap.delete(ev.task_id);
      }
    }
    
    await client.query('COMMIT');
    return res.json(Array.from(tasksMap.values()).sort((a,b) => a.position - b.position));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function undoLastAction(req, res) {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;
  const taskId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    // Get the most recent non-CREATED event for this task
    const eventRes = await client.query(
      `SELECT * FROM task_events WHERE task_id = $1 AND workspace_id = $2 AND event_type != 'CREATED' ORDER BY created_at DESC LIMIT 1`,
      [taskId, workspaceId]
    );

    if (eventRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Nothing to undo for this task' });
    }

    const lastEvent = eventRes.rows[0];
    const oldPayload = lastEvent.old_payload;

    if (lastEvent.event_type === 'DELETED') {
      // Re-insert the task from old_payload
      const t = oldPayload;
      await client.query(
        `INSERT INTO tasks(id, user_id, workspace_id, title, status, priority, due_date, description, tags, position, created_at, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
        [t.id, t.user_id, workspaceId, t.title, t.status, t.priority, t.due_date || null, t.description || '', t.tags || [], t.position, t.created_at]
      );
    } else {
      // Revert to old state
      await client.query(
        `UPDATE tasks SET title=$1, status=$2, priority=$3, due_date=$4, description=$5, tags=$6, position=$7, updated_at=NOW() WHERE id=$8 AND workspace_id=$9`,
        [oldPayload.title, oldPayload.status, oldPayload.priority, oldPayload.due_date || null, oldPayload.description || '', oldPayload.tags || [], oldPayload.position, taskId, workspaceId]
      );
    }

    // Remove the undone event
    await client.query(`DELETE FROM task_events WHERE id = $1`, [lastEvent.id]);

    // Log the undo itself
    const undoEventId = uuidv4();
    const currentRes = await client.query(`SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2`, [taskId, workspaceId]);
    await client.query(
      `INSERT INTO task_events (id, task_id, user_id, workspace_id, event_type, old_payload, new_payload) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [undoEventId, taskId, userId, workspaceId, 'UNDONE', lastEvent.new_payload, JSON.stringify(currentRes.rows[0])]
    );

    await client.query('COMMIT');
    return res.json({ message: 'Action undone', task: currentRes.rows[0], undoneEvent: lastEvent.event_type });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function addDependency(req, res) {
  const { taskId, dependsOnId } = dependencySchema.parse(req.body);
  const workspaceId = req.workspace.id;

  if (taskId === dependsOnId) return res.status(400).json({ error: 'Task cannot depend on itself' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    // Check for cycle: If I add A -> B, is B already dependent on A (directly or indirectly)?
    // Recursive CTE to find all tasks that B depends on.
    const cycleRes = await client.query(`
      WITH RECURSIVE dependency_chain AS (
        -- Base case: B depends on these tasks
        SELECT depends_on_id FROM task_dependencies WHERE task_id = $1 AND workspace_id = $2
        UNION
        -- Recursive case: Add tasks that the current chain depends on
        SELECT td.depends_on_id FROM task_dependencies td
        INNER JOIN dependency_chain dc ON td.task_id = dc.depends_on_id
        WHERE td.workspace_id = $2
      )
      SELECT 1 FROM dependency_chain WHERE depends_on_id = $3
    `, [dependsOnId, workspaceId, taskId]);

    if (cycleRes.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Circular dependency detected' });
    }

    await client.query(
      `INSERT INTO task_dependencies (workspace_id, task_id, depends_on_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [workspaceId, taskId, dependsOnId]
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function removeDependency(req, res) {
  const { taskId, dependsOnId } = dependencySchema.parse(req.body);
  const workspaceId = req.workspace.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    await client.query(
      `DELETE FROM task_dependencies WHERE workspace_id = $1 AND task_id = $2 AND depends_on_id = $3`,
      [workspaceId, taskId, dependsOnId]
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listDependencies(req, res) {
  const workspaceId = req.workspace.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    const r = await client.query(`SELECT id, task_id, depends_on_id FROM task_dependencies WHERE workspace_id = $1`, [workspaceId]);
    
    await client.query('COMMIT');
    return res.json(r.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listTasks,
  createTask,
  updateTaskStatus,
  editTask,
  deleteTask,
  reorderTask,
  getTaskEvents,
  getBoardHistory,
  undoLastAction,
  addDependency,
  removeDependency,
  listDependencies
};
