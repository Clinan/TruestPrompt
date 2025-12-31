# Design Document: LLM Proxy Gateway

## Overview

本设计实现 LLM Proxy Gateway 接入功能，允许用户通过 OAuth 登录网关，然后从网关导入 Provider。

### 核心设计原则：最小化改动

网关功能的本质非常简单：
1. **OAuth 登录**：获取 access_token
2. **导入 Provider**：从网关获取 provider 列表，创建普通的 ProviderProfile
3. **认证差异**：网关 Provider 使用 Bearer Token，本地 Provider 使用 API Key

**关键决策：**
- 导入的 Provider 和本地 Provider **完全一样**，使用相同的数据结构
- 网关 Provider 和本地 Provider 可以在同一个项目中**共存**
- 现有的 Slot、Plugin 逻辑**基本不需要改动**
- 唯一的区别是认证方式：通过 `gatewayProviderId` 字段判断是否为网关 Provider

### 数据流

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TruestPrompt Frontend                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Project                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  Gateway Config (optional)                                   │    │    │
│  │  │  - baseUrl: https://admin.example.com                       │    │    │
│  │  │  - clientId: truestprompt                                    │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  Provider Profiles (混合存储)                                │    │    │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │    │    │
│  │  │  │ Local       │  │ Local       │  │ Gateway Provider    │  │    │    │
│  │  │  │ Provider 1  │  │ Provider 2  │  │ (gatewayProviderId) │  │    │    │
│  │  │  │ apiKey: xxx │  │ apiKey: yyy │  │ apiKey: ''          │  │    │    │
│  │  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────────────────────────────────────┐  │
│  │  OAuth Module   │  │              Existing Plugin System              │  │
│  │  (Token Mgmt)   │  │  (OpenAI, DashScope, Ark, etc.)                  │  │
│  └────────┬────────┘  └──────────────────────┬──────────────────────────┘  │
│           │                                   │                             │
│           │  Token for gateway providers      │  API Key for local providers│
│           └───────────────────────────────────┴─────────────────────────────┤
│                                                                             │
│                    ┌───────────────────────────────────────┐                │
│                    │   Auth Header Selection               │                │
│                    │   - Gateway: Bearer {access_token}    │                │
│                    │   - Local: Bearer {apiKey}            │                │
│                    └───────────────────────────────────────┘                │
└────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

### 模块划分

1. **OAuth Module** (`src/lib/oauth.ts`) - 已有，保留
   - PKCE 参数生成
   - Token 存储和管理
   - OAuth 流程处理

2. **Gateway API Module** (`src/lib/gatewayApi.ts`) - 新增，简化版
   - 获取 Provider 列表
   - 构建网关 API URL
   - 错误响应解析

3. **Project Manager Extension** - 扩展现有
   - 网关配置管理
   - Provider 导入功能

4. **Plugin System** - 最小改动
   - 添加认证头选择逻辑
   - 网关 Provider 使用 Bearer Token

## Components and Interfaces

### 1. Type Definitions

```typescript
// 网关配置（存储在 ProjectMetadata 中）
type GatewayConfig = {
  enabled: boolean;
  baseUrl: string;           // 网关基础 URL
  clientId: string;          // OAuth Client ID
};

// Provider Profile（现有类型，添加一个字段）
type ProviderProfile = {
  id: string;
  name: string;
  apiKey: string;            // 本地 Provider 使用
  baseUrl: string;
  pluginId: string;
  // 网关 Provider ID（存在则表示这是网关 Provider）
  gatewayProviderId?: string;
};

// 判断是否为网关 Provider
function isGatewayProvider(profile: ProviderProfile): boolean {
  return !!profile.gatewayProviderId;
}
```

### 2. OAuth Module (保留现有实现)

```typescript
// 现有接口，无需改动
interface OAuthModule {
  // PKCE 工具
  generateCodeVerifier(): string;
  generateCodeChallenge(verifier: string): Promise<string>;
  generateState(): string;
  
  // Token 管理
  getToken(projectId: string): TokenInfo | null;
  setToken(projectId: string, token: TokenInfo): void;
  clearToken(projectId: string): void;
  isTokenValid(projectId: string): boolean;
  
  // OAuth 流程
  startOAuthLogin(gatewayConfig: GatewayConfig, projectId: string): Promise<void>;
  handleOAuthCallback(callbackUrl: string): Promise<CallbackResult>;
}
```

### 3. Gateway API Module (新增，简化版)

