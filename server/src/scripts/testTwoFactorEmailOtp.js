'use strict';

/**
 * server/src/scripts/testTwoFactorEmailOtp.js
 *
 * End-to-end development test for:
 *   - registration OTP
 *   - login OTP
 *
 * For local testing without real SMTP, set in .env:
 *   EMAIL_ALLOW_CONSOLE_FALLBACK=true
 *   AUTH_DEV_RETURN_OTP=true
 *
 * Usage:
 *   cd server
 *   node src/scripts/testTwoFactorEmailOtp.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const TwoFactorChallenge = require('../models/TwoFactorChallenge');

const {
  registerUser,
  completeRegistrationWithOtp,
  loginUser,
  completeLoginWithOtp,
} = require('../services/authService');

const {
  computeEmailLookupHash,
  computeUsernameLookupHash,
} = require('../services/lookupHashService');

const connectDatabase = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);
};

const main = async () => {
  await connectDatabase();

  const suffix = Date.now();

  const testUser = {
    username: `otpuser_${suffix}`,
    email: `otp_${suffix}@example.com`,
    contact: '01700000000',
    fullName: 'OTP Test User',
    password: 'StrongPassword123!',
  };

  const emailLookupHash = computeEmailLookupHash(testUser.email);
  const usernameLookupHash = computeUsernameLookupHash(testUser.username);

  await User.deleteMany({
    $or: [
      { emailLookupHash },
      { usernameLookupHash },
    ],
  });

  await PendingRegistration.deleteMany({
    $or: [
      { emailLookupHash },
      { usernameLookupHash },
    ],
  });

  console.log('Starting registration...');
  const registrationStart = await registerUser(testUser);

  console.log('requiresEmailVerification:', registrationStart.requiresEmailVerification);
  console.log('pendingRegistrationId:', registrationStart.pendingRegistrationId);
  console.log('challengeId:', registrationStart.challengeId);
  console.log('maskedEmail:', registrationStart.maskedEmail);
  console.log('dev registration OTP:', registrationStart.devOtp || '(not returned)');

  if (!registrationStart.devOtp) {
    throw new Error('Set AUTH_DEV_RETURN_OTP=true in .env for this local test script.');
  }

  const registrationComplete = await completeRegistrationWithOtp({
    pendingRegistrationId: registrationStart.pendingRegistrationId,
    challengeId: registrationStart.challengeId,
    otp: registrationStart.devOtp,
  });

  console.log('Registration completed userId:', registrationComplete.userId);

  console.log('\nStarting login...');
  const loginStart = await loginUser({
    identifier: testUser.email,
    password: testUser.password,
  });

  console.log('requiresTwoFactor:', loginStart.requiresTwoFactor);
  console.log('login challengeId:', loginStart.challenge.challengeId);
  console.log('pending user id:', loginStart.pendingUser.id);
  console.log('dev login OTP:', loginStart.challenge.devOtp || '(not returned)');
  console.log('has final token before OTP:', Boolean(loginStart.accessToken));

  if (!loginStart.challenge.devOtp) {
    throw new Error('Set AUTH_DEV_RETURN_OTP=true in .env for this local test script.');
  }

  const challengeFromDb = await TwoFactorChallenge.findOne({
    challengeId: loginStart.challenge.challengeId,
    userId: loginStart.pendingUser.id,
  }).lean();

  console.log('Login challenge stored:', Boolean(challengeFromDb));
  console.log('Login challenge status:', challengeFromDb && challengeFromDb.status);

  const loginComplete = await completeLoginWithOtp({
    challengeId: loginStart.challenge.challengeId,
    userId: loginStart.pendingUser.id,
    otp: loginStart.challenge.devOtp,
  });

  console.log('Final access token exists:', Boolean(loginComplete.accessToken));
  console.log('Final user id:', loginComplete.user.id);

  const success =
    registrationStart.requiresEmailVerification === true &&
    Boolean(registrationComplete.userId) &&
    loginStart.requiresTwoFactor === true &&
    !loginStart.accessToken &&
    Boolean(challengeFromDb) &&
    challengeFromDb.status === 'PENDING' &&
    Boolean(loginComplete.accessToken);

  console.log('\nFinal success:', success);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nTwo-factor email OTP test failed:');
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore
  }

  process.exit(1);
});