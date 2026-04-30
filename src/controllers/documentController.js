const Driver = require('../models/Driver');

function buildFile(file) {
  return {
    originalName: file.originalname,
    filename: file.key,
    path: `/api/files/${file.key}`,
    mimeType: file.mimetype,
    size: file.size,
    r2Key: file.key
  };
}

async function uploadGeneralDocument(req, res) {
  const driver = await Driver.findById(req.params.id);
  if (!driver) return res.status(404).json({ message: 'Driver not found' });
  if (!req.file) return res.status(400).json({ message: 'File is required' });

  driver.documents.push({
    label: req.body.label || req.file.originalname,
    category: req.body.category || 'general',
    file: buildFile(req.file)
  });

  await driver.save();
  res.status(201).json(driver.documents[driver.documents.length - 1]);
}

async function uploadOfficialDocument(req, res) {
  const driver = await Driver.findById(req.params.id);
  if (!driver) return res.status(404).json({ message: 'Driver not found' });
  if (!req.file) return res.status(400).json({ message: 'File is required' });

  const allowedTypes = ['cni', 'cc', 'fimo', 'vitale', 'rib', 'btp'];
  const { type } = req.params;
  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ message: 'Invalid official document type' });
  }

  driver.officialDocs[type] = {
    ...(driver.officialDocs?.[type]?.toObject ? driver.officialDocs[type].toObject() : driver.officialDocs?.[type]),
    type: req.body.docType || driver.officialDocs?.[type]?.type,
    numero: req.body.numero || driver.officialDocs?.[type]?.numero,
    delivreLe: req.body.delivreLe || driver.officialDocs?.[type]?.delivreLe,
    expireLe: req.body.expireLe || driver.officialDocs?.[type]?.expireLe,
    obtenuLe: req.body.obtenuLe || driver.officialDocs?.[type]?.obtenuLe,
    iban: req.body.iban || driver.officialDocs?.[type]?.iban,
    bic: req.body.bic || driver.officialDocs?.[type]?.bic,
    titulaire: req.body.titulaire || driver.officialDocs?.[type]?.titulaire,
    file: buildFile(req.file)
  };

  await driver.save();
  res.status(201).json(driver.officialDocs[type]);
}

module.exports = {
  uploadGeneralDocument,
  uploadOfficialDocument
};
