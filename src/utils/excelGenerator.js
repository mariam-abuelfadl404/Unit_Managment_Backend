// ═══════════════════════════════════════════════════════════
// utils/excelGenerator.js
// ═══════════════════════════════════════════════════════════
const ExcelJS = require('exceljs');
const { formatDate, formatCurrency } = require('./helpers');

class ExcelGenerator {

  // ═══════════════════════════════════════════════════════════
  // تقرير الدفعات
  // ═══════════════════════════════════════════════════════════
  static async generatePaymentsReport(payments, filepath) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('الدفعات');

      // Styling
      worksheet.columns = [
        { header: 'رقم البلوك', key: 'blockNumber', width: 15 },
        { header: 'المستأجر', key: 'tenantName', width: 25 },
        { header: 'المبلغ', key: 'amount', width: 15 },
        { header: 'تاريخ الدفع', key: 'paymentDate', width: 15 },
        { header: 'تاريخ الاستحقاق', key: 'dueDate', width: 15 },
        { header: 'الحالة', key: 'status', width: 15 },
        { header: 'طريقة الدفع', key: 'paymentMethod', width: 15 },
        { header: 'الشهر', key: 'monthYear', width: 12 }
      ];

      // Header style
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' } };

      // Add data
      payments.forEach(payment => {
        worksheet.addRow({
          blockNumber: payment.blockId?.blockNumber || '-',
          tenantName: payment.tenantId?.name || '-',
          amount: payment.amount,
          paymentDate: formatDate(payment.paymentDate),
          dueDate: formatDate(payment.dueDate),
          status: this.translateStatus(payment.status),
          paymentMethod: this.translatePaymentMethod(payment.paymentMethod),
          monthYear: payment.monthYear
        });
      });

      // Summary
      const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
      worksheet.addRow({});
      const summaryRow = worksheet.addRow({
        blockNumber: 'الإجمالي',
        amount: totalAmount
      });
      summaryRow.font = { bold: true };

      await workbook.xlsx.writeFile(filepath);
      return filepath;
    } catch (error) {
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // تقرير البلوكات
  // ═══════════════════════════════════════════════════════════
  static async generateBlocksReport(blocks, filepath) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('البلوكات');

      worksheet.columns = [
        { header: 'رقم البلوك', key: 'blockNumber', width: 15 },
        { header: 'المخزن', key: 'storeName', width: 20 },
        { header: 'الحالة', key: 'status', width: 12 },
        { header: 'المستأجر', key: 'tenantName', width: 25 },
        { header: 'نوع البضاعة', key: 'cargoType', width: 15 },
        { header: 'الإيجار الشهري', key: 'monthlyRent', width: 15 }
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF70AD47' }
      };
      worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' } };

      blocks.forEach(block => {
        worksheet.addRow({
          blockNumber: block.blockNumber,
          storeName: block.storeId?.name || '-',
          status: this.translateStatus(block.status),
          tenantName: block.currentTenant?.name || '-',
          cargoType: this.translateCargoType(block.cargoType),
          monthlyRent: block.monthlyRent
        });
      });

      await workbook.xlsx.writeFile(filepath);
      return filepath;
    } catch (error) {
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════
  static translateStatus(status) {
    const statuses = {
      'paid': 'مدفوع',
      'pending': 'معلق',
      'overdue': 'متأخر',
      'empty': 'فارغ',
      'occupied': 'مؤجر',
      'maintenance': 'صيانة'
    };
    return statuses[status] || status;
  }

  static translatePaymentMethod(method) {
    const methods = {
      'cash': 'نقدي',
      'bank_transfer': 'تحويل بنكي',
      'check': 'شيك',
      'card': 'بطاقة'
    };
    return methods[method] || method;
  }

  static translateCargoType(type) {
    const types = {
      'import': 'واردات',
      'export': 'صادرات',
      'storage': 'تخزين',
      'packaging': 'تغليف'
    };
    return types[type] || type || '-';
  }
}

module.exports = ExcelGenerator;
