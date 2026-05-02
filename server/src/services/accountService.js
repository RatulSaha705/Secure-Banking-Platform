'use strict';

/**
 * server/src/services/accountService.js
 *
 * Feature 8 — View Account Balance.
 *
 * getMyAccount        – Authenticated user's decrypted account. Auto-provisions
 *                       (Savings, 0 BDT, active) on first access.
 * getAccountBalance   – Balance-only subset of getMyAccount.
 * getAccountByUserId  – Admin-only: any user's account.
 * updateAccountBalance – Internal; re-encrypts and saves a new balance.
 *
 * Security: All fields except _id are encrypted (RSA + ECC dual-asymmetric).
 * HMAC-SHA256 MAC auto-attached by storage layer on every write.
 */

const mongoose = require('mongoose');
const crypto   = require('crypto');

const Account = require('../models/Account');

const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/storage');
const { nowIso, toIdString, buildSecCtx } = require('../utils/serviceHelpers');

// ── Helpers ───────────────────────────────────────────────────────────────────

const accountCtx = (userId, accountId) => buildSecCtx('accounts', userId, accountId);

const generateAccountNumber = () => {
  const digits = crypto.randomBytes(8).toString('hex')
    .split('').map((c) => parseInt(c, 16)).join('').slice(0, 16).padEnd(16, '0');
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
};

const decryptAccountDocument = async (enc, userId) => {
  if (!enc) return null;
  const accountId = toIdString(enc._id);
  const dec = await decryptSensitiveFields('ACCOUNT', enc, accountCtx(userId, accountId));
  dec._id = accountId;
  dec.id  = accountId;
  return dec;
};

const buildPublicAccount = (dec) => ({
  id:            dec.id || dec._id,
  userId:        dec.userId,
  accountNumber: dec.accountNumber ?? null,
  accountType:   dec.accountType   ?? null,
  accountStatus: dec.accountStatus ?? null,
  balance:       Number(dec.balance ?? 0),
  branchName:    dec.branchName    ?? null,
  routingNumber: dec.routingNumber ?? null,
  createdAt:     dec.createdAt     ?? null,
  updatedAt:     dec.updatedAt     ?? null,
});

const assertValidId = (userId) => {
  const clean = String(userId || '').trim();
  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error('Invalid user id'); err.statusCode = 400; throw err;
  }
  return clean;
};

// ── Scan-and-decrypt ──────────────────────────────────────────────────────────

const findAccountForUser = async (userId) => {
  const all = await Account.find({}).lean();
  for (const enc of all) {
    let dec;
    try { dec = await decryptAccountDocument(enc, userId); } catch { continue; }
    if (String(dec.userId) === userId) return dec;
  }
  return null;
};

// ── Auto-provision ────────────────────────────────────────────────────────────

const provisionAccount = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const err = new Error('Invalid user id'); err.statusCode = 400; throw err;
  }
  const accountId = new mongoose.Types.ObjectId().toString();
  const timestamp = nowIso();

  const plain = {
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

  const saved = await Account.create(
    await encryptSensitiveFields('ACCOUNT', plain, accountCtx(userId, accountId))
  );
  return decryptAccountDocument(saved.toObject(), userId);
};

// ── Public API ────────────────────────────────────────────────────────────────

const getMyAccount = async (userId) => {
  const clean = assertValidId(userId);
  const found = await findAccountForUser(clean);
  if (found) return buildPublicAccount(found);
  return buildPublicAccount(await provisionAccount(clean));
};

const getAccountBalance = async (userId) => {
  const account = await getMyAccount(userId);
  return {
    available:        true,
    totalBalance:     account.balance,
    availableBalance: account.balance,
    pendingAmount:    0,
    accountStatus:    account.accountStatus,
    accountNumber:    account.accountNumber,
    accountType:      account.accountType,
    branchName:       account.branchName,
    asOf:             nowIso(),
  };
};

/** Admin-only: retrieve any user's account by userId. */
const getAccountByUserId = async (targetUserId) => {
  const clean = assertValidId(targetUserId);
  const found  = await findAccountForUser(clean);
  if (found) return buildPublicAccount(found);
  return buildPublicAccount(await provisionAccount(clean));
};

/** Internal — re-encrypts and persists a new balance value. */
const updateAccountBalance = async (accountId, userId, newBalance) => {
  const cleanAccountId = String(accountId || '').trim();
  const cleanUserId    = String(userId    || '').trim();
  if (!cleanAccountId || !cleanUserId) {
    const err = new Error('accountId and userId are required for balance update');
    err.statusCode = 400; throw err;
  }
  const enc = await encryptSensitiveFields(
    'ACCOUNT',
    { balance: newBalance, updatedAt: nowIso() },
    accountCtx(cleanUserId, cleanAccountId)
  );
  await Account.findByIdAndUpdate(cleanAccountId, { $set: enc }, { new: false });
};

module.exports = { getMyAccount, getAccountBalance, getAccountByUserId, updateAccountBalance };
