<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Modal, Space } from 'ant-design-vue';
import type { SharedState } from '../core/types';
import { newId } from '../core/utils/id';
import JsonEditor from './JsonEditor.vue';

const props = defineProps<{
  shared: SharedState;
  activeTab: 'parameters' | 'tools' | 'variables';
  showDiffOnly: boolean;
}>();

const emit = defineEmits<{
  'update:activeTab': ['parameters' | 'tools' | 'variables'];
  'update:showDiffOnly': [boolean];
}>();

const tabProxy = computed({
  get: () => props.activeTab,
  set: (val: 'parameters' | 'tools' | 'variables') => emit('update:activeTab', val)
});

const showDiffProxy = computed({
  get: () => props.showDiffOnly,
  set: (val: boolean) => emit('update:showDiffOnly', val)
});

const toolsError = ref<string | null>(null);
const toolsSuccess = ref<string | null>(null);
const showToolsModal = ref(false);
const lastNonToolsTab = ref<'parameters' | 'variables'>('parameters');

watch(
  () => props.activeTab,
  (tab) => {
    if (tab === 'tools') {
      showToolsModal.value = true;
    } else {
      lastNonToolsTab.value = tab;
      showToolsModal.value = false;
    }
  },
  { immediate: true }
);

function parseToolsDefinition() {
  const raw = props.shared.toolsDefinition?.trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray((parsed as any).tools)) {
    return (parsed as any).tools as unknown[];
  }
  throw new Error('JSON 应包含数组或 { tools: [] } 结构');
}

watch(
  () => props.shared.toolsDefinition,
  () => {
    toolsSuccess.value = null;
    toolsError.value = null;
  }
);

function formatTools() {
  try {
    const parsed = parseToolsDefinition();
    props.shared.toolsDefinition = JSON.stringify(parsed, null, 2);
    toolsError.value = null;
    toolsSuccess.value = `已格式化 ${parsed.length} 个工具定义`;
  } catch (err) {
    toolsError.value = err instanceof Error ? err.message : 'JSON 解析失败';
    toolsSuccess.value = null;
  }
}

function validateTools() {
  try {
    parseToolsDefinition();
    toolsError.value = null;
    toolsSuccess.value = 'JSON 校验通过';
  } catch (err) {
    toolsError.value = err instanceof Error ? err.message : 'JSON 解析失败';
    toolsSuccess.value = null;
  }
}

watch(
  () => props.shared.variables,
  (list) => {
    const isBlank = (item: { key: string; value: string }) => !item.key.trim() && !item.value.trim();
    const source = Array.isArray(list) ? list : [];
    const cleaned = source.filter((item, idx) => !isBlank(item) || idx === source.length - 1);
    if (!cleaned.length) {
      props.shared.variables = [createVariable()];
      return;
    }
    const last = cleaned[cleaned.length - 1]!;
    if (!isBlank(last)) {
      props.shared.variables = [...cleaned, createVariable()];
      return;
    }
    if (cleaned.length !== source.length) {
      props.shared.variables = cleaned;
    }
  },
  { deep: true, immediate: true }
);

function createVariable() {
  return {
    id: newId(),
    key: '',
    value: ''
  };
}

function closeToolsModal() {
  showToolsModal.value = false;
  if (tabProxy.value === 'tools') {
    tabProxy.value = lastNonToolsTab.value;
  }
}
</script>

<template>
  <aside class="context-panel__shell card">
    <div class="context-panel__head">
      <div class="panel-title">Context Panel</div>
      <div class="panel-subtitle">管理参数、工具、变量上下文。</div>
    </div>
    <div class="context-tabs">
      <button
        v-for="tab in ['parameters', 'tools', 'variables']"
        :key="tab"
        class="context-tab"
        :class="{ active: tabProxy === tab }"
        @click="tabProxy = tab as 'parameters' | 'tools' | 'variables'"
      >
        {{ tab === 'parameters' ? 'Parameters' : tab === 'tools' ? 'Tools' : 'Variables' }}
      </button>
    </div>

    <div v-if="tabProxy === 'parameters'" class="context-panel__body">
      <div class="param-banner">以下配置会同步应用到所有 Slots。</div>

      <div class="form-grid">
        <label>
          <span>temperature</span>
          <input type="number" step="0.1" v-model.number="props.shared.defaultParams.temperature" />
        </label>
        <label>
          <span>top_p</span>
          <input type="number" step="0.1" v-model.number="props.shared.defaultParams.top_p" />
        </label>
        <label>
          <span>max_tokens</span>
          <input type="number" v-model.number="props.shared.defaultParams.max_tokens" />
        </label>
      </div>

      <div class="param-flags">
        <label class="switch-row">
          <input type="checkbox" v-model="props.shared.enableSuggestions" />
          <span>启用联想建议</span>
        </label>
        <label class="switch-row">
          <input type="checkbox" v-model="props.shared.streamOutput" />
          <span>启用流式输出</span>
        </label>
        <label class="switch-row">
          <input type="checkbox" v-model="showDiffProxy" />
          <span>Show only diffs（仅展示不同参数）</span>
        </label>
      </div>
    </div>

    <div v-else-if="tabProxy === 'tools'" class="context-panel__body tools-tab">
      <div class="sidebar-empty">Tools 配置在弹窗中维护 JSON 数组，关闭后可返回此处。</div>
    </div>

    <div v-else class="context-panel__body">
      <div class="variables-head">
        <div>
          <div class="panel-subtitle">Variables</div>
          <div class="small-text">用于模板中的占位符</div>
          <div class="small-text">
            在 Prompt Composer 或 Slot 文本中使用 <code v-pre>{{ VARIABLE_NAME }}</code> 即可引用对应值。
          </div>
        </div>
      </div>
      <div class="variables-list">
        <div v-for="variable in props.shared.variables" :key="variable.id" class="variable-row">
          <input type="text" v-model="variable.key" placeholder="变量名，如 USER_NAME" />
          <input type="text" v-model="variable.value" placeholder="示例值" />
        </div>
      </div>
    </div>
  </aside>

  <Modal
    v-if="showToolsModal"
    :open="showToolsModal"
    title="Tools 配置"
    :width="960"
    :footer="null"
    :mask-closable="true"
    @cancel="closeToolsModal"
  >
    <Space direction="vertical" style="width: 100%" size="middle">
      <div>
        <div class="panel-subtitle">Tools JSON 数组</div>
        <div class="small-text">请直接维护工具定义数组，示例：[{"name":"fetchDocs","description":"..."}]</div>
      </div>
      <Space>
        <Button @click="formatTools">Format JSON</Button>
        <Button @click="validateTools">Validate JSON</Button>
      </Space>
      <div style="display: flex; flex-direction: column; gap: 12px; height: 60vh; min-height: 360px">
        <div style="flex: 1 1 auto; min-height: 320px">
          <JsonEditor
            style="height: 100%"
            v-model="props.shared.toolsDefinition"
            placeholder='[{"name":"fetchDocs","description":"..."}]'
          />
        </div>
        <div v-if="toolsError" class="form-hint error">{{ toolsError }}</div>
        <div v-else-if="toolsSuccess" class="form-hint success">{{ toolsSuccess }}</div>
      </div>
    </Space>
  </Modal>
</template>
