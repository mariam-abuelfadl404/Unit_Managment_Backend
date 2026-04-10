// controllers/analyticsController.js
const Unit    = require('../models/Block');
const Payment = require('../models/Payment');
const Tenant  = require('../models/Tenant');
const moment  = require('moment');

// ─── helper: جنيه → قروش ────────────────────────────────────
const toCents = (v) => {
  if (v === undefined || v === null) return 0;
  const n = parseFloat(String(v).trim());
  return isNaN(n) ? 0 : Math.round(n * 100);
};

// ═══════════════════════════════════════════════════════════
// Dashboard Stats
// ═══════════════════════════════════════════════════════════
exports.getDashboardStats = async (req, res) => {
  try {
    const currentMonth = moment().format('YYYY-MM');

    const totalUnits    = await Unit.countDocuments();
    const occupiedUnits = await Unit.countDocuments({ status: 'occupied' });
    const emptyUnits    = await Unit.countDocuments({ status: 'empty' });
    const occupancyRate = totalUnits > 0
      ? parseFloat(((occupiedUnits / totalUnits) * 100).toFixed(2)) : 0;

    const totalTenants  = await Tenant.countDocuments({ isActive: true });
    const activeTenants = await Tenant.countDocuments({
      isActive: true, 'activeUnits.0': { $exists: true }
    });

    // إجمالي الإيرادات المحصّلة كلها
    const totalRevenueAgg = await Payment.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // الشهر الحالي — المدفوع = amountPaid الفعلي، المتأخر = المتبقي
    const monthPayments = await Payment.find({ monthYear: currentMonth, isDeleted: { $ne: true } })
      .select('status amount amountPaid');
    const monthly = { paid: 0, pending: 0, overdue: 0 };
    const monthlyCounts = { paid: 0, pending: 0, overdue: 0 };
    for (const p of monthPayments) {
      const paidC = Math.round(toCents(p.amountPaid || 0));
      const remainingC = Math.round(toCents(p.amount) - paidC);
      // المدفوع الفعلي
      monthly.paid += paidC;
      monthlyCounts.paid += paidC > 0 ? 1 : 0;
      if (remainingC > 0) {
        monthly.overdue += remainingC;
        monthlyCounts.overdue++;
      }
    }
    // تحويل من قروش لجنيه
    monthly.paid    = monthly.paid    / 100;
    monthly.overdue = monthly.overdue / 100;
    monthlyCounts.paid = monthPayments.filter(p => toCents(p.amountPaid) >= toCents(p.amount)).length;

    // المتأخرات الكلية — المتبقي الفعلي (amount - amountPaid) مش amount كامل
    const overduePayments = await Payment.find({ status: 'overdue', isDeleted: { $ne: true } })
      .select('amount amountPaid');
    let overdueTotal = 0;
    let overdueCount = 0;
    for (const p of overduePayments) {
      const remaining = Math.round(toCents(p.amount) - toCents(p.amountPaid || 0));
      if (remaining > 0) { overdueTotal += remaining; overdueCount++; }
    }

    // الإيراد الشهري المتوقع
    const occupiedList = await Unit.find({ status: 'occupied' }).select('monthlyRent');
    const expectedMonthly = occupiedList.reduce((s, u) => s + (u.monthlyRent || 0), 0);

    // عقود تنتهي قريباً
    const soonExpiry = await Tenant.countDocuments({
      isActive: true,
      contractEndDate: { $gte: new Date(), $lte: moment().add(30, 'days').toDate() }
    });

    res.json({
      success: true,
      data: {
        units: { total: totalUnits, occupied: occupiedUnits, empty: emptyUnits, occupancyRate },
        tenants: { total: totalTenants, active: activeTenants, soonExpiry },
        revenue: {
          total: totalRevenueAgg[0]?.total || 0,
          expectedMonthly,
          overdue: overdueTotal / 100,
          overdueCount
        },
        thisMonth: {
          month: currentMonth,
          collected: monthly.paid,
          collectedCount: monthlyCounts.paid,
          pending: monthly.pending,
          pendingCount: monthlyCounts.pending,
          overdue: monthly.overdue,
          overdueCount: monthlyCounts.overdue,
          collectionRate: expectedMonthly > 0
            ? parseFloat(((monthly.paid / expectedMonthly) * 100).toFixed(1)) : 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getDashboardSummary = exports.getDashboardStats;

// ═══════════════════════════════════════════════════════════
// معدل الإشغال
// ═══════════════════════════════════════════════════════════
exports.getOccupancyRate = async (req, res) => {
  try {
    const total    = await Unit.countDocuments();
    const occupied = await Unit.countDocuments({ status: 'occupied' });
    res.json({
      success: true,
      data: {
        total, occupied, empty: total - occupied,
        occupancyRate: total > 0 ? parseFloat(((occupied / total) * 100).toFixed(2)) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// الإيراد الشهري (للرسم البياني)
// ═══════════════════════════════════════════════════════════
exports.getRevenueByMonth = async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || moment().year();

    const revenueData = await Payment.aggregate([
      {
        $match: {
          status: 'paid',
          paymentDate: {
            $gte: moment(`${currentYear}-01-01`).toDate(),
            $lte: moment(`${currentYear}-12-31`).toDate()
          }
        }
      },
      { $group: { _id: { $month: '$paymentDate' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const found = revenueData.find(d => d._id === i + 1);
      return { month: i + 1, monthName: moment().month(i).format('MMM'), revenue: found?.total || 0, count: found?.count || 0 };
    });

    res.json({ success: true, data: monthlyData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// التدفق النقدي الشهري
// ═══════════════════════════════════════════════════════════
exports.getMonthlyCashFlow = async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const startDate = moment().subtract(parseInt(months), 'months').startOf('month').toDate();

    const cashFlow = await Payment.aggregate([
      { $match: { status: 'paid', paymentDate: { $gte: startDate } } },
      {
        $group: {
          _id: { year: { $year: '$paymentDate' }, month: { $month: '$paymentDate' } },
          total: { $sum: '$amount' }, count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const data = cashFlow.map(item => ({
      year: item._id.year, month: item._id.month,
      monthName: moment(`${item._id.year}-${item._id.month}`, 'YYYY-M').format('MMM YYYY'),
      revenue: item.total, count: item.count
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// أفضل المستأجرين
// ═══════════════════════════════════════════════════════════
exports.getTopTenants = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const topTenants = await Payment.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: '$tenantId', tenantName: { $first: '$tenantName' }, totalPaid: { $sum: '$amount' }, paymentCount: { $sum: 1 } } },
      { $sort: { totalPaid: -1 } },
      { $limit: parseInt(limit) }
    ]);
    res.json({ success: true, data: topTenants });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// نظرة عامة على حالات الدفع
// ═══════════════════════════════════════════════════════════
exports.getPaymentStatusOverview = async (req, res) => {
  try {
    const distribution = await Payment.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } }
    ]);
    res.json({ success: true, data: distribution.map(s => ({ status: s._id, count: s.count, amount: s.totalAmount })) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// أداء المستأجرين
// ═══════════════════════════════════════════════════════════
exports.getTenantPerformance = async (req, res) => {
  try {
    const performance = await Payment.aggregate([
      {
        $group: {
          _id: '$tenantId', tenantName: { $first: '$tenantName' },
          totalAmount:  { $sum: '$amount' },
          paidCount:    { $sum: { $cond: [{ $eq: ['$status', 'paid'] },    1, 0] } },
          overdueCount: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
          totalCount:   { $sum: 1 }
        }
      },
      { $addFields: { paymentRate: { $multiply: [{ $divide: ['$paidCount', { $max: ['$totalCount', 1] }] }, 100] } } },
      { $sort: { paymentRate: -1 } }
    ]);
    res.json({ success: true, data: performance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// تقرير مخصص بفترة زمنية
// ═══════════════════════════════════════════════════════════
exports.getCustomReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'الرجاء تحديد تاريخ البداية والنهاية' });
    }
    const payments = await Payment.find({
      paymentDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
    }).sort({ paymentDate: -1 });

    const summary = {
      totalRevenue: payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0),
      totalOverdue: payments.filter(p => p.status === 'overdue').reduce((s, p) => s + p.amount, 0),
      totalPending: payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0),
      count: payments.length
    };
    res.json({ success: true, data: payments, summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};