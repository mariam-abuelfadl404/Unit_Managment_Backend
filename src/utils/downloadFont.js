// utils/downloadFont.js
// ═══════════════════════════════════════════════════════════
// شغّل هذا السكريبت مرة واحدة فقط لتحميل الخط العربي:
//   node utils/downloadFont.js
// ═══════════════════════════════════════════════════════════

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const FONTS_DIR = path.join(__dirname, 'fonts');
const FONT_PATH = path.join(FONTS_DIR, 'arabic.ttf');

// خط Cairo من Google Fonts (مفتوح المصدر - رخصة OFL)
const FONT_URL =
  'https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf';

if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
  console.log('📁 تم إنشاء مجلد fonts');
}

if (fs.existsSync(FONT_PATH)) {
  console.log('✅ الخط العربي موجود بالفعل في:', FONT_PATH);
  process.exit(0);
}

console.log('⬇️  جاري تحميل خط Cairo العربي...');

const file = fs.createWriteStream(FONT_PATH);

const download = (url, redirectCount = 0) => {
  if (redirectCount > 5) {
    console.error('❌ عدد التحويلات تجاوز الحد المسموح');
    process.exit(1);
  }

  https.get(url, (res) => {
    // تتبع الـ redirects
    if (res.statusCode === 301 || res.statusCode === 302) {
      console.log('↪️  تحويل إلى:', res.headers.location);
      return download(res.headers.location, redirectCount + 1);
    }

    if (res.statusCode !== 200) {
      console.error(`❌ فشل التحميل - كود الخطأ: ${res.statusCode}`);
      fs.unlink(FONT_PATH, () => {});
      process.exit(1);
    }

    res.pipe(file);

    file.on('finish', () => {
      file.close();
      const stats = fs.statSync(FONT_PATH);
      console.log(`✅ تم تحميل الخط بنجاح!`);
      console.log(`   المسار: ${FONT_PATH}`);
      console.log(`   الحجم: ${(stats.size / 1024).toFixed(1)} KB`);
      console.log('');
      console.log('🚀 يمكنك الآن تشغيل السيرفر وتوليد التقارير');
    });

    file.on('error', (err) => {
      fs.unlink(FONT_PATH, () => {});
      console.error('❌ خطأ في حفظ الملف:', err.message);
      process.exit(1);
    });
  }).on('error', (err) => {
    fs.unlink(FONT_PATH, () => {});
    console.error('❌ خطأ في التحميل:', err.message);
    console.log('');
    console.log('💡 بديل: حمّل الخط يدوياً من:');
    console.log('   https://fonts.google.com/specimen/Cairo');
    console.log('   واحفظه في: utils/fonts/arabic.ttf');
    process.exit(1);
  });
};

download(FONT_URL);