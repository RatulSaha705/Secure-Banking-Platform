'use strict';

/**
 * server/src/controllers/authController.js
 *
 * Feature 9 auth HTTP layer.
 */

const {
  registerUser,
  completeRegistrationWithOtp,
  loginUser,
  completeLoginWithOtp,
} = require('../services/authService');

const logger = require('../utils/logger');

const sendError = (res, err) => {
  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server error',
  });
};

const register = async (req, res, next) => {
  try {
    const {
      username,
      email,
      contact,
      phone,
      password,
      fullName,
    } = req.body;

    const result = await registerUser({
      username,
      email,
      contact,
      phone,
      password,
      fullName,
    });

    logger.info(`Registration OTP challenge created: ${result.pendingRegistrationId}`);

    return res.status(202).json({
      success: true,
      message: 'OTP sent to your email. Verify OTP to complete registration.',
      requiresEmailVerification: true,
      pendingRegistrationId: result.pendingRegistrationId,
      challengeId: result.challengeId,
      expiresAt: result.expiresAt,
      maskedEmail: result.maskedEmail,
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const verifyRegistration = async (req, res, next) => {
  try {
    const {
      pendingRegistrationId,
      challengeId,
      otp,
    } = req.body;

    const result = await completeRegistrationWithOtp({
      pendingRegistrationId,
      challengeId,
      otp,
    });

    logger.info(`Registration verified and completed: ${result.userId}`);

    return res.status(201).json({
      success: true,
      message: 'Registration verified successfully. Please log in.',
      userId: result.userId,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const {
      identifier,
      email,
      username,
      password,
    } = req.body;

    const result = await loginUser({
      identifier,
      email,
      username,
      password,
    });

    logger.info(`Login OTP challenge created for user: ${result.pendingUser.id}`);

    return res.status(200).json({
      success: true,
      requiresTwoFactor: true,
      message: result.message,
      challenge: result.challenge,
      pendingUser: result.pendingUser,
      accessToken: null,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

const verifyLogin = async (req, res, next) => {
  try {
    const {
      challengeId,
      userId,
      otp,
    } = req.body;

    const result = await completeLoginWithOtp({
      challengeId,
      userId,
      otp,
    });

    logger.info(`Login 2FA verified for user: ${result.user.id}`);

    return res.status(200).json({
      success: true,
      message: 'Login verified successfully.',
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = {
  register,
  verifyRegistration,
  login,
  verifyLogin,
};