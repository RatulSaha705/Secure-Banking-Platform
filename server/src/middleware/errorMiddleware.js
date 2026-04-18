/**
 * middleware/errorMiddleware.js — Global Error Handlers
 */

'use strict';

const logger = require('../utils/logger');

/**
 * notFoundHandler — Catches requests to undefined routes
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
};

/**
 * globalErrorHandler — Catches all unhandled errors passed via next(err)
 */
const globalErrorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message    = err.message    || 'Internal Server Error';

  logger.error(`[${req.method}] ${req.path} → ${statusCode}: ${message}`);

  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { notFoundHandler, globalErrorHandler };
