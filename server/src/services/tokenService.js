'use strict';

/**
 * server/src/services/tokenService.js
 *
 * Strict encrypted session management — Feature 4.
 *
 * DB rule: Only refreshsessions._id is readable.
 * All other session fields (userId, refreshTokenHash, status, dates, IP,
 * userAgent, etc.) are encrypted before write and decrypted after read.
 *
 * Because refreshTokenHash is encrypted we cannot query by it.
 * We load all sessions, decrypt each, then compare the hash in memory.
 */

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');

const RefreshSession = require('../models/RefreshSession');
const User           = require('../models/User');

const { hmacSha256Hex, timingSafeEqualHex } = require('../security/hash/hmac');
const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/storage');
const { nowIso } = require('../utils/serviceHelpers');

// ── Config helpers ────────────────────────────────────────────────────────────

const DEFAULT_ACCESS_EXPIRES_IN       = '15m';
const DEFAULT_REFRESH_EXPIRES_IN_DAYS = 7;
const DEFAULT_IDLE_TIMEOUT_MINUTES    = 5;

const getAccessSecret = () => {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('JWT_ACCESS_SECRET is not set in environment');
  return s;
};

const getRefreshSecret = () => {
  const s =
    process.env.JWT_REFRESH_SECRET     ||
    process.env.SECURITY_SESSION_SECRET ||
    process.env.SECURITY_MAC_MASTER_KEY ||
    process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('Missing refresh-token secret. Add JWT_REFRESH_SECRET to server/.env');
  return s;
};

const getRefreshCookieName = () => process.env.REFRESH_COOKIE_NAME || 'securebank_refresh';

const getRefreshTtlDays = () => {
  const v = Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || DEFAULT_REFRESH_EXPIRES_IN_DAYS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_REFRESH_EXPIRES_IN_DAYS;
};

const getIdleTimeoutMinutes = () => {
  const v = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES || DEFAULT_IDLE_TIMEOUT_MINUTES);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_IDLE_TIMEOUT_MINUTES;
};

const getRefreshMaxAgeMs  = () => getRefreshTtlDays()      * 24 * 60 * 60 * 1000;
const getIdleTimeoutMs    = () => getIdleTimeoutMinutes()   * 60 * 1000;

const buildSessionExpiryIso = () => new Date(Date.now() + getRefreshMaxAgeMs()).toISOString();
const buildIdleExpiryIso    = () => new Date(Date.now() + getIdleTimeoutMs()).toISOString();

const isExpired = (isoDate) => !isoDate || new Date(isoDate).getTime() <= Date.now();

// ── Request metadata ──────────────────────────────────────────────────────────

const getRequestIp = (req) => {
  if (!req) return null;
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
};

const getRequestUserAgent = (req) => req ? (req.get('user-agent') || null) : null;

// ── Cookie helpers ────────────────────────────────────────────────────────────

const buildCookieOptions = () => {
  const prod = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure:   prod,
    sameSite: prod ? 'strict' : 'lax',
    path:     '/api/auth',
    maxAge:   getRefreshMaxAgeMs(),
  };
};

const setRefreshTokenCookie   = (res, token) => res.cookie(getRefreshCookieName(), token, buildCookieOptions());
const clearRefreshTokenCookie = (res) => res.clearCookie(getRefreshCookieName(), { path: '/api/auth' });

const getRefreshTokenFromRequest = (req) =>
  req?.cookies ? (req.cookies[getRefreshCookieName()] || null) : null;

// ── Token helpers ─────────────────────────────────────────────────────────────

const generateRefreshToken = () => crypto.randomBytes(48).toString('base64url');

const hashRefreshToken = (token) =>
  hmacSha256Hex(getRefreshSecret(), ['secure-banking-refresh-v1', String(token)].join('|'));

const generateAccessToken = ({ id, role, sessionId }) => {
  if (!id || !role || !sessionId) throw new Error('id, role, and sessionId are required for access token');
  return jwt.sign(
    { id: String(id), role: String(role), sid: String(sessionId) },
    getAccessSecret(),
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || DEFAULT_ACCESS_EXPIRES_IN, algorithm: 'HS256' }
  );
};

const verifyAccessToken = (token) => jwt.verify(token, getAccessSecret());

// ── Session encryption ────────────────────────────────────────────────────────

