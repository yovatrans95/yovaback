// Agrégateur des fournisseurs de géolocalisation.
// - fetchAllProviders() : interroge les 3 fournisseurs en parallèle (tolérant aux pannes).
// - enrichWithDb()      : associe chaque véhicule fournisseur à sa fiche Mongo (par plaque).
// - mergeByPlate()      : fusionne les fournisseurs en une seule flotte, sans doublon de plaque.

const Vehicle = require('../../models/Vehicle');
const { normalizePlate } = require('./plate');
const { fetchOptifleetVehicles } = require('./optifleet');
const { fetchQuartixVehicles } = require('./quartix');
const { fetchWebfleetVehicles } = require('./webfleet');

const PROVIDERS = {
  webfleet: fetchWebfleetVehicles,
  quartix: fetchQuartixVehicles,
  optifleet: fetchOptifleetVehicles
};

// Ordre de priorité en cas de même plaque chez plusieurs fournisseurs.
const PROVIDER_PRIORITY = ['webfleet', 'quartix', 'optifleet'];

// Cache mémoire de la dernière réponse fournisseurs. Le front rafraîchit la carte
// toutes les 4s : sans cache, chaque rafraîchissement tape les 3 API externes et
// épuise le quota Optifleet (HTTP 429). Les positions ne changent que toutes les
// 1 à 15 min côté fournisseur, un cache court est donc sans perte.
let providersCache = { at: 0, result: null };

// Une seule requête réseau en vol à la fois (single-flight) : si 10 requêtes du
// front arrivent pendant un fetch à froid, elles partagent toutes la MÊME promesse
// au lieu de lancer 10 appels Optifleet concurrents (qui déclenchaient le 429).
let inFlight = null;

// Au-delà de cacheMs, on sert quand même l'ancienne donnée (jusqu'à maxStaleMs)
// pendant qu'un rafraîchissement part en fond : la réponse reste instantanée
// (stale-while-revalidate). On ne BLOQUE que si rien en cache ou cache trop vieux.
const DEFAULT_MAX_STALE_MS = 5 * 60_000;

async function fetchProvidersOnce() {
  const names = Object.keys(PROVIDERS);
  const settled = await Promise.allSettled(names.map(name => PROVIDERS[name]()));

  const byProvider = {};
  const errors = {};

  settled.forEach((res, i) => {
    const name = names[i];
    if (res.status === 'fulfilled') {
      byProvider[name] = res.value || [];
    } else {
      byProvider[name] = [];
      errors[name] = res.reason?.message || String(res.reason);
      console.error(`❌ Fournisseur ${name} en échec:`, errors[name]);
    }
  });

  const result = { byProvider, errors };
  // On ne met en cache que si au moins un fournisseur a répondu.
  if (Object.keys(errors).length < names.length) {
    providersCache = { at: Date.now(), result };
  }
  return result;
}

// Lance (ou récupère) l'unique fetch en vol. Ne lève jamais : en cas d'échec
// réseau global, on retombera sur le cache existant côté appelant.
function refreshInFlight() {
  if (!inFlight) {
    inFlight = fetchProvidersOnce().finally(() => { inFlight = null; });
  }
  return inFlight;
}

// Interroge tous les fournisseurs. Une panne d'un fournisseur n'empêche pas les autres.
//  - cache frais (< cacheMs)            -> renvoyé tel quel (aucun appel réseau).
//  - cache périmé mais < maxStaleMs     -> renvoyé immédiatement + refresh en fond.
//  - pas de cache (ou trop vieux)       -> on attend le fetch (partagé via single-flight).
async function fetchAllProviders({ cacheMs = 0, maxStaleMs = DEFAULT_MAX_STALE_MS } = {}) {
  const age = providersCache.result ? Date.now() - providersCache.at : Infinity;

  if (providersCache.result && age < cacheMs) {
    return providersCache.result;
  }

  if (providersCache.result && age < maxStaleMs) {
    refreshInFlight().catch(() => {}); // revalidation en fond, sans bloquer
    return providersCache.result;
  }

  // Rien d'exploitable en cache : on attend, mais via la promesse partagée.
  try {
    return await refreshInFlight();
  } catch (e) {
    if (providersCache.result) return providersCache.result; // filet de sécurité
    throw e;
  }
}

// Ajoute les champs Mongo (vehicleId, marque, modele, statut...) à une liste de véhicules fournisseur.
async function enrichWithDb(vehicles) {
  const dbVehicles = await Vehicle.find({})
    .select('_id immatriculation marque modele statut mode_possession origin')
    .lean();

  const dbByPlate = new Map(dbVehicles.map(v => [normalizePlate(v.immatriculation), v]));

  return vehicles.map(v => {
    const dbVehicle = v.immatriculation ? dbByPlate.get(normalizePlate(v.immatriculation)) : null;
    return {
      ...v,
      vehicleId: dbVehicle?._id || null,
      vehicleFoundInMongo: Boolean(dbVehicle),
      marque: dbVehicle?.marque || v.brand || null,
      modele: dbVehicle?.modele || v.model || null,
      statutMongo: dbVehicle?.statut || null
    };
  });
}

// Fusionne plusieurs listes fournisseur en une flotte unique, dédupliquée par plaque.
// Le fournisseur le plus prioritaire l'emporte. Les véhicules sans plaque sont conservés tels quels.
function mergeByPlate(byProvider) {
  const byPlate = new Map();
  const noPlate = [];

  PROVIDER_PRIORITY.forEach(provider => {
    (byProvider[provider] || []).forEach(vehicle => {
      const key = normalizePlate(vehicle.immatriculation || '');
      if (!key) {
        noPlate.push({ ...vehicle, provider });
        return;
      }
      if (!byPlate.has(key)) {
        byPlate.set(key, { ...vehicle, provider });
      }
    });
  });

  return [...byPlate.values(), ...noPlate];
}

module.exports = {
  PROVIDERS,
  PROVIDER_PRIORITY,
  fetchAllProviders,
  enrichWithDb,
  mergeByPlate
};
