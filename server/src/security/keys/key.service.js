'use strict';

/**
 * security/keys/key.service.js
 *
 * Key management service for the secure banking project.
 *
 * Responsibilities:
 *   - generate RSA/ECC key pairs
 *   - store public key metadata in MongoDB
 *   - keep private keys outside MongoDB in backend .env variables
 *   - return active public keys for encryption
 *   - return private keys from .env for decryption
 *   - rotate keys by retiring the old active key and creating a new one
 *
 * Private key storage format:
 *
 *   SECURITY_RSA_PRIVATE_KEYS_B64=<base64 JSON map>
 *   SECURITY_ECC_PRIVATE_KEYS_B64=<base64 JSON map>
 *
 * Example decoded map:
 *   {
 *     "rsa-user-profile-v1": { "algorithm": "RSA", "n": "...", "d": "..." },
 *     "rsa-account-data-v1": { "algorithm": "RSA", "n": "...", "d": "..." }
 *   }
 */

const { CryptoKey, KEY_ALGORITHMS, KEY_PURPOSES } = require('./key.model');
const { generateRsaKeyPair } = require('../rsa/rsa.keygen');
const { generateEccKeyPair } = require('../ecc/ecc.keygen');

const PRIVATE_KEY_ENV_BY_ALGORITHM = Object.freeze({
  RSA: 'SECURITY_RSA_PRIVATE_KEYS_B64',
  ECC: 'SECURITY_ECC_PRIVATE_KEYS_B64',
});

const DEFAULT_KEY_PLANS = Object.freeze([
  {
    algorithm: 'RSA',
    purpose: 'USER_PROFILE',
    description: 'Registration, login display fields, and profile data',
  },
  {
    algorithm: 'RSA',
    purpose: 'ACCOUNT_DATA',
    description: 'Account number, account type, status, and balance-related sensitive fields',
  },
  {
    algorithm: 'RSA',
    purpose: 'BENEFICIARY_DATA',
    description: 'Saved transfer beneficiary details',
  },
  {
    algorithm: 'ECC',
    purpose: 'SUPPORT_TICKET',
    description: 'Post-equivalent support ticket content',
  },
  {
    algorithm: 'ECC',
    purpose: 'NOTIFICATION',
    description: 'Sensitive notification or alert body text',
  },
]);

const DATA_TYPE_TO_KEY_PURPOSE = Object.freeze({
  USER: { algorithm: 'RSA', purpose: 'USER_PROFILE' },
  USER_PROFILE: { algorithm: 'RSA', purpose: 'USER_PROFILE' },
  PROFILE: { algorithm: 'RSA', purpose: 'USER_PROFILE' },

  ACCOUNT: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },
  ACCOUNT_DETAILS: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },
  BALANCE: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },

  BENEFICIARY: { algorithm: 'RSA', purpose: 'BENEFICIARY_DATA' },

  SUPPORT_TICKET: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },
  TICKET: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },
  POST: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },

  TRANSACTION: { algorithm: 'RSA', purpose: 'TRANSACTION_DATA' },
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

const slugify = (value) => {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

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

const encodePrivateKeyMap = (privateKeyMap) => {
  if (!privateKeyMap || typeof privateKeyMap !== 'object' || Array.isArray(privateKeyMap)) {
    throw new TypeError('privateKeyMap must be an object');
  }

  return Buffer.from(JSON.stringify(privateKeyMap), 'utf8').toString('base64');
};

const decodePrivateKeyMap = (envValue) => {
  if (!envValue) return {};

  if (typeof envValue !== 'string') {
    throw new TypeError('private key environment value must be a base64 string');
  }

  try {
    const json = Buffer.from(envValue, 'base64').toString('utf8');
    const parsed = JSON.parse(json);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('decoded value is not an object map');
    }

    return parsed;
  } catch (error) {
    throw new Error(`Invalid private key environment value: ${error.message}`);
  }
};

