const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['payment_reminder', 'contract_expiry', 'overdue_payment', 'system'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedTenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant'
  },
  relatedUnit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  },
  relatedPayment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'urgent'],
    default: 'info'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date
}, { timestamps: true });

notificationSchema.index({ isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ relatedTenant: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);