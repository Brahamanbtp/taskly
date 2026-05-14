const express = require('express');
const { searchTasks, semanticSearch, getSearchCapabilities } = require('../controllers/search.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireWorkspace } = require('../middlewares/workspace.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/capabilities', getSearchCapabilities);

router.use(requireWorkspace);

router.get('/', searchTasks);
router.get('/semantic', semanticSearch);

module.exports = router;
