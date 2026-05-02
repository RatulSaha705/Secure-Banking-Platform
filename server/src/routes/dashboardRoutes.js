'use strict';

/**
 * server/src/routes/dashboardRoutes.js
 *
 * Feature 7 — Account Dashboard routes.
 *
 * Mount point (in app.js): /api/dashboard
 *
 * Routes
 * ──────
 *   GET /api/dashboard/summary           – Aggregated user dashboard
 *   GET /api/dashboard/admin/summary     – Aggregated admin dashboard (admin only)
 *
 * Middleware chain
 * ────────────────
 *   requireAuth   – validates Bearer access token, populates req.user
 *   requireAdmin  – (admin route only) asserts req.user.role === 'admin'
 *
 * No body validation is needed because both endpoints are GET requests.
 */

const express = require('express');

const router = express.Router();

const {
  getUserSummary,
  getAdminSummary,
} = require('../controllers/dashboardController');

const {
  requireAuth,
  requireAdmin,
} = require('../middleware/authMiddleware');

// ── User dashboard ────────────────────────────────────────────────────────────

/**
 * GET /api/dashboard/summary
 *
 * Any authenticated user can call this.
 * Returns a multi-section summary:  profile · account · transactions ·
 * notifications · support tickets · quick-actions.
 *
 * Sections that belong to unimplemented modules return
 * { available: false, reason: '...' } instead of failing.
 */
router.get('/summary', requireAuth, getUserSummary);

// ── Admin dashboard ───────────────────────────────────────────────────────────

/**
 * GET /api/dashboard/admin/summary
 *
 * Admin-only endpoint.
 * Returns: total registered users, open support tickets, alert stats,
 * admin quick-action flags.
 */
router.get('/admin/summary', requireAuth, requireAdmin, getAdminSummary);

module.exports = router;
