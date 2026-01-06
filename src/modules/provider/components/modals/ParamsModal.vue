<script setup lang="ts">
/**
 * ParamsModal - Slot 自定义参数配置弹窗
 * 允许用户为单个 Slot 覆盖默认参数（temperature, top_p, max_tokens, thinking 等）
 */
import { ref, watch, computed } from 'vue';
import { Modal, Form, InputNumber, Switch, Button, Tooltip, Divider } from 'ant-design-vue';
import { InfoCircleOutlined, UndoOutlined, BulbOutlined } from '@ant-design/icons-vue';
import type { SharedState, ThinkingConfig } from '../../../../core/types';

const props = defineProps<{
  open: boolean;
  paramOverride: Record<string, unknown> | null;
  defaultParams: SharedState['defaultParams'];
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  save: [params: Record<string, unknown> | null];
}>();

// 本地表单状态
const localParams = ref<{
  temperature: number | undefined;
  top_p: number | undefined;
  max_tokens: number | undefined;
  stream: boolean | undefined;
  thinking_enabled: boolean | undefined;
  thinking_budget_tokens: number | undefined;
  thinking_force_send: boolean | undefined;
  useCustom: boolean;
}>({
  temperature: undefined,
  top_p: undefined,
  max_tokens: undefined,
  stream: undefined,
  thinking_enabled: undefined,
  thinking_budget_tokens: undefined,
  thinking_force_send: undefined,
  useCustom: false
});

// 监听 props 变化，初始化本地状态
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    if (props.paramOverride) {
      const thinking = props.paramOverride.thinking as ThinkingConfig | undefined;
      localParams.value = {
        temperature: props.paramOverride.temperature as number | undefined,
        top_p: props.paramOverride.top_p as number | undefined,
        max_tokens: props.paramOverride.max_tokens as number | undefined,
        stream: props.paramOverride.stream as boolean | undefined,
        thinking_enabled: thinking?.enabled,
        thinking_budget_tokens: thinking?.budget_tokens,
        thinking_force_send: thinking?.force_send,
        useCustom: true
      };
    } else {
      localParams.value = {
        temperature: undefined,
        top_p: undefined,
        max_tokens: undefined,
        stream: undefined,
        thinking_enabled: undefined,
        thinking_budget_tokens: undefined,
        thinking_force_send: undefined,
        useCustom: false
      };
    }
  }
}, { immediate: true });

// 默认 thinking 配置
const defaultThinking = computed(() => props.defaultParams.thinking);

// 是否有自定义值
const hasCustomValues = computed(() => {
  return localParams.value.temperature !== undefined ||
         localParams.value.top_p !== undefined ||
         localParams.value.max_tokens !== undefined ||
         localParams.value.stream !== undefined ||
         localParams.value.thinking_enabled !== undefined ||
         localParams.value.thinking_budget_tokens !== undefined ||
         localParams.value.thinking_force_send !== undefined;
});

// 重置单个参数为默认值
function resetParam(key: 'temperature' | 'top_p' | 'max_tokens') {
  localParams.value[key] = undefined;
}

// 重置 thinking 参数
function resetThinking() {
  localParams.value.thinking_enabled = undefined;
  localParams.value.thinking_budget_tokens = undefined;
  localParams.value.thinking_force_send = undefined;
}

// 重置所有参数
function resetAll() {
  localParams.value = {
    temperature: undefined,
    top_p: undefined,
    max_tokens: undefined,
    stream: undefined,
    thinking_enabled: undefined,
    thinking_budget_tokens: undefined,
    thinking_force_send: undefined,
    useCustom: false
  };
}

// 关闭弹窗
function handleClose() {
  emit('update:open', false);
}

// Tooltip 容器获取函数
const getTooltipContainer = (node: HTMLElement) => node.parentElement || document.body;

// 保存参数
function handleSave() {
  if (!hasCustomValues.value) {
    emit('save', null);
  } else {
    const override: Record<string, unknown> = {};
    if (localParams.value.temperature !== undefined) {
      override.temperature = localParams.value.temperature;
    }
    if (localParams.value.top_p !== undefined) {
      override.top_p = localParams.value.top_p;
    }
    if (localParams.value.max_tokens !== undefined) {
      override.max_tokens = localParams.value.max_tokens;
    }
    if (localParams.value.stream !== undefined) {
      override.stream = localParams.value.stream;
    }
    // 构建 thinking 配置
    if (localParams.value.thinking_enabled !== undefined || localParams.value.thinking_budget_tokens !== undefined || localParams.value.thinking_force_send !== undefined) {
      const thinking: ThinkingConfig = {
        enabled: localParams.value.thinking_enabled ?? defaultThinking.value?.enabled ?? false
      };
      if (localParams.value.thinking_budget_tokens !== undefined) {
        thinking.budget_tokens = localParams.value.thinking_budget_tokens;
      }
      if (localParams.value.thinking_force_send !== undefined) {
        thinking.force_send = localParams.value.thinking_force_send;
      }
      override.thinking = thinking;
    }
    emit('save', override);
  }
  handleClose();
}
</script>

