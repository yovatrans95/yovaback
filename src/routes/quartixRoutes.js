const express = require('express');
const Vehicle = require('../models/Vehicle');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

const QUARTIX_BASE_URL = process.env.QUARTIX_BASE_URL || 'https://qws.quartix.net/v2/api';

router.get('/vehicles', protect, async (req, res) => {
  try {
    const token = await getQuartixToken();

    const [quartixVehicles, livePositions] = await Promise.all([
      fetchQuartixVehicles(token),
      fetchQuartixLive(token)
    ]);

    const vehiclesById = new Map(
      quartixVehicles.map(v => [String(v.VehicleID || v.VehicleId), v])
    );

    const dbVehicles = await Vehicle.find({})
      .select('_id immatriculation marque modele statut mode_possession')
      .lean();

    const dbByPlate = new Map(
      dbVehicles.map(v => [normalizePlate(v.immatriculation), v])
    );

    const vehicles = livePositions.map(pos => {
      const qVehicle = vehiclesById.get(String(pos.VehicleID || pos.VehicleId));
      const plate = normalizePlate(qVehicle?.RegistrationNumber || '');

      const dbVehicle = dbByPlate.get(plate);

      return {
        provider: 'quartix',
        objectno: pos.VehicleID || pos.VehicleId,
        name: qVehicle?.Description || qVehicle?.VehicleInitials || plate || 'Véhicule Quartix',
        immatriculation: plate,

        vehicleId: dbVehicle?._id || null,
        vehicleFoundInMongo: Boolean(dbVehicle),
        marque: dbVehicle?.marque || null,
        modele: dbVehicle?.modele || null,
        statutMongo: dbVehicle?.statut || null,

        lat: Number(pos.Latitude),
        lng: Number(pos.Longitude),
        address: pos.LocationText || '',
        speed: Number(pos.Speed || 0),

        ignition: pos.LastEventDescription !== 'Ignition-Off',
        standstill: Number(pos.Speed || 0) === 0,

        course: pos.Heading || null,
        status: pos.LastEventDescription || null,
        posTime: pos.LastEventDateTime || pos.LastEventDatetime || null,
        msgTime: pos.LastEventDateTime || pos.LastEventDatetime || null,

        raw: {
          vehicle: qVehicle,
          live: pos
        }
      };
    }).filter(v => v.lat && v.lng);

    res.json({
      success: true,
      count: vehicles.length,
      updatedAt: new Date().toISOString(),
      vehicles
    });

  } catch (error) {
    console.error('Erreur Quartix:', error.message || error);
    res.status(500).json({
      success: false,
      message: 'Erreur récupération véhicules Quartix',
      error: error.message
    });
  }
});

async function getQuartixToken() {
  const form = new URLSearchParams();
  form.append('CustomerID', process.env.QUARTIX_CUSTOMER_ID);
  form.append('UserName', process.env.QUARTIX_USERNAME);
  form.append('Password', process.env.QUARTIX_PASSWORD);
  form.append('Application', process.env.QUARTIX_APPLICATION || 'YOVATRANS');

  const response = await fetch(`${QUARTIX_BASE_URL}/auth`, {
    method: 'POST',
    body: form
  });

  const data = await response.json();

  if (!response.ok || !data?.Data?.AccessToken) {
    throw new Error(data?.Meta?.Message || 'Authentification Quartix impossible');
  }

  return data.Data.AccessToken;
}

async function fetchQuartixVehicles(token) {
  const response = await fetch(`${QUARTIX_BASE_URL}/vehicles`, {
    headers: {
      AccessToken: token,
      Accept: 'application/json'
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.Meta?.Message || 'Erreur liste véhicules Quartix');
  }

  return data.Data || [];
}

async function fetchQuartixLive(token) {
  const response = await fetch(`${QUARTIX_BASE_URL}/vehicles/live`, {
    headers: {
      AccessToken: token,
      Accept: 'application/json'
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.Meta?.Message || 'Erreur live véhicules Quartix');
  }

  return data.Data || [];
}

function normalizePlate(value = '') {
  const clean = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : clean;
}

module.exports = router;