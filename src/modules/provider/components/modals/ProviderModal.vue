<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { Modal, Button, Space, Input, Select, Form, FormItem, List, ListItem, ListItemMeta, Popconfirm, Upload, message } from 'ant-design-vue';
import { DeleteOutlined, EditOutlined, ExportOutlined, ImportOutlined, PlusOutlined } from '@ant-design/icons-vue';
import type { ProviderProfile, ProviderProfileDraft, Plugin } from '../../../../core/types';
import { newId } from '../../../../core/utils/id';

const props = defineProps<{
  open: boolean;
  plugins: Plugin[];
  providerProfiles: ProviderProfile[];
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  add: [ProviderProfile];
  remove: [string];
  export: [];
  import: [File];
  clearKeys: [];
}>();

const newProfile = reactive<ProviderProfileDraft>({
  name: '',
  apiKey: '',
  baseUrl: '',
  pluginId: props.plugins[0]?.id || ''
});

const defaultBaseUrl = computed(() => {
  const plugin = props.plugins.find(p => p.id === newProfile.pluginId);
  return plugin?.defaultBaseUrl || 'https://api.openai.com/v1/chat/completions';
});

function resetForm() {
  newProfile.name = '';
  newProfile.apiKey = '';
  newProfile.baseUrl = '';
  newProfile.pluginId = props.plugins[0]?.id || '';
}

function handleAdd() {
  if (!newProfile.name.trim()) {
    message.warning('请填写 Provider 名称');
    return;
  }
  const profile: ProviderProfile = {
    id: newId(),
    name: newProfile.name.trim(),
    apiKey: newProfile.apiKey.trim(),
    baseUrl: newProfile.baseUrl.trim() || defaultBaseUrl.value,
    pluginId: newProfile.pluginId
  };
  emit('add', profile);
  resetForm();
}

function handleRemove(id: string) {
  emit('remove', id);
}

function handleClose() {
  emit('update:open', false);
}

function handleExport() {
  emit('export');
}

function handleImport(file: File) {
  emit('import', file);
  return false;
}

const pluginOptions = computed(() => 
  props.plugins.map(p => ({ value: p.id, label: p.name }))
);
</script>

<template>
  <Modal
    :open="props.open"
    title="Provider 管理"
    :width="640"
    @cancel="handleClose"
    :footer="null"
    class="provider-modal"
  >
    <div class="provider-section">
      <div class="section-title">已保存的 Provider</div>
      <List
        :dataSource="props.providerProfiles"
        :locale="{ emptyText: '暂无 Provider' }"
        size="small"
        class="provider-list"
      >
        <template #renderItem="{ item }">
          <ListItem class="provider-item">
            <ListItemMeta>
              <template #title>{{ (item as ProviderProfile).name }}</template>
              <template #description>
                {{ props.plugins.find(p => p.id === (item as ProviderProfile).pluginId)?.name }}
                · {{ (item as ProviderProfile).baseUrl }}
              </template>
            </ListItemMeta>
            <template #actions>
              <Popconfirm
                title="确定删除此 Provider？"
                description="引用它的 Slot 将自动切换到其他 Provider"
                @confirm="handleRemove((item as ProviderProfile).id)"
              >
                <Button type="text" danger size="small">
                  <template #icon><DeleteOutlined /></template>
                </Button>
              </Popconfirm>
            </template>
          </ListItem>
        </template>
      </List>
    </div>

    <div class="provider-section">
      <div class="section-title">添加新 Provider</div>
      <Form layout="vertical" class="add-form">
        <FormItem label="名称" required>
          <Input v-model:value="newProfile.name" placeholder="例如：OpenAI GPT-4" />
        </FormItem>
        <FormItem label="插件">
          <Select
            v-model:value="newProfile.pluginId"
            :options="pluginOptions"
            style="width: 100%"
          />
        </FormItem>
        <FormItem label="Base URL">
          <Input
            v-model:value="newProfile.baseUrl"
            :placeholder="defaultBaseUrl"
          />
        </FormItem>
        <FormItem label="API Key">
          <Input.Password
            v-model:value="newProfile.apiKey"
            placeholder="sk-..."
          />
        </FormItem>
        <FormItem>
          <Button type="primary" @click="handleAdd">
            <template #icon><PlusOutlined /></template>
            添加 Provider
          </Button>
        </FormItem>
      </Form>
    </div>
    
    <div class="provider-actions">
      <Space>
        <Button @click="handleExport">
          <template #icon><ExportOutlined /></template>
          导出
        </Button>
        <Upload
          :beforeUpload="handleImport"
          :showUploadList="false"
          accept=".zip"
        >
          <Button>
            <template #icon><ImportOutlined /></template>
            导入
          </Button>
        </Upload>
        <Popconfirm
          title="确定清空所有 API Key？"
          description="此操作不会删除 Provider 条目"
          @confirm="emit('clearKeys')"
        >
          <Button danger>清空 API Key</Button>
        </Popconfirm>
      </Space>
    </div>
  </Modal>
</template>

<style scoped>
.provider-modal :deep(.ant-modal-body) {
  max-height: 70vh;
  overflow-y: auto;
}

.provider-section {
  margin-bottom: 24px;
}

.section-title {
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.provider-list {
  background: var(--bg);
  border-radius: 8px;
  padding: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.provider-item {
  padding: 8px 12px;
}

.add-form {
  background: var(--bg);
  border-radius: 8px;
  padding: 16px;
}

.provider-actions {
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
</style>
