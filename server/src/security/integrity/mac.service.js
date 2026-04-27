'use strict';

/**
 * server/src/security/integrity/mac.service.js
 *
 * Feature 19: Integrity Verification / MAC Service
 *
 * Uses the custom HMAC-SHA256 implementation from:
 *   server/src/security/hash/hmac.js
 *
 * No Node crypto.createHmac is used here.
 */

const {
  createRecordMac,
  verifyRecordMac,
  hmacSha256Hex,
  timingSafeEqualHex,
} = require('../hash/hmac');

const {
  MAC_ALGORITHM,
  MAC_VERSION,
  MAC_ENV_NAMES,
  normalizeMacContext,
  validateMacContext,
  validateEnvelopeForMac,
} = require('./macPolicy');

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

const buildEncryptedFieldMacParts = (envelope, context = {}) => {
  validateEnvelopeForMac(envelope);
  const normalizedContext = validateMacContext(context);

  return [
    `mac-version:${MAC_VERSION}`,

    `modelName:${normalizedContext.modelName}`,
    `fieldName:${normalizedContext.fieldName}`,
    `ownerId:${normalizedContext.ownerId}`,

    `collectionName:${normalizedContext.collectionName}`,
    `documentId:${normalizedContext.documentId}`,

    `algorithm:${envelope.algorithm}`,
    `keyId:${envelope.keyId}`,
    `ciphertext:${envelope.ciphertext}`,

    `dataType:${envelope.dataType || ''}`,
    `keyPurpose:${envelope.keyPurpose || ''}`,
    `version:${envelope.version || envelope.keyVersion || ''}`,
    `createdAt:${envelope.createdAt || ''}`,
  ];
};

const createEncryptedFieldMac = (envelope, context = {}) => {
  return createRecordMac(
    getMacMasterKey(),
    buildEncryptedFieldMacParts(envelope, context)
  );
};

const verifyEncryptedFieldMac = (envelope, context = {}) => {
  if (!envelope || typeof envelope !== 'object') return false;
  if (!envelope.mac || typeof envelope.mac !== 'string') return false;

  return verifyRecordMac(
    getMacMasterKey(),
    buildEncryptedFieldMacParts(envelope, context),
    envelope.mac
  );
};

const assertEncryptedFieldMacValid = (envelope, context = {}) => {
  const isValid = verifyEncryptedFieldMac(envelope, context);

  if (!isValid) {
    const normalizedContext = normalizeMacContext(context);

    throw new Error(
      `MAC verification failed for ` +
      `${normalizedContext.modelName || 'UNKNOWN_MODEL'}.` +
      `${normalizedContext.fieldName || 'UNKNOWN_FIELD'}`
    );
  }

  return true;
};

const attachMacToEncryptedField = (envelope, context = {}) => {
  validateEnvelopeForMac(envelope);

  const protectedEnvelope = {
    ...envelope,
    macAlgorithm: MAC_ALGORITHM,
    macVersion: MAC_VERSION,
  };

  protectedEnvelope.mac = createEncryptedFieldMac(protectedEnvelope, context);

  return protectedEnvelope;
};

const createDocumentMac = (document, context = {}) => {
  const normalizedContext = normalizeMacContext(context);

  return hmacSha256Hex(
    getMacMasterKey(),
    stableStringify({
      macVersion: MAC_VERSION,
      modelName: normalizedContext.modelName,
      collectionName: normalizedContext.collectionName,
      ownerId: normalizedContext.ownerId,
      documentId: normalizedContext.documentId,
      data: document,
    })
  );
};

const verifyDocumentMac = (document, expectedMac, context = {}) => {
  if (!expectedMac || typeof expectedMac !== 'string') return false;

  const actualMac = createDocumentMac(document, context);
  return timingSafeEqualHex(actualMac, expectedMac);
};

module.exports = {
  getMacMasterKey,
  stableStringify,

  buildEncryptedFieldMacParts,
  createEncryptedFieldMac,
  verifyEncryptedFieldMac,
  assertEncryptedFieldMacValid,
  attachMacToEncryptedField,

  createDocumentMac,
  verifyDocumentMac,
};