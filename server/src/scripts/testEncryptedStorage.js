'use strict';

/**
 * server/src/scripts/testEncryptedStorage.js
 *
 * Usage:
 *   cd server
 *   node src/scripts/testEncryptedStorage.js
 */

require('dotenv').config();

const mongoose = require('mongoose');

const {
  encryptSensitiveFields,
  decryptSensitiveFields,
  getPolicySummary,
  verifyStorageMac,
} = require('../security/secure-storage');

const connectDatabase = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);
};

const main = async () => {
  console.log('Connecting to MongoDB...');
  await connectDatabase();

  console.log('\nEncrypted storage policies:');
  console.table(getPolicySummary());

  console.log('\nTesting USER encryption. Expected algorithm: RSA');

  const userInput = {
    _id: 'test-user-001',
    username: 'testuser',
    email: 'test@example.com',
    contact: '01700000000',
    role: 'USER',
  };

  const encryptedUser = await encryptSensitiveFields('USER', userInput, {
    ownerId: userInput._id,
    documentId: userInput._id,
  });

  console.log('Encrypted email algorithm:', encryptedUser.email.algorithm);
  console.log('Encrypted email keyId:', encryptedUser.email.keyId);
  console.log('Encrypted email has MAC:', Boolean(encryptedUser.email.mac));

  const userMacValid = verifyStorageMac(encryptedUser.email, {
    modelName: 'USER',
    collectionName: 'users',
    fieldName: 'email',
    ownerId: userInput._id,
    documentId: userInput._id,
  });

  console.log('User email MAC valid:', userMacValid);

  const decryptedUser = await decryptSensitiveFields('USER', encryptedUser, {
    ownerId: userInput._id,
    documentId: userInput._id,
  });

  console.log('Decrypted email:', decryptedUser.email);
  console.log('USER success:', decryptedUser.email === userInput.email);

  console.log('\nTesting SUPPORT_TICKET encryption. Expected algorithm: ECC');

  const ticketInput = {
    _id: 'ticket-001',
    ownerId: 'test-user-001',
    title: 'Transfer issue',
    message: 'My transfer failed but balance was reduced.',
    status: 'OPEN',
  };

  const encryptedTicket = await encryptSensitiveFields('SUPPORT_TICKET', ticketInput, {
    ownerId: ticketInput.ownerId,
    documentId: ticketInput._id,
  });

  console.log('Encrypted message algorithm:', encryptedTicket.message.algorithm);
  console.log('Encrypted message keyId:', encryptedTicket.message.keyId);
  console.log('Encrypted message has MAC:', Boolean(encryptedTicket.message.mac));

  const decryptedTicket = await decryptSensitiveFields('SUPPORT_TICKET', encryptedTicket, {
    ownerId: ticketInput.ownerId,
    documentId: ticketInput._id,
  });

  console.log('Decrypted message:', decryptedTicket.message);
  console.log('SUPPORT_TICKET success:', decryptedTicket.message === ticketInput.message);

  const tamperedTicket = JSON.parse(JSON.stringify(encryptedTicket));
  tamperedTicket.message.ciphertext = 'tampered-ciphertext';

  try {
    await decryptSensitiveFields('SUPPORT_TICKET', tamperedTicket, {
      ownerId: ticketInput.ownerId,
      documentId: ticketInput._id,
    });

    console.log('Tamper test failed: tampered ciphertext was accepted');
  } catch (error) {
    console.log('Tamper test success:', error.message.includes('MAC verification failed'));
  }

  console.log(
    '\nFinal success:',
    encryptedUser.email.algorithm === 'RSA' &&
      encryptedTicket.message.algorithm === 'ECC' &&
      decryptedUser.email === userInput.email &&
      decryptedTicket.message === ticketInput.message
  );

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nEncrypted storage test failed:');
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect error
  }

  process.exit(1);
});