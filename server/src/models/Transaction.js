'use strict';

/**
 * server/src/models/Transaction.js
 *
 * Feature 10 — Money Transfer.
 *
 * Encrypted Transaction schema.
 *
 * Rule (same as all other models):
 *   Only _id is readable in MongoDB.
 *   Every other value is stored as an encrypted envelope object via
 *   encryptSensitiveFields / decryptSensitiveFields before save / on read.
 *
 * One transfer produces TWO Transaction documents:
 *   • A DEBIT record owned by the sender   (userId = sender's userId)
 *   • A CREDIT record owned by the receiver (userId = receiver's userId)
 *
 * This means each user can query only their own transactions without
 * cross-user decryption.
 *
 * Fields
 * ──────
 *   userId          – Owning user's _id (encrypted)
 *   fromAccount     – Sender's account number (encrypted)
 *   toAccount       – Receiver's account number (encrypted)
 *   amount          – Transfer amount as a number (encrypted)
 *   description     – Optional note / memo (encrypted, nullable)
 *   reference       – Unique transfer reference code (encrypted)
 *   receiverName    – Name of the receiving party (encrypted, nullable)
 *   receiverBank    – Receiving bank name for external transfers (encrypted, nullable)
 *   transactionType – 'DEBIT' | 'CREDIT' (encrypted)
 *   status          – 'completed' | 'pending' | 'failed' (encrypted)
 *   createdAt       – ISO timestamp (encrypted)
 *   updatedAt       – ISO timestamp (encrypted)
 */

const mongoose = require('mongoose');

const encryptedValue = mongoose.Schema.Types.Mixed;

const transactionSchema = new mongoose.Schema(
  {
    // Owning user — stored encrypted.
    userId: {
      type: encryptedValue,
      required: true,
    },

    // Sender's account number (masked on display).
    fromAccount: {
      type: encryptedValue,
      required: true,
    },

    // Receiver's account number.
    toAccount: {
      type: encryptedValue,
      required: true,
    },

    // Amount in BDT — stored as a number serialised through the encryption layer.
    amount: {
      type: encryptedValue,
      required: true,
    },

    // Optional transfer note / description.
    description: {
      type: encryptedValue,
      default: null,
    },

    // Unique 12-character uppercase reference code, e.g. "TXN7F3A2B1C9".
    reference: {
      type: encryptedValue,
      required: true,
    },

    // Name of the receiving party (for display on receipts).
    receiverName: {
      type: encryptedValue,
      default: null,
    },

    // Bank name for external transfers; null for same-bank.
    receiverBank: {
      type: encryptedValue,
      default: null,
    },

    // 'DEBIT' (money left the account) | 'CREDIT' (money arrived).
    transactionType: {
      type: encryptedValue,
      required: true,
    },

    // 'completed' | 'pending' | 'failed'
    status: {
      type: encryptedValue,
      required: true,
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

module.exports =
  mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
