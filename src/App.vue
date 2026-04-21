<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import localforage from 'localforage';
import type {
  HistoryItem,
  PluginRequest,
  ProviderProfile,
  ProviderProfileDraft,
  SharedState,
  Slot,
  UserPromptPreset,
  GatewayConfig
} from './core/types';
import { plugins } from './modules/provider/domain/plugins';
import { newId } from './core/utils/id';
import { buildProvidersExportZip, downloadBlob, parseProvidersImportZip } from './lib/providerTransfer';
import {
  getItem,
  setItem,
  getHistoryStore,
  getModelCacheStore,
  setCurrentProjectId,
  STORAGE_KEYS,
  isLocalStorageAvailable,
  enableMemoryFallback,
  migrateToProjectNamespace,
} from './core/storage';
import { useProjectManager } from './composables/useProjectManager';
import { useModals } from './composables/useModals';
import { useTheme } from './composables/useTheme';
import { handleOAuthCallback, checkAndRefreshTokens } from './lib/oauth';
import { fetchGatewayProviders, createProviderFromGateway, getEffectiveApiKey } from './modules/provider/domain/gateway';
import { parseUrlParams, clearShareParams, validateGatewayUrl, generateShareUrl } from './lib/urlSharing';
import { executeToolFromRegistry, type ToolRegistry } from './lib/toolExecutor';
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
const modelCacheTtlMs = 24 * 60 * 60 * 1000;
const defaultSharedParams = {
  temperature: 0.7,
  top_p: 1,
  max_tokens: 8192
};

// 状态
const providerProfiles = ref<ProviderProfile[]>([]);
const historyItems = ref<HistoryItem[]>([]);
const gatewayProviders = ref<any[]>([]);

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

// 历史加载对话框
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
  metrics: true
});

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

// Slots 状态
const slots = ref<Slot[]>([]);
const abortControllersBySlotId = new Map<string, { controller: AbortController; runId: string }>();

// 模型相关
const newProfile = reactive<ProviderProfileDraft>({
  name: '',
  apiKey: '',
  baseUrl: '',
  pluginId: plugins[0].id
});
const modelsByKey = reactive<Record<string, { id: string; label: string }[]>>({});
const refreshingModelsBySlotId = reactive<Record<string, boolean>>({});

const defaultProviderTemplate = computed(() => {
  const plugin = plugins.find((p) => p.id === newProfile.pluginId);
  return plugin?.defaultBaseUrl || 'https://api.openai.com/v1/chat/completions';
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

// 工具函数
function removeEmptyEntries(obj: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    cleaned[key] = value;
  });
  return cleaned;
}

function coerceNumber(value: unknown, fallback: number) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const STREAM_UI_YIELD_INTERVAL_MS = 32;

function createAbortError(message = '请求已中止') {
  return new DOMException(message, 'AbortError');
}

function isAbortError(err: unknown) {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError')
  );
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

// 编辑器状态持久化
type PersistedEditorState = {
  version: 4;
  shared: SharedState;
  slots: Array<Pick<Slot, 'id' | 'providerProfileId' | 'pluginId' | 'modelId' | 'systemPrompt' | 'paramOverride'>>;
  toolRegistry?: ToolRegistry;
};

