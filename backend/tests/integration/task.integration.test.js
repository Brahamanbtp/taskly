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

describe('Task Integration Tests', () => {
  let token;
  let workspaceId;
  const testUser = { email: `test_${Date.now()}@example.com`, password: 'password123' };

  beforeAll(async () => {
    // 1. Signup to get token
    const res = await request(app)
      .post('/api/auth/signup')
      .send(testUser);
    token = res.body.token;

    // 2. Create a workspace
    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Integration Test Workspace' });
    workspaceId = wsRes.body.id;
  });

  afterAll(async () => {
    try {
      await pool.end();
    } catch (_) {
      // pool may already be closed
    }
  });

  it('should create a task through the API', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', workspaceId)
      .send({
        title: 'Integration Task',
        description: 'Testing the whole flow',
        priority: 'HIGH'
      });

    if (res.statusCode !== 201) console.log('ERROR BODY:', res.body);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('title', 'Integration Task');
    expect(res.body).toHaveProperty('workspace_id', workspaceId);
  });

  it('should list tasks for the workspace', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', workspaceId);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should enforce RLS (cannot access other workspace tasks)', async () => {
    const otherWsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Other Workspace' });
    const otherWorkspaceId = otherWsRes.body.id;

    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', otherWorkspaceId);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it('should return 401 for unauthenticated task creation', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('x-workspace-id', workspaceId)
      .send({ title: 'Unauthenticated' });
    expect(res.statusCode).toBe(401);
  });

  it('should return 400 for validation errors', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', workspaceId)
      .send({ title: '' }); // empty title
    expect(res.statusCode).toBe(400);
  });
});
