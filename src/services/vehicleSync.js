// Synchronisation des véhicules fournisseurs vers la base Mongo.
//
// Pour chaque véhicule remonté par un fournisseur :
//  1. on tente de le retrouver par identifiant fournisseur (sources.providerId),
//  2. sinon par plaque normalisée,
//  3. si introuvable ET plaque FR valide -> création automatique (origin: 'auto'),
//  4. dans tous les cas on met à jour la "source" (provider + lastSeenAt).
//
// C'est ce qui réalise l'ajout automatique quand un camion est ajouté chez un fournisseur.

const Vehicle = require('../models/Vehicle');
const { normalizePlate, isValidFrenchPlate } = require('./providers/plate');

// Retrouve un véhicule existant, d'abord par source fournisseur puis par plaque.
async function findExistingVehicle(item) {
  if (item.providerId) {
    const bySource = await Vehicle.findOne({
      sources: { $elemMatch: { provider: item.provider, providerId: String(item.providerId) } }
    });
    if (bySource) return bySource;
  }

  const plate = normalizePlate(item.immatriculation || '');
  if (plate) {
    // Tolérant au format de stockage : avec tirets ("AA-123-BB") ou sans ("AA123BB").
    const byPlate = await Vehicle.findOne({
      immatriculation: { $in: [plate, plate.replace(/-/g, '')] }
    });
    if (byPlate) return byPlate;
  }

  return null;
}

// Insère/maj la source fournisseur sur un véhicule. Renvoie true si quelque chose a changé.
function upsertSource(vehicle, item) {
  const now = new Date();
  const providerId = item.providerId != null ? String(item.providerId) : null;

  let source = vehicle.sources.find(s => {
    if (providerId) return s.provider === item.provider && s.providerId === providerId;
    return s.provider === item.provider;
  });

  if (source) {
    source.providerName = item.name || source.providerName;
    source.lastSeenAt = now;
    if (providerId && !source.providerId) source.providerId = providerId;
    return true;
  }

  vehicle.sources.push({
    provider: item.provider,
    providerId,
    providerName: item.name || null,
    lastSeenAt: now
  });
  return true;
}

// Synchronise une liste de véhicules fournisseurs déjà normalisés.
// Renvoie un résumé { created, updated, skipped }.
async function syncProviderVehicles(items = []) {
  const summary = { created: [], updated: 0, skipped: 0 };

  for (const item of items) {
    try {
      const existing = await findExistingVehicle(item);

      if (existing) {
        upsertSource(existing, item);
        await existing.save();
        summary.updated += 1;
        continue;
      }

      // Pas de fiche : on ne crée que si la plaque est une vraie plaque FR,
      // pour éviter de polluer la base avec des libellés fournisseurs douteux.
      const plate = normalizePlate(item.immatriculation || '');
      if (!isValidFrenchPlate(plate)) {
        summary.skipped += 1;
        continue;
      }

      const created = await Vehicle.create({
        immatriculation: plate,
        marque: item.brand || 'À renseigner',
        modele: item.model || 'À renseigner',
        statut: 'actif',
        origin: 'auto',
        sources: [{
          provider: item.provider,
          providerId: item.providerId != null ? String(item.providerId) : null,
          providerName: item.name || null,
          lastSeenAt: new Date()
        }]
      });

      summary.created.push({ id: created._id, immatriculation: plate, provider: item.provider });
    } catch (error) {
      // Une collision de plaque (course condition) ou une validation ratée ne doit
      // pas interrompre la synchro des autres véhicules.
      console.error(`Sync véhicule ${item.immatriculation || item.providerId} échouée:`, error.message);
      summary.skipped += 1;
    }
  }

  return summary;
}

module.exports = { syncProviderVehicles };
