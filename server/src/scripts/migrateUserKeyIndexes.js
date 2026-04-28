'use strict';

/**
 * server/src/scripts/migrateUserKeyIndexes.js
 *
 * Run once after changing CryptoKey from shared purpose keys
 * to per-user keys.
 *
 * Usage:
 *   cd server
 *   node src/scripts/migrateUserKeyIndexes.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { CryptoKey } = require('../security/keys/key.model');

const OLD_INDEX_NAMES = Object.freeze([
  'one_active_key_per_algorithm_purpose',
  'algorithm_purpose_status_idx',
  'algorithm_purpose_version_idx',
]);

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  await mongoose.connect(mongoUri);
};

const dropIndexIfExists = async (collection, indexName) => {
  const indexes = await collection.indexes();
  const exists = indexes.some((index) => index.name === indexName);

  if (!exists) {
    console.log(`Index not found, skipping: ${indexName}`);
    return;
  }

  await collection.dropIndex(indexName);
  console.log(`Dropped old index: ${indexName}`);
};

const main = async () => {
  console.log('Connecting to MongoDB...');
  await connectDatabase();

  const collection = CryptoKey.collection;

  for (const indexName of OLD_INDEX_NAMES) {
    await dropIndexIfExists(collection, indexName);
  }

  console.log('Creating updated CryptoKey indexes...');
  await CryptoKey.createIndexes();

  console.log('CryptoKey index migration completed successfully.');
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nCryptoKey index migration failed:');
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect error
  }

  process.exit(1);
});