<script setup lang="ts">
import { ref, watch, computed } from 'vue';
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

// 工具定义
const localDefinition = ref(props.toolsDefinition);
const definitionError = ref<string | null>(null);

// 工具配置（JSON 格式）
const localRegistryJson = ref('');
const registryError = ref<string | null>(null);

// 激活的面板
const activeKeys = ref<string[]>(['definition']);

// 主题检测
const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark');

// 验证工具定义
const parseResult = computed(() => parseToolsDefinition(localDefinition.value));
const isValidDefinition = computed(() => !parseResult.value.error);

// 验证工具配置JSON
function validateRegistry(jsonStr: string): { valid: boolean; error?: string; data?: Record<string, ToolConfig> } {
  if (!jsonStr.trim()) {
    return { valid: true, data: {} };
  }

  try {
    const parsed = JSON.parse(jsonStr);
    
    // 必须是对象
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      return { valid: false, error: '工具配置必须是对象格式 { "toolName": {...} }' };
    }

    // 验证每个工具配置
    const errors: string[] = [];
    for (const [toolName, config] of Object.entries(parsed)) {
      if (typeof config !== 'object' || config === null) {
        errors.push(`工具 "${toolName}" 的配置必须是对象`);
        continue;
      }

      const tc = config as any;

      // 必需字段
      if (!tc.name || typeof tc.name !== 'string') {
        errors.push(`工具 "${toolName}" 缺少必需字段 "name" (string)`);
      }
      if (!tc.url || typeof tc.url !== 'string') {
        errors.push(`工具 "${toolName}" 缺少必需字段 "url" (string)`);
      }
      if (!tc.method || typeof tc.method !== 'string') {
        errors.push(`工具 "${toolName}" 缺少必需字段 "method" (string)`);
      }

      // 验证 method
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      if (tc.method && !validMethods.includes(tc.method)) {
        errors.push(`工具 "${toolName}" 的 method 必须是 ${validMethods.join('|')} 之一`);
      }

      // 可选字段类型检查
      if (tc.description !== undefined && typeof tc.description !== 'string') {
        errors.push(`工具 "${toolName}" 的 "description" 必须是字符串`);
      }
      if (tc.responsePath !== undefined && typeof tc.responsePath !== 'string') {
        errors.push(`工具 "${toolName}" 的 "responsePath" 必须是字符串`);
      }
      if (tc.bodyType !== undefined && !['json', 'form', 'query'].includes(tc.bodyType)) {
        errors.push(`工具 "${toolName}" 的 "bodyType" 必须是 json|form|query 之一`);
      }
      if (tc.paramMapping !== undefined) {
        if (typeof tc.paramMapping !== 'object' || Array.isArray(tc.paramMapping)) {
          errors.push(`工具 "${toolName}" 的 "paramMapping" 必须是对象`);
        }
      }
      if (tc.headers !== undefined) {
        if (typeof tc.headers !== 'object' || Array.isArray(tc.headers)) {
          errors.push(`工具 "${toolName}" 的 "headers" 必须是对象`);
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, error: errors.join('\n') };
    }

    return { valid: true, data: parsed as Record<string, ToolConfig> };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'JSON 解析失败' };
  }
}

// CodeMirror linter for tool registry
function toolRegistryLinter(view: any): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const content = view.state.doc.toString();
  
  const result = validateRegistry(content);
  if (!result.valid && result.error) {
    diagnostics.push({
      from: 0,
      to: content.length,
      severity: 'error',
      message: result.error,
    });
  }

  return diagnostics;
}

// CodeMirror extensions for registry editor
const registryExtensions = computed<Extension[]>(() => {
  const base: Extension[] = [
    EditorView.lineWrapping,
    json(),
    linter(toolRegistryLinter),
  ];
  
  if (isDark.value) {
    base.push(oneDark);
  }
  
  return base;
});

// CodeMirror extensions for definition editor
const definitionExtensions = computed<Extension[]>(() => {
  const base: Extension[] = [
    EditorView.lineWrapping,
    json(),
    linter(jsonParseLinter()),
  ];
  
  if (isDark.value) {
    base.push(oneDark);
  }
  
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
  // 验证定义
  const defResult = parseToolsDefinition(localDefinition.value);
  if (defResult.error) {
    definitionError.value = defResult.error;
    message.error('工具定义验证失败');
    return;
  }

  // 验证配置
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

// 添加示例工具
function addExampleTool() {
  const exampleConfig: ToolConfig = {
    name: 'get_car_price',
    description: '查询车辆价格信息',
    url: 'https://v2.xxapi.cn/api/carprice',
    method: 'GET',
    paramMapping: {
      search: 'search',
    },
    responsePath: 'data',
  };

  const exampleDefinition = {
    type: 'function',
    function: {
      name: 'get_car_price',
      description: '查询指定车型的价格信息，包括官方售价和经销商报价',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: '车型名称，例如：奥迪A6L、宝马5系、特斯拉Model 3',
          },
        },
        required: ['search'],
      },
    },
  };

  // 添加到配置
  try {
    const registry = localRegistryJson.value.trim() 
      ? JSON.parse(localRegistryJson.value) 
      : {};
    
    if (registry.get_car_price) {
      message.warning('示例工具已存在');
      return;
    }

    registry.get_car_price = exampleConfig;
    localRegistryJson.value = JSON.stringify(registry, null, 2);
    validateRegistryJson(localRegistryJson.value);
  } catch (err) {
    message.error('添加到配置失败');
    return;
  }

  // 添加到定义
  try {
    const parsed = localDefinition.value.trim() ? JSON.parse(localDefinition.value) : [];
    const tools = Array.isArray(parsed) ? parsed : [];
    
    if (tools.some((t: any) => t.function?.name === 'get_car_price')) {
      message.success('示例工具配置已添加（定义已存在）');
      return;
    }
    
    tools.push(exampleDefinition);
    localDefinition.value = JSON.stringify(tools, null, 2);
    validateDefinition(localDefinition.value);
    message.success('示例工具已添加');
  } catch (err) {
    message.error('添加示例工具失败');
  }
}

