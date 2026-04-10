// controllers/storeController.js
const Store = require('../models/Store');
const Unit  = require('../models/Block');

// ═══════════════════════════════════════════════════════════
// جميع المخازن مع إحصائياتها
// ═══════════════════════════════════════════════════════════
exports.getAllStores = async (req, res) => {
  try {
    const stores = await Store.find({ isActive: true });

    const storesWithStats = await Promise.all(
      stores.map(async (store) => {
        const totalUnits    = await Unit.countDocuments({ storeId: store._id });
        const occupiedUnits = await Unit.countDocuments({ storeId: store._id, status: 'occupied' });
        const emptyUnits    = await Unit.countDocuments({ storeId: store._id, status: 'empty' });

        return {
          ...store.toObject(),
          stats: {
            totalUnits,
            occupiedUnits,
            emptyUnits,
            occupancyRate: totalUnits > 0
              ? parseFloat(((occupiedUnits / totalUnits) * 100).toFixed(2))
              : 0
          }
        };
      })
    );

    res.json({ success: true, data: storesWithStats, count: stores.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// مخزن واحد بوحداته
// ═══════════════════════════════════════════════════════════
exports.getStore = async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) {
      return res.status(404).json({ success: false, error: 'المخزن غير موجود' });
    }

    const units = await Unit.find({ storeId: store._id })
      .populate('currentTenant', 'name phone');

    const stats = {
      totalUnits:    units.length,
      occupiedUnits: units.filter(u => u.status === 'occupied').length,
      emptyUnits:    units.filter(u => u.status === 'empty').length,
      totalRevenue:  units
        .filter(u => u.status === 'occupied')
        .reduce((sum, u) => sum + u.monthlyRent, 0)
    };

    res.json({ success: true, data: { store, units, stats } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// إنشاء مخزن
// ═══════════════════════════════════════════════════════════
exports.createStore = async (req, res) => {
  try {
    const store = await Store.create(req.body);
    res.status(201).json({ success: true, data: store, message: 'تم إنشاء المخزن بنجاح' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// تحديث مخزن
// ═══════════════════════════════════════════════════════════
exports.updateStore = async (req, res) => {
  try {
    const store = await Store.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!store) {
      return res.status(404).json({ success: false, error: 'المخزن غير موجود' });
    }
    res.json({ success: true, data: store, message: 'تم تحديث المخزن بنجاح' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// حذف مخزن (Soft Delete)
// ═══════════════════════════════════════════════════════════
exports.deleteStore = async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) {
      return res.status(404).json({ success: false, error: 'المخزن غير موجود' });
    }

    const occupiedUnits = await Unit.countDocuments({
      storeId: store._id,
      status:  'occupied'
    });

    if (occupiedUnits > 0) {
      return res.status(400).json({
        success: false,
        error:   `لا يمكن حذف مخزن يحتوي على ${occupiedUnits} وحدة مؤجرة`
      });
    }

    store.isActive = false;
    await store.save();

    res.json({ success: true, message: 'تم حذف المخزن بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// ملخص المخزن
// ═══════════════════════════════════════════════════════════
exports.getStoreSummary = async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) {
      return res.status(404).json({ success: false, error: 'المخزن غير موجود' });
    }

    const units      = await Unit.find({ storeId: store._id });
    const unitIds    = units.map(u => u._id);

    const Payment = require('../models/Payment');
    const payments = await Payment.find({ unitId: { $in: unitIds }, status: 'paid' });
    const totalRevenue = payments.reduce((s, p) => s + p.amount, 0);

    const expectedMonthly = units
      .filter(u => u.status === 'occupied')
      .reduce((s, u) => s + u.monthlyRent, 0);

    const occupied = units.filter(u => u.status === 'occupied').length;

    res.json({
      success: true,
      data: {
        store: { id: store._id, name: store.name, location: store.location },
        units: {
          total:        units.length,
          occupied,
          empty:        units.length - occupied,
          occupancyRate: units.length > 0
            ? parseFloat(((occupied / units.length) * 100).toFixed(2))
            : 0
        },
        revenue: { total: totalRevenue, expectedMonthly }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};