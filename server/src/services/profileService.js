'use strict';

/**
 * server/src/services/profileService.js
 *
 * Profile Management Service — Feature 6.
 *
 * What it does
 * ────────────
 *  getMyProfile     – Return the authenticated user's decrypted profile.
 *                     If no Profile document exists yet, one is auto-created
 *                     by mirroring the current User record (username, email,
 *                     contact, phone, fullName) so first-time callers always
 *                     get a meaningful response.
 *
 *  updateMyProfile  – Validate and apply partial updates to the profile.
 *                     Only editable fields are touched; immutable fields
 *                     (userId, email*, createdAt) are never overwritten.
 *
 *                     *email is kept read-only in the profile layer; changing
 *                      one's email requires a separate verified flow.
 *
 * Security guarantees
 * ───────────────────
 *  • Every field except _id is encrypted before being written to MongoDB
 *    using the existing encryptSensitiveFields helper (RSA + ECC dual
 *    asymmetric scheme).
 *  • MAC integrity (HMAC-SHA256) is attached to every encrypted envelope
 *    automatically by the storage layer and verified on every read.
 *  • The ownerId passed to the encryption context is always the authenticated
 *    user's MongoDB _id, so each field is encrypted under that user's key.
 *
 * RBAC
 * ────
 *  • Users can only read/write their own profile (enforced at the route
 *    level with requireAuth; service double-checks userId ownership).
 *  • Admins can read any profile via getProfileByUserId (admin-only route).
 */

const mongoose = require('mongoose');

const Profile = require('../models/Profile');
const User    = require('../models/User');

const {
  encryptSensitiveFields,
  decryptSensitiveFields,
} = require('../security/storage');

// ── Helpers ──────────────────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();

const toIdString = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id)  return String(value.id);
    return '';
  }
  return String(value);
};

const cleanOptional = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Build the security context that encryptSensitiveFields / decryptSensitiveFields
 * require for the PROFILE model.
 */
const buildProfileSecurityContext = (userId, profileId) => ({
  ownerId:        String(userId),
  documentId:     String(profileId),
  collectionName: 'profiles',
});

// ── Decrypt a raw Profile document from MongoDB ───────────────────────────────

const decryptProfileDocument = async (encryptedProfile, userId) => {
  if (!encryptedProfile) return null;

  const profileId = toIdString(encryptedProfile._id);

  const decrypted = await decryptSensitiveFields(
    'PROFILE',
    encryptedProfile,
    buildProfileSecurityContext(userId, profileId)
  );

  decrypted._id = profileId;
  decrypted.id  = profileId;

  return decrypted;
};

// ── Decrypt the User document so we can mirror registration fields ─────────────

const decryptUserDocument = async (encryptedUser) => {
  if (!encryptedUser) return null;

  const userId = toIdString(encryptedUser._id);

  const decrypted = await decryptSensitiveFields(
    'USER',
    encryptedUser,
    {
      ownerId:        userId,
      documentId:     userId,
      collectionName: 'users',
    }
  );

  decrypted._id = userId;
  decrypted.id  = userId;

  return decrypted;
};

// ── Build the safe public profile shape returned to callers ───────────────────

const buildPublicProfile = (decryptedProfile) => ({
  id:          decryptedProfile.id || decryptedProfile._id,
  userId:      decryptedProfile.userId,
  username:    decryptedProfile.username    ?? null,
  email:       decryptedProfile.email       ?? null,
  contact:     decryptedProfile.contact     ?? null,
  phone:       decryptedProfile.phone       ?? null,
  fullName:    decryptedProfile.fullName    ?? null,
  address:     decryptedProfile.address     ?? null,
  dateOfBirth: decryptedProfile.dateOfBirth ?? null,
  nid:         decryptedProfile.nid         ?? null,
  createdAt:   decryptedProfile.createdAt   ?? null,
  updatedAt:   decryptedProfile.updatedAt   ?? null,
});

// ── Auto-create a Profile from User data on first access ─────────────────────

const createProfileFromUser = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }

  const encryptedUser = await User.findById(userId).lean();

  if (!encryptedUser) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const decryptedUser = await decryptUserDocument(encryptedUser);

  const profileId  = new mongoose.Types.ObjectId().toString();
  const timestamp  = nowIso();

  const profilePlain = {
    _id:         profileId,
    userId:      userId,
    username:    decryptedUser.username  ?? null,
    email:       decryptedUser.email     ?? null,
    contact:     decryptedUser.contact   ?? null,
    phone:       decryptedUser.phone     ?? null,
    fullName:    decryptedUser.fullName  ?? null,
    address:     null,
    dateOfBirth: null,
    nid:         null,
    createdAt:   timestamp,
    updatedAt:   timestamp,
  };

  const encryptedProfile = await encryptSensitiveFields(
    'PROFILE',
    profilePlain,
    buildProfileSecurityContext(userId, profileId)
  );

  const saved = await Profile.create(encryptedProfile);

  return decryptProfileDocument(saved.toObject(), userId);
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getMyProfile
 *
 * Returns the authenticated user's profile, creating it automatically if it
 * does not yet exist (first-login auto-provision).
 *
 * @param {string} userId – Authenticated user's _id (from req.user.id).
 * @returns {object} Decrypted public profile shape.
 */
