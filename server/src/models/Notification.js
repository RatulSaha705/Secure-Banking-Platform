'use strict';

/**
 * server/src/models/Notification.js
 *
 * Feature 14 — Notifications and Alerts.
 *
 * Strict encrypted MongoDB rule:
 *   Only _id is readable.
 *   Every other value is encrypted before storage.
 *
 * Notification fields:
 *   userId    - recipient user id, encrypted
 *   title     - alert title, encrypted
 *   message   - short message, encrypted
 *   body      - detailed message, encrypted
 *   type      - LOGIN_ALERT / TRANSACTION_ALERT / SUPPORT_TICKET_CREATED / SUPPORT_TICKET_RESOLVED, encrypted
 *   isRead    - boolean read state, encrypted
 *   createdAt - encrypted ISO timestamp
 *   updatedAt - encrypted ISO timestamp
 */

const mongoose = require('mongoose');

const encryptedValue = mongoose.Schema.Types.Mixed;

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: encryptedValue,
      required: true,
    },

    title: {
      type: encryptedValue,
      required: true,
    },

    message: {
      type: encryptedValue,
      required: true,
    },

    body: {
      type: encryptedValue,
      default: null,
    },

    type: {
      type: encryptedValue,
      required: true,
    },

    isRead: {
      type: encryptedValue,
      required: true,
    },

    createdAt: {
      type: encryptedValue,
      required: true,
    },

    updatedAt: {
      type: encryptedValue,
      required: true,
    },
  },
  {
    timestamps: false,
    strict: true,
  }
);

module.exports =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);