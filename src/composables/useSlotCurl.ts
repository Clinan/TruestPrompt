import { computed, ref, type Ref } from 'vue';
import type { PluginRequest, ProviderProfile, Slot } from '../core/types';
import { plugins } from '../modules/provider/domain/plugins';

// 为什么：SlotCard 里 cURL 导出逻辑（弹窗状态 + buildCurlCode +
// useCurlPlaceholder + 切换占位符同步重建）原本占脚本一半。这部分
// 完全不依赖 SlotCard 的 emit/template，只读取 slot + providerProfiles
// + 可选的 buildRequest 工厂。抽到 composable 后：
//  - SlotCard 的脚本只剩 selector / actions / output 转发，~150 行；
//  - 同样的 cURL 输出能力可以被任何 Slot 视图复用（例如未来如果
//    SlotsGrid 直接做批量导出）；
//  - useCurlPlaceholder 的切换在内部同步重建 code，无需调用方关心。
//
// 取舍：getProfile / getPlugin 是「Slot → 配置」的查找投影，本来就该
// 由调用方提供（App 里有 useProviderProfiles.getPlugin/getProfile）。
// 但这里的 buildRequest 是可选，且需要从 SlotCard 透传过来，所以
// 把查找逻辑也内置——避免再多一个 prop。

export type UseSlotCurlOptions = {
  slot: Ref<Slot>;
  providerProfiles: Ref<ProviderProfile[]>;
  buildRequest?: () => PluginRequest;
};

export function useSlotCurl(options: UseSlotCurlOptions) {
  const { slot, providerProfiles, buildRequest } = options;

  const open = ref(false);
  const title = ref('');
  const code = ref('');
  const usePlaceholder = ref(true);

  function getProfile() {
    return providerProfiles.value.find((p) => p.id === slot.value.providerProfileId) || null;
  }

  function getPlugin() {
    const profile = getProfile();
    const pluginId = profile?.pluginId || slot.value.pluginId || plugins[0].id;
    return plugins.find((p) => p.id === pluginId) || plugins[0];
  }

  function buildSnippet(): { title: string; code: string } | null {
    const plugin = getPlugin();
    const profile = getProfile();
    if (!profile || !buildRequest) return null;
    const request = buildRequest();
    const maskedProfile = usePlaceholder.value ? { ...profile, apiKey: '' } : profile;
    try {
      return {
        title: `cURL（${slot.value.modelId || '未选择模型'}）`,
        code: plugin.buildCurl(maskedProfile, request),
      };
    } catch {
      return null;
    }
  }

  function exportCurl() {
    const profile = getProfile();
    if (!profile) return;
    const snippet = buildSnippet();
    if (!snippet) return;
    title.value = snippet.title;
    code.value = snippet.code;
    open.value = true;
  }

  function setPlaceholder(value: boolean) {
    usePlaceholder.value = value;
    const snippet = buildSnippet();
    if (snippet) {
      code.value = snippet.code;
    }
  }

  const canExport = computed(() => Boolean(buildRequest && getProfile()));

  return {
    open,
    title,
    code,
    usePlaceholder,
    canExport,
    exportCurl,
    setPlaceholder,
  };
}
