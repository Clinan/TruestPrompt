import type { ProviderProfile } from '../core/types';
import { decryptBytes, encryptBytes, unzipSingleFile, zipSingleFile } from '../core/utils/secureZip';

export async function buildProvidersExportZip(providers: ProviderProfile[], password: string) {
  const json = JSON.stringify(providers, null, 2);
  const encrypted = await encryptBytes(json, password);
  const zip = zipSingleFile('providers.pfz', encrypted);
  return new Blob([zip], { type: 'application/zip' });
}

export async function parseProvidersImportZip(file: File, password: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { data } = unzipSingleFile(bytes);
  const json = await decryptBytes(data, password);
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) throw new Error('providers 数据格式不正确');
  const valid = (parsed as any[]).every(
    (p) =>
      p &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.apiKey === 'string' &&
      typeof p.baseUrl === 'string' &&
      typeof p.pluginId === 'string'
  );
  if (!valid) throw new Error('providers 字段不完整');
  return parsed as ProviderProfile[];
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

