import { useRef, useState, useEffect, useCallback } from 'react';
import { ColorNode, DesignToken, TokenProject, TokenGroup, Page, Theme, NodeAdvancedLogic } from '../types';

/**
 * Undoable application state — the full set of domain data that undo/redo
 * should snapshot. UI-only state (selections, pan/zoom, editing flags, etc.)
 * is intentionally excluded so that undo never feels disorienting.
 */
export interface UndoableState {
  allNodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  projects: TokenProject[];
  pages: Page[];
  themes: Theme[];
  activeProjectId: string;
  activePageId: string;
  activeThemeId: string;
  advancedLogic: NodeAdvancedLogic[];
}

export interface UseUndoRedoOptions {
  /** Set to true only after the initial localStorage load is complete */
  enabled: boolean;
  /** Maximum number of undo steps to keep (default: 80) */
  maxHistory?: number;
  /**
   * Milliseconds to wait after the last state change before committing a
   * snapshot.  Rapid sequential changes (e.g. slider drags) within this
   * window are merged into a single undo entry.  (default: 400)
   */
  debounceMs?: number;
}

export interface UseUndoRedoReturn {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Number of available undo steps. */
  undoCount: number;
  /** Number of available redo steps. */
  redoCount: number;
  /**
   * Call this right before a known "batch" operation (like import) to force
   * the current pending debounce to flush so the import becomes its own
   * distinct undo entry.
   */
  flush: () => void;
  /**
   * Pause undo tracking. Flushes any pending batch first, then suppresses
   * new undo entries until resume() is called. All state changes during
   * the paused window are accumulated as one batch.
   * Use for AI Build Mode: pause → execute all tool calls → resume.
   */
  pause: () => void;
  /**
   * Resume undo tracking after a pause(). The accumulated state changes
   * since pause() are committed as a single undo entry.
   */
  resume: () => void;
  /** Whether undo tracking is currently paused. */
  isPaused: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shallow-compare two UndoableState objects by reference on each field. */
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * After an undo/redo restore, React side-effect `useEffect`s (cleanup effects,
 * token-sync effects, etc.) may produce secondary state mutations that create
 * new array references even when nothing semantically changed.  During this
 * "settling" window we silently absorb those changes into the baseline rather
 * than treating them as new user actions (which would wipe the redo stack).
 *
 * 150ms is long enough for 3-4 React render cycles on slow machines, but
 * short enough that a real user action (click, keypress) won't be swallowed.
 */
const SETTLE_MS = 150;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUndoRedo(
  state: UndoableState,
  restoreState: (snapshot: UndoableState) => void,
  options: UseUndoRedoOptions,
): UseUndoRedoReturn {
  const { enabled, maxHistory = 80, debounceMs = 400 } = options;

  // --- Stacks (refs — mutations don't cause re-renders) ---
  const undoStackRef = useRef<UndoableState[]>([]);
  const redoStackRef = useRef<UndoableState[]>([]);

  // --- Reactive state for the UI ---
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  // --- Internal bookkeeping ---
  const lastCommittedRef = useRef<UndoableState>(state);
  const batchStartRef = useRef<UndoableState | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef<UndoableState>(state);
  const seededRef = useRef(false);
  const commitBatchRef = useRef<() => void>(() => {});

  /**
   * Settling mechanism:  After undo/redo, `isSettlingRef` is set to `true`
   * and a timer is started.  While settling, any detected state changes are
   * silently absorbed (lastCommittedRef is updated) but no new undo entries
   * are created and the redo stack is preserved.
   */
  const isSettlingRef = useRef(false);
  const settlingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Pause support (for AI Build Mode batch operations) ---
  const isPausedRef = useRef(false);
  const pauseStartRef = useRef<UndoableState | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Keep latest state ref in sync every render.
  latestStateRef.current = state;

  // ------------------------------------------------------------------
  // Seed: once `enabled` becomes true, record the starting state.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (enabled && !seededRef.current) {
      lastCommittedRef.current = state;
      seededRef.current = true;
    }
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Detect state changes & debounce snapshot commits
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || !seededRef.current) return;

    // During the settling window after undo/redo, silently absorb any
    // side-effect state changes into the baseline.
    if (isSettlingRef.current) {
      lastCommittedRef.current = state;
      return;
    }

    // While paused, skip debounce — changes accumulate silently.
    if (isPausedRef.current) {
      return;
    }

    // Quick exit: nothing actually changed.
    if (!stateChanged(state, lastCommittedRef.current) && batchStartRef.current === null) {
      return;
    }

    // First change in a new batch — capture the "before" state.
    if (batchStartRef.current === null) {
      batchStartRef.current = lastCommittedRef.current;
    }

    // (Re)start debounce timer.
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      commitBatchRef.current();
    }, debounceMs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.allNodes,
    state.tokens,
    state.groups,
    state.projects,
    state.pages,
    state.themes,
    state.activeProjectId,
    state.activePageId,
    state.activeThemeId,
    state.advancedLogic,
    enabled,
  ]);

  // ------------------------------------------------------------------
  // Internal: commit the current debounce batch
  // ------------------------------------------------------------------
  const commitBatch = useCallback(() => {
    if (batchStartRef.current === null) return;

    const snapshotBefore = batchStartRef.current;
    const currentState = latestStateRef.current;

    // Only push if state actually differs from the batch start.
    if (stateChanged(snapshotBefore, currentState)) {
      undoStackRef.current.push(snapshotBefore);
      while (undoStackRef.current.length > maxHistory) {
        undoStackRef.current.shift();
      }
      // Any new user action invalidates the redo stack.
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
      setUndoCount(undoStackRef.current.length);
      setRedoCount(0);
    }

    lastCommittedRef.current = currentState;
    batchStartRef.current = null;
    debounceTimerRef.current = null;
  }, [maxHistory]);

  commitBatchRef.current = commitBatch;

  // ------------------------------------------------------------------
  // Helpers: enter / exit settling mode
  // ------------------------------------------------------------------
  const enterSettling = useCallback(() => {
    isSettlingRef.current = true;
    if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current);
    settlingTimerRef.current = setTimeout(() => {
      isSettlingRef.current = false;
      // Absorb the final settled state as the new baseline.
      lastCommittedRef.current = latestStateRef.current;
      settlingTimerRef.current = null;
    }, SETTLE_MS);
  }, []);

  // ------------------------------------------------------------------
  // flush()
  // ------------------------------------------------------------------
  const flush = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    commitBatch();
  }, [commitBatch]);

  // ------------------------------------------------------------------
  // undo / redo
  // ------------------------------------------------------------------
  const undo = useCallback(() => {
    // Flush any pending batch first.
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      commitBatch();
    }

    const stack = undoStackRef.current;
    if (stack.length === 0) return;

    const currentState = lastCommittedRef.current;
    const snapshot = stack.pop()!;
    redoStackRef.current.push(currentState);
    lastCommittedRef.current = snapshot;

    setCanUndo(stack.length > 0);
    setCanRedo(true);
    setUndoCount(stack.length);
    setRedoCount(redoStackRef.current.length);

    // Enter settling mode BEFORE restoring so the effect sees the flag.
    enterSettling();
    restoreState(snapshot);
  }, [restoreState, commitBatch, enterSettling]);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;

    const currentState = lastCommittedRef.current;
    const snapshot = stack.pop()!;
    undoStackRef.current.push(currentState);
    lastCommittedRef.current = snapshot;

    setCanUndo(true);
    setCanRedo(stack.length > 0);
    setUndoCount(undoStackRef.current.length);
    setRedoCount(stack.length);

    enterSettling();
    restoreState(snapshot);
  }, [restoreState, enterSettling]);

  // ------------------------------------------------------------------
  // Cleanup timers on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
      if (settlingTimerRef.current !== null) clearTimeout(settlingTimerRef.current);
    };
  }, []);

  // ------------------------------------------------------------------
  // pause / resume  (AI Build Mode batch support)
  // ------------------------------------------------------------------
  const pause = useCallback(() => {
    if (isPausedRef.current) return;
    // Flush any pending batch so prior user work is its own entry
    flush();
    // Record the state at pause time — this becomes the "before" snapshot
    pauseStartRef.current = latestStateRef.current;
    lastCommittedRef.current = latestStateRef.current;
    isPausedRef.current = true;
    setIsPaused(true);
  }, [flush]);

  const resume = useCallback(() => {
    if (!isPausedRef.current) return;
    isPausedRef.current = false;
    setIsPaused(false);
    // Commit all changes since pause as a single undo entry
    const beforeState = pauseStartRef.current;
    const currentState = latestStateRef.current;
    if (beforeState && stateChanged(beforeState, currentState)) {
      undoStackRef.current.push(beforeState);
      while (undoStackRef.current.length > maxHistory) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
      setUndoCount(undoStackRef.current.length);
      setRedoCount(0);
    }
    lastCommittedRef.current = currentState;
    pauseStartRef.current = null;
  }, [maxHistory]);

  return { undo, redo, canUndo, canRedo, undoCount, redoCount, flush, pause, resume, isPaused };
}