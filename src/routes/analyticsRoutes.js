// routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// Dashboard
router.get('/dashboard',        analyticsController.getDashboardSummary);
router.get('/dashboard-stats',  analyticsController.getDashboardStats);

// Blocks & Occupancy
router.get('/occupancy',        analyticsController.getOccupancyRate);

// Revenue & Payments
router.get('/revenue-by-month', analyticsController.getRevenueByMonth);
router.get('/cash-flow',        analyticsController.getMonthlyCashFlow);
router.get('/payment-status',   analyticsController.getPaymentStatusOverview);
router.get('/custom-report',    analyticsController.getCustomReport);

// Tenants
router.get('/top-tenants',      analyticsController.getTopTenants);
router.get('/tenant-performance', analyticsController.getTenantPerformance);

module.exports = router;