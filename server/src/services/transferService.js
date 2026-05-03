'use strict';

/**
 * server/src/services/transferService.js
 *
 * Feature 10 — Money Transfer + Feature 12 — Transaction History.
 *
 * initiateTransfer        – Debit sender, credit receiver, record both Transaction
 *                           documents (DEBIT + CREDIT), return receipt.
 * getMyTransactionHistory – Paginated list of the caller's own transactions.
 * getTransactionById      – Single decrypted transaction (ownership-checked).
 *
 * Transfer types:
 *   SAME_BANK   – Receiver is another account on this platform.
 *   OTHER_BANK  – External; receiver account recorded but not looked up.
 *   OWN         – Transfer to the user's own second account.
 *
 * Security: All Transaction fields encrypted (RSA + ECC) before MongoDB write.
 * HMAC-SHA256 MAC auto-attached by storage layer. Compensation re-credit applied
 * to sender if the receiver credit step fails.
 */

const mongoose = require('mongoose');
const crypto   = require('crypto');

const Transaction = require('../models/Transaction');
const Account     = require('../models/Account');

const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/secure-storage');
const { getMyAccount, updateAccountBalance }             = require('./accountService');
const { nowIso, toIdString, buildSecCtx }                = require('../utils/serviceHelpers');

// ── Helpers ───────────────────────────────────────────────────────────────────

const txnCtx = (userId, txnId) => buildSecCtx('transactions', userId, txnId);

const generateReference = () => 'TXN' + crypto.randomBytes(6).toString('hex').toUpperCase();

const normalise = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

const decryptTransactionDocument = async (enc, userId) => {
  if (!enc) return null;
  const txnId = toIdString(enc._id);
  const dec   = await decryptSensitiveFields('TRANSACTION', enc, txnCtx(userId, txnId));
  dec._id = txnId;
  dec.id  = txnId;
  return dec;
};

const buildPublicTransaction = (dec) => ({
  id:              dec.id || dec._id,
  transactionType: dec.transactionType ?? null,
  fromAccount:     dec.fromAccount     ?? null,
  toAccount:       dec.toAccount       ?? null,
  amount:          Number(dec.amount   ?? 0),
  description:     dec.description     ?? null,
  reference:       dec.reference       ?? null,
  receiverName:    dec.receiverName    ?? null,
  receiverBank:    dec.receiverBank    ?? null,
  status:          dec.status          ?? null,
  createdAt:       dec.createdAt       ?? null,
  updatedAt:       dec.updatedAt       ?? null,
});

// ── Account-number lookup (scan-decrypt; uses envelope metadata fast-path) ────

const findAccountByNumber = async (plainAccountNumber) => {
  const all = await Account.find({}).lean();
  for (const enc of all) {
    // Extract ownerUserId from the encrypted userId field's envelope metadata
    // so we can build the correct decryption context without a prior scan.
    const ff = enc.userId;
    let ownerId = '';
    if (ff?.ownerUserId)          ownerId = String(ff.ownerUserId);
    else if (ff?.metadata?.ownerId) ownerId = String(ff.metadata.ownerId);
    if (!ownerId) continue;

    let dec;
    try {
      const accountId = toIdString(enc._id);
      dec = await decryptSensitiveFields('ACCOUNT', enc, {
        ownerId, documentId: accountId, collectionName: 'accounts',
      });
      dec._id = accountId;
      dec.id  = accountId;
    } catch { continue; }

    if (normalise(dec.accountNumber) === normalise(plainAccountNumber)) {
      return { accountDoc: dec, userId: ownerId };
    }
  }
  return null;
};

// ── Save a Transaction record ─────────────────────────────────────────────────

