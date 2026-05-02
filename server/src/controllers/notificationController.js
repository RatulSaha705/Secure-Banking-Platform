'use strict';

/**
 * server/src/controllers/notificationController.js
 *
 * Feature 14 — Notifications and Alerts HTTP layer.
 */

const {
  getMyNotifications,
  getMyUnreadNotificationCount,
  markNotificationAsRead,
  markAllMyNotificationsAsRead,
  createNotification,
} = require('../services/notificationService');

const logger = require('../utils/logger');
const { sendError } = require('../utils/controllerHelpers');

const listMyNotificationsHandler = async (req, res, next) => {
  try {
    const result = await getMyNotifications(req.user.id, req.query);

    return res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully.',
      data: result,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const unreadCountHandler = async (req, res, next) => {
  try {
    const result = await getMyUnreadNotificationCount(req.user.id);

    return res.status(200).json({
      success: true,
      message: 'Unread notification count retrieved successfully.',
      data: result,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const markReadHandler = async (req, res, next) => {
  try {
    const notification = await markNotificationAsRead(req.user.id, req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: notification,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const markAllReadHandler = async (req, res, next) => {
  try {
    const result = await markAllMyNotificationsAsRead(req.user.id);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
      data: result,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const adminSendUserNotificationHandler = async (req, res, next) => {
  try {
    const notification = await createNotification({
      userId: req.params.userId,
      type: req.body.type || 'GENERAL_ALERT',
      title: req.body.title,
      message: req.body.message,
      body: req.body.body,
    });

    logger.info(`Admin ${req.user.id} created notification for user ${req.params.userId}`);

    return res.status(201).json({
      success: true,
      message: 'Notification sent successfully.',
      data: notification,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = {
  listMyNotificationsHandler,
  unreadCountHandler,
  markReadHandler,
  markAllReadHandler,
  adminSendUserNotificationHandler,
};