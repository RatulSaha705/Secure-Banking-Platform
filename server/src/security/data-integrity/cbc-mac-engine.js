'use strict';

/**
 * security/integrity/cbcMac.js
 *
 * CBC-MAC (Cipher Block Chaining - Message Authentication Code)
 *
 * Standard construction:
 *   1. Pad message to a multiple of 16 bytes (AES block size).
 *   2. AES-128-CBC encrypt with a zero IV.
 *   3. The LAST 16-byte ciphertext block is the MAC tag.
 *
 * This uses Node's built-in crypto.createCipheriv — NOT a custom cipher.
 * Only RSA and ECC are custom-built; all other primitives use Node builtins.
 *
 * Key derivation:
 *   The master secret (env string) is hashed with SHA-256 and the first
 *   16 bytes are used as the 128-bit AES key. This avoids adding a new
 *   env variable while ensuring the key is exactly the right length.
 *
 * Exports:
 *   deriveCbcMacKey(secret)              → Buffer (16 bytes)
 *   cbcMacBuffer(key, message)           → Buffer (16 bytes)
 *   cbcMacHex(key, message)              → string (32 hex chars)
 *   timingSafeEqualHex(left, right)      → boolean
 *   createCbcMac(masterKey, parts)       → string hex tag
 *   verifyCbcMac(masterKey, parts, tag)  → boolean
 */

const crypto = require('crypto');

const AES_BLOCK_SIZE = 16; // bytes — AES-128 block size
const ZERO_IV = Buffer.alloc(AES_BLOCK_SIZE, 0); // CBC-MAC uses an all-zero IV

// ── Key derivation ────────────────────────────────────────────────────────────

/**
 * Derives a 16-byte AES-128 key from an arbitrary-length secret string.
 * Uses SHA-256 (built-in) and takes the first 16 bytes.
 *
 * @param {string|Buffer} secret
 * @returns {Buffer} 16-byte key
 */
const deriveCbcMacKey = (secret) => {
  if (!secret) {
    throw new Error('CBC-MAC secret must not be empty');
  }

  const input = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret), 'utf8');
  return crypto.createHash('sha256').update(input).digest().slice(0, AES_BLOCK_SIZE);
};

// ── PKCS#7-style zero padding ─────────────────────────────────────────────────

/**
 * Pads the message to the next multiple of AES_BLOCK_SIZE using zero bytes.
 * Standard CBC-MAC uses zero padding (ISO/IEC 9797-1 Padding Method 1).
 * The length is prepended as a 4-byte big-endian integer to make the
 * scheme secure against variable-length message attacks.
 *
 * @param {Buffer} message
 * @returns {Buffer}
 */
const padMessage = (message) => {
  // Prepend a 4-byte big-endian length prefix for length separation.
  const lenPrefix = Buffer.alloc(4);
  lenPrefix.writeUInt32BE(message.length >>> 0, 0);

  const combined = Buffer.concat([lenPrefix, message]);
  const remainder = combined.length % AES_BLOCK_SIZE;
  const padLen = remainder === 0 ? 0 : AES_BLOCK_SIZE - remainder;

  return Buffer.concat([combined, Buffer.alloc(padLen, 0)]);
};

// ── Core CBC-MAC ──────────────────────────────────────────────────────────────

/**
 * Computes CBC-MAC over a message using a 16-byte AES-128 key.
 *
 * @param {Buffer} key     16-byte AES key
 * @param {Buffer|string} message  message to authenticate
 * @returns {Buffer} 16-byte MAC tag
 */
const cbcMacBuffer = (key, message) => {
  if (!Buffer.isBuffer(key) || key.length !== AES_BLOCK_SIZE) {
    throw new TypeError('CBC-MAC key must be a 16-byte Buffer');
  }

  const msgBuffer = Buffer.isBuffer(message)
    ? message
    : Buffer.from(String(message), 'utf8');

  const padded = padMessage(msgBuffer);

  // AES-128-CBC encrypt with zero IV; discard all output except last block.
  const cipher = crypto.createCipheriv('aes-128-cbc', key, ZERO_IV);
  cipher.setAutoPadding(false); // message is already padded

  const blocks = [];
  blocks.push(cipher.update(padded));
  blocks.push(cipher.final());

  const ciphertext = Buffer.concat(blocks);

  // The MAC tag is the last 16-byte block of the ciphertext.
  return ciphertext.slice(ciphertext.length - AES_BLOCK_SIZE);
};

/**
 * Computes CBC-MAC and returns the result as a hex string (32 chars).
 *
 * @param {Buffer} key
 * @param {Buffer|string} message
 * @returns {string}
 */
const cbcMacHex = (key, message) => cbcMacBuffer(key, message).toString('hex');

// ── Timing-safe comparison ────────────────────────────────────────────────────

/**
 * Constant-time comparison of two hex strings.
 * Returns false immediately if lengths differ (not a timing leak for equal-
 * length tags since CBC-MAC tags are always 32 hex chars).
 *
 * @param {string} leftHex
 * @param {string} rightHex
 * @returns {boolean}
 */
const timingSafeEqualHex = (leftHex, rightHex) => {
  if (typeof leftHex !== 'string' || typeof rightHex !== 'string') return false;
  if (leftHex.length !== rightHex.length) return false;

  const left  = Buffer.from(leftHex,  'hex');
  const right = Buffer.from(rightHex, 'hex');

  // Both buffers are the same length — use Node's constant-time compare.
  return crypto.timingSafeEqual(left, right);
};

// ── High-level helpers ────────────────────────────────────────────────────────

/**
 * Produces a stable canonical string from an array of record parts,
 * then computes CBC-MAC over that string using the given masterKey secret.
 *
 * The canonical form: `length:value|length:value|…`
 * This is the same format the old HMAC implementation used.
 *
 * @param {string} masterKey  raw secret (env string — key will be derived)
 * @param {string[]} parts
 * @returns {string} hex MAC tag
 */
const createCbcMac = (masterKey, parts) => {
  if (!Array.isArray(parts)) {
    throw new TypeError('parts must be an array');
  }

  const canonical = parts
    .map((part) => {
      const value = part === null || part === undefined ? '' : String(part);
      return `${value.length}:${value}`;
    })
    .join('|');

  const key = deriveCbcMacKey(masterKey);
  return cbcMacHex(key, canonical);
};

/**
 * Verifies a CBC-MAC tag produced by createCbcMac.
 *
 * @param {string} masterKey
 * @param {string[]} parts
 * @param {string} expectedHex
 * @returns {boolean}
 */
const verifyCbcMac = (masterKey, parts, expectedHex) => {
  const actual = createCbcMac(masterKey, parts);
  return timingSafeEqualHex(actual, expectedHex);
};

module.exports = {
  AES_BLOCK_SIZE,
  deriveCbcMacKey,
  cbcMacBuffer,
  cbcMacHex,
  timingSafeEqualHex,
  createCbcMac,
  verifyCbcMac,
};
