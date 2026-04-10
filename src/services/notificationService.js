// services/notificationService.js
const cron         = require('node-cron');
const moment       = require('moment');
const Payment      = require('../models/Payment');
const Unit         = require('../models/Block');
const Notification = require('../models/Notification');
const Tenant       = require('../models/Tenant');
const { ALERT_SETTINGS } = require('../config/constants');

class NotificationService {

  // ═══════════════════════════════════════════════════════════
  // تشغيل المهام المجدولة
  // ═══════════════════════════════════════════════════════════
  static startScheduledTasks() {
    console.log('🔔 Starting notification scheduler...');

    // كل يوم الساعة 9 صباحاً — تذكير بالدفعات القادمة
    cron.schedule('0 9 * * *', async () => {
      console.log('⏰ Payment reminder check...');
      await this.checkUpcomingPayments();
    });

    // كل يوم الساعة 10 صباحاً — إنذار المتأخرات
    cron.schedule('0 10 * * *', async () => {
      console.log('⏰ Overdue payment check...');
      await this.checkOverduePayments();
    });

    // كل يوم الساعة 11 صباحاً — تنبيه انتهاء العقود
    cron.schedule('0 11 * * *', async () => {
      console.log('⏰ Contract expiry check...');
      await this.checkContractExpiry();
    });

    // كل يوم منتصف الليل — تنظيف الإشعارات القديمة
    cron.schedule('0 0 * * *', async () => {
      await this.cleanupOldNotifications();
    });

    console.log('✅ All notification schedulers started');
  }

