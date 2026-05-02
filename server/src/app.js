'use strict';

/**
 * app.js — Express Application
 *
 * Routes exposed:
 *   /api/auth
 *   /api/keys
 *   /api/profile
 *   /api/dashboard
 *   /api/account
 *   /api/transfer
 *   /api/beneficiary
 *   /api/support-tickets
 *   /api/notifications
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const keyRoutes = require('./routes/keyRoutes');
const profileRoutes = require('./routes/profileRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const accountRoutes = require('./routes/accountRoutes');
const transferRoutes = require('./routes/transferRoutes');
const beneficiaryRoutes = require('./routes/beneficiaryRoutes');
const supportTicketRoutes = require('./routes/supportTicketRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const rateLimiter = require('./middleware/rateLimiter');
const logger = require('./utils/logger');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: {
      write: (msg) => logger.info(msg.trim()),
    },
  }));
}

app.use('/api/', rateLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/beneficiary', beneficiaryRoutes);
app.use('/api/support-tickets', supportTicketRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

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

module.exports = app;