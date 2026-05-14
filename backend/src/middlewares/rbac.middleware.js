const ROLES = {
  OWNER: 5,
  ADMIN: 4,
  BILLING_ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
  EXTERNAL_GUEST: 0
};

/**
 * Middleware to require a minimum role level in the current workspace.
 * Must be used AFTER authMiddleware and requireWorkspace.
 */
function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.workspace || !req.workspace.role) {
      return res.status(403).json({ error: 'Workspace context missing' });
    }

    const userRoleLevel = ROLES[req.workspace.role] || 0;
    const requiredRoleLevel = ROLES[minRole] || 5; // Default to impossible if role unknown

    if (userRoleLevel < requiredRoleLevel) {
      return res.status(403).json({ 
        error: `Insufficient permissions. Required: ${minRole}, Your role: ${req.workspace.role}` 
      });
    }

    next();
  };
}

module.exports = { requireRole, ROLES };
