require('dotenv').config();
require('express-async-errors');

const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/authRoutes');
const driverRoutes = require('./routes/driverRoutes');
const documentRoutes = require('./routes/documentRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const vehicleDocumentRoutes = require('./routes/vehicleDocumentRoutes');
const fileRoutes = require('./routes/fileRoutes');
const webfleetRoutes = require('./routes/webfleetRoutes');
const quartixRoutes = require('./routes/quartixRoutes');
const optifleetRoutes = require('./routes/optifleetRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const ingestionRoutes = require('./routes/ingestionRoutes');
const historyRoutes = require('./routes/historyRoutes');
const taskRoutes = require('./routes/taskRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Capacitor, curl, etc.)
    if (!origin) return callback(null, true);

    const allowed = [
      "http://localhost:5500",
      "http://localhost:3000",
      "http://localhost:5501",
      "http://127.0.0.1:5500",
      "https://yovatrans.netlify.app",
      "https://front-j4x8.onrender.com",
      "https://admin.yovatrans.fr",
      // Capacitor / Android WebView
      "https://localhost",
      "http://localhost",
      "capacitor://localhost",
      "ionic://localhost",
    ];

    if (allowed.includes(origin)) return callback(null, true);

    // Allow any *.yovatrans.fr subdomain
    if (/^https?:\/\/([a-z0-9-]+\.)?yovatrans\.fr$/.test(origin)) return callback(null, true);

    // Block everything else
    return callback(new Error("CORS non autorisé : " + origin));
  },
  credentials: true
}));
app.use(morgan('dev'));
// Limite relevée : l'envoi WhatsApp peut inclure une feuille de tournée PDF en base64.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ message: 'Yovatrans backend is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/vehicles', historyRoutes);
app.use('/api/drivers', documentRoutes);
app.use('/api/vehicles', vehicleDocumentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/webfleet', webfleetRoutes);
app.use('/api/quartix', quartixRoutes);
app.use('/api/optifleet', optifleetRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/ingestion', ingestionRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/planning', require('./routes/planning'))
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
