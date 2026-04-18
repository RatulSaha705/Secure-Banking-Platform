'use strict';

/**
 * routes/authRoutes.js — Authentication Routes
 *
 * POST /api/auth/register  → validate → register
 * POST /api/auth/login     → validate → login
 *
 * Validation runs BEFORE the controller.
 * If validation fails, handleValidation returns 400 immediately.
 */

const express  = require('express');
const router   = express.Router();

const { register, login }                    = require('../controllers/authController');
const { registerRules, loginRules, handleValidation } = require('../validators/authValidator');

router.post('/register', registerRules, handleValidation, register);
router.post('/login',    loginRules,    handleValidation, login);

module.exports = router;
