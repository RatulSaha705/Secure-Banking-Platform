'use strict';

/**
 * server/src/services/authService.js
 *
 * Strict encrypted authentication service.
 *
 * New database rule:
 *   Only _id is readable in MongoDB.
 *   Every other stored value is encrypted.
 *
 * Important changes:
 *   - emailLookupHash and usernameLookupHash are also encrypted.
 *   - passwordHash, passwordSalt, passwordIterations are also encrypted.
 *   - role, isActive, twoFactorEnabled are also encrypted.
 *   - createdAt and updatedAt are also encrypted.
 *
 * Because lookup hashes are encrypted, login cannot directly do:
 *   User.findOne({ usernameLookupHash })
 *
 * Instead:
 *   1. Load users.
 *   2. Decrypt each user using that user's own key.
 *   3. Compare decrypted lookup hash in backend memory.
 *
 * This is acceptable for this CSE447 lab requirement because the priority is
 * full encrypted storage, not database search performance.
 */

const mongoose = require('mongoose');

const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');

const { hashPassword, comparePassword } = require('../security/password');

const {
  computeEmailLookupHash,
  computeUsernameLookupHash,
  normalize,
} = require('./lookupHashService');

const { createLoginSession } = require('./tokenService');
const { ensureUserKeySet } = require('../security/keys/key.service');

const {
  encryptSensitiveFields,
  decryptSensitiveFields,
} = require('../security/storage');

const {
  generatePendingRegistrationId,
  createRegistrationOtpChallenge,
  createLoginTwoFactorChallenge,
  verifyRegistrationOtp,
  verifyLoginOtp,
} = require('./twoFactorService');

const { ROLES } = require('../constants/roles');

const cleanOptional = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const cleanRequired = (value, fieldName) => {
  const cleaned = String(value || '').trim();

  if (!cleaned) {
    const error = new Error(`${fieldName} is required`);
    error.statusCode = 400;
    throw error;
  }

  return cleaned;
};

const nowIso = () => {
  return new Date().toISOString();
};

const toIdString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'object') {
    if (value._id) {
      return String(value._id);
    }

    if (value.id) {
      return String(value.id);
    }
  }

  return String(value);
};

const buildUserSecurityContext = (userId) => {
  const cleanUserId = toIdString(userId);

  if (!cleanUserId) {
    throw new Error('userId is required for user encryption/decryption');
  }

  return {
    ownerId: cleanUserId,
    documentId: cleanUserId,
    collectionName: 'users',
  };
};

const buildPendingRegistrationSecurityContext = ({ ownerId, pendingRegistrationId }) => {
  const cleanOwnerId = toIdString(ownerId);
  const cleanPendingRegistrationId = String(pendingRegistrationId || '').trim();

  if (!cleanOwnerId) {
    throw new Error('ownerId is required for pending registration encryption/decryption');
  }

  if (!cleanPendingRegistrationId) {
    throw new Error('pendingRegistrationId is required for pending registration encryption/decryption');
  }

  return {
    ownerId: cleanOwnerId,
    documentId: cleanPendingRegistrationId,
    collectionName: 'pendingregistrations',
  };
};

const decryptUserDocument = async (userDocument) => {
  if (!userDocument) {
    return null;
  }

  const userId = toIdString(userDocument._id);

  const decryptedUser = await decryptSensitiveFields(
    'USER',
    userDocument,
    buildUserSecurityContext(userId)
  );

  decryptedUser._id = userId;
  decryptedUser.id = userId;

  return decryptedUser;
};

const decryptPendingRegistrationDocument = async (pendingDocument) => {
  if (!pendingDocument) {
    return null;
  }

  const pendingRegistrationId = String(pendingDocument._id);

  const partiallyDecrypted = await decryptSensitiveFields(
    'PENDING_REGISTRATION',
    pendingDocument,
    {
      documentId: pendingRegistrationId,
      collectionName: 'pendingregistrations',
    }
  );

  partiallyDecrypted._id = pendingRegistrationId;
  partiallyDecrypted.pendingRegistrationId = pendingRegistrationId;

  return partiallyDecrypted;
};

const getAllDecryptedUsers = async () => {
  const encryptedUsers = await User.find({}).lean();
  const decryptedUsers = [];

  for (let i = 0; i < encryptedUsers.length; i += 1) {
    const encryptedUser = encryptedUsers[i];
    const decryptedUser = await decryptUserDocument(encryptedUser);
    decryptedUsers.push(decryptedUser);
  }

  return decryptedUsers;
};

