// routes/backupRoutes.js
const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backupController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorize('admin')); // Backup routes for admins only

router.post('/create', backupController.createBackup);
router.get('/list', backupController.listBackups);
router.post('/restore', backupController.restoreBackup);
router.delete('/:filename', backupController.deleteBackup);

module.exports = router;