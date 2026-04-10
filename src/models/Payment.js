const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // ─── الوحدة والمستأجر ─────────────────────────────────────
  unitId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  unitNumber: { type: String, required: true },
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  tenantName: { type: String, required: true },

  // ─── المبالغ ───────────────────────────────────────────────
  amount:     { type: Number, required: true, min: 0 },
  amountPaid: { type: Number, default: 0,     min: 0 },
  amountDue:  { type: Number, default: 0,     min: 0 },

  // ─── التواريخ ──────────────────────────────────────────────
  monthYear:   { type: String, required: true },
  dueDate:     { type: Date,   required: true },
  paymentDate: { type: Date,   default: null  },

  // ─── الحالة ───────────────────────────────────────────────
  status: {
    type: String,
    enum: ['paid', 'pending', 'overdue', 'partial'],
    default: 'pending'
  },

  // ─── طريقة الدفع ──────────────────────────────────────────
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'wallet', 'instapay', null],
    default: null
  },

  // ─── إشعار التأخير ────────────────────────────────────────
  overdueAlertSent: { type: Boolean, default: false },
  overdueAlertDate: { type: Date,    default: null  },
  daysOverdue:      { type: Number,  default: 0     },

  // ─── بيانات إضافية ────────────────────────────────────────
  receiptNumber: String,
  paidBy:        String,
  receivedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:         String,

  // ─── Soft Delete ──────────────────────────────────────────
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date,    default: null  },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }

}, { timestamps: true });

// ✅ Fix: Mongoose v8 لا يحتاج next في الـ hooks
paymentSchema.pre('save', function () {
  this.amountDue = Math.max(0, (this.amount || 0) - (this.amountPaid || 0));

  if (this.status === 'overdue' && this.dueDate) {
    const diff = Math.floor((new Date() - this.dueDate) / (1000 * 60 * 60 * 24));
    this.daysOverdue = diff > 0 ? diff : 0;
  }
});

// ─── Indexes ──────────────────────────────────────────────
paymentSchema.index({ tenantId: 1, monthYear: 1 });
paymentSchema.index({ unitId: 1,   monthYear: 1 });
paymentSchema.index({ status: 1,   dueDate:   1 });
paymentSchema.index({ monthYear: 1 });
paymentSchema.index({ isDeleted: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
