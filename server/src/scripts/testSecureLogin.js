'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const TwoFactorChallenge = require('../models/TwoFactorChallenge');
const { registerUser, loginUser } = require('../services/authService');
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
    username: `feature2user_${suffix}`,
    email: `feature2_${suffix}@example.com`,
    contact: '01700000000',
    fullName: 'Feature Two Test',
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

  console.log('Registering test user...');
  const { userId } = await registerUser(testUser);
  console.log('Created userId:', userId);

  console.log('Testing login by email...');
  const emailLogin = await loginUser({
    identifier: testUser.email,
    password: testUser.password,
  });

  console.log('requiresTwoFactor:', emailLogin.requiresTwoFactor);
  console.log('has challengeId:', Boolean(emailLogin.challenge.challengeId));
  console.log('has final accessToken:', Boolean(emailLogin.accessToken));
  console.log('devOtp:', emailLogin.challenge.devOtp || '(hidden in production)');

  const challengeFromDb = await TwoFactorChallenge.findOne({
    challengeId: emailLogin.challenge.challengeId,
    userId,
  }).lean();

  console.log('challenge stored in DB:', Boolean(challengeFromDb));
  console.log('challenge status:', challengeFromDb && challengeFromDb.status);

  console.log('Testing login by username...');
  const usernameLogin = await loginUser({
    identifier: testUser.username,
    password: testUser.password,
  });

  console.log('username login requiresTwoFactor:', usernameLogin.requiresTwoFactor);
  console.log('username login has challengeId:', Boolean(usernameLogin.challenge.challengeId));
  console.log('username login has final accessToken:', Boolean(usernameLogin.accessToken));

  let wrongPasswordRejected = false;

  try {
    await loginUser({
      identifier: testUser.email,
      password: 'WrongPassword123!',
    });
  } catch (error) {
    wrongPasswordRejected = error.statusCode === 401;
  }

  console.log('Wrong password rejected:', wrongPasswordRejected);

  const success =
    emailLogin.requiresTwoFactor === true &&
    Boolean(emailLogin.challenge.challengeId) &&
    !emailLogin.accessToken &&
    Boolean(challengeFromDb) &&
    challengeFromDb.status === 'PENDING' &&
    usernameLogin.requiresTwoFactor === true &&
    Boolean(usernameLogin.challenge.challengeId) &&
    !usernameLogin.accessToken &&
    wrongPasswordRejected === true;

  console.log('Final success:', success);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('Feature 2 secure login test failed:');
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {}

  process.exit(1);
});