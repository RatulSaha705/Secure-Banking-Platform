'use strict';

/**
 * security/storage/macRecord.js
 *
 * MAC helpers for encrypted fields and full records.
 * Built on the custom HMAC-SHA256 implementation from security/hash/hmac.js.
 *
 * No Node crypto HMAC function is used here.
 */

const {
  createRecordMac,
  verifyRecordMac,
  hmacSha256Hex,
  timingSafeEqualHex,
} = require('../hash/hmac');

const MAC_ENV_NAMES = [
  'SECURITY_MAC_MASTER_KEY',
  'HMAC_MASTER_KEY',
];

const getMacMasterKey = () => {
  for (const envName of MAC_ENV_NAMES) {
    if (process.env[envName]) return process.env[envName];
  }

  throw new Error(
    'Missing MAC master key. Add SECURITY_MAC_MASTER_KEY to server/.env.'
  );
};

const stableStringify = (value) => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (Buffer.isBuffer(value)) {
    return `buffer:${value.toString('hex')}`;
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const buildFieldMacParts = (encryptedField, context = {}) => [
  'encrypted-field-v1',
  context.documentType || '',
  context.collectionName || '',
  context.ownerId || '',
  context.documentId || '',
  context.fieldName || '',
  encryptedField.algorithm || '',
  encryptedField.keyId || '',
  encryptedField.keyPurpose || '',
  encryptedField.version || '',
  encryptedField.ciphertext || '',
  encryptedField.createdAt || '',
];

const createFieldMac = (encryptedField, context = {}) => {
  return createRecordMac(getMacMasterKey(), buildFieldMacParts(encryptedField, context));
};

const verifyFieldMac = (encryptedField, context = {}) => {
  if (!encryptedField || typeof encryptedField !== 'object') return false;
  if (!encryptedField.mac) return false;

  return verifyRecordMac(
    getMacMasterKey(),
    buildFieldMacParts(encryptedField, context),
    encryptedField.mac
  );
};

const createDocumentMac = (document, context = {}) => {
  const protectedDocument = {
    documentType: context.documentType || '',
    collectionName: context.collectionName || '',
    ownerId: context.ownerId || '',
    documentId: context.documentId || '',
    data: document,
  };

  return hmacSha256Hex(getMacMasterKey(), stableStringify(protectedDocument));
};

const verifyDocumentMac = (document, expectedMac, context = {}) => {
  const actualMac = createDocumentMac(document, context);
  return timingSafeEqualHex(actualMac, expectedMac);
};

module.exports = {
  MAC_ENV_NAMES,
  getMacMasterKey,
  stableStringify,
  buildFieldMacParts,
  createFieldMac,
  verifyFieldMac,
  createDocumentMac,
  verifyDocumentMac,
};