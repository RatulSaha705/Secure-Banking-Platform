'use strict';

/**
 * server/src/middleware/authMiddleware.js
 *
 * Strict encrypted Authentication + RBAC middleware.
 *
 * New DB rule:
 *   Only _id is readable.
 *   Session fields and user fields are decrypted before checking.
 */

const mongoose = require('mongoose');

const RefreshSession = require('../models/RefreshSession');
const User = require('../models/User');

const {
  verifyAccessToken,
  revokeSessionById,
} = require('../services/tokenService');

const {
  decryptSensitiveFields,
} = require('../security/storage');

const { ROLES, normalizeRole } = require('../constants/roles');

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  return token || null;
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

const sameId = (firstId, secondId) => {
  if (!firstId || !secondId) {
    return false;
  }

  return String(firstId) === String(secondId);
};

const isAdminRole = (role) => {
  return normalizeRole(role) === ROLES.ADMIN;
};

const isExpired = (isoDateValue) => {
  if (!isoDateValue) {
    return true;
  }

  return new Date(isoDateValue).getTime() <= Date.now();
};

const decryptSessionDocument = async (encryptedSession) => {
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

const decryptUserDocument = async (encryptedUser) => {
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

const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return sendUnauthorized(res, 'Authentication required');
    }

    const decoded = verifyAccessToken(token);

    if (!decoded || !decoded.id || !decoded.sid) {
      return sendUnauthorized(res, 'Invalid access token');
    }

    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      return sendUnauthorized(res, 'Invalid user in access token');
    }

    const encryptedSession = await RefreshSession.findById(String(decoded.sid)).lean();

    if (!encryptedSession) {
      return sendUnauthorized(res, 'Session is no longer active');
    }

    const session = await decryptSessionDocument(encryptedSession);

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

    const encryptedUser = await User.findById(String(decoded.id)).lean();

    if (!encryptedUser) {
      await revokeSessionById({
        sessionId: decoded.sid,
        reason: 'USER_NOT_FOUND',
      });

      return sendUnauthorized(res, 'User not found');
    }

    const user = await decryptUserDocument(encryptedUser);

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
  } catch (err) {
    return sendUnauthorized(res, 'Invalid or expired access token');
  }
};

const requireRole = (...allowedRoles) => {
  const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role));

  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Authentication required');
    }

    if (!normalizedAllowedRoles.includes(req.user.role)) {
      return sendForbidden(res, 'You do not have permission to access this resource');
    }

    return next();
  };
};

const requireAdmin = requireRole(ROLES.ADMIN);

const readNestedValue = (source, path) => {
  if (!source || !path) {
    return null;
  }

  const parts = String(path).split('.');
  let current = source;

  for (let i = 0; i < parts.length; i += 1) {
    if (current === undefined || current === null) {
      return null;
    }

    current = current[parts[i]];
  }

  return current === undefined ? null : current;
};

const resolveTargetUserId = (req, options = {}) => {
  if (typeof options.ownerIdResolver === 'function') {
    return options.ownerIdResolver(req);
  }

  if (options.paramName && req.params) {
    const value = req.params[options.paramName];

    if (value) {
      return value;
    }
  }

  if (options.bodyName && req.body) {
    const value = readNestedValue(req.body, options.bodyName);

    if (value) {
      return value;
    }
  }

  if (options.queryName && req.query) {
    const value = readNestedValue(req.query, options.queryName);

    if (value) {
      return value;
    }
  }

  if (req.params) {
    return req.params.userId || req.params.ownerUserId || req.params.id || null;
  }

  return null;
};

const requireOwnerOrAdmin = (options = {}) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Authentication required');
    }

    if (isAdminRole(req.user.role)) {
      return next();
    }

    const targetUserId = resolveTargetUserId(req, options);

    if (!targetUserId) {
      return sendForbidden(res, 'Target user id is required for ownership check');
    }

    if (!sameId(req.user.id, targetUserId)) {
      return sendForbidden(res, 'You can access only your own resource');
    }

    return next();
  };
};

const requireSelfOrAdmin = (options = {}) => {
  return requireOwnerOrAdmin(options);
};

module.exports = {
  getBearerToken,
  sameId,
  isAdminRole,

  requireAuth,
  requireRole,
  requireAdmin,
  requireOwnerOrAdmin,
  requireSelfOrAdmin,

  decryptSessionDocument,
  decryptUserDocument,
};