'use strict';

/**
 * server/src/scripts/initKeys.js
 *
 * Local setup script for Feature 17 Key Management.
 *
 * Usage:
 *   cd server
 *   node src/scripts/initKeys.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { ensureInitialKeySet } = require('../security/keys/key.service');

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  await mongoose.connect(mongoUri);
};

const main = async () => {
  console.log('Connecting to MongoDB...');
  await connectDatabase();

  console.log('Generating/checking initial key set...');
  const result = await ensureInitialKeySet({
    rsaKeySizeBits: Number(process.env.KEY_SETUP_RSA_BITS || 1024),
    rsaRounds: Number(process.env.KEY_SETUP_RSA_ROUNDS || 40),
  });

  console.log('\nCreated keys:', result.created.length);
  console.log('Existing active keys:', result.existing.length);

  if (result.created.length > 0) {
    console.log('\nCopy these lines into server/.env:\n');

    for (const line of result.envLinesToCopy) {
      console.log(line);
    }

    console.log('\nAfter copying, restart the backend server.');
  } else {
    console.log('\nNo new keys were created. Your initial active key set already exists.');
  }

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nKey initialization failed:');
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect error
  }

  process.exit(1);
});