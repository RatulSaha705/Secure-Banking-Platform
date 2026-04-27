'use strict';

/**
 * security/storage/secureSerializer.js
 *
 * Safe response serializer.
 *
 * This helps avoid accidentally returning encrypted envelopes, password hashes,
 * private keys, OTP codes, or internal security metadata to the frontend.
 */

const { isEncryptedField } = require('./encryptedField');

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