# LLM Proxy Gateway 接入文档

LLM Proxy Gateway 是一个后端代理服务，为前端应用提供安全的 LLM API 访问。通过 OAuth SSO 认证和统一的 OpenAI-Compatible API，前端无需持有任何厂商 API Key。

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Frontend (app.example.com)                          │
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────────┐  │
│  │  OAuth SSO  │───>│ Get Token   │───>│  Call LLM API with Bearer Token │  │
│  │   Login     │    │             │    │                                 │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Backend (admin.example.com)                              │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         OAuth Endpoints                               │   │
│  │  GET  /oauth/authorize    - 授权端点（重定向到现有登录页）              │   │
│  │  GET  /oauth/callback     - 登录成功后的回调（生成授权码）              │   │
│  │  POST /oauth/token        - 用授权码换取 access_token                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                             │                                               │
│                             ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      LLM Proxy Endpoints                              │   │
│  │  GET  /api/llmproxy/providers                    - 获取 Provider 列表  │   │
│  │  GET  /api/llmproxy/{provider}/v1/models         - 获取模型列表        │   │
│  │  POST /api/llmproxy/{provider}/v1/chat/completions - Chat Completion  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                             │                                               │
│                             ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Provider Registry                                │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                   │   │
│  │  │ OpenAI  │  │DashScope│  │   Ark   │  │   ...   │                   │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘                   │   │
│  └───────┼────────────┼───────────┼────────────┼────────────────────────┘   │
└──────────┼────────────┼───────────┼────────────┼────────────────────────────┘
           │            │           │            │
           ▼            ▼           ▼            ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ OpenAI   │  │ Aliyun   │  │ 火山引擎  │  │  其他    │
    │   API    │  │DashScope │  │   方舟   │  │ Provider │
    └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

---

## 一、OAuth SSO 认证流程

### 1.1 流程图

```
┌──────────────────┐                              ┌──────────────────┐
│     Frontend     │                              │     Backend      │
│ (app.example.com)│                              │(admin.example    │
│                  │                              │      .com)       │
└────────┬─────────┘                              └────────┬─────────┘
         │                                                 │
         │  1. 生成 PKCE 参数                               │
         │     code_verifier (随机字符串)                   │
         │     code_challenge = SHA256(code_verifier)      │
         │     state (随机字符串，防 CSRF)                  │
         │                                                 │
         │  2. 重定向到授权端点                             │
         │  ──────────────────────────────────────────────>│
         │  GET /oauth/authorize                           │
         │    ?client_id=truestprompt                      │
         │    &redirect_uri=https://app.example.com/auth/callback
         │    &response_type=code                          │
         │    &state={state}                               │
         │    &code_challenge={code_challenge}             │
         │    &code_challenge_method=S256                  │
         │                                                 │
         │  3. 重定向到现有登录页面                          │
         │  <──────────────────────────────────────────────│
         │  302 Redirect to:                               │
         │  /#/login?oauth_state={state}&oauth_callback=/oauth/callback
         │                                                 │
         │  4. 用户在现有登录页面登录                        │
         │     （使用已有的用户体系）                        │
         │                                                 │
         │  5. 登录成功后，前端带 token 调用 callback        │
         │  ──────────────────────────────────────────────>│
         │  GET /oauth/callback                            │
         │    ?state={state}                               │
         │    &token={jwt_token}                           │
         │                                                 │
         │  6. 验证 token，生成授权码，重定向回前端          │
         │  <──────────────────────────────────────────────│
         │  302 Redirect to:                               │
         │  https://app.example.com/auth/callback          │
         │    ?code={authorization_code}                   │
         │    &state={state}                               │
         │                                                 │
         │  7. 前端用授权码换取 Token                       │
         │  ──────────────────────────────────────────────>│
         │  POST /oauth/token                              │
         │    grant_type=authorization_code                │
         │    code={authorization_code}                    │
         │    redirect_uri={redirect_uri}                  │
         │    code_verifier={code_verifier}                │
         │                                                 │
         │  8. 返回 access_token                           │
         │  <──────────────────────────────────────────────│
         │  {                                              │
         │    "access_token": "eyJ...",                    │
         │    "token_type": "Bearer",                      │
         │    "expires_in": 604800                         │
         │  }                                              │
         │                                                 │
```

### 1.2 关键设计

**复用现有登录页面**：OAuth 授权端点会重定向到 `/#/login`，而不是显示一个简陋的登录表单。这样：
- 用户体验一致
- 复用现有的用户体系和登录逻辑
- 支持已有的登录功能（如记住密码、第三方登录等）

