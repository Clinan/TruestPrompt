<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { Button, Select, Space, Tooltip, Divider, Dropdown, Menu, MenuItem, MenuDivider } from 'ant-design-vue';
import {
  ApiOutlined,
  SettingOutlined,
  ToolOutlined,
  FieldStringOutlined,
  HistoryOutlined,
  BulbOutlined,
  BulbFilled,
  AppstoreAddOutlined,
  MessageOutlined,
  PauseCircleOutlined,
  ImportOutlined,
  MenuOutlined,
  ShareAltOutlined
} from '@ant-design/icons-vue';

const props = defineProps<{
  projectOptions: { id: string; label: string }[];
  selectedProject: string;
  theme: 'light' | 'dark';
  hasRunningSlots: boolean;
  gatewayConfig?: { enabled: boolean; baseUrl: string; clientId: string } | null;
}>();

const emit = defineEmits<{
  'update:selectedProject': [string];
  openProvider: [];
  openParams: [];
  openTools: [];
  openVars: [];
  openHistory: [];
  toggleTheme: [];
  addSlot: [];
  addMessage: [];
  stopAll: [];
  importCurl: [];
  shareProject: [];
}>();

const themeIcon = computed(() => props.theme === 'light' ? BulbOutlined : BulbFilled);
const themeTooltip = computed(() => props.theme === 'light' ? '切换为暗色主题' : '切换为浅色主题');

// 响应式菜单状态 - 基于实际内容宽度判断
const isCompact = ref(false);
const toolbarRef = ref<HTMLElement | null>(null);
const toolbarLeftRef = ref<HTMLElement | null>(null);
const toolbarCenterRef = ref<HTMLElement | null>(null);
const toolbarRightRef = ref<HTMLElement | null>(null);

// 额外的安全边距
const PADDING_BUFFER = 32;

function checkOverflow() {
  if (!toolbarRef.value || !toolbarLeftRef.value || !toolbarCenterRef.value || !toolbarRightRef.value) {
    return;
  }
  
  const containerWidth = toolbarRef.value.clientWidth;
  const leftWidth = toolbarLeftRef.value.scrollWidth;
  const centerWidth = toolbarCenterRef.value.scrollWidth;
  const rightWidth = toolbarRightRef.value.scrollWidth;
  
  const totalNeeded = leftWidth + centerWidth + rightWidth + PADDING_BUFFER;
  
  isCompact.value = totalNeeded > containerWidth;
}

