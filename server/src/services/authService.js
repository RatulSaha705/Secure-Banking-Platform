'use strict';

/**
 * server/src/services/authService.js
 *
 * Strict encrypted authentication service.
 *
 * DB rule: Only _id is readable in MongoDB.
 * Every other stored value is encrypted before write, decrypted after read.
 *
 * Login strategy (full-scan):
 *   Because lookup hashes are also encrypted, we cannot query by them.
 *   Instead we load all users, decrypt each, and compare in memory.
 *   Acceptable for this CSE447 lab; production would use a lookup-hash index.
 */

const mongoose = require('mongoose');

const User                   = require('../models/User');
const PendingRegistration    = require('../models/PendingRegistration');

const { hashPassword, comparePassword }   = require('../security/password-security');
const { computeEmailLookupHash, computeUsernameLookupHash, normalize } = require('./lookupHashService');
const { createLoginSession }              = require('./tokenService');
const { ensureUserKeySet }                = require('../security/key-management/key-manager');
const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/secure-storage');
const {
  generatePendingRegistrationId,
  createRegistrationOtpChallenge,
  createLoginTwoFactorChallenge,
  verifyRegistrationOtp,
  verifyLoginOtp,
} = require('./twoFactorService');
const { ROLES } = require('../constants/roles');
const { nowIso, toIdString, cleanOptional, buildSecCtx } = require('../utils/serviceHelpers');

// ── Input cleaners ────────────────────────────────────────────────────────────

const cleanRequired = (value, fieldName) => {
  const cleaned = String(value || '').trim();
  if (!cleaned) {
    const err = new Error(`${fieldName} is required`);
    err.statusCode = 400;
    throw err;
  }
  return cleaned;
};

// ── Encryption contexts ───────────────────────────────────────────────────────

const userCtx = (userId) => {
  const id = toIdString(userId);
  if (!id) throw new Error('userId is required for user encryption/decryption');
  return buildSecCtx('users', id, id);
};

const pendingCtx = ({ ownerId, pendingRegistrationId }) => {
  const owner  = toIdString(ownerId);
  const docId  = String(pendingRegistrationId || '').trim();
  if (!owner) throw new Error('ownerId is required for pending registration encryption/decryption');
  if (!docId)  throw new Error('pendingRegistrationId is required for pending registration encryption/decryption');
  return buildSecCtx('pendingregistrations', owner, docId);
};

// ── Decrypt helpers ───────────────────────────────────────────────────────────

const decryptUserDocument = async (userDoc) => {
  if (!userDoc) return null;
  const userId    = toIdString(userDoc._id);
  const decrypted = await decryptSensitiveFields('USER', userDoc, userCtx(userId));
  decrypted._id   = userId;
  decrypted.id    = userId;
  return decrypted;
};

const decryptPendingDocument = async (pendingDoc) => {
  if (!pendingDoc) return null;
  const pendingId = String(pendingDoc._id);
  const decrypted = await decryptSensitiveFields('PENDING_REGISTRATION', pendingDoc, {
    documentId:     pendingId,
    collectionName: 'pendingregistrations',
  });
  decrypted._id                  = pendingId;
  decrypted.pendingRegistrationId = pendingId;
  return decrypted;
};

// ── User lookup helpers ───────────────────────────────────────────────────────

const getAllDecryptedUsers = async () => {
  const all = await User.find({}).lean();
  const out = [];
  for (const enc of all) out.push(await decryptUserDocument(enc));
  return out;
};

const findUserByLookupHashes = async ({ emailLookupHash, usernameLookupHash }) => {
  const all = await User.find({}).lean();
  for (const enc of all) {
    const dec = await decryptUserDocument(enc);
    if (dec.emailLookupHash === emailLookupHash || dec.usernameLookupHash === usernameLookupHash) {
      return { encryptedUser: enc, decryptedUser: dec };
    }
  }
  return null;
};

const ensureUserDoesNotExist = async ({ emailLookupHash, usernameLookupHash }) => {
  const match = await findUserByLookupHashes({ emailLookupHash, usernameLookupHash });
  if (!match) return;
  const err = new Error(
    match.decryptedUser.emailLookupHash === emailLookupHash
      ? 'An account with this email already exists'
      : 'This username is already taken'
  );
  err.statusCode = 409;
  throw err;
};

