'use strict';

/**
 * server/src/utils/controllerHelpers.js
 *
 * Shared HTTP-layer helpers used by every controller.
 * Eliminates the identical sendError definition that was copy-pasted
 * into all 6 controllers (auth, profile, account, dashboard, transfer, beneficiary).
 */

/**
 * Sends a JSON error response.
 * Uses err.statusCode when present (domain errors); falls back to 500.
 *
 * @param {import('express').Response} res
 * @param {Error & { statusCode?: number }} err
 */
const sendError = (res, err) =>
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server error',
  });

module.exports = { sendError };
