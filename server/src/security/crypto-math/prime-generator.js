'use strict';

/**
 * security/math/primes.js
 *
 * Prime generation helpers for the from-scratch RSA key generator.
 *
 * Note about randomness:
 *   crypto.randomBytes is used only as a secure entropy source. The prime
 *   testing and key-generation math are implemented here/from scratch.
 */

const crypto = require('crypto');
const { toBigInt, bitLength, bufferToBigInt } = require('./big-integer-utils');
const { modPow } = require('./modular-exponent');

const SMALL_PRIMES = [
  2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n,
  41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n,
];

const randomBigIntWithBits = (bits) => {
  if (!Number.isInteger(bits) || bits < 2) {
    throw new RangeError('bits must be an integer greater than or equal to 2');
  }

  const bytes = Math.ceil(bits / 8);
  const extraBits = bytes * 8 - bits;
  const buffer = crypto.randomBytes(bytes);

  buffer[0] = buffer[0] & (0xff >>> extraBits);
  buffer[0] = buffer[0] | (1 << (7 - extraBits));

  return bufferToBigInt(buffer, 'random buffer');
};

const randomOddBigIntWithBits = (bits) => {
  return randomBigIntWithBits(bits) | 1n;
};

const randomBigIntBetween = (min, max) => {
  const lower = toBigInt(min, 'min');
  const upper = toBigInt(max, 'max');

  if (lower > upper) throw new RangeError('min must be less than or equal to max');
  if (lower === upper) return lower;

  const range = upper - lower + 1n;
  const bits = bitLength(range);

  let candidate;
  do {
    candidate = randomBigIntWithBits(bits);
  } while (candidate >= range);

  return lower + candidate;
};

const isDivisibleBySmallPrime = (candidate) => {
  const n = toBigInt(candidate, 'candidate');

  for (const prime of SMALL_PRIMES) {
    if (n === prime) return false;
    if (n % prime === 0n) return true;
  }

  return false;
};

const isProbablePrime = (candidate, rounds = 40) => {
  const n = toBigInt(candidate, 'candidate');

  if (n < 2n) return false;
  for (const prime of SMALL_PRIMES) {
    if (n === prime) return true;
    if (n % prime === 0n) return false;
  }

  if ((n & 1n) === 0n) return false;

  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s += 1;
  }

  for (let i = 0; i < rounds; i += 1) {
    const a = randomBigIntBetween(2n, n - 2n);
    let x = modPow(a, d, n);

    if (x === 1n || x === n - 1n) continue;

    let passed = false;
    for (let r = 1; r < s; r += 1) {
      x = (x * x) % n;
      if (x === n - 1n) {
        passed = true;
        break;
      }
    }

    if (!passed) return false;
  }

  return true;
};

const generatePrime = (bits, options = {}) => {
  const rounds = options.rounds || 40;
  const maxAttempts = options.maxAttempts || 100000;

  if (!Number.isInteger(bits) || bits < 16) {
    throw new RangeError('bits must be an integer greater than or equal to 16');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = randomOddBigIntWithBits(bits);

    if (isDivisibleBySmallPrime(candidate)) continue;
    if (isProbablePrime(candidate, rounds)) return candidate;
  }

  throw new Error(`Failed to generate a probable prime after ${maxAttempts} attempts`);
};

const generateDistinctPrimes = (bits, count = 2, options = {}) => {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('count must be a positive integer');
  }

  const primes = [];
  while (primes.length < count) {
    const prime = generatePrime(bits, options);
    if (!primes.some((existing) => existing === prime)) {
      primes.push(prime);
    }
  }

  return primes;
};

module.exports = {
  SMALL_PRIMES,
  randomBigIntWithBits,
  randomOddBigIntWithBits,
  randomBigIntBetween,
  isDivisibleBySmallPrime,
  isProbablePrime,
  generatePrime,
  generateDistinctPrimes,
};