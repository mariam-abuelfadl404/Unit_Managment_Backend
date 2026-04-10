const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant'
  },
  activityType: {
    type: String,
    enum: [
      'rental_start',
      'rental_end',
      'payment',
      'note',
      'contract_renewal',
      'price_change',
      'overdue_alert'
    ],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: mongoose.Schema.Types.Mixed,
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

activityLogSchema.index({ unitId: 1, timestamp: -1 });
activityLogSchema.index({ tenantId: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);