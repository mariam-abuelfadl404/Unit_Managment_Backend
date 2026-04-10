// services/analyticsService.js
const moment = require('moment');
const Block = require('../models/Block');
const Payment = require('../models/Payment');
const Tenant = require('../models/Tenant');
const Store = require('../models/Store');

class AnalyticsService {

  static async getOccupancyRate(storeId = null, period = 'current') {
    try {
      const query = storeId ? { storeId } : {};
      
      const totalBlocks = await Block.countDocuments(query);
      const occupiedBlocks = await Block.countDocuments({ ...query, status: 'occupied' });
      const occupancyRate = totalBlocks > 0 
        ? ((occupiedBlocks / totalBlocks) * 100).toFixed(2) : 0;
      const historicalData = await this.getHistoricalOccupancy(storeId);
      return {
        current: {
          total: totalBlocks, occupied: occupiedBlocks,
          empty: totalBlocks - occupiedBlocks, rate: parseFloat(occupancyRate)
        },
        historical: historicalData,
        trend: this.calculateTrend(historicalData)
      };
    } catch (error) {
      console.error('❌ Error calculating occupancy rate:', error);
      throw error;
    }
  }

  static async getHistoricalOccupancy(storeId = null) {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const month = moment().subtract(i, 'months');
      const monthKey = month.format('YYYY-MM');
      const query = storeId ? { storeId } : {};
      const total = await Block.countDocuments(query);
      const occupied = await Block.countDocuments({ ...query, status: 'occupied' });
      data.push({
        month: monthKey,
        monthName: month.format('MMMM YYYY'),
        rate: total > 0 ? ((occupied / total) * 100).toFixed(2) : 0,
        occupied, total
      });
    }
    return data;
  }

  static async getCargoTypeDistribution(storeId = null) {
    try {
      const query = storeId ? { storeId, status: 'occupied' } : { status: 'occupied' };
      const distribution = await Block.aggregate([
        { $match: query },
        { $group: { _id: '$cargoType', count: { $sum: 1 }, totalRent: { $sum: '$monthlyRent' } } },
        { $sort: { count: -1 } }
      ]);
      const total = distribution.reduce((sum, item) => sum + item.count, 0);
      const formatted = distribution.map(item => ({
        type: item._id || 'غير محدد',
        typeArabic: this.translateCargoType(item._id),
        count: item.count,
        percentage: total > 0 ? ((item.count / total) * 100).toFixed(2) : 0,
        totalRent: item.totalRent
      }));
      return { distribution: formatted, totalOccupied: total, mostCommon: formatted[0] || null };
    } catch (error) {
      console.error('❌ Error getting cargo distribution:', error);
      throw error;
    }
  }

  static translateCargoType(type) {
    const translations = { 'import': 'واردات', 'export': 'صادرات', 'storage': 'تخزين', 'packaging': 'تغليف' };
    return translations[type] || 'غير محدد';
  }

  static async getMonthlyCashFlow(months = 6, storeId = null) {
    try {
      const cashFlowData = [];
      for (let i = months - 1; i >= 0; i--) {
        const month = moment().subtract(i, 'months');
        const monthKey = month.format('YYYY-MM');
        const query = { monthYear: monthKey };
        const paidPayments = await Payment.aggregate([
          { $match: { ...query, status: 'paid' } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);
        const overduePayments = await Payment.aggregate([
          { $match: { ...query, status: { $in: ['overdue', 'pending'] } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);
        const expectedRevenue = await Payment.aggregate([
          { $match: { monthYear: monthKey } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const paid = paidPayments[0]?.total || 0;
        const overdue = overduePayments[0]?.total || 0;
        const expected = expectedRevenue[0]?.total || 0;
        cashFlowData.push({
          month: monthKey,
          monthName: month.format('MMMM YYYY'),
          expected, collected: paid, pending: overdue,
          collectionRate: expected > 0 ? ((paid / expected) * 100).toFixed(2) : 0,
          paymentCount: paidPayments[0]?.count || 0,
          overdueCount: overduePayments[0]?.count || 0
        });
      }
      const totalCollected = cashFlowData.reduce((sum, m) => sum + m.collected, 0);
      const totalExpected  = cashFlowData.reduce((sum, m) => sum + m.expected, 0);
      const totalPending   = cashFlowData.reduce((sum, m) => sum + m.pending, 0);
      return {
        monthlyData: cashFlowData,
        summary: {
          totalCollected, totalExpected, totalPending,
          overallCollectionRate: totalExpected > 0 ? ((totalCollected / totalExpected) * 100).toFixed(2) : 0,
          averageMonthlyRevenue: (totalCollected / months).toFixed(2)
        },
        trend: this.calculateTrend(cashFlowData.map(m => ({ rate: m.collectionRate })))
      };
    } catch (error) {
      console.error('❌ Error calculating cash flow:', error);
      throw error;
    }
  }

  static async getTopTenants(limit = 10) {
    try {
      const topTenants = await Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: '$tenantId', totalPaid: { $sum: '$amount' }, paymentCount: { $sum: 1 } } },
        { $sort: { totalPaid: -1 } },
        { $limit: Number(limit) },
        { $lookup: { from: 'tenants', localField: '_id', foreignField: '_id', as: 'tenantInfo' } },
        { $unwind: '$tenantInfo' },
        { $project: { _id: 0, tenantId: '$_id', name: '$tenantInfo.name', phone: '$tenantInfo.phone', totalPaid: 1, paymentCount: 1 } }
      ]);
      return topTenants;
    } catch (error) {
      console.error('❌ Error getting top tenants:', error);
      throw error;
    }
  }

  static async getTenantPerformance() {
    try {
      // FIX: كان populate('activeBlocks') — الصح activeUnits
      const tenants = await Tenant.find({ isActive: true })
        .populate('activeUnits', 'unitNumber monthlyRent');

      const performanceData = await Promise.all(
        tenants.map(async (tenant) => {
          const totalPayments = await Payment.countDocuments({ tenantId: tenant._id });
          const paidOnTime = await Payment.countDocuments({
            tenantId: tenant._id, status: 'paid',
            $expr: { $lte: ['$paymentDate', '$dueDate'] }
          });
          const overdueCount = await Payment.countDocuments({ tenantId: tenant._id, status: 'overdue' });
          const complianceRate = totalPayments > 0
            ? ((paidOnTime / totalPayments) * 100).toFixed(2) : 0;
          return {
            tenantId:      tenant._id,
            tenantName:    tenant.name,
            // FIX: كان tenant.activeBlocks.length — الصح activeUnits
            activeUnits:   tenant.activeUnits?.length || 0,
            totalPayments, paidOnTime, overdueCount,
            complianceRate: parseFloat(complianceRate),
            totalPaid:     tenant.totalPaid,
            totalDue:      tenant.totalDue,
            rating:        this.calculateTenantRating(complianceRate, overdueCount)
          };
        })
      );
      performanceData.sort((a, b) => b.complianceRate - a.complianceRate);
      return {
        tenants:       performanceData,
        topPerformers: performanceData.slice(0, 5),
        poorPerformers: performanceData.filter(t => t.complianceRate < 70)
      };
    } catch (error) {
      console.error('❌ Error calculating tenant performance:', error);
      throw error;
    }
  }

  static calculateTenantRating(complianceRate, overdueCount) {
    if (complianceRate >= 95 && overdueCount === 0) return 'ممتاز';
    if (complianceRate >= 80 && overdueCount <= 2) return 'جيد جداً';
    if (complianceRate >= 70 && overdueCount <= 5) return 'جيد';
    if (complianceRate >= 50) return 'مقبول';
    return 'ضعيف';
  }

  static async getDashboardSummary(storeId = null) {
    try {
      const [occupancy, cargoDistribution, cashFlow, tenantPerformance] = await Promise.all([
        this.getOccupancyRate(storeId),
        this.getCargoTypeDistribution(storeId),
        this.getMonthlyCashFlow(3, storeId),
        this.getTenantPerformance()
      ]);
      const currentMonth = moment().format('YYYY-MM');
      const thisMonthPayments = await Payment.countDocuments({ monthYear: currentMonth, status: 'paid' });
      const overduePayments   = await Payment.countDocuments({ status: 'overdue' });
      return {
        occupancy: occupancy.current,
        cargoDistribution: cargoDistribution.distribution,
        cashFlow: cashFlow.summary,
        recentCashFlow: cashFlow.monthlyData.slice(-3),
        topTenants: tenantPerformance.topPerformers,
        alerts: {
          overduePayments,
          lowOccupancy: occupancy.current.rate < 70,
          poorPerformers: tenantPerformance.poorPerformers.length
        },
        thisMonth: {
          paymentsReceived: thisMonthPayments,
          revenue: cashFlow.monthlyData[cashFlow.monthlyData.length - 1]?.collected || 0
        }
      };
    } catch (error) {
      console.error('❌ Error generating dashboard summary:', error);
      throw error;
    }
  }

  static calculateTrend(data) {
    if (!data || data.length < 2) return 'stable';
    const recent   = parseFloat(data[data.length - 1].rate);
    const previous = parseFloat(data[data.length - 2].rate);
    if (recent > previous + 2) return 'increasing';
    if (recent < previous - 2) return 'decreasing';
    return 'stable';
  }

  static async getCustomReport(startDate, endDate, storeId = null) {
    try {
      const start = moment(startDate).startOf('day');
      const end   = moment(endDate).endOf('day');
      const query = { paymentDate: { $gte: start.toDate(), $lte: end.toDate() } };
      const payments = await Payment.find(query)
        .populate('tenantId', 'name')
        .populate('unitId',   'unitNumber');
      const totalRevenue = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
      const totalOverdue = payments.filter(p => p.status === 'overdue').reduce((sum, p) => sum + p.amount, 0);
      return {
        period: { start: start.format('DD/MM/YYYY'), end: end.format('DD/MM/YYYY'), days: end.diff(start, 'days') + 1 },
        revenue: { total: totalRevenue, daily: (totalRevenue / (end.diff(start, 'days') + 1)).toFixed(2) },
        overdue: totalOverdue, payments: payments.length, details: payments
      };
    } catch (error) {
      console.error('❌ Error generating custom report:', error);
      throw error;
    }
  }
}

module.exports = AnalyticsService;