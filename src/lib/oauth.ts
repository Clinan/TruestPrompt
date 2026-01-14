/**
 * OAuth Module for LLM Proxy Gateway
 * 
 * Implements OAuth 2.0 Authorization Code + PKCE flow using oauth4webapi library.
 * Manages token storage in sessionStorage, keyed by gateway ID.
 */

import * as oauth from 'oauth4webapi';
import type { GatewayConfig, TokenInfo } from '../core/types';

// Storage key prefixes
const TOKEN_PREFIX = 'truestprompt-gateway-token-';
const PKCE_PREFIX = 'truestprompt-gateway-pkce-';

// PKCE data stored during OAuth flow
type StoredPKCE = {
  codeVerifier: string;
  state: string;
  projectId: string;
  gatewayBaseUrl: string;
  tokenEndpoint: string;      // 保存 token 端点用于回调
  redirectPath: string;       // 保存回调路径
  timestamp: number;
};

// OAuth 端点默认值
export const DEFAULT_AUTHORIZE_ENDPOINT = '/oauth/authorize';
export const DEFAULT_TOKEN_ENDPOINT = '/oauth/token';
export const DEFAULT_REDIRECT_PATH = '/auth/callback';
export const DEFAULT_CLIENT_ID = 'truestprompt';

/**
 * 获取完整的授权端点 URL
 */
export function getAuthorizeUrl(config: GatewayConfig): string {
  const endpoint = config.authorizeEndpoint || DEFAULT_AUTHORIZE_ENDPOINT;
  return `${config.baseUrl}${endpoint}`;
}

/**
 * 获取完整的 Token 端点 URL
 */
export function getTokenUrl(config: GatewayConfig): string {
  const endpoint = config.tokenEndpoint || DEFAULT_TOKEN_ENDPOINT;
  return `${config.baseUrl}${endpoint}`;
}

/**
 * 获取回调 URI
 */
export function getRedirectUri(config: GatewayConfig): string {
  const path = config.redirectPath || DEFAULT_REDIRECT_PATH;
  return `${window.location.origin}${path}`;
}

/**
 * Validates that a gateway configuration has all required fields.
 * Returns true if valid, false otherwise.
 */
export function validateGatewayConfig(config: Partial<GatewayConfig> | undefined): config is GatewayConfig {
  if (!config) return false;
  if (typeof config.enabled !== 'boolean') return false;
  if (!config.enabled) return true; // Disabled config is valid

  // When enabled, baseUrl must be non-empty string
  if (typeof config.baseUrl !== 'string' || config.baseUrl.trim() === '') return false;
  
  // clientId defaults to 'truestprompt' if not provided
  if (!config.clientId || typeof config.clientId !== 'string') {
    config.clientId = DEFAULT_CLIENT_ID;
  }

  return true;
}

/**
 * Validates that a gateway configuration is complete for OAuth flow.
 * More strict than validateGatewayConfig - requires enabled=true and all fields.
 */
export function isGatewayConfigComplete(config: GatewayConfig | undefined): boolean {
  if (!config || !config.enabled) return false;
  return (
    config.baseUrl.trim() !== '' &&
    (config.clientId || DEFAULT_CLIENT_ID).trim() !== ''
  );
}

// ============================================
// PKCE Utilities (using oauth4webapi)
// ============================================

/**
 * Generates a cryptographically random code_verifier.
 * Length is 43-128 characters from unreserved character set.
 */
export function generateCodeVerifier(): string {
  return oauth.generateRandomCodeVerifier();
}

/**
 * Computes the BASE64URL-encoded SHA256 hash of the code_verifier.
 * Uses Web Crypto API (works in browser and modern Node.js).
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  // Use Web Crypto API directly for better compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to BASE64URL
  let base64 = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  for (let i = 0; i < hashArray.length; i += 3) {
    const a = hashArray[i];
    const b = hashArray[i + 1] || 0;
    const c = hashArray[i + 2] || 0;

    base64 += chars[a >> 2];
    base64 += chars[((a & 3) << 4) | (b >> 4)];
    base64 += i + 1 < hashArray.length ? chars[((b & 15) << 2) | (c >> 6)] : '';
    base64 += i + 2 < hashArray.length ? chars[c & 63] : '';
  }

  // Convert to BASE64URL: replace + with -, / with _, remove =
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generates a cryptographically random state parameter for CSRF protection.
 */
