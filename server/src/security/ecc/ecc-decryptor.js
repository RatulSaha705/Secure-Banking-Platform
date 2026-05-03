'use strict';

/**
 * security/ecc/ecc.decrypt.js
 *
 * Decryption for envelopes created by ecc.encrypt.js.
 *
 * For each ciphertext chunk:
 *   S = dC1
 *   M = C2 - S
 *   Decode point M back into the original plaintext chunk.
 */

const { toBigInt, bigIntToBuffer } = require('../crypto-math/big-integer-utils');
const {
  CURVE,
  addPoints,
  negatePoint,
  scalarMultiply,
  deserializePoint,
} = require('./ecc-curve-params');
const { normalizePrivateKey } = require('./ecc-key-generator');
const { MESSAGE_ENCODING_FACTOR } = require('./ecc-encryptor');

const decodePointToChunk = (point, length, factorInput = MESSAGE_ENCODING_FACTOR) => {
  if (!Number.isInteger(length) || length < 0) {
    throw new TypeError('length must be a non-negative integer');
  }

  const factor = toBigInt(factorInput, 'messageEncodingFactor');
  const messageNumber = point.x / factor;

  return bigIntToBuffer(messageNumber, length);
};

const decryptBuffer = (cipherEnvelope, privateKeyInput) => {
  if (!cipherEnvelope || typeof cipherEnvelope !== 'object') {
    throw new TypeError('cipherEnvelope must be an object');
  }

  if (cipherEnvelope.algorithm !== 'ECC') {
    throw new Error('cipherEnvelope algorithm must be ECC');
  }

  if (cipherEnvelope.curve !== CURVE.name) {
    throw new Error(`Unsupported ECC curve: ${cipherEnvelope.curve}`);
  }

  if (!Array.isArray(cipherEnvelope.chunks)) {
    throw new TypeError('cipherEnvelope.chunks must be an array');
  }

  const privateKey = normalizePrivateKey(privateKeyInput);
  const factor = toBigInt(cipherEnvelope.messageEncodingFactor || MESSAGE_ENCODING_FACTOR, 'messageEncodingFactor');
  const buffers = [];

  for (const chunk of cipherEnvelope.chunks) {
    if (!chunk || typeof chunk !== 'object') {
      throw new TypeError('Each ECC ciphertext chunk must be an object');
    }

    const c1 = deserializePoint(chunk.c1, 'cipher chunk c1');
    const c2 = deserializePoint(chunk.c2, 'cipher chunk c2');
    const sharedPoint = scalarMultiply(privateKey.d, c1);
    const messagePoint = addPoints(c2, negatePoint(sharedPoint));

    buffers.push(decodePointToChunk(messagePoint, chunk.length, factor));
  }

  return Buffer.concat(buffers);
};

const decryptText = (cipherEnvelope, privateKeyInput) => {
  if (cipherEnvelope === null) return null;
  const buffer = decryptBuffer(cipherEnvelope, privateKeyInput);
  return buffer.toString(cipherEnvelope.encoding || 'utf8');
};

const deserializeEccCiphertext = (ciphertextBase64) => {
  if (ciphertextBase64 === null || ciphertextBase64 === undefined) return null;
  if (typeof ciphertextBase64 !== 'string') {
    throw new TypeError('ciphertextBase64 must be a string');
  }

  const json = Buffer.from(ciphertextBase64, 'base64').toString('utf8');
  return JSON.parse(json);
};

const decryptTextFromBase64 = (ciphertextBase64, privateKeyInput) => {
  const envelope = deserializeEccCiphertext(ciphertextBase64);
  return decryptText(envelope, privateKeyInput);
};

module.exports = {
  decodePointToChunk,
  decryptBuffer,
  decryptText,
  deserializeEccCiphertext,
  decryptTextFromBase64,
};