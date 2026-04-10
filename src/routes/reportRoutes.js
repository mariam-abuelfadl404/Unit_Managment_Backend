// routes/reportRoutes.js
const express          = require('express');
const router           = express.Router();
const reportController = require('../controllers/reportController');
const { protect }      = require('../middleware/authMiddleware');

router.use(protect);

router.get('/pdf',             reportController.generatePDFReport);
router.get('/excel',           reportController.generateExcelReport);
router.get('/rental-end',      reportController.generateRentalEndReport);

module.exports = router;