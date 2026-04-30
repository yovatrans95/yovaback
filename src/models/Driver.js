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

const driverDocumentSchema = new mongoose.Schema(
  {
    type: String,
    numero: String,
    delivreLe: Date,
    expireLe: Date,
    obtenuLe: Date,
    iban: String,
    bic: String,
    titulaire: String,
    file: uploadedFileSchema
  },
  { _id: false }
);

const generalDocumentSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    category: { type: String, default: 'general' },
    file: uploadedFileSchema
  },
  { timestamps: true }
);

const driverSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    user_email: {
      type: String,
      trim: true,
      lowercase: true
    },
    nom: { type: String, required: true, trim: true },
    prenom: { type: String, required: true, trim: true },
    ddn: Date,
    lieu_naissance: String,
    nationalite: String,
    genre: String,
    situation: String,
    enfants: { type: Number, default: 0 },
    adresse: String,
    telephone: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true },
    photo: uploadedFileSchema,

    permis_numero: String,
    permis_categorie: String,
    permis_obtention: Date,
    permis_expiration: Date,
    permis_pays: String,
    statut: {
      type: String,
      enum: ['actif', 'inactif', 'en_conge'],
      default: 'actif'
    },

    urgence_nom: String,
    urgence_prenom: String,
    urgence_lien: String,
    urgence_tel: String,

    id_type: String,
    id_num: String,
    id_deliv: Date,
    id_exp: Date,
    cc_num: String,
    cc_exp: Date,
    fimo_type: String,
    fimo_num: String,
    fimo_obt: Date,
    fimo_exp: Date,
    ss_num: String,
    rib_iban: String,
    rib_bic: String,
    rib_titulaire: String,
    btp_num: String,
    btp_deliv: Date,
    btp_exp: Date,

    officialDocs: {
      cni: driverDocumentSchema,
      cc: driverDocumentSchema,
      fimo: driverDocumentSchema,
      vitale: driverDocumentSchema,
      rib: driverDocumentSchema,
      btp: driverDocumentSchema
    },

    documents: [generalDocumentSchema]
  },
  { timestamps: true }
);

driverSchema.index({ nom: 1, prenom: 1 });
driverSchema.index({ email: 1 });
driverSchema.index({ statut: 1 });
driverSchema.index({ permis_categorie: 1 });
driverSchema.index({ permis_expiration: 1 });

driverSchema.virtual('displayName').get(function displayName() {
  return `${this.nom || ''} ${this.prenom || ''}`.trim();
});

module.exports = mongoose.model('Driver', driverSchema);
