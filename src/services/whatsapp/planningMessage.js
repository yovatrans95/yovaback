// Mise en forme d'un document Planning en message WhatsApp lisible.

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

// "2026-07-16" -> "jeudi 16 juillet 2026"
function formatDateFr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${JOURS[date.getUTCDay()]} ${d} ${MOIS[m - 1]} ${y}`;
}

// Certains champs importés (Mauffrey) contiennent des balises HTML résiduelles.
function clean(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatHoraire(tour) {
  if (tour.heureDebut && tour.heureFin) return `${tour.heureDebut} → ${tour.heureFin}`;
  if (tour.heureDebut) return `à partir de ${tour.heureDebut}`;
  return tour.heurePeriode === 'nuit' ? 'de nuit' : '';
}

function formatTour(tour, index) {
  const lines = [];
  const horaire = formatHoraire(tour);
  const titre = tour.type === 'regie' ? 'Régie' : 'Tour';
  lines.push(`*${index}. ${titre} — ${clean(tour.client)}*${horaire ? ` (${horaire})` : ''}`);

  if (tour.immatCamion) lines.push(`🚚 Camion : ${clean(tour.immatCamion)}`);

  if (tour.type === 'regie') {
    if (tour.lieuChantier) lines.push(`🏗️ Chantier : ${clean(tour.lieuChantier)}`);
    (tour.regieTours || []).forEach((rt, i) => {
      if (rt.chargement || rt.dechargement) {
        lines.push(`   ${i + 1}) ${clean(rt.chargement) || '?'} → ${clean(rt.dechargement) || '?'}`);
      }
    });
  } else {
    if (tour.source) lines.push(`📍 Départ : ${clean(tour.source)}`);
    if (tour.destination) lines.push(`🏁 Arrivée : ${clean(tour.destination)}`);
  }

  // Les notes peuvent être multi-lignes (ref, marchandise, tracteur…) : on
  // nettoie chaque ligne mais on garde les retours à la ligne.
  const notes = String(tour.notes || '')
    .split('\n')
    .map((l) => clean(l))
    .filter(Boolean);
  if (notes.length > 0) lines.push(`📝 ${notes.join('\n')}`);
  return lines.join('\n');
}

// Construit le message complet pour un chauffeur. Retourne null si aucun
// tour à annoncer (tous annulés, par exemple).
// options.priseDePoste : heure de prise de poste ("06:30") affichée en tête.
function buildPlanningMessage(driver, planning, options = {}) {
  const tours = (planning.tours || []).filter((t) => t.statut !== 'annule');
  if (tours.length === 0) return null;

  const parts = [
    `🚛 *Planning — ${formatDateFr(planning.date)}*`,
    `Bonjour ${driver.prenom || driver.nom},`
  ];
  if (options.priseDePoste) {
    parts.push(`🕐 *Prise de poste : ${options.priseDePoste}*`);
  }
  parts.push(tours.map((t, i) => formatTour(t, i + 1)).join('\n\n'));
  parts.push('Bonne route ! 🙏');
  return parts.join('\n\n');
}

module.exports = { buildPlanningMessage, formatDateFr };
