'use strict';

/**
 * server/src/models/Account.js
 *
 * Feature 8 — View Account Balance.
 *
 * Encrypted Account schema.
 *
 * Rule (same as User / Profile models):
 *   Only _id is readable in MongoDB.
 *   Every other value is stored as an encrypted envelope object via
 *   encryptSensitiveFields / decryptSensitiveFields before save / on read.
 *
 * The Account document is 1-to-1 with a User document.
 * userId holds the owning User's _id (encrypted).
 *
 * Fields
 * ──────
 *   userId          – Owning user's _id (encrypted)
 *   accountNumber   – Unique bank account number (encrypted)
 *   accountType     – e.g. 'savings', 'current' (encrypted)
 *   accountStatus   – e.g. 'active', 'frozen', 'closed' (encrypted)
 *   balance         – Current balance as a JSON-serialised number (encrypted)
 *   branchName      – Branch the account belongs to (encrypted)
 *   routingNumber   – Bank routing number (encrypted, nullable)
 *   createdAt       – ISO timestamp (encrypted)
 *   updatedAt       – ISO timestamp (encrypted)
 */

const mongoose = require('mongoose');

const encryptedValue = mongoose.Schema.Types.Mixed;

const accountSchema = new mongoose.Schema(
  {
    // Owning user — stored encrypted (as with every other field).
    userId: {
      type: encryptedValue,
      required: true,
    },

    // Unique account number — encrypted so it is never exposed in plain text.
    accountNumber: {
      type: encryptedValue,
      required: true,
    },

    // 'savings' | 'current' | 'fixed-deposit' …
    accountType: {
      type: encryptedValue,
      required: true,
    },

    // 'active' | 'frozen' | 'closed'
    accountStatus: {
      type: encryptedValue,
      required: true,
    },

    // Stored as a number serialised through the encryption layer.
    balance: {
      type: encryptedValue,
      required: true,
    },

    // Branch the account is associated with.
    branchName: {
      type: encryptedValue,
      default: null,
    },

    // Optional routing / IFSC / SWIFT code.
    routingNumber: {
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

module.exports = mongoose.models.Account || mongoose.model('Account', accountSchema);
