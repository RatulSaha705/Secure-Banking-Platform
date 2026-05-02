'use strict';

/**
 * server/src/services/notificationService.js
 *
 * Feature 14 — Notifications and Alerts.
 *
 * Updated:
 *   Admin can send notification by account number.
 *
 * Security:
 *   - Only _id stays readable in MongoDB.
 *   - Notification values are encrypted.
 *   - Account number is encrypted, so admin notification by account number
 *     scans/decrypts accounts safely and then matches the plaintext value
 *     after authorization.
 */

const mongoose = require('mongoose');

const Notification = require('../models/Notification');
const User = require('../models/User');
const Account = require('../models/Account');

const { ROLES, normalizeRole } = require('../constants/roles');
const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/storage');
const { nowIso, toIdString, buildSecCtx } = require('../utils/serviceHelpers');

const NOTIFICATION_TYPES = Object.freeze({
  LOGIN_ALERT: 'LOGIN_ALERT',
  TRANSACTION_ALERT: 'TRANSACTION_ALERT',
  SUPPORT_TICKET_CREATED: 'SUPPORT_TICKET_CREATED',
  SUPPORT_TICKET_RESOLVED: 'SUPPORT_TICKET_RESOLVED',
  GENERAL_ALERT: 'GENERAL_ALERT',
});

const notificationCtx = (userId, notificationId) => {
  return buildSecCtx('notifications', userId, notificationId);
};

const userCtx = (userId) => {
  return buildSecCtx('users', userId, userId);
};

const accountCtx = (userId, accountId) => {
  return buildSecCtx('accounts', userId, accountId);
};

const cleanText = (value) => {
  return String(value || '').trim();
};

const normalizeAccountNumber = (value) => {
  return String(value || '').replace(/\s+/g, '').trim();
};

const assertValidObjectId = (value, label) => {
  const clean = String(value || '').trim();

  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error(`Invalid ${label}`);
    err.statusCode = 400;
    throw err;
  }

  return clean;
};

const normalizeNotificationType = (type) => {
  const clean = String(type || NOTIFICATION_TYPES.GENERAL_ALERT).trim().toUpperCase();

  if (!Object.values(NOTIFICATION_TYPES).includes(clean)) {
    const err = new Error('Invalid notification type');
    err.statusCode = 400;
    throw err;
  }

  return clean;
};

