'use strict';

/**
 * server/src/security/password/index.js
 */

const passwordPolicy = require('./passwordPolicy');
const passwordService = require('./password.service');

module.exports = {
  ...passwordPolicy,
  ...passwordService,
};