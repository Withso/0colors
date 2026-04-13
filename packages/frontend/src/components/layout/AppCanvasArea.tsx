/**
 * AppCanvasArea — the main canvas content area extracted from AppShell.
 *
 * Contains:
 *  - Sign In button (top-right, non-auth)
 *  - Template Switcher dropdown (sample mode)
 *  - Sample mode read-only bar + Duplicate/Remix buttons
 *  - "Go back" navigation prompt
 *  - "Restore tokens" prompt
 *  - Primary theme multi-select toolbar (visibility, duplicate, delete)
 *  - Non-primary theme multi-select toolbar (inheritance toggles)
 *  - Bottom toolbar (AI, node tools, view controls, dev mode, shortcuts)
 *  - Non-primary theme AI float button
 *  - Undo/Redo buttons
 *  - View content (ConnectedColorCanvas / ConnectedCodePreview / ConnectedMultiPageExport)
 *  - Visibility toggle hint
 */

import { useStore } from '../../store';
import { ConnectedColorCanvas } from '../canvas/ConnectedColorCanvas';
import { ConnectedCodePreview } from '../../pages/ConnectedCodePreview';
import { ConnectedMultiPageExport } from '../../pages/ConnectedMultiPageExport';
import { Tip } from '../Tip';
import {
  Copy, Download, ChevronDown, Trash2, ArrowLeft, Search,
  Workflow, Palette, Tag, Undo2, Redo2, Maximize, Locate, Lightbulb,
  RotateCw, Eye, EyeOff, Command, BookOpen, Lock, Sparkles, Terminal,
  LogIn, Globe, Shuffle, Crown, RefreshCw,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Switch } from '../ui/switch';
import { isNodeHiddenInTheme } from '../../utils/visibility';
import { useNodeCreation } from '../../store/useNodeCreation';
import { useNodeMutations } from '../../store/useNodeMutations';
import { useNodeUpdate } from '../../store/useNodeUpdate';
import { GO_BACK_FADE_MS } from '../../hooks/useUIEffects';
import { toast } from 'sonner';
import type { SampleTemplate } from '../../utils/sample-templates';
import type { ProjectComputedTokens } from '../../utils/computed-tokens';
import type { MutableRefObject } from 'react';

// ── Props ──
export interface AppCanvasAreaProps {
  /** URL-wrapped setViewMode from useUrlRouting */
  setViewMode: (mode: 'canvas' | 'code' | 'export') => void;
  /** Ref holding computed tokens per project */
  computedTokensRef: MutableRefObject<Record<string, ProjectComputedTokens>>;
  /** Whether the current project is a community project */
  isCommunityMode: boolean;
  /** Whether the current project is a read-only sample */
  isSampleMode: boolean;
  /** All sample templates (with _origIdx and projectId) */
  sampleTemplates: (SampleTemplate & { _origIdx: number; projectId: string })[];
  /** Filtered sample templates (search applied) */
  filteredSampleTemplates: (SampleTemplate & { _origIdx: number; projectId: string })[];
  /** Index of the active sample template */
  activeSampleIdx: number;
  /** Switch to a different sample template */
  handleSwitchSampleTemplate: (idx: number) => void;
  /** Duplicate / remix the sample project */
  handleDuplicateSampleProject: (type: 'local' | 'cloud') => void;
  /** Navigate back to the projects dashboard */
  handleBackToProjects: () => void;
  /** Go-back button mouse enter handler (from useUIEffects) */
  handleGoBackMouseEnter: () => void;
  /** Go-back button mouse leave handler (from useUIEffects) */
  handleGoBackMouseLeave: () => void;
  /** Navigate back to previous canvas position (from useUIEffects) */
  handleTokenNavGoBack: () => void;
}

