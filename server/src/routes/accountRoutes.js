'use strict';

/**
 * server/src/routes/accountRoutes.js
 *
 * Feature 8 — View Account Balance routes.
 *
 * Mount point (in app.js): /api/account
 *
 * Routes
 * ──────
 *   GET /api/account/balance           – Current balance summary (any auth user)
 *   GET /api/account/me                – Full account details   (any auth user)
 *   GET /api/account/admin/:userId     – Any user's account     (admin only)
 *
 * Middleware chain
 * ────────────────
 *   requireAuth   – validates Bearer access token, populates req.user
 *   requireAdmin  – (admin route only) asserts req.user.role === 'admin'
 */

const express = require('express');

const router = express.Router();

const {
  getMyBalanceHandler,
  getMyAccountHandler,
  getAccountByUserHandler,
} = require('../controllers/accountController');

const {
  requireAuth,
  requireAdmin,
} = require('../middleware/authMiddleware');

// ── User routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/account/balance
 *
 * Returns: totalBalance, availableBalance, pendingAmount,
 *          accountStatus, accountNumber, accountType, branchName, asOf.
 *
 * Auto-provisions an account on first access.
 */
router.get('/balance', requireAuth, getMyBalanceHandler);

/**
 * GET /api/account/me
 *
 * Returns the complete account document for the authenticated user.
 */
router.get('/me', requireAuth, getMyAccountHandler);

// ── Admin routes ──────────────────────────────────────────────────────────────

/**
 * GET /api/account/admin/:userId
 *
 * Admin-only.  Returns any user's full account details.
 */
router.get('/admin/:userId', requireAuth, requireAdmin, getAccountByUserHandler);

module.exports = router;
