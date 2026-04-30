const Vehicle = require('../models/Vehicle');
console.log('Vehicle model path:', require.resolve('../models/Vehicle'));
console.log('Documents schema:', Vehicle.schema.path('documents'));
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const r2 = require('../config/r2');
const allowedTypes = [
  'carte_grise_fichier',
  'contrat_location_fichier',
  'controle_technique_fichier',
  'assurance_fichier',
  'licence_transport_fichier',
  'recepisse_transport_fichier',
  'chronotachygraphe_fichier',
  'limiteur_fichier'
];

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

async function uploadVehicleDocument(req, res) {
  const { id } = req.params;

  const vehicle = await Vehicle.findById(id);
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
  if (!req.file) return res.status(400).json({ message: 'File is required' });

  if (!vehicle.documents) vehicle.documents = [];

  vehicle.documents.push({
    label: req.body.label || req.file.originalname,
    category: req.body.category || 'general',
    file: buildFile(req.file)
  });

  await vehicle.save();

  res.status(201).json({
    message: 'Document uploaded',
    document: vehicle.documents[vehicle.documents.length - 1],
    vehicle
  });
}

async function deleteVehicleDocument(req, res) {
  const { id, documentId } = req.params;

  const vehicle = await Vehicle.findById(id);
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

  const doc = (vehicle.documents || []).find(
    d => String(d._id) === String(documentId)
  );

  if (!doc) return res.status(404).json({ message: 'Document not found' });

  const key = doc.file?.r2Key || doc.file?.filename;

  if (key) {
    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key
        })
      );
      console.log('R2 deleted:', key);
    } catch (err) {
      console.error('R2 DELETE ERROR:', err);
    }
  }

  vehicle.documents = (vehicle.documents || []).filter(
    d => String(d._id) !== String(documentId)
  );

  await vehicle.save();

  res.json({ message: 'Document deleted', vehicle });
}
module.exports = {
  uploadVehicleDocument,
  deleteVehicleDocument
};