'use strict';

/**
 * server/src/security/storage/storagePolicy.js
 *
 * Strict encrypted DB storage policy.
 *
 * Rule:
 *   Only MongoDB _id is allowed to remain readable.
 *   Every other stored value must be encrypted before saving.
 *
 * Important:
 *   This file only defines WHAT must be encrypted.
 *   Services must call encryptSensitiveFields/decryptSensitiveFields before save/read.
 */

const MODEL_STORAGE_POLICIES = Object.freeze({
  USER: {
    modelName: 'USER',
    collectionName: 'users',
    defaultDataType: 'USER_PROFILE',
    sensitiveFields: {
      passwordHash: 'USER_PROFILE',
      passwordSalt: 'USER_PROFILE',
      passwordIterations: 'USER_PROFILE',
      passwordHashAlgorithm: 'USER_PROFILE',
      passwordHashBytes: 'USER_PROFILE',

      username: 'USER_REGISTRATION',
      email: 'USER_REGISTRATION',
      contact: 'USER_REGISTRATION',
      phone: 'USER_REGISTRATION',
      fullName: 'USER_PROFILE',

      emailLookupHash: 'USER_PROFILE',
      usernameLookupHash: 'USER_PROFILE',

      role: 'USER_PROFILE',
      isActive: 'USER_PROFILE',
      twoFactorEnabled: 'USER_PROFILE',

      createdAt: 'USER_PROFILE',
      updatedAt: 'USER_PROFILE',
    },
  },

  PENDING_REGISTRATION: {
    modelName: 'PENDING_REGISTRATION',
    collectionName: 'pendingregistrations',
    defaultDataType: 'USER_REGISTRATION',
    sensitiveFields: {
      challengeId: 'USER_REGISTRATION',
      userId: 'USER_REGISTRATION',

      emailLookupHash: 'USER_REGISTRATION',
      usernameLookupHash: 'USER_REGISTRATION',
      maskedEmail: 'USER_REGISTRATION',

      encryptedUserFields: 'USER_REGISTRATION',
      passwordFields: 'USER_REGISTRATION',

      otpHash: 'USER_REGISTRATION',
      status: 'USER_REGISTRATION',
      attempts: 'USER_REGISTRATION',
      maxAttempts: 'USER_REGISTRATION',
      expiresAt: 'USER_REGISTRATION',
      verifiedAt: 'USER_REGISTRATION',
      usedAt: 'USER_REGISTRATION',

      createdAt: 'USER_REGISTRATION',
      updatedAt: 'USER_REGISTRATION',
    },
  },

  TWO_FACTOR_CHALLENGE: {
    modelName: 'TWO_FACTOR_CHALLENGE',
    collectionName: 'twofactorchallenges',
    defaultDataType: 'USER_PROFILE',
    sensitiveFields: {
      userId: 'USER_PROFILE',
      otpHash: 'USER_PROFILE',
      purpose: 'USER_PROFILE',
      status: 'USER_PROFILE',
      attempts: 'USER_PROFILE',
      maxAttempts: 'USER_PROFILE',
      expiresAt: 'USER_PROFILE',
      verifiedAt: 'USER_PROFILE',
      usedAt: 'USER_PROFILE',

      createdAt: 'USER_PROFILE',
      updatedAt: 'USER_PROFILE',
    },
  },

  REFRESH_SESSION: {
    modelName: 'REFRESH_SESSION',
    collectionName: 'refreshsessions',
    defaultDataType: 'USER_PROFILE',
    sensitiveFields: {
      userId: 'USER_PROFILE',
      refreshTokenHash: 'USER_PROFILE',
      status: 'USER_PROFILE',

      ipAddress: 'USER_PROFILE',
      userAgent: 'USER_PROFILE',

      lastUsedAt: 'USER_PROFILE',
      lastActivityAt: 'USER_PROFILE',
      idleExpiresAt: 'USER_PROFILE',
      expiresAt: 'USER_PROFILE',

      revokedAt: 'USER_PROFILE',
      revokedReason: 'USER_PROFILE',
      replacedBySessionId: 'USER_PROFILE',

      createdAt: 'USER_PROFILE',
      updatedAt: 'USER_PROFILE',
    },
  },

  PROFILE: {
    modelName: 'PROFILE',
    collectionName: 'profiles',
    defaultDataType: 'USER_PROFILE',
    sensitiveFields: {
      userId: 'USER_PROFILE',
      username: 'USER_PROFILE',
      email: 'USER_PROFILE',
      contact: 'USER_PROFILE',
      phone: 'USER_PROFILE',
      fullName: 'USER_PROFILE',
      address: 'USER_PROFILE',
      dateOfBirth: 'USER_PROFILE',
      nid: 'USER_PROFILE',
      createdAt: 'USER_PROFILE',
      updatedAt: 'USER_PROFILE',
    },
  },

  ACCOUNT: {
    modelName: 'ACCOUNT',
    collectionName: 'accounts',
    defaultDataType: 'ACCOUNT_DETAILS',
    sensitiveFields: {
      userId: 'ACCOUNT_DETAILS',
      accountNumber: 'ACCOUNT_DETAILS',
      accountType: 'ACCOUNT_DETAILS',
      accountStatus: 'ACCOUNT_DETAILS',
      balance: 'ACCOUNT_DETAILS',
      branchName: 'ACCOUNT_DETAILS',
      routingNumber: 'ACCOUNT_DETAILS',
      createdAt: 'ACCOUNT_DETAILS',
      updatedAt: 'ACCOUNT_DETAILS',
    },
  },

  BENEFICIARY: {
    modelName: 'BENEFICIARY',
    collectionName: 'beneficiaries',
    defaultDataType: 'BENEFICIARY_DATA',
    sensitiveFields: {
      userId: 'BENEFICIARY_DATA',
      beneficiaryName: 'BENEFICIARY_DATA',
      beneficiaryEmail: 'BENEFICIARY_DATA',
      beneficiaryPhone: 'BENEFICIARY_DATA',
      beneficiaryAccountNumber: 'BENEFICIARY_DATA',
      beneficiaryBankName: 'BENEFICIARY_DATA',
      nickname: 'BENEFICIARY_DATA',
      createdAt: 'BENEFICIARY_DATA',
      updatedAt: 'BENEFICIARY_DATA',
    },
  },

  TRANSACTION: {
    modelName: 'TRANSACTION',
    collectionName: 'transactions',
    defaultDataType: 'TRANSACTION_DATA',
    sensitiveFields: {
      userId: 'TRANSACTION_DATA',
      fromAccount: 'TRANSACTION_DATA',
      toAccount: 'TRANSACTION_DATA',
      amount: 'TRANSACTION_DATA',
      description: 'TRANSACTION_DATA',
      reference: 'TRANSACTION_DATA',
      receiverName: 'TRANSACTION_DATA',
      receiverBank: 'TRANSACTION_DATA',
      transactionType: 'TRANSACTION_DATA',
      status: 'TRANSACTION_DATA',
      createdAt: 'TRANSACTION_DATA',
      updatedAt: 'TRANSACTION_DATA',
    },
  },

  SUPPORT_TICKET: {
    modelName: 'SUPPORT_TICKET',
    collectionName: 'supporttickets',
    defaultDataType: 'SUPPORT_TICKET',
    sensitiveFields: {
      userId: 'SUPPORT_TICKET',
      title: 'SUPPORT_TICKET',
      message: 'SUPPORT_TICKET',
      description: 'SUPPORT_TICKET',
      reply: 'TICKET_COMMENT',
      comments: 'TICKET_COMMENT',
      status: 'SUPPORT_TICKET',
      priority: 'SUPPORT_TICKET',
      createdAt: 'SUPPORT_TICKET',
      updatedAt: 'SUPPORT_TICKET',
    },
  },

  NOTIFICATION: {
    modelName: 'NOTIFICATION',
    collectionName: 'notifications',
    defaultDataType: 'NOTIFICATION',
    sensitiveFields: {
      userId: 'NOTIFICATION',
      title: 'NOTIFICATION',
      message: 'NOTIFICATION',
      body: 'NOTIFICATION',
      type: 'NOTIFICATION',
      isRead: 'NOTIFICATION',
      createdAt: 'NOTIFICATION',
      updatedAt: 'NOTIFICATION',
    },
  },
});

const MODEL_ALIASES = Object.freeze({
  USER: 'USER',
  USERS: 'USER',
  AUTH: 'USER',
  REGISTRATION: 'USER',

  PENDING_REGISTRATION: 'PENDING_REGISTRATION',
  PENDINGREGISTRATION: 'PENDING_REGISTRATION',
  PENDING_REGISTRATIONS: 'PENDING_REGISTRATION',

  TWO_FACTOR_CHALLENGE: 'TWO_FACTOR_CHALLENGE',
  TWOFACTORCHALLENGE: 'TWO_FACTOR_CHALLENGE',
  TWO_FACTOR: 'TWO_FACTOR_CHALLENGE',
  OTP: 'TWO_FACTOR_CHALLENGE',

  REFRESH_SESSION: 'REFRESH_SESSION',
  REFRESHSESSION: 'REFRESH_SESSION',
  SESSION: 'REFRESH_SESSION',
  SESSIONS: 'REFRESH_SESSION',

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