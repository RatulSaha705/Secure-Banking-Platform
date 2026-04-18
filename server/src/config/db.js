'use strict';

/**
 * config/db.js — MongoDB Connection via Mongoose
 *
 * Establishes a connection to MongoDB Atlas and attaches lifecycle event
 * listeners for disconnect / error events.
 *
 * Called once from app.js startServer().
 * Throws on failure so the caller can handle process.exit.
 */

const mongoose = require('mongoose');
const logger   = require('../utils/logger');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set in environment');

  const conn = await mongoose.connect(uri);

  logger.info(`MongoDB connected: ${conn.connection.host}`);

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB error: ${err.message}`);
  });
};

module.exports = connectDB;
