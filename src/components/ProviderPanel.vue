<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Alert,
  Button,
  Checkbox,
  Col,
  Drawer,
  Form,
  Input,
  List,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'ant-design-vue';
import type { UploadProps } from 'ant-design-vue';
import type { Plugin, ProviderProfile, ProviderProfileDraft, GatewayConfig, GatewayProvider } from '../types';
import { getAuthStatus, startOAuthLogin, logout, DEFAULT_AUTHORIZE_ENDPOINT, DEFAULT_TOKEN_ENDPOINT, DEFAULT_REDIRECT_PATH } from '../lib/oauth';
import { fetchGatewayProviders, createProviderFromGateway } from '../lib/gatewayPlugin';
import { newId } from '../lib/id';

const { Password: InputPassword } = Input;
const { Title: TypographyTitle, Text: TypographyText } = Typography;
const FormItem = Form.Item;

const props = defineProps<{
  plugins: Plugin[];
  providerProfiles: ProviderProfile[];
  newProfile: ProviderProfileDraft;
  defaultProviderTemplate: string;
  // Project-level gateway config
  currentProjectId: string;
  gatewayConfig?: GatewayConfig;
  onResetNewProfile: () => void;
  onAddProfile: () => void;
  onRemoveProfile: (id: string) => void;
  onExportProviders: () => void;
  onImportProviders: (file: File) => void;
  onClearKeys: () => void;
  // Gateway operations
  onSaveGatewayConfig: (config: GatewayConfig) => void;
  onDisconnectGateway: () => void;
  onImportGatewayProviders: (providers: ProviderProfile[]) => void;
}>();

const emit = defineEmits<{
  close: [];
  'profile-updated': [profile: ProviderProfile];
}>();

// Gateway config form state
const gatewayBaseUrl = ref(props.gatewayConfig?.baseUrl || '');
const gatewayClientId = ref(props.gatewayConfig?.clientId || '');
const gatewayAuthorizeEndpoint = ref(props.gatewayConfig?.authorizeEndpoint || DEFAULT_AUTHORIZE_ENDPOINT);
const gatewayTokenEndpoint = ref(props.gatewayConfig?.tokenEndpoint || DEFAULT_TOKEN_ENDPOINT);
const gatewayRedirectPath = ref(props.gatewayConfig?.redirectPath || DEFAULT_REDIRECT_PATH);
const showGatewayConfigForm = ref(false);
const showAdvancedConfig = ref(false);

// Provider import state
const showImportModal = ref(false);
const importLoading = ref(false);
const availableProviders = ref<GatewayProvider[]>([]);
const selectedProviderIds = ref<string[]>([]);

// Watch for gateway config changes
watch(() => props.gatewayConfig, (config) => {
  if (config) {
    gatewayBaseUrl.value = config.baseUrl;
    gatewayClientId.value = config.clientId;
    gatewayAuthorizeEndpoint.value = config.authorizeEndpoint || DEFAULT_AUTHORIZE_ENDPOINT;
    gatewayTokenEndpoint.value = config.tokenEndpoint || DEFAULT_TOKEN_ENDPOINT;
    gatewayRedirectPath.value = config.redirectPath || DEFAULT_REDIRECT_PATH;
  }
}, { immediate: true });

const pluginOptions = computed(() =>
  props.plugins.map((plugin) => ({
    label: plugin.name,
    value: plugin.id,
  }))
);

const pluginLookup = computed(() =>
  props.plugins.reduce<Record<string, string>>((acc, plugin) => {
    acc[plugin.id] = plugin.name;
    return acc;
  }, {})
);

// Check if gateway is configured
const hasGatewayConfig = computed(() => {
  return props.gatewayConfig?.enabled && props.gatewayConfig?.baseUrl;
});

// Get auth status for the current project
const authStatus = computed(() => {
  if (!hasGatewayConfig.value) return 'logged_out';
  return getAuthStatus(props.currentProjectId);
});

// Separate local and gateway providers
const localProviders = computed(() => 
  props.providerProfiles.filter(p => !p.gatewayProviderId)
);

const gatewayProviders = computed(() => 
  props.providerProfiles.filter(p => !!p.gatewayProviderId)
);

// Already imported gateway provider IDs
const importedGatewayProviderIds = computed(() => 
  new Set(gatewayProviders.value.map(p => p.gatewayProviderId))
);

const tableColumns = [
  {
    title: '名称',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: '来源',
    key: 'source',
    width: 100,
  },
  {
    title: '模型协议',
    dataIndex: 'pluginId',
    key: 'plugin',
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
  },
];

const tableLocale = {
  emptyText: '暂无 Provider，请添加本地 Provider 或从网关导入。',
};

