/**
 * StorageService Property Tests
 * 
 * **Feature: project-management, Property 12: Storage Keys Namespaced by Project ID**
 * **Feature: project-management, Property 13: Theme Storage Key is Global**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  getNamespacedKey,
  isGlobalKey,
  setCurrentProjectId,
  getCurrentProjectId,
  STORAGE_KEYS,
  getItem,
  setItem,
  removeItem,
} from '../core/storage';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Valid project ID generator (alphanumeric, reasonable length)
const projectIdArb = fc.stringMatching(/^[a-z0-9_-]{1,20}$/);

describe('StorageService', () => {
  beforeEach(() => {
    localStorageMock.clear();
    setCurrentProjectId('default');
  });

  /**
   * Property 12: Storage Keys Namespaced by Project ID
   * For any project ID and storage operation (providers, editor state),
   * the storage key SHALL contain the project ID as a namespace prefix.
   */
  describe('Property 12: Storage Keys Namespaced by Project ID', () => {
    it('profiles key contains project ID', () => {
      fc.assert(
        fc.property(projectIdArb, (projectId) => {
          const key = getNamespacedKey(STORAGE_KEYS.PROFILES, projectId);
          expect(key).toContain(projectId);
          expect(key).toBe(`truestprompt-${projectId}-profiles`);
        }),
        { numRuns: 100 }
      );
    });

    it('editor state key contains project ID', () => {
      fc.assert(
        fc.property(projectIdArb, (projectId) => {
          const key = getNamespacedKey(STORAGE_KEYS.EDITOR_STATE, projectId);
          expect(key).toContain(projectId);
          expect(key).toBe(`truestprompt-${projectId}-editor-state-v1`);
        }),
        { numRuns: 100 }
      );
    });

    it('different projects produce different keys for same base key', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          projectIdArb.filter(id => id !== 'default'),
          (projectId1, projectId2) => {
            fc.pre(projectId1 !== projectId2);

            const key1 = getNamespacedKey(STORAGE_KEYS.PROFILES, projectId1);
            const key2 = getNamespacedKey(STORAGE_KEYS.PROFILES, projectId2);

            expect(key1).not.toBe(key2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('uses current project ID when no explicit project ID provided', () => {
      fc.assert(
        fc.property(projectIdArb, (projectId) => {
          setCurrentProjectId(projectId);
          const key = getNamespacedKey(STORAGE_KEYS.PROFILES);
          expect(key).toContain(projectId);
          expect(getCurrentProjectId()).toBe(projectId);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 13: Theme Storage Key is Global
   * For any theme storage operation, the storage key SHALL NOT contain
   * any project ID and SHALL be the same regardless of current project.
   */
  describe('Property 13: Theme Storage Key is Global', () => {
    it('theme key does not contain project ID', () => {
      fc.assert(
        fc.property(projectIdArb, (projectId) => {
          setCurrentProjectId(projectId);
          const key = getNamespacedKey(STORAGE_KEYS.THEME);

          // Theme key should be constant regardless of project
          expect(key).toBe('truestprompt-theme');
          // The key format should NOT be `truestprompt-{projectId}-theme`
          // It should always be `truestprompt-theme` (global)
          const namespacedPattern = `truestprompt-${projectId}-theme`;
          expect(key).not.toBe(namespacedPattern);
        }),
        { numRuns: 100 }
      );
    });

    it('theme key is same for all projects', () => {
      fc.assert(
        fc.property(projectIdArb, projectIdArb, (projectId1, projectId2) => {
          setCurrentProjectId(projectId1);
          const key1 = getNamespacedKey(STORAGE_KEYS.THEME);

          setCurrentProjectId(projectId2);
          const key2 = getNamespacedKey(STORAGE_KEYS.THEME);

          expect(key1).toBe(key2);
          expect(key1).toBe('truestprompt-theme');
        }),
        { numRuns: 100 }
      );
    });

    it('projects list key is global', () => {
      fc.assert(
        fc.property(projectIdArb, (projectId) => {
          setCurrentProjectId(projectId);
          const key = getNamespacedKey(STORAGE_KEYS.PROJECTS);
          expect(key).toBe('truestprompt-projects');
        }),
        { numRuns: 100 }
      );
    });

    it('current project key is global', () => {
      fc.assert(
        fc.property(projectIdArb, (projectId) => {
          setCurrentProjectId(projectId);
          const key = getNamespacedKey(STORAGE_KEYS.CURRENT_PROJECT);
          expect(key).toBe('truestprompt-current-project');
        }),
        { numRuns: 100 }
      );
    });

    it('isGlobalKey correctly identifies global keys', () => {
      expect(isGlobalKey(STORAGE_KEYS.THEME)).toBe(true);
      expect(isGlobalKey(STORAGE_KEYS.PROJECTS)).toBe(true);
      expect(isGlobalKey(STORAGE_KEYS.CURRENT_PROJECT)).toBe(true);
      expect(isGlobalKey(STORAGE_KEYS.PROFILES)).toBe(false);
      expect(isGlobalKey(STORAGE_KEYS.EDITOR_STATE)).toBe(false);
    });
  });

  describe('Storage Operations', () => {
    it('setItem and getItem work correctly with namespaced keys', () => {
      fc.assert(
        fc.property(projectIdArb, fc.string(), (projectId, value) => {
          setCurrentProjectId(projectId);
          setItem(STORAGE_KEYS.PROFILES, value);
          const retrieved = getItem(STORAGE_KEYS.PROFILES);
          expect(retrieved).toBe(value);
        }),
        { numRuns: 100 }
      );
    });

    it('data is isolated between projects', () => {
      fc.assert(
        fc.property(
          projectIdArb,
          projectIdArb.filter(id => id !== 'default'),
          fc.string(),
          fc.string(),
          (projectId1, projectId2, value1, value2) => {
            fc.pre(projectId1 !== projectId2);

            // Set value for project 1
            setCurrentProjectId(projectId1);
            setItem(STORAGE_KEYS.PROFILES, value1);

            // Set value for project 2
            setCurrentProjectId(projectId2);
            setItem(STORAGE_KEYS.PROFILES, value2);

            // Verify isolation
            setCurrentProjectId(projectId1);
            expect(getItem(STORAGE_KEYS.PROFILES)).toBe(value1);

            setCurrentProjectId(projectId2);
            expect(getItem(STORAGE_KEYS.PROFILES)).toBe(value2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('removeItem clears data for specific project only', () => {
      const projectId1 = 'project-a';
      const projectId2 = 'project-b';
      const value1 = 'data-a';
      const value2 = 'data-b';

      // Set values for both projects
      setItem(STORAGE_KEYS.PROFILES, value1, projectId1);
      setItem(STORAGE_KEYS.PROFILES, value2, projectId2);

      // Remove from project 1
      removeItem(STORAGE_KEYS.PROFILES, projectId1);

      // Verify project 1 data is gone, project 2 data remains
      expect(getItem(STORAGE_KEYS.PROFILES, projectId1)).toBeNull();
      expect(getItem(STORAGE_KEYS.PROFILES, projectId2)).toBe(value2);
    });
  });
});
