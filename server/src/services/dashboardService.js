'use strict';

/**
 * server/src/services/dashboardService.js
 *
 * Feature 7 — Account Dashboard.
 *
 * Aggregates data from multiple services into a single response.
 *
 * Design principle
 * ────────────────
 * Each section is loaded independently inside a try/catch so a failure in
 * one section (e.g., the Account module hasn't been implemented yet) never
 * crashes the whole dashboard response. Instead, the failed section is
 * returned as { available: false, reason: '...' }.
 *
 * When a new feature module is implemented, replace the corresponding stub
 * with a real service call — no changes needed in the controller or routes.
 *
 * Endpoints served
 * ────────────────
 *   GET /api/dashboard/summary        → getUserDashboard()   (any auth user)
 *   GET /api/dashboard/admin/summary  → getAdminDashboard()  (admin only)
 */

const mongoose = require('mongoose');

const User    = require('../models/User');
const Profile = require('../models/Profile');

const { getMyProfile } = require('./profileService');

const {
  decryptSensitiveFields,
} = require('../security/storage');

// ── Helpers ───────────────────────────────────────────────────────────────────

const toIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
};

/**
 * Safe wrapper — runs an async getter and returns { available: false } on
 * any error rather than propagating.
 */
const safeGet = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    return { available: false, reason: `${label} module not yet available` };
  }
};

// ── Profile summary (live) ────────────────────────────────────────────────────

const getProfileSummary = async (userId) => {
  const profile = await getMyProfile(userId);

  return {
    available:   true,
    fullName:    profile.fullName  ?? null,
    username:    profile.username  ?? null,
    email:       profile.email     ?? null,
    phone:       profile.phone     ?? null,
    address:     profile.address   ?? null,
    profileId:   profile.id        ?? null,
  };
};

// ── Account summary (stub — replace when Account module is built) ─────────────

const getAccountSummary = async (_userId) => {
  /**
   * TODO — Feature 8: Account Details
   * Replace this stub with a real call such as:
   *   const account = await accountService.getMyAccount(_userId);
   *   return { available: true, ...account };
   */
  return {
    available:     false,
    reason:        'Account module not yet implemented',
    totalBalance:  0,
    availableBalance: 0,
    pendingAmount: 0,
    accountNumber: null,
    accountType:   null,
    accountStatus: null,
    branchName:    null,
  };
};

// ── Recent transactions (stub — replace when Transaction module is built) ──────

const getRecentTransactions = async (_userId) => {
  /**
   * TODO — Feature 9: Money Transfer & Transaction History
   * Replace this stub with a real call such as:
   *   const txns = await transactionService.getRecentTransactions(_userId, { limit: 5 });
   *   return { available: true, transactions: txns };
   */
  return {
    available:    false,
    reason:       'Transaction module not yet implemented',
    transactions: [],
    totalCount:   0,
  };
};

// ── Notification summary (stub — replace when Notification module is built) ───

const getNotificationSummary = async (_userId) => {
  /**
   * TODO — Feature 10: Notifications & Alerts
   * Replace this stub with a real call such as:
   *   const summary = await notificationService.getUnreadSummary(_userId);
   *   return { available: true, ...summary };
   */
  return {
    available:    false,
    reason:       'Notification module not yet implemented',
    unreadCount:  0,
    latestAlerts: [],
  };
};

// ── Support ticket summary for the user (stub) ────────────────────────────────

const getUserTicketSummary = async (_userId) => {
  /**
   * TODO — Feature 11: Support Ticket System
   * Replace this stub with a real call such as:
   *   const summary = await ticketService.getUserTicketSummary(_userId);
   *   return { available: true, ...summary };
   */
  return {
    available:    false,
    reason:       'Support ticket module not yet implemented',
    openCount:    0,
    closedCount:  0,
    pendingCount: 0,
    latestTicket: null,
  };
};

// ── Admin: user management stats (live) ──────────────────────────────────────

const getAdminUserStats = async () => {
  // countDocuments works on _id which is always plaintext.
  const totalUsers  = await User.countDocuments({});
  const totalProfiles = await Profile.countDocuments({});

  return {
    available:      true,
    totalUsers,
    totalProfiles,
  };
};

// ── Admin: open support tickets (stub) ───────────────────────────────────────

const getAdminTicketStats = async () => {
  /**
   * TODO — Feature 11: Support Ticket System (Admin side)
   * Replace this stub with a real call such as:
   *   return await ticketService.getAdminTicketStats();
   */
  return {
    available:     false,
    reason:        'Support ticket module not yet implemented',
    openCount:     0,
    inProgressCount: 0,
    resolvedCount: 0,
    newSinceYesterday: 0,
  };
};