const handleImportBeforeUpload: UploadProps['beforeUpload'] = (file) => {
  const realFile = (file as any).originFileObj ?? (file as unknown as File);
  if (realFile) {
    props.onImportProviders(realFile);
  }
  return false;
};

// Gateway config validation
const isGatewayConfigValid = computed(() => {
  return (
    gatewayBaseUrl.value.trim() !== '' &&
    gatewayClientId.value.trim() !== ''
  );
});

// Show gateway config form
function handleShowGatewayConfig() {
  showGatewayConfigForm.value = true;
}

// Save gateway config
function handleSaveGatewayConfig() {
  if (!isGatewayConfigValid.value) return;
  
  const config: GatewayConfig = {
    enabled: true,
    baseUrl: gatewayBaseUrl.value.trim(),
    clientId: gatewayClientId.value.trim(),
    authorizeEndpoint: gatewayAuthorizeEndpoint.value.trim() || DEFAULT_AUTHORIZE_ENDPOINT,
    tokenEndpoint: gatewayTokenEndpoint.value.trim() || DEFAULT_TOKEN_ENDPOINT,
    redirectPath: gatewayRedirectPath.value.trim() || DEFAULT_REDIRECT_PATH,
  };
  
  props.onSaveGatewayConfig(config);
  showGatewayConfigForm.value = false;
  showAdvancedConfig.value = false;
}

// Cancel gateway config
function handleCancelGatewayConfig() {
  // Reset to saved values
  gatewayBaseUrl.value = props.gatewayConfig?.baseUrl || '';
  gatewayClientId.value = props.gatewayConfig?.clientId || '';
  gatewayAuthorizeEndpoint.value = props.gatewayConfig?.authorizeEndpoint || DEFAULT_AUTHORIZE_ENDPOINT;
  gatewayTokenEndpoint.value = props.gatewayConfig?.tokenEndpoint || DEFAULT_TOKEN_ENDPOINT;
  gatewayRedirectPath.value = props.gatewayConfig?.redirectPath || DEFAULT_REDIRECT_PATH;
  showGatewayConfigForm.value = false;
  showAdvancedConfig.value = false;
}

// Handle gateway login
async function handleGatewayLogin() {
  if (!props.gatewayConfig) return;
  await startOAuthLogin(props.gatewayConfig, props.currentProjectId);
}

// Handle gateway logout
function handleGatewayLogout() {
  logout(props.currentProjectId);
  // Force re-render
  emit('profile-updated', {} as ProviderProfile);
}

// Handle disconnect gateway
function handleDisconnectGateway() {
  Modal.confirm({
    title: '断开网关连接',
    content: '断开后将清除网关配置和登录状态，但已导入的 Provider 会保留。确定继续吗？',
    okText: '确定',
    cancelText: '取消',
    onOk: () => {
      props.onDisconnectGateway();
    },
  });
}

// Open import modal
async function handleOpenImportModal() {
  if (!props.gatewayConfig || authStatus.value !== 'logged_in') return;
  
  importLoading.value = true;
  showImportModal.value = true;
  selectedProviderIds.value = [];
  
  try {
    availableProviders.value = await fetchGatewayProviders(
      props.gatewayConfig,
      props.currentProjectId
    );
  } catch (err) {
    console.error('Failed to fetch providers:', err);
    Modal.error({
      title: '获取 Provider 列表失败',
      content: err instanceof Error ? err.message : '未知错误',
    });
    showImportModal.value = false;
  } finally {
    importLoading.value = false;
  }
}

// Handle provider selection
function handleProviderSelect(providerId: string, checked: boolean) {
  if (checked) {
    selectedProviderIds.value = [...selectedProviderIds.value, providerId];
  } else {
    selectedProviderIds.value = selectedProviderIds.value.filter(id => id !== providerId);
  }
}

// Select all providers
function handleSelectAll() {
  const notImported = availableProviders.value
    .filter(p => !importedGatewayProviderIds.value.has(p.id))
    .map(p => p.id);
  selectedProviderIds.value = notImported;
}

// Deselect all
function handleDeselectAll() {
  selectedProviderIds.value = [];
}

// Import selected providers
function handleImportProviders() {
  if (!props.gatewayConfig || selectedProviderIds.value.length === 0) return;
  
  const selectedProviders = availableProviders.value.filter(
    p => selectedProviderIds.value.includes(p.id)
  );
  
  const newProfiles: ProviderProfile[] = selectedProviders.map(provider => ({
    ...createProviderFromGateway(provider, props.gatewayConfig!.baseUrl),
    id: newId(),
  }));
  
  props.onImportGatewayProviders(newProfiles);
  showImportModal.value = false;
  selectedProviderIds.value = [];
}

