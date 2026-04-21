import { computed, ref, watch, type Ref } from 'vue';
import type {
  ProviderProfile,
  SharedState,
  Slot,
  UserPromptPreset,
} from '../core/types';
import { getItem, setItem, STORAGE_KEYS } from '../core/storage';
import { newId } from '../core/utils/id';
import { plugins } from '../modules/provider/domain/plugins';
import type { ToolRegistry } from '../lib/toolExecutor';

// 为什么：编辑器状态（slots 草稿 + shared prompt/vars/params + 工具定义）
// 需要做冷启动恢复、编辑期自动落盘、以及未保存变更的脏标记（用于 beforeunload
// 提示）。原来 App.vue 里把序列化、加载、保存、signature 脏标记 watch 散在
// 不连续的 4 段代码里，哪怕调一个字段都要多处同步，也容易漏 saveEditorState
// 调用。抽成 composable 之后 watch 就是兜底自动保存，外部显式 save 调用保留
// 但不再是数据一致性的唯一保障。
//
// 约束与设计选择：
//  - shared 是上层的 reactive()，这里按引用修改字段（不重新赋值 shared 自身）
//  - createSlot 作为函数引用传入——它依赖 providerProfiles，由上层组装；
//    composable 不关心 slot 默认值怎么构造
//  - 脏标记（hasEditedSinceLoad）的重置时机目前沿用旧逻辑（不自动重置），
//    保持零行为差异

export type PersistedEditorState = {
  version: 4;
  shared: SharedState;
  slots: Array<
    Pick<Slot, 'id' | 'providerProfileId' | 'pluginId' | 'modelId' | 'systemPrompt' | 'paramOverride'>
  >;
  toolRegistry?: ToolRegistry;
};

export type UseEditorPersistenceDeps = {
  slots: Ref<Slot[]>;
  shared: SharedState;
  toolRegistry: Ref<ToolRegistry>;
  providerProfiles: Ref<ProviderProfile[]>;
  createSlot: (copyFrom?: Slot) => Slot;
  initialUserPrompt: UserPromptPreset;
  defaultSharedParams: { temperature: number; top_p: number; max_tokens: number };
};

