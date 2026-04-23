<script setup lang="ts">
/**
 * GlobalParamsModal - 全局默认参数配置弹窗
 * 配置所有 Slot 的默认参数（temperature, top_p, max_tokens, thinking 等）
 */
import { ref, watch, computed } from 'vue';
import { Modal, Form, InputNumber, Switch, Button, Tooltip, Divider } from 'ant-design-vue';
import { InfoCircleOutlined, BulbOutlined } from '@ant-design/icons-vue';
import type { SharedState, ThinkingConfig } from '../../types';

const props = defineProps<{
  open: boolean;
  defaultParams: SharedState['defaultParams'];
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  save: [params: SharedState['defaultParams']];
}>();

// 本地表单状态
const localParams = ref<{
  temperature: number;
  top_p: number;
  max_tokens: number;
  stream: boolean;
  thinking_enabled: boolean;
  thinking_budget_tokens: number;
  thinking_force_send: boolean;
}>({
  temperature: 0.7,
  top_p: 1,
  max_tokens: 8192,
  stream: true,
  thinking_enabled: false,
  thinking_budget_tokens: 10000,
  thinking_force_send: false
});

// 监听 props 变化，初始化本地状态
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    localParams.value = {
      temperature: props.defaultParams.temperature,
      top_p: props.defaultParams.top_p,
      max_tokens: props.defaultParams.max_tokens,
      stream: props.defaultParams.stream ?? true,
      thinking_enabled: props.defaultParams.thinking?.enabled ?? false,
      thinking_budget_tokens: props.defaultParams.thinking?.budget_tokens ?? 10000,
      thinking_force_send: props.defaultParams.thinking?.force_send ?? false
    };
  }
}, { immediate: true });

// 关闭弹窗
function handleClose() {
  emit('update:open', false);
}

// 保存参数
function handleSave() {
  const params: SharedState['defaultParams'] = {
    temperature: localParams.value.temperature,
    top_p: localParams.value.top_p,
    max_tokens: localParams.value.max_tokens,
    stream: localParams.value.stream
  };
  
  // 添加 thinking 配置
  if (localParams.value.thinking_enabled) {
    params.thinking = {
      enabled: true,
      budget_tokens: localParams.value.thinking_budget_tokens,
      force_send: localParams.value.thinking_force_send
    };
  } else {
    params.thinking = {
      enabled: false,
      force_send: localParams.value.thinking_force_send
    };
  }
  
  emit('save', params);
  handleClose();
}

// 重置为默认值
function resetToDefaults() {
  localParams.value = {
    temperature: 0.7,
    top_p: 1,
    max_tokens: 8192,
    stream: true,
    thinking_enabled: false,
    thinking_budget_tokens: 10000,
    thinking_force_send: false
  };
}
</script>

<template>
  <Modal
    :open="props.open"
    title="全局默认参数"
    :width="460"
    @cancel="handleClose"
    @ok="handleSave"
  >
    <div class="params-modal-content">
      <div class="params-hint">
        <InfoCircleOutlined />
        <span>这些参数将作为所有 Slot 的默认值。单个 Slot 可以覆盖这些设置。</span>
      </div>

      <Form layout="vertical" class="params-form">
        <!-- Temperature -->
        <Form.Item label="Temperature">
          <InputNumber
            v-model:value="localParams.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            class="param-input"
          />
        </Form.Item>

        <!-- Top P -->
        <Form.Item label="Top P">
          <InputNumber
            v-model:value="localParams.top_p"
            :min="0"
            :max="1"
            :step="0.05"
            class="param-input"
          />
        </Form.Item>

        <!-- Max Tokens -->
        <Form.Item label="Max Tokens">
          <InputNumber
            v-model:value="localParams.max_tokens"
            :min="1"
            :max="128000"
            :step="100"
            class="param-input"
          />
        </Form.Item>

        <!-- Stream 流式输出 -->
        <Form.Item label="流式输出">
          <Switch
            v-model:checked="localParams.stream"
            checked-children="开"
            un-checked-children="关"
          />
          <div class="param-help">启用后实时显示模型输出，关闭则等待完整响应</div>
        </Form.Item>

        <!-- Thinking 深度思考配置 -->
        <Divider style="margin: 12px 0">
          <span class="divider-text">
            <BulbOutlined /> 深度思考 (Extended Thinking)
          </span>
        </Divider>

        <div class="thinking-hint">
          <span>启用后，支持的模型（如 Claude 3.5+、DeepSeek）将输出思考过程。</span>
        </div>

        <Form.Item label="启用深度思考">
          <Switch
            v-model:checked="localParams.thinking_enabled"
            checked-children="开"
            un-checked-children="关"
          />
        </Form.Item>

        <Form.Item v-if="localParams.thinking_enabled" label="思考 Token 预算">
          <InputNumber
            v-model:value="localParams.thinking_budget_tokens"
            :min="1024"
            :max="100000"
            :step="1000"
            class="param-input"
          />
          <div class="param-help">建议值：10000-50000，更大的预算允许更深入的思考</div>
        </Form.Item>

        <Form.Item v-if="!localParams.thinking_enabled" label="强制发送参数">
          <Switch
            v-model:checked="localParams.thinking_force_send"
            checked-children="开"
            un-checked-children="关"
          />
          <div class="param-help">GPT 模型默认不发送 thinking 参数。开启后将强制发送 thinking: false（某些 API 可能需要）</div>
        </Form.Item>
      </Form>

      <!-- 重置按钮 -->
      <div class="reset-row">
        <Button type="link" size="small" @click="resetToDefaults">
          重置为默认值
        </Button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.params-modal-content { padding: 8px 0; }

.params-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 16px;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.thinking-hint {
  padding: 6px 10px;
  margin-bottom: 12px;
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}

.divider-text {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.params-form { margin-bottom: 8px; }
.params-form :deep(.ant-form-item) { margin-bottom: 12px; }

.param-input { width: 100%; }

.param-help {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.reset-row {
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  text-align: right;
}
</style>
