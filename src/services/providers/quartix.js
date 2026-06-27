// Service fournisseur Quartix.
// Renvoie une liste normalisée de véhicules (sans filtrage sur la position).

const { normalizePlate } = require('./plate');

const QUARTIX_BASE_URL = process.env.QUARTIX_BASE_URL || 'https://qws.quartix.net/v2/api';

async function fetchQuartixVehicles() {
  const token = await getQuartixToken();

  const [quartixVehicles, livePositions] = await Promise.all([
    fetchQuartixList(token),
    fetchQuartixLive(token)
  ]);

  const vehiclesById = new Map(
    quartixVehicles.map(v => [String(v.VehicleID || v.VehicleId), v])
  );

  // On part des positions live, mais on retombe sur la liste véhicules pour
  // les engins qui n'ont pas encore de position remontée.
  const seenIds = new Set();
  const result = [];

  livePositions.forEach(pos => {
    const id = String(pos.VehicleID || pos.VehicleId);
    seenIds.add(id);
    const qVehicle = vehiclesById.get(id);
    const plate = normalizePlate(qVehicle?.RegistrationNumber || '');
    const lat = Number(pos.Latitude);
    const lng = Number(pos.Longitude);
    const hasPosition = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;

    result.push({
      provider: 'quartix',
      providerId: id,
      objectno: pos.VehicleID || pos.VehicleId,
      name: qVehicle?.Description || qVehicle?.VehicleInitials || plate || 'Véhicule Quartix',
      immatriculation: plate,
      brand: null,
      model: null,

      lat: hasPosition ? lat : null,
      lng: hasPosition ? lng : null,
      address: pos.LocationText || '',
      speed: Number(pos.Speed || 0),
      hasPosition,

      ignition: pos.LastEventDescription !== 'Ignition-Off',
      standstill: Number(pos.Speed || 0) === 0,

      course: pos.Heading || null,
      status: pos.LastEventDescription || null,
      posTime: pos.LastEventDateTime || pos.LastEventDatetime || null,
      msgTime: pos.LastEventDateTime || pos.LastEventDatetime || null,

      raw: { vehicle: qVehicle, live: pos }
    });
  });

  // Véhicules connus de Quartix mais absents du live (pas encore de position).
  quartixVehicles.forEach(qVehicle => {
    const id = String(qVehicle.VehicleID || qVehicle.VehicleId);
    if (seenIds.has(id)) return;
    const plate = normalizePlate(qVehicle.RegistrationNumber || '');

    result.push({
      provider: 'quartix',
      providerId: id,
      objectno: qVehicle.VehicleID || qVehicle.VehicleId,
      name: qVehicle.Description || qVehicle.VehicleInitials || plate || 'Véhicule Quartix',
      immatriculation: plate,
      brand: null,
      model: null,

      lat: null,
      lng: null,
      address: '',
      speed: 0,
      hasPosition: false,

      ignition: null,
      standstill: null,
      course: null,
      status: null,
      posTime: null,
      msgTime: null,

      raw: { vehicle: qVehicle, live: null }
    });
  });

  return result;
}

async function getQuartixToken() {
  const form = new URLSearchParams();
  form.append('CustomerID', process.env.QUARTIX_CUSTOMER_ID);
  form.append('UserName', process.env.QUARTIX_USERNAME);
  form.append('Password', process.env.QUARTIX_PASSWORD);
  form.append('Application', process.env.QUARTIX_APPLICATION || 'YOVATRANS');

  const response = await fetch(`${QUARTIX_BASE_URL}/auth`, { method: 'POST', body: form });
  const data = await response.json();

  if (!response.ok || !data?.Data?.AccessToken) {
    throw new Error(data?.Meta?.Message || 'Authentification Quartix impossible');
  }

  return data.Data.AccessToken;
}

async function fetchQuartixList(token) {
  const response = await fetch(`${QUARTIX_BASE_URL}/vehicles`, {
    headers: { AccessToken: token, Accept: 'application/json' }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.Meta?.Message || 'Erreur liste véhicules Quartix');
  }
  return data.Data || [];
}

async function fetchQuartixLive(token) {
  const response = await fetch(`${QUARTIX_BASE_URL}/vehicles/live`, {
    headers: { AccessToken: token, Accept: 'application/json' }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.Meta?.Message || 'Erreur live véhicules Quartix');
  }
  return data.Data || [];
}

// Trajets Quartix sur une plage de jours (startDay/endDay au format YYYY-MM-DD)
// ou les N plus récents (mostRecent). Le paramètre VehicleId n'est pas filtrant
// côté Quartix : on récupère toute la flotte puis on regroupe par VehicleID.
async function fetchQuartixTrips({ startDay, endDay, mostRecent } = {}) {
  const token = await getQuartixToken();

  const params = new URLSearchParams();
  if (mostRecent) {
    params.set('mostRecent', String(mostRecent));
  } else {
    params.set('startDay', startDay);
    params.set('endDay', endDay);
  }

  const response = await fetch(`${QUARTIX_BASE_URL}/vehicles/trips?${params.toString()}`, {
    headers: { AccessToken: token, Accept: 'application/json' }
  });
  const data = await response.json();

  if (!response.ok || data?.Meta?.Code >= 400) {
    throw new Error(data?.Meta?.Message || `Erreur trajets Quartix (${response.status})`);
  }
  return Array.isArray(data?.Data) ? data.Data : [];
}

module.exports = { fetchQuartixVehicles, fetchQuartixTrips };
