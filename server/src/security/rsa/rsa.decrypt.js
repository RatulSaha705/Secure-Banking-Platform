'use strict';

/**
 * security/rsa/rsa.decrypt.js
 *
 * From-scratch educational RSA decryption for envelopes created by
 * rsa.encrypt.js.
 */

const { modPow } = require('../math/modPow');
const { toBigInt, hexToBigInt, bigIntToBuffer } = require('../math/bigint');
const { normalizePrivateKey } = require('./rsa.keygen');

const decryptBigInt = (cipherNumberInput, privateKeyInput) => {
  const privateKey = normalizePrivateKey(privateKeyInput);
  const c = toBigInt(cipherNumberInput, 'cipherNumber');

  if (c < 0n) throw new RangeError('cipherNumber must be non-negative');
  if (c >= privateKey.n) {
    throw new RangeError('cipherNumber must be smaller than RSA modulus n');
  }

  return modPow(c, privateKey.d, privateKey.n);
};

const decryptBuffer = (cipherEnvelope, privateKeyInput) => {
  if (!cipherEnvelope || typeof cipherEnvelope !== 'object') {
    throw new TypeError('cipherEnvelope must be an object');
  }

  if (cipherEnvelope.algorithm !== 'RSA') {
    throw new Error('cipherEnvelope algorithm must be RSA');
  }

  if (!Array.isArray(cipherEnvelope.chunks)) {
    throw new TypeError('cipherEnvelope.chunks must be an array');
  }

  const privateKey = normalizePrivateKey(privateKeyInput);
  const buffers = [];

  for (const chunk of cipherEnvelope.chunks) {
    if (!chunk || typeof chunk !== 'object') {
      throw new TypeError('Each RSA ciphertext chunk must be an object');
    }

    if (typeof chunk.data !== 'string') {
      throw new TypeError('RSA ciphertext chunk data must be a hex string');
    }

    if (!Number.isInteger(chunk.length) || chunk.length < 0) {
      throw new TypeError('RSA ciphertext chunk length must be a non-negative integer');
    }

    const cipherNumber = hexToBigInt(chunk.data, 'ciphertext chunk');
    const messageNumber = decryptBigInt(cipherNumber, privateKey);
    buffers.push(bigIntToBuffer(messageNumber, chunk.length));
  }

  return Buffer.concat(buffers);
};

const decryptText = (cipherEnvelope, privateKeyInput) => {
  if (cipherEnvelope === null) return null;
  const buffer = decryptBuffer(cipherEnvelope, privateKeyInput);
  return buffer.toString(cipherEnvelope.encoding || 'utf8');
};

const deserializeRsaCiphertext = (ciphertextBase64) => {
  if (ciphertextBase64 === null || ciphertextBase64 === undefined) return null;
  if (typeof ciphertextBase64 !== 'string') {
    throw new TypeError('ciphertextBase64 must be a string');
  }

  const json = Buffer.from(ciphertextBase64, 'base64').toString('utf8');
  return JSON.parse(json);
};

const decryptTextFromBase64 = (ciphertextBase64, privateKeyInput) => {
  const envelope = deserializeRsaCiphertext(ciphertextBase64);
  return decryptText(envelope, privateKeyInput);
};

module.exports = {
  decryptBigInt,
  decryptBuffer,
  decryptText,
  deserializeRsaCiphertext,
  decryptTextFromBase64,
};