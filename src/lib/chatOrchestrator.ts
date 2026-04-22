import type {
  Plugin,
  PluginChunk,
  PluginRequest,
  ProviderProfile,
} from '../core/types';

// 为什么：runSlot 的核心 for-await 循环（流式解析 + 周期性 yield +
// abort 检查 + cancel 判定）原本 ~90 行写死在 App.vue，和 Slot 状态
// 更新、指标采集、历史落盘耦合在一起。抽到 chatOrchestrator 后：
//  - 纯异步流程（plugin + profile + request + signal + 回调），
//    不感知 Vue reactive / Slot / history；
//  - 调用方在 onChunk 里把 PluginChunk 映射成 Slot 字段变化，
//    同时利用闭包自己记录 firstChunkAt（TTFB），因为 TTFB 的归属
//    是「本次 run」而不是「插件本身」；
//  - 历史写入彻底归 App.vue 管——orchestrator 只返回 status。
//
// 取消语义：两个取消源——外部 signal.aborted（controller.abort 调用）
// 和 isActive() 返回 false（例如 slot.lastRunId 已变）。任一触发都
// throw AbortError 并让 runChat 返回 { status: 'canceled' }。这样调用
// 方不需要自己区分「我主动 stop」和「流还没结束但你让我停」。
//
// 为什么不把 getEffectiveApiKey / 网关登录校验放进来：那些属于 App
// 层的 provider 解析策略（gateway vs 本地），和插件执行是不同关注点。
// 调用方负责传入「已经解析好 apiKey 的 effectiveProfile」。

const STREAM_UI_YIELD_INTERVAL_MS = 32;

export function createAbortError(message = '请求已中止') {
  return new DOMException(message, 'AbortError');
}

export function isAbortError(err: unknown) {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err as { name?: string }).name === 'AbortError')
  );
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export type ChatRunParams = {
  plugin: Plugin;
  profile: ProviderProfile;
  request: PluginRequest;
  signal: AbortSignal;
  isActive: () => boolean;
  onChunk: (chunk: PluginChunk) => void;
};

export type ChatRunResult =
  | { status: 'done' }
  | { status: 'canceled' }
  | { status: 'error'; error: unknown };

export async function runChat(params: ChatRunParams): Promise<ChatRunResult> {
  const { plugin, profile, request, signal, isActive, onChunk } = params;
  let lastYieldAt = performance.now();
  try {
    for await (const chunk of plugin.invokeChat(profile, request, {
      stream: request.stream,
      signal,
    })) {
      if (!isActive() || signal.aborted) {
        throw createAbortError();
      }
      onChunk(chunk);
      const now = performance.now();
      if (now - lastYieldAt >= STREAM_UI_YIELD_INTERVAL_MS) {
        await yieldToBrowser();
        lastYieldAt = performance.now();
        if (!isActive() || signal.aborted) {
          throw createAbortError();
        }
      }
    }
    if (signal.aborted) {
      throw createAbortError();
    }
    if (!isActive()) {
      return { status: 'canceled' };
    }
    return { status: 'done' };
  } catch (err) {
    if (isAbortError(err) || !isActive()) {
      return { status: 'canceled' };
    }
    return { status: 'error', error: err };
  }
}
