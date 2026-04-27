'use strict';

/**
 * server/src/validators/authValidator.js
 *
 * Feature 9 validation:
 *   - register
 *   - register/verify
 *   - login
 *   - login/verify
 */

const { body, validationResult } = require('express-validator');

const registerRules = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('A valid email address is required')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),

  body('contact')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 }).withMessage('Contact must be at most 30 characters'),

  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 }).withMessage('Phone number must be at most 30 characters'),

  body('fullName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Full name must be at most 100 characters'),
];

const verifyRegistrationRules = [
  body('pendingRegistrationId')
    .trim()
    .notEmpty().withMessage('pendingRegistrationId is required'),

  body('challengeId')
    .trim()
    .notEmpty().withMessage('challengeId is required'),

  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only numbers'),
];

const loginRules = [
  body().custom((value) => {
    const identifier = value.identifier || value.email || value.username;

    if (!identifier || !String(identifier).trim()) {
      throw new Error('Email or username is required');
    }

    return true;
  }),

  body('identifier')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3 }).withMessage('Identifier must be at least 3 characters'),

  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3 }).withMessage('Email must be at least 3 characters'),

  body('username')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),

  body('password')
    .notEmpty().withMessage('Password is required'),
];

const verifyLoginRules = [
  body('challengeId')
    .trim()
    .notEmpty().withMessage('challengeId is required'),

  body('userId')
    .trim()
    .notEmpty().withMessage('userId is required'),

  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only numbers'),
];

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    });
  }

  return next();
};

module.exports = {
  registerRules,
  verifyRegistrationRules,
  loginRules,
  verifyLoginRules,
  handleValidation,
};