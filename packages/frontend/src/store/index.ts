// Zustand store — single store with entity + undo + UI + auth slices
import { create } from 'zustand';
import type { StoreState } from './types';
import { createEntitySlice } from './slices/entity-slice';
import { createUISlice } from './slices/ui-slice';
import { createAuthSlice } from './slices/auth-slice';
import { setupUndoMiddleware } from './middleware/undo-middleware';
import { setupPersistenceMiddleware } from './middleware/persistence-middleware';

export const useStore = create<StoreState>()((...a) => ({
  ...createEntitySlice(...a),
  ...createUISlice(...a),
  ...createAuthSlice(...a),
  // Undo state/actions are injected by setupUndoMiddleware after creation
  canUndo: false,
  canRedo: false,
  undoCount: 0,
  redoCount: 0,
  isPaused: false,
  undo: () => {},
  redo: () => {},
  flushUndo: () => {},
  pauseUndo: () => {},
  resumeUndo: () => {},
}));

// Setup undo middleware (subscribes to store)
export const undoMiddleware = setupUndoMiddleware(useStore);

// Setup persistence middleware (debounced localStorage save)
// computedTokensRef is populated by App.tsx's computed tokens effect
let _computedTokensRef: any = {};
export function setComputedTokensRef(ref: any) { _computedTokensRef = ref; }
setupPersistenceMiddleware(useStore, () => _computedTokensRef);

// Re-export types for convenience
export type { StoreState } from './types';
