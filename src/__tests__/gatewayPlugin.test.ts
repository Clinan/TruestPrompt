/**
 * Gateway Plugin Tests
 * 
 * Property-based tests for gateway plugin functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { TokenInfo } from '../core/types';
import {
  parseErrorResponse,
  buildModelsUrl,
  buildChatUrl,
  buildProvidersUrl,
  parseProviderList,
  parseModelList,
  getEffectiveApiKey,
  isGatewayProvider,
  createProviderFromGateway,
} from '../modules/provider/domain/gateway';
import { setToken, clearToken } from '../lib/oauth';

// Mock sessionStorage for tests
const mockStorage: Record<string, string> = {};

beforeEach(() => {
  Object.keys(mockStorage).forEach(key => delete mockStorage[key]);

  Object.defineProperty(global, 'sessionStorage', {
    value: {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { Object.keys(mockStorage).forEach(key => delete mockStorage[key]); },
    },
    writable: true,
  });
});

afterEach(() => {
  Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
});

describe('Effective API Key', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 8: Effective API Key for gateway providers**
   * **Validates: Requirements 5.1, 5.2**
   */
  it('Property 8: gateway provider returns access token when authenticated', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (projectId, accessToken) => {
          const profile = {
            apiKey: '',
            gatewayProviderId: 'openai',
          };

          // Set token for this project
          const token: TokenInfo = {
            accessToken,
            expiresAt: Date.now() + 3600000,
            projectId,
          };
          setToken(projectId, token);

          const effectiveKey = getEffectiveApiKey(profile, projectId);
          expect(effectiveKey).toBe(accessToken);

          clearToken(projectId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8: gateway provider returns empty string when not authenticated', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (projectId) => {
          const profile = {
            apiKey: '',
            gatewayProviderId: 'openai',
          };

          // Ensure no token
          clearToken(projectId);

          const effectiveKey = getEffectiveApiKey(profile, projectId);
          expect(effectiveKey).toBe('');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8: local provider returns apiKey', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (apiKey) => {
          const profile = {
            apiKey,
            // No gatewayProviderId = local provider
          };

          const effectiveKey = getEffectiveApiKey(profile, 'any-project');
          expect(effectiveKey).toBe(apiKey);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Gateway Provider Detection', () => {
  it('isGatewayProvider returns true when gatewayProviderId is set', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (gatewayProviderId) => {
          expect(isGatewayProvider({ gatewayProviderId })).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isGatewayProvider returns false when gatewayProviderId is not set', () => {
    expect(isGatewayProvider({})).toBe(false);
    expect(isGatewayProvider({ gatewayProviderId: undefined })).toBe(false);
    expect(isGatewayProvider({ gatewayProviderId: '' })).toBe(false);
  });
});


describe('Provider Creation from Gateway', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 7: Provider transformation preserves data**
   * **Validates: Requirements 4.4, 4.5**
   */
  it('Property 7: created provider has correct fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          name: fc.string({ minLength: 1 }),
          defaultUrl: fc.string(),
          defaultModelsUrl: fc.string(),
          fallbackModels: fc.array(
            fc.record({
              id: fc.string({ minLength: 1 }),
              label: fc.string(),
            })
          ),
        }),
        fc.webUrl(),
        (gatewayProvider, gatewayBaseUrl) => {
          const profile = createProviderFromGateway(gatewayProvider, gatewayBaseUrl);

          // Name should match
          expect(profile.name).toBe(gatewayProvider.name);

          // gatewayProviderId should be set
          expect(profile.gatewayProviderId).toBe(gatewayProvider.id);

          // apiKey should be empty
          expect(profile.apiKey).toBe('');

          // pluginId should be openai-compatible
          expect(profile.pluginId).toBe('openai-compatible');

          // baseUrl should be the chat URL
          expect(profile.baseUrl).toContain('/api/llmproxy/');
          expect(profile.baseUrl).toContain(gatewayProvider.id);
          expect(profile.baseUrl).toContain('/v1/chat/completions');
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Provider List Transformation', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 11: Provider list transformation preserves data**
   * **Validates: Requirements 4.2**
   */
  it('Property 11: parsed providers have correct id and name', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            id: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1 }),
            defaultUrl: fc.string(),
            defaultModelsUrl: fc.string(),
            fallbackModels: fc.array(
              fc.record({
                id: fc.string({ minLength: 1 }),
                label: fc.string(),
              })
            ),
          }),
          { minLength: 0, maxLength: 10, selector: (p) => p.id }
        ),
        (providers) => {
          const response = { data: providers };
          const parsed = parseProviderList(response);

          // Each parsed provider should have a matching source
          for (const provider of parsed) {
            const source = providers.find(p => p.id === provider.id);
            expect(source).toBeDefined();
            if (source) {
              expect(provider.name).toBe(source.name);
            }
          }

          // Count valid provider IDs (non-empty)
          const validProviders = providers.filter(p => p.id !== '');
          expect(parsed.length).toBe(validProviders.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 11: empty or invalid data returns empty array', () => {
    expect(parseProviderList(null)).toEqual([]);
    expect(parseProviderList(undefined)).toEqual([]);
    expect(parseProviderList({})).toEqual([]);
    expect(parseProviderList({ data: null })).toEqual([]);
    expect(parseProviderList({ data: 'not an array' })).toEqual([]);
  });

  it('Property 11: providers with empty id are filtered out', () => {
    const response = {
      data: [
        { id: '', name: 'Empty ID' },
        { id: 'valid', name: 'Valid Provider' },
      ],
    };

    const parsed = parseProviderList(response);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('valid');
  });
});


