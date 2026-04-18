/**
 * middleware/rateLimiter.js — API Rate Limiting
 *
 * Limits requests per IP to prevent brute-force attacks.
 * Applied globally to all /api/* routes in app.js.
 */

'use strict';

const rateLimit = require('express-rate-limit');

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 100,                  // Max 100 requests per window per IP
  standardHeaders: true,     // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please wait 15 minutes and try again.',
  },
});

module.exports = rateLimiter;
