<script setup lang="ts">
/**
 * SlotCard - Slot 卡片组件
 * 使用 Ant Design Vue 组件，实现 LangUI 风格的现代设计
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.8
 */
import { computed, ref, toRef } from 'vue';
import {
  Card,
  Select,
  AutoComplete,
  Button,
  Space,
  Progress,
  Tooltip,
  Badge
} from 'ant-design-vue';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
  ReloadOutlined,
  SettingOutlined
} from '@ant-design/icons-vue';
import type { ProviderProfile, Slot, SharedState, PluginRequest } from '../../../../core/types';
import OutputBubble from './OutputBubble.vue';
import JsonEditor from '../../../../components/JsonEditor.vue';
import ParamsModal from '../modals/ParamsModal.vue';
import CurlModal from '../modals/CurlModal.vue';
import { useSlotCurl } from '../../../../composables/useSlotCurl';

const props = defineProps<{
  slot: Slot;
  providerProfiles: ProviderProfile[];
  modelOptions: { id: string; label: string }[];
  refreshingModels: boolean;
  streamOutput: boolean;
  disableRemove: boolean;
  defaultParams: SharedState['defaultParams'];
  // 用于构建 cURL 的请求数据
  buildRequest?: () => PluginRequest;
  // 高亮状态（用于导入动画）
  highlighted?: boolean;
  // 工具注册表
  toolRegistry?: Record<string, any>;
}>();

const emit = defineEmits<{
  copy: [slot: Slot];
  remove: [slotId: string];
  run: [slot: Slot];
  stop: [slotId: string];
  providerChange: [slot: Slot];
  refreshModels: [slot: Slot];
  'update:slot': [slot: Slot];
  executeToolCall: [slotId: string, toolCall: any];
}>();

// Provider 选项
const providerOptions = computed(() => [
  { value: null, label: '未选择 Provider' },
  ...props.providerProfiles.map(p => ({ value: p.id, label: p.name }))
]);

// Model 选项 - 用于 AutoComplete
const modelAutoCompleteOptions = computed(() => 
  props.modelOptions.map(m => ({ value: m.id, label: m.label || m.id }))
);

// 运行状态
const isRunning = computed(() => props.slot.status === 'running');
const isDone = computed(() => props.slot.status === 'done');
const isError = computed(() => props.slot.status === 'error');

// 进度条状态
const progressStatus = computed(() => {
  if (isError.value) return 'exception';
  if (isDone.value) return 'success';
  return 'active';
});

// 处理 Provider 变更
function handleProviderChange(value: string | null) {
  const updatedSlot = { ...props.slot, providerProfileId: value };
  emit('update:slot', updatedSlot);
  emit('providerChange', updatedSlot);
}

// 处理 Model 变更
function handleModelChange(value: string) {
  const updatedSlot = { ...props.slot, modelId: value };
  emit('update:slot', updatedSlot);
}

// 处理 System Prompt 变更
function handleSystemPromptChange(value: string) {
  const updatedSlot = { ...props.slot, systemPrompt: value };
  emit('update:slot', updatedSlot);
}

// 运行/停止
function handleRunOrStop() {
  if (isRunning.value) {
    emit('stop', props.slot.id);
  } else {
    emit('run', props.slot);
  }
}

// 复制 Slot
function handleCopy() {
  emit('copy', props.slot);
}

// 删除 Slot
function handleRemove() {
  emit('remove', props.slot.id);
}

// 刷新模型列表
function handleRefreshModels() {
  emit('refreshModels', props.slot);
}

// 参数配置弹窗
const paramsModalOpen = ref(false);

// cURL 导出（见 composables/useSlotCurl.ts）
const curl = useSlotCurl({
  slot: toRef(props, 'slot'),
  providerProfiles: toRef(props, 'providerProfiles'),
  buildRequest: props.buildRequest,
});

// 是否有自定义参数
const hasParamOverride = computed(() => {
  return props.slot.paramOverride && Object.keys(props.slot.paramOverride).length > 0;
});

// 打开参数配置弹窗
function openParamsModal() {
  paramsModalOpen.value = true;
}

