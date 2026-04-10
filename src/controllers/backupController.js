const BackupService = require('../services/backupService');

// ═══════════════════════════════════════════════════════════
// إنشاء نسخة احتياطية
// ═══════════════════════════════════════════════════════════
exports.createBackup = async (req, res) => {
  try {
    const result = await BackupService.createBackup();
    
    res.json({
      success: true,
      data: result,
      message: 'تم إنشاء النسخة الاحتياطية بنجاح'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════
// قائمة النسخ الاحتياطية
// ═══════════════════════════════════════════════════════════
exports.listBackups = async (req, res) => {
  try {
    const backups = await BackupService.listBackups();
    
    res.json({
      success: true,
      data: backups,
      count: backups.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════
// استعادة نسخة احتياطية
// ═══════════════════════════════════════════════════════════
exports.restoreBackup = async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'اسم الملف مطلوب'
      });
    }

    const result = await BackupService.restoreBackup(filename);
    
    res.json({
      success: true,
      data: result,
      message: 'تم استعادة النسخة الاحتياطية بنجاح'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════
// حذف نسخة احتياطية
// ═══════════════════════════════════════════════════════════
exports.deleteBackup = async (req, res) => {
  try {
    const { filename } = req.params;
    
    await BackupService.deleteBackup(filename);
    
    res.json({
      success: true,
      message: 'تم حذف النسخة الاحتياطية بنجاح'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════
// تصدير البيانات إلى JSON
// ═══════════════════════════════════════════════════════════
exports.exportToJSON = async (req, res) => {
  try {
    const result = await BackupService.exportToJSON();
    
    res.json({
      success: true,
      data: result,
      message: 'تم تصدير البيانات بنجاح'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════
// تحميل نسخة احتياطية
// ═══════════════════════════════════════════════════════════
exports.downloadBackup = async (req, res) => {
  try {
    const { filename } = req.params;
    const path = require('path');
    const fs = require('fs');
    
    const filepath = path.join(__dirname, '../../backups', filename);
    
    // التحقق من وجود الملف
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'الملف غير موجود'
      });
    }

    res.download(filepath, filename);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};