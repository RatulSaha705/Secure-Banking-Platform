'use strict';

/**
 * server/src/services/dashboardService.js
 *
 * Feature 7 — Account Dashboard.
 *
 * Aggregates user/admin dashboard data.
 * Admin dashboard now shows:
 *   1. Total user count
 *   2. Unresolved support ticket count
 *   3. Total transaction count today
 */

const mongoose = require('mongoose');

const User = require('../models/User');
const Profile = require('../models/Profile');
const Transaction = require('../models/Transaction');

const { getMyProfile } = require('./profileService');
const { getAccountBalance } = require('./accountService');
const { getMyTransactionHistory } = require('./transferService');
const { getAllSupportTicketsForAdmin } = require('./supportTicketService');

const { decryptSensitiveFields } = require('../security/secure-storage');
const { toIdString, buildSecCtx } = require('../utils/serviceHelpers');

// ── Helpers ───────────────────────────────────────────────────────────────────

const safeGet = async (label, fn) => {
  try {
    return await fn();
  } catch {
    return {
      available: false,
      reason: `${label} module not yet available`,
    };
  }
};

const stub = (reason, extra = {}) => {
  return {
    available: false,
    reason,
    ...extra,
  };
};

const txnCtx = (userId, txnId) => {
  return buildSecCtx('transactions', userId, txnId);
};

const getTransactionOwnerIdFromEnvelope = (enc) => {
  const field = enc?.userId;

  if (field?.ownerUserId) {
    return String(field.ownerUserId);
  }

  if (field?.metadata?.ownerId) {
    return String(field.metadata.ownerId);
  }

  if (field?.metadata?.userId) {
    return String(field.metadata.userId);
  }

  return '';
};

const decryptTransactionDocument = async (enc, ownerUserId) => {
  const transactionId = toIdString(enc._id);

  const dec = await decryptSensitiveFields(
    'TRANSACTION',
    enc,
    txnCtx(ownerUserId, transactionId)
  );

  dec._id = transactionId;
  dec.id = transactionId;

  return dec;
};

const isToday = (isoDate) => {
  if (!isoDate) {
    return false;
  }

  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

// ── Section builders ──────────────────────────────────────────────────────────

const getProfileSummary = async (userId) => {
  const profile = await getMyProfile(userId);

  return {
    available: true,
    fullName: profile.fullName ?? null,
    username: profile.username ?? null,
    email: profile.email ?? null,
    phone: profile.phone ?? null,
    address: profile.address ?? null,
    profileId: profile.id ?? null,
  };
};

const getAccountSummary = async (userId) => {
  const balance = await getAccountBalance(userId);

  return {
    available: true,
    totalBalance: balance.totalBalance,
    availableBalance: balance.availableBalance,
    pendingAmount: balance.pendingAmount,
    accountNumber: balance.accountNumber,
    accountType: balance.accountType,
    accountStatus: balance.accountStatus,
    branchName: balance.branchName,
    asOf: balance.asOf,
  };
};

const getRecentTransactions = async (userId) => {
  const result = await getMyTransactionHistory(userId, 1, 5);

  return {
    available: true,
    transactions: result.transactions,
    totalCount: result.totalCount,
  };
};

const getAdminUserStats = async () => {
  const totalUsers = await User.countDocuments({});
  const totalProfiles = await Profile.countDocuments({});

  return {
    available: true,
    totalUsers,
    totalProfiles,
  };
};

const getAdminTicketStats = async () => {
  const result = await getAllSupportTicketsForAdmin();
  const tickets = Array.isArray(result.tickets) ? result.tickets : [];

  const unresolvedTickets = tickets.filter((ticket) => {
    const status = String(ticket.status || '').trim().toUpperCase();

    return status !== 'RESOLVED' && status !== 'CLOSED';
  });

  return {
    available: true,
    unresolvedCount: unresolvedTickets.length,
    totalTickets: tickets.length,
  };
};

const getAdminTodayTransactionStats = async () => {
  const encryptedTransactions = await Transaction.find({}).lean();

  let todayCount = 0;

  for (const encryptedTransaction of encryptedTransactions) {
    const ownerUserId = getTransactionOwnerIdFromEnvelope(encryptedTransaction);

    if (!ownerUserId) {
      continue;
    }

    try {
      const transaction = await decryptTransactionDocument(
        encryptedTransaction,
        ownerUserId
      );

      if (isToday(transaction.createdAt)) {
        todayCount += 1;
      }
    } catch {
      // Ignore corrupted/tampered transaction records.
    }
  }

  return {
    available: true,
    todayCount,
  };
};

// ── Public API ────────────────────────────────────────────────────────────────

const getUserDashboard = async (userId) => {
  const clean = String(userId || '').trim();

  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }

  const [profile, account, transactions, notifications, tickets] =
    await Promise.all([
      safeGet('Profile', () => getProfileSummary(clean)),
      safeGet('Account', () => getAccountSummary(clean)),
      safeGet('Transactions', () => getRecentTransactions(clean)),
      Promise.resolve(
        stub('Notification module not yet implemented', {
          unreadCount: 0,
          latestAlerts: [],
        })
      ),
      Promise.resolve(
        stub('Support ticket module not yet implemented', {
          openCount: 0,
          closedCount: 0,
          pendingCount: 0,
          latestTicket: null,
        })
      ),
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
      {
        id: 'transfer',
        label: 'Transfer Money',
        description: 'Send money to a saved beneficiary.',
        icon: 'transfer',
        available: true,
        path: '/transfer',
      },
      {
        id: 'beneficiaries',
        label: 'Manage Beneficiaries',
        description: 'Add, edit, or remove saved accounts.',
        icon: 'beneficiaries',
        available: true,
        path: '/transfer',
      },
      {
        id: 'history',
        label: 'Transaction History',
        description: 'View and filter past transactions.',
        icon: 'history',
        available: true,
        path: '/transactions',
      },
      {
        id: 'support',
        label: 'Support Ticket',
        description: 'Create or track a support request.',
        icon: 'support',
        available: false,
        path: null,
      },
      {
        id: 'profile',
        label: 'My Profile',
        description: 'View and update personal information.',
        icon: 'profile',
        available: true,
        path: '/profile',
      },
    ],
  };
};

const getAdminDashboard = async (adminId) => {
  const clean = String(adminId || '').trim();

  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error('Invalid admin id');
    err.statusCode = 400;
    throw err;
  }

  const [profile, userStats, ticketStats, transactionStats] =
    await Promise.all([
      safeGet('Profile', () => getProfileSummary(clean)),
      safeGet('UserStats', getAdminUserStats),
      safeGet('TicketStats', getAdminTicketStats),
      safeGet('TransactionStats', getAdminTodayTransactionStats),
    ]);

  return {
    adminId: clean,
    generatedAt: new Date().toISOString(),
    profile,
    userStats,
    ticketStats,
    transactionStats,
    adminActions: [
      {
        id: 'manage-users',
        label: 'Manage Users',
        description: 'View, activate, or deactivate user accounts.',
        available: true,
        path: '/admin',
      },
      {
        id: 'support-tickets',
        label: 'Support Tickets',
        description: 'Review and resolve support tickets.',
        available: true,
        path: '/admin/support-tickets',
      },
      {
        id: 'send-notification',
        label: 'Notifications',
        description: 'View security alerts and user notifications.',
        available: true,
        path: '/notifications',
      },
      {
        id: 'profile',
        label: 'My Profile',
        description: 'View and update administrator profile details.',
        available: true,
        path: '/profile',
      },
    ],
  };
};

module.exports = {
  getUserDashboard,
  getAdminDashboard,
};