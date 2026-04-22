import { reactive } from 'vue';

// 为什么：App.vue 原来把确认对话框的 6 个 ref + open/close/confirm 三个
// 函数散在不连续的 ~30 行里，每个 request*（删 provider / 清空 key /
// 导入加密 zip / 删 slot）都要重复构造 options 再喂给 openConfirmDialog。
// 对话框状态本身不依赖 App.vue 的其他数据，抽到 composable 后 App.vue
// 只保留业务胶水（request* 包装），UI 状态集中在一处。
//
// 适用边界：这里只管"对话框自身状态 + 动作闭包"，真正的业务动作
// （如 removeProfile）仍由 App.vue 持有——composable 不关心谁触发。

export type ConfirmDialogTone = 'default' | 'danger';

export type ConfirmDialogOptions = {
  title: string;
  description?: string;
  tone?: ConfirmDialogTone;
  confirmText?: string;
  action: () => void | Promise<void>;
};

export type ConfirmDialogState = {
  open: boolean;
  title: string;
  description: string;
  tone: ConfirmDialogTone;
  confirmText: string;
};

export function useConfirmDialog() {
  const state = reactive<ConfirmDialogState>({
    open: false,
    title: '',
    description: '',
    tone: 'default',
    confirmText: '确定',
  });

  let pendingAction: null | (() => void | Promise<void>) = null;

  function openConfirmDialog(options: ConfirmDialogOptions) {
    state.title = options.title;
    state.description = options.description || '';
    state.tone = options.tone || 'default';
    state.confirmText = options.confirmText || '确定';
    pendingAction = options.action;
    state.open = true;
  }

  function closeConfirmDialog() {
    state.open = false;
    pendingAction = null;
  }

  async function confirmDialogConfirm() {
    const action = pendingAction;
    closeConfirmDialog();
    await action?.();
  }

  return {
    state,
    openConfirmDialog,
    closeConfirmDialog,
    confirmDialogConfirm,
  };
}
