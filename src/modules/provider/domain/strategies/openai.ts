import type { Plugin, ProviderProfile, PluginRequest, PluginInvokeOptions } from '../../../../core/types';
import { streamOpenAIStyle, normalizeMessages, parseTools, removeEmptyEntries } from './common';

export type OpenAICompatibleConfig = {
    id: string;
    name: string;
    defaultUrl: string;
    defaultModelsUrl?: string;
    apiKeyPlaceholder: string;
    fallbackModels: { id: string; label: string }[];
    authHeader?: string;
    authPrefix?: string;
};

export function createOpenAICompatiblePlugin(options: OpenAICompatibleConfig): Plugin {
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
                yield* streamOpenAIStyle(resp, controller.signal);
            } else {
                const data = await resp.json();
                const message = data?.choices?.[0]?.message;

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
