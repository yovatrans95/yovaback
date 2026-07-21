// Zone d'exploitation de la flotte : centre-nord de la France.
// La flotte ne sort pas de cette zone : toute coordonnée en dehors est un
// glitch GPS (point à 0,0, saut aberrant, coordonnées corrompues) et doit
// être ignorée plutôt que d'entrer dans les trajets, les distances ou le
// géocodage.
//
// La boîte est volontairement GÉNÉREUSE (Nantes/Lyon/Strasbourg/Lille inclus,
// avec marge) : elle ne sert qu'à éliminer l'aberrant, pas à contraindre
// l'activité. Si l'exploitation s'étend un jour, élargir ici suffit.

const OPERATING_ZONE = {
  latMin: 45.0,  // ~ Lyon / Clermont, avec marge sud
  latMax: 51.5,  // ~ frontière belge, avec marge
  lngMin: -3.0,  // ~ Bretagne est / Nantes, avec marge ouest
  lngMax: 8.5    // ~ Alsace / frontière allemande, avec marge
};

function isInOperatingZone(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= OPERATING_ZONE.latMin && lat <= OPERATING_ZONE.latMax &&
    lng >= OPERATING_ZONE.lngMin && lng <= OPERATING_ZONE.lngMax
  );
}

module.exports = { OPERATING_ZONE, isInOperatingZone };
