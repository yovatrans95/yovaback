const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { fetchQuartixVehicles } = require('../services/providers/quartix');
const { enrichWithDb } = require('../services/providers');

const router = express.Router();

router.get('/vehicles', protect, async (req, res) => {
  try {
    const raw = await fetchQuartixVehicles();
    const vehicles = await enrichWithDb(raw);

    res.json({
      success: true,
      count: vehicles.length,
      updatedAt: new Date().toISOString(),
      vehicles
    });
  } catch (error) {
    console.error('Erreur Quartix:', error.message || error);
    res.status(500).json({
      success: false,
      message: 'Erreur récupération véhicules Quartix',
      error: error.message
    });
  }
});

module.exports = router;
