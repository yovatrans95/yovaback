const express = require('express');
const { protect, allowRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const {
  uploadVehicleDocument,
  deleteVehicleDocument
} = require('../controllers/vehicleDocumentController');

const router = express.Router();

router.post(
  '/:id/documents',
  protect,
  allowRoles('admin', 'gestionnaire'),
  upload.single('file'),
  uploadVehicleDocument
);

router.delete(
  '/:id/documents/:documentId',
  protect,
  allowRoles('admin', 'gestionnaire'),
  deleteVehicleDocument
);
module.exports = router;