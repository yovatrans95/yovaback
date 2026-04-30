const express = require('express');
const {
  listDrivers,
  getDriver,
  createDriver,
  updateDriver,
  deleteDriver,
  getDriverStats
} = require('../controllers/driverController');
const { protect, allowRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/stats/overview', protect, getDriverStats);
router.get('/', protect, listDrivers);
router.get('/:id', protect, getDriver);
router.post('/', protect, allowRoles('admin', 'gestionnaire'), upload.single('photo'), createDriver);
router.patch('/:id', protect, allowRoles('admin', 'gestionnaire'), upload.single('photo'), updateDriver);
router.delete('/:id', protect, allowRoles('admin'), deleteDriver);

module.exports = router;
