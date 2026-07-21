const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();
const { protect, allowRoles } = require('../middleware/authMiddleware');
const manager = require('../services/whatsapp/manager');
const { buildEnvois } = require('../services/whatsapp/planningSender');

const gestion = [protect, allowRoles('admin', 'gestionnaire')];

// ─── GET /api/whatsapp/status ──────────────────────────────────────────────
// État de la session : disconnected | initializing | qr | ready.
// Quand un QR est en attente, il est renvoyé en data URL prête pour un <img>.
router.get('/status', gestion, async (req, res) => {
  const { status, qr, error } = manager.getStatus();
  const payload = { status, error };
  if (qr) {
    payload.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 260 });
  }
  res.json(payload);
});

// ─── POST /api/whatsapp/connect ────────────────────────────────────────────
// Démarre (ou reprend) la session WhatsApp. Le front poll ensuite /status
// pour afficher le QR puis attendre "ready".
router.post('/connect', gestion, (req, res) => {
  const status = manager.connect();
  res.json({ status });
});

// ─── GET /api/whatsapp/planning/preview?date=YYYY-MM-DD ───────────────────
// Aperçu des messages qui seraient envoyés, sans rien envoyer.
router.get('/planning/preview', gestion, async (req, res) => {
  const { date } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return res.status(400).json({ message: 'date requise au format YYYY-MM-DD' });
  }
  const { envois, ignores } = await buildEnvois(date);
  res.json({
    date,
    envois: envois.map(({ chauffeur, telephone, message }) => ({ chauffeur, telephone, message })),
    ignores
  });
});

// ─── GET /api/whatsapp/planning/preview-one ───────────────────────────────
// Aperçu du message d'UN chauffeur pour une date, sans envoyer.
// Query : chauffeurId, date, heurePrise (optionnel)
router.get('/planning/preview-one', gestion, async (req, res) => {
  const { chauffeurId, date, heurePrise } = req.query;
  const { driver, message, erreur } = await buildMessageForDriver(chauffeurId, date, heurePrise);
  if (erreur) return res.status(404).json({ message: erreur });
  res.json({ chauffeur: `${driver.nom} ${driver.prenom}`.trim(), telephone: driver.telephone || '', message });
});

// ─── POST /api/whatsapp/planning/send-one ──────────────────────────────────
// Envoie le planning d'UN chauffeur pour une date.
// Body : { chauffeurId, date, heurePrise?, telephone?, pdfBase64?, pdfFilename? }
// telephone : numéro de destination ; défaut = celui de la fiche chauffeur.
// pdfBase64 : feuille de tournée générée côté front ; si présente, elle est
// envoyée en pièce jointe avec le message texte en légende.
router.post('/planning/send-one', gestion, async (req, res) => {
  const { chauffeurId, date, heurePrise, telephone, pdfBase64, pdfFilename } = req.body || {};
  if (manager.getStatus().status !== 'ready') {
    return res.status(409).json({ message: 'WhatsApp non connecté : scannez d\'abord le QR code' });
  }

  const { driver, message, erreur } = await buildMessageForDriver(chauffeurId, date, heurePrise);
  if (erreur) return res.status(404).json({ message: erreur });

  const numero = telephone || driver.telephone;
  const chatId = manager.toWhatsAppId(numero);
  if (!chatId) {
    return res.status(400).json({ message: `Numéro invalide : "${numero || ''}"` });
  }

  if (pdfBase64) {
    // Légende WhatsApp limitée (~1024 caractères) : on tronque si besoin,
    // le détail complet est dans le PDF joint.
    const caption = message.length > 1000 ? `${message.slice(0, 997)}…` : message;
    await manager.sendDocument(
      chatId,
      pdfBase64,
      'application/pdf',
      pdfFilename || `tournee_${date}.pdf`,
      caption
    );
  } else {
    await manager.sendMessage(chatId, message);
  }
  res.json({ ok: true, chauffeur: `${driver.nom} ${driver.prenom}`.trim(), numero, pdf: !!pdfBase64 });
});

async function buildMessageForDriver(chauffeurId, date, heurePrise) {
  if (!chauffeurId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return { erreur: 'chauffeurId et date (YYYY-MM-DD) sont requis' };
  }
  const Planning = require('../models/Planning');
  const { buildPlanningMessage } = require('../services/whatsapp/planningMessage');
  const planning = await Planning.findOne({ chauffeurId, date }).populate('chauffeurId');
  if (!planning || !planning.chauffeurId) {
    return { erreur: 'Aucun planning pour ce chauffeur à cette date' };
  }
  const driver = planning.chauffeurId;
  const message = buildPlanningMessage(driver, planning, { priseDePoste: heurePrise });
  if (!message) return { erreur: 'Aucun tour à envoyer (annulés ou vides)' };
  return { driver, message };
}

// ─── POST /api/whatsapp/planning/send ──────────────────────────────────────
// Envoie le planning de la date donnée à tous les chauffeurs concernés.
// Body : { date: "YYYY-MM-DD" }
router.post('/planning/send', gestion, async (req, res) => {
  const { date } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return res.status(400).json({ message: 'date requise au format YYYY-MM-DD' });
  }
  if (manager.getStatus().status !== 'ready') {
    return res.status(409).json({ message: 'WhatsApp non connecté : scannez d\'abord le QR code' });
  }

  const { envois, ignores } = await buildEnvois(date);
  const resultats = [];
  for (const { chauffeur, telephone, chatId, message } of envois) {
    try {
      await manager.sendMessage(chatId, message);
      resultats.push({ chauffeur, telephone, ok: true });
      // Petite pause entre chaque envoi pour rester discret côté WhatsApp.
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      resultats.push({ chauffeur, telephone, ok: false, erreur: error.message });
    }
  }

  res.json({
    date,
    envoyes: resultats.filter((r) => r.ok).length,
    echecs: resultats.filter((r) => !r.ok).length,
    resultats,
    ignores
  });
});

module.exports = router;
