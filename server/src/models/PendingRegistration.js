'use strict';

/**
 * server/src/models/PendingRegistration.js
 *
 * Temporary registration document.
 *
 * Registration does NOT create a real User until email OTP is verified.
 * This document stores:
 *   - encrypted registration fields
 *   - salted password hash fields
 *   - lookup hashes
 *   - hashed OTP only, never plaintext OTP
 *
 * Plaintext email/username/contact are not stored here.
 */

const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema(
  {
    pendingRegistrationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    challengeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    emailLookupHash: {
      type: String,
      required: true,
      index: true,
    },

    usernameLookupHash: {
      type: String,
      required: true,
      index: true,
    },

    maskedEmail: {
      type: String,
      default: '',
    },

    encryptedUserFields: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    passwordFields: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    otpHash: {
      type: String,
      required: true,
      select: false,
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

pendingRegistrationSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    name: 'pending_registration_ttl_idx',
  }
);

module.exports =
  mongoose.models.PendingRegistration ||
  mongoose.model('PendingRegistration', pendingRegistrationSchema);