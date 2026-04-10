// server.js - Entry Point
require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/database');
const ScheduleService = require('./src/services/schedulerService');

const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════
// Connect to database
// ═══════════════════════════════════════════════════════════
connectDB();

// ═══════════════════════════════════════════════════════════
// Start scheduled services after DB connection
// ═══════════════════════════════════════════════════════════
setTimeout(() => {
  ScheduleService.init();
}, 2000);

// ═══════════════════════════════════════════════════════════
// Start server
// ═══════════════════════════════════════════════════════════
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// ═══════════════════════════════════════════════════════════
// Graceful shutdown
// ═══════════════════════════════════════════════════════════
const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️ ${signal} received, shutting down gracefully...`);

  const forceTimeout = setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);

  try {
    console.log('1. Stopping scheduled tasks...');
    ScheduleService.stop();

    console.log('2. Closing HTTP server...');
    await new Promise((resolve) => server.close(resolve));

    console.log('3. Closing MongoDB connection...');
    const mongoose = require('mongoose');
    await mongoose.connection.close(false);

    clearTimeout(forceTimeout);
    console.log('✅ Shutdown completed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  gracefulShutdown('UNHANDLED_REJECTION');
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});