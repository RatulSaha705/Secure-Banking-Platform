'use strict';

/**
 * services/fieldEncryptionService.js — Symmetric Field-Level Encryption
 *
 * PURPOSE:
 *   Encrypts and decrypts individual PII fields before storing in MongoDB.
 *   Provides a clean abstraction so callers never handle raw ciphertext.
 *
 * CURRENT IMPLEMENTATION (Phase 1):
 *   AES-256-GCM using Node's built-in crypto module.
 *   - A unique random IV (12 bytes) is generated per encryption call.
 *   - The GCM auth tag (16 bytes) provides authenticated encryption,
 *     detecting any ciphertext tampering at the AES layer as well.
 *   - Output format: base64( iv || authTag || ciphertext )
 *
 * MAC INTEGRITY LAYER (in addition to AES-GCM auth tag):
 *   An HMAC-SHA256 tag is computed over the full base64 ciphertext blob
 *   and stored separately in the mac_* fields. This is the EXPLICIT MAC
 *   integrity layer required by the lab — it provides tamper detection
 *   at the application level, independent of the encryption cipher.
 *
 * EXTENSION PATH (Phase 2):
 *   Replace encrypt/decrypt with the from-scratch RSA or AES implementation.
 *   The service interface (encryptField / decryptField / computeMac / verifyMac)
 *   stays identical — only the internals change.
 *
 * KEY SOURCE:
 *   FIELD_ENCRYPTION_KEY in .env (32 bytes = 64 hex chars for AES-256).
 */

const crypto = require('crypto');

const ALGORITHM  = 'aes-256-gcm';
const IV_BYTES   = 12; // 96-bit IV for GCM
const TAG_BYTES  = 16; // 128-bit auth tag

// ── Encryption key helpers ────────────────────────────────────────────────────

const getEncKey = () => {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex) throw new Error('FIELD_ENCRYPTION_KEY is not set in environment');
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex chars (32 bytes for AES-256)');
  return buf;
};

const getMacKey = () => {
  const hex = process.env.HMAC_MASTER_KEY;
  if (!hex) throw new Error('HMAC_MASTER_KEY is not set in environment');
  return Buffer.from(hex, 'hex');
};

// ── Core encrypt / decrypt ────────────────────────────────────────────────────

/**
 * encryptField
 * Encrypts a plaintext string with AES-256-GCM.
 * Returns a single base64 blob: iv || authTag || ciphertext
 *
 * @param {string} plaintext
 * @returns {string} base64-encoded encrypted blob
 */
const encryptField = (plaintext) => {
  if (plaintext === null || plaintext === undefined) return null;

  const key  = getEncKey();
  const iv   = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // Pack: iv (12) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
};

/**
 * decryptField
 * Decrypts a base64 blob produced by encryptField.
 *
 * @param {string} ciphertextB64 - base64-encoded blob
 * @returns {string} plaintext
 */
const decryptField = (ciphertextB64) => {
  if (!ciphertextB64) return null;

  const key    = getEncKey();
  const packed = Buffer.from(ciphertextB64, 'base64');

  const iv         = packed.slice(0, IV_BYTES);
  const authTag    = packed.slice(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = packed.slice(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
};

// ── MAC computation (application-level integrity layer) ──────────────────────

/**
 * computeMac
 * Computes HMAC-SHA256 over the base64 ciphertext blob.
 * This is the EXPLICIT MAC required by the lab.
 *
 * TODO (Phase 2): Replace with from-scratch HMAC-SHA256 from macIntegrity.js
 *
 * @param {string|null} ciphertextB64
 * @returns {string|null} hex-encoded MAC tag
 */
const computeMac = (ciphertextB64) => {
  if (!ciphertextB64) return null;
  const key = getMacKey();
  return crypto.createHmac('sha256', key).update(ciphertextB64).digest('hex');
};

/**
 * verifyMac
 * Constant-time MAC verification before decryption.
 * Throws if the MAC does not match (tamper detected).
 *
 * @param {string} ciphertextB64
 * @param {string} expectedMacHex
 */
const verifyMac = (ciphertextB64, expectedMacHex) => {
  if (!ciphertextB64 || !expectedMacHex) return; // null fields skip check
  const actualMac    = computeMac(ciphertextB64);
  const actualBuf    = Buffer.from(actualMac, 'hex');
  const expectedBuf  = Buffer.from(expectedMacHex, 'hex');

  if (actualBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    throw new Error('MAC verification failed — data may have been tampered with');
  }
};

// ── Convenience wrappers for User model fields ───────────────────────────────

/**
 * encryptUserFields
 * Encrypts a set of user PII fields.
 * Returns the encrypted blobs and their MAC tags ready for MongoDB storage.
 *
 * @param {{ username, email, fullName?, phone? }} fields
 * @returns {{ encUsername, macUsername, encEmail, macEmail, encFullName, macFullName, encPhone, macPhone }}
 */
const encryptUserFields = (fields) => {
  const encUsername = encryptField(fields.username);
  const encEmail    = encryptField(fields.email);
  const encFullName = encryptField(fields.fullName || null);
  const encPhone    = encryptField(fields.phone    || null);

  return {
    encUsername, macUsername: computeMac(encUsername),
    encEmail,    macEmail:    computeMac(encEmail),
    encFullName, macFullName: computeMac(encFullName),
    encPhone,    macPhone:    computeMac(encPhone),
  };
};

/**
 * decryptUserFields
 * Verifies MAC tags and decrypts PII fields from a stored user document.
 *
 * @param {object} user - Mongoose user document (or plain object)
 * @returns {{ username, email, fullName, phone }}
 */
const decryptUserFields = (user) => {
  verifyMac(user.encUsername, user.macUsername);
  verifyMac(user.encEmail,    user.macEmail);
  verifyMac(user.encFullName, user.macFullName);
  verifyMac(user.encPhone,    user.macPhone);

  return {
    username: decryptField(user.encUsername),
    email:    decryptField(user.encEmail),
    fullName: decryptField(user.encFullName),
    phone:    decryptField(user.encPhone),
  };
};

module.exports = {
  encryptField,
  decryptField,
  computeMac,
  verifyMac,
  encryptUserFields,
  decryptUserFields,
};
