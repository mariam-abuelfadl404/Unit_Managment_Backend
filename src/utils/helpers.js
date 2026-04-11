// utils/helpers.js
const moment = require('moment');

// ═══════════════════════════════════════════════════════════
// تنسيق التاريخ بالعربي
// ═══════════════════════════════════════════════════════════
exports.formatDate = (date, format = 'DD/MM/YYYY') => {
  return moment(date).format(format);
};

// ═══════════════════════════════════════════════════════════
// تنسيق المبالغ المالية
// ═══════════════════════════════════════════════════════════
exports.formatCurrency = (amount) => {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP'
  }).format(amount);
};

// ═══════════════════════════════════════════════════════════
// توليد رقم الإيصال
// ═══════════════════════════════════════════════════════════
exports.generateReceiptNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `REC-${timestamp}-${random}`;
};

// ═══════════════════════════════════════════════════════════
// حساب عدد الأيام بين تاريخين
// ═══════════════════════════════════════════════════════════
exports.daysBetween = (date1, date2) => {
  return moment(date2).diff(moment(date1), 'days');
};

// ═══════════════════════════════════════════════════════════
// التحقق من أن التاريخ في المستقبل
// ═══════════════════════════════════════════════════════════
exports.isFutureDate = (date) => {
  return moment(date).isAfter(moment());
};

// ═══════════════════════════════════════════════════════════
// الحصول على بداية ونهاية الشهر
// ═══════════════════════════════════════════════════════════
exports.getMonthRange = (yearMonth) => {
  const start = moment(yearMonth, 'YYYY-MM').startOf('month');
  const end = moment(yearMonth, 'YYYY-MM').endOf('month');
  return { start: start.toDate(), end: end.toDate() };
};

// ═══════════════════════════════════════════════════════════
// تنظيف البيانات (إزالة الحقول غير المرغوبة)
// ═══════════════════════════════════════════════════════════
exports.sanitizeData = (data, allowedFields) => {
  const sanitized = {};
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      sanitized[field] = data[field];
    }
  });
  return sanitized;
};

// ═══════════════════════════════════════════════════════════
// ✅ تنظيف الأرقام المالية — الحل الجذري لمشكلة floating point
//
// الفكرة: كل رقم مالي يُحوَّل إلى قروش (integer) ثم يُعاد
// تحويله إلى جنيه. هذا يضمن عدم وجود كسور خفية مثل:
//   999.9999999 → 100000 قرش → 1000.00 جنيه ✅
//
// الاستخدام:
//   safeAmount(1000)        → 1000
//   safeAmount(999.9999)    → 1000
//   safeAmount("1000.005")  → 1000.01
//   safeAmount(null)        → 0
// ═══════════════════════════════════════════════════════════
exports.safeAmount = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const num = parseFloat(String(value).trim());
  if (isNaN(num)) return 0;
  // تحويل إلى قروش كـ integer ثم إرجاعه كجنيه
  return Math.round(num * 100) / 100;
};

// ─── تحويل أي قيمة إلى قروش (integer) ───────────────────
exports.toCents = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const num = parseFloat(String(value).trim());
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
};

// ─── تحويل القروش إلى جنيه ───────────────────────────────
exports.fromCents = (cents) => {
  if (cents === null || cents === undefined) return 0;
  return Math.round(Number(cents)) / 100;
};
