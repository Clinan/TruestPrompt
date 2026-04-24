<script setup lang="ts">
import { Collapse, Space, Button, Alert, Tag, message, Modal } from 'ant-design-vue';
import {
  ThunderboltOutlined,
  CopyOutlined,
} from '@ant-design/icons-vue';
import { Codemirror } from 'vue-codemirror';
import { json } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { computed, ref } from 'vue';
import type { Extension } from '@codemirror/state';
import type { ToolConfig } from '../../../../lib/toolExecutor';
import { validateRegistry } from './toolConfigValidation';

const props = defineProps<{
  localRegistryJson: string;
  registryError: string | null;
  registryExtensions: Extension[];
}>();

const emit = defineEmits<{
  format: [];
  change: [value: string];
}>();

// 主题检测
const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark');

// 复制配置
function handleCopyRegistry() {
  if (!props.localRegistryJson.trim()) {
    message.warning('配置为空');
    return;
  }
  navigator.clipboard.writeText(props.localRegistryJson).then(() => {
    message.success('已复制到剪贴板');
  }).catch(() => {
    message.error('复制失败');
  });
}

// 查看配置模板
const showTemplateModal = ref(false);
const templateJson = `{
  "tool_name": {
    "name": "tool_name",
    "description": "工具描述",
    "url": "https://api.example.com/endpoint",
    "method": "GET",
    "paramMapping": {
      "modelParam": "apiParam"
    },
    "headers": {
      "Authorization": "Bearer token"
    },
    "bodyType": "json",
    "responsePath": "data.result"
  }
}`;

const templateExtensions = computed<Extension[]>(() => {
  const base: Extension[] = [
    EditorView.lineWrapping,
    json(),
    EditorView.editable.of(false),
  ];
  if (isDark.value) base.push(oneDark);
  return base;
});

function showConfigTemplate() {
  showTemplateModal.value = true;
}

function handleCopyTemplate() {
  navigator.clipboard.writeText(templateJson).then(() => {
    message.success('模板已复制到剪贴板');
  }).catch(() => {
    message.error('复制失败');
  });
}
</script>

<template>
  <Collapse.Panel key="config" class="drawer-panel">
    <template #header>
      <Space>
        <ThunderboltOutlined />
        <span class="panel-title">工具配置（执行器 - JSON）</span>
        <Tag v-if="!props.registryError" color="blue">
          {{ Object.keys(validateRegistry(props.localRegistryJson).data || {}).length }} 个工具
        </Tag>
      </Space>
    </template>

    <div class="panel-content">
      <div class="help-text">
        配置工具的实际执行逻辑（HTTP API 调用）。请使用 JSON 对象格式。
      </div>

      <Space style="margin-bottom: 12px" wrap>
        <Button size="small" @click="emit('format')">格式化</Button>
        <Button size="small" @click="showConfigTemplate">查看模板</Button>
        <Button size="small" @click="handleCopyRegistry">
          <template #icon><CopyOutlined /></template>
          复制配置
        </Button>
      </Space>

      <div class="editor-wrapper large">
        <Codemirror
          :model-value="props.localRegistryJson"
          :extensions="props.registryExtensions"
          placeholder='{"tool_name": {"name": "tool_name", "url": "...", "method": "GET"}}'
          :indent-with-tab="true"
          :tab-size="2"
          :style="{ height: '100%' }"
          @update:modelValue="(val: string) => emit('change', val)"
        />
      </div>

      <Alert
        v-if="props.registryError"
        :message="props.registryError"
        type="error"
        show-icon
        style="margin-top: 12px; white-space: pre-wrap"
      />
      <Alert
        v-else-if="props.localRegistryJson.trim()"
        message="工具配置有效"
        type="success"
        show-icon
        style="margin-top: 12px"
      />
    </div>
  </Collapse.Panel>

  <!-- 配置模板 Modal -->
  <Modal
    v-model:open="showTemplateModal"
    title="工具配置模板"
    :width="700"
    :footer="null"
  >
    <div class="template-modal-content">
      <div class="template-description">
        <h4>字段说明：</h4>
        <ul>
          <li><code>name</code>: 工具名称 <Tag color="red">必需</Tag></li>
          <li><code>url</code>: API地址 <Tag color="red">必需</Tag></li>
          <li><code>method</code>: HTTP方法 (GET|POST|PUT|DELETE|PATCH) <Tag color="red">必需</Tag></li>
          <li><code>description</code>: 工具描述 <Tag>可选</Tag></li>
          <li><code>paramMapping</code>: 参数映射 (对象) <Tag>可选</Tag></li>
          <li><code>headers</code>: 请求头 (对象) <Tag>可选</Tag></li>
          <li><code>bodyType</code>: 请求体类型 (json|form|query) <Tag>可选</Tag></li>
          <li><code>responsePath</code>: 响应数据路径 (字符串) <Tag>可选</Tag></li>
        </ul>
      </div>

      <div class="template-editor">
        <Codemirror
          :model-value="templateJson"
          :extensions="templateExtensions"
          :indent-with-tab="true"
          :tab-size="2"
          :style="{ height: '300px' }"
        />
      </div>

      <div class="template-actions">
        <Button type="primary" @click="handleCopyTemplate">
          <template #icon><CopyOutlined /></template>
          复制模板
        </Button>
      </div>
    </div>
  </Modal>
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
.editor-wrapper.large { height: 400px; }
.editor-wrapper :deep(.cm-editor) { height: 100%; font-size: 14px; }
.editor-wrapper :deep(.cm-scroller) { overflow: auto !important; }
.editor-wrapper :deep(.cm-gutters) {
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
}
.editor-wrapper :deep(.cm-diagnostic-error) { border-left: 3px solid var(--error-color); }

.template-modal-content { display: flex; flex-direction: column; gap: 16px; }
.template-description h4 { margin: 0 0 8px 0; font-size: 16px; font-weight: 600; }
.template-description ul { margin: 0; padding-left: 20px; list-style: none; }
.template-description li { margin: 6px 0; font-size: 15px; line-height: 1.6; }
.template-description code {
  padding: 2px 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
}
.template-editor {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
.template-editor :deep(.cm-editor) { font-size: 14px; }
.template-actions { display: flex; justify-content: flex-end; }
</style>