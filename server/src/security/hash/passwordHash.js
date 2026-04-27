'use strict';

/**
 * security/hash/passwordHash.js
 *
 * Password hashing and salting built on the custom HMAC-SHA256 module.
 * This is a PBKDF2-style loop implemented manually for the lab requirement.
 *
 * Stored shape:
 *   {
 *     algorithm: 'PBKDF2-HMAC-SHA256-LAB',
 *     salt: '<hex>',
 *     iterations: 10000,
 *     hash: '<hex>',
 *     hashBytes: 32
 *   }
 *
 * Important:
 *   Passwords are never encrypted or stored in plaintext.
 *   Only salt + derived hash are stored.
 */

const crypto = require('crypto');
const { hmacSha256Buffer, hmacSha256Hex, timingSafeEqualHex } = require('./hmac');

const DEFAULT_ITERATIONS = 10000;
const DEFAULT_SALT_BYTES = 16;
const DEFAULT_HASH_BYTES = 32;

const generateSaltHex = (bytes = DEFAULT_SALT_BYTES) => {
  if (!Number.isInteger(bytes) || bytes < 8) {
    throw new RangeError('salt bytes must be an integer greater than or equal to 8');
  }

  // randomBytes is used only for secure random salt generation, not hashing.
  return crypto.randomBytes(bytes).toString('hex');
};

const int32BigEndian = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
};

const pbkdf2Block = (passwordBuffer, saltBuffer, iterations, blockIndex) => {
  let u = hmacSha256Buffer(passwordBuffer, Buffer.concat([saltBuffer, int32BigEndian(blockIndex)]));
  const output = Buffer.from(u);

  for (let i = 1; i < iterations; i += 1) {
    u = hmacSha256Buffer(passwordBuffer, u);

    for (let j = 0; j < output.length; j += 1) {
      output[j] ^= u[j];
    }
  }

  return output;
};

const derivePasswordHashHex = (password, saltHex, options = {}) => {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }

  if (typeof saltHex !== 'string' || !/^[0-9a-f]+$/iu.test(saltHex) || saltHex.length % 2 !== 0) {
    throw new TypeError('saltHex must be a valid even-length hex string');
  }

  const iterations = options.iterations || DEFAULT_ITERATIONS;
  const hashBytes = options.hashBytes || DEFAULT_HASH_BYTES;

  if (!Number.isInteger(iterations) || iterations < 1000) {
    throw new RangeError('iterations must be an integer greater than or equal to 1000');
  }

  if (!Number.isInteger(hashBytes) || hashBytes < 16) {
    throw new RangeError('hashBytes must be an integer greater than or equal to 16');
  }

  const passwordBuffer = Buffer.from(password, 'utf8');
  const saltBuffer = Buffer.from(saltHex, 'hex');

  const blocksNeeded = Math.ceil(hashBytes / 32);
  const blocks = [];

  for (let blockIndex = 1; blockIndex <= blocksNeeded; blockIndex += 1) {
    blocks.push(pbkdf2Block(passwordBuffer, saltBuffer, iterations, blockIndex));
  }

  return Buffer.concat(blocks).subarray(0, hashBytes).toString('hex');
};

const hashPassword = (password, options = {}) => {
  const salt = options.salt || generateSaltHex(options.saltBytes || DEFAULT_SALT_BYTES);
  const iterations = options.iterations || DEFAULT_ITERATIONS;
  const hashBytes = options.hashBytes || DEFAULT_HASH_BYTES;
  const hash = derivePasswordHashHex(password, salt, { iterations, hashBytes });

  return {
    algorithm: 'PBKDF2-HMAC-SHA256-LAB',
    salt,
    iterations,
    hash,
    hashBytes,
  };
};

const verifyPassword = (password, storedPasswordHash) => {
  if (!storedPasswordHash || typeof storedPasswordHash !== 'object') {
    return false;
  }

  if (storedPasswordHash.algorithm !== 'PBKDF2-HMAC-SHA256-LAB') {
    return false;
  }

  const actualHash = derivePasswordHashHex(password, storedPasswordHash.salt, {
    iterations: storedPasswordHash.iterations,
    hashBytes: storedPasswordHash.hashBytes,
  });

  return timingSafeEqualHex(actualHash, storedPasswordHash.hash);
};

const createLookupHash = (secret, value) => {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim().toLowerCase();
  return hmacSha256Hex(secret, normalized);
};

module.exports = {
  DEFAULT_ITERATIONS,
  DEFAULT_SALT_BYTES,
  DEFAULT_HASH_BYTES,
  generateSaltHex,
  derivePasswordHashHex,
  hashPassword,
  verifyPassword,
  createLookupHash,
};