const { addWebhook, listWebhooks, deleteWebhook } = require('../src/controllers/webhook.controller');
const { pool } = require('../src/db');
const httpMocks = require('node-mocks-http');

jest.mock('../src/db', () => ({
  pool: { connect: jest.fn() }
}));

// Prevent the webhookQueue from trying to connect to Redis
jest.mock('../src/lib/queue', () => ({
  webhookQueue: { add: jest.fn() },
  embeddingQueue: { add: jest.fn() },
  storageQueue: { add: jest.fn() },
  connection: { status: 'ready' }
}));

describe('Webhook Controller', () => {
  let req, res, client;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    req.workspace = { id: 'ws123' };

    client = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(client);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addWebhook', () => {
    it('should add a new webhook with valid URL', async () => {
      req.body = { url: 'https://example.com/hook' };
      const mockWh = { id: 'wh123', url: 'https://example.com/hook' };

      client.query
        .mockResolvedValueOnce({})                  // set_config
        .mockResolvedValueOnce({ rows: [mockWh] });  // INSERT

      await addWebhook(req, res);

      expect(res.statusCode).toBe(201);
      expect(res._getJSONData()).toEqual(mockWh);
    });

    it('should throw ZodError for invalid URL', async () => {
      req.body = { url: 'not-a-url' };

      await expect(addWebhook(req, res)).rejects.toMatchObject({ name: 'ZodError' });
    });

    it('should throw ZodError for missing URL', async () => {
      req.body = {};

      await expect(addWebhook(req, res)).rejects.toMatchObject({ name: 'ZodError' });
    });
  });

  describe('listWebhooks', () => {
    it('should list all webhooks for a workspace', async () => {
      const mockWebhooks = [{ id: '1', url: 'https://hook1.example.com' }];
      client.query
        .mockResolvedValueOnce({})                      // set_config
        .mockResolvedValueOnce({ rows: mockWebhooks }); // SELECT

      await listWebhooks(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual(mockWebhooks);
    });

    it('should return empty array when no webhooks exist', async () => {
      client.query
        .mockResolvedValueOnce({})       // set_config
        .mockResolvedValueOnce({ rows: [] }); // SELECT

      await listWebhooks(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual([]);
    });
  });

  describe('deleteWebhook', () => {
    it('should delete a webhook', async () => {
      req.params = { id: 'wh123' };
      client.query
        .mockResolvedValueOnce({})  // set_config
        .mockResolvedValueOnce({}); // DELETE

      await deleteWebhook(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({ message: 'Webhook deleted' });
    });
  });
});
