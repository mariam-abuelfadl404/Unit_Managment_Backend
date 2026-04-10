// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRegister } = require('../middleware/validation');
const { loginLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', validateRegister, authController.register);
router.post('/login', loginLimiter, authController.login);

// Protected routes
router.get('/me', protect, authController.getMe);
router.put('/update-password', protect, authController.updatePassword);

module.exports = router;