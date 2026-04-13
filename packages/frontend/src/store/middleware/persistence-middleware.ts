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
import { syncProject, syncProjectNow } from '../../sync/write-through';

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

    // Check if actual content changed (by reference).
    // Excludes projects array — project metadata changes (lastSyncedAt, name)
    // don't need to trigger sync and would cause an infinite loop:
    //   save → onProjectSynced → setProjects → middleware → save → repeat
    // Only sync on actual project DATA changes, not view state.
    // canvasStates (pan/zoom) excluded — it's per-user view state, not project content.
    const contentChanged =
      state.allNodes !== prevState.allNodes ||
      state.tokens !== prevState.tokens ||
      state.groups !== prevState.groups ||
      state.pages !== prevState.pages ||
      state.themes !== prevState.themes;

    if (!contentChanged) return;


    // Immediately persist group expand states (no debounce)
    if (state.groups !== prevState.groups) {
      saveGroupExpandStates(state.groups);
    }

    // Sync the active project (content changed)
    const activeProjectId = state.activeProjectId;
    const activeProject = state.projects.find(p => p.id === activeProjectId);

    if (activeProject && !activeProject.isSample) {
      syncProject(activeProjectId);
    }
  });
}
