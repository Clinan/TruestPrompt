function rotr(value: number, shift: number) {
  return (value >>> shift) | (value << (32 - shift));
}

function u32be(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function writeU32be(out: Uint8Array, offset: number, value: number) {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function concatBytes(...chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// 纯 JS 的 SHA-256（用于非安全上下文 http 环境的兜底加密/验签）
export function sha256(message: Uint8Array) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  const H = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19
  ]);

  const ml = message.length;
  const bitLenHi = Math.floor((ml * 8) / 2 ** 32) >>> 0;
  const bitLenLo = ((ml * 8) >>> 0) >>> 0;

  const padLen = ((56 - ((ml + 1) % 64)) + 64) % 64;
  const padded = new Uint8Array(ml + 1 + padLen + 8);
  padded.set(message, 0);
  padded[ml] = 0x80;
  // length (big endian)
  writeU32be(padded, padded.length - 8, bitLenHi);
  writeU32be(padded, padded.length - 4, bitLenLo);

  const W = new Uint32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = u32be(padded, i + t * 4);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (rotr(W[t - 15]!, 7) ^ rotr(W[t - 15]!, 18) ^ (W[t - 15]! >>> 3)) >>> 0;
      const s1 = (rotr(W[t - 2]!, 17) ^ rotr(W[t - 2]!, 19) ^ (W[t - 2]! >>> 10)) >>> 0;
      W[t] = (W[t - 16]! + s0 + W[t - 7]! + s1) >>> 0;
    }

    let a = H[0]!;
    let b = H[1]!;
    let c = H[2]!;
    let d = H[3]!;
    let e = H[4]!;
    let f = H[5]!;
    let g = H[6]!;
    let h = H[7]!;

    for (let t = 0; t < 64; t++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[t]! + W[t]!) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    writeU32be(out, i * 4, H[i]!);
  }
  return out;
}

export function hmacSha256(key: Uint8Array, message: Uint8Array) {
  const blockSize = 64;
  let k = key;
  if (k.length > blockSize) {
    k = sha256(k);
  }
  const k0 = new Uint8Array(blockSize);
  k0.set(k);
  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    const b = k0[i]!;
    oKeyPad[i] = b ^ 0x5c;
    iKeyPad[i] = b ^ 0x36;
  }
  const inner = sha256(concatBytes(iKeyPad, message));
  return sha256(concatBytes(oKeyPad, inner));
}

export function pbkdf2HmacSha256(password: Uint8Array, salt: Uint8Array, iterations: number, dkLen: number) {
  if (!Number.isFinite(iterations) || iterations <= 0) throw new Error('PBKDF2 iterations 不合法');
  const hLen = 32;
  const l = Math.ceil(dkLen / hLen);
  const out = new Uint8Array(l * hLen);

  const intBlock = new Uint8Array(4);
  for (let i = 1; i <= l; i++) {
    writeU32be(intBlock, 0, i);
    let u = hmacSha256(password, concatBytes(salt, intBlock));
    const t = new Uint8Array(u);
    for (let j = 2; j <= iterations; j++) {
      u = hmacSha256(password, u);
      for (let k = 0; k < hLen; k++) {
        t[k] ^= u[k]!;
      }
    }
    out.set(t, (i - 1) * hLen);
  }

  return out.slice(0, dkLen);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

