const express = require('express');
const Vehicle = require('../models/Vehicle');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

const OPTIFLEET_BASE_URL =
  process.env.OPTIFLEET_BASE_URL || 'https://api.renault-trucks.com/vehicle';

const ACCEPT_HEADERS = {
  vehicles: 'application/x.volvogroup.com.vehicles.v1.0+json',
  vehiclepositions: 'application/x.volvogroup.com.vehiclepositions.v1.0+json'
};

router.get('/vehicles', protect, async (req, res) => {
  try {
    const [vehiclesData, positionsData] = await Promise.all([
      fetchOptifleet('/vehicles', ACCEPT_HEADERS.vehicles),
      fetchOptifleet('/vehiclepositions?latestOnly=true', ACCEPT_HEADERS.vehiclepositions)
    ]);

    const optifleetVehicles = vehiclesData?.vehicleResponse?.vehicles || [];
    const optifleetPositions =
      positionsData?.vehiclePositionResponse?.vehiclePositions ||
      positionsData?.vehiclePositions ||
      [];

    const positionsByVin = new Map(
      optifleetPositions
        .filter(pos => pos?.vin)
        .map(pos => [pos.vin, pos])
    );

    const dbVehicles = await Vehicle.find({})
      .select('_id immatriculation marque modele statut mode_possession')
      .lean();

    const dbByPlate = new Map(
      dbVehicles.map(v => [normalizePlate(v.immatriculation), v])
    );

    const vehicles = optifleetVehicles
      .map(item => {
        const plate = normalizePlate(item.customerVehicleName || '');
        const dbVehicle = dbByPlate.get(plate);
        const position = positionsByVin.get(item.vin);

        const lat = getLatitude(position);
        const lng = getLongitude(position);
        const speed = getSpeed(position);

        return {
          provider: 'optifleet',
          objectno: item.vin,
          name: item.customerVehicleName || plate || item.vin,
          immatriculation: plate,

          vehicleId: dbVehicle?._id || null,
          vehicleFoundInMongo: Boolean(dbVehicle),
          marque: dbVehicle?.marque || item.brand || null,
          modele: dbVehicle?.modele || item.model || null,
          statutMongo: dbVehicle?.statut || null,

          lat,
          lng,
          address: '',
          speed,

          ignition: true,
          standstill: speed === 0,

          course:
            position?.gnssPosition?.heading ??
            position?.position?.heading ??
            position?.heading ??
            null,

          status: null,

          posTime:
            position?.receivedDateTime ||
            position?.createdDateTime ||
            position?.triggerData?.triggerDateTime ||
            null,

          msgTime:
            position?.receivedDateTime ||
            position?.createdDateTime ||
            position?.triggerData?.triggerDateTime ||
            null,

          raw: {
            vehicle: item,
            position
          }
        };
      })
      .filter(v => v.lat != null && v.lng != null);

    res.json({
      success: true,
      count: vehicles.length,
      updatedAt: new Date().toISOString(),
      vehicles
    });

  } catch (error) {
    console.error('Erreur Optifleet:', error.message || error);

    res.status(500).json({
      success: false,
      message: 'Erreur récupération véhicules Optifleet',
      error: error.message
    });
  }
});

async function fetchOptifleet(endpoint, acceptHeader) {
  if (!process.env.OPTIFLEET_USERNAME || !process.env.OPTIFLEET_PASSWORD) {
    throw new Error('Variables OPTIFLEET_USERNAME ou OPTIFLEET_PASSWORD manquantes');
  }

  const response = await fetch(`${OPTIFLEET_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      Authorization: 'Basic ' + Buffer.from(
        `${process.env.OPTIFLEET_USERNAME}:${process.env.OPTIFLEET_PASSWORD}`
      ).toString('base64'),
      Accept: acceptHeader
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.title ||
      `Erreur Optifleet ${response.status}`
    );
  }

  return data;
}

function getLatitude(position) {
  const value =
    position?.gnssPosition?.latitude ??
    position?.position?.latitude ??
    position?.latitude ??
    null;

  return value != null ? Number(value) : null;
}

function getLongitude(position) {
  const value =
    position?.gnssPosition?.longitude ??
    position?.position?.longitude ??
    position?.longitude ??
    null;

  return value != null ? Number(value) : null;
}

function getSpeed(position) {
  const value =
    position?.wheelBasedSpeed ??
    position?.speed ??
    position?.vehicleSpeed ??
    position?.snapshotData?.wheelBasedSpeed ??
    0;

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePlate(value = '') {
  const clean = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : clean;
}

module.exports = router;