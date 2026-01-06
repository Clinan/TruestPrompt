import type { Plugin, PluginChunk } from '../../../../core/types';
import { normalizeMessages, streamOpenAIStyle } from './common';
import type { OpenAICompatibleConfig } from './openai'; // Helper dependency

// Reusing config type for consistency, though Gemini native has differences
// Actually we only need a subset for createGeminiPlugin
type GeminiConfig = OpenAICompatibleConfig;

async function* streamGeminiStyle(resp: Response, signal?: AbortSignal): AsyncGenerator<PluginChunk, void, unknown> {
    if (!resp.body) throw new Error('No stream body');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;

    try {
        while (!done) {
            // 检查是否已被中止
            if (signal?.aborted) {
                throw new DOMException('Stream reading aborted', 'AbortError');
            }
            
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            buffer = buffer.replace(/^[\s[\],]*/, '');

            let cursor = 0;
            let braceCount = 0;
            let inString = false;
            let escaped = false;
            let foundObject = false;

            for (let i = 0; i < buffer.length; i++) {
                const char = buffer[i];

                if (inString) {
                    if (escaped) {
                        escaped = false;
                    } else if (char === '\\') {
                        escaped = true;
                    } else if (char === '"') {
                        inString = false;
                    }
                } else {
                    if (char === '"') {
                        inString = true;
                    } else if (char === '{') {
                        braceCount++;
                    } else if (char === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            const jsonStr = buffer.slice(0, i + 1);
                            buffer = buffer.slice(i + 1);
                            foundObject = true;

                            try {
                                const parsed = JSON.parse(jsonStr);
                                const candidate = parsed.candidates?.[0];
                                const parts = candidate?.content?.parts;
                                if (Array.isArray(parts)) {
                                    for (const part of parts) {
                                        if (part.text) {
                                            yield { type: 'content', text: part.text };
                                        }
                                    }
                                }

                                const usage = parsed.usageMetadata;
                                if (usage) {
                                    yield {
                                        type: 'usage',
                                        tokens: {
                                            prompt: usage.promptTokenCount,
                                            completion: usage.candidatesTokenCount,
                                            total: usage.totalTokenCount
                                        }
                                    };
                                }
                            } catch (e) {
                                console.warn('Failed to assign Gemini chunk', e);
                            }

                            i = -1;
                        }
                    }
                }
            }
        }
    } finally {
        // 确保 reader 被正确释放
        try {
            reader.releaseLock();
        } catch {
            // reader 可能已经被释放
        }
    }
}

export function createGeminiPlugin(options: GeminiConfig): Plugin {
    return {
        id: options.id,
        name: options.name,
        defaultBaseUrl: options.defaultUrl || 'https://generativelanguage.googleapis.com/v1beta',
        async listModels(config) {
            const apiKey = config.apiKey || options.apiKeyPlaceholder;
            const baseUrl = config.baseUrl || options.defaultUrl || 'https://generativelanguage.googleapis.com/v1beta';

            let url = baseUrl;
            if (url.endsWith('/')) url = url.slice(0, -1);
            if (!url.endsWith('/models')) url += '/models';

            try {
                const resp = await fetch(`${url}?key=${apiKey}`);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                const models = (data.models as any[] || [])
                    .map(m => {
                        const id = m.name?.replace('models/', '') || m.name;
                        const label = m.displayName ? `${id} (${m.displayName})` : id;
                        return { id, label };
                    })
                    .filter(m => m.id && (m.id.includes('gemini') || m.id.includes('learning')));

                if (models.length) return models;
            } catch (e) {
                console.warn('Gemini listModels failed', e);
            }
            return options.fallbackModels;
        },
        async *invokeChat(config, request, opts) {
            const controller = new AbortController();
            if (opts.signal) opts.signal.addEventListener('abort', () => controller.abort(), { once: true });

            const apiKey = config.apiKey || options.apiKeyPlaceholder;
            const baseUrl = config.baseUrl || options.defaultUrl || 'https://generativelanguage.googleapis.com/v1beta';

            let url = baseUrl;
            if (url.endsWith('/')) url = url.slice(0, -1);

            const model = request.modelId;
            const endpoint = `${url}/models/${model}:streamGenerateContent?key=${apiKey}`;

            const contents = [];
            const systemInstruction = request.systemPrompt ? { parts: [{ text: request.systemPrompt }] } : undefined;

            const rawMessages = normalizeMessages(request);

            for (const msg of rawMessages) {
                if (msg.role === 'system') continue;

                const role = msg.role === 'assistant' ? 'model' : 'user';
                const parts: any[] = [];

                if (typeof msg.content === 'string') {
                    parts.push({ text: msg.content });
                } else if (Array.isArray(msg.content)) {
                    for (const p of msg.content) {
                        if (p.type === 'text') {
                            parts.push({ text: p.text });
                        } else if (p.type === 'image_url') {
                            const url = p.image_url.url;
                            if (url.startsWith('data:')) {
                                const match = url.match(/^data:([^;]+);base64,(.+)$/);
                                if (match) {
                                    parts.push({
                                        inline_data: {
                                            mime_type: match[1],
                                            data: match[2]
                                        }
                                    });
                                }
                            }
                        }
                    }
                }

                if (parts.length > 0) {
                    contents.push({ role, parts });
                }
            }

            const body = {
                contents,
                ...(systemInstruction ? { systemInstruction } : {}),
                generationConfig: {
                    temperature: request.params?.temperature,
                    maxOutputTokens: request.params?.max_tokens,
                    topP: request.params?.top_p,
                }
            };

            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            if (!resp.ok) {
                throw new Error(`Gemini API Error ${resp.status}: ${await resp.text()}`);
            }

            yield* streamGeminiStyle(resp, controller.signal);
        },
        buildCurl(config, request) {
            const apiKey = config.apiKey || options.apiKeyPlaceholder;
            const baseUrl = config.baseUrl || options.defaultUrl || 'https://generativelanguage.googleapis.com/v1beta';
            const model = request.modelId;
            return `curl "${baseUrl}/models/${model}:streamGenerateContent?key=${apiKey}" -X POST -H "Content-Type: application/json" -d '...'`;
        }
    };
}
