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
const taskRoutes = require('./routes/taskRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "https://front-j4x8.onrender.com",
    "https://admin.yovatrans.fr"
  ],
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ message: 'Yovatrans backend is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/drivers', documentRoutes);
app.use('/api/vehicles', vehicleDocumentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/webfleet', webfleetRoutes);
app.use('/api/quartix', quartixRoutes);
app.use('/api/optifleet', optifleetRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/planning', require('./routes/planning'))
app.use(notFound);
app.use(errorHandler);

module.exports = app;
