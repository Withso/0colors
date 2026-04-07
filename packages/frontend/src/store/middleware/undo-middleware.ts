// Undo/Redo middleware for Zustand — ported from useUndoRedo.ts
// Snapshot-based with 400ms debounce, 150ms settling, pause/resume for AI Build Mode
import type { StoreApi } from 'zustand';
import type { StoreState, EntityState } from '../types';

const MAX_HISTORY = 80;
const DEBOUNCE_MS = 400;
const SETTLE_MS = 150;

type UndoableState = EntityState;

/** Shallow-compare two snapshots by reference on each field */
function stateChanged(a: UndoableState, b: UndoableState): boolean {
  return (
    a.allNodes !== b.allNodes ||
    a.tokens !== b.tokens ||
    a.groups !== b.groups ||
    a.projects !== b.projects ||
    a.pages !== b.pages ||
    a.themes !== b.themes ||
    a.activeProjectId !== b.activeProjectId ||
    a.activePageId !== b.activePageId ||
    a.activeThemeId !== b.activeThemeId ||
    a.advancedLogic !== b.advancedLogic
  );
}

/** Extract the undoable subset from full store state */
function extractUndoable(state: StoreState): UndoableState {
  return {
    allNodes: state.allNodes,
    tokens: state.tokens,
    groups: state.groups,
    projects: state.projects,
    pages: state.pages,
    themes: state.themes,
    canvasStates: state.canvasStates,
    advancedLogic: state.advancedLogic,
    activeProjectId: state.activeProjectId,
    activePageId: state.activePageId,
    activeThemeId: state.activeThemeId,
  };
}

/**
 * Sets up undo/redo tracking via store subscription.
 * Call once after store creation.
 */
export function setupUndoMiddleware(store: StoreApi<StoreState>) {
  const undoStack: UndoableState[] = [];
  const redoStack: UndoableState[] = [];

  let lastCommitted: UndoableState = extractUndoable(store.getState());
  let batchStart: UndoableState | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isSettling = false;
  let settlingTimer: ReturnType<typeof setTimeout> | null = null;
  let isPaused = false;
  let pauseStart: UndoableState | null = null;
  let seeded = false;

  function updateUI() {
    store.setState({
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      undoCount: undoStack.length,
      redoCount: redoStack.length,
      isPaused,
    });
  }

  function commitBatch() {
    if (batchStart === null) return;

    const current = extractUndoable(store.getState());

    if (stateChanged(batchStart, current)) {
      undoStack.push(batchStart);
      while (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      redoStack.length = 0;
      updateUI();
    }

    lastCommitted = current;
    batchStart = null;
    debounceTimer = null;
  }

  function enterSettling() {
    isSettling = true;
    if (settlingTimer) clearTimeout(settlingTimer);
    settlingTimer = setTimeout(() => {
      isSettling = false;
      lastCommitted = extractUndoable(store.getState());
      settlingTimer = null;
    }, SETTLE_MS);
  }

  // ── Store actions ──

  const undo = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      commitBatch();
    }

    if (undoStack.length === 0) return;

    const current = lastCommitted;
    const snapshot = undoStack.pop()!;
    redoStack.push(current);
    lastCommitted = snapshot;

    enterSettling();
    store.setState(snapshot);
    updateUI();
  };

  const redo = () => {
    if (redoStack.length === 0) return;

    const current = lastCommitted;
    const snapshot = redoStack.pop()!;
    undoStack.push(current);
    lastCommitted = snapshot;

    enterSettling();
    store.setState(snapshot);
    updateUI();
  };

  const flushUndo = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    commitBatch();
  };

  const pauseUndo = () => {
    if (isPaused) return;
    flushUndo();
    pauseStart = extractUndoable(store.getState());
    lastCommitted = pauseStart;
    isPaused = true;
    store.setState({ isPaused: true });
  };

  const resumeUndo = () => {
    if (!isPaused) return;
    isPaused = false;

    const current = extractUndoable(store.getState());
    if (pauseStart && stateChanged(pauseStart, current)) {
      undoStack.push(pauseStart);
      while (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      redoStack.length = 0;
    }
    lastCommitted = current;
    pauseStart = null;
    store.setState({ isPaused: false });
    updateUI();
  };

  // ── Subscribe to entity state changes ──
  store.subscribe((state, prevState) => {
    if (!seeded) return;
    if (isSettling) {
      lastCommitted = extractUndoable(state);
      return;
    }
    if (isPaused) return;

    const current = extractUndoable(state);
    if (!stateChanged(current, lastCommitted) && batchStart === null) return;

    if (batchStart === null) {
      batchStart = lastCommitted;
    }

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(commitBatch, DEBOUNCE_MS);
  });

  // ── Set actions on store ──
  store.setState({
    undo,
    redo,
    flushUndo,
    pauseUndo,
    resumeUndo,
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
    isPaused: false,
  });

  // Return a seed function to call after initial hydration
  return {
    /** Call after localStorage hydration to start tracking */
    seed: () => {
      lastCommitted = extractUndoable(store.getState());
      seeded = true;
    },
  };
}
