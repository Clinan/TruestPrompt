import localforage from 'localforage';

// Storage key constants
export const STORAGE_KEYS = {
  PROFILES: 'profiles',
  EDITOR_STATE: 'editor-state-v1',
  THEME: 'theme',
  PROJECTS: 'projects',
  CURRENT_PROJECT: 'current-project',
  MIGRATION: 'migration-v1',
} as const;

// Global keys that are NOT namespaced by project
const GLOBAL_KEYS = new Set([
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.PROJECTS,
  STORAGE_KEYS.CURRENT_PROJECT,
  STORAGE_KEYS.MIGRATION,
]);

// Storage prefix
const STORAGE_PREFIX = 'truestprompt';

// Current project ID (managed externally)
let currentProjectId = 'default';

/**
 * Set the current project ID for namespaced storage operations
 */
export function setCurrentProjectId(projectId: string): void {
  currentProjectId = projectId;
}

/**
 * Get the current project ID
 */
export function getCurrentProjectId(): string {
  return currentProjectId;
}

/**
 * Generate a namespaced storage key based on the base key and current project
 * Global keys (theme, projects, current-project) are NOT namespaced
 */
export function getNamespacedKey(baseKey: string, projectId?: string): string {
  const pid = projectId ?? currentProjectId;
  
  if (GLOBAL_KEYS.has(baseKey as keyof typeof STORAGE_KEYS)) {
    return `${STORAGE_PREFIX}-${baseKey}`;
  }
  
  return `${STORAGE_PREFIX}-${pid}-${baseKey}`;
}

/**
 * Check if a key is global (not project-specific)
 */
export function isGlobalKey(baseKey: string): boolean {
  return GLOBAL_KEYS.has(baseKey as keyof typeof STORAGE_KEYS);
}

// Memory fallback storage for when localStorage is unavailable
const memoryStorage: Record<string, string> = {};
let useMemoryFallback = false;

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Enable memory fallback mode (for when localStorage is unavailable)
 */
export function enableMemoryFallback(): void {
  useMemoryFallback = true;
  console.warn('[StorageService] localStorage unavailable, using memory fallback');
}

/**
 * Get item from storage (localStorage or memory fallback)
 */
export function getItem(baseKey: string, projectId?: string): string | null {
  const key = getNamespacedKey(baseKey, projectId);
  
  if (useMemoryFallback) {
    return memoryStorage[key] ?? null;
  }
  
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`[StorageService] Failed to read ${key}:`, err);
    return memoryStorage[key] ?? null;
  }
}

/**
 * Set item in storage (localStorage or memory fallback)
 */
export function setItem(baseKey: string, value: string, projectId?: string): void {
  const key = getNamespacedKey(baseKey, projectId);
  
  if (useMemoryFallback) {
    memoryStorage[key] = value;
    return;
  }
  
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[StorageService] Failed to write ${key}:`, err);
    memoryStorage[key] = value;
  }
}

/**
 * Remove item from storage
 */
export function removeItem(baseKey: string, projectId?: string): void {
  const key = getNamespacedKey(baseKey, projectId);
  
  if (useMemoryFallback) {
    delete memoryStorage[key];
    return;
  }
  
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[StorageService] Failed to remove ${key}:`, err);
  }
  delete memoryStorage[key];
}

// IndexedDB instance cache
const idbInstances: Record<string, LocalForage> = {};

/**
 * Get or create a LocalForage instance for history storage
 */
export function getHistoryStore(projectId?: string): LocalForage {
  const pid = projectId ?? currentProjectId;
  const instanceName = `${STORAGE_PREFIX}-history-${pid}`;
  
  if (!idbInstances[instanceName]) {
    idbInstances[instanceName] = localforage.createInstance({ name: instanceName });
  }
  
  return idbInstances[instanceName];
}

/**
 * Get or create a LocalForage instance for model cache storage
 */
export function getModelCacheStore(projectId?: string): LocalForage {
  const pid = projectId ?? currentProjectId;
  const instanceName = `${STORAGE_PREFIX}-model-cache-${pid}`;
  
  if (!idbInstances[instanceName]) {
    idbInstances[instanceName] = localforage.createInstance({ name: instanceName });
  }
  
  return idbInstances[instanceName];
}

