const express = require('express');
const { listWebhooks, addWebhook, deleteWebhook } = require('../controllers/webhook.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireWorkspace } = require('../middlewares/workspace.middleware');

const { requireRole } = require('../middlewares/rbac.middleware');
const { checkQuota } = require('../middlewares/quota.middleware');

const router = express.Router();

router.use(authMiddleware);
router.use(requireWorkspace);

router.get('/', listWebhooks);
router.post('/', requireRole('ADMIN'), checkQuota('webhooks'), addWebhook);
router.delete('/:id', requireRole('ADMIN'), deleteWebhook);

module.exports = router;
