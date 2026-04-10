const mongoose = require('mongoose');

const tenantNoteSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
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

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // ─── Soft Delete ──────────────────────────────────────────
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

tenantNoteSchema.index({ tenantId: 1, date: -1 });

module.exports = mongoose.model('TenantNote', tenantNoteSchema);