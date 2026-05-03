'use strict';

/**
 * server/src/scripts/addMoneyToUser.js
 *
 * Add money to a user's account by their account number directly from the terminal.
 * This script fully respects the project's field-level encryption and records a
 * CREDIT transaction document for the recipient.
 *
 * Usage:
 *   cd server
 *   node src/scripts/addMoneyToUser.js <accountNumber> <amount> [description]
 *
 * Examples:
 *   node src/scripts/addMoneyToUser.js "1234 5678 9012 3456" 5000
 *   node src/scripts/addMoneyToUser.js "1234567890123456" 10000 "Scholarship credit"
 */

require('dotenv').config();

const mongoose = require('mongoose');
const crypto   = require('crypto');

const Account     = require('../models/Account');
const Transaction = require('../models/Transaction');

const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/secure-storage');
const { nowIso, toIdString, buildSecCtx } = require('../utils/serviceHelpers');

// ── Helpers ───────────────────────────────────────────────────────────────────

const normalise = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI is missing from server/.env');
  await mongoose.connect(mongoUri);
  console.log('✅  Connected to MongoDB.');
};

const getAccountOwnerIdFromEnvelope = (enc) => {
  const tryField = (field) => {
    if (!field || typeof field !== 'object') return '';
    if (field.ownerUserId)          return String(field.ownerUserId);
    if (field.metadata?.ownerId)    return String(field.metadata.ownerId);
    if (field.metadata?.userId)     return String(field.metadata.userId);
    return '';
  };

  for (const key of ['userId', 'ownerUserId', 'accountOwnerId']) {
    const found = tryField(enc?.[key]);
    if (found) return found;
  }

  for (const val of Object.values(enc || {})) {
    const found = tryField(val);
    if (found) return found;
  }
  return '';
};

const findAccountByNumber = async (plainAccountNumber) => {
  const all = await Account.find({}).lean();

  for (const enc of all) {
    const ownerId = getAccountOwnerIdFromEnvelope(enc);
    if (!ownerId) continue;

    let dec;
    try {
      const accountId = toIdString(enc._id);
      dec = await decryptSensitiveFields('ACCOUNT', enc, {
        ownerId,
        documentId: accountId,
        collectionName: 'accounts',
      });
      dec._id = accountId;
      dec.id  = accountId;
    } catch { continue; }

    if (normalise(dec.accountNumber) === normalise(plainAccountNumber)) {
      return { accountDoc: dec, ownerId };
    }
  }
  return null;
};

const updateAccountBalance = async (accountId, userId, newBalance) => {
  const enc = await encryptSensitiveFields(
    'ACCOUNT',
    { balance: newBalance, updatedAt: nowIso() },
    { ownerId: userId, documentId: accountId, collectionName: 'accounts' }
  );
  await Account.findByIdAndUpdate(accountId, { $set: enc }, { new: false });
};

const saveTransaction = async (plain, ownerUserId) => {
  const txnId     = new mongoose.Types.ObjectId().toString();
  const timestamp = nowIso();

  const full = {
    _id:             txnId,
    userId:          ownerUserId,
    fromAccount:     plain.fromAccount,
    toAccount:       plain.toAccount,
    amount:          plain.amount,
    description:     plain.description ?? 'Admin top-up (script)',
    reference:       plain.reference,
    receiverName:    null,
    receiverBank:    'SecureBank',
    transactionType: 'CREDIT',
    status:          'completed',
    createdAt:       timestamp,
    updatedAt:       timestamp,
  };

  await Transaction.create(
    await encryptSensitiveFields('TRANSACTION', full, {
      ownerId:        ownerUserId,
      documentId:     txnId,
      collectionName: 'transactions',
    })
  );

  return { txnId, reference: plain.reference };
};

// ── Main ──────────────────────────────────────────────────────────────────────

const main = async () => {
  const rawAccountNumber = process.argv[2];
  const rawAmount        = process.argv[3];
  const description      = process.argv[4] || 'Admin top-up (script)';

  if (!rawAccountNumber) {
    throw new Error(
      'Usage: node src/scripts/addMoneyToUser.js <accountNumber> <amount> [description]\n' +
      'Example: node src/scripts/addMoneyToUser.js "1234 5678 9012 3456" 5000'
    );
  }

  const amount = Number(rawAmount);
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new Error(`Invalid amount: "${rawAmount}". Must be a positive number.`);
  }

  console.log('\n🔍  Connecting to database...');
  await connectDatabase();

  console.log(`\n🔎  Looking up account: ${rawAccountNumber}`);
  const found = await findAccountByNumber(rawAccountNumber);

  if (!found) {
    throw new Error(`Account number not found: "${rawAccountNumber}"`);
  }

  const { accountDoc, ownerId } = found;

  console.log(`\n📋  Account found:`);
  console.log(`    Account Number : ${accountDoc.accountNumber}`);
  console.log(`    Account Type   : ${accountDoc.accountType}`);
  console.log(`    Account Status : ${accountDoc.accountStatus}`);
  console.log(`    Current Balance: BDT ${Number(accountDoc.balance || 0).toLocaleString()}`);
  console.log(`    Owner User ID  : ${ownerId}`);

  if (accountDoc.accountStatus !== 'active') {
    throw new Error(`Account is not active (status: ${accountDoc.accountStatus}). Cannot add money.`);
  }

  const newBalance = Number(accountDoc.balance || 0) + amount;
  const reference  = 'SCRIPT' + crypto.randomBytes(5).toString('hex').toUpperCase();

  console.log(`\n💸  Crediting BDT ${amount.toLocaleString()} to the account...`);
  await updateAccountBalance(accountDoc.id, ownerId, newBalance);

  console.log(`📝  Recording CREDIT transaction...`);
  const { txnId, reference: ref } = await saveTransaction({
    fromAccount: 'ADMIN_SCRIPT',
    toAccount:   accountDoc.accountNumber,
    amount,
    description,
    reference,
  }, ownerId);

  console.log('\n✅  Money added successfully!');
  console.log('─'.repeat(45));
  console.log(`    Reference      : ${ref}`);
  console.log(`    Transaction ID : ${txnId}`);
  console.log(`    Amount Added   : BDT ${amount.toLocaleString()}`);
  console.log(`    New Balance    : BDT ${newBalance.toLocaleString()}`);
  console.log(`    Description    : ${description}`);
  console.log('─'.repeat(45));

  await mongoose.disconnect();
  console.log('\n🔌  Disconnected from MongoDB.');
};

main().catch(async (error) => {
  console.error('\n❌  Failed to add money:');
  console.error(`    ${error.message}`);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
