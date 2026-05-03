'use strict';

/**
 * server/src/services/twoFactorService.js
 *
 * Strict encrypted Two-Factor Authentication service.
 *
 * New DB rule:
 *   Only _id is readable.
 *   All OTP challenge values are encrypted:
 *     userId, otpHash, purpose, status, attempts, dates, etc.
 *
 * Important:
 *   _id is used as the challenge identifier.
 *   For pending registration, _id is pendingRegistrationId.
 *   For login 2FA, _id is challengeId.
 */

const crypto = require('crypto');

const PendingRegistration = require('../models/PendingRegistration');
const TwoFactorChallenge = require('../models/TwoFactorChallenge');

const { createCbcMac, timingSafeEqualHex } = require('../security/data-integrity/cbc-mac-engine');
const { sendOtpEmail } = require('./emailService');

const {
  encryptSensitiveFields,
  decryptSensitiveFields,
} = require('../security/secure-storage');

const OTP_LENGTH = 6;
const DEFAULT_OTP_TTL_MINUTES = 5;
const DEFAULT_MAX_ATTEMPTS = 5;

const getOtpSecret = () => {
  const secret =
    process.env.TWO_FACTOR_OTP_SECRET ||
    process.env.SECURITY_MAC_MASTER_KEY ||
    process.env.HMAC_MASTER_KEY;

  if (!secret) {
    throw new Error(
      'Missing OTP secret. Add TWO_FACTOR_OTP_SECRET or SECURITY_MAC_MASTER_KEY to server/.env'
    );
  }

  return secret;
};

const getOtpTtlMinutes = () => {
  const value = Number(process.env.TWO_FACTOR_OTP_TTL_MINUTES || DEFAULT_OTP_TTL_MINUTES);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_OTP_TTL_MINUTES;
  }

  return value;
};

const getMaxAttempts = () => {
  const value = Number(process.env.TWO_FACTOR_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_ATTEMPTS;
  }

  return value;
};

const nowIso = () => {
  return new Date().toISOString();
};

const toIsoString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
};

const isExpired = (isoDateValue) => {
  if (!isoDateValue) {
    return true;
  }

  return new Date(isoDateValue).getTime() < Date.now();
};

const generateNumericOtp = (length = OTP_LENGTH) => {
  const max = 10 ** length;
  const value = crypto.randomInt(0, max);
  return String(value).padStart(length, '0');
};

const generateChallengeId = () => {
  return crypto.randomBytes(24).toString('hex');
};

const generatePendingRegistrationId = () => {
  return crypto.randomBytes(24).toString('hex');
};

const hashOtp = ({ purpose, challengeId, subjectId, otp }) => {
  return createCbcMac(
    getOtpSecret(),
    [
      'secure-banking-otp-v1',
      String(purpose),
      String(challengeId),
      String(subjectId),
      String(otp),
    ]
  );
};

const maskEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return '';
  }

  const [name, domain] = email.split('@');

  if (!name || !domain) {
    return '';
  }

  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(name.length - 2, 3))}@${domain}`;
};

const shouldReturnDevOtp = () => {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.AUTH_DEV_RETURN_OTP === 'true'
  );
};

const attachDevOtp = (response, otp) => {
  if (shouldReturnDevOtp()) {
    return {
      ...response,
      devOtp: otp,
    };
  }

  return response;
};

const buildPendingRegistrationContext = ({ ownerId, pendingRegistrationId }) => {
  return {
    ownerId: String(ownerId),
    documentId: String(pendingRegistrationId),
    collectionName: 'pendingregistrations',
  };
};

const buildTwoFactorContext = ({ ownerId, challengeId }) => {
  return {
    ownerId: String(ownerId),
    documentId: String(challengeId),
    collectionName: 'twofactorchallenges',
  };
};

const decryptPendingRegistration = async (encryptedPending) => {
  if (!encryptedPending) {
    return null;
  }

  const pendingRegistrationId = String(encryptedPending._id);

  const decrypted = await decryptSensitiveFields(
    'PENDING_REGISTRATION',
    encryptedPending,
    {
      documentId: pendingRegistrationId,
      collectionName: 'pendingregistrations',
    }
  );

  decrypted._id = pendingRegistrationId;
  decrypted.pendingRegistrationId = pendingRegistrationId;

  return decrypted;
};

const encryptPendingRegistration = async (plainPending) => {
  const pendingRegistrationId = String(plainPending._id || plainPending.pendingRegistrationId);
  const ownerId = String(plainPending.userId);

  return encryptSensitiveFields(
    'PENDING_REGISTRATION',
    {
      ...plainPending,
      _id: pendingRegistrationId,
    },
    buildPendingRegistrationContext({
      ownerId,
      pendingRegistrationId,
    })
  );
};

const savePendingRegistrationPlain = async (plainPending) => {
  const encryptedPending = await encryptPendingRegistration({
    ...plainPending,
    updatedAt: nowIso(),
  });

  await PendingRegistration.replaceOne(
    {
      _id: String(encryptedPending._id),
    },
    encryptedPending,
    {
      upsert: false,
    }
  );
};

const decryptTwoFactorChallenge = async (encryptedChallenge) => {
  if (!encryptedChallenge) {
    return null;
  }

  const challengeId = String(encryptedChallenge._id);

  const decrypted = await decryptSensitiveFields(
    'TWO_FACTOR_CHALLENGE',
    encryptedChallenge,
    {
      documentId: challengeId,
      collectionName: 'twofactorchallenges',
    }
  );

  decrypted._id = challengeId;
  decrypted.challengeId = challengeId;

  return decrypted;
};

const encryptTwoFactorChallenge = async (plainChallenge) => {
  const challengeId = String(plainChallenge._id || plainChallenge.challengeId);
  const ownerId = String(plainChallenge.userId);

  return encryptSensitiveFields(
    'TWO_FACTOR_CHALLENGE',
    {
      ...plainChallenge,
      _id: challengeId,
    },
    buildTwoFactorContext({
      ownerId,
      challengeId,
    })
  );
};

const saveTwoFactorChallengePlain = async (plainChallenge) => {
  const encryptedChallenge = await encryptTwoFactorChallenge({
    ...plainChallenge,
    updatedAt: nowIso(),
  });

  await TwoFactorChallenge.replaceOne(
    {
      _id: String(encryptedChallenge._id),
    },
    encryptedChallenge,
    {
      upsert: false,
    }
  );
};

const createRegistrationOtpChallenge = async ({
  pendingRegistrationId,
  subjectId,
  toEmail,
}) => {
  const challengeId = generateChallengeId();
  const otp = generateNumericOtp();
  const ttlMinutes = getOtpTtlMinutes();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const otpHash = hashOtp({
    purpose: 'REGISTRATION',
    challengeId,
    subjectId,
    otp,
  });

  await sendOtpEmail({
    to: toEmail,
    otp,
    purpose: 'REGISTRATION',
    expiresInMinutes: ttlMinutes,
  });

  return attachDevOtp(
    {
      pendingRegistrationId,
      challengeId,
      otpHash,
      expiresAt,
      maxAttempts: getMaxAttempts(),
      maskedEmail: maskEmail(toEmail),
    },
    otp
  );
};

const createLoginTwoFactorChallenge = async ({ userId, toEmail }) => {
  const challengeId = generateChallengeId();
  const otp = generateNumericOtp();
  const ttlMinutes = getOtpTtlMinutes();
  const maxAttempts = getMaxAttempts();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const timestamp = nowIso();

  const plainChallenge = {
    _id: challengeId,
    userId: String(userId),
    otpHash: hashOtp({
      purpose: 'LOGIN',
      challengeId,
      subjectId: userId,
      otp,
    }),
    purpose: 'LOGIN',
    status: 'PENDING',
    attempts: 0,
    maxAttempts,
    expiresAt: expiresAt.toISOString(),
    verifiedAt: null,
    usedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const encryptedChallenge = await encryptTwoFactorChallenge(plainChallenge);
  await TwoFactorChallenge.create(encryptedChallenge);

  await sendOtpEmail({
    to: toEmail,
    otp,
    purpose: 'LOGIN',
    expiresInMinutes: ttlMinutes,
  });

  return attachDevOtp(
    {
      challengeId,
      expiresAt: expiresAt.toISOString(),
      deliveryMethod: 'email',
      maskedDestination: maskEmail(toEmail),
    },
    otp
  );
};

const verifyRegistrationOtp = async ({
  pendingRegistrationId,
  challengeId,
  otp,
}) => {
  const encryptedPending = await PendingRegistration.findById(
    String(pendingRegistrationId)
  ).lean();

  if (!encryptedPending) {
    const error = new Error('Invalid registration verification challenge');
    error.statusCode = 400;
    throw error;
  }

  const pending = await decryptPendingRegistration(encryptedPending);

  if (String(pending.challengeId) !== String(challengeId)) {
    const error = new Error('Invalid registration verification challenge');
    error.statusCode = 400;
    throw error;
  }

  if (pending.status !== 'PENDING') {
    const error = new Error('Registration verification challenge is no longer active');
    error.statusCode = 400;
    throw error;
  }

  if (isExpired(pending.expiresAt)) {
    pending.status = 'EXPIRED';
    await savePendingRegistrationPlain(pending);

    const error = new Error('Registration OTP expired');
    error.statusCode = 400;
    throw error;
  }

  if (Number(pending.attempts) >= Number(pending.maxAttempts)) {
    pending.status = 'CANCELLED';
    await savePendingRegistrationPlain(pending);

    const error = new Error('Too many OTP attempts');
    error.statusCode = 429;
    throw error;
  }

  const actualHash = hashOtp({
    purpose: 'REGISTRATION',
    challengeId,
    subjectId: pending.userId,
    otp,
  });

  const valid = timingSafeEqualHex(actualHash, pending.otpHash);

  pending.attempts = Number(pending.attempts) + 1;

  if (!valid) {
    await savePendingRegistrationPlain(pending);

    const error = new Error('Invalid registration OTP');
    error.statusCode = 401;
    throw error;
  }

  pending.status = 'VERIFIED';
  pending.verifiedAt = nowIso();

  await savePendingRegistrationPlain(pending);

  return pending;
};

const verifyLoginOtp = async ({
  challengeId,
  userId,
  otp,
}) => {
  const encryptedChallenge = await TwoFactorChallenge.findById(
    String(challengeId)
  ).lean();

  if (!encryptedChallenge) {
    const error = new Error('Invalid login verification challenge');
    error.statusCode = 400;
    throw error;
  }

  const challenge = await decryptTwoFactorChallenge(encryptedChallenge);

  if (String(challenge.userId) !== String(userId)) {
    const error = new Error('Invalid login verification challenge');
    error.statusCode = 400;
    throw error;
  }

  if (challenge.purpose !== 'LOGIN') {
    const error = new Error('Invalid login verification challenge');
    error.statusCode = 400;
    throw error;
  }

  if (challenge.status !== 'PENDING') {
    const error = new Error('Login verification challenge is no longer active');
    error.statusCode = 400;
    throw error;
  }

  if (isExpired(challenge.expiresAt)) {
    challenge.status = 'EXPIRED';
    await saveTwoFactorChallengePlain(challenge);

    const error = new Error('Login OTP expired');
    error.statusCode = 400;
    throw error;
  }

  if (Number(challenge.attempts) >= Number(challenge.maxAttempts)) {
    challenge.status = 'CANCELLED';
    await saveTwoFactorChallengePlain(challenge);

    const error = new Error('Too many OTP attempts');
    error.statusCode = 429;
    throw error;
  }

  const actualHash = hashOtp({
    purpose: 'LOGIN',
    challengeId,
    subjectId: userId,
    otp,
  });

  const valid = timingSafeEqualHex(actualHash, challenge.otpHash);

  challenge.attempts = Number(challenge.attempts) + 1;

  if (!valid) {
    await saveTwoFactorChallengePlain(challenge);

    const error = new Error('Invalid login OTP');
    error.statusCode = 401;
    throw error;
  }

  challenge.status = 'USED';
  challenge.verifiedAt = nowIso();
  challenge.usedAt = nowIso();

  await saveTwoFactorChallengePlain(challenge);

  return challenge;
};

module.exports = {
  OTP_LENGTH,
  DEFAULT_OTP_TTL_MINUTES,
  DEFAULT_MAX_ATTEMPTS,

  generateNumericOtp,
  generateChallengeId,
  generatePendingRegistrationId,
  hashOtp,
  maskEmail,

  createRegistrationOtpChallenge,
  createLoginTwoFactorChallenge,

  verifyRegistrationOtp,
  verifyLoginOtp,

  decryptPendingRegistration,
  decryptTwoFactorChallenge,
};