function serializeEditorState(): PersistedEditorState {
  return {
    version: 4,
    shared: {
      userPrompts: shared.userPrompts.map((p) => ({ 
        id: p.id, 
        role: p.role, 
        text: p.text,
        images: p.images // 保存图片数据
      })),
      toolsDefinition: shared.toolsDefinition,
      variables: shared.variables.map((v) => ({ id: v.id, key: v.key, value: v.value })),
      defaultParams: { ...shared.defaultParams },
      enableSuggestions: shared.enableSuggestions,
      streamOutput: shared.streamOutput
    },
    slots: slots.value.map((slot) => ({
      id: slot.id,
      providerProfileId: slot.providerProfileId,
      pluginId: slot.pluginId,
      modelId: slot.modelId,
      systemPrompt: slot.systemPrompt,
      paramOverride: slot.paramOverride
    })),
    toolRegistry: toolRegistry.value
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
            role: (p.role === 'system' || p.role === 'assistant' ? p.role : 'user') as 'user' | 'system' | 'assistant',
            text: typeof p.text === 'string' ? p.text : '',
            images: Array.isArray(p.images) ? p.images : undefined // 恢复图片数据
          }))
      : [];

    shared.userPrompts = restoredUserPrompts.length ? restoredUserPrompts : [initialUserPrompt];

    if (typeof parsed.shared.toolsDefinition === 'string') shared.toolsDefinition = parsed.shared.toolsDefinition;
    if (Array.isArray((parsed.shared as Partial<SharedState>).variables)) {
      const restoredVariables = (parsed.shared as Partial<SharedState>).variables!
        .filter((v) => v && typeof v.id === 'string')
        .map((v, index) => ({
          id: v.id,
          key: typeof v.key === 'string' ? v.key : `VAR_${index + 1}`,
          value: typeof v.value === 'string' ? v.value : ''
        }));
      if (restoredVariables.length) {
        shared.variables = restoredVariables;
      }
    }
    if (parsed.shared.defaultParams) {
      shared.defaultParams = {
        temperature: coerceNumber(parsed.shared.defaultParams.temperature, defaultSharedParams.temperature),
        top_p: coerceNumber(parsed.shared.defaultParams.top_p, defaultSharedParams.top_p),
        max_tokens: coerceNumber(parsed.shared.defaultParams.max_tokens, defaultSharedParams.max_tokens)
      };
    }
    if (typeof parsed.shared.enableSuggestions === 'boolean') shared.enableSuggestions = parsed.shared.enableSuggestions;
    if (typeof parsed.shared.streamOutput === 'boolean') shared.streamOutput = parsed.shared.streamOutput;

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
        paramOverride: (slot.paramOverride as Record<string, unknown> | null) ?? null
      }));
    }
    
    // 加载工具注册表
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

// Provider 管理
function loadProfiles() {
  let stored: string | null = null;
  try {
    stored = getItem(STORAGE_KEYS.PROFILES);
  } catch (err) {
    console.warn('无法读取 Provider 配置（localStorage 不可用）。', err);
    providerProfiles.value = [];
    return;
  }
  const parsed = stored ? (JSON.parse(stored) as ProviderProfile[]) : [];
  providerProfiles.value = parsed.map((profile) => {
    // 网关 Provider（有 gatewayProviderId）保持原样
    if (profile.gatewayProviderId) {
      return profile;
    }
    // 本地模式的 profile 需要验证 pluginId
    const plugin = plugins.find((p) => p.id === profile.pluginId) ?? plugins[0];
    return {
      ...profile,
      pluginId: plugin.id,
      baseUrl: profile.baseUrl || plugin.defaultBaseUrl || 'https://api.openai.com/v1/chat/completions'
    };
  });
}

function saveProfiles() {
  try {
    setItem(STORAGE_KEYS.PROFILES, JSON.stringify(providerProfiles.value));
  } catch (err) {
    console.warn('保存 Provider 配置失败（localStorage 不可用）。', err);
    alert('保存 Provider 配置失败：浏览器禁用了本地存储。');
  }
}

async function exportProvidersEncryptedZip() {
  if (!providerProfiles.value.length) {
    alert('暂无 Provider 可导出');
    return;
  }
  const password = prompt('请输入导出密码（请妥善保存，用于导入解密）');
  if (!password) return;
  const again = prompt('请再次输入密码');
  if (again !== password) {
    alert('两次密码不一致');
    return;
  }
  try {
    const blob = await buildProvidersExportZip(providerProfiles.value, password);
    downloadBlob(blob, 'truestprompt-providers.zip');
  } catch (err) {
    console.error(err);
    alert(`导出失败：${err instanceof Error ? err.message : '未知错误'}`);
  }
}

async function importProvidersEncryptedZip(file: File) {
  const password = prompt('请输入导入密码');
  if (!password) return;
  try {
    const parsed = await parseProvidersImportZip(file, password);
    setItem(STORAGE_KEYS.PROFILES, JSON.stringify(parsed));
    loadProfiles();
    resetNewProfile();
    alert('导入成功（已覆盖本地 Provider 列表）');
  } catch (err) {
    console.error(err);
    alert(`导入失败：${err instanceof Error ? err.message : '未知错误'}`);
  }
}

function requestImportProvidersEncryptedZip(file: File) {
  openConfirmDialog({
    title: '导入 Provider 配置？',
    description: '导入会覆盖本地 Provider 列表（包括已保存的 API Key）。请确认你信任该文件来源。',
    tone: 'danger',
    confirmText: '继续导入',
    action: () => importProvidersEncryptedZip(file)
  });
}

