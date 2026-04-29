'use strict';

/**
 * server/src/scripts/promoteUserByUsername.js
 *
 * Strict encrypted version.
 *
 * Since usernameLookupHash and role are encrypted, this script:
 *   1. Loads all users.
 *   2. Decrypts each user.
 *   3. Finds the matching usernameLookupHash in memory.
 *   4. Changes role.
 *   5. Re-encrypts the full user document.
 *   6. Revokes that user's active refresh sessions.
 *
 * Usage:
 *   cd server
 *   node src/scripts/promoteUserByUsername.js ayosh admin
 *   node src/scripts/promoteUserByUsername.js ayosh user
 */

require('dotenv').config();

const mongoose = require('mongoose');

const User = require('../models/User');
const RefreshSession = require('../models/RefreshSession');

const { computeUsernameLookupHash } = require('../services/lookupHashService');
const { assertValidRole } = require('../constants/roles');

const {
  encryptSensitiveFields,
  decryptSensitiveFields,
} = require('../security/storage');

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  await mongoose.connect(mongoUri);
};

const nowIso = () => {
  return new Date().toISOString();
};

const decryptUserDocument = async (encryptedUser) => {
  const userId = String(encryptedUser._id);

  const decryptedUser = await decryptSensitiveFields(
    'USER',
    encryptedUser,
    {
      ownerId: userId,
      documentId: userId,
      collectionName: 'users',
    }
  );

  decryptedUser._id = userId;
  decryptedUser.id = userId;

  return decryptedUser;
};

const encryptUserDocument = async (plainUser) => {
  const userId = String(plainUser._id || plainUser.id);

  return encryptSensitiveFields(
    'USER',
    {
      ...plainUser,
      _id: userId,
    },
    {
      ownerId: userId,
      documentId: userId,
      collectionName: 'users',
    }
  );
};

const findUserByUsername = async (username) => {
  const targetUsernameLookupHash = computeUsernameLookupHash(username);
  const encryptedUsers = await User.find({}).lean();

  for (let i = 0; i < encryptedUsers.length; i += 1) {
    const encryptedUser = encryptedUsers[i];
    const decryptedUser = await decryptUserDocument(encryptedUser);

    if (decryptedUser.usernameLookupHash === targetUsernameLookupHash) {
      return {
        encryptedUser,
        decryptedUser,
      };
    }
  }

  return null;
};

const decryptRefreshSession = async (encryptedSession) => {
  const sessionId = String(encryptedSession._id);

  const decryptedSession = await decryptSensitiveFields(
    'REFRESH_SESSION',
    encryptedSession,
    {
      documentId: sessionId,
      collectionName: 'refreshsessions',
    }
  );

  decryptedSession._id = sessionId;
  decryptedSession.id = sessionId;

  return decryptedSession;
};

const encryptRefreshSession = async (plainSession) => {
  const sessionId = String(plainSession._id || plainSession.id);
  const ownerId = String(plainSession.userId);

  return encryptSensitiveFields(
    'REFRESH_SESSION',
    {
      ...plainSession,
      _id: sessionId,
    },
    {
      ownerId,
      documentId: sessionId,
      collectionName: 'refreshsessions',
    }
  );
};

const revokeUserActiveSessions = async (userId) => {
  const encryptedSessions = await RefreshSession.find({}).lean();

  let revokedCount = 0;

  for (let i = 0; i < encryptedSessions.length; i += 1) {
    const encryptedSession = encryptedSessions[i];
    const plainSession = await decryptRefreshSession(encryptedSession);

    if (
      String(plainSession.userId) === String(userId) &&
      plainSession.status === 'ACTIVE'
    ) {
      plainSession.status = 'REVOKED';
      plainSession.revokedAt = nowIso();
      plainSession.revokedReason = 'ROLE_CHANGED';
      plainSession.updatedAt = nowIso();

      const encryptedUpdatedSession = await encryptRefreshSession(plainSession);

      await RefreshSession.replaceOne(
        {
          _id: encryptedSession._id,
        },
        encryptedUpdatedSession
      );

      revokedCount += 1;
    }
  }

  return revokedCount;
};

const main = async () => {
  const username = process.argv[2];
  const requestedRole = process.argv[3] || 'admin';
  const role = assertValidRole(requestedRole);

  if (!username) {
    throw new Error(
      'Please provide username. Example: node src/scripts/promoteUserByUsername.js ayosh admin'
    );
  }

  console.log('Connecting to MongoDB...');
  await connectDatabase();

  const match = await findUserByUsername(username);

  if (!match) {
    throw new Error(`No user found with username: ${username}`);
  }

  const user = match.decryptedUser;
  const oldRole = user.role;

  user.role = role;
  user.updatedAt = nowIso();

  const encryptedUpdatedUser = await encryptUserDocument(user);

  await User.replaceOne(
    {
      _id: match.encryptedUser._id,
    },
    encryptedUpdatedUser
  );

  const revokedCount = await revokeUserActiveSessions(user._id);

  console.log('\nUser found and role updated successfully.');
  console.log(`Username: ${username}`);
  console.log(`User ID: ${user._id}`);
  console.log(`Old role: ${oldRole}`);
  console.log(`New role: ${role}`);
  console.log(`Active sessions revoked: ${revokedCount}`);
  console.log('\nNow log in again with this user account.');

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nUser promotion failed:');
  console.error(error.message);

  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect error
  }

  process.exit(1);
});