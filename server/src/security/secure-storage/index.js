'use strict';

/**
 * server/src/security/storage/index.js
 *
 * Main export for Feature 18 Encrypted Data Storage Module.
 */

const storagePolicy = require('./field-protection-rules');
const encryptedDataStorage = require('./storage-engine');

module.exports = {
  ...storagePolicy,
  ...encryptedDataStorage,
};