function resetNewProfile() {
  newProfile.name = '';
  newProfile.apiKey = '';
  newProfile.pluginId = plugins[0].id;
  newProfile.baseUrl = plugins[0].defaultBaseUrl || 'https://api.openai.com/v1/chat/completions';
}

// Gateway handlers - 网关和本地 Provider 共存模式
function handleSaveGatewayConfig(config: GatewayConfig) {
  // 保存网关配置到项目（不清空现有 providers）
  enableGatewayMode(config);
}

function handleDisconnectGateway() {
  // 断开网关连接：清除配置和 token，但保留已导入的 providers
  disableGatewayMode();
  gatewayProviders.value = [];
}

function handleImportGatewayProviders(newProfiles: ProviderProfile[]) {
  // 导入网关 providers（追加到现有列表）
  providerProfiles.value = [...providerProfiles.value, ...newProfiles];
  saveProfiles();
  
  // 如果没有 slot，创建一个
  if (!slots.value.length) {
    slots.value = [createSlot()];
  }
  
  // 刷新所有 slot 的模型列表
  Promise.all(slots.value.map(slot => refreshModelsForSlot(slot)));
  saveEditorState();
}

// 处理网关登出（仅清除 token，不删除 providers）
function handleGatewayLogout() {
  // 清空 gateway providers 缓存
  gatewayProviders.value = [];
}

function addProfile() {
  if (!newProfile.name.trim()) {
    alert('请填写 Provider 名称');
    return;
  }
  const profile: ProviderProfile = {
    id: newId(),
    name: newProfile.name.trim(),
    apiKey: newProfile.apiKey.trim(),
    baseUrl: newProfile.baseUrl.trim() || defaultProviderTemplate.value,
    pluginId: newProfile.pluginId
  };
  providerProfiles.value.push(profile);
  saveProfiles();
  resetNewProfile();
}

function removeProfile(profileId: string) {
  providerProfiles.value = providerProfiles.value.filter((p) => p.id !== profileId);
  const fallbackProvider = providerProfiles.value[0] || null;
  slots.value = slots.value.map((slot) => {
    if (slot.providerProfileId !== profileId) return slot;
    return {
      ...slot,
      providerProfileId: fallbackProvider?.id ?? null,
      pluginId: fallbackProvider?.pluginId || slot.pluginId
    };
  });
  saveProfiles();
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

function clearProviderApiKeys() {
  providerProfiles.value = providerProfiles.value.map((profile) => ({ ...profile, apiKey: '' }));
  saveProfiles();
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

// Slot 管理
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
    metrics: { ttfbMs: null, totalMs: null }
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
    after: slots.value.length
  });
  saveEditorState();
}

