'use strict';

/**
 * server/src/scripts/testIntegrityMac.js
 *
 * Test Feature 19 without MongoDB.
 *
 * Usage:
 *   cd server
 *   node src/scripts/testIntegrityMac.js
 */

require('dotenv').config();

if (!process.env.SECURITY_MAC_MASTER_KEY && !process.env.HMAC_MASTER_KEY) {
  process.env.SECURITY_MAC_MASTER_KEY = 'local-test-mac-secret-change-this';
}

const {
  attachMacToEncryptedField,
  verifyEncryptedFieldMac,
  assertEncryptedFieldMacValid,
  buildEncryptedFieldMacParts,
} = require('../security/integrity');

const main = () => {
  const context = {
    modelName: 'USER',
    collectionName: 'users',
    fieldName: 'email',
    ownerId: 'user-123',
    documentId: 'doc-456',
  };

  const encryptedEnvelope = {
    protected: true,
    storageType: 'ENCRYPTED_FIELD',
    encryptionType: 'DUAL_ASYMMETRIC',
    dataType: 'USER_REGISTRATION',
    algorithm: 'RSA',
    keyPurpose: 'USER_PROFILE',
    keyId: 'rsa-user-profile-v1',
    version: 1,
    ciphertext: 'example-ciphertext-value',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const protectedEnvelope = attachMacToEncryptedField(encryptedEnvelope, context);

  console.log('MAC parts protected by HMAC:');
  console.table(buildEncryptedFieldMacParts(protectedEnvelope, context));

  console.log('\nMAC:', protectedEnvelope.mac);
  console.log('MAC algorithm:', protectedEnvelope.macAlgorithm);
  console.log('MAC valid:', verifyEncryptedFieldMac(protectedEnvelope, context));

  assertEncryptedFieldMacValid(protectedEnvelope, context);
  console.log('Assert valid: passed');

  const tamperedCiphertext = {
    ...protectedEnvelope,
    ciphertext: 'attacker-changed-ciphertext',
  };

  console.log('\nTampered ciphertext valid:', verifyEncryptedFieldMac(tamperedCiphertext, context));

  const tamperedOwner = {
    ...context,
    ownerId: 'different-user',
  };

  console.log('Tampered owner valid:', verifyEncryptedFieldMac(protectedEnvelope, tamperedOwner));

  const tamperedAlgorithm = {
    ...protectedEnvelope,
    algorithm: 'ECC',
  };

  console.log('Tampered algorithm valid:', verifyEncryptedFieldMac(tamperedAlgorithm, context));

  console.log(
    '\nFinal success:',
    verifyEncryptedFieldMac(protectedEnvelope, context) === true &&
      verifyEncryptedFieldMac(tamperedCiphertext, context) === false &&
      verifyEncryptedFieldMac(protectedEnvelope, tamperedOwner) === false &&
      verifyEncryptedFieldMac(tamperedAlgorithm, context) === false
  );
};

main();