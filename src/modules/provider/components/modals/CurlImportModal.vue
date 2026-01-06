<script setup lang="ts">
/**
 * CurlImportModal - cURL 导入弹窗组件
 * 
 * 功能：
 * - 粘贴 cURL 命令
 * - 选择目标项目（现有项目或创建新项目）
 * - 解析并导入配置
 */
import { ref, computed, watch } from 'vue';
import { Modal, Button, Space, Input, Select, Checkbox, Alert, message } from 'ant-design-vue';
import { ImportOutlined, PlusOutlined } from '@ant-design/icons-vue';
import type { ProjectMetadata, ProviderProfile } from '../../../../core/types';
import {
  parseCurl,
  detectPluginId,
  detectPluginName,
  extractModelAndMessages,
  findMatchingProvider,
  generateUniqueProviderName,
  CurlParseError,
} from '../../../../lib/curlParser';
import { newId } from '../../../../core/utils/id';

const { TextArea } = Input;

const props = defineProps<{
  open: boolean;
  projects: ProjectMetadata[];
  currentProjectId: string;
  providerProfiles: ProviderProfile[];
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  'import': [ImportResult];
  'createProject': [string];
}>();

// 导入结果类型
export interface ImportResult {
  targetProjectId: string;
  isNewProject: boolean;
  newProjectName?: string;
  provider: ProviderProfile & { isNew: boolean } | null;
  modelId: string | null;
  messages: Array<{ role: string; content: string }> | null;
  systemPrompt: string | null;
  promptsOnly: boolean;  // 只导入提示词，不处理 Provider
}

// 内部状态
const curlInput = ref('');
const targetProjectId = ref(props.currentProjectId);
const createNewProject = ref(false);
const newProjectName = ref('');
const promptsOnly = ref(false);  // 只导入提示词，不处理 Provider
const error = ref<string | null>(null);
const loading = ref(false);

// 项目选项
const projectOptions = computed(() => {
  const options = props.projects.map(p => ({
    value: p.id,
    label: p.name,
  }));
  return [
    ...options,
    { value: '__new__', label: '+ 创建新项目' },
  ];
});

// 重置状态
function resetState() {
  curlInput.value = '';
  targetProjectId.value = props.currentProjectId;
  createNewProject.value = false;
  newProjectName.value = '';
  promptsOnly.value = false;
  error.value = null;
  loading.value = false;
}

// 每次打开时重置
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    resetState();
    targetProjectId.value = props.currentProjectId;
  }
});

// 处理项目选择
function handleProjectChange(value: string) {
  if (value === '__new__') {
    createNewProject.value = true;
    targetProjectId.value = props.currentProjectId;
  } else {
    createNewProject.value = false;
    targetProjectId.value = value;
  }
}

// 关闭弹窗
function handleClose() {
  emit('update:open', false);
}

