'use strict';

/**
 * utils/logger.js — Winston Logger
 *
 * Outputs to console always.
 * File transports (logs/error.log, logs/combined.log) are added only after
 * ensuring the logs/ directory exists — preventing startup crashes on a fresh
 * clone where the directory has not been created yet.
 */

const winston = require('winston');
const path    = require('path');
const fs      = require('fs');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// ── Log directory ─────────────────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, '../../logs');

// Ensure the directory exists synchronously at module load time
// so the File transports below never error on a fresh checkout.
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ── Formats ───────────────────────────────────────────────────────────────────
const logFormat = printf(({ level, message, timestamp: ts, stack }) =>
  `[${ts}] ${level}: ${stack || message}`
);

const baseFormat = combine(
  errors({ stack: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  logFormat
);

// ── Transports ────────────────────────────────────────────────────────────────
const transports = [
  // Console — always active; colorised in non-production
  new winston.transports.Console({
    format: combine(colorize(), logFormat),
  }),

  // Error-only file
  new winston.transports.File({
    filename: path.join(LOG_DIR, 'error.log'),
    level: 'error',
  }),

  // Combined file (all levels)
  new winston.transports.File({
    filename: path.join(LOG_DIR, 'combined.log'),
  }),
];

// ── Logger instance ───────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: baseFormat,
  transports,
});

module.exports = logger;
