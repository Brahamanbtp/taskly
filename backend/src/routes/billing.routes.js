const express = require('express');
const { createOrder, verifyPayment } = require('../controllers/billing.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireWorkspace } = require('../middlewares/workspace.middleware');
const { requireRole } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(authMiddleware);
router.use(requireWorkspace);

router.post('/create-order', requireRole('BILLING_ADMIN'), createOrder);
router.post('/verify', requireRole('BILLING_ADMIN'), verifyPayment);

module.exports = router;
