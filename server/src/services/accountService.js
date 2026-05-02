'use strict';

/**
 * server/src/services/accountService.js
 *
 * Feature 8 — View Account Balance.
 *
 * What it does
 * ────────────
 *  getMyAccount      – Return the authenticated user's decrypted account.
 *                      If no Account document exists yet, one is auto-provisioned
 *                      with a generated account number, default balance of 0 BDT,
 *                      and account type 'Savings'.
 *
 *  getAccountBalance – Thin wrapper that returns only the balance fields.
 *
 *  getAccountByUserId – Admin-only: retrieve any user's account details.
 *
 * Security guarantees
 * ───────────────────
 *  • Every field except _id is encrypted before being written to MongoDB
 *    using encryptSensitiveFields (RSA + ECC dual-asymmetric scheme).
 *  • MAC integrity (HMAC-SHA256) is attached to every encrypted envelope
 *    automatically by the storage layer and verified on every read.
 *  • ownerId passed to the encryption context is always the authenticated
 *    user's MongoDB _id.
 *
 * RBAC
 * ────
 *  • Users can only read their own account (enforced at route level with
 *    requireAuth; service double-checks userId ownership).
 *  • Admins can read any account via getAccountByUserId (admin-only route).
 */

const mongoose = require('mongoose');
const crypto   = require('crypto');

const Account = require('../models/Account');

const {
  encryptSensitiveFields,
  decryptSensitiveFields,
} = require('../security/storage');

// ── Helpers ──────────────────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();

const toIdString = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id)  return String(value.id);
    return '';
  }
  return String(value);
};

/**
 * Build the security context that encryptSensitiveFields / decryptSensitiveFields
 * require for the ACCOUNT model.
 */
const buildAccountSecurityContext = (userId, accountId) => ({
  ownerId:        String(userId),
  documentId:     String(accountId),
  collectionName: 'accounts',
});

/**
 * Generate a unique 16-digit account number.
 * Format: 4 groups of 4 digits separated by spaces, e.g. "1234 5678 9012 3456"
 * (stored encrypted — the display format is cosmetic only)
 */
const generateAccountNumber = () => {
  const raw = crypto.randomBytes(8).toString('hex');
  // Convert hex bytes to digit groups
  const digits = raw
    .split('')
    .map((c) => parseInt(c, 16))
    .join('')
    .slice(0, 16)
    .padEnd(16, '0');

  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
};

// ── Decrypt a raw Account document from MongoDB ───────────────────────────────

const decryptAccountDocument = async (encryptedAccount, userId) => {
  if (!encryptedAccount) return null;

  const accountId = toIdString(encryptedAccount._id);

  const decrypted = await decryptSensitiveFields(
    'ACCOUNT',
    encryptedAccount,
    buildAccountSecurityContext(userId, accountId)
  );

  decrypted._id = accountId;
  decrypted.id  = accountId;

  return decrypted;
};

// ── Build the safe public account shape returned to callers ───────────────────

const buildPublicAccount = (decryptedAccount) => ({
  id:            decryptedAccount.id || decryptedAccount._id,
  userId:        decryptedAccount.userId,
  accountNumber: decryptedAccount.accountNumber ?? null,
  accountType:   decryptedAccount.accountType   ?? null,
  accountStatus: decryptedAccount.accountStatus ?? null,
  balance:       Number(decryptedAccount.balance ?? 0),
  branchName:    decryptedAccount.branchName     ?? null,
  routingNumber: decryptedAccount.routingNumber  ?? null,
  createdAt:     decryptedAccount.createdAt      ?? null,
  updatedAt:     decryptedAccount.updatedAt      ?? null,
});

// ── Auto-provision an Account for a user on first access ─────────────────────

const provisionAccount = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }

  const accountId = new mongoose.Types.ObjectId().toString();
  const timestamp = nowIso();

  const accountPlain = {
    _id:           accountId,
    userId,
    accountNumber: generateAccountNumber(),
    accountType:   'Savings',
    accountStatus: 'active',
    balance:       0,
    branchName:    'Head Office',
    routingNumber: null,
    createdAt:     timestamp,
    updatedAt:     timestamp,
  };

  const encryptedAccount = await encryptSensitiveFields(
    'ACCOUNT',
    accountPlain,
    buildAccountSecurityContext(userId, accountId)
  );

  const saved = await Account.create(encryptedAccount);

  return decryptAccountDocument(saved.toObject(), userId);
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getMyAccount
 *
 * Returns the authenticated user's decrypted account, auto-provisioning one
 * if it does not yet exist.
 *
 * @param {string} userId – Authenticated user's _id (from req.user.id).
 * @returns {object} Decrypted public account shape.
 */
