// Normalisation des plaques d'immatriculation, partagée par tous les fournisseurs.
// Une plaque FR au format SIV "AA-123-BB" est renvoyée normalisée ;
// sinon on renvoie la version nettoyée (majuscules, sans séparateurs).

function normalizePlate(value = '') {
  const clean = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : clean;
}

// Vrai uniquement pour une plaque FR au format SIV (AA-123-BB).
// Sert de garde-fou avant de créer un véhicule automatiquement.
function isValidFrenchPlate(value = '') {
  const clean = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(clean);
}

// Tente d'extraire une plaque depuis un texte libre (nom d'objet Webfleet, description...).
function extractPlate(value = '') {
  const match = String(value || '').toUpperCase().match(/[A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2}/);
  return match ? normalizePlate(match[0]) : null;
}

module.exports = { normalizePlate, isValidFrenchPlate, extractPlate };
