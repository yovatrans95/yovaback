const mongoose = require('mongoose');

// Marqueur de couverture : ce jour a été archivé avec succès pour ce fournisseur.
// Permet de détecter et combler automatiquement les jours manquants dans l'historique
// des trajets, au lieu de supposer que le cache est complet dès qu'il n'est pas vide.
const archiveDaySchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    day: { type: String, required: true }, // YYYY-MM-DD
    archivedAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

archiveDaySchema.index({ provider: 1, day: 1 }, { unique: true });

delete mongoose.models.ArchiveDay;
module.exports = mongoose.model('ArchiveDay', archiveDaySchema);
