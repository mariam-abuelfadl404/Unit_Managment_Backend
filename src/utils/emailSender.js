// utils/emailSender.js
// ═══════════════════════════════════════════════════════════
// إعداد خدمة الإيميل (Gmail):
//
// 1. فعّل المصادقة الثنائية على حسابك:
//    https://myaccount.google.com/security
//
// 2. أنشئ App Password (كلمة مرور التطبيق):
//    https://myaccount.google.com/apppasswords
//    اختر: Mail → Other (Custom name) → أدخل "Warehouse App"
//    ستحصل على كلمة مرور من 16 حرف
//
// 3. أضف هذه القيم في ملف .env:
//    SMTP_HOST=smtp.gmail.com
//    SMTP_PORT=587
//    SMTP_USER=your_email@gmail.com
//    SMTP_PASS=xxxx xxxx xxxx xxxx   ← كلمة المرور المكوّنة من 16 حرف
//
// 4. ثبّت المكتبة:
//    npm install nodemailer
// ═══════════════════════════════════════════════════════════

const nodemailer = require('nodemailer');

class EmailSender {
  constructor() {
    this.transporter = null;
    this._initialized = false;
  }

  // ─── تهيئة الـ transporter عند الحاجة فقط (Lazy init) ────
  // FIX: كانت تهيئة الـ transporter تحدث في الـ constructor
  // مما يسبب خطأ إذا لم تكن متغيرات البيئة موجودة عند بدء السيرفر
  _getTransporter() {
    if (this.transporter) return this.transporter;

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error(
        'إعدادات الإيميل غير مكتملة في ملف .env\n' +
        'المطلوب: SMTP_HOST, SMTP_USER, SMTP_PASS\n' +
        'راجع التعليمات في أعلى هذا الملف.'
      );
    }

    this.transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: false, // true للبورت 465، false لأي بورت آخر
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false // مفيد في بيئة التطوير
      }
    });

    return this.transporter;
  }

  // ═══════════════════════════════════════════════════════════
  // FIX: إضافة الـ sendEmail العامة التي كانت تستدعيها schedulerService
  // وكانت غير موجودة - كانت السبب الرئيسي في فشل إرسال الإيميلات
  // ═══════════════════════════════════════════════════════════
  async sendEmail({ from, to, subject, html, text }) {
    try {
      const transporter = this._getTransporter();

      const info = await transporter.sendMail({
        from:    from || process.env.SMTP_USER,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '') // fallback نص عادي
      });

      console.log(`✅ تم إرسال الإيميل إلى ${to} — ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ فشل إرسال الإيميل إلى ${to}:`, error.message);

      // لا نرمي الخطأ حتى لا يوقف بقية العمليات
      return { success: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // إرسال تذكير بالدفع
  // ═══════════════════════════════════════════════════════════
  async sendPaymentReminder(tenant, payment) {
    if (!tenant.email) {
      console.warn(`⚠️  المستأجر ${tenant.name} ليس لديه إيميل مسجّل`);
      return;
    }

    return this.sendEmail({
      to:      tenant.email,
      subject: `تذكير: دفعة مستحقة — البلوك ${payment.blockId?.blockNumber}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #4472C4;">تذكير بموعد الدفع</h2>
          <p>عزيزي <strong>${tenant.name}</strong>،</p>
          <p>هذا تذكير بأن الدفعة التالية مستحقة قريباً:</p>
          <table style="border-collapse: collapse; width: 100%; margin: 15px 0;">
            <tr style="background: #f0f4ff;">
              <td style="padding: 8px 12px; border: 1px solid #ddd;"><strong>رقم البلوك</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;">${payment.blockId?.blockNumber || '-'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #ddd;"><strong>المبلغ</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;">${payment.amount?.toLocaleString('ar-EG')} جنيه</td>
            </tr>
            <tr style="background: #f0f4ff;">
              <td style="padding: 8px 12px; border: 1px solid #ddd;"><strong>تاريخ الاستحقاق</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;">${new Date(payment.dueDate).toLocaleDateString('ar-EG')}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #ddd;"><strong>الشهر</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;">${payment.monthYear || '-'}</td>
            </tr>
          </table>
          <p>الرجاء الدفع في الموعد المحدد لتجنب أي تأخير.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 12px;">نظام إدارة المخازن — هذا إيميل تلقائي، الرجاء عدم الرد عليه.</p>
        </div>
      `
    });
  }

  // ═══════════════════════════════════════════════════════════
  // إرسال تأكيد الدفع
  // ═══════════════════════════════════════════════════════════
  async sendPaymentConfirmation(tenant, payment) {
    if (!tenant.email) return;

    return this.sendEmail({
      to:      tenant.email,
      subject: `تأكيد استلام الدفعة — إيصال رقم ${payment.receiptNumber}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #2e7d32;">✅ تأكيد استلام الدفعة</h2>
          <p>عزيزي <strong>${tenant.name}</strong>،</p>
          <p>تم استلام دفعتك بنجاح. تفاصيل الإيصال:</p>
          <table style="border-collapse: collapse; width: 100%; margin: 15px 0;">
            <tr style="background: #f0faf0;">
              <td style="padding: 8px 12px; border: 1px solid #ddd;"><strong>رقم الإيصال</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;">${payment.receiptNumber || '-'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #ddd;"><strong>المبلغ المدفوع</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #ddd; color: #2e7d32; font-weight: bold;">${payment.amount?.toLocaleString('ar-EG')} جنيه</td>
            </tr>
            <tr style="background: #f0faf0;">
              <td style="padding: 8px 12px; border: 1px solid #ddd;"><strong>تاريخ الدفع</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;">${new Date(payment.paymentDate).toLocaleDateString('ar-EG')}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #ddd;"><strong>رقم البلوك</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;">${payment.blockId?.blockNumber || '-'}</td>
            </tr>
          </table>
          <p>شكراً لالتزامكم بمواعيد الدفع.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 12px;">نظام إدارة المخازن — هذا إيميل تلقائي، الرجاء عدم الرد عليه.</p>
        </div>
      `
    });
  }

  // ═══════════════════════════════════════════════════════════
  // التحقق من صحة الإعدادات (اختياري - للاختبار)
  // ═══════════════════════════════════════════════════════════
  async verifyConnection() {
    try {
      const transporter = this._getTransporter();
      await transporter.verify();
      console.log('✅ اتصال SMTP يعمل بشكل صحيح');
      return true;
    } catch (error) {
      console.error('❌ فشل التحقق من اتصال SMTP:', error.message);
      return false;
    }
  }
}

module.exports = new EmailSender();