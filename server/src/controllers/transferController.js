'use strict';

/**
 * server/src/controllers/transferController.js
 *
 * Feature 10 — Money Transfer + Feature 12 — Transaction History HTTP layer.
 *
 * Feature 14 integration:
 *   Creates encrypted transaction alert notification after successful transfer.
 */

const {
  initiateTransfer,
  getMyTransactionHistory,
  getTransactionById,
} = require('../services/transferService');

const {
  safeCreateTransactionAlertNotification,
} = require('../services/notificationService');

const logger = require('../utils/logger');
const { sendError } = require('../utils/controllerHelpers');

const initiateTransferHandler = async (req, res, next) => {
  try {
    const receipt = await initiateTransfer(req.user.id, req.body);

    await safeCreateTransactionAlertNotification(req.user.id, receipt);

    logger.info(`Transfer ${receipt.reference}: ${req.user.id} → ${receipt.toAccount} | BDT ${receipt.amount}`);

    return res.status(201).json({
      success: true,
      message: 'Transfer completed successfully.',
      data: receipt,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const getHistoryHandler = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    const result = await getMyTransactionHistory(req.user.id, page, limit);

    logger.info(`Transaction history served for user: ${req.user.id} (page ${page})`);

    return res.status(200).json({
      success: true,
      message: 'Transaction history retrieved successfully.',
      data: result,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const getTransactionHandler = async (req, res, next) => {
  try {
    const txn = await getTransactionById(req.user.id, req.params.txnId);

    logger.info(`Transaction ${req.params.txnId} retrieved by user: ${req.user.id}`);

    return res.status(200).json({
      success: true,
      message: 'Transaction retrieved successfully.',
      data: txn,
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