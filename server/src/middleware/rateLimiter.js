'use strict';

/**
 * server/src/middleware/rateLimiter.js
 *
 * API Rate Limiting
 *
 * Why this file exists:
 * - The old project used one strict global limiter for every /api request.
 * - That caused normal dashboard/page navigation to hit:
 *   "Too many requests from this IP."
 *
 * New design:
 * - generalApiLimiter: normal authenticated app browsing
 * - authLimiter: login/register brute-force protection
 * - otpLimiter: OTP verification brute-force protection
 * - refreshLimiter: refresh-token/session renewal protection
 * - activityLimiter: session activity sync protection
 *
 * This keeps security strong without blocking normal users.
 */

const rateLimit = require('express-rate-limit');

const buildMessage = (message) => {
  return {
    success: false,
    message,
  };
};

const buildLimiter = ({
  windowMs,
  max,
  message,
}) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: buildMessage(message),
  });
};

/**
 * General API limiter.
 *
 * Used for normal protected app pages:
 * dashboard, account balance, profile, notifications,
 * transactions, support tickets, admin panel, etc.
 */
const generalApiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GENERAL_MAX || 1000),
  message: 'Too many requests. Please wait a moment and try again.',
});

/**
 * Auth limiter.
 *
 * Used for login and registration.
 * Keep this strict because these endpoints can be brute-forced.
 */
const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 30),
  message: 'Too many authentication attempts. Please wait 15 minutes and try again.',
});

/**
 * OTP limiter.
 *
 * Used for register/login OTP verification.
 * Keep this stricter than normal browsing.
 */
const otpLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_OTP_MAX || 20),
  message: 'Too many verification attempts. Please wait 15 minutes and try again.',
});

/**
 * Refresh limiter.
 *
 * Used for session refresh.
 * This must not be too low because refresh can happen automatically.
 */
const refreshLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_REFRESH_MAX || 200),
  message: 'Too many session refresh requests. Please wait a moment and try again.',
});

/**
 * Activity limiter.
 *
 * Used for session activity tracking.
 * This endpoint is called while the user interacts with the app.
 */
const activityLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ACTIVITY_MAX || 300),
  message: 'Too many activity requests. Please wait a moment and try again.',
});

module.exports = {
  generalApiLimiter,
  authLimiter,
  otpLimiter,
  refreshLimiter,
  activityLimiter,
};