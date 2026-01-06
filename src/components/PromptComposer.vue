<script setup lang="ts">
import { computed, ref } from 'vue';
import type { UserPromptPreset } from '../core/types';
import { newId } from '../core/utils/id';

const props = defineProps<{
  messages: UserPromptPreset[];
}>();

const emit = defineEmits<{
  'update:messages': [UserPromptPreset[]];
}>();

const collapsedMap = ref<Record<string, boolean>>({});

const messagesProxy = computed({
  get: () => props.messages,
  set: (next) => emit('update:messages', next)
});

const roleLabels: Record<UserPromptPreset['role'], string> = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant'
};

function addMessage(role: UserPromptPreset['role'] = 'user') {
  messagesProxy.value = [
    ...messagesProxy.value,
    {
      id: newId(),
      role,
      text: role === 'system' ? 'You are a helpful orchestrator.' : ''
    }
  ];
}

function duplicateMessage(message: UserPromptPreset) {
  const idx = messagesProxy.value.findIndex((m) => m.id === message.id);
  const copy: UserPromptPreset = {
    id: newId(),
    role: message.role,
    text: message.text
  };
  if (idx < 0) {
    messagesProxy.value = [...messagesProxy.value, copy];
    return;
  }
  const next = [...messagesProxy.value];
  next.splice(idx + 1, 0, copy);
  messagesProxy.value = next;
}

function removeMessage(id: string) {
  if (messagesProxy.value.length <= 1) return;
  messagesProxy.value = messagesProxy.value.filter((m) => m.id !== id);
  const map = { ...collapsedMap.value };
  delete map[id];
  collapsedMap.value = map;
}

function moveMessage(id: string, dir: 'up' | 'down') {
  const idx = messagesProxy.value.findIndex((m) => m.id === id);
  if (idx < 0) return;
  const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= messagesProxy.value.length) return;
  const next = [...messagesProxy.value];
  const [item] = next.splice(idx, 1);
  next.splice(targetIdx, 0, item);
  messagesProxy.value = next;
}

function updateMessage(id: string, patch: Partial<UserPromptPreset>) {
  messagesProxy.value = messagesProxy.value.map((message) => (message.id === id ? { ...message, ...patch } : message));
}

function toggleCollapse(id: string) {
  collapsedMap.value = { ...collapsedMap.value, [id]: !collapsedMap.value[id] };
}

function isCollapsed(message: UserPromptPreset) {
  if (!message.text.trim()) return false;
  return collapsedMap.value[message.id] ?? (message.text.split('\n').length > 3);
}

function previewText(text: string) {
  const [firstLine] = text.split('\n');
  return firstLine.length > 140 ? `${firstLine.slice(0, 140)}...` : firstLine;
}
</script>

<template>
  <div class="composer">
    <div class="composer__head">
      <div>
        <div class="panel-title">Prompt Composer</div>
      </div>
      <div class="composer__actions">
        <div class="composer__role-buttons">
          <button class="pill ghost" @click="addMessage('system')">System</button>
          <button class="pill ghost" @click="addMessage('user')">User</button>
          <button class="pill ghost" @click="addMessage('assistant')">Assistant</button>
        </div>
      </div>
    </div>

    <div class="message-list">
      <article v-for="(message, index) in props.messages" :key="message.id" class="message-card">
        <div class="message-card__head">
          <div class="role-chip" :data-role="message.role">
            <select
              :value="message.role"
              @change="updateMessage(message.id, { role: ($event.target as HTMLSelectElement).value as UserPromptPreset['role'] })"
            >
              <option v-for="(label, role) in roleLabels" :key="role" :value="role">{{ label }}</option>
            </select>
          </div>
          <div class="message-card__meta">
            <span class="small-text">#{{ index + 1 }}</span>
            <span class="small-text">{{ message.text.length }} 字</span>
          </div>
          <div class="message-card__tools">
            <button class="icon-button ghost" @click="duplicateMessage(message)" title="复制此消息">⎘</button>
            <button class="icon-button ghost" @click="moveMessage(message.id, 'up')" :disabled="index === 0" title="上移">
              ↑
            </button>
            <button
              class="icon-button ghost"
              @click="moveMessage(message.id, 'down')"
              :disabled="index === props.messages.length - 1"
              title="下移"
            >
              ↓
            </button>
            <button class="icon-button ghost danger" :disabled="props.messages.length === 1" @click="removeMessage(message.id)">
              ✕
            </button>
          </div>
        </div>

        <div v-if="isCollapsed(message)" class="message-card__preview">
          <div class="preview-text">{{ previewText(message.text) }}</div>
          <button class="text-button" @click="toggleCollapse(message.id)">展开</button>
        </div>
        <textarea
          v-else
          class="message-editor"
          :value="message.text"
          :placeholder="message.role === 'system' ? 'System 指令...' : '输入消息内容'"
          @input="updateMessage(message.id, { text: ($event.target as HTMLTextAreaElement).value })"
        />
        <div class="message-card__footer">
          <button class="text-button" @click="toggleCollapse(message.id)">
            {{ isCollapsed(message) ? '展开' : '收起' }}
          </button>
        </div>
      </article>
    </div>
  </div>
</template>
