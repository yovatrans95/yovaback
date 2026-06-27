// Service fournisseur Optifleet (Renault Trucks / Volvo Group API).
// Renvoie une liste normalisée de véhicules. Contrairement à l'ancienne route,
// on NE filtre PLUS les véhicules sans position : un camion fraîchement ajouté
// chez Optifleet (donc sans point GPS encore remonté) doit quand même apparaître.

const { normalizePlate } = require('./plate');

const OPTIFLEET_BASE_URL =
  process.env.OPTIFLEET_BASE_URL || 'https://api.renault-trucks.com/vehicle';

const ACCEPT_HEADERS = {
  vehicles: 'application/x.volvogroup.com.vehicles.v1.0+json',
  vehiclepositions: 'application/x.volvogroup.com.vehiclepositions.v1.0+json'
};

async function fetchOptifleetVehicles() {
  const [vehiclesData, positionsData] = await Promise.all([
    fetchOptifleet('/vehicles', ACCEPT_HEADERS.vehicles),
    fetchOptifleet('/vehiclepositions?latestOnly=true', ACCEPT_HEADERS.vehiclepositions)
  ]);

  const optifleetVehicles = vehiclesData?.vehicleResponse?.vehicles || [];
  const optifleetPositions =
    positionsData?.vehiclePositionResponse?.vehiclePositions ||
    positionsData?.vehiclePositions ||
    [];

  const positionsByVin = new Map(
    optifleetPositions.filter(pos => pos?.vin).map(pos => [pos.vin, pos])
  );

  return optifleetVehicles.map(item => {
    const plate = normalizePlate(item.customerVehicleName || '');
    const position = positionsByVin.get(item.vin);

    const lat = getLatitude(position);
    const lng = getLongitude(position);
    const speed = getSpeed(position);
    const hasPosition = lat != null && lng != null;

    return {
      provider: 'optifleet',
      providerId: item.vin || null,
      objectno: item.vin,
      name: item.customerVehicleName || plate || item.vin,
      immatriculation: plate,
      brand: item.brand || null,
      model: item.model || null,

      lat,
      lng,
      address: '',
      speed,
      hasPosition,

      ignition: hasPosition ? true : null,
      standstill: hasPosition ? speed === 0 : null,

      course:
        position?.gnssPosition?.heading ??
        position?.position?.heading ??
        position?.heading ??
        null,

      status: null,

      posTime:
        position?.receivedDateTime ||
        position?.createdDateTime ||
        position?.triggerData?.triggerDateTime ||
        null,

      msgTime:
        position?.receivedDateTime ||
        position?.createdDateTime ||
        position?.triggerData?.triggerDateTime ||
        null,

      raw: { vehicle: item, position }
    };
  });
}

async function fetchOptifleet(endpoint, acceptHeader) {
  if (!process.env.OPTIFLEET_USERNAME || !process.env.OPTIFLEET_PASSWORD) {
    throw new Error('Variables OPTIFLEET_USERNAME ou OPTIFLEET_PASSWORD manquantes');
  }

  const response = await fetch(`${OPTIFLEET_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      Authorization: 'Basic ' + Buffer.from(
        `${process.env.OPTIFLEET_USERNAME}:${process.env.OPTIFLEET_PASSWORD}`
      ).toString('base64'),
      Accept: acceptHeader
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.detail || data?.title || `Erreur Optifleet ${response.status}`
    );
  }

  return data;
}

function getLatitude(position) {
  const value =
    position?.gnssPosition?.latitude ??
    position?.position?.latitude ??
    position?.latitude ??
    null;
  return value != null ? Number(value) : null;
}

function getLongitude(position) {
  const value =
    position?.gnssPosition?.longitude ??
    position?.position?.longitude ??
    position?.longitude ??
    null;
  return value != null ? Number(value) : null;
}

function getSpeed(position) {
  const value =
    position?.wheelBasedSpeed ??
    position?.speed ??
    position?.vehicleSpeed ??
    position?.snapshotData?.wheelBasedSpeed ??
    0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Historique de positions rFMS sur une plage (toutes les VIN).
// L'API renvoie ~100 positions par page avec moreDataAvailable : on pagine en
// avançant le curseur starttime jusqu'à épuisement (borné par maxPages).
// Renvoie { positions, truncated } — truncated=true si maxPages atteint alors
// qu'il restait des données (la plage n'est alors PAS complète).
async function fetchOptifleetPositions({ from, to, maxPages = 60 } = {}) {
  const stopIso = (to instanceof Date ? to : new Date(to)).toISOString();
  let cursorIso = (from instanceof Date ? from : new Date(from)).toISOString();

  const all = [];
  let lastBatchMaxTime = null;
  let truncated = false;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await wait(400); // espace les pages pour ménager le quota
    const endpoint = `/vehiclepositions?latestOnly=false&starttime=${encodeURIComponent(cursorIso)}&stoptime=${encodeURIComponent(stopIso)}`;

    // L'API Renault limite le débit (HTTP 429) : on réessaie avec une attente
    // croissante avant d'abandonner.
    let data;
    for (let attempt = 0; ; attempt++) {
      try {
        data = await fetchOptifleet(endpoint, ACCEPT_HEADERS.vehiclepositions);
        break;
      } catch (error) {
        if (attempt < 3 && /429/.test(error.message || '')) {
          await wait(4000 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }

    const positions =
      data?.vehiclePositionResponse?.vehiclePositions ||
      data?.vehiclePositions ||
      [];
    if (!positions.length) break;

    all.push(...positions);

    const more = data?.vehiclePositionResponse?.moreDataAvailable ?? data?.moreDataAvailable;
    if (!more) break;

    // maxPages atteint alors qu'il reste des données -> plage incomplète.
    if (page === maxPages - 1) { truncated = true; break; }

    // Curseur = position la plus récente reçue + 1 ms (évite de re-télécharger la même).
    const maxTime = positions.reduce((max, p) => {
      const t = new Date(p.receivedDateTime || p.createdDateTime || 0).getTime();
      return t > max ? t : max;
    }, 0);
    if (!maxTime || maxTime === lastBatchMaxTime) break; // garde-fou anti-boucle
    lastBatchMaxTime = maxTime;
    cursorIso = new Date(maxTime + 1).toISOString();
  }

  return { positions: all, truncated };
}

module.exports = { fetchOptifleetVehicles, fetchOptifleetPositions };
