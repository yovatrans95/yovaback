const express = require('express');
const {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleStats
} = require('../controllers/vehicleController');

const { protect, allowRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

const vehicleFiles = upload.fields([
  { name: 'carte_grise_fichier', maxCount: 1 },
  { name: 'contrat_location_fichier', maxCount: 1 },
  { name: 'controle_technique_fichier', maxCount: 1 },
  { name: 'assurance_fichier', maxCount: 1 },
  { name: 'licence_transport_fichier', maxCount: 1 },
  { name: 'recepisse_transport_fichier', maxCount: 1 },
  { name: 'chronotachygraphe_fichier', maxCount: 1 },
  { name: 'limiteur_fichier', maxCount: 1 }
]);

router.get('/stats/overview', protect, getVehicleStats);
router.get('/', protect, listVehicles);
router.get('/:id', protect, getVehicle);
router.post('/', protect, allowRoles('admin', 'gestionnaire'), vehicleFiles, createVehicle);
router.patch('/:id', protect, allowRoles('admin', 'gestionnaire'), vehicleFiles, updateVehicle);
router.delete('/:id', protect, allowRoles('admin'), deleteVehicle);

module.exports = router;