```typescript
// 网关 API 模块 - 仅负责获取 Provider 列表
interface GatewayApiModule {
  // 获取 Provider 列表
  fetchProviders(gatewayBaseUrl: string, accessToken: string): Promise<GatewayProvider[]>;
  
  // URL 构建
  buildProvidersUrl(gatewayBaseUrl: string): string;
  buildModelsUrl(gatewayBaseUrl: string, providerId: string): string;
  buildChatUrl(gatewayBaseUrl: string, providerId: string): string;
}

// 网关 Provider 信息
type GatewayProvider = {
  id: string;
  name: string;
  defaultUrl: string;
  defaultModelsUrl: string;
  fallbackModels: { id: string; label: string }[];
};
```

### 4. Provider Import Logic

```typescript
// 将网关 Provider 转换为 ProviderProfile
function createProviderFromGateway(
  gatewayProvider: GatewayProvider,
  gatewayBaseUrl: string
): Omit<ProviderProfile, 'id'> {
  return {
    name: gatewayProvider.name,
    apiKey: '',  // 网关 Provider 不使用 API Key
    baseUrl: buildChatUrl(gatewayBaseUrl, gatewayProvider.id),
    pluginId: 'openai-compatible',  // 使用现有的 OpenAI 兼容插件
    gatewayProviderId: gatewayProvider.id,
  };
}
```

### 5. 认证方式统一

API Key 和 Bearer Token 本质上是一样的，都是 `Authorization: Bearer {token}` 格式。

**关键洞察：** 网关 Provider 的 access_token 可以直接当作"API Key"使用！

```typescript
// 网关 Provider 的 apiKey 字段存储的就是 access_token
// 或者在运行时从 sessionStorage 获取 token 填充到 apiKey

// 方案 A：导入时不存储 token，运行时动态获取
// - 优点：token 刷新后自动生效
// - 缺点：需要在运行时判断是否为网关 Provider

// 方案 B：导入时将 token 存储到 apiKey 字段
// - 优点：完全复用现有逻辑，无需任何改动
// - 缺点：token 刷新后需要更新所有网关 Provider 的 apiKey

// 推荐方案 A：运行时动态获取 token
function getEffectiveApiKey(profile: ProviderProfile, projectId: string): string {
  // 网关 Provider：从 sessionStorage 获取 token
  if (profile.gatewayProviderId) {
    const token = getToken(projectId);
    return token?.accessToken || '';
  }
  // 本地 Provider：使用存储的 apiKey
  return profile.apiKey;
}
```

这样，现有的 Plugin 代码完全不需要改动，只需要在调用 Plugin 之前，用 `getEffectiveApiKey` 获取实际的 API Key 即可。

## Data Models

### Project Metadata with Gateway Config

```typescript
type ProjectMetadata = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  // 网关配置（可选）
  gateway?: GatewayConfig;
};

type GatewayConfig = {
  enabled: boolean;
  baseUrl: string;
  clientId: string;
};
```

### Provider Profile (Unified)

