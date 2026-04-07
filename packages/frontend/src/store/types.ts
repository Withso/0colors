// Zustand store type definitions
import type {
  ColorNode, DesignToken, TokenProject, TokenGroup,
  CanvasState, Page, Theme, NodeAdvancedLogic,
} from '../types';

// ── SetStateAction compatibility ──
// Matches React.Dispatch<React.SetStateAction<T>> so existing extracted hooks
// (useTokenOperations, useNodeUpdate, etc.) work without changes.
export type SetStateAction<T> = T | ((prev: T) => T);
export type Setter<T> = (action: SetStateAction<T>) => void;

// ── Entity Slice ──
export interface EntityState {
  allNodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  projects: TokenProject[];
  pages: Page[];
  themes: Theme[];
  canvasStates: CanvasState[];
  advancedLogic: NodeAdvancedLogic[];
  activeProjectId: string;
  activePageId: string;
  activeThemeId: string;
}

export interface EntityActions {
  setAllNodes: Setter<ColorNode[]>;
  setTokens: Setter<DesignToken[]>;
  setGroups: Setter<TokenGroup[]>;
  setProjects: Setter<TokenProject[]>;
  setPages: Setter<Page[]>;
  setThemes: Setter<Theme[]>;
  setCanvasStates: Setter<CanvasState[]>;
  setAdvancedLogic: Setter<NodeAdvancedLogic[]>;
  setActiveProjectId: Setter<string>;
  setActivePageId: Setter<string>;
  setActiveThemeId: Setter<string>;
  /** Hydrate all entity state from localStorage on mount */
  hydrateFromLocalStorage: (data: Partial<EntityState>) => void;
}

export type EntitySlice = EntityState & EntityActions;

// ── Undo Slice ──
export interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  isPaused: boolean;
}

export interface UndoActions {
  undo: () => void;
  redo: () => void;
  flushUndo: () => void;
  pauseUndo: () => void;
  resumeUndo: () => void;
}

export type UndoSlice = UndoState & UndoActions;

// ── UI Slice ── (re-exported from slices/ui-slice.ts)
export type { UISlice } from './slices/ui-slice';

// ── Auth Slice ── (re-exported from slices/auth-slice.ts)
export type { AuthSlice } from './slices/auth-slice';

// ── Full Store ──
import type { UISlice } from './slices/ui-slice';
import type { AuthSlice } from './slices/auth-slice';
export type StoreState = EntitySlice & UndoSlice & UISlice & AuthSlice;
