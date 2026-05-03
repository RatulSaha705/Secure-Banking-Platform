'use strict';

/**
 * security/hash/hash.js
 *
 * Thin wrapper around Node's built-in crypto module.
 *
 * Replaces the deleted user-built sha256.js and hmac.js files.
 * Uses crypto.createHash and crypto.createHmac — no custom algorithm code.
 *
 * Exports:
 *   sha256Hex(input)                         → string
 *   sha256Buffer(input)                      → Buffer
 *   hmacSha256Hex(key, message)              → string
 *   hmacSha256Buffer(key, message)           → Buffer
 *   timingSafeEqualHex(left, right)          → boolean
 */

const crypto = require('crypto');

// ── SHA-256 (built-in) ────────────────────────────────────────────────────────

const toBuffer = (input) => {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  throw new TypeError('Input must be a string, Buffer, or Uint8Array');
};

/**
 * SHA-256 hash of input, returned as a Buffer (32 bytes).
 * Uses Node's built-in crypto.createHash.
 */
const sha256Buffer = (input) => {
  return crypto.createHash('sha256').update(toBuffer(input)).digest();
};

/**
 * SHA-256 hash of input, returned as a hex string (64 chars).
 */
const sha256Hex = (input) => sha256Buffer(input).toString('hex');

// ── HMAC-SHA256 (built-in) ────────────────────────────────────────────────────

/**
 * HMAC-SHA256 of message using key, returned as a Buffer (32 bytes).
 * Uses Node's built-in crypto.createHmac.
 */
const hmacSha256Buffer = (key, message) => {
  const k = toBuffer(key);
  const m = toBuffer(message);
  return crypto.createHmac('sha256', k).update(m).digest();
};

/**
 * HMAC-SHA256 of message using key, returned as a hex string (64 chars).
 */
const hmacSha256Hex = (key, message) => hmacSha256Buffer(key, message).toString('hex');

// ── Timing-safe comparison ────────────────────────────────────────────────────

/**
 * Constant-time comparison of two hex strings using Node's crypto.timingSafeEqual.
 * Returns false if lengths differ.
 */
const timingSafeEqualHex = (leftHex, rightHex) => {
  if (typeof leftHex !== 'string' || typeof rightHex !== 'string') return false;
  if (leftHex.length !== rightHex.length) return false;

  const left  = Buffer.from(leftHex,  'hex');
  const right = Buffer.from(rightHex, 'hex');

  return crypto.timingSafeEqual(left, right);
};

module.exports = {
  sha256Buffer,
  sha256Hex,
  hmacSha256Buffer,
  hmacSha256Hex,
  timingSafeEqualHex,
};
