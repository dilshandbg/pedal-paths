/*
 * Incremental SHA-256 (FIPS 180-4) for the upload file hash (BR-37, RULE-23, ADR-0013 §4). Web
 * Crypto only hashes a whole buffer, and an export can be several GB, so the import worker feeds
 * the ZIP's stream chunks through this as they are read: the file is read once and never held in
 * memory whole.
 */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const BLOCK_BYTES = 64;

export interface Sha256 {
  /** Adds bytes to the hash. Not allowed after `digestHex`. */
  update(bytes: Uint8Array): void;
  /** Finishes the hash: 64 lowercase hex characters. */
  digestHex(): string;
}

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function createSha256(): Sha256 {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w: number[] = new Array<number>(64).fill(0);
  const pending = new Uint8Array(BLOCK_BYTES);
  let pendingLength = 0;
  let totalBytes = 0;
  let finished = false;

  /** Processes the 64-byte block at `offset` of `view`. */
  const compress = (view: DataView, offset: number) => {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choice + (K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + s0 + majority) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  };

  const pendingView = new DataView(pending.buffer);

  const update = (bytes: Uint8Array) => {
    if (finished) throw new Error('SHA-256 already finished.');
    totalBytes += bytes.byteLength;
    let offset = 0;
    if (pendingLength > 0) {
      const take = Math.min(BLOCK_BYTES - pendingLength, bytes.byteLength);
      pending.set(bytes.subarray(0, take), pendingLength);
      pendingLength += take;
      offset = take;
      if (pendingLength < BLOCK_BYTES) return;
      compress(pendingView, 0);
      pendingLength = 0;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (; offset + BLOCK_BYTES <= bytes.byteLength; offset += BLOCK_BYTES) {
      compress(view, offset);
    }
    pending.set(bytes.subarray(offset), 0);
    pendingLength = bytes.byteLength - offset;
  };

  return {
    update,
    digestHex() {
      if (finished) throw new Error('SHA-256 already finished.');
      const bitLength = totalBytes * 8;
      // 0x80, zeros up to 56 mod 64, then the message length in bits as a 64-bit big-endian.
      const padding = new Uint8Array((pendingLength < 56 ? 56 : 120) - pendingLength + 8);
      padding[0] = 0x80;
      const view = new DataView(padding.buffer);
      view.setUint32(padding.length - 8, Math.floor(bitLength / 2 ** 32));
      view.setUint32(padding.length - 4, bitLength >>> 0);
      update(padding);
      finished = true;
      return [h0, h1, h2, h3, h4, h5, h6, h7]
        .map((word) => word.toString(16).padStart(8, '0'))
        .join('');
    },
  };
}
