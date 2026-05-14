const express = require('express');
const { listNotifications, markAsRead } = require('../controllers/notification.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireWorkspace } = require('../middlewares/workspace.middleware');

const router = express.Router();

router.use(authMiddleware);
router.use(requireWorkspace);

router.get('/', listNotifications);
router.patch('/:id/read', markAsRead);

module.exports = router;
