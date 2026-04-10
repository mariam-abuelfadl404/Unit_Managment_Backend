// routes/unitRoutes.js
const express        = require('express');
const router         = express.Router();
const unitController = require('../controllers/blockController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/',    unitController.getAllUnits);
router.post('/',   authorize('admin', 'manager'), unitController.createUnit);

router.get('/:unitId',  unitController.getUnit);
router.put('/:unitId',  authorize('admin', 'manager'), unitController.updateUnit);

router.get('/:unitId/report',        unitController.getUnitReport);
router.post('/:unitId/start-rental', authorize('admin', 'manager'), unitController.startRental);
router.post('/:unitId/end-rental',   authorize('admin', 'manager'), unitController.endRental);

// ─── ملاحظات الوحدة ───────────────────────────────────────
router.get('/:unitId/notes',                  unitController.getNotes);
router.post('/:unitId/notes',                 unitController.addNote);
router.delete('/:unitId/notes/:noteId',       unitController.deleteNote);

module.exports = router;