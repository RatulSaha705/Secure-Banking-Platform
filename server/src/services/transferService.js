'use strict';

/**
 * server/src/services/transferService.js
 *
 * Feature 10 — Money Transfer.
 *
 * What it does
 * ────────────
 *  initiateTransfer        – Validate, debit sender, credit receiver, record both
 *                            Transaction documents (DEBIT + CREDIT), return receipt.
 *
 *  getMyTransactionHistory – Paginated list of the caller's own transactions.
 *
 *  getTransactionById      – Single decrypted transaction (ownership-checked).
 *
 * Transfer types
 * ─────────────
 *  SAME_BANK   – Receiver is another account on this platform (found by account number).
 *  OTHER_BANK  – External transfer; receiver account is recorded but not looked up.
 *  OWN         – Transfer to the user's own second account (same owner).
 *
 * Security guarantees
 * ───────────────────
 *  • All Transaction fields are encrypted (RSA + ECC) before MongoDB write.
 *  • HMAC-SHA256 MAC is auto-attached by the storage layer.
 *  • Balance update uses updateAccountBalance which re-encrypts the balance field.
 *  • A compensating re-credit is applied to the sender if the receiver credit fails.
 *  • Users can only read transactions whose userId matches their own _id.
 *
 * RBAC
 * ────
 *  • All functions are called only after requireAuth validates the Bearer token.
 *  • Ownership is double-checked inside the service (decrypted userId === caller).
 */

const mongoose = require('mongoose');
const crypto   = require('crypto');

const Transaction = require('../models/Transaction');
const Account     = require('../models/Account');

const {
  encryptSensitiveFields,
  decryptSensitiveFields,
} = require('../security/storage');

const {
  getMyAccount,
  updateAccountBalance,
} = require('./accountService');

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
 * Generate a unique transfer reference, e.g. "TXN4F9A2B1C3E7".
 */
const generateReference = () =>
  'TXN' + crypto.randomBytes(6).toString('hex').toUpperCase();

/**
 * Build the encryption context for a Transaction document.
 * ownerId = userId of the account that owns this record.
 */
const buildTxnContext = (userId, txnId) => ({
  ownerId:        String(userId),
  documentId:     String(txnId),
  collectionName: 'transactions',
});

// ── Decrypt a single raw Transaction document ─────────────────────────────────

const decryptTransactionDocument = async (encTxn, userId) => {
  if (!encTxn) return null;

  const txnId = toIdString(encTxn._id);

  const decrypted = await decryptSensitiveFields(
    'TRANSACTION',
    encTxn,
    buildTxnContext(userId, txnId)
  );

  decrypted._id = txnId;
  decrypted.id  = txnId;

  return decrypted;
};

// ── Safe public shape ─────────────────────────────────────────────────────────

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

// ── Find account by plain account number (scan-and-decrypt) ──────────────────

/**
 * Scans ALL Account documents and decrypts each until one whose
 * accountNumber matches the provided plain-text value is found.
 *
 * Returns { accountDoc, userId } or null if not found.
 *
 * This is the standard scan-decrypt pattern used across this codebase
 * (same as profileService and accountService). A lookup-hash index would
 * replace this in production.
 */
const findAccountByNumber = async (plainAccountNumber) => {
  const allAccounts = await Account.find({}).lean();

  for (let i = 0; i < allAccounts.length; i += 1) {
    const encAcc = allAccounts[i];

    // We need to try every possible userId — but we don't know it upfront.
    // Instead we use a two-phase approach:
    //   1. Attempt to decrypt using the encAcc._id as a documentId hint.
    //   2. Rely on the encryption layer to fail fast if userId is wrong.
    //
    // Because the storage layer uses ownerUserId embedded in the envelope
    // metadata, we can extract it and then decrypt properly.

    // Try to read the raw ownerUserId from the first encrypted field's envelope.
    let ownerId = '';
    const firstEncField = encAcc.userId;
    if (
      firstEncField &&
      typeof firstEncField === 'object' &&
      firstEncField.ownerUserId
    ) {
      ownerId = String(firstEncField.ownerUserId);
    } else if (
      firstEncField &&
      typeof firstEncField === 'object' &&
      firstEncField.metadata?.ownerId
    ) {
      ownerId = String(firstEncField.metadata.ownerId);
    }

    if (!ownerId) continue;

    let decAcc;
    try {
      const accountId = toIdString(encAcc._id);
      decAcc = await decryptSensitiveFields(
        'ACCOUNT',
        encAcc,
        {
          ownerId,
          documentId:     accountId,
          collectionName: 'accounts',
        }
      );
      decAcc._id = accountId;
      decAcc.id  = accountId;
    } catch (_err) {
      continue;
    }

    // Normalize spaces for comparison.
    const normalise = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

    if (normalise(decAcc.accountNumber) === normalise(plainAccountNumber)) {
      return { accountDoc: decAcc, userId: ownerId };
    }
  }

  return null;
};

