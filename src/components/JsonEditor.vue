<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { Button, Tooltip, message } from 'ant-design-vue';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons-vue';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import type { Extension } from '@codemirror/state';

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
  readonly?: boolean;
  language?: 'json' | 'javascript' | 'text';
  copyable?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [string];
}>();

const currentValue = computed(() => props.modelValue ?? '');
const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark');
const justCopied = ref(false);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

async function handleCopy() {
  const text = props.modelValue ?? '';
  if (!text) {
    message.info('内容为空');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    justCopied.value = true;
    message.success('已复制');
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      justCopied.value = false;
    }, 1500);
  } catch {
    message.error('复制失败，请检查浏览器剪贴板权限');
  }
}

// 监听主题变化
let observer: MutationObserver | null = null;
onMounted(() => {
  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'data-theme') {
        isDark.value = document.documentElement.getAttribute('data-theme') === 'dark';
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true });
});

onUnmounted(() => {
  observer?.disconnect();
  if (copyResetTimer) clearTimeout(copyResetTimer);
});

const extensions = computed<Extension[]>(() => {
  const base: Extension[] = [EditorView.lineWrapping];
  
  // 添加暗色主题
  if (isDark.value) {
    base.push(oneDark);
  }
  
  switch (props.language) {
    case 'javascript':
      base.push(javascript());
      break;
    case 'text':
      break;
    default:
      base.push(json());
      break;
  }
  return base;
});

function handleUpdate(value: string) {
  if (props.readonly) return;
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="json-editor" :class="{ readonly: props.readonly, 'has-copy': props.copyable }">
    <Codemirror
      :model-value="currentValue"
      :extensions="extensions"
      :disabled="props.readonly"
      :placeholder="props.placeholder"
      :indent-with-tab="true"
      :tab-size="2"
      :style="{ height: '100%' }"
      @update:modelValue="handleUpdate"
    />
    <div v-if="props.copyable" class="json-editor__copy" @click.stop>
      <Tooltip :title="justCopied ? '已复制' : '复制内容'" placement="left">
        <Button
          size="small"
          type="text"
          class="json-editor__copy-btn"
          @click="handleCopy"
        >
          <template #icon>
            <CheckOutlined v-if="justCopied" />
            <CopyOutlined v-else />
          </template>
        </Button>
      </Tooltip>
    </div>
  </div>
</template>

<style scoped>
.json-editor {
  position: relative;
  height: 100%;
  overflow: hidden;
}
.json-editor :deep(.cm-editor) { height: 100%; }
.json-editor :deep(.cm-scroller) { overflow: auto !important; }

.json-editor__copy {
  position: absolute;
  top: 4px;
  right: 8px;
  z-index: 2;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out-expo);
}
.json-editor.has-copy:hover .json-editor__copy,
.json-editor__copy:focus-within { opacity: 1; }

.json-editor__copy-btn {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(4px);
}
.json-editor__copy-btn:hover { background: var(--hover-bg); }
</style>
