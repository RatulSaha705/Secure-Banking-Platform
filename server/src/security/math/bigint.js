'use strict';

/**
 * security/math/bigint.js
 *
 * Small BigInt helper functions used by the from-scratch RSA/ECC modules.
 * These helpers do not perform encryption by themselves; they provide safe,
 * reusable number conversion and arithmetic primitives.
 */

const toBigInt = (value, name = 'value') => {
  if (typeof value === 'bigint') return value;

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`${name} must be a safe integer when passed as a number`);
    }
    return BigInt(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) throw new TypeError(`${name} cannot be an empty string`);
    return BigInt(trimmed);
  }

  throw new TypeError(`${name} must be a bigint, safe integer number, or integer string`);
};

const assertBigInt = (value, name = 'value') => {
  if (typeof value !== 'bigint') {
    throw new TypeError(`${name} must be a BigInt`);
  }
};

const assertPositive = (value, name = 'value') => {
  assertBigInt(value, name);
  if (value <= 0n) throw new RangeError(`${name} must be positive`);
};

const assertNonNegative = (value, name = 'value') => {
  assertBigInt(value, name);
  if (value < 0n) throw new RangeError(`${name} must be non-negative`);
};

const mod = (value, modulus) => {
  const a = toBigInt(value, 'value');
  const m = toBigInt(modulus, 'modulus');

  if (m <= 0n) throw new RangeError('modulus must be positive');
  const result = a % m;
  return result >= 0n ? result : result + m;
};

const abs = (value) => {
  const n = toBigInt(value, 'value');
  return n < 0n ? -n : n;
};

const gcd = (a, b) => {
  let x = abs(a);
  let y = abs(b);

  while (y !== 0n) {
    const temp = y;
    y = x % y;
    x = temp;
  }

  return x;
};

const lcm = (a, b) => {
  const x = toBigInt(a, 'a');
  const y = toBigInt(b, 'b');

  if (x === 0n || y === 0n) return 0n;
  return abs((x / gcd(x, y)) * y);
};

const areCoprime = (a, b) => gcd(a, b) === 1n;

const bitLength = (value) => {
  const n = abs(value);
  if (n === 0n) return 0;
  return n.toString(2).length;
};

const byteLength = (value) => Math.ceil(bitLength(value) / 8);

const bigIntToHex = (value, minBytes = 0) => {
  const n = toBigInt(value, 'value');
  if (n < 0n) throw new RangeError('Cannot convert negative BigInt to unsigned hex');

  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;

  const minHexLength = minBytes * 2;
  if (hex.length < minHexLength) {
    hex = hex.padStart(minHexLength, '0');
  }

  return hex;
};

const hexToBigInt = (hex, name = 'hex') => {
  if (typeof hex !== 'string') throw new TypeError(`${name} must be a string`);

  let clean = hex.trim().toLowerCase();
  if (clean.startsWith('0x')) clean = clean.slice(2);
  if (!clean) return 0n;
  if (!/^[0-9a-f]+$/u.test(clean)) throw new TypeError(`${name} must be a valid hex string`);

  return BigInt(`0x${clean}`);
};

const bigIntToBuffer = (value, minBytes = 0) => {
  const hex = bigIntToHex(value, minBytes);
  return Buffer.from(hex, 'hex');
};

const bufferToBigInt = (buffer, name = 'buffer') => {
  if (!Buffer.isBuffer(buffer)) throw new TypeError(`${name} must be a Buffer`);
  if (buffer.length === 0) return 0n;
  return hexToBigInt(buffer.toString('hex'), name);
};

const textToBigInt = (text) => {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  return bufferToBigInt(Buffer.from(text, 'utf8'), 'text buffer');
};

const bigIntToText = (value) => {
  const buffer = bigIntToBuffer(value);
  return buffer.toString('utf8');
};

module.exports = {
  toBigInt,
  assertBigInt,
  assertPositive,
  assertNonNegative,
  mod,
  abs,
  gcd,
  lcm,
  areCoprime,
  bitLength,
  byteLength,
  bigIntToHex,
  hexToBigInt,
  bigIntToBuffer,
  bufferToBigInt,
  textToBigInt,
  bigIntToText,
};