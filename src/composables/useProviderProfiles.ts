import { computed, reactive, ref, watch, type Ref } from 'vue';
import type {
  Plugin,
  ProviderProfile,
  ProviderProfileDraft,
  Slot,
} from '../core/types';
import { getItem, setItem, getModelCacheStore, STORAGE_KEYS } from '../core/storage';
import { newId } from '../core/utils/id';
import { plugins } from '../modules/provider/domain/plugins';
import { getEffectiveApiKey } from '../modules/provider/domain/gateway';
import {
  buildProvidersExportZip,
  downloadBlob,
  parseProvidersImportZip,
} from '../lib/providerTransfer';

// 为什么：Provider/Profile 是本应用除 Slots 外最大的状态域，包含账户
// 列表、新增表单草稿、模型缓存（按 pluginId::baseUrl 分 key）、刷新状态、
// 加密导入导出、按 Slot 解析 plugin/profile 的查找函数。原本这一坨
// 功能散落在 App.vue ~400 行里，模型缓存 TTL、`newProfile` 草稿、
// `watch(() => newProfile.pluginId)` 同步 baseUrl 也混在生命周期里。
// 抽到 composable 后所有 Provider 状态内聚：模板只需要 `providerProfiles`
// 和几个 CRUD；Slot 相关逻辑通过 resolvePluginId/getPlugin/getProfile
// 访问只读投影。
//
// 循环依赖处理：useSlotState 需要 resolvePluginId + refreshModelsForSlot，
// 所以 useProviderProfiles 必须先实例化。removeProfile 需要触发 Slot
// 端的回填（被移除 profile 的 Slot 切到 fallback），通过 onProviderRemoved
// 回调（由 App.vue 提供，闭包捕获 slots ref）解耦——composable 本身
// 不依赖 slots。
//
// 注意：gateway 相关（enableGatewayMode / handleImportGatewayProviders）
// 留在 App.vue / useGatewayAuth（PR 10）处理，本 composable 只管本地
// Provider 列表和模型缓存。

const modelCacheTtlMs = 24 * 60 * 60 * 1000;

export type UseProviderProfilesDeps = {
  currentProjectId: Ref<string>;
  onProviderRemoved: (removedId: string, fallback: ProviderProfile | null) => void;
};

export function useProviderProfiles(deps: UseProviderProfilesDeps) {
  const { currentProjectId, onProviderRemoved } = deps;

  const providerProfiles = ref<ProviderProfile[]>([]);
  const newProfile = reactive<ProviderProfileDraft>({
    name: '',
    apiKey: '',
    baseUrl: '',
    pluginId: plugins[0].id,
  });
  const modelsByKey = reactive<Record<string, { id: string; label: string }[]>>({});
  const refreshingModelsBySlotId = reactive<Record<string, boolean>>({});

  const defaultProviderTemplate = computed(() => {
    const plugin = plugins.find((p) => p.id === newProfile.pluginId);
    return plugin?.defaultBaseUrl || 'https://api.openai.com/v1/chat/completions';
  });

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
      if (profile.gatewayProviderId) {
        return profile;
      }
      const plugin = plugins.find((p) => p.id === profile.pluginId) ?? plugins[0];
      return {
        ...profile,
        pluginId: plugin.id,
        baseUrl:
          profile.baseUrl ||
          plugin.defaultBaseUrl ||
          'https://api.openai.com/v1/chat/completions',
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

  function resetNewProfile() {
    newProfile.name = '';
    newProfile.apiKey = '';
    newProfile.pluginId = plugins[0].id;
    newProfile.baseUrl =
      plugins[0].defaultBaseUrl || 'https://api.openai.com/v1/chat/completions';
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
      pluginId: newProfile.pluginId,
    };
    providerProfiles.value.push(profile);
    saveProfiles();
    resetNewProfile();
  }

  function removeProfile(profileId: string) {
    providerProfiles.value = providerProfiles.value.filter((p) => p.id !== profileId);
    const fallbackProvider = providerProfiles.value[0] || null;
    onProviderRemoved(profileId, fallbackProvider);
    saveProfiles();
  }

  function clearProviderApiKeys() {
    providerProfiles.value = providerProfiles.value.map((profile) => ({
      ...profile,
      apiKey: '',
    }));
    saveProfiles();
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

  // Slot → Profile / Plugin 查找
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

  function getPlugin(slot: Slot): Plugin {
    const profile = getProfile(slot);
    // 网关 Provider 使用 openai-compatible 插件；本地 Provider 使用其配置的 pluginId
    const pluginId = profile?.pluginId || resolvePluginId(slot);
    return plugins.find((p) => p.id === pluginId) || plugins[0];
  }

  function getModelsCacheKey(slot: Slot) {
    const pluginId = resolvePluginId(slot);
    const plugin = getPlugin(slot);
    const profile = getProfile(slot);
    const baseUrl = profile?.baseUrl || plugin?.defaultBaseUrl || '';
    return `${pluginId}::${baseUrl}`;
  }

  async function refreshModelsForSlot(slot: Slot) {
    await refreshModelsForSlotWithOptions(slot, {});
  }

  async function refreshModelsForSlotWithOptions(slot: Slot, opts: { force?: boolean }) {
    const plugin = getPlugin(slot);
    const cacheKey = getModelsCacheKey(slot);
    const profile = getProfile(slot);

    if (!profile) return;

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

  // 新增 Provider 表单：切换 plugin 时同步 baseUrl 到默认模板
  watch(
    () => newProfile.pluginId,
    () => {
      newProfile.baseUrl = defaultProviderTemplate.value;
    },
    { immediate: true }
  );

  return {
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
    refreshModelsForSlotWithOptions,
    forceRefreshModels,
  };
}
