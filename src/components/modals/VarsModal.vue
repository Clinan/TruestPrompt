<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { Modal, Button, Space, Input, Table, message } from 'ant-design-vue';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { newId } from '../../core/utils/id';

interface Variable {
  id: string;
  key: string;
  value: string;
}

const props = defineProps<{
  open: boolean;
  variables: Variable[];
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  save: [Variable[]];
}>();

const localVars = ref<Variable[]>([]);
const newKeyInputRef = ref<HTMLInputElement | null>(null);

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    // 深拷贝变量列表，避免直接修改原数据
    localVars.value = props.variables.map(v => ({ ...v }));
    // 如果没有变量，自动添加一个空的
    if (localVars.value.length === 0) {
      addVariable();
    }
  }
});

function addVariable() {
  const newVar = { id: newId(), key: '', value: '' };
  localVars.value.push(newVar);
  // 聚焦到新添加的输入框
  nextTick(() => {
    const inputs = document.querySelectorAll('.vars-table input');
    const lastInput = inputs[inputs.length - 2] as HTMLInputElement; // key 输入框
    lastInput?.focus();
  });
}

function removeVariable(id: string) {
  localVars.value = localVars.value.filter(v => v.id !== id);
}

function handleSave() {
  // 过滤掉空 key 的变量
  const validVars = localVars.value.filter(v => v.key.trim());
  
  // 检查是否有重复的 key
  const keys = validVars.map(v => v.key.trim());
  const uniqueKeys = new Set(keys);
  if (keys.length !== uniqueKeys.size) {
    message.warning('存在重复的变量名，请检查');
    return;
  }
  
  emit('save', validVars);
  emit('update:open', false);
  message.success('变量已保存');
}

function handleCancel() {
  emit('update:open', false);
}

// 处理键盘事件：Enter 键添加新变量
function handleKeyDown(e: KeyboardEvent, index: number, field: 'key' | 'value') {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (field === 'value' && index === localVars.value.length - 1) {
      // 在最后一行的 value 输入框按 Enter，添加新变量
      addVariable();
    } else if (field === 'key') {
      // 在 key 输入框按 Enter，跳转到 value 输入框
      const inputs = document.querySelectorAll('.vars-table input');
      const valueInput = inputs[index * 2 + 1] as HTMLInputElement;
      valueInput?.focus();
    }
  }
}

const columns = [
  { title: 'Key', dataIndex: 'key', key: 'key', width: '40%' },
  { title: 'Value', dataIndex: 'value', key: 'value', width: '45%' },
  { title: '操作', key: 'action', width: '15%' }
];
</script>

<template>
  <Modal
    :open="props.open"
    title="模板变量"
    :width="600"
    @cancel="handleCancel"
    class="vars-modal"
  >
    <div class="vars-hint">
      使用 <code v-pre>{{变量名}}</code> 在 Prompt 中引用变量
    </div>
    
    <Table
      :dataSource="localVars"
      :columns="columns"
      :pagination="false"
      :rowKey="(record: Variable) => record.id"
      size="small"
      class="vars-table"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'key'">
          <Input
            v-model:value="(record as Variable).key"
            placeholder="变量名"
            size="small"
            @keydown="(e: KeyboardEvent) => handleKeyDown(e, index, 'key')"
          />
        </template>
        <template v-else-if="column.key === 'value'">
          <Input
            v-model:value="(record as Variable).value"
            placeholder="变量值"
            size="small"
            @keydown="(e: KeyboardEvent) => handleKeyDown(e, index, 'value')"
          />
        </template>
        <template v-else-if="column.key === 'action'">
          <Button
            type="text"
            danger
            size="small"
            @click="removeVariable((record as Variable).id)"
            :disabled="localVars.length <= 1"
            :title="localVars.length <= 1 ? '至少保留一个变量' : '删除变量'"
          >
            <template #icon><DeleteOutlined /></template>
          </Button>
        </template>
      </template>
      <template #emptyText>
        <div class="empty-hint">暂无变量，点击下方按钮添加</div>
      </template>
    </Table>
    
    <Button type="dashed" block class="add-var-btn" @click="addVariable">
      <template #icon><PlusOutlined /></template>
      添加变量
    </Button>
    
    <template #footer>
      <Space>
        <Button @click="handleCancel">取消</Button>
        <Button type="primary" @click="handleSave">保存</Button>
      </Space>
    </template>
  </Modal>
</template>

<style scoped>
.vars-modal :deep(.ant-modal-body) {
  max-height: 70vh;
  overflow-y: auto;
}

.vars-hint {
  margin-bottom: 16px;
  color: var(--text-secondary);
  font-size: 13px;
}

.vars-hint code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.vars-table {
  margin-bottom: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.add-var-btn {
  margin-top: 8px;
}

.empty-hint {
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 16px 0;
}
</style>