// 保存参数配置
function handleParamsSave(params: Record<string, unknown> | null) {
  const updatedSlot = { ...props.slot, paramOverride: params };
  emit('update:slot', updatedSlot);
}

// 处理工具调用执行
function handleExecuteToolCall(toolCall: any) {
  emit('executeToolCall', props.slot.id, toolCall);
}

// 处理工具调用更新
function handleUpdateToolCall(toolCall: any) {
  // 更新 slot 中的 toolCalls
  const toolCalls = props.slot.toolCalls || [];
  const index = toolCalls.findIndex(tc => tc.id === toolCall.id);
  if (index >= 0) {
    const updatedToolCalls = [...toolCalls];
    updatedToolCalls[index] = toolCall;
    const updatedSlot = { ...props.slot, toolCalls: updatedToolCalls };
    emit('update:slot', updatedSlot);
  }
}
</script>

<template>
  <Card 
    class="slot-card"
    :class="{
      'is-running': isRunning,
      'is-done': isDone,
      'is-error': isError,
      'is-highlighted': props.highlighted
    }"
    :bordered="true"
    :data-slot-id="props.slot.id"
  >
    <!-- 进度条 -->
    <Progress
      v-if="isRunning"
      :percent="100"
      :show-info="false"
      :status="progressStatus"
      :stroke-width="3"
      class="slot-progress"
    />
    
    <!-- 头部：Provider 和 Model 选择 -->
    <div class="slot-header">
      <div class="slot-selectors">
        <Select
          :value="props.slot.providerProfileId || undefined"
          :options="providerOptions"
          placeholder="选择 Provider"
          class="provider-select"
          @change="(val: any) => handleProviderChange(val || null)"
        />
        
        <div class="model-select-wrapper">
          <AutoComplete
            :value="props.slot.modelId || undefined"
            :options="modelAutoCompleteOptions"
            placeholder="选择或输入模型"
            :filter-option="(input: string, option: any) => 
              option?.value?.toLowerCase().includes(input.toLowerCase()) ||
              option?.label?.toLowerCase().includes(input.toLowerCase())"
            class="model-select"
            @change="(val: any) => handleModelChange(String(val || ''))"
          />
          <Tooltip title="刷新模型列表">
            <Button 
              type="text" 
              size="small"
              :loading="props.refreshingModels"
              @click="handleRefreshModels"
            >
              <template #icon><ReloadOutlined /></template>
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
    
    <!-- System Prompt -->
    <div class="slot-system-prompt">
      <label class="section-label">System Prompt</label>
      <JsonEditor
        :modelValue="props.slot.systemPrompt"
        placeholder="为该 Slot 定义 System Prompt..."
        language="text"
        class="system-prompt-editor"
        @update:modelValue="handleSystemPromptChange"
      />
    </div>
    
    <!-- 操作按钮 -->
    <div class="slot-actions">
      <Space>
        <Button 
          :type="isRunning ? 'default' : 'primary'"
          :danger="isRunning"
          @click="handleRunOrStop"
        >
          <template #icon>
            <PauseCircleOutlined v-if="isRunning" />
            <PlayCircleOutlined v-else />
          </template>
          {{ isRunning ? '停止' : '运行' }}
        </Button>
        
        <Tooltip :title="hasParamOverride ? '参数配置（已自定义）' : '参数配置'">
          <Badge :dot="hasParamOverride || undefined" :offset="[-4, 4]">
            <Button @click="openParamsModal">
              <template #icon><SettingOutlined /></template>
            </Button>
          </Badge>
        </Tooltip>
        
        <Tooltip title="复制 Slot">
          <Button @click="handleCopy">
            <template #icon><CopyOutlined /></template>
          </Button>
        </Tooltip>
        
        <Tooltip title="导出 cURL">
          <Button @click="curl.exportCurl">
            <template #icon><ExportOutlined /></template>
          </Button>
        </Tooltip>
        
        <Tooltip :title="props.disableRemove ? '至少保留一个 Slot' : '删除 Slot'">
          <Button 
            danger 
            :disabled="props.disableRemove"
            @click="handleRemove"
          >
            <template #icon><DeleteOutlined /></template>
          </Button>
        </Tooltip>
      </Space>
    </div>
    
    <!-- 参数配置弹窗 -->
    <ParamsModal
      v-model:open="paramsModalOpen"
      :param-override="props.slot.paramOverride"
      :default-params="props.defaultParams"
      @save="handleParamsSave"
    />
    
    <!-- cURL 导出弹窗 -->
    <CurlModal
      v-model:open="curl.open.value"
      :title="curl.title.value"
      :code="curl.code.value"
      :use-placeholder="curl.usePlaceholder.value"
      @update:use-placeholder="curl.setPlaceholder"
    />
    
    <!-- 输出区域 -->
    <div class="slot-output">
      <OutputBubble
        :output="props.slot.output"
        :thinking="props.slot.thinking"
        :status="props.slot.status"
        :metrics="props.slot.metrics"
        :tool-calls="props.slot.toolCalls"
        :stream-output="props.streamOutput"
        :tool-registry="props.toolRegistry"
        @execute-tool-call="handleExecuteToolCall"
        @update-tool-call="handleUpdateToolCall"
      />
    </div>
  </Card>
