'use strict';

/**
 * server/src/services/adminPanelService.js
 *
 * Feature 15 — Admin Panel.
 *
 * Admin capabilities:
 *   - View admin overview/summary.
 *   - Manage users.
 *   - Ban/unban users.
 *   - Promote/demote user roles.
 *   - Monitor transactions.
 *   - Review/manage support tickets.
 *
 * Security pattern:
 *   - All routes using this service must be protected by requireAuth + requireAdmin.
 *   - User data is decrypted only after admin authorization.
 *   - User updates are encrypted before saving.
 *   - Transaction/ticket records are decrypted through the existing storage layer.
 *   - No sensitive plaintext is directly stored.
 */

const mongoose = require('mongoose');

const User = require('../models/User');
const Transaction = require('../models/Transaction');

const { ROLES, normalizeRole } = require('../constants/roles');
const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/storage');
const { nowIso, toIdString, buildSecCtx } = require('../utils/serviceHelpers');

const {
  getAllSupportTicketsForAdmin,
  getSupportTicketForAdmin,
  manageSupportTicketAsAdmin,
} = require('./supportTicketService');

const {
  createNotification,
} = require('./notificationService');

const USER_STATUS = Object.freeze({
  ACTIVE: true,
  BANNED: false,
});

const userCtx = (userId) => {
  return buildSecCtx('users', userId, userId);
};

const transactionCtx = (userId, transactionId) => {
  return buildSecCtx('transactions', userId, transactionId);
};

const cleanText = (value) => {
  return String(value || '').trim();
};

const assertValidObjectId = (value, label) => {
  const clean = cleanText(value);

  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error(`Invalid ${label}`);
    err.statusCode = 400;
    throw err;
  }

  return clean;
};

const normalizeRoleForUpdate = (role) => {
  const clean = cleanText(role).toUpperCase();

  if (clean !== ROLES.USER && clean !== ROLES.ADMIN) {
    const err = new Error('Invalid role. Allowed roles: USER, ADMIN');
    err.statusCode = 400;
    throw err;
  }

  return clean;
};

const parseBooleanFilter = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const clean = String(value).trim().toLowerCase();

  if (clean === 'true' || clean === 'active') {
    return true;
  }

  if (clean === 'false' || clean === 'banned' || clean === 'inactive') {
    return false;
  }

  const err = new Error('Invalid active status filter');
  err.statusCode = 400;
  throw err;
};

const parsePagination = (query = {}) => {
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

  return { page, limit };
};

const paginate = (items, query = {}) => {
  const { page, limit } = parsePagination(query);
  const total = items.length;
  const start = (page - 1) * limit;
  const end = start + limit;

  return {
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    items: items.slice(start, end),
  };
};

const getOwnerIdFromEncryptedField = (field) => {
  if (!field || typeof field !== 'object') {
    return '';
  }

  if (field.ownerUserId) {
    return String(field.ownerUserId);
  }

  if (field.metadata?.ownerId) {
    return String(field.metadata.ownerId);
  }

  if (field.metadata?.userId) {
    return String(field.metadata.userId);
  }

  return '';
};

const getOwnerIdFromEncryptedDocument = (enc) => {
  if (!enc || typeof enc !== 'object') {
    return '';
  }

  const preferredFields = [
    'userId',
    'ownerUserId',
    'fromUserId',
    'senderUserId',
    'accountOwnerId',
  ];

  for (const fieldName of preferredFields) {
    const found = getOwnerIdFromEncryptedField(enc[fieldName]);

    if (found) {
      return found;
    }
  }

  const values = Object.values(enc);

  for (const value of values) {
    const found = getOwnerIdFromEncryptedField(value);

    if (found) {
      return found;
    }
  }

  return '';
};

const decryptUserDocument = async (enc) => {
  if (!enc) {
    return null;
  }

  const userId = toIdString(enc._id);

  const dec = await decryptSensitiveFields('USER', enc, userCtx(userId));

  dec._id = userId;
  dec.id = userId;

  return dec;
};

