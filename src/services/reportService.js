// services/reportService.js
const moment = require('moment');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');
const Block = require('../models/Block');
const Payment = require('../models/Payment');
const Tenant = require('../models/Tenant');
const Store = require('../models/Store');
const ActivityLog = require('../models/ActivityLog');
const { CARGO_TYPES, PAYMENT_STATUS, BLOCK_STATUS } = require('../config/constants');

class ReportService {
  constructor() {
    this.reportsDir = path.join(__dirname, '../../reports');
    this.ensureReportsDir();
  }

  async ensureReportsDir() {
    try {
      await fs.access(this.reportsDir);
    } catch {
      await fs.mkdir(this.reportsDir, { recursive: true });
      console.log('📁 Reports directory created');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 1. تقرير الإيرادات الشهرية
  // ═══════════════════════════════════════════════════════════
  async generateRevenueReport(storeId = null, yearMonth = null) {
    try {
      const month = yearMonth || moment().format('YYYY-MM');
      const startDate = moment(month, 'YYYY-MM').startOf('month').toDate();
      const endDate = moment(month, 'YYYY-MM').endOf('month').toDate();

      const query = storeId ? { storeId } : {};

      // الحصول على الدفعات لهذا الشهر
      const payments = await Payment.find({
        monthYear: month,
        ...query
      })
      .populate('tenantId', 'name phone')
      .populate('blockId', 'blockNumber storeId')
      .populate({
        path: 'blockId',
        populate: { path: 'storeId', select: 'name' }
      });

      // إحصائيات الدفعات
      const stats = {
        total: payments.reduce((sum, p) => sum + p.amount, 0),
        paid: payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
        pending: payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),
        overdue: payments.filter(p => p.status === 'overdue').reduce((sum, p) => sum + p.amount, 0),
        partial: payments.filter(p => p.status === 'partial').reduce((sum, p) => sum + p.amount, 0),
        count: payments.length,
        paidCount: payments.filter(p => p.status === 'paid').length,
        pendingCount: payments.filter(p => p.status === 'pending').length,
        overdueCount: payments.filter(p => p.status === 'overdue').length
      };

      // الدفعات حسب المخزن
      const byStore = {};
      payments.forEach(payment => {
        const storeName = payment.blockId?.storeId?.name || 'غير معروف';
        if (!byStore[storeName]) {
          byStore[storeName] = {
            total: 0,
            paid: 0,
            pending: 0,
            overdue: 0,
            count: 0
          };
        }
        byStore[storeName].total += payment.amount;
        byStore[storeName].count++;
        byStore[storeName][payment.status] += payment.amount;
      });

      return {
        month,
        period: {
          start: startDate,
          end: endDate
        },
        statistics: stats,
        breakdown: {
          byStore,
          byStatus: {
            paid: stats.paid,
            pending: stats.pending,
            overdue: stats.overdue,
            partial: stats.partial
          }
        },
        payments: payments.map(p => ({
          id: p._id,
          blockNumber: p.blockId?.blockNumber,
          tenantName: p.tenantId?.name,
          amount: p.amount,
          status: p.status,
          paymentDate: p.paymentDate,
          dueDate: p.dueDate,
          paymentMethod: p.paymentMethod,
          receiptNumber: p.receiptNumber
        })),
        summary: {
          collectionRate: stats.total > 0 ? ((stats.paid / stats.total) * 100).toFixed(2) : 0,
          averagePayment: stats.count > 0 ? (stats.total / stats.count).toFixed(2) : 0
        }
      };
    } catch (error) {
      console.error('❌ Error generating revenue report:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2. تقرير حالة البلوكات
  // ═══════════════════════════════════════════════════════════
  async generateBlockStatusReport(storeId = null) {
    try {
      const query = storeId ? { storeId } : {};

      const blocks = await Block.find(query)
        .populate('storeId', 'name location')
        .populate('currentTenant', 'name phone')
        .sort({ blockNumber: 1 });

      // الإحصائيات العامة
      const stats = {
        total: blocks.length,
        occupied: blocks.filter(b => b.status === 'occupied').length,
        empty: blocks.filter(b => b.status === 'empty').length,
        maintenance: blocks.filter(b => b.status === 'maintenance').length,
        occupancyRate: blocks.length > 0 ? 
          ((blocks.filter(b => b.status === 'occupied').length / blocks.length) * 100).toFixed(2) : 0
      };

      // البلوكات حسب المخزن
      const byStore = {};
      blocks.forEach(block => {
        const storeName = block.storeId?.name || 'غير معروف';
        if (!byStore[storeName]) {
          byStore[storeName] = {
            total: 0,
            occupied: 0,
            empty: 0,
            maintenance: 0,
            blocks: []
          };
        }
        byStore[storeName].total++;
        byStore[storeName][block.status]++;
        byStore[storeName].blocks.push({
          blockNumber: block.blockNumber,
          status: block.status,
          tenantName: block.currentTenant?.name,
          monthlyRent: block.monthlyRent,
          cargoType: block.cargoType
        });
      });

      // البلوكات حسب نوع البضاعة
      const byCargoType = {};
      blocks.filter(b => b.cargoType).forEach(block => {
        if (!byCargoType[block.cargoType]) {
          byCargoType[block.cargoType] = {
            count: 0,
            revenue: 0,
            blocks: []
          };
        }
        byCargoType[block.cargoType].count++;
        byCargoType[block.cargoType].revenue += block.monthlyRent;
        byCargoType[block.cargoType].blocks.push(block.blockNumber);
      });

      // البلوكات الفارغة (متاحة للإيجار)
      const availableBlocks = blocks
        .filter(b => b.status === 'empty')
        .map(b => ({
          blockNumber: b.blockNumber,
          store: b.storeId?.name,
          size: b.size,
          monthlyRent: b.monthlyRent
        }));

      return {
        statistics: stats,
        breakdown: {
          byStore,
          byCargoType,
          byStatus: {
            occupied: stats.occupied,
            empty: stats.empty,
            maintenance: stats.maintenance
          }
        },
        availableBlocks,
        blocks: blocks.map(b => ({
          blockNumber: b.blockNumber,
          store: b.storeId?.name,
          status: b.status,
          tenantName: b.currentTenant?.name,
          phone: b.currentTenant?.phone,
          cargoType: b.cargoType,
          monthlyRent: b.monthlyRent,
          size: b.size
        }))
      };
    } catch (error) {
      console.error('❌ Error generating block status report:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3. تقرير الدفعات المتأخرة
  // ═══════════════════════════════════════════════════════════
  async generateOverdueReport(storeId = null) {
    try {
      const query = storeId ? { storeId } : {};

      // الحصول على الدفعات المتأخرة
      const overduePayments = await Payment.find({
        status: 'overdue',
        ...query
      })
      .populate('tenantId', 'name phone email')
      .populate('blockId', 'blockNumber storeId')
      .populate({
        path: 'blockId',
        populate: { path: 'storeId', select: 'name' }
      })
      .sort({ dueDate: 1 });

      // إحصائيات
      const stats = {
        totalAmount: overduePayments.reduce((sum, p) => sum + p.amount, 0),
        count: overduePayments.length,
        averageOverdue: overduePayments.length > 0 ? 
          (overduePayments.reduce((sum, p) => sum + p.amount, 0) / overduePayments.length).toFixed(2) : 0,
        oldestOverdue: overduePayments.length > 0 ? 
          Math.max(...overduePayments.map(p => moment().diff(moment(p.dueDate), 'days'))) : 0
      };

      // تجميع حسب المستأجر
      const byTenant = {};
      overduePayments.forEach(payment => {
        const tenantName = payment.tenantId?.name || 'غير معروف';
        if (!byTenant[tenantName]) {
          byTenant[tenantName] = {
            totalAmount: 0,
            count: 0,
            payments: []
          };
        }
        byTenant[tenantName].totalAmount += payment.amount;
        byTenant[tenantName].count++;
        byTenant[tenantName].payments.push({
          blockNumber: payment.blockId?.blockNumber,
          amount: payment.amount,
          dueDate: payment.dueDate,
          daysOverdue: moment().diff(moment(payment.dueDate), 'days'),
          monthYear: payment.monthYear
        });
      });

      // تجميع حسب المخزن
      const byStore = {};
      overduePayments.forEach(payment => {
        const storeName = payment.blockId?.storeId?.name || 'غير معروف';
        if (!byStore[storeName]) {
          byStore[storeName] = {
            totalAmount: 0,
            count: 0
          };
        }
        byStore[storeName].totalAmount += payment.amount;
        byStore[storeName].count++;
      });

      // تحليل المدة
      const byDaysOverdue = {
        '1-7 days': 0,
        '8-30 days': 0,
        '31-90 days': 0,
        '90+ days': 0
      };

      overduePayments.forEach(payment => {
        const daysOverdue = moment().diff(moment(payment.dueDate), 'days');
        if (daysOverdue <= 7) byDaysOverdue['1-7 days']++;
        else if (daysOverdue <= 30) byDaysOverdue['8-30 days']++;
        else if (daysOverdue <= 90) byDaysOverdue['31-90 days']++;
        else byDaysOverdue['90+ days']++;
      });

      return {
        statistics: stats,
        breakdown: {
          byTenant,
          byStore,
          byDaysOverdue
        },
        overduePayments: overduePayments.map(p => ({
          id: p._id,
          blockNumber: p.blockId?.blockNumber,
          store: p.blockId?.storeId?.name,
          tenantName: p.tenantId?.name,
          phone: p.tenantId?.phone,
          amount: p.amount,
          dueDate: p.dueDate,
          daysOverdue: moment().diff(moment(p.dueDate), 'days'),
          monthYear: p.monthYear
        })),
        topTenants: Object.entries(byTenant)
          .map(([tenant, data]) => ({
            tenant,
            totalAmount: data.totalAmount,
            count: data.count
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 10)
      };
    } catch (error) {
      console.error('❌ Error generating overdue report:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 4. تقرير أداء المستأجرين
  // ═══════════════════════════════════════════════════════════
  async generateTenantPerformanceReport() {
    try {
      const tenants = await Tenant.find({ isActive: true })
        .populate('activeBlocks', 'blockNumber monthlyRent storeId')
        .populate({
          path: 'activeBlocks',
          populate: { path: 'storeId', select: 'name' }
        });

      const performanceData = await Promise.all(
        tenants.map(async (tenant) => {
          // الحصول على جميع دفعات المستأجر
          const payments = await Payment.find({ tenantId: tenant._id });
          
          const totalPayments = payments.length;
          const paidOnTime = payments.filter(p => 
            p.status === 'paid' && moment(p.paymentDate).isSameOrBefore(moment(p.dueDate))
          ).length;
          
          const overdueCount = payments.filter(p => p.status === 'overdue').length;
          const pendingCount = payments.filter(p => p.status === 'pending').length;
          
          const totalPaid = payments
            .filter(p => p.status === 'paid')
            .reduce((sum, p) => sum + p.amount, 0);
          
          const totalOverdue = payments
            .filter(p => p.status === 'overdue')
            .reduce((sum, p) => sum + p.amount, 0);

          const complianceRate = totalPayments > 0 ? 
            ((paidOnTime / totalPayments) * 100).toFixed(2) : 0;

          // حساب التقييم
          let rating = 'جيد';
          let ratingColor = 'success';
          
          if (complianceRate >= 95 && overdueCount === 0) {
            rating = 'ممتاز';
            ratingColor = 'primary';
          } else if (complianceRate >= 80 && overdueCount <= 2) {
            rating = 'جيد جداً';
            ratingColor = 'info';
          } else if (complianceRate >= 70 && overdueCount <= 5) {
            rating = 'جيد';
            ratingColor = 'success';
          } else if (complianceRate >= 50) {
            rating = 'مقبول';
            ratingColor = 'warning';
          } else {
            rating = 'ضعيف';
            ratingColor = 'danger';
          }

          return {
            tenantId: tenant._id,
            name: tenant.name,
            phone: tenant.phone,
            email: tenant.email,
            activeBlocks: tenant.activeBlocks.length,
            totalPaid,
            totalOverdue,
            totalPayments,
            paidOnTime,
            overdueCount,
            pendingCount,
            complianceRate: parseFloat(complianceRate),
            rating,
            ratingColor,
            lastPayment: payments
              .filter(p => p.status === 'paid')
              .sort((a, b) => b.paymentDate - a.paymentDate)[0]?.paymentDate,
            blocks: tenant.activeBlocks.map(b => ({
              blockNumber: b.blockNumber,
              store: b.storeId?.name,
              monthlyRent: b.monthlyRent
            }))
          };
        })
      );

      // ترتيب حسب الأداء
      performanceData.sort((a, b) => b.complianceRate - a.complianceRate);

      // الإحصائيات العامة
      const stats = {
        totalTenants: performanceData.length,
        averageComplianceRate: performanceData.length > 0 ? 
          (performanceData.reduce((sum, t) => sum + t.complianceRate, 0) / performanceData.length).toFixed(2) : 0,
        topPerformers: performanceData.filter(t => t.complianceRate >= 80).length,
        poorPerformers: performanceData.filter(t => t.complianceRate < 50).length,
        totalRevenue: performanceData.reduce((sum, t) => sum + t.totalPaid, 0),
        totalOverdue: performanceData.reduce((sum, t) => sum + t.totalOverdue, 0)
      };

      return {
        statistics: stats,
        tenants: performanceData,
        topTenants: performanceData.slice(0, 10),
        bottomTenants: performanceData.slice(-10).reverse(),
        ratingDistribution: {
          ممتاز: performanceData.filter(t => t.rating === 'ممتاز').length,
          جيد_جداً: performanceData.filter(t => t.rating === 'جيد جداً').length,
          جيد: performanceData.filter(t => t.rating === 'جيد').length,
          مقبول: performanceData.filter(t => t.rating === 'مقبول').length,
          ضعيف: performanceData.filter(t => t.rating === 'ضعيف').length
        }
      };
    } catch (error) {
      console.error('❌ Error generating tenant performance report:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 5. تقرير توزيع البضائع
  // ═══════════════════════════════════════════════════════════
  async generateCargoDistributionReport(storeId = null) {
    try {
      const query = storeId ? { storeId, status: 'occupied' } : { status: 'occupied' };

      const blocks = await Block.find(query)
        .populate('storeId', 'name')
        .populate('currentTenant', 'name');

      // توزيع البضائع
      const distribution = {};
      let totalRevenue = 0;

      blocks.forEach(block => {
        const cargoType = block.cargoType || 'غير محدد';
        if (!distribution[cargoType]) {
          distribution[cargoType] = {
            count: 0,
            revenue: 0,
            blocks: [],
            tenants: new Set()
          };
        }
        distribution[cargoType].count++;
        distribution[cargoType].revenue += block.monthlyRent;
        distribution[cargoType].blocks.push(block.blockNumber);
        if (block.currentTenant) {
          distribution[cargoType].tenants.add(block.currentTenant.name);
        }
        totalRevenue += block.monthlyRent;
      });

      // تحويل التوزيع إلى مصفوفة
      const distributionArray = Object.entries(distribution).map(([type, data]) => ({
        type,
        typeArabic: this.translateCargoType(type),
        count: data.count,
        percentage: blocks.length > 0 ? ((data.count / blocks.length) * 100).toFixed(2) : 0,
        revenue: data.revenue,
        revenuePercentage: totalRevenue > 0 ? ((data.revenue / totalRevenue) * 100).toFixed(2) : 0,
        blocks: data.blocks,
        tenantCount: data.tenants.size,
        tenants: Array.from(data.tenants)
      }));

      // ترتيب حسب الكمية
      distributionArray.sort((a, b) => b.count - a.count);

      // توزيع حسب المخزن
      const byStore = {};
      blocks.forEach(block => {
        const storeName = block.storeId?.name || 'غير معروف';
        const cargoType = block.cargoType || 'غير محدد';
        
        if (!byStore[storeName]) {
          byStore[storeName] = {
            total: 0,
            byCargoType: {}
          };
        }
        
        byStore[storeName].total++;
        
        if (!byStore[storeName].byCargoType[cargoType]) {
          byStore[storeName].byCargoType[cargoType] = 0;
        }
        byStore[storeName].byCargoType[cargoType]++;
      });

      return {
        summary: {
          totalBlocks: blocks.length,
          totalRevenue,
          averageRevenuePerBlock: blocks.length > 0 ? (totalRevenue / blocks.length).toFixed(2) : 0
        },
        distribution: distributionArray,
        byStore,
        mostCommonCargo: distributionArray[0] || null,
        blocksByCargo: blocks.map(b => ({
          blockNumber: b.blockNumber,
          store: b.storeId?.name,
          cargoType: b.cargoType,
          cargoTypeArabic: this.translateCargoType(b.cargoType),
          tenantName: b.currentTenant?.name,
          monthlyRent: b.monthlyRent
        }))
      };
    } catch (error) {
      console.error('❌ Error generating cargo distribution report:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 6. تقرير إشغال المخازن
  // ═══════════════════════════════════════════════════════════
  async generateStorageUtilizationReport() {
    try {
      const stores = await Store.find({ isActive: true });
      
      const storeReports = await Promise.all(
        stores.map(async (store) => {
          const blocks = await Block.find({ storeId: store._id });
          
          const occupied = blocks.filter(b => b.status === 'occupied').length;
          const empty = blocks.filter(b => b.status === 'empty').length;
          const maintenance = blocks.filter(b => b.status === 'maintenance').length;
          
          const totalRevenue = blocks
            .filter(b => b.status === 'occupied')
            .reduce((sum, b) => sum + b.monthlyRent, 0);
          
          const occupancyRate = blocks.length > 0 ? 
            ((occupied / blocks.length) * 100).toFixed(2) : 0;
          
          // توزيع البضائع في هذا المخزن
          const cargoDistribution = {};
          blocks
            .filter(b => b.cargoType && b.status === 'occupied')
            .forEach(b => {
              const type = b.cargoType;
              cargoDistribution[type] = (cargoDistribution[type] || 0) + 1;
            });

          return {
            storeId: store._id,
            name: store.name,
            location: store.location,
            totalBlocks: blocks.length,
            occupied,
            empty,
            maintenance,
            occupancyRate: parseFloat(occupancyRate),
            totalRevenue,
            averageRent: occupied > 0 ? (totalRevenue / occupied).toFixed(2) : 0,
            cargoDistribution,
            status: occupancyRate >= 80 ? 'ممتلئ' : 
                   occupancyRate >= 50 ? 'متوسط' : 'منخفض'
          };
        })
      );

      // ترتيب المخازن حسب نسبة الإشغال
      storeReports.sort((a, b) => b.occupancyRate - a.occupancyRate);

      // الإحصائيات العامة
      const totalStats = {
        totalStores: storeReports.length,
        totalBlocks: storeReports.reduce((sum, s) => sum + s.totalBlocks, 0),
        totalOccupied: storeReports.reduce((sum, s) => sum + s.occupied, 0),
        totalEmpty: storeReports.reduce((sum, s) => sum + s.empty, 0),
        totalRevenue: storeReports.reduce((sum, s) => sum + s.totalRevenue, 0),
        averageOccupancyRate: storeReports.length > 0 ? 
          (storeReports.reduce((sum, s) => sum + parseFloat(s.occupancyRate), 0) / storeReports.length).toFixed(2) : 0
      };

      return {
        summary: totalStats,
        stores: storeReports,
        topStores: storeReports.slice(0, 5),
        bottomStores: storeReports.slice(-5).reverse(),
        recommendations: this.generateStorageRecommendations(storeReports)
      };
    } catch (error) {
      console.error('❌ Error generating storage utilization report:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 7. إنشاء تقرير Excel
  // ═══════════════════════════════════════════════════════════
  async generateExcelReport(reportType, data, filename = null) {
    try {
      const workbook = new ExcelJS.Workbook();
      const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
      const reportName = filename || `${reportType}_${timestamp}`;
      const filepath = path.join(this.reportsDir, `${reportName}.xlsx`);

      switch (reportType) {
        case 'revenue':
          await this.createRevenueExcel(workbook, data);
          break;
        case 'blocks':
          await this.createBlocksExcel(workbook, data);
          break;
        case 'overdue':
          await this.createOverdueExcel(workbook, data);
          break;
        case 'tenants':
          await this.createTenantsExcel(workbook, data);
          break;
        case 'cargo':
          await this.createCargoExcel(workbook, data);
          break;
        case 'storage':
          await this.createStorageExcel(workbook, data);
          break;
        default:
          throw new Error('نوع التقرير غير معروف');
      }

      await workbook.xlsx.writeFile(filepath);
      
      return {
        success: true,
        filename: `${reportName}.xlsx`,
        path: filepath,
        downloadUrl: `/api/reports/download/${reportName}.xlsx`
      };
    } catch (error) {
      console.error('❌ Error generating Excel report:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 8. إنشاء تقرير PDF
  // ═══════════════════════════════════════════════════════════
  async generatePDFReport(reportType, data, filename = null) {
    try {
      const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
      const reportName = filename || `${reportType}_${timestamp}`;
      const filepath = path.join(this.reportsDir, `${reportName}.pdf`);

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).text('تقرير نظام إدارة المخازن', { align: 'center' });
      doc.fontSize(12).text(`نوع التقرير: ${this.translateReportType(reportType)}`, { align: 'center' });
      doc.fontSize(10).text(`تاريخ التقرير: ${moment().format('DD/MM/YYYY HH:mm')}`, { align: 'center' });
      doc.moveDown();

      switch (reportType) {
        case 'revenue':
          await this.createRevenuePDF(doc, data);
          break;
        case 'blocks':
          await this.createBlocksPDF(doc, data);
          break;
        case 'overdue':
          await this.createOverduePDF(doc, data);
          break;
        // Add other cases as needed
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(9).text('تم إنشاء هذا التقرير تلقائياً بواسطة نظام إدارة المخازن', {
        align: 'center'
      });

      doc.end();

      return new Promise((resolve) => {
        stream.on('finish', () => {
          resolve({
            success: true,
            filename: `${reportName}.pdf`,
            path: filepath,
            downloadUrl: `/api/reports/download/${reportName}.pdf`
          });
        });
      });
    } catch (error) {
      console.error('❌ Error generating PDF report:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════
  translateCargoType(type) {
    const translations = {
      'import': 'واردات',
      'export': 'صادرات',
      'storage': 'تخزين',
      'packaging': 'تغليف',
      'undefined': 'غير محدد',
      'null': 'غير محدد'
    };
    return translations[type] || type;
  }

  translateReportType(type) {
    const translations = {
      'revenue': 'تقرير الإيرادات',
      'blocks': 'تقرير البلوكات',
      'overdue': 'تقرير المتأخرات',
      'tenants': 'تقرير المستأجرين',
      'cargo': 'تقرير البضائع',
      'storage': 'تقرير المخازن'
    };
    return translations[type] || type;
  }

  generateStorageRecommendations(stores) {
    const recommendations = [];
    
    stores.forEach(store => {
      if (store.occupancyRate >= 90) {
        recommendations.push({
          store: store.name,
          recommendation: 'المخزن ممتلئ تقريباً، فكر في التوسع أو زيادة الأسعار',
          priority: 'high'
        });
      } else if (store.occupancyRate <= 30) {
        recommendations.push({
          store: store.name,
          recommendation: 'المخزن ذو إشغال منخفض، فكر في خصومات أو حملات تسويقية',
          priority: 'medium'
        });
      }
    });

    return recommendations;
  }

  // Excel Creation Methods
  async createRevenueExcel(workbook, data) {
    const worksheet = workbook.addWorksheet('الإيرادات');
    
    worksheet.columns = [
      { header: 'رقم البلوك', key: 'blockNumber', width: 15 },
      { header: 'المستأجر', key: 'tenantName', width: 25 },
      { header: 'المبلغ', key: 'amount', width: 15 },
      { header: 'تاريخ الدفع', key: 'paymentDate', width: 15 },
      { header: 'تاريخ الاستحقاق', key: 'dueDate', width: 15 },
      { header: 'الحالة', key: 'status', width: 12 },
      { header: 'طريقة الدفع', key: 'paymentMethod', width: 15 },
      { header: 'رقم الإيصال', key: 'receiptNumber', width: 20 },
      { header: 'الشهر', key: 'monthYear', width: 12 }
    ];

    data.payments.forEach(payment => {
      worksheet.addRow({
        blockNumber: payment.blockNumber || '-',
        tenantName: payment.tenantName || '-',
        amount: payment.amount,
        paymentDate: moment(payment.paymentDate).format('DD/MM/YYYY'),
        dueDate: moment(payment.dueDate).format('DD/MM/YYYY'),
        status: this.translatePaymentStatus(payment.status),
        paymentMethod: this.translatePaymentMethod(payment.paymentMethod),
        receiptNumber: payment.receiptNumber || '-',
        monthYear: payment.monthYear
      });
    });

    // Add summary
    worksheet.addRow({});
    worksheet.addRow({
      blockNumber: 'الإجمالي',
      amount: data.statistics.total
    });
    
    this.styleWorksheet(worksheet);
  }

  async createBlocksExcel(workbook, data) {
    const worksheet = workbook.addWorksheet('البلوكات');
    
    worksheet.columns = [
      { header: 'رقم البلوك', key: 'blockNumber', width: 15 },
      { header: 'المخزن', key: 'store', width: 20 },
      { header: 'الحالة', key: 'status', width: 12 },
      { header: 'المستأجر', key: 'tenantName', width: 25 },
      { header: 'الهاتف', key: 'phone', width: 15 },
      { header: 'نوع البضاعة', key: 'cargoType', width: 15 },
      { header: 'الإيجار الشهري', key: 'monthlyRent', width: 15 },
      { header: 'المساحة (م²)', key: 'size', width: 12 }
    ];

    data.blocks.forEach(block => {
      worksheet.addRow({
        blockNumber: block.blockNumber,
        store: block.store || '-',
        status: this.translateBlockStatus(block.status),
        tenantName: block.tenantName || 'فارغ',
        phone: block.phone || '-',
        cargoType: this.translateCargoType(block.cargoType),
        monthlyRent: block.monthlyRent,
        size: block.size || '-'
      });
    });

    // Add statistics
    worksheet.addRow({});
    worksheet.addRow({
      blockNumber: 'الإحصائيات',
      store: `الإجمالي: ${data.statistics.total}`,
      status: `مؤجر: ${data.statistics.occupied}`,
      tenantName: `فارغ: ${data.statistics.empty}`,
      phone: `صيانة: ${data.statistics.maintenance}`,
      cargoType: `نسبة الإشغال: ${data.statistics.occupancyRate}%`
    });
    
    this.styleWorksheet(worksheet);
  }

  async createOverdueExcel(workbook, data) {
    const worksheet = workbook.addWorksheet('المتأخرات');
    
    worksheet.columns = [
      { header: 'رقم البلوك', key: 'blockNumber', width: 15 },
      { header: 'المخزن', key: 'store', width: 20 },
      { header: 'المستأجر', key: 'tenantName', width: 25 },
      { header: 'الهاتف', key: 'phone', width: 15 },
      { header: 'المبلغ', key: 'amount', width: 15 },
      { header: 'تاريخ الاستحقاق', key: 'dueDate', width: 15 },
      { header: 'الأيام المتأخرة', key: 'daysOverdue', width: 12 },
      { header: 'الشهر', key: 'monthYear', width: 12 }
    ];

    data.overduePayments.forEach(payment => {
      worksheet.addRow({
        blockNumber: payment.blockNumber || '-',
        store: payment.store || '-',
        tenantName: payment.tenantName || '-',
        phone: payment.phone || '-',
        amount: payment.amount,
        dueDate: moment(payment.dueDate).format('DD/MM/YYYY'),
        daysOverdue: payment.daysOverdue,
        monthYear: payment.monthYear
      });
    });

    // Add summary
    worksheet.addRow({});
    worksheet.addRow({
      blockNumber: 'الإجمالي',
      amount: data.statistics.totalAmount,
      daysOverdue: `عدد الدفعات: ${data.statistics.count}`
    });
    
    this.styleWorksheet(worksheet);
  }

  async createTenantsExcel(workbook, data) {
    const worksheet = workbook.addWorksheet('المستأجرين');
    
    worksheet.columns = [
      { header: 'اسم المستأجر', key: 'name', width: 25 },
      { header: 'الهاتف', key: 'phone', width: 15 },
      { header: 'البريد الإلكتروني', key: 'email', width: 25 },
      { header: 'عدد البلوكات', key: 'activeBlocks', width: 12 },
      { header: 'إجمالي المدفوع', key: 'totalPaid', width: 15 },
      { header: 'إجمالي المتأخر', key: 'totalOverdue', width: 15 },
      { header: 'نسبة الالتزام', key: 'complianceRate', width: 12 },
      { header: 'التقييم', key: 'rating', width: 12 },
      { header: 'آخر دفعة', key: 'lastPayment', width: 15 }
    ];

    data.tenants.forEach(tenant => {
      worksheet.addRow({
        name: tenant.name,
        phone: tenant.phone || '-',
        email: tenant.email || '-',
        activeBlocks: tenant.activeBlocks,
        totalPaid: tenant.totalPaid,
        totalOverdue: tenant.totalOverdue,
        complianceRate: `${tenant.complianceRate}%`,
        rating: tenant.rating,
        lastPayment: tenant.lastPayment ? moment(tenant.lastPayment).format('DD/MM/YYYY') : '-'
      });
    });
    
    this.styleWorksheet(worksheet);
  }

  async createCargoExcel(workbook, data) {
    const worksheet = workbook.addWorksheet('البضائع');
    
    worksheet.columns = [
      { header: 'نوع البضاعة', key: 'type', width: 20 },
      { header: 'العدد', key: 'count', width: 10 },
      { header: 'النسبة', key: 'percentage', width: 10 },
      { header: 'الإيرادات', key: 'revenue', width: 15 },
      { header: 'نسبة الإيرادات', key: 'revenuePercentage', width: 12 },
      { header: 'عدد المستأجرين', key: 'tenantCount', width: 12 },
      { header: 'البلوكات', key: 'blocks', width: 30 }
    ];

    data.distribution.forEach(item => {
      worksheet.addRow({
        type: item.typeArabic,
        count: item.count,
        percentage: `${item.percentage}%`,
        revenue: item.revenue,
        revenuePercentage: `${item.revenuePercentage}%`,
        tenantCount: item.tenantCount,
        blocks: item.blocks.join(', ')
      });
    });
    
    this.styleWorksheet(worksheet);
  }

  async createStorageExcel(workbook, data) {
    const worksheet = workbook.addWorksheet('المخازن');
    
    worksheet.columns = [
      { header: 'اسم المخزن', key: 'name', width: 20 },
      { header: 'الموقع', key: 'location', width: 25 },
      { header: 'إجمالي البلوكات', key: 'totalBlocks', width: 12 },
      { header: 'مؤجر', key: 'occupied', width: 10 },
      { header: 'فارغ', key: 'empty', width: 10 },
      { header: 'صيانة', key: 'maintenance', width: 10 },
      { header: 'نسبة الإشغال', key: 'occupancyRate', width: 12 },
      { header: 'الإيرادات', key: 'totalRevenue', width: 15 },
      { header: 'متوسط الإيجار', key: 'averageRent', width: 15 },
      { header: 'الحالة', key: 'status', width: 12 }
    ];

    data.stores.forEach(store => {
      worksheet.addRow({
        name: store.name,
        location: store.location,
        totalBlocks: store.totalBlocks,
        occupied: store.occupied,
        empty: store.empty,
        maintenance: store.maintenance,
        occupancyRate: `${store.occupancyRate}%`,
        totalRevenue: store.totalRevenue,
        averageRent: store.averageRent,
        status: store.status
      });
    });
    
    this.styleWorksheet(worksheet);
  }

  styleWorksheet(worksheet) {
    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // Auto filter
    worksheet.autoFilter = {
      from: 'A1',
      to: { row: 1, column: worksheet.columns.length }
    };
  }

  translatePaymentStatus(status) {
    const translations = {
      'paid': 'مدفوع',
      'pending': 'معلق',
      'overdue': 'متأخر',
      'partial': 'جزئي'
    };
    return translations[status] || status;
  }

  translatePaymentMethod(method) {
    const translations = {
      'cash': 'نقدي',
      'bank_transfer': 'تحويل بنكي',
      'check': 'شيك',
      'card': 'بطاقة'
    };
    return translations[method] || method;
  }

  translateBlockStatus(status) {
    const translations = {
      'occupied': 'مؤجر',
      'empty': 'فارغ',
      'maintenance': 'صيانة'
    };
    return translations[status] || status;
  }

  // PDF Creation Methods
  async createRevenuePDF(doc, data) {
    doc.fontSize(14).text('ملخص الإيرادات:', { underline: true });
    doc.fontSize(11).text(`إجمالي الإيرادات: ${data.statistics.total} جنيه`);
    doc.text(`مدفوع: ${data.statistics.paid} جنيه`);
    doc.text(`معلق: ${data.statistics.pending} جنيه`);
    doc.text(`متأخر: ${data.statistics.overdue} جنيه`);
    doc.text(`نسبة التحصيل: ${data.summary.collectionRate}%`);
    doc.moveDown();

    doc.fontSize(12).text('تفاصيل الدفعات:', { underline: true });
    doc.moveDown(0.5);

    data.payments.slice(0, 20).forEach((payment, index) => {
      doc.fontSize(9)
        .text(`${index + 1}. البلوك ${payment.blockNumber} - ${payment.tenantName} - ${payment.amount} جنيه - ${this.translatePaymentStatus(payment.status)}`);
    });
  }

  async createBlocksPDF(doc, data) {
    doc.fontSize(14).text('إحصائيات البلوكات:', { underline: true });
    doc.fontSize(11).text(`الإجمالي: ${data.statistics.total} بلوك`);
    doc.text(`مؤجر: ${data.statistics.occupied} بلوك`);
    doc.text(`فارغ: ${data.statistics.empty} بلوك`);
    doc.text(`صيانة: ${data.statistics.maintenance} بلوك`);
    doc.text(`نسبة الإشغال: ${data.statistics.occupancyRate}%`);
    doc.moveDown();

    doc.fontSize(12).text('البلوكات المتاحة:', { underline: true });
    doc.moveDown(0.5);

    if (data.availableBlocks.length > 0) {
      data.availableBlocks.slice(0, 15).forEach((block, index) => {
        doc.fontSize(9)
          .text(`${index + 1}. البلوك ${block.blockNumber} - ${block.store} - ${block.monthlyRent} جنيه/شهر`);
      });
    } else {
      doc.fontSize(10).text('لا توجد بلوكات فارغة حالياً', { color: 'red' });
    }
  }

  async createOverduePDF(doc, data) {
    doc.fontSize(14).text('ملخص المتأخرات:', { underline: true });
    doc.fontSize(11).text(`إجمالي المبلغ المتأخر: ${data.statistics.totalAmount} جنيه`);
    doc.text(`عدد الدفعات المتأخرة: ${data.statistics.count}`);
    doc.text(`متوسط التأخير: ${data.statistics.averageOverdue} يوم`);
    doc.text(`أكبر تأخير: ${data.statistics.oldestOverdue} يوم`);
    doc.moveDown();

    doc.fontSize(12).text('أكبر 10 متأخرات:', { underline: true });
    doc.moveDown(0.5);

    data.overduePayments.slice(0, 10).forEach((payment, index) => {
      doc.fontSize(9)
        .text(`${index + 1}. ${payment.tenantName} - البلوك ${payment.blockNumber} - ${payment.amount} جنيه - متأخر ${payment.daysOverdue} يوم`);
    });
  }
}

module.exports = new ReportService();