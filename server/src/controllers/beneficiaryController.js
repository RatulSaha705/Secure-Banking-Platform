'use strict';

/**
 * server/src/controllers/beneficiaryController.js
 *
 * Feature 11 — Beneficiary Management HTTP layer.
 *
 * Handlers
 * ────────
 *   listHandler   – GET    /api/beneficiary
 *   addHandler    – POST   /api/beneficiary
 *   updateHandler – PATCH  /api/beneficiary/:id
 *   deleteHandler – DELETE /api/beneficiary/:id
 */

const {
  getMyBeneficiaries,
  addBeneficiary,
  updateBeneficiary,
  deleteBeneficiary,
} = require('../services/beneficiaryService');

const logger = require('../utils/logger');

const sendError = (res, err) =>
  res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Server error' });

// ── GET /api/beneficiary ──────────────────────────────────────────────────────

const listHandler = async (req, res, next) => {
  try {
    const result = await getMyBeneficiaries(req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

// ── POST /api/beneficiary ─────────────────────────────────────────────────────

const addHandler = async (req, res, next) => {
  try {
    const beneficiary = await addBeneficiary(req.user.id, req.body);
    logger.info(`Beneficiary added by user ${req.user.id}: ${beneficiary.beneficiaryAccountNumber}`);
    return res.status(201).json({
      success: true,
      message: 'Beneficiary saved successfully.',
      data:    beneficiary,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

// ── PATCH /api/beneficiary/:id ────────────────────────────────────────────────

const updateHandler = async (req, res, next) => {
  try {
    const updated = await updateBeneficiary(req.user.id, req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: 'Beneficiary updated successfully.',
      data:    updated,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

// ── DELETE /api/beneficiary/:id ───────────────────────────────────────────────

const deleteHandler = async (req, res, next) => {
  try {
    const result = await deleteBeneficiary(req.user.id, req.params.id);
    logger.info(`Beneficiary ${req.params.id} deleted by user ${req.user.id}`);
    return res.status(200).json({
      success: true,
      message: 'Beneficiary removed.',
      data:    result,
    });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
};

module.exports = { listHandler, addHandler, updateHandler, deleteHandler };
