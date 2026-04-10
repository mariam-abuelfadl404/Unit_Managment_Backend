// services/schedulerService.js
const cron               = require('node-cron');
const moment             = require('moment');
const NotificationService = require('./notificationService');
const BackupService       = require('./backupService');
const User                = require('../models/User');
const Unit                = require('../models/Block');
const Payment             = require('../models/Payment');
const Notification        = require('../models/Notification');

class ScheduleService {

  static init() {
    console.log('⏰ بدء تشغيل المهام المجدولة...');

    // 1. كل يوم 9 صباحاً — تذكير الدفعات القادمة
    cron.schedule('0 9 * * *', async () => {
      try { await NotificationService.checkUpcomingPayments(); }
      catch (e) { console.error('❌ تذكيرات الدفعات:', e.message); }
    });

    // 2. كل يوم 10 صباحاً — إنذارات المتأخرات
    cron.schedule('0 10 * * *', async () => {
      try { await NotificationService.checkOverduePayments(); }
      catch (e) { console.error('❌ إشعارات المتأخرات:', e.message); }
    });

    // 3. كل يوم 11 صباحاً — تنبيه انتهاء العقود
    cron.schedule('0 11 * * *', async () => {
      try { await NotificationService.checkContractExpiry(); }
      catch (e) { console.error('❌ تنبيهات العقود:', e.message); }
    });

    // 4. كل يوم 2 صباحاً — نسخة احتياطية + إشعار تقرير يومي
    cron.schedule('0 2 * * *', async () => {
      await this.runDailyBackupAndReport();
    });

    // 5. كل يوم 4 عصراً — الملخص اليومي
    cron.schedule('0 16 * * *', async () => {
      try { await NotificationService.sendDailySummary(); }
      catch (e) { console.error('❌ الملخص اليومي:', e.message); }
    });

    // 6. أول يوم من كل شهر 6 صباحاً — توليد دفعات الشهر الجديد + تقرير شهري
    cron.schedule('0 6 1 * *', async () => {
      try { await this.generateMonthlyPayments(); }
      catch (e) { console.error('❌ توليد الدفعات الشهرية:', e.message); }

      try { await this.notifyMonthlyReport(); }
      catch (e) { console.error('❌ إشعار التقرير الشهري:', e.message); }
    });

    // 7. كل اثنين 8 صباحاً — إشعار تقرير اسبوعي
    cron.schedule('0 8 * * 1', async () => {
      try { await this.notifyWeeklyReport(); }
      catch (e) { console.error('❌ إشعار التقرير الاسبوعي:', e.message); }
    });

    // 8. كل سبت 8 صباحاً — تنظيف الإشعارات القديمة
    cron.schedule('0 8 * * 6', async () => {
      try { await NotificationService.cleanupOldNotifications(); }
      catch (e) { console.error('❌ تنظيف الإشعارات:', e.message); }
    });

    // 9. كل 6 ساعات — فحص صحة النظام
    cron.schedule('0 */6 * * *', async () => {
      try { await this.runHealthCheck(); }
      catch (e) { console.error('❌ فحص الصحة:', e.message); }
    });

    console.log('✅ تم بدء جميع المهام المجدولة');
  }

