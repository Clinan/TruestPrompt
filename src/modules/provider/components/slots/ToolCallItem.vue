<script setup lang="ts">
/**
 * ToolCallItem - 单个工具调用展示和执行组件
 */
import { computed, ref } from 'vue';
import { Card, Button, Space, Tag, message } from 'ant-design-vue';
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  CopyOutlined,
  CheckOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons-vue';
import type { ToolCall, ToolCallExecutionStatus } from '../../../../core/types';
import JsonEditor from '../../../../components/JsonEditor.vue';

const props = defineProps<{
  toolCall: ToolCall;
  toolRegistry: Record<string, any>;
}>();

const emit = defineEmits<{
  execute: [toolCall: ToolCall];
  update: [toolCall: ToolCall];
}>();

const showArguments = ref(true); // 默认展开
const showResult = ref(true); // 默认展开
const copied = ref(false);

// 工具名称
const toolName = computed(() => props.toolCall.function?.name || 'Unknown Tool');

// 参数
const argsString = computed(() => {
  const args = props.toolCall.function?.arguments;
  if (!args) return '{}';
  if (typeof args === 'string') return args;
  return JSON.stringify(args, null, 2);
});

// 参数对象
const argsObject = computed(() => {
  try {
    const args = props.toolCall.function?.arguments;
    if (typeof args === 'string') {
      return JSON.parse(args);
    }
    return args || {};
  } catch {
    return {};
  }
});

// 执行状态
const executionStatus = computed<ToolCallExecutionStatus>(
  () => props.toolCall.execution?.status || 'pending'
);

// 结果字符串
const resultString = computed(() => {
  const result = props.toolCall.execution?.result;
  if (!result) return '';
  if (typeof result === 'string') return result;
  return JSON.stringify(result, null, 2);
});

// 错误信息
const errorMessage = computed(() => props.toolCall.execution?.error || '');

// 状态标签
const statusConfig = computed(() => {
  switch (executionStatus.value) {
    case 'pending':
      return { text: '待执行', color: 'default', icon: ClockCircleOutlined };
    case 'running':
      return { text: '执行中', color: 'processing', icon: LoadingOutlined };
    case 'success':
      return { text: '成功', color: 'success', icon: CheckCircleOutlined };
    case 'error':
      return { text: '失败', color: 'error', icon: CloseCircleOutlined };
  }
});

// 是否可执行
const canExecute = computed(() => {
  return executionStatus.value === 'pending' || executionStatus.value === 'error';
});

// 是否在执行中
const isExecuting = computed(() => executionStatus.value === 'running');

// 工具是否已配置
const isToolConfigured = computed(() => {
  return !!props.toolRegistry[toolName.value];
});

// 执行工具
function handleExecute() {
  if (!isToolConfigured.value) {
    message.warning(`工具 "${toolName.value}" 未配置，请先在工具管理中添加配置`);
    return;
  }
  emit('execute', props.toolCall);
}

// 复制结果
async function copyResult() {
  if (!resultString.value) return;
  
  try {
    await navigator.clipboard.writeText(resultString.value);
    copied.value = true;
    message.success('已复制到剪贴板');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    message.error('复制失败');
  }
}
</script>

<template>
  <Card
    size="small"
    class="tool-call-item"
    :class="{
      'status-pending': executionStatus === 'pending',
      'status-running': executionStatus === 'running',
      'status-success': executionStatus === 'success',
      'status-error': executionStatus === 'error',
    }"
  >
    <template #title>
      <Space :size="8">
        <ThunderboltOutlined />
        <span class="tool-name">{{ toolName }}</span>
        <Tag :color="statusConfig.color" size="small">
          <template #icon>
            <component :is="statusConfig.icon" :spin="isExecuting" />
          </template>
          {{ statusConfig.text }}
        </Tag>
        <Tag v-if="!isToolConfigured" color="warning" size="small">未配置</Tag>
        <Button
          v-if="canExecute"
          type="primary"
          size="small"
          :loading="isExecuting"
          :disabled="!isToolConfigured"
          @click.stop="handleExecute"
        >
          {{ executionStatus === 'error' ? '重试' : '执行' }}
        </Button>
      </Space>
    </template>


    <div class="tool-call-content">
      <!-- 参数 -->
      <div class="section">
        <div class="section-header" @click="showArguments = !showArguments">
          <span class="section-title">参数</span>
          <span class="section-toggle">{{ showArguments ? '▼' : '▶' }}</span>
        </div>
        <div v-show="showArguments" class="section-content">
          <div class="json-viewer">
            <JsonEditor :modelValue="argsString" language="json" />
          </div>
        </div>
      </div>

      <!-- 执行结果 -->
      <div v-if="resultString && (executionStatus === 'success' || executionStatus === 'error')" class="section" :class="{ 'error-section': executionStatus === 'error' }">
        <div class="section-header" @click="showResult = !showResult">
          <Space :size="4">
            <span class="section-title">{{ executionStatus === 'error' ? '错误详情' : '执行结果' }}</span>
            <Button
              type="text"
              size="small"
              @click.stop="copyResult"
            >
              <template #icon>
                <CheckOutlined v-if="copied" style="color: var(--success-color)" />
                <CopyOutlined v-else />
              </template>
            </Button>
          </Space>
          <span class="section-toggle">{{ showResult ? '▼' : '▶' }}</span>
        </div>
        <div v-show="showResult" class="section-content">
          <div class="json-viewer">
            <JsonEditor :modelValue="resultString" language="json" />
          </div>
        </div>
      </div>

      <!-- 错误信息 -->
      <div v-if="executionStatus === 'error' && errorMessage" class="section error-section">
        <div class="section-header">
          <span class="section-title">错误消息</span>
        </div>
        <div class="section-content">
          <div class="error-message-wrapper">
            <JsonEditor :modelValue="errorMessage" language="text" />
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.tool-call-item {
  margin-bottom: 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}
.tool-call-item.status-pending { border-left: 3px solid var(--border-color); }
.tool-call-item.status-running { border-left: 3px solid var(--primary-color); }
.tool-call-item.status-success { border-left: 3px solid var(--success-color); }
.tool-call-item.status-error   { border-left: 3px solid var(--error-color); }

.tool-name {
  font-size: 13px;
  font-weight: 600;
}

.tool-call-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}
.section-header:hover { background: var(--bg-hover); }

.section-title { color: var(--text-primary); }
.section-toggle { font-size: 10px; color: var(--text-tertiary); }

.section-content {
  padding: 8px;
  background: var(--bg-primary);
}

.json-viewer {
  min-height: 100px;
  max-height: 400px;
  overflow: hidden;
  border-radius: 4px;
}
.json-viewer :deep(.json-editor) {
  min-height: 100px;
  max-height: 400px;
}
.json-viewer :deep(.cm-editor) {
  min-height: 100px;
  max-height: 400px;
  font-size: 11px;
}
.json-viewer :deep(.cm-scroller) {
  max-height: 400px;
  overflow: auto !important;
}

.error-section { border-color: var(--error-color); }
.error-message-wrapper {
  min-height: 100px;
  max-height: 400px;
  overflow: hidden;
  border-radius: 4px;
}
.error-message-wrapper :deep(.cm-editor) {
  min-height: 100px;
  max-height: 400px;
  font-size: 12px;
}
</style>
