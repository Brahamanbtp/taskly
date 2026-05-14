const express = require('express');
const router = express.Router();
const { listWorkspaces, createWorkspace, listMembers, addMember, removeMember, deleteWorkspace } = require('../controllers/workspace.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireWorkspace } = require('../middlewares/workspace.middleware');
const { requireRole } = require('../middlewares/rbac.middleware');
const { checkQuota } = require('../middlewares/quota.middleware');

router.use(authMiddleware);

router.get('/', listWorkspaces);
router.post('/', createWorkspace);

// Member management (Requires workspace context)
router.get('/members', requireWorkspace, listMembers);
router.post('/members', requireWorkspace, requireRole('ADMIN'), checkQuota('members'), addMember);
router.delete('/members/:userId', requireWorkspace, requireRole('ADMIN'), removeMember);
router.delete('/', requireWorkspace, requireRole('OWNER'), deleteWorkspace);

module.exports = router;
