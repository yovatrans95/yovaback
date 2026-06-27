const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { fetchWebfleetVehicles } = require('../services/providers/webfleet');
const { enrichWithDb } = require('../services/providers');

const router = express.Router();

router.get('/vehicles', protect, async (req, res) => {
  try {
    const raw = await fetchWebfleetVehicles();
    const vehicles = await enrichWithDb(raw);

    res.json({
      success: true,
      count: vehicles.length,
      updatedAt: new Date().toISOString(),
      vehicles
    });
  } catch (error) {
    console.error('Erreur Webfleet:', error.message || error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.publicMessage || 'Erreur récupération véhicules Webfleet',
      error: error.publicError || error.message
    });
  }
});

module.exports = router;
