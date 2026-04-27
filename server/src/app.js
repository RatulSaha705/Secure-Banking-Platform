'use strict';

/**
 * app.js — Express Application (Phase 1: Registration & Login)
 *
 * Responsibilities:
 *   - Load environment variables
 *   - Connect to MongoDB Atlas
 *   - Mount global middleware (security headers, CORS, JSON parsing, rate limiting)
 *   - Mount route modules
 *   - Start HTTP server
 *   - Global error handling
 *
 * Routes exposed (Phase 1 only):
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   GET  /health
 */

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');

const connectDB      = require('./config/db');
const authRoutes     = require('./routes/authRoutes');
const rateLimiter    = require('./middleware/rateLimiter');
const logger         = require('./utils/logger');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorMiddleware');
const keyRoutes = require('./routes/keyRoutes');

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── HTTP request logging ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ── Rate limiting (all /api/* routes) ────────────────────────────────────────
app.use('/api/', rateLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/keys', keyRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 + Global error handler ────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 5000;

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

startServer();

module.exports = app; // exported for potential test usage
