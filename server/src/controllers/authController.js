'use strict';

/**
 * server/src/controllers/authController.js
 *
 * Auth HTTP layer — Features 1–4.
 * Access token returned only after OTP verification.
 * Refresh token stored as an HTTP-only cookie.
 */

const {
  registerUser,
  completeRegistrationWithOtp,
  loginUser,
  completeLoginWithOtp,
} = require('../services/authService');

const {
  getRefreshTokenFromRequest,
  rotateRefreshSession,
  touchSessionActivity,
  revokeRefreshSession,
  revokeSessionById,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} = require('../services/tokenService');

const logger = require('../utils/logger');
const { sendError } = require('../utils/controllerHelpers');

// ── Handlers ──────────────────────────────────────────────────────────────────

const register = async (req, res, next) => {
  try {
    const { username, email, contact, phone, password, fullName } = req.body;
    const result = await registerUser({ username, email, contact, phone, password, fullName });

    logger.info(`Registration OTP challenge created: ${result.pendingRegistrationId}`);

    return res.status(202).json({
      success:                   true,
      message:                   'OTP sent to your email. Verify OTP to complete registration.',
      requiresEmailVerification: true,
      pendingRegistrationId:     result.pendingRegistrationId,
      challengeId:               result.challengeId,
      expiresAt:                 result.expiresAt,
      maskedEmail:               result.maskedEmail,
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const verifyRegistration = async (req, res, next) => {
  try {
    const { pendingRegistrationId, challengeId, otp } = req.body;
    const result = await completeRegistrationWithOtp({ pendingRegistrationId, challengeId, otp });

    logger.info(`Registration verified and completed: ${result.userId}`);

    return res.status(201).json({
      success: true,
      message: 'Registration verified successfully. Please log in.',
      userId:  result.userId,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { identifier, email, username, password } = req.body;
    const result = await loginUser({ identifier, email, username, password });

    logger.info(`Login OTP challenge created for user: ${result.pendingUser.id}`);

    return res.status(200).json({
      success:           true,
      requiresTwoFactor: true,
      message:           result.message,
      challenge:         result.challenge,
      pendingUser:       result.pendingUser,
      accessToken:       null,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const verifyLogin = async (req, res, next) => {
  try {
    const { challengeId, userId, otp } = req.body;
    const result = await completeLoginWithOtp({ challengeId, userId, otp, req });

    setRefreshTokenCookie(res, result.refreshToken);
    logger.info(`Login 2FA verified and session created for user: ${result.user.id}`);

    return res.status(200).json({
      success:          true,
      message:          'Login verified successfully.',
      accessToken:      result.accessToken,
      sessionExpiresAt: result.sessionExpiresAt,
      user:             result.user,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh session not found' });
    }
    const result = await rotateRefreshSession({ refreshToken, req });
    setRefreshTokenCookie(res, result.refreshToken);

    return res.status(200).json({
      success:          true,
      message:          'Session refreshed successfully.',
      accessToken:      result.accessToken,
      sessionExpiresAt: result.sessionExpiresAt,
      user:             result.user,
    });
  } catch (err) {
    clearRefreshTokenCookie(res);
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const activity = async (req, res, next) => {
  try {
    const result = await touchSessionActivity({ sessionId: req.user.sessionId });
    return res.status(200).json({
      success:        true,
      message:        'Session activity updated.',
      lastActivityAt: result.lastActivityAt,
      idleExpiresAt:  result.idleExpiresAt,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (refreshToken)      await revokeRefreshSession({ refreshToken, reason: 'LOGOUT' });
    if (req.user?.sessionId) await revokeSessionById({ sessionId: req.user.sessionId, reason: 'LOGOUT' });
    clearRefreshTokenCookie(res);
    return res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    clearRefreshTokenCookie(res);
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const me = (_req, res) =>
  res.status(200).json({ success: true, user: { id: _req.user.id, role: _req.user.role } });

module.exports = { register, verifyRegistration, login, verifyLogin, refresh, activity, logout, me };