const express = require('express');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

console.log("TRACKING ENV CHECK =", {
  webfleetAccount: !!process.env.WEBFLEET_ACCOUNT,
  webfleetUsername: !!process.env.WEBFLEET_USERNAME,
  webfleetPassword: !!process.env.WEBFLEET_PASSWORD,
  webfleetApiKey: !!process.env.WEBFLEET_APIKEY,

  quartixApplication: !!process.env.QUARTIX_APPLICATION,
  quartixCustomerId: !!process.env.QUARTIX_CUSTOMER_ID,
  quartixUsername: !!process.env.QUARTIX_USERNAME,
  quartixPassword: !!process.env.QUARTIX_PASSWORD,

  optifleetUsername: !!process.env.OPTIFLEET_USERNAME,
  optifleetPassword: !!process.env.OPTIFLEET_PASSWORD,
  optifleetBaseUrl: !!process.env.OPTIFLEET_BASE_URL
});

router.get('/vehicles', protect, async (req, res) => {
  try {
    /**
     * IMPORTANT :
     * En local, req.protocol = http.
     * En prod derrière Render / proxy / Cloudflare, req.protocol peut rester http
     * même si ton domaine est en https.
     *
     * Donc on force l'URL publique depuis l'env si disponible.
     */
    const baseUrl =
      process.env.PUBLIC_API_URL ||
      process.env.API_PUBLIC_URL ||
      process.env.BACKEND_URL ||
      `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}/api`;

    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    const headers = {
      Authorization: req.headers.authorization || '',
      Accept: 'application/json'
    };

    console.log("TRACKING INTERNAL BASE URL =", cleanBaseUrl);

    const [webfleetRes, quartixRes, optifleetRes] = await Promise.allSettled([
      fetch(`${cleanBaseUrl}/webfleet/vehicles`, { headers }),
      fetch(`${cleanBaseUrl}/quartix/vehicles`, { headers }),
      fetch(`${cleanBaseUrl}/optifleet/vehicles`, { headers })
    ]);

    const webfleet = await extractVehicles('webfleet', webfleetRes);
    const quartix = await extractVehicles('quartix', quartixRes);
    const optifleet = await extractVehicles('optifleet', optifleetRes);

    console.log("TRACKING PROVIDER COUNTS =", {
      webfleet: webfleet.length,
      quartix: quartix.length,
      optifleet: optifleet.length
    });

    const byPlate = new Map();

    webfleet.forEach(vehicle => {
      const key = normalizePlate(vehicle.immatriculation);
      if (key) {
        byPlate.set(key, {
          ...vehicle,
          provider: 'webfleet'
        });
      }
    });

    quartix.forEach(vehicle => {
      const key = normalizePlate(vehicle.immatriculation);
      if (key && !byPlate.has(key)) {
        byPlate.set(key, {
          ...vehicle,
          provider: 'quartix'
        });
      }
    });

    optifleet.forEach(vehicle => {
      const key = normalizePlate(vehicle.immatriculation);
      if (key && !byPlate.has(key)) {
        byPlate.set(key, {
          ...vehicle,
          provider: 'optifleet'
        });
      }
    });

    const vehicles = Array.from(byPlate.values());

    console.log("TRACKING FINAL =", {
      count: vehicles.length,
      firstVehicle: vehicles[0] || null
    });

    res.json({
      success: true,
      count: vehicles.length,
      updatedAt: new Date().toISOString(),
      vehicles
    });

  } catch (error) {
    console.error('Erreur tracking fusion:', error);

    res.status(500).json({
      success: false,
      message: 'Erreur récupération tracking multi-fournisseurs',
      error: error.message
    });
  }
});

async function extractVehicles(providerName, result) {
  try {
    if (result.status !== 'fulfilled') {
      console.error(`❌ ${providerName} fetch rejected:`, result.reason?.message || result.reason);
      return [];
    }

    const response = result.value;

    console.log(`${providerName.toUpperCase()} HTTP STATUS =`, response.status, response.statusText);

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    if (!response.ok) {
      console.error(`❌ ${providerName} response not ok:`, {
        status: response.status,
        statusText: response.statusText,
        body: text.slice(0, 1000)
      });
      return [];
    }

    const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];

    console.log(`${providerName.toUpperCase()} VEHICLES COUNT =`, vehicles.length);

    if (vehicles[0]) {
      console.log(`${providerName.toUpperCase()} FIRST VEHICLE =`, vehicles[0]);
    }

    return vehicles;

  } catch (error) {
    console.error(`❌ ${providerName} extract error:`, error.message || error);
    return [];
  }
}

function normalizePlate(value = '') {
  const clean = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : clean;
}

module.exports = router;