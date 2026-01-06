/**
 * cURL Parser Tests
 * 
 * Property-based tests using fast-check to verify correctness properties
 * defined in the design document.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseCurl,
  detectPluginId,
  extractApiKey,
  extractModelAndMessages,
  findMatchingProvider,
  generateUniqueProviderName,
  isSlotDefault,
  shouldOverwriteSlot,
  CurlParseError,
  PLUGIN_URL_PATTERNS,
  DEFAULT_SYSTEM_PROMPT,
} from '../lib/curlParser';
import type { ProviderProfile, Slot } from '../core/types';

// ============================================================================
// Test Generators
// ============================================================================

// 生成有效的 header 名称（不含特殊字符）
const headerNameArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => /^[a-zA-Z0-9\-_]+$/.test(s));

// 生成有效的 header 值（不含引号和换行）
const headerValueArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => /^[a-zA-Z0-9\-_. /=]+$/.test(s));

// 生成 API Key
const apiKeyArb = fc.string({ minLength: 10, maxLength: 64 })
  .filter(s => /^[a-zA-Z0-9\-_]+$/.test(s));

// 生成模型 ID
const modelIdArb = fc.string({ minLength: 3, maxLength: 30 })
  .filter(s => /^[a-z0-9\-_.]+$/.test(s));

// 生成消息角色
const roleArb = fc.constantFrom('system', 'user', 'assistant');

// 生成消息内容
const messageContentArb = fc.string({ minLength: 1, maxLength: 100 });

// 生成消息对象
const messageArb = fc.record({
  role: roleArb,
  content: messageContentArb,
});

// 生成 Provider
const providerArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  apiKey: apiKeyArb,
  baseUrl: fc.webUrl(),
  pluginId: fc.constantFrom('openai-compatible', 'Gemini', 'aliyun-dashscope', 'kimi-moonshot', 'ark-bytedance'),
});

// 生成 Slot
const slotArb = fc.record({
  id: fc.uuid(),
  providerProfileId: fc.option(fc.uuid(), { nil: null }),
  pluginId: fc.constantFrom('openai-compatible', 'Gemini'),
  modelId: modelIdArb,
  systemPrompt: fc.string({ maxLength: 200 }),
  paramOverride: fc.constant(null),
  selected: fc.boolean(),
  status: fc.constantFrom('idle', 'running', 'done', 'error', 'canceled') as fc.Arbitrary<'idle' | 'running' | 'done' | 'error' | 'canceled'>,
  output: fc.string({ maxLength: 100 }),
  toolCalls: fc.constant(null),
  metrics: fc.constant({ ttfbMs: null, totalMs: null }),
});

// ============================================================================
// Property 1: cURL Parsing Extracts All Required Fields
// **Feature: curl-import, Property 1: cURL Parsing Extracts All Required Fields**
// **Validates: Requirements 1.4**
// ============================================================================

describe('Property 1: cURL Parsing Extracts All Required Fields', () => {
  it('should extract URL from valid cURL commands', () => {
    // 使用简单的 URL 格式避免特殊字符问题
    const testUrls = [
      'https://api.openai.com/v1/chat/completions',
      'https://example.com/api',
      'http://localhost:3000/test',
    ];

    for (const url of testUrls) {
      const curlCmd = `curl ${url}`;
      const result = parseCurl(curlCmd);
      expect(result.url).toBe(url);
    }
  });

  it('should extract headers from cURL commands', () => {
    const testCases = [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Authorization', value: 'Bearer sk-test123' },
      { name: 'X-Custom-Header', value: 'custom-value' },
    ];

    for (const { name, value } of testCases) {
      const curlCmd = `curl -H "${name}: ${value}" https://api.example.com`;
      const result = parseCurl(curlCmd);
      expect(result.headers[name]).toBe(value);
    }
  });

  it('should extract JSON body from cURL commands', () => {
    const testBodies = [
      { model: 'gpt-4', messages: [] },
      { key: 'value', number: 123 },
      { nested: { a: 1, b: 2 } },
    ];

    for (const body of testBodies) {
      const bodyStr = JSON.stringify(body);
      const curlCmd = `curl -d '${bodyStr}' https://api.example.com`;
      const result = parseCurl(curlCmd);
      expect(result.body).toEqual(body);
    }
  });

  it('should parse standard OpenAI cURL command', () => {
    const curlCmd = `curl -H "Content-Type: application/json" -H "Authorization: Bearer sk-test123" -d '{"model":"gpt-4","messages":[{"role":"user","content":"hello"}]}' https://api.openai.com/v1/chat/completions`;
    const result = parseCurl(curlCmd);

    expect(result.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.apiKey).toBe('sk-test123');
    expect(result.body).toEqual({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'hello' }]
    });
  });

  it('should handle multiple headers', () => {
    const curlCmd = `curl -H "Content-Type: application/json" -H "Authorization: Bearer key123" -H "X-Request-Id: abc" https://api.example.com`;
    const result = parseCurl(curlCmd);

    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.headers['Authorization']).toBe('Bearer key123');
    expect(result.headers['X-Request-Id']).toBe('abc');
  });

  it('should handle --header long form', () => {
    const curlCmd = `curl --header "Content-Type: application/json" https://api.example.com`;
    const result = parseCurl(curlCmd);
    expect(result.headers['Content-Type']).toBe('application/json');
  });

  it('should handle --data long form', () => {
    const curlCmd = `curl --data '{"test":true}' https://api.example.com`;
    const result = parseCurl(curlCmd);
    expect(result.body).toEqual({ test: true });
  });

  it('should handle -X method flag', () => {
    const curlCmd = `curl -X POST https://api.example.com`;
    const result = parseCurl(curlCmd);
    expect(result.method).toBe('POST');
  });

  it('should parse Ark (Bytedance) cURL command with --location flag', () => {
    const curlCmd = `curl --location 'https://ark.cn-beijing.volces.com/api/v1/chat/completions' \\
--header 'Content-Type: application/json' \\
--header 'Authorization: Bearer 1232462421' \\
--data '{"model": "doubao-seed-1-6-thinking-250715","messages": [{"role": "system","content": "You are a helpful assistant."},{"role": "user","content": "Hello!"}]}'`;

    const result = parseCurl(curlCmd);

    expect(result.url).toBe('https://ark.cn-beijing.volces.com/api/v1/chat/completions');
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.apiKey).toBe('1232462421');
    expect(result.body).toEqual({
      model: 'doubao-seed-1-6-thinking-250715',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ]
    });

    // 验证插件检测
    expect(detectPluginId(result.url)).toBe('ark-bytedance');

    // 验证消息提取
    const extracted = extractModelAndMessages(result.body);
    expect(extracted.modelId).toBe('doubao-seed-1-6-thinking-250715');
    expect(extracted.systemPrompt).toBe('You are a helpful assistant.');
    expect(extracted.messages).toEqual([{ role: 'user', content: 'Hello!' }]);
  });
});


// ============================================================================
// Property 8: Error Handling for Invalid Inputs
// **Feature: curl-import, Property 8: Error Handling for Invalid Inputs**
// **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
// ============================================================================

describe('Property 8: Error Handling for Invalid Inputs', () => {
  it('should throw error for empty input', () => {
    expect(() => parseCurl('')).toThrow(CurlParseError);
    expect(() => parseCurl('')).toThrow('请输入 cURL 命令');
    expect(() => parseCurl('   ')).toThrow(CurlParseError);
    expect(() => parseCurl('\t\n')).toThrow(CurlParseError);
  });

  it('should throw error for non-curl commands', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
          const trimmed = s.trim();
          return trimmed.length > 0 && !trimmed.toLowerCase().startsWith('curl');
        }),
        (input) => {
          expect(() => parseCurl(input)).toThrow(CurlParseError);
          expect(() => parseCurl(input)).toThrow('无效的 cURL 命令格式');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should throw error for cURL without URL', () => {
    const invalidCommands = [
      'curl -H "Content-Type: application/json"',
      'curl -d \'{"test": true}\'',
      'curl -X POST',
    ];

    for (const cmd of invalidCommands) {
      expect(() => parseCurl(cmd)).toThrow(CurlParseError);
      expect(() => parseCurl(cmd)).toThrow('未找到有效的请求 URL');
    }
  });
});

// ============================================================================
// Property 2: Plugin Detection Based on URL Patterns
// **Feature: curl-import, Property 2: Plugin Detection Based on URL Patterns**
// **Validates: Requirements 2.1, 2.2**
// ============================================================================

describe('Property 2: Plugin Detection Based on URL Patterns', () => {
  it('should detect correct plugin for known URLs', () => {
    const testCases = [
      { url: 'https://api.openai.com/v1/chat/completions', expected: 'openai-compatible' },
      { url: 'https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions', expected: 'Gemini' },
      { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', expected: 'aliyun-dashscope' },
      { url: 'https://api.moonshot.cn/v1/chat/completions', expected: 'kimi-moonshot' },
      { url: 'https://ark.cn-beijing.volces.com/api/v1/chat/completions', expected: 'ark-bytedance' },
    ];

    for (const { url, expected } of testCases) {
      expect(detectPluginId(url)).toBe(expected);
    }
  });

  it('should default to openai-compatible for unknown URLs', () => {
    fc.assert(
      fc.property(
        fc.webUrl().filter(url => {
          // 过滤掉已知的 URL 模式
          return !PLUGIN_URL_PATTERNS.some(p => p.pattern.test(url));
        }),
        (url) => {
          expect(detectPluginId(url)).toBe('openai-compatible');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 3: API Key Extraction from Authorization Header
// **Feature: curl-import, Property 3: API Key Extraction from Authorization Header**
// **Validates: Requirements 2.3**
// ============================================================================

describe('Property 3: API Key Extraction from Authorization Header', () => {
  it('should extract API key from Bearer token', () => {
    fc.assert(
      fc.property(apiKeyArb, (apiKey) => {
        const headers = { Authorization: `Bearer ${apiKey}` };
        expect(extractApiKey(headers)).toBe(apiKey);
      }),
      { numRuns: 100 }
    );
  });

  it('should handle case-insensitive Authorization header', () => {
    fc.assert(
      fc.property(
        apiKeyArb,
        fc.constantFrom('Authorization', 'authorization', 'AUTHORIZATION'),
        (apiKey, headerName) => {
          const headers = { [headerName]: `Bearer ${apiKey}` };
          expect(extractApiKey(headers)).toBe(apiKey);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null when no Authorization header', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          headerNameArb.filter(n => n.toLowerCase() !== 'authorization'),
          headerValueArb
        ),
        (headers) => {
          expect(extractApiKey(headers)).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 7: Model ID Extraction from Request Body
// **Feature: curl-import, Property 7: Model ID Extraction from Request Body**
// **Validates: Requirements 4.3**
// ============================================================================

describe('Property 7: Model ID Extraction from Request Body', () => {
  it('should extract model ID from body', () => {
    fc.assert(
      fc.property(modelIdArb, (modelId) => {
        const body = { model: modelId };
        const result = extractModelAndMessages(body);
        expect(result.modelId).toBe(modelId);
      }),
      { numRuns: 100 }
    );
  });

  it('should return null for missing model field', () => {
    fc.assert(
      fc.property(
        fc.record({
          messages: fc.array(messageArb),
        }),
        (body) => {
          const result = extractModelAndMessages(body);
          expect(result.modelId).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null for non-object body', () => {
    const invalidBodies = [null, undefined, 'string', 123, []];
    for (const body of invalidBodies) {
      const result = extractModelAndMessages(body);
      expect(result.modelId).toBeNull();
    }
  });
});

// ============================================================================
// Property 9: Message Separation by Role
// **Feature: curl-import, Property 9: Message Separation by Role**
// **Validates: Requirements 6.1, 6.2**
// ============================================================================

describe('Property 9: Message Separation by Role', () => {
  it('should separate system messages into systemPrompt', () => {
    fc.assert(
      fc.property(
        messageContentArb,
        fc.array(messageArb.filter(m => m.role !== 'system'), { minLength: 0, maxLength: 5 }),
        (systemContent, otherMessages) => {
          const messages = [
            { role: 'system', content: systemContent },
            ...otherMessages,
          ];
          const body = { messages };
          const result = extractModelAndMessages(body);

          expect(result.systemPrompt).toBe(systemContent);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should keep user and assistant messages in messages array', () => {
    fc.assert(
      fc.property(
        fc.array(messageArb.filter(m => m.role !== 'system'), { minLength: 1, maxLength: 5 }),
        (userMessages) => {
          const body = { messages: userMessages };
          const result = extractModelAndMessages(body);

          expect(result.messages).toHaveLength(userMessages.length);
          result.messages?.forEach((msg, i) => {
            expect(msg.role).toBe(userMessages[i].role);
            expect(msg.content).toBe(userMessages[i].content);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle mixed messages correctly', () => {
    const body = {
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
      ]
    };

    const result = extractModelAndMessages(body);

    expect(result.systemPrompt).toBe('You are helpful');
    expect(result.messages).toHaveLength(3);
    expect(result.messages?.[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(result.messages?.[1]).toEqual({ role: 'assistant', content: 'Hi there' });
    expect(result.messages?.[2]).toEqual({ role: 'user', content: 'How are you?' });
  });
});

// ============================================================================
// Property 4: Provider Matching by BaseUrl, PluginId and ApiKey
// **Feature: curl-import, Property 4: Provider Matching by BaseUrl, PluginId and ApiKey**
// **Validates: Requirements 3.1**
// ============================================================================

describe('Property 4: Provider Matching by BaseUrl, PluginId and ApiKey', () => {
  it('should find matching provider when all fields match', () => {
    fc.assert(
      fc.property(
        fc.array(providerArb, { minLength: 1, maxLength: 10 }),
        fc.nat({ max: 9 }),
        (providers, indexSeed) => {
          const index = indexSeed % providers.length;
          const target = providers[index];

          const result = findMatchingProvider(
            providers as ProviderProfile[],
            target.baseUrl,
            target.pluginId,
            target.apiKey
          );

          expect(result).not.toBeNull();
          expect(result?.baseUrl).toBe(target.baseUrl);
          expect(result?.pluginId).toBe(target.pluginId);
          expect(result?.apiKey).toBe(target.apiKey);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null when apiKey does not match', () => {
    const provider: ProviderProfile = {
      id: 'test-id',
      name: 'Test Provider',
      apiKey: 'sk-original-key',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      pluginId: 'openai-compatible',
    };

    // 不同的 apiKey 应该返回 null
    const result = findMatchingProvider(
      [provider],
      provider.baseUrl,
      provider.pluginId,
      'sk-different-key'
    );

    expect(result).toBeNull();
  });

  it('should match when apiKey is not provided (undefined)', () => {
    const provider: ProviderProfile = {
      id: 'test-id',
      name: 'Test Provider',
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      pluginId: 'openai-compatible',
    };

    // 不提供 apiKey 时，只匹配 baseUrl 和 pluginId
    const result = findMatchingProvider(
      [provider],
      provider.baseUrl,
      provider.pluginId
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe(provider.id);
  });

  it('should return null when no match exists', () => {
    fc.assert(
      fc.property(
        fc.array(providerArb, { minLength: 0, maxLength: 5 }),
        fc.webUrl(),
        fc.constantFrom('openai-compatible', 'Gemini'),
        apiKeyArb,
        (providers, baseUrl, pluginId, apiKey) => {
          // 确保没有匹配的 provider
          const filteredProviders = providers.filter(
            p => !(p.baseUrl === baseUrl && p.pluginId === pluginId && p.apiKey === apiKey)
          );

          const result = findMatchingProvider(
            filteredProviders as ProviderProfile[],
            baseUrl,
            pluginId,
            apiKey
          );

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 5: Provider Creation with Unique Names
// **Feature: curl-import, Property 5: Provider Creation with Unique Names**
// **Validates: Requirements 3.3, 3.4**
// ============================================================================

describe('Property 5: Provider Creation with Unique Names', () => {
  it('should return base name when not in existing names', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (existingNames, baseName) => {
          // 确保 baseName 不在 existingNames 中
          const filteredNames = existingNames.filter(n => n !== baseName);

          const result = generateUniqueProviderName(filteredNames, baseName);
          expect(result).toBe(baseName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate unique name when base name exists', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (baseName) => {
          const existingNames = [baseName];

          const result = generateUniqueProviderName(existingNames, baseName);

          expect(result).not.toBe(baseName);
          expect(result.startsWith(baseName)).toBe(true);
          expect(existingNames).not.toContain(result);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 6: Slot Overwrite vs Create Decision
// **Feature: curl-import, Property 6: Slot Overwrite vs Create Decision**
// **Validates: Requirements 4.1, 4.2**
// ============================================================================

describe('Property 6: Slot Overwrite vs Create Decision', () => {
  it('should overwrite when single slot with default content', () => {
    const defaultSlot: Slot = {
      id: 'test-id',
      providerProfileId: null,
      pluginId: 'openai-compatible',
      modelId: 'gpt-4',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      paramOverride: null,
      selected: true,
      status: 'idle',
      output: '',
      thinking: '',
      toolCalls: null,
      metrics: { ttfbMs: null, totalMs: null },
    };

    expect(isSlotDefault(defaultSlot)).toBe(true);
    expect(shouldOverwriteSlot([defaultSlot])).toBe(true);
  });

  it('should not overwrite when single slot has non-default content', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
          const trimmed = s.trim();
          return trimmed.length > 0 && trimmed !== DEFAULT_SYSTEM_PROMPT;
        }),
        (customPrompt) => {
          const customSlot: Slot = {
            id: 'test-id',
            providerProfileId: null,
            pluginId: 'openai-compatible',
            modelId: 'gpt-4',
            systemPrompt: customPrompt,
            paramOverride: null,
            selected: true,
            status: 'idle',
            output: '',
            thinking: '',
            toolCalls: null,
            metrics: { ttfbMs: null, totalMs: null },
          };

          expect(isSlotDefault(customSlot)).toBe(false);
          expect(shouldOverwriteSlot([customSlot])).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not overwrite when multiple slots exist', () => {
    fc.assert(
      fc.property(
        fc.array(slotArb, { minLength: 2, maxLength: 5 }),
        (slots) => {
          expect(shouldOverwriteSlot(slots as Slot[])).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not overwrite when slot has output', () => {
    const slotWithOutput: Slot = {
      id: 'test-id',
      providerProfileId: null,
      pluginId: 'openai-compatible',
      modelId: 'gpt-4',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      paramOverride: null,
      selected: true,
      status: 'idle',
      output: 'Some output text',
      thinking: '',
      toolCalls: null,
      metrics: { ttfbMs: null, totalMs: null },
    };

    expect(isSlotDefault(slotWithOutput)).toBe(false);
    expect(shouldOverwriteSlot([slotWithOutput])).toBe(false);
  });

  it('should not overwrite when slot is not idle', () => {
    const runningSlot: Slot = {
      id: 'test-id',
      providerProfileId: null,
      pluginId: 'openai-compatible',
      modelId: 'gpt-4',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      paramOverride: null,
      selected: true,
      status: 'running',
      output: '',
      thinking: '',
      toolCalls: null,
      metrics: { ttfbMs: null, totalMs: null },
    };

    expect(isSlotDefault(runningSlot)).toBe(false);
    expect(shouldOverwriteSlot([runningSlot])).toBe(false);
  });
});
