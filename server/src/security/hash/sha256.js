'use strict';

/**
 * security/hash/sha256.js
 *
 * Pure JavaScript SHA-256 implementation for the CSE447 secure banking project.
 * No Node crypto hashing function is used here.
 *
 * Exports:
 *   sha256Buffer(input)
 *   sha256Hex(input)
 */

const ROTR = (value, bits) => ((value >>> bits) | (value << (32 - bits))) >>> 0;
const SHR = (value, bits) => value >>> bits;

const CH = (x, y, z) => ((x & y) ^ (~x & z)) >>> 0;
const MAJ = (x, y, z) => ((x & y) ^ (x & z) ^ (y & z)) >>> 0;

const BIG_SIGMA_0 = (x) => (ROTR(x, 2) ^ ROTR(x, 13) ^ ROTR(x, 22)) >>> 0;
const BIG_SIGMA_1 = (x) => (ROTR(x, 6) ^ ROTR(x, 11) ^ ROTR(x, 25)) >>> 0;
const SMALL_SIGMA_0 = (x) => (ROTR(x, 7) ^ ROTR(x, 18) ^ SHR(x, 3)) >>> 0;
const SMALL_SIGMA_1 = (x) => (ROTR(x, 17) ^ ROTR(x, 19) ^ SHR(x, 10)) >>> 0;

const INITIAL_HASH = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const normalizeInput = (input) => {
  if (Buffer.isBuffer(input)) return Buffer.from(input);
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === 'string') return Buffer.from(input, 'utf8');

  throw new TypeError('SHA-256 input must be a string, Buffer, or Uint8Array');
};

const createPaddedMessage = (message) => {
  const originalLengthBytes = message.length;
  const originalLengthBits = BigInt(originalLengthBytes) * 8n;

  let paddedLength = originalLengthBytes + 1 + 8;
  while (paddedLength % 64 !== 0) paddedLength += 1;

  const padded = Buffer.alloc(paddedLength);
  message.copy(padded, 0);
  padded[originalLengthBytes] = 0x80;

  const high = Number((originalLengthBits >> 32n) & 0xffffffffn);
  const low = Number(originalLengthBits & 0xffffffffn);

  padded.writeUInt32BE(high >>> 0, paddedLength - 8);
  padded.writeUInt32BE(low >>> 0, paddedLength - 4);

  return padded;
};

const wordsToBuffer = (words) => {
  const output = Buffer.alloc(32);

  for (let i = 0; i < 8; i += 1) {
    output.writeUInt32BE(words[i] >>> 0, i * 4);
  }

  return output;
};

const sha256Buffer = (input) => {
  const message = normalizeInput(input);
  const padded = createPaddedMessage(message);
  const hash = INITIAL_HASH.slice();

  const w = new Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = padded.readUInt32BE(offset + i * 4) >>> 0;
    }

    for (let i = 16; i < 64; i += 1) {
      w[i] = (
        SMALL_SIGMA_1(w[i - 2]) +
        w[i - 7] +
        SMALL_SIGMA_0(w[i - 15]) +
        w[i - 16]
      ) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let i = 0; i < 64; i += 1) {
      const temp1 = (h + BIG_SIGMA_1(e) + CH(e, f, g) + ROUND_CONSTANTS[i] + w[i]) >>> 0;
      const temp2 = (BIG_SIGMA_0(a) + MAJ(a, b, c)) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return wordsToBuffer(hash);
};

const sha256Hex = (input) => sha256Buffer(input).toString('hex');

module.exports = {
  sha256Buffer,
  sha256Hex,
};