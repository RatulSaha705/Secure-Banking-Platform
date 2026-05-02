'use strict';

/**
 * server/src/controllers/supportTicketController.js
 *
 * Feature 13 — Support Ticket System HTTP layer.
 *
 * Feature 14 integration:
 *   - Admins get notification when user creates a support ticket.
 *   - User gets notification when admin resolves a support ticket.
 */

const {
  createSupportTicket,
  getMySupportTickets,
  getMySupportTicketById,
  updateMySupportTicket,
  addMySupportTicketComment,
  getAllSupportTicketsForAdmin,
  getSupportTicketForAdmin,
  manageSupportTicketAsAdmin,
} = require('../services/supportTicketService');

const {
  safeCreateSupportTicketCreatedAdminNotification,
  safeCreateSupportTicketResolvedUserNotification,
} = require('../services/notificationService');

const logger = require('../utils/logger');
const { sendError } = require('../utils/controllerHelpers');

const createHandler = async (req, res, next) => {
  try {
    const ticket = await createSupportTicket(req.user.id, req.body);

    await safeCreateSupportTicketCreatedAdminNotification(ticket);

    logger.info(`Support ticket created by user ${req.user.id}: ${ticket.id}`);

    return res.status(201).json({
      success: true,
      message: 'Support ticket created successfully.',
      data: ticket,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const listMyHandler = async (req, res, next) => {
  try {
    const result = await getMySupportTickets(req.user.id, req.query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const getMyByIdHandler = async (req, res, next) => {
  try {
    const ticket = await getMySupportTicketById(req.user.id, req.params.id);

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const updateMyHandler = async (req, res, next) => {
  try {
    const ticket = await updateMySupportTicket(req.user.id, req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: 'Support ticket updated successfully.',
      data: ticket,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const addMyCommentHandler = async (req, res, next) => {
  try {
    const ticket = await addMySupportTicketComment(req.user.id, req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: 'Comment added successfully.',
      data: ticket,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const adminListHandler = async (req, res, next) => {
  try {
    const result = await getAllSupportTicketsForAdmin(req.query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const adminGetByIdHandler = async (req, res, next) => {
  try {
    const ticket = await getSupportTicketForAdmin(req.params.id);

    return res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const adminManageHandler = async (req, res, next) => {
  try {
    const ticket = await manageSupportTicketAsAdmin(req.user.id, req.params.id, req.body);

    if (String(ticket.status || '').toUpperCase() === 'RESOLVED') {
      await safeCreateSupportTicketResolvedUserNotification(ticket);
    }

    logger.info(`Support ticket ${ticket.id} managed by admin ${req.user.id}`);

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
  createHandler,
  listMyHandler,
  getMyByIdHandler,
  updateMyHandler,
  addMyCommentHandler,
  adminListHandler,
  adminGetByIdHandler,
  adminManageHandler,
};