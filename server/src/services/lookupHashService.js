'use strict';

/**
 * services/lookupHashService.js — Deterministic HMAC Lookup Hashes
 *
 * PURPOSE:
 *   Because encrypted fields (encEmail, encUsername) cannot be queried
 *   directly in MongoDB (ciphertext differs per encryption), we store a
 *   separate non-reversible hash of the normalized plaintext.
 *
 * HOW IT WORKS:
 *   hash = HMAC-SHA256( LOOKUP_HASH_SECRET, normalize(value) )
 *
 *   - HMAC with a secret key prevents rainbow-table / precomputed attacks.
 *   - Deterministic: same input always produces the same hash.
 *   - One-way: hash cannot be reversed to recover the plaintext.
 *   - normalize() lowercases and trims so "User@Mail.com" === "user@mail.com".
 *
 * EXTENSION PATH (Phase 2):
 *   Replace Node's crypto.createHmac with the from-scratch HMAC-SHA256
 *   implementation being built in crypto/macIntegrity.js.
 */

const crypto = require('crypto');

const getLookupKey = () => {
  const key = process.env.LOOKUP_HASH_SECRET;
  if (!key) throw new Error('LOOKUP_HASH_SECRET is not set in environment');
  return key;
};

/**
 * normalize
 * Trims and lowercases the input for consistent hashing.
 *
 * @param {string} value
 * @returns {string}
 */
const normalize = (value) => (value || '').trim().toLowerCase();

/**
 * computeLookupHash
 * Computes a deterministic HMAC-SHA256 hash of the normalized input.
 *
 * @param {string} value - Plaintext value to hash (e.g. email, username)
 * @returns {string} Hex-encoded HMAC digest
 */
const computeLookupHash = (value) => {
  const key = getLookupKey();
  const normalized = normalize(value);
  return crypto.createHmac('sha256', key).update(normalized).digest('hex');
};

module.exports = { computeLookupHash, normalize };
