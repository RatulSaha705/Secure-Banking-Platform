'use strict';

/**
 * server/src/models/RefreshSession.js
 *
 * Secure session document for refresh-token based login sessions.
 * The raw refresh token is never stored. Only a custom HMAC hash is stored.
 */

const mongoose = require('mongoose');

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    refreshTokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED', 'EXPIRED'],
      default: 'ACTIVE',
      required: true,
      index: true,
    },

    ipAddress: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },

    lastActivityAt: {
      type: Date,
      default: null,
      index: true,
    },

    idleExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    revokedReason: {
      type: String,
      default: null,
    },

    replacedBySessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RefreshSession',
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

refreshSessionSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    name: 'refresh_session_ttl_idx',
  }
);

module.exports =
  mongoose.models.RefreshSession ||
  mongoose.model('RefreshSession', refreshSessionSchema);