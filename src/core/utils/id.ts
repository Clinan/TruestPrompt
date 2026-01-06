function hex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function uuidFromRandomBytes(bytes: Uint8Array) {
  // RFC 4122 v4
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newId() {
  const c = (globalThis as any).crypto as Crypto | undefined;
  if (c && typeof (c as any).randomUUID === 'function') {
    return (c as any).randomUUID() as string;
  }
  if (c && typeof c.getRandomValues === 'function') {
    return uuidFromRandomBytes(c.getRandomValues(new Uint8Array(16)));
  }
  // 非加密强度的兜底：用于 UI 内部 id（slot/prompt/history），避免旧浏览器直接报错
  const rand = () => Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `${rand().slice(0, 8)}-${rand().slice(0, 4)}-4${rand().slice(0, 3)}-a${rand().slice(0, 3)}-${rand()}${rand().slice(0, 4)}`;
}

