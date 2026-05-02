'use strict';

/**
 * server/src/validators/profileValidator.js
 *
 * Input validation rules for Profile Management endpoints.
 *
 *   GET  /api/profile/me              – no body fields to validate.
 *   PUT  /api/profile/me              – updateProfileRules
 *   GET  /api/profile/admin/:userId   – adminGetProfileRules
 */

const { body, param, validationResult } = require('express-validator');

// ── Update profile rules ──────────────────────────────────────────────────────

/**
 * All fields are optional — only the ones sent will be updated.
 * The service layer ignores anything not in its EDITABLE_FIELDS list.
 */
const updateProfileRules = [
  body('username')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),

  body('contact')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage('Contact must be at most 30 characters'),

  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage('Phone number must be at most 30 characters'),

  body('fullName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Full name must be at most 100 characters'),

  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Address must be at most 255 characters'),

  body('dateOfBirth')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Date of birth must be in YYYY-MM-DD format')
    .custom((value) => {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Date of birth is not a valid date');
      }
      if (date > new Date()) {
        throw new Error('Date of birth cannot be in the future');
      }
      return true;
    }),

  body('nid')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 5, max: 30 })
    .withMessage('NID must be between 5 and 30 characters'),
];

// ── Admin get profile by userId rules ─────────────────────────────────────────

const adminGetProfileRules = [
  param('userId')
    .trim()
    .notEmpty()
    .withMessage('userId param is required')
    .isMongoId()
    .withMessage('userId must be a valid MongoDB ObjectId'),
];

// ── Shared validation handler (mirrors authValidator pattern) ─────────────────

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
  updateProfileRules,
  adminGetProfileRules,
  handleValidation,
};
