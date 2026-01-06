import { constantTimeEqual, hmacSha256, pbkdf2HmacSha256 } from './fallbackCrypto';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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

function u32le(value: number) {
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setUint32(0, value >>> 0, true);
  return out;
}

function u16le(value: number) {
  const out = new Uint8Array(2);
  const view = new DataView(out.buffer);
  view.setUint16(0, value & 0xffff, true);
  return out;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipSingleFile(filename: string, fileData: Uint8Array) {
  const fileNameBytes = textEncoder.encode(filename);
  const crc = crc32(fileData);
  const compSize = fileData.length;
  const uncompSize = fileData.length;

  const localHeader = concatBytes(
    u32le(0x04034b50),
    u16le(20), // version needed
    u16le(0), // flags
    u16le(0), // compression: store
    u16le(0), // mod time
    u16le(0), // mod date
    u32le(crc),
    u32le(compSize),
    u32le(uncompSize),
    u16le(fileNameBytes.length),
    u16le(0), // extra length
    fileNameBytes
  );

  const localOffset = localHeader.length; // file data starts immediately after header
  const centralHeader = concatBytes(
    u32le(0x02014b50),
    u16le(20), // version made by
    u16le(20), // version needed
    u16le(0), // flags
    u16le(0), // compression
    u16le(0),
    u16le(0),
    u32le(crc),
    u32le(compSize),
    u32le(uncompSize),
    u16le(fileNameBytes.length),
    u16le(0),
    u16le(0),
    u16le(0),
    u16le(0),
    u32le(0),
    u32le(0), // local header offset (we write at 0)
    fileNameBytes
  );

  const centralDirOffset = localHeader.length + fileData.length;
  const end = concatBytes(
    u32le(0x06054b50),
    u16le(0),
    u16le(0),
    u16le(1),
    u16le(1),
    u32le(centralHeader.length),
    u32le(centralDirOffset),
    u16le(0)
  );

  return concatBytes(localHeader, fileData, centralHeader, end);
}

export function unzipSingleFile(zipBytes: Uint8Array) {
  // 兼容性：允许 zip 前面存在少量前缀字节（例如某些封装/传输导致的前缀）
  const viewAll = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let headerOffset = -1;
  for (let i = 0; i <= zipBytes.length - 4; i++) {
    if (viewAll.getUint32(i, true) === 0x04034b50) {
      headerOffset = i;
      break;
    }
  }
  if (headerOffset < 0) throw new Error('不是有效的 zip 文件（找不到 local header）');

  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset + headerOffset, zipBytes.byteLength - headerOffset);
  const fileNameLen = view.getUint16(26, true);
  const extraLen = view.getUint16(28, true);
  const compMethod = view.getUint16(8, true);
  const compSize = view.getUint32(18, true);
  if (compMethod !== 0) throw new Error('暂不支持压缩格式（仅支持 store）');
  const nameStart = 30;
  const nameEnd = nameStart + fileNameLen;
  const dataStart = nameEnd + extraLen;
  const dataEnd = dataStart + compSize;
  if (dataEnd > view.byteLength) throw new Error('zip 文件已损坏（数据长度不匹配）');
  const raw = zipBytes.slice(headerOffset);
  const filename = textDecoder.decode(raw.slice(nameStart, nameEnd));
  const data = raw.slice(dataStart, dataEnd);
  return { filename, data };
}

export async function encryptBytes(plainText: string, password: string) {
  // PFZ2：纯 JS 加密/验签格式（兼容 http/https）
  // 备注：不是标准 zip 密码格式，是本应用自定义导入/导出容器；安全性取决于密码强度。
  const cryptoAny = (globalThis as any).crypto as Crypto | undefined;
  const salt = new Uint8Array(16);
  const nonce = new Uint8Array(12);
  if (cryptoAny?.getRandomValues) {
    cryptoAny.getRandomValues(salt);
    cryptoAny.getRandomValues(nonce);
  } else {
    for (let i = 0; i < salt.length; i++) salt[i] = Math.floor(Math.random() * 256);
    for (let i = 0; i < nonce.length; i++) nonce[i] = Math.floor(Math.random() * 256);
  }

  const iterations = 50_000;
  const pwd = textEncoder.encode(password);
  const key = pbkdf2HmacSha256(pwd, salt, iterations, 32);
  const plainBytes = textEncoder.encode(plainText);

  // 基于 HMAC 的伪随机流做 XOR（类似流加密）；并使用 HMAC 校验完整性
  const streamKey = key;
  const cipher = new Uint8Array(plainBytes.length);
  let counter = 0;
  for (let offset = 0; offset < plainBytes.length; offset += 32) {
    const counterBytes = u32le(counter++);
    const block = hmacSha256(streamKey, concatBytes(nonce, counterBytes));
    const take = Math.min(32, plainBytes.length - offset);
    for (let i = 0; i < take; i++) {
      cipher[offset + i] = plainBytes[offset + i]! ^ block[i]!;
    }
  }

  const magic = textEncoder.encode('PFZ2');
  const iterBytes = u32le(iterations);
  const header = concatBytes(magic, salt, iterBytes, nonce);
  const tag = hmacSha256(streamKey, concatBytes(header, cipher));
  return concatBytes(header, cipher, tag);
}

export async function decryptBytes(payload: Uint8Array, password: string) {
  const magic = textDecoder.decode(payload.slice(0, 4));
  if (magic !== 'PFZ2') throw new Error('加密数据格式不正确');
  const salt = payload.slice(4, 20);
  const iterations = new DataView(payload.buffer, payload.byteOffset + 20, 4).getUint32(0, true);
  const nonce = payload.slice(24, 36);
  const tagLen = 32;
  const cipherStart = 36;
  const cipherEnd = payload.length - tagLen;
  if (cipherEnd < cipherStart) throw new Error('加密数据已损坏（长度不合法）');
  const cipher = payload.slice(cipherStart, cipherEnd);
  const tag = payload.slice(cipherEnd);

  const pwd = textEncoder.encode(password);
  const key = pbkdf2HmacSha256(pwd, salt, iterations, 32);
  const header = payload.slice(0, 36);
  const expectedTag = hmacSha256(key, concatBytes(header, cipher));
  if (!constantTimeEqual(tag, expectedTag)) {
    throw new Error('密码错误或文件已损坏（校验失败）');
  }

  const plain = new Uint8Array(cipher.length);
  let counter = 0;
  for (let offset = 0; offset < cipher.length; offset += 32) {
    const counterBytes = u32le(counter++);
    const block = hmacSha256(key, concatBytes(nonce, counterBytes));
    const take = Math.min(32, cipher.length - offset);
    for (let i = 0; i < take; i++) {
      plain[offset + i] = cipher[offset + i]! ^ block[i]!;
    }
  }

  return textDecoder.decode(plain);
}
