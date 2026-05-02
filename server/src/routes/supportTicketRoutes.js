'use strict';

/**
 * server/src/routes/supportTicketRoutes.js
 *
 * Feature 13 — Support Ticket System routes.
 * Mount point (app.js): /api/support-tickets
 *
 * User routes:
 *   POST   /api/support-tickets              – Create ticket
 *   GET    /api/support-tickets              – List my tickets
 *   GET    /api/support-tickets/:id          – View my ticket
 *   PATCH  /api/support-tickets/:id          – Edit my ticket title/message/priority
 *   POST   /api/support-tickets/:id/comments – Add my comment
 *
 * Admin routes:
 *   GET    /api/support-tickets/admin/all    – Review all tickets
 *   GET    /api/support-tickets/admin/:id    – Review one ticket
 *   PATCH  /api/support-tickets/admin/:id    – Manage status/priority/reply
 */

const express = require('express');
const router = express.Router();

const {
  createHandler,
  listMyHandler,
  getMyByIdHandler,
  updateMyHandler,
  addMyCommentHandler,
  adminListHandler,
  adminGetByIdHandler,
  adminManageHandler,
} = require('../controllers/supportTicketController');

const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

// Admin routes must stay before '/:id'.
router.get('/admin/all', requireAuth, requireAdmin, adminListHandler);
router.get('/admin/:id', requireAuth, requireAdmin, adminGetByIdHandler);
router.patch('/admin/:id', requireAuth, requireAdmin, adminManageHandler);

router.post('/', requireAuth, createHandler);
router.get('/', requireAuth, listMyHandler);
router.get('/:id', requireAuth, getMyByIdHandler);
router.patch('/:id', requireAuth, updateMyHandler);
router.post('/:id/comments', requireAuth, addMyCommentHandler);

module.exports = router;