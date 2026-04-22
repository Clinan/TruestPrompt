<script setup lang="ts">
import type { ToolCall } from '../../../../core/types';
import { Collapse, Space, Button, message } from 'ant-design-vue';
import { ThunderboltOutlined } from '@ant-design/icons-vue';
import { ref } from 'vue';
import ToolCallItem from '../ToolCallItem.vue';

const props = defineProps<{
  toolCalls: ToolCall[];
  toolRegistry?: Record<string, any>;
}>();

const emit = defineEmits<{
  executeToolCall: [toolCall: ToolCall];
  updateToolCall: [toolCall: ToolCall];
}>();

const showToolCalls = ref(true);

function executeAllTools() {
  const pendingTools = props.toolCalls.filter(
    (tc) => !tc.execution || tc.execution.status === 'pending' || tc.execution.status === 'error'
  );
  if (pendingTools.length === 0) {
    message.info('没有待执行的工具');
    return;
  }
  pendingTools.forEach((tc) => emit('executeToolCall', tc));
}

function handleExecuteToolCall(toolCall: ToolCall) {
  emit('executeToolCall', toolCall);
}

function handleUpdateToolCall(toolCall: ToolCall) {
  emit('updateToolCall', toolCall);
}
</script>

<template>
  <Collapse
    :activeKey="showToolCalls ? ['tools'] : []"
    :bordered="false"
    @change="(keys: any) => showToolCalls = Array.isArray(keys) && keys.includes('tools')"
  >
    <Collapse.Panel key="tools" class="tool-calls-panel">
      <template #header>
        <Space>
          <ThunderboltOutlined />
          <span>Tool Calls ({{ props.toolCalls.length }})</span>
          <Button type="primary" size="small" @click.stop="executeAllTools">
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
</template>

<style scoped>
.tool-calls-panel { background: transparent; }
.tool-calls-panel :deep(.ant-collapse-header) {
  padding: 4px 8px !important; background: var(--code-bg);
  border-radius: 4px; font-size: 11px;
}
.tool-calls-list {
  display: flex; flex-direction: column; gap: 8px; padding: 8px 0;
}
</style>