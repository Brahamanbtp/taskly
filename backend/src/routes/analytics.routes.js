const express = require('express');
const { getWorkspaceAnalytics } = require('../controllers/analytics.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireWorkspace } = require('../middlewares/workspace.middleware');
const { requireRole } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(authMiddleware);
router.use(requireWorkspace);

// Only Admins/Owners can see analytics
router.get('/', requireRole('ADMIN'), getWorkspaceAnalytics);

module.exports = router;
