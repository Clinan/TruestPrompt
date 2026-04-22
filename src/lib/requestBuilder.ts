import type { PluginRequest, SharedState, Slot } from '../core/types';

// 为什么：buildRequest 是从 App reactive 状态（slot + shared）构造出
// 一个纯数据 PluginRequest 的地方，原来 ~60 行和 mergeParams /
// buildVariableMap / renderTemplate / removeEmptyEntries 一起散在
// App.vue。把它抽成纯函数后：
//  - runSlot（Phase 3 下一步）调用方只负责 snapshot 和 await；
//  - buildCurlSnippet 同步导出 cURL 也共用同一份请求构造逻辑；
//  - 可以独立单测（本次不补，但留出口）。
//
// 纯函数契约：只读取 slot / shared 传入值，不触 reactive 副作用。
// shared 传值而非 ref——调用方已经 unwrap 好了（模板里的 reactive
// proxy 可以直接当 SharedState 读）。
//
// RESERVED_REQUEST_PARAM_KEYS：params 里不允许出现 'tools'，因为 tools
// 由 toolsDefinition 独立传递；保留在这里避免 mergeParams 泄漏到请求。

const RESERVED_REQUEST_PARAM_KEYS = new Set(['tools']);

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

export function mergeParams(slot: Slot, shared: SharedState) {
  const combined: Record<string, unknown> = {
    ...shared.defaultParams,
    ...(slot.paramOverride || {}),
  };
  RESERVED_REQUEST_PARAM_KEYS.forEach((key) => {
    if (key in combined) {
      delete combined[key];
    }
  });
  return removeEmptyEntries(combined);
}

export function buildVariableMap(shared: SharedState) {
  const map: Record<string, string> = {};
  shared.variables
    .map((item) => ({ key: item.key.trim(), value: item.value }))
    .filter((item) => item.key.length > 0)
    .forEach((item) => {
      map[item.key] = item.value;
    });
  return map;
}

export function renderTemplate(source: string, variables: Record<string, string>) {
  if (!source) return '';
  return source.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key]! : match
  );
}

export function buildPluginRequest(slot: Slot, shared: SharedState): PluginRequest {
  const variables = buildVariableMap(shared);
  const composerMessages = shared.userPrompts
    .map((message) => ({
      role: message.role || 'user',
      content: renderTemplate(message.text, variables),
      images: message.images,
    }))
    .filter(
      (msg) => msg.content.trim().length > 0 || (msg.images && msg.images.length > 0)
    );
  const userOnlyPrompts = composerMessages
    .filter((msg) => msg.role !== 'system')
    .map((msg) => msg.content);

  // stream 优先级：Slot 覆盖 > 全局 defaultParams.stream > 全局 streamOutput
  const slotStream = slot.paramOverride?.stream as boolean | undefined;
  const globalParamStream = shared.defaultParams.stream;
  const effectiveStream = slotStream ?? globalParamStream ?? shared.streamOutput;

  return {
    systemPrompt: renderTemplate(slot.systemPrompt, variables),
    userPrompts: userOnlyPrompts,
    toolsDefinition: shared.toolsDefinition,
    params: mergeParams(slot, shared),
    modelId: slot.modelId,
    enableSuggestions: shared.enableSuggestions,
    stream: effectiveStream,
    messages: composerMessages,
  };
}
