// Reconstruction de trajets à partir de l'historique de positions Optifleet (rFMS),
// qui ne fournit pas de notion de trajet. Découpage en deux temps :
//  1. trous de transmission (> GAP_MINUTES sans aucun point = moteur coupé) ;
//  2. ARRÊTS DÉTECTÉS PAR IMMOBILITÉ : les camions Renault continuent d'émettre
//     des positions moteur tournant, donc une journée entière peut arriver d'un
//     bloc. Si le camion reste dans un rayon de STOP_RADIUS_M pendant au moins
//     MIN_STOP_MINUTES (chargement, chantier, pause), on coupe le trajet là.
//     Un bouchon ne coupe pas : même au pas, on sort du rayon en quelques minutes.

const { isInOperatingZone } = require('./zone');

const GAP_MINUTES = 12;       // trou de temps qui sépare deux trajets
const MIN_DISTANCE_KM = 0.3;  // en-dessous : on ignore (bruit GPS / manœuvre)
const STOP_RADIUS_M = 180;    // rayon d'immobilité : on considère le camion "au même endroit"
const MIN_STOP_MINUTES = 6;   // immobilité minimale pour couper un trajet
const STOP_SPEED_KMH = 3;     // un arrêt commence sur un point quasi à l'arrêt (pas un point roulant)

function haversineKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1 + s2));
}

// Convertit une position rFMS en point simple {lat,lng,speed,t}.
function toPoint(p) {
  const g = p.gnssPosition || {};
  const lat = Number(g.latitude);
  const lng = Number(g.longitude);
  // Hors zone d'exploitation = glitch GPS (0,0, saut aberrant) : un seul point
  // corrompu ajouterait des milliers de km au trajet reconstruit.
  if (!isInOperatingZone(lat, lng)) return null;
  const t = new Date(g.positionDateTime || p.receivedDateTime || p.createdDateTime || 0).getTime();
  const speed = Number(p.wheelBasedSpeed ?? g.speed ?? 0);
  return { lat, lng, speed: Number.isFinite(speed) ? speed : 0, t };
}

// Découpe un segment continu en sous-trajets aux endroits où le camion est
// resté immobile (rayon STOP_RADIUS_M) pendant au moins MIN_STOP_MINUTES.
// Le sous-trajet précédent se termine au début de l'arrêt, le suivant démarre
// à la fin de l'arrêt (les points de l'arrêt lui-même ne polluent aucun tracé).
function splitSegmentAtStops(seg) {
  const subs = [];
  let start = 0;
  let i = 0;

  while (i < seg.length) {
    // Une fenêtre d'immobilité ne peut s'ancrer que sur un point quasi à l'arrêt :
    // sinon le dernier point roulant (arrivé au même endroit) gonfle la durée
    // mesurée et une simple pause au feu couperait le trajet.
    if (seg[i].speed > STOP_SPEED_KMH) { i++; continue; }

    // Étendre la fenêtre d'immobilité : tous les points restent autour de seg[i].
    let j = i;
    while (j + 1 < seg.length && haversineKm(seg[i], seg[j + 1]) * 1000 <= STOP_RADIUS_M) j++;

    const dwellMin = (seg[j].t - seg[i].t) / 60000;
    if (j > i && dwellMin >= MIN_STOP_MINUTES) {
      if (i > start) subs.push(seg.slice(start, i + 1)); // fin du sous-trajet à l'entrée de l'arrêt
      start = j;                                          // le suivant repart à la sortie de l'arrêt
      i = j + 1;
    } else {
      i++;
    }
  }

  if (seg.length - start >= 2) subs.push(seg.slice(start));
  return subs;
}

// Convertit une suite de points (déjà découpée) en objet trajet, ou null si trop court.
function buildTrip(points) {
  if (points.length < 2) return null;

  let distance = 0;
  let maxSpeed = 0;
  const path = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0) distance += haversineKm(points[i - 1], points[i]);
    if (points[i].speed > maxSpeed) maxSpeed = points[i].speed;
    path.push([points[i].lat, points[i].lng]);
  }
  if (distance < MIN_DISTANCE_KM) return null;

  const start = points[0];
  const end = points[points.length - 1];
  const durationMin = Math.round((end.t - start.t) / 60000);

  return {
    provider: 'optifleet',
    startAt: new Date(start.t),
    endAt: new Date(end.t),
    startAddress: '',
    startLat: start.lat,
    startLng: start.lng,
    endAddress: '',
    endLat: end.lat,
    endLng: end.lng,
    distanceKm: Math.round(distance * 100) / 100,
    durationMin,
    idleMin: null,
    avgSpeed: durationMin > 0 ? Math.round((distance / (durationMin / 60))) : null,
    maxSpeed: Math.round(maxSpeed),
    driverName: null,
    path,
    source: 'computed'
  };
}

// Reconstruit les trajets d'UN véhicule (positions déjà filtrées sur sa vin).
function reconstructTripsForVehicle(positions) {
  const points = positions.map(toPoint).filter(Boolean).sort((a, b) => a.t - b.t);
  if (points.length < 2) return [];

  // 1) Découpage en segments selon les trous de transmission.
  const segments = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const gapMin = (points[i].t - points[i - 1].t) / 60000;
    if (gapMin > GAP_MINUTES) {
      segments.push(current);
      current = [];
    }
    current.push(points[i]);
  }
  if (current.length) segments.push(current);

  // 2) Découpage de chaque segment aux arrêts (immobilité prolongée).
  const trips = [];
  for (const seg of segments) {
    if (seg.length < 2) continue;
    for (const sub of splitSegmentAtStops(seg)) {
      const trip = buildTrip(sub);
      if (trip) trips.push(trip);
    }
  }
  return trips;
}

// Groupe un lot de positions multi-VIN puis reconstruit par véhicule.
function reconstructTripsByVin(positions) {
  const byVin = new Map();
  positions.forEach(p => {
    if (!p.vin) return;
    if (!byVin.has(p.vin)) byVin.set(p.vin, []);
    byVin.get(p.vin).push(p);
  });

  const out = [];
  for (const [vin, list] of byVin) {
    reconstructTripsForVehicle(list).forEach(trip => {
      out.push({ ...trip, providerVehicleId: vin });
    });
  }
  return out;
}

module.exports = { reconstructTripsByVin, reconstructTripsForVehicle, haversineKm };
