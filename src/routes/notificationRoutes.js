// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// ─── GET /notifications ───────────────────────────────────────────
// Supports query params: severity, isRead, limit, page
router.get('/', async (req, res) => {
  try {
    const { severity, isRead, limit = 50, page = 1 } = req.query;

    const filter = {};
    if (severity) filter.severity = severity;
    if (isRead !== undefined) filter.isRead = isRead === 'true';

    const skip = (Number(page) - 1) * Number(limit);

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Notification.countDocuments(filter);

    res.json({
      success: true,
      data: notifications,
      pagination: { total, page: Number(page), limit: Number(limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /notifications/stats ─────────────────────────────────────
// Must be defined BEFORE /:id to avoid "stats" being treated as an id
router.get('/stats', async (req, res) => {
  try {
    const total = await Notification.countDocuments();
    const unread = await Notification.countDocuments({ isRead: false });
    const urgent = await Notification.countDocuments({ severity: 'urgent', isRead: false });

    res.json({
      success: true,
      data: { total, unread, urgent }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /notifications/unread ────────────────────────────────────
router.get('/unread', async (req, res) => {
  try {
    const notifications = await Notification.find({ isRead: false })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PATCH /notifications/mark-all-read ───────────────────────────
// Must be defined BEFORE /:id
router.patch('/mark-all-read', async (req, res) => {
  try {
    await Notification.updateMany(
      { isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ success: true, message: 'تم تحديد جميع الإشعارات كمقروءة' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PATCH /notifications/:id/read ───────────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'الإشعار غير موجود' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── DELETE /notifications/:id ───────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);

    if (!notification) {
      return res.status(404).json({ success: false, error: 'الإشعار غير موجود' });
    }

    res.json({ success: true, message: 'تم حذف الإشعار' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;