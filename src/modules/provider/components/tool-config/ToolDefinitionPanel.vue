<script setup lang="ts">
import { Collapse, Space, Button, Alert } from 'ant-design-vue';
import { ThunderboltOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { Codemirror } from 'vue-codemirror';
import type { Extension } from '@codemirror/state';

const props = defineProps<{
  localDefinition: string;
  definitionError: string | null;
  isValidDefinition: boolean;
  definitionExtensions: Extension[];
}>();

const emit = defineEmits<{
  format: [];
  change: [value: string];
}>();
</script>

<template>
  <Collapse.Panel key="definition" class="drawer-panel">
    <template #header>
      <Space>
        <ThunderboltOutlined />
        <span class="panel-title">工具定义（供 LLM 使用）</span>
      </Space>
    </template>

    <div class="panel-content">
      <div class="help-text">
        定义工具的 JSON Schema，供 AI 模型理解和调用。
      </div>

      <Space style="margin-bottom: 12px">
        <Button size="small" @click="emit('format')">格式化</Button>
      </Space>

      <div class="editor-wrapper">
        <Codemirror
          :model-value="props.localDefinition"
          :extensions="props.definitionExtensions"
          placeholder='[{"type":"function","function":{"name":"example"}}]'
          :indent-with-tab="true"
          :tab-size="2"
          :style="{ height: '100%' }"
          @update:modelValue="(val: string) => emit('change', val)"
        />
      </div>

      <Alert
        v-if="props.definitionError"
        :message="props.definitionError"
        type="error"
        show-icon
        style="margin-top: 12px"
      />
      <Alert
        v-else-if="props.isValidDefinition && props.localDefinition.trim()"
        message="工具定义有效"
        type="success"
        show-icon
        style="margin-top: 12px"
      />
    </div>
  </Collapse.Panel>
</template>

<style scoped>
.drawer-panel { background: transparent; }
.drawer-panel :deep(.ant-collapse-header) {
  padding: 16px 24px !important;
  background: var(--bg-secondary);
  font-weight: 500;
}
.drawer-panel :deep(.ant-collapse-content-box) { padding: 16px 24px; }
.panel-title { font-size: 14px; font-weight: 500; }
.panel-content { display: flex; flex-direction: column; gap: 12px; }
.help-text { font-size: 12px; line-height: 1.5; color: var(--text-secondary); }

.editor-wrapper {
  height: 300px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
.editor-wrapper :deep(.cm-editor) { height: 100%; font-size: 12px; }
.editor-wrapper :deep(.cm-scroller) { overflow: auto !important; }
.editor-wrapper :deep(.cm-gutters) {
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
}
.editor-wrapper :deep(.cm-diagnostic-error) { border-left: 3px solid var(--error-color); }
</style>