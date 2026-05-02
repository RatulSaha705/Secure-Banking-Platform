import api from './api';

/**
 * client/src/services/transferService.js
 *
 * Feature 10 — Money Transfer.
 *
 * Thin wrappers around the Transfer API endpoints.
 *
 *   POST /api/transfer/initiate          → initiateTransfer(payload)
 *   GET  /api/transfer/history           → getTransactionHistory(page, limit)
 *   GET  /api/transfer/history/:txnId    → getTransactionById(txnId)
 */

/**
 * Initiate a money transfer.
 *
 * @param {object} payload – { toAccountNumber, amount, description?, receiverName?, receiverBank?, transferType? }
 */
export const initiateTransfer = (payload) =>
  api.post('/transfer/initiate', payload);

/**
 * Get paginated transaction history for the authenticated user.
 *
 * @param {number} page  – 1-indexed page number (default 1)
 * @param {number} limit – items per page (default 10)
 */
export const getTransactionHistory = (page = 1, limit = 10) =>
  api.get('/transfer/history', { params: { page, limit } });

/**
 * Get a single transaction by ID.
 */
export const getTransactionById = (txnId) =>
  api.get(`/transfer/history/${txnId}`);
