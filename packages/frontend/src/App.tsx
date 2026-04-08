import './App.css';
import React, { useCallback, useEffect, useRef, Suspense } from 'react';
import { useStore, setComputedTokensRef } from './store';
import { ColorNode } from './types';

// ── Lazy-loaded components (only downloaded when needed) ──
const ConnectedTokensPanel = React.lazy(() => import('./components/tokens/ConnectedTokensPanel').then(m => ({ default: m.ConnectedTokensPanel })));
const ConnectedTokenTablePopup = React.lazy(() => import('./components/tokens/ConnectedTokenTablePopup').then(m => ({ default: m.ConnectedTokenTablePopup })));
const ConnectedDevModePanel = React.lazy(() => import('./pages/ConnectedDevModePanel').then(m => ({ default: m.ConnectedDevModePanel })));
const ShortcutsPanel = React.lazy(() => import('./components/layout/ShortcutsPanel').then(m => ({ default: m.ShortcutsPanel })));
const AppToolbar = React.lazy(() => import('./components/layout/AppToolbar').then(m => ({ default: m.AppToolbar })));
const AppCanvasArea = React.lazy(() => import('./components/layout/AppCanvasArea').then(m => ({ default: m.AppCanvasArea })));
const ProjectsPage = React.lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const ConnectedCommandPalette = React.lazy(() => import('./components/canvas/ConnectedCommandPalette').then(m => ({ default: m.ConnectedCommandPalette })));
const AskAIChat = React.lazy(() => import('./components/ai/AskAIChat').then(m => ({ default: m.AskAIChat })));
const ConnectedPublishPopup = React.lazy(() => import('./pages/ConnectedPublishPopup').then(m => ({ default: m.ConnectedPublishPopup })));
const AuthPage = React.lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })));
// AISettingsPopup import removed — AI settings now rendered inline in ProjectsPage
// The showAISettingsPopup state remains for potential canvas-mode AI chat use
import { useTokenOperations } from './store/useTokenOperations';
import { useNodeUpdate } from './store/useNodeUpdate';
import { useNodeMutations } from './store/useNodeMutations';
import { useNodeCreation } from './store/useNodeCreation';
import { usePageThemeOperations } from './store/usePageThemeOperations';
import { useProjectOperations } from './store/useProjectOperations';
import { useImportExport } from './store/useImportExport';
import { useCloudSyncAuth } from './hooks/useCloudSyncAuth';
import { useSampleTemplates } from './hooks/useSampleTemplates';
import { useAdvancedLogicEffect } from './hooks/useAdvancedLogicEffect';
import { useDevMode } from './hooks/useDevMode';
import { useAIChat } from './hooks/useAIChat';
import { useUrlRouting } from './hooks/useUrlRouting';

import { Toaster } from "sonner";
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useUIEffects } from './hooks/useUIEffects';
import { useLocalStorageRestore } from './hooks/useLocalStorageRestore';
import { useCommunityProject } from './hooks/useCommunityProject';
import { useCanvasEvents } from './hooks/useCanvasEvents';

// ── Extracted helpers ──
import {
  getNodeEffectiveHSL, getDefaultData, STORAGE_KEY,
} from './utils/app-helpers';

// ── Routing ──
import { RouterProvider, useNavigate, useLocation } from 'react-router';
import { router } from './routes';
import { slugify, findProjectBySlug } from './utils/slugify';

// Auth session key moved to useLocalStorageRestore hook

// ═══════════════════════════════════════════════════════════════
// MODULE-LEVEL NETWORK ERROR SUPPRESSOR
// ═══════════════════════════════════════════════════════════════
// Must run at the module level — BEFORE React mounts — so it catches
// errors fired by the Supabase SDK's auto-refresh timer and any
// early fetch() calls that happen before useEffect handlers register.
// ═══════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  const _networkErrorPatterns = [
    'Failed to fetch',
    'NetworkError',
    'AbortError',
    'fetch timeout',
    'Network request failed',
    'Load failed', // Safari
    'Lock not released',        // Supabase GoTrue lock timeout (React Strict Mode)
    'Lock broken by another',   // Supabase GoTrue lock steal
  ];

  function _isNetworkError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return _networkErrorPatterns.some(p => lower.includes(p.toLowerCase()));
  }

  // Catch unhandled promise rejections (e.g. Supabase SDK internal token refresh)
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const msg = event.reason?.message || event.reason?.toString?.() || '';
    if (_isNetworkError(msg)) {
      console.log(`[Global] Suppressed network rejection (non-fatal): ${msg}`);
      event.preventDefault();
    }
  });

  // Catch synchronous errors that bubble up from async contexts
  window.addEventListener('error', (event: ErrorEvent) => {
    const msg = event.message || event.error?.message || '';
    if (_isNetworkError(msg)) {
      console.log(`[Global] Suppressed network error event (non-fatal): ${msg}`);
      event.preventDefault();
    }
  });
}

// [Extracted to ./utils/app-helpers.ts — color conversions, palette shading,
//  token hierarchy, node spacing, default data, localStorage persistence]











// Auto-dismiss "Go back" button timing moved to hooks/useUIEffects.ts



























