<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  thinking: string;
  isStreaming: boolean;
  hasOutput: boolean;
}>();

const copiedThinking = ref(false);
const showThinking = ref(true);

async function copyThinking() {
  if (!props.thinking) return;
  try {
    await navigator.clipboard.writeText(props.thinking);
    copiedThinking.value = true;
    setTimeout(() => { copiedThinking.value = false; }, 2000);
  } catch { /* clipboard unavailable */ }
}
</script>

<template>
  <div v-if="props.thinking" class="thinking-section">
    <div class="thinking-header" @click="showThinking = !showThinking">
      <span class="thinking-title">思考过程</span>
      <span :class="showThinking ? 'expand-down' : 'expand-right'" class="expand-icon"></span>
      <button type="button" class="thinking-copy-btn" @click.stop="copyThinking">
        {{ copiedThinking ? '✓' : '复制' }}
      </button>
    </div>
    <div v-show="showThinking" class="thinking-bubble">
      <div class="thinking-content">
        <span class="thinking-text">{{ props.thinking }}</span>
        <span v-if="props.isStreaming && !props.hasOutput" class="streaming-cursor"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thinking-section { margin-bottom: 4px; }
.thinking-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 8px; cursor: pointer; user-select: none;
  background: var(--thinking-header-bg, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
  border-radius: 6px 6px 0 0;
}
.thinking-title { color: #fff; font-size: 11px; font-weight: 500; }
.expand-icon { color: rgba(255,255,255,0.8); font-size: 10px; }
.expand-down::after { content: '▼'; }
.expand-right::after { content: '▶'; }
.thinking-copy-btn {
  background: none; border: none; color: #fff; cursor: pointer; font-size: 10px;
}
.thinking-bubble {
  background: var(--thinking-bg, linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%));
  border: 1px solid var(--thinking-border, rgba(102,126,234,0.3));
  border-top: none; border-radius: 0 0 6px 6px;
  padding: 8px 10px; max-height: 200px; overflow-y: auto;
}
.thinking-content { font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.thinking-text { color: var(--text-secondary); font-style: italic; }
.streaming-cursor::after { content: '█'; animation: blink 1s step-end infinite; color: var(--primary-color); }

[data-theme="dark"] .thinking-bubble {
  background: var(--thinking-bg, linear-gradient(135deg, rgba(102,126,234,0.15) 0%, rgba(118,75,162,0.15) 100%));
  border-color: var(--thinking-border, rgba(102,126,234,0.4));
}
[data-theme="dark"] .thinking-text { color: var(--text-secondary, #a0aec0); }
</style>