const Driver = require('../models/Driver');
const User = require('../models/User');

function toDate(value) {
  return value ? new Date(value) : undefined;
}

function mapDriverPayload(body) {
  return {
    user_email: body.user_email || body.email,
    nom: body.nom,
    prenom: body.prenom,
    ddn: toDate(body.ddn),
    lieu_naissance: body.lieu_naissance,
    nationalite: body.nationalite,
    genre: body.genre,
    situation: body.situation,
    enfants: body.enfants ?? 0,
    adresse: body.adresse,
    telephone: body.telephone,
    email: body.email,
    permis_numero: body.permis_numero,
    permis_categorie: body.permis_categorie,
    permis_obtention: toDate(body.permis_obtention),
    permis_expiration: toDate(body.permis_expiration),
    permis_pays: body.permis_pays,
    statut: body.statut || 'actif',
    urgence_nom: body.urgence_nom,
    urgence_prenom: body.urgence_prenom,
    urgence_lien: body.urgence_lien,
    urgence_tel: body.urgence_tel,
    id_type: body.id_type,
    id_num: body.id_num,
    id_deliv: toDate(body.id_deliv),
    id_exp: toDate(body.id_exp),
    cc_num: body.cc_num,
    cc_exp: toDate(body.cc_exp),
    fimo_type: body.fimo_type,
    fimo_num: body.fimo_num,
    fimo_obt: toDate(body.fimo_obt),
    fimo_exp: toDate(body.fimo_exp),
    ss_num: body.ss_num,
    rib_iban: body.rib_iban,
    rib_bic: body.rib_bic,
    rib_titulaire: body.rib_titulaire,
    btp_num: body.btp_num,
    btp_deliv: toDate(body.btp_deliv),
    btp_exp: toDate(body.btp_exp)
  };
}

async function listDrivers(req, res) {
  const { q, statut, permis, sort = 'nom', order = 'asc' } = req.query;
  const filter = {};

  if (statut) filter.statut = statut;
  if (permis) filter.permis_categorie = permis;
  if (q) {
    filter.$or = [
      { nom: { $regex: q, $options: 'i' } },
      { prenom: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { telephone: { $regex: q, $options: 'i' } }
    ];
  }

  const sortValue = order === 'desc' ? -1 : 1;
  const drivers = await Driver.find(filter).sort({ [sort]: sortValue, nom: 1, prenom: 1 });
  res.json(drivers);
}

async function getDriver(req, res) {
  const driver = await Driver.findById(req.params.id);
  if (!driver) {
    return res.status(404).json({ message: 'Driver not found' });
  }
  res.json(driver);
}

async function createDriver(req, res) {
  const { chauffeurPassword } = req.body;
  const payload = mapDriverPayload(req.body);

  if (!payload.nom || !payload.prenom || !payload.telephone || !payload.email) {
    return res.status(400).json({ message: 'nom, prenom, telephone and email are required' });
  }

  const existingUser = await User.findOne({ email: payload.email.toLowerCase() });
  if (existingUser) {
    return res.status(409).json({ message: 'A user already exists with this email' });
  }

  const driver = await Driver.create(payload);

  if (req.file) {
  const file = req.file;

  driver.photo = {
    originalName: file.originalname,
    filename: file.key,
    path: `/api/files/${file.key}`,
    mimeType: file.mimetype,
    size: file.size,
    r2Key: file.key
  };
}

  if (chauffeurPassword) {
    const passwordHash = await User.hashPassword(chauffeurPassword);
    const user = await User.create({
      email: payload.email,
      passwordHash,
      role: 'chauffeur',
      nom: payload.nom,
      prenom: payload.prenom,
      driverId: driver._id
    });
    driver.userId = user._id;
    driver.user_email = user.email;
  }

  await driver.save();
  res.status(201).json(driver);
}

async function updateDriver(req, res) {
  const driver = await Driver.findById(req.params.id);
  if (!driver) {
    return res.status(404).json({ message: 'Driver not found' });
  }

  Object.assign(driver, mapDriverPayload(req.body));

  if (req.file) {
    driver.photo = {
     originalName: file.originalname,
    filename: file.key,
    path: `/api/files/${file.key}`,
    mimeType: file.mimetype,
    size: file.size,
    r2Key: file.key
    };
  }

  await driver.save();

  if (driver.userId) {
    await User.findByIdAndUpdate(driver.userId, {
      email: driver.email,
      nom: driver.nom,
      prenom: driver.prenom
    });
  }

  res.json(driver);
}

async function deleteDriver(req, res) {
  const driver = await Driver.findById(req.params.id);
  if (!driver) {
    return res.status(404).json({ message: 'Driver not found' });
  }

  if (driver.userId) {
    await User.findByIdAndDelete(driver.userId);
  }

  await driver.deleteOne();
  res.json({ message: 'Driver deleted' });
}

async function getDriverStats(req, res) {
  const now = new Date();
  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const [total, actifs, enConge, inactifs, expiringPermits] = await Promise.all([
    Driver.countDocuments(),
    Driver.countDocuments({ statut: 'actif' }),
    Driver.countDocuments({ statut: 'en_conge' }),
    Driver.countDocuments({ statut: 'inactif' }),
    Driver.countDocuments({ permis_expiration: { $gte: now, $lte: in90Days } })
  ]);

  res.json({ total, actifs, enConge, inactifs, expiringPermits });
}

module.exports = {
  listDrivers,
  getDriver,
  createDriver,
  updateDriver,
  deleteDriver,
  getDriverStats
};
