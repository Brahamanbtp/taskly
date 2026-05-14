const { requireRole, ROLES } = require('../src/middlewares/rbac.middleware');
const httpMocks = require('node-mocks-http');

describe('RBAC Middleware — requireRole', () => {
  function runMiddleware(middleware, req, res) {
    return new Promise((resolve) => {
      middleware(req, res, resolve);
    });
  }

  it('allows OWNER to access OWNER-level route', async () => {
    const req = httpMocks.createRequest();
    const res = httpMocks.createResponse();
    req.workspace = { id: 'ws1', role: 'OWNER' };

    const next = jest.fn();
    requireRole('OWNER')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200); // not set to 403
  });

  it('allows ADMIN to access MEMBER-level route', async () => {
    const req = httpMocks.createRequest();
    const res = httpMocks.createResponse();
    req.workspace = { id: 'ws1', role: 'ADMIN' };

    const next = jest.fn();
    requireRole('MEMBER')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('blocks MEMBER from ADMIN-level route', async () => {
    const req = httpMocks.createRequest();
    const res = httpMocks.createResponse();
    req.workspace = { id: 'ws1', role: 'MEMBER' };

    const next = jest.fn();
    requireRole('ADMIN')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res._getJSONData().error).toContain('Insufficient permissions');
  });

  it('blocks VIEWER from MEMBER-level route', async () => {
    const req = httpMocks.createRequest();
    const res = httpMocks.createResponse();
    req.workspace = { id: 'ws1', role: 'VIEWER' };

    const next = jest.fn();
    requireRole('MEMBER')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when workspace context is missing', async () => {
    const req = httpMocks.createRequest();
    const res = httpMocks.createResponse();
    req.workspace = undefined;

    const next = jest.fn();
    requireRole('MEMBER')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res._getJSONData().error).toBe('Workspace context missing');
  });

  it('returns 403 when workspace exists but role is missing', async () => {
    const req = httpMocks.createRequest();
    const res = httpMocks.createResponse();
    req.workspace = { id: 'ws1' }; // no role

    const next = jest.fn();
    requireRole('MEMBER')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('ROLES object has correct numeric hierarchy', () => {
    expect(ROLES.OWNER).toBeGreaterThan(ROLES.ADMIN);
    expect(ROLES.ADMIN).toBeGreaterThan(ROLES.MEMBER);
    expect(ROLES.MEMBER).toBeGreaterThan(ROLES.VIEWER);
  });
});
