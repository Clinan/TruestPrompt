import type { Plugin, ProviderProfile, ToolCall, PluginChunk, ImageContent } from '../types';
import { assertToolsDefinition } from './tools';
import { hasMeaningfulContent } from './textUtils';
import { buildDataUrl } from './imageUtils';

type PluginRequest = import('../types').PluginRequest;
type PluginInvokeOptions = import('../types').PluginInvokeOptions;

// OpenAI Vision API 消息内容类型
type VisionContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type VisionMessage = {
  role: string;
  content: string | VisionContentPart[];
};

type OpenAICompatibleConfig = {
  id: string;
  name: string;
  defaultUrl: string;
  defaultModelsUrl?: string;
  apiKeyPlaceholder: string;
  fallbackModels: { id: string; label: string }[];
  authHeader?: string;
  authPrefix?: string;
};

function parseTools(toolsDefinition: string) {
  return assertToolsDefinition(toolsDefinition);
}

function removeEmptyEntries(obj: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    cleaned[key] = value;
  });
  return cleaned;
}

type ToolCallBuilder = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments: string;
  };
};

function normalizeToolCalls(builders: Record<number, ToolCallBuilder>) {
  return Object.values(builders)
    .map<ToolCall>((builder) => ({
      id: builder.id,
      type: builder.type,
      function: builder.function
        ? {
            name: builder.function.name,
            arguments: builder.function.arguments
          }
        : undefined
    }))
    .filter((call) => call.function && (call.function.name || call.function.arguments));
}

async function* streamOpenAIStyle(resp: Response): AsyncGenerator<PluginChunk, void, unknown> {
  if (!resp.body) throw new Error('No stream body');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;
  const toolCallBuilders: Record<number, ToolCallBuilder> = {};

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.replace(/^data:\s*/, '');
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        const usage = parsed?.usage;
        if (usage && typeof usage === 'object') {
          const promptTokens =
            typeof usage.prompt_tokens === 'number'
              ? usage.prompt_tokens
              : typeof usage.prompt === 'number'
                ? usage.prompt
                : undefined;
          const completionTokens =
            typeof usage.completion_tokens === 'number'
              ? usage.completion_tokens
              : typeof usage.completion === 'number'
                ? usage.completion
                : undefined;
          const totalTokens =
            typeof usage.total_tokens === 'number' ? usage.total_tokens : typeof usage.total === 'number' ? usage.total : undefined;
          if (promptTokens !== undefined || completionTokens !== undefined || totalTokens !== undefined) {
            yield {
              type: 'usage',
              tokens: {
                prompt: promptTokens,
                completion: completionTokens,
                total: totalTokens
              }
            };
          }
        }
        const delta = parsed.choices?.[0]?.delta;
        
        // 处理 thinking/reasoning 内容（Claude extended thinking / DeepSeek reasoning）
        const thinkingContent = delta?.thinking || delta?.reasoning_content || delta?.reasoning;
        if (thinkingContent) {
          yield { type: 'thinking', text: thinkingContent as string };
        }
        
        const content = delta?.content;
        if (content) {
          yield { type: 'content', text: content as string };
        }
        const toolCallsDelta = Array.isArray(delta?.tool_calls) ? delta.tool_calls : null;
        if (toolCallsDelta) {
          for (const entry of toolCallsDelta) {
            const index = typeof entry?.index === 'number' ? entry.index : 0;
            const builder = (toolCallBuilders[index] ||= { function: { arguments: '' } });
            if (entry?.id) builder.id = entry.id;
            if (entry?.type) builder.type = entry.type;
            const fn = entry?.function;
            if (fn?.name) {
              builder.function = builder.function || { arguments: '' };
              builder.function.name = fn.name;
            }
            if (typeof fn?.arguments === 'string') {
              builder.function = builder.function || { arguments: '' };
              builder.function.arguments = `${builder.function.arguments}${fn.arguments}`;
            }
          }
          const snapshot = normalizeToolCalls(toolCallBuilders);
          if (snapshot.length) {
            yield { type: 'tool_calls', toolCalls: snapshot };
          }
        }
        const finishReason = parsed.choices?.[0]?.finish_reason;
        if (finishReason === 'tool_calls' && Object.keys(toolCallBuilders).length) {
          yield { type: 'tool_calls', toolCalls: normalizeToolCalls(toolCallBuilders) };
          Object.keys(toolCallBuilders).forEach((key) => delete toolCallBuilders[Number(key)]);
        }
      } catch (err) {
        console.warn('解析流式 chunk 失败', err, payload);
      }
    }
  }
  if (Object.keys(toolCallBuilders).length) {
    yield { type: 'tool_calls', toolCalls: normalizeToolCalls(toolCallBuilders) };
  }
}

