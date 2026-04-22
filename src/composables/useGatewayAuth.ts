import { ref, type Ref } from 'vue';
import type {
  GatewayConfig,
  GatewayProvider,
  ProjectMetadata,
  ProviderProfile,
  Slot,
} from '../core/types';
import { newId } from '../core/utils/id';
import { handleOAuthCallback, checkAndRefreshTokens, startOAuthLogin } from '../lib/oauth';
import {
  createProviderFromGateway,
  fetchGatewayProviders,
} from '../modules/provider/domain/gateway';
import { parseUrlParams, clearShareParams, validateGatewayUrl } from '../lib/urlSharing';

// 为什么：网关（Gateway）模式横跨"项目切换 + OAuth 登录 + Provider 导入 +
// 模型刷新 + 编辑器状态落盘"五个域，原本散在 App.vue 的 handleOAuthSuccess
// / handleAutoGatewayLogin / handleImportGatewayProviders /
// handleSaveGatewayConfig / handleDisconnectGateway / handleGatewayLogout
// 加上 onMounted 的 OAuth 回调分支 + URL 参数分支里。后续要加"自动刷新
// token"或"切项目时保留网关会话"都要改一圈。抽到 composable 后：
// 6 个 handler + 2 个 bootstrap（maybeHandleOAuthCallback /
// maybeHandleAutoGatewayLogin）+ 1 个 token 体检函数 内聚一处。
//
// 不移动的事情：
//  - projectManager 本身：它是更上层的东西，App.vue 负责构造
//  - onMounted 里的 migrateToProjectNamespace / resetNewProfile /
//    loadProfiles / loadEditorState / 默认 Slot / loadHistory
//    —— 这些是通用启动流程，不只属于 gateway
//
// 回调 TDZ：slots / providerProfiles 来自其他 composable，通过 Ref 注入；
// 若任何函数（例如 resolvePluginId）来自后面声明的 composable，可以用
// 函数引用（hoisted）或 thunk 注入。当前所有 fn 依赖都是 function decl
// 或前置 composable 的返回值，不需要 thunk。

export type UseGatewayAuthDeps = {
  // 项目状态
  projects: Ref<ProjectMetadata[]>;
  currentProjectId: Ref<string>;
  gatewayConfig: Ref<GatewayConfig | null>;
  createProject: (name: string) => ProjectMetadata | null;
  switchProject: (id: string) => Promise<void>;
  enableGatewayMode: (config: GatewayConfig) => void;
  disableGatewayMode: () => void;
  initializeProjectManager: () => void;

  // Provider / Slot 状态
  providerProfiles: Ref<ProviderProfile[]>;
  slots: Ref<Slot[]>;
  createSlot: (copyFrom?: Slot) => Slot;
  saveProfiles: () => void;
  refreshModelsForSlot: (slot: Slot) => Promise<void> | void;
  resolvePluginId: (slot: Slot) => string;
  loadProfiles: () => void;

  // 编辑器
  loadEditorState: () => void;
  saveEditorState: () => void;
};

