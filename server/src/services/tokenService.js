'use strict';

/**
 * services/tokenService.js — JWT Access Token (Phase 1)
 *
 * Keeps it minimal for this phase: only access token generation and verification.
 * No refresh token, no cookie logic — not needed until a protected route phase.
 *
 * EXTENSION PATH (Phase 2/3):
 *   - Add generateRefreshToken + setRefreshTokenCookie for persistent sessions.
 *   - Phase 3: Replace jwt.sign with from-scratch ECDSA signing.
 */

const jwt = require('jsonwebtoken');

/**
 * generateAccessToken
 * Creates a short-lived JWT signed with JWT_ACCESS_SECRET.
 *
 * @param {{ id: string, role: string }} payload
 * @returns {string} Signed JWT
 */
const generateAccessToken = (payload) => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set in environment');

  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    algorithm: 'HS256',
  });
};

/**
 * verifyAccessToken
 * Verifies and decodes a JWT access token.
 *
 * @param {string} token
 * @returns {object} Decoded payload
 * @throws {Error} If token is invalid or expired
 */
const verifyAccessToken = (token) => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set in environment');
  return jwt.verify(token, secret);
};

module.exports = { generateAccessToken, verifyAccessToken };
