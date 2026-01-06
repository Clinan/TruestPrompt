/**
 * Gateway API Module for LLM Proxy Gateway
 * 
 * Provides utilities for interacting with the gateway API:
 * - URL building
 * - Provider list fetching and parsing
 * - Error response parsing
 */

import type { GatewayProvider, GatewayConfig } from '../../../core/types';
import { getToken, clearToken } from '../../../lib/oauth';

// Custom error for authentication failures
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Parses error response from gateway API.
 */
export function parseErrorResponse(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return '未知错误';
  }

  const obj = data as Record<string, unknown>;

  // OpenAI-style error
  if (obj.error && typeof obj.error === 'object') {
    const error = obj.error as Record<string, unknown>;
    if (typeof error.message === 'string') {
      return error.message;
    }
  }

  // Direct message
  if (typeof obj.message === 'string') {
    return obj.message;
  }

  // Error description (OAuth style)
  if (typeof obj.error_description === 'string') {
    return obj.error_description;
  }

  // Error string
  if (typeof obj.error === 'string') {
    return obj.error;
  }

  return '未知错误';
}

/**
 * Builds the models URL for a gateway provider.
 */
export function buildModelsUrl(gatewayBaseUrl: string, providerId: string): string {
  const base = gatewayBaseUrl.replace(/\/+$/, '');
  return `${base}/api/llmproxy/${providerId}/v1/models`;
}

/**
 * Builds the chat completions URL for a gateway provider.
 */
export function buildChatUrl(gatewayBaseUrl: string, providerId: string): string {
  const base = gatewayBaseUrl.replace(/\/+$/, '');
  return `${base}/api/llmproxy/${providerId}/v1/chat/completions`;
}

/**
 * Builds the providers list URL for a gateway.
 */
export function buildProvidersUrl(gatewayBaseUrl: string): string {
  const base = gatewayBaseUrl.replace(/\/+$/, '');
  return `${base}/api/llmproxy/providers`;
}

/**
 * Parses provider list from gateway API response.
 */
export function parseProviderList(data: unknown): GatewayProvider[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const obj = data as Record<string, unknown>;
  const list = Array.isArray(obj.data) ? obj.data : [];

  return list
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      name: typeof item.name === 'string' ? item.name : '',
      defaultUrl: typeof item.defaultUrl === 'string' ? item.defaultUrl : '',
      defaultModelsUrl: typeof item.defaultModelsUrl === 'string' ? item.defaultModelsUrl : '',
      fallbackModels: Array.isArray(item.fallbackModels)
        ? item.fallbackModels
          .filter((m): m is Record<string, unknown> => m && typeof m === 'object')
          .map((m) => ({
            id: typeof m.id === 'string' ? m.id : '',
            label: typeof m.label === 'string' ? m.label : (typeof m.id === 'string' ? m.id : ''),
          }))
        : [],
    }))
    .filter((p) => p.id !== '');
}

/**
 * Parses model list from gateway API response.
 */
export function parseModelList(data: unknown): { id: string; label: string }[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const obj = data as Record<string, unknown>;
  const list = Array.isArray(obj.data) ? obj.data : [];

  return list
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => {
      const id = typeof item.id === 'string' ? item.id : '';
      return {
        id,
        label: id,
      };
    })
    .filter((m) => m.id !== '');
}

/**
 * Fetches provider list from a gateway.
 */
export async function fetchGatewayProviders(
  gatewayConfig: GatewayConfig,
  projectId: string
): Promise<GatewayProvider[]> {
  const token = getToken(projectId);
  if (!token) {
    throw new AuthenticationError('未登录');
  }

  const url = buildProvidersUrl(gatewayConfig.baseUrl);
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token.accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (resp.status === 401) {
    clearToken(projectId);
    throw new AuthenticationError('Token 已过期，请重新登录');
  }

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(parseErrorResponse(data));
  }

  const data = await resp.json();
  return parseProviderList(data);
}

/**
 * Creates a ProviderProfile from a gateway provider.
 * The created profile uses the openai-compatible plugin and sets gatewayProviderId.
 */
export function createProviderFromGateway(
  gatewayProvider: GatewayProvider,
  gatewayBaseUrl: string
): { name: string; apiKey: string; baseUrl: string; pluginId: string; gatewayProviderId: string } {
  return {
    name: gatewayProvider.name,
    apiKey: '',  // Gateway providers don't store API key, token is fetched at runtime
    baseUrl: buildChatUrl(gatewayBaseUrl, gatewayProvider.id),
    pluginId: 'openai-compatible',  // Use existing OpenAI-compatible plugin
    gatewayProviderId: gatewayProvider.id,
  };
}

/**
 * Gets the effective API key for a provider profile.
 * For gateway providers, returns the access token from sessionStorage.
 * For local providers, returns the stored apiKey.
 */
export function getEffectiveApiKey(
  profile: { apiKey: string; gatewayProviderId?: string },
  projectId: string
): string {
  // Gateway provider: get token from sessionStorage
  if (profile.gatewayProviderId) {
    const token = getToken(projectId);
    return token?.accessToken || '';
  }
  // Local provider: use stored apiKey
  return profile.apiKey;
}

/**
 * Checks if a provider profile is a gateway provider.
 */
export function isGatewayProvider(profile: { gatewayProviderId?: string }): boolean {
  return !!profile.gatewayProviderId;
}
