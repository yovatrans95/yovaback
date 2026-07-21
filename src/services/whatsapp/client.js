const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Client WhatsApp basé sur whatsapp-web.js : pilote une session WhatsApp Web
// avec un numéro dédié. La session est persistée dans .wwebjs_auth/ — le QR
// code n'est à scanner qu'à la première connexion.
function createWhatsAppClient() {
  return new Client({
    authStrategy: new LocalAuth({ clientId: 'yovatrans-planning' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });
}

// Résout quand la session est prête à envoyer des messages.
function waitForReady(client) {
  return new Promise((resolve, reject) => {
    client.on('qr', (qr) => {
      console.log('\nPremière connexion : scannez ce QR code avec le téléphone');
      console.log('WhatsApp > Paramètres > Appareils connectés > Connecter un appareil\n');
      qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => console.log('WhatsApp : session authentifiée'));
    client.on('ready', () => {
      console.log('WhatsApp : client prêt');
      resolve(client);
    });
    client.on('auth_failure', (msg) => reject(new Error(`Échec d'authentification WhatsApp : ${msg}`)));

    client.initialize().catch(reject);
  });
}

// Convertit un numéro FR ("06 12 34 56 78", "+33612345678"…) en identifiant
// WhatsApp ("33612345678@c.us"). Retourne null si le numéro est inexploitable.
function toWhatsAppId(telephone) {
  if (!telephone) return null;
  let digits = String(telephone).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('0')) digits = `33${digits.slice(1)}`;
  if (digits.length < 11) return null;
  return `${digits}@c.us`;
}

module.exports = { createWhatsAppClient, waitForReady, toWhatsAppId };
