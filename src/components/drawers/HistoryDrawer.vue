<script setup lang="ts">
/**
 * HistoryDrawer - 历史记录抽屉组件
 * 使用 Ant Design Vue Drawer 组件，实现时间线布局
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
import { computed, ref } from 'vue';
import { 
  Drawer, 
  Input, 
  Button, 
  Space, 
  Tag, 
  Timeline, 
  Typography,
  Empty,
  Tooltip,
  Collapse
} from 'ant-design-vue';
import { 
  StarOutlined, 
  StarFilled, 
  DownloadOutlined, 
  DeleteOutlined,
  ClockCircleOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  ToolOutlined
} from '@ant-design/icons-vue';
import type { HistoryItem } from '../../types';
import JsonEditor from '../JsonEditor.vue';

const { Search: InputSearch } = Input;
const { Text } = Typography;

const props = defineProps<{
  open: boolean;
  items: HistoryItem[];
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  load: [item: HistoryItem];
  toggleStar: [id: string];
  delete: [id: string];
}>();

const searchQuery = ref('');
const expandedIds = ref<Set<string>>(new Set());

// 按日期分组历史记录
interface GroupedHistory {
  label: string;
  date: string;
  items: HistoryItem[];
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return '今天';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return '昨天';
  } else {
    return date.toLocaleDateString('zh-CN', { 
      month: 'long', 
      day: 'numeric',
      weekday: 'short'
    });
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getDateKey(timestamp: number): string {
  return new Date(timestamp).toDateString();
}

// 搜索过滤
function matchesSearch(item: HistoryItem): boolean {
  if (!searchQuery.value.trim()) return true;
  
  const query = searchQuery.value.toLowerCase();
  const title = item.title?.toLowerCase() || '';
  const model = item.requestSnapshot.modelId?.toLowerCase() || '';
  const systemPrompt = item.requestSnapshot.systemPrompt?.toLowerCase() || '';
  const output = item.responseSnapshot.outputText?.toLowerCase() || '';
  
  // 搜索用户消息
  let userMessages = '';
  if (Array.isArray(item.requestSnapshot.messages)) {
    userMessages = item.requestSnapshot.messages
      .map(m => (m as { content?: string }).content || '')
      .join(' ')
      .toLowerCase();
  } else if (Array.isArray(item.requestSnapshot.userPrompts)) {
    userMessages = item.requestSnapshot.userPrompts.join(' ').toLowerCase();
  }
  
  return (
    title.includes(query) ||
    model.includes(query) ||
    systemPrompt.includes(query) ||
    userMessages.includes(query) ||
    output.includes(query)
  );
}

// 过滤并分组
const filteredItems = computed(() => {
  return props.items.filter(matchesSearch);
});

const groupedHistory = computed<GroupedHistory[]>(() => {
  const groups = new Map<string, HistoryItem[]>();
  
  // 按日期分组
  filteredItems.value.forEach(item => {
    const dateKey = getDateKey(item.createdAt);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(item);
  });
  
  // 转换为数组并排序
  return Array.from(groups.entries())
    .map(([dateKey, items]) => ({
      label: formatDate(items[0].createdAt),
      date: dateKey,
      items: items.sort((a, b) => b.createdAt - a.createdAt)
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
});

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id);
  } else {
    expandedIds.value.add(id);
  }
  expandedIds.value = new Set(expandedIds.value);
}

function handleClose() {
  emit('update:open', false);
}

function handleLoad(item: HistoryItem) {
  emit('load', item);
}

function handleToggleStar(id: string) {
  emit('toggleStar', id);
}

function handleDelete(id: string) {
  emit('delete', id);
}

function truncateText(text: string, maxLength: number = 100): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

type MessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'other';

interface NormalizedMessage {
  role: MessageRole;
  content: string;
}

// systemPrompt 是独立字段；messages[] 只装 user/assistant 对话流。
// 只要 systemPrompt 非空，就始终作为首条——除非 messages 里已有同名 role（去重）。
function extractMessages(item: HistoryItem): NormalizedMessage[] {
  const snap = item.requestSnapshot;
  const result: NormalizedMessage[] = [];
  const messages = Array.isArray(snap.messages) ? snap.messages : null;

  const hasSystemInMessages = messages?.some(
    (m) => (m as { role?: string }).role === 'system'
  ) ?? false;
  if (snap.systemPrompt && !hasSystemInMessages) {
    result.push({ role: 'system', content: snap.systemPrompt });
  }

  if (messages && messages.length) {
    for (const m of messages) {
      const raw = m as { role?: string; content?: string };
      const content = raw.content ?? '';
      if (!content) continue;
      result.push({ role: normalizeRole(raw.role), content });
    }
    return result;
  }

  if (Array.isArray(snap.userPrompts)) {
    for (const text of snap.userPrompts) {
      if (text) result.push({ role: 'user', content: text });
    }
  }
  return result;
}

interface NormalizedOutput {
  label: string;
  content: string;
  tagColor: string;
}

function extractOutputs(item: HistoryItem): NormalizedOutput[] {
  const snap = item.responseSnapshot;
  const result: NormalizedOutput[] = [];
  if (snap.thinking) {
    result.push({ label: 'Thinking', content: snap.thinking, tagColor: 'cyan' });
  }
  if (snap.outputText) {
    result.push({ label: 'Output', content: snap.outputText, tagColor: 'green' });
  }
  return result;
}

function outputPanelKey(itemId: string, idx: number): string {
  return `${itemId}::out::${idx}`;
}

function normalizeRole(role: string | undefined): MessageRole {
  switch (role) {
    case 'system':
    case 'user':
    case 'assistant':
    case 'tool':
      return role;
    default:
      return 'other';
  }
}

function roleLabel(role: MessageRole): string {
  switch (role) {
    case 'system': return 'System';
    case 'user': return 'User';
    case 'assistant': return 'Assistant';
    case 'tool': return 'Tool';
    default: return 'Other';
  }
}

function roleColor(role: MessageRole): string {
  switch (role) {
    case 'system': return 'purple';
    case 'user': return 'blue';
    case 'assistant': return 'green';
    case 'tool': return 'orange';
    default: return 'default';
  }
}

function messagePanelKey(itemId: string, idx: number): string {
  return `${itemId}::msg::${idx}`;
}

/**
 * 检查是否有 tools 定义
 */
