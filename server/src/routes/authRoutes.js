'use strict';

/**
 * server/src/routes/authRoutes.js
 *
 * Auth endpoints:
 *   POST /api/auth/register
 *   POST /api/auth/register/verify
 *   POST /api/auth/login
 *   POST /api/auth/login/verify
 */

const express = require('express');
const router = express.Router();

const {
  register,
  verifyRegistration,
  login,
  verifyLogin,
} = require('../controllers/authController');

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

module.exports = router;