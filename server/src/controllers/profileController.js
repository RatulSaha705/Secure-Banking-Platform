'use strict';

/**
 * server/src/controllers/profileController.js
 *
 * Profile Management HTTP layer — Feature 6.
 *
 * GET  /api/profile/me            getProfile      (authenticated)
 * PUT  /api/profile/me            updateProfile   (authenticated)
 * GET  /api/profile/admin/:userId adminGetProfile (admin only)
 */

const { getMyProfile, updateMyProfile, getProfileByUserId } = require('../services/profileService');
const logger      = require('../utils/logger');
const { sendError } = require('../utils/controllerHelpers');

const getProfile = async (req, res, next) => {
  try {
    const profile = await getMyProfile(req.user.id);
    logger.info(`Profile retrieved for user: ${req.user.id}`);
    return res.status(200).json({ success: true, message: 'Profile retrieved successfully.', profile });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const profile = await updateMyProfile(req.user.id, req.body);
    logger.info(`Profile updated for user: ${req.user.id}`);
    return res.status(200).json({ success: true, message: 'Profile updated successfully.', profile });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const adminGetProfile = async (req, res, next) => {
  try {
    const profile = await getProfileByUserId(req.params.userId);
    logger.info(`Admin (${req.user.id}) retrieved profile for user: ${req.params.userId}`);
    return res.status(200).json({ success: true, message: 'Profile retrieved successfully.', profile });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = { getProfile, updateProfile, adminGetProfile };
