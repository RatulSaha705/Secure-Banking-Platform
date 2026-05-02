'use strict';

/**
 * server/src/services/beneficiaryService.js
 *
 * Feature 11 — Beneficiary Management.
 *
 * Public API
 * ──────────
 *   getMyBeneficiaries   – List all beneficiaries for a user (decrypted).
 *   addBeneficiary       – Add a new beneficiary; enforces 5-entry cap per user.
 *   updateBeneficiary    – Update name / nickname / phone / email fields.
 *   deleteBeneficiary    – Remove a beneficiary by id (ownership-checked).
 *
 * Security guarantees
 * ───────────────────
 *   • All fields encrypted with encryptSensitiveFields('BENEFICIARY', …) before write.
 *   • HMAC-SHA256 MAC auto-attached by the storage layer on every field.
 *   • Ownership verified on every read and mutating operation: only the
 *     authenticated user's beneficiaries are ever returned or modified.
 *   • Scan-and-decrypt pattern (same as accountService / profileService).
 *     Production would use a lookup-hash index on userId.
 *
 * Limit
 * ─────
 *   MAX_BENEFICIARIES = 5  (enforced in addBeneficiary)
 */

const mongoose = require('mongoose');

const Beneficiary = require('../models/Beneficiary');

const {
  encryptSensitiveFields,
  decryptSensitiveFields,
} = require('../security/storage');

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BENEFICIARIES = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();

const toStr = (v) => {
  if (!v) return '';
  if (typeof v === 'object') return String(v._id || v.id || '');
  return String(v);
};

const buildCtx = (userId, docId) => ({
  ownerId:        String(userId),
  documentId:     String(docId),
  collectionName: 'beneficiaries',
});

// ── Decrypt a single raw Beneficiary document ─────────────────────────────────

const decryptBeneficiary = async (encDoc, userId) => {
  if (!encDoc) return null;
  const docId = toStr(encDoc._id);

  const dec = await decryptSensitiveFields(
    'BENEFICIARY',
    encDoc,
    buildCtx(userId, docId)
  );

  dec._id = docId;
  dec.id  = docId;
  return dec;
};

// ── Safe public shape ─────────────────────────────────────────────────────────

const toPublic = (dec) => ({
  id:                       dec.id || dec._id,
  beneficiaryName:          dec.beneficiaryName          ?? null,
  beneficiaryAccountNumber: dec.beneficiaryAccountNumber ?? null,
  beneficiaryBankName:      dec.beneficiaryBankName      ?? null,
  beneficiaryEmail:         dec.beneficiaryEmail         ?? null,
  beneficiaryPhone:         dec.beneficiaryPhone         ?? null,
  nickname:                 dec.nickname                 ?? null,
  createdAt:                dec.createdAt                ?? null,
  updatedAt:                dec.updatedAt                ?? null,
});

// ── Validate user id helper ───────────────────────────────────────────────────

const assertValidUserId = (userId) => {
  const clean = String(userId || '').trim();
  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }
  return clean;
};

// ── Scan all beneficiaries and return those owned by userId ───────────────────

