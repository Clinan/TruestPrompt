<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SlotMetrics, ToolCall } from '../../../../core/types';
import OutputThinking from './output/OutputThinking.vue';
import OutputMetrics from './output/OutputMetrics.vue';
import OutputToolCalls from './output/OutputToolCalls.vue';

const props = defineProps<{
  output: string;
  thinking: string;
  status: 'idle' | 'running' | 'done' | 'error' | 'canceled';
  metrics: SlotMetrics;
  toolCalls: ToolCall[] | null;
  streamOutput: boolean;
  toolRegistry?: Record<string, any>;
}>();

const emit = defineEmits<{
  executeToolCall: [toolCall: ToolCall];
  updateToolCall: [toolCall: ToolCall];
}>();

const isStreaming = computed(() => props.status === 'running' && props.streamOutput);
const hasOutput = computed(() => props.output && props.output.length > 0);
const hasToolCalls = computed(() => props.toolCalls && props.toolCalls.length > 0);

const statusText = computed(() => {
  switch (props.status) {
    case 'idle': return '等待运行...';
    case 'running': return isStreaming.value ? '' : '运行中...';
    case 'done': return '';
    case 'error': return '运行出错';
    case 'canceled': return '已取消';
    default: return '';
  }
});
</script>

<template>
  <div class="output-bubble-container">
    <OutputThinking
      :thinking="props.thinking"
      :isStreaming="isStreaming"
      :hasOutput="hasOutput"
    />

    <div
      class="output-bubble"
      :class="{
        'is-streaming': isStreaming,
        'is-error': props.status === 'error',
        'is-empty': !hasOutput
      }"
    >
      <div v-if="hasOutput" class="bubble-content">
        <span class="output-text">{{ props.output }}</span>
        <span v-if="isStreaming" class="streaming-cursor"></span>
      </div>
      <div v-else class="bubble-placeholder">{{ statusText }}</div>
    </div>

    <div v-if="props.status !== 'idle'" class="output-metrics">
      <OutputMetrics
        :metrics="props.metrics"
        :hasOutput="hasOutput"
        :output="props.output"
      />
    </div>

    <div v-if="hasToolCalls" class="tool-calls-section">
      <OutputToolCalls
        :toolCalls="props.toolCalls!"
        :toolRegistry="props.toolRegistry"
        @executeToolCall="(tc) => emit('executeToolCall', tc)"
        @updateToolCall="(tc) => emit('updateToolCall', tc)"
      />
    </div>
  </div>
</template>

<style scoped>
.output-bubble-container { display: flex; flex-direction: column; gap: 4px; }

.output-bubble {
  max-width: 100%;
  padding: 6px 10px;
  background: var(--bubble-assistant-bg);
  border-radius: 8px;
  border-bottom-left-radius: 2px;
  transition: all 150ms ease-out;
}
.output-bubble.is-error {
  background: var(--error-bg);
  border: 1px solid var(--error-color);
}
.output-bubble.is-empty { background: var(--bg-secondary); }

.bubble-content {
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}
.output-text { color: var(--text-primary); }
.streaming-cursor::after {
  content: '█';
  color: var(--primary-color);
  animation: blink 1s step-end infinite;
}
.bubble-placeholder {
  font-size: 11px;
  font-style: italic;
  color: var(--text-tertiary);
}

.output-metrics { display: flex; align-items: center; gap: 2px; }
.tool-calls-section { margin-top: 2px; }
</style>