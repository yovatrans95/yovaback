const express = require('express');
const {
  listTasks,
  getTask,
  createTask,
  updateTask,
  validateTask,
  startTask,
  completeTask,
  deleteTask,
  getTaskStats
} = require('../controllers/taskController');
const { protect, allowRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/stats/overview', protect, getTaskStats);
router.get('/', protect, listTasks);
router.get('/:id', protect, getTask);

router.post('/', protect, allowRoles('admin', 'gestionnaire'), createTask);
router.patch('/:id', protect, updateTask);
router.patch('/:id/validate', protect, allowRoles('admin', 'gestionnaire'), validateTask);
router.patch('/:id/start', protect, startTask);
router.patch('/:id/done', protect, completeTask);
router.delete('/:id', protect, allowRoles('admin'), deleteTask);

module.exports = router;