const sessionCtx = (ownerId, sessionId) => ({
  ownerId:        String(ownerId),
  documentId:     String(sessionId),
  collectionName: 'refreshsessions',
});

const decryptRefreshSession = async (enc) => {
  if (!enc) return null;
  const sessionId = String(enc._id);
  const dec = await decryptSensitiveFields('REFRESH_SESSION', enc, {
    documentId:     sessionId,
    collectionName: 'refreshsessions',
  });
  dec._id = sessionId;
  dec.id  = sessionId;
  return dec;
};

const encryptRefreshSession = (plain) =>
  encryptSensitiveFields('REFRESH_SESSION', plain, sessionCtx(plain.userId, plain._id));

const saveRefreshSessionPlain = async (plain) => {
  const enc = await encryptRefreshSession({ ...plain, updatedAt: nowIso() });
  await RefreshSession.replaceOne({ _id: String(enc._id) }, enc, { upsert: false });
};

// ── User decrypt (kept local to avoid circular authService ↔ tokenService) ───

const _decryptUserLocal = async (enc) => {
  if (!enc) return null;
  const uid = String(enc._id);
  const dec = await decryptSensitiveFields('USER', enc, {
    ownerId: uid, documentId: uid, collectionName: 'users',
  });
  dec._id = uid;
  dec.id  = uid;
  return dec;
};

const _getDecryptedUserById = async (userId) => {
  const enc = await User.findById(String(userId)).lean();
  if (!enc) return null;
  return _decryptUserLocal(enc);
};

// ── Session assertion ─────────────────────────────────────────────────────────

const assertActiveSession = async (plain) => {
  if (!plain) {
    const err = new Error('Refresh session not found'); err.statusCode = 401; throw err;
  }
  if (plain.status !== 'ACTIVE') {
    const err = new Error('Refresh session is no longer active'); err.statusCode = 401; throw err;
  }
  if (isExpired(plain.expiresAt)) {
    plain.status = 'EXPIRED'; plain.revokedAt = nowIso(); plain.revokedReason = 'SESSION_EXPIRED';
    await saveRefreshSessionPlain(plain);
    const err = new Error('Refresh session expired'); err.statusCode = 401; throw err;
  }
  if (plain.idleExpiresAt && isExpired(plain.idleExpiresAt)) {
    plain.status = 'EXPIRED'; plain.revokedAt = nowIso(); plain.revokedReason = 'IDLE_TIMEOUT';
    await saveRefreshSessionPlain(plain);
    const err = new Error('Session ended because of inactivity'); err.statusCode = 401; throw err;
  }
  return true;
};

// ── Public API ────────────────────────────────────────────────────────────────

/** Creates a new login session and returns tokens. */
const createLoginSession = async ({ user, req }) => {
  const refreshToken     = generateRefreshToken();
  const sessionId        = crypto.randomBytes(12).toString('hex');
  const timestamp        = nowIso();

  const plain = {
    _id:                 sessionId,
    userId:              String(user._id || user.id),
    refreshTokenHash:    hashRefreshToken(refreshToken),
    status:              'ACTIVE',
    ipAddress:           getRequestIp(req),
    userAgent:           getRequestUserAgent(req),
    lastUsedAt:          timestamp,
    lastActivityAt:      timestamp,
    idleExpiresAt:       buildIdleExpiryIso(),
    expiresAt:           buildSessionExpiryIso(),
    revokedAt:           null,
    revokedReason:       null,
    replacedBySessionId: null,
    createdAt:           timestamp,
    updatedAt:           timestamp,
  };

  await RefreshSession.create(await encryptRefreshSession(plain));

  return {
    accessToken:      generateAccessToken({ id: plain.userId, role: user.role, sessionId }),
    refreshToken,
    sessionId,
    sessionExpiresAt: plain.expiresAt,
    idleExpiresAt:    plain.idleExpiresAt,
  };
};

