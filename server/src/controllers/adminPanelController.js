'use strict';

/**
 * server/src/controllers/adminPanelController.js
 *
 * Feature 15 — Admin Panel HTTP layer.
 */

const {
  getAdminOverview,

  listUsersForAdmin,
  getUserDetailsForAdmin,
  updateUserActiveStatusForAdmin,
  banUserForAdmin,
  unbanUserForAdmin,
  updateUserRoleForAdmin,

  listTransactionsForAdmin,
  getTransactionDetailsForAdmin,

  listSupportTicketsForAdminPanel,
  getSupportTicketDetailsForAdminPanel,
  manageSupportTicketForAdminPanel,
} = require('../services/adminPanelService');

const logger = require('../utils/logger');
const { sendError } = require('../utils/controllerHelpers');

const overviewHandler = async (req, res, next) => {
  try {
    const data = await getAdminOverview();

    return res.status(200).json({
      success: true,
      message: 'Admin overview retrieved successfully.',
      data,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const listUsersHandler = async (req, res, next) => {
  try {
    const data = await listUsersForAdmin(req.query);

    return res.status(200).json({
      success: true,
      message: 'Users retrieved successfully.',
      data,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const getUserHandler = async (req, res, next) => {
  try {
    const user = await getUserDetailsForAdmin(req.params.userId);

    return res.status(200).json({
      success: true,
      message: 'User details retrieved successfully.',
      data: user,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const updateUserStatusHandler = async (req, res, next) => {
  try {
    const user = await updateUserActiveStatusForAdmin({
      adminUserId: req.user.id,
      targetUserId: req.params.userId,
      isActive: req.body.isActive,
      reason: req.body.reason,
    });

    logger.info(`Admin ${req.user.id} updated active status for user ${req.params.userId}`);

    return res.status(200).json({
      success: true,
      message: 'User active status updated successfully.',
      data: user,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const banUserHandler = async (req, res, next) => {
  try {
    const user = await banUserForAdmin({
      adminUserId: req.user.id,
      targetUserId: req.params.userId,
      reason: req.body.reason,
    });

    logger.warn(`Admin ${req.user.id} banned user ${req.params.userId}`);

    return res.status(200).json({
      success: true,
      message: 'User banned successfully.',
      data: user,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const unbanUserHandler = async (req, res, next) => {
  try {
    const user = await unbanUserForAdmin({
      adminUserId: req.user.id,
      targetUserId: req.params.userId,
      reason: req.body.reason,
    });

    logger.info(`Admin ${req.user.id} unbanned user ${req.params.userId}`);

    return res.status(200).json({
      success: true,
      message: 'User unbanned successfully.',
      data: user,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const updateUserRoleHandler = async (req, res, next) => {
  try {
    const user = await updateUserRoleForAdmin({
      adminUserId: req.user.id,
      targetUserId: req.params.userId,
      role: req.body.role,
    });

    logger.info(`Admin ${req.user.id} updated role for user ${req.params.userId}`);

    return res.status(200).json({
      success: true,
      message: 'User role updated successfully.',
      data: user,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const listTransactionsHandler = async (req, res, next) => {
  try {
    const data = await listTransactionsForAdmin(req.query);

    return res.status(200).json({
      success: true,
      message: 'Transactions retrieved successfully.',
      data,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const getTransactionHandler = async (req, res, next) => {
  try {
    const transaction = await getTransactionDetailsForAdmin(req.params.transactionId);

    return res.status(200).json({
      success: true,
      message: 'Transaction details retrieved successfully.',
      data: transaction,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const listSupportTicketsHandler = async (req, res, next) => {
  try {
    const data = await listSupportTicketsForAdminPanel(req.query);

    return res.status(200).json({
      success: true,
      message: 'Support tickets retrieved successfully.',
      data,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const getSupportTicketHandler = async (req, res, next) => {
  try {
    const ticket = await getSupportTicketDetailsForAdminPanel(req.params.ticketId);

    return res.status(200).json({
      success: true,
      message: 'Support ticket details retrieved successfully.',
      data: ticket,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const manageSupportTicketHandler = async (req, res, next) => {
  try {
    const ticket = await manageSupportTicketForAdminPanel(
      req.user.id,
      req.params.ticketId,
      req.body
    );

    logger.info(`Admin ${req.user.id} managed support ticket ${req.params.ticketId}`);

    return res.status(200).json({
      success: true,
      message: 'Support ticket managed successfully.',
      data: ticket,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = {
  overviewHandler,

  listUsersHandler,
  getUserHandler,
  updateUserStatusHandler,
  banUserHandler,
  unbanUserHandler,
  updateUserRoleHandler,

  listTransactionsHandler,
  getTransactionHandler,

  listSupportTicketsHandler,
  getSupportTicketHandler,
  manageSupportTicketHandler,
};