'use strict';

/**
 * server/src/scripts/resetOldEncryptionData.js
 *
 * WARNING:
 * This script deletes old development data that used the old encryption system.
 *
 * It clears:
 *   - users
 *   - pending registrations
 *   - refresh sessions
 *   - two-factor challenges
 *   - crypto keys
 *   - future banking feature collections if they exist
 *
 * It also clears old RSA/ECC private key maps from server/.env.
 *
 * Usage:
 *   cd server
 *   node src/scripts/resetOldEncryptionData.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { CryptoKey } = require('../security/keys/key.model');

const COLLECTIONS_TO_CLEAR = [
  'users',
  'pendingregistrations',
  'refreshsessions',
  'twofactorchallenges',
  'cryptokeys',

  // Future feature collections, cleared only if they already exist.
  'accounts',
  'beneficiaries',
  'transactions',
  'supporttickets',
  'notifications',
];

const OLD_KEY_INDEX_NAMES = [
  'one_active_key_per_algorithm_purpose',
  'algorithm_purpose_status_idx',
  'algorithm_purpose_version_idx',
];

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  await mongoose.connect(mongoUri);
};

const collectionExists = async (collectionName) => {
  const result = await mongoose.connection.db
    .listCollections({ name: collectionName })
    .hasNext();

  return result;
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

const dropIndexIfExists = async (collectionName, indexName) => {
  const exists = await collectionExists(collectionName);

  if (!exists) {
    return;
  }

  const collection = mongoose.connection.db.collection(collectionName);
  const indexes = await collection.indexes();

  const found = indexes.some((index) => index.name === indexName);

  if (!found) {
    console.log(`Old index not found, skipping: ${collectionName}.${indexName}`);
    return;
  }

  await collection.dropIndex(indexName);
  console.log(`Dropped old index: ${collectionName}.${indexName}`);
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

const clearOldPrivateKeyEnvValues = () => {
  const envFilePath = path.resolve(process.cwd(), '.env');

  updateEnvValue(envFilePath, 'SECURITY_RSA_PRIVATE_KEYS_B64', '');
  updateEnvValue(envFilePath, 'SECURITY_ECC_PRIVATE_KEYS_B64', '');

  console.log('Cleared SECURITY_RSA_PRIVATE_KEYS_B64 in server/.env');
  console.log('Cleared SECURITY_ECC_PRIVATE_KEYS_B64 in server/.env');
};

const main = async () => {
  console.log('Connecting to MongoDB...');
  await connectDatabase();

  console.log('\nClearing old data...\n');

  for (const collectionName of COLLECTIONS_TO_CLEAR) {
    await clearCollectionIfExists(collectionName);
  }

  console.log('\nDropping old CryptoKey indexes...\n');

  for (const indexName of OLD_KEY_INDEX_NAMES) {
    await dropIndexIfExists('cryptokeys', indexName);
  }

  console.log('\nCreating current CryptoKey indexes...\n');
  await CryptoKey.createIndexes();

  console.log('\nClearing old private key environment values...\n');
  clearOldPrivateKeyEnvValues();

  await mongoose.disconnect();

  console.log('\nOld encryption data reset completed successfully.');
  console.log('\nNext steps:');
  console.log('1. Restart backend server.');
  console.log('2. Register a new user.');
  console.log('3. Check cryptokeys collection.');
  console.log('4. Confirm every key has ownerType USER and ownerUserId.');
};

main().catch(async (error) => {
  console.error('\nReset failed:');
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect error
  }

  process.exit(1);
});