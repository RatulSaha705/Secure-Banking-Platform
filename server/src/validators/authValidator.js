'use strict';

/**
 * validators/authValidator.js — Input Validation Rules for Auth Routes
 *
 * Uses express-validator to validate and sanitize request bodies.
 * Returns a 400 with structured error messages on failure.
 *
 * EXTENSION PATH:
 *   Add more validators (changePassword, updateProfile) as new features
 *   are added in later phases.
 */

const { body, validationResult } = require('express-validator');

// ── Register Validation ───────────────────────────────────────────────────────

const registerRules = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3–30 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('A valid email address is required')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),

  body('fullName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Full name must be at most 100 characters'),

  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Phone number must be at most 20 characters'),
];

// ── Login Validation ──────────────────────────────────────────────────────────

const loginRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('A valid email address is required')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),
];

// ── handleValidation middleware ───────────────────────────────────────────────

/**
 * handleValidation
 * Express middleware. If any validation rule above fails, returns 400
 * with a structured array of error messages.
 * Used as the second middleware after the rule array in routes.
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

module.exports = { registerRules, loginRules, handleValidation };