function addSlot(copyFrom?: Slot) {
  appendSlot(createSlot(copyFrom), copyFrom ? 'copy' : 'manual');
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

function copySlot(slot: Slot) {
  addSlot(slot);
}

function removeSlot(slotId: string) {
  slots.value = slots.value.filter((s) => s.id !== slotId);
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

function updateSlot(updatedSlot: Slot) {
  const index = slots.value.findIndex(s => s.id === updatedSlot.id);
  if (index >= 0) {
    slots.value[index] = updatedSlot;
    saveEditorState();
  }
}

// 模型管理
function getModelsCacheKey(slot: Slot) {
  const pluginId = resolvePluginId(slot);
  const plugin = getPlugin(slot);
  const profile = getProfile(slot);
  const baseUrl = profile?.baseUrl || plugin?.defaultBaseUrl || '';
  return `${pluginId}::${baseUrl}`;
}

// OAuth 登录成功后自动获取 providers 和 models
async function handleOAuthSuccess(projectId: string) {
  try {
    // 切换到对应的项目
    if (currentProjectId.value !== projectId) {
      await projectManager.switchProject(projectId);
    }
    
    // 重新加载项目状态
    loadProfiles();
    loadEditorState();
    
    // 检查是否有网关配置
    if (!gatewayConfig.value?.enabled) {
      return;
    }
    
    // 获取网关 providers
    const providers = await fetchGatewayProviders(gatewayConfig.value, projectId);
    
    if (!providers || providers.length === 0) {
      return;
    }
    
    // 保存 gatewayProviders 供其他地方使用
    gatewayProviders.value = providers;
    
    // 获取已导入的网关 provider IDs
    const existingGatewayIds = new Set(
      providerProfiles.value
        .filter(p => p.gatewayProviderId)
        .map(p => p.gatewayProviderId)
    );
    
    // 只导入尚未导入的 providers
    const newProviders = providers.filter(p => !existingGatewayIds.has(p.id));
    
    if (newProviders.length === 0) {
      // 所有 providers 都已导入，只需刷新模型列表
      await Promise.all(slots.value.map(slot => refreshModelsForSlot(slot)));
      return;
    }
    
    // 创建新的 ProviderProfile（追加到现有列表）
    const newProfiles = newProviders.map(provider => ({
      ...createProviderFromGateway(provider, gatewayConfig.value!.baseUrl),
      id: newId(),
    }));
    
    // 追加到现有 providers
    providerProfiles.value = [...providerProfiles.value, ...newProfiles];
    saveProfiles();
    
    // 如果没有 slot，创建一个
    if (!slots.value.length) {
      slots.value = [createSlot()];
    }
    
    // 为第一个 slot 设置默认的 provider
    if (newProfiles.length > 0 && slots.value.length > 0) {
      const firstSlot = slots.value[0];
      firstSlot.providerProfileId = newProfiles[0].id;
      resolvePluginId(firstSlot);
    }
    
    // 刷新所有 slot 的模型列表
    await Promise.all(slots.value.map(slot => refreshModelsForSlot(slot)));
    
    // 保存编辑器状态
    saveEditorState();
  } catch (error) {
    console.error('自动填充 Providers 失败:', error);
  }
}

async function refreshModelsForSlot(slot: Slot) {
  await refreshModelsForSlotWithOptions(slot, {});
}

async function refreshModelsForSlotWithOptions(slot: Slot, opts: { force?: boolean }) {
  const plugin = getPlugin(slot);
  const cacheKey = getModelsCacheKey(slot);
  const profile = getProfile(slot);

  // 如果没有找到 profile，跳过
  if (!profile) {
    return;
  }

  const modelCacheStore = getModelCacheStore();

  if (!opts.force) {
    try {
      const cached = (await modelCacheStore.getItem(cacheKey)) as
        | { savedAt: number; models: { id: string; label: string }[] }
        | null;
      if (cached?.models?.length && Date.now() - cached.savedAt < modelCacheTtlMs) {
        modelsByKey[cacheKey] = cached.models;
        return;
      }
    } catch (err) {
      console.warn('读取模型缓存失败，将重新拉取。', err);
    }
  }

  // 获取有效的 API Key（网关 Provider 使用 access_token）
  const effectiveApiKey = getEffectiveApiKey(profile, currentProjectId.value);
  const effectiveProfile = { ...profile, apiKey: effectiveApiKey };

  refreshingModelsBySlotId[slot.id] = true;
  try {
    const models = await plugin.listModels(effectiveProfile);
    modelsByKey[cacheKey] = models;
    const plainModels = JSON.parse(JSON.stringify(models)) as { id: string; label: string }[];
    await modelCacheStore.setItem(cacheKey, { savedAt: Date.now(), models: plainModels });
  } catch (err) {
    console.warn('加载模型列表失败', err);
  } finally {
    refreshingModelsBySlotId[slot.id] = false;
  }
}

async function forceRefreshModels(slot: Slot) {
  const cacheKey = getModelsCacheKey(slot);
  const modelCacheStore = getModelCacheStore();
  try {
    await modelCacheStore.removeItem(cacheKey);
  } catch (err) {
    console.warn('清理模型缓存失败，将继续尝试刷新。', err);
  }
  await refreshModelsForSlotWithOptions(slot, { force: true });
}

function onProviderChange(slot: Slot) {
  slot.modelId = '';
  resolvePluginId(slot);
  refreshModelsForSlot(slot);
  saveEditorState();
}

// 历史管理
async function loadHistory() {
  const historyStore = getHistoryStore();
  const items: HistoryItem[] = (await historyStore.getItem('items')) || [];
  historyItems.value = items.sort((a, b) => b.createdAt - a.createdAt);
}

let historyPersistQueue: Promise<void> = Promise.resolve();

function queuePersistHistory(items: HistoryItem[]) {
  const historyStore = getHistoryStore();
  const plain = JSON.parse(JSON.stringify(items)) as HistoryItem[];
  historyPersistQueue = historyPersistQueue
    .then(() => { historyStore.setItem('items', plain); })
    .catch((err) => console.warn('保存历史失败。', err));
  return historyPersistQueue;
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

function applyHistoryLoad() {
  const item = historyLoadItem.value;
  if (!item) return;

  const targetSlot = slots.value.filter(s => s.selected)[0] || slots.value[0] || createSlot();
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
          text: typeof msg.content === 'string' ? msg.content : ''
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
    targetSlot.paramOverride = item.requestSnapshot.params ? { ...(item.requestSnapshot.params as Record<string, unknown>) } : null;
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
      tokens: item.responseSnapshot.usage
    };
  }

  historyLoadOpen.value = false;
  historyLoadItem.value = null;
  saveEditorState();
}

// 请求构建
const RESERVED_REQUEST_PARAM_KEYS = new Set(['tools']);

function mergeParams(slot: Slot) {
  const combined: Record<string, unknown> = { ...shared.defaultParams, ...(slot.paramOverride || {}) };
  RESERVED_REQUEST_PARAM_KEYS.forEach((key) => {
    if (key in combined) {
      delete combined[key];
    }
  });
  return removeEmptyEntries(combined);
}

function buildVariableMap() {
  const map: Record<string, string> = {};
  shared.variables
    .map((item) => ({ key: item.key.trim(), value: item.value }))
    .filter((item) => item.key.length > 0)
    .forEach((item) => {
      map[item.key] = item.value;
    });
  return map;
}

function renderTemplate(source: string, variables: Record<string, string>) {
  if (!source) return '';
  return source.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key]! : match
  );
}

