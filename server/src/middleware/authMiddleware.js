'use strict';

/**
 * server/src/middleware/authMiddleware.js
 *
 * Authentication + RBAC foundation.
 *
 * Authentication:
 *   - reads Bearer access token
 *   - verifies JWT
 *   - verifies refresh session is still ACTIVE
 *   - verifies session has not expired
 *   - verifies idle timeout
 *   - verifies the user still exists and is active
 *   - attaches fresh user role from MongoDB to req.user
 *
 * RBAC helpers:
 *   - requireRole(...roles)
 *   - requireAdmin
 *   - requireOwnerOrAdmin(options)
 *   - requireSelfOrAdmin(options)
 */

const mongoose = require('mongoose');
const RefreshSession = require('../models/RefreshSession');
const User = require('../models/User');
const { verifyAccessToken } = require('../services/tokenService');
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

const expireSession = async (session, reason) => {
  if (!session) {
    return;
  }

  session.status = 'EXPIRED';
  session.revokedAt = new Date();
  session.revokedReason = reason;
  await session.save();
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

    if (!mongoose.Types.ObjectId.isValid(decoded.sid)) {
      return sendUnauthorized(res, 'Invalid session in access token');
    }

    const session = await RefreshSession.findById(decoded.sid);

    if (!session || session.status !== 'ACTIVE') {
      return sendUnauthorized(res, 'Session is no longer active');
    }

    if (!sameId(session.userId, decoded.id)) {
      await expireSession(session, 'SESSION_USER_MISMATCH');
      return sendUnauthorized(res, 'Session does not match authenticated user');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await expireSession(session, 'SESSION_EXPIRED');
      return sendUnauthorized(res, 'Session expired');
    }

    if (session.idleExpiresAt && session.idleExpiresAt.getTime() <= Date.now()) {
      await expireSession(session, 'IDLE_TIMEOUT');
      return sendUnauthorized(res, 'Session ended because of inactivity');
    }

    const user = await User.findById(decoded.id).select('_id role isActive');

    if (!user) {
      await expireSession(session, 'USER_NOT_FOUND');
      return sendUnauthorized(res, 'User not found');
    }

    if (!user.isActive) {
      await expireSession(session, 'USER_INACTIVE');
      return sendUnauthorized(res, 'User account is disabled');
    }

    req.user = {
      id: user._id.toString(),
      role: normalizeRole(user.role),
      sessionId: session._id.toString(),
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
    if (value) return value;
  }

  if (options.bodyName && req.body) {
    const value = readNestedValue(req.body, options.bodyName);
    if (value) return value;
  }

  if (options.queryName && req.query) {
    const value = readNestedValue(req.query, options.queryName);
    if (value) return value;
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
};