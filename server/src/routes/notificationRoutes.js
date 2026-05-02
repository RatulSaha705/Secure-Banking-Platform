'use strict';

/**
 * server/src/routes/notificationRoutes.js
 *
 * Feature 14 — Notifications and Alerts routes.
 *
 * Mount point:
 *   /api/notifications
 */

const express = require('express');

const router = express.Router();

const {
  listMyNotificationsHandler,
  unreadCountHandler,
  markReadHandler,
  markAllReadHandler,
  adminSendUserNotificationHandler,
  adminSendAccountNumberNotificationHandler,
} = require('../controllers/notificationController');

const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

router.get('/', requireAuth, listMyNotificationsHandler);
router.get('/unread-count', requireAuth, unreadCountHandler);

router.patch('/read-all', requireAuth, markAllReadHandler);
router.patch('/:id/read', requireAuth, markReadHandler);

router.post(
  '/admin/account-number',
  requireAuth,
  requireAdmin,
  adminSendAccountNumberNotificationHandler
);

router.post(
  '/admin/user/:userId',
  requireAuth,
  requireAdmin,
  adminSendUserNotificationHandler
);

module.exports = router;