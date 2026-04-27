'use strict';

/**
 * server/src/security/keys/key.service.js
 *
 * Feature 17: Key Management Service
 */

const { CryptoKey, KEY_ALGORITHMS, KEY_PURPOSES, KEY_STATUSES } = require('./key.model');
const { generateRsaKeyPair } = require('../rsa/rsa.keygen');
const { generateEccKeyPair } = require('../ecc/ecc.keygen');

const PRIVATE_KEY_ENV_BY_ALGORITHM = Object.freeze({
  RSA: 'SECURITY_RSA_PRIVATE_KEYS_B64',
  ECC: 'SECURITY_ECC_PRIVATE_KEYS_B64',
});

const KEY_USAGE_BY_PURPOSE = Object.freeze({
  USER_PROFILE: 'Encrypt registration, login display, and profile fields',
  ACCOUNT_DATA: 'Encrypt account number, account type, status, and balance-related fields',
  BENEFICIARY_DATA: 'Encrypt saved beneficiary details',
  TRANSACTION_DATA: 'Encrypt transaction records and transfer-sensitive fields',
  SUPPORT_TICKET: 'Encrypt support ticket / post-equivalent content',
  NOTIFICATION: 'Encrypt sensitive notification body text',
  TEST: 'Testing only',
});

const DEFAULT_INITIAL_KEY_PLANS = Object.freeze([
  { algorithm: 'RSA', purpose: 'USER_PROFILE' },
  { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },
  { algorithm: 'RSA', purpose: 'BENEFICIARY_DATA' },
  { algorithm: 'RSA', purpose: 'TRANSACTION_DATA' },
  { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },
  { algorithm: 'ECC', purpose: 'NOTIFICATION' },
]);

const DATA_TYPE_TO_KEY_PLAN = Object.freeze({
  USER: { algorithm: 'RSA', purpose: 'USER_PROFILE' },
  USER_PROFILE: { algorithm: 'RSA', purpose: 'USER_PROFILE' },
  PROFILE: { algorithm: 'RSA', purpose: 'USER_PROFILE' },

  ACCOUNT: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },
  ACCOUNT_DATA: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },
  ACCOUNT_DETAILS: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },
  BALANCE: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },

  BENEFICIARY: { algorithm: 'RSA', purpose: 'BENEFICIARY_DATA' },
  BENEFICIARY_DATA: { algorithm: 'RSA', purpose: 'BENEFICIARY_DATA' },

  TRANSACTION: { algorithm: 'RSA', purpose: 'TRANSACTION_DATA' },
  TRANSACTION_DATA: { algorithm: 'RSA', purpose: 'TRANSACTION_DATA' },

  SUPPORT_TICKET: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },
  TICKET: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },
  POST: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },

  NOTIFICATION: { algorithm: 'ECC', purpose: 'NOTIFICATION' },
});

const normalizeAlgorithm = (algorithm) => {
  const value = String(algorithm || '').trim().toUpperCase();

  if (!KEY_ALGORITHMS.includes(value)) {
    throw new Error(`Unsupported key algorithm: ${algorithm}`);
  }

  return value;
};

const normalizePurpose = (purpose) => {
  const value = String(purpose || '').trim().toUpperCase();

  if (!KEY_PURPOSES.includes(value)) {
    throw new Error(`Unsupported key purpose: ${purpose}`);
  }

  return value;
};

const normalizeStatus = (status) => {
  const value = String(status || '').trim().toUpperCase();

  if (!KEY_STATUSES.includes(value)) {
    throw new Error(`Unsupported key status: ${status}`);
  }

  return value;
};

const slugify = (value) => String(value)
  .trim()
  .toLowerCase()
  .replace(/_/g, '-')
  .replace(/[^a-z0-9-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const makeKeyId = (algorithm, purpose, version) => {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);
  const normalizedPurpose = normalizePurpose(purpose);

  if (!Number.isInteger(version) || version < 1) {
    throw new RangeError('version must be a positive integer');
  }

  return `${slugify(normalizedAlgorithm)}-${slugify(normalizedPurpose)}-v${version}`;
};

const getPrivateKeyEnvVar = (algorithm) => {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);
  return PRIVATE_KEY_ENV_BY_ALGORITHM[normalizedAlgorithm];
};

const decodePrivateKeyMap = (envValue) => {
  if (!envValue) return {};

  try {
    const json = Buffer.from(String(envValue), 'base64').toString('utf8');
    const parsed = JSON.parse(json);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('decoded value is not a JSON object');
    }

    return parsed;
  } catch (error) {
    throw new Error(`Invalid private-key environment value: ${error.message}`);
  }
};

const encodePrivateKeyMap = (privateKeyMap) => {
  if (!privateKeyMap || typeof privateKeyMap !== 'object' || Array.isArray(privateKeyMap)) {
    throw new TypeError('privateKeyMap must be an object');
  }

  return Buffer.from(JSON.stringify(privateKeyMap), 'utf8').toString('base64');
};

const mergePrivateKeyIntoMap = (currentEnvValue, keyId, privateKey) => {
  const map = decodePrivateKeyMap(currentEnvValue);
  map[keyId] = privateKey;
  return encodePrivateKeyMap(map);
};