export function useGatewayAuth(deps: UseGatewayAuthDeps) {
  const {
    projects,
    currentProjectId,
    gatewayConfig,
    createProject,
    switchProject,
    enableGatewayMode,
    disableGatewayMode,
    initializeProjectManager,
    providerProfiles,
    slots,
    createSlot,
    saveProfiles,
    refreshModelsForSlot,
    resolvePluginId,
    loadProfiles,
    loadEditorState,
    saveEditorState,
  } = deps;

  // 网关 providers 缓存（UI 层使用）
  const gatewayProviders = ref<GatewayProvider[]>([]);

  function handleSaveGatewayConfig(config: GatewayConfig) {
    enableGatewayMode(config);
  }

  function handleDisconnectGateway() {
    disableGatewayMode();
    gatewayProviders.value = [];
  }

  function handleImportGatewayProviders(newProfiles: ProviderProfile[]) {
    providerProfiles.value = [...providerProfiles.value, ...newProfiles];
    saveProfiles();

    if (!slots.value.length) {
      slots.value = [createSlot()];
    }

    Promise.all(slots.value.map((slot) => refreshModelsForSlot(slot)));
    saveEditorState();
  }

  // 仅清除 token / 缓存，不删除已导入的 providers
  function handleGatewayLogout() {
    gatewayProviders.value = [];
  }

  async function handleOAuthSuccess(projectId: string) {
    try {
      if (currentProjectId.value !== projectId) {
        await switchProject(projectId);
      }

      loadProfiles();
      loadEditorState();

      if (!gatewayConfig.value?.enabled) {
        return;
      }

      const providers = await fetchGatewayProviders(gatewayConfig.value, projectId);
      if (!providers || providers.length === 0) return;

      gatewayProviders.value = providers;

      const existingGatewayIds = new Set(
        providerProfiles.value.filter((p) => p.gatewayProviderId).map((p) => p.gatewayProviderId)
      );
      const newProviders = providers.filter((p) => !existingGatewayIds.has(p.id));

      if (newProviders.length === 0) {
        await Promise.all(slots.value.map((slot) => refreshModelsForSlot(slot)));
        return;
      }

      const newProfiles = newProviders.map((provider) => ({
        ...createProviderFromGateway(provider, gatewayConfig.value!.baseUrl),
        id: newId(),
      }));

      providerProfiles.value = [...providerProfiles.value, ...newProfiles];
      saveProfiles();

      if (!slots.value.length) {
        slots.value = [createSlot()];
      }

      if (newProfiles.length > 0 && slots.value.length > 0) {
        const firstSlot = slots.value[0];
        firstSlot.providerProfileId = newProfiles[0].id;
        resolvePluginId(firstSlot);
      }

      await Promise.all(slots.value.map((slot) => refreshModelsForSlot(slot)));
      saveEditorState();
    } catch (error) {
      console.error('自动填充 Providers 失败:', error);
    }
  }

  async function handleAutoGatewayLogin(
    gatewayUrl: string,
    clientId: string,
    projectName?: string
  ) {
    try {
      if (!validateGatewayUrl(gatewayUrl)) {
        throw new Error('无效的网关地址格式');
      }

      let targetProjectId = currentProjectId.value;

      if (projectName) {
        const existingProject = projects.value.find((p) => p.name === projectName);
        if (existingProject) {
          targetProjectId = existingProject.id;
          await switchProject(targetProjectId);
        } else {
          const newProject = createProject(projectName);
          if (newProject) {
            targetProjectId = newProject.id;
            await switchProject(targetProjectId);
          }
        }
      }

      const config: GatewayConfig = {
        enabled: true,
        baseUrl: gatewayUrl.replace(/\/$/, ''),
        clientId,
        authorizeEndpoint: '/oauth/authorize',
        tokenEndpoint: '/oauth/token',
        redirectPath: '/auth/callback',
      };

      enableGatewayMode(config);
      clearShareParams();

      await startOAuthLogin(config, targetProjectId);
    } catch (err) {
      console.error('自动网关登录失败:', err);
      alert(`自动登录失败：${err instanceof Error ? err.message : '未知错误'}`);
      clearShareParams();
    }
  }

  // 如果命中 /auth/callback 路径，则处理 OAuth 回调并吸收掉；
  // 返回 true 表示已处理，调用方应停止继续 init
  async function maybeHandleOAuthCallback(): Promise<boolean> {
    if (window.location.pathname !== '/auth/callback') return false;
    try {
      const result = await handleOAuthCallback(window.location.href);
      if (result.success) {
        window.history.replaceState({}, '', '/');
        initializeProjectManager();
        await handleOAuthSuccess(result.projectId);
        alert('登录成功！');
        return true;
      }
      alert(`登录失败：${result.error}`);
      window.history.replaceState({}, '', '/');
    } catch (err) {
      console.error('OAuth callback error:', err);
      alert(`登录失败：${err instanceof Error ? err.message : '未知错误'}`);
      window.history.replaceState({}, '', '/');
    }
    return false;
  }

  // 如果 URL 带 gateway 参数，自动配置 + 跳 OAuth；返回 true 表示命中
  async function maybeHandleAutoGatewayLogin(): Promise<boolean> {
    const urlParams = parseUrlParams();
    if (!urlParams.gatewayUrl) return false;
    await handleAutoGatewayLogin(
      urlParams.gatewayUrl,
      urlParams.clientId,
      urlParams.projectName
    );
    return true;
  }

  async function refreshGatewayTokensIfNeeded(): Promise<void> {
    if (!gatewayConfig.value?.enabled) return;
    const needsReauth = await checkAndRefreshTokens(currentProjectId.value, gatewayConfig.value);
    if (needsReauth) {
      console.log('网关需要重新登录');
    }
  }

  return {
    gatewayProviders,
    handleSaveGatewayConfig,
    handleDisconnectGateway,
    handleImportGatewayProviders,
    handleGatewayLogout,
    handleOAuthSuccess,
    handleAutoGatewayLogin,
    maybeHandleOAuthCallback,
    maybeHandleAutoGatewayLogin,
    refreshGatewayTokensIfNeeded,
  };
}
