const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { fetchAllProviders, enrichWithDb, mergeByPlate } = require('../services/providers');
const { maybeRunIngestionAsync } = require('../services/ingestion');

const router = express.Router();

router.get('/vehicles', protect, async (req, res) => {
  try {
    // Appel direct des services fournisseurs (plus d'auto-appel HTTP sur sa propre API).
    // Cache 25s : le front rafraîchit toutes les 4s, inutile de re-taper les API
    // externes à chaque fois (Optifleet rate-limite à 429 sinon).
    const { byProvider, errors } = await fetchAllProviders({ cacheMs: 25_000 });

    // Fusion en une flotte unique, dédupliquée par plaque (webfleet > quartix > optifleet).
    const merged = mergeByPlate(byProvider);

    // Enrichissement avec les fiches Mongo.
    const vehicles = await enrichWithDb(merged);

    // Ajout automatique des nouveaux camions fournisseurs (throttlé, non bloquant).
    maybeRunIngestionAsync();

    res.json({
      success: true,
      count: vehicles.length,
      updatedAt: new Date().toISOString(),
      providerErrors: errors,
      vehicles
    });
  } catch (error) {
    console.error('Erreur tracking fusion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur récupération tracking multi-fournisseurs',
      error: error.message
    });
  }
});

module.exports = router;
