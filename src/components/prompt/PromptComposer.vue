<script setup lang="ts">
/**
 * PromptComposer - Prompt 编辑器组件
 * 使用 Ant Design Vue 组件，实现消息列表编辑器
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { Button, Select, Input, Tooltip, message } from 'ant-design-vue';
import {
  DeleteOutlined,
  CopyOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  HolderOutlined,
  UserOutlined,
  RobotOutlined,
  SettingOutlined
} from '@ant-design/icons-vue';
import type { UserPromptPreset, VariableBinding } from '../../types';
import { newId } from '../../lib/id';

const { TextArea } = Input;

const props = defineProps<{
  messages: UserPromptPreset[];
  variables?: VariableBinding[];
}>();

const emit = defineEmits<{
  'update:messages': [UserPromptPreset[]];
}>();

// 自动保存定时器
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_SAVE_DELAY = 1000; // 1秒

// 拖拽状态
const draggedIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const isDragEnabled = ref(false);

// 角色选项
const roleOptions = [
  { value: 'system', label: 'System', icon: SettingOutlined },
  { value: 'user', label: 'User', icon: UserOutlined },
  { value: 'assistant', label: 'Assistant', icon: RobotOutlined }
];

// 角色图标映射
const roleIcons: Record<string, typeof UserOutlined> = {
  system: SettingOutlined,
  user: UserOutlined,
  assistant: RobotOutlined
};

// 消息代理
const messagesProxy = computed({
  get: () => props.messages,
  set: (next) => {
    emit('update:messages', next);
    scheduleAutoSave();
  }
});

// 调度自动保存
function scheduleAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(() => {
    // 自动保存逻辑由父组件处理
    // 这里只是触发更新
  }, AUTO_SAVE_DELAY);
}

// 添加消息
function addMessage(role: UserPromptPreset['role'] = 'user') {
  const newMessage: UserPromptPreset = {
    id: newId(),
    role,
    text: role === 'system' ? 'You are a helpful assistant.' : ''
  };
  messagesProxy.value = [...messagesProxy.value, newMessage];
  message.success(`已添加 ${role} 消息`);
}

// 复制消息
function duplicateMessage(msg: UserPromptPreset) {
  const idx = messagesProxy.value.findIndex(m => m.id === msg.id);
  const copy: UserPromptPreset = {
    id: newId(),
    role: msg.role,
    text: msg.text
  };
  
  if (idx < 0) {
    messagesProxy.value = [...messagesProxy.value, copy];
  } else {
    const next = [...messagesProxy.value];
    next.splice(idx + 1, 0, copy);
    messagesProxy.value = next;
  }
}

// 删除消息
function removeMessage(id: string) {
  if (messagesProxy.value.length <= 1) {
    message.warning('至少保留一条消息');
    return;
  }
  messagesProxy.value = messagesProxy.value.filter(m => m.id !== id);
}

// 移动消息
function moveMessage(id: string, direction: 'up' | 'down') {
  const idx = messagesProxy.value.findIndex(m => m.id === id);
  if (idx < 0) return;
  
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= messagesProxy.value.length) return;
  
  const next = [...messagesProxy.value];
  const [item] = next.splice(idx, 1);
  next.splice(targetIdx, 0, item);
  messagesProxy.value = next;
}

// 更新消息
function updateMessage(id: string, patch: Partial<UserPromptPreset>) {
  messagesProxy.value = messagesProxy.value.map(m => 
    m.id === id ? { ...m, ...patch } : m
  );
}

// 拖拽开始 - 只有从 drag-handle 触发才允许
function handleDragStart(e: DragEvent, index: number) {
  if (!isDragEnabled.value) {
    e.preventDefault();
    return;
  }
  draggedIndex.value = index;
}

// 在 drag-handle 上按下鼠标时启用拖拽
function handleDragHandleMouseDown() {
  isDragEnabled.value = true;
}

// 鼠标松开时禁用拖拽
function handleMouseUp() {
  isDragEnabled.value = false;
}

// 拖拽经过
function handleDragOver(e: DragEvent, index: number) {
  e.preventDefault();
  dragOverIndex.value = index;
}

// 拖拽结束
function handleDrop(targetIndex: number) {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) {
    draggedIndex.value = null;
    dragOverIndex.value = null;
    return;
  }
  
  const next = [...messagesProxy.value];
  const [item] = next.splice(draggedIndex.value, 1);
  next.splice(targetIndex, 0, item);
  messagesProxy.value = next;
  
  draggedIndex.value = null;
  dragOverIndex.value = null;
}

// 拖拽离开
function handleDragEnd() {
  draggedIndex.value = null;
  dragOverIndex.value = null;
  isDragEnabled.value = false;
}

// 获取角色颜色
function getRoleColor(role: string): string {
  switch (role) {
    case 'system': return 'orange';
    case 'user': return 'blue';
    case 'assistant': return 'green';
    default: return 'default';
  }
}

// 清理定时器
onUnmounted(() => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
});
</script>

<template>
  <section class="prompt-composer">
    
    <div class="message-list">
      <TransitionGroup name="message">
        <article
          v-for="(msg, index) in props.messages"
          :key="msg.id"
          class="message-card"
          :class="{
            'is-dragging': draggedIndex === index,
            'is-drag-over': dragOverIndex === index
          }"
          :draggable="isDragEnabled"
          @dragstart="(e: DragEvent) => handleDragStart(e, index)"
          @dragover="(e) => handleDragOver(e, index)"
          @drop="handleDrop(index)"
          @dragend="handleDragEnd"
          @mouseup="handleMouseUp"
        >
          <div class="message-header">
            <div 
              class="drag-handle"
              @mousedown="handleDragHandleMouseDown"
            >
              <HolderOutlined />
            </div>
            
            <Select
              :value="msg.role"
              :options="roleOptions"
              size="small"
              class="role-select"
              @change="(val: any) => updateMessage(msg.id, { role: String(val) as UserPromptPreset['role'] })"
            >
              <template #suffixIcon>
                <component :is="roleIcons[msg.role]" />
              </template>
            </Select>
            
            <span class="message-index">#{{ index + 1 }}</span>
            <span class="message-length">{{ msg.text.length }} 字</span>
            
            <div class="message-actions">
              <Tooltip title="上移">
                <Button 
                  type="text" 
                  size="small"
                  :disabled="index === 0"
                  @click="moveMessage(msg.id, 'up')"
                >
                  <template #icon><ArrowUpOutlined /></template>
                </Button>
              </Tooltip>
              
              <Tooltip title="下移">
                <Button 
                  type="text" 
                  size="small"
                  :disabled="index === props.messages.length - 1"
                  @click="moveMessage(msg.id, 'down')"
                >
                  <template #icon><ArrowDownOutlined /></template>
                </Button>
              </Tooltip>
              
              <Tooltip title="复制">
                <Button 
                  type="text" 
                  size="small"
                  @click="duplicateMessage(msg)"
                >
                  <template #icon><CopyOutlined /></template>
                </Button>
              </Tooltip>
              
              <Tooltip :title="props.messages.length <= 1 ? '至少保留一条消息' : '删除'">
                <Button 
                  type="text" 
                  size="small"
                  danger
                  :disabled="props.messages.length <= 1"
                  @click="removeMessage(msg.id)"
                >
                  <template #icon><DeleteOutlined /></template>
                </Button>
              </Tooltip>
            </div>
          </div>
          
          <TextArea
            :value="msg.text"
            :placeholder="msg.role === 'system' ? 'System 指令...' : '输入消息内容...'"
            :auto-size="{ minRows: 2, maxRows: 10 }"
            class="message-editor"
            @change="(e: Event) => updateMessage(msg.id, { text: (e.target as HTMLTextAreaElement).value })"
          />
        </article>
      </TransitionGroup>
    </div>
    
    <div v-if="props.messages.length === 0" class="composer-empty">
      <p>暂无消息，点击上方按钮添加</p>
    </div>
  </section>
</template>

<style scoped>
.prompt-composer {
  background: transparent;
  padding: 0;
}

.composer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 0 4px;
}

.composer-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.title-icon {
  font-size: 14px;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 10px;
}

.message-card {
  background: var(--card-solid);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 8px;
  transition: all 150ms ease-out;
}

.message-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.message-card.is-dragging {
  opacity: 0.5;
  transform: scale(0.98);
}

.message-card.is-drag-over {
  border-color: var(--primary-color);
  border-style: dashed;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.drag-handle {
  cursor: grab;
  color: var(--text-tertiary);
  padding: 2px;
  font-size: 12px;
}

.drag-handle:hover {
  color: var(--text-secondary);
}

.role-select {
  min-width: 85px;
}

.role-select :deep(.ant-select-selector) {
  font-size: 12px;
  height: 22px !important;
}

.role-select :deep(.ant-select-selection-item) {
  line-height: 20px !important;
}

.message-index,
.message-length {
  font-size: 10px;
  color: var(--text-tertiary);
}

.message-actions {
  margin-left: auto;
  display: flex;
  gap: 0;
}

.message-actions :deep(.ant-btn) {
  width: 22px;
  height: 22px;
  padding: 0;
}

.message-editor {
  font-family: inherit;
  font-size: 13px;
}

.message-editor :deep(.ant-input) {
  font-size: 13px;
  line-height: 1.4;
  padding: 4px 8px;
}

.composer-empty {
  text-align: center;
  padding: 16px 12px;
  color: var(--text-tertiary);
  font-size: 12px;
}

/* 消息动画 */
.message-enter-active {
  animation: message-in 150ms ease-out;
}

.message-leave-active {
  animation: message-out 100ms ease-in;
}

.message-move {
  transition: transform 150ms ease-out;
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes message-out {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-8px);
  }
}
</style>
