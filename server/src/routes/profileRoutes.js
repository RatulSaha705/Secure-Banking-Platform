'use strict';

/**
 * server/src/routes/profileRoutes.js
 *
 * Profile Management routes — Feature 6.
 *
 * Mount point (in app.js): /api/profile
 *
 * Routes
 * ──────
 *   GET  /api/profile/me              – Get own profile        (any authenticated user)
 *   PUT  /api/profile/me              – Update own profile     (any authenticated user)
 *   GET  /api/profile/admin/:userId   – Get any user's profile (admin only)
 *
 * Middleware chain per route
 * ──────────────────────────
 *   requireAuth           – Validates the Bearer access token and attaches
 *                           req.user (id, role, sessionId).
 *   requireAdmin          – Additional RBAC check: role must be 'admin'.
 *   <validation rules>    – express-validator rules specific to each endpoint.
 *   handleValidation      – Converts validation errors to a 400 JSON response.
 *   <controller handler>  – Actual business logic delegation.
 */

const express = require('express');

const router = express.Router();

const {
  getProfile,
  updateProfile,
  adminGetProfile,
} = require('../controllers/profileController');

const {
  requireAuth,
  requireAdmin,
} = require('../middleware/authMiddleware');

const {
  updateProfileRules,
  adminGetProfileRules,
  handleValidation,
} = require('../validators/profileValidator');

// ── User-facing routes (any authenticated user) ───────────────────────────────

/**
 * GET /api/profile/me
 *
 * Returns the caller's own decrypted profile.
 * Auto-provisions a profile document on first access.
 */
router.get('/me', requireAuth, getProfile);

/**
 * PUT /api/profile/me
 *
 * Partially updates the caller's own profile.
 * All body fields are optional; only valid editable fields are applied.
 *
 * Body (all optional):
 *   username     {string}  3-30 chars, letters/numbers/underscores only
 *   contact      {string}  max 30 chars
 *   phone        {string}  max 30 chars
 *   fullName     {string}  max 100 chars
 *   address      {string}  max 255 chars
 *   dateOfBirth  {string}  YYYY-MM-DD, past date only
 *   nid          {string}  5-30 chars
 */
router.put(
  '/me',
  requireAuth,
  updateProfileRules,
  handleValidation,
  updateProfile
);

// ── Admin-only routes ─────────────────────────────────────────────────────────

/**
 * GET /api/profile/admin/:userId
 *
 * Allows an admin to read any user's profile.
 * Returns the same decrypted profile shape as GET /me.
 *
 * Params:
 *   userId  {string}  Valid MongoDB ObjectId of the target user
 */
router.get(
  '/admin/:userId',
  requireAuth,
  requireAdmin,
  adminGetProfileRules,
  handleValidation,
  adminGetProfile
);

module.exports = router;
