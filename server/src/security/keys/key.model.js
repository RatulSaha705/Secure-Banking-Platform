'use strict';

/**
 * server/src/security/keys/key.model.js
 *
 * Feature 17: Key Management Module
 *
 * MongoDB stores public keys and key metadata only.
 * Private keys are NOT stored in MongoDB.
 *
 * Updated design:
 *   - SYSTEM keys can still exist for setup/tests/backward compatibility.
 *   - USER keys belong to one specific user through ownerUserId.
 *   - Every registered user receives their own RSA/ECC key records.
 */

const mongoose = require('mongoose');

const KEY_ALGORITHMS = Object.freeze(['RSA', 'ECC']);

const KEY_PURPOSES = Object.freeze([
  'USER_PROFILE',
  'ACCOUNT_DATA',
  'BENEFICIARY_DATA',
  'TRANSACTION_DATA',
  'SUPPORT_TICKET',
  'NOTIFICATION',
  'TEST',
]);

const KEY_STATUSES = Object.freeze([
  'ACTIVE',
  'INACTIVE',
  'RETIRED',
  'COMPROMISED',
]);

const KEY_OWNER_TYPES = Object.freeze([
  'SYSTEM',
  'USER',
]);

const cryptoKeySchema = new mongoose.Schema(
  {
    keyId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^[a-z0-9][a-z0-9_-]*$/i,
    },

    ownerType: {
      type: String,
      required: true,
      enum: KEY_OWNER_TYPES,
      default: 'SYSTEM',
      index: true,
    },

    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    algorithm: {
      type: String,
      required: true,
      enum: KEY_ALGORITHMS,
      index: true,
    },

    purpose: {
      type: String,
      required: true,
      enum: KEY_PURPOSES,
      index: true,
    },

    version: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      required: true,
      enum: KEY_STATUSES,
      default: 'INACTIVE',
      index: true,
    },

    publicKey: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    privateKeyEnvVar: {
      type: String,
      required: true,
      trim: true,
    },

    usage: {
      type: String,
      required: true,
      trim: true,
    },

    activatedAt: {
      type: Date,
      default: null,
    },

    retiredAt: {
      type: Date,
      default: null,
    },

    rotatedFromKeyId: {
      type: String,
      default: null,
      trim: true,
    },

    notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    strict: 'throw',
  }
);

cryptoKeySchema.index(
  { ownerType: 1, ownerUserId: 1, algorithm: 1, purpose: 1, status: 1 },
  { name: 'owner_algorithm_purpose_status_idx' }
);

cryptoKeySchema.index(
  { ownerType: 1, ownerUserId: 1, algorithm: 1, purpose: 1, version: -1 },
  { name: 'owner_algorithm_purpose_version_idx' }
);

cryptoKeySchema.index(
  { ownerType: 1, ownerUserId: 1, algorithm: 1, purpose: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
    name: 'one_active_key_per_owner_algorithm_purpose',
  }
);

cryptoKeySchema.pre('validate', function validateOwner(next) {
  if (this.ownerType === 'USER' && !this.ownerUserId) {
    return next(new Error('ownerUserId is required for USER-owned keys'));
  }

  if (this.ownerType === 'SYSTEM' && this.ownerUserId) {
    return next(new Error('ownerUserId must be empty for SYSTEM-owned keys'));
  }

  return next();
});

cryptoKeySchema.pre('validate', function preventPrivateKeyStorage(next) {
  const raw = this.toObject({ depopulate: true });

  const forbiddenNames = [
    'privateKey',
    'secretKey',
    'd',
    'p',
    'q',
    'lambdaN',
  ];

  for (const name of forbiddenNames) {
    if (Object.prototype.hasOwnProperty.call(raw, name)) {
      return next(new Error(`Private key field "${name}" must not be stored in MongoDB`));
    }
  }

  return next();
});

const CryptoKey = mongoose.models.CryptoKey || mongoose.model('CryptoKey', cryptoKeySchema);

module.exports = {
  CryptoKey,
  KEY_ALGORITHMS,
  KEY_PURPOSES,
  KEY_STATUSES,
  KEY_OWNER_TYPES,
};