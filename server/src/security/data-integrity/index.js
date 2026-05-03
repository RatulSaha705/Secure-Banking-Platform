'use strict';

/**
 * server/src/security/integrity/index.js
 *
 * Main export for Feature 19 Integrity Verification / MAC.
 */

const macPolicy = require('./integrity-rules');
const macService = require('./integrity-checker');

module.exports = {
  ...macPolicy,
  ...macService,
};