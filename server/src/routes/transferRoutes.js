'use strict';

/**
 * server/src/routes/transferRoutes.js
 *
 * Feature 10 — Money Transfer routes.
 *
 * Mount point (in app.js): /api/transfer
 *
 * Routes
 * ──────
 *   POST /api/transfer/initiate          – Initiate a transfer (auth required)
 *   GET  /api/transfer/history           – Paginated history   (auth required)
 *   GET  /api/transfer/history/:txnId    – Single transaction  (auth required)
 *
 * Middleware chain
 * ────────────────
 *   requireAuth  – validates Bearer access token, populates req.user.
 *
 * Note: All sensitive data is validated and sanitised inside transferService,
 * not at the route level, so that security logic is centralised.
 */

const express = require('express');

const router = express.Router();

const {
  initiateTransferHandler,
  getHistoryHandler,
  getTransactionHandler,
} = require('../controllers/transferController');

const { requireAuth } = require('../middleware/authMiddleware');

// ── Initiate transfer ─────────────────────────────────────────────────────────

/**
 * POST /api/transfer/initiate
 *
 * Body (JSON):
 *   toAccountNumber  {string}  – Recipient account number
 *   amount           {number}  – Positive number in BDT
 *   description      {string?} – Optional note
 *   receiverName     {string?} – Optional receiver display name
 *   receiverBank     {string?} – Required for OTHER_BANK transfers
 *   transferType     {string?} – 'SAME_BANK' | 'OTHER_BANK' | 'OWN' (default: SAME_BANK)
 */
router.post('/initiate', requireAuth, initiateTransferHandler);

// ── Transaction history ───────────────────────────────────────────────────────

/**
 * GET /api/transfer/history?page=1&limit=10
 *
 * Returns paginated transaction history (newest first) for the auth user.
 */
router.get('/history', requireAuth, getHistoryHandler);

/**
 * GET /api/transfer/history/:txnId
 *
 * Returns a single decrypted transaction owned by the auth user.
 */
router.get('/history/:txnId', requireAuth, getTransactionHandler);

module.exports = router;