const generateKeyMaterial = (algorithm, options = {}) => {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);

  if (normalizedAlgorithm === 'RSA') {
    return generateRsaKeyPair({
      keySizeBits: options.rsaKeySizeBits || options.keySizeBits || 1024,
      rounds: options.rsaRounds || options.rounds || 40,
    });
  }

  if (normalizedAlgorithm === 'ECC') {
    return generateEccKeyPair();
  }

  throw new Error(`Unsupported key algorithm: ${algorithm}`);
};

const getNextVersion = async (algorithm, purpose) => {
  const latest = await CryptoKey.findOne({
    algorithm: normalizeAlgorithm(algorithm),
    purpose: normalizePurpose(purpose),
  })
    .sort({ version: -1 })
    .lean();

  return latest ? latest.version + 1 : 1;
};

const getActiveKeyRecord = async ({ algorithm, purpose }) => {
  return CryptoKey.findOne({
    algorithm: normalizeAlgorithm(algorithm),
    purpose: normalizePurpose(purpose),
    status: 'ACTIVE',
  }).lean();
};

const getKeyRecordById = async (keyId) => {
  const keyRecord = await CryptoKey.findOne({ keyId }).lean();

  if (!keyRecord) {
    throw new Error(`Key not found: ${keyId}`);
  }

  return keyRecord;
};

const getPrivateKeyForRecord = (keyRecord) => {
  const envVar = keyRecord.privateKeyEnvVar || getPrivateKeyEnvVar(keyRecord.algorithm);
  const privateKeyMap = decodePrivateKeyMap(process.env[envVar]);
  const privateKey = privateKeyMap[keyRecord.keyId];

  if (!privateKey) {
    throw new Error(
      `Private key for ${keyRecord.keyId} was not found in ${envVar}. ` +
      'Copy the generated env value into server/.env and restart the backend.'
    );
  }

  return privateKey;
};

const createKeyRecord = async ({
  algorithm,
  purpose,
  status = 'ACTIVE',
  usage,
  notes = '',
  rotatedFromKeyId = null,
  rsaKeySizeBits = 1024,
  rsaRounds = 40,
} = {}) => {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);
  const normalizedPurpose = normalizePurpose(purpose);
  const normalizedStatus = normalizeStatus(status);

  const version = await getNextVersion(normalizedAlgorithm, normalizedPurpose);
  const keyId = makeKeyId(normalizedAlgorithm, normalizedPurpose, version);
  const material = generateKeyMaterial(normalizedAlgorithm, {
    rsaKeySizeBits,
    rsaRounds,
  });

  const privateKeyEnvVar = getPrivateKeyEnvVar(normalizedAlgorithm);

  if (normalizedStatus === 'ACTIVE') {
    await CryptoKey.updateMany(
      {
        algorithm: normalizedAlgorithm,
        purpose: normalizedPurpose,
        status: 'ACTIVE',
      },
      {
        $set: {
          status: 'RETIRED',
          retiredAt: new Date(),
          notes: 'Retired automatically because a newer active key was created.',
        },
      }
    );
  }

  const keyRecord = await CryptoKey.create({
    keyId,
    algorithm: normalizedAlgorithm,
    purpose: normalizedPurpose,
    version,
    status: normalizedStatus,
    publicKey: material.publicKey,
    privateKeyEnvVar,
    usage: usage || KEY_USAGE_BY_PURPOSE[normalizedPurpose] || normalizedPurpose,
    activatedAt: normalizedStatus === 'ACTIVE' ? new Date() : null,
    retiredAt: null,
    rotatedFromKeyId,
    notes,
  });

  return {
    keyRecord: keyRecord.toObject(),
    privateKey: material.privateKey,
    privateKeyEnvVar,
  };
};

const createKeyRecordWithEnvValue = async (input = {}) => {
  const created = await createKeyRecord(input);

  const currentEnvValue = process.env[created.privateKeyEnvVar] || '';
  const newEnvValue = mergePrivateKeyIntoMap(
    currentEnvValue,
    created.keyRecord.keyId,
    created.privateKey
  );

  return {
    keyRecord: created.keyRecord,
    privateKeyEnvVar: created.privateKeyEnvVar,
    privateKeyEnvValue: newEnvValue,
    envLine: `${created.privateKeyEnvVar}=${newEnvValue}`,
  };
};

const rotateKey = async ({
  algorithm,
  purpose,
  notes = '',
  rsaKeySizeBits = 1024,
  rsaRounds = 40,
} = {}) => {
  const oldActive = await getActiveKeyRecord({ algorithm, purpose });

  return createKeyRecordWithEnvValue({
    algorithm,
    purpose,
    status: 'ACTIVE',
    rotatedFromKeyId: oldActive ? oldActive.keyId : null,
    notes: notes || `Rotated from ${oldActive ? oldActive.keyId : 'none'}`,
    rsaKeySizeBits,
    rsaRounds,
  });
};

