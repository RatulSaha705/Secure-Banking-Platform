'use strict';

/**
 * server/src/controllers/keyController.js
 *
 * Admin-facing controller for Feature 17 Key Management.
 *
 * Security rule:
 *   API responses must never return private keys or .env private-key lines.
 */

const keyService = require('../security/key-management/key-manager');

const sendSuccess = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const listKeys = async (req, res, next) => {
  try {
    const keys = await keyService.listKeyRecords(req.query);

    return sendSuccess(res, 200, 'Key records fetched successfully', {
      keys: keys.map(keyService.sanitizeKeyRecord),
    });
  } catch (error) {
    return next(error);
  }
};

const createKey = async (req, res, next) => {
  try {
    const result = await keyService.createKeyRecordWithEnvValue({
      algorithm: req.body.algorithm,
      purpose: req.body.purpose,
      ownerUserId: req.body.ownerUserId || null,
      status: req.body.status || 'ACTIVE',
      persistToEnvFile: true,
      notes: req.body.notes || '',
      rsaKeySizeBits: req.body.rsaKeySizeBits || 1024,
      rsaRounds: req.body.rsaRounds || 40,
    });

    return sendSuccess(res, 201, 'Key created successfully', {
      key: keyService.sanitizeKeyRecord(result.keyRecord),
      privateKeyStorage: 'server-env',
      warning: 'Private key material was stored server-side and was not returned in this response.',
    });
  } catch (error) {
    return next(error);
  }
};

const rotateKey = async (req, res, next) => {
  try {
    const result = await keyService.rotateKey({
      algorithm: req.body.algorithm,
      purpose: req.body.purpose,
      ownerUserId: req.body.ownerUserId || null,
      persistToEnvFile: true,
      notes: req.body.notes || '',
      rsaKeySizeBits: req.body.rsaKeySizeBits || 1024,
      rsaRounds: req.body.rsaRounds || 40,
    });

    return sendSuccess(res, 201, 'Key rotated successfully', {
      key: keyService.sanitizeKeyRecord(result.keyRecord),
      privateKeyStorage: 'server-env',
      warning: 'Old encrypted records still need old private keys for decryption.',
    });
  } catch (error) {
    return next(error);
  }
};

const retireKey = async (req, res, next) => {
  try {
    const key = await keyService.retireKey(
      req.params.keyId,
      req.body.notes || 'Retired by admin'
    );

    return sendSuccess(res, 200, 'Key retired successfully', {
      key: keyService.sanitizeKeyRecord(key),
    });
  } catch (error) {
    return next(error);
  }
};

const markKeyCompromised = async (req, res, next) => {
  try {
    const key = await keyService.markKeyCompromised(
      req.params.keyId,
      req.body.notes || 'Marked compromised by admin'
    );

    return sendSuccess(res, 200, 'Key marked as compromised', {
      key: keyService.sanitizeKeyRecord(key),
    });
  } catch (error) {
    return next(error);
  }
};

const ensureInitialKeys = async (req, res, next) => {
  try {
    const result = await keyService.ensureInitialKeySet({
      rsaKeySizeBits: req.body.rsaKeySizeBits || 1024,
      rsaRounds: req.body.rsaRounds || 40,
      persistToEnvFile: true,
    });

    return sendSuccess(res, 201, 'Initial system key set checked/generated', {
      created: result.created.map(keyService.sanitizeKeyRecord),
      existing: result.existing.map(keyService.sanitizeKeyRecord),
      updatedEnvVars: result.updatedEnvVars,
      privateKeyStorage: 'server-env',
      warning: 'Private key material was stored server-side and was not returned in this response.',
    });
  } catch (error) {
    return next(error);
  }
};

const ensureUserKeys = async (req, res, next) => {
  try {
    const result = await keyService.ensureUserKeySet({
      ownerUserId: req.body.ownerUserId,
      rsaKeySizeBits: req.body.rsaKeySizeBits || 1024,
      rsaRounds: req.body.rsaRounds || 40,
      persistToEnvFile: true,
    });

    return sendSuccess(res, 201, 'User key set checked/generated', {
      created: result.created.map(keyService.sanitizeKeyRecord),
      existing: result.existing.map(keyService.sanitizeKeyRecord),
      updatedEnvVars: result.updatedEnvVars,
      privateKeyStorage: 'server-env',
      warning:
        result.created.length > 0
          ? 'Private keys were stored server-side and were not returned in this response.'
          : 'User already has the required active keys.',
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listKeys,
  createKey,
  rotateKey,
  retireKey,
  markKeyCompromised,
  ensureInitialKeys,
  ensureUserKeys,
};