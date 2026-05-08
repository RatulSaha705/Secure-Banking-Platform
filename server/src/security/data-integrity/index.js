'use strict';

/**
 * ============================================================================
 * CONTRIBUTION: Data Integrity — Module Entry Point (Sifat)
 * ============================================================================
 *
 * Security Feature : ✔ Data Integrity (MAC)
 * Responsibility   : MAC (CBC-MAC) — Barrel export
 *
 * Re-exports all MAC policy constants (integrity-rules.js) and MAC service
 * functions (integrity-checker.js) so the rest of the codebase can import
 * them from a single path:  require('../security/data-integrity')
 * ============================================================================
 */

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