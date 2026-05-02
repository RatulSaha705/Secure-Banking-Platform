'use strict';

/**
 * server/src/services/dashboardService.js
 *
 * Feature 7 — Account Dashboard.
 *
 * Aggregates data from multiple services into a single response.
 * Each section is loaded independently inside a try/catch so a module
 * failure never crashes the whole dashboard — the failed section returns
 * { available: false, reason: '...' } instead.
 *
 * Endpoints:
 *   GET /api/dashboard/summary        → getUserDashboard()   (any auth user)
 *   GET /api/dashboard/admin/summary  → getAdminDashboard()  (admin only)
 */

const mongoose = require('mongoose');

const User    = require('../models/User');
const Profile = require('../models/Profile');

const { getMyProfile }             = require('./profileService');
const { getAccountBalance }        = require('./accountService');
const { getMyTransactionHistory }  = require('./transferService');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Runs fn(); returns { available: false, reason } on any error. */
const safeGet = async (label, fn) => {
  try { return await fn(); } catch {
    return { available: false, reason: `${label} module not yet available` };
  }
};

/** Builds a placeholder for a not-yet-implemented module section. */
const stub = (reason, extra = {}) => ({ available: false, reason, ...extra });

// ── Section builders ──────────────────────────────────────────────────────────

const getProfileSummary = async (userId) => {
  const p = await getMyProfile(userId);
  return {
    available: true,
    fullName:  p.fullName  ?? null,
    username:  p.username  ?? null,
    email:     p.email     ?? null,
    phone:     p.phone     ?? null,
    address:   p.address   ?? null,
    profileId: p.id        ?? null,
  };
};

const getAccountSummary = async (userId) => {
  const b = await getAccountBalance(userId);
  return {
    available:        true,
    totalBalance:     b.totalBalance,
    availableBalance: b.availableBalance,
    pendingAmount:    b.pendingAmount,
    accountNumber:    b.accountNumber,
    accountType:      b.accountType,
    accountStatus:    b.accountStatus,
    branchName:       b.branchName,
    asOf:             b.asOf,
  };
};

const getRecentTransactions = async (userId) => {
  const r = await getMyTransactionHistory(userId, 1, 5);
  return { available: true, transactions: r.transactions, totalCount: r.totalCount };
};

const getAdminUserStats = async () => ({
  available:     true,
  totalUsers:    await User.countDocuments({}),
  totalProfiles: await Profile.countDocuments({}),
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getUserDashboard
 * Aggregated summary for an authenticated regular user.
 */
const getUserDashboard = async (userId) => {
  const clean = String(userId || '').trim();
  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error('Invalid user id'); err.statusCode = 400; throw err;
  }

  const [profile, account, transactions, notifications, tickets] = await Promise.all([
    safeGet('Profile',       () => getProfileSummary(clean)),
    safeGet('Account',       () => getAccountSummary(clean)),
    safeGet('Transactions',  () => getRecentTransactions(clean)),
    Promise.resolve(stub('Notification module not yet implemented', { unreadCount: 0, latestAlerts: [] })),
    Promise.resolve(stub('Support ticket module not yet implemented', { openCount: 0, closedCount: 0, pendingCount: 0, latestTicket: null })),
  ]);

  return {
    userId: clean,
    generatedAt: new Date().toISOString(),
    profile,
    account,
    transactions,
    notifications,
    tickets,
    quickActions: [
      { id: 'transfer',      label: 'Transfer Money',        description: 'Send money to a saved beneficiary.',       icon: 'transfer',      available: true,  path: '/transfer' },
      { id: 'beneficiaries', label: 'Manage Beneficiaries',  description: 'Add, edit, or remove saved accounts.',     icon: 'beneficiaries', available: true,  path: '/transfer' },
      { id: 'history',       label: 'Transaction History',   description: 'View and filter past transactions.',        icon: 'history',       available: true,  path: '/transactions' },
      { id: 'support',       label: 'Support Ticket',        description: 'Create or track a support request.',        icon: 'support',       available: false, path: null },
      { id: 'profile',       label: 'My Profile',            description: 'View and update personal information.',     icon: 'profile',       available: true,  path: '/profile' },
    ],
  };
};

/**
 * getAdminDashboard
 * Aggregated admin-level summary.
 */
const getAdminDashboard = async (adminId) => {
  const clean = String(adminId || '').trim();
  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error('Invalid admin id'); err.statusCode = 400; throw err;
  }

  const [userStats, ticketStats, alertStats] = await Promise.all([
    safeGet('UserStats',   getAdminUserStats),
    Promise.resolve(stub('Support ticket module not yet implemented', { openCount: 0, inProgressCount: 0, resolvedCount: 0, newSinceYesterday: 0 })),
    Promise.resolve(stub('Notification module not yet implemented',   { pendingNotifications: 0, criticalAlerts: 0 })),
  ]);

  return {
    adminId: clean,
    generatedAt: new Date().toISOString(),
    userStats,
    ticketStats,
    alertStats,
    adminActions: [
      { id: 'manage-users',     label: 'Manage Users',       description: 'View, activate, or deactivate user accounts.', available: false, path: null },
      { id: 'support-tickets',  label: 'Support Tickets',    description: 'Review and resolve open support tickets.',      available: false, path: null },
      { id: 'send-notification',label: 'Send Notification',  description: 'Broadcast alerts or messages to users.',        available: false, path: null },
      { id: 'view-transactions',label: 'Transaction Audit',  description: 'Review all system transactions.',               available: false, path: null },
    ],
  };
};

module.exports = { getUserDashboard, getAdminDashboard };
