'use strict';

/**
 * server/src/controllers/transferController.js
 *
 * Feature 10 — Money Transfer HTTP layer.
 *
 * Handlers
 * ────────
 *   initiateTransferHandler  – POST /api/transfer/initiate   (auth required)
 *   getHistoryHandler        – GET  /api/transfer/history    (auth required)
 *   getTransactionHandler    – GET  /api/transfer/history/:txnId (auth required)
 *
 * RBAC
 * ────
 *   requireAuth – enforced at route level for all endpoints.
 */

const {
  initiateTransfer,
  getMyTransactionHistory,
  getTransactionById,
} = require('../services/transferService');

const logger = require('../utils/logger');

// ── Shared error helper ───────────────────────────────────────────────────────

const sendError = (res, err) =>
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server error',
  });

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/transfer/initiate
 *
 * Body: { toAccountNumber, amount, description?, receiverName?, receiverBank?, transferType? }
 *
 * Returns the transfer receipt including reference number and new balance.
 */
const initiateTransferHandler = async (req, res, next) => {
  try {
    const senderId = req.user.id;
    const receipt  = await initiateTransfer(senderId, req.body);

    logger.info(
      `Transfer ${receipt.reference}: ${senderId} → ${receipt.toAccount} | BDT ${receipt.amount}`
    );

    return res.status(201).json({
      success: true,
      message: 'Transfer completed successfully.',
      data:    receipt,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

/**
 * GET /api/transfer/history
 *
 * Query params: page (default 1), limit (default 10, max 50).
 *
 * Returns paginated transaction history for the authenticated user.
 */
const getHistoryHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page   = parseInt(req.query.page,  10) || 1;
    const limit  = parseInt(req.query.limit, 10) || 10;

    const result = await getMyTransactionHistory(userId, page, limit);

    logger.info(`Transaction history served for user: ${userId} (page ${page})`);

    return res.status(200).json({
      success: true,
      message: 'Transaction history retrieved successfully.',
      data:    result,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

/**
 * GET /api/transfer/history/:txnId
 *
 * Returns a single decrypted transaction owned by the authenticated user.
 */
const getTransactionHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const txnId  = req.params.txnId;

    const txn = await getTransactionById(userId, txnId);

    logger.info(`Transaction ${txnId} retrieved by user: ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Transaction retrieved successfully.',
      data:    txn,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = {
  initiateTransferHandler,
  getHistoryHandler,
  getTransactionHandler,
};
