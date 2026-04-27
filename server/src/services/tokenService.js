'use strict';

/**
 * server/src/services/tokenService.js
 *
 * Secure Session Management
 * - Short-lived JWT access token
 * - HTTP-only refresh-token cookie
 * - Refresh session storage in MongoDB
 * - Refresh token rotation
 * - Logout/session invalidation
 * - 5-minute idle timeout
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshSession = require('../models/RefreshSession');
const { hmacSha256Hex, timingSafeEqualHex } = require('../security/hash/hmac');

const DEFAULT_ACCESS_EXPIRES_IN = '15m';
const DEFAULT_REFRESH_EXPIRES_IN_DAYS = 7;
const DEFAULT_COOKIE_NAME = 'securebank_refresh';
const DEFAULT_IDLE_TIMEOUT_MINUTES = 5;

const getAccessSecret = () => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set in environment');
  return secret;
};

const getRefreshSecret = () => {
  const secret =
    process.env.JWT_REFRESH_SECRET ||
    process.env.SECURITY_SESSION_SECRET ||
    process.env.SECURITY_MAC_MASTER_KEY ||
    process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error(
      'Missing refresh-token secret. Add JWT_REFRESH_SECRET to server/.env'
    );
  }

  return secret;
};

const getRefreshCookieName = () => {
  return process.env.REFRESH_COOKIE_NAME || DEFAULT_COOKIE_NAME;
};

const getRefreshTtlDays = () => {
  const value = Number(
    process.env.JWT_REFRESH_EXPIRES_IN_DAYS || DEFAULT_REFRESH_EXPIRES_IN_DAYS
  );

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_REFRESH_EXPIRES_IN_DAYS;
  }

  return value;
};

const getIdleTimeoutMinutes = () => {
  const value = Number(
    process.env.SESSION_IDLE_TIMEOUT_MINUTES || DEFAULT_IDLE_TIMEOUT_MINUTES
  );

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_IDLE_TIMEOUT_MINUTES;
  }

  return value;
};

const getRefreshMaxAgeMs = () => {
  return getRefreshTtlDays() * 24 * 60 * 60 * 1000;
};

const getIdleTimeoutMs = () => {
  return getIdleTimeoutMinutes() * 60 * 1000;
};

const buildSessionExpiryDate = () => {
  return new Date(Date.now() + getRefreshMaxAgeMs());
};

const buildIdleExpiryDate = () => {
  return new Date(Date.now() + getIdleTimeoutMs());
};

const getRequestIp = (req) => {
  if (!req) return null;

  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim();

  return req.ip || req.socket?.remoteAddress || null;
};

const getRequestUserAgent = (req) => {
  if (!req) return null;
  return req.get('user-agent') || null;
};

const generateRefreshToken = () => {
  return crypto.randomBytes(48).toString('base64url');
};

const hashRefreshToken = (refreshToken) => {
  return hmacSha256Hex(
    getRefreshSecret(),
    ['secure-banking-refresh-v1', String(refreshToken)].join('|')
  );
};

const generateAccessToken = ({ id, role, sessionId }) => {
  if (!id || !role || !sessionId) {
    throw new Error('id, role, and sessionId are required for access token');
  }

  return jwt.sign(
    {
      id: String(id),
      role: String(role),
      sid: String(sessionId),
    },
    getAccessSecret(),
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || DEFAULT_ACCESS_EXPIRES_IN,
      algorithm: 'HS256',
    }
  );
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, getAccessSecret());
};

const buildCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: getRefreshMaxAgeMs(),
  };
};

const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie(getRefreshCookieName(), refreshToken, buildCookieOptions());
};

const clearRefreshTokenCookie = (res) => {
  res.clearCookie(getRefreshCookieName(), {
    ...buildCookieOptions(),
    maxAge: undefined,
  });
};

const parseCookies = (cookieHeader = '') => {
  return String(cookieHeader)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return cookies;

      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
};

const getRefreshTokenFromRequest = (req) => {
  if (!req) return null;

  if (req.cookies && req.cookies[getRefreshCookieName()]) {
    return req.cookies[getRefreshCookieName()];
  }

  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[getRefreshCookieName()] || null;
};

const expireSession = async (session, reason) => {
  session.status = 'EXPIRED';
  session.revokedAt = new Date();
  session.revokedReason = reason;
  await session.save();
};

const assertActiveSession = async (session) => {
  if (!session) {
    const error = new Error('Session not found');
    error.statusCode = 401;
    throw error;
  }

  if (session.status !== 'ACTIVE') {
    const error = new Error('Session is no longer active');
    error.statusCode = 401;
    throw error;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await expireSession(session, 'SESSION_EXPIRED');

    const error = new Error('Session expired');
    error.statusCode = 401;
    throw error;
  }

  if (session.idleExpiresAt && session.idleExpiresAt.getTime() <= Date.now()) {
    await expireSession(session, 'IDLE_TIMEOUT');

    const error = new Error('Session ended because of 5 minutes inactivity');
    error.statusCode = 401;
    throw error;
  }
};

const createLoginSession = async ({ user, req }) => {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const now = new Date();

  const session = await RefreshSession.create({
    userId: user._id,
    refreshTokenHash,
    status: 'ACTIVE',
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
    lastUsedAt: now,
    lastActivityAt: now,
    idleExpiresAt: buildIdleExpiryDate(),
    expiresAt: buildSessionExpiryDate(),
  });

  const accessToken = generateAccessToken({
    id: user._id.toString(),
    role: user.role,
    sessionId: session._id.toString(),
  });

  return {
    accessToken,
    refreshToken,
    sessionId: session._id.toString(),
    sessionExpiresAt: session.expiresAt,
    idleExpiresAt: session.idleExpiresAt,
  };
};

const findSessionByRefreshToken = async (refreshToken) => {
  if (!refreshToken) return null;

  const refreshTokenHash = hashRefreshToken(refreshToken);

  return RefreshSession.findOne({ refreshTokenHash }).select(
    '+refreshTokenHash'
  );
};

const rotateRefreshSession = async ({ refreshToken, req }) => {
  const currentSession = await findSessionByRefreshToken(refreshToken);
  await assertActiveSession(currentSession);

  const providedHash = hashRefreshToken(refreshToken);

  if (!timingSafeEqualHex(providedHash, currentSession.refreshTokenHash)) {
    const error = new Error('Invalid refresh token');
    error.statusCode = 401;
    throw error;
  }

  const User = require('../models/User');
  const user = await User.findById(currentSession.userId);

  if (!user || !user.isActive) {
    currentSession.status = 'REVOKED';
    currentSession.revokedAt = new Date();
    currentSession.revokedReason = 'USER_INACTIVE_OR_NOT_FOUND';
    await currentSession.save();

    const error = new Error('User is not active');
    error.statusCode = 401;
    throw error;
  }

  const nextRefreshToken = generateRefreshToken();
  const now = new Date();

  const nextSession = await RefreshSession.create({
    userId: user._id,
    refreshTokenHash: hashRefreshToken(nextRefreshToken),
    status: 'ACTIVE',
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
    lastUsedAt: now,
    lastActivityAt: now,
    idleExpiresAt: buildIdleExpiryDate(),
    expiresAt: buildSessionExpiryDate(),
  });

  currentSession.status = 'REVOKED';
  currentSession.revokedAt = now;
  currentSession.revokedReason = 'ROTATED';
  currentSession.replacedBySessionId = nextSession._id;
  currentSession.lastUsedAt = now;
  await currentSession.save();

  const accessToken = generateAccessToken({
    id: user._id.toString(),
    role: user.role,
    sessionId: nextSession._id.toString(),
  });

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    sessionId: nextSession._id.toString(),
    sessionExpiresAt: nextSession.expiresAt,
    idleExpiresAt: nextSession.idleExpiresAt,
    user: {
      id: user._id.toString(),
      role: user.role,
    },
  };
};

const touchSessionActivity = async ({ sessionId }) => {
  if (!sessionId) {
    const error = new Error('Session id is required');
    error.statusCode = 400;
    throw error;
  }

  const session = await RefreshSession.findById(sessionId);

  await assertActiveSession(session);

  const now = new Date();

  session.lastActivityAt = now;
  session.idleExpiresAt = buildIdleExpiryDate();
  await session.save();

  return {
    sessionId: session._id.toString(),
    lastActivityAt: session.lastActivityAt,
    idleExpiresAt: session.idleExpiresAt,
  };
};

const revokeRefreshSession = async ({ refreshToken, reason = 'LOGOUT' }) => {
  const session = await findSessionByRefreshToken(refreshToken);

  if (!session) return false;

  if (session.status === 'ACTIVE') {
    session.status = 'REVOKED';
    session.revokedAt = new Date();
    session.revokedReason = reason;
    await session.save();
  }

  return true;
};

const revokeSessionById = async ({ sessionId, reason = 'LOGOUT' }) => {
  if (!sessionId) return false;

  const session = await RefreshSession.findById(sessionId);

  if (!session) return false;

  if (session.status === 'ACTIVE') {
    session.status = 'REVOKED';
    session.revokedAt = new Date();
    session.revokedReason = reason;
    await session.save();
  }

  return true;
};

module.exports = {
  DEFAULT_ACCESS_EXPIRES_IN,
  DEFAULT_REFRESH_EXPIRES_IN_DAYS,
  DEFAULT_IDLE_TIMEOUT_MINUTES,

  getRefreshCookieName,
  getRefreshMaxAgeMs,
  getIdleTimeoutMs,
  getRefreshTokenFromRequest,

  generateAccessToken,
  verifyAccessToken,

  createLoginSession,
  rotateRefreshSession,
  touchSessionActivity,
  revokeRefreshSession,
  revokeSessionById,

  setRefreshTokenCookie,
  clearRefreshTokenCookie,
};