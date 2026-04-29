'use strict';

/**
 * server/src/models/PendingRegistration.js
 *
 * Strict encrypted pending registration schema.
 *
 * Rule:
 *   Only _id is readable.
 *
 * _id stores pendingRegistrationId so backend can find the document.
 * challengeId and all other values are encrypted.
 */

const mongoose = require('mongoose');

const encryptedValue = mongoose.Schema.Types.Mixed;

const pendingRegistrationSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },

    challengeId: {
      type: encryptedValue,
      required: true,
    },

    userId: {
      type: encryptedValue,
      required: true,
    },

    emailLookupHash: {
      type: encryptedValue,
      required: true,
    },

    usernameLookupHash: {
      type: encryptedValue,
      required: true,
    },

    maskedEmail: {
      type: encryptedValue,
      required: true,
    },

    encryptedUserFields: {
      type: encryptedValue,
      required: true,
    },

    passwordFields: {
      type: encryptedValue,
      required: true,
    },

    otpHash: {
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
  mongoose.models.PendingRegistration ||
  mongoose.model('PendingRegistration', pendingRegistrationSchema);