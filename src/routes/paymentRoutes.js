// routes/paymentRoutes.js
const express           = require('express');
const router            = express.Router();
const paymentController = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/refresh-overdue',           paymentController.refreshOverdue);
router.get('/monthly-total',              paymentController.getMonthlyTotal);
router.get('/overdue',                    paymentController.getOverduePayments);
router.get('/tenant/:tenantId',           paymentController.getPaymentsByTenant);
router.get('/unit/:unitId',               paymentController.getPaymentsByUnit);

router.get('/',                           paymentController.getAllPayments);
router.post('/',                          paymentController.recordPayment);
router.get('/:id',                        paymentController.getPayment);
router.put('/:id',    authorize('admin'), paymentController.updatePayment);
router.delete('/:id', authorize('admin'), paymentController.deletePayment);

module.exports = router;