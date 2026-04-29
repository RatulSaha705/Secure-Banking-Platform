'use strict';

/**
 * server/src/scripts/promoteUserToAdmin.js
 *
 * Strict encrypted version.
 *
 * Finds a user by MongoDB _id, decrypts role, updates role,
 * re-encrypts the user document, and revokes active sessions.
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
  const userId = process.argv[2];
  const requestedRole = process.argv[3] || 'admin';
  const role = assertValidRole(requestedRole);

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error(
      'Please provide a valid userId. Example: node src/scripts/promoteUserToAdmin.js 69f0... admin'
    );
  }

  console.log('Connecting to MongoDB...');
  await connectDatabase();

  const encryptedUser = await User.findById(userId).lean();

  if (!encryptedUser) {
    throw new Error(`User not found: ${userId}`);
  }

  const user = await decryptUserDocument(encryptedUser);
  const oldRole = user.role;

  user.role = role;
  user.updatedAt = nowIso();

  const encryptedUpdatedUser = await encryptUserDocument(user);

  await User.replaceOne(
    {
      _id: encryptedUser._id,
    },
    encryptedUpdatedUser
  );

  const revokedCount = await revokeUserActiveSessions(user._id);

  console.log('\nUser role updated successfully.');
  console.log(`User ID: ${user._id}`);
  console.log(`Old role: ${oldRole}`);
  console.log(`New role: ${role}`);
  console.log(`Active sessions revoked: ${revokedCount}`);
  console.log('\nNow log in again with this user account.');

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