/**
 * Image Utilities
 * 使用浏览器原生 API 处理图片
 * 
 * Requirements: 1.4, 3.3, 4.4
 */

/**
 * 将文件转换为 Base64 data URL
 * 使用 FileReader API
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = () => {
      reject(new Error(`文件读取失败: ${file.name}`));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 获取图片 MIME 类型
 * 直接从 File.type 获取
 */
export function getImageMimeType(file: File): string {
  return file.type || 'image/png';
}

/**
 * 估算 Base64 数据大小
 * Base64 编码后大小约为原始大小的 4/3
 */
export function estimateBase64Size(base64: string): string {
  // 移除 data URL 前缀
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const bytes = Math.ceil((base64Data.length * 3) / 4);
  
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 验证图片 URL 格式
 * 使用 URL API
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // 支持 data URL
  if (url.startsWith('data:image/')) return true;
  
  try {
    const parsed = new URL(url);
    // 检查协议
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // 检查常见图片扩展名（可选，因为有些 URL 没有扩展名）
    return true;
  } catch {
    return false;
  }
}

/**
 * 从 data URL 提取 Base64 和 MIME 类型
 */
export function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return null;
  
  return {
    mimeType: match[1],
    base64: match[2]
  };
}

/**
 * 构建 data URL
 */
export function buildDataUrl(base64: string, mimeType: string): string {
  // 如果已经是 data URL，直接返回
  if (base64.startsWith('data:')) return base64;
  return `data:${mimeType};base64,${base64}`;
}

/**
 * 支持的图片类型
 */
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

/**
 * 支持的图片扩展名
 */
export const SUPPORTED_IMAGE_EXTENSIONS = '.jpg,.jpeg,.png,.gif,.webp';

/**
 * 验证文件是否为支持的图片类型
 */
export function isSupportedImageType(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(file.type);
}

/**
 * 获取图片类型显示名称
 */
export function getImageTypeLabel(type: 'url' | 'base64'): string {
  return type === 'url' ? 'URL' : 'Base64';
}