// ── Save a Transaction record ─────────────────────────────────────────────────

const saveTransaction = async (plain, ownerUserId) => {
  const txnId    = new mongoose.Types.ObjectId().toString();
  const timestamp = nowIso();

  const fullPlain = {
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

  const encrypted = await encryptSensitiveFields(
    'TRANSACTION',
    fullPlain,
    buildTxnContext(ownerUserId, txnId)
  );

  const saved = await Transaction.create(encrypted);

  return decryptTransactionDocument(saved.toObject(), ownerUserId);
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * initiateTransfer
 *
 * Validates input, debits sender, credits receiver, creates two Transaction
 * records, and returns a receipt.
 *
 * @param {string} senderId  – Authenticated user's _id.
 * @param {object} payload   – { toAccountNumber, amount, description, receiverName, receiverBank, transferType }
 */
const initiateTransfer = async (senderId, payload) => {
  const cleanSenderId = String(senderId || '').trim();

  if (!cleanSenderId || !mongoose.Types.ObjectId.isValid(cleanSenderId)) {
    const err = new Error('Invalid sender id');
    err.statusCode = 400;
    throw err;
  }

  const {
    toAccountNumber,
    amount,
    description,
    receiverName,
    receiverBank,
    transferType = 'SAME_BANK',
  } = payload || {};

  // ── Input validation ────────────────────────────────────────────────────

  const parsedAmount = Number(amount);

  if (!toAccountNumber || String(toAccountNumber).trim() === '') {
    const err = new Error('Recipient account number is required');
    err.statusCode = 400;
    throw err;
  }

  if (!parsedAmount || parsedAmount <= 0 || !Number.isFinite(parsedAmount)) {
    const err = new Error('Transfer amount must be a positive number');
    err.statusCode = 400;
    throw err;
  }

  if (parsedAmount > 1_000_000) {
    const err = new Error('Single transfer limit is BDT 10,00,000');
    err.statusCode = 400;
    throw err;
  }

  // ── Load sender account ─────────────────────────────────────────────────

  const senderAccount = await getMyAccount(cleanSenderId);

  if (senderAccount.accountStatus !== 'active') {
    const err = new Error('Your account is not active');
    err.statusCode = 403;
    throw err;
  }

  // Prevent self-transfer to own account number.
  const normalise = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
  if (normalise(senderAccount.accountNumber) === normalise(toAccountNumber)) {
    const err = new Error('Cannot transfer to your own account number');
    err.statusCode = 400;
    throw err;
  }

  if (senderAccount.balance < parsedAmount) {
    const err = new Error(
      `Insufficient balance. Available: BDT ${senderAccount.balance.toLocaleString()}`
    );
    err.statusCode = 422;
    throw err;
  }

  // ── Find receiver account (SAME_BANK / OWN) ─────────────────────────────

  let receiverAccount = null;
  let receiverUserId  = null;

  if (transferType !== 'OTHER_BANK') {
    const found = await findAccountByNumber(toAccountNumber);

    if (!found) {
      const err = new Error('Recipient account number not found in this bank');
      err.statusCode = 404;
      throw err;
    }

    receiverAccount = found.accountDoc;
    receiverUserId  = found.userId;

    if (receiverAccount.accountStatus !== 'active') {
      const err = new Error('Recipient account is not active');
      err.statusCode = 422;
      throw err;
    }
  }

  // ── Generate reference ──────────────────────────────────────────────────

  const reference = generateReference();

  // ── Debit sender ────────────────────────────────────────────────────────

  const newSenderBalance = senderAccount.balance - parsedAmount;
  await updateAccountBalance(senderAccount.id, cleanSenderId, newSenderBalance);

  // ── Credit receiver (with compensation on failure) ──────────────────────

  if (receiverAccount && receiverUserId) {
    try {
      const newReceiverBalance = receiverAccount.balance + parsedAmount;
      await updateAccountBalance(receiverAccount.id, receiverUserId, newReceiverBalance);
    } catch (creditErr) {
      // Compensate — restore sender's balance.
      await updateAccountBalance(senderAccount.id, cleanSenderId, senderAccount.balance);
      creditErr.message = `Transfer failed: could not credit receiver. ${creditErr.message}`;
      creditErr.statusCode = 500;
      throw creditErr;
    }
  }

  // ── Record DEBIT transaction for sender ─────────────────────────────────

  const debitRecord = await saveTransaction(
    {
      fromAccount:     senderAccount.accountNumber,
      toAccount:       toAccountNumber,
      amount:          parsedAmount,
      description:     description ?? null,
      reference,
      receiverName:    receiverName ?? null,
      receiverBank:    transferType === 'OTHER_BANK' ? (receiverBank ?? 'External Bank') : 'SecureBank',
      transactionType: 'DEBIT',
    },
    cleanSenderId
  );

  // ── Record CREDIT transaction for receiver (same-bank only) ─────────────

  if (receiverAccount && receiverUserId) {
    await saveTransaction(
      {
        fromAccount:     senderAccount.accountNumber,
        toAccount:       receiverAccount.accountNumber,
        amount:          parsedAmount,
        description:     description ?? null,
        reference,
        receiverName:    receiverName ?? null,
        receiverBank:    'SecureBank',
        transactionType: 'CREDIT',
      },
      receiverUserId
    );
  }

  // ── Return receipt ──────────────────────────────────────────────────────

  return {
    success:         true,
    reference,
    amount:          parsedAmount,
    fromAccount:     senderAccount.accountNumber,
    toAccount:       toAccountNumber,
    receiverName:    receiverName ?? null,
    receiverBank:    transferType === 'OTHER_BANK' ? (receiverBank ?? 'External Bank') : 'SecureBank',
    transferType,
    newBalance:      newSenderBalance,
    status:          'completed',
    transactionId:   debitRecord.id,
    completedAt:     nowIso(),
  };
};

/**
 * getMyTransactionHistory
 *
 * Returns a paginated list of the caller's own transactions (newest first).
 *
 * @param {string} userId
 * @param {number} page  (1-indexed)
 * @param {number} limit
 */
const getMyTransactionHistory = async (userId, page = 1, limit = 10) => {
  const cleanUserId = String(userId || '').trim();

  if (!cleanUserId || !mongoose.Types.ObjectId.isValid(cleanUserId)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }

  const allEncTxns = await Transaction.find({}).lean();
  const mine = [];

  for (let i = 0; i < allEncTxns.length; i += 1) {
    const encTxn = allEncTxns[i];

    // Same "read ownerId from envelope" technique as findAccountByNumber.
    let ownerId = '';
    const firstEncField = encTxn.userId;
    if (firstEncField?.ownerUserId) {
      ownerId = String(firstEncField.ownerUserId);
    } else if (firstEncField?.metadata?.ownerId) {
      ownerId = String(firstEncField.metadata.ownerId);
    }

    if (ownerId !== cleanUserId) continue;

    let dec;
    try {
      dec = await decryptTransactionDocument(encTxn, cleanUserId);
    } catch (_err) {
      continue;
    }

    if (String(dec.userId) === cleanUserId) {
      mine.push(buildPublicTransaction(dec));
    }
  }

  // Sort newest first.
  mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const safePage  = Math.max(1, Number(page)  || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const start = (safePage - 1) * safeLimit;
  const slice = mine.slice(start, start + safeLimit);

  return {
    transactions: slice,
    totalCount:   mine.length,
    page:         safePage,
    limit:        safeLimit,
    totalPages:   Math.ceil(mine.length / safeLimit),
  };
};

/**
 * getTransactionById
 *
 * Returns a single decrypted transaction — only if it belongs to the caller.
 *
 * @param {string} userId
 * @param {string} txnId
 */
const getTransactionById = async (userId, txnId) => {
  const cleanUserId = String(userId || '').trim();
  const cleanTxnId  = String(txnId  || '').trim();

  if (!cleanUserId || !mongoose.Types.ObjectId.isValid(cleanUserId)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }

  if (!cleanTxnId || !mongoose.Types.ObjectId.isValid(cleanTxnId)) {
    const err = new Error('Invalid transaction id');
    err.statusCode = 400;
    throw err;
  }

  const encTxn = await Transaction.findById(cleanTxnId).lean();

  if (!encTxn) {
    const err = new Error('Transaction not found');
    err.statusCode = 404;
    throw err;
  }

  let dec;
  try {
    dec = await decryptTransactionDocument(encTxn, cleanUserId);
  } catch (_err) {
    const err = new Error('Transaction not found');
    err.statusCode = 404;
    throw err;
  }

  // Ownership check.
  if (String(dec.userId) !== cleanUserId) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  return buildPublicTransaction(dec);
};

module.exports = {
  initiateTransfer,
  getMyTransactionHistory,
  getTransactionById,
};