const addPrivateKeyToEnvValue = (currentEnvValue, keyId, privateKey) => {
  if (!keyId || typeof keyId !== 'string') {
    throw new TypeError('keyId must be a non-empty string');
  }

  if (!privateKey || typeof privateKey !== 'object') {
    throw new TypeError('privateKey must be an object');
  }

  const map = decodePrivateKeyMap(currentEnvValue);
  map[keyId] = privateKey;
  return encodePrivateKeyMap(map);
};

const buildPrivateKeyEnvLine = ({ algorithm, keyId, privateKey, currentEnvValue }) => {
  const envVar = getPrivateKeyEnvVar(algorithm);
  const envValue = addPrivateKeyToEnvValue(currentEnvValue || process.env[envVar], keyId, privateKey);

  return {
    envVar,
    envValue,
    envLine: `${envVar}=${envValue}`,
  };
};

const generateKeyMaterial = (algorithm, options = {}) => {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);

  if (normalizedAlgorithm === 'RSA') {
    return generateRsaKeyPair({
      keySizeBits: options.keySizeBits || 1024,
      rounds: options.rounds || 40,
    });
  }

  if (normalizedAlgorithm === 'ECC') {
    return generateEccKeyPair();
  }

  throw new Error(`Unsupported key algorithm: ${algorithm}`);
};

const getNextVersion = async (algorithm, purpose) => {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);
  const normalizedPurpose = normalizePurpose(purpose);

  const latestKey = await CryptoKey.findOne({
    algorithm: normalizedAlgorithm,
    purpose: normalizedPurpose,
  })
    .sort({ version: -1 })
    .lean();

  return latestKey ? latestKey.version + 1 : 1;
};

const getActiveKeyRecord = async ({ algorithm, purpose }) => {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);
  const normalizedPurpose = normalizePurpose(purpose);

  return CryptoKey.findOne({
    algorithm: normalizedAlgorithm,
    purpose: normalizedPurpose,
    status: 'ACTIVE',
  }).lean();
};

const getKeyRecordById = async (keyId) => {
  if (!keyId || typeof keyId !== 'string') {
    throw new TypeError('keyId must be a non-empty string');
  }

  const record = await CryptoKey.findOne({ keyId }).lean();

  if (!record) {
    throw new Error(`Key record not found: ${keyId}`);
  }

  return record;
};

const getPrivateKeyForRecord = (keyRecord) => {
  if (!keyRecord || typeof keyRecord !== 'object') {
    throw new TypeError('keyRecord must be an object');
  }

  const envVar = keyRecord.privateKeyEnvVar || getPrivateKeyEnvVar(keyRecord.algorithm);
  const map = decodePrivateKeyMap(process.env[envVar]);
  const privateKey = map[keyRecord.keyId];

  if (!privateKey) {
    throw new Error(
      `Private key for ${keyRecord.keyId} was not found in ${envVar}. ` +
      'Add the generated env line to server/.env and restart the server.'
    );
  }

  return privateKey;
};

const createKeyRecord = async ({
  algorithm,
  purpose,
  status = 'ACTIVE',
  keySizeBits,
  rounds,
  notes = '',
  rotatedFromKeyId = null,
} = {}) => {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);
  const normalizedPurpose = normalizePurpose(purpose);
  const normalizedStatus = String(status || 'ACTIVE').trim().toUpperCase();

  if (!['ACTIVE', 'INACTIVE'].includes(normalizedStatus)) {
    throw new Error('New keys can only be created as ACTIVE or INACTIVE');
  }

  const version = await getNextVersion(normalizedAlgorithm, normalizedPurpose);
  const keyId = makeKeyId(normalizedAlgorithm, normalizedPurpose, version);
  const material = generateKeyMaterial(normalizedAlgorithm, { keySizeBits, rounds });
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
    activatedAt: normalizedStatus === 'ACTIVE' ? new Date() : null,
    rotatedFromKeyId,
    notes,
  });

  const env = buildPrivateKeyEnvLine({
    algorithm: normalizedAlgorithm,
    keyId,
    privateKey: material.privateKey,
  });

  return {
    keyRecord: keyRecord.toObject(),
    publicKey: material.publicKey,
    privateKey: material.privateKey,
    privateKeyEnvVar,
    env,
    warning:
      'Copy env.envLine into server/.env before using this key for decryption. ' +
      'The private key is not stored in MongoDB.',
  };
};

