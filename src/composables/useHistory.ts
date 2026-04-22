import { reactive, ref, type Ref } from 'vue';
import type { HistoryItem, ProviderProfile, SharedState, Slot } from '../core/types';
import { getHistoryStore } from '../core/storage';
import { newId } from '../core/utils/id';

// 为什么：历史列表的读/写/排序/标星/删除共享一条 debounce 写入队列
// （historyPersistQueue），散在 App.vue 里非常容易出现"改完 historyItems
// 忘了 queuePersistHistory"的漏写 bug。同时 history 详情加载回编辑器
// (applyHistoryLoad) 跨 slots / shared / providerProfiles 三个域，但语义上
// 属于 history 的消费侧，放这里比放 App.vue 模板旁边更内聚。为此我们把业务
// 依赖（createSlot / saveProfiles / refreshModelsForSlot / saveEditorState）
// 通过 deps 注入，让 composable 不直接知道 App.vue 里的具体实现细节。
//
// 与 useEditorPersistence 的顺序约束：applyHistoryLoad 会调用 saveEditorState，
// 所以 useHistory 必须在 useEditorPersistence 之后实例化（这是运行期顺序，
// 不是编译期依赖）。

export type UseHistoryDeps = {
  slots: Ref<Slot[]>;
  shared: SharedState;
  providerProfiles: Ref<ProviderProfile[]>;
  createSlot: (copyFrom?: Slot) => Slot;
  saveProfiles: () => void;
  refreshModelsForSlot: (slot: Slot) => Promise<void> | void;
  saveEditorState: () => void;
};

export function useHistory(deps: UseHistoryDeps) {
  const historyItems = ref<HistoryItem[]>([]);
  const historyLoadOpen = ref(false);
  const historyLoadItem = ref<HistoryItem | null>(null);
  const historyLoadOptions = reactive({
    provider: true,
    model: true,
    systemPrompt: true,
    params: true,
    userPrompts: true,
    tools: true,
    output: true,
    metrics: true,
  });

  let historyPersistQueue: Promise<void> = Promise.resolve();

  async function loadHistory() {
    const historyStore = getHistoryStore();
    const items: HistoryItem[] = (await historyStore.getItem('items')) || [];
    historyItems.value = items.sort((a, b) => b.createdAt - a.createdAt);
  }

  function queuePersistHistory(items: HistoryItem[]) {
    const historyStore = getHistoryStore();
    const plain = JSON.parse(JSON.stringify(items)) as HistoryItem[];
    historyPersistQueue = historyPersistQueue
      .then(() => {
        historyStore.setItem('items', plain);
      })
      .catch((err) => console.warn('保存历史失败。', err));
    return historyPersistQueue;
  }

  function appendHistoryItem(item: HistoryItem) {
    historyItems.value = [item, ...historyItems.value];
    queuePersistHistory(historyItems.value);
  }

  function toggleStar(id: string) {
    historyItems.value = historyItems.value.map((item) =>
      item.id === id ? { ...item, star: !item.star } : item
    );
    queuePersistHistory(historyItems.value);
  }

  function deleteHistoryItem(id: string) {
    historyItems.value = historyItems.value.filter((item) => item.id !== id);
    queuePersistHistory(historyItems.value);
  }

  function loadHistoryIntoEditor(item: HistoryItem) {
    historyLoadItem.value = item;
    historyLoadOpen.value = true;
  }

  function closeHistoryLoadDialog() {
    historyLoadOpen.value = false;
    historyLoadItem.value = null;
  }

  function applyHistoryLoad() {
    const item = historyLoadItem.value;
    if (!item) return;

    const { slots, shared, providerProfiles, createSlot, saveProfiles, refreshModelsForSlot, saveEditorState } = deps;

    const targetSlot = slots.value.filter((s) => s.selected)[0] || slots.value[0] || createSlot();
    if (!slots.value.length) slots.value = [targetSlot];
    targetSlot.toolCalls = null;

    const legacyUserPrompt = (item.requestSnapshot as unknown as { userPrompt?: string }).userPrompt;
    const userPrompts = Array.isArray(item.requestSnapshot.userPrompts)
      ? item.requestSnapshot.userPrompts
      : legacyUserPrompt
        ? [legacyUserPrompt]
        : [];
    const historyMessages =
      Array.isArray(item.requestSnapshot.messages) && item.requestSnapshot.messages.length
        ? item.requestSnapshot.messages
        : userPrompts.map((text) => ({ role: 'user', content: text }));

    if (historyLoadOptions.userPrompts) {
      shared.userPrompts = historyMessages.length
        ? historyMessages.map((msg) => ({
            id: newId(),
            role: msg.role === 'system' || msg.role === 'assistant' ? msg.role : 'user',
            text: typeof msg.content === 'string' ? msg.content : '',
          }))
        : [{ id: newId(), role: 'user', text: '' }];
    }

    if (historyLoadOptions.tools) {
      shared.toolsDefinition = item.requestSnapshot.toolsDefinition;
    }

    if (historyLoadOptions.provider && item.providerProfileSnapshot) {
      const snap = item.providerProfileSnapshot;
      const existing = providerProfiles.value.find((p) => p.id === snap.id);
      if (!existing) {
        providerProfiles.value.push({ ...snap });
        saveProfiles();
      }
      targetSlot.providerProfileId = snap.id;
      targetSlot.pluginId = snap.pluginId;
      refreshModelsForSlot(targetSlot);
    }

    if (historyLoadOptions.model) {
      targetSlot.modelId = item.requestSnapshot.modelId || '';
    }

    historyLoadOptions.systemPrompt = true;
    targetSlot.systemPrompt = item.requestSnapshot.systemPrompt || '';

    if (historyLoadOptions.params) {
      targetSlot.paramOverride = item.requestSnapshot.params
        ? { ...(item.requestSnapshot.params as Record<string, unknown>) }
        : null;
    }

    if (historyLoadOptions.output) {
      targetSlot.output = item.responseSnapshot.outputText || '';
      targetSlot.status = targetSlot.output ? 'done' : 'idle';
      targetSlot.historyId = item.id;
      targetSlot.toolCalls = item.responseSnapshot.toolCalls ?? null;
    }

    if (historyLoadOptions.metrics) {
      targetSlot.metrics = {
        ...targetSlot.metrics,
        ttfbMs: item.responseSnapshot.metrics?.ttfbMs ?? null,
        totalMs: item.responseSnapshot.metrics?.totalMs ?? null,
        tokens: item.responseSnapshot.usage,
      };
    }

    closeHistoryLoadDialog();
    saveEditorState();
  }

  return {
    historyItems,
    historyLoadOpen,
    historyLoadItem,
    historyLoadOptions,
    loadHistory,
    appendHistoryItem,
    toggleStar,
    deleteHistoryItem,
    loadHistoryIntoEditor,
    closeHistoryLoadDialog,
    applyHistoryLoad,
  };
}
