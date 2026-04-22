<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import localforage from 'localforage';
import type {
  HistoryItem,
  PluginRequest,
  ProviderProfile,
  SharedState,
  Slot,
  UserPromptPreset,
  GatewayConfig
} from './core/types';
import { plugins } from './modules/provider/domain/plugins';
import { newId } from './core/utils/id';
import {
  setCurrentProjectId,
  isLocalStorageAvailable,
  enableMemoryFallback,
  migrateToProjectNamespace,
} from './core/storage';
import { useProjectManager } from './composables/useProjectManager';
import { useModals } from './composables/useModals';
import { useTheme } from './composables/useTheme';
import { useEditorPersistence } from './composables/useEditorPersistence';
import { useHistory } from './composables/useHistory';
import { useKeyboardAndWindow } from './composables/useKeyboardAndWindow';
import { useSlotState } from './composables/useSlotState';
import { useProviderProfiles } from './composables/useProviderProfiles';
import { useGatewayAuth } from './composables/useGatewayAuth';
import { getEffectiveApiKey } from './modules/provider/domain/gateway';
import { generateShareUrl } from './lib/urlSharing';
import { type ToolRegistry } from './lib/toolExecutor';
import { buildPluginRequest } from './lib/requestBuilder';
import { runChat } from './lib/chatOrchestrator';
import { runToolCall } from './lib/toolCallRunner';
import type { ToolCall } from './core/types';

// 新组件导入
import AppToolbar from './components/layout/AppToolbar.vue';
import MainWorkspace from './components/layout/MainWorkspace.vue';
import SlotsGrid from './modules/provider/components/slots/SlotsGrid.vue';
import PromptComposer from './components/prompt/PromptComposer.vue';
import HistoryDrawer from './components/drawers/HistoryDrawer.vue';
import VarsModal from './components/modals/VarsModal.vue';
import GlobalParamsModal from './components/modals/GlobalParamsModal.vue';
import ToolsDrawer from './modules/provider/components/modals/ToolsDrawer.vue';
import ProjectSelector from './components/layout/ProjectSelector.vue';
import CurlImportModal from './modules/provider/components/modals/CurlImportModal.vue';
import type { ImportResult } from './modules/provider/components/modals/CurlImportModal.vue';
import { shouldOverwriteSlot } from './lib/curlParser';

// 旧组件（保留兼容）
import ProviderPanel from './modules/provider/components/ProviderPanel.vue';
import CodeDialog from './components/CodeDialog.vue';
import HistoryLoadDialog from './components/HistoryLoadDialog.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';

// 检查 localStorage 可用性
if (!isLocalStorageAvailable()) {
  enableMemoryFallback();
}

// 存储配置 - 使用 StorageService 的 key 常量
const defaultSharedParams = {
  temperature: 0.7,
  top_p: 1,
  max_tokens: 8192
};

// 状态（gatewayProviders 现由 useGatewayAuth 管理）

// 模态框状态（集中管理，见 composables/useModals.ts）
const { modals } = useModals();

// 高亮 Slot 状态（用于导入动画）
const highlightedSlotId = ref<string | null>(null);

// 主题（见 composables/useTheme.ts）
const { theme, toggleTheme } = useTheme();
const useCurlPlaceholder = ref(true);

// 项目管理
const projectManager = useProjectManager({
  onBeforeSwitch: async (fromProjectId, toProjectId) => {
    // 保存当前项目状态
    saveEditorState();
    saveProfiles();
  },
  onAfterSwitch: async (projectId) => {
    // 加载新项目状态
    loadProfiles();
    loadEditorState();
    if (!slots.value.length) {
      slots.value = [createSlot()];
    }
    await Promise.all(slots.value.map((slot) => refreshModelsForSlot(slot)));
    await loadHistory();
  },
});

const { projects, currentProjectId, currentProject, sortedProjects, gatewayConfig, createProject, renameProject, deleteProject, switchProject, enableGatewayMode, disableGatewayMode } = projectManager;