const scanBeneficiariesForUser = async (userId) => {
  const allEnc = await Beneficiary.find({}).lean();
  const mine   = [];

  for (const encDoc of allEnc) {
    // Fast-path: read the ownerUserId embedded in the first encrypted envelope.
    const firstField = encDoc.userId;
    let ownerId = '';
    if (firstField?.ownerUserId)          ownerId = String(firstField.ownerUserId);
    else if (firstField?.metadata?.ownerId) ownerId = String(firstField.metadata.ownerId);

    if (ownerId !== userId) continue;

    let dec;
    try {
      dec = await decryptBeneficiary(encDoc, userId);
    } catch (_err) {
      continue;
    }

    if (String(dec.userId) === userId) {
      mine.push({ raw: encDoc, dec });
    }
  }

  return mine;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getMyBeneficiaries
 *
 * Returns all decrypted beneficiaries for the authenticated user, sorted
 * newest-first.
 *
 * @param {string} userId
 * @returns {{ beneficiaries: object[], count: number, limit: number }}
 */
const getMyBeneficiaries = async (userId) => {
  const clean = assertValidUserId(userId);
  const mine  = await scanBeneficiariesForUser(clean);

  const list = mine
    .map(({ dec }) => toPublic(dec))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { beneficiaries: list, count: list.length, limit: MAX_BENEFICIARIES };
};

/**
 * addBeneficiary
 *
 * Adds a beneficiary for the user, enforcing the 5-entry cap.
 * Duplicate account numbers (already saved) are rejected.
 *
 * @param {string} userId
 * @param {object} payload – { beneficiaryName, beneficiaryAccountNumber, nickname?, beneficiaryBankName?, beneficiaryEmail?, beneficiaryPhone? }
 */
const addBeneficiary = async (userId, payload) => {
  const clean = assertValidUserId(userId);

  const {
    beneficiaryName,
    beneficiaryAccountNumber,
    nickname          = null,
    beneficiaryBankName = null,
    beneficiaryEmail  = null,
    beneficiaryPhone  = null,
  } = payload || {};

  // ── Input validation ──────────────────────────────────────────────────────

  if (!beneficiaryName || !String(beneficiaryName).trim()) {
    const err = new Error('Beneficiary name is required');
    err.statusCode = 400;
    throw err;
  }

  if (!beneficiaryAccountNumber || !String(beneficiaryAccountNumber).trim()) {
    const err = new Error('Beneficiary account number is required');
    err.statusCode = 400;
    throw err;
  }

  // ── Check cap and duplicates ──────────────────────────────────────────────

  const mine = await scanBeneficiariesForUser(clean);

  if (mine.length >= MAX_BENEFICIARIES) {
    const err = new Error(
      `You can save a maximum of ${MAX_BENEFICIARIES} beneficiaries. Please remove one before adding another.`
    );
    err.statusCode = 422;
    throw err;
  }

  const normalise = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

  const duplicate = mine.find(
    ({ dec }) =>
      normalise(dec.beneficiaryAccountNumber) === normalise(beneficiaryAccountNumber)
  );

  if (duplicate) {
    const err = new Error('This account number is already saved as a beneficiary');
    err.statusCode = 409;
    throw err;
  }

  // ── Encrypt and save ──────────────────────────────────────────────────────

  const docId    = new mongoose.Types.ObjectId().toString();
  const timestamp = nowIso();

  const plain = {
    _id:                      docId,
    userId:                   clean,
    beneficiaryName:          String(beneficiaryName).trim(),
    beneficiaryAccountNumber: String(beneficiaryAccountNumber).trim(),
    beneficiaryBankName:      beneficiaryBankName ? String(beneficiaryBankName).trim() : null,
    beneficiaryEmail:         beneficiaryEmail    ? String(beneficiaryEmail).trim()    : null,
    beneficiaryPhone:         beneficiaryPhone    ? String(beneficiaryPhone).trim()    : null,
    nickname:                 nickname            ? String(nickname).trim()            : null,
    createdAt:                timestamp,
    updatedAt:                timestamp,
  };

  const encrypted = await encryptSensitiveFields(
    'BENEFICIARY',
    plain,
    buildCtx(clean, docId)
  );

  const saved = await Beneficiary.create(encrypted);
  const dec   = await decryptBeneficiary(saved.toObject(), clean);

  return toPublic(dec);
};

/**
 * updateBeneficiary
 *
 * Updates editable fields: beneficiaryName, nickname, beneficiaryPhone,
 * beneficiaryEmail, beneficiaryBankName.
 *
 * @param {string} userId
 * @param {string} beneficiaryId
 * @param {object} updates
 */
const updateBeneficiary = async (userId, beneficiaryId, updates) => {
  const clean   = assertValidUserId(userId);
  const cleanId = String(beneficiaryId || '').trim();

  if (!cleanId || !mongoose.Types.ObjectId.isValid(cleanId)) {
    const err = new Error('Invalid beneficiary id');
    err.statusCode = 400;
    throw err;
  }

  // Find and ownership-check.
  const encDoc = await Beneficiary.findById(cleanId).lean();
  if (!encDoc) {
    const err = new Error('Beneficiary not found');
    err.statusCode = 404;
    throw err;
  }

  let dec;
  try {
    dec = await decryptBeneficiary(encDoc, clean);
  } catch (_err) {
    const err = new Error('Beneficiary not found');
    err.statusCode = 404;
    throw err;
  }

  if (String(dec.userId) !== clean) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  // Build updated plain object (only allowed editable fields).
  const updatedPlain = {
    beneficiaryName:     updates.beneficiaryName     ?? dec.beneficiaryName,
    nickname:            updates.nickname            ?? dec.nickname,
    beneficiaryPhone:    updates.beneficiaryPhone    ?? dec.beneficiaryPhone,
    beneficiaryEmail:    updates.beneficiaryEmail    ?? dec.beneficiaryEmail,
    beneficiaryBankName: updates.beneficiaryBankName ?? dec.beneficiaryBankName,
    updatedAt:           nowIso(),
  };

  const encPartial = await encryptSensitiveFields(
    'BENEFICIARY',
    updatedPlain,
    buildCtx(clean, cleanId)
  );

  await Beneficiary.findByIdAndUpdate(cleanId, { $set: encPartial });

  // Return fresh decrypted view.
  const refreshed = await Beneficiary.findById(cleanId).lean();
  const decRefresh = await decryptBeneficiary(refreshed, clean);
  return toPublic(decRefresh);
};

/**
 * deleteBeneficiary
 *
 * Removes a beneficiary (ownership-checked).
 *
 * @param {string} userId
 * @param {string} beneficiaryId
 */
const deleteBeneficiary = async (userId, beneficiaryId) => {
  const clean   = assertValidUserId(userId);
  const cleanId = String(beneficiaryId || '').trim();

  if (!cleanId || !mongoose.Types.ObjectId.isValid(cleanId)) {
    const err = new Error('Invalid beneficiary id');
    err.statusCode = 400;
    throw err;
  }

  const encDoc = await Beneficiary.findById(cleanId).lean();
  if (!encDoc) {
    const err = new Error('Beneficiary not found');
    err.statusCode = 404;
    throw err;
  }

  let dec;
  try {
    dec = await decryptBeneficiary(encDoc, clean);
  } catch (_err) {
    const err = new Error('Beneficiary not found');
    err.statusCode = 404;
    throw err;
  }

  if (String(dec.userId) !== clean) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  await Beneficiary.findByIdAndDelete(cleanId);
  return { deleted: true, id: cleanId };
};

module.exports = {
  getMyBeneficiaries,
  addBeneficiary,
  updateBeneficiary,
  deleteBeneficiary,
  MAX_BENEFICIARIES,
};
