import type { ToolCall, PluginChunk, PluginRequest, ImageContent } from '../../../../core/types';
import { assertToolsDefinition } from '../tools';
import { hasMeaningfulContent } from '../../../../core/utils/textUtils';
import { buildDataUrl } from '../../../../core/utils/imageUtils';

// OpenAI Vision API 消息内容类型
export type VisionContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

export type VisionMessage = {
    role: string;
    content: string | VisionContentPart[];
};

export function parseTools(toolsDefinition: string) {
    return assertToolsDefinition(toolsDefinition);
}

export function removeEmptyEntries(obj: Record<string, unknown>) {
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

export function normalizeToolCalls(builders: Record<number, ToolCallBuilder>) {
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

export async function* streamOpenAIStyle(resp: Response, signal?: AbortSignal): AsyncGenerator<PluginChunk, void, unknown> {
    if (!resp.body) throw new Error('No stream body');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    const toolCallBuilders: Record<number, ToolCallBuilder> = {};

    try {
        while (!done) {
            // 检查是否已被中止
            if (signal?.aborted) {
                throw new DOMException('Stream reading aborted', 'AbortError');
            }
            
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
    } finally {
        // 确保 reader 被正确释放
        try {
            reader.releaseLock();
        } catch {
            // reader 可能已经被释放
        }
    }
    
    if (Object.keys(toolCallBuilders).length) {
        yield { type: 'tool_calls', toolCalls: normalizeToolCalls(toolCallBuilders) };
    }
}

/**
 * 将图片转换为 OpenAI Vision API 格式的 image_url 内容
 */
export function imageToVisionContent(image: ImageContent): VisionContentPart {
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
export function buildVisionContent(text: string, images?: ImageContent[]): string | VisionContentPart[] {
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

export function normalizeMessages(request: PluginRequest): VisionMessage[] {
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
