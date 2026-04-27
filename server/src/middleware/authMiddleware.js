'use strict';

/**
 * server/src/middleware/authMiddleware.js
 *
 * Access-token authentication with session invalidation check.
 * If logout revokes the session, access tokens carrying that session id stop working.
 * If the user is idle for more than SESSION_IDLE_TIMEOUT_MINUTES, access is blocked.
 */

const RefreshSession = require('../models/RefreshSession');
const { verifyAccessToken } = require('../services/tokenService');

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();
  return token || null;
};

const expireIdleSession = async (session) => {
  if (!session) return;

  session.status = 'EXPIRED';
  session.revokedAt = new Date();
  session.revokedReason = 'IDLE_TIMEOUT';
  await session.save();
};

const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const decoded = verifyAccessToken(token);

    if (!decoded?.id || !decoded?.role || !decoded?.sid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid access token',
      });
    }

    const session = await RefreshSession.findById(decoded.sid);

    if (!session || session.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        message: 'Session is no longer active',
      });
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      session.status = 'EXPIRED';
      session.revokedAt = new Date();
      session.revokedReason = 'SESSION_EXPIRED';
      await session.save();

      return res.status(401).json({
        success: false,
        message: 'Session expired',
      });
    }

    if (session.idleExpiresAt && session.idleExpiresAt.getTime() <= Date.now()) {
      await expireIdleSession(session);

      return res.status(401).json({
        success: false,
        message: 'Session ended because of inactivity',
      });
    }

    req.user = {
      id: decoded.id,
      role: decoded.role,
      sessionId: decoded.sid,
    };

    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired access token',
    });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource',
      });
    }

    return next();
  };
};

module.exports = {
  requireAuth,
  requireRole,
};