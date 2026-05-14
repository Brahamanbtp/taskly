const {
  listWorkspaces,
  createWorkspace,
  listMembers,
  addMember,
  removeMember
} = require('../src/controllers/workspace.controller');
const { pool } = require('../src/db');
const httpMocks = require('node-mocks-http');

jest.mock('../src/db', () => ({
  pool: { connect: jest.fn() }
}));

jest.mock('../src/lib/audit', () => ({
  logSystemEvent: jest.fn().mockResolvedValue(undefined)
}));

describe('Workspace Controller', () => {
  let client;

  function makeReq(overrides = {}) {
    const req = httpMocks.createRequest(overrides);
    req.user      = { id: 'user123' };
    req.workspace = { id: 'ws123', role: 'OWNER' };
    return req;
  }

  beforeEach(() => {
    client = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(client);
    jest.clearAllMocks();
  });

  // ─── listWorkspaces ──────────────────────────────────────────────────────────

  describe('listWorkspaces', () => {
    it('returns workspaces for the current user', async () => {
      const req = makeReq();
      const res = httpMocks.createResponse();
      const ws = [{ id: 'ws1', name: 'My Workspace', role: 'OWNER' }];
      client.query.mockResolvedValue({ rows: ws });

      await listWorkspaces(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual(ws);
      expect(client.release).toHaveBeenCalled();
    });
  });

  // ─── createWorkspace ─────────────────────────────────────────────────────────

  describe('createWorkspace', () => {
    it('creates a workspace and auto-adds owner as member', async () => {
      const req = makeReq({ body: { name: 'Test Workspace' } });
      const res = httpMocks.createResponse();
      const newWs = { id: 'ws-new', name: 'Test Workspace', owner_id: 'user123' };

      client.query
        .mockResolvedValueOnce({})                   // BEGIN
        .mockResolvedValueOnce({ rows: [newWs] })    // INSERT workspaces
        .mockResolvedValueOnce({})                   // INSERT workspace_members
        .mockResolvedValueOnce({});                  // COMMIT

      await createWorkspace(req, res);

      expect(res.statusCode).toBe(201);
      const data = res._getJSONData();
      expect(data).toHaveProperty('name', 'Test Workspace');
      expect(data).toHaveProperty('role', 'OWNER');
    });

    it('throws ZodError for empty workspace name', async () => {
      const req = makeReq({ body: { name: '' } });
      const res = httpMocks.createResponse();

      await expect(createWorkspace(req, res)).rejects.toMatchObject({ name: 'ZodError' });
    });

    it('rolls back on DB error', async () => {
      const req = makeReq({ body: { name: 'Test WS' } });
      const res = httpMocks.createResponse();

      client.query
        .mockResolvedValueOnce({})              // BEGIN
        .mockRejectedValueOnce(new Error('DB Error')); // INSERT fails

      await expect(createWorkspace(req, res)).rejects.toThrow('DB Error');
      // ROLLBACK should have been called
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });

  // ─── listMembers ─────────────────────────────────────────────────────────────

  describe('listMembers', () => {
    it('returns members of a workspace', async () => {
      const req = makeReq();
      const res = httpMocks.createResponse();
      const members = [{ id: 'user123', email: 'admin@test.com', role: 'OWNER', joined_at: new Date().toISOString() }];
      client.query.mockResolvedValue({ rows: members });

      await listMembers(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual(members);
    });
  });

  // ─── addMember ───────────────────────────────────────────────────────────────

  describe('addMember', () => {
    it('adds a member by email', async () => {
      const req = makeReq({ body: { email: 'new@test.com', role: 'MEMBER' } });
      const res = httpMocks.createResponse();

      client.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user456' }] }) // find user by email
        .mockResolvedValueOnce({ rowCount: 0 })                             // check membership — not a member
        .mockResolvedValueOnce({});                                         // INSERT member

      await addMember(req, res);

      expect(res.statusCode).toBe(201);
      expect(res._getJSONData().message).toBe('Member added successfully');
    });

    it('returns 404 if user email not found', async () => {
      const req = makeReq({ body: { email: 'unknown@test.com', role: 'MEMBER' } });
      const res = httpMocks.createResponse();
      client.query.mockResolvedValue({ rowCount: 0 });

      await addMember(req, res);

      expect(res.statusCode).toBe(404);
      expect(res._getJSONData().error).toContain('must sign up first');
    });

    it('returns 400 if user is already a member', async () => {
      const req = makeReq({ body: { email: 'existing@test.com', role: 'MEMBER' } });
      const res = httpMocks.createResponse();

      client.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user999' }] }) // find user
        .mockResolvedValueOnce({ rowCount: 1 });                            // already a member

      await addMember(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData().error).toContain('already a member');
    });
  });

  // ─── removeMember ────────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('removes a member from a workspace', async () => {
      const req = makeReq({ params: { userId: 'user456' } });
      const res = httpMocks.createResponse();
      client.query.mockResolvedValue({});

      await removeMember(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().message).toBe('Member removed successfully');
    });

    it('prevents an admin from removing themselves', async () => {
      // userId in params matches req.user.id ('user123')
      const req = makeReq({ params: { userId: 'user123' } });
      const res = httpMocks.createResponse();

      await removeMember(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData().error).toContain('cannot remove yourself');
    });
  });
});