function buildRequest(slot: Slot): PluginRequest {
  const variables = buildVariableMap();
  const composerMessages = shared.userPrompts
    .map((message) => ({
      role: message.role || 'user',
      content: renderTemplate(message.text, variables),
      // 传递图片数据（仅 user 角色消息有图片）
      images: message.images
    }))
    .filter((msg) => msg.content.trim().length > 0 || (msg.images && msg.images.length > 0));
  const userOnlyPrompts = composerMessages.filter((msg) => msg.role !== 'system').map((msg) => msg.content);
  
  // 计算 stream 参数：Slot 覆盖 > 全局默认参数 > 全局 streamOutput
  const slotStream = slot.paramOverride?.stream as boolean | undefined;
  const globalParamStream = shared.defaultParams.stream;
  const effectiveStream = slotStream ?? globalParamStream ?? shared.streamOutput;
  
  return {
    systemPrompt: renderTemplate(slot.systemPrompt, variables),
    userPrompts: userOnlyPrompts,
    toolsDefinition: shared.toolsDefinition,
    params: mergeParams(slot),
    modelId: slot.modelId,
    enableSuggestions: shared.enableSuggestions,
    stream: effectiveStream,
    messages: composerMessages
  };
}

function getProfile(slot: Slot) {
  return providerProfiles.value.find((p) => p.id === slot.providerProfileId) || null;
}

function resolvePluginId(slot: Slot) {
  const provider = getProfile(slot);
  const resolved = provider?.pluginId || slot.pluginId || plugins[0].id;
  if (slot.pluginId !== resolved) {
    slot.pluginId = resolved;
  }
  return resolved;
}