```typescript
type ProviderProfile = {
  id: string;
  name: string;
  apiKey: string;            // 本地 Provider 使用，网关 Provider 为空
  baseUrl: string;           // 网关 Provider 使用网关的 chat URL
  pluginId: string;          // 统一使用 'openai-compatible'
  gatewayProviderId?: string; // 存在则表示网关 Provider
};
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Gateway config validation rejects incomplete configs
*For any* gateway configuration object, if any required field (baseUrl, clientId) is empty or missing, validation SHALL return false.
**Validates: Requirements 1.3, 1.4**

### Property 2: Gateway config persistence round-trip
*For any* valid gateway configuration, saving to project metadata and then loading SHALL produce an equivalent configuration object.
**Validates: Requirements 1.5**

### Property 3: State validation accepts only matching states
*For any* stored state value and callback state value, validation SHALL pass if and only if the two values are identical.
**Validates: Requirements 2.2**

### Property 4: Token storage round-trip
*For any* token info object and project ID, storing and then retrieving by that project ID SHALL return an equivalent token info object.
**Validates: Requirements 2.4**

### Property 5: Error message parsing extracts message
*For any* error response object with a message field, parseErrorResponse SHALL extract and return that message string.
**Validates: Requirements 2.6, 4.7**

### Property 6: Auth status correctly reflects token validity
*For any* project ID, the auth status SHALL be "logged_in" if and only if a non-expired token exists for that project.
**Validates: Requirements 3.1, 3.2, 3.3**

### Property 7: Provider transformation preserves data and sets gatewayProviderId
*For any* valid gateway provider response, transformation SHALL produce a ProviderProfile where name matches the source, and gatewayProviderId is set to the source provider's id.
**Validates: Requirements 4.4, 4.5**

### Property 8: Effective API Key for gateway providers
*For any* gateway provider profile and project with valid token, getEffectiveApiKey SHALL return the access_token from the project's stored token.
**Validates: Requirements 5.1, 5.2**

### Property 9: PKCE parameter format validation
*For any* generated code_verifier, the length SHALL be between 43 and 128 characters, and all characters SHALL be from the unreserved character set.
**Validates: Requirements 8.1, 8.4**

### Property 10: Code challenge is deterministic SHA256 hash
*For any* code_verifier, generating the code_challenge multiple times SHALL produce the same BASE64URL-encoded SHA256 hash.
**Validates: Requirements 8.2**

### Property 11: BASE64URL encoding format
*For any* byte array input, BASE64URL encoding SHALL not contain '+', '/', or trailing '=' characters.
**Validates: Requirements 8.3**

### Property 12: Callback parameter extraction
*For any* OAuth callback URL with code and state query parameters, extraction SHALL return the exact values from the URL.
**Validates: Requirements 9.1, 9.4**

### Property 13: Project identification from state
*For any* stored PKCE data with state S and project ID P, when callback contains state S, the identified project SHALL be P.
**Validates: Requirements 9.2**

## Error Handling

### Authentication Errors

| Error Type | Handling |
|------------|----------|
| State mismatch | Display "认证失败：状态验证失败，可能存在 CSRF 攻击" |
| Token exchange failed | Display error from response, allow retry |
| Token expired (401) | Clear token, show login prompt |
| Network error | Display "网络错误，请检查连接后重试" |

### API Errors

| HTTP Status | Handling |
|-------------|----------|
| 401 | Clear token, prompt re-authentication |
| 400 | Display "请求参数错误" + error.message |
| 404 | Display "Provider 不存在" |
| 500 | Display "服务器内部错误" |

### Graceful Degradation

- 如果 Provider 列表获取失败，显示错误但不阻塞其他功能
- 如果模型列表获取失败，使用 fallbackModels
- 如果 token 过期，提示用户重新登录

## Testing Strategy

### Unit Testing

使用 **Vitest** 进行单元测试，覆盖：

1. **OAuth 工具函数**
   - `generateCodeVerifier()` 输出格式验证
   - `generateCodeChallenge()` 哈希计算正确性
   - 授权 URL 构建正确性

2. **Token 管理**
   - Token 存储和读取
   - Token 过期检测
   - Token 清除

3. **Gateway API**
   - Provider 列表解析
   - URL 构建
   - 错误响应解析

4. **Provider 转换**
   - Gateway Provider → ProviderProfile 转换
   - gatewayProviderId 设置

5. **Effective API Key**
   - 网关 Provider 返回 access_token
   - 本地 Provider 返回 apiKey

### Property-Based Testing

使用 **fast-check** 库进行属性测试，每个测试运行至少 100 次迭代。

测试标注格式：`**Feature: llm-proxy-gateway, Property {number}: {property_text}**`

```typescript
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

// Property 3: State validation
describe('State validation', () => {
  it('Property 3: accepts only matching states', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (storedState, callbackState) => {
          const isValid = validateState(storedState, callbackState);
          return isValid === (storedState === callbackState);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 8: Effective API Key
describe('Effective API Key', () => {
  it('Property 8: returns access_token for gateway providers', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          name: fc.string(),
          apiKey: fc.string(),
          baseUrl: fc.string(),
          pluginId: fc.string(),
          gatewayProviderId: fc.option(fc.string({ minLength: 1 })),
        }),
        fc.string(), // accessToken
        (profile, accessToken) => {
          // If gateway provider and token exists, return token
          // If local provider, return apiKey
          return true; // Implementation details
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Integration Testing

手动测试关键流程：

1. 配置网关 → 点击登录 → OAuth 跳转
2. OAuth 回调 → Token 存储 → 显示已登录
3. 点击导入 → 获取 Provider 列表 → 选择导入
4. 使用导入的 Provider → 选择模型 → 运行 Slot
5. 断开网关 → 确认 → Provider 保留
6. Token 过期 → 提示重新登录

