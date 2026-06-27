// Orchestration de l'historique de trajets, avec SUIVI DE COUVERTURE.
//
// Principe : chaque (fournisseur, jour) archivé avec succès est marqué dans
// ArchiveDay. À chaque lecture, on détecte les jours manquants de la plage
// demandée et on ne va chercher QUE ceux-là chez les fournisseurs. Le jour
// courant n'est jamais marqué (il se remplit encore) : il est re-synchronisé
// au plus toutes les 10 minutes.
//
// - getTripsForVehicle  : lecture + complétion automatique des trous.
// - archiveTripsForRange: re-fetch forcé d'une plage entière (bouton Rafraîchir, cron).

const Vehicle = require('../../models/Vehicle');
const Trip = require('../../models/Trip');
const ArchiveDay = require('../../models/ArchiveDay');
const { normalizePlate } = require('../providers/plate');
const { fetchWebfleetTrips } = require('../providers/webfleet');
const { fetchQuartixTrips } = require('../providers/quartix');
const { fetchOptifleetPositions } = require('../providers/optifleet');
const { normalizeWebfleetTrip, normalizeQuartixTrip } = require('./normalize');
const { reconstructTripsByVin } = require('./reconstruct');
const { geocodeTripEndpoints } = require('./geocode');

const PROVIDERS = ['webfleet', 'quartix', 'optifleet'];
const DAY_MS = 24 * 3600 * 1000;
const TODAY_REFRESH_MS = 10 * 60_000; // re-synchro du jour courant au plus toutes les 10 min

// Throttle en mémoire du jour courant : "provider:YYYY-MM-DD" -> timestamp.
const recentTodayFetches = new Map();