function hasTools(item: HistoryItem): boolean {
  return Boolean(item.requestSnapshot.toolsDefinition?.trim());
}

function getDisplayTitle(item: HistoryItem): string {
  if (item.title) return item.title;
  
  // 从用户消息中提取标题
  if (Array.isArray(item.requestSnapshot.messages) && item.requestSnapshot.messages.length) {
    const firstUserMsg = item.requestSnapshot.messages.find(
      m => (m as { role?: string }).role === 'user'
    );
    if (firstUserMsg) {
      return truncateText((firstUserMsg as { content?: string }).content || '', 50);
    }
  }
  
  if (Array.isArray(item.requestSnapshot.userPrompts) && item.requestSnapshot.userPrompts.length) {
    return truncateText(item.requestSnapshot.userPrompts[0], 50);
  }
  
  return '未命名对话';
}
</script>

<template>
  <Drawer
    :open="props.open"
    title="运行历史"
    placement="right"
    width="50vw"
    class="history-drawer"
    @close="handleClose"
  >
    <div class="history-search">
      <InputSearch
        v-model:value="searchQuery"
        placeholder="搜索历史记录..."
        allow-clear
        size="large"
      />
    </div>
    
    <div class="history-content" v-if="groupedHistory.length">
      <div 
        v-for="group in groupedHistory" 
        :key="group.date"
        class="history-group"
      >
        <div class="group-header">
          <Text strong>{{ group.label }}</Text>
          <Text type="secondary" class="group-count">{{ group.items.length }} 条</Text>
        </div>
        
        <Timeline class="history-timeline">
          <Timeline.Item 
            v-for="item in group.items" 
            :key="item.id"
            :color="item.star ? 'gold' : 'blue'"
          >
            <div 
              class="history-item"
              :class="{ 'is-expanded': expandedIds.has(item.id) }"
            >
              <div class="item-header" @click="toggleExpand(item.id)">
                <div class="item-title-row">
                  <component 
                    :is="item.star ? StarFilled : StarOutlined" 
                    class="star-icon"
                    :class="{ 'is-starred': item.star }"
                    @click.stop="handleToggleStar(item.id)"
                  />
                  <Text strong class="item-title">{{ getDisplayTitle(item) }}</Text>
                </div>
                
                <div class="item-meta">
                  <Space :size="8" wrap>
                    <Tag color="blue">
                      <template #icon><RobotOutlined /></template>
                      {{ item.requestSnapshot.modelId }}
                    </Tag>
                    <Tag>
                      <template #icon><ClockCircleOutlined /></template>
                      {{ formatTime(item.createdAt) }}
                    </Tag>
                  </Space>
                </div>
                
                <div class="item-metrics">
                  <Space :size="4">
                    <Tooltip title="首字节响应时间">
                      <Tag size="small">
                        TTFB {{ item.responseSnapshot.metrics.ttfbMs?.toFixed(0) ?? '-' }}ms
                      </Tag>
                    </Tooltip>
                    <Tooltip title="总耗时">
                      <Tag size="small">
                        {{ item.responseSnapshot.metrics.totalMs?.toFixed(0) ?? '-' }}ms
                      </Tag>
                    </Tooltip>
                    <Tooltip title="Token 用量">
                      <Tag size="small">
                        {{ item.responseSnapshot.usage?.total ?? '-' }} tokens
                      </Tag>
                    </Tooltip>
                    <Tag 
                      v-if="item.responseSnapshot.toolCalls?.length" 
                      size="small"
                      color="purple"
                    >
                      <template #icon><ThunderboltOutlined /></template>
                      {{ item.responseSnapshot.toolCalls.length }} calls
                    </Tag>
                  </Space>
                </div>
              </div>
              
              <Collapse
                :activeKey="expandedIds.has(item.id) ? [item.id] : []"
                :bordered="false"
                class="item-details"
              >
                <Collapse.Panel :key="item.id" :show-arrow="false">
                  <!-- Prompt 内容：每条 message 独立折叠 + 独立 CodeMirror + 复制 -->
                  <div class="detail-section">
                    <Text type="secondary" class="detail-label">Prompt 内容</Text>
                    <Collapse
                      v-if="extractMessages(item).length"
                      :bordered="false"
                      class="messages-collapse"
                    >
                      <Collapse.Panel
                        v-for="(msg, idx) in extractMessages(item)"
                        :key="messagePanelKey(item.id, idx)"
                      >
                        <template #header>
                          <div class="message-header">
                            <Tag :color="roleColor(msg.role)" class="message-role-tag">
                              {{ roleLabel(msg.role) }}
                            </Tag>
                            <Text type="secondary" class="message-preview">
                              {{ truncateText(msg.content, 50) }}
                            </Text>
                          </div>
                        </template>
                        <div class="message-editor-wrapper">
                          <JsonEditor
                            :model-value="msg.content"
                            language="text"
                            :copyable="true"
                          />
                        </div>
                      </Collapse.Panel>
                    </Collapse>
                    <Empty
                      v-else
                      :image="null"
                      description="无 Prompt 内容"
                      class="messages-empty"
                    />
                  </div>
                  
                  <!-- Tools 定义 (默认折叠) -->
                  <div v-if="hasTools(item)" class="detail-section">
                    <Collapse :bordered="false" class="tools-collapse">
                      <Collapse.Panel key="tools">
                        <template #header>
                          <Space :size="4">
                            <ToolOutlined />
                            <Text type="secondary">Tools 定义</Text>
                          </Space>
                        </template>
                        <div class="tools-editor-wrapper">
                          <JsonEditor
                            :model-value="item.requestSnapshot.toolsDefinition"
                            :readonly="true"
                            language="json"
                            placeholder="无 Tools 定义"
                          />
                        </div>
                      </Collapse.Panel>
                    </Collapse>
                  </div>
                  
                  <!-- 输出预览：Output/Thinking 各自独立折叠 + CodeMirror + 复制 -->
                  <div class="detail-section">
                    <Text type="secondary" class="detail-label">输出预览</Text>
                    <Collapse
                      v-if="extractOutputs(item).length"
                      :bordered="false"
                      class="messages-collapse"
                    >
                      <Collapse.Panel
                        v-for="(out, idx) in extractOutputs(item)"
                        :key="outputPanelKey(item.id, idx)"
                      >
                        <template #header>
                          <div class="message-header">
                            <Tag :color="out.tagColor" class="message-role-tag">
                              {{ out.label }}
                            </Tag>
                            <Text type="secondary" class="message-preview">
                              {{ truncateText(out.content, 50) }}
                            </Text>
                          </div>
                        </template>
                        <div class="message-editor-wrapper">
                          <JsonEditor
                            :model-value="out.content"
                            language="text"
                            :copyable="true"
                          />
                        </div>
                      </Collapse.Panel>
                    </Collapse>
                    <Empty
                      v-else
                      :image="null"
                      description="无输出内容"
                      class="messages-empty"
                    />
                  </div>
                  
                  <div class="item-actions">
                    <Space>
                      <Button 
                        type="primary" 
                        size="small"
                        @click="handleLoad(item)"
                      >
                        <template #icon><DownloadOutlined /></template>
                        载入
                      </Button>
                      <Button 
                        size="small"
                        @click="handleToggleStar(item.id)"
                      >
                        <template #icon>
                          <component :is="item.star ? StarFilled : StarOutlined" />
                        </template>
                        {{ item.star ? '取消收藏' : '收藏' }}
                      </Button>
                      <Button 
                        size="small" 
                        danger
                        @click="handleDelete(item.id)"
                      >
                        <template #icon><DeleteOutlined /></template>
                      </Button>
                    </Space>
                  </div>
                </Collapse.Panel>
              </Collapse>
            </div>
          </Timeline.Item>
        </Timeline>
      </div>
    </div>
    
    <Empty 
      v-else 
      :description="searchQuery ? '没有找到匹配的记录' : '暂无历史记录'"
      class="history-empty"
    />
  </Drawer>
