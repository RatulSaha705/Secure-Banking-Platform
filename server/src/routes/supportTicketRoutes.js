'use strict';

/**
 * server/src/routes/supportTicketRoutes.js
 *
 * Feature 13 — Support Ticket System routes.
 *
 * RBAC:
 *   USER:
 *     Create, view, edit, comment on own tickets.
 *
 *   ADMIN:
 *     Review and manage all tickets.
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

const {
  requireAuth,
  requireUser,
  requireAdmin,
} = require('../middleware/authMiddleware');

// Admin routes must stay before '/:id'.
router.get('/admin/all', requireAuth, requireAdmin, adminListHandler);
router.get('/admin/:id', requireAuth, requireAdmin, adminGetByIdHandler);
router.patch('/admin/:id', requireAuth, requireAdmin, adminManageHandler);

// Regular user routes.
router.post('/', requireAuth, requireUser, createHandler);
router.get('/', requireAuth, requireUser, listMyHandler);
router.get('/:id', requireAuth, requireUser, getMyByIdHandler);
router.patch('/:id', requireAuth, requireUser, updateMyHandler);
router.post('/:id/comments', requireAuth, requireUser, addMyCommentHandler);

module.exports = router;