/**
 * 将图片转换为 OpenAI Vision API 格式的 image_url 内容
 */
function imageToVisionContent(image: ImageContent): VisionContentPart {
  let url: string;
  
  if (image.type === 'url') {
    url = image.url || '';
  } else {
    // Base64 图片需要构建 data URL
    url = buildDataUrl(image.base64 || '', image.mimeType || 'image/png');
  }
  
  return {
    type: 'image_url',
    image_url: { url }
  };
}

/**
 * 构建带图片的消息内容（OpenAI Vision API 格式）
 */
function buildVisionContent(text: string, images?: ImageContent[]): string | VisionContentPart[] {
  // 如果没有图片，返回纯文本
  if (!images || images.length === 0) {
    return text;
  }
  
  // 有图片时，构建 content 数组
  const content: VisionContentPart[] = [];
  
  // 添加文本内容（如果有）
  if (hasMeaningfulContent(text)) {
    content.push({ type: 'text', text });
  }
  
  // 添加图片内容
  for (const image of images) {
    content.push(imageToVisionContent(image));
  }
  
  return content;
}

function normalizeMessages(request: PluginRequest): VisionMessage[] {
  const normalizedMessages = Array.isArray(request.messages)
    ? request.messages
        .map((msg) => {
          const role = msg && typeof msg.role === 'string' ? msg.role : 'user';
          const text = typeof msg.content === 'string' ? msg.content : '';
          const images = Array.isArray((msg as any).images) ? (msg as any).images as ImageContent[] : undefined;
          
          return {
            role,
            content: buildVisionContent(text, images)
          };
        })
        .filter((msg) => {
          // 过滤无意义内容：纯文本需要有内容，或者有图片
          if (typeof msg.content === 'string') {
            return hasMeaningfulContent(msg.content);
          }
          // content 是数组时，至少要有一个元素
          return Array.isArray(msg.content) && msg.content.length > 0;
        })
    : null;
    
  // 过滤无意义内容的 user prompts
  const fallbackMessages = request.userPrompts
    .filter((content) => hasMeaningfulContent(content))
    .map((content) => ({ role: 'user', content }));
    
  const messages: VisionMessage[] = normalizedMessages?.length ? normalizedMessages.slice() : fallbackMessages.slice();
  
  // 只有有意义内容的 system prompt 才添加
  if (hasMeaningfulContent(request.systemPrompt)) {
    messages.unshift({ role: 'system', content: request.systemPrompt });
  }
  
  return messages;
}

