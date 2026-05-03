'use strict';

/**
 * server/src/scripts/clearDatabase.js
 *
 * Drops all application collections from the MongoDB database.
 *
 * Usage (from server/ directory):
 *   node src/scripts/clearDatabase.js
 *
 * CAUTION: This permanently deletes ALL data.
 * Use only during development/reset — not in production.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const COLLECTIONS_TO_DROP = [
  'users',
  'accounts',
  'profiles',
  'refreshsessions',
  'pendingregistrations',
  'twofactorchallenges',
  'cryptokeys',
  'transactions',
  'beneficiaries',
  'notifications',
  'supporttickets',
];

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌  MONGO_URI is not set in server/.env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`✅  Connected to MongoDB: ${mongoose.connection.host}`);
};

const clearDatabase = async () => {
  const db = mongoose.connection.db;
  const existingCollections = await db.listCollections().toArray();
  const existingNames = existingCollections.map((c) => c.name);

  let dropped = 0;
  let skipped = 0;

  for (const name of COLLECTIONS_TO_DROP) {
    if (existingNames.includes(name)) {
      await db.dropCollection(name);
      console.log(`  🗑️   Dropped: ${name}`);
      dropped += 1;
    } else {
      console.log(`  ⏭️   Skipped (not found): ${name}`);
      skipped += 1;
    }
  }

  console.log(`\n✅  Done. Dropped: ${dropped} collection(s). Skipped: ${skipped}.`);
};

(async () => {
  try {
    await connectDB();
    console.log('\n⚠️   Clearing all application collections...\n');
    await clearDatabase();
  } catch (err) {
    console.error('❌  Error clearing database:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌  Disconnected from MongoDB.');
  }
})();
