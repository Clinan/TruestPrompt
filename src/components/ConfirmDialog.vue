<script setup lang="ts">
import { Modal, Button, Space } from 'ant-design-vue';
import { ExclamationCircleOutlined, WarningOutlined } from '@ant-design/icons-vue';

const props = defineProps<{
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  close: [];
  confirm: [];
}>();

function handleClose() {
  emit('close');
  emit('update:open', false);
}

function handleConfirm() {
  emit('confirm');
}
</script>

<template>
  <Modal
    :open="props.open"
    :title="null"
    :width="420"
    :closable="false"
    :maskClosable="true"
    centered
    @cancel="handleClose"
    class="confirm-dialog-modal"
  >
    <div class="confirm-dialog-content">
      <div class="confirm-dialog-icon" :class="{ danger: props.tone === 'danger' }">
        <WarningOutlined v-if="props.tone === 'danger'" />
        <ExclamationCircleOutlined v-else />
      </div>
      <div class="confirm-dialog-body">
        <div class="confirm-dialog-title">{{ props.title }}</div>
        <div v-if="props.description" class="confirm-dialog-desc">
          {{ props.description }}
        </div>
      </div>
    </div>
    
    <template #footer>
      <Space>
        <Button @click="handleClose">
          {{ props.cancelText || '取消' }}
        </Button>
        <Button
          :type="props.tone === 'danger' ? 'primary' : 'primary'"
          :danger="props.tone === 'danger'"
          @click="handleConfirm"
        >
          {{ props.confirmText || '确定' }}
        </Button>
      </Space>
    </template>
  </Modal>
</template>

<style scoped>
.confirm-dialog-modal :deep(.ant-modal-body) { padding: 24px; }
.confirm-dialog-modal :deep(.ant-modal-footer) {
  padding: 12px 24px 24px;
  border-top: none;
  text-align: right;
}

.confirm-dialog-content {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.confirm-dialog-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--primary-bg);
  border-radius: 50%;
  color: var(--primary-color);
  font-size: 20px;
}

.confirm-dialog-icon.danger {
  background: var(--error-bg);
  color: var(--error-color);
}

.confirm-dialog-body {
  flex: 1;
  min-width: 0;
}

.confirm-dialog-title {
  margin-bottom: 8px;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-primary);
}

.confirm-dialog-desc {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>
