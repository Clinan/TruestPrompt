import type { Ref } from 'vue';
import type {
  HistoryItem,
  Plugin,
  PluginRequest,
  ProviderProfile,
  Slot,
} from '../core/types';
import { newId } from '../core/utils/id';
import { runChat } from '../lib/chatOrchestrator';
import { getEffectiveApiKey } from '../modules/provider/domain/gateway';
import type { AbortEntry } from './useSlotState';

// 为什么：runSlot/stopSlot/stopAllSlots 原本在 App.vue 占 ~115 行，
// 跨越 slot 状态、abort controller 映射、指标采集、历史写入四块，
// 是最耦合的编排块。抽到 composable 后：
//  - 所有"本次 run"相关的判定（isCurrentRun、firstChunkAt 闭包、
//    slot.lastRunId 变更后静默丢弃迟到的 chunk）都内聚在一处；
//  - App.vue 只负责事件绑定（@run-slot="runSlot"）和依赖注入。
//
// 与 useSlotState 的协作：abortControllersBySlotId 是它 own 的 Map，
// 这里通过 deps 注入；runSlot 在成功/失败/取消后清理自己对应的条目。

export type UseSlotRunnerDeps = {
  slots: Ref<Slot[]>;
  abortControllersBySlotId: Map<string, AbortEntry>;
  currentProjectId: Ref<string>;
  getPlugin: (slot: Slot) => Plugin;
  getProfile: (slot: Slot) => ProviderProfile | null;
  buildRequest: (slot: Slot) => PluginRequest;
  appendHistoryItem: (item: HistoryItem) => void;
};

export function useSlotRunner(deps: UseSlotRunnerDeps) {
  const {
    slots,
    abortControllersBySlotId,
    currentProjectId,
    getPlugin,
    getProfile,
    buildRequest,
    appendHistoryItem,
  } = deps;

  function stopSlot(slotId: string) {
    const activeRun = abortControllersBySlotId.get(slotId);
    if (!activeRun) return;
    activeRun.controller.abort();

    const slot = slots.value.find((item) => item.id === slotId);
    if (!slot || slot.lastRunId !== activeRun.runId) return;

    slot.status = 'canceled';
    if (!slot.output.trim()) {
      slot.output = '正在停止...';
    }
  }

  function stopAllSlots() {
    Array.from(abortControllersBySlotId.keys()).forEach((slotId) => stopSlot(slotId));
  }

  async function runSlot(slot: Slot) {
    const plugin = getPlugin(slot);
    const profile = getProfile(slot);
    if (!profile) {
      alert('请选择 Provider Profile');
      return;
    }

    const effectiveApiKey = getEffectiveApiKey(profile, currentProjectId.value);
    if (profile.gatewayProviderId && !effectiveApiKey) {
      alert('网关未登录，请先登录后再运行');
      return;
    }
    const effectiveProfile = { ...profile, apiKey: effectiveApiKey };

    const request = buildRequest(slot);
    const runId = newId();
    const controller = new AbortController();
    abortControllersBySlotId.set(slot.id, { controller, runId });
    slot.lastRunId = runId;
    slot.status = 'running';
    slot.output = '';
    slot.thinking = '';
    slot.toolCalls = null;
    slot.metrics = { ttfbMs: null, totalMs: null };
    const start = performance.now();
    let firstChunkAt: number | null = null;

    const isCurrentRun = () => slot.lastRunId === runId;

    const result = await runChat({
      plugin,
      profile: effectiveProfile,
      request,
      signal: controller.signal,
      isActive: isCurrentRun,
      onChunk: (chunk) => {
        if (firstChunkAt === null) {
          firstChunkAt = performance.now();
          if (isCurrentRun()) {
            slot.metrics.ttfbMs = firstChunkAt - start;
          }
        }
        if (chunk.type === 'content') {
          slot.output += chunk.text;
        } else if (chunk.type === 'thinking') {
          slot.thinking += chunk.text;
        } else if (chunk.type === 'tool_calls') {
          slot.toolCalls = chunk.toolCalls;
        } else if (chunk.type === 'usage') {
          slot.metrics.tokens = chunk.tokens;
        }
      },
    });

    if (isCurrentRun()) {
      if (result.status === 'done') {
        slot.status = 'done';
      } else if (result.status === 'canceled') {
        slot.status = 'canceled';
        if (!slot.output.trim() || slot.output === '正在停止...') {
          slot.output = '已中止';
        }
      } else {
        console.error(result.error);
        slot.status = 'error';
        slot.output = result.error instanceof Error ? result.error.message : String(result.error);
        slot.toolCalls = null;
      }
      slot.metrics.totalMs = performance.now() - start;
    }

    const activeRun = abortControllersBySlotId.get(slot.id);
    if (activeRun?.runId === runId) {
      abortControllersBySlotId.delete(slot.id);
    }

    // 历史写入：成功 或 错误 都写（原逻辑：canceled 不写，其余都写）
    if (isCurrentRun() && result.status !== 'canceled') {
      const historyItem: HistoryItem = {
        id: newId(),
        createdAt: Date.now(),
        star: false,
        title: `Run ${new Date().toLocaleString()}`,
        providerProfileSnapshot: { ...profile },
        requestSnapshot: { ...request, systemPrompt: request.systemPrompt },
        responseSnapshot: {
          outputText: slot.output,
          thinking: slot.thinking || undefined,
          toolCalls: slot.toolCalls || undefined,
          usage: slot.metrics.tokens,
          metrics: { ttfbMs: slot.metrics.ttfbMs, totalMs: slot.metrics.totalMs },
        },
      };
      appendHistoryItem(historyItem);
    }
  }

  return { runSlot, stopSlot, stopAllSlots };
}