// 复制配置
function handleCopyRegistry() {
  if (!localRegistryJson.value.trim()) {
    message.warning('配置为空');
    return;
  }

  navigator.clipboard.writeText(localRegistryJson.value).then(() => {
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
    EditorView.editable.of(false), // 只读
  ];
  
  if (isDark.value) {
    base.push(oneDark);
  }
  
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
              <Button size="small" @click="handleFormatDefinition">格式化</Button>
              <Button size="small" type="primary" @click="addExampleTool">
                <template #icon><PlusOutlined /></template>
                添加示例工具
              </Button>
            </Space>

            <div class="editor-wrapper">
              <Codemirror
                :model-value="localDefinition"
                :extensions="definitionExtensions"
                placeholder='[{"type":"function","function":{"name":"example"}}]'
                :indent-with-tab="true"
                :tab-size="2"
                :style="{ height: '100%' }"
                @update:modelValue="handleDefinitionChange"
              />
            </div>

            <Alert
              v-if="definitionError"
              :message="definitionError"
              type="error"
              show-icon
              style="margin-top: 12px"
            />
            <Alert
              v-else-if="isValidDefinition && localDefinition.trim()"
              message="工具定义有效"
              type="success"
              show-icon
              style="margin-top: 12px"
            />
          </div>
        </Collapse.Panel>

        <!-- 工具配置 -->
        <Collapse.Panel key="config" class="drawer-panel">
          <template #header>
            <Space>
              <ThunderboltOutlined />
              <span class="panel-title">工具配置（执行器 - JSON）</span>
              <Tag v-if="!registryError" color="blue">
                {{ Object.keys(validateRegistry(localRegistryJson).data || {}).length }} 个工具
              </Tag>
            </Space>
          </template>

          <div class="panel-content">
            <div class="help-text">
              配置工具的实际执行逻辑（HTTP API 调用）。请使用 JSON 对象格式。
            </div>

            <Space style="margin-bottom: 12px" wrap>
              <Button size="small" @click="handleFormatRegistry">格式化</Button>
              <Button size="small" @click="showConfigTemplate">查看模板</Button>
              <Button size="small" @click="handleCopyRegistry">
                <template #icon><CopyOutlined /></template>
                复制配置
              </Button>
            </Space>

            <div class="editor-wrapper large">
              <Codemirror
                :model-value="localRegistryJson"
                :extensions="registryExtensions"
                placeholder='{"tool_name": {"name": "tool_name", "url": "...", "method": "GET"}}'
                :indent-with-tab="true"
                :tab-size="2"
                :style="{ height: '100%' }"
                @update:modelValue="handleRegistryChange"
              />
            </div>

            <Alert
              v-if="registryError"
              :message="registryError"
              type="error"
              show-icon
              style="margin-top: 12px; white-space: pre-wrap"
            />
            <Alert
              v-else-if="localRegistryJson.trim()"
              message="工具配置有效"
              type="success"
              show-icon
              style="margin-top: 12px"
            />
          </div>
        </Collapse.Panel>
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
.tools-drawer :deep(.ant-drawer-body) {
  padding: 0;
}

.drawer-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.drawer-panel {
  background: transparent;
}

.drawer-panel :deep(.ant-collapse-header) {
  padding: 16px 24px !important;
  background: var(--bg-secondary, #fafafa);
  font-weight: 500;
}

.drawer-panel :deep(.ant-collapse-content-box) {
  padding: 16px 24px;
}

.panel-title {
  font-size: 14px;
  font-weight: 500;
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.help-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.editor-wrapper {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  height: 300px;
}

.editor-wrapper.large {
  height: 400px;
}

.editor-wrapper :deep(.cm-editor) {
  height: 100%;
  font-size: 12px;
}

.editor-wrapper :deep(.cm-scroller) {
  overflow: auto !important;
}

.editor-wrapper :deep(.cm-gutters) {
  background-color: var(--bg-secondary, #f5f5f5);
  border-right: 1px solid var(--border-color);
}

.editor-wrapper :deep(.cm-diagnostic-error) {
  border-left: 3px solid #ff4d4f;
}

.drawer-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}

/* 暗色主题 */
[data-theme="dark"] .drawer-panel :deep(.ant-collapse-header) {
  background: var(--bg-secondary, #1a1a1a);
}

[data-theme="dark"] .editor-wrapper :deep(.cm-gutters) {
  background-color: var(--bg-secondary, #1a1a1a);
}

/* 模板Modal样式 */
.template-modal-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.template-description h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
}

.template-description ul {
  margin: 0;
  padding-left: 20px;
  list-style: none;
}

.template-description li {
  margin: 6px 0;
  font-size: 13px;
  line-height: 1.6;
}

.template-description code {
  background: var(--bg-secondary, #f5f5f5);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
}

.template-editor {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.template-editor :deep(.cm-editor) {
  font-size: 12px;
}

.template-actions {
  display: flex;
  justify-content: flex-end;
}

[data-theme="dark"] .template-description code {
  background: var(--bg-secondary, #1a1a1a);
  color: var(--text-primary);
}
</style>
