// middleware/errorHandler.js
// ═══════════════════════════════════════════════════════════

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log للمطور
  console.error('Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'المورد غير موجود';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'هذا الحقل موجود بالفعل';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'توكن غير صالح';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'انتهت صلاحية التوكن';
    error = { message, statusCode: 401 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'خطأ في الخادم'
  });
};

module.exports = errorHandler;
