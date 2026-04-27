'use strict';

/**
 * server/src/security/encryption/dualAsymmetricEncryption.js
 *
 * Feature 20: Dual Asymmetric Encryption Module
 *
 * This module is the central encryption/decryption service for the project.
 * It enforces the required RSA/ECC split from encryptionPolicy.js.
 *
* It uses only your custom RSA and ECC modules for encryption/decryption.
* It does not call built-in encryption/decryption functions.
 */

const {
  getEncryptionPolicy,
  assertAllowedAlgorithmForDataType,
} = require('./encryptionPolicy');

const {
  getActiveKeyRecord,
  getKeyRecordById,
  getPrivateKeyForRecord,
} = require('../keys/key.service');

const {
  encryptTextToBase64: rsaEncryptTextToBase64,
} = require('../rsa/rsa.encrypt');

const {
  decryptTextFromBase64: rsaDecryptTextFromBase64,
} = require('../rsa/rsa.decrypt');

const {
  encryptTextToBase64: eccEncryptTextToBase64,
} = require('../ecc/ecc.encrypt');

const {
  decryptTextFromBase64: eccDecryptTextFromBase64,
} = require('../ecc/ecc.decrypt');

const ENVELOPE_VERSION = 1;

const isDualAsymmetricEnvelope = (value) => {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.protected === true &&
    value.encryptionType === 'DUAL_ASYMMETRIC' &&
    typeof value.algorithm === 'string' &&
    typeof value.keyId === 'string' &&
    typeof value.ciphertext === 'string'
  );
};

const serializePlainValue = (value) => {
  return JSON.stringify({
    valueType: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    value,
  });
};

const deserializePlainValue = (serialized) => {
  const parsed = JSON.parse(serialized);
  return parsed.value;
};

const encryptTextByAlgorithm = (algorithm, plainText, publicKey) => {
  if (algorithm === 'RSA') {
    return rsaEncryptTextToBase64(plainText, publicKey);
  }

  if (algorithm === 'ECC') {
    return eccEncryptTextToBase64(plainText, publicKey);
  }

  throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
};

const decryptTextByAlgorithm = (algorithm, ciphertext, privateKey) => {
  if (algorithm === 'RSA') {
    return rsaDecryptTextFromBase64(ciphertext, privateKey);
  }

  if (algorithm === 'ECC') {
    return eccDecryptTextFromBase64(ciphertext, privateKey);
  }

  throw new Error(`Unsupported decryption algorithm: ${algorithm}`);
};

const encryptValue = async (value, dataType, metadata = {}) => {
  if (value === undefined) return undefined;
  if (isDualAsymmetricEnvelope(value)) return value;

  const policy = getEncryptionPolicy(dataType);

  const keyRecord = await getActiveKeyRecord({
    algorithm: policy.algorithm,
    purpose: policy.keyPurpose,
  });

  if (!keyRecord) {
    throw new Error(
      `No ACTIVE ${policy.algorithm} key found for ${policy.keyPurpose}. ` +
      'Run the key initialization script first.'
    );
  }

  assertAllowedAlgorithmForDataType(policy.dataType, keyRecord.algorithm);

  const serializedValue = serializePlainValue(value);
  const ciphertext = encryptTextByAlgorithm(
    policy.algorithm,
    serializedValue,
    keyRecord.publicKey
  );

  return {
    protected: true,
    encryptionType: 'DUAL_ASYMMETRIC',
    envelopeVersion: ENVELOPE_VERSION,

    dataType: policy.dataType,
    algorithm: policy.algorithm,
    keyPurpose: policy.keyPurpose,
    keyId: keyRecord.keyId,
    keyVersion: keyRecord.version,

    ciphertext,
    ciphertextEncoding: 'base64-json-envelope',

    metadata: {
      fieldName: metadata.fieldName || '',
      collectionName: metadata.collectionName || '',
      ownerId: metadata.ownerId ? String(metadata.ownerId) : '',
      documentId: metadata.documentId ? String(metadata.documentId) : '',
    },

    createdAt: new Date().toISOString(),
  };
};

const decryptValue = async (encryptedEnvelope) => {
  if (encryptedEnvelope === undefined) return undefined;
  if (encryptedEnvelope === null) return null;

  if (!isDualAsymmetricEnvelope(encryptedEnvelope)) {
    return encryptedEnvelope;
  }

  const policy = getEncryptionPolicy(encryptedEnvelope.dataType);
  assertAllowedAlgorithmForDataType(policy.dataType, encryptedEnvelope.algorithm);

  const keyRecord = await getKeyRecordById(encryptedEnvelope.keyId);

  if (keyRecord.algorithm !== encryptedEnvelope.algorithm) {
    throw new Error(
      `Key algorithm mismatch. Envelope=${encryptedEnvelope.algorithm}, key=${keyRecord.algorithm}`
    );
  }

  if (keyRecord.purpose !== encryptedEnvelope.keyPurpose) {
    throw new Error(
      `Key purpose mismatch. Envelope=${encryptedEnvelope.keyPurpose}, key=${keyRecord.purpose}`
    );
  }

  const privateKey = getPrivateKeyForRecord(keyRecord);
  const serializedValue = decryptTextByAlgorithm(
    encryptedEnvelope.algorithm,
    encryptedEnvelope.ciphertext,
    privateKey
  );

  return deserializePlainValue(serializedValue);
};

const encryptObjectFields = async (objectInput, fields, dataType, metadata = {}) => {
  if (!objectInput || typeof objectInput !== 'object') return objectInput;
  if (!Array.isArray(fields)) throw new TypeError('fields must be an array');

  const output = { ...objectInput };

  for (const fieldName of fields) {
    if (!Object.prototype.hasOwnProperty.call(output, fieldName)) continue;
    if (output[fieldName] === undefined) continue;

    output[fieldName] = await encryptValue(output[fieldName], dataType, {
      ...metadata,
      fieldName,
    });
  }

  return output;
};

const decryptObjectFields = async (objectInput, fields) => {
  if (!objectInput || typeof objectInput !== 'object') return objectInput;
  if (!Array.isArray(fields)) throw new TypeError('fields must be an array');

  const output = { ...objectInput };

  for (const fieldName of fields) {
    if (!Object.prototype.hasOwnProperty.call(output, fieldName)) continue;
    if (!isDualAsymmetricEnvelope(output[fieldName])) continue;

    output[fieldName] = await decryptValue(output[fieldName]);
  }

  return output;
};

module.exports = {
  ENVELOPE_VERSION,
  isDualAsymmetricEnvelope,
  serializePlainValue,
  deserializePlainValue,
  encryptTextByAlgorithm,
  decryptTextByAlgorithm,
  encryptValue,
  decryptValue,
  encryptObjectFields,
  decryptObjectFields,
};