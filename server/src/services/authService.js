'use strict';

/**
 * server/src/services/authService.js
 *
 * Registration:
 *   POST /register
 *     - create lookup hashes
 *     - hash + salt password
 *     - encrypt sensitive user fields
 *     - store pending registration
 *     - email OTP
 *
 *   POST /register/verify
 *     - verify OTP
 *     - create real User
 *
 * Login:
 *   POST /login
 *     - verify email/username + password
 *     - email OTP
 *     - no JWT/session yet
 *
 *   POST /login/verify
 *     - verify OTP
 *     - create refresh session
 *     - issue short-lived access token
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

const cleanOptional = (value) => {
  if (value === undefined || value === null) return null;

  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
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

const buildUserSecurityContext = (userId) => ({
  ownerId: userId.toString(),
  documentId: userId.toString(),
  collectionName: 'users',
});

const ensureUserDoesNotExist = async ({ emailLookupHash, usernameLookupHash }) => {
  const existing = await User.findOne({
    $or: [{ emailLookupHash }, { usernameLookupHash }],
  }).lean();

  if (existing) {
    const error = new Error(
      existing.emailLookupHash === emailLookupHash
        ? 'An account with this email already exists'
        : 'This username is already taken'
    );
    error.statusCode = 409;
    throw error;
  }
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

  await ensureUserDoesNotExist({ emailLookupHash, usernameLookupHash });

  await PendingRegistration.deleteMany({
    $or: [{ emailLookupHash }, { usernameLookupHash }],
    status: 'PENDING',
  });

  const userId = new mongoose.Types.ObjectId();

  await ensureUserKeySet({
    ownerUserId: userId,
    persistToEnvFile: true,
    rsaKeySizeBits: Number(process.env.KEY_SETUP_RSA_BITS || 1024),
    rsaRounds: Number(process.env.KEY_SETUP_RSA_ROUNDS || 40),
  });

  const securityContext = buildUserSecurityContext(userId);
  const passwordFields = await hashPassword(password);

  const encryptedUserFields = await encryptSensitiveFields(
    'USER',
    {
      username: cleanUsername,
      email: cleanEmail,
      contact: cleanContact,
      phone: cleanPhone,
      fullName: cleanFullName,
    },
    securityContext
  );

  const pendingRegistrationId = generatePendingRegistrationId();

  const challenge = await createRegistrationOtpChallenge({
    pendingRegistrationId,
    subjectId: userId.toString(),
    toEmail: cleanEmail,
  });

  await PendingRegistration.create({
    pendingRegistrationId,
    challengeId: challenge.challengeId,
    userId,
    emailLookupHash,
    usernameLookupHash,
    maskedEmail: challenge.maskedEmail,
    encryptedUserFields,
    passwordFields,
    otpHash: challenge.otpHash,
    status: 'PENDING',
    attempts: 0,
    maxAttempts: challenge.maxAttempts,
    expiresAt: challenge.expiresAt,
  });

  return {
    requiresEmailVerification: true,
    pendingRegistrationId,
    challengeId: challenge.challengeId,
    expiresAt: challenge.expiresAt,
    maskedEmail: challenge.maskedEmail,
    ...(challenge.devOtp ? { devOtp: challenge.devOtp } : {}),
  };
};

const registerUser = startRegistration;

const completeRegistrationWithOtp = async ({ pendingRegistrationId, challengeId, otp }) => {
  const pending = await verifyRegistrationOtp({
    pendingRegistrationId,
    challengeId,
    otp,
  });

  await ensureUserDoesNotExist({
    emailLookupHash: pending.emailLookupHash,
    usernameLookupHash: pending.usernameLookupHash,
  });

  try {
    const user = await User.create({
      _id: pending.userId,

      ...pending.passwordFields,
      ...pending.encryptedUserFields,

      emailLookupHash: pending.emailLookupHash,
      usernameLookupHash: pending.usernameLookupHash,

      role: 'user',
      isActive: true,
      twoFactorEnabled: true,
    });

    pending.status = 'USED';
    pending.usedAt = new Date();
    await pending.save();

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

const buildLoginLookupQuery = (identifier) => {
  const cleanIdentifier = normalize(cleanRequired(identifier, 'Email or username'));

  return {
    cleanIdentifier,
    query: {
      $or: [
        { emailLookupHash: computeEmailLookupHash(cleanIdentifier) },
        { usernameLookupHash: computeUsernameLookupHash(cleanIdentifier) },
      ],
    },
  };
};

const getDecryptedUserById = async (userId) => {
  const user = await User.findById(userId).lean();

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return decryptSensitiveFields(
    'USER',
    user,
    buildUserSecurityContext(user._id)
  );
};

const loginUser = async ({ identifier, email, username, password }) => {
  const loginIdentifier = identifier || email || username;
  const { query } = buildLoginLookupQuery(loginIdentifier);

  const user = await User.findOne(query).select(
    '+passwordHash +passwordSalt +passwordIterations +passwordHashAlgorithm +passwordHashBytes'
  );

  if (!user) {
    const error = new Error('Invalid login credentials');
    error.statusCode = 401;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error('This account is disabled');
    error.statusCode = 403;
    throw error;
  }

  const passwordValid = await comparePassword(password, user);

  if (!passwordValid) {
    const error = new Error('Invalid login credentials');
    error.statusCode = 401;
    throw error;
  }

  const decryptedUser = await getDecryptedUserById(user._id);
  const registeredEmail = decryptedUser.email;

  const challenge = await createLoginTwoFactorChallenge({
    userId: user._id.toString(),
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
      id: user._id.toString(),
      role: user.role,
    },
  };
};

const completeLoginWithOtp = async ({ challengeId, userId, otp, req }) => {
  await verifyLoginOtp({
    challengeId,
    userId,
    otp,
  });

  const user = await User.findById(userId);

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error('This account is disabled');
    error.statusCode = 403;
    throw error;
  }

  const session = await createLoginSession({ user, req });

  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    sessionExpiresAt: session.sessionExpiresAt,
    user: {
      id: user._id.toString(),
      role: user.role,
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
};