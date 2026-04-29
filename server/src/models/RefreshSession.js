'use strict';

/**
 * server/src/models/RefreshSession.js
 *
 * Strict encrypted refresh session schema.
 *
 * Rule:
 *   Only _id is readable.
 *
 * The session _id is allowed to stay readable because the backend needs it
 * to find the session document.
 */

const mongoose = require('mongoose');

const encryptedValue = mongoose.Schema.Types.Mixed;

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: encryptedValue,
      required: true,
    },

    refreshTokenHash: {
      type: encryptedValue,
      required: true,
    },

    status: {
      type: encryptedValue,
      required: true,
    },

    ipAddress: {
      type: encryptedValue,
      required: true,
    },

    userAgent: {
      type: encryptedValue,
      required: true,
    },

    lastUsedAt: {
      type: encryptedValue,
      required: true,
    },

    lastActivityAt: {
      type: encryptedValue,
      required: true,
    },

    idleExpiresAt: {
      type: encryptedValue,
      required: true,
    },

    expiresAt: {
      type: encryptedValue,
      required: true,
    },

    revokedAt: {
      type: encryptedValue,
      required: true,
    },

    revokedReason: {
      type: encryptedValue,
      required: true,
    },

    replacedBySessionId: {
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
  mongoose.models.RefreshSession ||
  mongoose.model('RefreshSession', refreshSessionSchema);