const express = require('express');
const router = express.Router();
const Planning = require('../models/Planning');
const { protect } = require('../middleware/authMiddleware');

// Helper : récupère l'identifiant affichable de l'utilisateur connecté
function getUsername(user) {
  return user.username || user.email || `${user.prenom || ''} ${user.nom || ''}`.trim() || String(user._id);
}

// ─── GET /api/planning ─────────────────────────────────────────────────────
// Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), chauffeurId (optionnel)
router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate, chauffeurId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate et endDate sont requis' });
    }

    const filter = { date: { $gte: startDate, $lte: endDate } };
    if (chauffeurId) filter.chauffeurId = chauffeurId;

    const plannings = await Planning.find(filter)
      .populate('chauffeurId', 'nom prenom statut')
      .sort({ date: 1 });

    res.json(plannings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/planning/clients/list ───────────────────────────────────────
// IMPORTANT : avant /:chauffeurId/:date sinon Express interprète "clients"
// comme un chauffeurId
router.get('/clients/list', protect, async (req, res) => {
  try {
    const result = await Planning.aggregate([
      { $unwind: '$tours' },
      { $match: { 'tours.clientSource': 'manuel' } },
      { $group: { _id: '$tours.client' } },
      { $sort: { _id: 1 } }
    ]);
    const clients = result.map(r => r._id).filter(Boolean);
    res.json(clients);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/planning/:chauffeurId/:date ──────────────────────────────────
router.get('/:chauffeurId/:date', protect, async (req, res) => {
  try {
    const { chauffeurId, date } = req.params;
    const planning = await Planning.findOne({ chauffeurId, date })
      .populate('chauffeurId', 'nom prenom statut');

    if (!planning) return res.status(404).json({ message: 'Aucun planning pour ce chauffeur à cette date' });
    res.json(planning);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/planning/:chauffeurId/:date/tours ───────────────────────────
router.post('/:chauffeurId/:date/tours', protect, async (req, res) => {
  try {
    const { chauffeurId, date } = req.params;
    const username = getUsername(req.user);

    const tourData = {
      ...req.body,
      createdBy: username,
      updatedBy: username
    };

    let planning = await Planning.findOne({ chauffeurId, date });

    if (!planning) {
      planning = new Planning({ chauffeurId, date, tours: [tourData] });
    } else {
      planning.tours.push(tourData);
    }

    await planning.save();
    res.status(201).json(planning);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─── PATCH /api/planning/:chauffeurId/:date/tours/:tourId ──────────────────
router.patch('/:chauffeurId/:date/tours/:tourId', protect, async (req, res) => {
  try {
    const { chauffeurId, date, tourId } = req.params;
    const username = getUsername(req.user);

    const planning = await Planning.findOne({ chauffeurId, date });
    if (!planning) return res.status(404).json({ message: 'Planning introuvable' });

    const tour = planning.tours.id(tourId);
    if (!tour) return res.status(404).json({ message: 'Tour introuvable' });

    const allowedFields = [
      'type',
      'statut',
      'client',
      'clientSource',
      'immatCamion',
      'heureDebut',
      'heureFin',
      'heurePeriode',
      'source',
      'destination',
      'lieuChantier',
      'refTransport',
      'dashdocId',
      'notes'
    ];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) tour[field] = req.body[field];
    });
    tour.updatedBy = username;

    await planning.save();
    res.json(planning);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─── DELETE /api/planning/:chauffeurId/:date/tours/:tourId ─────────────────
router.delete('/:chauffeurId/:date/tours/:tourId', protect, async (req, res) => {
  try {
    const { chauffeurId, date, tourId } = req.params;

    const planning = await Planning.findOne({ chauffeurId, date });
    if (!planning) return res.status(404).json({ message: 'Planning introuvable' });

    planning.tours.pull(tourId);
    await planning.save();
    res.json({ message: 'Tour supprimé', planning });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
