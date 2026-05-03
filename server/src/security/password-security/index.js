'use strict';

/**
 * server/src/security/password/index.js
 */

const passwordPolicy = require('./password-rules');
const passwordService = require('./password-service');

module.exports = {
  ...passwordPolicy,
  ...passwordService,
};