function dayString(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Liste des débuts de journée couverts par [from, to].
function daysInRange(from, to) {
  const out = [];
  for (let d = startOfDay(from); d <= to; d = new Date(d.getTime() + DAY_MS)) out.push(d);
  return out;
}

// Regroupe des jours (Date triées) en plages contiguës [{from, to}].
function groupContiguousDays(days) {
  const ranges = [];
  let current = null;
  days.forEach(d => {
    if (current && d.getTime() - current.lastDay.getTime() === DAY_MS) {
      current.lastDay = d;
    } else {
      current = { firstDay: d, lastDay: d };
      ranges.push(current);
    }
  });
  return ranges.map(r => ({ from: r.firstDay, to: endOfDay(r.lastDay), days: daysInRange(r.firstDay, r.lastDay) }));
}

// ----------------------------- RAPPROCHEMENT VÉHICULES -----------------------------

async function buildVehicleIndex() {
  const vehicles = await Vehicle.find({}).select('_id immatriculation sources').lean();

  const bySource = new Map();
  const byPlate = new Map();

  vehicles.forEach(v => {
    if (v.immatriculation) byPlate.set(normalizePlate(v.immatriculation), v);
    (v.sources || []).forEach(s => {
      if (s.provider && s.providerId) bySource.set(`${s.provider}:${s.providerId}`, v);
    });
  });

  return { bySource, byPlate };
}

function matchVehicle(trip, index) {
  if (trip.providerVehicleId) {
    const v = index.bySource.get(`${trip.provider}:${trip.providerVehicleId}`);
    if (v) return v;
  }
  if (trip.immatriculation) {
    const v = index.byPlate.get(normalizePlate(trip.immatriculation));
    if (v) return v;
  }
  return null;
}

// Upsert idempotent d'une liste de trajets normalisés. Renvoie le nb traité.
async function upsertTrips(trips) {
  if (!trips.length) return 0;
  const index = await buildVehicleIndex();

  let upserted = 0;
  for (const trip of trips) {
    // Adresse lisible pour les trajets qui n'ont que des coordonnées (Optifleet).
    // Mis en cache par site : les rotations re-géocodent rarement.
    await geocodeTripEndpoints(trip);

    const vehicle = matchVehicle(trip, index);
    const doc = {
      ...trip,
      vehicleId: vehicle?._id || null,
      immatriculation: trip.immatriculation || vehicle?.immatriculation || null,
      fetchedAt: new Date()
    };

    try {
      await Trip.updateOne(
        { provider: doc.provider, providerVehicleId: doc.providerVehicleId, startAt: doc.startAt },
        { $set: doc },
        { upsert: true }
      );
      upserted += 1;
    } catch (e) {
      if (e.code !== 11000) console.error('Upsert trajet échoué:', e.message);
    }
  }
  return upserted;
}

// ----------------------------- FETCH PAR FOURNISSEUR -----------------------------

// Webfleet refuse les plages > 1 mois sans objectno : on découpe par sécurité.
const MAX_CHUNK_DAYS = 27;

function chunkRange(from, to, maxDays = MAX_CHUNK_DAYS) {
  const chunks = [];
  let cursor = new Date(from);
  while (cursor < to) {
    const end = new Date(Math.min(cursor.getTime() + maxDays * DAY_MS, to.getTime()));
    chunks.push({ from: new Date(cursor), to: end });
    cursor = new Date(end.getTime() + 1);
  }
  return chunks;
}

// Récupère et normalise les trajets d'UN fournisseur sur [from, to].
// Renvoie { trips, complete } — complete=false si une partie a été tronquée.
async function fetchProviderTrips(provider, from, to) {
  if (provider === 'webfleet') {
    const trips = [];
    for (const chunk of chunkRange(from, to)) {
      const rows = await fetchWebfleetTrips({ from: chunk.from, to: chunk.to });
      trips.push(...rows.map(normalizeWebfleetTrip).filter(Boolean));
    }
    return { trips, complete: true };
  }

  if (provider === 'quartix') {
    const trips = [];
    for (const chunk of chunkRange(from, to)) {
      const rows = await fetchQuartixTrips({ startDay: dayString(chunk.from), endDay: dayString(chunk.to) });
      trips.push(...rows.map(normalizeQuartixTrip).filter(Boolean));
    }
    return { trips, complete: true };
  }

  // Optifleet : positions paginées, récupérées jour par jour pour rester sous
  // le plafond de pages, puis reconstruction des trajets sur l'ensemble
  // (un trajet à cheval sur minuit reste entier).
  const allPositions = [];
  let complete = true;
  for (const day of daysInRange(from, to)) {
    const chunkFrom = day < from ? from : day;
    const chunkTo = new Date(Math.min(endOfDay(day).getTime(), to.getTime()));
    const { positions, truncated } = await fetchOptifleetPositions({ from: chunkFrom, to: chunkTo });
    allPositions.push(...positions);
    if (truncated) complete = false;
  }
  return { trips: reconstructTripsByVin(allPositions), complete };
}

// Marque comme couverts les jours entièrement passés ET entièrement inclus dans la plage.
async function markCoveredDays(provider, from, to, complete) {
  if (!complete) return;
  const todayStart = startOfDay(new Date());
  for (const day of daysInRange(from, to)) {
    if (day >= todayStart) continue;                       // jour courant/futur : jamais marqué
    if (endOfDay(day).getTime() > to.getTime()) continue;  // jour partiellement couvert
    if (day.getTime() < startOfDay(from).getTime()) continue;
    await ArchiveDay.updateOne(
      { provider, day: dayString(day) },
      { $set: { archivedAt: new Date() } },
      { upsert: true }
    ).catch(() => {});
  }
}

// ----------------------------- COUVERTURE -----------------------------

// Sérialise les complétions de couverture pour éviter les doubles fetchs
// concurrents (et le rate-limit Optifleet qui va avec).
let coverageChain = Promise.resolve();

function ensureCoverage(range) {
  const run = () => doEnsureCoverage(range).catch(e => {
    console.error('ensureCoverage échouée:', e.message);
    return { errors: { global: e.message } };
  });
  coverageChain = coverageChain.then(run, run);
  return coverageChain;
}

async function doEnsureCoverage({ from, to }) {
  const errors = {};
  const fetched = [];
  const now = new Date();
  const todayStart = startOfDay(now);
  const effectiveTo = to > now ? now : to;

  for (const provider of PROVIDERS) {
    try {
      // 1) Jours passés manquants.
      const pastDays = daysInRange(from, effectiveTo).filter(d => d < todayStart);
      const pastKeys = pastDays.map(dayString);
      const covered = new Set(
        (await ArchiveDay.find({ provider, day: { $in: pastKeys } }).select('day').lean()).map(x => x.day)
      );
      const missing = pastDays.filter(d => !covered.has(dayString(d)));

      for (const range of groupContiguousDays(missing)) {
        const { trips, complete } = await fetchProviderTrips(provider, range.from, range.to);
        await upsertTrips(trips);
        await markCoveredDays(provider, range.from, range.to, complete);
        fetched.push(`${provider}:${dayString(range.from)}→${dayString(range.to)} (${trips.length})`);
      }

      // 2) Jour courant (jamais "couvert") : re-synchro throttlée.
      if (effectiveTo >= todayStart) {
        const key = `${provider}:${dayString(todayStart)}`;
        const last = recentTodayFetches.get(key) || 0;
        if (Date.now() - last > TODAY_REFRESH_MS) {
          recentTodayFetches.set(key, Date.now());
          const dayFrom = from > todayStart ? from : todayStart;
          const { trips } = await fetchProviderTrips(provider, dayFrom, effectiveTo);
          await upsertTrips(trips);
          fetched.push(`${provider}:aujourd'hui (${trips.length})`);
        }
      }
    } catch (e) {
      errors[provider] = e.message;
      console.error(`❌ couverture ${provider}:`, e.message);
    }
  }

  return { errors, fetched };
}

// ----------------------------- API PUBLIQUE -----------------------------

// Re-fetch FORCÉ de toute la plage chez les 3 fournisseurs (Rafraîchir + cron).
async function archiveTripsForRange({ from, to }) {
  const errors = {};
  let found = 0;
  let upserted = 0;

  for (const provider of PROVIDERS) {
    try {
      const { trips, complete } = await fetchProviderTrips(provider, from, to);
      found += trips.length;
      upserted += await upsertTrips(trips);
      await markCoveredDays(provider, from, to, complete);
    } catch (e) {
      errors[provider] = e.message;
      console.error(`❌ trajets ${provider}:`, e.message);
    }
  }

  return { providerErrors: errors, found, upserted };
}

// Lit les trajets d'un véhicule, en complétant d'abord les jours manquants.
async function getTripsForVehicle(vehicleId, { from, to, refresh = false } = {}) {
  const vehicle = await Vehicle.findById(vehicleId).select('_id immatriculation').lean();
  if (!vehicle) return null;

  let coverage = { errors: {} };
  if (refresh) {
    const result = await archiveTripsForRange({ from, to });
    coverage = { errors: result.providerErrors };
  } else {
    coverage = await ensureCoverage({ from, to });
  }

  const query = {
    startAt: { $gte: from, $lte: to },
    $or: [{ vehicleId: vehicle._id }]
  };
  if (vehicle.immatriculation) {
    query.$or.push({ immatriculation: normalizePlate(vehicle.immatriculation) });
    query.$or.push({ immatriculation: vehicle.immatriculation });
  }

  const trips = await Trip.find(query).sort({ startAt: -1 }).lean();
  return { trips, providerErrors: coverage.errors || {} };
}

module.exports = { archiveTripsForRange, getTripsForVehicle, ensureCoverage };
