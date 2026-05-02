'use strict';

/**
 * server/src/controllers/accountController.js
 *
 * Feature 8 — View Account Balance HTTP layer.
 *
 * Handlers
 * ────────
 *   getMyBalance      – GET /api/account/balance   (any authenticated user)
 *   getMyAccount      – GET /api/account/me         (any authenticated user)
 *   getAccountByUser  – GET /api/account/admin/:userId (admin only)
 *
 * RBAC
 * ────
 *   requireAuth   – enforced at route level for all account endpoints.
 *   requireAdmin  – enforced at route level for the admin endpoint.
 */

const {
  getMyAccount,
  getAccountBalance,
  getAccountByUserId,
} = require('../services/accountService');

const logger = require('../utils/logger');

// ── Shared error helper (mirrors existing controller pattern) ─────────────────

const sendError = (res, err) =>
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server error',
  });

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * GET /api/account/balance
 *
 * Returns the authenticated user's current balance summary:
 *   • totalBalance
 *   • availableBalance
 *   • pendingAmount
 *   • accountStatus
 *   • accountNumber  (masked on the frontend)
 *   • accountType
 *   • branchName
 *   • asOf  (ISO timestamp)
 *
 * Auto-provisions an account with 0 BDT balance on first access.
 */
const getMyBalanceHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const balance = await getAccountBalance(userId);

    logger.info(`Account balance retrieved for user: ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Account balance retrieved successfully.',
      data:    balance,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

/**
 * GET /api/account/me
 *
 * Returns the full account document (all fields) for the authenticated user.
 * This is the richer endpoint; the balance endpoint is a subset.
 */
const getMyAccountHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const account = await getMyAccount(userId);

    logger.info(`Account details retrieved for user: ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Account details retrieved successfully.',
      data:    account,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

/**
 * GET /api/account/admin/:userId
 *
 * Admin-only endpoint.
 * Returns the full account details for the specified user.
 */
const getAccountByUserHandler = async (req, res, next) => {
  try {
    const adminId      = req.user.id;
    const targetUserId = req.params.userId;

    const account = await getAccountByUserId(targetUserId, adminId);

    logger.info(`Admin ${adminId} retrieved account for user: ${targetUserId}`);

    return res.status(200).json({
      success: true,
      message: 'Account details retrieved successfully.',
      data:    account,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = {
  getMyBalanceHandler,
  getMyAccountHandler,
  getAccountByUserHandler,
};
