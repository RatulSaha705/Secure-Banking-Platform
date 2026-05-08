'use strict';

/**
 * ============================================================================
 * CONTRIBUTION: Data Integrity — Integrity Rules / MAC Policy (Sifat)
 * ============================================================================
 *
 * Security Feature : ✔ Data Integrity (MAC)
 * Responsibility   : MAC (CBC-MAC) — Policy definition & input validation
 *
 * This file defines the MAC policy — what fields must be present in a MAC
 * context and in an encrypted envelope before a MAC tag can be generated.
 *
 * Key contributions in this file:
 *   1. REQUIRED_MAC_CONTEXT_FIELDS  — The minimum context fields (modelName,
 *                                      fieldName, ownerId) needed for MAC.
 *   2. REQUIRED_ENVELOPE_FIELDS     — The encrypted envelope must contain
 *                                      algorithm, keyId, and ciphertext.
 *   3. MAC_ALGORITHM / MAC_VERSION  — Constants identifying the MAC scheme
 *                                      ('CBC-MAC-AES-128', version 1).
 *   4. normalizeMacContext()        — Sanitizes and uppercases model names,
 *                                      trims whitespace from context fields.
 *   5. validateMacContext()         — Throws if required context fields are
 *                                      missing (prevents accidental omissions).
 *   6. validateEnvelopeForMac()     — Throws if envelope is missing algorithm,
 *                                      keyId, or ciphertext.
 * ============================================================================
 */

/**
 * server/src/security/integrity/macPolicy.js
 *
 * Feature 19: Integrity Verification / MAC Policy
 *
 * This file defines exactly what data is protected by the MAC.
 *
 * Required project coverage:
 *   modelName + fieldName + ownerId + algorithm + keyId + ciphertext
 *
 * Extra metadata is also included to make tampering harder:
 *   collectionName, documentId, dataType, keyPurpose, version, createdAt
 */

const REQUIRED_MAC_CONTEXT_FIELDS = Object.freeze([
  'modelName',
  'fieldName',
  'ownerId',
]);

const REQUIRED_ENVELOPE_FIELDS = Object.freeze([
  'algorithm',
  'keyId',
  'ciphertext',
]);

const MAC_ALGORITHM = 'CBC-MAC-AES-128';
const MAC_VERSION = 1;

const MAC_ENV_NAMES = Object.freeze([
  'SECURITY_MAC_MASTER_KEY',
  'HMAC_MASTER_KEY',
]);

const normalizeMacContext = (context = {}) => ({
  modelName: context.modelName ? String(context.modelName).trim().toUpperCase() : '',
  collectionName: context.collectionName ? String(context.collectionName).trim() : '',
  fieldName: context.fieldName ? String(context.fieldName).trim() : '',
  ownerId: context.ownerId ? String(context.ownerId).trim() : '',
  documentId: context.documentId ? String(context.documentId).trim() : '',
});

const validateMacContext = (context = {}) => {
  const normalized = normalizeMacContext(context);
  const missing = REQUIRED_MAC_CONTEXT_FIELDS.filter((field) => !normalized[field]);

  if (missing.length > 0) {
    throw new Error(`Missing MAC context field(s): ${missing.join(', ')}`);
  }

  return normalized;
};

const validateEnvelopeForMac = (envelope = {}) => {
  if (!envelope || typeof envelope !== 'object') {
    throw new TypeError('encrypted envelope must be an object');
  }

  const missing = REQUIRED_ENVELOPE_FIELDS.filter((field) => !envelope[field]);

  if (missing.length > 0) {
    throw new Error(`Missing encrypted envelope field(s) for MAC: ${missing.join(', ')}`);
  }

  return envelope;
};

module.exports = {
  REQUIRED_MAC_CONTEXT_FIELDS,
  REQUIRED_ENVELOPE_FIELDS,
  MAC_ALGORITHM,
  MAC_VERSION,
  MAC_ENV_NAMES,
  normalizeMacContext,
  validateMacContext,
  validateEnvelopeForMac,
};