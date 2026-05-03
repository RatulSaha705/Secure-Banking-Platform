'use strict';

/**
 * security/rsa/rsa.keygen.js
 *
 * From-scratch educational RSA key generation for the CSE447 secure banking
 * project. This module uses the custom math utilities from Step 1:
 *   - prime generation
 *   - gcd/lcm
 *   - modular inverse
 *
 * Note:
 *   crypto.randomBytes is used only indirectly by primes.js as an entropy
 *   source for random candidate numbers. RSA math is implemented manually.
 */

const { generateDistinctPrimes } = require('../crypto-math/prime-generator');
const { gcd, lcm, bitLength, byteLength, toBigInt } = require('../crypto-math/big-integer-utils');
const { modInverse } = require('../crypto-math/modular-inverse');

const DEFAULT_PUBLIC_EXPONENT = 65537n;
const DEFAULT_KEY_SIZE_BITS = 1024;

const stringifyPublicKey = ({ n, e, keySizeBits }) => ({
  algorithm: 'RSA',
  n: n.toString(),
  e: e.toString(),
  keySizeBits,
});

const stringifyPrivateKey = ({ n, e, d, p, q, lambdaN, keySizeBits }) => ({
  algorithm: 'RSA',
  n: n.toString(),
  e: e.toString(),
  d: d.toString(),
  p: p.toString(),
  q: q.toString(),
  lambdaN: lambdaN.toString(),
  keySizeBits,
});

const normalizePublicKey = (publicKey) => {
  if (!publicKey || typeof publicKey !== 'object') {
    throw new TypeError('publicKey must be an object');
  }

  return {
    algorithm: 'RSA',
    n: toBigInt(publicKey.n, 'publicKey.n'),
    e: toBigInt(publicKey.e, 'publicKey.e'),
    keySizeBits: Number(publicKey.keySizeBits || bitLength(publicKey.n)),
  };
};

const normalizePrivateKey = (privateKey) => {
  if (!privateKey || typeof privateKey !== 'object') {
    throw new TypeError('privateKey must be an object');
  }

  return {
    algorithm: 'RSA',
    n: toBigInt(privateKey.n, 'privateKey.n'),
    e: toBigInt(privateKey.e || DEFAULT_PUBLIC_EXPONENT, 'privateKey.e'),
    d: toBigInt(privateKey.d, 'privateKey.d'),
    p: privateKey.p ? toBigInt(privateKey.p, 'privateKey.p') : null,
    q: privateKey.q ? toBigInt(privateKey.q, 'privateKey.q') : null,
    lambdaN: privateKey.lambdaN ? toBigInt(privateKey.lambdaN, 'privateKey.lambdaN') : null,
    keySizeBits: Number(privateKey.keySizeBits || bitLength(privateKey.n)),
  };
};

const validateKeySize = (keySizeBits) => {
  if (!Number.isInteger(keySizeBits)) {
    throw new TypeError('keySizeBits must be an integer');
  }

  if (keySizeBits < 512) {
    throw new RangeError('keySizeBits must be at least 512 for this project module');
  }

  if (keySizeBits % 2 !== 0) {
    throw new RangeError('keySizeBits must be an even number');
  }
};

const choosePublicExponent = (lambdaN, requestedExponent) => {
  const e = toBigInt(requestedExponent || DEFAULT_PUBLIC_EXPONENT, 'publicExponent');

  if (e <= 1n) throw new RangeError('public exponent must be greater than 1');
  if (e >= lambdaN) throw new RangeError('public exponent must be smaller than lambda(n)');
  if (gcd(e, lambdaN) !== 1n) {
    throw new Error('public exponent is not coprime with lambda(n)');
  }

  return e;
};

/**
 * generateRsaKeyPair
 *
 * Returns JSON-safe string keys:
 *   {
 *     publicKey:  { algorithm, n, e, keySizeBits },
 *     privateKey: { algorithm, n, e, d, p, q, lambdaN, keySizeBits }
 *   }
 */
const generateRsaKeyPair = (options = {}) => {
  const keySizeBits = options.keySizeBits || DEFAULT_KEY_SIZE_BITS;
  const publicExponent = options.publicExponent || DEFAULT_PUBLIC_EXPONENT;
  const rounds = options.rounds || 40;

  validateKeySize(keySizeBits);

  const primeBits = Math.floor(keySizeBits / 2);

  let p;
  let q;
  let n;
  let lambdaN;
  let e;

  // Regenerate if p/q produce a modulus of the wrong size or if e is invalid.
  // This is uncommon but possible, so the loop keeps keygen reliable.
  for (let attempt = 1; attempt <= 200; attempt += 1) {
    [p, q] = generateDistinctPrimes(primeBits, 2, { rounds });

    n = p * q;
    if (bitLength(n) !== keySizeBits) continue;

    lambdaN = lcm(p - 1n, q - 1n);

    try {
      e = choosePublicExponent(lambdaN, publicExponent);
      break;
    } catch (error) {
      if (attempt === 200) throw error;
    }
  }

  if (!p || !q || !n || !lambdaN || !e) {
    throw new Error('Failed to generate a valid RSA key pair');
  }

  const d = modInverse(e, lambdaN);

  const publicKey = stringifyPublicKey({ n, e, keySizeBits });
  const privateKey = stringifyPrivateKey({ n, e, d, p, q, lambdaN, keySizeBits });

  return {
    publicKey,
    privateKey,
    metadata: {
      algorithm: 'RSA',
      keySizeBits,
      modulusBytes: byteLength(n),
      publicExponent: e.toString(),
      createdAt: new Date().toISOString(),
    },
  };
};

module.exports = {
  DEFAULT_PUBLIC_EXPONENT,
  DEFAULT_KEY_SIZE_BITS,
  generateRsaKeyPair,
  normalizePublicKey,
  normalizePrivateKey,
  stringifyPublicKey,
  stringifyPrivateKey,
};