// Persistence middleware — debounced save via store subscription
// Writes to IndexedDB (async, non-blocking) as primary storage.
// Falls back to localStorage for backward compatibility during migration period.
import type { StoreApi } from 'zustand';
import type { StoreState } from '../types';
import { saveGroupExpandStates, saveToLocalStorage } from '../../utils/app-helpers';
import { CURRENT_SCHEMA_VERSION } from '../../utils/migrations';
import { db, saveAllToDB } from '../../db';

/**
 * Sets up debounced persistence via store subscription.
 * Writes to both IndexedDB (primary) and localStorage (fallback).
 * Call once after store creation.
 *
 * Reads isInitialLoad, isImporting, and isSampleMode directly from the store.
 * computedTokensRef is still external (passed as callback) since it's a derived cache.
 */
export function setupPersistenceMiddleware(
  store: StoreApi<StoreState>,
  getComputedTokens: () => any,
) {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  store.subscribe((state, prevState) => {
    // Guard: skip during initial load, import, or sample mode
    if (state.isInitialLoad || state.isImporting) return;

    // Derive isSampleMode from store state
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

    // Debounced full save
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const s = store.getState();

      // Primary: async write to IndexedDB (non-blocking)
      saveAllToDB({
        projects: s.projects,
        allNodes: s.allNodes,
        tokens: s.tokens,
        groups: s.groups,
        pages: s.pages,
        themes: s.themes,
        canvasStates: s.canvasStates,
        advancedLogic: s.advancedLogic,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      }).catch((err) => {
        console.error('[Persistence] IndexedDB save failed, falling back to localStorage:', err);
      });

      // localStorage fallback removed — IndexedDB is the primary local storage
    }, 1000);
  });
}
