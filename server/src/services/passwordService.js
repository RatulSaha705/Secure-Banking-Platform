/**
 * services/passwordService.js — Password Hashing & Salting
 *
 * Handles all password-related cryptographic operations.
 * Uses bcrypt (adaptive hash function with cost factor).
 *
 * WHY bcrypt?
 *   - Automatically generates and embeds a random salt
 *   - Adaptive cost factor resists brute-force as hardware improves
 *   - Industry standard for password storage
 *
 * NOTE: This is separate from the "from-scratch" RSA/ECC requirement.
 * Password hashing is an independent security concern and bcrypt is
 * the correct, well-established tool for this specific job.
 */

'use strict';

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12; // Cost factor — increase for more security (slower)

/**
 * hashPassword
 * Hashes a plaintext password with bcrypt (auto-generates salt).
 *
 * @param {string} plainPassword
 * @returns {Promise<string>} bcrypt hash string (includes salt)
 */
const hashPassword = async (plainPassword) => {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
};

/**
 * comparePassword
 * Compares a plaintext password against a stored bcrypt hash.
 * Uses constant-time comparison internally (bcrypt does this).
 *
 * @param {string} plainPassword
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
const comparePassword = async (plainPassword, hash) => {
  return bcrypt.compare(plainPassword, hash);
};

module.exports = { hashPassword, comparePassword };