const getOwnerIdFromEnvelope = (enc) => {
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

const getAccountOwnerIdFromEnvelope = (enc) => {
  const possibleFields = [
    enc?.userId,
    enc?.ownerUserId,
    enc?.accountOwnerId,
  ];

  for (const field of possibleFields) {
    if (field?.ownerUserId) {
      return String(field.ownerUserId);
    }

    if (field?.metadata?.ownerId) {
      return String(field.metadata.ownerId);
    }

    if (field?.metadata?.userId) {
      return String(field.metadata.userId);
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

const decryptNotificationDocument = async (enc, ownerUserId) => {
  if (!enc) {
    return null;
  }

  const notificationId = toIdString(enc._id);

  const dec = await decryptSensitiveFields(
    'NOTIFICATION',
    enc,
    notificationCtx(ownerUserId, notificationId)
  );

  dec._id = notificationId;
  dec.id = notificationId;

  return dec;
};

const toPublicNotification = (dec) => {
  return {
    id: dec.id || dec._id,
    userId: dec.userId || null,
    title: dec.title || '',
    message: dec.message || '',
    body: dec.body || null,
    type: dec.type || NOTIFICATION_TYPES.GENERAL_ALERT,
    isRead: dec.isRead === true,
    createdAt: dec.createdAt || null,
    updatedAt: dec.updatedAt || null,
  };
};

const createNotification = async ({ userId, title, message, body, type }) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');

  const cleanTitle = cleanText(title);
  const cleanMessage = cleanText(message);
  const cleanBody = body === undefined || body === null ? null : cleanText(body);
  const cleanType = normalizeNotificationType(type);

  if (!cleanTitle) {
    const err = new Error('Notification title is required');
    err.statusCode = 400;
    throw err;
  }

  if (!cleanMessage) {
    const err = new Error('Notification message is required');
    err.statusCode = 400;
    throw err;
  }

  const notificationId = new mongoose.Types.ObjectId().toString();
  const timestamp = nowIso();

  const plain = {
    _id: notificationId,
    userId: cleanUserId,
    title: cleanTitle,
    message: cleanMessage,
    body: cleanBody,
    type: cleanType,
    isRead: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const saved = await Notification.create(
    await encryptSensitiveFields(
      'NOTIFICATION',
      plain,
      notificationCtx(cleanUserId, notificationId)
    )
  );

  const dec = await decryptNotificationDocument(saved.toObject(), cleanUserId);

  return toPublicNotification(dec);
};

const findUserIdByAccountNumber = async (accountNumber) => {
  const cleanAccountNumber = normalizeAccountNumber(accountNumber);

  if (!cleanAccountNumber) {
    const err = new Error('Account number is required');
    err.statusCode = 400;
    throw err;
  }

  const accounts = await Account.find({}).lean();

  for (const enc of accounts) {
    try {
      const dec = await decryptAccountDocument(enc);

      if (!dec) {
        continue;
      }

      const currentAccountNumber = normalizeAccountNumber(
        dec.accountNumber || dec.number || dec.accountNo
      );

      if (currentAccountNumber === cleanAccountNumber) {
        const userId =
          dec.userId ||
          dec.ownerUserId ||
          dec.accountOwnerId ||
          getAccountOwnerIdFromEnvelope(enc);

        if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
          return String(userId);
        }
      }
    } catch {
      // Skip tampered or undecryptable account.
    }
  }

  const err = new Error('No user found for this account number');
  err.statusCode = 404;
  throw err;
};

const createNotificationByAccountNumber = async ({
  accountNumber,
  title,
  message,
  body,
  type,
}) => {
  const userId = await findUserIdByAccountNumber(accountNumber);

  return createNotification({
    userId,
    type,
    title,
    message,
    body,
  });
};

const getMyNotifications = async (userId, filters = {}) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');

  const all = await Notification.find({}).lean();
  const mine = [];

  for (const enc of all) {
    const ownerUserId = getOwnerIdFromEnvelope(enc);

    if (ownerUserId !== cleanUserId) {
      continue;
    }

    try {
      const dec = await decryptNotificationDocument(enc, cleanUserId);

      if (String(dec.userId) === cleanUserId) {
        mine.push(toPublicNotification(dec));
      }
    } catch {
      // MAC/decryption failed. Do not expose tampered notifications.
    }
  }

  let filtered = mine;

  if (filters.type) {
    const requestedType = normalizeNotificationType(filters.type);
    filtered = filtered.filter((item) => item.type === requestedType);
  }

  if (filters.isRead !== undefined) {
    const readFilter = String(filters.isRead).trim().toLowerCase();

    if (readFilter === 'true') {
      filtered = filtered.filter((item) => item.isRead === true);
    }

    if (readFilter === 'false') {
      filtered = filtered.filter((item) => item.isRead === false);
    }
  }

  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    notifications: filtered,
    count: filtered.length,
    unreadCount: filtered.filter((item) => item.isRead === false).length,
  };
};

const getMyUnreadNotificationCount = async (userId) => {
  const result = await getMyNotifications(userId, { isRead: false });

  return {
    unreadCount: result.count,
  };
};

const markNotificationAsRead = async (userId, notificationId) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');
  const cleanNotificationId = assertValidObjectId(notificationId, 'notification id');

  const enc = await Notification.findById(cleanNotificationId).lean();

  if (!enc) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }

  let dec;

  try {
    dec = await decryptNotificationDocument(enc, cleanUserId);
  } catch {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }

  if (String(dec.userId) !== cleanUserId) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  const patch = {
    isRead: true,
    updatedAt: nowIso(),
  };

  await Notification.findByIdAndUpdate(
    cleanNotificationId,
    {
      $set: await encryptSensitiveFields(
        'NOTIFICATION',
        patch,
        notificationCtx(cleanUserId, cleanNotificationId)
      ),
    }
  );

  const refreshed = await Notification.findById(cleanNotificationId).lean();
  const refreshedDec = await decryptNotificationDocument(refreshed, cleanUserId);

  return toPublicNotification(refreshedDec);
};

const markAllMyNotificationsAsRead = async (userId) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');

  const result = await getMyNotifications(cleanUserId, { isRead: false });
  let updatedCount = 0;

  for (const notification of result.notifications) {
    try {
      await markNotificationAsRead(cleanUserId, notification.id);
      updatedCount += 1;
    } catch {
      // Skip tampered/deleted notification.
    }
  }

  return {
    updatedCount,
  };
};

