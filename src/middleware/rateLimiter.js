// ═══════════════════════════════════════════════════════════
// middleware/rateLimiter.js
// ═══════════════════════════════════════════════════════════
const rateLimit = require('express-rate-limit');

// Rate limiter للـ login (منع هجمات Brute Force)
exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 5, // 5 محاولات فقط
  message: {
    success: false,
    error: 'تم تجاوز عدد محاولات تسجيل الدخول. حاول مرة أخرى بعد 15 دقيقة'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter عام للـ API
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // 100 طلب
  message: {
    success: false,
    error: 'تم تجاوز الحد الأقصى للطلبات. حاول مرة أخرى لاحقاً'
  }
});