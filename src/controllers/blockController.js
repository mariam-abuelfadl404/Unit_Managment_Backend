// controllers/unitController.js
const Unit         = require('../models/Block');
const UnitNote     = require('../models/UnitNote');
const Tenant       = require('../models/Tenant');
const Payment      = require('../models/Payment');
const ActivityLog  = require('../models/ActivityLog');
const { MESSAGES } = require('../config/constants');

// ═══════════════════════════════════════════════════════════
// جميع الوحدات
// ═══════════════════════════════════════════════════════════
exports.getAllUnits = async (req, res) => {
  try {
    const { status, search } = req.query;

    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { unitNumber:        new RegExp(search, 'i') },
        { currentTenantName: new RegExp(search, 'i') },
      ];
    }

    const units = await Unit.find(query)
      .populate('currentTenant', 'name phone nationalId')
      .sort({ unitNumber: 1 });

    res.json({ success: true, data: units, count: units.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// وحدة واحدة
// ═══════════════════════════════════════════════════════════
exports.getUnit = async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.unitId)
      .populate('currentTenant', 'name phone email nationalId');

    if (!unit) return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });

    const payments = await Payment.find({ unitId: unit._id })
      .sort({ dueDate: -1 }).limit(12);

    const overdueAgg = await Payment.aggregate([
      { $match: { unitId: unit._id, status: 'overdue' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      data: { unit, recentPayments: payments, overdueTotal: overdueAgg[0]?.total || 0 }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// إنشاء وحدة
// ═══════════════════════════════════════════════════════════
exports.createUnit = async (req, res) => {
  try {
    const unit = await Unit.create(req.body);
    res.status(201).json({ success: true, data: unit, message: 'تم إنشاء الوحدة بنجاح' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// تحديث وحدة
// ═══════════════════════════════════════════════════════════
exports.updateUnit = async (req, res) => {
  try {
    const unit = await Unit.findByIdAndUpdate(
      req.params.unitId, req.body, { new: true, runValidators: true }
    );
    if (!unit) return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });
    res.json({ success: true, data: unit, message: MESSAGES.SUCCESS.UPDATED });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// بدء إيجار
// ═══════════════════════════════════════════════════════════
exports.startRental = async (req, res) => {
  try {
    const { unitId } = req.params;
    const {
      tenantId, monthlyRent, startDate, endDate,
      paymentDueDay, hasLock, notes
    } = req.body;

    const unit = await Unit.findById(unitId);
    if (!unit) return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });
    if (unit.status === 'occupied') return res.status(400).json({ success: false, error: MESSAGES.ERROR.UNIT_OCCUPIED });

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ success: false, error: 'المستأجر غير موجود' });

    const rentalStart = startDate ? new Date(startDate) : new Date();

    unit.status             = 'occupied';
    unit.currentTenant      = tenantId;
    unit.currentTenantName  = tenant.name;
    unit.currentTenantPhone = tenant.phone;
    unit.monthlyRent        = monthlyRent || unit.monthlyRent;
    unit.rentalStartDate    = rentalStart;
    unit.rentalEndDate      = endDate ? new Date(endDate) : null;
    unit.paymentDueDay      = paymentDueDay || unit.paymentDueDay;
    unit.hasLock            = hasLock === true || hasLock === 'true';
    unit.notes              = notes || unit.notes;
    await unit.save();

    if (!tenant.activeUnits.includes(unitId)) tenant.activeUnits.push(unitId);
    if (!tenant.firstRentalDate) tenant.firstRentalDate = rentalStart;
    tenant.contractStartDate = rentalStart;
    tenant.contractEndDate   = endDate ? new Date(endDate) : null;
    await tenant.save();

    await ActivityLog.create({
      unitId, tenantId,
      activityType: 'rental_start',
      description: `بدء إيجار الوحدة ${unit.unitNumber} للمستأجر ${tenant.name} بإيجار ${unit.monthlyRent} جنيه/شهر`,
      performedBy: req.user._id,
      metadata: {
        monthlyRent: unit.monthlyRent, startDate: rentalStart, endDate,
        hasLock: unit.hasLock
      }    });

    res.json({ success: true, data: unit, message: MESSAGES.SUCCESS.RENTAL_STARTED });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// إنهاء إيجار
// ═══════════════════════════════════════════════════════════
exports.endRental = async (req, res) => {
  try {
    const { unitId } = req.params;
    const { endDate, notes } = req.body;

    const unit = await Unit.findById(unitId);
    if (!unit) return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });
    if (unit.status === 'empty') return res.status(400).json({ success: false, error: MESSAGES.ERROR.UNIT_EMPTY });

    const tenant    = await Tenant.findById(unit.currentTenant);
    const rentalEnd = endDate ? new Date(endDate) : new Date();

    const payments = await Payment.find({ unitId, tenantId: unit.currentTenant });

    // totalPaid = مجموع ما دُفع فعلاً (amountPaid) — وليس المبلغ الكامل للدفعة
    const toCents = (v) => Math.round(Number(v || 0) * 100);
    const fromCents = (c) => Math.round(c) / 100;

    const totalPaidCents = payments.reduce((s, p) => s + toCents(p.amountPaid), 0);
    const totalDueCents  = payments.reduce((s, p) => s + toCents(p.amount), 0);

    const totalPaid = fromCents(totalPaidCents);
    const totalDue  = fromCents(totalDueCents);
    const balance   = fromCents(totalPaidCents - totalDueCents);

    unit.rentalHistory.push({
      tenantId:    unit.currentTenant,
      tenantName:  unit.currentTenantName,
      startDate:   unit.rentalStartDate,
      endDate:     rentalEnd,
      monthlyRent: unit.monthlyRent,
      totalPaid, totalDue, balance,
      notes
    });

    const prevTenantId   = unit.currentTenant;
    const prevTenantName = unit.currentTenantName;
    const prevStartDate  = unit.rentalStartDate;

    unit.status             = 'empty';
    unit.currentTenant      = null;
    unit.currentTenantName  = null;
    unit.currentTenantPhone = null;
    unit.rentalStartDate    = null;
    unit.rentalEndDate      = null;
    unit.cargoType          = null;
    unit.hasLock            = false;
    await unit.save();

    if (tenant) {
      tenant.activeUnits  = tenant.activeUnits.filter(id => id.toString() !== unitId);
      tenant.totalPaid   += totalPaid;
      tenant.totalDue    += totalDue;
      tenant.balance      = tenant.totalPaid - tenant.totalDue;
      if (tenant.activeUnits.length === 0) {
        tenant.contractStartDate = null;
        tenant.contractEndDate   = null;
      }
      await tenant.save();
    }

    await ActivityLog.create({
      unitId, tenantId: prevTenantId,
      activityType: 'rental_end',
      description: `إنهاء إيجار الوحدة ${unit.unitNumber} — إجمالي مدفوع: ${totalPaid} — الرصيد: ${balance}`,
      performedBy: req.user._id,
      metadata: { totalPaid, totalDue, balance, endDate: rentalEnd }
    });

    res.json({
      success: true,
      message: MESSAGES.SUCCESS.RENTAL_ENDED,
      data: {
        unit,
        rentalSummary: {
          tenantName: prevTenantName,
          startDate:  prevStartDate,
          endDate:    rentalEnd,
          totalPaid, totalDue, balance,
          hasDebt:   balance < 0,
          hasCredit: balance > 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// تقرير الوحدة
// ═══════════════════════════════════════════════════════════
exports.getUnitReport = async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.unitId)
      .populate('currentTenant', 'name phone');

    if (!unit) return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });

    const payments = await Payment.find({ unitId: unit._id }).sort({ dueDate: -1 });

    const stats = {
      totalCollected: payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0),
      totalPending:   payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0),
      totalOverdue:   payments.filter(p => p.status === 'overdue').reduce((s, p) => s + p.amount, 0),
      paymentsCount:  payments.length
    };

    res.json({ success: true, data: { unit, payments, stats, rentalHistory: unit.rentalHistory } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// جلب ملاحظات/حركات الوحدة
// ═══════════════════════════════════════════════════════════
exports.getNotes = async (req, res) => {
  try {
    const notes = await UnitNote.find({ unitId: req.params.unitId })
      .populate('createdBy', 'fullName')
      .sort({ date: -1, createdAt: -1 });
    res.json({ success: true, data: notes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// إضافة ملاحظة / حركة مخزن
// ═══════════════════════════════════════════════════════════
exports.addNote = async (req, res) => {
  try {
    const { date, text, parcelCount, cargoType, importFrom, exportTo } = req.body;

    // يجب أن يكون هناك نص أو حركة مخزن على الأقل
    const hasMovement = parcelCount || cargoType || importFrom || exportTo;
    if (!date || (!text?.trim() && !hasMovement)) {
      return res.status(400).json({
        success: false,
        error: 'التاريخ مطلوب، ويجب إدخال ملاحظة أو حركة مخزن على الأقل'
      });
    }

    const note = await UnitNote.create({
      unitId:     req.params.unitId,
      date,
      text:       text?.trim() || '',
      parcelCount: parcelCount ? Number(parcelCount) : null,
      cargoType:  cargoType   || null,
      importFrom: importFrom  || null,
      exportTo:   exportTo    || null,
      createdBy:  req.user._id
    });

    // populate createdBy قبل الإرجاع
    await note.populate('createdBy', 'fullName');

    res.status(201).json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// حذف ملاحظة
// ═══════════════════════════════════════════════════════════
exports.deleteNote = async (req, res) => {
  try {
    const note = await UnitNote.findOneAndDelete({
      _id:    req.params.noteId,
      unitId: req.params.unitId
    });
    if (!note) return res.status(404).json({ success: false, error: 'الملاحظة غير موجودة' });
    res.json({ success: true, message: 'تم الحذف بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
