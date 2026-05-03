'use strict';

/**
 * server/src/services/beneficiaryService.js
 *
 * Feature 11 — Beneficiary Management.
 *
 * getMyBeneficiaries  – List all beneficiaries for a user (decrypted, newest-first).
 * addBeneficiary      – Add; enforces 5-entry cap + duplicate-account check.
 * updateBeneficiary   – Update name / nickname / phone / email / bankName.
 * deleteBeneficiary   – Remove (ownership-checked).
 *
 * Security: All fields encrypted (dual-asymmetric RSA+ECC) before write.
 * HMAC-SHA256 MAC auto-attached by storage layer on every field.
 */

const mongoose = require('mongoose');

const Beneficiary = require('../models/Beneficiary');

const { encryptSensitiveFields, decryptSensitiveFields } = require('../security/secure-storage');
const { nowIso, toIdString, buildSecCtx } = require('../utils/serviceHelpers');

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BENEFICIARIES = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

const benefCtx = (userId, docId) => buildSecCtx('beneficiaries', userId, docId);

const normalise = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

const assertValidId = (userId) => {
  const clean = String(userId || '').trim();
  if (!clean || !mongoose.Types.ObjectId.isValid(clean)) {
    const err = new Error('Invalid user id'); err.statusCode = 400; throw err;
  }
  return clean;
};

const decryptBeneficiary = async (enc, userId) => {
  if (!enc) return null;
  const docId = toIdString(enc._id);
  const dec   = await decryptSensitiveFields('BENEFICIARY', enc, benefCtx(userId, docId));
  dec._id = docId;
  dec.id  = docId;
  return dec;
};

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

// ── Scan-and-decrypt (fast-path using ownerUserId in the encrypted envelope) ───

const scanBeneficiariesForUser = async (userId) => {
  const all  = await Beneficiary.find({}).lean();
  const mine = [];

  for (const enc of all) {
    // Fast-path: read ownerUserId embedded in the envelope metadata so we can
    // skip documents that obviously belong to a different user before decrypting.
    const ff = enc.userId;
    let ownerId = '';
    if (ff?.ownerUserId)          ownerId = String(ff.ownerUserId);
    else if (ff?.metadata?.ownerId) ownerId = String(ff.metadata.ownerId);
    if (ownerId !== userId) continue;

    let dec;
    try { dec = await decryptBeneficiary(enc, userId); } catch { continue; }
    if (String(dec.userId) === userId) mine.push({ raw: enc, dec });
  }
  return mine;
};

// ── Public API ────────────────────────────────────────────────────────────────

const getMyBeneficiaries = async (userId) => {
  const clean = assertValidId(userId);
  const mine  = await scanBeneficiariesForUser(clean);
  const list  = mine
    .map(({ dec }) => toPublic(dec))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { beneficiaries: list, count: list.length, limit: MAX_BENEFICIARIES };
};

const addBeneficiary = async (userId, payload) => {
  const clean = assertValidId(userId);
  const {
    beneficiaryName,
    beneficiaryAccountNumber,
    nickname           = null,
    beneficiaryBankName = null,
    beneficiaryEmail   = null,
    beneficiaryPhone   = null,
  } = payload || {};

  if (!beneficiaryName || !String(beneficiaryName).trim()) {
    const err = new Error('Beneficiary name is required'); err.statusCode = 400; throw err;
  }
  if (!beneficiaryAccountNumber || !String(beneficiaryAccountNumber).trim()) {
    const err = new Error('Beneficiary account number is required'); err.statusCode = 400; throw err;
  }

  const mine = await scanBeneficiariesForUser(clean);

  if (mine.length >= MAX_BENEFICIARIES) {
    const err = new Error(
      `You can save a maximum of ${MAX_BENEFICIARIES} beneficiaries. Please remove one before adding another.`
    );
    err.statusCode = 422; throw err;
  }

  if (mine.find(({ dec }) => normalise(dec.beneficiaryAccountNumber) === normalise(beneficiaryAccountNumber))) {
    const err = new Error('This account number is already saved as a beneficiary');
    err.statusCode = 409; throw err;
  }

  const docId     = new mongoose.Types.ObjectId().toString();
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

  const saved = await Beneficiary.create(
    await encryptSensitiveFields('BENEFICIARY', plain, benefCtx(clean, docId))
  );
  return toPublic(await decryptBeneficiary(saved.toObject(), clean));
};

const updateBeneficiary = async (userId, beneficiaryId, updates) => {
  const clean   = assertValidId(userId);
  const cleanId = String(beneficiaryId || '').trim();

  if (!cleanId || !mongoose.Types.ObjectId.isValid(cleanId)) {
    const err = new Error('Invalid beneficiary id'); err.statusCode = 400; throw err;
  }

  const enc = await Beneficiary.findById(cleanId).lean();
  if (!enc) { const err = new Error('Beneficiary not found'); err.statusCode = 404; throw err; }

  let dec;
  try { dec = await decryptBeneficiary(enc, clean); } catch {
    const err = new Error('Beneficiary not found'); err.statusCode = 404; throw err;
  }

  if (String(dec.userId) !== clean) {
    const err = new Error('Access denied'); err.statusCode = 403; throw err;
  }

  const updatedFields = {
    beneficiaryName:     updates.beneficiaryName     ?? dec.beneficiaryName,
    nickname:            updates.nickname            ?? dec.nickname,
    beneficiaryPhone:    updates.beneficiaryPhone    ?? dec.beneficiaryPhone,
    beneficiaryEmail:    updates.beneficiaryEmail    ?? dec.beneficiaryEmail,
    beneficiaryBankName: updates.beneficiaryBankName ?? dec.beneficiaryBankName,
    updatedAt:           nowIso(),
  };

  await Beneficiary.findByIdAndUpdate(
    cleanId,
    { $set: await encryptSensitiveFields('BENEFICIARY', updatedFields, benefCtx(clean, cleanId)) }
  );

  const refreshed = await Beneficiary.findById(cleanId).lean();
  return toPublic(await decryptBeneficiary(refreshed, clean));
};

const deleteBeneficiary = async (userId, beneficiaryId) => {
  const clean   = assertValidId(userId);
  const cleanId = String(beneficiaryId || '').trim();

  if (!cleanId || !mongoose.Types.ObjectId.isValid(cleanId)) {
    const err = new Error('Invalid beneficiary id'); err.statusCode = 400; throw err;
  }

  const enc = await Beneficiary.findById(cleanId).lean();
  if (!enc) { const err = new Error('Beneficiary not found'); err.statusCode = 404; throw err; }

  let dec;
  try { dec = await decryptBeneficiary(enc, clean); } catch {
    const err = new Error('Beneficiary not found'); err.statusCode = 404; throw err;
  }

  if (String(dec.userId) !== clean) {
    const err = new Error('Access denied'); err.statusCode = 403; throw err;
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
