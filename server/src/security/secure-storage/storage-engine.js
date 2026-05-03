'use strict';

/**
 * server/src/security/storage/encryptedDataStorage.js
 *
 * Feature 18 + Feature 19 storage wrapper.
 *
 * Strict encrypted DB rule:
 *   Only _id may stay readable in MongoDB.
 *   Every other value must be encrypted before saving.
 *
 * Main API:
 *   encryptSensitiveFields(modelName, data, options)
 *   decryptSensitiveFields(modelName, encryptedData, options)
 *
 * Why this file changed:
 *   In the old system, some fields like userId, role, status, attempts,
 *   dates, etc. were plaintext.
 *
 *   In the new system, those fields are encrypted too.
 *   Therefore this wrapper must not depend on plaintext userId/status/date fields.
 *
 * Required owner rule:
 *   For real user-owned records, pass options.ownerId.
 *
 * Example:
 *   await encryptSensitiveFields('USER', userData, {
 *     ownerId: userId,
 *     documentId: userId,
 *   });
 *
 *   await encryptSensitiveFields('TWO_FACTOR_CHALLENGE', challengeData, {
 *     ownerId: userId,
 *     documentId: challengeId,
 *   });
 */

const {
  encryptValue,
  decryptValue,
} = require('../field-encryption');

const {
  attachMacToEncryptedField,
  assertEncryptedFieldMacValid,
  verifyEncryptedFieldMac,
} = require('../data-integrity');

const { toIdString } = require('../../utils/serviceHelpers');

const {
  getStoragePolicy,
  getDataTypeForField,
  normalizeModelName,
} = require('./field-protection-rules');

const STORAGE_ENVELOPE_VERSION = 1;
const STORAGE_TYPE = 'ENCRYPTED_FIELD';
const MAC_ALGORITHM = 'HMAC-SHA256-LAB';

const SYSTEM_ALLOWED_MODELS = Object.freeze([
  'TEST',
]);

const isEncryptedStorageEnvelope = (value) => {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.protected === true &&
    value.storageType === STORAGE_TYPE &&
    value.encryptionType === 'DUAL_ASYMMETRIC' &&
    typeof value.ciphertext === 'string' &&
    typeof value.algorithm === 'string' &&
    typeof value.keyId === 'string'
  );
};

const clonePlainObject = (value) => {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (typeof value.toObject === 'function') {
    return value.toObject();
  }

  return JSON.parse(JSON.stringify(value));
};

// toIdString imported from ../../utils/serviceHelpers

const getDocumentId = (document, explicitDocumentId) => {
  const directDocumentId = toIdString(explicitDocumentId);

  if (directDocumentId) {
    return directDocumentId;
  }

  if (!document || typeof document !== 'object') {
    return '';
  }

  return toIdString(document._id || document.id || '');
};

const getEnvelopeOwnerId = (value) => {
  if (!isEncryptedStorageEnvelope(value)) {
    return '';
  }

  return String(
    value.ownerUserId ||
    value.metadata?.ownerId ||
    value.metadata?.userId ||
    ''
  );
};

const getEnvelopeDocumentId = (value) => {
  if (!isEncryptedStorageEnvelope(value)) {
    return '';
  }

  return String(
    value.metadata?.documentId ||
    ''
  );
};

const getOwnerIdForEncryption = (modelName, document, explicitOwnerId) => {
  const ownerId = toIdString(explicitOwnerId);

  if (ownerId) {
    return ownerId;
  }

  const documentId = getDocumentId(document);

  if (modelName === 'USER' && documentId) {
    return documentId;
  }

  if (SYSTEM_ALLOWED_MODELS.includes(modelName)) {
    return '';
  }

  throw new Error(
    `ownerId is required to encrypt ${modelName}. ` +
    'Because every field except _id is encrypted, ownerId must be passed explicitly.'
  );
};

const getOwnerIdForDecryption = (modelName, document, fieldEnvelope, explicitOwnerId) => {
  const ownerId = toIdString(explicitOwnerId);

  if (ownerId) {
    return ownerId;
  }

  const envelopeOwnerId = getEnvelopeOwnerId(fieldEnvelope);

  if (envelopeOwnerId) {
    return envelopeOwnerId;
  }

  const documentId = getDocumentId(document);

  if (modelName === 'USER' && documentId) {
    return documentId;
  }

  if (SYSTEM_ALLOWED_MODELS.includes(modelName)) {
    return '';
  }

  throw new Error(
    `ownerId is required to decrypt ${modelName}. ` +
    'The encrypted field does not contain owner metadata.'
  );
};

const buildStorageContext = ({
  modelName,
  collectionName,
  fieldName,
  ownerId,
  documentId,
}) => ({
  modelName,
  collectionName: collectionName || '',
  fieldName,
  ownerId: ownerId ? String(ownerId) : '',
  documentId: documentId ? String(documentId) : '',
});

