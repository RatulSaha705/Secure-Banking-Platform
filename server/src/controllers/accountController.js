'use strict';

/**
 * server/src/controllers/accountController.js
 *
 * Feature 8 — View Account Balance HTTP layer.
 *
 * GET /api/account/balance          getMyBalanceHandler    (authenticated)
 * GET /api/account/me               getMyAccountHandler    (authenticated)
 * GET /api/account/admin/:userId    getAccountByUserHandler (admin only)
 */

const { getMyAccount, getAccountBalance, getAccountByUserId } = require('../services/accountService');
const logger      = require('../utils/logger');
const { sendError } = require('../utils/controllerHelpers');

const getMyBalanceHandler = async (req, res, next) => {
  try {
    const balance = await getAccountBalance(req.user.id);
    logger.info(`Account balance retrieved for user: ${req.user.id}`);
    return res.status(200).json({ success: true, message: 'Account balance retrieved successfully.', data: balance });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const getMyAccountHandler = async (req, res, next) => {
  try {
    const account = await getMyAccount(req.user.id);
    logger.info(`Account details retrieved for user: ${req.user.id}`);
    return res.status(200).json({ success: true, message: 'Account details retrieved successfully.', data: account });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const getAccountByUserHandler = async (req, res, next) => {
  try {
    const account = await getAccountByUserId(req.params.userId);
    logger.info(`Admin ${req.user.id} retrieved account for user: ${req.params.userId}`);
    return res.status(200).json({ success: true, message: 'Account details retrieved successfully.', data: account });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = { getMyBalanceHandler, getMyAccountHandler, getAccountByUserHandler };
