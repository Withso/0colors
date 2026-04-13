/**
 * Persistence middleware — write-through sync on every state change.
 *
 * When entity state changes:
 * 1. Identifies which project(s) changed
 * 2. Calls syncProject() for each — saves to IndexedDB + cloud (500ms debounce)
 *
 * This replaces the old flow of:
 *   1s debounce → IndexedDB only
 *   3s debounce → markDirty → 2min timer → cloud
 */
import type { StoreApi } from 'zustand';
import type { StoreState } from '../types';
import { saveGroupExpandStates } from '../../utils/app-helpers';
import { syncProject } from '../../sync/write-through';

export function setupPersistenceMiddleware(
  store: StoreApi<StoreState>,
  _getComputedTokens: () => any,
) {
  store.subscribe((state, prevState) => {
    // Guard: skip during initial load, import, or sample mode
    if (state.isInitialLoad || state.isImporting) return;

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
      state.canvasStates !== prevState.canvasStates ||
      state.activeProjectId !== prevState.activeProjectId ||
      state.activePageId !== prevState.activePageId ||
      state.activeThemeId !== prevState.activeThemeId;

    if (!entityChanged) return;

    // Immediately persist group expand states (no debounce)
    if (state.groups !== prevState.groups) {
      saveGroupExpandStates(state.groups);
    }

    // Identify which project(s) changed and sync them
    // Most changes affect the active project only
    const activeProjectId = state.activeProjectId;
    const activeProject = state.projects.find(p => p.id === activeProjectId);

    if (activeProject && !activeProject.isSample) {
      syncProject(activeProjectId);
    }

    // If projects array itself changed (rename, delete, etc.), sync all affected
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
