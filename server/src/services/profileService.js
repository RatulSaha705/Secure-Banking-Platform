'use strict';

/**
 * server/src/services/profileService.js
 *
 * Profile Management Service — Feature 6.
 *
 * getMyProfile     – Return the authenticated user's decrypted profile.
 *                    Auto-creates a Profile document from the User record
 *                    on first access.
 *
 * updateMyProfile  – Apply partial updates to the profile.
 *                    Immutable fields (userId, email, createdAt) are never
 *                    overwritten.
 *
 * getProfileByUserId – Admin-only: read any user's profile.
 *
 * Security: Every field except _id is encrypted (RSA + ECC dual-asymmetric)
 * before write; HMAC-SHA256 MAC is auto-attached by the storage layer.
 */

const mongoose = require('mongoose');

const Profile = require('../models/Profile');
const User    = require('../models/User');

const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/secure-storage');
const { nowIso, toIdString, cleanOptional, buildSecCtx } = require('../utils/serviceHelpers');

// ── Helpers ───────────────────────────────────────────────────────────────────

const profileCtx = (userId, profileId) => buildSecCtx('profiles', userId, profileId);

const decryptProfileDocument = async (encProfile, userId) => {
  if (!encProfile) return null;
  const profileId = toIdString(encProfile._id);
  const dec = await decryptSensitiveFields('PROFILE', encProfile, profileCtx(userId, profileId));
  dec._id = profileId;
  dec.id  = profileId;
  return dec;
};

const decryptUserDocument = async (encUser) => {
  if (!encUser) return null;
  const uid = toIdString(encUser._id);
  const dec = await decryptSensitiveFields('USER', encUser, {
    ownerId: uid, documentId: uid, collectionName: 'users',
  });
  dec._id = uid;
  dec.id  = uid;
  return dec;
};

const buildPublicProfile = (dec) => ({
  id:          dec.id || dec._id,
  userId:      dec.userId,
  username:    dec.username    ?? null,
  email:       dec.email       ?? null,
  contact:     dec.contact     ?? null,
  phone:       dec.phone       ?? null,
  fullName:    dec.fullName    ?? null,
  address:     dec.address     ?? null,
  dateOfBirth: dec.dateOfBirth ?? null,
  nid:         dec.nid         ?? null,
  createdAt:   dec.createdAt   ?? null,
  updatedAt:   dec.updatedAt   ?? null,
});

const assertValidId = (userId) => {
  const clean = String(userId || '').trim();
  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error('Invalid user id'); err.statusCode = 400; throw err;
  }
  return clean;
};

// ── Scan-and-decrypt (required because userId is encrypted in all docs) ────────

const findProfileForUser = async (userId) => {
  const all = await Profile.find({}).lean();
  for (const enc of all) {
    let dec;
    try { dec = await decryptProfileDocument(enc, userId); } catch { continue; }
    if (String(dec.userId) === userId) return { enc, dec };
  }
  return null;
};

// ── Auto-provision ────────────────────────────────────────────────────────────

const createProfileFromUser = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const err = new Error('Invalid user id'); err.statusCode = 400; throw err;
  }
  const encUser = await User.findById(userId).lean();
  if (!encUser) {
    const err = new Error('User not found'); err.statusCode = 404; throw err;
  }
  const user      = await decryptUserDocument(encUser);
  const profileId = new mongoose.Types.ObjectId().toString();
  const timestamp = nowIso();

  const plain = {
    _id:         profileId,
    userId,
    username:    user.username  ?? null,
    email:       user.email     ?? null,
    contact:     user.contact   ?? null,
    phone:       user.phone     ?? null,
    fullName:    user.fullName  ?? null,
    address:     null,
    dateOfBirth: null,
    nid:         null,
    createdAt:   timestamp,
    updatedAt:   timestamp,
  };

  const enc   = await encryptSensitiveFields('PROFILE', plain, profileCtx(userId, profileId));
  const saved = await Profile.create(enc);
  return decryptProfileDocument(saved.toObject(), userId);
};

// ── Public API ────────────────────────────────────────────────────────────────

const getMyProfile = async (userId) => {
  const clean  = assertValidId(userId);
  const found  = await findProfileForUser(clean);
  if (found) return buildPublicProfile(found.dec);
  const fresh = await createProfileFromUser(clean);
  return buildPublicProfile(fresh);
};

const updateMyProfile = async (userId, updates) => {
  const clean = assertValidId(userId);
  let found   = await findProfileForUser(clean);

  if (!found) {
    const newProfile = await createProfileFromUser(clean);
    const rawSaved   = await Profile.findById(newProfile.id).lean();
    found = { enc: rawSaved, dec: newProfile };
  }

  const EDITABLE = ['username', 'contact', 'phone', 'fullName', 'address', 'dateOfBirth', 'nid'];
  let hasChanges  = false;
  const updated   = { ...found.dec };

  for (const field of EDITABLE) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      const incoming = cleanOptional(updates[field]);
      if (incoming !== updated[field]) { updated[field] = incoming; hasChanges = true; }
    }
  }

  if (!hasChanges) return buildPublicProfile(found.dec);

  updated.updatedAt = nowIso();
  const profileId   = toIdString(found.enc._id);
  const encUpdated  = await encryptSensitiveFields('PROFILE', updated, profileCtx(clean, profileId));

  await Profile.findByIdAndUpdate(profileId, { $set: encUpdated }, { new: false });
  return buildPublicProfile(updated);
};

/** Admin-only: retrieve any user's profile by userId. */
const getProfileByUserId = async (targetUserId) => {
  const clean = assertValidId(targetUserId);
  const found  = await findProfileForUser(clean);
  if (found) return buildPublicProfile(found.dec);
  const fresh = await createProfileFromUser(clean);
  return buildPublicProfile(fresh);
};

module.exports = { getMyProfile, updateMyProfile, getProfileByUserId };
