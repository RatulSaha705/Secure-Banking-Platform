'use strict';

/**
 * server/src/scripts/promoteUserToAdmin.js
 *
 * Promotes or demotes a user by MongoDB _id.
 *
 * Usage:
 *   cd server
 *   node src/scripts/promoteUserToAdmin.js <userId>
 *   node src/scripts/promoteUserToAdmin.js <userId> admin
 *   node src/scripts/promoteUserToAdmin.js <userId> user
 */

require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const RefreshSession = require('../models/RefreshSession');
const { assertValidRole } = require('../constants/roles');

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  await mongoose.connect(mongoUri);
};

const main = async () => {
  const userId = process.argv[2];
  const requestedRole = process.argv[3] || 'admin';
  const role = assertValidRole(requestedRole);

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Please provide a valid userId. Example: node src/scripts/promoteUserToAdmin.js 69f0... admin');
  }

  console.log('Connecting to MongoDB...');
  await connectDatabase();

  const user = await User.findById(userId).select('_id role isActive');

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const oldRole = user.role;
  user.role = role;
  await user.save();

  const revokeResult = await RefreshSession.updateMany(
    {
      userId: user._id,
      status: 'ACTIVE',
    },
    {
      $set: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: 'ROLE_CHANGED',
      },
    }
  );

  console.log('User role updated successfully.');
  console.log(`User ID: ${user._id.toString()}`);
  console.log(`Old role: ${oldRole}`);
  console.log(`New role: ${user.role}`);
  console.log(`Active sessions revoked: ${revokeResult.modifiedCount || 0}`);
  console.log('Ask the user to log in again so the frontend receives a fresh token.');

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nRole update failed:');
  console.error(error.message);

  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect error
  }

  process.exit(1);
});