# Implementation Plan

## Phase 1: Core Infrastructure (已完成)

- [x] 1. OAuth Module
  - [x] 1.1 PKCE 工具函数（generateCodeVerifier, generateCodeChallenge, generateState）
  - [x] 1.2 Token 存储管理（getToken, setToken, clearToken, isTokenValid）
  - [x] 1.3 OAuth 流程（startOAuthLogin, handleOAuthCallback）
  - [x] 1.4 Gateway 配置验证（validateGatewayConfig）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 8.1, 8.2, 8.3, 8.4_

- [x] 2. Gateway API Module
  - [x] 2.1 URL 构建函数（buildModelsUrl, buildChatUrl, buildProvidersUrl）
  - [x] 2.2 Provider 列表获取和解析（fetchGatewayProviders, parseProviderList）
  - [x] 2.3 错误响应解析（parseErrorResponse）
  - [x] 2.4 Provider 创建函数（createProviderFromGateway）
  - [x] 2.5 有效 API Key 获取（getEffectiveApiKey）
  - _Requirements: 4.2, 4.4, 4.5, 5.1_

- [x] 3. Property Tests (已完成)
  - [x] 3.1 Gateway 配置验证测试
    - **Property 1: Gateway config validation rejects incomplete configs**
    - **Validates: Requirements 1.3, 1.4**
  - [x] 3.2 Token 存储往返测试
    - **Property 4: Token storage round-trip**
    - **Validates: Requirements 2.4**
  - [x] 3.3 State 验证测试
    - **Property 3: State validation accepts only matching states**
    - **Validates: Requirements 2.2**
  - [x] 3.4 Provider 转换测试
    - **Property 7: Provider transformation preserves data**
    - **Validates: Requirements 4.4, 4.5**
  - [x] 3.5 Effective API Key 测试
    - **Property 8: Effective API Key for gateway providers**
    - **Validates: Requirements 5.1, 5.2**

## Phase 2: UI Integration

- [x] 4. Provider Panel 网关配置 UI
  - [x] 4.1 添加 "Connect Gateway" 按钮
    - 在 Provider Panel 中添加网关连接入口
    - _Requirements: 1.1_
  - [x] 4.2 实现网关配置表单
    - 包含 Gateway Base URL 和 Client ID 字段
    - 添加表单验证
    - _Requirements: 1.2, 1.3, 1.4_
  - [x] 4.3 实现网关配置保存
    - 将配置保存到 ProjectMetadata.gateway
    - _Requirements: 1.5_

- [x] 5. OAuth 登录 UI
  - [x] 5.1 添加登录/登出按钮
    - 根据认证状态显示不同按钮
    - _Requirements: 3.2, 3.3_
  - [x] 5.2 实现登录流程
    - 点击登录按钮触发 OAuth 流程
    - _Requirements: 2.1_
  - [x] 5.3 实现 OAuth 回调处理
    - 处理 /auth/callback 路由
    - 显示成功/失败状态
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 5.4 实现登出功能
    - 清除 token
    - _Requirements: 3.4_

- [x] 6. Provider 导入 UI
  - [x] 6.1 添加 "Import Providers" 按钮
    - 仅在已认证时显示
    - _Requirements: 4.1_
  - [x] 6.2 实现 Provider 选择对话框
    - 获取并显示可用 Provider 列表
    - 支持多选
    - _Requirements: 4.2, 4.3_
  - [x] 6.3 实现 Provider 导入
    - 为选中的 Provider 创建 ProviderProfile
    - 设置 gatewayProviderId
    - _Requirements: 4.4, 4.5_

- [x] 7. Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## Phase 3: Runtime Integration

- [x] 8. Slot 运行时集成
  - [x] 8.1 在运行 Slot 前获取有效 API Key
    - 使用 getEffectiveApiKey 获取 token 或 apiKey
    - 将有效 key 传递给 Plugin
    - _Requirements: 5.1, 5.2_
  - [x] 8.2 处理 401 认证错误
    - 清除 token 并提示重新登录
    - _Requirements: 5.4_

- [x] 9. 模型列表获取
  - [x] 9.1 网关 Provider 模型列表获取
    - 使用 Bearer token 认证
    - 失败时使用 fallbackModels
    - _Requirements: 5.1, 5.5_

- [x] 10. cURL 导出
  - [x] 10.1 网关 Provider cURL 导出
    - 使用 {{ACCESS_TOKEN}} 占位符
    - _Requirements: 6.1_

- [x] 11. Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## Phase 4: Gateway Management

- [x] 12. 网关断开连接
  - [x] 12.1 添加 "Disconnect Gateway" 选项
    - _Requirements: 7.1_
  - [x] 12.2 实现确认对话框
    - _Requirements: 7.2_
  - [x] 12.3 实现断开连接逻辑
    - 移除网关配置
    - 清除 token
    - 保留已导入的 Provider
    - _Requirements: 7.3, 7.4_

- [x] 13. Final Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。
