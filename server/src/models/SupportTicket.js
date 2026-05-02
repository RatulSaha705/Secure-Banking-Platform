'use strict';

/**
 * server/src/models/SupportTicket.js
 *
 * Feature 13 — Support Ticket System.
 *
 * Strict encrypted MongoDB rule:
 *   Only _id is readable.
 *   Every other value is stored as an encrypted envelope object by the service
 *   before save and decrypted only after authorization.
 *
 * Ticket fields:
 *   userId    – Ticket owner user id (encrypted)
 *   title     – Short problem/request title (encrypted)
 *   message   – Main ticket body/post content (encrypted with ECC)
 *   comments  – User/admin replies array (encrypted with ECC)
 *   status    – OPEN | IN_PROGRESS | WAITING_USER | RESOLVED | CLOSED (encrypted)
 *   priority  – LOW | MEDIUM | HIGH | URGENT (encrypted)
 *   createdAt – ISO timestamp (encrypted)
 *   updatedAt – ISO timestamp (encrypted)
 */

const mongoose = require('mongoose');

const enc = mongoose.Schema.Types.Mixed;

const supportTicketSchema = new mongoose.Schema(
  {
    userId:    { type: enc, required: true },
    title:     { type: enc, required: true },
    message:   { type: enc, required: true },
    comments:  { type: enc, required: true },
    status:    { type: enc, required: true },
    priority:  { type: enc, required: true },
    createdAt: { type: enc, required: true },
    updatedAt: { type: enc, required: true },
  },
  {
    timestamps: false,
    strict: true,
  }
);

module.exports =
  mongoose.models.SupportTicket || mongoose.model('SupportTicket', supportTicketSchema);