// Provider 状态 + 模型缓存（见 composables/useProviderProfiles.ts）
const {
  providerProfiles,
  newProfile,
  modelsByKey,
  refreshingModelsBySlotId,
  defaultProviderTemplate,
  loadProfiles,
  saveProfiles,
  resetNewProfile,
  addProfile,
  removeProfile,
  clearProviderApiKeys,
  exportProvidersEncryptedZip,
  importProvidersEncryptedZip,
  getProfile,
  resolvePluginId,
  getPlugin,
  getModelsCacheKey,
  refreshModelsForSlot,
  forceRefreshModels,
} = useProviderProfiles({
  currentProjectId,
  // Slot 回填：profile 被删除后，引用它的 Slot 切到 fallback。
  // 闭包捕获 slots，真正读取发生在用户触发删除时，此时 slots 已初始化
  onProviderRemoved: (removedId, fallback) => {
    slots.value = slots.value.map((slot) => {
      if (slot.providerProfileId !== removedId) return slot;
      return {
        ...slot,
        providerProfileId: fallback?.id ?? null,
        pluginId: fallback?.pluginId || slot.pluginId,
      };
    });
  },
});

// 代码对话框
const codeDialogOpen = ref(false);
const codeDialogTitle = ref('');
const codeDialogCode = ref('');
const codeDialogSlotId = ref<string | null>(null);

// 确认对话框
const confirmDialogOpen = ref(false);
const confirmDialogTitle = ref('');
const confirmDialogDescription = ref('');
const confirmDialogTone = ref<'default' | 'danger'>('default');
const confirmDialogConfirmText = ref('确定');
let confirmDialogAction: null | (() => void | Promise<void>) = null;

// 初始用户消息
const initialUserPrompt: UserPromptPreset = {
  id: newId(),
  role: 'user',
  text: 'hello'
};

// 共享状态
const shared = reactive<SharedState>({
  userPrompts: [initialUserPrompt],
  toolsDefinition: '[]',
  variables: [{ id: newId(), key: '', value: '' }],
  defaultParams: { ...defaultSharedParams },
  enableSuggestions: true,
  streamOutput: true
});

// 工具注册表（不再使用localStorage，保存到编辑器状态）
const toolRegistry = ref<ToolRegistry>({});

// Slots 状态与 CRUD（见 composables/useSlotState.ts）
const {
  slots,
  abortControllersBySlotId,
  createSlot,
  appendSlot,
  addSlot,
  copySlot,
  removeSlot,
  updateSlot,
  onProviderChange,
} = useSlotState({
  providerProfiles,
  refreshModelsForSlot,
  resolvePluginId,
  // thunk：saveEditorState 在 useEditorPersistence 里才定义，
  // 此处先用闭包捕获，运行期（用户交互）才读取
  saveEditorState: () => saveEditorState(),
});

// 计算属性
const hasRunningSlots = computed(() => slots.value.some((slot) => slot.status === 'running'));

// 模型选项映射（供 SlotsGrid 使用）
const modelOptionsMap = computed(() => {
  const map: Record<string, { id: string; label: string }[]> = {};
  slots.value.forEach(slot => {
    const key = getModelsCacheKey(slot);
    map[slot.providerProfileId || ''] = modelsByKey[key] || [];
  });
  return map;
});

// 刷新状态映射
const refreshingModelsMap = computed(() => {
  const map: Record<string, boolean> = {};
  slots.value.forEach(slot => {
    map[slot.providerProfileId || ''] = refreshingModelsBySlotId[slot.id] || false;
  });
  return map;
});

// 确认对话框
function openConfirmDialog(options: {
  title: string;
  description?: string;
  tone?: 'default' | 'danger';
  confirmText?: string;
  action: () => void | Promise<void>;
}) {
  confirmDialogTitle.value = options.title;
  confirmDialogDescription.value = options.description || '';
  confirmDialogTone.value = options.tone || 'default';
  confirmDialogConfirmText.value = options.confirmText || '确定';
  confirmDialogAction = options.action;
  confirmDialogOpen.value = true;
}

function closeConfirmDialog() {
  confirmDialogOpen.value = false;
  confirmDialogAction = null;
}

async function confirmDialogConfirm() {
  const action = confirmDialogAction;
  closeConfirmDialog();
  await action?.();
}

function closeCodeDialog() {
  codeDialogOpen.value = false;
  codeDialogSlotId.value = null;
}

