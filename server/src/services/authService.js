'use strict';

/**
 * services/authService.js — Registration & Login Business Logic
 *
 * Phase 1 scope only:
 *   - register user
 *   - login user
 *
 * Notes:
 *   - Sensitive user fields are encrypted before storage
 *   - Passwords are hashed with bcrypt
 *   - Email/username lookup uses deterministic lookup hashes
 *   - Only features 1 and 2 are implemented here
 */

const User = require('../models/User');
const { hashPassword, comparePassword } = require('./passwordService');
const { encryptUserFields } = require('./fieldEncryptionService');
const { computeLookupHash, normalize } = require('./lookupHashService');
const { generateAccessToken } = require('./tokenService');

const cleanOptional = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const cleanRequired = (value) => String(value || '').trim();

/**
 * registerUser
 * Creates a new user account with:
 * - encrypted sensitive fields
 * - hashed password
 * - lookup hashes for uniqueness checks
 */
const registerUser = async ({ username, email, password, fullName, phone }) => {
  const cleanUsername = cleanRequired(username);
  const cleanEmail = normalize(email);
  const cleanFullName = cleanOptional(fullName);
  const cleanPhone = cleanOptional(phone);

  const emailLookupHash = computeLookupHash(cleanEmail);
  const usernameLookupHash = computeLookupHash(cleanUsername);

  const existing = await User.findOne({
    $or: [{ emailLookupHash }, { usernameLookupHash }],
  });

  if (existing) {
    if (existing.emailLookupHash === emailLookupHash) {
      const err = new Error('An account with this email already exists');
      err.statusCode = 409;
      throw err;
    }

    const err = new Error('This username is already taken');
    err.statusCode = 409;
    throw err;
  }

  const passwordFields = await hashPassword(password);

  const encryptedFields = encryptUserFields({
    username: cleanUsername,
    email: cleanEmail,
    fullName: cleanFullName,
    phone: cleanPhone,
  });

  try {
    const user = await User.create({
      ...passwordFields,
      emailLookupHash,
      usernameLookupHash,
      ...encryptedFields,
      role: 'user',
    });

    return { userId: user._id.toString() };
  } catch (error) {
    // Handles race-condition duplicate insert if two requests hit together
    if (error && error.code === 11000) {
      const duplicatedField = Object.keys(error.keyPattern || {})[0];

      let message = 'User already exists';
      if (duplicatedField === 'emailLookupHash') {
        message = 'An account with this email already exists';
      } else if (duplicatedField === 'usernameLookupHash') {
        message = 'This username is already taken';
      }

      const err = new Error(message);
      err.statusCode = 409;
      throw err;
    }

    throw error;
  }
};

/**
 * loginUser
 * Logs in a user using:
 * - email lookup hash
 * - bcrypt password check
 * - JWT access token
 */
const loginUser = async ({ email, password }) => {
  const cleanEmail = normalize(email);
  const emailLookupHash = computeLookupHash(cleanEmail);

  const user = await User.findOne({ emailLookupHash }).select(
    '+passwordHash +passwordSalt +passwordIterations +passwordHashAlgorithm +passwordHashBytes'
  );

  // Same error for both "not found" and "wrong password"
  if (!user) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const passwordValid = await comparePassword(password, user);

  if (!passwordValid) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const accessToken = generateAccessToken({
    id: user._id.toString(),
    role: user.role,
  });

  return {
    accessToken,
    user: {
      id: user._id.toString(),
      role: user.role,
    },
  };
};

module.exports = { registerUser, loginUser };