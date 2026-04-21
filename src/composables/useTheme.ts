import { ref, watch } from 'vue';

// 为什么：主题偏好原本在 App.vue 里跨三层同步（ref / localStorage /
// DOM data-theme 属性），每条路径都单独一段代码，后续想插入跟随系统配色
// 或者响应 OS 偏好变化时，要逐处改。抽成 composable 后 ref 是唯一写入点，
// applyTheme 统一写 DOM 和 localStorage，外部只看 `theme` 读就够。
//
// 兼容性：DOM `data-theme` 属性仍被主动维护，JsonEditor 等组件靠
// MutationObserver 监听该属性的现有机制不会失效。
//
// 限制：SSR 场景下 window/localStorage 不可用，这里做了 typeof 兜底；
// localStorage 写失败只打 warn 不抛，保持当前宽松策略。

const STORAGE_KEY = 'truestprompt-theme';
type ThemeMode = 'light' | 'dark';

export function useTheme() {
  const theme = ref<ThemeMode>('light');

  if (typeof window !== 'undefined') {
    let stored: ThemeMode | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    } catch (err) {
      console.warn('无法读取主题偏好（localStorage 不可用）。', err);
    }
    theme.value = stored === 'dark' ? 'dark' : 'light';
    applyTheme(theme.value);
  }

  watch(theme, (mode) => applyTheme(mode));

  function applyTheme(mode: ThemeMode) {
    document.documentElement.setAttribute('data-theme', mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (err) {
      console.warn('无法保存主题偏好：', err);
    }
  }

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light';
  }

  return { theme, toggleTheme };
}