// 执行导入
async function handleImport() {
  error.value = null;
  
  // 验证输入
  const trimmedCurl = curlInput.value.trim();
  if (!trimmedCurl) {
    error.value = '请输入 cURL 命令';
    return;
  }

  // 验证新项目名称
  if (createNewProject.value && !newProjectName.value.trim()) {
    error.value = '请输入新项目名称';
    return;
  }

  loading.value = true;

  try {
    // 解析 cURL
    const parsed = parseCurl(trimmedCurl);
    
    // 调试日志
    console.log('[CurlImportModal] parsed:', parsed);
    console.log('[CurlImportModal] parsed.apiKey:', parsed.apiKey ? '***' : '(empty)');
    
    // 检测插件类型
    const pluginId = detectPluginId(parsed.url);
    const pluginName = detectPluginName(parsed.url);
    
    // 提取模型和消息
    const { modelId, messages, systemPrompt } = extractModelAndMessages(parsed.body);
    
    // 只导入提示词模式：不处理 Provider
    if (promptsOnly.value) {
      // 确定目标项目 ID
      const finalProjectId = createNewProject.value 
        ? '__new__' 
        : targetProjectId.value;

      const result: ImportResult = {
        targetProjectId: finalProjectId,
        isNewProject: createNewProject.value,
        newProjectName: createNewProject.value ? newProjectName.value.trim() : undefined,
        provider: null,
        modelId: null,
        messages,
        systemPrompt,
        promptsOnly: true,
      };

      emit('import', result);
      message.success(`导入成功！已导入${systemPrompt ? '系统提示词' : ''}${systemPrompt && messages?.length ? '和' : ''}${messages?.length ? '用户消息' : ''}`);
      handleClose();
      return;
    }

    // 查找或创建 Provider（匹配 baseUrl、pluginId 和 apiKey）
    const existingProvider = findMatchingProvider(
      props.providerProfiles,
      parsed.url,
      pluginId,
      parsed.apiKey
    );

    let provider: ProviderProfile & { isNew: boolean };
    
    if (existingProvider) {
      // 复用现有 Provider（完全匹配）
      provider = {
        ...existingProvider,
        isNew: false,
      };
    } else {
      // 创建新 Provider
      const existingNames = props.providerProfiles.map(p => p.name);
      const providerName = generateUniqueProviderName(existingNames, pluginName);
      
      provider = {
        id: newId(),
        name: providerName,
        apiKey: parsed.apiKey || '',
        baseUrl: parsed.url,
        pluginId,
        isNew: true,
      };
    }

    // 确定目标项目 ID
    const finalProjectId = createNewProject.value 
      ? '__new__' 
      : targetProjectId.value;

    // 构建导入结果
    const result: ImportResult = {
      targetProjectId: finalProjectId,
      isNewProject: createNewProject.value,
      newProjectName: createNewProject.value ? newProjectName.value.trim() : undefined,
      provider,
      modelId,
      messages,
      systemPrompt,
      promptsOnly: false,
    };

    // 发送导入事件
    emit('import', result);
    
    // 显示成功消息
    const providerStatus = provider.isNew ? '创建' : '复用';
    message.success(`导入成功！${providerStatus} Provider: ${provider.name}${modelId ? `，模型: ${modelId}` : ''}`);
    
    // 关闭弹窗
    handleClose();
  } catch (err) {
    if (err instanceof CurlParseError) {
      error.value = err.message;
    } else {
      error.value = `解析失败: ${err instanceof Error ? err.message : '未知错误'}`;
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <Modal
    :open="props.open"
    title="导入 cURL"
    :width="700"
    @cancel="handleClose"
    class="curl-import-modal"
  >
    <div class="import-form">
      <!-- 错误提示 -->
      <Alert
        v-if="error"
        :message="error"
        type="error"
        show-icon
        closable
        @close="error = null"
        class="error-alert"
      />

      <!-- cURL 输入 -->
      <div class="form-item">
        <label class="form-label">cURL 命令</label>
        <TextArea
          v-model:value="curlInput"
          placeholder="粘贴 cURL 命令，例如：curl -H 'Authorization: Bearer sk-xxx' -d '{...}' https://api.openai.com/v1/chat/completions"
          :rows="8"
          :disabled="loading"
          class="curl-input"
        />
      </div>

      <!-- 项目选择 -->
      <div class="form-item">
        <label class="form-label">目标项目</label>
        <Select
          :value="createNewProject ? '__new__' : targetProjectId"
          :options="projectOptions"
          :disabled="loading"
          style="width: 100%"
          :getPopupContainer="(triggerNode: HTMLElement) => triggerNode.parentNode as HTMLElement"
          @change="handleProjectChange"
        />
      </div>

      <!-- 新项目名称 -->
      <div v-if="createNewProject" class="form-item">
        <label class="form-label">新项目名称</label>
        <Input
          v-model:value="newProjectName"
          placeholder="输入新项目名称"
          :disabled="loading"
        />
      </div>

      <!-- 导入选项 -->
      <div class="form-item">
        <Checkbox
          v-model:checked="promptsOnly"
          :disabled="loading"
        >
          只导入提示词（不创建/匹配 Provider）
        </Checkbox>
      </div>

      <!-- 提示信息 -->
      <div class="import-tips">
        <p>💡 导入说明：</p>
        <ul>
          <li>系统会自动检测 API 类型（OpenAI、Gemini、通义等）</li>
          <li>仅当 URL、插件类型和 API Key 完全相同时才复用现有 Provider</li>
          <li>导入后会自动配置一个 Slot 使用该 Provider</li>
          <li>勾选"只导入提示词"可仅导入系统提示词和用户消息到当前 Slot</li>
        </ul>
      </div>
    </div>

    <template #footer>
      <Space>
        <Button @click="handleClose" :disabled="loading">取消</Button>
        <Button 
          type="primary" 
          :loading="loading"
          @click="handleImport"
        >
          <template #icon><ImportOutlined /></template>
          导入
        </Button>
      </Space>
    </template>
  </Modal>
</template>

<style scoped>
.import-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-weight: 500;
  color: var(--text-primary);
}

.curl-input {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
}

.error-alert {
  margin-bottom: 8px;
}

.import-tips {
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.import-tips p {
  margin: 0 0 8px 0;
  font-weight: 500;
}

.import-tips ul {
  margin: 0;
  padding-left: 20px;
}

.import-tips li {
  margin-bottom: 4px;
}
</style>