**登录页面需要的改动**：
登录页面需要检查 URL 参数，如果存在 `oauth_state` 和 `oauth_callback`，登录成功后需要重定向到：
```
/oauth/callback?state={oauth_state}&token={jwt_token}
```

### 1.3 PKCE 参数说明

| 参数 | 说明 |
|------|------|
| `code_verifier` | 43-128 字符的随机字符串，仅在前端保存 |
| `code_challenge` | `BASE64URL(SHA256(code_verifier))`，发送给后端 |
| `code_challenge_method` | 固定为 `S256` |
| `state` | 随机字符串，用于防止 CSRF 攻击 |

### 1.4 前端实现示例

```javascript
// ============================================
// 1. PKCE 工具函数
// ============================================

function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(buffer) {
    return btoa(String.fromCharCode(...buffer))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// ============================================
// 2. 发起登录
// ============================================

const OAUTH_BASE = 'https://admin.example.com';
const REDIRECT_URI = 'https://app.example.com/auth/callback';

async function login() {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateCodeVerifier();
    
    // 保存到 sessionStorage（用于回调时验证）
    sessionStorage.setItem('code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', state);
    
    // 构建授权 URL
    const params = new URLSearchParams({
        client_id: 'truestprompt',
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    });
    
    // 跳转到授权页面（会重定向到现有登录页）
    window.location.href = `${OAUTH_BASE}/oauth/authorize?${params}`;
}

// ============================================
// 3. 处理回调（在 /auth/callback 页面）
// ============================================

async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    
    // 验证 state 防止 CSRF
    if (state !== sessionStorage.getItem('oauth_state')) {
        throw new Error('Invalid state - possible CSRF attack');
    }
    
    // 获取 code_verifier
    const codeVerifier = sessionStorage.getItem('code_verifier');
    
    // 用授权码换取 Token
    const response = await fetch(`${OAUTH_BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        })
    });
    
    const data = await response.json();
    
    // 保存 Token
    sessionStorage.setItem('access_token', data.access_token);
    sessionStorage.setItem('token_expires_at', Date.now() + data.expires_in * 1000);
    
    // 清理 PKCE 数据
    sessionStorage.removeItem('code_verifier');
    sessionStorage.removeItem('oauth_state');
    
    // 跳转到首页
    window.location.href = '/';
}
```

### 1.5 登录页面改动示例

在现有的 `/#/login` 页面中，登录成功后需要检查是否是 OAuth 流程：

```javascript
// 登录成功后的处理
async function onLoginSuccess(token) {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthState = urlParams.get('oauth_state');
    const oauthCallback = urlParams.get('oauth_callback');
    
    if (oauthState && oauthCallback) {
        // OAuth 流程：重定向到 callback 端点
        window.location.href = `${oauthCallback}?state=${oauthState}&token=${token}`;
    } else {
        // 正常登录：跳转到首页
        window.location.href = '/';
    }
}
```

---

## 二、LLM Provider API 调用流程

### 2.1 流程图

```
┌──────────────────┐                              ┌──────────────────┐
│     Frontend     │                              │     Backend      │
└────────┬─────────┘                              └────────┬─────────┘
         │                                                 │
         │  1. 获取 Provider 列表                          │
         │  ──────────────────────────────────────────────>│
         │  GET /api/llmproxy/providers                    │
         │  Authorization: Bearer {token}                  │
         │                                                 │
         │  <──────────────────────────────────────────────│
         │  {                                              │
         │    "data": [                                    │
         │      {                                          │
         │        "id": "openai",                          │
         │        "name": "OpenAI",                        │
         │        "defaultUrl": "/api/llmproxy/openai/v1/chat/completions",
         │        "defaultModelsUrl": "/api/llmproxy/openai/v1/models",
         │        "fallbackModels": [...]                  │
         │      },                                         │
         │      ...                                        │
         │    ]                                            │
         │  }                                              │
         │                                                 │
         │  2. 获取模型列表（可选）                         │
         │  ──────────────────────────────────────────────>│
         │  GET /api/llmproxy/{provider}/v1/models         │
         │  Authorization: Bearer {token}                  │
         │                                                 │
         │  <──────────────────────────────────────────────│
         │  {                                              │
         │    "object": "list",                            │
         │    "data": [                                    │
         │      {"id": "gpt-4o", "object": "model"},       │
         │      ...                                        │
         │    ]                                            │
         │  }                                              │
         │                                                 │
         │  3. 发送 Chat Completion 请求                   │
         │  ──────────────────────────────────────────────>│
         │  POST /api/llmproxy/{provider}/v1/chat/completions
         │  Authorization: Bearer {token}                  │
         │  Content-Type: application/json                 │
         │  {                                              │
         │    "model": "gpt-4o",                           │
         │    "messages": [...],                           │
         │    "stream": false                              │
         │  }                                              │
         │                                                 │
         │                    ┌─────────────────────────┐  │
         │                    │   Backend 转发请求到    │  │
         │                    │   上游 Provider API     │  │
         │                    └─────────────────────────┘  │
         │                                                 │
         │  <──────────────────────────────────────────────│
         │  {                                              │
         │    "id": "chatcmpl-xxx",                        │
         │    "object": "chat.completion",                 │
         │    "choices": [...],                            │
         │    "usage": {...}                               │
         │  }                                              │
         │                                                 │
```