  // ═══════════════════════════════════════════════════════════
  // فحص الدفعات القادمة (تذكير مسبق)
  // ═══════════════════════════════════════════════════════════
  static async checkUpcomingPayments() {
    try {
      const reminderDays = ALERT_SETTINGS.PAYMENT_REMINDER_DAYS;
      const targetDate   = moment().add(reminderDays, 'days');

      const upcomingPayments = await Payment.find({
        status:  'pending',
        dueDate: {
          $gte: targetDate.startOf('day').toDate(),
          $lte: targetDate.endOf('day').toDate()
        }
      });

      let count = 0;
      for (const payment of upcomingPayments) {
        // تجنب الإشعارات المكررة في نفس اليوم
        const alreadySent = await Notification.findOne({
          type:           'payment_reminder',
          relatedPayment: payment._id,
          createdAt:      { $gte: moment().startOf('day').toDate() }
        });

        if (!alreadySent) {
          await this.createNotification({
            type:           'payment_reminder',
            title:          `تذكير دفع - وحدة ${payment.unitNumber}`,
            message:        `دفعة المستأجر ${payment.tenantName} لشهر ${payment.monthYear} مستحقة بعد ${reminderDays} أيام - المبلغ: ${payment.amount} جنيه`,
            relatedTenant:  payment.tenantId,
            relatedUnit:    payment.unitId,
            relatedPayment: payment._id,
            severity:       'warning'
          });
          count++;
        }
      }

      console.log(`✅ تم إرسال ${count} تذكير دفع`);
      return count;
    } catch (error) {
      console.error('❌ Error checking upcoming payments:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // فحص المتأخرات وإرسال الإنذارات
  // ═══════════════════════════════════════════════════════════
  static async checkOverduePayments() {
    try {
      const today = moment().startOf('day').toDate();

      // تحديث الدفعات المتأخرة
      const overduePayments = await Payment.find({
        status:  'pending',
        dueDate: { $lt: today }
      });

      let count = 0;
      for (const payment of overduePayments) {
        // تحديث الحالة وعدد أيام التأخير
        const daysOverdue = Math.floor((new Date() - payment.dueDate) / (1000 * 60 * 60 * 24));
        payment.status      = 'overdue';
        payment.daysOverdue = daysOverdue;
        await payment.save();

        // إرسال إنذار لو مش بعتناه قبل كده
        const alertDays = ALERT_SETTINGS.OVERDUE_ALERT_DAYS;
        if (!payment.overdueAlertSent && daysOverdue >= alertDays) {
          await this.createNotification({
            type:           'overdue_payment',
            title:          `⚠️ إنذار تأخير - وحدة ${payment.unitNumber}`,
            message:        `المستأجر ${payment.tenantName} متأخر ${daysOverdue} يوم في دفع إيجار ${payment.monthYear} - المبلغ: ${payment.amount} جنيه`,
            relatedTenant:  payment.tenantId,
            relatedUnit:    payment.unitId,
            relatedPayment: payment._id,
            severity:       daysOverdue > 14 ? 'urgent' : 'warning'
          });

          payment.overdueAlertSent = true;
          payment.overdueAlertDate = new Date();
          await payment.save();
          count++;
        }
      }

      console.log(`⚠️  تم تحديث ${overduePayments.length} دفعة متأخرة، إرسال ${count} إنذار`);
      return overduePayments.length;
    } catch (error) {
      console.error('❌ Error checking overdue payments:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // فحص انتهاء العقود
  // ═══════════════════════════════════════════════════════════
  static async checkContractExpiry() {
    try {
      const expiryDays = ALERT_SETTINGS.CONTRACT_EXPIRY_DAYS;

      const tenantsExpiringSoon = await Tenant.find({
        isActive:        true,
        contractEndDate: {
          $gte: new Date(),
          $lte: moment().add(expiryDays, 'days').toDate()
        }
      }).populate('activeUnits', 'unitNumber');

      let count = 0;
      for (const tenant of tenantsExpiringSoon) {
        const daysLeft = moment(tenant.contractEndDate).diff(moment(), 'days');

        // تجنب التكرار — مرة واحدة كل 7 أيام
        const recentAlert = await Notification.findOne({
          type:          'contract_expiry',
          relatedTenant: tenant._id,
          createdAt:     { $gte: moment().subtract(7, 'days').toDate() }
        });

        if (!recentAlert) {
          const unitNumbers = tenant.activeUnits.map(u => u.unitNumber).join(', ');

          await this.createNotification({
            type:          'contract_expiry',
            title:         `تنبيه: عقد قارب على الانتهاء`,
            message:       `عقد المستأجر ${tenant.name} (وحدات: ${unitNumbers}) سينتهي خلال ${daysLeft} يوم - ${moment(tenant.contractEndDate).format('DD/MM/YYYY')}`,
            relatedTenant: tenant._id,
            severity:      daysLeft <= 7 ? 'urgent' : 'warning'
          });
          count++;
        }
      }

      console.log(`📅 تم إرسال ${count} تنبيه انتهاء عقد`);
      return count;
    } catch (error) {
      console.error('❌ Error checking contract expiry:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // إنشاء إشعار
  // ═══════════════════════════════════════════════════════════
  static async createNotification(data) {
    try {
      const notification = await Notification.create(data);
      return notification;
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // الملخص اليومي
  // ═══════════════════════════════════════════════════════════
  static async sendDailySummary() {
    try {
      const today = moment().startOf('day').toDate();

      const stats = {
        newPayments:    await Payment.countDocuments({ paymentDate: { $gte: today } }),
        overduePayments:await Payment.countDocuments({ status: 'overdue' }),
        occupiedUnits:  await Unit.countDocuments({ status: 'occupied' }),
        emptyUnits:     await Unit.countDocuments({ status: 'empty' })
      };

      await this.createNotification({
        type:     'system',
        title:    `الملخص اليومي - ${moment().format('DD/MM/YYYY')}`,
        message:  `دفعات اليوم: ${stats.newPayments} | متأخرات: ${stats.overduePayments} | وحدات مؤجرة: ${stats.occupiedUnits} | فارغة: ${stats.emptyUnits}`,
        severity: 'info'
      });

      return stats;
    } catch (error) {
      console.error('❌ Error sending daily summary:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // تنظيف الإشعارات القديمة (أكتر من 30 يوم ومقروءة)
  // ═══════════════════════════════════════════════════════════
  static async cleanupOldNotifications() {
    try {
      const result = await Notification.deleteMany({
        createdAt: { $lt: moment().subtract(30, 'days').toDate() },
        isRead:    true
      });
      console.log(`🧹 حُذف ${result.deletedCount} إشعار قديم`);
      return result.deletedCount;
    } catch (error) {
      console.error('❌ Error cleaning notifications:', error);
      throw error;
    }
  }
  
}

module.exports = NotificationService;