/** Rotates the refresh session and returns a fresh pair of tokens. */
const rotateRefreshSession = async ({ refreshToken, req }) => {
  const providedHash = hashRefreshToken(refreshToken);
  const allEnc       = await RefreshSession.find({}).lean();

  let currentSession = null;
  for (const enc of allEnc) {
    const dec = await decryptRefreshSession(enc);
    if (dec?.refreshTokenHash && timingSafeEqualHex(providedHash, dec.refreshTokenHash)) {
      currentSession = dec;
      break;
    }
  }

  if (!currentSession) {
    const err = new Error('Refresh session not found'); err.statusCode = 401; throw err;
  }

  await assertActiveSession(currentSession);

  const user = await _getDecryptedUserById(currentSession.userId);
  if (!user || user.isActive !== true) {
    currentSession.status = 'REVOKED'; currentSession.revokedAt = nowIso();
    currentSession.revokedReason = 'USER_INACTIVE_OR_NOT_FOUND';
    await saveRefreshSessionPlain(currentSession);
    const err = new Error('User is not active'); err.statusCode = 401; throw err;
  }

  const nextToken     = generateRefreshToken();
  const nextSessionId = crypto.randomBytes(12).toString('hex');
  const timestamp     = nowIso();

  const nextSession = {
    _id:                 nextSessionId,
    userId:              String(user._id),
    refreshTokenHash:    hashRefreshToken(nextToken),
    status:              'ACTIVE',
    ipAddress:           getRequestIp(req),
    userAgent:           getRequestUserAgent(req),
    lastUsedAt:          timestamp,
    lastActivityAt:      timestamp,
    idleExpiresAt:       buildIdleExpiryIso(),
    expiresAt:           buildSessionExpiryIso(),
    revokedAt:           null,
    revokedReason:       null,
    replacedBySessionId: null,
    createdAt:           timestamp,
    updatedAt:           timestamp,
  };

  await RefreshSession.create(await encryptRefreshSession(nextSession));

  currentSession.status              = 'REVOKED';
  currentSession.revokedAt           = timestamp;
  currentSession.revokedReason       = 'ROTATED';
  currentSession.replacedBySessionId = nextSessionId;
  currentSession.lastUsedAt          = timestamp;
  await saveRefreshSessionPlain(currentSession);

  return {
    accessToken:      generateAccessToken({ id: user._id, role: user.role, sessionId: nextSessionId }),
    refreshToken:     nextToken,
    sessionId:        nextSessionId,
    sessionExpiresAt: nextSession.expiresAt,
    idleExpiresAt:    nextSession.idleExpiresAt,
    user:             { id: user._id, role: user.role },
  };
};

/** Updates the idle expiry to extend the session on activity. */
const touchSessionActivity = async ({ sessionId }) => {
  const enc = await RefreshSession.findById(String(sessionId)).lean();
  if (!enc) {
    const err = new Error('Session not found'); err.statusCode = 401; throw err;
  }
  const session = await decryptRefreshSession(enc);
  await assertActiveSession(session);

  session.lastActivityAt = nowIso();
  session.idleExpiresAt  = buildIdleExpiryIso();
  await saveRefreshSessionPlain(session);

  return { sessionId: String(session._id), lastActivityAt: session.lastActivityAt, idleExpiresAt: session.idleExpiresAt };
};

/** Revokes a session found via the refresh-token cookie. */
const revokeRefreshSession = async ({ refreshToken, reason = 'LOGOUT' }) => {
  const providedHash = hashRefreshToken(refreshToken);
  const allEnc       = await RefreshSession.find({}).lean();

  for (const enc of allEnc) {
    const dec = await decryptRefreshSession(enc);
    if (!dec?.refreshTokenHash) continue;
    if (!timingSafeEqualHex(providedHash, dec.refreshTokenHash)) continue;

    if (dec.status === 'ACTIVE') {
      dec.status = 'REVOKED'; dec.revokedAt = nowIso(); dec.revokedReason = reason;
      await saveRefreshSessionPlain(dec);
    }
    return true;
  }
  return false;
};

/** Revokes a session directly by its _id (used by middleware). */
const revokeSessionById = async ({ sessionId, reason = 'LOGOUT' }) => {
  if (!sessionId) return false;
  const enc = await RefreshSession.findById(String(sessionId)).lean();
  if (!enc) return false;

  const session = await decryptRefreshSession(enc);
  if (session.status === 'ACTIVE') {
    session.status =
      reason === 'SESSION_EXPIRED' || reason === 'IDLE_TIMEOUT' ? 'EXPIRED' : 'REVOKED';
    session.revokedAt     = nowIso();
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

  decryptRefreshSession,
};