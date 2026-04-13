/**
 * Persistence middleware — write-through sync on every state change.
 *
 * When entity state changes from USER ACTIONS:
 * 1. Identifies which project(s) changed
 * 2. Calls syncProject() for each — saves to IndexedDB + cloud (500ms debounce)
 *
 * SKIPS during cloud data loading (reconciliation) to prevent infinite loops:
 * cloud loads → store updates → middleware fires → re-syncs same data → loop
 */
import type { StoreApi } from 'zustand';
import type { StoreState } from '../types';
import { saveGroupExpandStates } from '../../utils/app-helpers';
import { syncProject } from '../../sync/write-through';

// Global flag: set to true when cloud data is being merged into the store.
// Prevents the middleware from re-syncing data that was just loaded from cloud.
let _isLoadingCloudData = false;

export function setIsLoadingCloudData(loading: boolean) {
  _isLoadingCloudData = loading;
}

export function setupPersistenceMiddleware(
  store: StoreApi<StoreState>,
  _getComputedTokens: () => any,
) {
  store.subscribe((state, prevState) => {
    // Guard: skip during initial load, import, sample mode, or cloud data loading
    if (state.isInitialLoad || state.isImporting) return;
    if (_isLoadingCloudData) return;

    const isSampleMode = state.projects.find(p => p.id === state.activeProjectId)?.isSample === true;
    if (isSampleMode) return;

    // Check if entity state actually changed (by reference)
    const entityChanged =
      state.allNodes !== prevState.allNodes ||
      state.tokens !== prevState.tokens ||
      state.groups !== prevState.groups ||
      state.projects !== prevState.projects ||
      state.pages !== prevState.pages ||
      state.themes !== prevState.themes ||
      state.canvasStates !== prevState.canvasStates;

    // Don't sync on activeProjectId/activePageId/activeThemeId changes alone
    // (navigating between projects shouldn't trigger a save)
    if (!entityChanged) return;

    // Immediately persist group expand states (no debounce)
    if (state.groups !== prevState.groups) {
      saveGroupExpandStates(state.groups);
    }

    // Identify which project(s) changed and sync them
    const activeProjectId = state.activeProjectId;
    const activeProject = state.projects.find(p => p.id === activeProjectId);

    if (activeProject && !activeProject.isSample) {
      syncProject(activeProjectId);
    }

    // If projects array itself changed (rename, delete, etc.), sync affected
    if (state.projects !== prevState.projects) {
      const changedProjects = state.projects.filter(p => {
        if (p.isSample) return false;
        const prev = prevState.projects.find(pp => pp.id === p.id);
        return !prev || prev.name !== p.name || prev.folderColor !== p.folderColor;
      });
      for (const p of changedProjects) {
        if (p.id !== activeProjectId) syncProject(p.id);
      }
    }
  });
}
