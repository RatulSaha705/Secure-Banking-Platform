'use strict';

/**
 * security/storage/encryptedField.js
 *
 * Field-level encryption wrapper for the secure banking project.
 *
 * This module chooses RSA or ECC based on the active key metadata returned
 * by key.service.js. Encryption/decryption is delegated only to custom RSA/ECC modules.
 *
 * Updated design:
 *   - context.ownerId is required for user-owned data.
 *   - Encryption selects the active key belonging to that specific user.
 */

const {
  getActiveKeyForDataType,
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

const {
  createFieldMac,
  verifyFieldMac,
} = require('./macRecord');

const ENCRYPTED_FIELD_MARKER = true;

const isEncryptedField = (value) => {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.protected === ENCRYPTED_FIELD_MARKER &&
    typeof value.algorithm === 'string' &&
    typeof value.keyId === 'string' &&
    typeof value.ciphertext === 'string'
  );
};

const serializePlainValue = (value) => {
  return JSON.stringify({
    type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    value,
  });
};

const deserializePlainValue = (serialized) => {
  const parsed = JSON.parse(serialized);
  return parsed.value;
};

const encryptWithAlgorithm = (algorithm, plainText, publicKey) => {
  if (algorithm === 'RSA') return rsaEncryptTextToBase64(plainText, publicKey);
  if (algorithm === 'ECC') return eccEncryptTextToBase64(plainText, publicKey);

  throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
};

const decryptWithAlgorithm = (algorithm, ciphertext, privateKey) => {
  if (algorithm === 'RSA') return rsaDecryptTextFromBase64(ciphertext, privateKey);
  if (algorithm === 'ECC') return eccDecryptTextFromBase64(ciphertext, privateKey);

  throw new Error(`Unsupported decryption algorithm: ${algorithm}`);
};

const encryptField = async (value, dataType, context = {}) => {
  if (value === undefined) return undefined;
  if (isEncryptedField(value)) return value;

  const keyRecord = await getActiveKeyForDataType(dataType, {
    ownerId: context.ownerId || context.ownerUserId || context.userId,
  });

  const plainText = serializePlainValue(value);

  const ciphertext = encryptWithAlgorithm(
    keyRecord.algorithm,
    plainText,
    keyRecord.publicKey
  );

  const envelope = {
    protected: ENCRYPTED_FIELD_MARKER,
    algorithm: keyRecord.algorithm,
    keyId: keyRecord.keyId,
    keyPurpose: keyRecord.purpose,
    ownerType: keyRecord.ownerType || 'SYSTEM',
    ownerUserId: keyRecord.ownerUserId ? String(keyRecord.ownerUserId) : '',
    version: keyRecord.version,
    ciphertext,
    macAlgorithm: 'HMAC-SHA256-LAB',
    createdAt: new Date().toISOString(),
  };

  envelope.mac = createFieldMac(envelope, context);

  return envelope;
};

const decryptField = async (encryptedField, context = {}) => {
  if (encryptedField === undefined) return undefined;
  if (encryptedField === null) return null;

  if (!isEncryptedField(encryptedField)) {
    return encryptedField;
  }

  const macIsValid = verifyFieldMac(encryptedField, context);
  if (!macIsValid) {
    throw new Error(
      `Encrypted field MAC verification failed for field ${context.fieldName || 'unknown'}`
    );
  }

  const keyRecord = await getKeyRecordById(encryptedField.keyId);

  const envelopeOwnerId = encryptedField.ownerUserId || '';
  const keyOwnerId = keyRecord.ownerUserId ? String(keyRecord.ownerUserId) : '';

  if (envelopeOwnerId && keyOwnerId && envelopeOwnerId !== keyOwnerId) {
    throw new Error(
      `Encrypted field owner mismatch. Envelope owner=${envelopeOwnerId}, key owner=${keyOwnerId}`
    );
  }

  const privateKey = getPrivateKeyForRecord(keyRecord);

  const plainText = decryptWithAlgorithm(
    encryptedField.algorithm,
    encryptedField.ciphertext,
    privateKey
  );

  return deserializePlainValue(plainText);
};

module.exports = {
  ENCRYPTED_FIELD_MARKER,
  isEncryptedField,
  serializePlainValue,
  deserializePlainValue,
  encryptField,
  decryptField,
};