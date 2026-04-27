'use strict';

/**
 * server/src/services/twoFactorService.js
 *
 * Feature 9: Two-Factor Authentication with email OTP.
 *
 * Random OTP is generated every time.
 * Plaintext OTP is never stored.
 * OTP is sent from bank email to user's registered email.
 *
 * Custom HMAC-SHA256-LAB is used to hash OTP values.
 */

const crypto = require('crypto');
const PendingRegistration = require('../models/PendingRegistration');
const TwoFactorChallenge = require('../models/TwoFactorChallenge');
const { hmacSha256Hex, timingSafeEqualHex } = require('../security/hash/hmac');
const { sendOtpEmail } = require('./emailService');

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
  return Number(process.env.TWO_FACTOR_OTP_TTL_MINUTES || DEFAULT_OTP_TTL_MINUTES);
};

const getMaxAttempts = () => {
  return Number(process.env.TWO_FACTOR_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
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
  return hmacSha256Hex(
    getOtpSecret(),
    [
      'secure-banking-otp-v1',
      String(purpose),
      String(challengeId),
      String(subjectId),
      String(otp),
    ].join('|')
  );
};

const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return '';

  const [name, domain] = email.split('@');
  if (!name || !domain) return '';

  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(name.length - 2, 3))}@${domain}`;
};

const attachDevOtp = (response, otp) => {
  if (process.env.AUTH_DEV_RETURN_OTP === 'true') {
    return {
      ...response,
      devOtp: otp,
    };
  }

  return response;
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

  await TwoFactorChallenge.create({
    userId,
    challengeId,
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
    expiresAt,
  });

  await sendOtpEmail({
    to: toEmail,
    otp,
    purpose: 'LOGIN',
    expiresInMinutes: ttlMinutes,
  });

  return attachDevOtp(
    {
      challengeId,
      expiresAt,
      deliveryMethod: 'email',
      maskedDestination: maskEmail(toEmail),
    },
    otp
  );
};

const verifyRegistrationOtp = async ({ pendingRegistrationId, challengeId, otp }) => {
  const pending = await PendingRegistration.findOne({
    pendingRegistrationId,
    challengeId,
  }).select('+otpHash');

  if (!pending) {
    const error = new Error('Invalid registration verification challenge');
    error.statusCode = 400;
    throw error;
  }

  if (pending.status !== 'PENDING') {
    const error = new Error('Registration verification challenge is no longer active');
    error.statusCode = 400;
    throw error;
  }

  if (pending.expiresAt.getTime() < Date.now()) {
    pending.status = 'EXPIRED';
    await pending.save();

    const error = new Error('Registration OTP expired');
    error.statusCode = 400;
    throw error;
  }

  if (pending.attempts >= pending.maxAttempts) {
    pending.status = 'CANCELLED';
    await pending.save();

    const error = new Error('Too many OTP attempts');
    error.statusCode = 429;
    throw error;
  }

  const actualHash = hashOtp({
    purpose: 'REGISTRATION',
    challengeId,
    subjectId: pending.userId.toString(),
    otp,
  });

  const valid = timingSafeEqualHex(actualHash, pending.otpHash);
  pending.attempts += 1;

  if (!valid) {
    await pending.save();

    const error = new Error('Invalid registration OTP');
    error.statusCode = 401;
    throw error;
  }

  pending.status = 'VERIFIED';
  pending.verifiedAt = new Date();
  await pending.save();

  return pending;
};

const verifyLoginOtp = async ({ challengeId, userId, otp }) => {
  const challenge = await TwoFactorChallenge.findOne({
    challengeId,
    userId,
    purpose: 'LOGIN',
  }).select('+otpHash');

  if (!challenge) {
    const error = new Error('Invalid login verification challenge');
    error.statusCode = 400;
    throw error;
  }

  if (challenge.status !== 'PENDING') {
    const error = new Error('Login verification challenge is no longer active');
    error.statusCode = 400;
    throw error;
  }

  if (challenge.expiresAt.getTime() < Date.now()) {
    challenge.status = 'EXPIRED';
    await challenge.save();

    const error = new Error('Login OTP expired');
    error.statusCode = 400;
    throw error;
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    challenge.status = 'CANCELLED';
    await challenge.save();

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
  challenge.attempts += 1;

  if (!valid) {
    await challenge.save();

    const error = new Error('Invalid login OTP');
    error.statusCode = 401;
    throw error;
  }

  challenge.status = 'USED';
  challenge.verifiedAt = new Date();
  challenge.usedAt = new Date();
  await challenge.save();

  return true;
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
};