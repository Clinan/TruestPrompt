/**
 * cURL Parser - 解析 cURL 命令并提取配置信息
 * 
 * 使用 parse-curl 开源库进行解析
 * 
 * 功能：
 * - 解析 cURL 命令字符串
 * - 检测 API Provider 类型
 * - 提取 API Key、模型 ID、消息等
 */

import parseCurlLib from 'parse-curl';
import type { ProviderProfile, Slot } from '../core/types';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * cURL 解析错误
 */
export class CurlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurlParseError';
  }
}

/**
 * 解析后的 cURL 命令结构
 */
export interface ParsedCurl {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown | null;
  apiKey: string | null;
}

/**
 * 提取的消息结构
 */
export interface ExtractedMessages {
  modelId: string | null;
  messages: Array<{ role: string; content: string }> | null;
  systemPrompt: string | null;
}

/**
 * cURL 导入结果
 */
export interface CurlImportResult {
  targetProjectId: string;
  provider: {
    id: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    pluginId: string;
    isNew: boolean;
  };
  modelId: string | null;
  messages: Array<{ role: string; content: string }> | null;
  systemPrompt: string | null;
}


// ============================================================================
// Plugin URL Patterns
// ============================================================================

/**
 * URL 模式到插件 ID 的映射
 */
export const PLUGIN_URL_PATTERNS: Array<{ pattern: RegExp; pluginId: string; name: string }> = [
  { pattern: /api\.openai\.com/i, pluginId: 'openai-compatible', name: 'OpenAI' },
  { pattern: /generativelanguage\.googleapis\.com/i, pluginId: 'Gemini', name: 'Gemini' },
  { pattern: /dashscope\.aliyuncs\.com/i, pluginId: 'aliyun-dashscope', name: 'Aliyun DashScope' },
  { pattern: /api\.moonshot\.cn/i, pluginId: 'kimi-moonshot', name: 'Kimi' },
  { pattern: /ark\.cn-beijing\.volces\.com/i, pluginId: 'ark-bytedance', name: 'Ark' },
];

/**
 * 默认系统提示词（用于判断 Slot 是否为默认内容）
 */
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant focused on prompt debugging insights.';


// ============================================================================
// Core Parsing Functions
// ============================================================================

/**
 * 解析 cURL 命令字符串
 * 
 * @param curlCommand - cURL 命令字符串
 * @returns ParsedCurl 对象
 * @throws CurlParseError 如果解析失败
 */