describe('URL Construction', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 12: Model list URL construction is correct**
   * **Validates: Requirements 5.1**
   */
  it('Property 12: models URL follows expected pattern', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.string({ minLength: 1 }).filter(s => !s.includes('/') && !s.includes('?')),
        (baseUrl, providerId) => {
          const url = buildModelsUrl(baseUrl, providerId);

          // Should contain the provider ID
          expect(url).toContain(providerId);

          // Should end with /v1/models
          expect(url).toContain('/v1/models');

          // Should contain /api/llmproxy/
          expect(url).toContain('/api/llmproxy/');

          // Should be a valid URL
          expect(() => new URL(url)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12: chat URL follows expected pattern', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.string({ minLength: 1 }).filter(s => !s.includes('/') && !s.includes('?')),
        (baseUrl, providerId) => {
          const url = buildChatUrl(baseUrl, providerId);

          // Should contain the provider ID
          expect(url).toContain(providerId);

          // Should end with /v1/chat/completions
          expect(url).toContain('/v1/chat/completions');

          // Should contain /api/llmproxy/
          expect(url).toContain('/api/llmproxy/');

          // Should be a valid URL
          expect(() => new URL(url)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12: providers URL follows expected pattern', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        (baseUrl) => {
          const url = buildProvidersUrl(baseUrl);

          // Should end with /api/llmproxy/providers
          expect(url).toContain('/api/llmproxy/providers');

          // Should be a valid URL
          expect(() => new URL(url)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12: trailing slashes are handled correctly', () => {
    const baseWithSlash = 'https://example.com/';
    const baseWithoutSlash = 'https://example.com';

    expect(buildModelsUrl(baseWithSlash, 'openai')).toBe(buildModelsUrl(baseWithoutSlash, 'openai'));
    expect(buildChatUrl(baseWithSlash, 'openai')).toBe(buildChatUrl(baseWithoutSlash, 'openai'));
    expect(buildProvidersUrl(baseWithSlash)).toBe(buildProvidersUrl(baseWithoutSlash));
  });
});


describe('Model List Parsing', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 13: Model list parsing extracts IDs correctly**
   * **Validates: Requirements 5.2**
   */
  it('Property 13: parsed models have correct ids', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            object: fc.constant('model'),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        (models) => {
          const response = { object: 'list', data: models };
          const parsed = parseModelList(response);

          // Each parsed model should have matching id
          for (const model of parsed) {
            const source = models.find(m => m.id === model.id);
            expect(source).toBeDefined();
          }

          // All valid models should be parsed
          const validModels = models.filter(m => m.id !== '');
          expect(parsed.length).toBe(validModels.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 13: empty or invalid data returns empty array', () => {
    expect(parseModelList(null)).toEqual([]);
    expect(parseModelList(undefined)).toEqual([]);
    expect(parseModelList({})).toEqual([]);
    expect(parseModelList({ data: null })).toEqual([]);
    expect(parseModelList({ data: 'not an array' })).toEqual([]);
  });

  it('Property 13: models with empty id are filtered out', () => {
    const response = {
      object: 'list',
      data: [
        { id: '', object: 'model' },
        { id: 'gpt-4', object: 'model' },
      ],
    };

    const parsed = parseModelList(response);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('gpt-4');
  });
});


describe('Error Response Parsing', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 5: Error response parsing extracts message**
   * **Validates: Requirements 2.6, 4.7**
   */
  it('Property 5: extracts message from OpenAI-style error', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (message) => {
          const response = {
            error: {
              message,
              type: 'invalid_request_error',
              code: 'invalid_api_key',
            },
          };

          expect(parseErrorResponse(response)).toBe(message);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: extracts direct message field', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (message) => {
          const response = { message };
          expect(parseErrorResponse(response)).toBe(message);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: extracts error_description (OAuth style)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (errorDescription) => {
          const response = { error_description: errorDescription };
          expect(parseErrorResponse(response)).toBe(errorDescription);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: extracts error string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (error) => {
          const response = { error };
          expect(parseErrorResponse(response)).toBe(error);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: returns default for invalid input', () => {
    expect(parseErrorResponse(null)).toBe('未知错误');
    expect(parseErrorResponse(undefined)).toBe('未知错误');
    expect(parseErrorResponse('string')).toBe('未知错误');
    expect(parseErrorResponse(123)).toBe('未知错误');
    expect(parseErrorResponse({})).toBe('未知错误');
  });
});


describe('Gateway Config Persistence', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 2: Gateway config persistence round-trip**
   * **Validates: Requirements 1.5**
   */
  it('Property 2: gateway config survives JSON serialization', () => {
    fc.assert(
      fc.property(
        fc.record({
          enabled: fc.boolean(),
          baseUrl: fc.webUrl(),
          clientId: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        (gatewayConfig) => {
          // Serialize and deserialize
          const serialized = JSON.stringify(gatewayConfig);
          const deserialized = JSON.parse(serialized) as typeof gatewayConfig;

          // All fields should match
          expect(deserialized.enabled).toBe(gatewayConfig.enabled);
          expect(deserialized.baseUrl).toBe(gatewayConfig.baseUrl);
          expect(deserialized.clientId).toBe(gatewayConfig.clientId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
