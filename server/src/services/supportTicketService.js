'use strict';

/**
 * server/src/services/supportTicketService.js
 *
 * Feature 13 — Support Ticket System.
 *
 * Allows users to create/view/update their own tickets and allows admins to
 * review/manage all tickets.
 *
 * Security rules followed:
 *   - No plaintext field except MongoDB _id.
 *   - Ticket content uses SUPPORT_TICKET / TICKET_COMMENT storage policy.
 *   - The encryption policy maps these data types to custom ECC.
 *   - The encrypted storage layer attaches and verifies HMAC integrity MACs.
 *   - Because userId/status/priority are encrypted, list operations scan then
 *     decrypt/filter after authorization instead of querying plaintext fields.
 */

const mongoose = require('mongoose');

const SupportTicket = require('../models/SupportTicket');
const { ROLES, normalizeRole } = require('../constants/roles');
const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/secure-storage');
const { nowIso, toIdString, buildSecCtx } = require('../utils/serviceHelpers');

const TICKET_STATUSES = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_USER: 'WAITING_USER',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
});

const TICKET_PRIORITIES = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
});

const USER_EDIT_BLOCKED_STATUSES = Object.freeze([
  TICKET_STATUSES.RESOLVED,
  TICKET_STATUSES.CLOSED,
]);

const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 3000;
const MAX_COMMENT_LENGTH = 2000;

const ticketCtx = (userId, ticketId) => buildSecCtx('supporttickets', userId, ticketId);

const assertValidObjectId = (value, label) => {
  const clean = String(value || '').trim();

  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error(`Invalid ${label}`);
    err.statusCode = 400;
    throw err;
  }

  return clean;
};

const cleanText = (value) => String(value || '').trim();

const normalizeTicketStatus = (value, fallback = TICKET_STATUSES.OPEN) => {
  const clean = String(value || fallback).trim().toUpperCase();

  if (!Object.values(TICKET_STATUSES).includes(clean)) {
    const err = new Error('Invalid ticket status');
    err.statusCode = 400;
    throw err;
  }

  return clean;
};

const normalizeTicketPriority = (value, fallback = TICKET_PRIORITIES.MEDIUM) => {
  const clean = String(value || fallback).trim().toUpperCase();

  if (!Object.values(TICKET_PRIORITIES).includes(clean)) {
    const err = new Error('Invalid ticket priority');
    err.statusCode = 400;
    throw err;
  }

  return clean;
};

const getTicketOwnerIdFromEnvelope = (enc) => {
  const ff = enc?.userId;

  if (ff?.ownerUserId) return String(ff.ownerUserId);
  if (ff?.metadata?.ownerId) return String(ff.metadata.ownerId);
  if (ff?.metadata?.userId) return String(ff.metadata.userId);

  return '';
};

const decryptTicketDocument = async (enc, ownerUserId) => {
  if (!enc) return null;

  const ticketId = toIdString(enc._id);

  const dec = await decryptSensitiveFields(
    'SUPPORT_TICKET',
    enc,
    ticketCtx(ownerUserId, ticketId)
  );

  dec._id = ticketId;
  dec.id = ticketId;

  return dec;
};

const toPublicTicket = (dec) => ({
  id: dec.id || dec._id,
  userId: dec.userId || null,
  title: dec.title || '',
  message: dec.message || '',
  description: dec.message || '',
  comments: Array.isArray(dec.comments) ? dec.comments : [],
  status: dec.status || null,
  priority: dec.priority || null,
  createdAt: dec.createdAt || null,
  updatedAt: dec.updatedAt || null,
});

const validateTitleAndMessage = ({ title, message }) => {
  const cleanTitle = cleanText(title);
  const cleanMessage = cleanText(message);

  if (!cleanTitle) {
    const err = new Error('Ticket title is required');
    err.statusCode = 400;
    throw err;
  }

  if (cleanTitle.length > MAX_TITLE_LENGTH) {
    const err = new Error(`Ticket title must be ${MAX_TITLE_LENGTH} characters or less`);
    err.statusCode = 400;
    throw err;
  }

  if (!cleanMessage) {
    const err = new Error('Ticket message is required');
    err.statusCode = 400;
    throw err;
  }

  if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
    const err = new Error(`Ticket message must be ${MAX_MESSAGE_LENGTH} characters or less`);
    err.statusCode = 400;
    throw err;
  }

  return { cleanTitle, cleanMessage };
};

const buildComment = ({ userId, role, message }) => {
  const cleanMessage = cleanText(message);

  if (!cleanMessage) {
    const err = new Error('Comment message is required');
    err.statusCode = 400;
    throw err;
  }

  if (cleanMessage.length > MAX_COMMENT_LENGTH) {
    const err = new Error(`Comment must be ${MAX_COMMENT_LENGTH} characters or less`);
    err.statusCode = 400;
    throw err;
  }

  return {
    authorUserId: String(userId),
    authorRole: normalizeRole(role) === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USER,
    message: cleanMessage,
    createdAt: nowIso(),
  };
};

