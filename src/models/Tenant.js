const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true
  },
  phone2: {
    type: String,
    default: null
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  nationalId: {
    type: String,
    required: true,
    unique: true
  },
  address: String,

  companyName: String,
  taxId: String,

  firstRentalDate: {
    type: Date,
    default: null
  },
  contractStartDate: {
    type: Date,
    default: null
  },
  contractEndDate: {
    type: Date,
    default: null
  },

  activeUnits: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  }],

  totalPaid: {
    type: Number,
    default: 0
  },
  totalDue: {
    type: Number,
    default: 0
  },
  balance: {
    type: Number,
    default: 0
  },

  isActive: {
    type: Boolean,
    default: true
  },
  notes: String
}, { timestamps: true });

tenantSchema.virtual('hasOverdue').get(function () {
  return this.balance < 0;
});

// ❌ شيل دي
// tenantSchema.index({ nationalId: 1 });

// ✅ الباقي تمام
tenantSchema.index({ phone: 1 });
tenantSchema.index({ contractEndDate: 1 });
tenantSchema.index({ isActive: 1 });

module.exports = mongoose.model('Tenant', tenantSchema);