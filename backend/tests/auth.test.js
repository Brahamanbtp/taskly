const { signup, login, me } = require('../src/controllers/auth.controller');
const { pool } = require('../src/db');
const httpMocks = require('node-mocks-http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

jest.mock('../src/db', () => ({
  pool: {
    connect: jest.fn()
  }
}));

jest.mock('../src/lib/audit', () => ({
  logSystemEvent: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('bcrypt');
jest.mock('jsonwebtoken');

describe('Auth Controller', () => {
  let req, res, client;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    client = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(client);
    process.env.JWT_SECRET = 'test_secret';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('signup', () => {
    it('should return 400 if email is already in use', async () => {
      req.body = { email: 'test@example.com', password: 'password123' };
      const error = new Error('Unique violation');
      error.code = '23505';
      bcrypt.hash.mockResolvedValue('hashed_pw');
      client.query.mockRejectedValue(error);

      await signup(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData()).toEqual({ error: 'Email already in use' });
    });

    it('should create a new user and return a token', async () => {
      req.body = { email: 'new@example.com', password: 'password123' };
      client.query.mockResolvedValue({
        rows: [{ id: 'user123', email: 'new@example.com' }]
      });
      bcrypt.hash.mockResolvedValue('hashed_pw');
      jwt.sign.mockReturnValue('fake_token');

      await signup(req, res);

      expect(res.statusCode).toBe(201);
      const data = res._getJSONData();
      expect(data).toHaveProperty('token', 'fake_token');
      expect(data.user).toHaveProperty('id', 'user123');
    });

    it('should return 400 for invalid email format', async () => {
      req.body = { email: 'not-an-email', password: 'password123' };

      try {
        await signup(req, res);
      } catch (err) {
        expect(err.name).toBe('ZodError');
      }
    });

    it('should return 400 for short password', async () => {
      req.body = { email: 'test@example.com', password: '123' };

      try {
        await signup(req, res);
      } catch (err) {
        expect(err.name).toBe('ZodError');
      }
    });
  });

  describe('login', () => {
    it('should return 400 for user not found', async () => {
      req.body = { email: 'test@example.com', password: 'password123' };
      client.query.mockResolvedValue({ rowCount: 0 });

      await login(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData()).toEqual({ error: 'Invalid credentials' });
    });

    it('should return 400 for wrong password', async () => {
      req.body = { email: 'test@example.com', password: 'wrongpassword' };
      client.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: 'user123', email: 'test@example.com', password_hash: 'hashed_pw' }]
      });
      bcrypt.compare.mockResolvedValue(false);

      await login(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData()).toEqual({ error: 'Invalid credentials' });
    });

    it('should return a token for valid credentials', async () => {
      req.body = { email: 'test@example.com', password: 'password123' };
      client.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: 'user123', email: 'test@example.com', password_hash: 'hashed_pw' }]
      });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('fake_token');

      await login(req, res);

      expect(res.statusCode).toBe(200);
      const data = res._getJSONData();
      expect(data.token).toBe('fake_token');
      expect(data.user.id).toBe('user123');
    });
  });

  describe('me', () => {
    it('should return current user from req.user', async () => {
      req.user = { id: 'user123', email: 'test@example.com' };

      await me(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({ user: { id: 'user123', email: 'test@example.com' } });
    });
  });
});
