<script setup lang="ts">
import {
  Button,
  Collapse,
  Empty,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'ant-design-vue';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  RobotOutlined,
  StarFilled,
  StarOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons-vue';
import type { HistoryItem } from '../../../core/types';
import JsonEditor from '../../JsonEditor.vue';
import {
  extractMessages,
  extractOutputs,
  formatTime,
  getDisplayTitle,
  hasTools,
  roleColor,
  roleLabel,
  truncateText,
} from '../../../lib/historyView';

const { Text } = Typography;

const props = defineProps<{
  item: HistoryItem;
  expanded: boolean;
}>();

const emit = defineEmits<{
  toggleExpand: [id: string];
  load: [item: HistoryItem];
  toggleStar: [id: string];
  delete: [id: string];
}>();

function messagePanelKey(itemId: string, idx: number): string {
  return `${itemId}::msg::${idx}`;
}

function outputPanelKey(itemId: string, idx: number): string {
  return `${itemId}::out::${idx}`;
}
</script>

<template>
  <div class="history-item" :class="{ 'is-expanded': props.expanded }">
    <div class="item-header" @click="emit('toggleExpand', props.item.id)">
      <div class="item-title-row">
        <component
          :is="props.item.star ? StarFilled : StarOutlined"
          class="star-icon"
          :class="{ 'is-starred': props.item.star }"
          @click.stop="emit('toggleStar', props.item.id)"
        />
        <Text strong class="item-title">{{ getDisplayTitle(props.item) }}</Text>
      </div>

      <div class="item-meta">
        <Space :size="8" wrap>
          <Tag color="blue">
            <template #icon><RobotOutlined /></template>
            {{ props.item.requestSnapshot.modelId }}
          </Tag>
          <Tag>
            <template #icon><ClockCircleOutlined /></template>
            {{ formatTime(props.item.createdAt) }}
          </Tag>
        </Space>
      </div>

      <div class="item-metrics">
        <Space :size="4">
          <Tooltip title="首字节响应时间">
            <Tag size="small">
              TTFB {{ props.item.responseSnapshot.metrics.ttfbMs?.toFixed(0) ?? '-' }}ms
            </Tag>
          </Tooltip>
          <Tooltip title="总耗时">
            <Tag size="small">
              {{ props.item.responseSnapshot.metrics.totalMs?.toFixed(0) ?? '-' }}ms
            </Tag>
          </Tooltip>
          <Tooltip title="Token 用量">
            <Tag size="small">
              {{ props.item.responseSnapshot.usage?.total ?? '-' }} tokens
            </Tag>
          </Tooltip>
          <Tag
            v-if="props.item.responseSnapshot.toolCalls?.length"
            size="small"
            color="purple"
          >
            <template #icon><ThunderboltOutlined /></template>
            {{ props.item.responseSnapshot.toolCalls.length }} calls
          </Tag>
        </Space>
      </div>
    </div>

    <Collapse
      :activeKey="props.expanded ? [props.item.id] : []"
      :bordered="false"
      class="item-details"
    >
      <Collapse.Panel :key="props.item.id" :show-arrow="false">
        <!-- Prompt 内容：每条 message 独立折叠 + 独立 CodeMirror + 复制 -->
        <div class="detail-section">
          <Text type="secondary" class="detail-label">Prompt 内容</Text>
          <Collapse
            v-if="extractMessages(props.item).length"
            :bordered="false"
            class="messages-collapse"
          >
            <Collapse.Panel
              v-for="(msg, idx) in extractMessages(props.item)"
              :key="messagePanelKey(props.item.id, idx)"
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
                <JsonEditor :model-value="msg.content" language="text" :copyable="true" />
              </div>
            </Collapse.Panel>
          </Collapse>
          <Empty v-else :image="null" description="无 Prompt 内容" class="messages-empty" />
        </div>

        <!-- Tools 定义 (默认折叠) -->
        <div v-if="hasTools(props.item)" class="detail-section">
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
                  :model-value="props.item.requestSnapshot.toolsDefinition"
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
            v-if="extractOutputs(props.item).length"
            :bordered="false"
            class="messages-collapse"
          >
            <Collapse.Panel
              v-for="(out, idx) in extractOutputs(props.item)"
              :key="outputPanelKey(props.item.id, idx)"
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
                <JsonEditor :model-value="out.content" language="text" :copyable="true" />
              </div>
            </Collapse.Panel>
          </Collapse>
          <Empty v-else :image="null" description="无输出内容" class="messages-empty" />
        </div>

        <div class="item-actions">
          <Space>
            <Button type="primary" size="small" @click="emit('load', props.item)">
              <template #icon><DownloadOutlined /></template>
              载入
            </Button>
            <Button size="small" @click="emit('toggleStar', props.item.id)">
              <template #icon>
                <component :is="props.item.star ? StarFilled : StarOutlined" />
              </template>
              {{ props.item.star ? '取消收藏' : '收藏' }}
            </Button>
            <Button size="small" danger @click="emit('delete', props.item.id)">
              <template #icon><DeleteOutlined /></template>
            </Button>
          </Space>
        </div>
      </Collapse.Panel>
    </Collapse>
  </div>
</template>

<style scoped>
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
</style>
