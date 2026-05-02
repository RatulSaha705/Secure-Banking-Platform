'use strict';

/**
 * server/src/models/Beneficiary.js
 *
 * Feature 11 — Beneficiary Management.
 *
 * Encrypted Beneficiary schema. Same strict rule as all other models:
 *   Only _id is readable in MongoDB. Every other field is an encrypted envelope.
 *
 * One user can hold at most MAX_BENEFICIARIES (5) documents.
 *
 * Fields (match storagePolicy.js BENEFICIARY entry exactly)
 * ──────────────────────────────────────────────────────────
 *   userId                   – Owning user's _id (encrypted)
 *   beneficiaryName          – Display name of the beneficiary (encrypted)
 *   beneficiaryAccountNumber – Account number to send to (encrypted)
 *   beneficiaryBankName      – Bank name (encrypted, nullable)
 *   beneficiaryEmail         – Optional email (encrypted, nullable)
 *   beneficiaryPhone         – Optional phone (encrypted, nullable)
 *   nickname                 – Short alias, e.g. "Mom" (encrypted, nullable)
 *   createdAt                – ISO timestamp (encrypted)
 *   updatedAt                – ISO timestamp (encrypted)
 */

const mongoose = require('mongoose');

const enc = mongoose.Schema.Types.Mixed;

const beneficiarySchema = new mongoose.Schema(
  {
    userId:                   { type: enc, required: true },
    beneficiaryName:          { type: enc, required: true },
    beneficiaryAccountNumber: { type: enc, required: true },
    beneficiaryBankName:      { type: enc, default: null  },
    beneficiaryEmail:         { type: enc, default: null  },
    beneficiaryPhone:         { type: enc, default: null  },
    nickname:                 { type: enc, default: null  },
    createdAt:                { type: enc, required: true },
    updatedAt:                { type: enc, required: true },
  },
  { timestamps: false, strict: true }
);

module.exports =
  mongoose.models.Beneficiary || mongoose.model('Beneficiary', beneficiarySchema);
