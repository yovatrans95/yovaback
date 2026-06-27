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

// Liste de référence des clients connus Yovatrans.
// Source : tableau de bord Excel — édite directement ici si nouveau client.
const KNOWN_CLIENTS = [
  'MAUFFREY',
  'MEDINGER',
  'ROISSY TP',
  'MYMAT',
  'SOLVALOR',
  'MYBEN',
  'PRUNIERES TP',
  'TERAFORM',
  'GLEIZON',
  'EXTRACT',
  'GAIA',
  'PETITDIDIER',
  'SATM',
  'KONCRETE',
  'WIAME TP',
  'TRANSKRS',
  'BPE LECIEUX',
  'KOKO TRANSPORT',
  'LOCHIAM',
  'A LA VOLEE'
];

// ─── GET /api/planning/clients/list ───────────────────────────────────────
// Renvoie l'union de la liste de référence et des clients "manuel" déjà
// saisis dans les plannings, dédupliquée (insensible à la casse) et triée.
router.get('/clients/list', protect, async (req, res) => {
  try {
    const result = await Planning.aggregate([
      { $unwind: '$tours' },
      { $match: { 'tours.clientSource': 'manuel' } },
      { $group: { _id: '$tours.client' } }
    ]);
    const fromDb = result.map(r => r._id).filter(Boolean);

    // Dédoublonnage insensible à la casse — la 1ère occurrence (donc celle
    // de KNOWN_CLIENTS) garde sa graphie.
    const seen = new Map();
    [...KNOWN_CLIENTS, ...fromDb].forEach(c => {
      const key = String(c).trim().toUpperCase();
      if (key && !seen.has(key)) seen.set(key, String(c).trim());
    });

    const clients = [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'));
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
      'nombreTours',
      'regieTours',
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

// ─── PATCH /api/planning/:chauffeurId/:date/reorder ────────────────────────
// Body: { ordre: [tourId, tourId, ...] }
// Réordonne physiquement le tableau "tours" du document Planning selon la
// liste d'IDs fournie. Tout tour non listé dans "ordre" est conservé à la fin
// (par sécurité, pour ne pas perdre de données en cas de désynchro).
router.patch('/:chauffeurId/:date/reorder', protect, async (req, res) => {
  try {
    const { chauffeurId, date } = req.params;
    const { ordre } = req.body;

    if (!Array.isArray(ordre)) {
      return res.status(400).json({ message: 'Le champ "ordre" doit être un tableau d\'IDs.' });
    }

    const planning = await Planning.findOne({ chauffeurId, date });
    if (!planning) return res.status(404).json({ message: 'Planning introuvable' });

    // Index des tours par ID pour un accès O(1)
    const byId = new Map();
    planning.tours.forEach(t => byId.set(String(t._id), t));

    // Reconstruire dans l'ordre demandé (en ignorant les IDs inconnus)
    const newTours = [];
    const seen = new Set();
    ordre.forEach(id => {
      const key = String(id);
      const t = byId.get(key);
      if (t && !seen.has(key)) {
        newTours.push(t);
        seen.add(key);
      }
    });

    // Filet de sécurité : on rajoute à la fin les tours non listés (s'il y en a)
    planning.tours.forEach(t => {
      const key = String(t._id);
      if (!seen.has(key)) newTours.push(t);
    });

    // Remplacement du tableau Mongoose
    planning.tours.splice(0, planning.tours.length, ...newTours);

    await planning.save();
    res.json(planning);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
