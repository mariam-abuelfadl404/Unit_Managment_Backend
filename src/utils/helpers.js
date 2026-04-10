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
