'use strict';

/**
 * ============================================================================
 * CONTRIBUTION: Session Management — RefreshSession Model (Sifat)
 * ============================================================================
 *
 * Security Feature : ✔ Session Security
 * Responsibility   : Session Management — Encrypted session schema
 *
 * This Mongoose model defines the schema for refresh sessions. Following
 * the strict encryption rule, every field except _id is stored as an
 * encrypted envelope (Schema.Types.Mixed). The tokenService encrypts all
 * session data before writing and decrypts after reading.
 *
 * Encrypted fields stored per session:
 *   • userId, refreshTokenHash, status
 *   • ipAddress, userAgent (client fingerprinting)
 *   • lastUsedAt, lastActivityAt (activity tracking)
 *   • idleExpiresAt, expiresAt (timeout enforcement)
 *   • revokedAt, revokedReason (audit trail)
 *   • replacedBySessionId (token rotation chain)
 *   • createdAt, updatedAt (timestamps)
 *
 * Mongoose timestamps are disabled (timestamps: false) because dates are
 * managed manually and encrypted alongside all other fields.
 * ============================================================================
 */

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