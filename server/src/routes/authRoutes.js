'use strict';

/**
 * server/src/routes/authRoutes.js
 *
 * Auth endpoints:
 *   POST /api/auth/register
 *   POST /api/auth/register/verify
 *   POST /api/auth/login
 *   POST /api/auth/login/verify
 *   POST /api/auth/refresh
 *   POST /api/auth/activity
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 */

const express = require('express');
const router = express.Router();

const {
  register,
  verifyRegistration,
  login,
  verifyLogin,
  refresh,
  activity,
  logout,
  me,
} = require('../controllers/authController');

const { requireAuth } = require('../middleware/authMiddleware');

const {
  registerRules,
  verifyRegistrationRules,
  loginRules,
  verifyLoginRules,
  handleValidation,
} = require('../validators/authValidator');

router.post('/register', registerRules, handleValidation, register);
router.post('/register/verify', verifyRegistrationRules, handleValidation, verifyRegistration);

router.post('/login', loginRules, handleValidation, login);
router.post('/login/verify', verifyLoginRules, handleValidation, verifyLogin);

router.post('/refresh', refresh);
router.post('/activity', requireAuth, activity);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

module.exports = router;