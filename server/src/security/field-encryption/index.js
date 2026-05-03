'use strict';

/**
 * server/src/security/encryption/index.js
 *
 * Convenience export for Feature 20.
 */

const policy = require('./encryption-rules');
const dualAsymmetricEncryption = require('./asymmetric-encryptor');

module.exports = {
  ...policy,
  ...dualAsymmetricEncryption,
};