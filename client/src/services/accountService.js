import api from './api';

/**
 * client/src/services/accountService.js
 *
 * Feature 8 — View Account Balance.
 *
 * Thin wrappers around the Account API endpoints.
 *
 *   GET /api/account/balance       → getAccountBalance()
 *   GET /api/account/me            → getMyAccount()
 */

/** Returns the current balance summary for the authenticated user. */
export const getAccountBalance = () => api.get('/account/balance');

/** Returns the full account details for the authenticated user. */
export const getMyAccount = () => api.get('/account/me');
