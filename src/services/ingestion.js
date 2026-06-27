// Orchestration de l'ingestion : récupère tous les fournisseurs puis
// synchronise les véhicules vers Mongo (ajout automatique des nouveaux).
//
// Deux points d'entrée :
//  - runIngestion()            : exécution complète (utilisée par le cron externe).
//  - maybeRunIngestionAsync()  : déclenchement opportuniste et throttlé, appelé
//                                depuis la route /tracking sans bloquer la réponse.

const { fetchAllProviders } = require('./providers');
const { syncProviderVehicles } = require('./vehicleSync');
const { archiveTripsForRange } = require('./trips/tripService');

// Intervalle minimal entre deux synchros opportunistes (le front rafraîchit toutes les 4s).
const MIN_INTERVAL_MS = Number(process.env.INGESTION_MIN_INTERVAL_MS || 60_000);

let lastRunAt = 0;
let running = false;

async function runIngestion({ cacheMs = 0 } = {}) {
  const startedAt = Date.now();
  // cacheMs > 0 (appel opportuniste depuis /tracking) : on réutilise la donnée
  // déjà chargée pour la carte au lieu de re-taper Optifleet (et son quota).
  const { byProvider, errors } = await fetchAllProviders({ cacheMs });

  const allVehicles = Object.values(byProvider).flat();
  const summary = await syncProviderVehicles(allVehicles);

  return {
    durationMs: Date.now() - startedAt,
    providerErrors: errors,
    counts: Object.fromEntries(Object.entries(byProvider).map(([k, v]) => [k, v.length])),
    created: summary.created,
    updated: summary.updated,
    skipped: summary.skipped
  };
}

// Archive les trajets de la veille (ou d'une plage donnée) pour toute la flotte.
// Conçu pour être appelé une fois par jour par le cron externe.
async function runDailyTripArchive({ from, to } = {}) {
  const now = new Date();
  if (!to) to = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // début d'aujourd'hui
  if (!from) from = new Date(to.getTime() - 24 * 3600 * 1000);              // début d'hier

  const startedAt = Date.now();
  const result = await archiveTripsForRange({ from, to });
  return {
    durationMs: Date.now() - startedAt,
    from: from.toISOString(),
    to: to.toISOString(),
    ...result
  };
}

// Lance une ingestion en tâche de fond si l'intervalle minimal est dépassé.
// Ne bloque jamais l'appelant et n'échoue jamais bruyamment.
function maybeRunIngestionAsync() {
  const now = Date.now();
  if (running || now - lastRunAt < MIN_INTERVAL_MS) return;

  running = true;
  lastRunAt = now;

  // Réutilise la donnée fournisseurs déjà en cache (fraîche jusqu'à 30s) :
  // l'ajout auto ne relance aucun appel Optifleet supplémentaire.
  runIngestion({ cacheMs: 30_000 })
    .then(result => {
      if (result.created.length) {
        console.log(`🚚 Ingestion: ${result.created.length} véhicule(s) ajouté(s) automatiquement`,
          result.created.map(c => c.immatriculation));
      }
    })
    .catch(error => console.error('Ingestion opportuniste échouée:', error.message))
    .finally(() => { running = false; });
}

module.exports = { runIngestion, maybeRunIngestionAsync, runDailyTripArchive };
