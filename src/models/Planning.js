const mongoose = require('mongoose');

const tourSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['tour', 'regie'],
    required: true
  },
  statut: {
    type: String,
   enum: ['planifie', 'annule', 'chute', 'debord', 'passage_vide', 'effectue'],
    default: 'planifie'
  },
  client: {
    type: String,
    required: true
  },
  clientSource: {
    type: String,
    enum: ['mauffrey', 'manuel'],
    default: 'manuel'
  },
  immatCamion: {
    type: String,
    default: ''
  },
  heureDebut: { type: String, default: '' },
  heureFin:   { type: String, default: '' },
  refTransport: {
    type: String,
    default: null // référence Dashdoc si liée
  },
  dashdocId: {
    type: String,
    default: null // ID côté Dashdoc pour sync future
  },
  heurePeriode: {
    type: String,
    enum: ['journee', 'nuit'],
    default: 'journee'
  },
  source: { type: String, default: '' },
  destination: { type: String, default: '' },
  lieuChantier: { type: String, default: '' },
  notes: {
    type: String,
    default: ''
  },
  createdBy: {
    type: String, // username de la session
    required: true
  },
  updatedBy: {
    type: String, // username de la session
    required: true
  }
}, { timestamps: true });

const planningSchema = new mongoose.Schema({
  chauffeurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true
  },
  date: {
    type: String, // format "YYYY-MM-DD"
    required: true
  },
  tours: [tourSchema]
}, { timestamps: true });

// Index unique : un seul document par chauffeur par jour
planningSchema.index({ chauffeurId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Planning', planningSchema);