// 使用 ResizeObserver 监听容器大小变化
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  nextTick(() => {
    checkOverflow();
  });
  
  resizeObserver = new ResizeObserver(() => {
    // 临时切换到展开模式来测量真实宽度
    const wasCompact = isCompact.value;
    if (wasCompact) {
      isCompact.value = false;
      nextTick(() => {
        checkOverflow();
      });
    } else {
      checkOverflow();
    }
  });
  
  if (toolbarRef.value) {
    resizeObserver.observe(toolbarRef.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

// 菜单项点击处理
function handleMenuClick(key: string) {
  switch (key) {
    case 'addSlot':
      emit('addSlot');
      break;
    case 'addMessage':
      emit('addMessage');
      break;
    case 'stopAll':
      emit('stopAll');
      break;
    case 'provider':
      emit('openProvider');
      break;
    case 'params':
      emit('openParams');
      break;
    case 'tools':
      emit('openTools');
      break;
    case 'vars':
      emit('openVars');
      break;
    case 'history':
      emit('openHistory');
      break;
    case 'importCurl':
      emit('importCurl');
      break;
    case 'shareProject':
      emit('shareProject');
      break;
    case 'theme':
      emit('toggleTheme');
      break;
  }
}
</script>

<template>
  <header ref="toolbarRef" class="app-toolbar">
    <div ref="toolbarLeftRef" class="toolbar-left">
      <div class="logo">
        <span class="logo-icon">🔷</span>
        <span class="logo-text" :class="{ 'hide-on-mobile': isCompact }">TruestPrompt</span>
      </div>
      <slot name="project-selector">
        <Select
          :value="props.selectedProject"
          :options="props.projectOptions.map(p => ({ value: p.id, label: p.label }))"
          class="project-select"
          @change="(val: string) => emit('update:selectedProject', val)"
        />
      </slot>
    </div>
    
    <!-- 宽屏：展开的工具栏 -->
    <div ref="toolbarCenterRef" class="toolbar-center" :class="{ 'toolbar-hidden': isCompact }">
      <Space :size="8">
        <Tooltip title="添加 Slot">
          <Button type="primary" class="btn-interactive" @click="emit('addSlot')">
            <template #icon><AppstoreAddOutlined /></template>
            添加 Slot
          </Button>
        </Tooltip>
        
        <Tooltip title="添加消息">
          <Button type="primary" class="btn-interactive" @click="emit('addMessage')">
            <template #icon><MessageOutlined /></template>
            添加消息
          </Button>
        </Tooltip>

        <Tooltip v-if="props.hasRunningSlots" title="停止所有正在运行的回复">
          <Button danger class="btn-interactive" @click="emit('stopAll')">
            <template #icon><PauseCircleOutlined /></template>
            停止
          </Button>
        </Tooltip>
        
        <Divider type="vertical" />
        
        <Tooltip title="Provider 管理">
          <Button class="btn-interactive" @click="emit('openProvider')">
            <template #icon><ApiOutlined /></template>
            Provider
          </Button>
        </Tooltip>

        <Tooltip title="默认参数">
          <Button class="btn-interactive" @click="emit('openParams')">
            <template #icon><SettingOutlined /></template>
            参数
          </Button>
        </Tooltip>
        
        <Tooltip title="Tools 定义">
          <Button class="btn-interactive" @click="emit('openTools')">
            <template #icon><ToolOutlined /></template>
            Tools
          </Button>
        </Tooltip>
        
        <Tooltip title="模板变量">
          <Button class="btn-interactive" @click="emit('openVars')">
            <template #icon><FieldStringOutlined /></template>
            变量
          </Button>
        </Tooltip>
        
        <Divider type="vertical" />
        
        <Tooltip title="运行历史">
          <Button class="btn-interactive" @click="emit('openHistory')">
            <template #icon><HistoryOutlined /></template>
            历史
          </Button>
        </Tooltip>
        
        <Tooltip title="导入 cURL">
          <Button class="btn-interactive" @click="emit('importCurl')">
            <template #icon><ImportOutlined /></template>
            导入 cURL
          </Button>
        </Tooltip>
        
        <Tooltip v-if="gatewayConfig?.enabled" title="分享项目">
          <Button class="btn-interactive" @click="emit('shareProject')">
            <template #icon><ShareAltOutlined /></template>
            分享
          </Button>
        </Tooltip>
      </Space>
    </div>
    
    <!-- 窄屏：收起的下拉菜单 -->
    <div v-if="isCompact" class="toolbar-center-compact">
      <Dropdown trigger="click" placement="bottomRight">
        <Button class="btn-interactive menu-trigger">
          <template #icon><MenuOutlined /></template>
          菜单
        </Button>
        <template #overlay>
          <Menu @click="({ key }) => handleMenuClick(key as string)">
            <MenuItem key="addSlot">
              <AppstoreAddOutlined />
              <span>添加 Slot</span>
            </MenuItem>
            <MenuItem key="addMessage">
              <MessageOutlined />
              <span>添加消息</span>
            </MenuItem>
            <MenuItem v-if="props.hasRunningSlots" key="stopAll">
              <PauseCircleOutlined />
              <span>停止</span>
            </MenuItem>
            <MenuDivider />
            <MenuItem key="provider">
              <ApiOutlined />
              <span>Provider 管理</span>
            </MenuItem>
            <MenuItem key="params">
              <SettingOutlined />
              <span>默认参数</span>
            </MenuItem>
            <MenuItem key="tools">
              <ToolOutlined />
              <span>Tools 定义</span>
            </MenuItem>
            <MenuItem key="vars">
              <FieldStringOutlined />
              <span>模板变量</span>
            </MenuItem>
            <MenuDivider />
            <MenuItem key="history">
              <HistoryOutlined />
              <span>运行历史</span>
            </MenuItem>
            <MenuItem key="importCurl">
              <ImportOutlined />
              <span>导入 cURL</span>
            </MenuItem>
            <MenuItem v-if="gatewayConfig?.enabled" key="shareProject">
              <ShareAltOutlined />
              <span>分享项目</span>
            </MenuItem>
            <MenuDivider />
            <MenuItem key="theme">
              <component :is="themeIcon" />
              <span>{{ theme === 'light' ? '暗色主题' : '浅色主题' }}</span>
            </MenuItem>
          </Menu>
        </template>
      </Dropdown>
    </div>
    
    <div ref="toolbarRightRef" class="toolbar-right">
      <Tooltip v-if="!isCompact" :title="themeTooltip">
        <Button 
          class="btn-interactive theme-toggle-btn" 
          shape="circle"
          @click="emit('toggleTheme')"
        >
          <template #icon><component :is="themeIcon" /></template>
        </Button>
      </Tooltip>
    </div>
  </header>
</template>

<style scoped>
.app-toolbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 4px 8px;
  overflow: hidden;
  background: var(--card-solid);
  border-bottom: 1px solid var(--border-color);
}

.toolbar-left {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.logo-icon { font-size: 16px; }
.logo-text.hide-on-mobile { display: none; }

.project-select { min-width: 120px; }
.project-select :deep(.ant-select-selector) {
  height: 26px !important;
  font-size: 12px;
}
.project-select :deep(.ant-select-selection-item) { line-height: 24px !important; }

.toolbar-center {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.toolbar-center.toolbar-hidden {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
}
.toolbar-center :deep(.ant-btn) {
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
}
.toolbar-center :deep(.ant-space-item) { line-height: 1; }

.toolbar-center-compact {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-right: 8px;
}

.menu-trigger {
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
}

.toolbar-right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.theme-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px !important;
  height: 26px !important;
}

:deep(.ant-dropdown-menu) { min-width: 160px; }
:deep(.ant-dropdown-menu-item) {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
:deep(.ant-dropdown-menu-item .anticon) { font-size: 14px; }
</style>
