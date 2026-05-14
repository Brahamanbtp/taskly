const express = require('express');
const {
  listTasks,
  createTask,
  updateTaskStatus,
  editTask,
  deleteTask,
  reorderTask,
  getTaskEvents,
  getBoardHistory,
  undoLastAction,
  addDependency,
  removeDependency,
  listDependencies
} = require('../controllers/task.controller');
const { listComments, addComment } = require('../controllers/comment.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireWorkspace } = require('../middlewares/workspace.middleware');
const { requireRole } = require('../middlewares/rbac.middleware');
const { checkQuota } = require('../middlewares/quota.middleware');

const router = express.Router();

router.use(authMiddleware); // Protect all task routes
router.use(requireWorkspace); // Require a valid workspace context

router.get('/', listTasks);
router.get('/history', getBoardHistory);
router.get('/dependencies', listDependencies);
router.get('/:id/events', getTaskEvents);

router.post('/', requireRole('MEMBER'), checkQuota('tasks'), createTask);
router.post('/dependencies', requireRole('MEMBER'), addDependency);
router.delete('/dependencies', requireRole('MEMBER'), removeDependency);
router.patch('/:id/status', requireRole('MEMBER'), updateTaskStatus);
router.put('/:id/reorder', requireRole('MEMBER'), reorderTask);
router.patch('/:id', requireRole('MEMBER'), editTask);
router.delete('/:id', requireRole('ADMIN'), deleteTask);
router.post('/:id/undo', requireRole('ADMIN'), undoLastAction);

// Comments
router.get('/:taskId/comments', listComments);
router.post('/:taskId/comments', requireRole('MEMBER'), addComment);

module.exports = router;
