<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SlotMetrics } from '../../../../core/types';
import { Tag, Space, Button, Tooltip } from 'ant-design-vue';
import { ClockCircleOutlined, FieldTimeOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons-vue';

const props = defineProps<{
  metrics: SlotMetrics;
  hasOutput: boolean;
  output: string;
}>();

const copied = ref(false);

const tokensSummary = computed(() => {
  const tokens = props.metrics.tokens;
  if (!tokens) return null;
  const prompt = tokens.prompt ?? '-';
  const completion = tokens.completion ?? '-';
  const total = tokens.total ?? '-';
  if (prompt === '-' && completion === '-' && total === '-') return null;
  return `${prompt}/${completion}/${total}`;
});

async function copyOutput() {
  if (!props.output) return;
  try {
    await navigator.clipboard.writeText(props.output);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch { /* clipboard unavailable */ }
}
</script>

<template>
  <Space :size="4" wrap>
    <Tooltip title="首字节响应时间 (TTFB)">
      <Tag size="small" class="metric-tag">
        <template #icon><ClockCircleOutlined /></template>
        TTFB {{ props.metrics.ttfbMs ? `${props.metrics.ttfbMs.toFixed(0)}ms` : '-' }}
      </Tag>
    </Tooltip>
    <Tooltip title="总耗时">
      <Tag size="small" class="metric-tag">
        <template #icon><FieldTimeOutlined /></template>
        {{ props.metrics.totalMs ? `${props.metrics.totalMs.toFixed(0)}ms` : '-' }}
      </Tag>
    </Tooltip>
    <Tooltip v-if="tokensSummary" title="Tokens (prompt/completion/total)">
      <Tag size="small" class="metric-tag">{{ tokensSummary }} tokens</Tag>
    </Tooltip>
    <Tooltip title="复制输出">
      <Button type="text" size="small" :disabled="!props.hasOutput" @click="copyOutput">
        <template #icon>
          <CheckOutlined v-if="copied" style="color: var(--success-color)" />
          <CopyOutlined v-else />
        </template>
      </Button>
    </Tooltip>
  </Space>
</template>

<style scoped>
.metric-tag { font-size: 12px; padding: 0 4px; line-height: 18px; }
</style>