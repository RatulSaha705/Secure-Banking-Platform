'use strict';

/**
 * security/hash/passwordHash.js
 *
 * Password hashing and salting using Node's built-in crypto.pbkdf2Sync.
 *
 * Replaces the old user-built PBKDF2-HMAC-SHA256-LAB implementation.
 * The stored format is compatible with the built-in PBKDF2 algorithm.
 *
 * Stored shape:
 *   {
 *     algorithm:   'PBKDF2-SHA256',
 *     salt:        '<hex>',         ← crypto.randomBytes
 *     iterations:  200000,
 *     hash:        '<hex>',         ← crypto.pbkdf2Sync output
 *     hashBytes:   32
 *   }
 */

const crypto = require('crypto');

const ALGORITHM         = 'PBKDF2-SHA256';
const DEFAULT_ITERATIONS   = 200000;   // OWASP 2023 recommendation for PBKDF2-SHA256
const DEFAULT_SALT_BYTES   = 32;
const DEFAULT_HASH_BYTES   = 32;
const PBKDF2_DIGEST        = 'sha256';

// ── Salt generation ───────────────────────────────────────────────────────────

/**
 * Generates a cryptographically random salt as a hex string.
 * Uses Node's built-in crypto.randomBytes.
 *
 * @param {number} [bytes=32]
 * @returns {string} hex salt
 */
const generateSaltHex = (bytes = DEFAULT_SALT_BYTES) => {
  if (!Number.isInteger(bytes) || bytes < 8) {
    throw new RangeError('salt bytes must be an integer >= 8');
  }
  return crypto.randomBytes(bytes).toString('hex');
};

// ── Key derivation (PBKDF2 built-in) ─────────────────────────────────────────

/**
 * Derives a password hash using Node's built-in crypto.pbkdf2Sync.
 *
 * @param {string} password   plaintext password
 * @param {string} saltHex    hex-encoded salt
 * @param {object} [options]
 * @param {number} [options.iterations]
 * @param {number} [options.hashBytes]
 * @returns {string} hex-encoded derived key
 */
const derivePasswordHashHex = (password, saltHex, options = {}) => {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }

  if (typeof saltHex !== 'string' || !/^[0-9a-f]+$/iu.test(saltHex) || saltHex.length % 2 !== 0) {
    throw new TypeError('saltHex must be a valid even-length hex string');
  }

  const iterations = options.iterations || DEFAULT_ITERATIONS;
  const hashBytes  = options.hashBytes  || DEFAULT_HASH_BYTES;

  const salt   = Buffer.from(saltHex, 'hex');
  const derived = crypto.pbkdf2Sync(password, salt, iterations, hashBytes, PBKDF2_DIGEST);

  return derived.toString('hex');
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Hashes a password and returns the full stored object.
 *
 * @param {string} password
 * @param {object} [options]
 * @returns {{ algorithm, salt, iterations, hash, hashBytes }}
 */
const hashPassword = (password, options = {}) => {
  const salt       = options.salt      || generateSaltHex(options.saltBytes || DEFAULT_SALT_BYTES);
  const iterations = options.iterations || DEFAULT_ITERATIONS;
  const hashBytes  = options.hashBytes  || DEFAULT_HASH_BYTES;
  const hash       = derivePasswordHashHex(password, salt, { iterations, hashBytes });

  return {
    algorithm: ALGORITHM,
    salt,
    iterations,
    hash,
    hashBytes,
  };
};

/**
 * Verifies a plaintext password against a stored password hash object.
 *
 * @param {string} password
 * @param {{ algorithm, salt, iterations, hash, hashBytes }} storedPasswordHash
 * @returns {boolean}
 */
const verifyPassword = (password, storedPasswordHash) => {
  if (!storedPasswordHash || typeof storedPasswordHash !== 'object') return false;
  if (storedPasswordHash.algorithm !== ALGORITHM) return false;

  const actual = derivePasswordHashHex(password, storedPasswordHash.salt, {
    iterations: storedPasswordHash.iterations,
    hashBytes:  storedPasswordHash.hashBytes,
  });

  // Constant-time comparison using Node's built-in crypto.timingSafeEqual
  const a = Buffer.from(actual,                    'hex');
  const b = Buffer.from(storedPasswordHash.hash,   'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

module.exports = {
  ALGORITHM,
  DEFAULT_ITERATIONS,
  DEFAULT_SALT_BYTES,
  DEFAULT_HASH_BYTES,
  generateSaltHex,
  derivePasswordHashHex,
  hashPassword,
  verifyPassword,
};