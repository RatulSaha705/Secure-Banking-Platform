'use strict';

/**
 * server/src/services/tokenService.js
 *
 * Strict encrypted session management.
 *
 * New DB rule:
 *   Only refreshsessions._id is readable.
 *   Everything else is encrypted:
 *     userId, refreshTokenHash, status, dates, IP, userAgent, etc.
 *
 * Consequence:
 *   We cannot query MongoDB by refreshTokenHash anymore.
 *   We load sessions, decrypt them, then compare the hash in backend memory.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const RefreshSession = require('../models/RefreshSession');
const User = require('../models/User');

const { hmacSha256Hex, timingSafeEqualHex } = require('../security/hash/hmac');

const {
  encryptSensitiveFields,
  decryptSensitiveFields,
} = require('../security/storage');

const DEFAULT_ACCESS_EXPIRES_IN = '15m';
const DEFAULT_REFRESH_EXPIRES_IN_DAYS = 7;
const DEFAULT_COOKIE_NAME = 'securebank_refresh';
const DEFAULT_IDLE_TIMEOUT_MINUTES = 5;

const getAccessSecret = () => {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not set in environment');
  }

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

const nowIso = () => {
  return new Date().toISOString();
};

const buildSessionExpiryIso = () => {
  return new Date(Date.now() + getRefreshMaxAgeMs()).toISOString();
};

const buildIdleExpiryIso = () => {
  return new Date(Date.now() + getIdleTimeoutMs()).toISOString();
};

const isExpired = (isoDateValue) => {
  if (!isoDateValue) {
    return true;
  }

  return new Date(isoDateValue).getTime() <= Date.now();
};

const getRequestIp = (req) => {
  if (!req) {
    return null;
  }

  const forwardedFor = req.headers['x-forwarded-for'];

  if (forwardedFor) {
    return String(forwardedFor).split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
};

const getRequestUserAgent = (req) => {
  if (!req) {
    return null;
  }

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

const generateAccessToken = ({
  id,
  role,
  sessionId,
}) => {
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
    path: '/api/auth',
  });
};

const getRefreshTokenFromRequest = (req) => {
  if (!req || !req.cookies) {
    return null;
  }

  return req.cookies[getRefreshCookieName()] || null;
};

const buildRefreshSessionContext = ({
  ownerId,
  sessionId,
}) => {
  return {
    ownerId: String(ownerId),
    documentId: String(sessionId),
    collectionName: 'refreshsessions',
  };
};

const decryptRefreshSession = async (encryptedSession) => {
  if (!encryptedSession) {
    return null;
  }

  const sessionId = String(encryptedSession._id);

  const decrypted = await decryptSensitiveFields(
    'REFRESH_SESSION',
    encryptedSession,
    {
      documentId: sessionId,
      collectionName: 'refreshsessions',
    }
  );

  decrypted._id = sessionId;
  decrypted.id = sessionId;

  return decrypted;
};

const encryptRefreshSession = async (plainSession) => {
  const sessionId = String(plainSession._id);
  const ownerId = String(plainSession.userId);

  return encryptSensitiveFields(
    'REFRESH_SESSION',
    plainSession,
    buildRefreshSessionContext({
      ownerId,
      sessionId,
    })
  );
};

const saveRefreshSessionPlain = async (plainSession) => {
  const encryptedSession = await encryptRefreshSession({
    ...plainSession,
    updatedAt: nowIso(),
  });

  await RefreshSession.replaceOne(
    {
      _id: String(encryptedSession._id),
    },
    encryptedSession,
    {
      upsert: false,
    }
  );
};

const decryptUser = async (encryptedUser) => {
  if (!encryptedUser) {
    return null;
  }

  const userId = String(encryptedUser._id);

  const decrypted = await decryptSensitiveFields(
    'USER',
    encryptedUser,
    {
      ownerId: userId,
      documentId: userId,
      collectionName: 'users',
    }
  );

  decrypted._id = userId;
  decrypted.id = userId;

  return decrypted;
};

const getDecryptedUserById = async (userId) => {
  const encryptedUser = await User.findById(String(userId)).lean();

  if (!encryptedUser) {
    return null;
  }

  return decryptUser(encryptedUser);
};

const assertActiveSession = async (plainSession) => {
  if (!plainSession) {
    const error = new Error('Refresh session not found');
    error.statusCode = 401;
    throw error;
  }

  if (plainSession.status !== 'ACTIVE') {
    const error = new Error('Refresh session is no longer active');
    error.statusCode = 401;
    throw error;
  }

  if (isExpired(plainSession.expiresAt)) {
    plainSession.status = 'EXPIRED';
    plainSession.revokedAt = nowIso();
    plainSession.revokedReason = 'SESSION_EXPIRED';

    await saveRefreshSessionPlain(plainSession);

    const error = new Error('Refresh session expired');
    error.statusCode = 401;
    throw error;
  }

  if (plainSession.idleExpiresAt && isExpired(plainSession.idleExpiresAt)) {
    plainSession.status = 'EXPIRED';
    plainSession.revokedAt = nowIso();
    plainSession.revokedReason = 'IDLE_TIMEOUT';

    await saveRefreshSessionPlain(plainSession);

    const error = new Error('Session ended because of inactivity');
    error.statusCode = 401;
    throw error;
  }

  return true;
};

const createLoginSession = async ({
  user,
  req,
}) => {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const sessionId = crypto.randomBytes(12).toString('hex');
  const timestamp = nowIso();

  const plainSession = {
    _id: sessionId,
    userId: String(user._id || user.id),
    refreshTokenHash,
    status: 'ACTIVE',

    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),

    lastUsedAt: timestamp,
    lastActivityAt: timestamp,
    idleExpiresAt: buildIdleExpiryIso(),
    expiresAt: buildSessionExpiryIso(),

    revokedAt: null,
    revokedReason: null,
    replacedBySessionId: null,

    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const encryptedSession = await encryptRefreshSession(plainSession);
  await RefreshSession.create(encryptedSession);

  const accessToken = generateAccessToken({
    id: plainSession.userId,
    role: user.role,
    sessionId,
  });

  return {
    accessToken,
    refreshToken,
    sessionId,
    sessionExpiresAt: plainSession.expiresAt,
    idleExpiresAt: plainSession.idleExpiresAt,
  };
};

const findSessionByRefreshToken = async (refreshToken) => {
  if (!refreshToken) {
    return null;
  }

  const providedHash = hashRefreshToken(refreshToken);
  const encryptedSessions = await RefreshSession.find({}).lean();

  for (let i = 0; i < encryptedSessions.length; i += 1) {
    const encryptedSession = encryptedSessions[i];
    const plainSession = await decryptRefreshSession(encryptedSession);

    if (!plainSession || !plainSession.refreshTokenHash) {
      continue;
    }

    if (timingSafeEqualHex(providedHash, plainSession.refreshTokenHash)) {
      return {
        encryptedSession,
        plainSession,
      };
    }
  }

  return null;
};

const rotateRefreshSession = async ({
  refreshToken,
  req,
}) => {
  const match = await findSessionByRefreshToken(refreshToken);

  if (!match) {
    const error = new Error('Refresh session not found');
    error.statusCode = 401;
    throw error;
  }

  const currentSession = match.plainSession;

  await assertActiveSession(currentSession);

  const providedHash = hashRefreshToken(refreshToken);

  if (!timingSafeEqualHex(providedHash, currentSession.refreshTokenHash)) {
    const error = new Error('Invalid refresh token');
    error.statusCode = 401;
    throw error;
  }

  const user = await getDecryptedUserById(currentSession.userId);

  if (!user || user.isActive !== true) {
    currentSession.status = 'REVOKED';
    currentSession.revokedAt = nowIso();
    currentSession.revokedReason = 'USER_INACTIVE_OR_NOT_FOUND';

    await saveRefreshSessionPlain(currentSession);

    const error = new Error('User is not active');
    error.statusCode = 401;
    throw error;
  }

  const nextRefreshToken = generateRefreshToken();
  const timestamp = nowIso();
  const nextSessionId = crypto.randomBytes(12).toString('hex');

  const nextSession = {
    _id: nextSessionId,
    userId: String(user._id),
    refreshTokenHash: hashRefreshToken(nextRefreshToken),
    status: 'ACTIVE',

    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),

    lastUsedAt: timestamp,
    lastActivityAt: timestamp,
    idleExpiresAt: buildIdleExpiryIso(),
    expiresAt: buildSessionExpiryIso(),

    revokedAt: null,
    revokedReason: null,
    replacedBySessionId: null,

    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const encryptedNextSession = await encryptRefreshSession(nextSession);
  await RefreshSession.create(encryptedNextSession);

  currentSession.status = 'REVOKED';
  currentSession.revokedAt = timestamp;
  currentSession.revokedReason = 'ROTATED';
  currentSession.replacedBySessionId = nextSessionId;
  currentSession.lastUsedAt = timestamp;

  await saveRefreshSessionPlain(currentSession);

  const accessToken = generateAccessToken({
    id: user._id,
    role: user.role,
    sessionId: nextSessionId,
  });

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    sessionId: nextSessionId,
    sessionExpiresAt: nextSession.expiresAt,
    idleExpiresAt: nextSession.idleExpiresAt,
    user: {
      id: user._id,
      role: user.role,
    },
  };
};

const touchSessionActivity = async ({ sessionId }) => {
  const encryptedSession = await RefreshSession.findById(String(sessionId)).lean();

  if (!encryptedSession) {
    const error = new Error('Session not found');
    error.statusCode = 401;
    throw error;
  }

  const session = await decryptRefreshSession(encryptedSession);

  await assertActiveSession(session);

  session.lastActivityAt = nowIso();
  session.idleExpiresAt = buildIdleExpiryIso();

  await saveRefreshSessionPlain(session);

  return {
    sessionId: String(session._id),
    lastActivityAt: session.lastActivityAt,
    idleExpiresAt: session.idleExpiresAt,
  };
};

const revokeRefreshSession = async ({
  refreshToken,
  reason = 'LOGOUT',
}) => {
  const match = await findSessionByRefreshToken(refreshToken);

  if (!match) {
    return false;
  }

  const session = match.plainSession;

  if (session.status === 'ACTIVE') {
    session.status = 'REVOKED';
    session.revokedAt = nowIso();
    session.revokedReason = reason;

    await saveRefreshSessionPlain(session);
  }

  return true;
};

const revokeSessionById = async ({
  sessionId,
  reason = 'LOGOUT',
}) => {
  if (!sessionId) {
    return false;
  }

  const encryptedSession = await RefreshSession.findById(String(sessionId)).lean();

  if (!encryptedSession) {
    return false;
  }

  const session = await decryptRefreshSession(encryptedSession);

  if (session.status === 'ACTIVE') {
    session.status = reason === 'SESSION_EXPIRED' || reason === 'IDLE_TIMEOUT'
      ? 'EXPIRED'
      : 'REVOKED';

    session.revokedAt = nowIso();
    session.revokedReason = reason;

    await saveRefreshSessionPlain(session);
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

  hashRefreshToken,
  decryptRefreshSession,
  getDecryptedUserById,
};