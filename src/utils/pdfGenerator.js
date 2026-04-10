// utils/pdfGenerator.js
// ═══════════════════════════════════════════════════════════
// المتطلبات:
//   npm install pdfmake
//
// خطوة واحدة فقط - تحميل الخط العربي:
//   node utils/downloadFont.js
//
// هذا سيحمل خط Cairo تلقائياً إلى utils/fonts/arabic.ttf
// ═══════════════════════════════════════════════════════════

const PdfPrinter = require('pdfmake');
const fs = require('fs');
const path = require('path');
const { formatDate, formatCurrency } = require('./helpers');

// ─── إعداد مسار الخط ─────────────────────────────────────
const FONTS_DIR  = path.join(__dirname, 'fonts');
const FONT_PATH  = path.join(FONTS_DIR, 'arabic.ttf');

const getFonts = () => {
  if (!fs.existsSync(FONT_PATH)) {
    throw new Error(
      '❌ الخط العربي غير موجود!\n' +
      'الحل: شغّل هذا الأمر مرة واحدة فقط:\n' +
      '   node utils/downloadFont.js\n' +
      'أو حمّل خط Cairo يدوياً من:\n' +
      '   https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf\n' +
      'وضعه في: utils/fonts/arabic.ttf'
    );
  }
  return {
    Arabic: {
      normal:  FONT_PATH,
      bold:    FONT_PATH,
      italics: FONT_PATH,
    }
  };
};

// ─── ستايلات مشتركة ──────────────────────────────────────
const baseStyles = {
  header:       { fontSize: 18, bold: true,  color: '#4472C4', alignment: 'center', margin: [0, 0, 0, 5] },
  subheader:    { fontSize: 10, color: '#888', alignment: 'center', margin: [0, 0, 0, 15] },
  sectionTitle: { fontSize: 13, bold: true,  color: '#333', margin: [0, 10, 0, 5] },
  tableHeader:  { bold: true, fontSize: 10, color: 'white', fillColor: '#4472C4', alignment: 'right', margin: [4, 4, 4, 4] },
  cell:         { fontSize: 9,  alignment: 'right', margin: [3, 3, 3, 3] },
  summaryLabel: { fontSize: 9,  color: '#666', alignment: 'center' },
  summaryValue: { fontSize: 14, bold: true, color: '#4472C4', alignment: 'center' },
};

// ─── ترجمات ───────────────────────────────────────────────
const translateStatus = (s) =>
  ({ paid: 'مدفوع', pending: 'معلق', overdue: 'متأخر', empty: 'فارغ', occupied: 'مؤجر', maintenance: 'صيانة' }[s] || s || '-');

const translateMethod = (m) =>
  ({ cash: 'نقدي', bank_transfer: 'تحويل بنكي', check: 'شيك', card: 'بطاقة' }[m] || m || '-');

const translateCargo = (c) =>
  ({ import: 'واردات', export: 'صادرات', storage: 'تخزين', packaging: 'تغليف' }[c] || c || '-');

// ─── توليد PDF من docDefinition ──────────────────────────
const generatePDF = (docDefinition, filepath) => {
  return new Promise((resolve, reject) => {
    try {
      // التأكد من وجود المجلد
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const fonts   = getFonts();
      const printer = new PdfPrinter(fonts);
      const pdfDoc  = printer.createPdfKitDocument(docDefinition);
      const stream  = fs.createWriteStream(filepath);

      pdfDoc.pipe(stream);
      pdfDoc.end();

      stream.on('finish', () => resolve(filepath));
      stream.on('error',  reject);
    } catch (err) {
      reject(err);
    }
  });
};

// ─── مساعد: صف هيدر الجدول ───────────────────────────────
const headerRow = (cols) => cols.map(h => ({ text: h, style: 'tableHeader' }));

class PDFGenerator {

