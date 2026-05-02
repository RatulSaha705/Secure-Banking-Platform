'use strict';

/**
 * server/src/controllers/supportTicketController.js
 *
 * Feature 13 — Support Ticket System HTTP layer.
 *
 * Feature 14 integration:
 *   - Admins get notification when user creates a support ticket.
 *   - User gets notification when admin changes ticket status/priority marking.
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
  createNotification,
} = require('../services/notificationService');

const logger = require('../utils/logger');
const { sendError } = require('../utils/controllerHelpers');

const formatStatusLabel = (status) => {
  const clean = String(status || '').trim().toUpperCase();

  if (clean === 'OPEN') return 'Open';
  if (clean === 'IN_PROGRESS') return 'In Progress';
  if (clean === 'WAITING_USER') return 'Waiting User';
  if (clean === 'RESOLVED') return 'Resolved';
  if (clean === 'CLOSED') return 'Closed';

  return clean || 'Unknown';
};

const formatPriorityLabel = (priority) => {
  const clean = String(priority || '').trim().toUpperCase();

  if (clean === 'LOW') return 'Low';
  if (clean === 'MEDIUM') return 'Medium';
  if (clean === 'HIGH') return 'High';
  if (clean === 'URGENT') return 'Urgent';

  return clean || 'Unknown';
};

const notifyUserAboutTicketMarkingChange = async ({ oldTicket, newTicket }) => {
  try {
    if (!oldTicket || !newTicket) {
      return null;
    }

    const oldStatus = String(oldTicket.status || '').toUpperCase();
    const newStatus = String(newTicket.status || '').toUpperCase();
    const oldPriority = String(oldTicket.priority || '').toUpperCase();
    const newPriority = String(newTicket.priority || '').toUpperCase();

    const statusChanged = oldStatus !== newStatus;
    const priorityChanged = oldPriority !== newPriority;

    if (!statusChanged && !priorityChanged) {
      return null;
    }

    let title = 'Support ticket updated';
    let message = `Your support ticket "${newTicket.title}" was updated by admin.`;

    if (statusChanged) {
      title = 'Support ticket status changed';
      message =
        `Your support ticket "${newTicket.title}" is now marked as ` +
        `${formatStatusLabel(newStatus)}.`;
    }

    if (newStatus === 'RESOLVED') {
      title = 'Support ticket resolved';
      message = `Your support ticket "${newTicket.title}" has been marked as Resolved.`;
    }

    const body =
      `Ticket ID: ${newTicket.id}. ` +
      `Old Status: ${formatStatusLabel(oldStatus)}. ` +
      `New Status: ${formatStatusLabel(newStatus)}. ` +
      `Old Priority: ${formatPriorityLabel(oldPriority)}. ` +
      `New Priority: ${formatPriorityLabel(newPriority)}. ` +
      `Please check your Support Tickets page for details.`;

    return await createNotification({
      userId: newTicket.userId,
      type: newStatus === 'RESOLVED' ? 'SUPPORT_TICKET_RESOLVED' : 'GENERAL_ALERT',
      title,
      message,
      body,
    });
  } catch {
    return null;
  }
};

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
    const oldTicket = await getSupportTicketForAdmin(req.params.id);

    const ticket = await manageSupportTicketAsAdmin(req.user.id, req.params.id, req.body);

    await notifyUserAboutTicketMarkingChange({
      oldTicket,
      newTicket: ticket,
    });

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