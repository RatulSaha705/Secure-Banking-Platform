'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const { registerUser, loginUser, getDecryptedUserById } = require('../services/authService');
const { computeEmailLookupHash, computeUsernameLookupHash } = require('../services/lookupHashService');

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
    username: `feature1user_${suffix}`,
    email: `feature1_${suffix}@example.com`,
    contact: '01700000000',
    fullName: 'Feature One Test',
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

  const savedUser = await User.findById(userId)
    .select('+passwordHash +passwordSalt +passwordIterations +passwordHashAlgorithm +passwordHashBytes')
    .lean();

  console.log('Has old encEmail:', Object.prototype.hasOwnProperty.call(savedUser, 'encEmail'));
  console.log('Has old macEmail:', Object.prototype.hasOwnProperty.call(savedUser, 'macEmail'));
  console.log('Has passwordHash:', Boolean(savedUser.passwordHash));
  console.log('Has passwordSalt:', Boolean(savedUser.passwordSalt));
  console.log('Has passwordIterations:', savedUser.passwordIterations);

  console.log('username algorithm:', savedUser.username && savedUser.username.algorithm);
  console.log('email algorithm:', savedUser.email && savedUser.email.algorithm);
  console.log('contact algorithm:', savedUser.contact && savedUser.contact.algorithm);
  console.log('email has ciphertext:', Boolean(savedUser.email && savedUser.email.ciphertext));
  console.log('email has MAC:', Boolean(savedUser.email && savedUser.email.mac));

  const decrypted = await getDecryptedUserById(userId);
  console.log('Decrypted username:', decrypted.username);
  console.log('Decrypted email:', decrypted.email);
  console.log('Decrypted contact:', decrypted.contact);

  const loginResult = await loginUser({
    email: testUser.email,
    password: testUser.password,
  });

  console.log('Login token exists:', Boolean(loginResult.accessToken));
  console.log('Login user id matches:', loginResult.user.id === userId);

  const success =
    savedUser.email.algorithm === 'RSA' &&
    Boolean(savedUser.email.mac) &&
    Boolean(savedUser.passwordHash) &&
    Boolean(savedUser.passwordSalt) &&
    decrypted.email === testUser.email.toLowerCase() &&
    loginResult.user.id === userId &&
    !Object.prototype.hasOwnProperty.call(savedUser, 'encEmail');

  console.log('Final success:', success);

  console.log('This test user was kept in MongoDB so you can inspect it:');
  console.log(testUser.email);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('Feature 1 registration test failed:');
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {}

  process.exit(1);
});