const retireKey = async (keyId, notes = '') => {
  const updated = await CryptoKey.findOneAndUpdate(
    { keyId },
    {
      $set: {
        status: 'RETIRED',
        retiredAt: new Date(),
        notes,
      },
    },
    { new: true }
  ).lean();

  if (!updated) throw new Error(`Key not found: ${keyId}`);
  return updated;
};

const markKeyCompromised = async (keyId, notes = 'Marked as compromised') => {
  const updated = await CryptoKey.findOneAndUpdate(
    { keyId },
    {
      $set: {
        status: 'COMPROMISED',
        retiredAt: new Date(),
        notes,
      },
    },
    { new: true }
  ).lean();

  if (!updated) throw new Error(`Key not found: ${keyId}`);
  return updated;
};

const listKeyRecords = async (filter = {}) => {
  const query = {};

  if (filter.algorithm) query.algorithm = normalizeAlgorithm(filter.algorithm);
  if (filter.purpose) query.purpose = normalizePurpose(filter.purpose);
  if (filter.status) query.status = normalizeStatus(filter.status);

  return CryptoKey.find(query)
    .select('-__v')
    .sort({ algorithm: 1, purpose: 1, version: -1 })
    .lean();
};

const resolveKeyPlanForDataType = (dataType) => {
  const key = String(dataType || '').trim().toUpperCase();
  const plan = DATA_TYPE_TO_KEY_PLAN[key];

  if (!plan) {
    throw new Error(`No key plan configured for data type: ${dataType}`);
  }

  return plan;
};

const getActiveKeyForDataType = async (dataType) => {
  const plan = resolveKeyPlanForDataType(dataType);
  const active = await getActiveKeyRecord(plan);

  if (!active) {
    throw new Error(
      `No ACTIVE key found for ${dataType}. Create key for ${plan.algorithm}/${plan.purpose} first.`
    );
  }

  return active;
};

const getActiveKeyMaterialForDataType = async (dataType) => {
  const keyRecord = await getActiveKeyForDataType(dataType);
  const privateKey = getPrivateKeyForRecord(keyRecord);

  return {
    keyRecord,
    publicKey: keyRecord.publicKey,
    privateKey,
  };
};

const ensureInitialKeySet = async (options = {}) => {
  const created = [];
  const existing = [];

  const envAccumulator = {
    SECURITY_RSA_PRIVATE_KEYS_B64: process.env.SECURITY_RSA_PRIVATE_KEYS_B64 || '',
    SECURITY_ECC_PRIVATE_KEYS_B64: process.env.SECURITY_ECC_PRIVATE_KEYS_B64 || '',
  };

  for (const plan of DEFAULT_INITIAL_KEY_PLANS) {
    const active = await getActiveKeyRecord(plan);

    if (active) {
      existing.push(active);
      continue;
    }

    const createdRaw = await createKeyRecord({
      algorithm: plan.algorithm,
      purpose: plan.purpose,
      status: 'ACTIVE',
      rsaKeySizeBits: options.rsaKeySizeBits || 1024,
      rsaRounds: options.rsaRounds || 40,
      notes: 'Initial key created by Feature 17 Key Management Module',
    });

    const envVar = createdRaw.privateKeyEnvVar;
    envAccumulator[envVar] = mergePrivateKeyIntoMap(
      envAccumulator[envVar],
      createdRaw.keyRecord.keyId,
      createdRaw.privateKey
    );

    created.push(createdRaw.keyRecord);
  }

  const envLinesToCopy = Object.entries(envAccumulator)
    .filter(([, value]) => Boolean(value))
    .map(([name, value]) => `${name}=${value}`);

  return {
    created,
    existing,
    envLinesToCopy,
    message:
      created.length > 0
        ? 'Copy envLinesToCopy into server/.env and restart the backend.'
        : 'Initial key set already exists.',
  };
};

const sanitizeKeyRecord = (keyRecord) => {
  if (!keyRecord) return keyRecord;

  const safe = { ...keyRecord };
  delete safe.__v;

  if (safe.privateKeyEnvVar) {
    safe.privateKeyStorage = 'backend-env';
    delete safe.privateKeyEnvVar;
  }

  return safe;
};

module.exports = {
  PRIVATE_KEY_ENV_BY_ALGORITHM,
  KEY_USAGE_BY_PURPOSE,
  DEFAULT_INITIAL_KEY_PLANS,
  DATA_TYPE_TO_KEY_PLAN,

  normalizeAlgorithm,
  normalizePurpose,
  normalizeStatus,
  makeKeyId,

  decodePrivateKeyMap,
  encodePrivateKeyMap,
  mergePrivateKeyIntoMap,

  generateKeyMaterial,
  getNextVersion,
  getActiveKeyRecord,
  getKeyRecordById,
  getPrivateKeyForRecord,

  createKeyRecord,
  createKeyRecordWithEnvValue,
  rotateKey,
  retireKey,
  markKeyCompromised,
  listKeyRecords,

  resolveKeyPlanForDataType,
  getActiveKeyForDataType,
  getActiveKeyMaterialForDataType,
  ensureInitialKeySet,
  sanitizeKeyRecord,
};