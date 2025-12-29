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
};

// Project Management Types
export type ProjectMetadata = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};
