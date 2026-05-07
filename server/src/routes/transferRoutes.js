'use strict';

/**
 * server/src/routes/transferRoutes.js
 *
 * Feature 10 — Money Transfer routes.
 *
 * Users and admins can use the same money transfer page.
 * Every request still requires valid authentication.
 *
 * Security remains:
 * - requireAuth checks valid JWT/session.
 * - transferService encrypts transaction data before storage.
 * - transferService verifies encrypted data through secure storage/MAC layer.
 */

const express = require('express');

const router = express.Router();

const {
  initiateTransferHandler,
  getHistoryHandler,
  getTransactionHandler,
} = require('../controllers/transferController');

const {
  requireAuth,
} = require('../middleware/authMiddleware');

router.use(requireAuth);

router.post('/initiate', initiateTransferHandler);

router.get('/history', getHistoryHandler);

router.get('/history/:txnId', getTransactionHandler);

module.exports = router;