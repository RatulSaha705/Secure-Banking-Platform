'use strict';

/**
 * server/src/models/User.js
 *
 * Feature 1: Refactored User Registration Schema
 *
 * Password:
 *   - NEVER encrypted
 *   - NEVER stored as plaintext
 *   - stored only as salted custom PBKDF-style hash fields
 *
 * Sensitive user fields:
 *   - username, email, contact, fullName, phone are encrypted envelope objects
 *   - envelopes include algorithm, keyId, ciphertext, MAC, version, createdAt
 *
 * Lookup:
 *   - emailLookupHash and usernameLookupHash are deterministic custom HMAC hashes
 *   - login/duplicate-check use lookup hashes because email/username are encrypted
 */

const mongoose = require('mongoose');

const encryptedEnvelopeSchemaType = mongoose.Schema.Types.Mixed;

const userSchema = new mongoose.Schema(
  {
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    passwordSalt: {
      type: String,
      required: true,
      select: false,
    },

    passwordIterations: {
      type: Number,
      required: true,
      default: 10000,
      select: false,
    },

    passwordHashAlgorithm: {
      type: String,
      required: true,
      default: 'PBKDF2-HMAC-SHA256-LAB',
      select: false,
    },

    passwordHashBytes: {
      type: Number,
      required: true,
      default: 32,
      select: false,
    },

    username: {
      type: encryptedEnvelopeSchemaType,
      required: true,
    },

    email: {
      type: encryptedEnvelopeSchemaType,
      required: true,
    },

    contact: {
      type: encryptedEnvelopeSchemaType,
      default: null,
    },

    fullName: {
      type: encryptedEnvelopeSchemaType,
      default: null,
    },

    phone: {
      type: encryptedEnvelopeSchemaType,
      default: null,
    },

    emailLookupHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    usernameLookupHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);