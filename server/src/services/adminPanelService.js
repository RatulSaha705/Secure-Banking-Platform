'use strict';

/**
 * server/src/services/adminPanelService.js
 *
 * Feature 15 — Admin Panel.
 *
 * Fix:
 *   - Restores controller-required function names:
 *       listUsersForAdmin
 *       listTransactionsForAdmin
 *       banUserForAdmin
 *       unbanUserForAdmin
 *       updateUserRoleForAdmin
 *   - Adds accountNumber in admin user list.
 *   - Keeps encrypted storage pattern.
 */

const mongoose = require('mongoose');
const crypto   = require('crypto');

const User = require('../models/User');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');

const { ROLES, normalizeRole } = require('../constants/roles');
const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/secure-storage');
const { nowIso, toIdString, buildSecCtx } = require('../utils/serviceHelpers');
const { updateAccountBalance } = require('./accountService');

const {
  getAllSupportTicketsForAdmin,
  getSupportTicketForAdmin,
  manageSupportTicketAsAdmin,
} = require('./supportTicketService');

const { createNotification } = require('./notificationService');

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

const normalizeRoleForUpdate = (role) => {
  const clean = normalizeRole(role);

  if (clean !== ROLES.USER && clean !== ROLES.ADMIN) {
    const err = new Error('Invalid role. Allowed roles: USER, ADMIN');
    err.statusCode = 400;
    throw err;
  }

  return clean;
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

const userCtx = (userId) => {
  return buildSecCtx('users', userId, userId);
};

const accountCtx = (userId, accountId) => {
  return buildSecCtx('accounts', userId, accountId);
};

const transactionCtx = (userId, transactionId) => {
  return buildSecCtx('transactions', userId, transactionId);
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

const getAccountOwnerIdFromEnvelope = (enc) => {
  const fields = [
    enc?.userId,
    enc?.ownerUserId,
    enc?.accountOwnerId,
  ];

  for (const field of fields) {
    const owner = getOwnerIdFromEncryptedField(field);

    if (owner) {
      return owner;
    }
  }

  const values = Object.values(enc || {});

  for (const value of values) {
    const owner = getOwnerIdFromEncryptedField(value);

    if (owner) {
      return owner;
    }
  }

  return '';
};

const getTransactionOwnerIdFromEnvelope = (enc) => {
  const fields = [
    enc?.userId,
    enc?.ownerUserId,
    enc?.fromUserId,
    enc?.senderUserId,
    enc?.transactionOwnerId,
  ];

  for (const field of fields) {
    const owner = getOwnerIdFromEncryptedField(field);

    if (owner) {
      return owner;
    }
  }

  const values = Object.values(enc || {});

  for (const value of values) {
    const owner = getOwnerIdFromEncryptedField(value);

    if (owner) {
      return owner;
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

const decryptAccountDocument = async (enc) => {
  if (!enc) {
    return null;
  }

  const accountId = toIdString(enc._id);
  const ownerUserId = getAccountOwnerIdFromEnvelope(enc);

  if (!ownerUserId) {
    return null;
  }

  const dec = await decryptSensitiveFields(
    'ACCOUNT',
    enc,
    accountCtx(ownerUserId, accountId)
  );

  dec._id = accountId;
  dec.id = accountId;

  return dec;
};

const decryptTransactionDocument = async (enc) => {
  if (!enc) {
    return null;
  }

  const transactionId = toIdString(enc._id);
  const ownerUserId = getTransactionOwnerIdFromEnvelope(enc);

  if (!ownerUserId) {
    return null;
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

const buildUserAccountNumberMap = async () => {
  const accounts = await Account.find({}).lean();
  const map = new Map();

  for (const enc of accounts) {
    try {
      const dec = await decryptAccountDocument(enc);

      if (!dec) {
        continue;
      }

      const ownerUserId =
        dec.userId ||
        dec.ownerUserId ||
        dec.accountOwnerId ||
        getAccountOwnerIdFromEnvelope(enc);

      const accountNumber =
        dec.accountNumber ||
        dec.number ||
        dec.accountNo ||
        '';

      if (ownerUserId && accountNumber && !map.has(String(ownerUserId))) {
        map.set(String(ownerUserId), String(accountNumber));
      }
    } catch {
      // Skip tampered or undecryptable account.
    }
  }

  return map;
};

const toPublicUser = (user, accountNumber = '') => {
  const role = normalizeRole(user.role || ROLES.USER);

  return {
    id: user.id || user._id,
    username: user.username || '',
    email: user.email || '',
    contact: user.contact || user.phone || '',
    phone: user.phone || user.contact || '',
    fullName: user.fullName || user.name || user.username || '',
    role,
    isActive: user.isActive === true,
    twoStepVerificationEnabled: user.twoStepVerificationEnabled === true,
    accountNumber: accountNumber || 'Not available',
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
    amount: Number(txn.amount || 0),
    currency: txn.currency || 'BDT',
    fromAccount: txn.fromAccount || txn.fromAccountNumber || '',
    toAccount: txn.toAccount || txn.toAccountNumber || '',
    beneficiaryName: txn.beneficiaryName || '',
    status: txn.status || 'UNKNOWN',
    reference: txn.reference || txn.transactionReference || '',
    description: txn.description || txn.note || '',
    createdAt: txn.createdAt || null,
    updatedAt: txn.updatedAt || null,
  };
};

const scanAllUsers = async () => {
  const all = await User.find({}).lean();
  const accountNumberMap = await buildUserAccountNumberMap();

  const users = [];
  let tamperedCount = 0;

  for (const enc of all) {
    try {
      const dec = await decryptUserDocument(enc);

      if (dec) {
        const accountNumber = accountNumberMap.get(String(dec.id)) || '';
        users.push(toPublicUser(dec, accountNumber));
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

  const accountNumberMap = await buildUserAccountNumberMap();
  const accountNumber = accountNumberMap.get(cleanUserId) || '';

  return toPublicUser(dec, accountNumber);
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

const countActiveAdmins = async () => {
  const result = await scanAllUsers();

  return result.users.filter((user) => {
    return normalizeRole(user.role) === ROLES.ADMIN && user.isActive === true;
  }).length;
};

const getAdminOverview = async () => {
  const userResult = await scanAllUsers();
  const transactionResult = await scanAllTransactions();

  let ticketResult = {
    tickets: [],
  };

  try {
    ticketResult = await getAllSupportTicketsForAdmin({});
  } catch {
    ticketResult = {
      tickets: [],
    };
  }

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

  const totalTransferred = transactions.reduce((sum, txn) => {
    const amount = Number(txn.amount || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  users.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
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
    const role = normalizeRole(query.role);
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
        String(user.phone || '').toLowerCase().includes(search) ||
        String(user.accountNumber || '').toLowerCase().includes(search)
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

  const nextActiveState = isActive === true;

  if (cleanAdminId === cleanTargetUserId && nextActiveState === false) {
    const err = new Error('Admin cannot ban their own account');
    err.statusCode = 403;
    throw err;
  }

  const existing = await findUserByIdForAdmin(cleanTargetUserId);

  if (
    normalizeRole(existing.role) === ROLES.ADMIN &&
    nextActiveState === false
  ) {
    const activeAdminCount = await countActiveAdmins();

    if (activeAdminCount <= 1) {
      const err = new Error('Cannot ban the last active admin');
      err.statusCode = 400;
      throw err;
    }
  }

  const patch = {
    isActive: nextActiveState,
    updatedAt: nowIso(),
  };

  await User.findByIdAndUpdate(
    cleanTargetUserId,
    {
      $set: await encryptSensitiveFields('USER', patch, userCtx(cleanTargetUserId)),
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
    isActive: false,
    reason,
  });
};

const unbanUserForAdmin = async ({ adminUserId, targetUserId, reason }) => {
  return updateUserActiveStatusForAdmin({
    adminUserId,
    targetUserId,
    isActive: true,
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

  const existing = await findUserByIdForAdmin(cleanTargetUserId);

  if (
    normalizeRole(existing.role) === ROLES.ADMIN &&
    newRole === ROLES.USER
  ) {
    const activeAdminCount = await countActiveAdmins();

    if (activeAdminCount <= 1) {
      const err = new Error('Cannot demote the last active admin');
      err.statusCode = 400;
      throw err;
    }
  }

  const patch = {
    role: newRole,
    updatedAt: nowIso(),
  };

  await User.findByIdAndUpdate(
    cleanTargetUserId,
    {
      $set: await encryptSensitiveFields('USER', patch, userCtx(cleanTargetUserId)),
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

/**
 * adminTransferToUser  (Admin Feature)
 *
 * Credit money directly to any user's account by account number.
 * Records a CREDIT transaction document for the recipient.
 * Does not debit any source account — this is an admin-only top-up.
 *
 * @param {string} adminUserId
 * @param {{ toAccountNumber, amount, description? }} payload
 */
const adminTransferToUser = async (adminUserId, payload) => {
  const cleanAdminId = assertValidObjectId(adminUserId, 'admin user id');

  const { toAccountNumber, amount, description } = payload || {};
  const parsedAmount = Number(amount);

  if (!toAccountNumber || cleanText(toAccountNumber) === '') {
    const err = new Error('Recipient account number is required');
    err.statusCode = 400;
    throw err;
  }
  if (!parsedAmount || parsedAmount <= 0 || !Number.isFinite(parsedAmount)) {
    const err = new Error('Amount must be a positive number');
    err.statusCode = 400;
    throw err;
  }
  if (parsedAmount > 10_000_000) {
    const err = new Error('Admin transfer limit is BDT 1,00,00,000');
    err.statusCode = 400;
    throw err;
  }

  // Find the recipient account by scanning all accounts.
  const allAccounts = await Account.find({}).lean();
  let recipientAccountDoc = null;
  let recipientUserId     = null;

  for (const enc of allAccounts) {
    const ownerId = getAccountOwnerIdFromEnvelope(enc);
    if (!ownerId) continue;

    let dec;
    try {
      const accountId = toIdString(enc._id);
      dec = await decryptSensitiveFields('ACCOUNT', enc, accountCtx(ownerId, accountId));
      dec._id = accountId;
      dec.id  = accountId;
    } catch { continue; }

    const normalise = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
    if (normalise(dec.accountNumber) === normalise(toAccountNumber)) {
      recipientAccountDoc = dec;
      recipientUserId     = ownerId;
      break;
    }
  }

  if (!recipientAccountDoc || !recipientUserId) {
    const err = new Error('Recipient account number not found');
    err.statusCode = 404;
    throw err;
  }

  if (recipientAccountDoc.accountStatus !== 'active') {
    const err = new Error('Recipient account is not active');
    err.statusCode = 422;
    throw err;
  }

  // Credit the recipient.
  const newBalance = Number(recipientAccountDoc.balance || 0) + parsedAmount;
  await updateAccountBalance(recipientAccountDoc.id, recipientUserId, newBalance);

  // Record a CREDIT transaction for the recipient.
  const reference  = 'ADMIN' + crypto.randomBytes(5).toString('hex').toUpperCase();
  const timestamp  = nowIso();
  const txnId      = new mongoose.Types.ObjectId().toString();
  const txnCtxFn   = (uid, tid) => buildSecCtx('transactions', uid, tid);

  const full = {
    _id:             txnId,
    userId:          recipientUserId,
    fromAccount:     'ADMIN',
    toAccount:       recipientAccountDoc.accountNumber,
    amount:          parsedAmount,
    description:     description ?? 'Admin top-up',
    reference,
    receiverName:    null,
    receiverBank:    'SecureBank',
    transactionType: 'CREDIT',
    status:          'completed',
    createdAt:       timestamp,
    updatedAt:       timestamp,
  };

  await Transaction.create(
    await encryptSensitiveFields('TRANSACTION', full, txnCtxFn(recipientUserId, txnId))
  );

  await notifyUserSafely({
    userId: recipientUserId,
    title:  'Account Credited',
    message: `BDT ${parsedAmount.toLocaleString()} has been added to your account by an administrator.`,
    body:   `Reference: ${reference}. ${description ?? 'Admin top-up'}.`,
  });

  return {
    success:      true,
    reference,
    amount:       parsedAmount,
    toAccount:    recipientAccountDoc.accountNumber,
    newBalance,
    recipientUserId,
    completedAt:  timestamp,
  };
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

  adminTransferToUser,
};