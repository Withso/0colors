// ConnectedTokenTablePopup — reads from Zustand store, passes props to TokenTablePopup.
// Moves inline onNavigateToNode / onRestoreView handlers out of App.tsx.
import { useCallback, useRef } from 'react';
import { useStore } from '../../store';
import { TokenTablePopup } from './TokenTablePopup';
import type { ProjectComputedTokens } from '../../utils/computed-tokens';

interface ConnectedTokenTablePopupProps {
  /** computedTokens for the active project (from computedTokensRef) */
  computedTokens?: ProjectComputedTokens;
  /** Shared per-theme selection ref from usePageThemeOperations */
  themeSelectionsRef: React.MutableRefObject<Record<string, { selectedNodeId: string | null; selectedNodeIds: string[] }>>;
  /** handleSwitchTheme from usePageThemeOperations (same instance as App.tsx) */
  handleSwitchTheme: (themeId: string) => void;
  /** handleSwitchPage from usePageThemeOperations (same instance as App.tsx) */
  handleSwitchPage: (pageId: string) => void;
  /** URL-wrapped setViewMode from useUrlRouting */
  setViewMode: (mode: 'canvas' | 'code' | 'export') => void;
}

export function ConnectedTokenTablePopup({
  computedTokens,
  themeSelectionsRef,
  handleSwitchTheme,
  handleSwitchPage,
  setViewMode,
}: ConnectedTokenTablePopupProps) {
  // ── Entity state from store ──
  const tokens = useStore(s => s.tokens);
  const allNodes = useStore(s => s.allNodes);
  const groups = useStore(s => s.groups);
  const pages = useStore(s => s.pages);
  const themes = useStore(s => s.themes);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activePageId = useStore(s => s.activePageId);
  const activeThemeId = useStore(s => s.activeThemeId);
  const canvasStates = useStore(s => s.canvasStates);
  const advancedLogic = useStore(s => s.advancedLogic);
  const selectedNodeId = useStore(s => s.selectedNodeId);
  const selectedNodeIds = useStore(s => s.selectedNodeIds);

  // ── UI state from store ──
  const tokenTableHexSpaces = useStore(s => s.tokenTableHexSpaces);
  const setTokenTableHexSpaces = useStore(s => s.setTokenTableHexSpaces);
  const setShowTokenTable = useStore(s => s.setShowTokenTable);

  // ── Selection setters ──
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);
  const setActivePageId = useStore(s => s.setActivePageId);
  const setActiveThemeId = useStore(s => s.setActiveThemeId);

  // ── Refs that mirror store state (for synchronous access in callbacks) ──
  const selectedNodeIdRef = useRef<string | null>(selectedNodeId);
  const selectedNodeIdsRef = useRef<string[]>(selectedNodeIds);
  const activeThemeIdRef = useRef<string>(activeThemeId);
  selectedNodeIdRef.current = selectedNodeId;
  selectedNodeIdsRef.current = selectedNodeIds;
  activeThemeIdRef.current = activeThemeId;

  // ── Canvas state for current project+page ──
  const canvasState = canvasStates.find(
    cs => cs.projectId === activeProjectId && cs.pageId === activePageId
  ) || { projectId: activeProjectId, pageId: activePageId, pan: { x: 0, y: 0 }, zoom: 1 };

  // ── onNavigateToNode handler (moved from App.tsx inline) ──
  const onNavigateToNode = useCallback((nodeId: string, pageId: string, themeId: string) => {
    // 1. Switch page if needed (canvas will re-render with new page's nodes)
    const needsPageSwitch = pageId !== activePageId;
    if (needsPageSwitch) {
      setActivePageId(pageId);
    }
    // 2. Switch theme if needed — save current selection before switching
    if (themeId !== activeThemeId) {
      themeSelectionsRef.current[activeThemeIdRef.current] = {
        selectedNodeId: selectedNodeIdRef.current,
        selectedNodeIds: [...selectedNodeIdsRef.current],
      };
      setActiveThemeId(themeId);
    }
    // 3. Select the node immediately (overrides any saved selection for target theme)
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
    // 4. Dispatch navigation event with a delay if page switched
    //    (allows React to re-render ColorCanvas with the new page's nodes)
    const dispatchNav = () => {
      const event = new CustomEvent('navigateToNode', { detail: { nodeId } });
      window.dispatchEvent(event);
    };
    if (needsPageSwitch) {
      setTimeout(dispatchNav, 180);
    } else {
      requestAnimationFrame(dispatchNav);
    }
  }, [activePageId, activeThemeId, themeSelectionsRef, setActivePageId, setActiveThemeId, setSelectedNodeId, setSelectedNodeIds]);

  // ── onRestoreView handler (moved from App.tsx inline) ──
  const onRestoreView = useCallback((pageId: string, themeId: string) => {
    if (pageId !== activePageId) setActivePageId(pageId);
    if (themeId !== activeThemeId) {
      // Save current selection, restore saved selection for the target theme
      themeSelectionsRef.current[activeThemeIdRef.current] = {
        selectedNodeId: selectedNodeIdRef.current,
        selectedNodeIds: [...selectedNodeIdsRef.current],
      };
      const savedSelection = themeSelectionsRef.current[themeId];
      if (savedSelection) {
        setSelectedNodeId(savedSelection.selectedNodeId);
        setSelectedNodeIds(savedSelection.selectedNodeIds);
      } else {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
      }
      setActiveThemeId(themeId);
    }
  }, [activePageId, activeThemeId, themeSelectionsRef, setActivePageId, setActiveThemeId, setSelectedNodeId, setSelectedNodeIds]);

  return (
    <TokenTablePopup
      tokens={tokens}
      allNodes={allNodes}
      groups={groups}
      pages={pages}
      themes={themes}
      activeProjectId={activeProjectId}
      activePageId={activePageId}
      activeThemeId={activeThemeId}
      canvasPan={canvasState.pan}
      canvasZoom={canvasState.zoom}
      hexOverrideSpaces={tokenTableHexSpaces}
      onHexOverrideSpacesChange={setTokenTableHexSpaces}
      onClose={() => setShowTokenTable(false)}
      onNavigateToNode={onNavigateToNode}
      onRestoreView={onRestoreView}
      advancedLogic={advancedLogic}
      computedTokens={computedTokens}
    />
  );
}
