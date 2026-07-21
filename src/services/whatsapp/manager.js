const { MessageMedia } = require('whatsapp-web.js');
const { createWhatsAppClient, toWhatsAppId } = require('./client');

// Gestionnaire de la session WhatsApp côté serveur : un seul client partagé,
// initialisé à la demande (bouton "Connecter" côté front). Le QR code de la
// première connexion est exposé via getStatus() pour être affiché dans l'app.

let client = null;
let status = 'disconnected'; // disconnected | initializing | qr | ready
let lastQr = null;
let lastError = null;

function connect() {
  if (client && (status === 'ready' || status === 'initializing' || status === 'qr')) {
    return status;
  }

  client = createWhatsAppClient();
  status = 'initializing';
  lastQr = null;
  lastError = null;

  client.on('qr', (qr) => {
    status = 'qr';
    lastQr = qr;
  });

  client.on('ready', () => {
    status = 'ready';
    lastQr = null;
    console.log('WhatsApp : client prêt');
  });

  client.on('auth_failure', (msg) => {
    status = 'disconnected';
    lastError = `Échec d'authentification : ${msg}`;
    client = null;
  });

  client.on('disconnected', (reason) => {
    console.warn(`WhatsApp : déconnecté (${reason})`);
    status = 'disconnected';
    client = null;
  });

  client.initialize().catch((error) => {
    console.error('WhatsApp : échec d\'initialisation', error);
    status = 'disconnected';
    lastError = error.message;
    client = null;
  });

  return status;
}

function getStatus() {
  return { status, qr: lastQr, error: lastError };
}

// whatsapp-web.js pilote WhatsApp Web via Puppeteer. Quand la page se resynchronise
// (mise à jour de WhatsApp Web, reconnexion du téléphone…), la frame interne est
// détachée un court instant : un envoi lancé pile à ce moment échoue avec
// "Attempted to use detached Frame" ou "Execution context was destroyed". L'erreur
// est transitoire — la frame se ré-attache en général en moins d'une seconde.
function isTransientFrameError(error) {
  const msg = String(error && error.message || error || '');
  return /detached frame|execution context was destroyed|target closed|session closed|frame got detached/i.test(msg);
}

// Rejoue `fn` jusqu'à `attempts` fois si l'erreur est une frame détachée transitoire.
async function withFrameRetry(fn, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientFrameError(error) || i === attempts - 1) throw error;
      // Petit backoff pour laisser la frame WhatsApp Web se ré-attacher.
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastError;
}

async function sendMessage(chatId, message) {
  if (status !== 'ready' || !client) {
    throw new Error('WhatsApp non connecté');
  }
  return withFrameRetry(() => client.sendMessage(chatId, message));
}

// Envoie un document (PDF…) en pièce jointe, avec légende optionnelle.
async function sendDocument(chatId, base64, mimeType, filename, caption) {
  if (status !== 'ready' || !client) {
    throw new Error('WhatsApp non connecté');
  }
  const media = new MessageMedia(mimeType, base64, filename);
  return withFrameRetry(() => client.sendMessage(chatId, media, caption ? { caption } : {}));
}

module.exports = { connect, getStatus, sendMessage, sendDocument, toWhatsAppId };
