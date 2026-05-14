require('dotenv').config();

// Mock Redis-dependent modules so integration tests don't need a local Redis
jest.mock('../../src/lib/queue', () => ({
  embeddingQueue: { add: jest.fn() },
  webhookQueue:   { add: jest.fn() },
  storageQueue:   { add: jest.fn() },
  connection:     { status: 'ready' }
}));

const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/db');

describe('Event Sourcing Integration Tests', () => {
  let token, workspaceId, taskId;
  const testUser = { email: `event_test_${Date.now()}@example.com`, password: 'password123' };

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/signup').send(testUser);
    token = res.body.token;
    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'History Test' });
    workspaceId = wsRes.body.id;
  });

  afterAll(async () => {
    try {
      await pool.end();
    } catch (_) {
      // pool may already be closed
    }
  });

  it('should record events and allow fetching task history', async () => {
    // 1. Create task
    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', workspaceId)
      .send({ title: 'Event Task', description: 'Testing history' });

    if (createRes.statusCode !== 201) console.log('CREATE ERROR:', createRes.body);
    expect(createRes.statusCode).toBe(201);
    taskId = createRes.body.id;

    // 2. Update task status
    const statusRes = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', workspaceId)
      .send({ status: 'IN_PROGRESS' });

    if (statusRes.statusCode !== 200) console.log('STATUS ERROR:', statusRes.body);
    expect(statusRes.statusCode).toBe(200);

    // 3. Fetch history for the task
    const historyRes = await request(app)
      .get(`/api/tasks/${taskId}/events`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', workspaceId);

    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.body.length).toBe(2); // CREATED and STATUS_CHANGED
    expect(historyRes.body[0].event_type).toBe('STATUS_CHANGED'); // Newest first
    expect(historyRes.body[1].event_type).toBe('CREATED');
  });

  it('should support the Time Travel (Board History) view', async () => {
    const historyRes = await request(app)
      .get(`/api/tasks/history`)
      .query({ timestamp: new Date().toISOString() })
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', workspaceId);

    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.body.length).toBe(1);
    expect(historyRes.body[0].title).toBe('Event Task');
  });

  it('should return 400 when timestamp is missing from board history', async () => {
    const res = await request(app)
      .get(`/api/tasks/history`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', workspaceId);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('timestamp is required');
  });
});