const rotateKey = async ({ algorithm, purpose, keySizeBits, rounds, notes = '' } = {}) => {
  const oldActiveKey = await getActiveKeyRecord({ algorithm, purpose });

  return createKeyRecord({
    algorithm,
    purpose,
    keySizeBits,
    rounds,
    status: 'ACTIVE',
    rotatedFromKeyId: oldActiveKey ? oldActiveKey.keyId : null,
    notes: notes || `Rotated from ${oldActiveKey ? oldActiveKey.keyId : 'no previous active key'}`,
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

  if (!updated) {
    throw new Error(`Key record not found: ${keyId}`);
  }

  return updated;
};

const markKeyCompromised = async (keyId, notes = 'Marked compromised') => {
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

  if (!updated) {
    throw new Error(`Key record not found: ${keyId}`);
  }

  return updated;
};

const listKeyRecords = async (filter = {}) => {
  const query = {};

  if (filter.algorithm) query.algorithm = normalizeAlgorithm(filter.algorithm);
  if (filter.purpose) query.purpose = normalizePurpose(filter.purpose);
  if (filter.status) query.status = String(filter.status).trim().toUpperCase();

  return CryptoKey.find(query).sort({ algorithm: 1, purpose: 1, version: -1 }).lean();
};

const resolveKeyPlanForDataType = (dataType) => {
  const key = String(dataType || '').trim().toUpperCase();

  if (!DATA_TYPE_TO_KEY_PURPOSE[key]) {
    throw new Error(`No key plan is defined for data type: ${dataType}`);
  }

  return DATA_TYPE_TO_KEY_PURPOSE[key];
};

const getActiveKeyForDataType = async (dataType) => {
  const plan = resolveKeyPlanForDataType(dataType);
  const record = await getActiveKeyRecord(plan);

  if (!record) {
    throw new Error(
      `No active key found for data type ${dataType}. ` +
      `Create one for ${plan.algorithm}/${plan.purpose} first.`
    );
  }

  return record;
};

const getActiveKeyMaterialForDataType = async (dataType) => {
  const record = await getActiveKeyForDataType(dataType);
  const privateKey = getPrivateKeyForRecord(record);

  return {
    keyRecord: record,
    publicKey: record.publicKey,
    privateKey,
  };
};

const ensureInitialKeySet = async (options = {}) => {
  const created = [];
  const existing = [];

  for (const plan of DEFAULT_KEY_PLANS) {
    const active = await getActiveKeyRecord(plan);

    if (active) {
      existing.push(active);
      continue;
    }

    const result = await createKeyRecord({
      algorithm: plan.algorithm,
      purpose: plan.purpose,
      status: 'ACTIVE',
      keySizeBits: options.rsaKeySizeBits || 1024,
      rounds: options.rsaRounds || 40,
      notes: plan.description,
    });

    created.push(result);
  }

  return {
    existing,
    created,
    envLinesToCopy: created.map((item) => item.env.envLine),
    warning:
      created.length > 0
        ? 'Copy every env line into server/.env and restart the backend.'
        : 'Initial key set already exists.',
  };
};

module.exports = {
  PRIVATE_KEY_ENV_BY_ALGORITHM,
  DEFAULT_KEY_PLANS,
  DATA_TYPE_TO_KEY_PURPOSE,

  normalizeAlgorithm,
  normalizePurpose,
  makeKeyId,

  encodePrivateKeyMap,
  decodePrivateKeyMap,
  addPrivateKeyToEnvValue,
  buildPrivateKeyEnvLine,

  generateKeyMaterial,
  getNextVersion,
  getActiveKeyRecord,
  getKeyRecordById,
  getPrivateKeyForRecord,
  createKeyRecord,
  rotateKey,
  retireKey,
  markKeyCompromised,
  listKeyRecords,
  resolveKeyPlanForDataType,
  getActiveKeyForDataType,
  getActiveKeyMaterialForDataType,
  ensureInitialKeySet,
};