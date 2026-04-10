// routes/tenantRoutes.js
const express           = require('express');
const router            = express.Router();
const tenantController  = require('../controllers/tenantController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/search',                 tenantController.searchTenant);

router.route('/')
  .get(tenantController.getAllTenants)
  .post(authorize('admin', 'manager'), tenantController.createTenant);

router.route('/:id')
  .get(tenantController.getTenant)
  .put(authorize('admin', 'manager'),  tenantController.updateTenant)
  .delete(authorize('admin'),          tenantController.deleteTenant);

// تقرير نهاية الإيجار — هل على المستأجر فلوس؟
router.get('/:tenantId/rental-end-report', tenantController.getRentalEndReport);

// سجل الإيجارات السابقة
router.get('/:id/rental-history', tenantController.getRentalHistory);

// ─── ملاحظات المستأجر ─────────────────────────────────────
router.get('/:id/notes',                 tenantController.getNotes);
router.post('/:id/notes',                tenantController.addNote);
router.delete('/:id/notes/:noteId',      tenantController.deleteNote);

module.exports = router;