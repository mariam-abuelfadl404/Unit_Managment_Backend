// config/database.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB متصل: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('فشل الاتصال بـ MongoDB:', error.message);
    throw error;
  }
};

// Global listeners (مرة واحدة)
mongoose.connection.on('error', err => {
  console.error('MongoDB Error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB Disconnected');
});

module.exports = connectDB;