// 编辑器状态持久化（见 composables/useEditorPersistence.ts）
const { hasEditedSinceLoad, loadEditorState, saveEditorState } = useEditorPersistence({
  slots,
  shared,
  toolRegistry,
  providerProfiles,
  createSlot,
  initialUserPrompt,
  defaultSharedParams,
});

// 历史管理（见 composables/useHistory.ts）
const {
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
} = useHistory({
  slots,
  shared,
  providerProfiles,
  createSlot,
  saveProfiles,
  refreshModelsForSlot,
  saveEditorState,
});

// Gateway / OAuth 流程（见 composables/useGatewayAuth.ts）
const {
  gatewayProviders,
  handleSaveGatewayConfig,
  handleDisconnectGateway,
  handleImportGatewayProviders,
  handleGatewayLogout,
  maybeHandleOAuthCallback,
  maybeHandleAutoGatewayLogin,
  refreshGatewayTokensIfNeeded,
} = useGatewayAuth({
  projects,
  currentProjectId,
  gatewayConfig,
  createProject,
  switchProject,
  enableGatewayMode,
  disableGatewayMode,
  initializeProjectManager: projectManager.initialize,
  providerProfiles,
  slots,
  createSlot,
  saveProfiles,
  refreshModelsForSlot,
  resolvePluginId,
  loadProfiles,
  loadEditorState,
  saveEditorState,
});

function requestImportProvidersEncryptedZip(file: File) {
  openConfirmDialog({
    title: '导入 Provider 配置？',
    description: '导入会覆盖本地 Provider 列表（包括已保存的 API Key）。请确认你信任该文件来源。',
    tone: 'danger',
    confirmText: '继续导入',
    action: () => importProvidersEncryptedZip(file)
  });
}

function requestRemoveProfile(profileId: string) {
  const profile = providerProfiles.value.find((p) => p.id === profileId);
  openConfirmDialog({
    title: '删除 Provider？',
    description: profile
      ? `将删除「${profile.name}」，并把引用它的 Slot 自动切换到第一个可用 Provider。`
      : '将删除该 Provider，并把引用它的 Slot 自动切换到第一个可用 Provider。',
    tone: 'danger',
    confirmText: '删除',
    action: () => removeProfile(profileId)
  });
}

function requestClearProviderApiKeys() {
  if (!providerProfiles.value.some((profile) => profile.apiKey.trim().length > 0)) {
    alert('当前没有已保存的 API Key。');
    return;
  }
  openConfirmDialog({
    title: '清空所有 Provider API Key？',
    description: '此操作会将本地保存的所有 API Key 置空（不会删除 Provider 条目）。',
    tone: 'danger',
    confirmText: '清空',
    action: clearProviderApiKeys
  });
}

// 添加用户消息（供工具栏调用）
function addUserMessage() {
  const newMessage: UserPromptPreset = {
    id: newId(),
    role: 'user',
    text: ''
  };
  shared.userPrompts = [...shared.userPrompts, newMessage];
  saveEditorState();
}

function requestRemoveSlot(slotId: string) {
  if (slots.value.length <= 1) return;
  const slot = slots.value.find((s) => s.id === slotId);
  openConfirmDialog({
    title: '删除 Slot？',
    description: slot ? `将删除「${slot.modelId || '未选择模型'}」的 Slot，相关输出也会一并移除。` : '将删除该 Slot，相关输出也会一并移除。',
    tone: 'danger',
    confirmText: '删除',
    action: () => removeSlot(slotId)
  });
}

// 请求构建（见 lib/requestBuilder.ts，纯函数）
function buildRequest(slot: Slot): PluginRequest {
  return buildPluginRequest(slot, shared);
}

