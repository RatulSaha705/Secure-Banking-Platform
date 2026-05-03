'use strict';

/**
 * server/src/security/keys/key.service.js
 *
 * Feature 17: Key Management Service
 *
 * Updated design:
 *   - Every user gets their own RSA/ECC key records during registration.
 *   - MongoDB stores public keys and metadata only.
 *   - Private keys are stored in backend .env as base64 JSON maps.
 *   - Encryption must receive ownerId so one user's data uses only that user's keys.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const {
  CryptoKey,
  KEY_ALGORITHMS,
  KEY_PURPOSES,
  KEY_STATUSES,
  KEY_OWNER_TYPES,
} = require('./crypto-key-schema');
const { generateRsaKeyPair } = require('../rsa/rsa-key-generator');
const { generateEccKeyPair } = require('../ecc/ecc-key-generator');

const PRIVATE_KEY_ENV_BY_ALGORITHM = Object.freeze({
  RSA: 'SECURITY_RSA_PRIVATE_KEYS_B64',
  ECC: 'SECURITY_ECC_PRIVATE_KEYS_B64',
});

const KEY_USAGE_BY_PURPOSE = Object.freeze({
  USER_PROFILE: 'Encrypt registration, login display, and profile fields',
  ACCOUNT_DATA: 'Encrypt account number, account type, status, and balance-related fields',
  BENEFICIARY_DATA: 'Encrypt saved beneficiary details',
  TRANSACTION_DATA: 'Encrypt transaction history and transfer-sensitive records',
  SUPPORT_TICKET: 'Encrypt support ticket / post-equivalent content',
  NOTIFICATION: 'Encrypt sensitive notification body text',
  TEST: 'Testing only',
});

const DEFAULT_INITIAL_KEY_PLANS = Object.freeze([
  { algorithm: 'RSA', purpose: 'USER_PROFILE' },
  { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },
  { algorithm: 'RSA', purpose: 'BENEFICIARY_DATA' },
  { algorithm: 'ECC', purpose: 'TRANSACTION_DATA' },
  { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },
  { algorithm: 'ECC', purpose: 'NOTIFICATION' },
]);

const DEFAULT_USER_KEY_PLANS = DEFAULT_INITIAL_KEY_PLANS;

const DATA_TYPE_TO_KEY_PLAN = Object.freeze({
  USER: { algorithm: 'RSA', purpose: 'USER_PROFILE' },
  USER_REGISTRATION: { algorithm: 'RSA', purpose: 'USER_PROFILE' },
  USER_PROFILE: { algorithm: 'RSA', purpose: 'USER_PROFILE' },
  PROFILE: { algorithm: 'RSA', purpose: 'USER_PROFILE' },

  ACCOUNT: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },
  ACCOUNT_DATA: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },
  ACCOUNT_DETAILS: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },
  BALANCE: { algorithm: 'RSA', purpose: 'ACCOUNT_DATA' },

  BENEFICIARY: { algorithm: 'RSA', purpose: 'BENEFICIARY_DATA' },
  BENEFICIARY_DATA: { algorithm: 'RSA', purpose: 'BENEFICIARY_DATA' },

  TRANSACTION: { algorithm: 'ECC', purpose: 'TRANSACTION_DATA' },
  TRANSACTION_DATA: { algorithm: 'ECC', purpose: 'TRANSACTION_DATA' },
  TRANSFER: { algorithm: 'ECC', purpose: 'TRANSACTION_DATA' },

  SUPPORT_TICKET: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },
  TICKET: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },
  POST: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },
  TICKET_COMMENT: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },
  COMMENT: { algorithm: 'ECC', purpose: 'SUPPORT_TICKET' },

  NOTIFICATION: { algorithm: 'ECC', purpose: 'NOTIFICATION' },
  ALERT: { algorithm: 'ECC', purpose: 'NOTIFICATION' },

  TEST_RSA: { algorithm: 'RSA', purpose: 'TEST' },
  TEST_ECC: { algorithm: 'ECC', purpose: 'TEST' },
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

const normalizeOwnerType = (ownerType) => {
  const value = String(ownerType || 'SYSTEM').trim().toUpperCase();

  if (!KEY_OWNER_TYPES.includes(value)) {
    throw new Error(`Unsupported key owner type: ${ownerType}`);
  }

  return value;
};

const normalizeOwnerUserId = (ownerUserId) => {
  if (ownerUserId === undefined || ownerUserId === null || ownerUserId === '') {
    return null;
  }

  const value = String(ownerUserId).trim();

  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ownerUserId for key ownership: ${ownerUserId}`);
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

const makeKeyId = (algorithm, purpose, version, ownerUserId = null) => {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);
  const normalizedPurpose = normalizePurpose(purpose);
  const normalizedOwnerUserId = normalizeOwnerUserId(ownerUserId);

  if (!Number.isInteger(version) || version < 1) {
    throw new RangeError('version must be a positive integer');
  }

  const base = `${slugify(normalizedAlgorithm)}-${slugify(normalizedPurpose)}-v${version}`;

  if (!normalizedOwnerUserId) {
    return base;
  }

  return `user-${slugify(normalizedOwnerUserId)}-${base}`;
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

const getDefaultEnvFilePath = () => {
  return path.resolve(process.cwd(), '.env');
};

const upsertEnvValueInFile = (envVarName, envVarValue, envFilePath = getDefaultEnvFilePath()) => {
  const targetFile = path.resolve(envFilePath);
  const directory = path.dirname(targetFile);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  let content = '';

  if (fs.existsSync(targetFile)) {
    content = fs.readFileSync(targetFile, 'utf8');
  }

  const line = `${envVarName}=${envVarValue}`;
  const pattern = new RegExp(`^${envVarName}=.*$`, 'm');

  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n';
    }

    content += `${line}\n`;
  }

  fs.writeFileSync(targetFile, content, 'utf8');
  process.env[envVarName] = envVarValue;

  return targetFile;
};

const persistPrivateKeyEnvValues = (envValuesByName, envFilePath = getDefaultEnvFilePath()) => {
  const updatedEnvVars = [];

  for (const [envVarName, envVarValue] of Object.entries(envValuesByName)) {
    if (!envVarValue) continue;
    upsertEnvValueInFile(envVarName, envVarValue, envFilePath);
    updatedEnvVars.push(envVarName);
  }

  return updatedEnvVars;
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

const buildOwnerQuery = (ownerUserId = null) => {
  const normalizedOwnerUserId = normalizeOwnerUserId(ownerUserId);

  if (!normalizedOwnerUserId) {
    return {
      ownerType: 'SYSTEM',
      ownerUserId: null,
    };
  }

  return {
    ownerType: 'USER',
    ownerUserId: new mongoose.Types.ObjectId(normalizedOwnerUserId),
  };
};

const getNextVersion = async (algorithm, purpose, ownerUserId = null) => {
  const latest = await CryptoKey.findOne({
    ...buildOwnerQuery(ownerUserId),
    algorithm: normalizeAlgorithm(algorithm),
    purpose: normalizePurpose(purpose),
  })
    .sort({ version: -1 })
    .lean();

  return latest ? latest.version + 1 : 1;
};

const getActiveKeyRecord = async ({ algorithm, purpose, ownerUserId = null } = {}) => {
  return CryptoKey.findOne({
    ...buildOwnerQuery(ownerUserId),
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
      'The public key exists in MongoDB, but the private key must be present in server/.env. '
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
  ownerUserId = null,
  rsaKeySizeBits = 1024,
  rsaRounds = 40,
} = {}) => {
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);
  const normalizedPurpose = normalizePurpose(purpose);
  const normalizedStatus = normalizeStatus(status);
  const normalizedOwnerUserId = normalizeOwnerUserId(ownerUserId);
  const ownerQuery = buildOwnerQuery(normalizedOwnerUserId);

  const version = await getNextVersion(
    normalizedAlgorithm,
    normalizedPurpose,
    normalizedOwnerUserId
  );

  const keyId = makeKeyId(
    normalizedAlgorithm,
    normalizedPurpose,
    version,
    normalizedOwnerUserId
  );

  const material = generateKeyMaterial(normalizedAlgorithm, {
    rsaKeySizeBits,
    rsaRounds,
  });

  const privateKeyEnvVar = getPrivateKeyEnvVar(normalizedAlgorithm);

  if (normalizedStatus === 'ACTIVE') {
    await CryptoKey.updateMany(
      {
        ...ownerQuery,
        algorithm: normalizedAlgorithm,
        purpose: normalizedPurpose,
        status: 'ACTIVE',
      },
      {
        $set: {
          status: 'RETIRED',
          retiredAt: new Date(),
          notes: 'Retired automatically because a newer active key was created for the same owner and purpose.',
        },
      }
    );
  }

  const keyRecord = await CryptoKey.create({
    keyId,
    ownerType: ownerQuery.ownerType,
    ownerUserId: ownerQuery.ownerUserId,
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

  if (input.persistToEnvFile === true) {
    persistPrivateKeyEnvValues(
      { [created.privateKeyEnvVar]: newEnvValue },
      input.envFilePath || getDefaultEnvFilePath()
    );
  }

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
  ownerUserId = null,
  persistToEnvFile = false,
  envFilePath,
  rsaKeySizeBits = 1024,
  rsaRounds = 40,
} = {}) => {
  const oldActive = await getActiveKeyRecord({ algorithm, purpose, ownerUserId });

  return createKeyRecordWithEnvValue({
    algorithm,
    purpose,
    ownerUserId,
    status: 'ACTIVE',
    rotatedFromKeyId: oldActive ? oldActive.keyId : null,
    notes: notes || `Rotated from ${oldActive ? oldActive.keyId : 'none'}`,
    persistToEnvFile,
    envFilePath,
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

  if (filter.ownerType) {
    query.ownerType = normalizeOwnerType(filter.ownerType);
  }

  if (filter.ownerUserId) {
    query.ownerType = 'USER';
    query.ownerUserId = new mongoose.Types.ObjectId(normalizeOwnerUserId(filter.ownerUserId));
  }

  return CryptoKey.find(query)
    .select('-__v')
    .sort({ ownerType: 1, ownerUserId: 1, algorithm: 1, purpose: 1, version: -1 })
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

const isTestDataType = (dataType) => {
  const key = String(dataType || '').trim().toUpperCase();
  return key === 'TEST' || key === 'TEST_RSA' || key === 'TEST_ECC';
};

const getActiveKeyForDataType = async (dataType, options = {}) => {
  const plan = resolveKeyPlanForDataType(dataType);
  const ownerUserId = normalizeOwnerUserId(options.ownerId || options.ownerUserId || null);

  if (!ownerUserId && !isTestDataType(dataType)) {
    throw new Error(
      `ownerId is required for ${dataType} encryption. ` +
      'Every user-owned record must be encrypted with that user\'s own key.'
    );
  }

  const active = await getActiveKeyRecord({
    algorithm: plan.algorithm,
    purpose: plan.purpose,
    ownerUserId,
  });

  if (!active) {
    throw new Error(
      `No ACTIVE ${ownerUserId ? 'user-owned' : 'system'} key found for ${dataType}. ` +
      `Required key: ${plan.algorithm}/${plan.purpose}.`
    );
  }

  return active;
};

const getActiveKeyMaterialForDataType = async (dataType, options = {}) => {
  const keyRecord = await getActiveKeyForDataType(dataType, options);
  const privateKey = getPrivateKeyForRecord(keyRecord);

  return {
    keyRecord,
    publicKey: keyRecord.publicKey,
    privateKey,
  };
};

const ensureKeySetFromPlans = async ({
  plans,
  ownerUserId = null,
  persistToEnvFile = false,
  envFilePath,
  rsaKeySizeBits = 1024,
  rsaRounds = 40,
  notes = '',
} = {}) => {
  const created = [];
  const existing = [];

  const envAccumulator = {
    SECURITY_RSA_PRIVATE_KEYS_B64: process.env.SECURITY_RSA_PRIVATE_KEYS_B64 || '',
    SECURITY_ECC_PRIVATE_KEYS_B64: process.env.SECURITY_ECC_PRIVATE_KEYS_B64 || '',
  };

  for (const plan of plans) {
    const active = await getActiveKeyRecord({
      algorithm: plan.algorithm,
      purpose: plan.purpose,
      ownerUserId,
    });

    if (active) {
      existing.push(active);
      continue;
    }

    const createdRaw = await createKeyRecord({
      algorithm: plan.algorithm,
      purpose: plan.purpose,
      ownerUserId,
      status: 'ACTIVE',
      rsaKeySizeBits,
      rsaRounds,
      notes,
    });

    const envVar = createdRaw.privateKeyEnvVar;
    envAccumulator[envVar] = mergePrivateKeyIntoMap(
      envAccumulator[envVar],
      createdRaw.keyRecord.keyId,
      createdRaw.privateKey
    );

    created.push(createdRaw.keyRecord);
  }

  let updatedEnvVars = [];

  if (persistToEnvFile && created.length > 0) {
    updatedEnvVars = persistPrivateKeyEnvValues(envAccumulator, envFilePath || getDefaultEnvFilePath());
  }

  const envLinesToCopy = Object.entries(envAccumulator)
    .filter(([, value]) => Boolean(value))
    .map(([name, value]) => `${name}=${value}`);

  return {
    created,
    existing,
    updatedEnvVars,
    envLinesToCopy,
    message:
      created.length > 0
        ? 'Key set generated. Private key environment values were updated or returned.'
        : 'Key set already exists.',
  };
};

const ensureInitialKeySet = async (options = {}) => {
  return ensureKeySetFromPlans({
    plans: DEFAULT_INITIAL_KEY_PLANS,
    ownerUserId: null,
    persistToEnvFile: options.persistToEnvFile === true,
    envFilePath: options.envFilePath,
    rsaKeySizeBits: options.rsaKeySizeBits || 1024,
    rsaRounds: options.rsaRounds || 40,
    notes: 'Initial system key created by Feature 17 Key Management Module',
  });
};

const ensureUserKeySet = async ({
  ownerUserId,
  persistToEnvFile = true,
  envFilePath,
  rsaKeySizeBits = 1024,
  rsaRounds = 40,
} = {}) => {
  const normalizedOwnerUserId = normalizeOwnerUserId(ownerUserId);

  if (!normalizedOwnerUserId) {
    throw new Error('ownerUserId is required to generate per-user key pairs');
  }

  return ensureKeySetFromPlans({
    plans: DEFAULT_USER_KEY_PLANS,
    ownerUserId: normalizedOwnerUserId,
    persistToEnvFile,
    envFilePath,
    rsaKeySizeBits,
    rsaRounds,
    notes: `Per-user key generated for user ${normalizedOwnerUserId}`,
  });
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
  DEFAULT_USER_KEY_PLANS,
  DATA_TYPE_TO_KEY_PLAN,

  normalizeAlgorithm,
  normalizePurpose,
  normalizeStatus,
  normalizeOwnerType,
  normalizeOwnerUserId,
  makeKeyId,

  decodePrivateKeyMap,
  encodePrivateKeyMap,
  mergePrivateKeyIntoMap,
  upsertEnvValueInFile,
  persistPrivateKeyEnvValues,

  generateKeyMaterial,
  buildOwnerQuery,
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
  ensureUserKeySet,
  sanitizeKeyRecord,
};