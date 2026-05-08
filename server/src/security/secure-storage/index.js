'use strict';

/**
 * ============================================================================
 * CONTRIBUTION: Secure Storage Layer — Module Entry Point (Sifat)
 * ============================================================================
 *
 * Security Feature : ✔ Data Integrity (MAC) + Secure Storage
 * Responsibility   : Secure Storage Layer — Barrel export
 *
 * Re-exports all storage policy helpers (field-protection-rules.js) and the
 * encrypt/decrypt functions (storage-engine.js) so the rest of the codebase
 * can import them from a single path: require('../security/secure-storage')
 * ============================================================================
 */

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