/**
 * Clear all data for a specific project
 */
export async function clearProjectData(projectId: string): Promise<void> {
  // Clear localStorage keys
  const keysToRemove = [STORAGE_KEYS.PROFILES, STORAGE_KEYS.EDITOR_STATE];
  
  for (const baseKey of keysToRemove) {
    removeItem(baseKey, projectId);
  }
  
  // Clear IndexedDB instances
  try {
    const historyStore = getHistoryStore(projectId);
    await historyStore.clear();
  } catch (err) {
    console.warn(`[StorageService] Failed to clear history for project ${projectId}:`, err);
    throw err;
  }
  
  try {
    const modelCacheStore = getModelCacheStore(projectId);
    await modelCacheStore.clear();
  } catch (err) {
    console.warn(`[StorageService] Failed to clear model cache for project ${projectId}:`, err);
    throw err;
  }
}

/**
 * Get all localStorage keys for a specific project (for debugging/migration)
 */
export function getProjectStorageKeys(projectId: string): string[] {
  const prefix = `${STORAGE_PREFIX}-${projectId}-`;
  const keys: string[] = [];
  
  if (useMemoryFallback) {
    return Object.keys(memoryStorage).filter(k => k.startsWith(prefix));
  }
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }
  } catch (err) {
    console.warn('[StorageService] Failed to enumerate storage keys:', err);
  }
  
  return keys;
}


// Migration constants
const MIGRATION_KEY = 'truestprompt-migration-v1';
const OLD_PROFILES_KEY = 'truestprompt-profiles';
const OLD_EDITOR_STATE_KEY = 'truestprompt-editor-state-v1';

/**
 * Check if migration has been completed
 */
export function isMigrationCompleted(): boolean {
  try {
    return localStorage.getItem(MIGRATION_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Migrate old storage format to project-namespaced format
 * This migrates data from the old keys to the 'default' project namespace
 */
export async function migrateToProjectNamespace(): Promise<void> {
  if (isMigrationCompleted()) {
    return;
  }

  console.log('[StorageService] Starting migration to project namespace...');

  try {
    // Migrate profiles
    const oldProfiles = localStorage.getItem(OLD_PROFILES_KEY);
    if (oldProfiles) {
      const newKey = getNamespacedKey(STORAGE_KEYS.PROFILES, 'default');
      // Only migrate if new key doesn't exist
      if (!localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, oldProfiles);
        console.log('[StorageService] Migrated profiles to default project');
      }
    }

    // Migrate editor state
    const oldEditorState = localStorage.getItem(OLD_EDITOR_STATE_KEY);
    if (oldEditorState) {
      const newKey = getNamespacedKey(STORAGE_KEYS.EDITOR_STATE, 'default');
      // Only migrate if new key doesn't exist
      if (!localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, oldEditorState);
        console.log('[StorageService] Migrated editor state to default project');
      }
    }

    // Migrate IndexedDB data (history and model cache)
    // Note: IndexedDB migration is more complex and may require copying data
    // For now, we'll create new instances and the old data will remain accessible
    // through the old instance names until manually cleaned up

    // Mark migration as complete
    localStorage.setItem(MIGRATION_KEY, Date.now().toString());
    console.log('[StorageService] Migration completed');
  } catch (err) {
    console.error('[StorageService] Migration failed:', err);
    // Don't mark as complete if migration failed
  }
}

/**
 * Clean up old storage keys after successful migration
 * Call this only after confirming the migration was successful
 */
export function cleanupOldStorageKeys(): void {
  try {
    // Remove old keys (optional - can be called later)
    // localStorage.removeItem(OLD_PROFILES_KEY);
    // localStorage.removeItem(OLD_EDITOR_STATE_KEY);
    console.log('[StorageService] Old storage keys cleanup skipped (preserved for safety)');
  } catch (err) {
    console.warn('[StorageService] Failed to cleanup old storage keys:', err);
  }
}