const findUserByLookupHashes = async ({ emailLookupHash, usernameLookupHash }) => {
  const encryptedUsers = await User.find({}).lean();

  for (let i = 0; i < encryptedUsers.length; i += 1) {
    const encryptedUser = encryptedUsers[i];
    const decryptedUser = await decryptUserDocument(encryptedUser);

    const emailMatches = decryptedUser.emailLookupHash === emailLookupHash;
    const usernameMatches = decryptedUser.usernameLookupHash === usernameLookupHash;

    if (emailMatches || usernameMatches) {
      return {
        encryptedUser,
        decryptedUser,
      };
    }
  }

  return null;
};

const ensureUserDoesNotExist = async ({ emailLookupHash, usernameLookupHash }) => {
  const match = await findUserByLookupHashes({
    emailLookupHash,
    usernameLookupHash,
  });

  if (!match) {
    return;
  }

  const error = new Error(
    match.decryptedUser.emailLookupHash === emailLookupHash
      ? 'An account with this email already exists'
      : 'This username is already taken'
  );

  error.statusCode = 409;
  throw error;
};

const deleteMatchingPendingRegistrations = async ({ emailLookupHash, usernameLookupHash }) => {
  const pendingDocuments = await PendingRegistration.find({}).lean();
  const idsToDelete = [];

  for (let i = 0; i < pendingDocuments.length; i += 1) {
    const pendingDocument = pendingDocuments[i];
    const decryptedPending = await decryptPendingRegistrationDocument(pendingDocument);

    const isPending = decryptedPending.status === 'PENDING';
    const emailMatches = decryptedPending.emailLookupHash === emailLookupHash;
    const usernameMatches = decryptedPending.usernameLookupHash === usernameLookupHash;

    if (isPending && (emailMatches || usernameMatches)) {
      idsToDelete.push(String(pendingDocument._id));
    }
  }

  if (idsToDelete.length > 0) {
    await PendingRegistration.deleteMany({
      _id: {
        $in: idsToDelete,
      },
    });
  }

  return idsToDelete.length;
};

