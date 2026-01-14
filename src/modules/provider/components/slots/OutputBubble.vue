<script setup lang="ts">
/**
 * OutputBubble - 输出气泡组件
 * 实现 LangUI 风格对话气泡，支持流式输出、光标动画和思考内容展示
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 13.7
 */
import { computed, ref } from 'vue';
import { Tag, Space, Button, Tooltip, Collapse, message } from 'ant-design-vue';
import { 
  CopyOutlined, 
  CheckOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
  BulbOutlined,
  DownOutlined,
  RightOutlined
} from '@ant-design/icons-vue';
import type { SlotMetrics, ToolCall } from '../../../../core/types';
import JsonEditor from '../../../../components/JsonEditor.vue';
import ToolCallItem from './ToolCallItem.vue';

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

const copied = ref(false);
const copiedThinking = ref(false);
const showToolCalls = ref(true); // 默认展开
const showThinking = ref(true);

const isStreaming = computed(() => props.status === 'running' && props.streamOutput);
const hasOutput = computed(() => props.output && props.output.length > 0);
const hasThinking = computed(() => props.thinking && props.thinking.length > 0);
const hasToolCalls = computed(() => props.toolCalls && props.toolCalls.length > 0);

// Token 统计
const tokensSummary = computed(() => {
  const tokens = props.metrics.tokens;
  if (!tokens) return null;
  const prompt = tokens.prompt ?? '-';
  const completion = tokens.completion ?? '-';
  const total = tokens.total ?? '-';
  if (prompt === '-' && completion === '-' && total === '-') return null;
  return `${prompt}/${completion}/${total}`;
});

// 格式化 Tool Calls
const formattedToolCalls = computed(() => {
  if (!props.toolCalls) return '';
  return JSON.stringify(props.toolCalls, null, 2);
});

// 复制输出
async function copyOutput() {
  if (!props.output) return;
  
  try {
    await navigator.clipboard.writeText(props.output);
    copied.value = true;
    message.success('已复制到剪贴板');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    message.error('复制失败');
  }
}

// 复制思考内容
async function copyThinking() {
  if (!props.thinking) return;
  
  try {
    await navigator.clipboard.writeText(props.thinking);
    copiedThinking.value = true;
    message.success('思考内容已复制');
    setTimeout(() => {
      copiedThinking.value = false;
    }, 2000);
  } catch (err) {
    message.error('复制失败');
  }
}

// 批量执行所有工具
function executeAllTools() {
  if (!props.toolCalls) return;
  
  const pendingTools = props.toolCalls.filter(
    (tc) => !tc.execution || tc.execution.status === 'pending' || tc.execution.status === 'error'
  );
  
  if (pendingTools.length === 0) {
    message.info('没有待执行的工具');
    return;
  }
  
  pendingTools.forEach((tc) => {
    emit('executeToolCall', tc);
  });
}

// 处理单个工具执行
function handleExecuteToolCall(toolCall: ToolCall) {
  emit('executeToolCall', toolCall);
}

// 处理工具更新
function handleUpdateToolCall(toolCall: ToolCall) {
  emit('updateToolCall', toolCall);
}


