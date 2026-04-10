// middleware/validation.js
const { body, validationResult } = require('express-validator');

// ═══════════════════════════════════════════════════════════
// تسجيل مستخدم جديد
// ═══════════════════════════════════════════════════════════
exports.validateRegister = async (req, res, next) => {
  console.log('📌 [validateRegister] called, next type:', typeof next);
  await body('username').trim().isLength({ min: 3 })
    .withMessage('اسم المستخدم يجب أن يكون 3 أحرف على الأقل').run(req);
  await body('password').isLength({ min: 6 })
    .withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل').run(req);
  await body('fullName').trim().notEmpty()
    .withMessage('الاسم الكامل مطلوب').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(e => e.msg)
    });
  }
  next();
};

// ═══════════════════════════════════════════════════════════
// إنشاء وحدة
// ═══════════════════════════════════════════════════════════
exports.validateUnit = async (req, res, next) => {
  await body('unitNumber').trim().notEmpty()
    .withMessage('رقم الوحدة مطلوب').run(req);
  await body('storeId').notEmpty().withMessage('المخزن مطلوب')
    .isMongoId().withMessage('معرف المخزن غير صالح').run(req);
  await body('monthlyRent').optional().isNumeric()
    .withMessage('الإيجار الشهري يجب أن يكون رقماً').run(req);
  await body('paymentDueDay').optional().isInt({ min: 1, max: 28 })
    .withMessage('يوم الاستحقاق يجب أن يكون بين 1 و 28').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(e => e.msg)
    });
  }
  next();
};

// ═══════════════════════════════════════════════════════════
// بدء إيجار
// ═══════════════════════════════════════════════════════════
exports.validateStartRental = async (req, res, next) => {
  await body('tenantId').notEmpty().withMessage('المستأجر مطلوب')
    .isMongoId().withMessage('معرف المستأجر غير صالح').run(req);
  await body('monthlyRent').notEmpty().withMessage('الإيجار الشهري مطلوب')
    .isNumeric().withMessage('الإيجار الشهري يجب أن يكون رقماً')
    .isFloat({ min: 1 }).withMessage('الإيجار يجب أن يكون أكبر من صفر').run(req);
  await body('startDate').optional().isISO8601()
    .withMessage('تاريخ البداية غير صالح').run(req);
  await body('endDate').optional().isISO8601()
    .withMessage('تاريخ النهاية غير صالح').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(e => e.msg)
    });
  }
  next();
};

// ═══════════════════════════════════════════════════════════
// مستأجر جديد
// ═══════════════════════════════════════════════════════════
exports.validateTenant = async (req, res, next) => {
  await body('name').trim().notEmpty()
    .withMessage('اسم المستأجر مطلوب').run(req);
  await body('phone').trim().notEmpty()
    .withMessage('رقم الهاتف مطلوب').run(req);
  await body('nationalId').trim().notEmpty()
    .withMessage('الرقم القومي مطلوب')
    .isLength({ min: 14, max: 14 })
    .withMessage('الرقم القومي يجب أن يكون 14 رقماً').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(e => e.msg)
    });
  }
  next();
};

// ═══════════════════════════════════════════════════════════
// تسجيل دفعة
// ═══════════════════════════════════════════════════════════
exports.validatePayment = async (req, res, next) => {
  await body('unitId').notEmpty().withMessage('الوحدة مطلوبة')
    .isMongoId().withMessage('معرف الوحدة غير صالح').run(req);
  await body('tenantId').notEmpty().withMessage('المستأجر مطلوب')
    .isMongoId().withMessage('معرف المستأجر غير صالح').run(req);
  await body('amount').isNumeric().withMessage('المبلغ يجب أن يكون رقماً')
    .isFloat({ min: 1 }).withMessage('المبلغ يجب أن يكون أكبر من صفر').run(req);
  await body('monthYear').matches(/^\d{4}-\d{2}$/)
    .withMessage('صيغة الشهر غير صحيحة - يجب أن تكون YYYY-MM').run(req);
  await body('paymentMethod').optional()
    .isIn(['cash', 'bank_transfer', 'wallet', 'instapay'])
    .withMessage('طريقة الدفع غير صالحة').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(e => e.msg)
    });
  }
  next();
};