export function parseCurl(curlCommand: string): ParsedCurl {
  // 验证输入
  const trimmed = curlCommand.trim();
  if (!trimmed) {
    throw new CurlParseError('请输入 cURL 命令');
  }

  // 检查是否以 curl 开头
  if (!trimmed.toLowerCase().startsWith('curl')) {
    throw new CurlParseError('无效的 cURL 命令格式');
  }

  try {
    // 使用 parse-curl 解析
    const parsed = parseCurlLib(trimmed);

    // 提取 URL
    const url = parsed.url;
    if (!url) {
      throw new CurlParseError('未找到有效的请求 URL');
    }

    // 提取 HTTP 方法
    const method = (parsed.method || 'GET').toUpperCase();

    // 提取 headers（parse-curl 使用 header 而非 headers）
    const headers: Record<string, string> = {};
    if (parsed.header) {
      for (const [key, value] of Object.entries(parsed.header)) {
        if (typeof value === 'string') {
          headers[key] = value;
        }
      }
    }

    // 提取 body
    let body: unknown | null = null;
    if (parsed.body) {
      if (typeof parsed.body === 'string') {
        try {
          body = JSON.parse(parsed.body);
        } catch {
          body = parsed.body;
        }
      } else {
        body = parsed.body;
      }
    }

    // 提取 API Key
    const apiKey = extractApiKey(headers);

    return {
      url,
      method,
      headers,
      body,
      apiKey,
    };
  } catch (error) {
    if (error instanceof CurlParseError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : '解析失败';
    throw new CurlParseError(`cURL 解析失败: ${message}`);
  }
}


// ============================================================================
// Plugin Detection
// ============================================================================

/**
 * 根据 URL 检测插件 ID
 */
export function detectPluginId(url: string): string {
  for (const { pattern, pluginId } of PLUGIN_URL_PATTERNS) {
    if (pattern.test(url)) {
      return pluginId;
    }
  }
  return 'openai-compatible';
}

/**
 * 根据 URL 获取插件名称
 */
export function detectPluginName(url: string): string {
  for (const { pattern, name } of PLUGIN_URL_PATTERNS) {
    if (pattern.test(url)) {
      return name;
    }
  }
  return 'OpenAI Compatible';
}


// ============================================================================
// API Key Extraction
// ============================================================================

/**
 * 从请求头中提取 API Key
 */
export function extractApiKey(headers: Record<string, string>): string | null {
  const authKey = Object.keys(headers).find(
    key => key.toLowerCase() === 'authorization'
  );

  if (!authKey) {
    return null;
  }

  const authValue = headers[authKey];

  if (authValue.toLowerCase().startsWith('bearer ')) {
    return authValue.slice(7).trim();
  }

  return authValue.trim() || null;
}


// ============================================================================
// Model and Messages Extraction
// ============================================================================

/**
 * 从请求体中提取模型 ID 和消息
 */
export function extractModelAndMessages(body: unknown): ExtractedMessages {
  if (!body || typeof body !== 'object') {
    return { modelId: null, messages: null, systemPrompt: null };
  }

  const bodyObj = body as Record<string, unknown>;
  const modelId = typeof bodyObj.model === 'string' ? bodyObj.model : null;

  let messages: Array<{ role: string; content: string }> | null = null;
  let systemPrompt: string | null = null;

  if (Array.isArray(bodyObj.messages)) {
    const allMessages: Array<{ role: string; content: string }> = [];

    for (const msg of bodyObj.messages) {
      if (msg && typeof msg === 'object') {
        const msgObj = msg as Record<string, unknown>;
        const role = typeof msgObj.role === 'string' ? msgObj.role : 'user';
        const content = typeof msgObj.content === 'string' ? msgObj.content : '';

        if (role === 'system') {
          systemPrompt = content;
        } else {
          allMessages.push({ role, content });
        }
      }
    }

    if (allMessages.length > 0) {
      messages = allMessages;
    }
  }

  return { modelId, messages, systemPrompt };
}


// ============================================================================
// Provider Management
// ============================================================================

/**
 * 在 Provider 列表中查找匹配的 Provider
 */
export function findMatchingProvider(
  providers: ProviderProfile[],
  baseUrl: string,
  pluginId: string,
  apiKey?: string | null
): ProviderProfile | null {
  return providers.find(p => {
    if (p.baseUrl !== baseUrl || p.pluginId !== pluginId) {
      return false;
    }
    if (apiKey !== undefined && apiKey !== null) {
      return p.apiKey === apiKey;
    }
    return true;
  }) || null;
}

/**
 * 生成唯一的 Provider 名称
 */
export function generateUniqueProviderName(
  existingNames: string[],
  baseName: string
): string {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }

  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const newName = `${baseName}-${suffix}`;

  if (existingNames.includes(newName)) {
    return generateUniqueProviderName(existingNames, baseName);
  }

  return newName;
}


// ============================================================================
// Slot Decision Logic
// ============================================================================

/**
 * 检查 Slot 是否为默认/空内容
 */
export function isSlotDefault(slot: Slot): boolean {
  if (slot.status !== 'idle') {
    return false;
  }

  if (slot.output && slot.output.trim()) {
    return false;
  }

  const systemPrompt = slot.systemPrompt?.trim() || '';
  const isDefaultPrompt = systemPrompt === '' || systemPrompt === DEFAULT_SYSTEM_PROMPT;

  return isDefaultPrompt;
}

/**
 * 决定是否应该覆盖现有 Slot
 */
export function shouldOverwriteSlot(slots: Slot[]): boolean {
  if (slots.length !== 1) {
    return false;
  }

  return isSlotDefault(slots[0]);
}
