'use strict';

/**
 * server/src/models/TwoFactorChallenge.js
 *
 * Strict encrypted login OTP challenge schema.
 *
 * Rule:
 *   Only _id is readable.
 *
 * _id stores challengeId so backend can find the document.
 * userId, otpHash, status, attempts, dates, etc. are encrypted.
 */

const mongoose = require('mongoose');

const encryptedValue = mongoose.Schema.Types.Mixed;

const twoFactorChallengeSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },

    userId: {
      type: encryptedValue,
      required: true,
    },

    otpHash: {
      type: encryptedValue,
      required: true,
    },

    purpose: {
      type: encryptedValue,
      required: true,
    },

    status: {
      type: encryptedValue,
      required: true,
    },

    attempts: {
      type: encryptedValue,
      required: true,
    },

    maxAttempts: {
      type: encryptedValue,
      required: true,
    },

    expiresAt: {
      type: encryptedValue,
      required: true,
    },

    verifiedAt: {
      type: encryptedValue,
      required: true,
    },

    usedAt: {
      type: encryptedValue,
      required: true,
    },

    createdAt: {
      type: encryptedValue,
      required: true,
    },

    updatedAt: {
      type: encryptedValue,
      required: true,
    },
  },
  {
    timestamps: false,
    strict: true,
  }
);

module.exports =
  mongoose.models.TwoFactorChallenge ||
  mongoose.model('TwoFactorChallenge', twoFactorChallengeSchema);