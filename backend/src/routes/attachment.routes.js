const express = require('express');
const { getPresignedUploadUrl, registerAttachment, listAttachments } = require('../controllers/attachment.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireWorkspace } = require('../middlewares/workspace.middleware');

const router = express.Router();

router.use(authMiddleware);
router.use(requireWorkspace);

router.get('/:taskId', listAttachments);
router.post('/presign', getPresignedUploadUrl);
router.post('/register', registerAttachment);

module.exports = router;
