'use strict';

/**
 * server/src/controllers/dashboardController.js
 *
 * Feature 7 — Account Dashboard HTTP layer.
 *
 * GET /api/dashboard/summary        getUserSummary   (authenticated)
 * GET /api/dashboard/admin/summary  getAdminSummary  (admin only)
 */

const { getUserDashboard, getAdminDashboard } = require('../services/dashboardService');
const logger      = require('../utils/logger');
const { sendError } = require('../utils/controllerHelpers');

const getUserSummary = async (req, res, next) => {
  try {
    const summary = await getUserDashboard(req.user.id);
    logger.info(`Dashboard summary served for user: ${req.user.id}`);
    return res.status(200).json({ success: true, message: 'Dashboard summary retrieved successfully.', data: summary });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const getAdminSummary = async (req, res, next) => {
  try {
    const summary = await getAdminDashboard(req.user.id);
    logger.info(`Admin dashboard summary served for admin: ${req.user.id}`);
    return res.status(200).json({ success: true, message: 'Admin dashboard summary retrieved successfully.', data: summary });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = { getUserSummary, getAdminSummary };
