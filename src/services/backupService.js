// services/backupService.js
// ═══════════════════════════════════════════════════════════
// المتطلبات:
//   npm install archiver extract-zip node-cron moment
//
// تأكد من أن mongodump مثبّت على السيرفر:
//   - Windows: حمّله من https://www.mongodb.com/try/download/database-tools
//   - Ubuntu:  sudo apt-get install -y mongodb-database-tools
//   - macOS:   brew install mongodb-database-tools
// ═══════════════════════════════════════════════════════════

const { exec }  = require('child_process');
const fs        = require('fs').promises;
const fsSync    = require('fs');
const path      = require('path');
const moment    = require('moment');
const archiver  = require('archiver');
const extract   = require('extract-zip');

class BackupService {
  constructor() {
    this.backupDir  = path.join(__dirname, '../../backups');
    this.maxBackups = parseInt(process.env.MAX_BACKUPS) || 30;
    this.lastBackup = null;

    // إنشاء المجلد بشكل متزامن عند بدء التشغيل
    this._ensureBackupDirSync();
  }

  // ─── إنشاء المجلد (متزامن للـ constructor) ───────────────
  _ensureBackupDirSync() {
    if (!fsSync.existsSync(this.backupDir)) {
      fsSync.mkdirSync(this.backupDir, { recursive: true });
      console.log('📁 تم إنشاء مجلد النسخ الاحتياطية');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // إنشاء نسخة احتياطية
  // ═══════════════════════════════════════════════════════════
  async createBackup() {
    console.log('🔄 بدء عملية النسخ الاحتياطي...');

    const timestamp  = moment().format('YYYY-MM-DD_HH-mm-ss');
    const backupName = `backup_${timestamp}`;
    const backupPath = path.join(this.backupDir, backupName);
    const zipPath    = `${backupPath}.zip`;

    try {
      const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/blocks_management';

      // FIX: إزالة علامات الاقتباس المزدوجة من الأمر - كانت تسبب مشكلة على بعض الأنظمة
      const command = `mongodump --uri=${dbUri} --out=${backupPath}`;

      await this._executeCommand(command);

      // ضغط النسخة الاحتياطية
      await this._compressDirectory(backupPath, zipPath);

      // حذف المجلد غير المضغوط بعد الضغط
      await this._deleteDirectory(backupPath);

      const stats = await fs.stat(zipPath);
      this.lastBackup = new Date();

      console.log(`✅ تم إنشاء النسخة الاحتياطية: ${backupName}.zip`);

      // تنظيف النسخ القديمة
      await this._cleanupOldBackups();

      return {
        success:   true,
        filename:  `${backupName}.zip`,
        path:      zipPath,
        size:      this._formatBytes(stats.size),
        sizeBytes: stats.size,
        timestamp: this.lastBackup
      };
    } catch (error) {
      // تنظيف الملفات المؤقتة في حال الفشل
      try {
        if (fsSync.existsSync(backupPath)) await this._deleteDirectory(backupPath);
        if (fsSync.existsSync(zipPath))    await fs.unlink(zipPath);
      } catch (_) {}

      console.error('❌ فشل النسخ الاحتياطي:', error.message);

      // رسالة خطأ واضحة إذا كان mongodump غير مثبت
      if (error.message.includes('mongodump') || error.message.includes('not found')) {
        throw new Error(
          'mongodump غير مثبّت على هذا الجهاز.\n' +
          'للتثبيت على Ubuntu: sudo apt-get install -y mongodb-database-tools\n' +
          'للتثبيت على macOS:  brew install mongodb-database-tools\n' +
          'للتنزيل على Windows: https://www.mongodb.com/try/download/database-tools'
        );
      }

      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // استعادة من نسخة احتياطية
  // ═══════════════════════════════════════════════════════════
  async restoreBackup(backupFilename) {
    console.log(`🔄 استعادة النسخة الاحتياطية: ${backupFilename}`);

    // FIX: التحقق من وجود الملف أولاً قبل محاولة الاستعادة
    const backupPath  = path.join(this.backupDir, backupFilename);
    const extractPath = backupPath.replace('.zip', '');

    try {
      // التحقق من وجود الملف
      await fs.access(backupPath);
    } catch {
      throw new Error(`ملف النسخة الاحتياطية غير موجود: ${backupFilename}`);
    }

    try {
      // فك الضغط
      await extract(backupPath, { dir: path.resolve(extractPath) });

      const dbUri   = process.env.MONGODB_URI || 'mongodb://localhost:27017/blocks_management';
      const dbName  = dbUri.split('/').pop().split('?')[0];

      // FIX: إزالة الاقتباسات من الأمر
      const command = `mongorestore --uri=${dbUri} --drop ${extractPath}/${dbName}`;

      await this._executeCommand(command);

      // حذف المجلد المستخرج
      await this._deleteDirectory(extractPath);

      console.log('✅ تمت استعادة قاعدة البيانات بنجاح');

      return {
        success:   true,
        message:   'تمت استعادة قاعدة البيانات بنجاح',
        timestamp: new Date()
      };
    } catch (error) {
      // تنظيف في حال الفشل
      try { if (fsSync.existsSync(extractPath)) await this._deleteDirectory(extractPath); } catch (_) {}
      console.error('❌ فشلت الاستعادة:', error.message);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // قائمة النسخ الاحتياطية
  // ═══════════════════════════════════════════════════════════
  async listBackups() {
    try {
      const files   = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        if (!file.endsWith('.zip')) continue;

        const filePath = path.join(this.backupDir, file);
        const stats    = await fs.stat(filePath);

        backups.push({
          filename:   file,
          size:       this._formatBytes(stats.size),
          sizeBytes:  stats.size,
          createdAt:  stats.birthtime,
          age:        moment(stats.birthtime).fromNow()
        });
      }

      // الأحدث أولاً
      backups.sort((a, b) => b.createdAt - a.createdAt);
      return backups;
    } catch (error) {
      console.error('❌ خطأ في قراءة النسخ الاحتياطية:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════
  // حذف نسخة احتياطية
  // ═══════════════════════════════════════════════════════════
  async deleteBackup(filename) {
    // FIX: منع حذف ملفات خارج مجلد الـ backups (أمان)
    const filePath = path.join(this.backupDir, path.basename(filename));

    await fs.access(filePath); // يرمي خطأ لو الملف غير موجود
    await fs.unlink(filePath);

    console.log(`🗑️  تم حذف النسخة الاحتياطية: ${filename}`);
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  // تنظيف النسخ القديمة
  // ═══════════════════════════════════════════════════════════
  async _cleanupOldBackups() {
    const backups = await this.listBackups();

    if (backups.length > this.maxBackups) {
      const toDelete = backups.slice(this.maxBackups);
      for (const backup of toDelete) {
        await this.deleteBackup(backup.filename);
      }
      console.log(`🧹 تم حذف ${toDelete.length} نسخة احتياطية قديمة`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // تصدير البيانات إلى JSON
  // ═══════════════════════════════════════════════════════════
  async exportToJSON() {
    const Store       = require('../models/Store');
    const Block       = require('../models/Block');
    const Tenant      = require('../models/Tenant');
    const Payment     = require('../models/Payment');
    const ActivityLog = require('../models/ActivityLog');

    const data = {
      metadata: {
        exportDate: new Date(),
        version:    '1.0.0'
      },
      stores:       await Store.find().lean(),
      blocks:       await Block.find().lean(),
      tenants:      await Tenant.find().lean(),
      payments:     await Payment.find().lean(),
      activityLogs: await ActivityLog.find().limit(1000).lean()
    };

    data.metadata.totalRecords =
      data.stores.length + data.blocks.length +
      data.tenants.length + data.payments.length +
      data.activityLogs.length;

    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const filename  = `export_${timestamp}.json`;
    const filepath  = path.join(this.backupDir, filename);

    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');

    const stats = await fs.stat(filepath);
    console.log(`✅ تم تصدير البيانات: ${filename}`);

    return {
      success:     true,
      filename,
      path:        filepath,
      size:        this._formatBytes(stats.size),
      recordCount: data.metadata.totalRecords
    };
  }

  // ═══════════════════════════════════════════════════════════
  // جدولة النسخ الاحتياطية التلقائية
  // (لا تستدعي هذا إذا كنت تستخدم schedulerService - لتجنب التكرار)
  // ═══════════════════════════════════════════════════════════
  scheduleAutoBackup() {
    const cron = require('node-cron');

    // كل يوم الساعة 2 صباحاً
    cron.schedule('0 2 * * *', async () => {
      console.log('⏰ تشغيل النسخ الاحتياطي التلقائي...');
      try {
        const backup = await this.createBackup();
        console.log(`✅ نسخة احتياطية: ${backup.filename}`);
      } catch (error) {
        console.error('❌ فشل النسخ الاحتياطي التلقائي:', error.message);
      }
    });

    console.log('⏰ تم جدولة النسخ الاحتياطي اليومي (الساعة 2 صباحاً)');
  }

  // ─── Helper Methods ───────────────────────────────────────

  _executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(error.message || stderr));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  _compressDirectory(source, destination) {
    return new Promise((resolve, reject) => {
      const output  = fsSync.createWriteStream(destination);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', resolve);
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(source, false);
      archive.finalize();
    });
  }

  async _deleteDirectory(dirPath) {
    await fs.rm(dirPath, { recursive: true, force: true });
  }

  _formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k    = 1024;
    const dm   = Math.max(0, decimals);
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i    = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }
}

// FIX: تصدير instance واحدة (singleton)
module.exports = new BackupService();   