function coerceNumber(value: unknown, fallback: number) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function useEditorPersistence(deps: UseEditorPersistenceDeps) {
  const {
    slots,
    shared,
    toolRegistry,
    providerProfiles,
    createSlot,
    initialUserPrompt,
    defaultSharedParams,
  } = deps;

  const hasEditedSinceLoad = ref(false);
  const loadedEditorSignature = ref<string | null>(null);

  function serializeEditorState(): PersistedEditorState {
    return {
      version: 4,
      shared: {
        userPrompts: shared.userPrompts.map((p) => ({
          id: p.id,
          role: p.role,
          text: p.text,
          images: p.images,
        })),
        toolsDefinition: shared.toolsDefinition,
        variables: shared.variables.map((v) => ({ id: v.id, key: v.key, value: v.value })),
        defaultParams: { ...shared.defaultParams },
        enableSuggestions: shared.enableSuggestions,
        streamOutput: shared.streamOutput,
      },
      slots: slots.value.map((slot) => ({
        id: slot.id,
        providerProfileId: slot.providerProfileId,
        pluginId: slot.pluginId,
        modelId: slot.modelId,
        systemPrompt: slot.systemPrompt,
        paramOverride: slot.paramOverride,
      })),
      toolRegistry: toolRegistry.value,
    };
  }

  function loadEditorState() {
    let raw: string | null = null;
    try {
      raw = getItem(STORAGE_KEYS.EDITOR_STATE);
    } catch (err) {
      console.warn('无法读取本地编辑器状态（localStorage 不可用）。', err);
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedEditorState>;
      if (![1, 2, 3, 4].includes((parsed as PersistedEditorState).version) || !parsed.shared) return;

      const restoredUserPrompts = Array.isArray(parsed.shared.userPrompts)
        ? parsed.shared.userPrompts
            .filter((p): p is UserPromptPreset => Boolean(p && typeof (p as UserPromptPreset).id === 'string'))
            .map((p) => ({
              id: p.id,
              role: (p.role === 'system' || p.role === 'assistant' ? p.role : 'user') as
                | 'user'
                | 'system'
                | 'assistant',
              text: typeof p.text === 'string' ? p.text : '',
              images: Array.isArray(p.images) ? p.images : undefined,
            }))
        : [];

      shared.userPrompts = restoredUserPrompts.length ? restoredUserPrompts : [initialUserPrompt];

      if (typeof parsed.shared.toolsDefinition === 'string')
        shared.toolsDefinition = parsed.shared.toolsDefinition;
      if (Array.isArray((parsed.shared as Partial<SharedState>).variables)) {
        const restoredVariables = (parsed.shared as Partial<SharedState>).variables!
          .filter((v) => v && typeof v.id === 'string')
          .map((v, index) => ({
            id: v.id,
            key: typeof v.key === 'string' ? v.key : `VAR_${index + 1}`,
            value: typeof v.value === 'string' ? v.value : '',
          }));
        if (restoredVariables.length) {
          shared.variables = restoredVariables;
        }
      }
      if (parsed.shared.defaultParams) {
        shared.defaultParams = {
          temperature: coerceNumber(parsed.shared.defaultParams.temperature, defaultSharedParams.temperature),
          top_p: coerceNumber(parsed.shared.defaultParams.top_p, defaultSharedParams.top_p),
          max_tokens: coerceNumber(parsed.shared.defaultParams.max_tokens, defaultSharedParams.max_tokens),
        };
      }
      if (typeof parsed.shared.enableSuggestions === 'boolean')
        shared.enableSuggestions = parsed.shared.enableSuggestions;
      if (typeof parsed.shared.streamOutput === 'boolean')
        shared.streamOutput = parsed.shared.streamOutput;

      if (Array.isArray(parsed.slots) && parsed.slots.length) {
        const allowedProfileIds = new Set(providerProfiles.value.map((p) => p.id));
        slots.value = parsed.slots.map((slot) => ({
          ...createSlot(),
          id: typeof slot.id === 'string' ? slot.id : newId(),
          providerProfileId:
            typeof slot.providerProfileId === 'string' && allowedProfileIds.has(slot.providerProfileId)
              ? slot.providerProfileId
              : null,
          pluginId: typeof slot.pluginId === 'string' ? slot.pluginId : plugins[0].id,
          modelId: typeof slot.modelId === 'string' ? slot.modelId : 'gpt-4o-mini',
          systemPrompt: typeof slot.systemPrompt === 'string' ? slot.systemPrompt : '',
          paramOverride: (slot.paramOverride as Record<string, unknown> | null) ?? null,
        }));
      }

      if (parsed.toolRegistry && typeof parsed.toolRegistry === 'object') {
        toolRegistry.value = parsed.toolRegistry as ToolRegistry;
      }
    } catch (err) {
      console.warn('加载本地编辑器状态失败，将忽略并使用默认值。', err);
    }
  }

  function saveEditorState() {
    try {
      setItem(STORAGE_KEYS.EDITOR_STATE, JSON.stringify(serializeEditorState()));
    } catch (err) {
      console.warn('保存本地编辑器状态失败。', err);
    }
  }

  const editorSignature = computed(() => JSON.stringify(serializeEditorState()));

  watch(
    editorSignature,
    (signature) => {
      if (loadedEditorSignature.value === null) {
        loadedEditorSignature.value = signature;
        saveEditorState();
        return;
      }
      if (signature !== loadedEditorSignature.value) {
        hasEditedSinceLoad.value = true;
        saveEditorState();
      }
    },
    { flush: 'post' }
  );

  return {
    hasEditedSinceLoad,
    loadEditorState,
    saveEditorState,
  };
}
