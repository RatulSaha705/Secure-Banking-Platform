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

const {
  requireAuth,
} = require('../middleware/authMiddleware');

const {
  authLimiter,
  otpLimiter,
  refreshLimiter,
  activityLimiter,
} = require('../middleware/rateLimiter');

const {
  registerRules,
  verifyRegistrationRules,
  loginRules,
  verifyLoginRules,
  handleValidation,
} = require('../validators/authValidator');

/**
 * Registration routes.
 *
 * Strict limiter because registration can be abused.
 */
router.post(
  '/register',
  authLimiter,
  registerRules,
  handleValidation,
  register
);

router.post(
  '/register/verify',
  otpLimiter,
  verifyRegistrationRules,
  handleValidation,
  verifyRegistration
);

/**
 * Login routes.
 *
 * Strict limiter because login can be brute-forced.
 */
router.post(
  '/login',
  authLimiter,
  loginRules,
  handleValidation,
  login
);

router.post(
  '/login/verify',
  otpLimiter,
  verifyLoginRules,
  handleValidation,
  verifyLogin
);

/**
 * Session routes.
 *
 * These have separate limiters so normal navigation does not trigger
 * the strict login/register protection.
 */
router.post(
  '/refresh',
  refreshLimiter,
  refresh
);

router.post(
  '/activity',
  requireAuth,
  activityLimiter,
  activity
);

router.post(
  '/logout',
  logout
);

router.get(
  '/me',
  requireAuth,
  me
);

module.exports = router;