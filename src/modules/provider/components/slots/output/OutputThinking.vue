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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: var(--thinking-header-bg, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  user-select: none;
}
.thinking-title {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
}
.expand-icon {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}
.expand-down::after { content: '▼'; }
.expand-right::after { content: '▶'; }

.thinking-copy-btn {
  padding: 0;
  background: none;
  border: none;
  font-size: 12px;
  color: #fff;
  cursor: pointer;
}

.thinking-bubble {
  max-height: 200px;
  padding: 8px 10px;
  overflow-y: auto;
  background: var(--thinking-bg, linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%));
  border: 1px solid var(--thinking-border, rgba(102,126,234,0.3));
  border-top: none;
  border-radius: 0 0 6px 6px;
}
.thinking-content {
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.thinking-text {
  font-style: italic;
  color: var(--text-secondary);
}
.streaming-cursor::after {
  content: '█';
  color: var(--primary-color);
  animation: blink 1s step-end infinite;
}
</style>