import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import type { ProjectMetadata, GatewayConfig } from '../types';
import { newId } from '../lib/id';
import {
  getItem,
  setItem,
  setCurrentProjectId,
  clearProjectData,
  STORAGE_KEYS,
} from '../lib/storage';

// Default project that cannot be deleted
export const DEFAULT_PROJECT: ProjectMetadata = {
  id: 'default',
  name: 'Default Project',
  createdAt: 0,
  updatedAt: 0,
};

// Project name validation
const MAX_PROJECT_NAME_LENGTH = 50;

export function isValidProjectName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_PROJECT_NAME_LENGTH;
}

export function validateProjectName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: '项目名称不能为空' };
  }
  if (trimmed.length > MAX_PROJECT_NAME_LENGTH) {
    return { valid: false, error: `项目名称不能超过 ${MAX_PROJECT_NAME_LENGTH} 个字符` };
  }
  return { valid: true };
}

export interface UseProjectManagerOptions {
  onBeforeSwitch?: (fromProjectId: string, toProjectId: string) => void | Promise<void>;
  onAfterSwitch?: (projectId: string) => void | Promise<void>;
}

export interface UseProjectManagerReturn {
  // State
  projects: Ref<ProjectMetadata[]>;
  currentProjectId: Ref<string>;
  currentProject: ComputedRef<ProjectMetadata | undefined>;
  sortedProjects: ComputedRef<ProjectMetadata[]>;
  
  // Gateway mode
  isGatewayMode: ComputedRef<boolean>;
  gatewayConfig: ComputedRef<GatewayConfig | undefined>;
  
  // Operations
  createProject: (name: string) => ProjectMetadata | null;
  renameProject: (projectId: string, newName: string) => boolean;
  deleteProject: (projectId: string) => Promise<boolean>;
  switchProject: (projectId: string) => Promise<void>;
  
  // Gateway mode operations
  enableGatewayMode: (config: GatewayConfig) => void;
  disableGatewayMode: () => void;
  updateProject: (projectId: string, updates: Partial<ProjectMetadata>) => boolean;
  
  // Lifecycle
  initialize: () => void;
}

