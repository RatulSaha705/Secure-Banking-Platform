'use strict';

/**
 * server/src/security/encryption/encryptionPolicy.js
 *
 * Feature 20: Dual Asymmetric Encryption Policy
 *
 * This file is the single place where your project decides:
 *   - which data type uses RSA
 *   - which data type uses ECC
 */

const ALGORITHMS = Object.freeze({
  RSA: 'RSA',
  ECC: 'ECC',
});

const DATA_TYPES = Object.freeze({
  USER_REGISTRATION: 'USER_REGISTRATION',
  USER_PROFILE: 'USER_PROFILE',
  ACCOUNT_DETAILS: 'ACCOUNT_DETAILS',
  BENEFICIARY_DATA: 'BENEFICIARY_DATA',
  TRANSACTION_DATA: 'TRANSACTION_DATA',
  SUPPORT_TICKET: 'SUPPORT_TICKET',
  TICKET_COMMENT: 'TICKET_COMMENT',
  NOTIFICATION: 'NOTIFICATION',
  TEST_RSA: 'TEST_RSA',
  TEST_ECC: 'TEST_ECC',
});

const ENCRYPTION_POLICY = Object.freeze({
  [DATA_TYPES.USER_REGISTRATION]: {
    algorithm: ALGORITHMS.RSA,
    keyPurpose: 'USER_PROFILE',
    description: 'Registration fields such as username, email, and contact info',
  },

  [DATA_TYPES.USER_PROFILE]: {
    algorithm: ALGORITHMS.RSA,
    keyPurpose: 'USER_PROFILE',
    description: 'Profile fields such as full name, phone, address, and contact info',
  },

  [DATA_TYPES.ACCOUNT_DETAILS]: {
    algorithm: ALGORITHMS.RSA,
    keyPurpose: 'ACCOUNT_DATA',
    description: 'Account number, account type, status, and balance-related data',
  },

  [DATA_TYPES.BENEFICIARY_DATA]: {
    algorithm: ALGORITHMS.RSA,
    keyPurpose: 'BENEFICIARY_DATA',
    description: 'Saved beneficiary details for repeat transfers',
  },

  [DATA_TYPES.TRANSACTION_DATA]: {
    algorithm: ALGORITHMS.RSA,
    keyPurpose: 'TRANSACTION_DATA',
    description: 'Sensitive transaction and transfer records',
  },

  [DATA_TYPES.SUPPORT_TICKET]: {
    algorithm: ALGORITHMS.ECC,
    keyPurpose: 'SUPPORT_TICKET',
    description: 'Support ticket content used as the post-equivalent feature',
  },

  [DATA_TYPES.TICKET_COMMENT]: {
    algorithm: ALGORITHMS.ECC,
    keyPurpose: 'SUPPORT_TICKET',
    description: 'Support ticket comments or replies',
  },

  [DATA_TYPES.NOTIFICATION]: {
    algorithm: ALGORITHMS.ECC,
    keyPurpose: 'NOTIFICATION',
    description: 'Sensitive notification and alert body text',
  },

  [DATA_TYPES.TEST_RSA]: {
    algorithm: ALGORITHMS.RSA,
    keyPurpose: 'TEST',
    description: 'RSA test data',
  },

  [DATA_TYPES.TEST_ECC]: {
    algorithm: ALGORITHMS.ECC,
    keyPurpose: 'TEST',
    description: 'ECC test data',
  },
});

const DATA_TYPE_ALIASES = Object.freeze({
  USER: DATA_TYPES.USER_REGISTRATION,
  REGISTRATION: DATA_TYPES.USER_REGISTRATION,
  USER_REGISTRATION: DATA_TYPES.USER_REGISTRATION,

  PROFILE: DATA_TYPES.USER_PROFILE,
  USER_PROFILE: DATA_TYPES.USER_PROFILE,

  ACCOUNT: DATA_TYPES.ACCOUNT_DETAILS,
  ACCOUNT_DATA: DATA_TYPES.ACCOUNT_DETAILS,
  ACCOUNT_DETAILS: DATA_TYPES.ACCOUNT_DETAILS,
  BALANCE: DATA_TYPES.ACCOUNT_DETAILS,

  BENEFICIARY: DATA_TYPES.BENEFICIARY_DATA,
  BENEFICIARY_DATA: DATA_TYPES.BENEFICIARY_DATA,

  TRANSACTION: DATA_TYPES.TRANSACTION_DATA,
  TRANSACTION_DATA: DATA_TYPES.TRANSACTION_DATA,
  TRANSFER: DATA_TYPES.TRANSACTION_DATA,

  SUPPORT_TICKET: DATA_TYPES.SUPPORT_TICKET,
  TICKET: DATA_TYPES.SUPPORT_TICKET,
  POST: DATA_TYPES.SUPPORT_TICKET,

  TICKET_COMMENT: DATA_TYPES.TICKET_COMMENT,
  COMMENT: DATA_TYPES.TICKET_COMMENT,

  NOTIFICATION: DATA_TYPES.NOTIFICATION,
  ALERT: DATA_TYPES.NOTIFICATION,

  TEST_RSA: DATA_TYPES.TEST_RSA,
  TEST_ECC: DATA_TYPES.TEST_ECC,
});

const normalizeDataType = (dataType) => {
  const key = String(dataType || '').trim().toUpperCase();

  if (!key) {
    throw new Error('dataType is required for encryption');
  }

  const normalized = DATA_TYPE_ALIASES[key];

  if (!normalized) {
    throw new Error(`No dual-asymmetric encryption policy found for data type: ${dataType}`);
  }

  return normalized;
};

const getEncryptionPolicy = (dataType) => {
  const normalized = normalizeDataType(dataType);
  return {
    dataType: normalized,
    ...ENCRYPTION_POLICY[normalized],
  };
};

const getAlgorithmForDataType = (dataType) => {
  return getEncryptionPolicy(dataType).algorithm;
};

const getKeyPurposeForDataType = (dataType) => {
  return getEncryptionPolicy(dataType).keyPurpose;
};

const assertAllowedAlgorithmForDataType = (dataType, algorithm) => {
  const policy = getEncryptionPolicy(dataType);
  const actualAlgorithm = String(algorithm || '').trim().toUpperCase();

  if (policy.algorithm !== actualAlgorithm) {
    throw new Error(
      `Invalid algorithm for ${policy.dataType}. ` +
      `Expected ${policy.algorithm}, received ${algorithm}.`
    );
  }

  return true;
};

const getPolicySummary = () => {
  return Object.entries(ENCRYPTION_POLICY).map(([dataType, policy]) => ({
    dataType,
    algorithm: policy.algorithm,
    keyPurpose: policy.keyPurpose,
    description: policy.description,
  }));
};

module.exports = {
  ALGORITHMS,
  DATA_TYPES,
  ENCRYPTION_POLICY,
  DATA_TYPE_ALIASES,
  normalizeDataType,
  getEncryptionPolicy,
  getAlgorithmForDataType,
  getKeyPurposeForDataType,
  assertAllowedAlgorithmForDataType,
  getPolicySummary,
};