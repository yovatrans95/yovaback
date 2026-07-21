// Historique d'un véhicule : trajets/itinéraires.
// Monté sur /api/vehicles (en plus de vehicleRoutes) — les chemins /:id/trips
// ne rentrent pas en conflit avec /:id de vehicleRoutes.

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getTripsForVehicle } = require('../services/trips/tripService');

const router = express.Router();

// Borne une plage de dates depuis la query, défaut = 7 derniers jours.
function parseRange(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

router.get('/:id/trips', protect, async (req, res) => {
  const range = parseRange(req.query);
  if (!range) return res.status(400).json({ message: 'Paramètres from/to invalides' });

  const result = await getTripsForVehicle(req.params.id, {
    ...range,
    refresh: req.query.refresh === '1' || req.query.refresh === 'true'
  });

  if (result === null) return res.status(404).json({ message: 'Véhicule introuvable' });

  res.json({
    success: true,
    vehicleId: req.params.id,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    count: result.trips.length,
    providerErrors: result.providerErrors,
    pending: result.pending || false,
    trips: result.trips
  });
});

module.exports = router;