export function useProjectManager(options: UseProjectManagerOptions = {}): UseProjectManagerReturn {
  const { onBeforeSwitch, onAfterSwitch } = options;
  
  // State
  const projects = ref<ProjectMetadata[]>([DEFAULT_PROJECT]);
  const currentProjectId = ref<string>(DEFAULT_PROJECT.id);
  
  // Computed
  const currentProject = computed(() => 
    projects.value.find(p => p.id === currentProjectId.value)
  );
  
  // Gateway mode computed properties
  const isGatewayMode = computed(() => {
    return !!currentProject.value?.gateway?.enabled;
  });
  
  const gatewayConfig = computed(() => {
    return currentProject.value?.gateway;
  });
  
  // Sort projects by updatedAt descending (most recent first)
  // Default project always stays at top if it's the current one
  const sortedProjects = computed(() => {
    return [...projects.value].sort((a, b) => {
      // Default project with id 'default' stays at its natural position based on updatedAt
      return b.updatedAt - a.updatedAt;
    });
  });
  
  // Persistence
  function loadProjects(): void {
    try {
      const stored = getItem(STORAGE_KEYS.PROJECTS);
      if (stored) {
        const parsed = JSON.parse(stored) as ProjectMetadata[];
        // Ensure default project exists
        const hasDefault = parsed.some(p => p.id === DEFAULT_PROJECT.id);
        if (!hasDefault) {
          parsed.unshift(DEFAULT_PROJECT);
        }
        projects.value = parsed;
      }
    } catch (err) {
      console.warn('[useProjectManager] Failed to load projects:', err);
    }
  }
  
  function saveProjects(): void {
    try {
      setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects.value));
    } catch (err) {
      console.warn('[useProjectManager] Failed to save projects:', err);
    }
  }
  
  function loadCurrentProjectId(): void {
    try {
      const stored = getItem(STORAGE_KEYS.CURRENT_PROJECT);
      if (stored) {
        // Verify the project exists
        const exists = projects.value.some(p => p.id === stored);
        if (exists) {
          currentProjectId.value = stored;
        }
      }
    } catch (err) {
      console.warn('[useProjectManager] Failed to load current project:', err);
    }
  }
  
  function saveCurrentProjectId(): void {
    try {
      setItem(STORAGE_KEYS.CURRENT_PROJECT, currentProjectId.value);
    } catch (err) {
      console.warn('[useProjectManager] Failed to save current project:', err);
    }
  }
  
  // Auto-persist on changes
  watch(projects, saveProjects, { deep: true });
  watch(currentProjectId, saveCurrentProjectId);
  
  // Operations
  function createProject(name: string): ProjectMetadata | null {
    const validation = validateProjectName(name);
    if (!validation.valid) {
      console.warn('[useProjectManager] Invalid project name:', validation.error);
      return null;
    }
    
    const trimmedName = name.trim();
    const now = Date.now();
    
    const newProject: ProjectMetadata = {
      id: newId(),
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
    };
    
    projects.value = [...projects.value, newProject];
    return newProject;
  }
  
  function renameProject(projectId: string, newName: string): boolean {
    const validation = validateProjectName(newName);
    if (!validation.valid) {
      console.warn('[useProjectManager] Invalid project name:', validation.error);
      return false;
    }
    
    const trimmedName = newName.trim();
    const projectIndex = projects.value.findIndex(p => p.id === projectId);
    
    if (projectIndex === -1) {
      console.warn('[useProjectManager] Project not found:', projectId);
      return false;
    }
    
    const updatedProject = {
      ...projects.value[projectIndex],
      name: trimmedName,
      updatedAt: Date.now(),
    };
    
    projects.value = [
      ...projects.value.slice(0, projectIndex),
      updatedProject,
      ...projects.value.slice(projectIndex + 1),
    ];
    
    return true;
  }
  
  async function deleteProject(projectId: string): Promise<boolean> {
    // Cannot delete default project
    if (projectId === DEFAULT_PROJECT.id) {
      console.warn('[useProjectManager] Cannot delete default project');
      return false;
    }
    
    const projectIndex = projects.value.findIndex(p => p.id === projectId);
    if (projectIndex === -1) {
      console.warn('[useProjectManager] Project not found:', projectId);
      return false;
    }
    
    // Clear project data from storage
    try {
      await clearProjectData(projectId);
    } catch (err) {
      console.error('[useProjectManager] Failed to clear project data:', err);
      // Preserve project if storage cleanup fails
      return false;
    }
    
    // Remove from projects list
    projects.value = projects.value.filter(p => p.id !== projectId);
    
    // If deleting current project, switch to default
    if (currentProjectId.value === projectId) {
      currentProjectId.value = DEFAULT_PROJECT.id;
      setCurrentProjectId(DEFAULT_PROJECT.id);
      await onAfterSwitch?.(DEFAULT_PROJECT.id);
    }
    
    return true;
  }
  
  async function switchProject(projectId: string): Promise<void> {
    const targetProject = projects.value.find(p => p.id === projectId);
    if (!targetProject) {
      console.warn('[useProjectManager] Project not found:', projectId);
      return;
    }
    
    if (currentProjectId.value === projectId) {
      return; // Already on this project
    }
    
    const previousProjectId = currentProjectId.value;
    
    // Call before switch callback (to save current state)
    await onBeforeSwitch?.(previousProjectId, projectId);
    
    // Update current project
    currentProjectId.value = projectId;
    setCurrentProjectId(projectId);
    
    // Update the target project's updatedAt
    const projectIndex = projects.value.findIndex(p => p.id === projectId);
    if (projectIndex !== -1) {
      const updatedProject = {
        ...projects.value[projectIndex],
        updatedAt: Date.now(),
      };
      projects.value = [
        ...projects.value.slice(0, projectIndex),
        updatedProject,
        ...projects.value.slice(projectIndex + 1),
      ];
    }
    
    // Call after switch callback (to load new state)
    await onAfterSwitch?.(projectId);
  }
  
  // Gateway mode operations
  function enableGatewayMode(config: GatewayConfig): void {
    const projectIndex = projects.value.findIndex(p => p.id === currentProjectId.value);
    if (projectIndex === -1) {
      console.warn('[useProjectManager] Current project not found');
      return;
    }
    
    const updatedProject = {
      ...projects.value[projectIndex],
      gateway: { ...config, enabled: true },
      updatedAt: Date.now(),
    };
    
    projects.value = [
      ...projects.value.slice(0, projectIndex),
      updatedProject,
      ...projects.value.slice(projectIndex + 1),
    ];
  }
  
  function disableGatewayMode(): void {
    const projectIndex = projects.value.findIndex(p => p.id === currentProjectId.value);
    if (projectIndex === -1) {
      console.warn('[useProjectManager] Current project not found');
      return;
    }
    
    const updatedProject = {
      ...projects.value[projectIndex],
      gateway: undefined,
      updatedAt: Date.now(),
    };
    
    projects.value = [
      ...projects.value.slice(0, projectIndex),
      updatedProject,
      ...projects.value.slice(projectIndex + 1),
    ];
  }
  
  function updateProject(projectId: string, updates: Partial<ProjectMetadata>): boolean {
    const projectIndex = projects.value.findIndex(p => p.id === projectId);
    if (projectIndex === -1) {
      console.warn('[useProjectManager] Project not found:', projectId);
      return false;
    }
    
    const updatedProject = {
      ...projects.value[projectIndex],
      ...updates,
      updatedAt: Date.now(),
    };
    
    projects.value = [
      ...projects.value.slice(0, projectIndex),
      updatedProject,
      ...projects.value.slice(projectIndex + 1),
    ];
    
    return true;
  }
  
  function initialize(): void {
    loadProjects();
    loadCurrentProjectId();
    setCurrentProjectId(currentProjectId.value);
  }
  
  return {
    projects,
    currentProjectId,
    currentProject,
    sortedProjects,
    isGatewayMode,
    gatewayConfig,
    createProject,
    renameProject,
    deleteProject,
    switchProject,
    enableGatewayMode,
    disableGatewayMode,
    updateProject,
    initialize,
  };
}