// cURL 导出
function buildCurlSnippet(slot: Slot): { title: string; code: string } | null {
  const plugin = getPlugin(slot);
  const profile = getProfile(slot);
  if (!profile) return null;
  const request = buildRequest(slot);
  
  // 网关 Provider 使用 {{ACCESS_TOKEN}} 占位符
  // 本地 Provider 根据 useCurlPlaceholder 设置决定是否使用占位符
  let maskedProfile: typeof profile;
  if (profile.gatewayProviderId) {
    // 网关 Provider：始终使用占位符
    maskedProfile = { ...profile, apiKey: '{{ACCESS_TOKEN}}' };
  } else {
    // 本地 Provider：根据设置决定
    maskedProfile = useCurlPlaceholder.value ? { ...profile, apiKey: '' } : profile;
  }
  
  try {
    return {
      title: `cURL（${slot.modelId}）`,
      code: plugin.buildCurl(maskedProfile, request)
    };
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function exportCurl(slot: Slot) {
  const snippet = buildCurlSnippet(slot);
  if (!snippet) {
    alert('请选择 Provider Profile');
    return;
  }
  codeDialogSlotId.value = slot.id;
  codeDialogTitle.value = snippet.title;
  codeDialogCode.value = snippet.code;
  codeDialogOpen.value = true;
}

watch(useCurlPlaceholder, () => {
  if (!codeDialogOpen.value || !codeDialogSlotId.value) return;
  const slot = slots.value.find((item) => item.id === codeDialogSlotId.value);
  if (!slot) return;
  const snippet = buildCurlSnippet(slot);
  if (!snippet) return;
  codeDialogTitle.value = snippet.title;
  codeDialogCode.value = snippet.code;
});

// 运行 Slot
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
        metrics: { ttfbMs: slot.metrics.ttfbMs, totalMs: slot.metrics.totalMs }
      }
    };
    appendHistoryItem(historyItem);
  }
}

// 模态框保存处理
function handleVarsSave(variables: typeof shared.variables) {
  shared.variables = variables;
  saveEditorState();
}

function handleParamsSave(params: typeof shared.defaultParams) {
  shared.defaultParams = params;
  saveEditorState();
}

function handleToolsSave(toolsDefinition: string) {
  shared.toolsDefinition = toolsDefinition;
  saveEditorState();
}

// 工具注册表保存
function handleToolRegistrySave(registry: ToolRegistry) {
  toolRegistry.value = registry;
  saveEditorState();
}

// 工具执行（纯逻辑见 lib/toolCallRunner.ts，这里只管 slot 状态回填）
async function executeToolCall(slotId: string, toolCall: ToolCall) {
  const slot = slots.value.find((s) => s.id === slotId);
  if (!slot || !toolCall.function?.name) return;

  updateToolCallExecution(slotId, toolCall, { status: 'running' });

  const execution = await runToolCall(toolCall, toolRegistry.value);
  if (execution.status === 'error') {
    console.error('工具执行失败：', execution.error);
  }
  updateToolCallExecution(slotId, toolCall, execution);
}

// 更新工具调用的执行状态
function updateToolCallExecution(
  slotId: string,
  toolCall: ToolCall,
  execution: Partial<ToolCall['execution']>
) {
  const slot = slots.value.find(s => s.id === slotId);
  if (!slot || !slot.toolCalls) return;
  
  const toolCalls = slot.toolCalls.map(tc => {
    if (tc.id === toolCall.id || (tc === toolCall)) {
      return {
        ...tc,
        execution: {
          ...tc.execution,
          ...execution
        } as ToolCall['execution']
      };
    }
    return tc;
  });
  
  const updatedSlot = { ...slot, toolCalls };
  updateSlot(updatedSlot);
}



// 分享项目处理
function handleShareProject() {
  if (!gatewayConfig.value?.enabled) {
    alert('只有网关模式的项目才能分享');
    return;
  }
  
  const currentProjectName = currentProject.value?.name;
  if (!currentProjectName) {
    alert('当前项目信息不完整，无法分享');
    return;
  }
  
  try {
    const shareUrl = generateShareUrl({
      gatewayUrl: gatewayConfig.value.baseUrl,
      clientId: gatewayConfig.value.clientId,
      projectName: currentProjectName,
      autoLogin: true
    });
    
    // 复制到剪贴板
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert('分享链接已复制到剪贴板！\n\n其他用户打开此链接将自动配置网关并跳转登录。');
    }).catch(() => {
      // 降级方案：显示链接让用户手动复制
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('分享链接已复制到剪贴板！\n\n其他用户打开此链接将自动配置网关并跳转登录。');
    });
  } catch (err) {
    console.error('生成分享链接失败:', err);
    alert(`生成分享链接失败：${err instanceof Error ? err.message : '未知错误'}`);
  }
}

