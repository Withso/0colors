// UI state slice — selection, panel visibility, editing state
// These are ephemeral (not persisted to cloud, not part of undo/redo)
import type { StateCreator } from 'zustand';
import type { ColorNode } from '../../types';
import type { SetStateAction } from '../types';

function resolve<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (prev: T) => T)(current) : action;
}

export interface PendingTokenRestore {
  oldToNewIdMap: Record<string, string>;
  originalNodes: ColorNode[];
  timestamp: number;
}

export interface TokenNavBackState {
  sourceNodeId: string;
  pan: { x: number; y: number };
  zoom: number;
}

export interface UIState {
  // Selection
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  copiedNodes: ColorNode[];
  pendingTokenRestore: PendingTokenRestore | null;
  tokenNavBackState: TokenNavBackState | null;
  goBackFading: boolean;
  multiSelectBarDelay: boolean;
  autoAssignTriggerNodeId: string | null;

  // Panel visibility
  showShortcuts: boolean;
  showCommandPalette: boolean;
  showAIChat: boolean;
  showAISettingsPopup: boolean;
  showDevMode: boolean;
  showTokenTable: boolean;
  showAllVisible: boolean;
  showAuthModal: boolean;
  showPublishPopup: string | null;

  // Editing
  editingProjectId: string | null;
  editingProjectName: string;
  editingThemeId: string | null;
  editingThemeName: string;
  editingPageId: string | null;
  editingPageName: string;
  highlightedProjectId: string | null;

  // View
  sidebarMode: 'color' | 'variables' | 'text' | 'components' | 'animation' | 'layout';

  // Flags
  isInitialLoad: boolean;
  isImporting: boolean;
}

export interface UIActions {
  setSelectedNodeId: (action: SetStateAction<string | null>) => void;
  setSelectedNodeIds: (action: SetStateAction<string[]>) => void;
  setCopiedNodes: (action: SetStateAction<ColorNode[]>) => void;
  setPendingTokenRestore: (action: SetStateAction<PendingTokenRestore | null>) => void;
  setTokenNavBackState: (action: SetStateAction<TokenNavBackState | null>) => void;
  setGoBackFading: (action: SetStateAction<boolean>) => void;
  setMultiSelectBarDelay: (action: SetStateAction<boolean>) => void;
  setAutoAssignTriggerNodeId: (action: SetStateAction<string | null>) => void;

  setShowShortcuts: (action: SetStateAction<boolean>) => void;
  setShowCommandPalette: (action: SetStateAction<boolean>) => void;
  setShowAIChat: (action: SetStateAction<boolean>) => void;
  setShowAISettingsPopup: (action: SetStateAction<boolean>) => void;
  setShowDevMode: (action: SetStateAction<boolean>) => void;
  setShowTokenTable: (action: SetStateAction<boolean>) => void;
  setShowAllVisible: (action: SetStateAction<boolean>) => void;
  setShowAuthModal: (action: SetStateAction<boolean>) => void;
  setShowPublishPopup: (action: SetStateAction<string | null>) => void;

  setEditingProjectId: (action: SetStateAction<string | null>) => void;
  setEditingProjectName: (action: SetStateAction<string>) => void;
  setEditingThemeId: (action: SetStateAction<string | null>) => void;
  setEditingThemeName: (action: SetStateAction<string>) => void;
  setEditingPageId: (action: SetStateAction<string | null>) => void;
  setEditingPageName: (action: SetStateAction<string>) => void;
  setHighlightedProjectId: (action: SetStateAction<string | null>) => void;

  setSidebarMode: (action: SetStateAction<'color' | 'variables' | 'text' | 'components' | 'animation' | 'layout'>) => void;

  setIsInitialLoad: (action: SetStateAction<boolean>) => void;
  setIsImporting: (action: SetStateAction<boolean>) => void;
}

export type UISlice = UIState & UIActions;

