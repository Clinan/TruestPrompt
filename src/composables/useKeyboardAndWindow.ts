import { onBeforeUnmount, onMounted, type Ref } from 'vue';

// 为什么：全局键盘快捷键（Ctrl/Cmd+. 停止所有 Slot）与 beforeunload
// 提示分别挂在 window 上，原本散在 App.vue 的 onMounted / onBeforeUnmount
// 块里，每次加一个全局事件都要记得配对解绑。抽到 composable 后生命周期
// 管理是封闭的——调用方只注入回调/状态，不关心事件注册时机。
//
// 约束：需要在组件 setup 期同步调用（依赖 onMounted/onBeforeUnmount），
// 不能延迟调用。

export type UseKeyboardAndWindowDeps = {
  hasRunningSlots: Ref<boolean>;
  hasEditedSinceLoad: Ref<boolean>;
  stopAllSlots: () => void;
};

export function useKeyboardAndWindow(deps: UseKeyboardAndWindowDeps) {
  const { hasRunningSlots, hasEditedSinceLoad, stopAllSlots } = deps;

  function handleGlobalKeydown(event: KeyboardEvent) {
    const wantsStop =
      (event.ctrlKey || event.metaKey) && (event.key === '.' || event.code === 'Period');
    if (wantsStop && hasRunningSlots.value) {
      event.preventDefault();
      stopAllSlots();
    }
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!hasEditedSinceLoad.value) return;
    event.preventDefault();
    event.returnValue = '';
  }

  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleGlobalKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('keydown', handleGlobalKeydown);
  });
}
