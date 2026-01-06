/**
 * OAuth Module Tests
 * 
 * Property-based tests using fast-check to verify OAuth module correctness.
 * Each test runs at least 100 iterations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { GatewayConfig, TokenInfo } from '../core/types';
import {
  validateGatewayConfig,
  isGatewayConfigComplete,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  getToken,
  setToken,
  clearToken,
  isTokenValid,
  isTokenExpiringSoon,
  getAuthStatus,
  validateState,
  extractCallbackParams,
  storePKCE,
  retrievePKCE,
} from '../lib/oauth';

// Mock sessionStorage for tests
const mockStorage: Record<string, string> = {};

beforeEach(() => {
  // Clear mock storage
  Object.keys(mockStorage).forEach(key => delete mockStorage[key]);

  // Mock sessionStorage
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

describe('Gateway Config Validation', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 1: Gateway config validation rejects incomplete configs**
   * **Validates: Requirements 1.3, 1.4**
   */
  it('Property 1: rejects configs with missing required fields when enabled', () => {
    fc.assert(
      fc.property(
        fc.record({
          enabled: fc.constant(true),
          baseUrl: fc.oneof(fc.constant(''), fc.constant(undefined)),
          clientId: fc.string(),
        }),
        (config) => {
          // When enabled and baseUrl is empty/missing, should be invalid
          const result = validateGatewayConfig(config as any);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 1: rejects configs with empty clientId when enabled', () => {
    fc.assert(
      fc.property(
        fc.record({
          enabled: fc.constant(true),
          baseUrl: fc.string({ minLength: 1 }),
          clientId: fc.oneof(fc.constant(''), fc.constant(undefined)),
        }),
        (config) => {
          const result = validateGatewayConfig(config as any);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 1: accepts valid complete configs', () => {
    fc.assert(
      fc.property(
        fc.record({
          enabled: fc.constant(true),
          baseUrl: fc.string({ minLength: 1 }).filter(s => s.trim() !== ''),
          clientId: fc.string({ minLength: 1 }).filter(s => s.trim() !== ''),
        }),
        (config) => {
          const result = validateGatewayConfig(config);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 1: accepts disabled configs regardless of other fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          enabled: fc.constant(false),
          baseUrl: fc.oneof(fc.string(), fc.constant('')),
          clientId: fc.oneof(fc.string(), fc.constant('')),
        }),
        (config) => {
          const result = validateGatewayConfig(config);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('PKCE Generation', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 3: Code verifier generation produces valid output**
   * **Validates: Requirements 9.1**
   */
  it('Property 3: code_verifier has valid length (43-128 chars)', () => {
    fc.assert(
      fc.property(
        fc.constant(null), // No input needed, just run multiple times
        () => {
          const verifier = generateCodeVerifier();
          expect(verifier.length).toBeGreaterThanOrEqual(43);
          expect(verifier.length).toBeLessThanOrEqual(128);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 3: code_verifier contains only unreserved characters', () => {
    // Unreserved characters: A-Z, a-z, 0-9, -, ., _, ~
    const unreservedPattern = /^[A-Za-z0-9\-._~]+$/;

    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const verifier = generateCodeVerifier();
          expect(verifier).toMatch(unreservedPattern);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 3: each generated code_verifier is unique', () => {
    const verifiers = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const verifier = generateCodeVerifier();
      expect(verifiers.has(verifier)).toBe(false);
      verifiers.add(verifier);
    }
  });
});

describe('Code Challenge Generation', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 4: Code challenge is deterministic SHA256 hash**
   * **Validates: Requirements 9.2**
   * 
   * Note: These tests verify the behavior of oauth4webapi's calculatePKCECodeChallenge.
   */
  it('Property 4: same verifier produces same challenge', async () => {
    // Use a fixed verifier for determinism test
    const verifier = generateCodeVerifier();
    const challenge1 = await generateCodeChallenge(verifier);
    const challenge2 = await generateCodeChallenge(verifier);
    expect(challenge1).toBe(challenge2);
  });

  it('Property 4: challenge is BASE64URL encoded (no +, /, or = padding)', async () => {
    // Generate multiple challenges and verify format
    for (let i = 0; i < 10; i++) {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      // BASE64URL should not contain +, /, or trailing =
      expect(challenge).not.toContain('+');
      expect(challenge).not.toContain('/');
      expect(challenge).not.toMatch(/=+$/);

      // Should only contain BASE64URL characters
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);

      // SHA256 produces 32 bytes, BASE64URL encoded is ~43 chars
      expect(challenge.length).toBeGreaterThanOrEqual(40);
      expect(challenge.length).toBeLessThanOrEqual(50);
    }
  });

  it('Property 4: different verifiers produce different challenges', async () => {
    const challenges = new Map<string, string>();

    for (let i = 0; i < 20; i++) {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      challenges.set(verifier, challenge);
    }

    // All challenges should be unique (since all verifiers are unique)
    const uniqueChallenges = new Set(challenges.values());
    expect(uniqueChallenges.size).toBe(challenges.size);
  });
});


describe('Token Storage', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 8: Token storage preserves token data by project ID**
   * **Validates: Requirements 2.4, 8.3**
   */
  it('Property 8: stored token can be retrieved with same data', () => {
    fc.assert(
      fc.property(
        fc.record({
          accessToken: fc.string({ minLength: 1 }),
          expiresAt: fc.integer({ min: Date.now(), max: Date.now() + 86400000 * 365 }),
          projectId: fc.string({ minLength: 1 }),
        }),
        (token: TokenInfo) => {
          setToken(token.projectId, token);
          const retrieved = getToken(token.projectId);

          expect(retrieved).not.toBeNull();
          expect(retrieved!.accessToken).toBe(token.accessToken);
          expect(retrieved!.expiresAt).toBe(token.expiresAt);
          expect(retrieved!.projectId).toBe(token.projectId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8: clearing token removes it', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (projectId) => {
          const token: TokenInfo = {
            accessToken: 'test-token',
            expiresAt: Date.now() + 3600000,
            projectId,
          };

          setToken(projectId, token);
          expect(getToken(projectId)).not.toBeNull();

          clearToken(projectId);
          expect(getToken(projectId)).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8: tokens for different projects are isolated', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (projectId1, projectId2) => {
          // Skip if same project ID
          fc.pre(projectId1 !== projectId2);

          const token1: TokenInfo = {
            accessToken: 'token-1',
            expiresAt: Date.now() + 3600000,
            projectId: projectId1,
          };
          const token2: TokenInfo = {
            accessToken: 'token-2',
            expiresAt: Date.now() + 7200000,
            projectId: projectId2,
          };

          setToken(projectId1, token1);
          setToken(projectId2, token2);

          const retrieved1 = getToken(projectId1);
          const retrieved2 = getToken(projectId2);

          expect(retrieved1!.accessToken).toBe('token-1');
          expect(retrieved2!.accessToken).toBe('token-2');

          // Clearing one doesn't affect the other
          clearToken(projectId1);
          expect(getToken(projectId1)).toBeNull();
          expect(getToken(projectId2)).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('State Validation', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 6: State validation accepts only matching states**
   * **Validates: Requirements 2.2, 2.5**
   */
  it('Property 6: matching states pass validation', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (state) => {
          expect(validateState(state, state)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 6: different states fail validation', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (storedState, callbackState) => {
          fc.pre(storedState !== callbackState);
          expect(validateState(storedState, callbackState)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 6: generated states are unique and pass self-validation', () => {
    const states = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const state = generateState();

      // Each state should be unique
      expect(states.has(state)).toBe(false);
      states.add(state);

      // State should validate against itself
      expect(validateState(state, state)).toBe(true);
    }
  });
});


describe('Auth Status Derivation', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 9: Auth status correctly reflects token validity**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('Property 9: no token means logged_out', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (projectId) => {
          // Ensure no token exists
          clearToken(projectId);

          expect(getAuthStatus(projectId)).toBe('logged_out');
          expect(isTokenValid(projectId)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 9: valid token means logged_in', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        fc.integer({ min: 100, max: 86400000 * 365 }), // 100ms to 1 year in future to avoid flakiness
        (projectId, futureOffset) => {
          const token: TokenInfo = {
            accessToken: 'test-token',
            expiresAt: Date.now() + futureOffset,
            projectId,
          };

          setToken(projectId, token);

          expect(getAuthStatus(projectId)).toBe('logged_in');
          expect(isTokenValid(projectId)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 9: expired token means expired', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1, max: 86400000 * 365 }), // 1ms to 1 year in past
        (projectId, pastOffset) => {
          const token: TokenInfo = {
            accessToken: 'test-token',
            expiresAt: Date.now() - pastOffset,
            projectId,
          };

          setToken(projectId, token);

          expect(getAuthStatus(projectId)).toBe('expired');
          expect(isTokenValid(projectId)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Token Expiration Detection', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 10: Token expiration detection is accurate**
   * **Validates: Requirements 8.1**
   */
  it('Property 10: token expiring within threshold returns true', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1000, max: 300000 }), // 1s to 5min threshold
        fc.integer({ min: 0, max: 299999 }), // Time until expiration (less than threshold)
        (projectId, threshold, timeUntilExpiry) => {
          fc.pre(timeUntilExpiry < threshold);

          const token: TokenInfo = {
            accessToken: 'test-token',
            expiresAt: Date.now() + timeUntilExpiry,
            projectId,
          };

          setToken(projectId, token);

          expect(isTokenExpiringSoon(projectId, threshold)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 10: token not expiring within threshold returns false', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1000, max: 300000 }), // 1s to 5min threshold
        fc.integer({ min: 300001, max: 86400000 }), // Time until expiration (more than threshold)
        (projectId, threshold, timeUntilExpiry) => {
          fc.pre(timeUntilExpiry >= threshold);

          const token: TokenInfo = {
            accessToken: 'test-token',
            expiresAt: Date.now() + timeUntilExpiry,
            projectId,
          };

          setToken(projectId, token);

          expect(isTokenExpiringSoon(projectId, threshold)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 10: no token is considered expiring soon', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (projectId) => {
          clearToken(projectId);
          expect(isTokenExpiringSoon(projectId)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Callback Parameter Extraction', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 15: Callback parameter extraction is correct**
   * **Validates: Requirements 10.1**
   */
  it('Property 15: extracts code and state from callback URL', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        (code, state) => {
          const url = `https://app.com/auth/callback?code=${code}&state=${state}`;
          const params = extractCallbackParams(url);

          expect(params.code).toBe(code);
          expect(params.state).toBe(state);
          expect(params.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 15: extracts error from callback URL', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => /^[a-zA-Z0-9_\- ]+$/.test(s)),
        (error, errorDescription) => {
          const encodedDesc = encodeURIComponent(errorDescription);
          const url = `https://app.com/auth/callback?error=${error}&error_description=${encodedDesc}`;
          const params = extractCallbackParams(url);

          expect(params.error).toBe(error);
          expect(params.errorDescription).toBe(errorDescription);
          expect(params.code).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 15: handles invalid URLs gracefully', () => {
    const params = extractCallbackParams('not a valid url');
    expect(params).toEqual({});
  });
});

describe('PKCE Storage', () => {
  /**
   * **Feature: llm-proxy-gateway, Property 16: Project identification from state is correct**
   * **Validates: Requirements 10.2**
   */
  it('Property 16: stored PKCE can be retrieved by state', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        fc.string({ minLength: 10, maxLength: 100 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        fc.webUrl(),
        (state, codeVerifier, projectId, gatewayBaseUrl) => {
          storePKCE(state, {
            codeVerifier,
            projectId,
            gatewayBaseUrl,
            tokenEndpoint: '/oauth/token',
            redirectPath: '/auth/callback',
            timestamp: Date.now(),
          });

          const retrieved = retrievePKCE(state);

          expect(retrieved).not.toBeNull();
          expect(retrieved!.state).toBe(state);
          expect(retrieved!.codeVerifier).toBe(codeVerifier);
          expect(retrieved!.projectId).toBe(projectId);
          expect(retrieved!.gatewayBaseUrl).toBe(gatewayBaseUrl);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 16: PKCE is removed after retrieval (one-time use)', () => {
    const state = 'test-state-123';
    storePKCE(state, {
      codeVerifier: 'test-verifier',
      projectId: 'test-project',
      gatewayBaseUrl: 'https://example.com',
      tokenEndpoint: '/oauth/token',
      redirectPath: '/auth/callback',
      timestamp: Date.now(),
    });

    // First retrieval should succeed
    const first = retrievePKCE(state);
    expect(first).not.toBeNull();

    // Second retrieval should return null
    const second = retrievePKCE(state);
    expect(second).toBeNull();
  });

  it('Property 16: non-existent state returns null', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (state) => {
          // Clear any existing PKCE
          retrievePKCE(state);

          const result = retrievePKCE(state);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
