<script setup lang="ts">
import { computed } from 'vue';
import { Button } from 'ant-design-vue';
import type { ProviderProfile, Slot, SharedState } from '../core/types';
import SlotCard from './SlotCard.vue';

const props = defineProps<{
  slots: Slot[];
  providerProfiles: ProviderProfile[];
  streamOutput: boolean;
  refreshingModelsBySlotId: Record<string, boolean>;
  modelOptions: (slot: Slot) => { id: string; label: string }[];
  defaultParams: SharedState['defaultParams'];
  showParamDiffOnly: boolean;
}>();

const emit = defineEmits<{
  copy: [slot: Slot];
  remove: [slotId: string];
  run: [slot: Slot];
  stop: [slotId: string];
  exportCurl: [slot: Slot];
  providerChange: [slot: Slot];
  refreshModels: [slot: Slot];
  runSelected: [];
  runAll: [];
  stopAll: [];
}>();

const hasRunning = computed(() => props.slots.some((slot) => slot.status === 'running'));
const selectedCount = computed(() => props.slots.filter((slot) => slot.selected).length);
</script>

<template>
  <div class="slots-lab">
    <div class="slots-lab__head">
      <div>
        <div class="panel-title">Slots Lab</div>
        <div class="panel-subtitle">多模型并行运行的一站式调试区。</div>
      </div>
      <div class="slots-head__actions">
        <div class="slots-actions-row">
          <Button
            class="slots-action-btn slots-action-btn--ghost"
            :disabled="hasRunning || selectedCount === 0"
            @click="emit('runSelected')"
          >
            运行已选
          </Button>
          <Button 
            class="slots-action-btn slots-action-btn--primary" 
            :disabled="hasRunning" 
            @click="emit('runAll')"
          >
            运行全部
          </Button>
          <Button 
            class="slots-action-btn slots-action-btn--danger" 
            :disabled="!hasRunning" 
            @click="emit('stopAll')"
          >
            停止全部
          </Button>
        </div>
      </div>
    </div>

    <div class="slot-grid">
      <SlotCard
        v-for="slot in props.slots"
        :key="slot.id"
        :slot="slot"
        :providerProfiles="props.providerProfiles"
        :modelOptions="props.modelOptions(slot)"
        :refreshingModels="!!props.refreshingModelsBySlotId[slot.id]"
        :streamOutput="props.streamOutput"
        :disableRemove="props.slots.length === 1"
        :defaultParams="props.defaultParams"
        :showParamDiffOnly="props.showParamDiffOnly"
        @copy="emit('copy', $event)"
        @remove="emit('remove', $event)"
        @run="emit('run', $event)"
        @stop="emit('stop', $event)"
        @export-curl="emit('exportCurl', $event)"
        @provider-change="emit('providerChange', $event)"
        @refresh-models="emit('refreshModels', $event)"
      />
    </div>
  </div>
</template>
