'use strict';

/**
 * server/src/security/encryption/index.js
 *
 * Convenience export for Feature 20.
 */

const policy = require('./encryptionPolicy');
const dualAsymmetricEncryption = require('./dualAsymmetricEncryption');

module.exports = {
  ...policy,
  ...dualAsymmetricEncryption,
};