function createOpenAICompatiblePlugin(options: OpenAICompatibleConfig): Plugin {
  const authHeader = options.authHeader || 'Authorization';
  const authPrefix = options.authPrefix || 'Bearer ';

  return {
    id: options.id,
    name: options.name,
    defaultBaseUrl: options.defaultUrl,
    async listModels(config) {
      const chatUrl = config.baseUrl || options.defaultUrl;
      const modelsUrl =
        options.defaultModelsUrl ||
        (chatUrl.endsWith('/chat/completions')
          ? chatUrl.replace(/\/chat\/completions$/, '/models')
          : `${chatUrl.replace(/\/chat\/completions$/, '')}/models`);

      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (config.apiKey) {
          headers[authHeader] = `${authPrefix}${config.apiKey}`.trim();
        }
        const resp = await fetch(modelsUrl, { headers });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = await resp.json();
        const list =
          (Array.isArray((data as any)?.data) && (data as any).data) ||
          (Array.isArray((data as any)?.models) && (data as any).models) ||
          (Array.isArray((data as any)?.result?.data) && (data as any).result.data) ||
          (Array.isArray((data as any)?.result?.models) && (data as any).result.models) ||
          [];

        const mapped = (list as any[])
          .map((item) => {
            let id =
              (typeof item?.id === 'string' && item.id) ||
              (typeof item?.model_id === 'string' && item.model_id) ||
              (typeof item?.name === 'string' && item.name) ||
              '';
            if (!id) return null;
            if (id.startsWith('models/')) {
              id = id.slice('models/'.length);
            }
            const desc =
              (typeof item?.description === 'string' && item.description) ||
              (typeof item?.display_name === 'string' && item.display_name) ||
              (typeof item?.label === 'string' && item.label) ||
              '';
            return { id, label: desc ? `${id} (${desc})` : id };
          })
          .filter((item): item is { id: string; label: string } => Boolean(item));

        if (mapped.length) return mapped;
      } catch (err) {
        console.warn(`加载 ${options.name} 模型列表失败，将使用备用列表`, err);
      }

      return options.fallbackModels;
    },
    async *invokeChat(config: ProviderProfile, request: PluginRequest, opts: PluginInvokeOptions) {
      const controller = new AbortController();
      if (opts.signal) {
        opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      const useStream = opts.stream !== false && request.stream !== false;
      const messages = normalizeMessages(request);
      
      // 智能处理 thinking 参数：
      // - 如果 enabled 为 true，必须发送（非 GPT 模型或 force_send）
      // - 如果 enabled 为 false 且 force_send 为 true，发送 thinking: { enabled: false }
      // - 如果模型 ID 包含 'gpt'（不区分大小写）且未强制发送，不传递
      const { thinking, ...restParams } = request.params || {};
      const thinkingConfig = thinking as { enabled?: boolean; budget_tokens?: number; force_send?: boolean } | undefined;
      const modelIdLower = (request.modelId || '').toLowerCase();
      const isGptModel = modelIdLower.includes('gpt');
      
      const finalParams = { ...restParams };
      if (thinkingConfig) {
        if (thinkingConfig.enabled) {
          // 开启思考：非 GPT 模型必须发送
          if (!isGptModel) {
            finalParams.thinking = {
              enabled: true,
              ...(thinkingConfig.budget_tokens ? { budget_tokens: thinkingConfig.budget_tokens } : {})
            };
          }
        } else if (thinkingConfig.force_send) {
          // 关闭思考但强制发送：发送 thinking: { enabled: false }
          finalParams.thinking = { enabled: false };
        }
      }
      
      const body = {
        model: request.modelId,
        messages,
        tools: parseTools(request.toolsDefinition),
        stream: useStream,
        ...finalParams
      };

      const payload = removeEmptyEntries(body);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (config.apiKey && config.apiKey.trim()) {
        headers[authHeader] = `${authPrefix}${config.apiKey}`.trim();
      }
      const resp = await fetch(config.baseUrl || options.defaultUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text}`);
      }

      if (useStream) {
        yield* streamOpenAIStyle(resp);
      } else {
        const data = await resp.json();
        const message = data?.choices?.[0]?.message;
        
        // 处理 thinking/reasoning 内容
        const thinkingContent = message?.thinking || message?.reasoning_content || message?.reasoning;
        if (thinkingContent) {
          yield { type: 'thinking', text: thinkingContent as string };
        }
        
        const content = message?.content;
        if (content) {
          yield { type: 'content', text: content as string };
        }
        const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : null;
        if (toolCalls?.length) {
          yield { type: 'tool_calls', toolCalls };
        }
        const usage = data?.usage;
        if (usage && typeof usage === 'object') {
          const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined;
          const completionTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined;
          const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined;
          if (promptTokens !== undefined || completionTokens !== undefined || totalTokens !== undefined) {
            yield { type: 'usage', tokens: { prompt: promptTokens, completion: completionTokens, total: totalTokens } };
          }
        }
      }
    },
    buildCurl(config, request) {
      const useStream = request.stream !== false;
      const messages = normalizeMessages(request);
      
      // 智能处理 thinking 参数（与 invokeChat 逻辑一致）
      const { thinking, ...restParams } = request.params || {};
      const thinkingConfig = thinking as { enabled?: boolean; budget_tokens?: number; force_send?: boolean } | undefined;
      const modelIdLower = (request.modelId || '').toLowerCase();
      const isGptModel = modelIdLower.includes('gpt');
      
      const finalParams = { ...restParams };
      if (thinkingConfig) {
        if (thinkingConfig.enabled) {
          if (!isGptModel) {
            finalParams.thinking = {
              enabled: true,
              ...(thinkingConfig.budget_tokens ? { budget_tokens: thinkingConfig.budget_tokens } : {})
            };
          }
        } else if (thinkingConfig.force_send) {
          finalParams.thinking = { enabled: false };
        }
      }
      
      const body = removeEmptyEntries({
        model: request.modelId,
        messages,
        tools: parseTools(request.toolsDefinition),
        stream: useStream,
        ...finalParams
      });

      const apiKey = config.apiKey || options.apiKeyPlaceholder;
      const url = config.baseUrl || options.defaultUrl;
      return (
        `curl -H "Content-Type: application/json" ` +
        `-H "${authHeader}: ${authPrefix}${apiKey}" ` +
        `-X POST ${url} -d '${JSON.stringify(body, null, 2)}'`
      );
    }
  };
}

// 导出用于测试的函数
export { imageToVisionContent, buildVisionContent, normalizeMessages };
export type { VisionContentPart, VisionMessage };

export const plugins: Plugin[] = [
  createOpenAICompatiblePlugin({
    id: 'openai-compatible',
    name: 'OpenAI',
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
    apiKeyPlaceholder: '{{OPENAI_API_KEY}}',
    fallbackModels: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { id: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' }
    ]
  }),
  createOpenAICompatiblePlugin({
    id: 'Gemini',
    name: 'Gemini',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions',
    apiKeyPlaceholder: '{{GEMINI_API_KEY}}',
    defaultModelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/v1/models',
    fallbackModels: [
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' }
    ]
  }),
  createOpenAICompatiblePlugin({
    id: 'aliyun-dashscope',
    name: 'Aliyun DashScope (通义)',
    defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKeyPlaceholder: '{{ALIYUN_API_KEY}}',
    defaultModelsUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    fallbackModels: [
      { id: 'qwen-plus', label: 'qwen-plus' },
      { id: 'qwen-max', label: 'qwen-max' },
      { id: 'qwen-vl-max', label: 'qwen-vl-max' }
    ]
  }),
  createOpenAICompatiblePlugin({
    id: 'kimi-moonshot',
    name: 'Kimi (Moonshot)',
    defaultUrl: 'https://api.moonshot.cn/v1/chat/completions',
    apiKeyPlaceholder: '{{KIMI_API_KEY}}',
    defaultModelsUrl: 'https://api.moonshot.cn/v1/models',
    fallbackModels: [
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
      { id: 'moonshot-v1-128k', label: 'moonshot-v1-128k' }
    ]
  }),
  createOpenAICompatiblePlugin({
    id: 'ark-bytedance',
    name: '方舟 Ark (ByteDance)',
    defaultUrl: 'https://ark.cn-beijing.volces.com/api/v1/chat/completions',
    apiKeyPlaceholder: '{{ARK_API_KEY}}',
    // 跨域了，走代理
    defaultModelsUrl: '/proxy/ark/api/v3/models',
    fallbackModels: [
      { id: 'doubao-pro-32k', label: 'doubao-pro-32k' },
      { id: 'doubao-vision', label: 'doubao-vision' },
      { id: 'doubao-lite-128k', label: 'doubao-lite-128k' }
    ],
    authHeader: 'Authorization',
    authPrefix: 'Bearer '
  })
];
