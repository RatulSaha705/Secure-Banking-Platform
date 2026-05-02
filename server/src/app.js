'use strict';

/**
 * app.js — Express Application
 *
 * Responsibilities:
 *   - Load environment variables
 *   - Connect to MongoDB Atlas
 *   - Mount global middleware (security headers, CORS, JSON parsing, rate limiting)
 *   - Mount route modules
 *   - Start HTTP server
 *   - Global error handling
 *
 * Routes exposed:
 *   POST /api/auth/register          – Registration + OTP
 *   POST /api/auth/login             – Login + OTP 2FA
 *   GET  /api/auth/me                – Current user info
 *   GET  /api/profile/me             – Feature 6: User profile
 *   PUT  /api/profile/me             – Feature 6: Update profile
 *   GET  /api/dashboard/summary      – Feature 7: User dashboard
 *   GET  /api/dashboard/admin/summary – Feature 7: Admin dashboard
 *   GET  /api/account/balance        – Feature 8: View account balance
 *   GET  /api/account/me             – Feature 8: Full account details
 *   GET  /api/account/admin/:userId  – Feature 8: Admin view any account
 *   POST /api/transfer/initiate      – Feature 10: Initiate money transfer
 *   GET  /api/transfer/history       – Feature 10: Transaction history
 *   GET  /api/transfer/history/:id   – Feature 10: Single transaction
 *   GET  /health                     – Liveness probe
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const accountRoutes = require('./routes/accountRoutes');
const transferRoutes = require('./routes/transferRoutes');
const rateLimiter = require('./middleware/rateLimiter');
const logger = require('./utils/logger');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorMiddleware');
const keyRoutes = require('./routes/keyRoutes');

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

// Needed when secure cookies are used behind a proxy in production.
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
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
app.use('/api/profile', profileRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/account',     accountRoutes);
app.use('/api/transfer',    transferRoutes);
app.use('/api/beneficiary', beneficiaryRoutes);

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