const scanTicketsForUser = async (userId) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');
  const all = await SupportTicket.find({}).lean();
  const tickets = [];

  for (const enc of all) {
    const ownerUserId = getTicketOwnerIdFromEnvelope(enc);

    if (ownerUserId !== cleanUserId) {
      continue;
    }

    try {
      const dec = await decryptTicketDocument(enc, cleanUserId);

      if (String(dec.userId) === cleanUserId) {
        tickets.push(dec);
      }
    } catch {
      // MAC verification/decryption failed. Do not expose tampered data.
    }
  }

  return tickets;
};

const scanAllTicketsForAdmin = async () => {
  const all = await SupportTicket.find({}).lean();
  const tickets = [];

  for (const enc of all) {
    const ownerUserId = getTicketOwnerIdFromEnvelope(enc);

    if (!ownerUserId) {
      continue;
    }

    try {
      tickets.push(await decryptTicketDocument(enc, ownerUserId));
    } catch {
      // MAC verification/decryption failed. Do not expose tampered data.
    }
  }

  return tickets;
};

const findTicketForUser = async (userId, ticketId) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');
  const cleanTicketId = assertValidObjectId(ticketId, 'ticket id');

  const enc = await SupportTicket.findById(cleanTicketId).lean();

  if (!enc) {
    const err = new Error('Support ticket not found');
    err.statusCode = 404;
    throw err;
  }

  let dec;

  try {
    dec = await decryptTicketDocument(enc, cleanUserId);
  } catch {
    const err = new Error('Support ticket not found');
    err.statusCode = 404;
    throw err;
  }

  if (String(dec.userId) !== cleanUserId) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  return dec;
};

const findTicketForAdmin = async (ticketId) => {
  const cleanTicketId = assertValidObjectId(ticketId, 'ticket id');

  const enc = await SupportTicket.findById(cleanTicketId).lean();

  if (!enc) {
    const err = new Error('Support ticket not found');
    err.statusCode = 404;
    throw err;
  }

  const ownerUserId = getTicketOwnerIdFromEnvelope(enc);

  if (!ownerUserId) {
    const err = new Error('Ticket owner metadata is missing');
    err.statusCode = 409;
    throw err;
  }

  return decryptTicketDocument(enc, ownerUserId);
};

const sortNewestFirst = (tickets) => {
  return tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const createSupportTicket = async (userId, payload) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');

  const { cleanTitle, cleanMessage } = validateTitleAndMessage({
    title: payload?.title,
    message: payload?.message ?? payload?.description,
  });

  const priority = normalizeTicketPriority(payload?.priority, TICKET_PRIORITIES.MEDIUM);
  const ticketId = new mongoose.Types.ObjectId().toString();
  const timestamp = nowIso();

  const plain = {
    _id: ticketId,
    userId: cleanUserId,
    title: cleanTitle,
    message: cleanMessage,
    comments: [],
    status: TICKET_STATUSES.OPEN,
    priority,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const saved = await SupportTicket.create(
    await encryptSensitiveFields('SUPPORT_TICKET', plain, ticketCtx(cleanUserId, ticketId))
  );

  return toPublicTicket(await decryptTicketDocument(saved.toObject(), cleanUserId));
};

const getMySupportTickets = async (userId, filters = {}) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');
  let tickets = await scanTicketsForUser(cleanUserId);

  if (filters.status) {
    const status = normalizeTicketStatus(filters.status);
    tickets = tickets.filter((ticket) => ticket.status === status);
  }

  if (filters.priority) {
    const priority = normalizeTicketPriority(filters.priority);
    tickets = tickets.filter((ticket) => ticket.priority === priority);
  }

  const list = sortNewestFirst(tickets).map(toPublicTicket);

  return {
    tickets: list,
    count: list.length,
  };
};

const getMySupportTicketById = async (userId, ticketId) => {
  const dec = await findTicketForUser(userId, ticketId);
  return toPublicTicket(dec);
};

