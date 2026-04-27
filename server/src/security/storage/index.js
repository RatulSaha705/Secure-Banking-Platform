'use strict';

/**
 * server/src/security/storage/index.js
 *
 * Main export for Feature 18 Encrypted Data Storage Module.
 */

const storagePolicy = require('./storagePolicy');
const encryptedDataStorage = require('./encryptedDataStorage');

module.exports = {
  ...storagePolicy,
  ...encryptedDataStorage,
};