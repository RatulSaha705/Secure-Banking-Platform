'use strict';

/**
 * security/hash/hmac.js
 *
 * Pure JavaScript HMAC-SHA256 implementation built on the custom SHA-256
 * implementation in sha256.js. No Node crypto HMAC function is used here.
 *
 * Used for:
 *   - integrity tags for encrypted records
 *   - lookup hashes for encrypted email/username search
 *   - password hashing inner function
 */

const { sha256Buffer, sha256Hex } = require('./sha256');

const BLOCK_SIZE_BYTES = 64;

const normalizeKey = (key) => {
  if (Buffer.isBuffer(key)) return Buffer.from(key);
  if (key instanceof Uint8Array) return Buffer.from(key);
  if (typeof key === 'string') return Buffer.from(key, 'utf8');

  throw new TypeError('HMAC key must be a string, Buffer, or Uint8Array');
};

const normalizeMessage = (message) => {
  if (Buffer.isBuffer(message)) return Buffer.from(message);
  if (message instanceof Uint8Array) return Buffer.from(message);
  if (typeof message === 'string') return Buffer.from(message, 'utf8');

  throw new TypeError('HMAC message must be a string, Buffer, or Uint8Array');
};

const hmacSha256Buffer = (keyInput, messageInput) => {
  let key = normalizeKey(keyInput);
  const message = normalizeMessage(messageInput);

  if (key.length > BLOCK_SIZE_BYTES) {
    key = sha256Buffer(key);
  }

  if (key.length < BLOCK_SIZE_BYTES) {
    key = Buffer.concat([key, Buffer.alloc(BLOCK_SIZE_BYTES - key.length)]);
  }

  const outerPad = Buffer.alloc(BLOCK_SIZE_BYTES);
  const innerPad = Buffer.alloc(BLOCK_SIZE_BYTES);

  for (let i = 0; i < BLOCK_SIZE_BYTES; i += 1) {
    outerPad[i] = key[i] ^ 0x5c;
    innerPad[i] = key[i] ^ 0x36;
  }

  const innerHash = sha256Buffer(Buffer.concat([innerPad, message]));
  return sha256Buffer(Buffer.concat([outerPad, innerHash]));
};

const hmacSha256Hex = (keyInput, messageInput) => {
  return hmacSha256Buffer(keyInput, messageInput).toString('hex');
};

const timingSafeEqualHex = (leftHex, rightHex) => {
  if (typeof leftHex !== 'string' || typeof rightHex !== 'string') return false;
  if (leftHex.length !== rightHex.length) return false;

  let difference = 0;

  for (let i = 0; i < leftHex.length; i += 1) {
    difference |= leftHex.charCodeAt(i) ^ rightHex.charCodeAt(i);
  }

  return difference === 0;
};

const createRecordMac = (masterKey, recordParts) => {
  if (!Array.isArray(recordParts)) {
    throw new TypeError('recordParts must be an array');
  }

  const canonical = recordParts
    .map((part) => {
      const value = part === null || part === undefined ? '' : String(part);
      return `${value.length}:${value}`;
    })
    .join('|');

  return hmacSha256Hex(masterKey, canonical);
};

const verifyRecordMac = (masterKey, recordParts, expectedMacHex) => {
  const actual = createRecordMac(masterKey, recordParts);
  return timingSafeEqualHex(actual, expectedMacHex);
};

module.exports = {
  BLOCK_SIZE_BYTES,
  hmacSha256Buffer,
  hmacSha256Hex,
  timingSafeEqualHex,
  createRecordMac,
  verifyRecordMac,
  sha256Hex,
};