const saveTransaction = async (plain, ownerUserId) => {
  const txnId     = new mongoose.Types.ObjectId().toString();
  const timestamp = nowIso();

  const full = {
    _id:             txnId,
    userId:          ownerUserId,
    fromAccount:     plain.fromAccount,
    toAccount:       plain.toAccount,
    amount:          plain.amount,
    description:     plain.description  ?? null,
    reference:       plain.reference,
    receiverName:    plain.receiverName ?? null,
    receiverBank:    plain.receiverBank ?? null,
    transactionType: plain.transactionType,
    status:          'completed',
    createdAt:       timestamp,
    updatedAt:       timestamp,
  };

  const saved = await Transaction.create(
    await encryptSensitiveFields('TRANSACTION', full, txnCtx(ownerUserId, txnId))
  );
  return decryptTransactionDocument(saved.toObject(), ownerUserId);
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * initiateTransfer  (Feature 10)
 *
 * @param {string} senderId
 * @param {{ toAccountNumber, amount, description?, receiverName?, receiverBank?, transferType? }} payload
 */
const initiateTransfer = async (senderId, payload) => {
  const clean = String(senderId || '').trim();
  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error('Invalid sender id'); err.statusCode = 400; throw err;
  }

  const {
    toAccountNumber,
    amount,
    description,
    receiverName,
    receiverBank,
    transferType = 'SAME_BANK',
  } = payload || {};

  const parsedAmount = Number(amount);

  if (!toAccountNumber || String(toAccountNumber).trim() === '') {
    const err = new Error('Recipient account number is required'); err.statusCode = 400; throw err;
  }
  if (!parsedAmount || parsedAmount <= 0 || !Number.isFinite(parsedAmount)) {
    const err = new Error('Transfer amount must be a positive number'); err.statusCode = 400; throw err;
  }
  if (parsedAmount > 1_000_000) {
    const err = new Error('Single transfer limit is BDT 10,00,000'); err.statusCode = 400; throw err;
  }

  const senderAccount = await getMyAccount(clean);

  if (senderAccount.accountStatus !== 'active') {
    const err = new Error('Your account is not active'); err.statusCode = 403; throw err;
  }
  if (normalise(senderAccount.accountNumber) === normalise(toAccountNumber)) {
    const err = new Error('Cannot transfer to your own account number'); err.statusCode = 400; throw err;
  }
  if (senderAccount.balance < parsedAmount) {
    const err = new Error(`Insufficient balance. Available: BDT ${senderAccount.balance.toLocaleString()}`);
    err.statusCode = 422; throw err;
  }

  let receiverAccount = null;
  let receiverUserId  = null;

  if (transferType !== 'OTHER_BANK') {
    const found = await findAccountByNumber(toAccountNumber);
    if (!found) {
      const err = new Error('Recipient account number not found in this bank'); err.statusCode = 404; throw err;
    }
    receiverAccount = found.accountDoc;
    receiverUserId  = found.userId;

    if (receiverAccount.accountStatus !== 'active') {
      const err = new Error('Recipient account is not active'); err.statusCode = 422; throw err;
    }
  }

  const reference        = generateReference();
  const newSenderBalance = senderAccount.balance - parsedAmount;

  await updateAccountBalance(senderAccount.id, clean, newSenderBalance);

  if (receiverAccount && receiverUserId) {
    try {
      await updateAccountBalance(receiverAccount.id, receiverUserId, receiverAccount.balance + parsedAmount);
    } catch (creditErr) {
      await updateAccountBalance(senderAccount.id, clean, senderAccount.balance); // compensate
      creditErr.message    = `Transfer failed: could not credit receiver. ${creditErr.message}`;
      creditErr.statusCode = 500;
      throw creditErr;
    }
  }

  const effectiveReceiverBank = transferType === 'OTHER_BANK' ? (receiverBank ?? 'External Bank') : 'SecureBank';

  const debitRecord = await saveTransaction({
    fromAccount:     senderAccount.accountNumber,
    toAccount:       toAccountNumber,
    amount:          parsedAmount,
    description:     description ?? null,
    reference,
    receiverName:    receiverName ?? null,
    receiverBank:    effectiveReceiverBank,
    transactionType: 'DEBIT',
  }, clean);

  if (receiverAccount && receiverUserId) {
    await saveTransaction({
      fromAccount:     senderAccount.accountNumber,
      toAccount:       receiverAccount.accountNumber,
      amount:          parsedAmount,
      description:     description ?? null,
      reference,
      receiverName:    receiverName ?? null,
      receiverBank:    'SecureBank',
      transactionType: 'CREDIT',
    }, receiverUserId);
  }

  return {
    success:       true,
    reference,
    amount:        parsedAmount,
    fromAccount:   senderAccount.accountNumber,
    toAccount:     toAccountNumber,
    receiverName:  receiverName ?? null,
    receiverBank:  effectiveReceiverBank,
    transferType,
    newBalance:    newSenderBalance,
    status:        'completed',
    transactionId: debitRecord.id,
    completedAt:   nowIso(),
  };
};

/**
 * getMyTransactionHistory  (Feature 12)
 *
 * @param {string} userId
 * @param {number} page   1-indexed
 * @param {number} limit  capped at 50
 */
const getMyTransactionHistory = async (userId, page = 1, limit = 10) => {
  const clean = String(userId || '').trim();
  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error('Invalid user id'); err.statusCode = 400; throw err;
  }

  const all  = await Transaction.find({}).lean();
  const mine = [];

  for (const enc of all) {
    // Fast-path: skip documents whose envelope owner doesn't match.
    const ff = enc.userId;
    let ownerId = '';
    if (ff?.ownerUserId)          ownerId = String(ff.ownerUserId);
    else if (ff?.metadata?.ownerId) ownerId = String(ff.metadata.ownerId);
    if (ownerId !== clean) continue;

    let dec;
    try { dec = await decryptTransactionDocument(enc, clean); } catch { continue; }
    if (String(dec.userId) === clean) mine.push(buildPublicTransaction(dec));
  }

  mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const safePage  = Math.max(1, Number(page)  || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const start     = (safePage - 1) * safeLimit;

  return {
    transactions: mine.slice(start, start + safeLimit),
    totalCount:   mine.length,
    page:         safePage,
    limit:        safeLimit,
    totalPages:   Math.ceil(mine.length / safeLimit),
  };
};

/**
 * getTransactionById  (Feature 12)
 * Returns a single decrypted transaction — only if it belongs to the caller.
 */
const getTransactionById = async (userId, txnId) => {
  const clean    = String(userId || '').trim();
  const cleanTxn = String(txnId  || '').trim();

  if (!clean    || !mongoose.Types.ObjectId.isValid(clean))    { const err = new Error('Invalid user id');        err.statusCode = 400; throw err; }
  if (!cleanTxn || !mongoose.Types.ObjectId.isValid(cleanTxn)) { const err = new Error('Invalid transaction id'); err.statusCode = 400; throw err; }

  const enc = await Transaction.findById(cleanTxn).lean();
  if (!enc) { const err = new Error('Transaction not found'); err.statusCode = 404; throw err; }

  let dec;
  try { dec = await decryptTransactionDocument(enc, clean); } catch {
    const err = new Error('Transaction not found'); err.statusCode = 404; throw err;
  }

  if (String(dec.userId) !== clean) {
    const err = new Error('Access denied'); err.statusCode = 403; throw err;
  }

  return buildPublicTransaction(dec);
};

module.exports = { initiateTransfer, getMyTransactionHistory, getTransactionById };
