// middleware/validation.js
const { body, validationResult } = require('express-validator');

// ─── helper مشترك ────────────────────────────────────────
const validate = (req, res, next) => {
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
// تسجيل مستخدم جديد
// ═══════════════════════════════════════════════════════════
exports.validateRegister = [
  body('username').trim().isLength({ min: 3 })
    .withMessage('اسم المستخدم يجب أن يكون 3 أحرف على الأقل'),
  body('password').isLength({ min: 6 })
    .withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  body('fullName').trim().notEmpty()
    .withMessage('الاسم الكامل مطلوب'),
  validate
];

// ═══════════════════════════════════════════════════════════
// إنشاء وحدة
// ═══════════════════════════════════════════════════════════
exports.validateUnit = [
  body('unitNumber').trim().notEmpty()
    .withMessage('رقم الوحدة مطلوب'),
  body('storeId').notEmpty().withMessage('المخزن مطلوب')
    .isMongoId().withMessage('معرف المخزن غير صالح'),
  body('monthlyRent').optional().isNumeric()
    .withMessage('الإيجار الشهري يجب أن يكون رقماً'),
  body('paymentDueDay').optional().isInt({ min: 1, max: 28 })
    .withMessage('يوم الاستحقاق يجب أن يكون بين 1 و 28'),
  validate
];

// ═══════════════════════════════════════════════════════════
// بدء إيجار
// ═══════════════════════════════════════════════════════════
exports.validateStartRental = [
  body('tenantId').notEmpty().withMessage('المستأجر مطلوب')
    .isMongoId().withMessage('معرف المستأجر غير صالح'),
  body('monthlyRent').notEmpty().withMessage('الإيجار الشهري مطلوب')
    .isNumeric().withMessage('الإيجار الشهري يجب أن يكون رقماً')
    .isFloat({ min: 1 }).withMessage('الإيجار يجب أن يكون أكبر من صفر'),
  body('startDate').optional().isISO8601()
    .withMessage('تاريخ البداية غير صالح'),
  body('endDate').optional().isISO8601()
    .withMessage('تاريخ النهاية غير صالح'),
  validate
];

// ═══════════════════════════════════════════════════════════
// مستأجر جديد
// ═══════════════════════════════════════════════════════════
exports.validateTenant = [
  body('name').trim().notEmpty()
    .withMessage('اسم المستأجر مطلوب'),
  body('phone').trim().notEmpty()
    .withMessage('رقم الهاتف مطلوب'),
  body('nationalId').trim().notEmpty()
    .withMessage('الرقم القومي مطلوب')
    .isLength({ min: 14, max: 14 })
    .withMessage('الرقم القومي يجب أن يكون 14 رقماً'),
  validate
];

// ═══════════════════════════════════════════════════════════
// تسجيل دفعة
// ═══════════════════════════════════════════════════════════
exports.validatePayment = [
  body('unitId').notEmpty().withMessage('الوحدة مطلوبة')
    .isMongoId().withMessage('معرف الوحدة غير صالح'),
  body('tenantId').notEmpty().withMessage('المستأجر مطلوب')
    .isMongoId().withMessage('معرف المستأجر غير صالح'),
  body('amount').isNumeric().withMessage('المبلغ يجب أن يكون رقماً')
    .isFloat({ min: 1 }).withMessage('المبلغ يجب أن يكون أكبر من صفر'),
  body('monthYear').matches(/^\d{4}-\d{2}$/)
    .withMessage('صيغة الشهر غير صحيحة - يجب أن تكون YYYY-MM'),
  body('paymentMethod')
    .optional()
    .isIn(['cash', 'bank_transfer', 'wallet', 'instapay'])
    .withMessage('طريقة الدفع غير صالحة'),
  validate
];