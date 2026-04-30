const mongoose = require('mongoose');

const uploadedFileSchema = new mongoose.Schema(
  {
    originalName: String,
    filename: String,
    path: String,
    mimeType: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);
const vehicleDocumentSchema = new mongoose.Schema(
  {
    label: String,
    category: String,
    file: uploadedFileSchema,
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const vehicleSchema = new mongoose.Schema(
  {
    immatriculation: { type: String, required: true, trim: true, uppercase: true },
    marque: { type: String, required: true, trim: true },
    modele: { type: String, required: true, trim: true },
    type_vehicule: String,
    annee: Number,
    energie: String,
    couleur: String,
    vin: String,
    kilometrage: Number,
    nombre_places: Number,
    charge_utile: String,
    date_mise_en_circulation: Date,

    statut: {
      type: String,
      enum: ['actif', 'maintenance', 'hors_service'],
      default: 'actif'
    },

    mode_possession: {
      type: String,
      enum: ['propre', 'loue'],
      default: 'propre'
    },

    observations: String,

    carte_grise_numero: String,
    carte_grise_date_emission: Date,
    carte_grise_titulaire: String,
    carte_grise_date_mise_circulation: Date,
  

    contrat_location_reference: String,
    contrat_location_bailleur: String,
    contrat_location_date_debut: Date,
    contrat_location_date_fin: Date,
    contrat_location_montant: String,


    controle_technique_centre: String,
    controle_technique_date_controle: Date,
    controle_technique_expiration: Date,


    assurance_compagnie: String,
    assurance_numero_police: String,
    assurance_date_debut: Date,
    assurance_expiration: Date,


    licence_transport_numero: String,
    licence_transport_autorite: String,
    licence_transport_delivrance: Date,
    licence_transport_expiration: Date,


    recepisse_transport_numero: String,
    recepisse_transport_autorite: String,
    recepisse_transport_delivrance: Date,
    recepisse_transport_expiration: Date,


    chronotachygraphe_marque: String,
    chronotachygraphe_numero: String,
    chronotachygraphe_etalonnage: Date,
    chronotachygraphe_expiration: Date,
   

    limiteur_marque: String,
    limiteur_numero: String,
    limiteur_verification: Date,
    limiteur_expiration: Date,

   
 documents: [vehicleDocumentSchema],
  },
  { timestamps: true }
);


vehicleSchema.index({ immatriculation: 1 }, { unique: true });
vehicleSchema.index({ statut: 1 });
vehicleSchema.index({ mode_possession: 1 });
vehicleSchema.index({ assurance_expiration: 1 });
vehicleSchema.index({ controle_technique_expiration: 1 });


delete mongoose.models.Vehicle;
module.exports = mongoose.model('Vehicle', vehicleSchema);