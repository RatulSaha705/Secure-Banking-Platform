'use strict';

/**
 * server/src/controllers/dashboardController.js
 *
 * Feature 7 — Account Dashboard HTTP layer.
 *
 * Handlers
 * ────────
 *   getUserSummary   – GET /api/dashboard/summary      (any authenticated user)
 *   getAdminSummary  – GET /api/dashboard/admin/summary (admin only)
 *
 * RBAC
 * ────
 *   requireAuth      – enforced at route level for all dashboard endpoints.
 *   requireAdmin     – enforced at route level for the admin endpoint.
 */

const {
  getUserDashboard,
  getAdminDashboard,
} = require('../services/dashboardService');

const logger = require('../utils/logger');

// ── Shared error helper (mirrors existing controller pattern) ─────────────────

const sendError = (res, err) =>
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server error',
  });

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * GET /api/dashboard/summary
 *
 * Returns an aggregated dashboard summary for the authenticated user:
 *   • profile snapshot (live, decrypted)
 *   • account summary (stub until Account module is built)
 *   • recent transactions (stub)
 *   • notification count (stub)
 *   • support ticket summary (stub)
 *   • quick-actions list with availability flags
 *
 * Any unavailable module returns { available: false, reason: '...' } instead
 * of causing a 500 error — the dashboard always loads even during development.
 */
const getUserSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const summary = await getUserDashboard(userId);

    logger.info(`Dashboard summary served for user: ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Dashboard summary retrieved successfully.',
      data:    summary,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

/**
 * GET /api/dashboard/admin/summary
 *
 * Returns an aggregated admin dashboard summary:
 *   • total registered users (live)
 *   • open support ticket stats (stub)
 *   • pending notification / alert stats (stub)
 *   • admin quick-actions list with availability flags
 *
 * Requires ADMIN role — enforced at route level via requireAdmin.
 */
const getAdminSummary = async (req, res, next) => {
  try {
    const adminId = req.user.id;

    const summary = await getAdminDashboard(adminId);

    logger.info(`Admin dashboard summary served for admin: ${adminId}`);

    return res.status(200).json({
      success: true,
      message: 'Admin dashboard summary retrieved successfully.',
      data:    summary,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = {
  getUserSummary,
  getAdminSummary,
};