// 获取状态文本
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
    <!-- 思考内容气泡 -->
    <div v-if="hasThinking" class="thinking-section">
      <div class="thinking-header" @click="showThinking = !showThinking">
        <Space :size="4">
          <BulbOutlined class="thinking-icon" />
          <span class="thinking-title">思考过程</span>
          <component :is="showThinking ? DownOutlined : RightOutlined" class="expand-icon" />
        </Space>
        <Tooltip title="复制思考内容">
          <Button 
            type="text" 
            size="small"
            @click.stop="copyThinking"
          >
            <template #icon>
              <CheckOutlined v-if="copiedThinking" style="color: var(--success-color)" />
              <CopyOutlined v-else />
            </template>
          </Button>
        </Tooltip>
      </div>
      <div v-show="showThinking" class="thinking-bubble">
        <div class="thinking-content">
          <span class="thinking-text">{{ props.thinking }}</span>
          <span v-if="isStreaming && !hasOutput" class="streaming-cursor"></span>
        </div>
      </div>
    </div>

    <!-- 输出气泡 -->
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
      <div v-else class="bubble-placeholder">
        {{ statusText }}
      </div>
    </div>
    
    <!-- 指标徽章 -->
    <div v-if="props.status !== 'idle'" class="output-metrics">
      <Space :size="4" wrap>
        <Tooltip title="首字节响应时间 (TTFB)">
          <Tag size="small" class="metric-tag">
            <template #icon><ClockCircleOutlined /></template>
            TTFB {{ props.metrics.ttfbMs ? `${props.metrics.ttfbMs.toFixed(0)}ms` : '-' }}
          </Tag>
        </Tooltip>
        
        <Tooltip title="总耗时">
          <Tag size="small" class="metric-tag">
            <template #icon><FieldTimeOutlined /></template>
            {{ props.metrics.totalMs ? `${props.metrics.totalMs.toFixed(0)}ms` : '-' }}
          </Tag>
        </Tooltip>
        
        <Tooltip v-if="tokensSummary" title="Tokens (prompt/completion/total)">
          <Tag size="small" class="metric-tag">
            {{ tokensSummary }} tokens
          </Tag>
        </Tooltip>
        
        <Tooltip title="复制输出">
          <Button 
            type="text" 
            size="small"
            :disabled="!hasOutput"
            @click="copyOutput"
          >
            <template #icon>
              <CheckOutlined v-if="copied" style="color: var(--success-color)" />
              <CopyOutlined v-else />
            </template>
          </Button>
        </Tooltip>
      </Space>
    </div>
    
    <!-- Tool Calls -->
    <div v-if="hasToolCalls" class="tool-calls-section">
      <Collapse :activeKey="showToolCalls ? ['tools'] : []" :bordered="false" @change="(keys: any) => showToolCalls = Array.isArray(keys) && keys.includes('tools')">
        <Collapse.Panel key="tools" class="tool-calls-panel">
          <template #header>
            <Space>
              <ThunderboltOutlined />
              <span>Tool Calls ({{ props.toolCalls?.length }})</span>
              <Button
                type="primary"
                size="small"
                @click.stop="executeAllTools"
              >
                批量执行
              </Button>
            </Space>
          </template>
          <div class="tool-calls-list">
            <ToolCallItem
              v-for="(toolCall, index) in props.toolCalls"
              :key="toolCall.id || index"
              :toolCall="toolCall"
              :toolRegistry="props.toolRegistry || {}"
              @execute="handleExecuteToolCall"
              @update="handleUpdateToolCall"
            />
          </div>
        </Collapse.Panel>
      </Collapse>
    </div>
  </div>
</template>

<style scoped>
.output-bubble-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 思考内容样式 */
.thinking-section {
  margin-bottom: 4px;
}

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

.thinking-icon {
  color: #fff;
  font-size: 12px;
}

.thinking-title {
  color: #fff;
  font-size: 11px;
  font-weight: 500;
}

.expand-icon {
  color: rgba(255, 255, 255, 0.8);
  font-size: 10px;
}

.thinking-bubble {
  background: var(--thinking-bg, linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%));
  border: 1px solid var(--thinking-border, rgba(102, 126, 234, 0.3));
  border-top: none;
  border-radius: 0 0 6px 6px;
  padding: 8px 10px;
  max-height: 200px;
  overflow-y: auto;
}

.thinking-content {
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.thinking-text {
  color: var(--text-secondary);
  font-style: italic;
}

/* 输出气泡样式 */
.output-bubble {
  background: var(--bubble-assistant-bg, #f5f5f5);
  border-radius: 8px;
  border-bottom-left-radius: 2px;
  padding: 6px 10px;
  max-width: 100%;
  transition: all 150ms ease-out;
}

.output-bubble.is-error {
  background: var(--error-bg, #fff2f0);
  border: 1px solid var(--error-color, #ff4d4f);
}

.output-bubble.is-empty {
  background: var(--bg-secondary, #fafafa);
}

.bubble-content {
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.output-text {
  color: var(--text-primary);
}

.streaming-cursor::after {
  content: '█';
  animation: blink 1s step-end infinite;
  color: var(--primary-color);
}

@keyframes blink {
  50% { opacity: 0; }
}

.bubble-placeholder {
  color: var(--text-tertiary);
  font-size: 11px;
  font-style: italic;
}

.output-metrics {
  display: flex;
  align-items: center;
  gap: 2px;
}

.metric-tag {
  font-size: 10px;
  padding: 0 4px;
  line-height: 18px;
}

.tool-calls-section {
  margin-top: 2px;
}

.tool-calls-panel {
  background: transparent;
}

.tool-calls-panel :deep(.ant-collapse-header) {
  padding: 4px 8px !important;
  background: var(--code-bg);
  border-radius: 4px;
  font-size: 11px;
}

.tool-calls-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

/* 暗色主题适配 */
[data-theme="dark"] .output-bubble {
  background: var(--bubble-assistant-bg, #2d3748);
}

[data-theme="dark"] .output-bubble.is-empty {
  background: var(--bg-secondary, #1a202c);
}

[data-theme="dark"] .thinking-bubble {
  background: var(--thinking-bg, linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%));
  border-color: var(--thinking-border, rgba(102, 126, 234, 0.4));
}

[data-theme="dark"] .thinking-text {
  color: var(--text-secondary, #a0aec0);
}
</style>
