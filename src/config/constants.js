// config/constants.js

module.exports = {

  // ─── حالات الوحدة ─────────────────────────────────────────
  UNIT_STATUS: {
    EMPTY:    'empty',
    OCCUPIED: 'occupied'
  },

  // ─── حالات الدفع ──────────────────────────────────────────
  PAYMENT_STATUS: {
    PAID:    'paid',
    PENDING: 'pending',
    OVERDUE: 'overdue',
    PARTIAL: 'partial'
  },

  // ─── طرق الدفع ────────────────────────────────────────────
  PAYMENT_METHODS: {
    CASH:          'cash',
    BANK_TRANSFER: 'bank_transfer',
    WALLET:        'wallet',
    INSTAPAY:      'instapay'
  },

  // ─── أنواع النشاطات ───────────────────────────────────────
  ACTIVITY_TYPES: {
    RENTAL_START:      'rental_start',
    RENTAL_END:        'rental_end',
    PAYMENT:           'payment',
    NOTE:              'note',
    CONTRACT_RENEWAL:  'contract_renewal',
    PRICE_CHANGE:      'price_change',
    OVERDUE_ALERT:     'overdue_alert'
  },

  // ─── أنواع الإشعارات ──────────────────────────────────────
  NOTIFICATION_TYPES: {
    PAYMENT_REMINDER: 'payment_reminder',
    CONTRACT_EXPIRY:  'contract_expiry',
    OVERDUE_PAYMENT:  'overdue_payment',
    SYSTEM:           'system'
  },

  // ─── مستويات الإشعارات ────────────────────────────────────
  NOTIFICATION_SEVERITY: {
    INFO:    'info',
    WARNING: 'warning',
    URGENT:  'urgent'
  },

  // ─── أدوار المستخدمين ─────────────────────────────────────
  USER_ROLES: {
    ADMIN:   'admin',
    MANAGER: 'manager',
    VIEWER:  'viewer'
  },

  // ─── إعدادات الإنذارات ────────────────────────────────────
  ALERT_SETTINGS: {
    PAYMENT_REMINDER_DAYS:      3,   // كام يوم قبل الاستحقاق يبعت تذكير
    OVERDUE_ALERT_DAYS:         3,   // كام يوم بعد الاستحقاق يبعت إنذار
    CONTRACT_EXPIRY_DAYS:       30,  // كام يوم قبل انتهاء العقد يبعت تنبيه
  },

  // ─── الرسائل بالعربي ──────────────────────────────────────
  MESSAGES: {
    SUCCESS: {
      CREATED:         'تم الإنشاء بنجاح',
      UPDATED:         'تم التحديث بنجاح',
      DELETED:         'تم الحذف بنجاح',
      PAYMENT_RECORDED:'تم تسجيل الدفعة بنجاح',
      LOGIN:           'تم تسجيل الدخول بنجاح',
      REGISTER:        'تم التسجيل بنجاح',
      RENTAL_STARTED:  'تم بدء الإيجار بنجاح',
      RENTAL_ENDED:    'تم إنهاء الإيجار بنجاح'
    },
    ERROR: {
      NOT_FOUND:       'العنصر غير موجود',
      UNAUTHORIZED:    'غير مصرح - الرجاء تسجيل الدخول',
      FORBIDDEN:       'ليس لديك صلاحية للوصول',
      VALIDATION:      'خطأ في البيانات المدخلة',
      SERVER:          'خطأ في الخادم',
      DUPLICATE:       'هذا العنصر موجود بالفعل',
      UNIT_OCCUPIED:   'الوحدة مؤجرة بالفعل',
      UNIT_EMPTY:      'الوحدة فارغة - لا يوجد مستأجر حالي',
      TENANT_HAS_UNITS:'لا يمكن الحذف - المستأجر لديه وحدات نشطة',
      TENANT_HAS_DUES: 'لا يمكن الحذف - على المستأجر مستحقات غير مدفوعة'
    }
  },

  // ─── ترجمات العرض ─────────────────────────────────────────
  TRANSLATIONS: {
    UNIT_STATUS: {
      empty:    'فارغة',
      occupied: 'مؤجرة'
    },
    PAYMENT_STATUS: {
      paid:    'مدفوع',
      pending: 'معلق',
      overdue: 'متأخر',
      partial: 'جزئي'
    },
    PAYMENT_METHODS: {
      cash:          'كاش',
      bank_transfer: 'تحويل بنكي',
      wallet:        'محفظة',
      instapay:      'إنستاباي'
    }
  }
};