export function generateState(): string {
  return oauth.generateRandomState();
}

// ============================================
// Token Storage
// ============================================

/**
 * Retrieves the stored token for a project.
 */
export function getToken(projectId: string): TokenInfo | null {
  try {
    const stored = sessionStorage.getItem(`${TOKEN_PREFIX}${projectId}`);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as TokenInfo;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Stores a token for a project.
 */
export function setToken(projectId: string, token: TokenInfo): void {
  sessionStorage.setItem(`${TOKEN_PREFIX}${projectId}`, JSON.stringify(token));
}

/**
 * Clears the token for a project.
 */
export function clearToken(projectId: string): void {
  sessionStorage.removeItem(`${TOKEN_PREFIX}${projectId}`);
}

/**
 * Checks if a project has a valid (non-expired) token.
 */
export function isTokenValid(projectId: string): boolean {
  const token = getToken(projectId);
  if (!token) return false;
  return Date.now() < token.expiresAt;
}

/**
 * Checks if a token is expiring soon (within threshold).
 * Default threshold is 5 minutes (300000ms).
 */
export function isTokenExpiringSoon(projectId: string, thresholdMs: number = 5 * 60 * 1000): boolean {
  const token = getToken(projectId);
  if (!token) return true; // No token = needs refresh
  return (token.expiresAt - Date.now()) < thresholdMs;
}

/**
 * Gets the authentication status for a project.
 */
export function getAuthStatus(projectId: string): 'logged_in' | 'expired' | 'logged_out' {
  const token = getToken(projectId);
  if (!token) return 'logged_out';
  if (Date.now() >= token.expiresAt) return 'expired';
  return 'logged_in';
}

// ============================================
// PKCE Storage (for OAuth callback)
// ============================================

/**
 * Stores PKCE data for OAuth callback.
 */
export function storePKCE(state: string, data: Omit<StoredPKCE, 'state'>): void {
  const pkceData: StoredPKCE = { ...data, state };
  sessionStorage.setItem(`${PKCE_PREFIX}${state}`, JSON.stringify(pkceData));
}

/**
 * Retrieves and removes PKCE data by state.
 */
export function retrievePKCE(state: string): StoredPKCE | null {
  try {
    const stored = sessionStorage.getItem(`${PKCE_PREFIX}${state}`);
    if (!stored) return null;

    // Remove after retrieval (one-time use)
    sessionStorage.removeItem(`${PKCE_PREFIX}${state}`);

    return JSON.parse(stored) as StoredPKCE;
  } catch {
    return null;
  }
}

// ============================================
// OAuth Flow
// ============================================

/**
 * Starts the OAuth login flow for a project.
 * Generates PKCE parameters, stores them, and redirects to authorization endpoint.
 */
export async function startOAuthLogin(
  gatewayConfig: GatewayConfig,
  projectId: string
): Promise<void> {
  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Get redirect URI from config
  const redirectUri = getRedirectUri(gatewayConfig);

  // Store PKCE data for callback
  storePKCE(state, {
    codeVerifier,
    projectId,
    gatewayBaseUrl: gatewayConfig.baseUrl,
    tokenEndpoint: gatewayConfig.tokenEndpoint || DEFAULT_TOKEN_ENDPOINT,
    redirectPath: gatewayConfig.redirectPath || DEFAULT_REDIRECT_PATH,
    timestamp: Date.now(),
  });

  // Build authorization URL
  const authUrl = new URL(getAuthorizeUrl(gatewayConfig));
  authUrl.searchParams.set('client_id', gatewayConfig.clientId || DEFAULT_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Redirect to authorization page
  window.location.href = authUrl.toString();
}

/**
 * Validates that the callback state matches a stored state.
 */
export function validateState(storedState: string, callbackState: string): boolean {
  return storedState === callbackState;
}

/**
 * Extracts OAuth callback parameters from a URL.
 */
export function extractCallbackParams(url: string): { code?: string; state?: string; error?: string; errorDescription?: string } {
  try {
    const urlObj = new URL(url);
    return {
      code: urlObj.searchParams.get('code') || undefined,
      state: urlObj.searchParams.get('state') || undefined,
      error: urlObj.searchParams.get('error') || undefined,
      errorDescription: urlObj.searchParams.get('error_description') || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Handles the OAuth callback.
 * Validates state, exchanges code for token, and stores the token.
 */
export async function handleOAuthCallback(callbackUrl: string): Promise<{ success: true; projectId: string } | { success: false; error: string }> {
  const params = extractCallbackParams(callbackUrl);

  // Check for error response
  if (params.error) {
    return {
      success: false,
      error: params.errorDescription || params.error || '认证失败',
    };
  }

  // Validate required parameters
  if (!params.code || !params.state) {
    return {
      success: false,
      error: '回调参数不完整',
    };
  }

  // Retrieve PKCE data
  const pkceData = retrievePKCE(params.state);
  if (!pkceData) {
    return {
      success: false,
      error: '认证失败：状态验证失败，可能存在 CSRF 攻击',
    };
  }

  // Build token URL and redirect URI from stored PKCE data
  const tokenUrl = `${pkceData.gatewayBaseUrl}${pkceData.tokenEndpoint}`;
  const redirectUri = `${window.location.origin}${pkceData.redirectPath}`;

  // Exchange code for token
  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: redirectUri,
        code_verifier: pkceData.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      return {
        success: false,
        error: (errorData as any)?.error_description || (errorData as any)?.error || `Token 交换失败: HTTP ${tokenResponse.status}`,
      };
    }

    const tokenData = await tokenResponse.json();
    const expiresIn = typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 604800; // Default 7 days

    // Store token
    const tokenInfo: TokenInfo = {
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
      projectId: pkceData.projectId,
    };
    setToken(pkceData.projectId, tokenInfo);

    return {
      success: true,
      projectId: pkceData.projectId,
    };
  } catch (err) {
    return {
      success: false,
      error: `网络错误: ${err instanceof Error ? err.message : '未知错误'}`,
    };
  }
}

/**
 * Logs out from a project by clearing its token.
 */
export function logout(projectId: string): void {
  clearToken(projectId);
}


// ============================================
// Token Refresh
// ============================================

/**
 * Checks if any project tokens need refresh and returns the project IDs.
 */
export function getProjectsNeedingRefresh(
  projectIds: string[],
  thresholdMs: number = 5 * 60 * 1000
): string[] {
  return projectIds.filter(id => {
    const token = getToken(id);
    if (!token) return false; // No token = needs login, not refresh
    return isTokenExpiringSoon(id, thresholdMs);
  });
}

/**
 * Attempts to refresh a token for a project.
 * Note: This requires the gateway to support token refresh endpoint.
 * If not supported, returns null and the user should re-authenticate.
 */
export async function refreshToken(
  _gatewayConfig: GatewayConfig,
  projectId: string
): Promise<TokenInfo | null> {
  const currentToken = getToken(projectId);
  if (!currentToken) {
    return null;
  }

  // Note: The LLM Proxy Gateway documentation doesn't specify a refresh token endpoint.
  // In a real implementation, you would call the refresh endpoint here.
  // For now, we return null to indicate refresh is not supported,
  // and the user should re-authenticate.

  return null;
}

/**
 * Checks and refreshes tokens for the current project.
 * Returns true if token needs re-authentication.
 */
export async function checkAndRefreshTokens(
  projectId: string,
  gatewayConfig: GatewayConfig | undefined
): Promise<boolean> {
  if (!gatewayConfig?.enabled) return false;

  if (isTokenExpiringSoon(projectId)) {
    const refreshed = await refreshToken(gatewayConfig, projectId);
    if (!refreshed) {
      return true; // Needs re-auth
    }
  }

  return false;
}
