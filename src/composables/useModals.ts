import { reactive } from 'vue';

// 为什么：App.vue 里原本散着 6 个 `show*Modal` 的 ref，模板里写
// `showXxxModal = true/false` 之类的赋值到处都是，既难定位 modal 清单，
// 也让 composable 拆分时每个 modal 要各带一根线回 App。集中到一个 reactive
// 对象后，新增 modal 只改这一处，事件 handler 也统一用 open/close 语义。
//
// 适用边界：这里只管"开关状态"，modal 的 onSave/onConfirm 等业务回调
// 仍由 App.vue 自己持有——composable 不应该耦合具体业务逻辑。

export type ModalKey =
  | 'vars'
  | 'params'
  | 'tools'
  | 'history'
  | 'providerManager'
  | 'curlImport';

export function useModals() {
  const modals = reactive<Record<ModalKey, boolean>>({
    vars: false,
    params: false,
    tools: false,
    history: false,
    providerManager: false,
    curlImport: false,
  });

  function open(key: ModalKey) {
    modals[key] = true;
  }

  function close(key: ModalKey) {
    modals[key] = false;
  }

  function toggle(key: ModalKey) {
    modals[key] = !modals[key];
  }

  return { modals, open, close, toggle };
}
