const Planning = require('../../models/Planning');
require('../../models/Driver'); // enregistre le schéma pour le populate('chauffeurId')
const { toWhatsAppId } = require('./client');
const { buildPlanningMessage } = require('./planningMessage');

// Le chauffeur "VOLEE A LA" est un pseudo-chauffeur de dispatch, pas un destinataire.
function isDispatchDriver(driver) {
  return /volee/i.test(`${driver.nom} ${driver.prenom}`);
}

// Prépare les envois pour une date : la liste des messages prêts à partir et
// la liste des plannings ignorés (avec la raison, pour affichage côté front).
async function buildEnvois(date) {
  const plannings = await Planning.find({ date }).populate('chauffeurId');

  const envois = [];
  const ignores = [];
  for (const planning of plannings) {
    const driver = planning.chauffeurId;
    if (!driver) continue;

    const nom = `${driver.nom} ${driver.prenom}`.trim();
    if (isDispatchDriver(driver)) {
      ignores.push({ chauffeur: nom, raison: 'Chauffeur de dispatch (à la volée)' });
      continue;
    }

    const message = buildPlanningMessage(driver, planning);
    if (!message) {
      ignores.push({ chauffeur: nom, raison: 'Aucun tour à envoyer (annulés ou vides)' });
      continue;
    }

    const chatId = toWhatsAppId(driver.telephone);
    if (!chatId) {
      ignores.push({ chauffeur: nom, raison: `Numéro invalide : "${driver.telephone || ''}"` });
      continue;
    }

    envois.push({ chauffeur: nom, telephone: driver.telephone, chatId, message });
  }

  return { envois, ignores };
}

module.exports = { buildEnvois };
