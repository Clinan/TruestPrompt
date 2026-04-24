import type { Plugin, ProviderProfile, PluginRequest, PluginInvokeOptions } from '../../../../core/types';
import { createAlibaba } from '@ai-sdk/alibaba';
import { streamOpenAIStyle } from './common';
import type { AlibabaLanguageModelOptions } from '@ai-sdk/alibaba';

export type AlibabaCompatibleConfig = {
  id: string;
  name: string;
  defaultUrl: string;
  apiKeyPlaceholder: string;
  fallbackModels: { id: string; label: string }[];
};

export function createAlibabaPlugin(options: AlibabaCompatibleConfig): Plugin {
  const authHeader = 'Authorization';
  const authPrefix = 'Bearer ';

  return {
    id: options.id,
    name: options.name,
    defaultBaseUrl: options.defaultUrl,

    async listModels(config) {
      const chatUrl = config.baseUrl || options.defaultUrl;
      const modelsUrl = chatUrl.endsWith('/chat/completions')
        ? chatUrl.replace(/\/chat\/completions$/, '/models')
        : `${chatUrl.replace(/\/chat\/completions$/, '')}/models`;

      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (config.apiKey) {
          headers[authHeader] = `${authPrefix}${config.apiKey}`.trim();
        }
        const resp = await fetch(modelsUrl, { headers });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();
        const list =
          (Array.isArray((data as any)?.data) && (data as any).data) ||
          (Array.isArray((data as any)?.models) && (data as any).models) ||
          [];

        const mapped = (list as any[])
          .map((item) => {
            let id =
              (typeof item?.id === 'string' && item.id) ||
              (typeof item?.model_id === 'string' && item.model_id) ||
              (typeof item?.name === 'string' && item.name) ||
              '';
            if (!id) return null;
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

      // createAlibaba 会自动拼接 /chat/completions，需去掉后缀避免路径重复
      const rawUrl = config.baseUrl || options.defaultUrl;
      const alibabaBaseURL = rawUrl.endsWith('/chat/completions')
        ? rawUrl.replace(/\/chat\/completions$/, '')
        : rawUrl;

      const alibabaProvider = createAlibaba({
        baseURL: alibabaBaseURL,
        apiKey: config.apiKey,
        headers: config.apiKey && config.apiKey.trim()
          ? { Authorization: `${authPrefix}${config.apiKey}`.trim() }
          : {},
        includeUsage: true,
      });

      const model = alibabaProvider.chatModel(request.modelId);

      // 构建 thinking 配置：AI SDK 自动将 enableThinking → enable_thinking
      const { thinking, ...restParams } = request.params || {};
      const thinkingConfig = thinking as { enabled?: boolean; budget_tokens?: number; force_send?: boolean } | undefined;

      const alibabaOptions: AlibabaLanguageModelOptions = {};
      if (thinkingConfig?.enabled) {
        alibabaOptions.enableThinking = true;
        if (thinkingConfig.budget_tokens) {
          alibabaOptions.thinkingBudget = thinkingConfig.budget_tokens;
        }
      }

      // 构建 AI SDK prompt
      const prompt = buildAlibabaPrompt(request);

      const streamResult = await model.doStream({
        prompt,
        temperature: restParams.temperature as number | undefined,
        topP: restParams.top_p as number | undefined,
        maxOutputTokens: restParams.max_tokens as number | undefined,
        providerOptions: { alibaba: alibabaOptions },
        abortSignal: controller.signal,
      });

      // AI SDK doStream 返回 ReadableStream<LanguageModelV3StreamPart>
      // 我们需要将 StreamPart 映射为 PluginChunk
      const reader = streamResult.stream.getReader();

      try {
        while (true) {
          if (controller.signal.aborted) {
            throw new DOMException('Stream reading aborted', 'AbortError');
          }

          const { done, value } = await reader.read();
          if (done) break;

          const chunk = mapStreamPartToPluginChunk(value);
          if (chunk) yield chunk;
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // reader may already be released
        }
      }
    },

    buildCurl(config, request) {
      const { thinking, ...restParams } = request.params || {};
      const thinkingConfig = thinking as { enabled?: boolean; budget_tokens?: number; force_send?: boolean } | undefined;

      const body: Record<string, unknown> = {
        model: request.modelId,
        stream: request.stream !== false,
        ...restParams,
      };

      // Qwen 使用 enable_thinking（顶级布尔字段）
      if (thinkingConfig?.enabled) {
        body.enable_thinking = true;
        if (thinkingConfig.budget_tokens) {
          body.thinking_budget = thinkingConfig.budget_tokens;
        }
      }

      const messages = buildCurlMessages(request);
      body.messages = messages;

      const apiKey = config.apiKey || options.apiKeyPlaceholder;
      const url = config.baseUrl || options.defaultUrl;
      return (
        `curl -H "Content-Type: application/json" ` +
        `-H "Authorization: Bearer ${apiKey}" ` +
        `-X POST ${url} -d '${JSON.stringify(body, null, 2)}'`
      );
    }
  };
}

function buildAlibabaPrompt(request: PluginRequest): import('@ai-sdk/provider').LanguageModelV3Prompt {
  const messages: import('@ai-sdk/provider').LanguageModelV3Message[] = [];

  if (request.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: request.systemPrompt });
  }

  if (Array.isArray(request.messages) && request.messages.length) {
    for (const msg of request.messages) {
      const text = typeof msg.content === 'string' ? msg.content : '';
      if (!text.trim()) continue;
      // 系统消息已在 systemPrompt 中处理，跳过
      if (msg.role === 'system') continue;
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: [{ type: 'text', text }] });
      } else {
        messages.push({ role: 'assistant', content: [{ type: 'text', text }] });
      }
    }
  } else {
    for (const prompt of request.userPrompts) {
      if (prompt.trim()) {
        messages.push({ role: 'user', content: [{ type: 'text', text: prompt }] });
      }
    }
  }

  return messages;
}