  // ═══════════════════════════════════════════════════════════
  // تقرير الدفعات
  // ═══════════════════════════════════════════════════════════
  static async generatePaymentsReport(payments, filepath) {
    const totalPaid    = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
    const totalOverdue = payments.filter(p => p.status === 'overdue').reduce((s, p) => s + p.amount, 0);

    const tableBody = [
      headerRow(['البلوك', 'المستأجر', 'الشهر', 'تاريخ الاستحقاق', 'المبلغ', 'الحالة', 'طريقة الدفع']),
      ...payments.map(p => [
        { text: p.blockId?.blockNumber || '-', style: 'cell' },
        { text: p.tenantId?.name        || '-', style: 'cell' },
        { text: p.monthYear             || '-', style: 'cell' },
        { text: formatDate(p.dueDate),           style: 'cell' },
        { text: formatCurrency(p.amount),        style: 'cell' },
        {
          text: translateStatus(p.status), style: 'cell',
          color: p.status === 'paid' ? '#2e7d32' : p.status === 'overdue' ? '#c62828' : '#e65100'
        },
        { text: translateMethod(p.paymentMethod), style: 'cell' },
      ])
    ];

    if (payments.length === 0) {
      tableBody.push([{ text: 'لا توجد بيانات', colSpan: 7, alignment: 'center', style: 'cell' }, '', '', '', '', '', '']);
    }

    const doc = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageDirection: 'rtl',
      defaultStyle: { font: 'Arabic', alignment: 'right' },
      styles: baseStyles,
      content: [
        { text: 'تقرير الدفعات', style: 'header' },
        {
          text: `تاريخ التقرير: ${formatDate(new Date())}   |   إجمالي السجلات: ${payments.length}`,
          style: 'subheader'
        },
        // ملخص مالي
        {
          table: {
            widths: ['*', '*', '*'],
            body: [[
              { text: [`محصّل\n`, { text: formatCurrency(totalPaid),    bold: true, fontSize: 14, color: '#2e7d32' }], alignment: 'center', fillColor: '#f0faf0', margin: [5, 8, 5, 8] },
              { text: [`معلّق\n`,  { text: formatCurrency(totalPending), bold: true, fontSize: 14, color: '#e65100' }], alignment: 'center', fillColor: '#fff8f0', margin: [5, 8, 5, 8] },
              { text: [`متأخر\n`, { text: formatCurrency(totalOverdue), bold: true, fontSize: 14, color: '#c62828' }], alignment: 'center', fillColor: '#fff0f0', margin: [5, 8, 5, 8] },
            ]]
          },
          margin: [0, 0, 0, 12]
        },
        // جدول البيانات
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: tableBody
          },
          layout: { hLineColor: '#e0e0e0', vLineColor: '#e0e0e0', fillColor: (row) => row % 2 === 0 ? '#f9f9f9' : null }
        }
      ]
    };

    return generatePDF(doc, filepath);
  }

  // ═══════════════════════════════════════════════════════════
  // تقرير البلوكات
  // ═══════════════════════════════════════════════════════════
  static async generateBlocksReport(blocks, filepath) {
    const occupied    = blocks.filter(b => b.status === 'occupied').length;
    const empty       = blocks.filter(b => b.status === 'empty').length;
    const maintenance = blocks.filter(b => b.status === 'maintenance').length;
    const totalRent   = blocks.filter(b => b.status === 'occupied').reduce((s, b) => s + (b.monthlyRent || 0), 0);
    const occupancyPct = blocks.length > 0 ? ((occupied / blocks.length) * 100).toFixed(1) : 0;

    const tableBody = [
      headerRow(['رقم البلوك', 'المخزن', 'الحالة', 'المستأجر', 'نوع البضاعة', 'الإيجار الشهري']),
      ...blocks.map(b => [
        { text: b.blockNumber,                 style: 'cell' },
        { text: b.storeId?.name      || '-',   style: 'cell' },
        {
          text: translateStatus(b.status), style: 'cell',
          color: b.status === 'occupied' ? '#2e7d32' : b.status === 'maintenance' ? '#e65100' : '#555'
        },
        { text: b.currentTenant?.name || '-',  style: 'cell' },
        { text: translateCargo(b.cargoType),   style: 'cell' },
        { text: b.status === 'occupied' ? formatCurrency(b.monthlyRent || 0) : '-', style: 'cell' },
      ])
    ];

    if (blocks.length === 0) {
      tableBody.push([{ text: 'لا توجد بيانات', colSpan: 6, alignment: 'center', style: 'cell' }, '', '', '', '', '']);
    }

    const doc = {
      pageSize: 'A4',
      pageDirection: 'rtl',
      defaultStyle: { font: 'Arabic', alignment: 'right' },
      styles: baseStyles,
      content: [
        { text: 'تقرير البلوكات', style: 'header' },
        { text: `تاريخ التقرير: ${formatDate(new Date())}   |   إجمالي البلوكات: ${blocks.length}`, style: 'subheader' },
        // ملخص إحصائي
        {
          columns: [
            { stack: [{ text: occupied.toString(),    fontSize: 22, bold: true, color: '#2e7d32', alignment: 'center' }, { text: 'مؤجر',           style: 'summaryLabel' }] },
            { stack: [{ text: empty.toString(),       fontSize: 22, bold: true, color: '#555',    alignment: 'center' }, { text: 'فارغ',           style: 'summaryLabel' }] },
            { stack: [{ text: maintenance.toString(), fontSize: 22, bold: true, color: '#e65100', alignment: 'center' }, { text: 'صيانة',          style: 'summaryLabel' }] },
            { stack: [{ text: `${occupancyPct}%`,     fontSize: 22, bold: true, color: '#4472C4', alignment: 'center' }, { text: 'نسبة الإشغال',   style: 'summaryLabel' }] },
            { stack: [{ text: formatCurrency(totalRent), fontSize: 14, bold: true, color: '#4472C4', alignment: 'center' }, { text: 'إيراد شهري متوقع', style: 'summaryLabel' }] },
          ],
          margin: [0, 0, 0, 15]
        },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', '*', 'auto', 'auto'],
            body: tableBody
          },
          layout: { hLineColor: '#e0e0e0', vLineColor: '#e0e0e0', fillColor: (row) => row % 2 === 0 ? '#f9f9f9' : null }
        }
      ]
    };

    return generatePDF(doc, filepath);
  }

  // ═══════════════════════════════════════════════════════════
  // إيصال دفع
  // ═══════════════════════════════════════════════════════════
  static async generatePaymentReceipt(payment, filepath) {
    const doc = {
      pageSize:      'A5',
      pageDirection: 'rtl',
      defaultStyle:  { font: 'Arabic', alignment: 'right' },
      styles: baseStyles,
      content: [
        { text: 'إيصال استلام دفعة', style: 'header' },
        { text: 'نظام إدارة المخازن', style: 'subheader' },
        {
          columns: [
            { text: `رقم الإيصال: ${payment.receiptNumber || '-'}`, fontSize: 9, color: '#666' },
            { text: `التاريخ: ${formatDate(payment.paymentDate)}`,   fontSize: 9, color: '#666', alignment: 'left' }
          ],
          margin: [0, 0, 0, 10]
        },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: 'المستأجر',    bold: true, fillColor: '#f5f5f5' }, { text: payment.tenantId?.name           || '-' }],
              [{ text: 'رقم البلوك',  bold: true, fillColor: '#f5f5f5' }, { text: payment.blockId?.blockNumber     || '-' }],
              [{ text: 'الشهر',       bold: true, fillColor: '#f5f5f5' }, { text: payment.monthYear                || '-' }],
              [{ text: 'طريقة الدفع', bold: true, fillColor: '#f5f5f5' }, { text: translateMethod(payment.paymentMethod) }],
            ]
          },
          margin: [0, 0, 0, 15]
        },
        {
          text: formatCurrency(payment.amount),
          fontSize: 24, bold: true, color: '#2e7d32', alignment: 'center',
          margin: [0, 10, 0, 5]
        },
        { text: 'المبلغ المُستلم', fontSize: 10, color: '#666', alignment: 'center', margin: [0, 0, 0, 25] },
        {
          columns: [
            { text: ['__________________\n', { text: 'توقيع المستلم',   fontSize: 9, color: '#666' }], alignment: 'right' },
            { text: ['__________________\n', { text: 'توقيع المستأجر',  fontSize: 9, color: '#666' }], alignment: 'left'  },
          ]
        }
      ]
    };

    return generatePDF(doc, filepath);
  }

  // ═══════════════════════════════════════════════════════════
  // تقرير شهري
  // ═══════════════════════════════════════════════════════════
  static async generateMonthlyReport(data, filepath) {
    const doc = {
      pageSize:      'A4',
      pageDirection: 'rtl',
      defaultStyle:  { font: 'Arabic', alignment: 'right' },
      styles: baseStyles,
      content: [
        { text: 'التقرير الشهري', style: 'header' },
        { text: `${data.month}   |   تاريخ الإنشاء: ${formatDate(new Date())}`, style: 'subheader' },
        {
          columns: [
            { stack: [{ text: formatCurrency(data.totalRevenue || 0),  fontSize: 16, bold: true, color: '#4472C4', alignment: 'center' }, { text: 'إجمالي الإيرادات', style: 'summaryLabel' }] },
            { stack: [{ text: (data.paymentsCount || 0).toString(),     fontSize: 16, bold: true, color: '#4472C4', alignment: 'center' }, { text: 'عدد الدفعات',     style: 'summaryLabel' }] },
            { stack: [{ text: formatCurrency(data.overdueAmount || 0), fontSize: 16, bold: true, color: '#c62828', alignment: 'center' }, { text: 'المتأخرات',       style: 'summaryLabel' }] },
          ],
          margin: [0, 10, 0, 0]
        }
      ]
    };

    return generatePDF(doc, filepath);
  }

  // ═══════════════════════════════════════════════════════════
  // تقرير بلوك مفصّل
  // ═══════════════════════════════════════════════════════════
  static async generateBlockReport(blockData, filepath) {
    const block    = blockData.block;
    const stats    = blockData.statistics;
    const payments = blockData.payments || [];

    const tableBody = [
      headerRow(['الشهر', 'تاريخ الاستحقاق', 'تاريخ الدفع', 'المبلغ', 'الحالة']),
      ...payments.slice(0, 20).map(p => [
        { text: p.monthYear              || '-', style: 'cell' },
        { text: formatDate(p.dueDate),            style: 'cell' },
        { text: p.paymentDate ? formatDate(p.paymentDate) : '-', style: 'cell' },
        { text: formatCurrency(p.amount),         style: 'cell' },
        {
          text: translateStatus(p.status), style: 'cell',
          color: p.status === 'paid' ? '#2e7d32' : p.status === 'overdue' ? '#c62828' : '#e65100'
        },
      ])
    ];

    if (payments.length === 0) {
      tableBody.push([{ text: 'لا توجد دفعات مسجّلة', colSpan: 5, alignment: 'center', style: 'cell' }, '', '', '', '']);
    }

    const doc = {
      pageSize:      'A4',
      pageDirection: 'rtl',
      defaultStyle:  { font: 'Arabic', alignment: 'right' },
      styles: baseStyles,
      content: [
        { text: `تقرير مفصّل — البلوك ${block.blockNumber}`, style: 'header' },
        { text: `تاريخ التقرير: ${formatDate(new Date())}`, style: 'subheader' },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: 'رقم البلوك',    bold: true, fillColor: '#f5f5f5' }, { text: block.blockNumber }],
              [{ text: 'المخزن',        bold: true, fillColor: '#f5f5f5' }, { text: block.storeId?.name || '-' }],
              [{ text: 'الحالة',        bold: true, fillColor: '#f5f5f5' }, { text: translateStatus(block.status) }],
              [{ text: 'المستأجر',      bold: true, fillColor: '#f5f5f5' }, { text: block.currentTenant?.name || 'لا يوجد مستأجر' }],
              [{ text: 'الإيجار الشهري', bold: true, fillColor: '#f5f5f5' }, { text: formatCurrency(block.monthlyRent || 0) }],
            ]
          },
          margin: [0, 0, 0, 15]
        },
        {
          columns: [
            { stack: [{ text: formatCurrency(stats?.totalRevenue || 0),  bold: true, color: '#4472C4', alignment: 'center' }, { text: 'إجمالي المحصّل', style: 'summaryLabel' }] },
            { stack: [{ text: formatCurrency(stats?.overdueAmount || 0), bold: true, color: '#c62828', alignment: 'center' }, { text: 'المتأخرات',       style: 'summaryLabel' }] },
            { stack: [{ text: (stats?.totalPayments || 0).toString(),     bold: true, color: '#4472C4', alignment: 'center' }, { text: 'عدد الدفعات',    style: 'summaryLabel' }] },
          ],
          margin: [0, 0, 0, 15]
        },
        { text: 'سجل الدفعات', style: 'sectionTitle' },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', 'auto', 'auto', 'auto'],
            body: tableBody
          },
          layout: { hLineColor: '#e0e0e0', vLineColor: '#e0e0e0', fillColor: (row) => row % 2 === 0 ? '#f9f9f9' : null }
        }
      ]
    };

    return generatePDF(doc, filepath);
  }
}

module.exports = PDFGenerator;