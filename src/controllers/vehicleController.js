const Vehicle = require('../models/Vehicle');

function toDate(value) {
  return value ? new Date(value) : undefined;
}

function buildFile(file) {
  return {
    originalName: file.originalname,
    filename: file.key,
    path: `/api/files/${file.key}`,
    mimeType: file.mimetype,
    size: file.size ,
    r2Key: file.key
};
}

function mapVehiclePayload(body) {
  return {
    immatriculation: body.immatriculation,
    marque: body.marque,
    modele: body.modele,
    type_vehicule: body.type_vehicule,
    annee: body.annee || undefined,
    energie: body.energie,
    couleur: body.couleur,
    vin: body.vin,
    kilometrage: body.kilometrage || undefined,
    nombre_places: body.nombre_places || undefined,
    charge_utile: body.charge_utile,
    date_mise_en_circulation: toDate(body.date_mise_en_circulation),

    statut: body.statut || 'actif',
    mode_possession: body.mode_possession || 'propre',
    observations: body.observations,

    carte_grise_numero: body.carte_grise_numero,
    carte_grise_date_emission: toDate(body.carte_grise_date_emission),
    carte_grise_titulaire: body.carte_grise_titulaire,
    carte_grise_date_mise_circulation: toDate(body.carte_grise_date_mise_circulation),

    contrat_location_reference: body.contrat_location_reference,
    contrat_location_bailleur: body.contrat_location_bailleur,
    contrat_location_date_debut: toDate(body.contrat_location_date_debut),
    contrat_location_date_fin: toDate(body.contrat_location_date_fin),
    contrat_location_montant: body.contrat_location_montant,

    controle_technique_centre: body.controle_technique_centre,
    controle_technique_date_controle: toDate(body.controle_technique_date_controle),
    controle_technique_expiration: toDate(body.controle_technique_expiration),

    assurance_compagnie: body.assurance_compagnie,
    assurance_numero_police: body.assurance_numero_police,
    assurance_date_debut: toDate(body.assurance_date_debut),
    assurance_expiration: toDate(body.assurance_expiration),

    licence_transport_numero: body.licence_transport_numero,
    licence_transport_autorite: body.licence_transport_autorite,
    licence_transport_delivrance: toDate(body.licence_transport_delivrance),
    licence_transport_expiration: toDate(body.licence_transport_expiration),

    recepisse_transport_numero: body.recepisse_transport_numero,
    recepisse_transport_autorite: body.recepisse_transport_autorite,
    recepisse_transport_delivrance: toDate(body.recepisse_transport_delivrance),
    recepisse_transport_expiration: toDate(body.recepisse_transport_expiration),

    chronotachygraphe_marque: body.chronotachygraphe_marque,
    chronotachygraphe_numero: body.chronotachygraphe_numero,
    chronotachygraphe_etalonnage: toDate(body.chronotachygraphe_etalonnage),
    chronotachygraphe_expiration: toDate(body.chronotachygraphe_expiration),

    limiteur_marque: body.limiteur_marque,
    limiteur_numero: body.limiteur_numero,
    limiteur_verification: toDate(body.limiteur_verification),
    limiteur_expiration: toDate(body.limiteur_expiration)
  };
}

function attachFiles(vehicle, files = {}) {
  Object.entries(files).forEach(([fieldName, fileArray]) => {
    const file = fileArray?.[0];
    if (file) vehicle[fieldName] = buildFile(file);
  });
}

async function listVehicles(req, res) {
  const { q, statut, possession, sort = 'immatriculation', order = 'asc' } = req.query;
  const filter = {};

  if (statut) filter.statut = statut;
  if (possession) filter.mode_possession = possession;

  if (q) {
    filter.$or = [
      { immatriculation: { $regex: q, $options: 'i' } },
      { marque: { $regex: q, $options: 'i' } },
      { modele: { $regex: q, $options: 'i' } },
      { type_vehicule: { $regex: q, $options: 'i' } },
      { vin: { $regex: q, $options: 'i' } }
    ];
  }

  const sortValue = order === 'desc' ? -1 : 1;
  const vehicles = await Vehicle.find(filter).sort({ [sort]: sortValue });

  res.json(vehicles);
}

async function getVehicle(req, res) {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
  res.json(vehicle);
}

async function createVehicle(req, res) {
  const payload = mapVehiclePayload(req.body);

  if (!payload.immatriculation || !payload.marque || !payload.modele) {
    return res.status(400).json({ message: 'immatriculation, marque and modele are required' });
  }

  const exists = await Vehicle.findOne({ immatriculation: payload.immatriculation.toUpperCase() });
  if (exists) {
    return res.status(409).json({ message: 'Un véhicule existe déjà avec cette immatriculation' });
  }

  const vehicle = await Vehicle.create(payload);
  attachFiles(vehicle, req.files);

  await vehicle.save();
  res.status(201).json(vehicle);
}

async function updateVehicle(req, res) {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

  Object.assign(vehicle, mapVehiclePayload(req.body));
  attachFiles(vehicle, req.files);

  await vehicle.save();
  res.json(vehicle);
}

async function deleteVehicle(req, res) {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

  await vehicle.deleteOne();
  res.json({ message: 'Vehicle deleted' });
}

async function getVehicleStats(req, res) {
  const now = new Date();
  const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  const alertFilter = {
    $or: [
      { contrat_location_date_fin: { $lte: in60Days } },
      { controle_technique_expiration: { $lte: in60Days } },
      { assurance_expiration: { $lte: in60Days } },
      { licence_transport_expiration: { $lte: in60Days } },
      { recepisse_transport_expiration: { $lte: in60Days } },
      { chronotachygraphe_expiration: { $lte: in60Days } },
      { limiteur_expiration: { $lte: in60Days } }
    ]
  };

  const [total, actifs, maintenance, horsService, loues, alertes] = await Promise.all([
    Vehicle.countDocuments(),
    Vehicle.countDocuments({ statut: 'actif' }),
    Vehicle.countDocuments({ statut: 'maintenance' }),
    Vehicle.countDocuments({ statut: 'hors_service' }),
    Vehicle.countDocuments({ mode_possession: 'loue' }),
    Vehicle.countDocuments(alertFilter)
  ]);

  res.json({ total, actifs, maintenance, horsService, loues, alertes });
}

module.exports = {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleStats
};