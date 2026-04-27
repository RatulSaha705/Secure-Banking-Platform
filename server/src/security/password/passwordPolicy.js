'use strict';

/**
 * server/src/security/password/passwordPolicy.js
 *
 * Feature 5: Password Hashing and Salting Policy
 *
 * Passwords are NOT encrypted.
 * Passwords are stored only as:
 *   - passwordHash
 *   - passwordSalt
 *   - passwordIterations
 */

const PASSWORD_HASH_ALGORITHM = 'PBKDF2-HMAC-SHA256-LAB';
const DEFAULT_PASSWORD_ITERATIONS = 10000;
const DEFAULT_PASSWORD_SALT_BYTES = 16;
const DEFAULT_PASSWORD_HASH_BYTES = 32;

const MIN_PASSWORD_LENGTH = 8;

const validatePasswordStrength = (password) => {
  if (typeof password !== 'string') {
    const error = new Error('Password must be a string');
    error.statusCode = 400;
    throw error;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    const error = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    error.statusCode = 400;
    throw error;
  }

  return true;
};

module.exports = {
  PASSWORD_HASH_ALGORITHM,
  DEFAULT_PASSWORD_ITERATIONS,
  DEFAULT_PASSWORD_SALT_BYTES,
  DEFAULT_PASSWORD_HASH_BYTES,
  MIN_PASSWORD_LENGTH,
  validatePasswordStrength,
};