### 2.2 API 端点说明

#### GET /api/llmproxy/providers

获取可用的 Provider 列表。

**请求头：**
```
Authorization: Bearer {access_token}
```

**响应：**
```json
{
  "data": [
    {
      "id": "openai",
      "name": "OpenAI",
      "defaultUrl": "/api/llmproxy/openai/v1/chat/completions",
      "defaultModelsUrl": "/api/llmproxy/openai/v1/models",
      "fallbackModels": [
        {"id": "gpt-4o", "label": "GPT-4o"},
        {"id": "gpt-4o-mini", "label": "GPT-4o Mini"}
      ]
    }
  ]
}
```

#### GET /api/llmproxy/{provider}/v1/models

获取指定 Provider 的模型列表。

**响应：**
```json
{
  "object": "list",
  "data": [
    {"id": "gpt-4o", "object": "model"},
    {"id": "gpt-4o-mini", "object": "model"}
  ]
}
```

#### POST /api/llmproxy/{provider}/v1/chat/completions

发送 Chat Completion 请求，支持流式和非流式。

**请求体：**
```json
{
  "model": "gpt-4o",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**非流式响应：**
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "Hello!"},
      "finish_reason": "stop"
    }
  ],
  "usage": {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30}
}
```

**流式响应（SSE）：**
```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"!"}}]}

data: [DONE]
```

### 2.3 前端调用示例

```javascript
const API_BASE = 'https://admin.example.com/api/llmproxy';

// 非流式调用
async function chatCompletion(provider, model, messages) {
    const response = await fetch(`${API_BASE}/${provider}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, messages, stream: false })
    });
    return response.json();
}

// 流式调用
async function* streamChat(provider, model, messages) {
    const response = await fetch(`${API_BASE}/${provider}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, messages, stream: true })
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                yield JSON.parse(line.slice(6));
            }
        }
    }
}
```

---

## 三、后端配置

```yaml
llmproxy:
  oauth:
    allowed_redirect_uris:
      - "https://app.example.com/auth/callback"
      - "http://localhost:5173/auth/callback"
    code_expires_in: 300
    token_expires_in: 604800
    # 前端登录页面 URL（前后端分离时必须配置完整 URL）
    login_url: "https://admin.example.com/#/login"
    # 后端 OAuth 回调 URL
    callback_url: "https://api.example.com/oauth/callback"
  
  providers:
    openai:
      name: "OpenAI"
      api_key: "sk-xxx"
      base_url: "https://api.openai.com/v1"
      models:
        - id: "gpt-4o"
          label: "GPT-4o"
    
    dashscope:
      name: "阿里云通义千问"
      api_key: "sk-xxx"
      base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"
      models:
        - id: "qwen-plus"
          label: "Qwen Plus"
    
    ark:
      name: "火山引擎方舟"
      api_key: "xxx"
      base_url: "https://ark.cn-beijing.volces.com/api/v3"
      models:
        - id: "ep-xxx"
          label: "Doubao Pro"
```

**前后端分离说明：**
- `login_url`: 前端登录页面的完整 URL（如 `https://admin.example.com/#/login`）
- `callback_url`: 后端 OAuth 回调的完整 URL（如 `https://api.example.com/oauth/callback`）

---

## 四、错误处理

所有错误响应遵循 OpenAI 兼容格式：

```json
{
  "error": {
    "message": "错误描述",
    "type": "error_type",
    "code": "error_code"
  }
}
```

| HTTP 状态码 | type | 说明 |
|------------|------|------|
| 400 | `invalid_request_error` | 请求参数错误 |
| 401 | `authentication_error` | Token 无效或过期 |
| 404 | `not_found_error` | Provider 不存在 |
| 502 | `upstream_error` | 上游 Provider 错误 |
| 504 | `timeout_error` | 请求超时 |