export function AppShell() {
  // NOTE: Network error suppression is handled at module level (above)
  // so it's active before React mounts — no useEffect needed.


  // ── Cloud sync & auth hook ──
  const {
    handleAuth, handleSignOut, handleSkipAuth, handleForceCloudRefresh, handleManualSync,
    effectiveCloudSyncStatus, activeProjectLastSyncedAt, cloudDirtyCount,
    authSessionRef, computedTokensRef, isLoadingCloudDataRef, lastSyncedAtMapRef,
    viewingProjectsRef, communityLoadedRef, lastSyncedPathnameRef, activeProjectSlugRef,
    getProjectSnapshotRef, mountTimeRef,
  } = useCloudSyncAuth();

  // Wire computed tokens ref to persistence middleware
  useEffect(() => {
    setComputedTokensRef(computedTokensRef.current);
  });

  const cloudTemplatesLoaded = useStore(s => s.cloudTemplatesLoaded);
  const authSession = useStore(s => s.authSession);
  const authChecking = useStore(s => s.authChecking);
  const cloudSyncStatus = useStore(s => s.cloudSyncStatus);
  const lastSyncError = useStore(s => s.lastSyncError);

  // ── Sample templates hook ──
  const {
    sampleTemplates, filteredSampleTemplates, activeSampleIdx,
    sampleModeToast, handleSwitchSampleTemplate,
    isSampleMode, isSampleModeRef,
  } = useSampleTemplates(lastSyncedPathnameRef);
  const activeSampleTemplateId = useStore(s => s.activeSampleTemplateId);

  // ── URL routing hook (setViewingProjects, setViewMode, URL↔state sync) ──
  const { setViewingProjects, setViewMode } = useUrlRouting({
    viewingProjectsRef,
    activeProjectSlugRef,
    lastSyncedPathnameRef,
    sampleTemplates,
    handleSwitchSampleTemplate,
  });



  // ── Routing hooks ──
  const navigate = useNavigate();
  const location = useLocation();

  // viewingProjects — URL-derived initial value set in mount useEffect
  const viewingProjects = useStore(s => s.viewingProjects);
  const _setViewingProjects = useStore(s => s.setViewingProjects);

  // Dashboard section for sidebar navigation — URL-derived initial value set in mount useEffect
  const dashboardSection = useStore(s => s.dashboardSection);
  const setDashboardSection = useStore(s => s.setDashboardSection);

  // Auth: redirect to accounts.zeros.design instead of showing local AuthPage
  const redirectToZerosLogin = useCallback(() => {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `https://accounts.zeros.design/login?product_id=0colors&redirect_url=${returnUrl}`;
  }, []);

  // ── Community state ──
  const isCommunityMode = useStore(s => s.isCommunityMode);
  const setIsCommunityMode = useStore(s => s.setIsCommunityMode);
  const setCommunitySlug = useStore(s => s.setCommunitySlug);

  const isInitialLoad = useStore(s => s.isInitialLoad);
  const selectedNodeId = useStore(s => s.selectedNodeId);
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const selectedNodeIds = useStore(s => s.selectedNodeIds);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);

  // goBackTimerRef / goBackFadeTimerRef moved to useUIEffects

  // ── Entity state from Zustand store ──
  const allNodes = useStore(s => s.allNodes);
  const setAllNodes = useStore(s => s.setAllNodes);
  const tokens = useStore(s => s.tokens);
  const setTokens = useStore(s => s.setTokens);
  const canvasStates = useStore(s => s.canvasStates);
  const setCanvasStates = useStore(s => s.setCanvasStates);
  const projects = useStore(s => s.projects);
  const setProjects = useStore(s => s.setProjects);
  const setPages = useStore(s => s.setPages);
  const themes = useStore(s => s.themes);
  const setThemes = useStore(s => s.setThemes);
  const groups = useStore(s => s.groups);
  const setGroups = useStore(s => s.setGroups);
  const activeProjectId = useStore(s => s.activeProjectId);
  const setActiveProjectId = useStore(s => s.setActiveProjectId);
  const activePageId = useStore(s => s.activePageId);
  const setActivePageId = useStore(s => s.setActivePageId);
  const activeThemeId = useStore(s => s.activeThemeId);
  const setActiveThemeId = useStore(s => s.setActiveThemeId);
  const setAdvancedLogic = useStore(s => s.setAdvancedLogic);
  const flushUndo = useStore(s => s.flushUndo);
  const pauseUndo = useStore(s => s.pauseUndo);
  const resumeUndo = useStore(s => s.resumeUndo);

  // Per-theme selection state is now owned by usePageThemeOperations (themeSelectionsRef).
  // Refs below mirror store state for use in callbacks that need synchronous access.
  const selectedNodeIdRef = useRef<string | null>(selectedNodeId);
  const selectedNodeIdsRef = useRef<string[]>(selectedNodeIds);
  const activeThemeIdRef = useRef<string>(activeThemeId);
  selectedNodeIdRef.current = selectedNodeId;
  selectedNodeIdsRef.current = selectedNodeIds;
  activeThemeIdRef.current = activeThemeId;

  // ── Extracted hooks ──
  const { addToken, updateToken, deleteToken, assignTokenToNode } = useTokenOperations();

  const { updateNode } = useNodeUpdate();

  const { deleteNode } = useNodeMutations();

  const {
    addRootNode, addChildNode, addParentNode, addPaletteNode,
    addSpacingNode, addTokenNode, togglePrefixNode,
  } = useNodeCreation();


  // Project editing state
  const editingProjectId = useStore(s => s.editingProjectId);
  const setEditingProjectId = useStore(s => s.setEditingProjectId);
  const editingProjectName = useStore(s => s.editingProjectName);
  const setEditingProjectName = useStore(s => s.setEditingProjectName);

  // Theme editing state — now owned by AppToolbar component

  // Page editing state — now owned by AppToolbar component

  // Highlighted project state (for newly imported/duplicated projects)
  const highlightedProjectId = useStore(s => s.highlightedProjectId);

  // View mode state — URL-derived initial value set in mount useEffect
  const _setViewMode = useStore(s => s.setViewMode);

  // setViewMode (wrapped with URL push) is provided by useUrlRouting above

  // Token table popup state — from Zustand store (initialized from localStorage in ui-slice)
  const showTokenTable = useStore(s => s.showTokenTable);
  // setShowTokenTable — now owned by AppToolbar component

  // Token table "Show as Hex" override spaces — localStorage init in mount useEffect
  // tokenTableHexSpaces + setTokenTableHexSpaces moved to ConnectedTokenTablePopup

  // showTokenTable + tokenTableHexSpaces localStorage persistence moved to useUIEffects

  // ── Dev Mode (extracted to useDevMode hook) ──
  const { activeDevConfig, updateDevConfig, handleDevModeRun, handleDevModeTestWebhook } = useDevMode();

  // Advanced logic persistence moved to useLocalStorageRestore hook





  // ── URL → state sync (handles browser back/forward & direct URL access) ──
  useEffect(() => {
    const path = location.pathname;
    if (path === lastSyncedPathnameRef.current) return;
    lastSyncedPathnameRef.current = path;

    if (path === '/projects' || path === '/projects/') {
      if (!viewingProjectsRef.current) {
        _setViewingProjects(true);
        viewingProjectsRef.current = true;
        _setViewMode('canvas');
      }
      setDashboardSection('projects');
      return;
    }

    // ── /community — community listing page (now a dashboard section) ──
    if (path === '/community' || path === '/community/') {
      _setViewingProjects(true);
      viewingProjectsRef.current = true;
      setDashboardSection('community');
      setIsCommunityMode(false);
      setCommunitySlug(null);
      return;
    }

    // ── /settings — AI settings dashboard section ──
    if (path === '/settings') {
      _setViewingProjects(true);
      viewingProjectsRef.current = true;
      setDashboardSection('ai-settings');
      return;
    }

    // ── /profile — profile dashboard section ──
    if (path === '/profile') {
      _setViewingProjects(true);
      viewingProjectsRef.current = true;
      setDashboardSection('profile');
      return;
    }

    // ── /community/:slug — view a community project (read-only) ──
    const communityMatch = path.match(/^\/community\/([^/]+)$/);
    if (communityMatch) {
      const slug = communityMatch[1];
      _setViewingProjects(false);
      viewingProjectsRef.current = false;
      setIsCommunityMode(true);
      setCommunitySlug(slug);
      _setViewMode('canvas');
      return;
    }

    // If navigating away from community, clear community state
    if (isCommunityMode) { setIsCommunityMode(false); setCommunitySlug(null); }

    // ── /sample-project/:templateSlug — sample mode with specific template ──
    const sampleMatch = path.match(/^\/sample-project(?:\/([^/]+))?$/);
    if (sampleMatch) {
      const templateSlug = sampleMatch[1];
      // Ensure we're in project view (not projects list)
      if (viewingProjectsRef.current) {
        _setViewingProjects(false);
        viewingProjectsRef.current = false;
      }
      // Activate the sample project
      const sampleProject = useStore.getState().projects.find(p => p.isSample);
      if (sampleProject && sampleProject.id !== activeProjectId) {
        setActiveProjectId(sampleProject.id);
      }
      // Find and activate the matching template by slug (if templates are loaded)
      if (sampleTemplates.length > 0) {
        if (templateSlug) {
          const matchingIdx = sampleTemplates.findIndex(t => slugify(t.name) === templateSlug);
          if (matchingIdx >= 0 && sampleTemplates[matchingIdx].id !== activeSampleTemplateId) {
            handleSwitchSampleTemplate(matchingIdx);
          } else if (matchingIdx < 0) {
            // No matching template found — redirect to first template
            handleSwitchSampleTemplate(0);
          }
        } else {
          // Bare /sample-project — redirect to first template
          const firstTemplate = sampleTemplates[0];
          const firstSlug = slugify(firstTemplate?.name || 'untitled');
          navigate(`/sample-project/${firstSlug}`, { replace: true });
          lastSyncedPathnameRef.current = `/sample-project/${firstSlug}`;
          handleSwitchSampleTemplate(0);
        }
      }
      _setViewMode('canvas');
      return;
    }

    const match = path.match(/^\/project\/([^/]+)(?:\/([^/]+))?$/);
    if (match) {
      const slug = match[1];
      const view = match[2] as 'code' | 'export' | undefined;
      const project = findProjectBySlug(useStore.getState().projects, slug);
      if (project) {
        if (viewingProjectsRef.current) {
          _setViewingProjects(false);
          viewingProjectsRef.current = false;
        }
        if (project.id !== activeProjectId) {
          setActiveProjectId(project.id);
          const projectPages = useStore.getState().pages.filter(p => p.projectId === project.id).sort((a, b) => a.createdAt - b.createdAt);
          if (projectPages.length > 0) setActivePageId(projectPages[0].id);
          const projectThemes = useStore.getState().themes.filter(t => t.projectId === project.id).sort((a, b) => a.createdAt - b.createdAt);
          const primaryTheme = projectThemes.find(t => t.isPrimary) || projectThemes[0];
          if (primaryTheme) setActiveThemeId(primaryTheme.id);
        }
        const newMode = view === 'code' ? 'code' : view === 'export' ? 'export' : 'canvas';
        _setViewMode(newMode);
      }
      return;
    }
  }, [location.pathname, sampleTemplates, activeSampleTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Home redirect logic (runs after localStorage restore) ──
  useEffect(() => {
    if (isInitialLoad) return;
    const path = location.pathname;
    if (path !== '/' && path !== '') return;

    if (authSession) {
      navigate('/projects', { replace: true });
    } else {
      const localProjects = projects.filter(p => !p.isCloud && !p.isTemplate && !p.isSample);
      if (localProjects.length > 0) {
        navigate('/projects', { replace: true });
      } else {
        // Wait for cloud templates to load before redirecting to sample project
        // to prevent a flash of hardcoded data → then template data shift
        if (!cloudTemplatesLoaded) return; // Will re-run when cloudTemplatesLoaded changes

        const firstTemplate = sampleTemplates[0];
        const templateSlug = slugify(firstTemplate?.name || 'starter');
        navigate(`/sample-project/${templateSlug}`, { replace: true });
        lastSyncedPathnameRef.current = `/sample-project/${templateSlug}`;
        const sampleProject = projects.find(p => p.isSample);
        if (sampleProject) {
          setActiveProjectId(sampleProject.id);
        }
        _setViewingProjects(false);
        viewingProjectsRef.current = false;

        // If cloud templates are loaded, switch to the first one
        if (firstTemplate) {
          handleSwitchSampleTemplate(0);
        }
        setTimeout(() => window.dispatchEvent(new Event('canvasFitAll')), 200);
      }
    }
  }, [isInitialLoad, location.pathname, cloudTemplatesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Community project loading (extracted to useCommunityProject hook) ──
  useCommunityProject({ communityLoadedRef });

  // ── Sync URL when active project is renamed ──
  useEffect(() => {
    if (viewingProjectsRef.current) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (!project) return;
    const newSlug = slugify(project.name);
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'project' && parts[1] && parts[1] !== newSlug) {
      const viewSuffix = parts[2] ? `/${parts[2]}` : '';
      navigate(`/project/${newSlug}${viewSuffix}`, { replace: true });
    }
  }, [projects, activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps










  // ── Ask AI effects & callbacks (extracted to useAIChat hook — called below after mutation fns) ──


  // ── Advanced Logic Evaluation (extracted to useAdvancedLogicEffect hook) ──
  useAdvancedLogicEffect();

  // Shortcuts panel popup state
  const showShortcuts = useStore(s => s.showShortcuts);
  const setShowShortcuts = useStore(s => s.setShowShortcuts);

  // ── Ask AI state (effects & callbacks extracted to useAIChat hook — called below) ──
  const showAIChat = useStore(s => s.showAIChat);
  const setShowAIChat = useStore(s => s.setShowAIChat);
  const showAISettingsPopup = useStore(s => s.showAISettingsPopup);
  const aiChatDocked = useStore(s => s.aiChatDocked);

  // Ref for handleSwitchTheme so the keyboard shortcut hook can call it.
  const handleSwitchThemeRef = useRef<((themeId: string) => void) | null>(null);

  // ── Extracted hooks ──
  useKeyboardShortcuts(handleSwitchThemeRef, isSampleModeRef, sampleModeToast);
  const { handleGoBackMouseEnter, handleGoBackMouseLeave, handleTokenNavGoBack } = useUIEffects();

  // Get nodes for the active project and page (nodes are NOT filtered by theme - they're shared)
  const nodes = allNodes.filter(node => node.projectId === activeProjectId && node.pageId === activePageId);

  // ── Load from localStorage on mount + persist advanced logic ──
  useLocalStorageRestore({ lastSyncedAtMapRef, viewingProjectsRef, computedTokensRef });

  // NOTE: Reactive palette-orphan cleanup effect removed — it ran on every
  // allNodes/groups/tokens change and auto-deleted data without user
  // confirmation, risking cascading deletions during transient states.
  // The deleteNode handler already cleans up palette groups/tokens on
  // explicit user deletion, and the one-time on-load cleanup inside
  // loadFromLocalStorage handles startup data-integrity.

  // NOTE: Reactive orphaned-token cleanup effect removed — same reasoning
  // as above; the deleteNode handler + on-load cleanup are sufficient.

  // Sync token values with assigned nodes when theme changes
  useEffect(() => {
    if (isInitialLoad || !activeThemeId) return;

    const currentThemeSync = themes.find(t => t.id === activeThemeId);
    const isPrimarySync = currentThemeSync?.isPrimary ?? true;

    // Sync all token values with their assigned nodes for the current theme
    setTokens(prevTokens => {
      let anyChanged = false;
      const newTokens = prevTokens.map(token => {
        // Find the node that has this token assigned in the current theme
        const assignedNode = allNodes.find(node => {
          // If theme-specific assignments exist (even if empty = intentionally cleared), use them exclusively
          if (node.tokenAssignments?.[activeThemeId] !== undefined) {
            return node.tokenAssignments[activeThemeId].includes(token.id);
          }
          return (node.tokenIds || []).includes(token.id);
        });

        if (!assignedNode) return token;

        // Get the effective color using color-space-aware conversion (handles RGB, OKLCH, HCT, HEX → HSL)
        const hasThemeOverride = assignedNode.themeOverrides?.[activeThemeId];
        const themeOverride = hasThemeOverride ? assignedNode.themeOverrides![activeThemeId] : undefined;
        const effective = getNodeEffectiveHSL(assignedNode, themeOverride);

        // Only update if token doesn't have the correct value already
        const currentThemeValue = token.themeValues?.[activeThemeId];

        if (assignedNode.isSpacing || assignedNode.type === 'spacing') {
          const newValue = assignedNode.spacingValue ?? 16;
          const newUnit = assignedNode.spacingUnit ?? 'px';

          if (currentThemeValue?.value !== newValue || currentThemeValue?.unit !== newUnit) {
            anyChanged = true;
            const updatedThemeValues = { ...token.themeValues };
            updatedThemeValues[activeThemeId] = {
              value: newValue,
              unit: newUnit,
            };
            return {
              ...token,
              themeValues: updatedThemeValues,
            };
          }
        } else {
          if (currentThemeValue?.hue !== effective.hue ||
            currentThemeValue?.saturation !== effective.saturation ||
            currentThemeValue?.lightness !== effective.lightness ||
            currentThemeValue?.alpha !== effective.alpha) {
            anyChanged = true;
            const updatedThemeValues = { ...token.themeValues };
            updatedThemeValues[activeThemeId] = {
              hue: effective.hue,
              saturation: effective.saturation,
              lightness: effective.lightness,
              alpha: effective.alpha,
            };
            if (isPrimarySync) {
              // Primary theme: update both base properties and themeValues
              return {
                ...token,
                themeValues: updatedThemeValues,
                hue: effective.hue,
                saturation: effective.saturation,
                lightness: effective.lightness,
                alpha: effective.alpha,
              };
            } else {
              // Non-primary theme: ONLY update themeValues, preserve base token properties
              return {
                ...token,
                themeValues: updatedThemeValues,
              };
            }
          }
        }

        return token;
      });
      // Return the same reference if nothing changed — avoids spurious
      // state updates that would confuse the undo/redo system.
      return anyChanged ? newTokens : prevTokens;
    });
  }, [activeThemeId, allNodes, isInitialLoad, themes]);

  // Auto-save to localStorage is handled by persistence middleware (store/middleware/persistence-middleware.ts)
  // Group expand states are also persisted there.


  // NOTE: Reactive orphaned-palette-token cleanup effect REMOVED.
  // It ran on every allNodes/groups/tokens change and auto-deleted data
  // without user confirmation, risking cascading deletions during transient
  // states (undo/redo, batch operations, imports).  The deleteNode handler
  // already cleans up palette groups/tokens on explicit user deletion.
  // Data should only be removed when the user explicitly requests it.

  // Node operation functions



  // Pending token restore, multi-select bar delay, go-back navigation,
  // and go-back auto-dismiss logic moved to useUIEffects

  // Restore assigned tokens for recently duplicated/pasted nodes

  // Drag selection, batch node shifts, webhook apply, and Figma message
  // handlers extracted to useCanvasEvents hook
  useCanvasEvents();







  /** Toggle a child token node into a prefix or back to a child.
   *  When making a child a prefix: delete its own token, clear valueTokenId.
   *  When making a prefix back to a child: create a new token for it.
   *  In both cases, cascade-recompute all descendant token paths.
   */









  // Keyboard shortcuts moved to useKeyboardShortcuts hook

  // Dev Mode webhook + Figma message listeners — now in useCanvasEvents




  // Manual cleanup function to remove orphaned palette groups and tokens







  // ── Duplicate sample project as local or cloud ──

  // ── Community: navigate to a published project ──

  // ── Community: remix (duplicate) a community project ──

  // ── Community: publish state change callback ──

  // ── Check which projects are published (for UI badge) ──



  // Dev Mode handlers provided by useDevMode() hook

  // Page management functions




  // Theme management functions

  // ── Programmatic creation for AI Build Mode ─────────────────────
  // Defined after all mutation functions to avoid hoisting issues.

  const createNodeProgrammatic = useCallback((params: {
    type: 'color' | 'palette' | 'spacing' | 'token_prefix' | 'token_child';
    colorSpace?: 'hsl' | 'rgb' | 'oklch' | 'hct';
    color?: Record<string, number>;
    parentId?: string;
    name?: string;
    palette?: Record<string, any>;
    spacing?: { value?: number; unit?: string };
  }): string => {
    const { type, colorSpace = 'hsl', color = {}, parentId, name, palette, spacing } = params;

    if (type === 'palette') {
      addPaletteNode();
      const paletteId = Date.now().toString();
      if (palette || color || name) {
        setTimeout(() => {
          setAllNodes(prev => {
            const paletteNode = prev.find(n => n.isPalette && n.projectId === activeProjectId && n.pageId === activePageId);
            if (!paletteNode) return prev;
            const updates: Partial<ColorNode> = {};
            if (color.hue !== undefined) updates.hue = color.hue;
            if (color.saturation !== undefined) updates.saturation = color.saturation;
            if (name) { updates.paletteName = name; updates.referenceName = name; updates.referenceNameLocked = true; }
            if (palette?.shadeCount !== undefined) updates.paletteShadeCount = palette.shadeCount;
            if (palette?.lightnessStart !== undefined) updates.paletteLightnessStart = palette.lightnessStart;
            if (palette?.lightnessEnd !== undefined) updates.paletteLightnessEnd = palette.lightnessEnd;
            if (palette?.curveType) updates.paletteCurveType = palette.curveType;
            if (palette?.namingPattern) updates.paletteNamingPattern = palette.namingPattern;
            if (palette?.hueShift !== undefined) updates.paletteHueShift = palette.hueShift;
            if (palette?.saturationMode) updates.paletteSaturationMode = palette.saturationMode;
            return prev.map(n => n.id === paletteNode.id ? { ...n, ...updates } : n);
          });
        }, 0);
      }
      return paletteId;
    }

    if (type === 'spacing') {
      addSpacingNode();
      const spacingId = Date.now().toString();
      if (spacing || name) {
        setTimeout(() => {
          setAllNodes(prev => {
            const node = prev.find(n => n.isSpacing && n.projectId === activeProjectId && n.pageId === activePageId &&
              !prev.some(other => other.isSpacing && other.projectId === activeProjectId && other.pageId === activePageId &&
                other.id !== n.id && Number(other.id) > Number(n.id)));
            if (!node) return prev;
            const updates: Partial<ColorNode> = {};
            if (spacing?.value !== undefined) updates.spacingValue = spacing.value;
            if (spacing?.unit) updates.spacingUnit = spacing.unit as any;
            if (name) { updates.spacingName = name; updates.referenceName = name; updates.referenceNameLocked = true; }
            return prev.map(n => n.id === node.id ? { ...n, ...updates } : n);
          });
        }, 0);
      }
      return spacingId;
    }

    if (type === 'token_prefix' || type === 'token_child') {
      addTokenNode();
      return Date.now().toString();
    }

    // Default: color node with full parameter control
    const hue = color.hue ?? Math.floor(Math.random() * 360);
    const sat = color.saturation ?? 70;
    const light = color.lightness ?? 50;
    const nodeId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newNode: ColorNode = {
      id: nodeId, colorSpace,
      hue, saturation: sat, lightness: light, alpha: color.alpha ?? 100,
      ...(colorSpace === 'rgb' && { red: color.red ?? 128, green: color.green ?? 128, blue: color.blue ?? 128, redOffset: 0, greenOffset: 0, blueOffset: 0 }),
      ...(colorSpace === 'oklch' && { oklchL: color.oklchL ?? 65, oklchC: color.oklchC ?? 50, oklchH: color.oklchH ?? hue, oklchLOffset: 0, oklchCOffset: 0, oklchHOffset: 0 }),
      ...(colorSpace === 'hct' && { hctH: color.hctH ?? hue, hctC: color.hctC ?? 50, hctT: color.hctT ?? 50, hctHOffset: 0, hctCOffset: 0, hctTOffset: 0 }),
      position: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 },
      parentId: parentId || null,
      hueOffset: 0, saturationOffset: 0, lightnessOffset: 0, alphaOffset: 0,
      tokenId: null, tokenIds: [], width: 240,
      projectId: activeProjectId, pageId: activePageId,
      lockHue: false, lockSaturation: false, lockLightness: false, lockAlpha: false,
      ...(colorSpace === 'rgb' && { lockRed: false, lockGreen: false, lockBlue: false, diffRed: false, diffGreen: false, diffBlue: false }),
      ...(colorSpace === 'oklch' && { lockOklchL: false, lockOklchC: false, lockOklchH: false, diffOklchL: false, diffOklchC: false, diffOklchH: false }),
      ...(colorSpace === 'hct' && { lockHctH: false, lockHctC: false, lockHctT: false, diffHctH: false, diffHctC: false, diffHctT: false }),
      diffHue: false, diffSaturation: false, diffLightness: false, diffAlpha: false,
      isExpanded: false,
      ...(name && { referenceName: name, referenceNameLocked: true }),
    } as ColorNode;

    setAllNodes(prev => [...prev, newNode]);
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
    return nodeId;
  }, [activeProjectId, activePageId, addPaletteNode, addSpacingNode, addTokenNode]);




  const {
    handleSwitchPage, handleSwitchTheme,
    createThemeProgrammatic, createPageProgrammatic,
    themeSelectionsRef,
  } = usePageThemeOperations();

  // Keep the ref in sync so the keyboard-shortcut useEffect (declared earlier) can call it
  handleSwitchThemeRef.current = handleSwitchTheme;

  const {
    addProject, deleteProject, duplicateProject,
    handleDuplicateSampleProject, handleOpenCommunityProject, handleRemixCommunityProject,
    handlePublishChange, publishedProjectsMap, publishedProjectIds,
    handleSelectProject, handleCreateProject, handleBackToProjects,
  } = useProjectOperations({
    authSessionRef, lastSyncedAtMapRef,
    lastSyncedPathnameRef, activeThemeIdRef, selectedNodeIdRef, selectedNodeIdsRef,
    themeSelectionsRef,
    viewingProjectsRef, communityLoadedRef,
    isCommunityMode, activeSampleTemplateId,
    sampleTemplates, activeSampleIdx,
    _setViewingProjects, _setViewMode, setDashboardSection,
    setIsCommunityMode, setCommunitySlug,
    navigate,
  });

  const {
    exportJSON, importJSON, cleanupOrphanedData,
    exportProjectJSON, importProjectJSON,
  } = useImportExport({
    authSessionRef,
  });

  const startEditingProject = (projectId: string, currentName: string) => {
    setEditingProjectId(projectId);
    setEditingProjectName(currentName);
  };

  const saveProjectName = () => {
    if (!editingProjectId || !editingProjectName.trim()) {
      setEditingProjectId(null);
      return;
    }

    const updatedProjects = projects.map(p =>
      p.id === editingProjectId
        ? { ...p, name: editingProjectName.trim() }
        : p
    );
    setProjects(updatedProjects);
    setEditingProjectId(null);
  };

  const cancelEditingProject = () => {
    setEditingProjectId(null);
    setEditingProjectName('');
  };

  const resetToDefaults = useCallback(() => {
    if (confirm('Are you sure you want to reset to default data? This will clear all your nodes and tokens.')) {
      flushUndo(); // commit any pending undo batch before reset
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(GROUP_EXPAND_KEY);
      localStorage.removeItem('advanced-logic-v1');
      localStorage.removeItem('advanced-popup-state-v1');
      localStorage.removeItem('0colors-computed-tokens');
      computedTokensRef.current = {};
      const defaultData = getDefaultData();
      setAllNodes(defaultData.nodes);
      setTokens(defaultData.tokens);
      setGroups(defaultData.groups);
      setProjects(defaultData.projects);
      setPages(defaultData.pages);
      setCanvasStates(defaultData.canvasStates);
      setActiveProjectId(defaultData.activeProjectId);
      setActivePageId(defaultData.activePageId);
      setActiveThemeId(defaultData.activeThemeId);
      setThemes(defaultData.themes);
      setAdvancedLogic([]);
    }
  }, [flushUndo]);

  // ── AI Chat hook (effects, callbacks, mutation context) ──────────────
  // Must be before any early returns to maintain consistent hook count.
  const {
    aiConversations, handleAIConversationsChange,
    handleAISettingsSaved, handleAIChatDockChange,
    aiProjectContext, aiMutationContext,
  } = useAIChat({
    createNodeProgrammatic,
    updateNode,
    deleteNode,
    addToken,
    updateToken,
    deleteToken,
    assignTokenToNode,
    createThemeProgrammatic,
    createPageProgrammatic,
  });

  // Auth gate — show auth page if still checking or not authenticated and user hasn't skipped
  if (authChecking) {
    return (
      <div className="app-shell-loading" data-testid="app-loading-auth">
        <div className="app-shell-loading-text">Loading…</div>
      </div>
    );
  }

  // Sample-project loading gate: show loading while cloud templates are being fetched
  // to prevent the flash of hardcoded fallback data before cloud templates arrive.
  // Covers two scenarios:
  // 1. Direct visit to /sample-project/* — always wait for templates
  // 2. Home page (/) for non-auth users with no local projects — they'll be redirected to sample mode
  if (!cloudTemplatesLoaded && !authSession) {
    const isSampleProjectPath = location.pathname.startsWith('/sample-project');
    const isHomePath = location.pathname === '/' || location.pathname === '';
    // During initial load we don't know the real project list yet — keep loading.
    // Once localStorage restores, check if user actually has local projects.
    const hasNoLocalProjects = isInitialLoad || projects.filter(p => !p.isCloud && !p.isTemplate && !p.isSample).length === 0;

    if (isSampleProjectPath || (isHomePath && hasNoLocalProjects)) {
      return (
        <div className="app-shell-loading" data-testid="app-loading-templates">
          <div className="app-shell-loading-col">
            <div className="app-shell-loading-brand">0<span className="app-shell-loading-brand-dim">colors</span></div>
            <div className="app-shell-loading-text">Loading templates…</div>
          </div>
        </div>
      );
    }
  }

  // Auth gate removed: auto-skip is handled by the effect below.
  // The full-screen AuthPage is now shown as a modal via showAuthModal.

  // If viewing projects page (includes dashboard sections: projects, community, ai-settings, profile)
  if (viewingProjects) {
    return (
      <Suspense fallback={<div className="app-shell-loading" data-testid="app-loading-fallback"><div className="app-shell-loading-text">Loading…</div></div>}>
        <ProjectsPage
          projects={projects.filter(p => !p.id.startsWith('community-'))}
          allNodes={allNodes}
          tokens={tokens}
          collections={[]}
          groups={groups}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onDuplicateProject={duplicateProject}
          onDeleteProject={deleteProject}
          onImportProject={importProjectJSON}
          onExportProject={exportProjectJSON}
          highlightedProjectId={highlightedProjectId}
          isAuthenticated={!!authSession}
          isAdmin={!!authSession?.isAdmin}
          isTemplateAdmin={!!authSession?.isTemplateAdmin}
          userEmail={authSession?.email}
          onSignOut={handleSignOut}
          onSignIn={redirectToZerosLogin}
          cloudSyncStatus={cloudSyncStatus}
          onForceCloudRefresh={handleForceCloudRefresh}
          publishedProjectIds={publishedProjectIds}
          activeSection={dashboardSection}
          onSectionChange={(section) => {
            setDashboardSection(section);
            if (section === 'projects') navigate('/projects');
            else if (section === 'community') navigate('/community');
            else if (section === 'ai-settings') navigate('/settings');
            else if (section === 'profile') navigate('/profile');
          }}
          onAISettingsSaved={handleAISettingsSaved}
          aiProjectContext={aiProjectContext}
          onOpenCommunityProject={(slug) => {
            navigate(`/community/${slug}`);
            _setViewingProjects(false);
            viewingProjectsRef.current = false;
            setIsCommunityMode(true);
            setCommunitySlug(slug);
            communityLoadedRef.current = false;
          }}
          onRemixCommunityProject={(slug) => {
            handleRemixCommunityProject(slug);
          }}
        />
        {/* Auth is now handled by accounts.zeros.design — redirect via redirectToZerosLogin */}
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<div className="app-shell-loading" data-testid="app-loading-fallback"><div className="app-shell-loading-text">Loading…</div></div>}>
    <div className="app-shell" data-testid="page-editor-shell">
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: 'color-mix(in srgb, var(--surface-3) 95%, transparent)',
            backdropFilter: 'blur(12px)',
            border: 'none',
            color: 'var(--text-primary)',
            boxShadow: '0 4px 24px color-mix(in srgb, var(--shadow-color-overlay) 40%, transparent)',
            borderRadius: '8px',
            fontSize: '13px',
          },
        }}
      />
      {/* TokensPanel - Floating Island */}
      <ConnectedTokensPanel
        onNavigateToNode={(nodeId) => {
          setSelectedNodeId(nodeId);
          setSelectedNodeIds([nodeId]);
          // Dispatch event for ColorCanvas to handle navigation with animation
          const event = new CustomEvent('navigateToNode', { detail: { nodeId } });
          window.dispatchEvent(event);
        }}
        onNavigateToProjects={handleBackToProjects}
        cloudSyncStatus={effectiveCloudSyncStatus}
        lastSyncedAt={activeProjectLastSyncedAt}
        lastSyncError={lastSyncError}
        onManualSync={handleManualSync}
        dirtyCount={cloudDirtyCount}
      />

      {/* Right Column - Header + Canvas as separate islands */}
      <div className="app-main" data-testid="editor-main-column">
        {/* Top Bar - Floating Island */}
        <AppToolbar
          setViewMode={setViewMode}
          publishedProjectsMap={publishedProjectsMap}
          isSampleMode={isSampleMode}
        />

        {/* Canvas Area - Floating Island */}
        <AppCanvasArea
          setViewMode={setViewMode}
          computedTokensRef={computedTokensRef}
          isCommunityMode={isCommunityMode}
          isSampleMode={isSampleMode}
          sampleTemplates={sampleTemplates}
          filteredSampleTemplates={filteredSampleTemplates}
          activeSampleIdx={activeSampleIdx}
          handleSwitchSampleTemplate={handleSwitchSampleTemplate}
          handleDuplicateSampleProject={handleDuplicateSampleProject}
          handleBackToProjects={handleBackToProjects}
          handleGoBackMouseEnter={handleGoBackMouseEnter}
          handleGoBackMouseLeave={handleGoBackMouseLeave}
          handleTokenNavGoBack={handleTokenNavGoBack}
        />
      </div>

      {/* ── Ask AI Chat (single instance — docked renders inline, floating uses portal) ── */}
      <AskAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        conversations={aiConversations}
        onConversationsChange={handleAIConversationsChange}
        isCloudProject={!!projects.find(p => p.id === activeProjectId)?.isCloud}
        isTemplate={!!projects.find(p => p.id === activeProjectId)?.isTemplate}
        projectContext={aiProjectContext}
        isDocked={aiChatDocked}
        onDockChange={handleAIChatDockChange}
        onSettingsSaved={handleAISettingsSaved}
        mutationContext={aiMutationContext}
        onPauseUndo={pauseUndo}
        onResumeUndo={resumeUndo}
      />

      {/* Token Table Popup */}
      {showTokenTable && (
        <ConnectedTokenTablePopup
          computedTokens={computedTokensRef.current[activeProjectId]}
          themeSelectionsRef={themeSelectionsRef}
          handleSwitchTheme={handleSwitchTheme}
          handleSwitchPage={handleSwitchPage}
          setViewMode={setViewMode}
        />
      )}
      {/* Dev Mode Panel */}
      <ConnectedDevModePanel />
      {/* Shortcuts Panel Popup */}
      {showShortcuts && (
        <ShortcutsPanel onClose={() => setShowShortcuts(false)} />
      )}

      {/* Command Palette (⌘K) */}
      <ConnectedCommandPalette
        onNavigateToNode={(nodeId, pageId, themeId) => {
          // Switch page if needed
          const needsPageSwitch = pageId !== activePageId;
          if (needsPageSwitch) {
            setActivePageId(pageId);
          }
          // Switch theme if needed
          if (themeId !== activeThemeId) {
            themeSelectionsRef.current[activeThemeIdRef.current] = {
              selectedNodeId: selectedNodeIdRef.current,
              selectedNodeIds: [...selectedNodeIdsRef.current],
            };
            setActiveThemeId(themeId);
          }
          // Select the node
          setSelectedNodeId(nodeId);
          setSelectedNodeIds([nodeId]);
          // Ensure canvas view
          setViewMode('canvas');
          // Dispatch navigation event
          const dispatchNav = () => {
            const event = new CustomEvent('navigateToNode', { detail: { nodeId } });
            window.dispatchEvent(event);
          };
          if (needsPageSwitch) {
            setTimeout(dispatchNav, 180);
          } else {
            requestAnimationFrame(dispatchNav);
          }
        }}
        onNavigateToToken={(tokenId, pageId) => {
          // Switch page if needed
          if (pageId !== activePageId) {
            setActivePageId(pageId);
          }
          // Ensure canvas view (token panel is visible in canvas mode)
          setViewMode('canvas');
          // Dispatch a custom event for token highlighting
          setTimeout(() => {
            const event = new CustomEvent('highlightToken', { detail: { tokenId } });
            window.dispatchEvent(event);
          }, pageId !== activePageId ? 200 : 50);
        }}
      />

      {/* Publish to Community popup */}
      <ConnectedPublishPopup handlePublishChange={handlePublishChange} />

      {/* Auth is now handled by accounts.zeros.design — redirect via redirectToZerosLogin */}
    </div>
    </Suspense>
  );
}

// ── Root component with RouterProvider ──
export default function App() {
  return <RouterProvider router={router} />;
}
