<script setup lang="ts">
/**
 * SlotsGrid - Slot 网格容器组件
 * 移除 Run All、Run Selected 功能，实现卡片网格布局
 * 
 * Requirements: 3.1, 3.6, 13.9
 */
import { computed } from 'vue';
import { TransitionGroup } from 'vue';
import type { ProviderProfile, Slot, SharedState, PluginRequest } from '../../../../core/types';
import SlotCard from './SlotCard.vue';

const props = defineProps<{
  slots: Slot[];
  providerProfiles: ProviderProfile[];
  modelOptionsMap: Record<string, { id: string; label: string }[]>;
  refreshingModelsMap: Record<string, boolean>;
  streamOutput: boolean;
  defaultParams: SharedState['defaultParams'];
  // 用于构建 cURL 的请求构建函数
  buildRequestForSlot?: (slot: Slot) => PluginRequest;
  // 高亮的 Slot ID（用于导入动画）
  highlightedSlotId?: string | null;
  // 工具注册表
  toolRegistry?: Record<string, any>;
}>();

const emit = defineEmits<{
  addSlot: [];
  copySlot: [slot: Slot];
  removeSlot: [slotId: string];
  runSlot: [slot: Slot];
  stopSlot: [slotId: string];
  providerChange: [slot: Slot];
  refreshModels: [slot: Slot];
  'update:slot': [slot: Slot];
  executeToolCall: [slotId: string, toolCall: any];
}>();

// 是否可以删除 Slot（至少保留一个）
const canRemoveSlot = computed(() => props.slots.length > 1);

// 获取 Slot 的模型选项
function getModelOptions(slot: Slot) {
  if (!slot.providerProfileId) return [];
  return props.modelOptionsMap[slot.providerProfileId] || [];
}

// 获取 Slot 的刷新状态
function isRefreshingModels(slot: Slot) {
  if (!slot.providerProfileId) return false;
  return props.refreshingModelsMap[slot.providerProfileId] || false;
}

// 处理 Slot 更新
function handleSlotUpdate(slot: Slot) {
  emit('update:slot', slot);
}

// 为特定 slot 创建 buildRequest 函数
function createBuildRequestForSlot(slot: Slot) {
  return () => {
    if (props.buildRequestForSlot) {
      return props.buildRequestForSlot(slot);
    }
    // 返回空请求作为 fallback，考虑 Slot 级别的 stream 覆盖
    const slotStream = slot.paramOverride?.stream as boolean | undefined;
    return {
      systemPrompt: slot.systemPrompt,
      userPrompts: [],
      toolsDefinition: '',
      params: {},
      modelId: slot.modelId,
      enableSuggestions: false,
      stream: slotStream ?? props.streamOutput,
      messages: []
    };
  };
}
</script>

<template>
  <section class="slots-grid-section">
    
    <TransitionGroup 
      name="slot-card" 
      tag="div" 
      class="slots-grid"
      :class="{ 'single-slot': props.slots.length === 1 }"
    >
      <SlotCard
        v-for="slot in props.slots"
        :key="slot.id"
        :slot="slot"
        :provider-profiles="props.providerProfiles"
        :model-options="getModelOptions(slot)"
        :refreshing-models="isRefreshingModels(slot)"
        :stream-output="props.streamOutput"
        :disable-remove="!canRemoveSlot"
        :default-params="props.defaultParams"
        :build-request="createBuildRequestForSlot(slot)"
        :highlighted="props.highlightedSlotId === slot.id"
        :tool-registry="props.toolRegistry"
        @copy="emit('copySlot', $event)"
        @remove="emit('removeSlot', $event)"
        @run="emit('runSlot', $event)"
        @stop="emit('stopSlot', $event)"
        @provider-change="emit('providerChange', $event)"
        @refresh-models="emit('refreshModels', $event)"
        @update:slot="handleSlotUpdate"
        @execute-tool-call="(slotId, toolCall) => emit('executeToolCall', slotId, toolCall)"
      />
    </TransitionGroup>
    
    <div v-if="props.slots.length === 0" class="slots-empty">
      <p>暂无 Slot，点击上方按钮添加</p>
    </div>
  </section>
</template>

<style scoped>
.slots-grid-section {
  padding: 0;
  background: transparent;
}

.slots-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 0 4px;
}

.slots-title {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.title-icon { font-size: 16px; }

.slots-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.slots-grid.single-slot { grid-template-columns: 1fr; }

/* 卡片动画 */
.slot-card-enter-active { animation: card-in 150ms ease-out; }
.slot-card-leave-active {
  position: absolute;
  animation: card-out 100ms ease-in;
}
.slot-card-move { transition: transform 150ms ease-out; }

@keyframes card-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes card-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.95); }
}

.slots-empty {
  grid-column: 1 / -1;
  padding: 24px 12px;
  text-align: center;
  color: var(--text-tertiary);
}

@media (max-width: 1200px) {
  .slots-grid { grid-template-columns: 1fr; }
}
</style>
