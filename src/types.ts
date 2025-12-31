export type PluginRequest = {
  systemPrompt: string;
  userPrompts: string[];
  toolsDefinition: string;
  params: Record<string, unknown>;
  modelId: string;
  enableSuggestions: boolean;
  stream: boolean;
  messages?: Array<{ role: string; content: string; images?: ImageContent[] }>;
};

export type PluginInvokeOptions = {
  stream?: boolean;
  signal?: AbortSignal;
};

export type ProviderProfile = {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  pluginId: string;
  // 网关 Provider ID（存在则表示这是从网关导入的 Provider）
  gatewayProviderId?: string;
};

// LLM Proxy Gateway 配置
export type GatewayConfig = {
  enabled: boolean;
  baseUrl: string;           // 网关基础 URL，如 https://admin.example.com
  clientId: string;          // OAuth Client ID
  // OAuth 端点配置（可选，有默认值）
  authorizeEndpoint?: string;  // 授权端点，默认 /oauth/authorize
  tokenEndpoint?: string;      // Token 端点，默认 /oauth/token
  redirectPath?: string;       // 回调路径，默认 /auth/callback
};

// 网关 Provider 信息（从网关 API 获取）
export type GatewayProvider = {
  id: string;
  name: string;
  defaultUrl: string;
  defaultModelsUrl: string;
  fallbackModels: { id: string; label: string }[];
};

// OAuth Token 信息
export type TokenInfo = {
  accessToken: string;
  expiresAt: number;         // Unix timestamp in ms
  projectId: string;         // 关联的项目 ID
};

export type Plugin = {
  id: string;
  name: string;
  defaultBaseUrl?: string;
  listModels: (config: ProviderProfile) => Promise<{ id: string; label: string }[]>;
  invokeChat: (
    config: ProviderProfile,
    request: PluginRequest,
    options: PluginInvokeOptions
  ) => AsyncGenerator<PluginChunk, void, unknown>;
  buildCurl: (config: ProviderProfile, request: PluginRequest) => string;
};

export type ToolCall = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: unknown;
  };
  [key: string]: unknown;
};

export type PluginChunk =
  | { type: 'content'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_calls'; toolCalls: ToolCall[] }
  | { type: 'usage'; tokens: SlotMetrics['tokens'] };

export type SlotMetrics = {
  ttfbMs: number | null;
  totalMs: number | null;
  tokens?: { prompt?: number; completion?: number; total?: number };
};

export type Slot = {
  id: string;
  providerProfileId: string | null;
  pluginId: string;
  modelId: string;
  systemPrompt: string;
  paramOverride: Record<string, unknown> | null;
  selected: boolean;
  status: 'idle' | 'running' | 'done' | 'error' | 'canceled';
  output: string;
  thinking: string;
  toolCalls: ToolCall[] | null;
  metrics: SlotMetrics;
  historyId?: string;
  isExporting?: boolean;
};

export type HistoryItem = {
  id: string;
  createdAt: number;
  star: boolean;
  title: string;
  note?: string;
  providerProfileSnapshot: ProviderProfile | null;
  requestSnapshot: PluginRequest & { systemPrompt: string };
  responseSnapshot: {
    outputText: string;
    thinking?: string;
    toolCalls?: ToolCall[];
    usage?: SlotMetrics['tokens'];
    metrics: { ttfbMs: number | null; totalMs: number | null };
  };
};

// 图片内容类型 - 支持 URL 和 Base64 两种方式
export type ImageContent = {
  id: string;
  type: 'url' | 'base64';
  url?: string;           // type === 'url' 时使用
  base64?: string;        // type === 'base64' 时使用（不含 data: 前缀）
  mimeType?: string;      // type === 'base64' 时使用，如 'image/png'
  name?: string;          // 文件名（可选，用于显示）
};

export type UserPromptPreset = {
  id: string;
  role: 'system' | 'user' | 'assistant';
  text: string;
  images?: ImageContent[];  // 图片列表（仅 user 角色使用）
};

export type VariableBinding = {
  id: string;
  key: string;
  value: string;
};

// Thinking 配置类型
export type ThinkingConfig = {
  enabled: boolean;
  budget_tokens?: number;
  force_send?: boolean; // 强制发送 thinking 参数（即使模型可能不支持）
};

export type SharedState = {
  userPrompts: UserPromptPreset[];
  toolsDefinition: string;
  variables: VariableBinding[];
  defaultParams: {
    temperature: number;
    top_p: number;
    max_tokens: number;
    stream?: boolean;
    thinking?: ThinkingConfig;
  };
  enableSuggestions: boolean;
  streamOutput: boolean;
};

export type ProviderProfileDraft = {
  name: string;
  apiKey: string;
  baseUrl: string;
  pluginId: string;
  gatewayProviderId?: string;
};

// Project Management Types
export type ProjectMetadata = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  // 网关配置（可选，存在且 enabled=true 表示网关模式）
  gateway?: GatewayConfig;
};
