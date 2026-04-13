// Entity state slice — core domain data
import type { StateCreator } from 'zustand';
import type { StoreState, EntitySlice, SetStateAction } from '../types';
import { getDefaultData } from '../../utils/app-helpers';

/** Resolve a SetStateAction (value or updater function) against current state */
function resolve<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (prev: T) => T)(current) : action;
}

const defaultData = getDefaultData();

export const createEntitySlice: StateCreator<StoreState, [], [], EntitySlice> = (set, get) => ({
  // ── State (default data, overwritten by IndexedDB/localStorage hydration on mount) ──
  allNodes: defaultData.nodes,
  tokens: defaultData.tokens,
  groups: defaultData.groups,
  projects: defaultData.projects,
  pages: defaultData.pages,
  themes: defaultData.themes,
  canvasStates: defaultData.canvasStates,
  advancedLogic: [],
  activeProjectId: defaultData.activeProjectId,
  activePageId: defaultData.activePageId,
  activeThemeId: defaultData.activeThemeId,

  // ── Setters (SetStateAction-compatible for hook bridge) ──
  setAllNodes: (action) => set((s) => ({ allNodes: resolve(action, s.allNodes) })),
  setTokens: (action) => set((s) => ({ tokens: resolve(action, s.tokens) })),
  setGroups: (action) => set((s) => ({ groups: resolve(action, s.groups) })),
  setProjects: (action) => set((s) => ({ projects: resolve(action, s.projects) })),
  setPages: (action) => set((s) => ({ pages: resolve(action, s.pages) })),
  setThemes: (action) => set((s) => ({ themes: resolve(action, s.themes) })),
  setCanvasStates: (action) => set((s) => ({ canvasStates: resolve(action, s.canvasStates) })),
  setAdvancedLogic: (action) => set((s) => ({ advancedLogic: resolve(action, s.advancedLogic) })),
  setActiveProjectId: (action) => set((s) => ({ activeProjectId: resolve(action, s.activeProjectId) })),
  setActivePageId: (action) => set((s) => ({ activePageId: resolve(action, s.activePageId) })),
  setActiveThemeId: (action) => set((s) => ({ activeThemeId: resolve(action, s.activeThemeId) })),

  // ── Hydration ──
  hydrateFromLocalStorage: (data) => set(data),
});