const getMyProfile = async (userId) => {
  const cleanUserId = String(userId || '').trim();

  if (!cleanUserId || !mongoose.Types.ObjectId.isValid(cleanUserId)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }

  // We cannot query by userId directly because userId is encrypted.
  // Strategy: scan all profiles and decrypt each until we find the match.
  // (Acceptable for this lab project; production would use a lookup-hash index.)
  const allEncryptedProfiles = await Profile.find({}).lean();

  for (let i = 0; i < allEncryptedProfiles.length; i += 1) {
    const encProf = allEncryptedProfiles[i];
    const profileDocId = toIdString(encProf._id);

    let decProf;
    try {
      decProf = await decryptProfileDocument(encProf, cleanUserId);
    } catch (_err) {
      // Decrypt failed with this userId — not this user's profile; skip.
      continue;
    }

    if (String(decProf.userId) === cleanUserId) {
      return buildPublicProfile(decProf);
    }
  }

  // No profile found — auto-create from the User document.
  const newProfile = await createProfileFromUser(cleanUserId);
  return buildPublicProfile(newProfile);
};

/**
 * updateMyProfile
 *
 * Applies a partial update to the authenticated user's profile.
 * Only permitted editable fields are written; everything else is ignored.
 *
 * @param {string} userId  – Authenticated user's _id (req.user.id).
 * @param {object} updates – Partial update payload from the request body.
 * @returns {object} Updated decrypted public profile shape.
 */
const updateMyProfile = async (userId, updates) => {
  const cleanUserId = String(userId || '').trim();

  if (!cleanUserId || !mongoose.Types.ObjectId.isValid(cleanUserId)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }

  // Locate the existing profile (scan + decrypt, same as getMyProfile).
  const allEncryptedProfiles = await Profile.find({}).lean();

  let targetEncryptedProfile = null;
  let targetDecryptedProfile = null;

  for (let i = 0; i < allEncryptedProfiles.length; i += 1) {
    const encProf = allEncryptedProfiles[i];

    let decProf;
    try {
      decProf = await decryptProfileDocument(encProf, cleanUserId);
    } catch (_err) {
      continue;
    }

    if (String(decProf.userId) === cleanUserId) {
      targetEncryptedProfile = encProf;
      targetDecryptedProfile = decProf;
      break;
    }
  }

  // Auto-provision if the profile has never been created.
  if (!targetDecryptedProfile) {
    const newProfile = await createProfileFromUser(cleanUserId);
    // Reload the raw document so we can update it below.
    const rawSaved = await Profile.findById(newProfile.id).lean();
    targetEncryptedProfile = rawSaved;
    targetDecryptedProfile = newProfile;
  }

  // ── Apply only the editable fields ────────────────────────────────────────
  // Immutable fields: userId, email, createdAt.
  // We intentionally do NOT allow changing email here.
  const EDITABLE_FIELDS = [
    'username',
    'contact',
    'phone',
    'fullName',
    'address',
    'dateOfBirth',
    'nid',
  ];

  let hasChanges = false;
  const updatedPlain = { ...targetDecryptedProfile };

  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      const incoming = cleanOptional(updates[field]);
      if (incoming !== updatedPlain[field]) {
        updatedPlain[field] = incoming;
        hasChanges = true;
      }
    }
  }

  if (!hasChanges) {
    // Nothing changed — return the current profile as-is.
    return buildPublicProfile(targetDecryptedProfile);
  }

  updatedPlain.updatedAt = nowIso();

  const profileId = toIdString(targetEncryptedProfile._id);

  const encryptedUpdated = await encryptSensitiveFields(
    'PROFILE',
    updatedPlain,
    buildProfileSecurityContext(cleanUserId, profileId)
  );

  await Profile.findByIdAndUpdate(
    profileId,
    { $set: encryptedUpdated },
    { new: false }
  );

  return buildPublicProfile(updatedPlain);
};

/**
 * getProfileByUserId  (Admin-only)
 *
 * Retrieves and decrypts any user's profile.
 * This endpoint is only reachable via the admin-guarded route.
 *
 * @param {string} targetUserId – The user whose profile is requested.
 * @param {string} requesterId  – The admin's user id (for audit purposes).
 * @returns {object} Decrypted public profile shape.
 */
const getProfileByUserId = async (targetUserId, requesterId) => {
  const cleanTargetId = String(targetUserId || '').trim();

  if (!cleanTargetId || !mongoose.Types.ObjectId.isValid(cleanTargetId)) {
    const err = new Error('Invalid target user id');
    err.statusCode = 400;
    throw err;
  }

  const allEncryptedProfiles = await Profile.find({}).lean();

  for (let i = 0; i < allEncryptedProfiles.length; i += 1) {
    const encProf = allEncryptedProfiles[i];

    let decProf;
    try {
      decProf = await decryptProfileDocument(encProf, cleanTargetId);
    } catch (_err) {
      continue;
    }

    if (String(decProf.userId) === cleanTargetId) {
      return buildPublicProfile(decProf);
    }
  }

  // Auto-provision if not found (admin view should still show something useful).
  const newProfile = await createProfileFromUser(cleanTargetId);
  return buildPublicProfile(newProfile);
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  getProfileByUserId,
};