const getMyAccount = async (userId) => {
  const cleanUserId = String(userId || '').trim();

  if (!cleanUserId || !mongoose.Types.ObjectId.isValid(cleanUserId)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }

  // We cannot query by userId directly because userId is encrypted.
  // Strategy: scan all accounts and decrypt each until we find a match.
  // (Acceptable for this lab project; production would use a lookup-hash index.)
  const allEncryptedAccounts = await Account.find({}).lean();

  for (let i = 0; i < allEncryptedAccounts.length; i += 1) {
    const encAcc = allEncryptedAccounts[i];

    let decAcc;
    try {
      decAcc = await decryptAccountDocument(encAcc, cleanUserId);
    } catch (_err) {
      // Decrypt failed with this userId — not this user's account; skip.
      continue;
    }

    if (String(decAcc.userId) === cleanUserId) {
      return buildPublicAccount(decAcc);
    }
  }

  // No account found — auto-provision.
  const newAccount = await provisionAccount(cleanUserId);
  return buildPublicAccount(newAccount);
};

/**
 * getAccountBalance
 *
 * Returns only the balance-related fields for the authenticated user.
 *
 * @param {string} userId – Authenticated user's _id (from req.user.id).
 * @returns {object} { totalBalance, availableBalance, pendingAmount, accountStatus, accountNumber, accountType, branchName }
 */
const getAccountBalance = async (userId) => {
  const account = await getMyAccount(userId);

  return {
    available:        true,
    totalBalance:     account.balance,
    availableBalance: account.balance,   // No pending logic yet — mirrors total
    pendingAmount:    0,
    accountStatus:    account.accountStatus,
    accountNumber:    account.accountNumber,
    accountType:      account.accountType,
    branchName:       account.branchName,
    asOf:             nowIso(),
  };
};

/**
 * getAccountByUserId  (Admin-only)
 *
 * Retrieves and decrypts any user's account.
 * This function is only reachable via an admin-guarded route.
 *
 * @param {string} targetUserId – The user whose account is requested.
 * @param {string} requesterId  – The admin's user id (for audit purposes).
 * @returns {object} Decrypted public account shape.
 */
const getAccountByUserId = async (targetUserId, requesterId) => {
  const cleanTargetId = String(targetUserId || '').trim();

  if (!cleanTargetId || !mongoose.Types.ObjectId.isValid(cleanTargetId)) {
    const err = new Error('Invalid target user id');
    err.statusCode = 400;
    throw err;
  }

  const allEncryptedAccounts = await Account.find({}).lean();

  for (let i = 0; i < allEncryptedAccounts.length; i += 1) {
    const encAcc = allEncryptedAccounts[i];

    let decAcc;
    try {
      decAcc = await decryptAccountDocument(encAcc, cleanTargetId);
    } catch (_err) {
      continue;
    }

    if (String(decAcc.userId) === cleanTargetId) {
      return buildPublicAccount(decAcc);
    }
  }

  // Auto-provision if not found (admin view should still show something useful).
  const newAccount = await provisionAccount(cleanTargetId);
  return buildPublicAccount(newAccount);
};

/**
 * updateAccountBalance  (internal — used by transferService)
 *
 * Re-encrypts and saves a new balance for the given account.
 *
 * @param {string} accountId – MongoDB _id of the account document.
 * @param {string} userId    – Owner's user _id (required for encryption context).
 * @param {number} newBalance – The new plaintext balance value.
 */
const updateAccountBalance = async (accountId, userId, newBalance) => {
  const cleanAccountId = String(accountId || '').trim();
  const cleanUserId    = String(userId    || '').trim();

  if (!cleanAccountId || !cleanUserId) {
    const err = new Error('accountId and userId are required for balance update');
    err.statusCode = 400;
    throw err;
  }

  const timestamp = nowIso();

  // We only re-encrypt the fields we are changing.
  const partialPlain = {
    balance:   newBalance,
    updatedAt: timestamp,
  };

  const encryptedPartial = await encryptSensitiveFields(
    'ACCOUNT',
    partialPlain,
    buildAccountSecurityContext(cleanUserId, cleanAccountId)
  );

  await Account.findByIdAndUpdate(
    cleanAccountId,
    { $set: encryptedPartial },
    { new: false }
  );
};

module.exports = {
  getMyAccount,
  getAccountBalance,
  getAccountByUserId,
  updateAccountBalance,
};
