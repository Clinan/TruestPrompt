<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Button, Space, Alert } from 'ant-design-vue';
import JsonEditor from '../../../../components/JsonEditor.vue';
import { parseToolsDefinition } from '../../domain/tools';

const props = defineProps<{
  open: boolean;
  toolsDefinition: string;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  save: [string];
}>();

const localTools = ref(props.toolsDefinition);
const toolsError = ref<string | null>(null);

const parseResult = computed(() => parseToolsDefinition(localTools.value));
const isValidTools = computed(() => !parseResult.value.error);

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    localTools.value = props.toolsDefinition;
    toolsError.value = null;
    validateTools(localTools.value);
  }
});

function validateTools(value: string) {
  const result = parseToolsDefinition(value);
  toolsError.value = result.error || null;
}

function handleFormat() {
  const raw = localTools.value.trim();
  if (!raw) {
    toolsError.value = null;
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    localTools.value = JSON.stringify(parsed, null, 2);
    validateTools(localTools.value);
  } catch (e) {
    toolsError.value = e instanceof Error ? e.message : '无效的 JSON 格式';
  }
}

function handleSave() {
  const result = parseToolsDefinition(localTools.value);
  if (result.error) {
    toolsError.value = result.error;
    return;
  }
  emit('save', localTools.value);
  emit('update:open', false);
}

function handleCancel() {
  emit('update:open', false);
}

function handleChange(value: string) {
  localTools.value = value;
  validateTools(value);
}
</script>

<template>
  <Modal
    :open="props.open"
    title="Tools 定义"
    :width="640"
    @cancel="handleCancel"
    class="tools-modal"
  >
    <div class="tools-editor-wrap">
      <JsonEditor
        :modelValue="localTools"
        @update:modelValue="handleChange"
        placeholder='[{"type":"function","function":{"name":"example"}}]'
        class="tools-editor"
      />
      
      <Alert
        v-if="toolsError"
        :message="toolsError"
        type="error"
        show-icon
        class="json-error"
      />
      <Alert
        v-else-if="isValidTools"
        message="Tools 定义有效"
        type="success"
        show-icon
        class="json-success"
      />
    </div>
    
    <template #footer>
      <Space>
        <Button @click="handleFormat">格式化</Button>
        <Button @click="handleCancel">取消</Button>
        <Button type="primary" :disabled="!isValidTools" @click="handleSave">保存</Button>
      </Space>
    </template>
  </Modal>
</template>

<style scoped>
.tools-editor-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
}

.tools-editor {
  height: 400px;
  max-height: 50vh;
  overflow: hidden;
}

.tools-editor :deep(.cm-editor) {
  height: 100%;
}

.tools-editor :deep(.cm-scroller) {
  overflow: auto !important;
}

.json-error,
.json-success {
  flex-shrink: 0;
}
</style>
