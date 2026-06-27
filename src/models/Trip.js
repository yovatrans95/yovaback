const mongoose = require('mongoose');

// Trajet/itinéraire normalisé, commun aux 3 fournisseurs (Webfleet, Quartix, Optifleet).
// Sert de cache permanent : on archive ici les trajets calculés par les fournisseurs
// (ou reconstruits pour Optifleet), pour garder un historique au-delà de leur rétention.
const tripSchema = new mongoose.Schema(
  {
    // Lien vers la fiche véhicule (peut être null si non encore rapproché).
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    immatriculation: { type: String, index: true },

    provider: { type: String, enum: ['webfleet', 'quartix', 'optifleet'], required: true },
    providerVehicleId: String,           // objectno (webfleet) / VehicleID (quartix) / vin (optifleet)
    providerTripId: String,              // identifiant trajet côté fournisseur si dispo (webfleet tripid)

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    startAddress: String,
    startLat: Number,
    startLng: Number,
    endAddress: String,
    endLat: Number,
    endLng: Number,

    distanceKm: Number,
    durationMin: Number,
    idleMin: Number,
    avgSpeed: Number,
    maxSpeed: Number,

    driverName: String,

    // Tracé optionnel (Webfleet via showTracks, Optifleet via positions reconstruites).
    // Quartix ne fournit pas les points -> tableau vide, tracé à reconstituer côté front.
    path: { type: [[Number]], default: [] }, // [[lat, lng], ...]

    // 'provider' = fourni par l'API ; 'computed' = reconstruit (Optifleet).
    source: { type: String, enum: ['provider', 'computed'], default: 'provider' },
    fetchedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Idempotence de l'archivage : un même trajet fournisseur ne doit pas être dupliqué.
// On déduplique par (provider, identifiant véhicule fournisseur, début de trajet).
tripSchema.index(
  { provider: 1, providerVehicleId: 1, startAt: 1 },
  { unique: true }
);
tripSchema.index({ vehicleId: 1, startAt: -1 });
tripSchema.index({ immatriculation: 1, startAt: -1 });

delete mongoose.models.Trip;
module.exports = mongoose.model('Trip', tripSchema);
