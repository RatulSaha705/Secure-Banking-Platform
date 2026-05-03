'use strict';

/**
 * server/src/scripts/resetStrictEncryptedAuthData.js
 *
 * WARNING:
 * This script deletes old development data that used old/mixed encryption.
 *
 * Use this after replacing all strict-encryption files.
 *
 * It clears:
 *   - users
 *   - pendingregistrations
 *   - twofactorchallenges
 *   - refreshsessions
 *   - cryptokeys
 *   - future feature collections if present
 *
 * It also:
 *   - clears RSA/ECC private-key maps from server/.env
 *   - removes old plaintext indexes from auth collections
 *   - recreates current CryptoKey indexes
 *
 * Usage:
 *   cd server
 *   node src/scripts/resetStrictEncryptedAuthData.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { CryptoKey } = require('../security/key-management/crypto-key-schema');

const COLLECTIONS_TO_CLEAR = [
  'users',
  'pendingregistrations',
  'twofactorchallenges',
  'refreshsessions',
  'cryptokeys',

  // Future feature collections, cleared only if they already exist.
  'profiles',
  'accounts',
  'beneficiaries',
  'transactions',
  'supporttickets',
  'notifications',
];

const COLLECTIONS_TO_DROP_NON_ID_INDEXES = [
  'users',
  'pendingregistrations',
  'twofactorchallenges',
  'refreshsessions',
];

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  await mongoose.connect(mongoUri);
};

const collectionExists = async (collectionName) => {
  return mongoose.connection.db
    .listCollections({ name: collectionName })
    .hasNext();
};

const clearCollectionIfExists = async (collectionName) => {
  const exists = await collectionExists(collectionName);

  if (!exists) {
    console.log(`Skipping missing collection: ${collectionName}`);
    return;
  }

  const result = await mongoose.connection.db
    .collection(collectionName)
    .deleteMany({});

  console.log(`Cleared ${collectionName}: ${result.deletedCount} document(s) deleted`);
};

const dropNonIdIndexesIfCollectionExists = async (collectionName) => {
  const exists = await collectionExists(collectionName);

  if (!exists) {
    console.log(`Skipping index cleanup for missing collection: ${collectionName}`);
    return;
  }

  const collection = mongoose.connection.db.collection(collectionName);
  const indexes = await collection.indexes();

  for (let i = 0; i < indexes.length; i += 1) {
    const index = indexes[i];

    if (index.name === '_id_') {
      continue;
    }

    await collection.dropIndex(index.name);
    console.log(`Dropped old index: ${collectionName}.${index.name}`);
  }
};

const updateEnvValue = (envFilePath, key, value) => {
  let content = '';

  if (fs.existsSync(envFilePath)) {
    content = fs.readFileSync(envFilePath, 'utf8');
  }

  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n';
    }

    content += `${line}\n`;
  }

  fs.writeFileSync(envFilePath, content, 'utf8');
  process.env[key] = value;
};

const clearPrivateKeyEnvValues = () => {
  const envFilePath = path.resolve(process.cwd(), '.env');

  updateEnvValue(envFilePath, 'SECURITY_RSA_PRIVATE_KEYS_B64', '');
  updateEnvValue(envFilePath, 'SECURITY_ECC_PRIVATE_KEYS_B64', '');

  console.log('Cleared SECURITY_RSA_PRIVATE_KEYS_B64 in server/.env');
  console.log('Cleared SECURITY_ECC_PRIVATE_KEYS_B64 in server/.env');
};

const main = async () => {
  console.log('Connecting to MongoDB...');
  await connectDatabase();

  console.log('\nClearing old documents...\n');

  for (let i = 0; i < COLLECTIONS_TO_CLEAR.length; i += 1) {
    await clearCollectionIfExists(COLLECTIONS_TO_CLEAR[i]);
  }

  console.log('\nDropping old plaintext indexes...\n');

  for (let i = 0; i < COLLECTIONS_TO_DROP_NON_ID_INDEXES.length; i += 1) {
    await dropNonIdIndexesIfCollectionExists(COLLECTIONS_TO_DROP_NON_ID_INDEXES[i]);
  }

  console.log('\nRecreating current CryptoKey indexes...\n');
  await CryptoKey.createIndexes();

  console.log('\nClearing old private-key maps...\n');
  clearPrivateKeyEnvValues();

  await mongoose.disconnect();

  console.log('\nStrict encrypted auth reset completed successfully.');
  console.log('\nNext steps:');
  console.log('1. Restart backend server.');
  console.log('2. Register a fresh user.');
  console.log('3. Verify MongoDB users collection: only _id should be readable.');
  console.log('4. Promote admin again using promoteUserByUsername.js.');
};

main().catch(async (error) => {
  console.error('\nStrict encrypted auth reset failed:');
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect error
  }

  process.exit(1);
});