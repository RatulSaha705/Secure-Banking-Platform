'use strict';

/**
 * models/User.js — User Schema (Phase 1: Registration & Login)
 *
 * SECURITY DESIGN:
 *   - Sensitive PII fields (username, email, fullName, phone) are stored
 *     as ciphertext (enc_*) so raw DB access reveals nothing.
 *   - Each encrypted field has a paired MAC tag (mac_*) to detect tampering
 *     before any decryption attempt.
 *   - For efficient exact-match lookups (uniqueness check, login by email),
 *     we store a non-reversible HMAC-SHA256 hash (lookupHash) that is
 *     deterministic for the same input but cannot be reversed to plaintext.
 *   - Passwords are hashed with bcrypt (cost factor 12), never stored plaintext.
 *
 * EXTENSION PATH:
 *   Phase 2 → replace fieldEncryptionService stub with real RSA/AES encryption.
 *   Phase 3 → add 2FA fields (twoFactorEnabled, twoFactorSecret).
 *   Phase 4 → add role-based fields, profile, account status.
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // ── Password ────────────────────────────────────────────────────────────────
    // bcrypt hash+salt — select:false so it is never returned by default queries
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    // ── Encrypted PII (ciphertext, base64-encoded) ──────────────────────────────
    // Encrypted with fieldEncryptionService. Phase 2: swap to RSA/AES from scratch.
    encUsername: { type: String, required: true },
    encEmail:    { type: String, required: true },
    encFullName: { type: String, default: null },
    encPhone:    { type: String, default: null },

    // ── MAC Integrity Tags (HMAC-SHA256 over ciphertext) ────────────────────────
    // Verified before each decryption attempt to detect DB-level tampering.
    macUsername: { type: String, required: true },
    macEmail:    { type: String, required: true },
    macFullName: { type: String, default: null },
    macPhone:    { type: String, default: null },

    // ── Lookup Hashes (HMAC-SHA256 of normalized plaintext) ─────────────────────
    // Non-reversible. Used ONLY for uniqueness checks and login lookup.
    // Unique index ensures no two users can share an email or username.
    emailLookupHash:    { type: String, required: true, unique: true },
    usernameLookupHash: { type: String, required: true, unique: true },

    // ── Role ─────────────────────────────────────────────────────────────────────
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
