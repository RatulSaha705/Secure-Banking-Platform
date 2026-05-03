'use strict';

/**
 * security/ecc/ecc.encrypt.js
 *
 * Educational ECC ElGamal-style encryption over elliptic curve points.
 *
 * For each plaintext chunk:
 *   1. Encode the plaintext chunk as a curve point M.
 *   2. Generate random ephemeral scalar k.
 *   3. C1 = kG
 *   4. S  = kQ, where Q is receiver public key.
 *   5. C2 = M + S
 *
 * No built-in encryption function is used here.
 */

const { randomBigIntBetween } = require('../crypto-math/prime-generator');
const { bufferToBigInt } = require('../crypto-math/big-integer-utils');
const {
  CURVE,
  G,
  addPoints,
  pointFromX,
  scalarMultiply,
  serializePoint,
  assertOnCurve,
} = require('./ecc-curve-params');
const { normalizePublicKey } = require('./ecc-key-generator');

const MESSAGE_ENCODING_FACTOR = 4096n;
const DEFAULT_CHUNK_SIZE_BYTES = 24;

const encodeChunkToPoint = (chunkBuffer) => {
  if (!Buffer.isBuffer(chunkBuffer)) {
    throw new TypeError('chunkBuffer must be a Buffer');
  }

  const messageNumber = bufferToBigInt(chunkBuffer, 'plaintext chunk');
  const baseX = messageNumber * MESSAGE_ENCODING_FACTOR;

  for (let counter = 0n; counter < MESSAGE_ENCODING_FACTOR; counter += 1n) {
    const x = baseX + counter;
    if (x >= CURVE.p) break;

    const point = pointFromX(x, true);
    if (point) return point;
  }

  throw new Error('Could not encode plaintext chunk as an ECC curve point');
};

const encryptBuffer = (plainBuffer, publicKeyInput, options = {}) => {
  if (!Buffer.isBuffer(plainBuffer)) {
    throw new TypeError('plainBuffer must be a Buffer');
  }

  const publicPoint = normalizePublicKey(publicKeyInput);
  assertOnCurve(publicPoint, 'public key point');

  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE_BYTES;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > DEFAULT_CHUNK_SIZE_BYTES) {
    throw new RangeError(`chunkSize must be between 1 and ${DEFAULT_CHUNK_SIZE_BYTES}`);
  }

  const chunks = [];

  for (let offset = 0; offset < plainBuffer.length; offset += chunkSize) {
    const chunk = plainBuffer.subarray(offset, offset + chunkSize);
    const messagePoint = encodeChunkToPoint(chunk);

    const ephemeralScalar = randomBigIntBetween(1n, CURVE.n - 1n);
    const c1 = scalarMultiply(ephemeralScalar, G);
    const sharedPoint = scalarMultiply(ephemeralScalar, publicPoint);
    const c2 = addPoints(messagePoint, sharedPoint);

    chunks.push({
      c1: serializePoint(c1),
      c2: serializePoint(c2),
      length: chunk.length,
    });
  }

  return {
    algorithm: 'ECC',
    curve: CURVE.name,
    scheme: 'EC-ElGamal-lab',
    encoding: 'utf8',
    chunkEncoding: 'curve-point',
    chunkSize,
    messageEncodingFactor: MESSAGE_ENCODING_FACTOR.toString(),
    chunks,
  };
};

const encryptText = (plainText, publicKeyInput, options = {}) => {
  if (plainText === undefined || plainText === null) return null;
  if (typeof plainText !== 'string') {
    throw new TypeError('plainText must be a string');
  }

  return encryptBuffer(Buffer.from(plainText, 'utf8'), publicKeyInput, options);
};

const serializeEccCiphertext = (cipherEnvelope) => {
  if (cipherEnvelope === null) return null;
  return Buffer.from(JSON.stringify(cipherEnvelope), 'utf8').toString('base64');
};

const encryptTextToBase64 = (plainText, publicKeyInput, options = {}) => {
  const envelope = encryptText(plainText, publicKeyInput, options);
  return serializeEccCiphertext(envelope);
};

module.exports = {
  MESSAGE_ENCODING_FACTOR,
  DEFAULT_CHUNK_SIZE_BYTES,
  encodeChunkToPoint,
  encryptBuffer,
  encryptText,
  serializeEccCiphertext,
  encryptTextToBase64,
};