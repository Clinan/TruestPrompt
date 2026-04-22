import { nextTick, ref, type Ref } from 'vue';
import type { ProjectMetadata, ProviderProfile, SharedState, Slot } from '../core/types';
import { newId } from '../core/utils/id';
import { shouldOverwriteSlot } from '../lib/curlParser';
import type { ImportResult } from '../modules/provider/components/modals/CurlImportModal.vue';

// 为什么：handleCurlImport 原本 130 行塞在 App.vue，贯穿项目切换、
// provider 增改、slot 覆盖/追加、消息导入、模型刷新、高亮动画、
// 滚动定位 7 个步骤，是 App.vue 里单点最长的业务函数。抽到 composable
// 后 App.vue 只剩一根 @import 事件线，同时 highlightedSlotId 也跟着
// 迁过来——它只被 import 流程 set、CurlImportModal 无关、高亮动画的
// 计时器也只有这里在维护。
//
// 注意事项（均与既有行为保持一致）：
//  - 只导入提示词模式（promptsOnly）：不动 provider，只改第一个 slot
//    的 systemPrompt + shared.userPrompts
//  - 覆盖 / 追加 slot 的判定委托给 shouldOverwriteSlot（lib/curlParser）
//  - 高亮动画 2s 后自动消失；新建 slot 还会 scrollIntoView
//  - `await nextTick()` 的时序保留：先等响应式更新，再 refreshModelsForSlot，
//    再 scrollIntoView

export type UseCurlImportDeps = {
  slots: Ref<Slot[]>;
  shared: SharedState;
  providerProfiles: Ref<ProviderProfile[]>;
  currentProjectId: Ref<string>;
  createSlot: () => Slot;
  appendSlot: (slot: Slot, source: string) => void;
  createProject: (name: string) => ProjectMetadata | null;
  switchProject: (projectId: string) => Promise<void>;
  saveProfiles: () => void;
  refreshModelsForSlot: (slot: Slot) => Promise<void> | void;
  saveEditorState: () => void;
};

export function useCurlImport(deps: UseCurlImportDeps) {
  const {
    slots,
    shared,
    providerProfiles,
    currentProjectId,
    createSlot,
    appendSlot,
    createProject,
    switchProject,
    saveProfiles,
    refreshModelsForSlot,
    saveEditorState,
  } = deps;

  const highlightedSlotId = ref<string | null>(null);

  function flashHighlight(slotId: string) {
    highlightedSlotId.value = slotId;
    setTimeout(() => {
      highlightedSlotId.value = null;
    }, 2000);
  }

  async function handleCurlImport(result: ImportResult) {
    // 调试日志
    console.log('[handleCurlImport] result.provider:', result.provider);
    console.log('[handleCurlImport] result.promptsOnly:', result.promptsOnly);

    // 如果需要创建新项目
    if (result.isNewProject && result.newProjectName) {
      const newProject = createProject(result.newProjectName);
      if (newProject) {
        await switchProject(newProject.id);
      }
    } else if (result.targetProjectId !== currentProjectId.value) {
      // 切换到目标项目
      await switchProject(result.targetProjectId);
    }

    // 只导入提示词模式：不处理 Provider，直接导入消息到当前 Slot
    if (result.promptsOnly) {
      // 导入系统提示词到第一个 Slot（如果有）
      if (result.systemPrompt && slots.value.length > 0) {
        slots.value[0].systemPrompt = result.systemPrompt;
      }

      // 导入用户消息
      if (result.messages && result.messages.length > 0) {
        shared.userPrompts = result.messages.map((msg) => ({
          id: newId(),
          role: (msg.role === 'system' || msg.role === 'assistant'
            ? msg.role
            : 'user') as 'user' | 'system' | 'assistant',
          text: msg.content,
        }));
      }

      // 高亮第一个 Slot
      if (slots.value.length > 0) {
        flashHighlight(slots.value[0].id);
      }

      saveEditorState();
      return;
    }

    // 处理 Provider
    const provider = result.provider;
    if (!provider) {
      console.warn('[handleCurlImport] No provider in result');
      return;
    }

    if (provider.isNew) {
      // 添加新 Provider
      const newProvider: ProviderProfile = {
        id: provider.id,
        name: provider.name,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        pluginId: provider.pluginId,
      };
      providerProfiles.value.push(newProvider);
      saveProfiles();
    } else {
      // 更新现有 Provider 的 API Key
      const existingIndex = providerProfiles.value.findIndex((p) => p.id === provider.id);
      if (existingIndex >= 0 && provider.apiKey) {
        providerProfiles.value[existingIndex] = {
          ...providerProfiles.value[existingIndex],
          apiKey: provider.apiKey,
        };
        saveProfiles();
      }
    }

    // 决定是覆盖还是创建新 Slot
    const shouldOverwrite = shouldOverwriteSlot(slots.value);
    let targetSlot: Slot;

    if (shouldOverwrite) {
      // 覆盖现有 Slot
      targetSlot = slots.value[0];
      targetSlot.providerProfileId = provider.id;
      targetSlot.pluginId = provider.pluginId;
      targetSlot.modelId = result.modelId || '';
      if (result.systemPrompt) {
        targetSlot.systemPrompt = result.systemPrompt;
      }
    } else {
      // 创建新 Slot
      targetSlot = createSlot();
      targetSlot.providerProfileId = provider.id;
      targetSlot.pluginId = provider.pluginId;
      targetSlot.modelId = result.modelId || '';
      if (result.systemPrompt) {
        targetSlot.systemPrompt = result.systemPrompt;
      }
      appendSlot(targetSlot, 'curl-import');
    }

    // 导入用户消息
    if (result.messages && result.messages.length > 0) {
      shared.userPrompts = result.messages.map((msg) => ({
        id: newId(),
        role: (msg.role === 'system' || msg.role === 'assistant'
          ? msg.role
          : 'user') as 'user' | 'system' | 'assistant',
        text: msg.content,
      }));
    }

    // 等待 Vue 响应式更新完成
    await nextTick();

    // 刷新模型列表
    await refreshModelsForSlot(targetSlot);

    // 设置高亮动画
    flashHighlight(targetSlot.id);

    // 滚动到新 Slot（如果是新创建的）
    if (!shouldOverwrite) {
      await nextTick();
      const slotElement = document.querySelector(`[data-slot-id="${targetSlot.id}"]`);
      slotElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    saveEditorState();
  }

  return { highlightedSlotId, handleCurlImport };
}
