'use strict';

/**
 * server/src/models/User.js
 *
 * Strict encrypted user schema.
 *
 * Rule:
 *   Only _id is readable.
 *   Every other value is stored as encrypted envelope object.
 *
 * Important:
 *   No timestamps option here, because Mongoose timestamps would save
 *   createdAt/updatedAt as plaintext Date values.
 */

const mongoose = require('mongoose');

const encryptedValue = mongoose.Schema.Types.Mixed;

const userSchema = new mongoose.Schema(
  {
    passwordHash: {
      type: encryptedValue,
      required: true,
    },

    passwordSalt: {
      type: encryptedValue,
      required: true,
    },

    passwordIterations: {
      type: encryptedValue,
      required: true,
    },

    passwordHashAlgorithm: {
      type: encryptedValue,
      required: true,
    },

    passwordHashBytes: {
      type: encryptedValue,
      required: true,
    },

    username: {
      type: encryptedValue,
      required: true,
    },

    email: {
      type: encryptedValue,
      required: true,
    },

    contact: {
      type: encryptedValue,
      default: null,
    },

    fullName: {
      type: encryptedValue,
      default: null,
    },

    phone: {
      type: encryptedValue,
      default: null,
    },

    emailLookupHash: {
      type: encryptedValue,
      required: true,
    },

    usernameLookupHash: {
      type: encryptedValue,
      required: true,
    },

    role: {
      type: encryptedValue,
      required: true,
    },

    isActive: {
      type: encryptedValue,
      required: true,
    },

    twoFactorEnabled: {
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

module.exports = mongoose.models.User || mongoose.model('User', userSchema);