  // ═══════════════════════════════════════════════════════════
  // نسخة احتياطية يومية + إشعار التقرير اليومي
  // ═══════════════════════════════════════════════════════════
  static async runDailyBackupAndReport() {
    const today = moment().format('YYYY-MM-DD');
    console.log(`🔄 النسخة الاحتياطية اليومية + التقرير - ${today}`);

    // ── 1. نسخة احتياطية ────────────────────────────────────
    try {
      const backup = await BackupService.createBackup();
      console.log(`✅ نسخة احتياطية: ${backup.filename} (${backup.size})`);
    } catch (e) {
      console.error('❌ النسخ الاحتياطي:', e.message);
      await Notification.create({
        type:     'system',
        title:    '⚠️ فشل النسخ الاحتياطي',
        message:  `فشل إنشاء النسخة الاحتياطية ليوم ${today}: ${e.message}`,
        severity: 'urgent'
      });
    }

    // ── 2. إحصائيات اليوم ───────────────────────────────────
    try {
      const stats = await this._getDailyStats(today);

      await Notification.create({
        type:    'system',
        title:   `📊 التقرير اليومي جاهز — ${moment().format('DD/MM/YYYY')}`,
        message: [
          `📥 دفعات اليوم: ${stats.paidToday} دفعة — إجمالي ${stats.paidAmount.toLocaleString('ar-EG')} ج.م`,
          `⚠️ دفعات متأخرة: ${stats.overdueCount} دفعة — ${stats.overdueAmount.toLocaleString('ar-EG')} ج.م`,
          `🏠 وحدات مؤجرة: ${stats.occupiedUnits} / ${stats.totalUnits} (${stats.occupancyRate}%)`,
          `📦 اذهب إلى صفحة التقارير لتحميل تقرير اليوم`
        ].join('\n'),
        severity: 'info'
      });

      console.log(`✅ إشعار التقرير اليومي أُنشئ`);
    } catch (e) {
      console.error('❌ إشعار التقرير اليومي:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // إشعار التقرير الاسبوعي
  // ═══════════════════════════════════════════════════════════
  static async notifyWeeklyReport() {
    const weekStart = moment().startOf('isoWeek').subtract(1, 'week').format('DD/MM/YYYY');
    const weekEnd   = moment().endOf('isoWeek').subtract(1, 'week').format('DD/MM/YYYY');

    const startStr = moment().startOf('isoWeek').subtract(1, 'week').format('YYYY-MM-DD');
    const endStr   = moment().endOf('isoWeek').subtract(1, 'week').format('YYYY-MM-DD');

    const paidAgg = await Payment.aggregate([
      { $match: { status: 'paid', paymentDate: { $gte: new Date(startStr), $lte: new Date(endStr) } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);
    const paid = paidAgg[0] || { total: 0, count: 0 };

    await Notification.create({
      type:    'system',
      title:   `📊 التقرير الاسبوعي جاهز — ${weekStart} → ${weekEnd}`,
      message: [
        `✅ دفعات الأسبوع: ${paid.count} دفعة — ${paid.total.toLocaleString('ar-EG')} ج.م`,
        `📥 اذهب إلى صفحة التقارير لتحميل التقرير الاسبوعي`
      ].join('\n'),
      severity: 'info'
    });

    console.log(`✅ إشعار التقرير الاسبوعي أُنشئ`);
  }

  // ═══════════════════════════════════════════════════════════
  // إشعار التقرير الشهري
  // ═══════════════════════════════════════════════════════════
  static async notifyMonthlyReport() {
    const prevMonth = moment().subtract(1, 'month').format('YYYY-MM');
    const monthName = moment().subtract(1, 'month').format('MMMM YYYY');

    const paidAgg = await Payment.aggregate([
      { $match: { monthYear: prevMonth, status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);
    const overdueAgg = await Payment.aggregate([
      { $match: { monthYear: prevMonth, status: 'overdue' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    const paid    = paidAgg[0]    || { total: 0, count: 0 };
    const overdue = overdueAgg[0] || { total: 0, count: 0 };

    await Notification.create({
      type:    'system',
      title:   `📊 التقرير الشهري جاهز — ${monthName}`,
      message: [
        `✅ محصّل: ${paid.count} دفعة — ${paid.total.toLocaleString('ar-EG')} ج.م`,
        `⚠️ متأخر: ${overdue.count} دفعة — ${overdue.total.toLocaleString('ar-EG')} ج.م`,
        `📥 اذهب إلى صفحة التقارير لتحميل التقرير الشهري`
      ].join('\n'),
      severity: overdue.count > 0 ? 'warning' : 'info'
    });

    console.log(`✅ إشعار التقرير الشهري أُنشئ`);
  }

  // ═══════════════════════════════════════════════════════════
  // جلب إحصائيات اليوم
  // ═══════════════════════════════════════════════════════════
  static async _getDailyStats(dayStr) {
    const start = new Date(`${dayStr}T00:00:00.000Z`);
    const end   = new Date(`${dayStr}T23:59:59.999Z`);

    const paidAgg = await Payment.aggregate([
      { $match: { status: 'paid', paymentDate: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    const overdueAgg = await Payment.aggregate([
      { $match: { status: 'overdue' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    const totalUnits    = await Unit.countDocuments();
    const occupiedUnits = await Unit.countDocuments({ status: 'occupied' });
    const occupancyRate = totalUnits > 0 ? ((occupiedUnits / totalUnits) * 100).toFixed(1) : 0;

    return {
      paidToday:      paidAgg[0]?.count    || 0,
      paidAmount:     paidAgg[0]?.total    || 0,
      overdueCount:   overdueAgg[0]?.count || 0,
      overdueAmount:  overdueAgg[0]?.total || 0,
      totalUnits,
      occupiedUnits,
      occupancyRate,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // توليد دفعات الشهر الجديد تلقائياً
  // ═══════════════════════════════════════════════════════════
  static async generateMonthlyPayments() {
    const nextMonth = moment().add(1, 'month').format('YYYY-MM');
    console.log(`💰 توليد دفعات شهر ${nextMonth}...`);

    // تحديث المتأخرات أولاً
    const today = new Date();
    await Payment.updateMany(
      { status: { $in: ['pending', 'partial'] }, dueDate: { $lt: today } },
      { $set: { status: 'overdue' } }
    );

    const units   = await Unit.find({ status: 'occupied' });
    let created   = 0;
    let skipped   = 0;

    for (const unit of units) {
      if (!unit.currentTenant) continue;

      const exists = await Payment.findOne({
        unitId:   unit._id,
        tenantId: unit.currentTenant,
        monthYear: nextMonth
      });

      if (exists) { skipped++; continue; }

      const dueDate = moment(nextMonth, 'YYYY-MM').date(unit.paymentDueDay || 1).toDate();

      await Payment.create({
        unitId:     unit._id,
        unitNumber: unit.unitNumber,
        tenantId:   unit.currentTenant,
        tenantName: unit.currentTenantName,
        amount:     unit.monthlyRent,
        amountPaid: 0,
        monthYear:  nextMonth,
        dueDate,
        status:     'pending'
      });
      created++;
    }

    await Notification.create({
      type:    'system',
      title:   `📅 دفعات شهر ${nextMonth} جاهزة`,
      message: `تم توليد ${created} دفعة جديدة لشهر ${nextMonth} (تم تخطي ${skipped} موجودة مسبقاً)`,
      severity: 'info'
    });

    console.log(`✅ تم توليد ${created} دفعة، تم تخطي ${skipped}`);
    return { created, skipped, month: nextMonth };
  }

  // ═══════════════════════════════════════════════════════════
  // فحص صحة النظام
  // ═══════════════════════════════════════════════════════════
  static async runHealthCheck() {
    const checks = { database: false, backups: false };

    try {
      await User.countDocuments();
      checks.database = true;
    } catch (e) { console.error('❌ فحص قاعدة البيانات:', e.message); }

    try {
      const backups  = await BackupService.listBackups();
      checks.backups = backups.length > 0;
    } catch (e) { console.error('❌ فحص النسخ الاحتياطية:', e.message); }

    const allPassed = Object.values(checks).every(Boolean);

    if (!allPassed) {
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      await NotificationService.createNotification({
        type:     'system',
        title:    '⚠️ تحذير: فحص النظام',
        message:  `فشل في: ${failed.join(', ')}`,
        severity: 'warning'
      });
    }

    return { success: allPassed, checks, timestamp: new Date() };
  }

  // ═══════════════════════════════════════════════════════════
  // تشغيل مهمة يدوياً (للاختبار)
  // ═══════════════════════════════════════════════════════════
  static async runTaskManually(taskName) {
    console.log(`▶️ تشغيل يدوي: ${taskName}`);
    switch (taskName) {
      case 'backup':               return await BackupService.createBackup();
      case 'dailyReport':          return await this.runDailyBackupAndReport();
      case 'weeklyReport':         return await this.notifyWeeklyReport();
      case 'monthlyReport':        return await this.notifyMonthlyReport();
      case 'paymentReminders':     return await NotificationService.checkUpcomingPayments();
      case 'overdueNotifications': return await NotificationService.checkOverduePayments();
      case 'contractExpiry':       return await NotificationService.checkContractExpiry();
      case 'monthlyPayments':      return await this.generateMonthlyPayments();
      case 'dailySummary':         return await NotificationService.sendDailySummary();
      case 'healthCheck':          return await this.runHealthCheck();
      case 'cleanupNotifications': return await NotificationService.cleanupOldNotifications();
      default: throw new Error(`مهمة غير معروفة: ${taskName}`);
    }
  }

  // ── إيقاف المهام ─────────────────────────────────────────
  static stop() {
    cron.getTasks().forEach(task => task.stop());
    console.log('⏹️ تم إيقاف جميع المهام المجدولة');
  }

  // ── حالة المهام ──────────────────────────────────────────
  static getStatus() {
    return [
      { name: 'تذكير الدفعات',        schedule: '0 9 * * *'   },
      { name: 'إنذارات المتأخرات',     schedule: '0 10 * * *'  },
      { name: 'تنبيهات العقود',        schedule: '0 11 * * *'  },
      { name: 'نسخ احتياطي + تقرير يومي', schedule: '0 2 * * *' },
      { name: 'الملخص اليومي',         schedule: '0 16 * * *'  },
      { name: 'دفعات + تقرير شهري',    schedule: '0 6 1 * *'   },
      { name: 'التقرير الاسبوعي',      schedule: '0 8 * * 1'   },
      { name: 'تنظيف الإشعارات',       schedule: '0 8 * * 6'   },
      { name: 'فحص الصحة',             schedule: '0 */6 * * *' }
    ];
  }
}

module.exports = ScheduleService;