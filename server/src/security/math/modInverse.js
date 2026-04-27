'use strict';

/**
 * security/math/modInverse.js
 *
 * Extended Euclidean Algorithm and modular inverse.
 * RSA needs this to compute the private exponent d where:
 *   d * e ≡ 1 (mod phi(n))
 */

const { toBigInt, mod, gcd } = require('./bigint');

const extendedGcd = (a, b) => {
  let oldR = toBigInt(a, 'a');
  let r = toBigInt(b, 'b');
  let oldS = 1n;
  let s = 0n;
  let oldT = 0n;
  let t = 1n;

  while (r !== 0n) {
    const quotient = oldR / r;

    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
    [oldT, t] = [t, oldT - quotient * t];
  }

  if (oldR < 0n) {
    oldR = -oldR;
    oldS = -oldS;
    oldT = -oldT;
  }

  return {
    gcd: oldR,
    x: oldS,
    y: oldT,
  };
};

const modInverse = (value, modulus) => {
  const a = mod(toBigInt(value, 'value'), toBigInt(modulus, 'modulus'));
  const m = toBigInt(modulus, 'modulus');

  if (m <= 1n) throw new RangeError('modulus must be greater than 1');

  const result = extendedGcd(a, m);
  if (result.gcd !== 1n) {
    throw new Error('Modular inverse does not exist because value and modulus are not coprime');
  }

  return mod(result.x, m);
};

const hasModInverse = (value, modulus) => {
  return gcd(value, modulus) === 1n;
};

module.exports = {
  extendedGcd,
  modInverse,
  hasModInverse,
};