<template>
  <Modal
    :open="props.open"
    title="Slot 参数配置"
    :width="460"
    @cancel="handleClose"
    @ok="handleSave"
  >
    <div class="params-modal-content">
      <div class="params-hint">
        <InfoCircleOutlined />
        <span>自定义参数将覆盖全局默认值。留空则使用默认值。</span>
      </div>

      <Form layout="vertical" class="params-form">
        <!-- Temperature -->
        <Form.Item label="Temperature">
          <div class="param-input-row">
            <InputNumber
              v-model:value="localParams.temperature"
              :min="0"
              :max="2"
              :step="0.1"
              :placeholder="String(props.defaultParams.temperature)"
              class="param-input"
            />
            <Tooltip title="重置为默认值" :get-popup-container="getTooltipContainer">
              <Button 
                type="text" 
                size="small"
                :disabled="localParams.temperature === undefined"
                @click="resetParam('temperature')"
              >
                <template #icon><UndoOutlined /></template>
              </Button>
            </Tooltip>
          </div>
        </Form.Item>

        <!-- Top P -->
        <Form.Item label="Top P">
          <div class="param-input-row">
            <InputNumber
              v-model:value="localParams.top_p"
              :min="0"
              :max="1"
              :step="0.05"
              :placeholder="String(props.defaultParams.top_p)"
              class="param-input"
            />
            <Tooltip title="重置为默认值" :get-popup-container="getTooltipContainer">
              <Button 
                type="text" 
                size="small"
                :disabled="localParams.top_p === undefined"
                @click="resetParam('top_p')"
              >
                <template #icon><UndoOutlined /></template>
              </Button>
            </Tooltip>
          </div>
        </Form.Item>

        <!-- Max Tokens -->
        <Form.Item label="Max Tokens">
          <div class="param-input-row">
            <InputNumber
              v-model:value="localParams.max_tokens"
              :min="1"
              :max="128000"
              :step="100"
              :placeholder="String(props.defaultParams.max_tokens)"
              class="param-input"
            />
            <Tooltip title="重置为默认值" :get-popup-container="getTooltipContainer">
              <Button 
                type="text" 
                size="small"
                :disabled="localParams.max_tokens === undefined"
                @click="resetParam('max_tokens')"
              >
                <template #icon><UndoOutlined /></template>
              </Button>
            </Tooltip>
          </div>
        </Form.Item>

        <!-- Stream 流式输出 -->
        <Form.Item label="流式输出">
          <div class="param-input-row">
            <Switch
              :checked="localParams.stream ?? (props.defaultParams.stream ?? true)"
              checked-children="开"
              un-checked-children="关"
              @change="(val) => localParams.stream = Boolean(val)"
            />
            <Tooltip title="重置为默认值" :get-popup-container="getTooltipContainer">
              <Button 
                type="text" 
                size="small"
                :disabled="localParams.stream === undefined"
                @click="localParams.stream = undefined"
              >
                <template #icon><UndoOutlined /></template>
              </Button>
            </Tooltip>
          </div>
        </Form.Item>

        <!-- Thinking 深度思考配置 -->
        <Divider style="margin: 12px 0">
          <span class="divider-text">
            <BulbOutlined /> 深度思考 (Extended Thinking)
          </span>
        </Divider>

        <div class="thinking-hint">
          <span>启用后，支持的模型（如 Claude 3.5+）将输出思考过程。</span>
        </div>

        <Form.Item label="启用深度思考">
          <div class="param-input-row">
            <Switch
              :checked="localParams.thinking_enabled ?? (defaultThinking?.enabled ?? false)"
              checked-children="开"
              un-checked-children="关"
              @change="(val) => localParams.thinking_enabled = Boolean(val)"
            />
            <Tooltip title="重置为默认值" :get-popup-container="getTooltipContainer">
              <Button 
                type="text" 
                size="small"
                :disabled="localParams.thinking_enabled === undefined && localParams.thinking_budget_tokens === undefined"
                @click="resetThinking"
              >
                <template #icon><UndoOutlined /></template>
              </Button>
            </Tooltip>
          </div>
        </Form.Item>

        <Form.Item v-if="localParams.thinking_enabled || (localParams.thinking_enabled === undefined && defaultThinking?.enabled)" label="思考 Token 预算">
          <div class="param-input-row">
            <InputNumber
              v-model:value="localParams.thinking_budget_tokens"
              :min="1024"
              :max="100000"
              :step="1000"
              :placeholder="String(defaultThinking?.budget_tokens ?? 10000)"
              class="param-input"
            />
          </div>
        </Form.Item>

        <Form.Item v-if="!(localParams.thinking_enabled || (localParams.thinking_enabled === undefined && defaultThinking?.enabled))" label="强制发送参数">
          <div class="param-input-row">
            <Switch
              :checked="localParams.thinking_force_send ?? (defaultThinking?.force_send ?? false)"
              checked-children="开"
              un-checked-children="关"
              @change="(val) => localParams.thinking_force_send = Boolean(val)"
            />
          </div>
          <div class="param-help">GPT 模型默认不发送 thinking 参数。开启后将强制发送 thinking: false</div>
        </Form.Item>
      </Form>

      <!-- 重置所有按钮 -->
      <div class="reset-all-row">
        <Button 
          type="link" 
          size="small"
          :disabled="!hasCustomValues"
          @click="resetAll"
        >
          重置所有为默认值
        </Button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.params-modal-content {
  padding: 8px 0;
}

.params-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.thinking-hint {
  padding: 6px 10px;
  background: var(--warning-bg, #fffbe6);
  border: 1px solid var(--warning-border, #ffe58f);
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 11px;
  color: var(--text-secondary, #666);
}

.divider-text {
  font-size: 12px;
  color: var(--text-secondary, #666);
  display: flex;
  align-items: center;
  gap: 4px;
}

.params-form {
  margin-bottom: 8px;
}

.params-form :deep(.ant-form-item) {
  margin-bottom: 12px;
}

.param-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-input {
  flex: 1;
}

.reset-all-row {
  text-align: right;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #e8e8e8);
}
</style>
