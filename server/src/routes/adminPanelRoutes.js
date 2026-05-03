'use strict';

/**
 * server/src/routes/adminPanelRoutes.js
 *
 * Feature 15 — Admin Panel routes.
 *
 * Mount point:
 *   /api/admin
 *
 * All routes require:
 *   requireAuth + requireAdmin
 */

const express = require('express');

const router = express.Router();

const {
  overviewHandler,

  listUsersHandler,
  getUserHandler,
  updateUserStatusHandler,
  banUserHandler,
  unbanUserHandler,
  updateUserRoleHandler,

  listTransactionsHandler,
  getTransactionHandler,

  listSupportTicketsHandler,
  getSupportTicketHandler,
  manageSupportTicketHandler,

  adminTransferHandler,
} = require('../controllers/adminPanelController');

const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requireAdmin);

// Dashboard / overview
router.get('/overview', overviewHandler);
router.get('/summary', overviewHandler);

// User management
router.get('/users', listUsersHandler);
router.get('/users/:userId', getUserHandler);
router.patch('/users/:userId/status', updateUserStatusHandler);
router.patch('/users/:userId/ban', banUserHandler);
router.patch('/users/:userId/unban', unbanUserHandler);
router.patch('/users/:userId/role', updateUserRoleHandler);

// Transaction monitoring
router.get('/transactions', listTransactionsHandler);
router.get('/transactions/:transactionId', getTransactionHandler);

// Support ticket management
router.get('/support-tickets', listSupportTicketsHandler);
router.get('/support-tickets/:ticketId', getSupportTicketHandler);
router.patch('/support-tickets/:ticketId', manageSupportTicketHandler);

// Admin money transfer (top-up a user account)
router.post('/transfer', adminTransferHandler);

module.exports = router;