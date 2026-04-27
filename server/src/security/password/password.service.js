'use strict';

/**
 * server/src/security/password/password.service.js
 *
 * Feature 5: Password Hashing and Salting
 *
 * This service uses the custom PBKDF-style password hashing implementation
 * from server/src/security/hash/passwordHash.js.
 *
 * Passwords are never encrypted.
 * Passwords are stored only as salt + derived hash metadata.
 */

const {
  hashPassword: hashPasswordInternal,
  verifyPassword: verifyPasswordInternal,
} = require('../hash/passwordHash');

const {
  PASSWORD_HASH_ALGORITHM,
  DEFAULT_PASSWORD_ITERATIONS,
  DEFAULT_PASSWORD_SALT_BYTES,
  DEFAULT_PASSWORD_HASH_BYTES,
  validatePasswordStrength,
} = require('./passwordPolicy');

const hashPassword = async (plainPassword, options = {}) => {
  validatePasswordStrength(plainPassword);

  const result = hashPasswordInternal(plainPassword, {
    iterations: options.iterations || DEFAULT_PASSWORD_ITERATIONS,
    saltBytes: options.saltBytes || DEFAULT_PASSWORD_SALT_BYTES,
    hashBytes: options.hashBytes || DEFAULT_PASSWORD_HASH_BYTES,
  });

  return {
    passwordHash: result.hash,
    passwordSalt: result.salt,
    passwordIterations: result.iterations,

    passwordHashAlgorithm: PASSWORD_HASH_ALGORITHM,
    passwordHashBytes: result.hashBytes,
  };
};

const normalizeStoredPassword = (storedPasswordData) => {
  if (!storedPasswordData || typeof storedPasswordData !== 'object') {
    return null;
  }

  return {
    algorithm: storedPasswordData.passwordHashAlgorithm || PASSWORD_HASH_ALGORITHM,
    hash: storedPasswordData.passwordHash,
    salt: storedPasswordData.passwordSalt,
    iterations: storedPasswordData.passwordIterations,
    hashBytes: storedPasswordData.passwordHashBytes || DEFAULT_PASSWORD_HASH_BYTES,
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