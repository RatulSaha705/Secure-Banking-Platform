'use strict';

/**
 * server/src/security/integrity/index.js
 *
 * Main export for Feature 19 Integrity Verification / MAC.
 */

const macPolicy = require('./macPolicy');
const macService = require('./mac.service');

module.exports = {
  ...macPolicy,
  ...macService,
};