// Check if form is valid for adding local provider
const isFormValid = computed(() => {
  if (!props.newProfile.name.trim()) return false;
  return true;
});
</script>

<template>
  <Drawer
    :open="true"
    title="Provider 管理"
    placement="right"
    :width="720"
    :maskClosable="true"
    @close="emit('close')"
    :footer-style="{ textAlign: 'right' }"
  >
    <template #extra>
      <Space>
        <Upload accept=".zip" :show-upload-list="false" :before-upload="handleImportBeforeUpload">
          <Button type="link" size="small">导入配置</Button>
        </Upload>
        <Button type="link" size="small" @click="props.onExportProviders">导出配置</Button>
        <Button type="link" size="small" danger @click="props.onClearKeys">清空密钥</Button>
      </Space>
    </template>

    <!-- Gateway Section -->
    <div style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <TypographyTitle :level="5" style="margin: 0;">网关连接</TypographyTitle>
        <Space v-if="hasGatewayConfig && !showGatewayConfigForm">
          <Button type="link" size="small" @click="handleShowGatewayConfig">修改配置</Button>
          <Button type="link" size="small" danger @click="handleDisconnectGateway">断开连接</Button>
        </Space>
      </div>

      <!-- Gateway config form -->
      <template v-if="showGatewayConfigForm || !hasGatewayConfig">
        <Form layout="vertical" style="padding: 16px; background: var(--bg-secondary); border-radius: 8px;">
          <Row :gutter="[16, 0]">
            <Col :span="12">
              <FormItem label="网关地址" required>
                <Input 
                  v-model:value="gatewayBaseUrl" 
                  placeholder="如：https://admin.example.com"
                />
              </FormItem>
            </Col>
            <Col :span="12">
              <FormItem label="Client ID" required>
                <Input 
                  v-model:value="gatewayClientId" 
                  placeholder="OAuth Client ID"
                />
              </FormItem>
            </Col>
          </Row>
          
          <!-- Advanced config toggle -->
          <div style="margin-bottom: 12px;">
            <Button type="link" size="small" @click="showAdvancedConfig = !showAdvancedConfig" style="padding: 0;">
              {{ showAdvancedConfig ? '收起高级配置' : '展开高级配置' }}
            </Button>
          </div>
          
          <!-- Advanced OAuth config -->
          <template v-if="showAdvancedConfig">
            <Row :gutter="[16, 0]">
              <Col :span="8">
                <FormItem label="授权端点">
                  <Input 
                    v-model:value="gatewayAuthorizeEndpoint" 
                    :placeholder="DEFAULT_AUTHORIZE_ENDPOINT"
                  />
                </FormItem>
              </Col>
              <Col :span="8">
                <FormItem label="Token 端点">
                  <Input 
                    v-model:value="gatewayTokenEndpoint" 
                    :placeholder="DEFAULT_TOKEN_ENDPOINT"
                  />
                </FormItem>
              </Col>
              <Col :span="8">
                <FormItem label="回调路径">
                  <Input 
                    v-model:value="gatewayRedirectPath" 
                    :placeholder="DEFAULT_REDIRECT_PATH"
                  />
                </FormItem>
              </Col>
            </Row>
          </template>
          
          <FormItem style="margin-bottom: 0;">
            <Space>
              <Button 
                v-if="hasGatewayConfig"
                @click="handleCancelGatewayConfig"
              >
                取消
              </Button>
              <Button 
                type="primary" 
                @click="handleSaveGatewayConfig"
                :disabled="!isGatewayConfigValid"
              >
                {{ hasGatewayConfig ? '保存配置' : '连接网关' }}
              </Button>
            </Space>
          </FormItem>
        </Form>
      </template>

      <!-- Gateway status and actions -->
      <template v-else>
        <div style="padding: 12px 16px; background: var(--bg-secondary); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <Space>
              <TypographyText type="secondary">{{ gatewayConfig?.baseUrl }}</TypographyText>
              <template v-if="authStatus === 'logged_in'">
                <Tag color="success">已登录</Tag>
              </template>
              <template v-else-if="authStatus === 'expired'">
                <Tag color="warning">已过期</Tag>
              </template>
              <template v-else>
                <Tag color="default">未登录</Tag>
              </template>
            </Space>
            <Space>
              <template v-if="authStatus === 'logged_in'">
                <Button type="primary" size="small" @click="handleOpenImportModal">
                  导入 Provider
                </Button>
                <Button size="small" @click="handleGatewayLogout">登出</Button>
              </template>
              <template v-else>
                <Button type="primary" size="small" @click="handleGatewayLogin">
                  {{ authStatus === 'expired' ? '重新登录' : '登录' }}
                </Button>
              </template>
            </Space>
          </div>
        </div>
      </template>
    </div>

    <!-- Local Provider Section -->
    <div style="margin-bottom: 24px;">
      <TypographyTitle :level="5" style="margin-bottom: 12px;">添加本地 Provider</TypographyTitle>
      <Alert
        type="info"
        show-icon
        style="margin-bottom: 12px;"
      >
        <template #description>
          API Key 会以明文形式保存在本机浏览器中
        </template>
      </Alert>
      
      <Form layout="vertical">
        <Row :gutter="[16, 0]">
          <Col :span="12">
            <FormItem label="名称">
              <Input v-model:value="props.newProfile.name" placeholder="如：OpenAI 生产环境" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="模型协议">
              <Select 
                v-model:value="props.newProfile.pluginId" 
                :options="pluginOptions" 
                placeholder="选择模型协议"
              />
            </FormItem>
          </Col>
        </Row>

        <Row :gutter="[16, 0]">
          <Col :span="12">
            <FormItem label="Base URL">
              <Input v-model:value="props.newProfile.baseUrl" :placeholder="props.defaultProviderTemplate" title="未填写则使用默认值" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="API Key">
              <InputPassword v-model:value="props.newProfile.apiKey" autocomplete="off" placeholder="存储在本地" />
            </FormItem>
          </Col>
        </Row>

        <FormItem style="margin-bottom: 0;">
          <Space>
            <Button @click="props.onResetNewProfile">重置</Button>
            <Button 
              type="primary" 
              @click="props.onAddProfile"
              :disabled="!isFormValid"
            >
              添加 Provider
            </Button>
          </Space>
        </FormItem>
      </Form>
    </div>

    <!-- Provider List -->
    <div>
      <TypographyTitle :level="5" style="margin-bottom: 12px;">Provider 列表</TypographyTitle>
      <Table
        :columns="tableColumns"
        :data-source="props.providerProfiles"
        row-key="id"
        size="middle"
        :scroll="{ y: 280 }"
        :pagination="false"
        :locale="tableLocale"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'source'">
            <Tag v-if="(record as ProviderProfile).gatewayProviderId" color="green">网关</Tag>
            <Tag v-else color="blue">本地</Tag>
          </template>
          <template v-else-if="column.key === 'plugin'">
            <template v-if="(record as ProviderProfile).gatewayProviderId">
              OpenAI Compatible
            </template>
            <template v-else>
              {{ pluginLookup[(record as ProviderProfile).pluginId] || '未知' }}
            </template>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button 
              type="link" 
              danger 
              size="small" 
              @click="props.onRemoveProfile((record as ProviderProfile).id)"
            >
              删除
            </Button>
          </template>
        </template>
      </Table>
    </div>

    <template #footer>
      <Button type="primary" @click="emit('close')">关闭</Button>
    </template>
  </Drawer>

  <!-- Import Provider Modal -->
  <Modal
    v-model:open="showImportModal"
    title="导入网关 Provider"
    :width="500"
    :footer="null"
  >
    <div v-if="importLoading" style="text-align: center; padding: 24px;">
      加载中...
    </div>
    <template v-else>
      <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <TypographyText type="secondary">
          选择要导入的 Provider（已导入的会显示为禁用状态）
        </TypographyText>
        <Space>
          <Button type="link" size="small" @click="handleSelectAll">全选</Button>
          <Button type="link" size="small" @click="handleDeselectAll">取消全选</Button>
        </Space>
      </div>
      
      <List
        :data-source="availableProviders"
        :bordered="true"
        size="small"
        style="max-height: 300px; overflow-y: auto;"
      >
        <template #renderItem="{ item }">
          <List.Item>
            <Checkbox
              :checked="selectedProviderIds.includes((item as GatewayProvider).id)"
              :disabled="importedGatewayProviderIds.has((item as GatewayProvider).id)"
              @change="(e: any) => handleProviderSelect((item as GatewayProvider).id, e.target.checked)"
            >
              <span>{{ (item as GatewayProvider).name }}</span>
              <Tag 
                v-if="importedGatewayProviderIds.has((item as GatewayProvider).id)" 
                color="default" 
                style="margin-left: 8px;"
              >
                已导入
              </Tag>
            </Checkbox>
          </List.Item>
        </template>
      </List>
      
      <div style="margin-top: 16px; text-align: right;">
        <Space>
          <Button @click="showImportModal = false">取消</Button>
          <Button 
            type="primary" 
            :disabled="selectedProviderIds.length === 0"
            @click="handleImportProviders"
          >
            导入 ({{ selectedProviderIds.length }})
          </Button>
        </Space>
      </div>
    </template>
  </Modal>
</template>
