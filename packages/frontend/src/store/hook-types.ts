// Shared type definitions for extracted hooks
import type { ColorNode, DesignToken, TokenProject, TokenGroup, CanvasState, Page, Theme, NodeAdvancedLogic } from '../types';

/** Shorthand for React state setters */
export type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/** Sample mode guard — passed to every hook that mutates data */
export interface SampleModeGuard {
  isSampleModeRef: React.MutableRefObject<boolean>;
  sampleModeToast: (action?: string) => void;
}

/** Core entity state setters shared across hooks */
export interface CoreEntitySetters {
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
}

/** Selection state setters */
export interface SelectionSetters {
  setSelectedNodeId: Setter<string | null>;
  setSelectedNodeIds: Setter<string[]>;
}