const encryptFieldForStorage = async (value, dataType, context = {}) => {
  if (value === undefined) {
    return undefined;
  }

  if (isEncryptedStorageEnvelope(value)) {
    return value;
  }

  const encrypted = await encryptValue(value, dataType, {
    fieldName: context.fieldName,
    collectionName: context.collectionName,
    ownerId: context.ownerId,
    documentId: context.documentId,
  });

  const envelope = {
    ...encrypted,
    storageType: STORAGE_TYPE,
    storageEnvelopeVersion: STORAGE_ENVELOPE_VERSION,
    version: encrypted.keyVersion,
    macAlgorithm: MAC_ALGORITHM,
  };

  return attachMacToEncryptedField(envelope, context);
};

const decryptFieldFromStorage = async (encryptedField, context = {}) => {
  if (encryptedField === undefined) {
    return undefined;
  }

  if (encryptedField === null) {
    return null;
  }

  if (!isEncryptedStorageEnvelope(encryptedField)) {
    return encryptedField;
  }

  assertEncryptedFieldMacValid(encryptedField, context);

  return decryptValue(encryptedField);
};

const encryptSensitiveFields = async (modelName, data, options = {}) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const normalizedModelName = normalizeModelName(modelName);
  const policy = getStoragePolicy(normalizedModelName);
  const output = clonePlainObject(data);

  const ownerId = getOwnerIdForEncryption(
    normalizedModelName,
    output,
    options.ownerId || options.ownerUserId || options.userId
  );

  const documentId = getDocumentId(
    output,
    options.documentId || options.recordId
  );

  for (const [fieldName, configuredDataType] of Object.entries(policy.sensitiveFields)) {
    if (!Object.prototype.hasOwnProperty.call(output, fieldName)) {
      continue;
    }

    if (output[fieldName] === undefined) {
      continue;
    }

    const context = buildStorageContext({
      modelName: normalizedModelName,
      collectionName: options.collectionName || policy.collectionName,
      fieldName,
      ownerId,
      documentId,
    });

    const dataType = configuredDataType || getDataTypeForField(
      normalizedModelName,
      fieldName
    );

    output[fieldName] = await encryptFieldForStorage(
      output[fieldName],
      dataType,
      context
    );
  }

  return output;
};

const decryptSensitiveFields = async (modelName, encryptedData, options = {}) => {
  if (!encryptedData || typeof encryptedData !== 'object') {
    return encryptedData;
  }

  const normalizedModelName = normalizeModelName(modelName);
  const policy = getStoragePolicy(normalizedModelName);
  const output = clonePlainObject(encryptedData);

  const fallbackDocumentId = getDocumentId(
    output,
    options.documentId || options.recordId
  );

  for (const fieldName of Object.keys(policy.sensitiveFields)) {
    if (!Object.prototype.hasOwnProperty.call(output, fieldName)) {
      continue;
    }

    if (!isEncryptedStorageEnvelope(output[fieldName])) {
      continue;
    }

    const fieldEnvelope = output[fieldName];

    const ownerId = getOwnerIdForDecryption(
      normalizedModelName,
      output,
      fieldEnvelope,
      options.ownerId || options.ownerUserId || options.userId
    );

    const envelopeDocumentId = getEnvelopeDocumentId(fieldEnvelope);
    const documentId = fallbackDocumentId || envelopeDocumentId;

    const context = buildStorageContext({
      modelName: normalizedModelName,
      collectionName: options.collectionName || policy.collectionName,
      fieldName,
      ownerId,
      documentId,
    });

    output[fieldName] = await decryptFieldFromStorage(
      fieldEnvelope,
      context
    );
  }

  return output;
};

const encryptManySensitiveFields = async (modelName, records, options = {}) => {
  if (!Array.isArray(records)) {
    throw new TypeError('records must be an array');
  }

  const output = [];

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];

    output.push(
      await encryptSensitiveFields(modelName, record, {
        ...options,
        ownerId:
          typeof options.ownerIdResolver === 'function'
            ? options.ownerIdResolver(record, i)
            : options.ownerId,
        documentId:
          typeof options.documentIdResolver === 'function'
            ? options.documentIdResolver(record, i)
            : options.documentId,
      })
    );
  }

  return output;
};

const decryptManySensitiveFields = async (modelName, records, options = {}) => {
  if (!Array.isArray(records)) {
    throw new TypeError('records must be an array');
  }

  const output = [];

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];

    output.push(
      await decryptSensitiveFields(modelName, record, {
        ...options,
        ownerId:
          typeof options.ownerIdResolver === 'function'
            ? options.ownerIdResolver(record, i)
            : options.ownerId,
        documentId:
          typeof options.documentIdResolver === 'function'
            ? options.documentIdResolver(record, i)
            : options.documentId,
      })
    );
  }

  return output;
};

const verifyStorageMac = (envelope, context = {}) => {
  return verifyEncryptedFieldMac(envelope, context);
};

module.exports = {
  STORAGE_ENVELOPE_VERSION,
  STORAGE_TYPE,
  MAC_ALGORITHM,

  isEncryptedStorageEnvelope,
  buildStorageContext,

  encryptFieldForStorage,
  decryptFieldFromStorage,

  encryptSensitiveFields,
  decryptSensitiveFields,
  encryptManySensitiveFields,
  decryptManySensitiveFields,

  verifyStorageMac,
};