// We need StoreState but can't import it without circular dependency
// Use generic 'any' for the full store type in the slice creator
export const createUISlice: StateCreator<any, [], [], UISlice> = (set) => ({
  // Selection
  selectedNodeId: null,
  selectedNodeIds: [],
  copiedNodes: [],
  pendingTokenRestore: null,
  tokenNavBackState: null,
  goBackFading: false,
  multiSelectBarDelay: false,
  autoAssignTriggerNodeId: null,

  // Panel visibility
  showShortcuts: false,
  showCommandPalette: false,
  showAIChat: false,
  showAISettingsPopup: false,
  showDevMode: false,
  showTokenTable: typeof window !== 'undefined' ? localStorage.getItem('showTokenTable') === 'true' : false,
  showAllVisible: false,
  showAuthModal: false,
  showPublishPopup: null,

  // Editing
  editingProjectId: null,
  editingProjectName: '',
  editingThemeId: null,
  editingThemeName: '',
  editingPageId: null,
  editingPageName: '',
  highlightedProjectId: null,

  // View
  sidebarMode: 'color' as const,

  // Flags
  isInitialLoad: true,
  isImporting: false,

  // Setters
  setSelectedNodeId: (a) => set((s: any) => ({ selectedNodeId: resolve(a, s.selectedNodeId) })),
  setSelectedNodeIds: (a) => set((s: any) => ({ selectedNodeIds: resolve(a, s.selectedNodeIds) })),
  setCopiedNodes: (a) => set((s: any) => ({ copiedNodes: resolve(a, s.copiedNodes) })),
  setPendingTokenRestore: (a) => set((s: any) => ({ pendingTokenRestore: resolve(a, s.pendingTokenRestore) })),
  setTokenNavBackState: (a) => set((s: any) => ({ tokenNavBackState: resolve(a, s.tokenNavBackState) })),
  setGoBackFading: (a) => set((s: any) => ({ goBackFading: resolve(a, s.goBackFading) })),
  setMultiSelectBarDelay: (a) => set((s: any) => ({ multiSelectBarDelay: resolve(a, s.multiSelectBarDelay) })),
  setAutoAssignTriggerNodeId: (a) => set((s: any) => ({ autoAssignTriggerNodeId: resolve(a, s.autoAssignTriggerNodeId) })),

  setShowShortcuts: (a) => set((s: any) => ({ showShortcuts: resolve(a, s.showShortcuts) })),
  setShowCommandPalette: (a) => set((s: any) => ({ showCommandPalette: resolve(a, s.showCommandPalette) })),
  setShowAIChat: (a) => set((s: any) => ({ showAIChat: resolve(a, s.showAIChat) })),
  setShowAISettingsPopup: (a) => set((s: any) => ({ showAISettingsPopup: resolve(a, s.showAISettingsPopup) })),
  setShowDevMode: (a) => set((s: any) => ({ showDevMode: resolve(a, s.showDevMode) })),
  setShowTokenTable: (a) => set((s: any) => ({ showTokenTable: resolve(a, s.showTokenTable) })),
  setShowAllVisible: (a) => set((s: any) => ({ showAllVisible: resolve(a, s.showAllVisible) })),
  setShowAuthModal: (a) => set((s: any) => ({ showAuthModal: resolve(a, s.showAuthModal) })),
  setShowPublishPopup: (a) => set((s: any) => ({ showPublishPopup: resolve(a, s.showPublishPopup) })),

  setEditingProjectId: (a) => set((s: any) => ({ editingProjectId: resolve(a, s.editingProjectId) })),
  setEditingProjectName: (a) => set((s: any) => ({ editingProjectName: resolve(a, s.editingProjectName) })),
  setEditingThemeId: (a) => set((s: any) => ({ editingThemeId: resolve(a, s.editingThemeId) })),
  setEditingThemeName: (a) => set((s: any) => ({ editingThemeName: resolve(a, s.editingThemeName) })),
  setEditingPageId: (a) => set((s: any) => ({ editingPageId: resolve(a, s.editingPageId) })),
  setEditingPageName: (a) => set((s: any) => ({ editingPageName: resolve(a, s.editingPageName) })),
  setHighlightedProjectId: (a) => set((s: any) => ({ highlightedProjectId: resolve(a, s.highlightedProjectId) })),

  setSidebarMode: (a) => set((s: any) => ({ sidebarMode: resolve(a, s.sidebarMode) })),

  setIsInitialLoad: (a) => set((s: any) => ({ isInitialLoad: resolve(a, s.isInitialLoad) })),
  setIsImporting: (a) => set((s: any) => ({ isImporting: resolve(a, s.isImporting) })),
});
