// controllers/tenantController.js
const Tenant      = require('../models/Tenant');
const Payment     = require('../models/Payment');
const Unit        = require('../models/Block');
const ActivityLog = require('../models/ActivityLog');
const { MESSAGES } = require('../config/constants');

// ═══════════════════════════════════════════════════════════
// جميع المستأجرين
// ═══════════════════════════════════════════════════════════
exports.getAllTenants = async (req, res) => {
  try {
    const { search, isActive = 'true', page = 1, limit = 20 } = req.query;

    const query = { isActive: isActive === 'true' };

    if (search) {
      query.$or = [
        { name:        new RegExp(search, 'i') },
        { phone:       new RegExp(search, 'i') },
        { nationalId:  new RegExp(search, 'i') },
        { companyName: new RegExp(search, 'i') }
      ];
    }

    const tenants = await Tenant.find(query)
      .populate('activeUnits', 'unitNumber monthlyRent rentalStartDate rentalEndDate status size')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Tenant.countDocuments(query);

    res.json({
      success: true,
      data: tenants,
      pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// مستأجر واحد — بكل تفاصيله
// ═══════════════════════════════════════════════════════════
exports.getTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id)
      .populate('activeUnits', 'unitNumber monthlyRent rentalStartDate rentalEndDate status size hasLock');

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'المستأجر غير موجود' });
    }

    // سجل الدفعات
    const payments = await Payment.find({ tenantId: tenant._id })
      .sort({ dueDate: -1 });

    // إحصائيات الدفعات
    const paymentStats = {
      totalPaid:    payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0),
      totalPending: payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0),
      totalOverdue: payments.filter(p => p.status === 'overdue').reduce((s, p) => s + p.amount, 0),
      paidCount:    payments.filter(p => p.status === 'paid').length,
      overdueCount: payments.filter(p => p.status === 'overdue').length
    };

    // سجل الأنشطة
    const activities = await ActivityLog.find({ tenantId: tenant._id })
      .populate('performedBy', 'fullName')
      .sort({ timestamp: -1 })
      .limit(20);

    res.json({
      success: true,
      data: { tenant, payments, paymentStats, activities }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// إنشاء مستأجر جديد
// ═══════════════════════════════════════════════════════════
exports.createTenant = async (req, res) => {
  try {
    const existing = await Tenant.findOne({ nationalId: req.body.nationalId });
    if (existing) {
      return res.status(400).json({ success: false, error: 'يوجد مستأجر بنفس الرقم القومي' });
    }

    const tenant = await Tenant.create(req.body);

    res.status(201).json({
      success: true,
      data: tenant,
      message: 'تم إضافة المستأجر بنجاح'
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// تحديث مستأجر
// ═══════════════════════════════════════════════════════════
exports.updateTenant = async (req, res) => {
  try {
    if (req.body.nationalId) {
      const existing = await Tenant.findOne({
        nationalId: req.body.nationalId,
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({ success: false, error: 'يوجد مستأجر آخر بنفس الرقم القومي' });
      }
    }

    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'المستأجر غير موجود' });
    }

    res.json({ success: true, data: tenant, message: MESSAGES.SUCCESS.UPDATED });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// حذف مستأجر (Soft Delete)
// ═══════════════════════════════════════════════════════════
exports.deleteTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id).populate('activeUnits');

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'المستأجر غير موجود' });
    }

    if (tenant.activeUnits?.length > 0) {
      return res.status(400).json({ success: false, error: MESSAGES.ERROR.TENANT_HAS_UNITS });
    }

    if (tenant.balance < 0) {
      return res.status(400).json({
        success: false,
        error: `${MESSAGES.ERROR.TENANT_HAS_DUES} - المبلغ المستحق: ${Math.abs(tenant.balance)} جنيه`
      });
    }

    tenant.isActive = false;
    await tenant.save();

    res.json({ success: true, message: MESSAGES.SUCCESS.DELETED });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// تقرير نهاية الإيجار ← هل على المستأجر فلوس ولا لا؟
// ═══════════════════════════════════════════════════════════
exports.getRentalEndReport = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { unitId }   = req.query; // اختياري - لو عايز تقرير وحدة محددة

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'المستأجر غير موجود' });
    }

    const paymentQuery = { tenantId };
    if (unitId) paymentQuery.unitId = unitId;

    const payments = await Payment.find(paymentQuery).sort({ dueDate: 1 });

    const totalPaid    = payments.filter(p => p.status === 'paid' || p.status === 'partial')
                                 .reduce((s, p) => s + p.amount, 0);
    const totalDue     = payments.reduce((s, p) => s + p.amount, 0);
    const balance      = totalPaid - totalDue;
    const overdueItems = payments.filter(p => p.status === 'overdue');

    res.json({
      success: true,
      data: {
        tenant: {
          id:    tenant._id,
          name:  tenant.name,
          phone: tenant.phone,
          nationalId: tenant.nationalId
        },
        financials: {
          totalDue,
          totalPaid,
          balance,
          hasDebt:   balance < 0,        // عليه فلوس
          hasCredit: balance > 0,        // له فلوس
          isSettled: balance === 0       // خلاص
        },
        overduePayments: overdueItems.map(p => ({
          monthYear:   p.monthYear,
          amount:      p.amount,
          dueDate:     p.dueDate,
          daysOverdue: p.daysOverdue,
          unitNumber:  p.unitNumber
        })),
        paymentHistory: payments.map(p => ({
          monthYear:     p.monthYear,
          amount:        p.amount,
          status:        p.status,
          paymentDate:   p.paymentDate,
          paymentMethod: p.paymentMethod,
          receiptNumber: p.receiptNumber,
          unitNumber:    p.unitNumber
        })),
        // رسالة واضحة
        summary: balance < 0
          ? `على المستأجر ${tenant.name} مبلغ ${Math.abs(balance)} جنيه`
          : balance > 0
            ? `للمستأجر ${tenant.name} رصيد ${balance} جنيه`
            : `حساب المستأجر ${tenant.name} صفر - لا توجد مستحقات`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// البحث عن مستأجر
// ═══════════════════════════════════════════════════════════
exports.searchTenant = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ success: false, error: 'أدخل اسم أو رقم قومي أو هاتف' });
    }

    const tenants = await Tenant.find({
      $or: [
        { name:       new RegExp(query, 'i') },
        { nationalId: new RegExp(query, 'i') },
        { phone:      new RegExp(query, 'i') }
      ],
      isActive: true
    }).populate('activeUnits', 'unitNumber monthlyRent');

    res.json({ success: true, data: tenants, count: tenants.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
// ═══════════════════════════════════════════════════════════
// سجل إيجارات المستأجر السابقة (من rentalHistory في الوحدات)
// ═══════════════════════════════════════════════════════════
exports.getRentalHistory = async (req, res) => {
  try {
    const Unit = require('../models/Block');
    const { id } = req.params;

    // كل الوحدات اللي المستأجر ده موجود في تاريخ إيجاراتها
    const units = await Unit.find({ 'rentalHistory.tenantId': id })
      .select('unitNumber size rentalHistory');

    const history = [];
    for (const unit of units) {
      const entries = unit.rentalHistory.filter(
        h => h.tenantId?.toString() === id
      );
      for (const entry of entries) {
        history.push({
          unitId:      unit._id,
          unitNumber:  unit.unitNumber,
          unitSize:    unit.size || null,
          startDate:   entry.startDate,
          endDate:     entry.endDate,
          monthlyRent: entry.monthlyRent,
          totalPaid:   entry.totalPaid,
          totalDue:    entry.totalDue,
          balance:     entry.balance,
          notes:       entry.notes || null
        });
      }
    }

    // الأحدث أولاً
    history.sort((a, b) => new Date(b.endDate || 0) - new Date(a.endDate || 0));

    res.json({ success: true, data: history, count: history.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// ملاحظات المستأجر — جلب
// ═══════════════════════════════════════════════════════════
exports.getNotes = async (req, res) => {
  try {
    const TenantNote = require('../models/TenantNote');
    const notes = await TenantNote.find({
      tenantId: req.params.id,
      isDeleted: { $ne: true }
    })
      .populate('createdBy', 'fullName')
      .sort({ date: -1, createdAt: -1 });
    res.json({ success: true, data: notes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// ملاحظات المستأجر — إضافة
// ═══════════════════════════════════════════════════════════
exports.addNote = async (req, res) => {
  try {
    const TenantNote = require('../models/TenantNote');
    const { date, text } = req.body;

    if (!date || !text?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'التاريخ والملاحظة مطلوبان'
      });
    }

    const note = await TenantNote.create({
      tenantId:  req.params.id,
      date,
      text:      text.trim(),
      createdBy: req.user._id
    });

    await note.populate('createdBy', 'fullName');
    res.status(201).json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// ملاحظات المستأجر — حذف (Soft Delete)
// ═══════════════════════════════════════════════════════════
exports.deleteNote = async (req, res) => {
  try {
    const TenantNote = require('../models/TenantNote');
    const note = await TenantNote.findOneAndUpdate(
      {
        _id:       req.params.noteId,
        tenantId:  req.params.id,
        isDeleted: { $ne: true }
      },
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id },
      { new: true }
    );
    if (!note) return res.status(404).json({ success: false, error: 'الملاحظة غير موجودة' });
    res.json({ success: true, message: 'تم الحذف بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};