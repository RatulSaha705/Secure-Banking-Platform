'use strict';

/**
 * ============================================================================
 * CONTRIBUTION: Secure Storage Layer — Document Encryptor (Sifat)
 * ============================================================================
 *
 * Security Feature : ✔ Data Integrity (MAC) + Secure Storage
 * Responsibility   : Secure Storage Layer — Document-level encryption
 *
 * This module provides a higher-level API for encrypting and decrypting
 * entire documents by document type (USER, ACCOUNT, BENEFICIARY, etc.).
 * It defines per-model security policies that list which fields must be
 * encrypted.
 *
 * Key contributions in this file:
 *   1. DEFAULT_SECURITY_POLICY       — Maps each document type to its data
 *                                       classification and list of sensitive
 *                                       fields (e.g., USER → username, email,
 *                                       fullName, dateOfBirth, nid).
 *   2. encryptDocumentFields()       — Encrypts all policy-listed fields in
 *                                       a single document, skipping already-
 *                                       encrypted fields.
 *   3. decryptDocumentFields()       — Decrypts all encrypted fields in a
 *                                       document, verifying MAC on each field.
 *   4. encryptManyDocuments()        — Batch encryption for document arrays.
 *   5. decryptManyDocuments()        — Batch decryption for document arrays.
 *   6. buildFieldContext()           — Constructs the context object (owner,
 *                                       documentId, collection) needed by the
 *                                       MAC and encryption layers.
 * ============================================================================
 */

/**
 * security/storage/encryptedDocument.js
 *
 * Document-level helper for encrypting/decrypting selected sensitive fields.
 *
 * It prevents every controller from manually encrypting individual fields.
 * Later, your auth/profile/ticket/account services can call this module
 * before saving to MongoDB and after reading from MongoDB.
 */

const {
  encryptField,
  decryptField,
  isEncryptedField,
} = require('./field-encryptor');

const DEFAULT_SECURITY_POLICY = Object.freeze({
  USER: {
    dataType: 'USER_PROFILE',
    fields: [
      'username',
      'email',
      'contact',
      'phone',
      'fullName',
      'address',
      'dateOfBirth',
      'nid',
    ],
  },

  PROFILE: {
    dataType: 'USER_PROFILE',
    fields: [
      'username',
      'email',
      'contact',
      'phone',
      'fullName',
      'address',
      'dateOfBirth',
      'nid',
    ],
  },

  ACCOUNT: {
    dataType: 'ACCOUNT_DETAILS',
    fields: [
      'accountNumber',
      'accountType',
      'accountStatus',
      'balance',
      'branchName',
      'routingNumber',
    ],
  },

  BENEFICIARY: {
    dataType: 'BENEFICIARY',
    fields: [
      'beneficiaryName',
      'beneficiaryEmail',
      'beneficiaryPhone',
      'beneficiaryAccountNumber',
      'beneficiaryBankName',
      'nickname',
    ],
  },

  TRANSACTION: {
    dataType: 'TRANSACTION',
    fields: [
      'fromAccount',
      'toAccount',
      'amount',
      'description',
      'reference',
      'receiverName',
      'receiverBank',
    ],
  },

  SUPPORT_TICKET: {
    dataType: 'SUPPORT_TICKET',
    fields: [
      'title',
      'message',
      'description',
      'reply',
      'comments',
    ],
  },

  NOTIFICATION: {
    dataType: 'NOTIFICATION',
    fields: [
      'title',
      'message',
      'body',
    ],
  },
});

const normalizeDocumentType = (documentType) => {
  const normalized = String(documentType || '').trim().toUpperCase();

  if (!DEFAULT_SECURITY_POLICY[normalized]) {
    throw new Error(`No encrypted document policy found for type: ${documentType}`);
  }

  return normalized;
};

const clonePlainObject = (value) => {
  if (!value || typeof value !== 'object') return value;

  if (typeof value.toObject === 'function') {
    return value.toObject();
  }

  return JSON.parse(JSON.stringify(value));
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

const buildFieldContext = ({
  documentType,
  collectionName,
  ownerId,
  documentId,
  fieldName,
}) => ({
  documentType,
  collectionName: collectionName || documentType.toLowerCase(),
  ownerId: ownerId ? String(ownerId) : '',
  documentId: documentId ? String(documentId) : '',
  fieldName,
});

const encryptDocumentFields = async (documentInput, documentType, options = {}) => {
  if (!documentInput || typeof documentInput !== 'object') return documentInput;

  const normalizedType = normalizeDocumentType(documentType);
  const policy = DEFAULT_SECURITY_POLICY[normalizedType];
  const document = clonePlainObject(documentInput);
  const ownerId = getOwnerId(document, options.ownerId);
  const documentId = options.documentId || document._id || '';

  for (const fieldName of policy.fields) {
    if (!Object.prototype.hasOwnProperty.call(document, fieldName)) continue;
    if (document[fieldName] === undefined) continue;
    if (isEncryptedField(document[fieldName])) continue;

    const context = buildFieldContext({
      documentType: normalizedType,
      collectionName: options.collectionName,
      ownerId,
      documentId,
      fieldName,
    });

    document[fieldName] = await encryptField(document[fieldName], policy.dataType, context);
  }

  return document;
};

const decryptDocumentFields = async (documentInput, documentType, options = {}) => {
  if (!documentInput || typeof documentInput !== 'object') return documentInput;

  const normalizedType = normalizeDocumentType(documentType);
  const policy = DEFAULT_SECURITY_POLICY[normalizedType];
  const document = clonePlainObject(documentInput);
  const ownerId = getOwnerId(document, options.ownerId);
  const documentId = options.documentId || document._id || '';

  for (const fieldName of policy.fields) {
    if (!Object.prototype.hasOwnProperty.call(document, fieldName)) continue;
    if (!isEncryptedField(document[fieldName])) continue;

    const context = buildFieldContext({
      documentType: normalizedType,
      collectionName: options.collectionName,
      ownerId,
      documentId,
      fieldName,
    });

    document[fieldName] = await decryptField(document[fieldName], context);
  }

  return document;
};

const encryptManyDocuments = async (documents, documentType, options = {}) => {
  if (!Array.isArray(documents)) {
    throw new TypeError('documents must be an array');
  }

  const output = [];
  for (const document of documents) {
    output.push(await encryptDocumentFields(document, documentType, options));
  }

  return output;
};

const decryptManyDocuments = async (documents, documentType, options = {}) => {
  if (!Array.isArray(documents)) {
    throw new TypeError('documents must be an array');
  }

  const output = [];
  for (const document of documents) {
    output.push(await decryptDocumentFields(document, documentType, options));
  }

  return output;
};

module.exports = {
  DEFAULT_SECURITY_POLICY,
  normalizeDocumentType,
  buildFieldContext,
  encryptDocumentFields,
  decryptDocumentFields,
  encryptManyDocuments,
  decryptManyDocuments,
};