const startRegistration = async ({
  username,
  email,
  contact,
  phone,
  password,
  fullName,
}) => {
  const cleanUsername = cleanRequired(username, 'Username');
  const cleanEmail = normalize(cleanRequired(email, 'Email'));
  const cleanContact = cleanOptional(contact);
  const cleanPhone = cleanOptional(phone);
  const cleanFullName = cleanOptional(fullName);

  const emailLookupHash = computeEmailLookupHash(cleanEmail);
  const usernameLookupHash = computeUsernameLookupHash(cleanUsername);

  await ensureUserDoesNotExist({
    emailLookupHash,
    usernameLookupHash,
  });

  await deleteMatchingPendingRegistrations({
    emailLookupHash,
    usernameLookupHash,
  });

  const userId = new mongoose.Types.ObjectId();
  const userIdString = userId.toString();

  await ensureUserKeySet({
    ownerUserId: userIdString,
    persistToEnvFile: true,
    rsaKeySizeBits: Number(process.env.KEY_SETUP_RSA_BITS || 1024),
    rsaRounds: Number(process.env.KEY_SETUP_RSA_ROUNDS || 40),
  });

  const passwordFields = await hashPassword(password);

  const pendingRegistrationId = generatePendingRegistrationId();

  const challenge = await createRegistrationOtpChallenge({
    pendingRegistrationId,
    subjectId: userIdString,
    toEmail: cleanEmail,
  });

  const timestamp = nowIso();

  const pendingRegistrationPlain = {
    _id: pendingRegistrationId,

    challengeId: challenge.challengeId,
    userId: userIdString,

    emailLookupHash,
    usernameLookupHash,
    maskedEmail: challenge.maskedEmail,

    /**
     * Name kept as encryptedUserFields for compatibility with your existing flow.
     * But here the value is plain before storage.
     * The whole value is encrypted as one field inside PendingRegistration.
     */
    encryptedUserFields: {
      username: cleanUsername,
      email: cleanEmail,
      contact: cleanContact,
      phone: cleanPhone,
      fullName: cleanFullName,
    },

    /**
     * Password fields are plain here before storage.
     * The whole passwordFields object is encrypted inside PendingRegistration.
     */
    passwordFields,

    otpHash: challenge.otpHash,
    status: 'PENDING',
    attempts: 0,
    maxAttempts: challenge.maxAttempts,
    expiresAt: challenge.expiresAt instanceof Date
      ? challenge.expiresAt.toISOString()
      : String(challenge.expiresAt),
    verifiedAt: null,
    usedAt: null,

    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const encryptedPendingRegistration = await encryptSensitiveFields(
    'PENDING_REGISTRATION',
    pendingRegistrationPlain,
    buildPendingRegistrationSecurityContext({
      ownerId: userIdString,
      pendingRegistrationId,
    })
  );

  await PendingRegistration.create(encryptedPendingRegistration);

  return {
    requiresEmailVerification: true,
    pendingRegistrationId,
    challengeId: challenge.challengeId,
    expiresAt: pendingRegistrationPlain.expiresAt,
    maskedEmail: challenge.maskedEmail,
    ...(challenge.devOtp ? { devOtp: challenge.devOtp } : {}),
  };
};

const registerUser = startRegistration;

const completeRegistrationWithOtp = async ({
  pendingRegistrationId,
  challengeId,
  otp,
}) => {
  const pending = await verifyRegistrationOtp({
    pendingRegistrationId,
    challengeId,
    otp,
  });

  await ensureUserDoesNotExist({
    emailLookupHash: pending.emailLookupHash,
    usernameLookupHash: pending.usernameLookupHash,
  });

  const userId = toIdString(pending.userId);
  const timestamp = nowIso();

  const userPlain = {
    _id: userId,

    ...pending.passwordFields,
    ...pending.encryptedUserFields,

    emailLookupHash: pending.emailLookupHash,
    usernameLookupHash: pending.usernameLookupHash,

    role: ROLES.USER,
    isActive: true,
    twoFactorEnabled: true,

    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const encryptedUser = await encryptSensitiveFields(
    'USER',
    userPlain,
    buildUserSecurityContext(userId)
  );

  try {
    const user = await User.create(encryptedUser);

    /**
     * Delete pending registration after successful account creation.
     * This avoids keeping unnecessary OTP registration data.
     */
    await PendingRegistration.deleteOne({
      _id: String(pendingRegistrationId),
    });

    return {
      userId: user._id.toString(),
    };
  } catch (error) {
    if (error && error.code === 11000) {
      const duplicateError = new Error('User already exists');
      duplicateError.statusCode = 409;
      throw duplicateError;
    }

    throw error;
  }
};

const buildLoginLookupHashes = (identifier) => {
  const cleanIdentifier = normalize(cleanRequired(identifier, 'Email or username'));

  return {
    cleanIdentifier,
    emailLookupHash: computeEmailLookupHash(cleanIdentifier),
    usernameLookupHash: computeUsernameLookupHash(cleanIdentifier),
  };
};

const getDecryptedUserById = async (userId) => {
  const cleanUserId = toIdString(userId);

  if (!mongoose.Types.ObjectId.isValid(cleanUserId)) {
    const error = new Error('Invalid user id');
    error.statusCode = 400;
    throw error;
  }

  const encryptedUser = await User.findById(cleanUserId).lean();

  if (!encryptedUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return decryptUserDocument(encryptedUser);
};

const loginUser = async ({
  identifier,
  email,
  username,
  password,
}) => {
  const loginIdentifier = identifier || email || username;

  const {
    emailLookupHash,
    usernameLookupHash,
  } = buildLoginLookupHashes(loginIdentifier);

  const match = await findUserByLookupHashes({
    emailLookupHash,
    usernameLookupHash,
  });

  if (!match) {
    const error = new Error('Invalid login credentials');
    error.statusCode = 401;
    throw error;
  }

  const decryptedUser = match.decryptedUser;

  if (decryptedUser.isActive !== true) {
    const error = new Error('This account is disabled');
    error.statusCode = 403;
    throw error;
  }

  const passwordValid = await comparePassword(password, decryptedUser);

  if (!passwordValid) {
    const error = new Error('Invalid login credentials');
    error.statusCode = 401;
    throw error;
  }

  const registeredEmail = decryptedUser.email;

  const challenge = await createLoginTwoFactorChallenge({
    userId: decryptedUser._id,
    toEmail: registeredEmail,
  });

  return {
    requiresTwoFactor: true,
    message: 'Primary credentials verified. OTP sent to your registered email.',
    challenge: {
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
      deliveryMethod: challenge.deliveryMethod,
      maskedDestination: challenge.maskedDestination,
      ...(challenge.devOtp ? { devOtp: challenge.devOtp } : {}),
    },
    pendingUser: {
      id: decryptedUser._id,
      role: decryptedUser.role,
    },
  };
};

const completeLoginWithOtp = async ({
  challengeId,
  userId,
  otp,
  req,
}) => {
  await verifyLoginOtp({
    challengeId,
    userId,
    otp,
  });

  const decryptedUser = await getDecryptedUserById(userId);

  if (decryptedUser.isActive !== true) {
    const error = new Error('This account is disabled');
    error.statusCode = 403;
    throw error;
  }

  const session = await createLoginSession({
    user: {
      _id: decryptedUser._id,
      role: decryptedUser.role,
    },
    req,
  });

  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    sessionExpiresAt: session.sessionExpiresAt,
    user: {
      id: decryptedUser._id,
      role: decryptedUser.role,
    },
  };
};

module.exports = {
  startRegistration,
  registerUser,
  completeRegistrationWithOtp,

  loginUser,
  completeLoginWithOtp,

  getDecryptedUserById,
  getAllDecryptedUsers,
  findUserByLookupHashes,
};