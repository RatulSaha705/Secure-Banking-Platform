'use strict';

/**
 * server/src/security/integrity/mac.service.js
 *
 * Integrity Verification using CBC-MAC (AES-128-CBC).
 *
 * Replaces the old HMAC-SHA256-based MAC service.
 * Uses cbcMac.js which calls Node's built-in crypto.createCipheriv.
 *
 * The MAC key is derived from the SECURITY_MAC_MASTER_KEY env variable
 * using SHA-256 (built-in), taking the first 16 bytes as an AES-128 key.
 *
 * Public API (unchanged from previous version):
 *   createEncryptedFieldMac(envelope, context)
 *   verifyEncryptedFieldMac(envelope, context)
 *   assertEncryptedFieldMacValid(envelope, context)
 *   attachMacToEncryptedField(envelope, context)
 *   createDocumentMac(document, context)
 *   verifyDocumentMac(document, expectedMac, context)
 */

const {
  createCbcMac,
  verifyCbcMac,
  cbcMacHex,
  deriveCbcMacKey,
  timingSafeEqualHex,
} = require('./cbc-mac-engine');

const {
  MAC_ALGORITHM,
  MAC_VERSION,
  MAC_ENV_NAMES,
  normalizeMacContext,
  validateMacContext,
  validateEnvelopeForMac,
} = require('./integrity-rules');

// ── Key resolution ─────────────────────────────────────────────────────────────

const getMacMasterKey = () => {
  for (const envName of MAC_ENV_NAMES) {
    if (process.env[envName]) return process.env[envName];
  }

  throw new Error(
    'Missing MAC master key. Add SECURITY_MAC_MASTER_KEY to server/.env.'
  );
};

// ── Stable serialization for document-level MAC ───────────────────────────────

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

// ── Field-level MAC ───────────────────────────────────────────────────────────

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
  return createCbcMac(
    getMacMasterKey(),
    buildEncryptedFieldMacParts(envelope, context)
  );
};

const verifyEncryptedFieldMac = (envelope, context = {}) => {
  if (!envelope || typeof envelope !== 'object') return false;
  if (!envelope.mac || typeof envelope.mac !== 'string') return false;

  return verifyCbcMac(
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

// ── Document-level MAC ────────────────────────────────────────────────────────

const createDocumentMac = (document, context = {}) => {
  const normalizedContext = normalizeMacContext(context);
  const masterKey = getMacMasterKey();
  const aesKey = deriveCbcMacKey(masterKey);

  const message = stableStringify({
    macVersion: MAC_VERSION,
    modelName: normalizedContext.modelName,
    collectionName: normalizedContext.collectionName,
    ownerId: normalizedContext.ownerId,
    documentId: normalizedContext.documentId,
    data: document,
  });

  return cbcMacHex(aesKey, message);
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