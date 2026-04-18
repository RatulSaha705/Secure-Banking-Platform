'use strict';

/**
 * controllers/authController.js — Auth HTTP Layer
 *
 * Handles:
 *   - POST /api/auth/register
 *   - POST /api/auth/login
 */

const { registerUser, loginUser } = require('../services/authService');
const logger = require('../utils/logger');

const register = async (req, res, next) => {
  try {
    const { username, email, password, fullName, phone } = req.body;

    const { userId } = await registerUser({
      username,
      email,
      password,
      fullName,
      phone,
    });

    logger.info(`New user registered: ${userId}`);

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please log in.',
      userId,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { accessToken, user } = await loginUser({ email, password });

    logger.info(`User logged in: ${user.id}`);

    return res.status(200).json({
      success: true,
      requiresTwoFactor: false,
      accessToken,
      user,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    next(err);
  }
};

module.exports = { register, login };