function buildCurlMessages(request: PluginRequest) {
  const messages: Array<{ role: string; content: string }> = [];

  if (request.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: request.systemPrompt });
  }

  if (Array.isArray(request.messages) && request.messages.length) {
    for (const msg of request.messages) {
      const role = msg.role;
      if (role !== 'system') {
        const text = typeof msg.content === 'string' ? msg.content : '';
        if (text.trim()) {
          messages.push({ role, content: text });
        }
      }
    }
  } else {
    for (const prompt of request.userPrompts) {
      if (prompt.trim()) {
        messages.push({ role: 'user', content: prompt });
      }
    }
  }

  return messages;
}

function mapStreamPartToPluginChunk(
  part: any
): import('../../../../core/types').PluginChunk | null {
  switch (part.type) {
    case 'text-delta':
      return { type: 'content', text: part.delta };
    case 'reasoning-delta':
      return { type: 'thinking', text: part.delta };
    case 'reasoning-start':
      // reasoning-start 不包含文本内容，跳过
      return null;
    case 'reasoning-end':
      return null;
    case 'text-start':
    case 'text-end':
      return null;
    case 'tool-call':
      return {
        type: 'tool_calls',
        toolCalls: [{
          id: part.id,
          type: 'function',
          function: {
            name: part.toolName,
            arguments: part.args,
          }
        }]
      };
    case 'finish':
      if (part.usage) {
        return {
          type: 'usage',
          tokens: {
            prompt: part.usage.promptTokens,
            completion: part.usage.completionTokens,
            total: part.usage.totalTokens,
          }
        };
      }
      return null;
    case 'raw':
      // 原始 SSE chunk - 对于阿里云，可能包含 reasoning_content
      // 但 doStream 应该已经解析好了，这里不需要再处理
      return null;
    default:
      return null;
  }
}