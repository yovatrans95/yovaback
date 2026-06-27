// Service fournisseur Webfleet (Bridgestone / TomTom Telematics).
// Renvoie une liste normalisée de véhicules (sans filtrage sur la position).

const { normalizePlate, extractPlate } = require('./plate');

const WEBFLEET_URL = process.env.WEBFLEET_URL || 'https://csv.webfleet.com/extern';

async function fetchWebfleetVehicles() {
  assertWebfleetEnv();

  const webfleetVehicles = await fetchWebfleetObjects();

  return webfleetVehicles
    .filter(item => item && item.deleted !== true)
    .map(item => {
      const plate = extractPlate(item.objectname) || extractPlate(item.description) || null;
      const lat = toDecimalCoordinate(item.latitude_mdeg);
      const lng = toDecimalCoordinate(item.longitude_mdeg);
      const hasPosition = lat != null && lng != null;

      return {
        provider: 'webfleet',
        providerId: item.objectuid || item.objectno || null,
        objectno: item.objectno,
        objectuid: item.objectuid,
        name: item.objectname || item.objectno || 'Vehicule Webfleet',
        immatriculation: plate ? normalizePlate(plate) : null,
        brand: null,
        model: null,

        lat,
        lng,
        address: item.postext_short || item.postext || '',
        speed: Number(item.speed || 0),
        hasPosition,

        course: item.course || null,
        ignition: hasPosition ? Number(item.ignition) === 1 : null,
        standstill: hasPosition ? Number(item.standstill) === 1 : null,
        status: item.status || null,
        posTime: item.pos_time || item.msgtime || null,
        msgTime: item.msgtime || null,
        odometerKm: item.odometer_long ? Math.round(Number(item.odometer_long) / 100000) / 10 : null,

        raw: item
      };
    });
}

async function fetchWebfleetObjects() {
  const url = new URL(WEBFLEET_URL);
  url.searchParams.set('account', process.env.WEBFLEET_ACCOUNT);
  url.searchParams.set('apikey', process.env.WEBFLEET_APIKEY);
  url.searchParams.set('action', 'showObjectReportExtern');
  url.searchParams.set('outputformat', 'json');
  url.searchParams.set('lang', process.env.WEBFLEET_LANG || 'fr');

  const basicAuth = Buffer.from(
    `${process.env.WEBFLEET_USERNAME}:${process.env.WEBFLEET_PASSWORD}`
  ).toString('base64');

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${basicAuth}`, Accept: 'application/json' }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok || data?.errorCode) {
    const error = new Error(data?.errorMsg || text || 'Erreur Webfleet');
    error.statusCode = response.ok ? 400 : response.status;
    error.publicMessage = 'Webfleet a refusé la requête';
    error.publicError = data;
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

function assertWebfleetEnv() {
  const required = ['WEBFLEET_ACCOUNT', 'WEBFLEET_USERNAME', 'WEBFLEET_PASSWORD', 'WEBFLEET_APIKEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length) {
    const error = new Error(`Variables Webfleet manquantes: ${missing.join(', ')}`);
    error.statusCode = 500;
    error.publicMessage = 'Configuration Webfleet incomplète côté serveur';
    error.publicError = { missing };
    throw error;
  }
}

function toDecimalCoordinate(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number / 1000000;
}

// Construit l'URL d'une action Webfleet avec les paramètres communs.
function buildWebfleetUrl(action, extra = {}) {
  const url = new URL(WEBFLEET_URL);
  url.searchParams.set('account', process.env.WEBFLEET_ACCOUNT);
  url.searchParams.set('apikey', process.env.WEBFLEET_APIKEY);
  url.searchParams.set('action', action);
  url.searchParams.set('outputformat', 'json');
  url.searchParams.set('lang', process.env.WEBFLEET_LANG || 'fr');
  Object.entries(extra).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  return url;
}

async function webfleetRequest(url) {
  assertWebfleetEnv();
  const basicAuth = Buffer.from(
    `${process.env.WEBFLEET_USERNAME}:${process.env.WEBFLEET_PASSWORD}`
  ).toString('base64');

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${basicAuth}`, Accept: 'application/json' }
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!response.ok || data?.errorCode) {
    throw new Error(data?.errorMsg || `Erreur Webfleet (${response.status})`);
  }
  return Array.isArray(data) ? data : [];
}

// Format de date attendu par Webfleet pour les plages personnalisées.
// Avec lang=fr, l'API parse les dates au format français DD/MM/YYYY HH:mm:ss
// (testé en réel : le format ISO est rejeté avec "date range is unparsable").
function webfleetDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Construit les paramètres de plage : motif relatif (d-1, d0...) ou plage personnalisée.
function rangeParams({ rangePattern, from, to }) {
  if (from && to) {
    return { range_pattern: 'ud', rangefrom_string: webfleetDate(from), rangeto_string: webfleetDate(to) };
  }
  return { range_pattern: rangePattern || 'd-1' };
}

// Trajets calculés par Webfleet. Sans objectno = toute la flotte (plage ≤ 1 mois).
async function fetchWebfleetTrips({ rangePattern, from, to, objectno } = {}) {
  const url = buildWebfleetUrl('showTripReportExtern', { ...rangeParams({ rangePattern, from, to }), objectno });
  return webfleetRequest(url);
}

// Points de tracé (positions) pour un objet sur une plage.
async function fetchWebfleetTracks({ objectno, rangePattern, from, to } = {}) {
  const url = buildWebfleetUrl('showTracks', { ...rangeParams({ rangePattern, from, to }), objectno });
  return webfleetRequest(url);
}

module.exports = { fetchWebfleetVehicles, fetchWebfleetTrips, fetchWebfleetTracks };
