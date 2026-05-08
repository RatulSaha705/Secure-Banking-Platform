'use strict';

/**
 * ============================================================================
 * CONTRIBUTION: Secure Storage Layer — Data Serializer (Sifat)
 * ============================================================================
 *
 * Security Feature : ✔ Data Integrity (MAC) + Secure Storage
 * Responsibility   : Secure Storage Layer — Safe response serialization
 *
 * This module prevents accidental leakage of encrypted envelopes, password
 * hashes, private keys, or OTP codes to the frontend. It strips hidden
 * fields and replaces un-decrypted envelopes with a placeholder string.
 *
 * Key contributions in this file:
 *   1. DEFAULT_HIDDEN_FIELDS     — List of field names that must never reach
 *                                   the client (password, passwordHash, salt,
 *                                   otp, privateKey, etc.).
 *   2. removeHiddenFields()      — Recursively walks a document/array and
 *                                   removes hidden fields; replaces any
 *                                   still-encrypted envelopes with
 *                                   '[ENCRYPTED_FIELD_NOT_DECRYPTED]'.
 *   3. serializeForClient()      — Convenience wrapper that applies the
 *                                   default (or custom) hidden-field list.
 * ============================================================================
 */

/**
 * security/storage/secureSerializer.js
 *
 * Safe response serializer.
 *
 * This helps avoid accidentally returning encrypted envelopes, password hashes,
 * private keys, OTP codes, or internal security metadata to the frontend.
 */

const { isEncryptedField } = require('./field-encryptor');

const DEFAULT_HIDDEN_FIELDS = Object.freeze([
  'password',
  'passwordHash',
  'salt',
  'otp',
  'otpHash',
  'twoFactorSecret',
  'resetPasswordToken',
  'resetPasswordExpires',
  'privateKey',
  'privateKeyEnvVar',
  '__v',
]);

const removeHiddenFields = (value, hiddenFields = DEFAULT_HIDDEN_FIELDS) => {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => removeHiddenFields(item, hiddenFields));
  }

  if (typeof value !== 'object') return value;

  if (typeof value.toObject === 'function') {
    return removeHiddenFields(value.toObject(), hiddenFields);
  }

  const output = {};

  for (const [key, fieldValue] of Object.entries(value)) {
    if (hiddenFields.includes(key)) continue;

    if (isEncryptedField(fieldValue)) {
      output[key] = '[ENCRYPTED_FIELD_NOT_DECRYPTED]';
      continue;
    }

    output[key] = removeHiddenFields(fieldValue, hiddenFields);
  }

  return output;
};

const serializeForClient = (document, options = {}) => {
  return removeHiddenFields(
    document,
    options.hiddenFields || DEFAULT_HIDDEN_FIELDS
  );
};

module.exports = {
  DEFAULT_HIDDEN_FIELDS,
  removeHiddenFields,
  serializeForClient,
};