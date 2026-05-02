'use strict';

/**
 * server/src/models/Profile.js
 *
 * Encrypted Profile schema.
 *
 * Rule (same as User model):
 *   Only _id is readable.
 *   Every other value is stored as an encrypted envelope object via
 *   encryptSensitiveFields / decryptSensitiveFields before save / on read.
 *
 * The Profile document is 1-to-1 with a User document.
 * userId holds the owning User's _id (encrypted).
 *
 * Fields beyond the base User registration data (username, email, contact,
 * phone, fullName) are the extra "profile-only" fields: address, dateOfBirth,
 * nid.  The base fields are mirrored here so the profile page can show a
 * complete view without touching the User collection.
 */

const mongoose = require('mongoose');

const encryptedValue = mongoose.Schema.Types.Mixed;

const profileSchema = new mongoose.Schema(
  {
    // Owning user — stored encrypted (as with every other field).
    userId: {
      type: encryptedValue,
      required: true,
    },

    // --- Mirrored from User registration fields ---
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

    phone: {
      type: encryptedValue,
      default: null,
    },

    fullName: {
      type: encryptedValue,
      default: null,
    },

    // --- Profile-only extended fields ---
    address: {
      type: encryptedValue,
      default: null,
    },

    dateOfBirth: {
      type: encryptedValue,
      default: null,
    },

    nid: {
      type: encryptedValue,
      default: null,
    },

    // --- Audit timestamps (encrypted) ---
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
    timestamps: false, // We manage timestamps manually (encrypted).
    strict: true,
  }
);

module.exports = mongoose.models.Profile || mongoose.model('Profile', profileSchema);
