<script setup lang="ts">
/**
 * CurlModal - cURL 导出弹窗组件
 * 使用 Ant Design Vue Modal，与 ToolsModal 保持一致的风格
 * 
 * 特性：
 * - 每次打开从 slot 重新构建 cURL 内容
 * - cURL 文本可编辑，但不会应用回 slot
 * - 支持 API Key 占位符切换
 */
import { ref, watch } from 'vue';
import { Modal, Button, Space, Checkbox, message } from 'ant-design-vue';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons-vue';
import JsonEditor from '../../../../components/JsonEditor.vue';

const props = defineProps<{
  open: boolean;
  title: string;
  code: string;
  usePlaceholder: boolean;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  'update:usePlaceholder': [boolean];
}>();

// 本地编辑的 cURL 内容（可编辑但不会应用回 slot）
const localCode = ref(props.code);
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

// 每次打开弹窗时，从 props.code 重新加载内容
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    localCode.value = props.code;
    copied.value = false;
  }
});

// 当 props.code 变化时（如切换占位符），更新本地内容
watch(() => props.code, (newCode) => {
  if (props.open) {
    localCode.value = newCode;
  }
});

// 处理编辑
function handleChange(value: string) {
  localCode.value = value;
}

// 复制到剪贴板
async function handleCopy() {
  try {
    await navigator.clipboard.writeText(localCode.value || '');
    copied.value = true;
    message.success('已复制到剪贴板');
    if (copiedTimer !== null) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 2000);
  } catch (err) {
    message.error('复制失败，请检查浏览器权限');
    console.warn(err);
  }
}

// 关闭弹窗
function handleClose() {
  emit('update:open', false);
}

// 切换占位符
function handlePlaceholderChange(e: { target: { checked: boolean } }) {
  emit('update:usePlaceholder', e.target.checked);
}
</script>

<template>
  <Modal
    :open="props.open"
    :title="props.title"
    :width="1000"
    @cancel="handleClose"
    class="curl-modal"
  >
    <div class="curl-editor-wrap">
      <div class="curl-toolbar">
        <Checkbox
          :checked="props.usePlaceholder"
          @change="handlePlaceholderChange"
        >
          API Key 使用占位符
        </Checkbox>
      </div>
      
      <JsonEditor
        :modelValue="localCode"
        @update:modelValue="handleChange"
        placeholder="cURL 命令..."
        language="javascript"
        class="curl-editor"
      />
    </div>
    
    <template #footer>
      <Space>
        <Button @click="handleClose">关闭</Button>
        <Button type="primary" @click="handleCopy">
          <template #icon>
            <CheckOutlined v-if="copied" />
            <CopyOutlined v-else />
          </template>
          {{ copied ? '已复制' : '复制' }}
        </Button>
      </Space>
    </template>
  </Modal>
</template>

<style scoped>
.curl-editor-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
}

.curl-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.curl-editor {
  height: 400px;
  max-height: 50vh;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.curl-editor :deep(.cm-editor) {
  height: 100%;
}

.curl-editor :deep(.cm-scroller) {
  overflow: auto !important;
}
</style>