// 项目管理处理函数
function handleCreateProject(name: string) {
  const newProject = createProject(name);
  if (newProject) {
    switchProject(newProject.id);
  }
}

function handleRenameProject(projectId: string, newName: string) {
  renameProject(projectId, newName);
}

async function handleDeleteProject(projectId: string) {
  await deleteProject(projectId);
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
      shared.userPrompts = result.messages.map(msg => ({
        id: newId(),
        role: (msg.role === 'system' || msg.role === 'assistant' ? msg.role : 'user') as 'user' | 'system' | 'assistant',
        text: msg.content,
      }));
    }

    // 高亮第一个 Slot
    if (slots.value.length > 0) {
      highlightedSlotId.value = slots.value[0].id;
      setTimeout(() => {
        highlightedSlotId.value = null;
      }, 2000);
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
    const existingIndex = providerProfiles.value.findIndex(p => p.id === provider.id);
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
    shared.userPrompts = result.messages.map(msg => ({
      id: newId(),
      role: (msg.role === 'system' || msg.role === 'assistant' ? msg.role : 'user') as 'user' | 'system' | 'assistant',
      text: msg.content,
    }));
  }

  // 等待 Vue 响应式更新完成
  await nextTick();

  // 刷新模型列表
  await refreshModelsForSlot(targetSlot);

  // 设置高亮动画
  highlightedSlotId.value = targetSlot.id;
  setTimeout(() => {
    highlightedSlotId.value = null;
  }, 2000);

  // 滚动到新 Slot（如果是新创建的）
  if (!shouldOverwrite) {
    await nextTick();
    const slotElement = document.querySelector(`[data-slot-id="${targetSlot.id}"]`);
    slotElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  saveEditorState();
}

// 全局键盘 & 窗口事件（Ctrl/Cmd+. 停止 / beforeunload 脏标记提示）
useKeyboardAndWindow({ hasRunningSlots, hasEditedSinceLoad, stopAllSlots });

// 生命周期
onMounted(async () => {
  // OAuth 回调命中则吸收（内部会 initialize projectManager + auto-fetch providers）
  if (await maybeHandleOAuthCallback()) return;

  // 执行数据迁移（如果需要）
  await migrateToProjectNamespace();

  // 初始化项目管理器
  projectManager.initialize();

  // 带 gateway URL 参数则自动配置并跳 OAuth
  if (await maybeHandleAutoGatewayLogin()) return;

  // 加载配置
  resetNewProfile();
  loadProfiles();
  loadEditorState();
  if (!slots.value.length) {
    slots.value = [createSlot()];
  }
  await Promise.all(slots.value.map((slot) => refreshModelsForSlot(slot)));
  await loadHistory();

  // 检查网关 token 是否需要刷新
  await refreshGatewayTokensIfNeeded();
});

watch(
  () => slots.value.map((slot) => `${slot.id}:${slot.pluginId}:${slot.providerProfileId}`),
  () => {
    slots.value.forEach((slot) => refreshModelsForSlot(slot));
  }
);
</script>

