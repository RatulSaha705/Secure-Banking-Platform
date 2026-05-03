'use strict';

/**
 * server/src/scripts/testDualEncryption.js
 *
 * Test Feature 20 after you have already run:
 *   node src/scripts/initKeys.js
 * and copied SECURITY_RSA_PRIVATE_KEYS_B64 / SECURITY_ECC_PRIVATE_KEYS_B64
 * into server/.env.
 *
 * Usage:
 *   cd server
 *   node src/scripts/testDualEncryption.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const {
  encryptValue,
  decryptValue,
  getPolicySummary,
} = require('../security/field-encryption');

const connectDatabase = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);
};

const main = async () => {
  console.log('Connecting to MongoDB...');
  await connectDatabase();

  console.log('\nDual asymmetric policy:');
  console.table(getPolicySummary());

  console.log('\nTesting RSA for USER_REGISTRATION...');
  const encryptedEmail = await encryptValue('student@example.com', 'USER_REGISTRATION', {
    collectionName: 'users',
    fieldName: 'email',
    ownerId: 'test-user',
  });

  console.log('Email algorithm:', encryptedEmail.algorithm);
  console.log('Email keyId:', encryptedEmail.keyId);

  const decryptedEmail = await decryptValue(encryptedEmail);
  console.log('Decrypted email:', decryptedEmail);
  console.log('RSA success:', decryptedEmail === 'student@example.com');

  console.log('\nTesting ECC for SUPPORT_TICKET...');
  const encryptedTicket = await encryptValue('I need help with a failed transfer.', 'SUPPORT_TICKET', {
    collectionName: 'supporttickets',
    fieldName: 'message',
    ownerId: 'test-user',
  });

  console.log('Ticket algorithm:', encryptedTicket.algorithm);
  console.log('Ticket keyId:', encryptedTicket.keyId);

  const decryptedTicket = await decryptValue(encryptedTicket);
  console.log('Decrypted ticket:', decryptedTicket);
  console.log('ECC success:', decryptedTicket === 'I need help with a failed transfer.');

  console.log('\nFinal success:', encryptedEmail.algorithm === 'RSA' && encryptedTicket.algorithm === 'ECC');

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nDual encryption test failed:');
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect error
  }

  process.exit(1);
});