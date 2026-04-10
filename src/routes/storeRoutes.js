// routes/storeRoutes.js
const express         = require('express');
const router          = express.Router();
const storeController = require('../controllers/storeController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .get(storeController.getAllStores)
  .post(authorize('admin', 'manager'), storeController.createStore);

router.get('/:id/summary', storeController.getStoreSummary);

router.route('/:id')
  .get(storeController.getStore)
  .put(authorize('admin', 'manager'),  storeController.updateStore)
  .delete(authorize('admin'),          storeController.deleteStore);

module.exports = router;