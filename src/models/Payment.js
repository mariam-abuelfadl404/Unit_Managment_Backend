const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // ─── الوحدة والمستأجر ─────────────────────────────────────
  unitId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  unitNumber: { type: String, required: true },
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  tenantName: { type: String, required: true },

  // ─── المبالغ ───────────────────────────────────────────────
  amount:     { type: Number, required: true, min: 0 }, // المبلغ المطلوب الكلي
  amountPaid: { type: Number, default: 0,     min: 0 }, // المدفوع فعلاً (يتراكم)
  amountDue:  { type: Number, default: 0,     min: 0 }, // المتبقي = amount - amountPaid

  // ─── التواريخ ──────────────────────────────────────────────
  monthYear:   { type: String, required: true },  // "2025-01"
  dueDate:     { type: Date,   required: true },  // يوم الاستحقاق
  paymentDate: { type: Date,   default: null  },  // تاريخ آخر دفع فعلي

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

// ─── pre-save: حساب amountDue و daysOverdue ────────────────
paymentSchema.pre('save', function (next) {
  this.amountDue = Math.max(0, (this.amount || 0) - (this.amountPaid || 0));

  if (this.status === 'overdue' && this.dueDate) {
    const diff = Math.floor((new Date() - this.dueDate) / (1000 * 60 * 60 * 24));
    this.daysOverdue = diff > 0 ? diff : 0;
  }
  next();
});

// ─── Indexes ──────────────────────────────────────────────
paymentSchema.index({ tenantId: 1, monthYear: 1 });
paymentSchema.index({ unitId: 1,   monthYear: 1 });
paymentSchema.index({ status: 1,   dueDate:   1 });
paymentSchema.index({ monthYear: 1 });
paymentSchema.index({ isDeleted: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);