const getAdminUsers = async () => {
  const all = await User.find({}).lean();
  const admins = [];

  for (const enc of all) {
    try {
      const user = await decryptUserDocument(enc);

      if (
        normalizeRole(user.role) === ROLES.ADMIN &&
        user.isActive === true
      ) {
        admins.push(user);
      }
    } catch {
      // Skip tampered user record.
    }
  }

  return admins;
};

const createNotificationForAllAdmins = async ({ title, message, body, type }) => {
  const admins = await getAdminUsers();
  const created = [];

  for (const admin of admins) {
    try {
      const notification = await createNotification({
        userId: admin.id,
        title,
        message,
        body,
        type,
      });

      created.push(notification);
    } catch {
      // Do not fail the original feature if one admin notification fails.
    }
  }

  return {
    createdCount: created.length,
    notifications: created,
  };
};

const createLoginAlertNotification = async (userId, req) => {
  const ipAddress =
    req?.ip ||
    req?.headers?.['x-forwarded-for'] ||
    req?.socket?.remoteAddress ||
    'unknown';

  const userAgent = req?.headers?.['user-agent'] || 'unknown device';
  const timestamp = nowIso();

  return createNotification({
    userId,
    type: NOTIFICATION_TYPES.LOGIN_ALERT,
    title: 'New login alert',
    message: 'A successful login was detected on your account.',
    body:
      `A successful login was completed at ${timestamp}. ` +
      `IP: ${ipAddress}. Device: ${userAgent}.`,
  });
};

const createTransactionAlertNotification = async (userId, receipt) => {
  return createNotification({
    userId,
    type: NOTIFICATION_TYPES.TRANSACTION_ALERT,
    title: 'Transaction completed',
    message: `Your transfer of BDT ${Number(receipt.amount || 0).toLocaleString()} was completed.`,
    body:
      `Reference: ${receipt.reference}. ` +
      `To account: ${receipt.toAccount}. ` +
      `New balance: BDT ${Number(receipt.newBalance || 0).toLocaleString()}.`,
  });
};

const createSupportTicketCreatedAdminNotification = async (ticket) => {
  return createNotificationForAllAdmins({
    type: NOTIFICATION_TYPES.SUPPORT_TICKET_CREATED,
    title: 'New support ticket submitted',
    message: `A user submitted a new support ticket: ${ticket.title}.`,
    body:
      `Ticket ID: ${ticket.id}. ` +
      `User ID: ${ticket.userId}. ` +
      `Priority: ${ticket.priority}. ` +
      `Status: ${ticket.status}.`,
  });
};

const createSupportTicketResolvedUserNotification = async (ticket) => {
  return createNotification({
    userId: ticket.userId,
    type: NOTIFICATION_TYPES.SUPPORT_TICKET_RESOLVED,
    title: 'Support ticket resolved',
    message: `Your support ticket "${ticket.title}" has been resolved.`,
    body:
      `Ticket ID: ${ticket.id}. ` +
      `Status: ${ticket.status}. ` +
      `Please review the admin reply in your support ticket page.`,
  });
};

const safeCreateLoginAlertNotification = async (userId, req) => {
  try {
    return await createLoginAlertNotification(userId, req);
  } catch {
    return null;
  }
};

const safeCreateTransactionAlertNotification = async (userId, receipt) => {
  try {
    return await createTransactionAlertNotification(userId, receipt);
  } catch {
    return null;
  }
};

const safeCreateSupportTicketCreatedAdminNotification = async (ticket) => {
  try {
    return await createSupportTicketCreatedAdminNotification(ticket);
  } catch {
    return null;
  }
};

const safeCreateSupportTicketResolvedUserNotification = async (ticket) => {
  try {
    return await createSupportTicketResolvedUserNotification(ticket);
  } catch {
    return null;
  }
};

module.exports = {
  NOTIFICATION_TYPES,

  createNotification,
  createNotificationByAccountNumber,
  createNotificationForAllAdmins,

  getMyNotifications,
  getMyUnreadNotificationCount,
  markNotificationAsRead,
  markAllMyNotificationsAsRead,

  createLoginAlertNotification,
  createTransactionAlertNotification,
  createSupportTicketCreatedAdminNotification,
  createSupportTicketResolvedUserNotification,

  safeCreateLoginAlertNotification,
  safeCreateTransactionAlertNotification,
  safeCreateSupportTicketCreatedAdminNotification,
  safeCreateSupportTicketResolvedUserNotification,
};