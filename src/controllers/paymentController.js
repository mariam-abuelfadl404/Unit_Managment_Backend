// controllers/paymentController.js
const Payment      = require('../models/Payment');
const Unit         = require('../models/Block');
const Tenant       = require('../models/Tenant');
const ActivityLog  = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const { generateReceiptNumber } = require('../utils/helpers');
const { MESSAGES } = require('../config/constants');
const moment = require('moment');

// ─── تحويل الجنيه إلى قروش (عدد صحيح) ─────────────────────
const toCents = (amount) => {
  if (amount === undefined || amount === null) return 0;
  // ✅ إصلاح: نضمن إن القيمة رقم نظيف قبل الضرب
  const num = parseFloat(String(amount).trim());
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
};

// ─── تحويل القروش إلى جنيه (بمنزلتين عشريتين) ─────────────
const fromCents = (cents) => {
  if (cents === undefined || cents === null) return 0;
  // ✅ إصلاح: استخدام Math.round أولاً لضمان عدد صحيح نظيف
  return Math.round(Number(cents)) / 100;
};

// ─── تحديث حالة الدفعة بناءً على المتبقي (بالقروش) ─────────
function updatePaymentStatus(payment) {
  const amountCents = toCents(payment.amount);
  const paidCents = toCents(payment.amountPaid || 0);
  const remainingCents = amountCents - paidCents;
  const newStatus = (remainingCents <= 0) ? 'paid' : 'overdue';
  if (payment.status !== newStatus) {
    payment.status = newStatus;
    if (newStatus === 'overdue') {
      const today = new Date();
      payment.daysOverdue = Math.floor((today - payment.dueDate) / (1000 * 60 * 60 * 24));
    }
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// تسجيل دفعة (يدعم الدفعات الجزئية المتعددة لنفس الشهر)
// ═══════════════════════════════════════════════════════════
exports.recordPayment = async (req, res) => {
  try {
    const { unitId, tenantId, monthYear, paymentMethod, notes, paidBy } = req.body;

    // ✅ إصلاح: تحويل المبلغ القادم من الـ frontend عبر toCents مباشرة
    const amountCents = toCents(req.body.amount);
    if (amountCents <= 0) {
      return res.status(400).json({ success: false, error: 'المبلغ يجب أن يكون رقماً أكبر من صفر' });
    }

    let payment = await Payment.findOne({ unitId, tenantId, monthYear, isDeleted: { $ne: true } });

    if (!payment) {
      const unit = await Unit.findById(unitId);
      const tenant = await Tenant.findById(tenantId);
      if (!unit || !tenant) {
        return res.status(404).json({ success: false, error: 'بيانات غير مكتملة' });
      }

      const dueDate = moment(monthYear, 'YYYY-MM').date(unit.paymentDueDay || 1).toDate();

      // ✅ إصلاح: تمرير monthlyRent عبر toCents/fromCents لضمان دقته
      const rentCents = toCents(unit.monthlyRent);
      payment = await Payment.create({
        unitId,
        unitNumber: unit.unitNumber,
        tenantId,
        tenantName: tenant.name,
        amount: fromCents(rentCents),
        amountPaid: 0,
        monthYear,
        dueDate,
        status: 'overdue',
        receiptNumber: generateReceiptNumber(),
        paymentMethod,
        notes,
        paidBy,
        receivedBy: req.user._id
      });
    }

    // ✅ إصلاح: جمع القروش كأعداد صحيحة ثم التحويل مرة واحدة في النهاية
    const currentPaidCents = toCents(payment.amountPaid);
    const newPaidCents = currentPaidCents + amountCents;
    payment.amountPaid = fromCents(newPaidCents);
    payment.paymentDate = new Date();
    payment.paymentMethod = paymentMethod || payment.paymentMethod;
    payment.notes = notes || payment.notes;
    payment.paidBy = paidBy;
    payment.receivedBy = req.user._id;

    updatePaymentStatus(payment);
    await payment.save();

    // تحديث إجماليات المستأجر
    const tenant = await Tenant.findById(tenantId);
    const tenantPaidCents = toCents(tenant.totalPaid);
    const tenantDueCents = toCents(tenant.totalDue);
    const newTenantPaidCents = tenantPaidCents + amountCents;
    tenant.totalPaid = fromCents(newTenantPaidCents);
    tenant.balance = fromCents(newTenantPaidCents - tenantDueCents);
    await tenant.save();

    const remainingCents = toCents(payment.amount) - toCents(payment.amountPaid);
    const remaining = fromCents(Math.max(remainingCents, 0));

    await ActivityLog.create({
      unitId, tenantId,
      activityType: 'payment',
      description: `دفعة ${monthYear} بمبلغ ${fromCents(amountCents)} جنيه - المتبقي: ${remaining}`,
      performedBy: req.user._id
    });

    // إشعار بعد كل دفعة — سواء جزئية أو كاملة
    if (remaining > 0) {
      // لا تزال متأخرة — أرسل إشعار بالمتبقي المحدّث
      await Notification.create({
        type: 'overdue_payment',
        title: `دفعة جزئية - وحدة ${payment.unitNumber}`,
        message: `المستأجر ${payment.tenantName} دفع ${fromCents(amountCents).toLocaleString('ar-EG')} ج.م من إيجار ${payment.monthYear}، المتبقي ${remaining.toLocaleString('ar-EG')} ج.م`,
        relatedTenant: payment.tenantId,
        relatedUnit: payment.unitId,
        relatedPayment: payment._id,
        severity: 'warning'
      });
      // نعيد overdueAlertSent لـ false حتى يُرسل إشعار عند الدفعة التالية أيضاً
      payment.overdueAlertSent = false;
    } else {
      // تمّ السداد الكامل — أرسل إشعار تأكيد
      await Notification.create({
        type: 'payment_reminder',
        title: `تم السداد الكامل - وحدة ${payment.unitNumber}`,
        message: `المستأجر ${payment.tenantName} سدّد كامل إيجار ${payment.monthYear} بمبلغ ${fromCents(toCents(payment.amount)).toLocaleString('ar-EG')} ج.م`,
        relatedTenant: payment.tenantId,
        relatedUnit: payment.unitId,
        relatedPayment: payment._id,
        severity: 'info'
      });
      payment.overdueAlertSent = true;
    }

    await payment.save();

    res.json({ success: true, data: payment, message: 'تم تسجيل الدفعة بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// جلب كل الدفعات (مع تحديث الحالة أولاً)
// ═══════════════════════════════════════════════════════════
exports.getAllPayments = async (req, res) => {
  try {
    const all = await Payment.find({ isDeleted: { $ne: true } });
    for (const p of all) {
      if (updatePaymentStatus(p)) await p.save();
    }

    const { status, monthYear, unitId, tenantId, page = 1, limit = 20 } = req.query;
    const query = { isDeleted: { $ne: true } };
    if (status) query.status = status;
    if (monthYear) query.monthYear = monthYear;
    if (unitId) query.unitId = unitId;
    if (tenantId) query.tenantId = tenantId;

    const payments = await Payment.find(query)
      .sort({ dueDate: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Payment.countDocuments(query);
    res.json({ success: true, data: payments, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// إجمالي الشهر (لصفحة الدفعات)
// ═══════════════════════════════════════════════════════════
exports.getMonthlyTotal = async (req, res) => {
  try {
    const targetMonth = req.query.monthYear || new Date().toISOString().slice(0, 7);
    const payments = await Payment.find({ monthYear: targetMonth, isDeleted: { $ne: true } });

    for (const p of payments) {
      if (updatePaymentStatus(p)) await p.save();
    }

    // ✅ إصلاح: كل الحسابات بالقروش ثم التحويل في النهاية
    let totalPaidCents = 0;
    let totalOverdueCents = 0;
    let counts = { paid: 0, overdue: 0 };
    const overdueList = [];

    for (const p of payments) {
      const amountCents = toCents(p.amount);
      const paidCents = toCents(p.amountPaid);
      const remainingCents = amountCents - paidCents;

      // ✅ المدفوع = amountPaid الفعلي دايماً (مش amount الكامل)
      totalPaidCents += paidCents;

      if (remainingCents <= 0) {
        counts.paid++;
      } else {
        // ✅ المتأخر = المتبقي الفعلي بس (مش amount الكامل)
        totalOverdueCents += remainingCents;
        counts.overdue++;
        overdueList.push({
          _id: p._id,
          unitNumber: p.unitNumber,
          tenantName: p.tenantName,
          remaining: fromCents(remainingCents),
          daysOverdue: p.daysOverdue
        });
      }
    }

    res.json({
      success: true,
      data: {
        month: targetMonth,
        totals: {
          paid: fromCents(totalPaidCents),
          overdue: fromCents(totalOverdueCents),
        },
        counts,
        overdueList
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// تحديث المتأخرات يدوياً
// ═══════════════════════════════════════════════════════════
exports.refreshOverdue = async (req, res) => {
  try {
    const payments = await Payment.find({ isDeleted: { $ne: true } });
    let updated = 0;
    for (const p of payments) {
      if (updatePaymentStatus(p)) {
        await p.save();
        updated++;
      }
    }
    res.json({ success: true, message: `تم تحديث ${updated} دفعة` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// دفعات مستأجر معين
// ═══════════════════════════════════════════════════════════
exports.getPaymentsByTenant = async (req, res) => {
  try {
    const payments = await Payment.find({ tenantId: req.params.tenantId, isDeleted: { $ne: true } }).sort({ dueDate: -1 });
    for (const p of payments) {
      if (updatePaymentStatus(p)) await p.save();
    }
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// دفعات وحدة معينة
// ═══════════════════════════════════════════════════════════
exports.getPaymentsByUnit = async (req, res) => {
  try {
    const payments = await Payment.find({ unitId: req.params.unitId, isDeleted: { $ne: true } }).sort({ dueDate: -1 });
    for (const p of payments) {
      if (updatePaymentStatus(p)) await p.save();
    }
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// دفعة واحدة
// ═══════════════════════════════════════════════════════════
exports.getPayment = async (req, res) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!payment) return res.status(404).json({ success: false, error: 'الدفعة غير موجودة' });
    if (updatePaymentStatus(payment)) await payment.save();
    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// تعديل دفعة (admin فقط)
// ═══════════════════════════════════════════════════════════
exports.updatePayment = async (req, res) => {
  try {
    // ✅ إصلاح: تمرير القيم عبر toCents/fromCents لضمان دقتها
    if (req.body.amount !== undefined) req.body.amount = fromCents(toCents(req.body.amount));
    if (req.body.amountPaid !== undefined) req.body.amountPaid = fromCents(toCents(req.body.amountPaid));
    const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!payment) return res.status(404).json({ success: false, error: 'الدفعة غير موجودة' });
    if (updatePaymentStatus(payment)) await payment.save();
    res.json({ success: true, data: payment, message: MESSAGES.SUCCESS.UPDATED });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// حذف دفعة (soft delete)
// ═══════════════════════════════════════════════════════════
exports.deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id },
      { new: true }
    );
    if (!payment) return res.status(404).json({ success: false, error: 'الدفعة غير موجودة' });
    res.json({ success: true, message: MESSAGES.SUCCESS.DELETED });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// كل الدفعات المتأخرة — مع رقم هاتف المستأجر للـ Dashboard
// ═══════════════════════════════════════════════════════════
exports.getOverduePayments = async (req, res) => {
  try {
    const payments = await Payment.find({ status: 'overdue', isDeleted: { $ne: true } })
      .sort({ dueDate: 1 });

    // جلب أرقام الهاتف من Tenant دفعة واحدة
    const tenantIds = [...new Set(payments.map(p => p.tenantId?.toString()).filter(Boolean))];
    const tenants   = await Tenant.find({ _id: { $in: tenantIds } }).select('phone');
    const phoneMap  = {};
    for (const t of tenants) phoneMap[t._id.toString()] = t.phone;

    const data = payments.map(p => {
      const remainingCents = toCents(p.amount) - toCents(p.amountPaid || 0);
      return {
        _id:         p._id,
        unitNumber:  p.unitNumber,
        tenantId:    p.tenantId,
        tenantName:  p.tenantName,
        tenantPhone: phoneMap[p.tenantId?.toString()] || null,
        amount:      p.amount,
        amountPaid:  p.amountPaid,
        remaining:   fromCents(Math.max(remainingCents, 0)),
        monthYear:   p.monthYear,
        dueDate:     p.dueDate,
        daysOverdue: p.daysOverdue
      };
    });

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
