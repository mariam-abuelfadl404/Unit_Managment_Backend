const mongoose = require('mongoose');

const unitNoteSchema = new mongoose.Schema({
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
    required: true
  },
  // ─── ربط الملاحظة بالمستأجر — حتى لا تظهر عند تأجير جديد ──
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null
  },
  date: {
    type: String,   // "YYYY-MM-DD"
    required: true
  },
  text: {
    type: String,
    trim: true,
    default: ''
  },

  // ─── حركة المخزن اليومية (اختياري) ───────────────────────
  parcelCount: {                   // عدد الطرود
    type: Number,
    default: null
  },
  cargoType: {                     // نوع البضاعة
    type: String,
    enum: ['import', 'export', 'storage', 'packaging', null],
    default: null
  },
  importFrom: {                    // واردات من (بلد/مدينة/مورّد)
    type: String,
    trim: true,
    default: null
  },
  exportTo: {                      // صادرات إلى (بلد/مدينة/عميل)
    type: String,
    trim: true,
    default: null
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

unitNoteSchema.index({ unitId: 1, date: -1 });
unitNoteSchema.index({ tenantId: 1, date: -1 });

module.exports = mongoose.model('UnitNote', unitNoteSchema);