</template>

<style scoped>
.history-search {
  flex-shrink: 0;
  margin-bottom: 16px;
}

.history-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.history-group { margin-bottom: 24px; }

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}
.group-count { font-size: 12px; }

.history-timeline { padding-left: 4px; }

.history-item {
  margin-bottom: 8px;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out-expo);
}
.history-item:hover { background: var(--hover-bg); }
.history-item.is-expanded {
  background: var(--card-solid);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.item-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.star-icon {
  font-size: 14px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color var(--duration-fast);
}
.star-icon:hover,
.star-icon.is-starred { color: var(--warning-color); }

.item-title {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.item-meta { display: flex; align-items: center; }
.item-metrics { display: flex; flex-wrap: wrap; gap: 4px; }

.item-details {
  margin-top: 12px;
  background: transparent !important;
}
.item-details :deep(.ant-collapse-content-box) { padding: 0 !important; }

.detail-section { margin-bottom: 12px; }
.detail-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
}

.messages-collapse {
  margin-top: 4px;
  background: transparent !important;
}
.messages-collapse :deep(.ant-collapse-item) { border-bottom: 1px solid var(--border-color); }
.messages-collapse :deep(.ant-collapse-item:last-child) { border-bottom: none; }
.messages-collapse :deep(.ant-collapse-header) {
  padding: 8px 12px !important;
  align-items: center !important;
}
.messages-collapse :deep(.ant-collapse-content-box) { padding: 0 12px 12px !important; }

.message-header {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.message-role-tag {
  flex-shrink: 0;
  margin-right: 0 !important;
}
.message-preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
}

.message-editor-wrapper {
  height: 220px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.messages-empty { margin: 8px 0 !important; }

.tools-collapse { background: transparent !important; }
.tools-collapse :deep(.ant-collapse-header) { padding: 8px 0 !important; }
.tools-collapse :deep(.ant-collapse-content-box) { padding: 0 !important; }

.tools-editor-wrapper {
  height: 120px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.item-actions {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.history-empty { margin-top: 48px; }
</style>
