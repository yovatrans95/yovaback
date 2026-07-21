// Normalisation des trajets fournisseurs vers la forme commune du modèle Trip.

const { normalizePlate, extractPlate } = require('../providers/plate');
const { isInOperatingZone } = require('./zone');

// Webfleet renvoie les dates en "DD/MM/YYYY HH:mm:ss" (heure locale du compte).
function parseWebfleetDate(value) {
  const m = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, MM, yyyy, hh, mm, ss] = m;
  return new Date(Number(yyyy), Number(MM) - 1, Number(dd), Number(hh), Number(mm), Number(ss));
}

const microDeg = v => (v == null || v === '' ? null : Number(v) / 1e6);
const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// Neutralise les extrémités hors zone d'exploitation (glitch GPS fournisseur :
// 0,0 ou coordonnées corrompues). Le trajet est conservé — distance, durée et
// adresse fournisseur restent valables — mais on ne stocke pas de point faux
// qui fausserait la carte et le géocodage.
function sanitizeTripCoords(trip) {
  if (trip.startLat != null && !isInOperatingZone(trip.startLat, trip.startLng)) {
    trip.startLat = null;
    trip.startLng = null;
  }
  if (trip.endLat != null && !isInOperatingZone(trip.endLat, trip.endLng)) {
    trip.endLat = null;
    trip.endLng = null;
  }
  return trip;
}

// Webfleet : distance en mètres, durée/ralenti en secondes, coords en microdegrés.
function normalizeWebfleetTrip(t) {
  const startAt = parseWebfleetDate(t.start_time);
  const endAt = parseWebfleetDate(t.end_time);
  if (!startAt || !endAt) return null;

  const plate = extractPlate(t.objectname) || null;

  return sanitizeTripCoords({
    provider: 'webfleet',
    providerVehicleId: t.objectno != null ? String(t.objectno) : null,
    providerTripId: t.tripid != null ? String(t.tripid) : null,
    immatriculation: plate,
    startAt,
    endAt,
    startAddress: t.start_postext || '',
    startLat: microDeg(t.start_latitude),
    startLng: microDeg(t.start_longitude),
    endAddress: t.end_postext || '',
    endLat: microDeg(t.end_latitude),
    endLng: microDeg(t.end_longitude),
    distanceKm: t.distance != null ? Number(t.distance) / 1000 : null,
    durationMin: t.duration != null ? Math.round(Number(t.duration) / 60) : null,
    idleMin: t.idle_time != null ? Math.round(Number(t.idle_time) / 60) : null,
    avgSpeed: num(t.avg_speed),
    maxSpeed: num(t.max_speed),
    driverName: t.drivername || null,
    path: [],
    source: 'provider'
  });
}

// Quartix : distance en km, TravelTime/IdlingTime en JOURS, coords décimales.
function normalizeQuartixTrip(t) {
  const startAt = t.StartDateTime ? new Date(t.StartDateTime) : null;
  const endAt = t.EndDateTime ? new Date(t.EndDateTime) : null;
  if (!startAt || !endAt) return null;

  return sanitizeTripCoords({
    provider: 'quartix',
    providerVehicleId: t.VehicleID != null ? String(t.VehicleID) : null,
    providerTripId: null,
    immatriculation: null, // résolu via la fiche véhicule (par VehicleID)
    startAt,
    endAt,
    startAddress: t.StartLocation || '',
    startLat: num(t.StartLat),
    startLng: num(t.StartLong),
    endAddress: t.EndLocation || '',
    endLat: num(t.EndLat),
    endLng: num(t.EndLong),
    distanceKm: num(t.Distance),
    durationMin: t.TravelTime != null ? Math.round(Number(t.TravelTime) * 1440) : null,
    idleMin: t.IdlingTime != null ? Math.round(Number(t.IdlingTime) * 1440) : null,
    avgSpeed: num(t.AvgSpeed),
    maxSpeed: num(t.MaxSpeed),
    driverName: t.DriverID ? String(t.DriverID) : null,
    path: [],
    source: 'provider'
  });
}

module.exports = {
  parseWebfleetDate,
  normalizeWebfleetTrip,
  normalizeQuartixTrip,
  microDeg,
  normalizePlate
};
