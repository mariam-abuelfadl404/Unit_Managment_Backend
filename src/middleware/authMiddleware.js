// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ═══════════════════════════════════════════════════════════
// حماية المسارات - التحقق من التوكن
// ═══════════════════════════════════════════════════════════
exports.protect = async (req, res, next) => {
  try {
    let token;

    // التحقق من وجود التوكن في الـ Headers
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح - الرجاء تسجيل الدخول'
      });
    }

    // التحقق من صحة التوكن
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // الحصول على المستخدم من قاعدة البيانات
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user || !req.user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'المستخدم غير موجود أو غير نشط'
      });
    }

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'غير مصرح - توكن غير صالح'
    });
  }
};

// ═══════════════════════════════════════════════════════════
// التحقق من الصلاحيات (Roles)
// ═══════════════════════════════════════════════════════════
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية للوصول لهذا المورد'
      });
    }
    next();
  };
};