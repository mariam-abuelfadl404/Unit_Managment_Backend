const mongoose = require('mongoose');

// ─── دالة تنظيف الأرقام المالية ──────────────────────────
// تضمن إن أي رقم مالي يُخزَّن بدون floating point error
const safeAmount = (value) => {
  if (value === null || value === undefined) return 0;
  const num = parseFloat(String(value).trim());
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
};

const unitSchema = new mongoose.Schema({
  unitNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  size: {
    type: String,
    trim: true,
    default: null
  },
  status: {
    type: String,
    enum: ['empty', 'occupied'],
    default: 'empty'
  },

  // ✅ إضافة setter لضمان تخزين الإيجار بدون floating point error
  monthlyRent: {
    type: Number,
    default: 0,
    set: safeAmount
  },

  currentTenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null
  },
  currentTenantName: {
    type: String,
    default: null
  },
  currentTenantPhone: {
    type: String,
    default: null
  },
  rentalStartDate: {
    type: Date,
    default: null
  },
  rentalEndDate: {
    type: Date,
    default: null
  },

  hasLock: {
    type: Boolean,
    default: false
  },

  cargoType: {
    type: String,
    enum: ['import', 'export', 'storage', 'packaging', null],
    default: null
  },

  paymentDueDay: {
    type: Number,
    default: 1,
    min: 1,
    max: 28
  },
  overdueAlertDays: {
    type: Number,
    default: 3
  },

  rentalHistory: [{
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
    tenantName: String,
    startDate: Date,
    endDate: Date,
    // ✅ setter للأرقام المالية في تاريخ الإيجار
    monthlyRent: { type: Number, set: safeAmount },
    totalPaid:   { type: Number, set: safeAmount },
    totalDue:    { type: Number, set: safeAmount },
    balance:     { type: Number, set: safeAmount },
    notes: String
  }],

  notes: String
}, { timestamps: true });

unitSchema.index({ status: 1 });
unitSchema.index({ currentTenant: 1 });
unitSchema.index({ rentalEndDate: 1 });

module.exports = mongoose.model('Unit', unitSchema);
