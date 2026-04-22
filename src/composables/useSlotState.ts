import { ref, type Ref } from 'vue';
import type { ProviderProfile, Slot } from '../core/types';
import { plugins } from '../modules/provider/domain/plugins';
import { newId } from '../core/utils/id';

// 为什么：Slot CRUD（创建/复制/删除/更新/provider 切换）和运行期 abort
// controller 映射原本散在 App.vue 的 ~150 行区间里，每次新增一个 slot
// 生命周期操作都要在三个地方（创建函数、清理、saveEditorState 调用）
// 同步改。抽到 composable 后 slots/abortControllersBySlotId 的所有权
// 内聚在一处；runSlot/stopSlot 仍留 App.vue，因为它们跨越 history /
// provider / toolExecutor 三个域，那是 Phase 3 lib 抽取的目标。
//
// 与 useEditorPersistence 的循环依赖：后者需要 slots + createSlot，
// 前者需要 saveEditorState。用 thunk（`() => saveEditorState()`）注入
// 打破循环——thunk 在定义时只创建闭包，在用户交互触发 CRUD 时才真正
// 读取已初始化的 saveEditorState 绑定。
//
// 与 useHistory 的顺序约束：useSlotState 必须先于 useHistory，因为
// 后者通过 createSlot 创建 fallback slot。

export type UseSlotStateDeps = {
  providerProfiles: Ref<ProviderProfile[]>;
  refreshModelsForSlot: (slot: Slot) => Promise<void> | void;
  resolvePluginId: (slot: Slot) => string;
  saveEditorState: () => void;
};

export type AbortEntry = { controller: AbortController; runId: string };

export function useSlotState(deps: UseSlotStateDeps) {
  const { providerProfiles, refreshModelsForSlot, resolvePluginId, saveEditorState } = deps;

  const slots = ref<Slot[]>([]);
  const abortControllersBySlotId = new Map<string, AbortEntry>();

  function createSlot(copyFrom?: Slot): Slot {
    const defaultProvider = providerProfiles.value[0];
    const providerProfileId = copyFrom?.providerProfileId ?? defaultProvider?.id ?? null;
    const provider = providerProfiles.value.find((p) => p.id === providerProfileId);
    const pluginId = provider?.pluginId ?? copyFrom?.pluginId ?? plugins[0].id;
    return {
      id: newId(),
      providerProfileId,
      pluginId,
      modelId: copyFrom?.modelId ?? 'gpt-4o-mini',
      systemPrompt:
        copyFrom?.systemPrompt ?? 'You are a helpful assistant focused on prompt debugging insights.',
      paramOverride: copyFrom?.paramOverride ? { ...copyFrom.paramOverride } : null,
      selected: true,
      status: 'idle',
      output: '',
      thinking: '',
      toolCalls: null,
      metrics: { ttfbMs: null, totalMs: null },
    };
  }

  const slotAppendDebug = true;

  function traceSlotAppend(params: {
    action: 'append';
    source: string;
    slotId?: string;
    before?: number;
    after?: number;
    reason?: string;
  }) {
    if (!slotAppendDebug) return;
    const title = `[Slots] ${params.action} ${params.source}`;
    console.groupCollapsed(title);
    if (params.reason) console.log('reason:', params.reason);
    if (params.slotId) console.log('slotId:', params.slotId);
    if (typeof params.before === 'number' || typeof params.after === 'number') {
      console.log('count:', params.before, '->', params.after);
    }
    console.trace('stack');
    console.groupEnd();
  }

  function appendSlot(slot: Slot, source: string) {
    const beforeCount = slots.value.length;
    slots.value.push(slot);
    traceSlotAppend({
      action: 'append',
      source,
      slotId: slot.id,
      before: beforeCount,
      after: slots.value.length,
    });
    saveEditorState();
  }

  function addSlot(copyFrom?: Slot) {
    appendSlot(createSlot(copyFrom), copyFrom ? 'copy' : 'manual');
  }

  function copySlot(slot: Slot) {
    addSlot(slot);
  }

  function removeSlot(slotId: string) {
    slots.value = slots.value.filter((s) => s.id !== slotId);
    saveEditorState();
  }

  function updateSlot(updatedSlot: Slot) {
    const index = slots.value.findIndex((s) => s.id === updatedSlot.id);
    if (index >= 0) {
      slots.value[index] = updatedSlot;
      saveEditorState();
    }
  }

  function onProviderChange(slot: Slot) {
    slot.modelId = '';
    resolvePluginId(slot);
    refreshModelsForSlot(slot);
    saveEditorState();
  }

  return {
    slots,
    abortControllersBySlotId,
    createSlot,
    appendSlot,
    addSlot,
    copySlot,
    removeSlot,
    updateSlot,
    onProviderChange,
  };
}
