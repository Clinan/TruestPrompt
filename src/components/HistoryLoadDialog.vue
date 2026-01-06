<script setup lang="ts">
import { Button, Checkbox, Col, Modal, Row, Space, Typography } from 'ant-design-vue';
import type { HistoryItem } from '../core/types';

const { Text } = Typography;

export type HistoryLoadOptions = {
  provider: boolean;
  model: boolean;
  systemPrompt: boolean;
  params: boolean;
  userPrompts: boolean;
  tools: boolean;
  output: boolean;
  metrics: boolean;
};

const props = defineProps<{
  open: boolean;
  item: HistoryItem | null;
  options: HistoryLoadOptions;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<template>
  <Modal
    :open="props.open"
    title="载入历史"
    :width="560"
    :mask-closable="true"
    @cancel="emit('close')"
    :footer="null"
  >
    <Space direction="vertical" size="middle" style="width: 100%">
      <Text type="secondary">勾选要覆盖的内容（未勾选则保留当前编辑器内容）。</Text>

      <Space v-if="props.item" direction="vertical" size="small">
        <Text type="secondary">标题：{{ props.item.title }}</Text>
        <Text type="secondary">时间：{{ new Date(props.item.createdAt).toLocaleString() }}</Text>
        <Text type="secondary">模型：{{ props.item.requestSnapshot.modelId }}</Text>
      </Space>

      <Row :gutter="[12, 12]">
        <Col :span="12">
          <Checkbox v-model:checked="props.options.provider">Provider</Checkbox>
        </Col>
        <Col :span="12">
          <Checkbox v-model:checked="props.options.model">Model</Checkbox>
        </Col>
        <Col :span="12">
          <Checkbox v-model:checked="props.options.systemPrompt" disabled>System Prompt（必选）</Checkbox>
        </Col>
        <Col :span="12">
          <Checkbox v-model:checked="props.options.params">参数（写入当前 Slot 参数）</Checkbox>
        </Col>
        <Col :span="12">
          <Checkbox v-model:checked="props.options.userPrompts">User Prompts</Checkbox>
        </Col>
        <Col :span="12">
          <Checkbox v-model:checked="props.options.tools">Tools</Checkbox>
        </Col>
        <Col :span="12">
          <Checkbox v-model:checked="props.options.output">响应结果（输出文本）</Checkbox>
        </Col>
        <Col :span="12">
          <Checkbox v-model:checked="props.options.metrics">耗时/用量</Checkbox>
        </Col>
      </Row>

      <Text type="secondary">提示：将优先写入“已选中”的 Slot（否则写入第一个 Slot）。</Text>

      <Space style="justify-content: flex-end; width: 100%">
        <Button @click="emit('close')">取消</Button>
        <Button type="primary" @click="emit('confirm')">确定载入</Button>
      </Space>
    </Space>
  </Modal>
</template>
