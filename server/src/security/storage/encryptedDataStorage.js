'use strict';

/**
 * server/src/security/storage/encryptedDataStorage.js
 *
 * Feature 18: Encrypted Data Storage Module
 *
 * Main reusable API:
 *   encryptSensitiveFields(modelName, data, options)
 *   decryptSensitiveFields(modelName, encryptedData, options)
 */

const {
  encryptValue,
  decryptValue,
} = require('../encryption');

const {
  createRecordMac,
  verifyRecordMac,
} = require('../hash/hmac');

const {
  getStoragePolicy,
  getDataTypeForField,
  normalizeModelName,
} = require('./storagePolicy');

const STORAGE_ENVELOPE_VERSION = 1;
const STORAGE_TYPE = 'ENCRYPTED_FIELD';
const MAC_ALGORITHM = 'HMAC-SHA256-LAB';

const MAC_ENV_NAMES = Object.freeze([
  'SECURITY_MAC_MASTER_KEY',
  'HMAC_MASTER_KEY',
]);

const getMacMasterKey = () => {
  for (const envName of MAC_ENV_NAMES) {
    if (process.env[envName]) return process.env[envName];
  }

  throw new Error(
    'Missing MAC master key. Add SECURITY_MAC_MASTER_KEY to server/.env.'
  );
};

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
  if (!value || typeof value !== 'object') return value;

  if (typeof value.toObject === 'function') {
    return value.toObject();
  }

  return JSON.parse(JSON.stringify(value));
};

const getDocumentId = (document, explicitDocumentId) => {
  if (explicitDocumentId) return String(explicitDocumentId);
  if (!document || typeof document !== 'object') return '';

  return String(document._id || document.id || '');
};

const getOwnerId = (document, explicitOwnerId) => {
  if (explicitOwnerId) return String(explicitOwnerId);
  if (!document || typeof document !== 'object') return '';

  return String(
    document.ownerId ||
    document.userId ||
    document.createdBy ||
    document._id ||
    ''
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

const buildMacParts = (envelope, context = {}) => [
  'encrypted-storage-field-v1',
  context.modelName || '',
  context.collectionName || '',
  context.fieldName || '',
  context.ownerId || '',
  context.documentId || '',
  envelope.dataType || '',
  envelope.algorithm || '',
  envelope.keyPurpose || '',
  envelope.keyId || '',
  envelope.version || '',
  envelope.ciphertext || '',
  envelope.createdAt || '',
];

const createStorageMac = (envelope, context = {}) => {
  return createRecordMac(getMacMasterKey(), buildMacParts(envelope, context));
};

const verifyStorageMac = (envelope, context = {}) => {
  if (!envelope || typeof envelope !== 'object') return false;
  if (!envelope.mac) return false;

  return verifyRecordMac(
    getMacMasterKey(),
    buildMacParts(envelope, context),
    envelope.mac
  );
};

const encryptFieldForStorage = async (value, dataType, context = {}) => {
  if (value === undefined) return undefined;
  if (isEncryptedStorageEnvelope(value)) return value;

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

    // Required project-style field name:
    version: encrypted.keyVersion,

    macAlgorithm: MAC_ALGORITHM,
  };

  envelope.mac = createStorageMac(envelope, context);

  return envelope;
};

const decryptFieldFromStorage = async (encryptedField, context = {}) => {
  if (encryptedField === undefined) return undefined;
  if (encryptedField === null) return null;

  if (!isEncryptedStorageEnvelope(encryptedField)) {
    return encryptedField;
  }

  const isValid = verifyStorageMac(encryptedField, context);

  if (!isValid) {
    throw new Error(
      `Encrypted storage MAC verification failed for ${context.modelName || 'model'}.${context.fieldName || 'field'}`
    );
  }

  return decryptValue(encryptedField);
};

const encryptSensitiveFields = async (modelName, data, options = {}) => {
  if (!data || typeof data !== 'object') return data;

  const normalizedModelName = normalizeModelName(modelName);
  const policy = getStoragePolicy(normalizedModelName);
  const output = clonePlainObject(data);
  const ownerId = getOwnerId(output, options.ownerId);
  const documentId = getDocumentId(output, options.documentId);

  for (const [fieldName, dataType] of Object.entries(policy.sensitiveFields)) {
    if (!Object.prototype.hasOwnProperty.call(output, fieldName)) continue;
    if (output[fieldName] === undefined) continue;

    const context = buildStorageContext({
      modelName: normalizedModelName,
      collectionName: options.collectionName || policy.collectionName,
      fieldName,
      ownerId,
      documentId,
    });

    output[fieldName] = await encryptFieldForStorage(
      output[fieldName],
      dataType || getDataTypeForField(normalizedModelName, fieldName),
      context
    );
  }

  return output;
};

const decryptSensitiveFields = async (modelName, encryptedData, options = {}) => {
  if (!encryptedData || typeof encryptedData !== 'object') return encryptedData;

  const normalizedModelName = normalizeModelName(modelName);
  const policy = getStoragePolicy(normalizedModelName);
  const output = clonePlainObject(encryptedData);
  const ownerId = getOwnerId(output, options.ownerId);
  const documentId = getDocumentId(output, options.documentId);

  for (const fieldName of Object.keys(policy.sensitiveFields)) {
    if (!Object.prototype.hasOwnProperty.call(output, fieldName)) continue;
    if (!isEncryptedStorageEnvelope(output[fieldName])) continue;

    const context = buildStorageContext({
      modelName: normalizedModelName,
      collectionName: options.collectionName || policy.collectionName,
      fieldName,
      ownerId,
      documentId,
    });

    output[fieldName] = await decryptFieldFromStorage(output[fieldName], context);
  }

  return output;
};

const encryptManySensitiveFields = async (modelName, records, options = {}) => {
  if (!Array.isArray(records)) {
    throw new TypeError('records must be an array');
  }

  const output = [];

  for (const record of records) {
    output.push(await encryptSensitiveFields(modelName, record, options));
  }

  return output;
};

const decryptManySensitiveFields = async (modelName, records, options = {}) => {
  if (!Array.isArray(records)) {
    throw new TypeError('records must be an array');
  }

  const output = [];

  for (const record of records) {
    output.push(await decryptSensitiveFields(modelName, record, options));
  }

  return output;
};

module.exports = {
  STORAGE_ENVELOPE_VERSION,
  STORAGE_TYPE,
  MAC_ALGORITHM,
  MAC_ENV_NAMES,

  isEncryptedStorageEnvelope,
  buildStorageContext,
  buildMacParts,
  createStorageMac,
  verifyStorageMac,

  encryptFieldForStorage,
  decryptFieldFromStorage,

  encryptSensitiveFields,
  decryptSensitiveFields,
  encryptManySensitiveFields,
  decryptManySensitiveFields,
};