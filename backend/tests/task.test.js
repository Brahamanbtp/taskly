const {
  listTasks,
  createTask,
  updateTaskStatus,
  editTask,
  deleteTask,
  reorderTask,
  getTaskEvents,
  addDependency,
  removeDependency,
  listDependencies,
  undoLastAction,
} = require('../src/controllers/task.controller');
const { pool } = require('../src/db');
const httpMocks = require('node-mocks-http');

jest.mock('../src/db', () => ({
  pool: { connect: jest.fn() }
}));

jest.mock('../src/controllers/webhook.controller', () => ({
  triggerWebhooks: jest.fn()
}));

jest.mock('../src/lib/queue', () => ({
  embeddingQueue: { add: jest.fn() },
  webhookQueue:   { add: jest.fn() },
  storageQueue:   { add: jest.fn() },
  connection:     { status: 'ready' }
}));

jest.mock('../src/lib/embeddings', () => ({
  generateEmbedding: jest.fn(),
  isAvailable: () => false  // disable so embedding queue is not triggered in unit tests
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeClient(responses) {
  // Returns a mock client whose .query() resolves in the order of `responses`.
  const client = {
    _calls: 0,
    query: jest.fn((...args) => {
      // Always resolve BEGIN/COMMIT/ROLLBACK quickly
      const sql = typeof args[0] === 'string' ? args[0].trim() : '';
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
        return Promise.resolve({});
      }
      const result = responses[client._calls++];
      return result !== undefined ? Promise.resolve(result) : Promise.resolve({});
    }),
    release: jest.fn()
  };
  return client;
}

function makeReq(overrides = {}) {
  const req = httpMocks.createRequest(overrides);
  req.user      = { id: 'user123' };
  req.workspace = { id: 'ws123' };
  const ioMock  = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
  req.app = { get: jest.fn().mockReturnValue(ioMock) };
  return { req, ioMock };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Task Controller — listTasks', () => {
  it('returns all tasks for a workspace ordered by position', async () => {
    const { req } = makeReq();
    const res = httpMocks.createResponse();
    const tasks = [{ id: '1', title: 'Task 1' }, { id: '2', title: 'Task 2' }];

    const client = makeClient([
      {},          // set_config
      { rows: tasks } // SELECT tasks
    ]);
    pool.connect.mockResolvedValue(client);

    await listTasks(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual(tasks);
    expect(client.release).toHaveBeenCalled();
  });

  it('releases client even on error', async () => {
    const { req } = makeReq();
    const res = httpMocks.createResponse();
    const client = { query: jest.fn().mockRejectedValue(new Error('DB Error')), release: jest.fn() };
    pool.connect.mockResolvedValue(client);

    await expect(listTasks(req, res)).rejects.toThrow('DB Error');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('Task Controller — createTask', () => {
  it('creates a task and emits socket event', async () => {
    const { req, ioMock } = makeReq({ body: { title: 'New Task', priority: 'HIGH' } });
    const res = httpMocks.createResponse();
    const mockTask = { id: 'task123', title: 'New Task', priority: 'HIGH', status: 'TODO' };

    const client = makeClient([
      {},                              // set_config
      { rows: [{ next_pos: 1000 }] }, // position query
      { rows: [mockTask] },            // INSERT task
      {}                               // INSERT event
    ]);
    pool.connect.mockResolvedValue(client);

    await createTask(req, res);

    expect(res.statusCode).toBe(201);
    expect(res._getJSONData()).toEqual(mockTask);
    expect(ioMock.emit).toHaveBeenCalledWith('task_created', mockTask);
    expect(client.release).toHaveBeenCalled();
  });

  it('throws ZodError for missing title', async () => {
    const { req } = makeReq({ body: { priority: 'HIGH' } });
    const res = httpMocks.createResponse();
    pool.connect.mockResolvedValue({ query: jest.fn(), release: jest.fn() });

    await expect(createTask(req, res)).rejects.toMatchObject({ name: 'ZodError' });
  });
});

describe('Task Controller — updateTaskStatus', () => {
  it('updates task status and emits socket event', async () => {
    const { req, ioMock } = makeReq({
      params: { id: 'task123' },
      body: { status: 'IN_PROGRESS' }
    });
    const res = httpMocks.createResponse();
    const oldTask = { id: 'task123', status: 'TODO' };
    const updatedTask = { id: 'task123', status: 'IN_PROGRESS' };

    const client = makeClient([
      {},                              // set_config
      { rowCount: 1, rows: [oldTask] }, // check task
      { rows: [{ next_pos: 2000 }] },  // position query
      { rows: [updatedTask] },          // UPDATE
      {}                               // INSERT event
    ]);
    pool.connect.mockResolvedValue(client);

    await updateTaskStatus(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual(updatedTask);
    expect(ioMock.emit).toHaveBeenCalledWith('task_updated', updatedTask);
  });

  it('returns 404 when task not found', async () => {
    const { req } = makeReq({ params: { id: 'missing' }, body: { status: 'DONE' } });
    const res = httpMocks.createResponse();

    const client = makeClient([
      {},                    // set_config
      { rowCount: 0, rows: [] } // check task — not found
    ]);
    pool.connect.mockResolvedValue(client);

    await updateTaskStatus(req, res);

    expect(res.statusCode).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'task not found' });
  });

  it('throws ZodError for invalid status', async () => {
    const { req } = makeReq({ params: { id: 'task123' }, body: { status: 'INVALID' } });
    const res = httpMocks.createResponse();
    pool.connect.mockResolvedValue({ query: jest.fn(), release: jest.fn() });

    await expect(updateTaskStatus(req, res)).rejects.toMatchObject({ name: 'ZodError' });
  });
});

describe('Task Controller — editTask', () => {
  it('edits task fields and emits socket event', async () => {
    const { req, ioMock } = makeReq({
      params: { id: 'task123' },
      body: { title: 'Updated', priority: 'LOW' }
    });
    const res = httpMocks.createResponse();
    const oldTask = { id: 'task123', title: 'Old' };
    const updatedTask = { id: 'task123', title: 'Updated', priority: 'LOW' };

    const client = makeClient([
      {},                               // set_config
      { rowCount: 1, rows: [oldTask] }, // check task
      { rows: [updatedTask] },          // UPDATE
      {}                               // INSERT event
    ]);
    pool.connect.mockResolvedValue(client);

    await editTask(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual(updatedTask);
    expect(ioMock.emit).toHaveBeenCalledWith('task_updated', updatedTask);
  });

  it('returns 404 when task not found', async () => {
    const { req } = makeReq({
      params: { id: 'missing' },
      body: { title: 'X', priority: 'LOW' }
    });
    const res = httpMocks.createResponse();

    const client = makeClient([
      {},
      { rowCount: 0, rows: [] }
    ]);
    pool.connect.mockResolvedValue(client);

    await editTask(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('Task Controller — deleteTask', () => {
  it('deletes task and emits socket event', async () => {
    const { req, ioMock } = makeReq({ params: { id: 'task123' } });
    const res = httpMocks.createResponse();
    const deletedTask = { id: 'task123', title: 'To Delete' };

    const client = makeClient([
      {},                               // set_config
      { rows: [] },                     // get attachments
      { rowCount: 1, rows: [deletedTask] }, // DELETE task
      {}                               // INSERT event
    ]);
    pool.connect.mockResolvedValue(client);

    await deleteTask(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(ioMock.emit).toHaveBeenCalledWith('task_deleted', 'task123');
  });

  it('returns 404 when task not found', async () => {
    const { req } = makeReq({ params: { id: 'missing' } });
    const res = httpMocks.createResponse();

    const client = makeClient([
      {},
      { rows: [] },            // get attachments
      { rowCount: 0, rows: [] } // DELETE — not found
    ]);
    pool.connect.mockResolvedValue(client);

    await deleteTask(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('Task Controller — reorderTask', () => {
  it('reorders task and emits socket event', async () => {
    const { req, ioMock } = makeReq({
      params: { id: 'task123' },
      body: { status: 'IN_PROGRESS', position: 5000 }
    });
    const res = httpMocks.createResponse();
    const oldTask = { id: 'task123', status: 'TODO', position: 1000 };
    const updatedTask = { id: 'task123', status: 'IN_PROGRESS', position: 5000 };

    const client = makeClient([
      {},                               // set_config
      { rowCount: 1, rows: [oldTask] }, // check task
      { rows: [updatedTask] },          // UPDATE
      {}                               // INSERT event
    ]);
    pool.connect.mockResolvedValue(client);

    await reorderTask(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual(updatedTask);
    expect(ioMock.emit).toHaveBeenCalledWith('task_updated', updatedTask);
  });

  it('returns 404 when task not found', async () => {
    const { req } = makeReq({
      params: { id: 'missing' },
      body: { status: 'DONE', position: 1000 }
    });
    const res = httpMocks.createResponse();

    const client = makeClient([
      {},
      { rowCount: 0, rows: [] }
    ]);
    pool.connect.mockResolvedValue(client);

    await reorderTask(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('Task Controller — getTaskEvents', () => {
  it('returns events for a valid task', async () => {
    const { req } = makeReq({ params: { id: 'task123' } });
    const res = httpMocks.createResponse();
    const events = [{ id: 'ev1', event_type: 'CREATED' }];

    const client = makeClient([
      {},                               // set_config
      { rowCount: 1, rows: [{ id: 'task123' }] }, // check task
      { rows: events }                  // SELECT events
    ]);
    pool.connect.mockResolvedValue(client);

    await getTaskEvents(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual(events);
  });

  it('returns 404 when task not found', async () => {
    const { req } = makeReq({ params: { id: 'missing' } });
    const res = httpMocks.createResponse();

    const client = makeClient([
      {},
      { rowCount: 0, rows: [] }
    ]);
    pool.connect.mockResolvedValue(client);

    await getTaskEvents(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('Task Controller — addDependency', () => {
  it('adds a dependency successfully', async () => {
    const { req } = makeReq({
      body: { taskId: 'taskA', dependsOnId: 'taskB' }
    });
    const res = httpMocks.createResponse();

    const client = makeClient([
      {},                  // set_config
      { rowCount: 0 },    // cycle check — no cycle
      {}                   // INSERT dependency
    ]);
    pool.connect.mockResolvedValue(client);

    await addDependency(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it('returns 400 if task depends on itself', async () => {
    const { req } = makeReq({
      body: { taskId: 'taskA', dependsOnId: 'taskA' }
    });
    const res = httpMocks.createResponse();
    pool.connect.mockResolvedValue({ query: jest.fn(), release: jest.fn() });

    await addDependency(req, res);

    expect(res.statusCode).toBe(400);
    expect(res._getJSONData().error).toBe('Task cannot depend on itself');
  });

  it('returns 400 when circular dependency detected', async () => {
    const { req } = makeReq({
      body: { taskId: 'taskA', dependsOnId: 'taskB' }
    });
    const res = httpMocks.createResponse();

    const client = makeClient([
      {},               // set_config
      { rowCount: 1 }  // cycle check — cycle detected
    ]);
    pool.connect.mockResolvedValue(client);

    await addDependency(req, res);

    expect(res.statusCode).toBe(400);
    expect(res._getJSONData().error).toBe('Circular dependency detected');
  });
});

describe('Task Controller — removeDependency', () => {
  it('removes a dependency', async () => {
    const { req } = makeReq({
      body: { taskId: 'taskA', dependsOnId: 'taskB' }
    });
    const res = httpMocks.createResponse();

    const client = makeClient([
      {},  // set_config
      {}   // DELETE dependency
    ]);
    pool.connect.mockResolvedValue(client);

    await removeDependency(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });
});

describe('Task Controller — listDependencies', () => {
  it('returns all dependencies for a workspace', async () => {
    const { req } = makeReq();
    const res = httpMocks.createResponse();
    const deps = [{ task_id: 'taskA', depends_on_id: 'taskB' }];

    const client = makeClient([
      {},           // set_config
      { rows: deps } // SELECT
    ]);
    pool.connect.mockResolvedValue(client);

    await listDependencies(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual(deps);
  });
});

describe('Task Controller — undoLastAction', () => {
  it('returns 400 if nothing to undo', async () => {
    const { req } = makeReq({ params: { id: 'task123' } });
    const res = httpMocks.createResponse();

    const client = makeClient([
      {},                    // set_config
      { rowCount: 0, rows: [] } // no non-CREATED events
    ]);
    pool.connect.mockResolvedValue(client);

    await undoLastAction(req, res);

    expect(res.statusCode).toBe(400);
    expect(res._getJSONData().error).toBe('Nothing to undo for this task');
  });

  it('reverts a STATUS_CHANGED event', async () => {
    const { req } = makeReq({ params: { id: 'task123' } });
    const res = httpMocks.createResponse();
    const oldPayload = { title: 'Task', status: 'TODO', priority: 'MEDIUM', due_date: null, description: '', tags: [], position: 1000 };
    const currentTask = { ...oldPayload, status: 'IN_PROGRESS' };

    const client = makeClient([
      {},                                                               // set_config
      { rowCount: 1, rows: [{ id: 'ev1', event_type: 'STATUS_CHANGED', old_payload: oldPayload, new_payload: currentTask }] }, // last event
      {},                                                               // UPDATE (revert)
      {},                                                               // DELETE event
      { rows: [currentTask] },                                          // SELECT current task
      {}                                                               // INSERT UNDONE event
    ]);
    pool.connect.mockResolvedValue(client);

    await undoLastAction(req, res);

    expect(res.statusCode).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveProperty('undoneEvent', 'STATUS_CHANGED');
  });
});