function getPlugin(slot: Slot) {
  const profile = getProfile(slot);
  
  // 网关 Provider 使用 openai-compatible 插件
  // 本地 Provider 使用其配置的 pluginId
  const pluginId = profile?.pluginId || resolvePluginId(slot);
  return plugins.find((p) => p.id === pluginId) || plugins[0];
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
  
  // 获取有效的 API Key（网关 Provider 使用 access_token，本地 Provider 使用 apiKey）
  const effectiveApiKey = getEffectiveApiKey(profile, currentProjectId.value);
  
  // 检查网关 Provider 是否已登录
  if (profile.gatewayProviderId && !effectiveApiKey) {
    alert('网关未登录，请先登录后再运行');
    return;
  }
  
  // 创建带有有效 apiKey 的 profile 副本
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
  let canceled = false;
  let lastUiYieldAt = start;

  const isCurrentRun = () => slot.lastRunId === runId;
  try {
    for await (const chunk of plugin.invokeChat(effectiveProfile, request, {
      stream: request.stream,
      signal: controller.signal
    })) {
      if (!isCurrentRun() || controller.signal.aborted) {
        throw createAbortError();
      }
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

      const now = performance.now();
      if (now - lastUiYieldAt >= STREAM_UI_YIELD_INTERVAL_MS) {
        await yieldToBrowser();
        lastUiYieldAt = performance.now();
        if (!isCurrentRun() || controller.signal.aborted) {
          throw createAbortError();
        }
      }
    }
    if (controller.signal.aborted) {
      throw createAbortError();
    }
    if (isCurrentRun()) {
      slot.status = 'done';
    }
  } catch (err) {
    const isAbort = isAbortError(err);
    if (!isCurrentRun()) {
      canceled = true;
      return;
    }
    if (isAbort) {
      canceled = true;
      slot.status = 'canceled';
      if (!slot.output.trim() || slot.output === '正在停止...') {
        slot.output = '已中止';
      }
    } else {
      console.error(err);
      slot.status = 'error';
      slot.output = err instanceof Error ? err.message : String(err);
      slot.toolCalls = null;
    }
  } finally {
    if (isCurrentRun()) {
      slot.metrics.totalMs = performance.now() - start;
    }

    const activeRun = abortControllersBySlotId.get(slot.id);
    if (activeRun?.runId === runId) {
      abortControllersBySlotId.delete(slot.id);
    }

    if (isCurrentRun() && !canceled) {
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
      historyItems.value = [historyItem, ...historyItems.value];
      queuePersistHistory(historyItems.value);
    }
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

// 工具执行功能
async function executeToolCall(slotId: string, toolCall: ToolCall) {
  const slot = slots.value.find(s => s.id === slotId);
  if (!slot || !toolCall.function?.name) return;
  
  const toolName = toolCall.function.name;
  let args: Record<string, unknown> = {};
  
  // 解析参数
  try {
    const argsRaw = toolCall.function.arguments;
    if (typeof argsRaw === 'string') {
      args = JSON.parse(argsRaw);
    } else if (typeof argsRaw === 'object' && argsRaw !== null) {
      args = argsRaw as Record<string, unknown>;
    }
  } catch (err) {
    console.error('解析工具参数失败：', err);
    // 更新工具调用状态为错误
    updateToolCallExecution(slotId, toolCall, {
      status: 'error',
      error: '参数解析失败：' + (err instanceof Error ? err.message : String(err))
    });
    return;
  }
  
  // 更新状态为执行中
  updateToolCallExecution(slotId, toolCall, {
    status: 'running'
  });
  
  try {
    // 执行工具
    const result = await executeToolFromRegistry(toolName, args, toolRegistry.value);
    
    // 更新状态为成功
    updateToolCallExecution(slotId, toolCall, {
      status: 'success',
      result,
      executedAt: Date.now()
    });
  } catch (err) {
    console.error('工具执行失败：', err);
    
    // 检查是否有详细的错误信息
    let errorMessage = err instanceof Error ? err.message : String(err);
    let errorDetails: any = null;
    
    if (err instanceof Error && (err as any).details) {
      errorDetails = (err as any).details;
      // 构造包含详细信息的错误消息
      errorMessage = `${errorMessage}\n\n状态码: ${errorDetails.status}\nURL: ${errorDetails.url}\n方法: ${errorDetails.method}`;
      
      if (errorDetails.response) {
        errorMessage += `\n\n响应内容:\n${typeof errorDetails.response === 'string' ? errorDetails.response : JSON.stringify(errorDetails.response, null, 2)}`;
      }
    }
    console.log('错误详情对象：', errorDetails);
    
    // 更新状态为错误
    updateToolCallExecution(slotId, toolCall, {
      status: 'error',
      error: errorMessage,
      result: errorDetails // 直接保存errorDetails，即使是null也保存
    });
  }
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

// 键盘快捷键
function handleGlobalKeydown(event: KeyboardEvent) {
  const wantsStop = (event.ctrlKey || event.metaKey) && (event.key === '.' || event.code === 'Period');
  if (wantsStop && hasRunningSlots.value) {
    event.preventDefault();
    stopAllSlots();
    return;
  }
}

// 页面离开提示
const hasEditedSinceLoad = ref(false);
const loadedEditorSignature = ref<string | null>(null);
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

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasEditedSinceLoad.value) return;
  event.preventDefault();
  event.returnValue = '';
}

// URL参数处理函数
function parseUrlParamsLocal() {
  return parseUrlParams();
}

// 自动配置网关并跳转登录
async function handleAutoGatewayLogin(gatewayUrl: string, clientId: string, projectName?: string) {
  try {
    console.log('=== 开始自动网关登录 ===');
    console.log('网关URL:', gatewayUrl);
    console.log('Client ID:', clientId);
    console.log('项目名称:', projectName);
    
    // 验证网关URL格式
    if (!validateGatewayUrl(gatewayUrl)) {
      throw new Error('无效的网关地址格式');
    }
    
    // 创建或切换到指定项目
    let targetProjectId = currentProjectId.value;
    console.log('当前项目ID:', targetProjectId);
    
    if (projectName) {
      // 查找是否已有同名项目
      const existingProject = projects.value.find(p => p.name === projectName);
      if (existingProject) {
        console.log('找到现有项目:', existingProject.name);
        targetProjectId = existingProject.id;
        await switchProject(targetProjectId);
      } else {
        // 创建新项目
        console.log('创建新项目:', projectName);
        const newProject = createProject(projectName);
        if (newProject) {
          targetProjectId = newProject.id;
          await switchProject(targetProjectId);
        }
      }
    }
    
    // 配置网关
    const gatewayConfig: GatewayConfig = {
      enabled: true,
      baseUrl: gatewayUrl.replace(/\/$/, ''), // 移除末尾斜杠
      clientId: clientId,
      authorizeEndpoint: '/oauth/authorize',
      tokenEndpoint: '/oauth/token',
      redirectPath: '/auth/callback'
    };
    
    console.log('网关配置:', gatewayConfig);
    
    // 保存网关配置
    enableGatewayMode(gatewayConfig);
    console.log('网关配置已保存');
    
    // 清除URL参数（避免重复处理）
    clearShareParams();
    console.log('URL参数已清除');
    
    console.log('准备跳转到OAuth登录...');
    console.log('目标项目ID:', targetProjectId);
    
    // 直接跳转到网关登录
    const { startOAuthLogin } = await import('./lib/oauth');
    await startOAuthLogin(gatewayConfig, targetProjectId);
    
    console.log('OAuth登录流程已启动');
    
  } catch (err) {
    console.error('=== 自动网关登录失败 ===');
    console.error('错误详情:', err);
    alert(`自动登录失败：${err instanceof Error ? err.message : '未知错误'}`);
    
    // 清除URL参数
    clearShareParams();
  }
}

// 生命周期
onMounted(async () => {
  // 检查是否是 OAuth 回调
  if (window.location.pathname === '/auth/callback') {
    try {
      const result = await handleOAuthCallback(window.location.href);
      if (result.success) {
        // 清除 URL 中的回调参数，跳转到主页
        window.history.replaceState({}, '', '/');
        
        // 初始化项目管理器（需要先初始化才能获取网关配置）
        projectManager.initialize();
        
        // 自动获取 providers 和 models
        await handleOAuthSuccess(result.projectId);
        
        alert('登录成功！');
        return; // 提前返回，避免重复初始化
      } else {
        alert(`登录失败：${result.error}`);
        window.history.replaceState({}, '', '/');
      }
    } catch (err) {
      console.error('OAuth callback error:', err);
      alert(`登录失败：${err instanceof Error ? err.message : '未知错误'}`);
      window.history.replaceState({}, '', '/');
    }
  }
  
  // 执行数据迁移（如果需要）
  await migrateToProjectNamespace();
  
  // 初始化项目管理器
  projectManager.initialize();
  
  // 检查URL参数，处理自动网关登录
  const urlParams = parseUrlParamsLocal();
  console.log('URL参数解析结果:', urlParams);
  
  if (urlParams.gatewayUrl) {
    console.log('检测到网关URL参数，开始自动配置...');
    // 如果有网关URL参数，自动配置并跳转登录
    await handleAutoGatewayLogin(urlParams.gatewayUrl, urlParams.clientId, urlParams.projectName);
    return; // 跳转后不继续执行后续初始化
  } else {
    console.log('未检测到网关URL参数，继续正常初始化');
  }
  
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
  if (gatewayConfig.value?.enabled) {
    const needsReauth = await checkAndRefreshTokens(currentProjectId.value, gatewayConfig.value);
    if (needsReauth) {
      console.log('网关需要重新登录');
    }
  }
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('keydown', handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('keydown', handleGlobalKeydown);
});

watch(
  () => newProfile.pluginId,
  () => {
    newProfile.baseUrl = defaultProviderTemplate.value;
  },
  { immediate: true }
);

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
      @close="historyLoadOpen = false"
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
