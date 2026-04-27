'use strict';

/**
 * security/ecc/ecc.keygen.js
 *
 * Educational from-scratch ECC key generation.
 * Private key: random scalar d in [1, n - 1]
 * Public key: Q = dG
 */

const { randomBigIntBetween } = require('../math/primes');
const {
  CURVE,
  G,
  scalarMultiply,
  serializePoint,
  deserializePoint,
  validatePrivateScalar,
} = require('./ecc.curve');
const { toBigInt } = require('../math/bigint');

const stringifyPublicKey = ({ point }) => {
  const serialized = serializePoint(point);

  return {
    algorithm: 'ECC',
    curve: CURVE.name,
    x: serialized.x,
    y: serialized.y,
  };
};

const stringifyPrivateKey = ({ d, publicKey }) => ({
  algorithm: 'ECC',
  curve: CURVE.name,
  d: d.toString(),
  publicKey,
});

const normalizePublicKey = (publicKey) => {
  if (!publicKey || typeof publicKey !== 'object') {
    throw new TypeError('publicKey must be an object');
  }

  if (publicKey.algorithm && publicKey.algorithm !== 'ECC') {
    throw new Error('publicKey algorithm must be ECC');
  }

  if (publicKey.curve && publicKey.curve !== CURVE.name) {
    throw new Error(`Unsupported ECC curve: ${publicKey.curve}`);
  }

  return deserializePoint({ x: publicKey.x, y: publicKey.y }, 'publicKey');
};

const normalizePrivateKey = (privateKey) => {
  if (!privateKey || typeof privateKey !== 'object') {
    throw new TypeError('privateKey must be an object');
  }

  if (privateKey.algorithm && privateKey.algorithm !== 'ECC') {
    throw new Error('privateKey algorithm must be ECC');
  }

  if (privateKey.curve && privateKey.curve !== CURVE.name) {
    throw new Error(`Unsupported ECC curve: ${privateKey.curve}`);
  }

  const d = validatePrivateScalar(toBigInt(privateKey.d, 'privateKey.d'));
  const publicPoint = privateKey.publicKey ? normalizePublicKey(privateKey.publicKey) : scalarMultiply(d, G);

  return {
    algorithm: 'ECC',
    curve: CURVE.name,
    d,
    publicPoint,
  };
};

const generateEccKeyPair = () => {
  const d = randomBigIntBetween(1n, CURVE.n - 1n);
  const publicPoint = scalarMultiply(d, G);
  const publicKey = stringifyPublicKey({ point: publicPoint });
  const privateKey = stringifyPrivateKey({ d, publicKey });

  return {
    publicKey,
    privateKey,
    metadata: {
      algorithm: 'ECC',
      curve: CURVE.name,
      createdAt: new Date().toISOString(),
    },
  };
};

module.exports = {
  generateEccKeyPair,
  normalizePublicKey,
  normalizePrivateKey,
  stringifyPublicKey,
  stringifyPrivateKey,
};