<template>
  <div id="app" class="app" :data-theme="theme">
    <!-- 顶部工具栏 -->
    <AppToolbar
      :project-options="sortedProjects.map(p => ({ id: p.id, label: p.name }))"
      :selected-project="currentProjectId"
      :theme="theme"
      :has-running-slots="hasRunningSlots"
      :gateway-config="gatewayConfig"
      @update:selected-project="switchProject"
      @toggle-theme="toggleTheme"
      @open-provider="modals.providerManager = true"
      @open-params="modals.params = true"
      @open-tools="modals.tools = true"
      @open-vars="modals.vars = true"
      @open-history="modals.history = true"
      @add-slot="addSlot()"
      @add-message="addUserMessage()"
      @stop-all="stopAllSlots"
      @import-curl="modals.curlImport = true"
      @share-project="handleShareProject"
    >
      <template #project-selector>
        <ProjectSelector
          :projects="sortedProjects"
          :current-project-id="currentProjectId"
          @select="switchProject"
          @create="handleCreateProject"
          @rename="handleRenameProject"
          @delete="handleDeleteProject"
        />
      </template>
    </AppToolbar>
    
    <!-- 主工作区 -->
    <MainWorkspace>
      <template #composer>
        <PromptComposer v-model:messages="shared.userPrompts" />
      </template>
      
      <template #slots>
        <SlotsGrid
          :slots="slots"
          :provider-profiles="providerProfiles"
          :model-options-map="modelOptionsMap"
          :refreshing-models-map="refreshingModelsMap"
          :stream-output="shared.streamOutput"
          :default-params="shared.defaultParams"
          :build-request-for-slot="buildRequest"
          :highlighted-slot-id="highlightedSlotId"
          :tool-registry="toolRegistry"
          @add-slot="addSlot()"
          @copy-slot="copySlot"
          @remove-slot="requestRemoveSlot"
          @run-slot="runSlot"
          @stop-slot="stopSlot"
          @provider-change="onProviderChange"
          @refresh-models="forceRefreshModels"
          @update:slot="updateSlot"
          @execute-tool-call="executeToolCall"
        />
      </template>
    </MainWorkspace>
    
    <!-- 模态框 -->
    <VarsModal
      :open="modals.vars"
      :variables="shared.variables"
      @update:open="modals.vars = $event"
      @save="handleVarsSave"
    />
    
    <GlobalParamsModal
      :open="modals.params"
      :default-params="shared.defaultParams"
      @update:open="modals.params = $event"
      @save="handleParamsSave"
    />
    
    <ToolsDrawer
      :open="modals.tools"
      :tools-definition="shared.toolsDefinition"
      :tool-registry="toolRegistry"
      @update:open="modals.tools = $event"
      @save-definition="handleToolsSave"
      @save-registry="handleToolRegistrySave"
    />
    
    <!-- cURL 导入弹窗 -->
    <CurlImportModal
      :open="modals.curlImport"
      :projects="sortedProjects"
      :current-project-id="currentProjectId"
      :provider-profiles="providerProfiles"
      @update:open="modals.curlImport = $event"
      @import="handleCurlImport"
    />
    
    <!-- Provider 管理面板 -->
    <ProviderPanel
      v-if="modals.providerManager"
      :plugins="plugins"
      :provider-profiles="providerProfiles"
      :new-profile="newProfile"
      :default-provider-template="defaultProviderTemplate"
      :current-project-id="currentProjectId"
      :gateway-config="gatewayConfig"
      :on-reset-new-profile="resetNewProfile"
      :on-add-profile="addProfile"
      :on-remove-profile="requestRemoveProfile"
      :on-export-providers="exportProvidersEncryptedZip"
      :on-import-providers="requestImportProvidersEncryptedZip"
      :on-clear-keys="requestClearProviderApiKeys"
      :on-save-gateway-config="handleSaveGatewayConfig"
      :on-disconnect-gateway="handleDisconnectGateway"
      :on-import-gateway-providers="handleImportGatewayProviders"
      @close="modals.providerManager = false"
      @profile-updated="handleGatewayLogout"
    />
    
    <!-- 历史抽屉 -->
    <HistoryDrawer
      :open="modals.history"
      :items="historyItems"
      @update:open="modals.history = $event"
      @load="loadHistoryIntoEditor"
      @toggle-star="toggleStar"
      @delete="deleteHistoryItem"
    />
    
    <!-- 历史加载对话框 -->
    <HistoryLoadDialog
      :open="historyLoadOpen"
      :item="historyLoadItem"
      :options="historyLoadOptions"
      @close="closeHistoryLoadDialog"
      @confirm="applyHistoryLoad"
    />
    
    <!-- 代码对话框 -->
    <CodeDialog
      :open="codeDialogOpen"
      :title="codeDialogTitle"
      :code="codeDialogCode"
      v-model:usePlaceholder="useCurlPlaceholder"
      @close="closeCodeDialog"
    />
    
    <!-- 确认对话框 -->
    <ConfirmDialog
      :open="confirmDialogOpen"
      :title="confirmDialogTitle"
      :description="confirmDialogDescription"
      :tone="confirmDialogTone"
      :confirmText="confirmDialogConfirmText"
      @close="closeConfirmDialog"
      @confirm="confirmDialogConfirm"
    />
  </div>
</template>

<style>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text-primary);
}
</style>