</template>

<style scoped>
.slot-card {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  transition: all 150ms ease-out;
}
.slot-card :deep(.ant-card-body) { padding: 6px 8px; }
.slot-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); }
.slot-card.is-running { border-color: var(--primary-color); }
.slot-card.is-done { border-color: var(--success-color); }
.slot-card.is-error { border-color: var(--error-color); }
.slot-card.is-highlighted {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.2);
  animation: slot-highlight-pulse 1.5s ease-in-out;
}

@keyframes slot-highlight-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(var(--primary-color-rgb), 0.4); }
  50%  { box-shadow: 0 0 0 8px rgba(var(--primary-color-rgb), 0.1); }
  100% { box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.2); }
}

.slot-progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  margin: 0 !important;
  padding: 0;
  font-size: 0;
  line-height: 0;
  z-index: 2;
  pointer-events: none;
}
.slot-progress :deep(.ant-progress-outer) {
  display: block;
  padding: 0 !important;
  margin: 0 !important;
}
.slot-progress :deep(.ant-progress-inner) {
  display: block;
  border-radius: 0;
  vertical-align: top;
}
.slot-progress :deep(.ant-progress-bg) { vertical-align: top; }

.slot-header { margin-bottom: 6px; }

.slot-selectors {
  display: flex;
  align-items: center;
  gap: 6px;
}

.provider-select {
  flex: 1;
  min-width: 90px;
}
.provider-select :deep(.ant-select-selector) { height: 26px !important; font-size: 14px; }
.provider-select :deep(.ant-select-selection-item) { line-height: 24px !important; }

.model-select-wrapper {
  flex: 2;
  display: flex;
  align-items: center;
  gap: 2px;
}
.model-select { flex: 1; }
.model-select :deep(.ant-select-selector),
.model-select :deep(.ant-input) {
  height: 26px !important;
  font-size: 14px;
  line-height: 24px !important;
}
.model-select :deep(.ant-select-selection-search-input) { height: 24px !important; }
.model-select :deep(.ant-select-item-option-active),
.model-select :deep(.ant-select-item-option-selected) { border-radius: 4px; }

.slot-system-prompt { margin-bottom: 6px; }
.slot-system-prompt :deep(.ant-input) {
  padding: 4px 8px;
  font-size: 14px;
  line-height: 1.4;
}

.section-label {
  display: block;
  margin-bottom: 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

/* System Prompt 编辑器固定为 1/2 屏幕高度 */
.system-prompt-editor {
  height: 60vh;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
.system-prompt-editor :deep(.cm-editor) { height: 100%; font-size: 14px; }
.system-prompt-editor :deep(.cm-scroller) { overflow: auto; }
.system-prompt-editor :deep(.cm-content) { padding: 8px; }

.slot-actions {
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-color);
}
.slot-actions :deep(.ant-btn) {
  height: 26px;
  padding: 0 8px;
  font-size: 14px;
}
.slot-actions :deep(.ant-btn-icon-only) {
  width: 26px;
  height: 26px;
  padding: 0;
}

.slot-output { min-height: 40px; }
</style>