const updateMySupportTicket = async (userId, ticketId, updates) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');
  const cleanTicketId = assertValidObjectId(ticketId, 'ticket id');

  const current = await findTicketForUser(cleanUserId, cleanTicketId);

  if (USER_EDIT_BLOCKED_STATUSES.includes(current.status)) {
    const err = new Error('Resolved or closed tickets can no longer be edited by the user');
    err.statusCode = 403;
    throw err;
  }

  const nextTitle = updates?.title !== undefined ? updates.title : current.title;

  const nextMessageSource =
    updates?.message !== undefined
      ? updates.message
      : updates?.description !== undefined
        ? updates.description
        : current.message;

  const { cleanTitle, cleanMessage } = validateTitleAndMessage({
    title: nextTitle,
    message: nextMessageSource,
  });

  const patch = {
    title: cleanTitle,
    message: cleanMessage,
    priority:
      updates?.priority !== undefined
        ? normalizeTicketPriority(updates.priority)
        : current.priority,
    updatedAt: nowIso(),
  };

  await SupportTicket.findByIdAndUpdate(
    cleanTicketId,
    {
      $set: await encryptSensitiveFields(
        'SUPPORT_TICKET',
        patch,
        ticketCtx(cleanUserId, cleanTicketId)
      ),
    }
  );

  const refreshed = await SupportTicket.findById(cleanTicketId).lean();

  return toPublicTicket(await decryptTicketDocument(refreshed, cleanUserId));
};

const addMySupportTicketComment = async (userId, ticketId, payload) => {
  const cleanUserId = assertValidObjectId(userId, 'user id');
  const cleanTicketId = assertValidObjectId(ticketId, 'ticket id');

  const current = await findTicketForUser(cleanUserId, cleanTicketId);

  if (current.status === TICKET_STATUSES.CLOSED) {
    const err = new Error('Closed tickets cannot receive new comments');
    err.statusCode = 403;
    throw err;
  }

  const comments = Array.isArray(current.comments) ? current.comments : [];

  comments.push(
    buildComment({
      userId: cleanUserId,
      role: ROLES.USER,
      message: payload?.message,
    })
  );

  const patch = {
    comments,
    status:
      current.status === TICKET_STATUSES.RESOLVED
        ? TICKET_STATUSES.WAITING_USER
        : current.status,
    updatedAt: nowIso(),
  };

  await SupportTicket.findByIdAndUpdate(
    cleanTicketId,
    {
      $set: await encryptSensitiveFields(
        'SUPPORT_TICKET',
        patch,
        ticketCtx(cleanUserId, cleanTicketId)
      ),
    }
  );

  const refreshed = await SupportTicket.findById(cleanTicketId).lean();

  return toPublicTicket(await decryptTicketDocument(refreshed, cleanUserId));
};

const getAllSupportTicketsForAdmin = async (filters = {}) => {
  let tickets = await scanAllTicketsForAdmin();

  if (filters.userId) {
    const userId = assertValidObjectId(filters.userId, 'user id');
    tickets = tickets.filter((ticket) => String(ticket.userId) === userId);
  }

  if (filters.status) {
    const status = normalizeTicketStatus(filters.status);
    tickets = tickets.filter((ticket) => ticket.status === status);
  }

  if (filters.priority) {
    const priority = normalizeTicketPriority(filters.priority);
    tickets = tickets.filter((ticket) => ticket.priority === priority);
  }

  const list = sortNewestFirst(tickets).map(toPublicTicket);

  return {
    tickets: list,
    count: list.length,
  };
};

const getSupportTicketForAdmin = async (ticketId) => {
  const dec = await findTicketForAdmin(ticketId);
  return toPublicTicket(dec);
};

const manageSupportTicketAsAdmin = async (adminUserId, ticketId, updates) => {
  const cleanAdminId = assertValidObjectId(adminUserId, 'admin user id');
  const cleanTicketId = assertValidObjectId(ticketId, 'ticket id');

  const current = await findTicketForAdmin(cleanTicketId);
  const ownerUserId = String(current.userId);

  const patch = {
    status:
      updates?.status !== undefined
        ? normalizeTicketStatus(updates.status)
        : current.status,
    priority:
      updates?.priority !== undefined
        ? normalizeTicketPriority(updates.priority)
        : current.priority,
    comments: Array.isArray(current.comments) ? current.comments : [],
    updatedAt: nowIso(),
  };

  if (updates?.comment || updates?.reply || updates?.message) {
    patch.comments.push(
      buildComment({
        userId: cleanAdminId,
        role: ROLES.ADMIN,
        message: updates.comment || updates.reply || updates.message,
      })
    );
  }

  await SupportTicket.findByIdAndUpdate(
    cleanTicketId,
    {
      $set: await encryptSensitiveFields(
        'SUPPORT_TICKET',
        patch,
        ticketCtx(ownerUserId, cleanTicketId)
      ),
    }
  );

  const refreshed = await SupportTicket.findById(cleanTicketId).lean();

  return toPublicTicket(await decryptTicketDocument(refreshed, ownerUserId));
};

module.exports = {
  TICKET_STATUSES,
  TICKET_PRIORITIES,

  createSupportTicket,
  getMySupportTickets,
  getMySupportTicketById,
  updateMySupportTicket,
  addMySupportTicketComment,

  getAllSupportTicketsForAdmin,
  getSupportTicketForAdmin,
  manageSupportTicketAsAdmin,
};