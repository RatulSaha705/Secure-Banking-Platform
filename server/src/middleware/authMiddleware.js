'use strict';

/**
 * server/src/middleware/authMiddleware.js
 *
 * JWT Authentication + RBAC middleware.
 *
 * requireAuth          – Validates Bearer token, decrypts session + user.
 * requireRole(...)     – Allows only selected roles.
 * requireAdmin         – Allows only administrators.
 * requireUser          – Allows only regular users.
 * requireOwnerOrAdmin  – Allows admin or owner.
 */

const mongoose = require('mongoose');

const RefreshSession = require('../models/RefreshSession');
const User = require('../models/User');

const { verifyAccessToken, revokeSessionById } = require('../services/tokenService');
const { decryptSensitiveFields } = require('../security/storage');
const { ROLES, normalizeRole } = require('../constants/roles');

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim() || null;
};

const sendUnauthorized = (res, message) => {
  return res.status(401).json({
    success: false,
    message,
  });
};

const sendForbidden = (res, message) => {
  return res.status(403).json({
    success: false,
    message,
  });
};

const sameId = (a, b) => {
  return Boolean(a && b && String(a) === String(b));
};

const isAdminRole = (role) => {
  return normalizeRole(role) === ROLES.ADMIN;
};

const isUserRole = (role) => {
  return normalizeRole(role) === ROLES.USER;
};

const isExpired = (iso) => {
  return !iso || new Date(iso).getTime() <= Date.now();
};

const decryptSessionDocument = async (enc) => {
  if (!enc) {
    return null;
  }

  const id = String(enc._id);

  const dec = await decryptSensitiveFields('REFRESH_SESSION', enc, {
    documentId: id,
    collectionName: 'refreshsessions',
  });

  dec._id = id;
  dec.id = id;

  return dec;
};

const decryptUserDocument = async (enc) => {
  if (!enc) {
    return null;
  }

  const uid = String(enc._id);

  const dec = await decryptSensitiveFields('USER', enc, {
    ownerId: uid,
    documentId: uid,
    collectionName: 'users',
  });

  dec._id = uid;
  dec.id = uid;

  return dec;
};

const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return sendUnauthorized(res, 'Authentication required');
    }

    const decoded = verifyAccessToken(token);

    if (!decoded?.id || !decoded?.sid) {
      return sendUnauthorized(res, 'Invalid access token');
    }

    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      return sendUnauthorized(res, 'Invalid user in access token');
    }

    const encSession = await RefreshSession.findById(String(decoded.sid)).lean();

    if (!encSession) {
      return sendUnauthorized(res, 'Session is no longer active');
    }

    const session = await decryptSessionDocument(encSession);

    if (!session || session.status !== 'ACTIVE') {
      return sendUnauthorized(res, 'Session is no longer active');
    }

    if (!sameId(session.userId, decoded.id)) {
      await revokeSessionById({
        sessionId: decoded.sid,
        reason: 'SESSION_USER_MISMATCH',
      });

      return sendUnauthorized(res, 'Session does not match authenticated user');
    }

    if (isExpired(session.expiresAt)) {
      await revokeSessionById({
        sessionId: decoded.sid,
        reason: 'SESSION_EXPIRED',
      });

      return sendUnauthorized(res, 'Session expired');
    }

    if (session.idleExpiresAt && isExpired(session.idleExpiresAt)) {
      await revokeSessionById({
        sessionId: decoded.sid,
        reason: 'IDLE_TIMEOUT',
      });

      return sendUnauthorized(res, 'Session ended because of inactivity');
    }

    const encUser = await User.findById(String(decoded.id)).lean();

    if (!encUser) {
      await revokeSessionById({
        sessionId: decoded.sid,
        reason: 'USER_NOT_FOUND',
      });

      return sendUnauthorized(res, 'User not found');
    }

    const user = await decryptUserDocument(encUser);

    if (user.isActive !== true) {
      await revokeSessionById({
        sessionId: decoded.sid,
        reason: 'USER_INACTIVE',
      });

      return sendUnauthorized(res, 'User account is disabled');
    }

    req.user = {
      id: String(user._id),
      role: normalizeRole(user.role),
      sessionId: String(session._id),
      isActive: user.isActive,
    };

    req.auth = {
      tokenUserId: String(decoded.id),
      tokenRole: normalizeRole(decoded.role),
      session,
      user,
    };

    return next();
  } catch {
    return sendUnauthorized(res, 'Invalid or expired access token');
  }
};

const requireRole = (...allowedRoles) => {
  const normalized = allowedRoles.map((role) => normalizeRole(role));

  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Authentication required');
    }

    if (!normalized.includes(req.user.role)) {
      return sendForbidden(res, 'You do not have permission to access this resource');
    }

    return next();
  };
};

const requireAdmin = requireRole(ROLES.ADMIN);

const requireUser = requireRole(ROLES.USER);

const requireOwnerOrAdmin = (options = {}) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Authentication required');
    }

    if (isAdminRole(req.user.role)) {
      return next();
    }

    let targetUserId = null;

    if (typeof options.ownerIdResolver === 'function') {
      targetUserId = options.ownerIdResolver(req);
    } else if (options.paramName && req.params?.[options.paramName]) {
      targetUserId = req.params[options.paramName];
    } else if (options.bodyName && req.body) {
      targetUserId = options.bodyName.split('.').reduce((obj, key) => obj?.[key], req.body) || null;
    } else if (options.queryName && req.query) {
      targetUserId = options.queryName.split('.').reduce((obj, key) => obj?.[key], req.query) || null;
    } else {
      targetUserId = req.params?.userId || req.params?.ownerUserId || req.params?.id || null;
    }

    if (!targetUserId) {
      return sendForbidden(res, 'Target user id is required for ownership check');
    }

    if (!sameId(req.user.id, targetUserId)) {
      return sendForbidden(res, 'You can access only your own resource');
    }

    return next();
  };
};

module.exports = {
  getBearerToken,
  sameId,
  isAdminRole,
  isUserRole,
  requireAuth,
  requireRole,
  requireAdmin,
  requireUser,
  requireOwnerOrAdmin,
  decryptSessionDocument,
  decryptUserDocument,
};