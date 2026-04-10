// controllers/notificationController.js
const Notification = require('../models/Notification');
const Payment = require('../models/Payment');
const Block = require('../models/Block');
const moment = require('moment');
const { NOTIFICATION_TYPES, NOTIFICATION_SEVERITY } = require('../config/constants');

// ═══════════════════════════════════════════════════════════
// Get all notifications
// ═══════════════════════════════════════════════════════════
exports.getNotifications = async (req, res) => {
  try {
    const {
      isRead,
      severity,
      type,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    if (isRead !== undefined) query.isRead = isRead === 'true';
    if (severity) query.severity = severity;
    if (type) query.type = type;

    const notifications = await Notification.find(query)
      .populate('relatedTenant', 'name phone')
      .populate('relatedBlock', 'blockNumber')
      .populate('relatedPayment', 'amount monthYear')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ isRead: false });

    res.json({
      success: true,
      data: notifications,
      pagination: {
        total: count,
        unreadCount,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// FIX: إضافة endpoint مفقود للـ unread notifications
// كان الـ notificationService بيطلبه بس مكانش موجود في الـ controller
// ═══════════════════════════════════════════════════════════
exports.getUnreadNotifications = async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const notifications = await Notification.find({ isRead: false })
      .populate('relatedTenant', 'name phone')
      .populate('relatedBlock', 'blockNumber')
      .populate('relatedPayment', 'amount monthYear')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const count = notifications.length;

    res.json({
      success: true,
      data: notifications,
      count
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// Mark notification as read
// ═══════════════════════════════════════════════════════════
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      id,
      { isRead: true, readAt: new Date() },
      { new: true }
    )
      .populate('relatedTenant', 'name phone')
      .populate('relatedBlock', 'blockNumber');

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'الإشعار غير موجود'
      });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// Mark all as read
// ═══════════════════════════════════════════════════════════
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: 'تم تحديد جميع الإشعارات كمقروءة'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// Delete notification
// ═══════════════════════════════════════════════════════════
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByIdAndDelete(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'الإشعار غير موجود'
      });
    }

    res.json({ success: true, message: 'تم حذف الإشعار بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// Create notification (helper for other controllers)
// ═══════════════════════════════════════════════════════════
exports.createNotification = async (notificationData) => {
  try {
    const notification = await Notification.create(notificationData);
    return notification;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════
// Get notification statistics
// ═══════════════════════════════════════════════════════════
exports.getNotificationStats = async (req, res) => {
  try {
    const stats = await Notification.aggregate([
      {
        $group: {
          _id: {
            type: '$type',
            isRead: '$isRead',
            severity: '$severity'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.type': 1, '_id.severity': 1 } }
    ]);

    const formattedStats = {
      total: await Notification.countDocuments(),
      unread: await Notification.countDocuments({ isRead: false }),
      byType: {},
      bySeverity: {}
    };

    stats.forEach(stat => {
      const type = stat._id.type;
      const severity = stat._id.severity;

      if (!formattedStats.byType[type]) {
        formattedStats.byType[type] = { total: 0, unread: 0 };
      }
      formattedStats.byType[type].total += stat.count;
      if (!stat._id.isRead) formattedStats.byType[type].unread += stat.count;

      if (!formattedStats.bySeverity[severity]) {
        formattedStats.bySeverity[severity] = { total: 0, unread: 0 };
      }
      formattedStats.bySeverity[severity].total += stat.count;
      if (!stat._id.isRead) formattedStats.bySeverity[severity].unread += stat.count;
    });

    res.json({ success: true, data: formattedStats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// Generate payment reminders (cron job)
// ═══════════════════════════════════════════════════════════
exports.generatePaymentReminders = async () => {
  try {
    const threeDaysFromNow = moment().add(3, 'days').endOf('day').toDate();
    const today = moment().startOf('day').toDate();

    const upcomingPayments = await Payment.find({
      status: 'pending',
      dueDate: { $gte: today, $lte: threeDaysFromNow }
    })
      .populate('tenantId', 'name phone email')
      .populate('blockId', 'blockNumber');

    let createdCount = 0;

    for (const payment of upcomingPayments) {
      const existingReminder = await Notification.findOne({
        type: NOTIFICATION_TYPES.PAYMENT_REMINDER,
        relatedPayment: payment._id,
        createdAt: { $gte: moment().subtract(1, 'days').toDate() }
      });

      if (!existingReminder) {
        await Notification.create({
          type: NOTIFICATION_TYPES.PAYMENT_REMINDER,
          severity: NOTIFICATION_SEVERITY.WARNING,
          title: 'تذكير بموعد الدفع',
          message: `دفعة البلوك ${payment.blockId?.blockNumber} للمستأجر ${payment.tenantId?.name} مستحقة في ${moment(payment.dueDate).format('DD/MM/YYYY')}`,
          relatedTenant: payment.tenantId?._id,
          relatedBlock: payment.blockId?._id,
          relatedPayment: payment._id
        });
        createdCount++;
      }
    }

    console.log(`✅ Generated ${createdCount} payment reminders`);
    return createdCount;
  } catch (error) {
    console.error('❌ Error generating payment reminders:', error);
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════
// Generate overdue notifications (cron job)
// ═══════════════════════════════════════════════════════════
exports.generateOverdueNotifications = async () => {
  try {
    const today = moment().startOf('day').toDate();

    // تحديث الدفعات المتأخرة
    const updateResult = await Payment.updateMany(
      { status: 'pending', dueDate: { $lt: today } },
      { status: 'overdue', updatedAt: new Date() }
    );

    const overduePayments = await Payment.find({ status: 'overdue' })
      .populate('tenantId', 'name phone email')
      .populate('blockId', 'blockNumber');

    let createdCount = 0;

    for (const payment of overduePayments) {
      const existingNotification = await Notification.findOne({
        type: NOTIFICATION_TYPES.OVERDUE_PAYMENT,
        relatedPayment: payment._id,
        createdAt: { $gte: moment().subtract(3, 'days').toDate() }
      });

      if (!existingNotification) {
        const daysOverdue = moment().diff(moment(payment.dueDate), 'days');

        await Notification.create({
          type: NOTIFICATION_TYPES.OVERDUE_PAYMENT,
          severity: NOTIFICATION_SEVERITY.URGENT,
          title: 'دفعة متأخرة',
          message: `دفعة البلوك ${payment.blockId?.blockNumber} للمستأجر ${payment.tenantId?.name} متأخرة ${daysOverdue} يوم - المبلغ: ${payment.amount} جنيه`,
          relatedTenant: payment.tenantId?._id,
          relatedBlock: payment.blockId?._id,
          relatedPayment: payment._id
        });
        createdCount++;
      }
    }

    console.log(`✅ Generated ${createdCount} overdue notifications`);
    return {
      updatedCount: updateResult.modifiedCount || updateResult.nModified || 0,
      notifiedCount: createdCount
    };
  } catch (error) {
    console.error('❌ Error generating overdue notifications:', error);
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════
// Generate contract expiry notifications (cron job)
// ═══════════════════════════════════════════════════════════
exports.generateContractExpiryNotifications = async () => {
  try {
    const blocks = await Block.find({
      status: 'occupied',
      'rentalHistory.endDate': null
    }).populate('currentTenant', 'name phone email');

    let createdCount = 0;

    for (const block of blocks) {
      const currentRental = block.rentalHistory.find(r => !r.endDate);

      if (currentRental && currentRental.startDate) {
        const contractEndDate = moment(currentRental.startDate).add(1, 'year');
        const daysUntilExpiry = contractEndDate.diff(moment(), 'days');

        if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
          const existingNotification = await Notification.findOne({
            type: NOTIFICATION_TYPES.CONTRACT_EXPIRY,
            relatedBlock: block._id,
            createdAt: { $gte: moment().subtract(7, 'days').toDate() }
          });

          if (!existingNotification) {
            await Notification.create({
              type: NOTIFICATION_TYPES.CONTRACT_EXPIRY,
              severity: daysUntilExpiry <= 7 ? NOTIFICATION_SEVERITY.URGENT : NOTIFICATION_SEVERITY.WARNING,
              title: 'عقد قارب على الانتهاء',
              message: `عقد البلوك ${block.blockNumber} للمستأجر ${block.currentTenant?.name} سينتهي خلال ${daysUntilExpiry} يوم`,
              relatedTenant: block.currentTenant?._id,
              relatedBlock: block._id
            });
            createdCount++;
          }
        }
      }
    }

    console.log(`✅ Generated ${createdCount} contract expiry notifications`);
    return createdCount;
  } catch (error) {
    console.error('❌ Error generating contract expiry notifications:', error);
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════
// Generate system notifications
// ═══════════════════════════════════════════════════════════
exports.generateSystemNotifications = async (title, message, severity = 'info') => {
  try {
    const notification = await Notification.create({
      type: NOTIFICATION_TYPES.SYSTEM,
      severity,
      title,
      message
    });

    console.log(`✅ Created system notification: ${title}`);
    return notification;
  } catch (error) {
    console.error('❌ Error creating system notification:', error);
    throw error;
  }
};