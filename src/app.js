// app.js
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const compression  = require('compression');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── CORS يجب يكون قبل أي حاجة تانية ──────────────────────
const corsOptions = {
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // handle preflight لكل الـ routes

// ── Security & Parsing ────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(compression());
app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/authRoutes'));
app.use('/api/units',         require('./routes/blockRoutes'));
app.use('/api/tenants',       require('./routes/tenantRoutes'));
app.use('/api/payments',      require('./routes/paymentRoutes'));
app.use('/api/analytics',     require('./routes/analyticsRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/reports',       require('./routes/reportRoutes'));
app.use('/api/backup',        require('./routes/backupRoutes'));
// app.use('/api/stores',        require('./routes/storeRoutes'));

// ── Health & Catch-all ────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'OK', uptime: process.uptime() }));
app.get('/', (req, res) => res.json({ message: 'Warehouse Management API v2.0' }));
// Put this AFTER all your routes, but BEFORE the errorHandler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'المسار غير موجود' 
  });
});
app.use(errorHandler);

module.exports = app;