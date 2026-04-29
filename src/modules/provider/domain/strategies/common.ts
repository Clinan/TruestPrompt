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

function readTextPart(source: unknown) {
    if (typeof source === 'string') return source;
    if (source && typeof source === 'object' && !Array.isArray(source)) {
        const record = source as Record<string, unknown>;
        if (typeof record.text === 'string') return record.text;
        if (typeof record.content === 'string') return record.content;
        return '';
    }
    if (!Array.isArray(source)) return '';

    return source
        .map((part) => {
            if (!part || typeof part !== 'object') return '';
            const record = part as Record<string, unknown>;
            if (typeof record.text === 'string') return record.text;
            if (typeof record.content === 'string') return record.content;
            return '';
        })
        .join('');
}

function readNewTextFromSnapshot(current: string, incoming: string) {
    if (!incoming) return '';
    if (!current) return incoming;
    if (incoming.startsWith(current)) return incoming.slice(current.length);
    return incoming;
}

function readUsageTokens(usage: unknown): PluginChunk | null {
    if (!usage || typeof usage !== 'object') return null;

    const record = usage as Record<string, unknown>;
    const promptTokens =
        typeof record.prompt_tokens === 'number'
            ? record.prompt_tokens
            : typeof record.prompt === 'number'
                ? record.prompt
                : undefined;
    const completionTokens =
        typeof record.completion_tokens === 'number'
            ? record.completion_tokens
            : typeof record.completion === 'number'
                ? record.completion
                : undefined;
    const totalTokens =
        typeof record.total_tokens === 'number'
            ? record.total_tokens
            : typeof record.total === 'number'
                ? record.total
                : undefined;

    if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
        return null;
    }

    return {
        type: 'usage',
        tokens: {
            prompt: promptTokens,
            completion: completionTokens,
            total: totalTokens
        }
    };
}

function asRecord(source: unknown): Record<string, unknown> | null {
    return source && typeof source === 'object' ? source as Record<string, unknown> : null;
}

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
    let emittedContent = '';
    let emittedThinking = '';
    const pendingDataLines: string[] = [];

    function takePendingPayload() {
        const payload = pendingDataLines.join('\n').trim();
        pendingDataLines.length = 0;
        return payload;
    }

    function* emitFromParsed(parsed: any): Generator<PluginChunk> {
        const usageChunk = readUsageTokens(parsed?.usage);
        if (usageChunk) yield usageChunk;

        const choice = parsed.choices?.[0];
        const delta = asRecord(choice?.delta);
        const message = asRecord(choice?.message);

        // 处理 thinking/reasoning 内容（Claude extended thinking / DeepSeek reasoning）
        const thinkingDelta = readTextPart(delta?.thinking || delta?.reasoning_content || delta?.reasoning);
        const thinkingSnapshot = readTextPart(message?.thinking || message?.reasoning_content || message?.reasoning);
        const thinkingText = thinkingDelta || readNewTextFromSnapshot(emittedThinking, thinkingSnapshot);
        if (thinkingText) {
            emittedThinking += thinkingText;
            yield { type: 'thinking', text: thinkingText };
        }

        const contentDelta = readTextPart(delta?.content);
        const contentSnapshot = readTextPart(message?.content);
        const contentText = contentDelta || readNewTextFromSnapshot(emittedContent, contentSnapshot);
        if (contentText) {
            emittedContent += contentText;
            yield { type: 'content', text: contentText };
        }

        const toolCallsDelta = Array.isArray(delta?.tool_calls) ? delta.tool_calls : null;
        const toolCallsSnapshot = !toolCallsDelta && Array.isArray(message?.tool_calls) ? message.tool_calls : null;
        if (toolCallsDelta) {
            for (const rawEntry of toolCallsDelta) {
                const entry = asRecord(rawEntry);
                if (!entry) continue;
                const index = typeof entry.index === 'number' ? entry.index : 0;
                const builder = (toolCallBuilders[index] ||= { function: { arguments: '' } });
                if (typeof entry.id === 'string') builder.id = entry.id;
                if (typeof entry.type === 'string') builder.type = entry.type;
                const fn = asRecord(entry.function);
                if (typeof fn?.name === 'string') {
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
        } else if (toolCallsSnapshot?.length) {
            yield { type: 'tool_calls', toolCalls: toolCallsSnapshot as ToolCall[] };
        }

        const finishReason = choice?.finish_reason;
        if (finishReason === 'tool_calls' && Object.keys(toolCallBuilders).length) {
            yield { type: 'tool_calls', toolCalls: normalizeToolCalls(toolCallBuilders) };
            Object.keys(toolCallBuilders).forEach((key) => delete toolCallBuilders[Number(key)]);
        }
    }

    function* parsePayload(payload: string): Generator<PluginChunk> {
        if (!payload || payload === '[DONE]') return;
        let parsed: any;
        try {
            parsed = JSON.parse(payload);
        } catch (err) {
            console.warn('解析流式 chunk 失败', err, payload);
            return;
        }
        yield* emitFromParsed(parsed);
    }

    // 试探性 flush：很多 OpenAI-compatible 网关在 data: 之间不发空行
    // （例如 data: {...}\ndata: {...}\ndata: [DONE]\n），此时按 SSE 严格规范
    // 累积到空行才解析会得到拼接的 "{...}\n{...}"，JSON.parse 必然失败。
    // 每收到一行就尝试解析当前累积内容：单行 JSON 立即派发并清空缓冲；
    // 真正的多行 SSE event（单行不是合法 JSON）会继续累积，等后续行到达后
    // 再次尝试拼接解析。
    function tryFlushPending(): any | undefined {
        if (!pendingDataLines.length) return undefined;
        const payload = pendingDataLines.join('\n').trim();
        if (!payload || payload === '[DONE]') return undefined;
        try {
            const parsed = JSON.parse(payload);
            pendingDataLines.length = 0;
            return parsed;
        } catch {
            return undefined;
        }
    }

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
            const completeLines = done ? lines : lines.slice(0, -1);
            buffer = done ? '' : lines[lines.length - 1] || '';

            for (const line of completeLines) {
                if (line === '') {
                    const payload = takePendingPayload();
                    if (!payload) continue;
                    if (payload === '[DONE]') {
                        done = true;
                        buffer = '';
                        await reader.cancel().catch(() => undefined);
                        break;
                    }
                    for (const chunk of parsePayload(payload)) yield chunk;
                    continue;
                }

                if (line.startsWith(':')) continue;

                const separatorIndex = line.indexOf(':');
                const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
                if (field !== 'data') continue;

                const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
                const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
                if (value.trim() === '[DONE]') {
                    const payload = takePendingPayload();
                    if (payload && payload !== '[DONE]') {
                        for (const chunk of parsePayload(payload)) yield chunk;
                    }
                    done = true;
                    buffer = '';
                    await reader.cancel().catch(() => undefined);
                    break;
                }
                pendingDataLines.push(value);
                const ready = tryFlushPending();
                if (ready !== undefined) {
                    for (const chunk of emitFromParsed(ready)) yield chunk;
                }
            }

            if (done && pendingDataLines.length) {
                const payload = takePendingPayload();
                if (payload === '[DONE]') {
                    done = true;
                    buffer = '';
                    await reader.cancel().catch(() => undefined);
                } else {
                    for (const chunk of parsePayload(payload)) yield chunk;
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
