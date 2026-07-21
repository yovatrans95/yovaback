// Envoi du planning du jour (ou d'une date donnée) aux chauffeurs par WhatsApp.
// Même logique que le bouton de l'app (routes /api/whatsapp), en ligne de commande.
//
// Usage :
//   node src/scripts/sendPlanning.js                     -> planning de demain, envoi réel
//   node src/scripts/sendPlanning.js 2026-07-20          -> date précise
//   node src/scripts/sendPlanning.js --today             -> planning d'aujourd'hui
//   node src/scripts/sendPlanning.js --dry-run           -> affiche les messages sans rien envoyer
//   node src/scripts/sendPlanning.js --to 0612345678     -> envoie TOUS les messages à ce numéro (test)

require('dotenv').config();
const connectDB = require('../config/db');
const { createWhatsAppClient, waitForReady, toWhatsAppId } = require('../services/whatsapp/client');
const { buildEnvois } = require('../services/whatsapp/planningSender');
const { formatDateFr } = require('../services/whatsapp/planningMessage');

function parseArgs(argv) {
  const args = { date: null, dryRun: false, to: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--today') args.date = localDate(0);
    else if (a === '--to') args.to = argv[++i];
    else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) args.date = a;
    else throw new Error(`Argument inconnu : ${a}`);
  }
  if (!args.date) args.date = localDate(1); // défaut : demain
  return args;
}

// Date locale (Europe/Paris côté serveur) au format YYYY-MM-DD, décalée de N jours.
function localDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Planning du ${formatDateFr(args.date)}${args.dryRun ? ' (dry-run)' : ''}`);

  await connectDB();

  const { envois, ignores } = await buildEnvois(args.date);
  for (const { chauffeur, raison } of ignores) {
    console.log(`- ${chauffeur} : ${raison}`);
  }

  if (args.to) {
    const chatId = toWhatsAppId(args.to);
    if (!chatId) throw new Error(`Numéro de test invalide : ${args.to}`);
    envois.forEach((e) => { e.chatId = chatId; });
  }

  if (envois.length === 0) {
    console.log('Aucun planning à envoyer pour cette date.');
    process.exit(0);
  }

  if (args.dryRun) {
    for (const { chauffeur, chatId, message } of envois) {
      console.log(`\n========== ${chauffeur} -> ${chatId} ==========`);
      console.log(message);
    }
    console.log(`\n${envois.length} message(s) prêt(s) — rien n'a été envoyé (dry-run).`);
    process.exit(0);
  }

  const client = createWhatsAppClient();
  await waitForReady(client);

  let ok = 0;
  let ko = 0;
  for (const { chauffeur, chatId, message } of envois) {
    try {
      await client.sendMessage(chatId, message);
      ok += 1;
      console.log(`✓ ${chauffeur} (${chatId})`);
      // Petite pause entre chaque envoi pour rester discret côté WhatsApp.
      await new Promise((r) => setTimeout(r, 3000));
    } catch (error) {
      ko += 1;
      console.error(`✗ ${chauffeur} (${chatId}) : ${error.message}`);
    }
  }

  console.log(`\nTerminé : ${ok} envoyé(s), ${ko} échec(s).`);
  await client.destroy();
  process.exit(ko > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