export function AppCanvasArea({
  setViewMode,
  computedTokensRef,
  isCommunityMode,
  isSampleMode,
  sampleTemplates,
  filteredSampleTemplates,
  activeSampleIdx,
  handleSwitchSampleTemplate,
  handleDuplicateSampleProject,
  handleBackToProjects,
  handleGoBackMouseEnter,
  handleGoBackMouseLeave,
  handleTokenNavGoBack,
}: AppCanvasAreaProps) {
  // ── Store selectors ──
  const selectedNodeId = useStore(s => s.selectedNodeId);
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const selectedNodeIds = useStore(s => s.selectedNodeIds);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);
  const allNodes = useStore(s => s.allNodes);
  const setAllNodes = useStore(s => s.setAllNodes);
  const tokens = useStore(s => s.tokens);
  const themes = useStore(s => s.themes);
  const projects = useStore(s => s.projects);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activePageId = useStore(s => s.activePageId);
  const activeThemeId = useStore(s => s.activeThemeId);

  const showAIChat = useStore(s => s.showAIChat);
  const setShowAIChat = useStore(s => s.setShowAIChat);
  const showDevMode = useStore(s => s.showDevMode);
  const setShowDevMode = useStore(s => s.setShowDevMode);
  const showShortcuts = useStore(s => s.showShortcuts);
  const setShowShortcuts = useStore(s => s.setShowShortcuts);
  const showCommandPalette = useStore(s => s.showCommandPalette);
  const setShowCommandPalette = useStore(s => s.setShowCommandPalette);
  const showAllVisible = useStore(s => s.showAllVisible);
  const autoAssignTriggerNodeId = useStore(s => s.autoAssignTriggerNodeId);
  // Auth: redirect to accounts.zeros.design
  const redirectToZerosLogin = () => {
    const returnUrl = encodeURIComponent(window.location.origin + window.location.pathname + window.location.search);
    window.location.href = `https://accounts.zeros.design/login?product_id=0colors&redirect_url=${returnUrl}`;
  };

  const viewMode = useStore(s => s.viewMode);
  const authSession = useStore(s => s.authSession);

  const pendingTokenRestore = useStore(s => s.pendingTokenRestore);
  const tokenNavBackState = useStore(s => s.tokenNavBackState);
  const goBackFading = useStore(s => s.goBackFading);
  const multiSelectBarDelay = useStore(s => s.multiSelectBarDelay);

  const sampleTemplateSearch = useStore(s => s.sampleTemplateSearch);
  const setSampleTemplateSearch = useStore(s => s.setSampleTemplateSearch);

  // Undo / redo from store (set by undo middleware)
  const canUndo = useStore(s => s.canUndo);
  const canRedo = useStore(s => s.canRedo);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  const undoCount = useStore(s => s.undoCount);
  const redoCount = useStore(s => s.redoCount);

  // ── Derived state ──
  const activeTheme = themes.find(t => t.id === activeThemeId);
  const primaryTheme = themes.find(t => t.projectId === activeProjectId && t.isPrimary);
  const isViewingPrimaryTheme = activeTheme?.isPrimary === true;

  // ── Hooks ──
  const { addRootNode, addPaletteNode, addSpacingNode, addTokenNode } = useNodeCreation();
  const { deleteNode, duplicateNode, handleRestoreTokens } = useNodeMutations();
  const { revertThemeAdvancedLogic } = useNodeUpdate();

  // ── JSX ──
  return (
    <div className="app-canvas" data-testid="canvas-area-container">

      {/* Top-right canvas area: Sign In button only (no template name) */}
      {!authSession && (
        <div className="app-canvas-top-right" data-testid="canvas-top-right-actions">
          <button
            className="app-canvas-signin-btn"
            onClick={redirectToZerosLogin}
            data-testid="auth-canvas-signin-button"
          >
            <LogIn className="app-icon-3-5" />
            <span className="app-canvas-signin-label">Sign In</span>
          </button>
        </div>
      )}

      {isSampleMode && (
        <div className="app-sample-bar-wrap" style={{ bottom: viewMode === 'canvas' && isViewingPrimaryTheme ? '5rem' : '24px' }} data-testid="canvas-sample-bar-wrap">
          <div className="app-sample-bar" data-testid="canvas-sample-bar">
            <div className="app-sample-bar-info">
              <div className="app-sample-bar-icon">
                {isCommunityMode ? <Globe className="app-icon-3 app-icon-brand" /> : <Lock className="app-icon-3 app-icon-brand" />}
              </div>
              <span className="app-sample-bar-text">
                {isCommunityMode
                  ? `Community project${(window as any).__communityProjectMeta?.userName ? ` by ${(window as any).__communityProjectMeta.userName}` : ''}`
                  : 'You are viewing a read-only sample project'
                }
              </span>
            </div>
            {/* Show Duplicate/Remix button: always for sample, conditionally for community (allowRemix) */}
            {(!isCommunityMode || (window as any).__communityProjectMeta?.allowRemix) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="app-sample-bar-action-btn" data-testid="canvas-sample-duplicate-trigger">
                    {isCommunityMode ? <Shuffle className="app-icon-3" /> : <Copy className="app-icon-3" />}
                    <span>{isCommunityMode ? 'Remix' : 'Duplicate'}</span>
                    <ChevronDown className="app-icon-3 app-icon-opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="app-sample-bar-dropdown" data-testid="canvas-sample-duplicate-menu">
                  <div className="app-sample-bar-dropdown-header">
                    {isCommunityMode ? 'Remix as' : 'Duplicate as'}
                  </div>
                  {!!authSession && (
                    <DropdownMenuItem
                      onClick={() => handleDuplicateSampleProject('cloud')}
                      className="app-sample-bar-dropdown-item"
                      data-testid="canvas-sample-duplicate-cloud"
                    >
                      <RefreshCw className="app-icon-3-5 app-icon-ai" />
                      <div className="app-sample-bar-dropdown-item-col">
                        <span className="app-sample-bar-dropdown-item-title">Cloud Project</span>
                        <span className="app-sample-bar-dropdown-item-desc">Synced to Supabase</span>
                      </div>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => handleDuplicateSampleProject('local')}
                    className="app-sample-bar-dropdown-item"
                    data-testid="canvas-sample-duplicate-local"
                  >
                    <Download className="app-icon-3-5 app-icon-grey-500" />
                    <div className="app-sample-bar-dropdown-item-col">
                      <span className="app-sample-bar-dropdown-item-title">Local Project</span>
                      <span className="app-sample-bar-dropdown-item-desc">Saved to browser storage</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {/* "Go back" prompt -- shown after navigating to a node via Target icon (color or token node) */}
      {viewMode === 'canvas' && tokenNavBackState && (() => {
        const multiBarVisible = isViewingPrimaryTheme && selectedNodeIds.length > 1 && !multiSelectBarDelay;
        const restoreBarVisible = isViewingPrimaryTheme && !!pendingTokenRestore;
        let bottomClass = 'bottom-[5.5rem]';
        if (multiBarVisible && restoreBarVisible) bottomClass = 'bottom-[12rem]';
        else if (multiBarVisible || restoreBarVisible) bottomClass = 'bottom-[8.75rem]';
        return (
          <div
            className="app-prompt-wrap app-prompt-wrap-transition"
            style={{
              bottom: bottomClass === 'bottom-[12rem]' ? '12rem' : bottomClass === 'bottom-[8.75rem]' ? '8.75rem' : '5.5rem',
              animation: goBackFading
                ? `goBackFadeOut ${GO_BACK_FADE_MS}ms ease-in forwards`
                : 'fadeSlideUp 0.25s ease-out',
            }}
          >
            <button
              className="app-prompt-btn"
              onClick={handleTokenNavGoBack}
              onMouseEnter={handleGoBackMouseEnter}
              onMouseLeave={handleGoBackMouseLeave}
              data-testid="canvas-nav-goback-button"
            >
              <div className="app-prompt-icon">
                <ArrowLeft size={13} className="app-icon-brand" />
              </div>
              <span className="app-prompt-label">
                Go back
              </span>
            </button>
          </div>
        );
      })()}

      {/* Restore assigned tokens prompt -- above the floating bottom bar (primary theme only) */}
      {viewMode === 'canvas' && isViewingPrimaryTheme && pendingTokenRestore && (() => {
        const multiBarVisible = isViewingPrimaryTheme && selectedNodeIds.length > 1 && !multiSelectBarDelay;
        return (
          <div className="app-prompt-wrap app-prompt-wrap-transition"
            style={{ bottom: multiBarVisible ? '8.75rem' : '5.5rem', animation: 'fadeSlideUp 0.25s ease-out' }}
          >
            <button
              className="app-prompt-btn"
              onClick={handleRestoreTokens}
              data-testid="canvas-multiselect-restore-tokens-button"
            >
              <div className="app-prompt-icon">
                <RotateCw size={13} className="app-icon-brand" />
              </div>
              <span className="app-prompt-label">
                Restore assigned tokens
              </span>
            </button>
          </div>
        );
      })()}

      {/* Multi-Selection Floating Toolbar -- appears above the bottom bar when 2+ nodes are multi-selected */}
      {viewMode === 'canvas' && isViewingPrimaryTheme && selectedNodeIds.length > 1 && !multiSelectBarDelay && (() => {
        const selectedNodes = allNodes.filter(n => selectedNodeIds.includes(n.id));
        const hiddenCount = selectedNodes.filter(n => isNodeHiddenInTheme(n, activeThemeId, primaryTheme?.id || '', allNodes)).length;
        const visibleCount = selectedNodes.length - hiddenCount;
        const allVisible = hiddenCount === 0;
        const allHidden = visibleCount === 0;
        const mixed = !allVisible && !allHidden;

        return (
          <div
            className="app-prompt-wrap"
            style={{ bottom: '5.5rem', animation: 'fadeSlideUp 0.2s ease-out' }}
          >
            <div className="app-multiselect-bar" data-testid="canvas-multiselect-bar-primary">
              {/* Selection count label */}
              <span className="app-multiselect-count">
                {selectedNodeIds.length} selected
              </span>

              {/* Divider */}
              <div className="app-multiselect-divider" />

              {/* Visibility toggle */}
              <Tip label={allVisible ? 'Hide Selected' : allHidden ? 'Show Selected' : 'Mixed Visibility'} side="top">
                <button
                  className={`app-multiselect-btn ${mixed
                      ? 'app-multiselect-btn-mixed'
                      : allHidden
                        ? 'app-multiselect-btn-hidden-all'
                        : 'app-multiselect-btn-default'
                    }`}
                  disabled={mixed}
                  data-testid="canvas-multiselect-visibility-toggle"
                  onClick={() => {
                    if (mixed) return;
                    setAllNodes(prev => prev.map(node => {
                      if (!selectedNodeIds.includes(node.id)) return node;
                      const vis = { ...(node.themeVisibility || {}) };
                      if (allVisible) {
                        vis[activeThemeId] = false;
                      } else {
                        delete vis[activeThemeId];
                      }
                      return { ...node, themeVisibility: Object.keys(vis).length > 0 ? vis : undefined };
                    }));
                  }}
                >
                  {allHidden ? <EyeOff className="app-icon-16" /> : <Eye className="app-icon-16" />}
                </button>
              </Tip>

              {/* Duplicate */}
              <Tip label="Duplicate" side="top">
                <button
                  className="app-multiselect-btn app-multiselect-btn-default"
                  data-testid="canvas-multiselect-duplicate-button"
                  onClick={() => {
                    if (selectedNodeIds.length > 1) {
                      duplicateNode(selectedNodeIds);
                    } else if (selectedNodeId) {
                      duplicateNode(selectedNodeId);
                    }
                  }}
                >
                  <Copy className="app-icon-16" />
                </button>
              </Tip>

              {/* Delete */}
              <Tip label="Delete" side="top">
                <button
                  className="app-multiselect-btn app-multiselect-btn-delete"
                  data-testid="canvas-multiselect-delete-button"
                  onClick={() => {
                    selectedNodeIds.forEach(nodeId => deleteNode(nodeId));
                    setSelectedNodeIds([]);
                    setSelectedNodeId(null);
                  }}
                >
                  <Trash2 className="app-icon-16" />
                </button>
              </Tip>
            </div>
          </div>
        );
      })()}

      {/* Non-Primary Theme Multi-Selection Floating Toolbar -- visibility + inheritance toggles */}
      {viewMode === 'canvas' && !isViewingPrimaryTheme && selectedNodeIds.length > 1 && (() => {
        const selectedNodes = allNodes.filter(n => selectedNodeIds.includes(n.id));
        // Visibility state
        const hiddenCount = selectedNodes.filter(n => isNodeHiddenInTheme(n, activeThemeId, primaryTheme?.id || '', allNodes)).length;
        const visibleCount = selectedNodes.length - hiddenCount;
        const allVisible = hiddenCount === 0;
        const allHidden = visibleCount === 0;
        const mixedVisibility = !allVisible && !allHidden;

        // Inheritance state
        const inheritedCount = selectedNodes.filter(n => !n.themeOverrides || !n.themeOverrides[activeThemeId]).length;
        const notInheritedCount = selectedNodes.length - inheritedCount;
        const allInherited = notInheritedCount === 0;
        const allNotInherited = inheritedCount === 0;
        const mixedInheritance = !allInherited && !allNotInherited;

        return (
          <div
            className="app-prompt-wrap"
            style={{ bottom: '24px', animation: 'fadeSlideUp 0.2s ease-out' }}
          >
            <div className="app-multiselect-bar" data-testid="canvas-multiselect-bar-theme">
              {/* Selection count label */}
              <span className="app-multiselect-count">
                {selectedNodeIds.length} selected
              </span>

              {/* Divider */}
              <div className="app-multiselect-divider" />

              {/* Inheritance toggle */}
              <Tip label={allInherited ? 'Unlink all from primary' : allNotInherited ? 'Link all to primary' : 'Mixed inheritance'} side="top">
                <div
                  className={`app-multiselect-inherit-wrap ${mixedInheritance ? 'app-multiselect-inherit-disabled' : 'app-multiselect-inherit-enabled'
                    }`}
                >
                  <Crown
                    className={`app-icon-3 app-icon-shrink ${mixedInheritance
                        ? 'app-multiselect-inherit-icon-mixed'
                        : allInherited
                          ? 'app-multiselect-inherit-icon-linked'
                          : allNotInherited
                            ? 'app-multiselect-inherit-icon-unlinked'
                            : 'app-multiselect-inherit-icon-mixed'
                      }`}
                  />
                  <Switch
                    checked={allInherited}
                    disabled={mixedInheritance}
                    data-testid="canvas-multiselect-inherit-switch"
                    onCheckedChange={(checked) => {
                      if (mixedInheritance) return;
                      setAllNodes(prev => prev.map(node => {
                        if (!selectedNodeIds.includes(node.id)) return node;
                        if (checked) {
                          // Re-link: remove theme override for this theme
                          const newOverrides = { ...node.themeOverrides };
                          delete newOverrides[activeThemeId];
                          // Also clear theme-specific advanced logic
                          revertThemeAdvancedLogic(node.id, activeThemeId);
                          return {
                            ...node,
                            themeOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : undefined,
                          };
                        } else {
                          // Unlink: create theme override with current color values
                          const currentValues = {
                            hue: node.hue,
                            saturation: node.saturation,
                            lightness: node.lightness,
                            alpha: node.alpha,
                            red: node.red,
                            green: node.green,
                            blue: node.blue,
                            oklchL: node.oklchL,
                            oklchC: node.oklchC,
                            oklchH: node.oklchH,
                            hctH: node.hctH,
                            hctC: node.hctC,
                            hctT: node.hctT,
                            hexValue: node.hexValue,
                          };
                          return {
                            ...node,
                            themeOverrides: {
                              ...node.themeOverrides,
                              [activeThemeId]: currentValues,
                            },
                          };
                        }
                      }));
                    }}
                    className="app-inherit-switch"
                  />
                </div>
              </Tip>

              {/* Divider */}
              <div className="app-multiselect-divider" />

              {/* Visibility toggle */}
              <Tip label={allVisible ? 'Hide Selected' : allHidden ? 'Show Selected' : 'Mixed Visibility'} side="top">
                <button
                  className={`app-multiselect-btn ${mixedVisibility
                      ? 'app-multiselect-btn-mixed'
                      : allHidden
                        ? 'app-multiselect-btn-hidden-all'
                        : 'app-multiselect-btn-default'
                    }`}
                  disabled={mixedVisibility}
                  data-testid="canvas-multiselect-theme-visibility-toggle"
                  onClick={() => {
                    if (mixedVisibility) return;
                    setAllNodes(prev => prev.map(node => {
                      if (!selectedNodeIds.includes(node.id)) return node;
                      const vis = { ...(node.themeVisibility || {}) };
                      if (allVisible) {
                        vis[activeThemeId] = false;
                      } else {
                        delete vis[activeThemeId];
                      }
                      return { ...node, themeVisibility: Object.keys(vis).length > 0 ? vis : undefined };
                    }));
                  }}
                >
                  {allHidden ? <EyeOff className="app-icon-16" /> : <Eye className="app-icon-16" />}
                </button>
              </Tip>
            </div>
          </div>
        );
      })()}

      {/* Floating Bottom Toolbar - Figma-style unified bar */}
      {viewMode === 'canvas' && isViewingPrimaryTheme && (
        <div className="app-bottom-toolbar" data-testid="canvas-bottom-toolbar">
          {/* Ask AI Island (leftmost) */}
          <div
            className="app-bottom-island"
          >
            <Tip label="Ask AI" side="top">
              <button
                className={`app-bottom-btn-with-label ${showAIChat
                    ? 'app-bottom-btn-active-ai'
                    : ''
                  }`}
                data-testid="ai-chat-toolbar-button"
                onClick={() => {
                  const activeProject = projects.find(p => p.id === activeProjectId);
                  if (activeProject?.isSample) {
                    toast('Ask AI is not available for sample projects', {
                      description: 'Duplicate the project to use Ask AI.',
                    });
                    return;
                  }
                  setShowAIChat(prev => !prev);
                }}
              >
                <Sparkles className="app-icon-18" />
                <span className="app-bottom-btn-label">AI</span>
              </button>
            </Tip>
          </div>

          {/* Sign In button moved to top-right of canvas (near template switcher) */}

          <div className="app-bottom-island"
          >
            {/* Node tool with dropdown */}
            <DropdownMenu>
              <Tip label="Add Color Node" side="top">
                <DropdownMenuTrigger asChild>
                  <button
                    className="app-bottom-node-trigger"
                    data-testid="canvas-bottom-add-node-trigger"
                  >
                    <Workflow className="app-icon-18" />
                    <ChevronDown className="app-icon-3 app-chevron-group" />
                  </button>
                </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent align="center" sideOffset={12} className="app-bottom-node-dropdown" data-testid="canvas-bottom-add-node-menu">
                <DropdownMenuItem
                  onClick={() => addRootNode('hsl')}
                  className="app-bottom-node-dropdown-item"
                  data-testid="canvas-bottom-add-node-hsl"
                >
                  HSL
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addRootNode('rgb')}
                  className="app-bottom-node-dropdown-item"
                  data-testid="canvas-bottom-add-node-rgb"
                >
                  RGB
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addRootNode('oklch')}
                  className="app-bottom-node-dropdown-item"
                  data-testid="canvas-bottom-add-node-oklch"
                >
                  OKLCH
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addRootNode('hct')}
                  className="app-bottom-node-dropdown-item"
                  data-testid="canvas-bottom-add-node-hct"
                >
                  HCT
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Palette tool */}
            <Tip label="Add Palette" side="top">
              <button
                className="app-bottom-btn"
                onClick={addPaletteNode}
                data-testid="canvas-bottom-add-palette-button"
              >
                <Palette className="app-icon-18" />
              </button>
            </Tip>

            {/* Token Node tool */}
            <Tip label="Add Token Node" side="top">
              <button
                className="app-bottom-btn"
                onClick={addTokenNode}
                data-testid="canvas-bottom-add-token-node-button"
              >
                <Tag className="app-icon-18" />
              </button>
            </Tip>

            {/* Spacing tool -- hidden for now, will implement later */}
            {/* <button
              className="app-bottom-btn"
              onClick={addSpacingNode}
              title="Add spacing node"
            >
              <Ruler className="app-icon-18" />
            </button> */}

            {/* Reset tool -- hidden for now */}
            {/* <button
              className="app-bottom-btn"
              onClick={resetToDefaults}
              title="Reset to default data"
            >
              <RotateCcw className="app-icon-18" />
            </button> */}
          </div>

          {/* Companion bar -- View controls */}
          <div
            className="app-bottom-island"
          >
            {/* Fit all nodes */}
            <Tip label="Zoom to Fit" side="top">
              <button
                className="app-bottom-btn"
                onClick={() => window.dispatchEvent(new Event('canvasFitAll'))}
                data-testid="canvas-bottom-zoom-fit-button"
              >
                <Maximize className="app-icon-18" />
              </button>
            </Tip>

            {/* Reset view */}
            <Tip label="Reset View" side="top">
              <button
                className="app-bottom-btn"
                onClick={() => window.dispatchEvent(new Event('canvasResetView'))}
                data-testid="canvas-bottom-reset-view-button"
              >
                <Locate className="app-icon-18" />
              </button>
            </Tip>
          </div>

          {/* Dev Mode Island -- only for cloud projects */}
          {(() => {
            const proj = projects.find(p => p.id === activeProjectId);
            return proj?.isCloud ? (
              <div
                className="app-bottom-island"
              >
                <Tip label="Dev Mode -- Code Sync & Webhooks" side="top">
                  <button
                    className={`app-bottom-btn-with-label ${showDevMode
                        ? 'app-bottom-btn-active-success'
                        : ''
                      }`}
                    onClick={() => setShowDevMode(prev => !prev)}
                    data-testid="dev-mode-toolbar-toggle"
                  >
                    <Terminal className="app-icon-18" />
                    <span className="app-bottom-btn-label">Dev</span>
                  </button>
                </Tip>
              </div>
            ) : null;
          })()}

          {/* Actions (Cmd+K) Island */}
          <div
            className="app-bottom-island"
          >
            <Tip label="Actions (⌘K)" side="top">
              <button
                className="app-bottom-btn-with-label"
                onClick={() => setShowCommandPalette(true)}
                data-testid="command-palette-open-button"
              >
                <Command className="app-icon-18" />
                <span className="app-bottom-btn-label-dim">⌘K</span>
              </button>
            </Tip>
          </div>

          {/* Shortcuts & Tips Island */}
          <div
            className="app-bottom-island"
          >
            <Tip label="Shortcuts & Tips" side="top">
              <button
                className={`app-bottom-btn ${showShortcuts
                    ? 'app-bottom-btn-active-fg'
                    : ''
                  }`}
                onClick={() => setShowShortcuts(prev => !prev)}
                data-testid="shortcuts-panel-toggle-button"
              >
                <Lightbulb className="app-icon-18" />
              </button>
            </Tip>
          </div>
        </div>
      )}

      {/* Ask AI floating button -- for non-primary themes (primary themes have it in the main toolbar) */}
      {viewMode === 'canvas' && !isViewingPrimaryTheme && (
        <div className="app-canvas-ai-float">
          <div
            className="app-canvas-ai-float-inner"
          >
            <Tip label="Ask AI" side="top">
              <button
                className={`app-bottom-btn-with-label ${showAIChat
                    ? 'app-bottom-btn-active-ai'
                    : ''
                  }`}
                data-testid="ai-chat-float-button"
                onClick={() => {
                  const activeProject = projects.find(p => p.id === activeProjectId);
                  if (activeProject?.isSample) {
                    toast('Ask AI is not available for sample projects', {
                      description: 'Duplicate the project to use Ask AI.',
                    });
                    return;
                  }
                  setShowAIChat(prev => !prev);
                }}
              >
                <Sparkles className="app-icon-18" />
                <span className="app-bottom-btn-label">AI</span>
              </button>
            </Tip>
          </div>
        </div>
      )}

      {/* Undo / Redo buttons -- bottom-left of canvas (canvas view only) */}
      {viewMode === 'canvas' && (
        <div className="app-undo-redo-wrap" data-testid="canvas-undo-redo-wrap">
          <div className="app-undo-redo-group">
            <Tip label="Undo" side="top" enabled={canUndo}>
              <button
                className={`app-undo-redo-btn ${canUndo
                    ? 'app-undo-redo-btn-enabled'
                    : 'app-undo-redo-btn-disabled'
                  }`}
                onClick={undo}
                disabled={!canUndo}
                data-testid="canvas-undo-button"
              >
                <Undo2 className="app-icon-15" />
              </button>
            </Tip>
            {canUndo && (
              <span className="app-undo-redo-badge"
                style={{ fontSize: '10px', lineHeight: '14px', minWidth: '18px', textAlign: 'center' }}
              >
                {undoCount}
              </span>
            )}
          </div>
          <div className="app-undo-redo-group">
            <Tip label="Redo" side="top" enabled={canRedo}>
              <button
                className={`app-undo-redo-btn ${canRedo
                    ? 'app-undo-redo-btn-enabled'
                    : 'app-undo-redo-btn-disabled'
                  }`}
                onClick={redo}
                disabled={!canRedo}
                data-testid="canvas-redo-button"
              >
                <Redo2 className="app-icon-15" />
              </button>
            </Tip>
            {canRedo && (
              <span className="app-undo-redo-badge"
                style={{ fontSize: '10px', lineHeight: '14px', minWidth: '18px', textAlign: 'center' }}
              >
                {redoCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Canvas Content Area */}
      <div className="app-canvas-content" data-testid="page-editor">
        {viewMode === 'canvas' ? (
          <ConnectedColorCanvas onNavigateToProjects={handleBackToProjects} />
        ) : viewMode === 'code' ? (
          <ConnectedCodePreview computedTokens={computedTokensRef.current[activeProjectId]} />
        ) : (
          <ConnectedMultiPageExport computedTokens={computedTokensRef.current[activeProjectId]} />
        )}

        {/* Bottom-left hint for O key visibility toggle (non-primary themes, canvas mode only) */}
        {viewMode === 'canvas' && !isViewingPrimaryTheme && (
          <div className={`app-visibility-hint ${showAllVisible ? 'app-visibility-hint-visible' : 'app-visibility-hint-dim'}`}>
            <div className="app-visibility-hint-inner">
              <kbd className="app-visibility-hint-kbd" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>O</kbd>
              <span className="app-visibility-hint-text">
                {showAllVisible ? 'press O \u2014 restore to default' : 'press O \u2014 make it visible'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
