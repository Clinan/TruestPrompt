<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Drawer, Button, Space, Alert, Collapse, Tag, message, Modal } from 'ant-design-vue';
import {
  PlusOutlined,
  ThunderboltOutlined,
  CopyOutlined,
} from '@ant-design/icons-vue';
import { Codemirror } from 'vue-codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, type Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { parseToolsDefinition } from '../../domain/tools';
import type { ToolConfig } from '../../../../lib/toolExecutor';
import { validateRegistry, toolRegistryLinter } from '../tool-config/toolConfigValidation';
import ToolDefinitionPanel from '../tool-config/ToolDefinitionPanel.vue';
import ToolConfigPanel from '../tool-config/ToolConfigPanel.vue';

const props = defineProps<{
  open: boolean;
  toolsDefinition: string;
  toolRegistry: Record<string, ToolConfig>;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  saveDefinition: [string];
  saveRegistry: [Record<string, ToolConfig>];
}>();

// 激活的面板
const activeKeys = ref<string[]>(['definition']);

// 主题检测
const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark');

// 工具定义
const localDefinition = ref(props.toolsDefinition);
const definitionError = ref<string | null>(null);

// 工具配置
const localRegistryJson = ref('');
const registryError = ref<string | null>(null);

// 验证工具定义
const parseResult = computed(() => parseToolsDefinition(localDefinition.value));
const isValidDefinition = computed(() => !parseResult.value.error);

// CodeMirror extensions for definition editor
const definitionExtensions = computed<Extension[]>(() => {
  const base: Extension[] = [
    EditorView.lineWrapping,
    json(),
    linter(jsonParseLinter()),
  ];
  if (isDark.value) base.push(oneDark);
  return base;
});

// CodeMirror extensions for registry editor
const registryExtensions = computed<Extension[]>(() => {
  const base: Extension[] = [
    EditorView.lineWrapping,
    json(),
    linter(toolRegistryLinter),
  ];
  if (isDark.value) base.push(oneDark);
  return base;
});

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    localDefinition.value = props.toolsDefinition;
    localRegistryJson.value = JSON.stringify(props.toolRegistry, null, 2);
    definitionError.value = null;
    registryError.value = null;
    validateDefinition(localDefinition.value);
    validateRegistryJson(localRegistryJson.value);
  }
});

function validateDefinition(value: string) {
  const result = parseToolsDefinition(value);
  definitionError.value = result.error || null;
}

function validateRegistryJson(value: string) {
  const result = validateRegistry(value);
  registryError.value = result.valid ? null : (result.error || null);
}

function handleFormatDefinition() {
  const raw = localDefinition.value.trim();
  if (!raw) {
    definitionError.value = null;
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    localDefinition.value = JSON.stringify(parsed, null, 2);
    validateDefinition(localDefinition.value);
    message.success('格式化成功');
  } catch (e) {
    definitionError.value = e instanceof Error ? e.message : '无效的 JSON 格式';
  }
}

function handleFormatRegistry() {
  const raw = localRegistryJson.value.trim();
  if (!raw) {
    registryError.value = null;
    localRegistryJson.value = '{}';
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    localRegistryJson.value = JSON.stringify(parsed, null, 2);
    validateRegistryJson(localRegistryJson.value);
    message.success('格式化成功');
  } catch (e) {
    message.error(e instanceof Error ? e.message : '无效的 JSON 格式');
  }
}

function handleSave() {
  const defResult = parseToolsDefinition(localDefinition.value);
  if (defResult.error) {
    definitionError.value = defResult.error;
    message.error('工具定义验证失败');
    return;
  }

  const regResult = validateRegistry(localRegistryJson.value);
  if (!regResult.valid) {
    registryError.value = regResult.error || '配置验证失败';
    message.error('工具配置验证失败');
    return;
  }

  emit('saveDefinition', localDefinition.value);
  emit('saveRegistry', regResult.data || {});
  emit('update:open', false);
  message.success('保存成功');
}

function handleCancel() {
  emit('update:open', false);
}

function handleDefinitionChange(value: string) {
  localDefinition.value = value;
  validateDefinition(value);
}

function handleRegistryChange(value: string) {
  localRegistryJson.value = value;
  validateRegistryJson(value);
}
</script>

<template>
  <Drawer
    :open="props.open"
    title="工具配置"
    placement="right"
    :width="680"
    @close="handleCancel"
    class="tools-drawer"
  >
    <div class="drawer-content">
      <Collapse v-model:activeKey="activeKeys" :bordered="false">
        <!-- 工具定义 -->
        <ToolDefinitionPanel
          :local-definition="localDefinition"
          :definition-error="definitionError"
          :is-valid-definition="isValidDefinition"
          :definition-extensions="definitionExtensions"
          @format="handleFormatDefinition"
          @change="handleDefinitionChange"
        />

        <!-- 工具配置 -->
        <ToolConfigPanel
          :local-registry-json="localRegistryJson"
          :registry-error="registryError"
          :registry-extensions="registryExtensions"
          @format="handleFormatRegistry"
          @change="handleRegistryChange"
        />
      </Collapse>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <Space>
          <Button @click="handleCancel">取消</Button>
          <Button type="primary" @click="handleSave">保存</Button>
        </Space>
      </div>
    </template>
  </Drawer>
</template>

<style scoped>
.tools-drawer :deep(.ant-drawer-body) {
  padding: 0;
}

.drawer-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.drawer-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}
</style>