const decryptTransactionDocument = async (enc) => {
  if (!enc) {
    return null;
  }

  const transactionId = toIdString(enc._id);
  const ownerUserId = getOwnerIdFromEncryptedDocument(enc);

  if (!ownerUserId) {
    const err = new Error('Transaction owner metadata is missing');
    err.statusCode = 409;
    throw err;
  }

  const dec = await decryptSensitiveFields(
    'TRANSACTION',
    enc,
    transactionCtx(ownerUserId, transactionId)
  );

  dec._id = transactionId;
  dec.id = transactionId;

  return dec;
};

const toPublicUser = (user) => {
  const publicRole = normalizeRole(user.role || ROLES.USER);

  return {
    id: user.id || user._id,
    username: user.username || '',
    email: user.email || '',
    contact: user.contact || user.phone || '',
    phone: user.phone || user.contact || '',
    fullName: user.fullName || user.name || user.username || '',
    role: publicRole,
    isActive: user.isActive !== false,
    twoStepVerificationEnabled: user.twoStepVerificationEnabled === true,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null,
  };
};

const toPublicTransaction = (txn) => {
  return {
    id: txn.id || txn._id,
    userId: txn.userId || txn.ownerUserId || txn.fromUserId || null,
    transactionType: txn.transactionType || txn.type || '',
    type: txn.type || txn.transactionType || '',
    amount: txn.amount || 0,
    currency: txn.currency || 'BDT',
    fromAccount: txn.fromAccount || txn.fromAccountNumber || '',
    toAccount: txn.toAccount || txn.toAccountNumber || '',
    beneficiaryName: txn.beneficiaryName || '',
    status: txn.status || '',
    reference: txn.reference || txn.transactionReference || '',
    description: txn.description || txn.note || '',
    createdAt: txn.createdAt || null,
    updatedAt: txn.updatedAt || null,
  };
};

const scanAllUsers = async () => {
  const all = await User.find({}).lean();
  const users = [];
  let tamperedCount = 0;

  for (const enc of all) {
    try {
      const dec = await decryptUserDocument(enc);

      if (dec) {
        users.push(toPublicUser(dec));
      }
    } catch {
      tamperedCount += 1;
    }
  }

  return {
    users,
    tamperedCount,
  };
};

const scanAllTransactions = async () => {
  const all = await Transaction.find({}).lean();
  const transactions = [];
  let tamperedCount = 0;

  for (const enc of all) {
    try {
      const dec = await decryptTransactionDocument(enc);

      if (dec) {
        transactions.push(toPublicTransaction(dec));
      }
    } catch {
      tamperedCount += 1;
    }
  }

  return {
    transactions,
    tamperedCount,
  };
};

const findUserByIdForAdmin = async (userId) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');

  const enc = await User.findById(cleanUserId).lean();

  if (!enc) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  let dec;

  try {
    dec = await decryptUserDocument(enc);
  } catch {
    const err = new Error('User record failed integrity verification');
    err.statusCode = 409;
    throw err;
  }

  return toPublicUser(dec);
};

const findTransactionByIdForAdmin = async (transactionId) => {
  const cleanTransactionId = assertValidObjectId(transactionId, 'transaction id');

  const enc = await Transaction.findById(cleanTransactionId).lean();

  if (!enc) {
    const err = new Error('Transaction not found');
    err.statusCode = 404;
    throw err;
  }

  let dec;

  try {
    dec = await decryptTransactionDocument(enc);
  } catch {
    const err = new Error('Transaction record failed integrity verification');
    err.statusCode = 409;
    throw err;
  }

  return toPublicTransaction(dec);
};

const notifyUserSafely = async ({ userId, title, message, body }) => {
  try {
    await createNotification({
      userId,
      type: 'GENERAL_ALERT',
      title,
      message,
      body,
    });
  } catch {
    // Notification failure must not break admin operation.
  }
};

