// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSha256 } from '@/services/ride-history/sha256';

const hashOf = (...chunks: Uint8Array[]) => {
  const sha = createSha256();
  for (const chunk of chunks) sha.update(chunk);
  return sha.digestHex();
};
const text = (value: string) => new TextEncoder().encode(value);
const nodeHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Deterministic pseudo-random bytes (no Math.random in tests). */
function bytes(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i += 1) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

describe('BR-37 / RULE-23: incremental SHA-256 file hash', () => {
  it('matches the FIPS 180-4 test vectors', () => {
    expect(hashOf()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hashOf(text('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hashOf(text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('matches Node crypto at every padding boundary', () => {
    for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129]) {
      const data = bytes(length, length);
      expect(hashOf(data)).toBe(nodeHash(data));
    }
  });

  it('gives the same hash however the data is split into chunks', () => {
    const data = bytes(10_000);
    const whole = nodeHash(data);
    const splits = [[1], [63, 1], [64, 64], [100, 7, 3000], [9_999]];

    for (const sizes of splits) {
      const chunks: Uint8Array[] = [];
      let offset = 0;
      for (const size of sizes) {
        chunks.push(data.subarray(offset, offset + size));
        offset += size;
      }
      chunks.push(data.subarray(offset));
      expect(hashOf(...chunks)).toBe(whole);
    }
  });

  it('hashes chunks that are views into larger buffers', () => {
    const backing = bytes(300);

    expect(hashOf(backing.subarray(3, 203))).toBe(nodeHash(backing.subarray(3, 203)));
  });

  it('cannot be used after it has finished', () => {
    const sha = createSha256();
    sha.digestHex();

    expect(() => sha.update(text('x'))).toThrow();
    expect(() => sha.digestHex()).toThrow();
  });
});
