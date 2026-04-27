'use strict';

/**
 * server/src/security/storage/storagePolicy.js
 *
 * Feature 18: Encrypted Data Storage Policy
 *
 * This file decides which fields are sensitive for each model.
 * Controllers/services should not manually choose fields every time.
 */

const MODEL_STORAGE_POLICIES = Object.freeze({
  USER: {
    modelName: 'USER',
    collectionName: 'users',
    defaultDataType: 'USER_REGISTRATION',
    sensitiveFields: {
      username: 'USER_REGISTRATION',
      email: 'USER_REGISTRATION',
      contact: 'USER_REGISTRATION',
      phone: 'USER_REGISTRATION',
      fullName: 'USER_PROFILE',
      address: 'USER_PROFILE',
      dateOfBirth: 'USER_PROFILE',
      nid: 'USER_PROFILE',
    },
  },

  PROFILE: {
    modelName: 'PROFILE',
    collectionName: 'profiles',
    defaultDataType: 'USER_PROFILE',
    sensitiveFields: {
      username: 'USER_PROFILE',
      email: 'USER_PROFILE',
      contact: 'USER_PROFILE',
      phone: 'USER_PROFILE',
      fullName: 'USER_PROFILE',
      address: 'USER_PROFILE',
      dateOfBirth: 'USER_PROFILE',
      nid: 'USER_PROFILE',
    },
  },

  ACCOUNT: {
    modelName: 'ACCOUNT',
    collectionName: 'accounts',
    defaultDataType: 'ACCOUNT_DETAILS',
    sensitiveFields: {
      accountNumber: 'ACCOUNT_DETAILS',
      accountType: 'ACCOUNT_DETAILS',
      accountStatus: 'ACCOUNT_DETAILS',
      balance: 'ACCOUNT_DETAILS',
      branchName: 'ACCOUNT_DETAILS',
      routingNumber: 'ACCOUNT_DETAILS',
    },
  },

  BENEFICIARY: {
    modelName: 'BENEFICIARY',
    collectionName: 'beneficiaries',
    defaultDataType: 'BENEFICIARY_DATA',
    sensitiveFields: {
      beneficiaryName: 'BENEFICIARY_DATA',
      beneficiaryEmail: 'BENEFICIARY_DATA',
      beneficiaryPhone: 'BENEFICIARY_DATA',
      beneficiaryAccountNumber: 'BENEFICIARY_DATA',
      beneficiaryBankName: 'BENEFICIARY_DATA',
      nickname: 'BENEFICIARY_DATA',
    },
  },

  TRANSACTION: {
    modelName: 'TRANSACTION',
    collectionName: 'transactions',
    defaultDataType: 'TRANSACTION_DATA',
    sensitiveFields: {
      fromAccount: 'TRANSACTION_DATA',
      toAccount: 'TRANSACTION_DATA',
      amount: 'TRANSACTION_DATA',
      description: 'TRANSACTION_DATA',
      reference: 'TRANSACTION_DATA',
      receiverName: 'TRANSACTION_DATA',
      receiverBank: 'TRANSACTION_DATA',
    },
  },

  SUPPORT_TICKET: {
    modelName: 'SUPPORT_TICKET',
    collectionName: 'supporttickets',
    defaultDataType: 'SUPPORT_TICKET',
    sensitiveFields: {
      title: 'SUPPORT_TICKET',
      message: 'SUPPORT_TICKET',
      description: 'SUPPORT_TICKET',
      reply: 'TICKET_COMMENT',
      comments: 'TICKET_COMMENT',
    },
  },

  NOTIFICATION: {
    modelName: 'NOTIFICATION',
    collectionName: 'notifications',
    defaultDataType: 'NOTIFICATION',
    sensitiveFields: {
      title: 'NOTIFICATION',
      message: 'NOTIFICATION',
      body: 'NOTIFICATION',
    },
  },
});

const MODEL_ALIASES = Object.freeze({
  USER: 'USER',
  USERS: 'USER',
  AUTH: 'USER',
  REGISTRATION: 'USER',

  PROFILE: 'PROFILE',
  PROFILES: 'PROFILE',

  ACCOUNT: 'ACCOUNT',
  ACCOUNTS: 'ACCOUNT',
  ACCOUNT_DETAILS: 'ACCOUNT',

  BENEFICIARY: 'BENEFICIARY',
  BENEFICIARIES: 'BENEFICIARY',

  TRANSACTION: 'TRANSACTION',
  TRANSACTIONS: 'TRANSACTION',
  TRANSFER: 'TRANSACTION',
  TRANSFERS: 'TRANSACTION',

  SUPPORT_TICKET: 'SUPPORT_TICKET',
  SUPPORTTICKET: 'SUPPORT_TICKET',
  SUPPORT_TICKETS: 'SUPPORT_TICKET',
  TICKET: 'SUPPORT_TICKET',
  TICKETS: 'SUPPORT_TICKET',
  POST: 'SUPPORT_TICKET',
  POSTS: 'SUPPORT_TICKET',

  NOTIFICATION: 'NOTIFICATION',
  NOTIFICATIONS: 'NOTIFICATION',
  ALERT: 'NOTIFICATION',
  ALERTS: 'NOTIFICATION',
});

const normalizeModelName = (modelName) => {
  const key = String(modelName || '').trim().toUpperCase();

  if (!key) {
    throw new Error('modelName is required for encrypted storage');
  }

  const normalized = MODEL_ALIASES[key];

  if (!normalized || !MODEL_STORAGE_POLICIES[normalized]) {
    throw new Error(`No encrypted storage policy found for model: ${modelName}`);
  }

  return normalized;
};

const getStoragePolicy = (modelName) => {
  const normalized = normalizeModelName(modelName);
  return MODEL_STORAGE_POLICIES[normalized];
};

const getSensitiveFields = (modelName) => {
  return Object.keys(getStoragePolicy(modelName).sensitiveFields);
};

const getDataTypeForField = (modelName, fieldName) => {
  const policy = getStoragePolicy(modelName);
  return policy.sensitiveFields[fieldName] || policy.defaultDataType;
};

const getPolicySummary = () => {
  return Object.values(MODEL_STORAGE_POLICIES).map((policy) => ({
    modelName: policy.modelName,
    collectionName: policy.collectionName,
    defaultDataType: policy.defaultDataType,
    sensitiveFields: Object.keys(policy.sensitiveFields),
  }));
};

module.exports = {
  MODEL_STORAGE_POLICIES,
  MODEL_ALIASES,
  normalizeModelName,
  getStoragePolicy,
  getSensitiveFields,
  getDataTypeForField,
  getPolicySummary,
};