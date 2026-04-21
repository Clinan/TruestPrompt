<script setup lang="ts">
import { ref, computed } from 'vue';
import { Dropdown, Button, Input, Modal, Menu, Tooltip, message } from 'ant-design-vue';
import {
  DownOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons-vue';
import type { ProjectMetadata } from '../../types';
import { DEFAULT_PROJECT } from '../../core/types';
import { validateProjectName } from '../../composables/useProjectManager';

const props = defineProps<{
  projects: ProjectMetadata[];
  currentProjectId: string;
}>();

const emit = defineEmits<{
  select: [projectId: string];
  create: [name: string];
  rename: [projectId: string, newName: string];
  delete: [projectId: string];
}>();

// Current project display
const currentProject = computed(() => 
  props.projects.find(p => p.id === props.currentProjectId)
);

// Sorted projects (most recent first)
const sortedProjects = computed(() => 
  [...props.projects].sort((a, b) => b.updatedAt - a.updatedAt)
);

// New project modal
const showNewProjectModal = ref(false);
const newProjectName = ref('');
const newProjectError = ref('');

function openNewProjectModal() {
  newProjectName.value = '';
  newProjectError.value = '';
  showNewProjectModal.value = true;
}

function handleCreateProject() {
  const validation = validateProjectName(newProjectName.value);
  if (!validation.valid) {
    newProjectError.value = validation.error || '无效的项目名称';
    return;
  }
  
  emit('create', newProjectName.value.trim());
  showNewProjectModal.value = false;
  newProjectName.value = '';
  newProjectError.value = '';
}

// Inline rename
const editingProjectId = ref<string | null>(null);
const editingName = ref('');

function startRename(project: ProjectMetadata, event: Event) {
  event.stopPropagation();
  editingProjectId.value = project.id;
  editingName.value = project.name;
}

function cancelRename() {
  editingProjectId.value = null;
  editingName.value = '';
}

function confirmRename(projectId: string) {
  const validation = validateProjectName(editingName.value);
  if (!validation.valid) {
    message.error(validation.error || '无效的项目名称');
    return;
  }
  
  emit('rename', projectId, editingName.value.trim());
  editingProjectId.value = null;
  editingName.value = '';
}

// Delete confirmation
const showDeleteConfirm = ref(false);
const projectToDelete = ref<ProjectMetadata | null>(null);

function requestDelete(project: ProjectMetadata, event: Event) {
  event.stopPropagation();
  
  if (project.id === DEFAULT_PROJECT.id) {
    message.warning('默认项目不可删除');
    return;
  }
  
  projectToDelete.value = project;
  showDeleteConfirm.value = true;
}

function confirmDelete() {
  if (projectToDelete.value) {
    emit('delete', projectToDelete.value.id);
  }
  showDeleteConfirm.value = false;
  projectToDelete.value = null;
}

function handleSelect(projectId: string) {
  if (editingProjectId.value) return;
  emit('select', projectId);
}
</script>

<template>
  <Dropdown trigger="click" placement="bottomLeft">
    <Button class="project-selector-trigger">
      <FolderOutlined />
      <span class="project-name">{{ currentProject?.name || 'Select Project' }}</span>
      <DownOutlined class="dropdown-icon" />
    </Button>
    
    <template #overlay>
      <div class="project-dropdown">
        <div class="project-list">
          <div
            v-for="project in sortedProjects"
            :key="project.id"
            class="project-item"
            :class="{ active: project.id === currentProjectId }"
            @click="handleSelect(project.id)"
          >
            <!-- Editing mode -->
            <template v-if="editingProjectId === project.id">
              <Input
                v-model:value="editingName"
                size="small"
                class="rename-input"
                @click.stop
                @pressEnter="confirmRename(project.id)"
                @keyup.esc="cancelRename"
              />
              <div class="edit-actions">
                <Tooltip title="确认">
                  <Button
                    type="text"
                    size="small"
                    class="action-btn confirm"
                    @click.stop="confirmRename(project.id)"
                  >
                    <CheckOutlined />
                  </Button>
                </Tooltip>
                <Tooltip title="取消">
                  <Button
                    type="text"
                    size="small"
                    class="action-btn cancel"
                    @click.stop="cancelRename"
                  >
                    <CloseOutlined />
                  </Button>
                </Tooltip>
              </div>
            </template>
            
            <!-- Normal mode -->
            <template v-else>
              <span class="project-item-name">{{ project.name }}</span>
              <div class="project-actions" v-if="project.id !== DEFAULT_PROJECT.id">
                <Tooltip title="重命名">
                  <Button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="startRename(project, $event)"
                  >
                    <EditOutlined />
                  </Button>
                </Tooltip>
                <Tooltip title="删除">
                  <Button
                    type="text"
                    size="small"
                    class="action-btn danger"
                    @click="requestDelete(project, $event)"
                  >
                    <DeleteOutlined />
                  </Button>
                </Tooltip>
              </div>
            </template>
          </div>
        </div>
        
        <div class="project-dropdown-footer">
          <Button type="text" block class="new-project-btn" @click="openNewProjectModal">
            <PlusOutlined />
            新建项目
          </Button>
        </div>
      </div>
    </template>
  </Dropdown>
  
  <!-- New Project Modal -->
  <Modal
    v-model:open="showNewProjectModal"
    title="新建项目"
    :width="400"
    @ok="handleCreateProject"
    @cancel="showNewProjectModal = false"
  >
    <div class="new-project-form">
      <Input
        v-model:value="newProjectName"
        placeholder="输入项目名称"
        :status="newProjectError ? 'error' : undefined"
        @pressEnter="handleCreateProject"
      />
      <div v-if="newProjectError" class="error-text">{{ newProjectError }}</div>
    </div>
  </Modal>
  
  <!-- Delete Confirmation Modal -->
  <Modal
    v-model:open="showDeleteConfirm"
    title="删除项目"
    :width="400"
    okText="删除"
    okType="danger"
    @ok="confirmDelete"
    @cancel="showDeleteConfirm = false"
  >
    <p>确定要删除项目「{{ projectToDelete?.name }}」吗？</p>
    <p class="warning-text">此操作将永久删除该项目的所有数据（Provider 配置、编辑器状态、历史记录等），且无法恢复。</p>
  </Modal>
</template>

<style scoped>
.project-selector-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  height: 28px;
  font-size: 13px;
  border-radius: 6px;
}

