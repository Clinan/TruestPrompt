# Requirements Document

## Introduction

本功能为 TruestPrompt 提供 LLM Proxy Gateway 接入能力。用户可以通过 OAuth 登录网关，然后从网关导入可用的 Provider。导入的 Provider 和本地手动创建的 Provider 在使用上没有任何区别，唯一的差异是认证方式（Bearer Token vs API Key）。

**核心设计原则：最小化改动**

网关功能的本质是：
1. OAuth 登录获取 access_token
2. 从网关导入 Provider 列表，创建普通的 ProviderProfile
3. 网关 Provider 使用 Bearer Token 认证，本地 Provider 使用 API Key 认证

导入的 Provider 和本地 Provider 共存于同一个项目中，使用相同的 Slot、Plugin 逻辑。

## Glossary

- **LLM Proxy Gateway**: 后端代理服务，提供 OAuth 认证和统一的 OpenAI-Compatible API
- **Gateway Config**: 网关连接配置，包含 OAuth 端点信息，存储在项目级别
- **OAuth SSO**: 单点登录认证机制，使用 PKCE 流程确保安全性
- **PKCE**: Proof Key for Code Exchange，OAuth 2.0 扩展，用于公共客户端的安全授权
- **Access Token**: OAuth 认证成功后获取的访问令牌，用于调用网关 API
- **Gateway Provider**: 从网关导入的 Provider，使用 Bearer Token 认证
- **Local Provider**: 本地手动创建的 Provider，使用 API Key 认证
- **Provider Profile**: Provider 配置，包含名称、认证信息、Base URL 等

## Requirements

### Requirement 1

**User Story:** As a user, I want to configure a gateway connection for my project, so that I can import Providers from my organization's gateway service.

#### Acceptance Criteria

1. WHEN viewing the Provider Panel THEN the System SHALL display a "Connect Gateway" button
2. WHEN the user clicks "Connect Gateway" THEN the System SHALL display a gateway configuration form
3. WHEN configuring a gateway THEN the System SHALL require the following fields: Gateway Base URL, Client ID
4. WHEN a gateway configuration is saved THEN the System SHALL validate that all required fields are non-empty
5. WHEN a gateway configuration is saved THEN the System SHALL persist the configuration at the Project level

### Requirement 2

**User Story:** As a user, I want to log in via OAuth SSO after configuring a gateway, so that I can access the gateway's services.

#### Acceptance Criteria

1. WHEN a project has a gateway configuration and the user clicks the login button THEN the System SHALL generate PKCE parameters (code_verifier, code_challenge) and state, store them in sessionStorage, and redirect to the gateway's OAuth authorization endpoint
2. WHEN the OAuth callback returns with an authorization code THEN the System SHALL validate the state parameter against the stored value to prevent CSRF attacks
3. WHEN the state validation succeeds THEN the System SHALL exchange the authorization code for an access token using the stored code_verifier
4. WHEN the token exchange succeeds THEN the System SHALL store the access_token and expiration time in sessionStorage keyed by project identifier
5. IF the state validation fails THEN the System SHALL display an error message and abort the authentication flow
6. IF the token exchange fails THEN the System SHALL display the error message and allow the user to retry

### Requirement 3

**User Story:** As a user, I want to see my gateway authentication status, so that I know whether I am logged in.

#### Acceptance Criteria

1. WHEN the application loads a project with gateway configuration THEN the System SHALL check sessionStorage for a valid access_token
2. WHEN the project has a valid (non-expired) access_token THEN the System SHALL display a "logged in" indicator
3. WHEN the project has no token or an expired token THEN the System SHALL display a "login required" indicator
4. WHEN a user clicks the logout button THEN the System SHALL clear the access_token from sessionStorage

### Requirement 4

**User Story:** As a user, I want to import Providers from the gateway after logging in, so that I can use the gateway's LLM services.

#### Acceptance Criteria

1. WHEN a user is authenticated with the gateway THEN the System SHALL display an "Import Providers" button
2. WHEN the user clicks "Import Providers" THEN the System SHALL fetch the provider list from the gateway's /api/llmproxy/providers endpoint
3. WHEN the provider list is fetched successfully THEN the System SHALL display a selection dialog showing available providers
4. WHEN the user selects providers to import THEN the System SHALL create ProviderProfile entries for each selected provider
5. WHEN creating a gateway ProviderProfile THEN the System SHALL set the gatewayProviderId field and use the gateway's chat completions URL as baseUrl
6. IF the provider fetch fails due to authentication error (401) THEN the System SHALL clear the token and prompt the user to re-authenticate
7. IF the provider fetch fails due to other errors THEN the System SHALL display an error message and allow retry

### Requirement 5

**User Story:** As a user, I want gateway Providers to work the same as local Providers, so that I can use them in Slots without learning new workflows.

#### Acceptance Criteria

1. WHEN a gateway Provider is selected in a Slot THEN the System SHALL fetch the model list from the gateway's provider models endpoint using Bearer token authentication
2. WHEN running a Slot with a gateway Provider THEN the System SHALL send the chat completion request to the gateway with Bearer token authentication
3. WHEN stream mode is enabled THEN the System SHALL process SSE responses identically to local Providers
4. IF the request fails due to authentication error (401) THEN the System SHALL clear the token and prompt re-authentication
5. IF the model list fetch fails THEN the System SHALL fall back to the provider's fallbackModels list

### Requirement 6

**User Story:** As a user, I want to export cURL commands for gateway Providers, so that I can debug API calls outside of TruestPrompt.

#### Acceptance Criteria

1. WHEN exporting cURL for a gateway Provider THEN the System SHALL include a placeholder for the Bearer token (e.g., {{ACCESS_TOKEN}})
2. WHEN exporting cURL for a local Provider THEN the System SHALL use the stored API key (existing behavior)

### Requirement 7

**User Story:** As a user, I want to disconnect from a gateway, so that I can remove the gateway configuration if needed.

#### Acceptance Criteria

1. WHEN a project has a gateway configuration THEN the System SHALL display a "Disconnect Gateway" option
2. WHEN the user clicks "Disconnect Gateway" THEN the System SHALL display a confirmation dialog
3. WHEN the user confirms disconnection THEN the System SHALL remove the gateway configuration and clear the access token
4. WHEN disconnecting THEN the System SHALL NOT automatically delete gateway Providers (user can delete them manually if desired)

### Requirement 8

**User Story:** As a developer, I want PKCE utilities to be properly implemented, so that the OAuth flow is secure.

#### Acceptance Criteria

1. WHEN generating a code_verifier THEN the System SHALL create a cryptographically random string of 43-128 characters
2. WHEN generating a code_challenge THEN the System SHALL compute the BASE64URL-encoded SHA256 hash of the code_verifier
3. WHEN encoding to BASE64URL THEN the System SHALL replace '+' with '-', '/' with '_', and remove trailing '=' characters
4. WHEN generating a state parameter THEN the System SHALL create a cryptographically random string for CSRF protection

### Requirement 9

**User Story:** As a user, I want to handle the OAuth callback properly, so that the authentication flow completes successfully.

#### Acceptance Criteria

1. WHEN the application receives an OAuth callback THEN the System SHALL extract the code and state parameters from the URL
2. WHEN processing the callback THEN the System SHALL identify which project the callback belongs to based on the stored state
3. WHEN the callback is processed successfully THEN the System SHALL redirect to the main application page
4. IF the callback contains an error parameter THEN the System SHALL display the error message to the user

