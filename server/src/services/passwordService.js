'use strict';

/**
 * server/src/services/passwordService.js
 *
 * Compatibility bridge for existing authService imports.
 *
 * Your current authService imports:
 *   const { hashPassword, comparePassword } = require('./passwordService');
 *
 * This file now forwards those calls to the from-scratch password hashing
 * module in server/src/security/password.
 *
 * Do not use bcrypt here.
 */

const {
  hashPassword,
  comparePassword,
  normalizeStoredPassword,
} = require('../security/password');

module.exports = {
  hashPassword,
  comparePassword,
  normalizeStoredPassword,
};