.project-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-icon {
  font-size: 10px;
  opacity: 0.6;
}

.project-dropdown {
  background: var(--card-solid, #fff);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 220px;
  max-width: 280px;
  overflow: hidden;
}

.project-list {
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
}

.project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.project-item:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
}

.project-item.active {
  background: var(--primary-bg, rgba(22, 119, 255, 0.1));
  color: var(--primary-color, #1677ff);
}

.project-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.project-actions {
  display: none;
  gap: 2px;
}

.project-item:hover .project-actions {
  display: flex;
}

.action-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #666);
}

.action-btn:hover {
  color: var(--primary-color, #1677ff);
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
}

.action-btn.danger:hover {
  color: var(--error-color, #ff4d4f);
}

.action-btn.confirm:hover {
  color: var(--success-color, #52c41a);
}

.action-btn.cancel:hover {
  color: var(--text-secondary, #666);
}

.rename-input {
  flex: 1;
  margin-right: 4px;
}

.edit-actions {
  display: flex;
  gap: 2px;
}

.project-dropdown-footer {
  border-top: 1px solid var(--border-color, #e8e8e8);
  padding: 4px;
}

.new-project-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--primary-color, #1677ff);
}

.new-project-form {
  padding: 8px 0;
}

.error-text {
  color: var(--error-color, #ff4d4f);
  font-size: 12px;
  margin-top: 4px;
}

.warning-text {
  color: var(--warning-color, #faad14);
  font-size: 13px;
}
</style>
