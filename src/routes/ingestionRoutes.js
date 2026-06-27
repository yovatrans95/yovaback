// Route d'ingestion déclenchable par un cron externe (ex: cron-job.org),
// indispensable sur Render free tier où aucun process ne tourne en continu.
//
// Authentification : soit un JWT admin (protect), soit une clé secrète
// passée dans l'en-tête `x-ingestion-key` (= process.env.INGESTION_KEY).

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { runIngestion, runDailyTripArchive } = require('../services/ingestion');

const router = express.Router();

// Autorise l'accès via clé d'ingestion OU via JWT utilisateur.
function authorizeIngestion(req, res, next) {
  const key = req.headers['x-ingestion-key'];
  if (process.env.INGESTION_KEY && key === process.env.INGESTION_KEY) {
    return next();
  }
  return protect(req, res, next);
}

// Synchro véhicules + ajout automatique (à appeler souvent, léger).
router.post('/run', authorizeIngestion, async (req, res) => {
  try {
    const result = await runIngestion();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Erreur ingestion:', error.message || error);
    res.status(500).json({ success: false, message: 'Erreur ingestion', error: error.message });
  }
});

// Archivage des trajets de la veille (à appeler une fois par jour par le cron).
// Optionnel : body/query { from, to } en ISO pour rejouer une plage précise.
router.post('/archive-trips', authorizeIngestion, async (req, res) => {
  try {
    const from = req.query.from || req.body?.from;
    const to = req.query.to || req.body?.to;
    const result = await runDailyTripArchive({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Erreur archivage trajets:', error.message || error);
    res.status(500).json({ success: false, message: 'Erreur archivage trajets', error: error.message });
  }
});

module.exports = router;
