// Géocodage inverse : coordonnées GPS -> adresse postale lisible.
// Utilise l'API Adresse de l'État (api-adresse.data.gouv.fr) : gratuite, sans clé,
// limite ~50 req/s — largement suffisant. Couverture France uniquement, ce qui
// correspond à la flotte.
//
// Un cache mémoire (clé arrondie à ~11 m) évite de re-géocoder les sites où les
// camions passent en boucle (rotations chantier/carrière). L'adresse est ensuite
// stockée dans le document Trip : on ne géocode donc que les nouveaux trajets.

const BAN_REVERSE_URL = 'https://api-adresse.data.gouv.fr/reverse/';
const GEO_COMMUNES_URL = 'https://geo.api.gouv.fr/communes';

const cache = new Map();
const MAX_CACHE = 5000;

// Adresse précise via la Base Adresse Nationale. Vide si le point est hors voirie
// (chantier, carrière, champ) : la BAN ne renvoie que des adresses proches.
async function banReverse(lat, lng) {
  const res = await fetch(`${BAN_REVERSE_URL}?lon=${lng}&lat=${lat}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(4000)
  });
  if (!res.ok) throw new Error(`BAN ${res.status}`);
  const data = await res.json();
  // label = "23 Avenue Jacques Heuclin 77340 Pontault-Combault"
  return data?.features?.[0]?.properties?.label || '';
}

// Repli : au moins la commune ("Annet-sur-Marne (77410)"). Couvre toute la France,
// même en plein champ — bien plus parlant que des coordonnées brutes.
async function communeReverse(lat, lng) {
  const res = await fetch(`${GEO_COMMUNES_URL}?lat=${lat}&lon=${lng}&fields=nom,codesPostaux`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(4000)
  });
  if (!res.ok) throw new Error(`geo.api ${res.status}`);
  const data = await res.json();
  const c = Array.isArray(data) ? data[0] : null;
  if (!c?.nom) return '';
  const cp = c.codesPostaux?.[0];
  return cp ? `${c.nom} (${cp})` : c.nom;
}

async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return '';

  const key = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const address = (await banReverse(lat, lng)) || (await communeReverse(lat, lng));
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(key, address);
    return address;
  } catch {
    return ''; // réseau/timeout : pas de cache, on réessaiera au prochain passage
  }
}

// Complète startAddress/endAddress d'un trajet normalisé s'ils manquent.
async function geocodeTripEndpoints(trip) {
  if (!trip.startAddress && trip.startLat != null) {
    trip.startAddress = await reverseGeocode(trip.startLat, trip.startLng);
  }
  if (!trip.endAddress && trip.endLat != null) {
    trip.endAddress = await reverseGeocode(trip.endLat, trip.endLng);
  }
  return trip;
}

module.exports = { reverseGeocode, geocodeTripEndpoints };