const deleteMatchingPendingRegistrations = async ({ emailLookupHash, usernameLookupHash }) => {
  const all   = await PendingRegistration.find({}).lean();
  const toDelete = [];
  for (const doc of all) {
    const dec = await decryptPendingDocument(doc);
    if (
      dec.status === 'PENDING' &&
      (dec.emailLookupHash === emailLookupHash || dec.usernameLookupHash === usernameLookupHash)
    ) {
      toDelete.push(String(doc._id));
    }
  }
  if (toDelete.length > 0) await PendingRegistration.deleteMany({ _id: { $in: toDelete } });
  return toDelete.length;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getDecryptedUserById
 * Fetches and fully decrypts a single User document by _id.
 * Throws 400 on invalid id, 404 if not found.
 */
const getDecryptedUserById = async (userId) => {
  const cleanId = toIdString(userId);
  if (!mongoose.Types.ObjectId.isValid(cleanId)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }
  const enc = await User.findById(cleanId).lean();
  if (!enc) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return decryptUserDocument(enc);
};

/**
 * registerUser  (Feature 1 — Registration)
 *
 * Validates inputs, checks for duplicates, generates user keys,
 * hashes the password, creates an OTP challenge, stores the pending
 * registration (all fields encrypted), and returns the challenge info.
 */
const registerUser = async ({ username, email, contact, phone, password, fullName }) => {
  const cleanUsername = cleanRequired(username, 'Username');
  const cleanEmail    = normalize(cleanRequired(email, 'Email'));
  const cleanContact  = cleanOptional(contact);
  const cleanPhone    = cleanOptional(phone);
  const cleanFullName = cleanOptional(fullName);

  const emailLookupHash    = computeEmailLookupHash(cleanEmail);
  const usernameLookupHash = computeUsernameLookupHash(cleanUsername);

  await ensureUserDoesNotExist({ emailLookupHash, usernameLookupHash });
  await deleteMatchingPendingRegistrations({ emailLookupHash, usernameLookupHash });

  const userId       = new mongoose.Types.ObjectId();
  const userIdString = userId.toString();

  await ensureUserKeySet({
    ownerUserId:    userIdString,
    persistToEnvFile: true,
    rsaKeySizeBits: Number(process.env.KEY_SETUP_RSA_BITS  || 1024),
    rsaRounds:      Number(process.env.KEY_SETUP_RSA_ROUNDS || 40),
  });

  const passwordFields         = await hashPassword(password);
  const pendingRegistrationId  = generatePendingRegistrationId();

  const challenge = await createRegistrationOtpChallenge({
    pendingRegistrationId,
    subjectId: userIdString,
    toEmail:   cleanEmail,
  });

  const timestamp = nowIso();

  const plainPending = {
    _id: pendingRegistrationId,

    challengeId:  challenge.challengeId,
    userId:       userIdString,

    emailLookupHash,
    usernameLookupHash,
    maskedEmail:  challenge.maskedEmail,

    // Stored as a nested object; the whole value is encrypted as one field.
    encryptedUserFields: { username: cleanUsername, email: cleanEmail, contact: cleanContact, phone: cleanPhone, fullName: cleanFullName },
    passwordFields,

    otpHash:     challenge.otpHash,
    status:      'PENDING',
    attempts:    0,
    maxAttempts: challenge.maxAttempts,
    expiresAt:   challenge.expiresAt instanceof Date ? challenge.expiresAt.toISOString() : String(challenge.expiresAt),
    verifiedAt:  null,
    usedAt:      null,
    createdAt:   timestamp,
    updatedAt:   timestamp,
  };

  const encPending = await encryptSensitiveFields(
    'PENDING_REGISTRATION',
    plainPending,
    pendingCtx({ ownerId: userIdString, pendingRegistrationId })
  );

  await PendingRegistration.create(encPending);

  return {
    requiresEmailVerification: true,
    pendingRegistrationId,
    challengeId: challenge.challengeId,
    expiresAt:   plainPending.expiresAt,
    maskedEmail: challenge.maskedEmail,
    ...(challenge.devOtp ? { devOtp: challenge.devOtp } : {}),
  };
};

/**
 * completeRegistrationWithOtp  (Feature 3 — OTP Verification)
 *
 * Verifies the registration OTP, creates the User document (all fields
 * encrypted), removes the PendingRegistration, returns the new userId.
 */
const completeRegistrationWithOtp = async ({ pendingRegistrationId, challengeId, otp }) => {
  const pending = await verifyRegistrationOtp({ pendingRegistrationId, challengeId, otp });

  await ensureUserDoesNotExist({
    emailLookupHash:    pending.emailLookupHash,
    usernameLookupHash: pending.usernameLookupHash,
  });

  const userId    = toIdString(pending.userId);
  const timestamp = nowIso();

  const userPlain = {
    _id: userId,
    ...pending.passwordFields,
    ...pending.encryptedUserFields,
    emailLookupHash:    pending.emailLookupHash,
    usernameLookupHash: pending.usernameLookupHash,
    role:               ROLES.USER,
    isActive:           true,
    twoFactorEnabled:   true,
    createdAt:          timestamp,
    updatedAt:          timestamp,
  };

  const encUser = await encryptSensitiveFields('USER', userPlain, userCtx(userId));

  try {
    const saved = await User.create(encUser);
    await PendingRegistration.deleteOne({ _id: String(pendingRegistrationId) });
    return { userId: saved._id.toString() };
  } catch (err) {
    if (err && err.code === 11000) {
      const dup = new Error('User already exists');
      dup.statusCode = 409;
      throw dup;
    }
    throw err;
  }
};

/**
 * loginUser  (Feature 2 — Login, step 1)
 *
 * Validates credentials; on success sends an OTP and returns the challenge.
 * Does NOT issue tokens — that happens in completeLoginWithOtp.
 */
const loginUser = async ({ identifier, email, username, password }) => {
  const loginIdentifier = identifier || email || username;
  const cleanId         = normalize(cleanRequired(loginIdentifier, 'Email or username'));

  const emailLookupHash    = computeEmailLookupHash(cleanId);
  const usernameLookupHash = computeUsernameLookupHash(cleanId);

  const match = await findUserByLookupHashes({ emailLookupHash, usernameLookupHash });

  if (!match) {
    const err = new Error('Invalid login credentials');
    err.statusCode = 401;
    throw err;
  }

  const { decryptedUser } = match;

  if (decryptedUser.isActive !== true) {
    const err = new Error('This account is disabled');
    err.statusCode = 403;
    throw err;
  }

  if (!await comparePassword(password, decryptedUser)) {
    const err = new Error('Invalid login credentials');
    err.statusCode = 401;
    throw err;
  }

  const challenge = await createLoginTwoFactorChallenge({
    userId:  decryptedUser._id,
    toEmail: decryptedUser.email,
  });

  return {
    requiresTwoFactor: true,
    message: 'Primary credentials verified. OTP sent to your registered email.',
    challenge: {
      challengeId:       challenge.challengeId,
      expiresAt:         challenge.expiresAt,
      deliveryMethod:    challenge.deliveryMethod,
      maskedDestination: challenge.maskedDestination,
      ...(challenge.devOtp ? { devOtp: challenge.devOtp } : {}),
    },
    pendingUser: { id: decryptedUser._id, role: decryptedUser.role },
  };
};

/**
 * completeLoginWithOtp  (Feature 3 — 2FA verification, step 2)
 *
 * Verifies the login OTP, creates a session, and returns tokens.
 */
const completeLoginWithOtp = async ({ challengeId, userId, otp, req }) => {
  await verifyLoginOtp({ challengeId, userId, otp });

  const decryptedUser = await getDecryptedUserById(userId);

  if (decryptedUser.isActive !== true) {
    const err = new Error('This account is disabled');
    err.statusCode = 403;
    throw err;
  }

  const session = await createLoginSession({
    user: { _id: decryptedUser._id, role: decryptedUser.role },
    req,
  });

  return {
    accessToken:      session.accessToken,
    refreshToken:     session.refreshToken,
    sessionId:        session.sessionId,
    sessionExpiresAt: session.sessionExpiresAt,
    user: { id: decryptedUser._id, role: decryptedUser.role },
  };
};

module.exports = {
  registerUser,
  completeRegistrationWithOtp,
  loginUser,
  completeLoginWithOtp,
  getDecryptedUserById,
  getAllDecryptedUsers,
  findUserByLookupHashes,
};