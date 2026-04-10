// controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// توليد JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// ═══════════════════════════════════════════════════════════
// تسجيل مستخدم جديد
// ═══════════════════════════════════════════════════════════
exports.register = async (req, res) => {
  try {
    const { username, password, fullName, email, role } = req.body;

    // التحقق من وجود المستخدم
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({
        success: false,
        error: 'اسم المستخدم موجود بالفعل'
      });
    }

    // إنشاء مستخدم جديد
    const user = await User.create({
      username,
      password,
      fullName,
      email,
      role: role || 'viewer'
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          fullName: user.fullName,
          role: user.role
        },
        token
      },
      message: 'تم التسجيل بنجاح'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════
// تسجيل الدخول
// ═══════════════════════════════════════════════════════════
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // التحقق من وجود البيانات
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'الرجاء إدخال اسم المستخدم وكلمة المرور'
      });
    }

    // البحث عن المستخدم
    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'بيانات الدخول غير صحيحة'
      });
    }

    // التحقق من كلمة المرور
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'بيانات الدخول غير صحيحة'
      });
    }

    // التحقق من أن الحساب نشط
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'هذا الحساب غير نشط'
      });
    }

    // تحديث آخر تسجيل دخول
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          email: user.email
        },
        token
      },
      message: 'تم تسجيل الدخول بنجاح'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════
// الحصول على بيانات المستخدم الحالي
// ═══════════════════════════════════════════════════════════
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════
// تحديث كلمة المرور
// ═══════════════════════════════════════════════════════════
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    // التحقق من كلمة المرور الحالية
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'كلمة المرور الحالية غير صحيحة'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'تم تحديث كلمة المرور بنجاح'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
