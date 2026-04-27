'use strict';

/**
 * server/src/models/TwoFactorChallenge.js
 *
 * Login OTP challenge.
 *
 * Password verification creates this document.
 * Final JWT/session is issued only after OTP verification.
 *
 * Plaintext OTP is never stored.
 */

const mongoose = require('mongoose');

const twoFactorChallengeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    challengeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    otpHash: {
      type: String,
      required: true,
      select: false,
    },

    purpose: {
      type: String,
      enum: ['LOGIN'],
      default: 'LOGIN',
      required: true,
    },

    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'EXPIRED', 'USED', 'CANCELLED'],
      default: 'PENDING',
      required: true,
      index: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxAttempts: {
      type: Number,
      default: 5,
      min: 1,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

twoFactorChallengeSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    name: 'two_factor_challenge_ttl_idx',
  }
);

module.exports =
  mongoose.models.TwoFactorChallenge ||
  mongoose.model('TwoFactorChallenge', twoFactorChallengeSchema);