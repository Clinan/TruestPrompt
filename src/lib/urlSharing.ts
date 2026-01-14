/**
 * URL Sharing Utilities
 * 
 * Provides functions to generate shareable URLs with gateway configuration
 * and parse URL parameters for auto-login functionality.
 */

export interface ShareUrlOptions {
  gatewayUrl: string;
  clientId?: string;
  projectName?: string;
  autoLogin?: boolean;
}

/**
 * 生成包含网关配置的分享链接
 */
export function generateShareUrl(options: ShareUrlOptions): string {
  const baseUrl = window.location.origin;
  const params = new URLSearchParams();
  
  // 必需参数
  params.set('gateway', options.gatewayUrl);
  
  // 可选参数
  if (options.clientId && options.clientId !== 'truestprompt') {
    params.set('clientId', options.clientId);
  }
  
  if (options.projectName) {
    params.set('project', options.projectName);
  }
  
  if (options.autoLogin !== false) {
    params.set('autoLogin', 'true');
  }
  
  return `${baseUrl}?${params.toString()}`;
}

/**
 * 解析URL参数
 */
export function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    gatewayUrl: params.get('gateway') || params.get('gatewayUrl'),
    clientId: params.get('clientId') || params.get('client_id') || 'truestprompt',
    projectName: params.get('project') || params.get('projectName'),
    autoLogin: params.get('autoLogin') === 'true' || params.get('auto_login') === 'true'
  };
}

/**
 * 检查URL是否包含网关配置参数
 */
export function hasGatewayParams(): boolean {
  const params = parseUrlParams();
  return Boolean(params.gatewayUrl);
}

/**
 * 清除URL中的分享参数
 */
export function clearShareParams(): void {
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, '', cleanUrl);
}

/**
 * 验证网关URL格式
 */
export function validateGatewayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}