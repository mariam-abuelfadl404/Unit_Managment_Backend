// controllers/reportController.js
const ExcelJS  = require('exceljs');
const path     = require('path');
const fs       = require('fs');
const moment   = require('moment');
const Unit     = require('../models/Block');
const Payment  = require('../models/Payment');
const Tenant   = require('../models/Tenant');
const UnitNote = require('../models/UnitNote');

// ── Helpers ──────────────────────────────────────────────
const ensureDir = (fp) => {
  const d = path.dirname(fp);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
};

const todayStr  = () => moment().format('YYYY-MM-DD');
const fmtDate   = (d) => d ? moment(d).format('DD/MM/YYYY') : '-';
const fmtMoney  = (n) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`;
const transStatus = (s) => ({ paid: 'مدفوع ✓', pending: 'معلق', overdue: 'متأخر ⚠', partial: 'جزئي', occupied: 'مؤجرة', empty: 'فارغة' }[s] || s || '-');
const transMethod = (m) => ({ cash: 'كاش', bank_transfer: 'تحويل بنكي', wallet: 'محفظة', instapay: 'إنستاباي' }[m] || m || '-');
const transCargo  = (c) => ({ import: 'واردات', export: 'صادرات', storage: 'تخزين', packaging: 'تغليف' }[c] || c || '-');

// ── Styling ───────────────────────────────────────────────
const COLORS = {
  headerBlue:  'FF1D4ED8', headerGreen: 'FF047857', headerPurple: 'FF7C3AED',
  headerRed:   'FFDC2626', bgLight: 'FFF0F9FF', bgAlt: 'FFFFFFFF',
  bgTitle: 'FFDBEAFE',    textWhite: 'FFFFFFFF', textBlue: 'FF1E40AF',
  bgGreen: 'FFDCFCE7',    textGreen: 'FF15803D', bgRed: 'FFFEE2E2',
  textRed: 'FFDC2626',    bgYellow: 'FFFEF9C3', textYellow: 'FFB45309',
  bgSummary: 'FFF8FAFC',  textGray: 'FF64748B',  bgTotalRow: 'FFDBEAFE'
};

const styleHeader = (row, color = COLORS.headerBlue) => {
  row.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: COLORS.textWhite }, size: 11, name: 'Arial' };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' }
    };
  });
  row.height = 32;
};

const styleDataRow = (row, isEven) => {
  row.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? COLORS.bgLight : COLORS.bgAlt } };
    cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: false };
    cell.border    = {
      top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      right: { style: 'hair', color: { argb: 'FFE2E8F0' } }
    };
    cell.font = { size: 10, name: 'Arial' };
  });
  row.height = 22;
};

const styleTotalRow = (row) => {
  row.eachCell(cell => {
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.bgTotalRow } };
    cell.font  = { bold: true, size: 11, name: 'Arial', color: { argb: COLORS.textBlue } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  row.height = 26;
};

const colorCell = (cell, bgColor, textColor, bold = true) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.font = { color: { argb: textColor }, bold, size: 10, name: 'Arial' };
};

const addTitle = (ws, title, colCount, subtitle = '') => {
  ws.views = [{ rightToLeft: true }];

  ws.mergeCells(1, 1, 1, colCount);
  const t = ws.getRow(1).getCell(1);
  t.value     = title;
  t.font      = { bold: true, size: 15, name: 'Arial', color: { argb: COLORS.textBlue } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  t.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.bgTitle } };
  ws.getRow(1).height = 42;

  ws.mergeCells(2, 1, 2, colCount);
  const sub = ws.getRow(2).getCell(1);
  sub.value     = subtitle || `تاريخ التقرير: ${moment().format('dddd DD/MM/YYYY - HH:mm')}`;
  sub.font      = { size: 10, name: 'Arial', color: { argb: COLORS.textGray } };
  sub.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;

  ws.addRow([]); // empty spacer
};

// ═══════════════════════════════════════════════════════════
// SHEET BUILDERS
// ═══════════════════════════════════════════════════════════

// ── 1. ورقة ملخص الوحدات ─────────────────────────────────
const buildSummarySheet = (wb, units) => {
  const ws = wb.addWorksheet('نظرة عامة');
  ws.views = [{ rightToLeft: true }];
  ws.properties.defaultColWidth = 22;

  const total    = units.length;
  const occupied = units.filter(u => u.status === 'occupied').length;
  const empty    = units.filter(u => u.status === 'empty').length;
  const withLock = units.filter(u => u.hasLock && u.status === 'occupied').length;
  const noLock   = occupied - withLock;
  const totalRent = units.filter(u => u.status === 'occupied').reduce((s, u) => s + (u.monthlyRent || 0), 0);
  const rate      = total > 0 ? ((occupied / total) * 100).toFixed(1) : 0;

  addTitle(ws, '📊 نظرة عامة - نظام إدارة الوحدات', 4);

  const summaryItems = [
    ['📦 إجمالي الوحدات', total,                '📊 نسبة الإشغال', `${rate}%`],
    ['✅ وحدات مؤجرة',   occupied,              '⬜ وحدات فارغة',  empty],
    ['🔒 مؤجرة بقفل',    withLock,              '🔓 مؤجرة بدون قفل', noLock],
    ['💰 إيراد شهري متوقع', fmtMoney(totalRent), '📅 تاريخ التقرير', todayStr()],
  ];

  summaryItems.forEach((rowData, i) => {
    const row = ws.addRow(rowData);
    [1, 3].forEach(col => {
      row.getCell(col).font = { bold: true, size: 11, name: 'Arial' };
      row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });
    [2, 4].forEach(col => {
      row.getCell(col).alignment = { horizontal: 'center' };
      row.getCell(col).font = { bold: true, size: 12, name: 'Arial', color: { argb: COLORS.textBlue } };
    });
    row.height = 26;
  });
};

// ── 2. ورقة الوحدات الشاملة ──────────────────────────────
const buildUnitsSheet = async (wb, params = {}) => {
  const { unitId, status, storeId } = params;

  const query = {};
  if (unitId)  query._id    = unitId;
  if (status)  query.status = status;
  if (storeId) query.storeId = storeId;

  const units = await Unit.find(query)
    .populate('currentTenant', 'name phone nationalId')
    .sort({ unitNumber: 1 });

  buildSummarySheet(wb, units);

  const ws = wb.addWorksheet('بيانات الوحدات');
  ws.properties.defaultColWidth = 16;

  const cols = [
    { key: 'unitNumber',    width: 12 },
    { key: 'size',          width: 14 },
    { key: 'status',        width: 14 },
    { key: 'hasLock',       width: 14 },
    { key: 'cargoType',     width: 14 },
    { key: 'monthlyRent',   width: 18 },
    { key: 'paymentDueDay', width: 14 },
    { key: 'tenantName',    width: 24 },
    { key: 'tenantPhone',   width: 16 },
    { key: 'nationalId',    width: 18 },
    { key: 'rentalStart',   width: 16 },
    { key: 'rentalEnd',     width: 16 },
    { key: 'notes',         width: 28 },
  ];
  ws.columns = cols;

  addTitle(ws, unitId ? `تفاصيل الوحدة - ${units[0]?.unitNumber || ''}` : 'قائمة جميع الوحدات', cols.length);

  const hRow = ws.addRow([
    'رقم الوحدة', 'المقاس', 'الحالة', 'القفل', 'نوع البضاعة',
    'الإيجار الشهري', 'يوم الدفع', 'اسم المستأجر', 'هاتف المستأجر',
    'الرقم القومي', 'بداية الإيجار', 'نهاية العقد', 'ملاحظات'
  ]);
  styleHeader(hRow);

  units.forEach((u, i) => {
    const row = ws.addRow({
      unitNumber:    u.unitNumber,
      size:          u.size || '-',
      status:        transStatus(u.status),
      hasLock:       u.status === 'occupied' ? (u.hasLock ? '🔒 بقفل' : '🔓 بدون قفل') : '-',
      cargoType:     transCargo(u.cargoType),
      monthlyRent:   u.monthlyRent || 0,
      paymentDueDay: u.paymentDueDay ? `يوم ${u.paymentDueDay}` : '-',
      tenantName:    u.currentTenantName || u.currentTenant?.name || '-',
      tenantPhone:   u.currentTenantPhone || u.currentTenant?.phone || '-',
      nationalId:    u.currentTenant?.nationalId || '-',
      rentalStart:   fmtDate(u.rentalStartDate),
      rentalEnd:     fmtDate(u.rentalEndDate),
      notes:         u.notes || '-',
    });
    styleDataRow(row, i % 2 === 0);

    // Status color
    if (u.status === 'occupied') {
      colorCell(row.getCell(3), COLORS.bgGreen,  COLORS.textGreen);
    } else {
      colorCell(row.getCell(3), COLORS.bgYellow, COLORS.textYellow);
    }
    // Money format
    row.getCell(6).numFmt = '#,##0 "ج.م"';
  });

  // Total row
  const occupied = units.filter(u => u.status === 'occupied');
  const totalRent = occupied.reduce((s, u) => s + (u.monthlyRent || 0), 0);
  const tRow = ws.addRow([
    `الإجمالي: ${units.length} وحدة`, '',
    `${occupied.length} مؤجرة / ${units.filter(u=>u.status==='empty').length} فارغة`,
    '', '', fmtMoney(totalRent), '', '', '', '', '', '', ''
  ]);
  styleTotalRow(tRow);
  ws.autoFilter = { from: 'A4', to: { row: 4, column: cols.length } };

  return units;
};

// ── 3. ورقة الدفعات ──────────────────────────────────────
const buildPaymentsSheet = async (wb, params = {}, sheetName = 'سجل الدفعات') => {
  const { unitId, tenantId, monthYear, startDate, endDate, status } = params;

  const query = { isDeleted: { $ne: true } };
  if (unitId)   query.unitId   = unitId;
  if (tenantId) query.tenantId = tenantId;
  if (monthYear)query.monthYear = monthYear;
  if (status)   query.status   = status;
  if (startDate && endDate) {
    query.dueDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  const payments = await Payment.find(query).sort({ dueDate: -1 });

  const ws = wb.addWorksheet(sheetName);
  ws.properties.defaultColWidth = 16;

  const cols = [
    { key: 'unitNumber',    width: 12 },
    { key: 'tenantName',    width: 22 },
    { key: 'monthYear',     width: 12 },
    { key: 'amount',        width: 16 },
    { key: 'amountPaid',    width: 16 },
    { key: 'remaining',     width: 16 },
    { key: 'status',        width: 12 },
    { key: 'dueDate',       width: 14 },
    { key: 'paymentDate',   width: 14 },
    { key: 'paymentMethod', width: 14 },
    { key: 'daysOverdue',   width: 14 },
  ];
  ws.columns = cols;
  addTitle(ws, sheetName, cols.length);

  const hRow = ws.addRow([
    'رقم الوحدة', 'المستأجر', 'الشهر', 'المطلوب', 'المدفوع', 'المتبقي',
    'الحالة', 'تاريخ الاستحقاق', 'تاريخ الدفع', 'طريقة الدفع', 'أيام التأخير'
  ]);
  styleHeader(hRow);

  let totAmount = 0, totPaid = 0, totOverdue = 0;

  payments.forEach((p, i) => {
    const remaining = Math.max(0, (p.amount || 0) - (p.amountPaid || 0));
    totAmount  += p.amount || 0;
    totPaid    += p.amountPaid || 0;
    if (remaining > 0) totOverdue += remaining;

    const row = ws.addRow({
      unitNumber:    p.unitNumber,
      tenantName:    p.tenantName,
      monthYear:     p.monthYear,
      amount:        p.amount,
      amountPaid:    p.amountPaid || 0,
      remaining,
      status:        transStatus(p.status),
      dueDate:       fmtDate(p.dueDate),
      paymentDate:   fmtDate(p.paymentDate),
      paymentMethod: transMethod(p.paymentMethod),
      daysOverdue:   p.daysOverdue > 0 ? `${p.daysOverdue} يوم` : '-',
    });
    styleDataRow(row, i % 2 === 0);

    // Status color
    const sColors = {
      paid:    [COLORS.bgGreen,  COLORS.textGreen],
      overdue: [COLORS.bgRed,    COLORS.textRed],
      pending: [COLORS.bgYellow, COLORS.textYellow],
    };
    if (sColors[p.status]) colorCell(row.getCell(7), ...sColors[p.status]);

    // Remaining color
    if (remaining > 0.01) {
      row.getCell(6).font = { color: { argb: COLORS.textRed }, bold: true, size: 10, name: 'Arial' };
    }

    // Money format
    [4, 5, 6].forEach(col => { row.getCell(col).numFmt = '#,##0'; });
  });

  // Totals
  const tRow = ws.addRow([
    `الإجمالي: ${payments.length} دفعة`, '',  '',
    fmtMoney(totAmount), fmtMoney(totPaid), fmtMoney(totOverdue),
    '', '', '', '', ''
  ]);
  styleTotalRow(tRow);
  ws.autoFilter = { from: 'A4', to: { row: 4, column: cols.length } };

  return payments;
};

// ── 4. ورقة الملاحظات وحركة المخزن ──────────────────────
const buildNotesSheet = async (wb, params = {}, sheetName = 'الملاحظات والحركات') => {
  const { unitId, startDate, endDate } = params;

  const query = {};
  if (unitId) query.unitId = unitId;
  if (startDate && endDate) {
    query.date = {
      $gte: moment(startDate).format('YYYY-MM-DD'),
      $lte: moment(endDate).format('YYYY-MM-DD')
    };
  }

  const notes = await UnitNote.find(query)
    .populate('unitId', 'unitNumber')
    .populate('createdBy', 'fullName')
    .sort({ date: -1, createdAt: -1 });

  if (notes.length === 0) return;

  const ws = wb.addWorksheet(sheetName);
  ws.properties.defaultColWidth = 18;

  const cols = [
    { key: 'unitNumber',  width: 12 },
    { key: 'date',        width: 14 },
    { key: 'text',        width: 32 },
    { key: 'parcelCount', width: 12 },
    { key: 'cargoType',   width: 14 },
    { key: 'importFrom',  width: 20 },
    { key: 'exportTo',    width: 20 },
    { key: 'createdBy',   width: 18 },
  ];
  ws.columns = cols;
  addTitle(ws, sheetName, cols.length);

  const hRow = ws.addRow([
    'رقم الوحدة', 'التاريخ', 'الملاحظة', 'عدد الطرود',
    'نوع البضاعة', 'واردات من', 'صادرات إلى', 'بواسطة'
  ]);
  styleHeader(hRow, COLORS.headerPurple);

  notes.forEach((n, i) => {
    const hasMovement = n.parcelCount != null || n.cargoType || n.importFrom || n.exportTo;
    const row = ws.addRow({
      unitNumber:  n.unitId?.unitNumber || '-',
      date:        n.date,
      text:        n.text || '-',
      parcelCount: n.parcelCount != null ? n.parcelCount : '-',
      cargoType:   transCargo(n.cargoType),
      importFrom:  n.importFrom || '-',
      exportTo:    n.exportTo || '-',
      createdBy:   n.createdBy?.fullName || '-',
    });
    styleDataRow(row, i % 2 === 0);

    // Highlight movement rows
    if (hasMovement) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEFCE8' } };
      });
    }
  });

  ws.autoFilter = { from: 'A4', to: { row: 4, column: cols.length } };
};

// ── 5. ورقة تاريخ الإيجارات (لوحدة محددة) ───────────────
const buildRentalHistorySheet = (wb, unit) => {
  if (!unit?.rentalHistory?.length) return;

  const ws = wb.addWorksheet('تاريخ الإيجارات');
  ws.properties.defaultColWidth = 18;

  const cols = [
    { key: 'tenantName',  width: 24 },
    { key: 'startDate',   width: 16 },
    { key: 'endDate',     width: 16 },
    { key: 'monthlyRent', width: 18 },
    { key: 'totalPaid',   width: 18 },
    { key: 'totalDue',    width: 18 },
    { key: 'balance',     width: 20 },
    { key: 'notes',       width: 28 },
  ];
  ws.columns = cols;
  addTitle(ws, 'تاريخ الإيجارات السابقة', cols.length);

  const hRow = ws.addRow([
    'المستأجر', 'بداية الإيجار', 'نهاية الإيجار',
    'الإيجار الشهري', 'إجمالي مدفوع', 'إجمالي مطلوب', 'الرصيد', 'ملاحظات'
  ]);
  styleHeader(hRow, COLORS.headerGreen);

  unit.rentalHistory.forEach((h, i) => {
    const bal = h.balance || 0;
    const row = ws.addRow({
      tenantName:  h.tenantName,
      startDate:   fmtDate(h.startDate),
      endDate:     fmtDate(h.endDate),
      monthlyRent: fmtMoney(h.monthlyRent),
      totalPaid:   fmtMoney(h.totalPaid),
      totalDue:    fmtMoney(h.totalDue),
      balance:     bal < 0 ? `عليه ${fmtMoney(Math.abs(bal))}` : bal > 0 ? `له ${fmtMoney(bal)}` : 'مسدد ✓',
      notes:       h.notes || '-',
    });
    styleDataRow(row, i % 2 === 0);
    if (bal < 0)      colorCell(row.getCell(7), COLORS.bgRed,   COLORS.textRed);
    else if (bal > 0) colorCell(row.getCell(7), COLORS.bgGreen, COLORS.textGreen);
  });
};

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════
exports.generateExcelReport = async (req, res) => {
  try {
    const { type, startDate, endDate, unitId, unitNumber, monthYear, status, tenantId } = req.query;

    const wb = new ExcelJS.Workbook();
    wb.creator   = 'نظام إدارة الوحدات';
    wb.created   = new Date();
    wb.modified  = new Date();

    let filename = '';
    let resolvedUnitId = unitId;

    // Resolve unitNumber → unitId
    if (unitNumber && !unitId) {
      const unit = await Unit.findOne({ unitNumber });
      if (unit) resolvedUnitId = unit._id.toString();
      else return res.status(404).json({ success: false, error: `الوحدة ${unitNumber} غير موجودة` });
    }

    // ── تقرير وحدة محددة بالكامل ──────────────────────────
    if (type === 'unit_detail') {
      if (!resolvedUnitId) return res.status(400).json({ success: false, error: 'حدد رقم الوحدة' });

      const units = await buildUnitsSheet(wb, { unitId: resolvedUnitId });
      if (!units.length) return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });

      await buildPaymentsSheet(wb, { unitId: resolvedUnitId }, 'سجل الدفعات');
      await buildNotesSheet(wb, { unitId: resolvedUnitId }, 'الملاحظات والحركات');
      buildRentalHistorySheet(wb, units[0]);

      filename = `تقرير_وحدة_${units[0].unitNumber}_${todayStr()}.xlsx`;
    }

    // ── تقرير كل الوحدات ──────────────────────────────────
    else if (type === 'units') {
      await buildUnitsSheet(wb, { status });
      await buildPaymentsSheet(wb, { status: 'overdue' }, 'الدفعات المتأخرة');
      await buildNotesSheet(wb, {}, 'آخر الملاحظات والحركات');
      filename = `تقرير_الوحدات_${todayStr()}.xlsx`;
    }

    // ── تقرير المستأجرين ───────────────────────────────────
    else if (type === 'tenants') {
      const wsTenants = wb.addWorksheet('المستأجرون');
      wsTenants.properties.defaultColWidth = 18;
      const tenants = await Tenant.find({ isActive: true })
        .populate('activeUnits', 'unitNumber monthlyRent rentalStartDate rentalEndDate')
        .sort({ name: 1 });

      const tCols = [
        { key: 'name',        width: 24 },
        { key: 'phone',       width: 16 },
        { key: 'phone2',      width: 16 },
        { key: 'nationalId',  width: 18 },
        { key: 'address',     width: 24 },
        { key: 'units',       width: 20 },
        { key: 'totalPaid',   width: 16 },
        { key: 'totalDue',    width: 16 },
        { key: 'balance',     width: 20 },
        { key: 'payStatus',   width: 14 },
        { key: 'since',       width: 14 },
      ];
      wsTenants.columns = tCols;
      addTitle(wsTenants, 'قائمة المستأجرين الكاملة', tCols.length);

      const hRow = wsTenants.addRow([
        'الاسم', 'الهاتف', 'هاتف 2', 'الرقم القومي', 'العنوان',
        'الوحدات النشطة', 'إجمالي مدفوع', 'إجمالي مطلوب', 'الرصيد',
        'حالة الدفع', 'مستأجر منذ'
      ]);
      styleHeader(hRow);

      tenants.forEach((t, i) => {
        const bal = t.balance || 0;
        const row = wsTenants.addRow({
          name:       t.name,
          phone:      t.phone,
          phone2:     t.phone2 || '-',
          nationalId: t.nationalId,
          address:    t.address || '-',
          units:      t.activeUnits.map(u => u.unitNumber).join(' / ') || '-',
          totalPaid:  fmtMoney(t.totalPaid),
          totalDue:   fmtMoney(t.totalDue),
          balance:    bal < 0 ? `-${fmtMoney(Math.abs(bal))}` : fmtMoney(bal),
          payStatus:  bal < 0 ? 'متأخر ⚠' : 'مسدد ✓',
          since:      fmtDate(t.firstRentalDate || t.createdAt),
        });
        styleDataRow(row, i % 2 === 0);

        if (bal < 0) {
          colorCell(row.getCell(10), COLORS.bgRed,   COLORS.textRed);
          row.getCell(9).font = { color: { argb: COLORS.textRed }, bold: true, size: 10, name: 'Arial' };
        } else {
          colorCell(row.getCell(10), COLORS.bgGreen, COLORS.textGreen);
        }
      });

      const totPaid = tenants.reduce((s, t) => s + (t.totalPaid || 0), 0);
      const totDue  = tenants.reduce((s, t) => s + (t.totalDue  || 0), 0);
      const tRow = wsTenants.addRow([
        `الإجمالي: ${tenants.length} مستأجر`, '', '', '', '',
        `${tenants.filter(t => t.activeUnits?.length).length} نشط`,
        fmtMoney(totPaid), fmtMoney(totDue), '', '', ''
      ]);
      styleTotalRow(tRow);
      wsTenants.autoFilter = { from: 'A4', to: { row: 4, column: tCols.length } };

      // Sheet المتأخرين
      const wsOver = wb.addWorksheet('المتأخرون');
      wsOver.properties.defaultColWidth = 18;
      const overdue = tenants.filter(t => (t.balance || 0) < 0).sort((a, b) => a.balance - b.balance);
      addTitle(wsOver, `المستأجرون المتأخرون (${overdue.length})`, 5);
      const ohRow = wsOver.addRow(['الاسم', 'الهاتف', 'الوحدات', 'المبلغ المتأخر', 'ملاحظات']);
      styleHeader(ohRow, COLORS.headerRed);
      for (const t of overdue) {
        const row = wsOver.addRow([
          t.name, t.phone,
          t.activeUnits.map(u => u.unitNumber).join(' / ') || '-',
          fmtMoney(Math.abs(t.balance || 0)),
          t.notes || '-',
        ]);
        styleDataRow(row, false);
        row.getCell(4).font = { color: { argb: COLORS.textRed }, bold: true, size: 10, name: 'Arial' };
      }

      await buildPaymentsSheet(wb, { status: 'overdue' }, 'الدفعات المتأخرة');
      filename = `تقرير_المستأجرين_${todayStr()}.xlsx`;
    }

    // ── تقرير الدفعات ──────────────────────────────────────
    else if (type === 'payments') {
      const pParams = { monthYear, status };
      if (startDate && endDate) { pParams.startDate = startDate; pParams.endDate = endDate; }
      await buildPaymentsSheet(wb, pParams, 'جميع الدفعات');
      await buildPaymentsSheet(wb, { ...pParams, status: 'overdue' }, 'المتأخرات');
      await buildPaymentsSheet(wb, { ...pParams, status: 'paid' },    'المدفوعة');
      await buildUnitsSheet(wb, {});
      filename = `تقرير_الدفعات_${monthYear || todayStr()}.xlsx`;
    }

    // ── تقرير يومي ─────────────────────────────────────────
    else if (type === 'daily') {
      const dayStr = todayStr();
      await buildPaymentsSheet(wb, { startDate: dayStr, endDate: dayStr }, `دفعات يوم ${dayStr}`);
      await buildNotesSheet(wb,   { startDate: dayStr, endDate: dayStr }, `حركات يوم ${dayStr}`);
      await buildUnitsSheet(wb, {});
      filename = `تقرير_يومي_${dayStr}.xlsx`;
    }

    // ── تقرير اسبوعي ───────────────────────────────────────
    else if (type === 'weekly') {
      const wStart = moment().startOf('isoWeek').format('YYYY-MM-DD');
      const wEnd   = moment().endOf('isoWeek').format('YYYY-MM-DD');
      await buildPaymentsSheet(wb, { startDate: wStart, endDate: wEnd }, `دفعات الأسبوع ${wStart}`);
      await buildNotesSheet(wb,   { startDate: wStart, endDate: wEnd }, `حركات الأسبوع`);
      await buildUnitsSheet(wb, {});
      filename = `تقرير_اسبوعي_${wStart}_${wEnd}.xlsx`;
    }

    // ── تقرير شهري ─────────────────────────────────────────
    else if (type === 'monthly') {
      const currMonth = monthYear || moment().format('YYYY-MM');
      const mStart = moment(currMonth, 'YYYY-MM').startOf('month').format('YYYY-MM-DD');
      const mEnd   = moment(currMonth, 'YYYY-MM').endOf('month').format('YYYY-MM-DD');
      await buildPaymentsSheet(wb, { monthYear: currMonth }, `دفعات ${currMonth}`);
      await buildPaymentsSheet(wb, { monthYear: currMonth, status: 'overdue' }, 'المتأخرات');
      await buildNotesSheet(wb,   { startDate: mStart, endDate: mEnd }, 'الحركات الشهرية');
      await buildUnitsSheet(wb, {});
      filename = `تقرير_شهري_${currMonth}.xlsx`;
    }

    // ── تقرير مخصص بفترة ───────────────────────────────────
    else if (type === 'custom') {
      if (!startDate || !endDate)
        return res.status(400).json({ success: false, error: 'حدد تاريخ البداية والنهاية' });
      await buildPaymentsSheet(wb, { startDate, endDate }, `دفعات ${startDate} → ${endDate}`);
      await buildUnitsSheet(wb, {});
      await buildNotesSheet(wb, { startDate, endDate }, `حركات ${startDate} → ${endDate}`);
      filename = `تقرير_مخصص_${startDate}_${endDate}.xlsx`;
    }

    // ── تقرير مستأجر محدد ──────────────────────────────────
    else if (type === 'tenant_detail' && tenantId) {
      const tenant = await Tenant.findById(tenantId).populate('activeUnits', 'unitNumber monthlyRent rentalStartDate rentalEndDate status');
      if (!tenant) return res.status(404).json({ success: false, error: 'المستأجر غير موجود' });

      await buildPaymentsSheet(wb, { tenantId }, `مدفوعات ${tenant.name}`);
      await buildPaymentsSheet(wb, { tenantId, status: 'overdue' }, 'المتأخرات');
      filename = `تقرير_مستأجر_${tenant.name}_${todayStr()}.xlsx`;
    }

    // ── شامل (افتراضي) ─────────────────────────────────────
    else {
      await buildUnitsSheet(wb, {});
      await buildPaymentsSheet(wb, {});
      await buildPaymentsSheet(wb, { status: 'overdue' }, 'المتأخرات');
      await buildNotesSheet(wb, {}, 'الملاحظات والحركات');
      filename = `تقرير_شامل_${todayStr()}.xlsx`;
    }

    // ── كتابة الملف وإرساله ────────────────────────────────
    const filepath = path.join(__dirname, '../../reports', filename);
    ensureDir(filepath);
    await wb.xlsx.writeFile(filepath);

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    res.download(filepath, filename, (err) => {
      if (err && !res.headersSent) console.error('Download error:', err);
      setTimeout(() => { try { fs.unlinkSync(filepath); } catch (_) {} }, 8000);
    });

  } catch (error) {
    console.error('❌ Excel report error:', error);
    if (!res.headersSent)
      res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// تقرير نهاية الإيجار - Excel
// ═══════════════════════════════════════════════════════════
exports.generateRentalEndReport = async (req, res) => {
  try {
    const { tenantId, unitId } = req.query;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId مطلوب' });

    const tenant = await Tenant.findById(tenantId).populate('activeUnits', 'unitNumber');
    if (!tenant) return res.status(404).json({ success: false, error: 'المستأجر غير موجود' });

    const query = { tenantId };
    if (unitId) query.unitId = unitId;
    const payments = await Payment.find(query).sort({ dueDate: 1 });

    const totalPaid    = payments.reduce((s, p) => s + (p.amountPaid || 0), 0);
    const totalDue     = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const balance      = totalPaid - totalDue;

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'نظام إدارة الوحدات';
    wb.created  = new Date();

    const ws = wb.addWorksheet('تقرير نهاية الإيجار');
    ws.properties.defaultColWidth = 20;
    ws.views = [{ rightToLeft: true }];

    addTitle(ws, `تقرير نهاية الإيجار — ${tenant.name}`, 6,
      `تاريخ إنشاء التقرير: ${moment().format('DD/MM/YYYY HH:mm')}`);

    // Tenant info
    const infoData = [
      ['👤 اسم المستأجر', tenant.name,      '📱 الهاتف',         tenant.phone],
      ['🆔 الرقم القومي',  tenant.nationalId, '🏠 الوحدات',       tenant.activeUnits.map(u => u.unitNumber).join(', ') || '-'],
    ];
    infoData.forEach(row => {
      const r = ws.addRow(row);
      [1, 3].forEach(c => { r.getCell(c).font = { bold: true, size: 11, name: 'Arial' }; });
      r.height = 22;
    });

    ws.addRow([]);

    // Financial summary
    ws.mergeCells(`A${ws.lastRow.number + 1}`, `F${ws.lastRow.number + 1}`);
    const sumTitle = ws.addRow(['الملخص المالي']);
    sumTitle.getCell(1).font = { bold: true, size: 12, name: 'Arial', color: { argb: COLORS.textBlue } };
    sumTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.bgTitle } };
    sumTitle.height = 28;

    const finRows = [
      ['إجمالي المطلوب', fmtMoney(totalDue), 'إجمالي المدفوع', fmtMoney(totalPaid), 'الرصيد النهائي',
        balance < 0 ? `عليه ${fmtMoney(Math.abs(balance))}` : balance > 0 ? `له ${fmtMoney(balance)}` : 'مسدد ✓'
      ]
    ];
    finRows.forEach(rowData => {
      const r = ws.addRow(rowData);
      r.eachCell(cell => { cell.font = { bold: true, size: 11, name: 'Arial' }; });
      // Color balance cell
      const balCell = r.getCell(6);
      if (balance < 0) colorCell(balCell, COLORS.bgRed,   COLORS.textRed);
      else if (balance > 0) colorCell(balCell, COLORS.bgGreen, COLORS.textGreen);
      else colorCell(balCell, COLORS.bgGreen, COLORS.textGreen);
      r.height = 28;
    });

    ws.addRow([]);

    // Payments table
    const hRow = ws.addRow(['الشهر', 'رقم الوحدة', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة']);
    styleHeader(hRow);

    payments.forEach((p, i) => {
      const rem = Math.max(0, (p.amount || 0) - (p.amountPaid || 0));
      const row = ws.addRow([
        p.monthYear, p.unitNumber,
        fmtMoney(p.amount), fmtMoney(p.amountPaid || 0), fmtMoney(rem),
        transStatus(p.status)
      ]);
      styleDataRow(row, i % 2 === 0);
      const sColors = {
        paid:    [COLORS.bgGreen,  COLORS.textGreen],
        overdue: [COLORS.bgRed,    COLORS.textRed],
        pending: [COLORS.bgYellow, COLORS.textYellow],
      };
      if (sColors[p.status]) colorCell(row.getCell(6), ...sColors[p.status]);
    });

    const filename = `نهاية_إيجار_${tenant.name}_${todayStr()}.xlsx`;
    const filepath = path.join(__dirname, '../../reports', filename);
    ensureDir(filepath);
    await wb.xlsx.writeFile(filepath);

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.download(filepath, filename, () => {
      setTimeout(() => { try { fs.unlinkSync(filepath); } catch (_) {} }, 8000);
    });

  } catch (error) {
    console.error('❌ Rental end report error:', error);
    if (!res.headersSent)
      res.status(500).json({ success: false, error: error.message });
  }
};

// ── Keep PDF route alive (redirect to Excel) ──────────────
exports.generatePDFReport = exports.generateExcelReport;