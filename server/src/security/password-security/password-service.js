'use strict';

/**
 * server/src/security/password/password.service.js
 *
 * Feature 5: Password Hashing and Salting
 *
 * Uses Node's built-in crypto.pbkdf2Sync via the rewritten passwordHash.js.
 * Passwords are never encrypted or stored in plaintext.
 * Only salt + derived hash metadata are stored.
 */

const {
  hashPassword: hashPasswordInternal,
  verifyPassword: verifyPasswordInternal,
  ALGORITHM,
} = require('../hashing/password-hasher');

const {
  PASSWORD_HASH_ALGORITHM,
  DEFAULT_PASSWORD_ITERATIONS,
  DEFAULT_PASSWORD_SALT_BYTES,
  DEFAULT_PASSWORD_HASH_BYTES,
  validatePasswordStrength,
} = require('./password-rules');

const hashPassword = async (plainPassword, options = {}) => {
  validatePasswordStrength(plainPassword);

  const result = hashPasswordInternal(plainPassword, {
    iterations: options.iterations || DEFAULT_PASSWORD_ITERATIONS,
    saltBytes:  options.saltBytes  || DEFAULT_PASSWORD_SALT_BYTES,
    hashBytes:  options.hashBytes  || DEFAULT_PASSWORD_HASH_BYTES,
  });

  return {
    passwordHash:          result.hash,
    passwordSalt:          result.salt,
    passwordIterations:    result.iterations,
    passwordHashAlgorithm: result.algorithm,
    passwordHashBytes:     result.hashBytes,
  };
};

const normalizeStoredPassword = (storedPasswordData) => {
  if (!storedPasswordData || typeof storedPasswordData !== 'object') {
    return null;
  }

  return {
    algorithm:  storedPasswordData.passwordHashAlgorithm || ALGORITHM,
    hash:       storedPasswordData.passwordHash,
    salt:       storedPasswordData.passwordSalt,
    iterations: storedPasswordData.passwordIterations,
    hashBytes:  storedPasswordData.passwordHashBytes || DEFAULT_PASSWORD_HASH_BYTES,
  };
};

const comparePassword = async (plainPassword, storedPasswordData) => {
  const normalized = normalizeStoredPassword(storedPasswordData);

  if (!normalized) return false;
  if (!normalized.hash || !normalized.salt || !normalized.iterations) return false;

  return verifyPasswordInternal(plainPassword, normalized);
};

module.exports = {
  hashPassword,
  comparePassword,
  normalizeStoredPassword,
};