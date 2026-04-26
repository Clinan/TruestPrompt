<script setup lang="ts">
/**
 * HistoryDrawer - 运行历史抽屉
 * 容器：搜索 / 按日期分组 / Timeline；单条记录由 HistoryItemEntry 渲染。
 */
import { computed, ref } from 'vue';
import { Drawer, Input, Timeline, Typography, Empty } from 'ant-design-vue';
import type { HistoryItem } from '../../types';
import HistoryItemEntry from './history/HistoryItemEntry.vue';
import {
  formatGroupLabel,
  getDateKey,
  matchesHistoryItem,
} from '../../lib/historyView';

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

interface GroupedHistory {
  label: string;
  date: string;
  items: HistoryItem[];
}

const filteredItems = computed(() =>
  props.items.filter((item) => matchesHistoryItem(item, searchQuery.value.trim().toLowerCase()))
);

const groupedHistory = computed<GroupedHistory[]>(() => {
  const groups = new Map<string, HistoryItem[]>();

  filteredItems.value.forEach((item) => {
    const dateKey = getDateKey(item.createdAt);
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(item);
  });

  return Array.from(groups.entries())
    .map(([dateKey, items]) => ({
      label: formatGroupLabel(items[0].createdAt),
      date: dateKey,
      items: items.sort((a, b) => b.createdAt - a.createdAt),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
});

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) expandedIds.value.delete(id);
  else expandedIds.value.add(id);
  expandedIds.value = new Set(expandedIds.value);
}

function handleClose() {
  emit('update:open', false);
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
      <div v-for="group in groupedHistory" :key="group.date" class="history-group">
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
            <HistoryItemEntry
              :item="item"
              :expanded="expandedIds.has(item.id)"
              @toggle-expand="toggleExpand"
              @load="emit('load', $event)"
              @toggle-star="emit('toggleStar', $event)"
              @delete="emit('delete', $event)"
            />
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

.history-empty { margin-top: 48px; }
</style>
