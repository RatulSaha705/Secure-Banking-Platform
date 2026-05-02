'use strict';

/**
 * server/src/utils/serviceHelpers.js
 *
 * Shared micro-utilities used across every service.
 * Centralising these eliminates the copy-pasted versions that existed
 * in authService, tokenService, profileService, accountService,
 * beneficiaryService, transferService, and dashboardService.
 */

/** Returns the current UTC instant as an ISO-8601 string. */
const nowIso = () => new Date().toISOString();

/**
 * Coerces any value to its plain string _id representation.
 * Returns '' for null/undefined or unrecognised objects.
 */
const toIdString = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id)  return String(value.id);
    return '';
  }
  return String(value);
};

/**
 * Trims a value and returns it, or null if blank / absent.
 * Used when a field is optional in registration / profile updates.
 */
const cleanOptional = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Builds the standard three-field security context required by
 * encryptSensitiveFields / decryptSensitiveFields.
 *
 * @param {string} collectionName  MongoDB collection name (e.g. 'users')
 * @param {string} ownerId         Owner user's _id
 * @param {string} documentId      The document's own _id
 */
const buildSecCtx = (collectionName, ownerId, documentId) => ({
  ownerId:        String(ownerId),
  documentId:     String(documentId),
  collectionName,
});

module.exports = {
  nowIso,
  toIdString,
  cleanOptional,
  buildSecCtx,
};
