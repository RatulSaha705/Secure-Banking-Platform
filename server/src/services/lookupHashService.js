'use strict';

/**
 * server/src/services/lookupHashService.js
 *
 * Feature 1 lookup hash service.
 *
 * Because email and username are encrypted, MongoDB cannot search them by
 * plaintext. So registration/login use deterministic lookup hashes:
 *
 *   emailLookupHash = HMAC(LOOKUP_HASH_SECRET, normalizedEmail)
 *   usernameLookupHash = HMAC(LOOKUP_HASH_SECRET, normalizedUsername)
 *
 * This uses your custom HMAC-SHA256-LAB implementation through
 * security/hash/passwordHash.js. It does not use crypto.createHmac.
 */

const { createLookupHash } = require('../security/hash/passwordHash');

const getLookupSecret = () => {
  const secret = process.env.LOOKUP_HASH_SECRET;

  if (!secret) {
    throw new Error('LOOKUP_HASH_SECRET is not set in server/.env');
  }

  return secret;
};

const normalize = (value) => String(value || '').trim().toLowerCase();

const computeLookupHash = (value) => {
  return createLookupHash(getLookupSecret(), normalize(value));
};

const computeEmailLookupHash = (email) => computeLookupHash(email);
const computeUsernameLookupHash = (username) => computeLookupHash(username);

module.exports = {
  normalize,
  computeLookupHash,
  computeEmailLookupHash,
  computeUsernameLookupHash,
};