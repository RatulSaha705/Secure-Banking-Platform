'use strict';

/**
 * security/keys/key.model.js
 *
 * MongoDB model for public key metadata only.
 *
 * IMPORTANT:
 *   Private keys must never be stored in MongoDB.
 *   This schema intentionally stores only:
 *     - key id
 *     - algorithm
 *     - purpose
 *     - public key
 *     - version/status metadata
 *     - the name of the environment variable that contains private keys
 */

const mongoose = require('mongoose');

const KEY_ALGORITHMS = Object.freeze(['RSA', 'ECC']);

const KEY_PURPOSES = Object.freeze([
  'USER_PROFILE',
  'ACCOUNT_DATA',
  'BENEFICIARY_DATA',
  'SUPPORT_TICKET',
  'TRANSACTION_DATA',
  'NOTIFICATION',
  'TEST',
]);

const KEY_STATUSES = Object.freeze([
  'ACTIVE',
  'INACTIVE',
  'RETIRED',
  'COMPROMISED',
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
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    strict: 'throw',
  }
);

cryptoKeySchema.index(
  { algorithm: 1, purpose: 1, status: 1 },
  {
    name: 'algorithm_purpose_status_idx',
  }
);

cryptoKeySchema.index(
  { algorithm: 1, purpose: 1, version: -1 },
  {
    name: 'algorithm_purpose_version_idx',
  }
);

cryptoKeySchema.index(
  { algorithm: 1, purpose: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
    name: 'one_active_key_per_algorithm_and_purpose',
  }
);

cryptoKeySchema.pre('validate', function preventPrivateKeyStorage(next) {
  const raw = this.toObject({ depopulate: true });

  if (
    Object.prototype.hasOwnProperty.call(raw, 'privateKey') ||
    Object.prototype.hasOwnProperty.call(raw, 'secretKey') ||
    Object.prototype.hasOwnProperty.call(raw, 'd')
  ) {
    return next(new Error('Private key material must not be stored in MongoDB'));
  }

  return next();
});

const CryptoKey = mongoose.models.CryptoKey || mongoose.model('CryptoKey', cryptoKeySchema);

module.exports = {
  CryptoKey,
  KEY_ALGORITHMS,
  KEY_PURPOSES,
  KEY_STATUSES,
};