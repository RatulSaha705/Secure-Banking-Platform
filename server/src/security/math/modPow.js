'use strict';

/**
 * security/math/modPow.js
 *
 * Fast modular exponentiation using square-and-multiply.
 * Used by RSA encryption/decryption, RSA signing/verification, and
 * Miller-Rabin primality testing.
 */

const { toBigInt, mod } = require('./bigint');

const modPow = (base, exponent, modulus) => {
  let b = mod(toBigInt(base, 'base'), toBigInt(modulus, 'modulus'));
  let e = toBigInt(exponent, 'exponent');
  const m = toBigInt(modulus, 'modulus');

  if (m <= 0n) throw new RangeError('modulus must be positive');
  if (e < 0n) throw new RangeError('exponent must be non-negative');
  if (m === 1n) return 0n;

  let result = 1n;

  while (e > 0n) {
    if ((e & 1n) === 1n) {
      result = (result * b) % m;
    }

    e >>= 1n;
    b = (b * b) % m;
  }

  return result;
};

module.exports = { modPow };