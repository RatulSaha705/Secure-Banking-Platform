'use strict';

/**
 * server/src/routes/transferRoutes.js
 *
 * Feature 10 — Money Transfer routes.
 *
 * RBAC:
 *   Regular users can initiate transfers and view their own transaction history.
 *   Admins must use /api/admin/transactions for monitoring.
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
  requireUser,
} = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requireUser);

router.post('/initiate', initiateTransferHandler);

router.get('/history', getHistoryHandler);

router.get('/history/:txnId', getTransactionHandler);

module.exports = router;