'use strict';

/**
 * server/src/services/lookupHashService.js
 *
 * Deterministic lookup hash service.
 *
 * Because email and username are encrypted in MongoDB, we cannot search them
 * by plaintext. So registration and login use deterministic lookup hashes:
 *
 *   emailLookupHash    = CBC-MAC(LOOKUP_HASH_SECRET, normalizedEmail)
 *   usernameLookupHash = CBC-MAC(LOOKUP_HASH_SECRET, normalizedUsername)
 *
 * Uses cbcMac.js (Node built-in AES-128-CBC) — not the old custom HMAC.
 * The createLookupHash function from passwordHash.js wraps this via built-in
 * HMAC-SHA256, but for lookup hashes we use CBC-MAC for consistency.
 */

const { createCbcMac } = require('../security/data-integrity/cbc-mac-engine');

const getLookupSecret = () => {
  const secret = process.env.LOOKUP_HASH_SECRET;

  if (!secret) {
    throw new Error('LOOKUP_HASH_SECRET is not set in server/.env');
  }

  return secret;
};

const normalize = (value) => String(value || '').trim().toLowerCase();

/**
 * Computes a CBC-MAC-based lookup hash for a given value.
 * The key is derived from LOOKUP_HASH_SECRET via deriveCbcMacKey (SHA-256 → 16 bytes).
 *
 * @param {string} value
 * @returns {string} hex MAC tag (32 chars)
 */
const computeLookupHash = (value) => {
  return createCbcMac(getLookupSecret(), [normalize(value)]);
};

const computeEmailLookupHash    = (email)    => computeLookupHash(email);
const computeUsernameLookupHash = (username) => computeLookupHash(username);

module.exports = {
  normalize,
  computeLookupHash,
  computeEmailLookupHash,
  computeUsernameLookupHash,
};