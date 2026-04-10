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
  console.log('📌 [register] route hit');
  console.log('📌 [register] req.body:', JSON.stringify(req.body));

  try {
    const { username, password, fullName, email, role } = req.body;

    console.log('📌 [register] searching for existing user...');
    const userExists = await User.findOne({ username });
    console.log('📌 [register] userExists:', userExists ? 'YES' : 'NO');

    if (userExists) {
      return res.status(400).json({
        success: false,
        error: 'اسم المستخدم موجود بالفعل'
      });
    }

    console.log('📌 [register] creating user...');
    const user = await User.create({
      username,
      password,
      fullName,
      email,
      role: role || 'viewer'
    });
    console.log('📌 [register] user created:', user._id);

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
    console.error('❌ [register] error name:', error.name);
    console.error('❌ [register] error message:', error.message);
    console.error('❌ [register] error stack:', error.stack);
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
  console.log('📌 [login] route hit');
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'الرجاء إدخال اسم المستخدم وكلمة المرور'
      });
    }

    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'بيانات الدخول غير صحيحة'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'بيانات الدخول غير صحيحة'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'هذا الحساب غير نشط'
      });
    }

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
    console.error('❌ [login] error:', error.message);
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
