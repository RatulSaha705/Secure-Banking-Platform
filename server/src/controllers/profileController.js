'use strict';

/**
 * server/src/controllers/profileController.js
 *
 * Profile Management HTTP layer — Feature 6.
 *
 * Endpoints
 * ──────────
 *   GET  /api/profile/me              getProfile   (authenticated users)
 *   PUT  /api/profile/me              updateProfile (authenticated users)
 *   GET  /api/profile/admin/:userId   adminGetProfile (admin only)
 *
 * Authorization model (RBAC)
 * ──────────────────────────
 *   • requireAuth       — all profile endpoints require a valid access token.
 *   • requireAdmin      — adminGetProfile additionally requires the ADMIN role.
 *   • The service itself double-checks userId ownership so the data returned
 *     always belongs to the authenticated caller (or the target user for admin).
 */

const {
  getMyProfile,
  updateMyProfile,
  getProfileByUserId,
} = require('../services/profileService');

const logger = require('../utils/logger');

// ── Error helper (mirrors authController pattern) ────────────────────────────

const sendError = (res, err) =>
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server error',
  });

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * GET /api/profile/me
 *
 * Returns the authenticated user's decrypted profile.
 * If no profile document exists yet, one is auto-provisioned from the User
 * record and returned immediately.
 */
const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const profile = await getMyProfile(userId);

    logger.info(`Profile retrieved for user: ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully.',
      profile,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

/**
 * PUT /api/profile/me
 *
 * Applies a partial update to the authenticated user's profile.
 * Only explicitly sent editable fields are changed.
 * Immutable fields (email, userId, createdAt) are silently ignored even if
 * included in the request body.
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId  = req.user.id;
    const updates = req.body;

    const updatedProfile = await updateMyProfile(userId, updates);

    logger.info(`Profile updated for user: ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      profile: updatedProfile,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

/**
 * GET /api/profile/admin/:userId
 *
 * Admin-only endpoint: retrieves and decrypts any user's profile by userId.
 * Requires the ADMIN role (enforced at the route level via requireAdmin).
 */
const adminGetProfile = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId;
    const requesterId  = req.user.id;

    const profile = await getProfileByUserId(targetUserId, requesterId);

    logger.info(
      `Admin (${requesterId}) retrieved profile for user: ${targetUserId}`
    );

    return res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully.',
      profile,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  adminGetProfile,
};
