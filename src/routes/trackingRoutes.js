const express = require('express');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
console.log("TRACKING ENV CHECK =", {
  webfleetAccount: !!process.env.WEBFLEET_ACCOUNT,
  webfleetUsername: !!process.env.WEBFLEET_USERNAME,
  webfleetPassword: !!process.env.WEBFLEET_PASSWORD,
  webfleetApiKey: !!process.env.WEBFLEET_APIKEY,

  quartixUsername: !!process.env.QUARTIX_USERNAME,
  quartixPassword: !!process.env.QUARTIX_PASSWORD,
  quartixApiKey: !!process.env.QUARTIX_APIKEY,

  optifleetClientId: !!process.env.OPTIFLEET_CLIENT_ID,
  optifleetSecret: !!process.env.OPTIFLEET_CLIENT_SECRET
});
router.get('/vehicles', protect, async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}/api`;

    const headers = {
      Authorization: req.headers.authorization || ''
    };

    const [webfleetRes, quartixRes, optifleetRes] = await Promise.allSettled([
      fetch(`${baseUrl}/webfleet/vehicles`, { headers }),
      fetch(`${baseUrl}/quartix/vehicles`, { headers }),
      fetch(`${baseUrl}/optifleet/vehicles`, { headers })
    ]);

    const webfleet = await extractVehicles(webfleetRes);
    const quartix = await extractVehicles(quartixRes);
    const optifleet = await extractVehicles(optifleetRes);

    const byPlate = new Map();

    // 1. Webfleet d'abord = priorité
    webfleet.forEach(vehicle => {
      const key = normalizePlate(vehicle.immatriculation);
      if (key) byPlate.set(key, { ...vehicle, provider: 'webfleet' });
    });

    // 2. Quartix seulement si pas déjà Webfleet
    quartix.forEach(vehicle => {
      const key = normalizePlate(vehicle.immatriculation);
      if (key && !byPlate.has(key)) {
        byPlate.set(key, { ...vehicle, provider: 'quartix' });
      }
    });

    // 3. Optifleet seulement si pas déjà Webfleet/Quartix
    optifleet.forEach(vehicle => {
      const key = normalizePlate(vehicle.immatriculation);
      if (key && !byPlate.has(key)) {
        byPlate.set(key, { ...vehicle, provider: 'optifleet' });
      }
    });

    const vehicles = Array.from(byPlate.values());

    res.json({
      success: true,
      count: vehicles.length,
      vehicles
    });

  } catch (error) {
    console.error('Erreur tracking fusion:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erreur récupération tracking multi-fournisseurs',
      error: error.message
    });
  }
});

async function extractVehicles(result) {
  try {
    if (result.status !== 'fulfilled') return [];

    const response = result.value;
    if (!response.ok) return [];

    const data = await response.json();
    return data.vehicles || [];
  } catch {
    return [];
  }
}

function normalizePlate(value = '') {
  const clean = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : clean;
}

module.exports = router;