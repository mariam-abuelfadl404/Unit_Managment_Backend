const mongoose = require('mongoose');

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
  monthlyRent: {
    type: Number,
    default: 0
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
    monthlyRent: Number,
    totalPaid: Number,
    totalDue: Number,
    balance: Number,
    notes: String
  }],

  notes: String
}, { timestamps: true });

// ❌ شيل دي
// unitSchema.index({ unitNumber: 1 });

// ✅ سيبي الباقي عادي
unitSchema.index({ status: 1 });
unitSchema.index({ currentTenant: 1 });
unitSchema.index({ rentalEndDate: 1 });

module.exports = mongoose.model('Unit', unitSchema);