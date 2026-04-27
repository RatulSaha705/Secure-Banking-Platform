'use strict';

/**
 * security/ecc/ecc.curve.js
 *
 * Educational from-scratch elliptic curve arithmetic over a prime field.
 * This module uses secp256k1-compatible curve parameters, but all point
 * addition, doubling, scalar multiplication, and square-root logic are
 * implemented manually for the project requirement.
 */

const { mod, toBigInt, bitLength } = require('../math/bigint');
const { modInverse } = require('../math/modInverse');
const { modPow } = require('../math/modPow');

const CURVE = Object.freeze({
  name: 'secp256k1-lab',
  p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn,
  a: 0n,
  b: 7n,
  n: 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,
  h: 1n,
  gx: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  gy: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
});

const POINT_INFINITY = Object.freeze({ infinity: true });

const G = Object.freeze({
  x: CURVE.gx,
  y: CURVE.gy,
  infinity: false,
});

const isInfinity = (point) => point && point.infinity === true;

const createPoint = (x, y) => ({
  x: mod(toBigInt(x, 'x'), CURVE.p),
  y: mod(toBigInt(y, 'y'), CURVE.p),
  infinity: false,
});

const normalizePoint = (point, name = 'point') => {
  if (!point || typeof point !== 'object') {
    throw new TypeError(`${name} must be a point object`);
  }

  if (isInfinity(point)) return POINT_INFINITY;

  if (point.x === undefined || point.y === undefined) {
    throw new TypeError(`${name} must contain x and y`);
  }

  return createPoint(point.x, point.y);
};

const isOnCurve = (pointInput) => {
  const point = normalizePoint(pointInput);
  if (isInfinity(point)) return true;

  const left = mod(point.y * point.y, CURVE.p);
  const right = mod(point.x * point.x * point.x + CURVE.a * point.x + CURVE.b, CURVE.p);

  return left === right;
};

const assertOnCurve = (point, name = 'point') => {
  if (!isOnCurve(point)) {
    throw new Error(`${name} is not on the configured elliptic curve`);
  }
};

const negatePoint = (pointInput) => {
  const point = normalizePoint(pointInput);
  if (isInfinity(point)) return POINT_INFINITY;
  return createPoint(point.x, -point.y);
};

const addPoints = (leftInput, rightInput) => {
  const left = normalizePoint(leftInput, 'left point');
  const right = normalizePoint(rightInput, 'right point');

  assertOnCurve(left, 'left point');
  assertOnCurve(right, 'right point');

  if (isInfinity(left)) return right;
  if (isInfinity(right)) return left;

  if (left.x === right.x && mod(left.y + right.y, CURVE.p) === 0n) {
    return POINT_INFINITY;
  }

  let slope;

  if (left.x === right.x && left.y === right.y) {
    if (left.y === 0n) return POINT_INFINITY;

    const numerator = 3n * left.x * left.x + CURVE.a;
    const denominator = modInverse(2n * left.y, CURVE.p);
    slope = mod(numerator * denominator, CURVE.p);
  } else {
    const numerator = right.y - left.y;
    const denominator = modInverse(right.x - left.x, CURVE.p);
    slope = mod(numerator * denominator, CURVE.p);
  }

  const x3 = mod(slope * slope - left.x - right.x, CURVE.p);
  const y3 = mod(slope * (left.x - x3) - left.y, CURVE.p);

  return createPoint(x3, y3);
};

const doublePoint = (pointInput) => addPoints(pointInput, pointInput);

const scalarMultiply = (scalarInput, pointInput = G) => {
  let scalar = mod(toBigInt(scalarInput, 'scalar'), CURVE.n);
  let addend = normalizePoint(pointInput, 'point');

  assertOnCurve(addend, 'point');

  if (scalar === 0n || isInfinity(addend)) return POINT_INFINITY;

  let result = POINT_INFINITY;

  while (scalar > 0n) {
    if ((scalar & 1n) === 1n) {
      result = addPoints(result, addend);
    }

    addend = doublePoint(addend);
    scalar >>= 1n;
  }

  return result;
};

const serializePoint = (pointInput) => {
  const point = normalizePoint(pointInput);
  if (isInfinity(point)) return { infinity: true };

  return {
    infinity: false,
    x: point.x.toString(),
    y: point.y.toString(),
  };
};

const deserializePoint = (pointInput, name = 'point') => {
  const point = normalizePoint(pointInput, name);
  assertOnCurve(point, name);
  return point;
};

const modSqrt = (value) => {
  const n = mod(toBigInt(value, 'value'), CURVE.p);

  if (n === 0n) return 0n;

  // secp256k1 prime p is congruent to 3 mod 4, so sqrt(n) can be computed as:
  // n^((p + 1) / 4) mod p, when a square root exists.
  if (CURVE.p % 4n !== 3n) {
    throw new Error('modSqrt shortcut requires p % 4 === 3');
  }

  const root = modPow(n, (CURVE.p + 1n) / 4n, CURVE.p);
  if (mod(root * root, CURVE.p) !== n) return null;

  return root;
};

const pointFromX = (xInput, preferEvenY = true) => {
  const x = mod(toBigInt(xInput, 'x'), CURVE.p);
  const rhs = mod(x * x * x + CURVE.a * x + CURVE.b, CURVE.p);
  const yRoot = modSqrt(rhs);

  if (yRoot === null) return null;

  const isEven = (yRoot & 1n) === 0n;
  const y = isEven === preferEvenY ? yRoot : mod(-yRoot, CURVE.p);

  return createPoint(x, y);
};

const validatePrivateScalar = (scalarInput) => {
  const scalar = toBigInt(scalarInput, 'private scalar');

  if (scalar <= 0n || scalar >= CURVE.n) {
    throw new RangeError('private scalar must be in range 1..n-1');
  }

  return scalar;
};

module.exports = {
  CURVE,
  G,
  POINT_INFINITY,
  isInfinity,
  createPoint,
  normalizePoint,
  isOnCurve,
  assertOnCurve,
  negatePoint,
  addPoints,
  doublePoint,
  scalarMultiply,
  serializePoint,
  deserializePoint,
  modSqrt,
  pointFromX,
  validatePrivateScalar,
  bitLength,
};