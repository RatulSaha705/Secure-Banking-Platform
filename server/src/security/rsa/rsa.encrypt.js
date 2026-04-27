'use strict';

/**
 * security/rsa/rsa.encrypt.js
 *
 * From-scratch educational RSA encryption.
 *
 * Important:
 *   This is textbook RSA chunk encryption for the lab requirement. Real-world
 *   applications use padding schemes such as OAEP. Do not present this as
 *   production-grade cryptography outside the lab context.
 */

const { modPow } = require('../math/modPow');
const { toBigInt, byteLength, bufferToBigInt, bigIntToHex } = require('../math/bigint');
const { normalizePublicKey } = require('./rsa.keygen');

const getPlainChunkSize = (modulusBytes) => {
  // Keep each plaintext chunk definitely smaller than n.
  // One byte less than modulus size is a simple educational rule.
  if (modulusBytes < 2) throw new RangeError('RSA modulus is too small');
  return modulusBytes - 1;
};

const encryptBigInt = (messageNumber, publicKeyInput) => {
  const publicKey = normalizePublicKey(publicKeyInput);
  const m = toBigInt(messageNumber, 'messageNumber');

  if (m < 0n) throw new RangeError('messageNumber must be non-negative');
  if (m >= publicKey.n) {
    throw new RangeError('messageNumber must be smaller than RSA modulus n');
  }

  return modPow(m, publicKey.e, publicKey.n);
};

const encryptBuffer = (plainBuffer, publicKeyInput) => {
  if (!Buffer.isBuffer(plainBuffer)) {
    throw new TypeError('plainBuffer must be a Buffer');
  }

  const publicKey = normalizePublicKey(publicKeyInput);
  const modulusBytes = byteLength(publicKey.n);
  const plainChunkSize = getPlainChunkSize(modulusBytes);
  const chunks = [];

  for (let offset = 0; offset < plainBuffer.length; offset += plainChunkSize) {
    const chunk = plainBuffer.subarray(offset, offset + plainChunkSize);
    const messageNumber = bufferToBigInt(chunk, 'plaintext chunk');
    const cipherNumber = encryptBigInt(messageNumber, publicKey);

    chunks.push({
      data: bigIntToHex(cipherNumber, modulusBytes),
      length: chunk.length,
    });
  }

  return {
    algorithm: 'RSA',
    encoding: 'utf8',
    chunkEncoding: 'hex',
    modulusBytes,
    plainChunkSize,
    chunks,
  };
};

const encryptText = (plainText, publicKeyInput) => {
  if (plainText === undefined || plainText === null) return null;
  if (typeof plainText !== 'string') {
    throw new TypeError('plainText must be a string');
  }

  const buffer = Buffer.from(plainText, 'utf8');
  return encryptBuffer(buffer, publicKeyInput);
};

const serializeRsaCiphertext = (cipherEnvelope) => {
  if (cipherEnvelope === null) return null;
  return Buffer.from(JSON.stringify(cipherEnvelope), 'utf8').toString('base64');
};

const encryptTextToBase64 = (plainText, publicKeyInput) => {
  const envelope = encryptText(plainText, publicKeyInput);
  return serializeRsaCiphertext(envelope);
};

module.exports = {
  getPlainChunkSize,
  encryptBigInt,
  encryptBuffer,
  encryptText,
  serializeRsaCiphertext,
  encryptTextToBase64,
};