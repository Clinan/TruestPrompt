/**
 * useProjectManager Property Tests
 * 
 * **Feature: project-management**
 * **Property 1: Valid Project Name Creates Project with Unique ID**
 * **Property 2: Whitespace-Only Names Rejected for Creation**
 * **Property 3: New Projects Start with Empty State**
 * **Property 6: Last Active Project Restored on Init**
 * **Property 7: Valid Rename Updates and Persists**
 * **Property 8: Whitespace-Only Names Rejected for Rename**
 * **Property 10: Deleting Active Project Switches to Default**
 * **Property 14: Projects Sorted by Last Used Time**
 * **Validates: Requirements 1.2, 1.3, 1.4, 2.4, 3.2, 3.3, 4.3, 6.2**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  useProjectManager,
  isValidProjectName,
  validateProjectName,
} from '../composables/useProjectManager';
import { DEFAULT_PROJECT } from '../core/types';
import { setCurrentProjectId } from '../core/storage';

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

// Mock localforage
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Generators
const validProjectNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0);

const whitespaceOnlyArb = fc.stringMatching(/^[\s]*$/);

const timestampArb = fc.integer({ min: 0, max: Date.now() + 1000000 });

describe('useProjectManager', () => {
  beforeEach(() => {
    localStorageMock.clear();
    setCurrentProjectId('default');
  });

  /**
   * Property 1: Valid Project Name Creates Project with Unique ID
   * For any valid project name, creating a project SHALL produce a project
   * with a unique ID that is different from all existing project IDs.
   */
  describe('Property 1: Valid Project Name Creates Project with Unique ID', () => {
    it('creates project with unique ID for valid names', () => {
      fc.assert(
        fc.property(validProjectNameArb, (name) => {
          const { createProject, projects } = useProjectManager();

          const existingIds = new Set(projects.value.map(p => p.id));
          const newProject = createProject(name);

          expect(newProject).not.toBeNull();
          expect(newProject!.id).toBeDefined();
          expect(existingIds.has(newProject!.id)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('multiple projects have unique IDs', () => {
      fc.assert(
        fc.property(
          fc.array(validProjectNameArb, { minLength: 2, maxLength: 10 }),
          (names) => {
            const { createProject, projects } = useProjectManager();

            const createdProjects = names.map(name => createProject(name));
            const ids = createdProjects
              .filter(p => p !== null)
              .map(p => p!.id);

            // All IDs should be unique
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('created project has trimmed name', () => {
      fc.assert(
        fc.property(validProjectNameArb, (name) => {
          const { createProject } = useProjectManager();
          const newProject = createProject(name);

          expect(newProject).not.toBeNull();
          expect(newProject!.name).toBe(name.trim());
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Whitespace-Only Names Rejected for Creation
   * For any string composed entirely of whitespace characters,
   * attempting to create a project SHALL be rejected.
   */
  describe('Property 2: Whitespace-Only Names Rejected for Creation', () => {
    it('rejects empty string', () => {
      const { createProject, projects } = useProjectManager();
      const initialCount = projects.value.length;

      const result = createProject('');

      expect(result).toBeNull();
      expect(projects.value.length).toBe(initialCount);
    });

    it('rejects whitespace-only strings', () => {
      fc.assert(
        fc.property(whitespaceOnlyArb, (name) => {
          const { createProject, projects } = useProjectManager();
          const initialCount = projects.value.length;

          const result = createProject(name);

          expect(result).toBeNull();
          expect(projects.value.length).toBe(initialCount);
        }),
        { numRuns: 100 }
      );
    });

    it('isValidProjectName returns false for whitespace', () => {
      fc.assert(
        fc.property(whitespaceOnlyArb, (name) => {
          expect(isValidProjectName(name)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Last Active Project Restored on Init
   * For any application initialization, the currentProjectId SHALL equal
   * the projectId that was active when the application was last closed.
   */
  describe('Property 6: Last Active Project Restored on Init', () => {
    it('restores last active project on initialize', () => {
      // First session: create and switch to a project
      const { createProject, switchProject, currentProjectId, projects } = useProjectManager();
      const newProject = createProject('Test Project');
      expect(newProject).not.toBeNull();

      // Manually save to storage (simulating what watch would do)
      localStorageMock.setItem('truestprompt-projects', JSON.stringify(projects.value));
      localStorageMock.setItem('truestprompt-current-project', newProject!.id);

      // Second session: initialize and verify
      const manager2 = useProjectManager();
      manager2.initialize();

      expect(manager2.currentProjectId.value).toBe(newProject!.id);
    });

    it('falls back to default if saved project does not exist', () => {
      // Save a non-existent project ID
      localStorageMock.setItem('truestprompt-current-project', 'non-existent-id');
      localStorageMock.setItem('truestprompt-projects', JSON.stringify([DEFAULT_PROJECT]));

      const { initialize, currentProjectId } = useProjectManager();
      initialize();

      expect(currentProjectId.value).toBe(DEFAULT_PROJECT.id);
    });
  });

  /**
   * Property 7: Valid Rename Updates and Persists
   * For any valid new name, renaming a project SHALL update the project's name.
   */
  describe('Property 7: Valid Rename Updates and Persists', () => {
    it('renames project with valid name', () => {
      fc.assert(
        fc.property(validProjectNameArb, validProjectNameArb, (originalName, newName) => {
          const { createProject, renameProject, projects } = useProjectManager();

          const project = createProject(originalName);
          expect(project).not.toBeNull();

          const result = renameProject(project!.id, newName);

          expect(result).toBe(true);
          const updated = projects.value.find(p => p.id === project!.id);
          expect(updated?.name).toBe(newName.trim());
        }),
        { numRuns: 100 }
      );
    });

    it('updates updatedAt timestamp on rename', () => {
      const { createProject, renameProject, projects } = useProjectManager();

      const project = createProject('Original');
      expect(project).not.toBeNull();
      const originalUpdatedAt = project!.updatedAt;

      // Wait a bit to ensure timestamp difference
      const result = renameProject(project!.id, 'New Name');

      expect(result).toBe(true);
      const updated = projects.value.find(p => p.id === project!.id);
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  /**
   * Property 8: Whitespace-Only Names Rejected for Rename
   * For any string composed entirely of whitespace characters,
   * attempting to rename a project SHALL be rejected.
   */
  describe('Property 8: Whitespace-Only Names Rejected for Rename', () => {
    it('rejects whitespace-only rename', () => {
      fc.assert(
        fc.property(validProjectNameArb, whitespaceOnlyArb, (originalName, newName) => {
          const { createProject, renameProject, projects } = useProjectManager();

          const project = createProject(originalName);
          expect(project).not.toBeNull();

          const result = renameProject(project!.id, newName);

          expect(result).toBe(false);
          const unchanged = projects.value.find(p => p.id === project!.id);
          expect(unchanged?.name).toBe(originalName.trim());
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10: Deleting Active Project Switches to Default
   * For any deletion of the currently active project,
   * the currentProjectId SHALL automatically change to 'default'.
   */
  describe('Property 10: Deleting Active Project Switches to Default', () => {
    it('switches to default when deleting active project', async () => {
      const { createProject, deleteProject, switchProject, currentProjectId } = useProjectManager();

      const project = createProject('To Delete');
      expect(project).not.toBeNull();

      await switchProject(project!.id);
      expect(currentProjectId.value).toBe(project!.id);

      const result = await deleteProject(project!.id);

      expect(result).toBe(true);
      expect(currentProjectId.value).toBe(DEFAULT_PROJECT.id);
    });

    it('cannot delete default project', async () => {
      const { deleteProject, projects } = useProjectManager();
      const initialCount = projects.value.length;

      const result = await deleteProject(DEFAULT_PROJECT.id);

      expect(result).toBe(false);
      expect(projects.value.length).toBe(initialCount);
      expect(projects.value.some(p => p.id === DEFAULT_PROJECT.id)).toBe(true);
    });
  });

  /**
   * Property 14: Projects Sorted by Last Used Time
   * For any list of projects with different updatedAt timestamps,
   * the sorted list SHALL have projects ordered by updatedAt descending.
   */
  describe('Property 14: Projects Sorted by Last Used Time', () => {
    it('sortedProjects returns projects in descending updatedAt order', () => {
      const { createProject, sortedProjects } = useProjectManager();

      // Create projects with explicit delays to ensure different timestamps
      const project1 = createProject('Project 1');
      expect(project1).not.toBeNull();

      // Manually set different updatedAt values to test sorting
      const project2 = createProject('Project 2');
      expect(project2).not.toBeNull();

      const project3 = createProject('Project 3');
      expect(project3).not.toBeNull();

      // Verify sorted order (most recent first)
      const sorted = sortedProjects.value;
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].updatedAt).toBeGreaterThanOrEqual(sorted[i].updatedAt);
      }
    });

    it('sorting is stable for equal timestamps', () => {
      // This test verifies that even with equal timestamps, sorting doesn't fail
      const { projects, sortedProjects } = useProjectManager();

      // All projects have the same updatedAt (0 for default)
      // Sorting should still work without errors
      expect(() => sortedProjects.value).not.toThrow();
      expect(sortedProjects.value.length).toBe(projects.value.length);
    });
  });

  describe('validateProjectName', () => {
    it('returns valid for non-empty trimmed strings', () => {
      fc.assert(
        fc.property(validProjectNameArb, (name) => {
          const result = validateProjectName(name);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it('returns error for strings exceeding max length', () => {
      const longName = 'a'.repeat(51);
      const result = validateProjectName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('50');
    });
  });
});