const getAdminOverview = async () => {
  const userResult = await scanAllUsers();
  const transactionResult = await scanAllTransactions();
  const ticketResult = await getAllSupportTicketsForAdmin({});

  const users = userResult.users;
  const transactions = transactionResult.transactions;
  const tickets = ticketResult.tickets || [];

  const activeUsers = users.filter((user) => user.isActive === true);
  const bannedUsers = users.filter((user) => user.isActive === false);
  const adminUsers = users.filter((user) => normalizeRole(user.role) === ROLES.ADMIN);

  const openTickets = tickets.filter((ticket) => {
    const status = String(ticket.status || '').toUpperCase();
    return status === 'OPEN' || status === 'IN_PROGRESS' || status === 'WAITING_USER';
  });

  const resolvedTickets = tickets.filter((ticket) => {
    const status = String(ticket.status || '').toUpperCase();
    return status === 'RESOLVED' || status === 'CLOSED';
  });

  const totalTransferred = transactions.reduce((sum, txn) => {
    const amount = Number(txn.amount || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  transactions.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  tickets.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

  return {
    summary: {
      totalUsers: users.length,
      activeUsers: activeUsers.length,
      bannedUsers: bannedUsers.length,
      adminUsers: adminUsers.length,
      totalTransactions: transactions.length,
      totalTransferred,
      totalSupportTickets: tickets.length,
      openSupportTickets: openTickets.length,
      resolvedSupportTickets: resolvedTickets.length,
      tamperedUserRecords: userResult.tamperedCount,
      tamperedTransactionRecords: transactionResult.tamperedCount,
    },
    recentUsers: users.slice(0, 5),
    recentTransactions: transactions.slice(0, 5),
    recentSupportTickets: tickets.slice(0, 5),
  };
};

const listUsersForAdmin = async (query = {}) => {
  const result = await scanAllUsers();
  let users = result.users;

  if (query.role) {
    const role = normalizeRoleForUpdate(query.role);
    users = users.filter((user) => normalizeRole(user.role) === role);
  }

  const activeFilter = parseBooleanFilter(query.isActive);

  if (activeFilter !== null) {
    users = users.filter((user) => user.isActive === activeFilter);
  }

  if (query.search) {
    const search = cleanText(query.search).toLowerCase();

    users = users.filter((user) => {
      return (
        String(user.id || '').toLowerCase().includes(search) ||
        String(user.username || '').toLowerCase().includes(search) ||
        String(user.email || '').toLowerCase().includes(search) ||
        String(user.fullName || '').toLowerCase().includes(search) ||
        String(user.contact || '').toLowerCase().includes(search) ||
        String(user.phone || '').toLowerCase().includes(search)
      );
    });
  }

  users.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const paged = paginate(users, query);

  return {
    users: paged.items,
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: paged.totalPages,
    tamperedCount: result.tamperedCount,
  };
};

const getUserDetailsForAdmin = async (userId) => {
  return findUserByIdForAdmin(userId);
};

const updateUserActiveStatusForAdmin = async ({ adminUserId, targetUserId, isActive, reason }) => {
  const cleanAdminId = assertValidObjectId(adminUserId, 'admin user id');
  const cleanTargetUserId = assertValidObjectId(targetUserId, 'target user id');

  if (cleanAdminId === cleanTargetUserId && isActive === false) {
    const err = new Error('Admin cannot ban their own account');
    err.statusCode = 403;
    throw err;
  }

  await findUserByIdForAdmin(cleanTargetUserId);

  const patch = {
    isActive: isActive === true,
    updatedAt: nowIso(),
  };

  await User.findByIdAndUpdate(
    cleanTargetUserId,
    {
      $set: await encryptSensitiveFields(
        'USER',
        patch,
        userCtx(cleanTargetUserId)
      ),
    }
  );

  const updated = await findUserByIdForAdmin(cleanTargetUserId);

  const actionText = updated.isActive ? 'reactivated' : 'restricted';
  const safeReason = cleanText(reason) || 'No reason provided';

  await notifyUserSafely({
    userId: cleanTargetUserId,
    title: updated.isActive ? 'Account reactivated' : 'Account restricted',
    message: `Your account has been ${actionText} by an administrator.`,
    body: `Reason: ${safeReason}`,
  });

  return updated;
};

const banUserForAdmin = async ({ adminUserId, targetUserId, reason }) => {
  return updateUserActiveStatusForAdmin({
    adminUserId,
    targetUserId,
    isActive: USER_STATUS.BANNED,
    reason,
  });
};

const unbanUserForAdmin = async ({ adminUserId, targetUserId, reason }) => {
  return updateUserActiveStatusForAdmin({
    adminUserId,
    targetUserId,
    isActive: USER_STATUS.ACTIVE,
    reason,
  });
};

const updateUserRoleForAdmin = async ({ adminUserId, targetUserId, role }) => {
  const cleanAdminId = assertValidObjectId(adminUserId, 'admin user id');
  const cleanTargetUserId = assertValidObjectId(targetUserId, 'target user id');
  const newRole = normalizeRoleForUpdate(role);

  if (cleanAdminId === cleanTargetUserId && newRole !== ROLES.ADMIN) {
    const err = new Error('Admin cannot remove their own admin role');
    err.statusCode = 403;
    throw err;
  }

  await findUserByIdForAdmin(cleanTargetUserId);

  const patch = {
    role: newRole,
    updatedAt: nowIso(),
  };

  await User.findByIdAndUpdate(
    cleanTargetUserId,
    {
      $set: await encryptSensitiveFields(
        'USER',
        patch,
        userCtx(cleanTargetUserId)
      ),
    }
  );

  const updated = await findUserByIdForAdmin(cleanTargetUserId);

  await notifyUserSafely({
    userId: cleanTargetUserId,
    title: 'Account role updated',
    message: `Your account role has been updated to ${newRole}.`,
    body: 'This change was made by an administrator.',
  });

  return updated;
};

const listTransactionsForAdmin = async (query = {}) => {
  const result = await scanAllTransactions();
  let transactions = result.transactions;

  if (query.userId) {
    const cleanUserId = assertValidObjectId(query.userId, 'user id');
    transactions = transactions.filter((txn) => String(txn.userId || '') === cleanUserId);
  }

  if (query.status) {
    const status = cleanText(query.status).toUpperCase();
    transactions = transactions.filter((txn) => String(txn.status || '').toUpperCase() === status);
  }

  if (query.type) {
    const type = cleanText(query.type).toUpperCase();

    transactions = transactions.filter((txn) => {
      const txnType = String(txn.transactionType || txn.type || '').toUpperCase();
      return txnType === type;
    });
  }

  if (query.search) {
    const search = cleanText(query.search).toLowerCase();

    transactions = transactions.filter((txn) => {
      return (
        String(txn.id || '').toLowerCase().includes(search) ||
        String(txn.userId || '').toLowerCase().includes(search) ||
        String(txn.reference || '').toLowerCase().includes(search) ||
        String(txn.fromAccount || '').toLowerCase().includes(search) ||
        String(txn.toAccount || '').toLowerCase().includes(search) ||
        String(txn.beneficiaryName || '').toLowerCase().includes(search)
      );
    });
  }

  transactions.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const paged = paginate(transactions, query);

  return {
    transactions: paged.items,
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: paged.totalPages,
    tamperedCount: result.tamperedCount,
  };
};

const getTransactionDetailsForAdmin = async (transactionId) => {
  return findTransactionByIdForAdmin(transactionId);
};

const listSupportTicketsForAdminPanel = async (query = {}) => {
  return getAllSupportTicketsForAdmin(query);
};

const getSupportTicketDetailsForAdminPanel = async (ticketId) => {
  return getSupportTicketForAdmin(ticketId);
};

const manageSupportTicketForAdminPanel = async (adminUserId, ticketId, payload) => {
  return manageSupportTicketAsAdmin(adminUserId, ticketId, payload);
};

module.exports = {
  getAdminOverview,

  listUsersForAdmin,
  getUserDetailsForAdmin,
  updateUserActiveStatusForAdmin,
  banUserForAdmin,
  unbanUserForAdmin,
  updateUserRoleForAdmin,

  listTransactionsForAdmin,
  getTransactionDetailsForAdmin,

  listSupportTicketsForAdminPanel,
  getSupportTicketDetailsForAdminPanel,
  manageSupportTicketForAdminPanel,
};