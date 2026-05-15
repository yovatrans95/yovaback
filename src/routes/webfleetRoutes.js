const express = require('express');
const Vehicle = require('../models/Vehicle');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

const WEBFLEET_URL = process.env.WEBFLEET_URL || 'https://csv.webfleet.com/extern';

router.get('/vehicles', protect, async (req, res) => {
  try {
    assertWebfleetEnv();

    const webfleetVehicles = await fetchWebfleetObjects();
    const dbVehicles = await Vehicle.find({}).select('_id immatriculation marque modele statut mode_possession').lean();
    const dbByPlate = new Map(dbVehicles.map((vehicle) => [normalizePlate(vehicle.immatriculation), vehicle]));

    const vehicles = webfleetVehicles
      .filter((item) => item && item.deleted !== true)
      .map((item) => {
        const plate = extractPlate(item.objectname) || extractPlate(item.description) || null;
        const dbVehicle = plate ? dbByPlate.get(normalizePlate(plate)) : null;
        const lat = toDecimalCoordinate(item.latitude_mdeg);
        const lng = toDecimalCoordinate(item.longitude_mdeg);

        return {
          objectno: item.objectno,
          objectuid: item.objectuid,
          name: item.objectname || item.objectno || 'Vehicule Webfleet',
          immatriculation: plate,
          vehicleId: dbVehicle?._id || null,
          vehicleFoundInMongo: Boolean(dbVehicle),
          marque: dbVehicle?.marque || null,
          modele: dbVehicle?.modele || null,
          statutMongo: dbVehicle?.statut || null,
          lat,
          lng,
          address: item.postext_short || item.postext || '',
          speed: Number(item.speed || 0),
          course: item.course || null,
          ignition: Number(item.ignition) === 1,
          standstill: Number(item.standstill) === 1,
          status: item.status || null,
          posTime: item.pos_time || item.msgtime || null,
          msgTime: item.msgtime || null,
          odometerKm: item.odometer_long ? Math.round(Number(item.odometer_long) / 100000) / 10 : null,
          raw: item
        };
      })
      .filter((item) => item.lat != null && item.lng != null);

    res.json({
      success: true,
      count: vehicles.length,
      updatedAt: new Date().toISOString(),
      vehicles
    });
  } catch (error) {
    console.error('Erreur Webfleet:', error.message || error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.publicMessage || 'Erreur récupération véhicules Webfleet',
      error: error.publicError || error.message
    });
  }
});

async function fetchWebfleetObjects() {
  const url = new URL(WEBFLEET_URL);
  url.searchParams.set('account', process.env.WEBFLEET_ACCOUNT);
  url.searchParams.set('apikey', process.env.WEBFLEET_APIKEY);
  url.searchParams.set('action', 'showObjectReportExtern');
  url.searchParams.set('outputformat', 'json');
  url.searchParams.set('lang', process.env.WEBFLEET_LANG || 'fr');

  const basicAuth = Buffer.from(`${process.env.WEBFLEET_USERNAME}:${process.env.WEBFLEET_PASSWORD}`).toString('base64');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: 'application/json'
    }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok || data?.errorCode) {
    const error = new Error(data?.errorMsg || text || 'Erreur Webfleet');
    error.statusCode = response.ok ? 400 : response.status;
    error.publicMessage = 'Webfleet a refusé la requête';
    error.publicError = data;
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

function assertWebfleetEnv() {
  const required = ['WEBFLEET_ACCOUNT', 'WEBFLEET_USERNAME', 'WEBFLEET_PASSWORD', 'WEBFLEET_APIKEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    const error = new Error(`Variables Webfleet manquantes: ${missing.join(', ')}`);
    error.statusCode = 500;
    error.publicMessage = 'Configuration Webfleet incomplète côté serveur';
    error.publicError = { missing };
    throw error;
  }
}

function toDecimalCoordinate(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number / 1000000;
}

function extractPlate(value = '') {
  const match = String(value).toUpperCase().match(/[A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2}/);
  return match ? normalizePlate(match[0]) : null;
}

function normalizePlate(value = '') {
  const clean = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : clean;
}

module.exports = router;