// ── Admin: new notification alerts pending action (stub) ────────────────────

const getAdminAlertStats = async () => {
  /**
   * TODO — Feature 10: Notifications & Alerts (Admin side)
   */
  return {
    available:           false,
    reason:              'Notification module not yet implemented',
    pendingNotifications: 0,
    criticalAlerts:       0,
  };
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getUserDashboard
 *
 * Returns an aggregated summary for the authenticated regular user.
 *
 * @param {string} userId – Authenticated user's _id (req.user.id).
 * @returns {object} Dashboard summary payload.
 */
const getUserDashboard = async (userId) => {
  const cleanUserId = String(userId || '').trim();

  if (!cleanUserId || !mongoose.Types.ObjectId.isValid(cleanUserId)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }

  // All sections loaded in parallel for speed; failures are swallowed by safeGet.
  const [
    profile,
    account,
    transactions,
    notifications,
    tickets,
  ] = await Promise.all([
    safeGet('Profile',       () => getProfileSummary(cleanUserId)),
    safeGet('Account',       () => getAccountSummary(cleanUserId)),
    safeGet('Transactions',  () => getRecentTransactions(cleanUserId)),
    safeGet('Notifications', () => getNotificationSummary(cleanUserId)),
    safeGet('Tickets',       () => getUserTicketSummary(cleanUserId)),
  ]);

  return {
    userId: cleanUserId,
    generatedAt: new Date().toISOString(),
    profile,
    account,
    transactions,
    notifications,
    tickets,

    /**
     * quickActions — static list of possible actions with an `available` flag.
     * Set available: true when the corresponding route is implemented.
     * The frontend uses this to decide whether to render a button as active
     * or disabled.
     */
    quickActions: [
      {
        id:          'transfer',
        label:       'Transfer Money',
        description: 'Send money to a saved beneficiary.',
        icon:        'transfer',
        available:   false,
        path:        null,
      },
      {
        id:          'beneficiaries',
        label:       'Manage Beneficiaries',
        description: 'Add, edit, or remove saved accounts.',
        icon:        'beneficiaries',
        available:   false,
        path:        null,
      },
      {
        id:          'history',
        label:       'Transaction History',
        description: 'View and filter past transactions.',
        icon:        'history',
        available:   false,
        path:        null,
      },
      {
        id:          'support',
        label:       'Support Ticket',
        description: 'Create or track a support request.',
        icon:        'support',
        available:   false,
        path:        null,
      },
      {
        id:          'profile',
        label:       'My Profile',
        description: 'View and update personal information.',
        icon:        'profile',
        available:   true,
        path:        '/profile',
      },
    ],
  };
};

/**
 * getAdminDashboard
 *
 * Returns an aggregated admin-level summary.
 * Only reachable via admin-guarded routes.
 *
 * @param {string} adminId – Admin's _id (for audit purposes).
 * @returns {object} Admin dashboard summary payload.
 */
const getAdminDashboard = async (adminId) => {
  const cleanAdminId = String(adminId || '').trim();

  if (!cleanAdminId || !mongoose.Types.ObjectId.isValid(cleanAdminId)) {
    const err = new Error('Invalid admin id');
    err.statusCode = 400;
    throw err;
  }

  const [
    userStats,
    ticketStats,
    alertStats,
  ] = await Promise.all([
    safeGet('UserStats',   () => getAdminUserStats()),
    safeGet('TicketStats', () => getAdminTicketStats()),
    safeGet('AlertStats',  () => getAdminAlertStats()),
  ]);

  return {
    adminId:     cleanAdminId,
    generatedAt: new Date().toISOString(),
    userStats,
    ticketStats,
    alertStats,

    /**
     * adminActions — admin-specific quick actions.
     * Set available: true as each feature is implemented.
     */
    adminActions: [
      {
        id:          'manage-users',
        label:       'Manage Users',
        description: 'View, activate, or deactivate user accounts.',
        available:   false,
        path:        null,
      },
      {
        id:          'support-tickets',
        label:       'Support Tickets',
        description: 'Review and resolve open support tickets.',
        available:   false,
        path:        null,
      },
      {
        id:          'send-notification',
        label:       'Send Notification',
        description: 'Broadcast alerts or messages to users.',
        available:   false,
        path:        null,
      },
      {
        id:          'view-transactions',
        label:       'Transaction Audit',
        description: 'Review all system transactions.',
        available:   false,
        path:        null,
      },
    ],
  };
};

module.exports = {
  getUserDashboard,
  getAdminDashboard,
};
