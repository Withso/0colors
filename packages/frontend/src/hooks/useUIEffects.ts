import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';

// Auto-dismiss "Go back" button timing
const GO_BACK_VISIBLE_MS = 5000;  // how long the button stays visible before fading
export const GO_BACK_FADE_MS = 400;      // fade-out animation duration

/**
 * Centralised UI side-effects extracted from AppShell.
 *
 * Handles:
 *  - Selection pruning (remove selected nodes that no longer exist)
 *  - Go-back button auto-dismiss timers
 *  - Token nav go-back cleanup
 *  - Canvas fit-all event listener (saveTokenNavBackState)
 *  - Multi-select bar delay timer
 *  - Pending token restore auto-dismiss
 *  - showTokenTable persistence to localStorage
 *  - tokenTableHexSpaces persistence to localStorage
 *  - showAllVisible reset on primary theme switch
 *
 * Returns go-back related callbacks used by the JSX.
 */
export function useUIEffects() {
  // ── Store selectors ──
  const allNodes = useStore(s => s.allNodes);
  const selectedNodeId = useStore(s => s.selectedNodeId);
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const selectedNodeIds = useStore(s => s.selectedNodeIds);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);

  const pendingTokenRestore = useStore(s => s.pendingTokenRestore);
  const setPendingTokenRestore = useStore(s => s.setPendingTokenRestore);
  const tokenNavBackState = useStore(s => s.tokenNavBackState);
  const setTokenNavBackState = useStore(s => s.setTokenNavBackState);
  const goBackFading = useStore(s => s.goBackFading);
  const setGoBackFading = useStore(s => s.setGoBackFading);

  const multiSelectBarDelay = useStore(s => s.multiSelectBarDelay);
  const setMultiSelectBarDelay = useStore(s => s.setMultiSelectBarDelay);

  const canvasStates = useStore(s => s.canvasStates);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activePageId = useStore(s => s.activePageId);
  const activeThemeId = useStore(s => s.activeThemeId);
  const themes = useStore(s => s.themes);

  const showTokenTable = useStore(s => s.showTokenTable);
  const tokenTableHexSpaces = useStore(s => s.tokenTableHexSpaces);
  const setShowAllVisible = useStore(s => s.setShowAllVisible);

  // Derived: is the current theme the primary one?
  const activeTheme = themes.find(t => t.id === activeThemeId);
  const isViewingPrimaryTheme = activeTheme?.isPrimary === true;

  // ── Refs for go-back timers ──
  const goBackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goBackFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // Selection pruning — remove selectedNodeId(s) that no longer exist
  // (covers undo removing duplicated nodes, external state changes, etc.)
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const nodeIdSet = new Set(allNodes.map(n => n.id));

    const staleSingle = selectedNodeId && !nodeIdSet.has(selectedNodeId);
    const filteredMulti = selectedNodeIds.filter(id => nodeIdSet.has(id));
    const staleMulti = filteredMulti.length !== selectedNodeIds.length;

    if (staleSingle || staleMulti) {
      if (staleMulti) {
        setSelectedNodeIds(filteredMulti);
      }
      if (staleSingle) {
        // If multi-select was pruned, pick the first remaining; otherwise clear
        setSelectedNodeId(filteredMulti.length > 0 ? filteredMulti[0] : null);
      }
    }
  }, [allNodes, selectedNodeId, selectedNodeIds]);

  // ═══════════════════════════════════════════════════════════════
  // showTokenTable persistence to localStorage
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    localStorage.setItem('showTokenTable', String(showTokenTable));
  }, [showTokenTable]);

  // ═══════════════════════════════════════════════════════════════
  // tokenTableHexSpaces persistence to localStorage
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    localStorage.setItem('tokenTableHexSpaces', JSON.stringify([...tokenTableHexSpaces]));
  }, [tokenTableHexSpaces]);

  // ═══════════════════════════════════════════════════════════════
  // Reset showAllVisible when switching back to a primary theme
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (isViewingPrimaryTheme) setShowAllVisible(false);
  }, [isViewingPrimaryTheme]);

  // ═══════════════════════════════════════════════════════════════
  // Pending token restore auto-dismiss (15 seconds)
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!pendingTokenRestore) return;
    const timer = setTimeout(() => {
      setPendingTokenRestore(null);
    }, 15000);
    return () => clearTimeout(timer);
  }, [pendingTokenRestore]);

  // ═══════════════════════════════════════════════════════════════
  // Multi-select bar delay timer (600ms)
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!multiSelectBarDelay) return;
    const timer = setTimeout(() => {
      setMultiSelectBarDelay(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [multiSelectBarDelay]);

  // Clear delay immediately when restore prompt is dismissed
  useEffect(() => {
    if (!pendingTokenRestore && multiSelectBarDelay) {
      setMultiSelectBarDelay(false);
    }
  }, [pendingTokenRestore, multiSelectBarDelay]);

  // Dismiss restore prompt when all duplicated/pasted nodes have been deleted
  useEffect(() => {
    if (!pendingTokenRestore) return;
    const newNodeIds = Object.values(pendingTokenRestore.oldToNewIdMap);
    const anyExist = newNodeIds.some(id => allNodes.some(n => n.id === id));
    if (!anyExist) {
      setPendingTokenRestore(null);
    }
  }, [allNodes, pendingTokenRestore]);

  // ═══════════════════════════════════════════════════════════════
  // Token-assignment "Go back" navigation — listen for save event
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const handleSaveBackState = (e: Event) => {
      const { sourceNodeId } = (e as CustomEvent<{ sourceNodeId: string }>).detail;
      const currentCS = canvasStates.find(s => s.projectId === activeProjectId && s.pageId === activePageId);
      setTokenNavBackState({
        sourceNodeId,
        pan: currentCS?.pan || { x: 0, y: 0 },
        zoom: currentCS?.zoom || 1,
      });
    };
    window.addEventListener('saveTokenNavBackState', handleSaveBackState);
    return () => window.removeEventListener('saveTokenNavBackState', handleSaveBackState);
  }, [canvasStates, activeProjectId, activePageId]);

  // Clear "Go back" state if source node is deleted
  useEffect(() => {
    if (tokenNavBackState && !allNodes.some(n => n.id === tokenNavBackState.sourceNodeId)) {
      setTokenNavBackState(null);
    }
  }, [allNodes, tokenNavBackState]);

  // ═══════════════════════════════════════════════════════════════
  // Auto-dismiss "Go back" button
  // ═══════════════════════════════════════════════════════════════
  const clearGoBackTimers = useCallback(() => {
    if (goBackTimerRef.current) { clearTimeout(goBackTimerRef.current); goBackTimerRef.current = null; }
    if (goBackFadeTimerRef.current) { clearTimeout(goBackFadeTimerRef.current); goBackFadeTimerRef.current = null; }
  }, []);

  const startGoBackDismissTimer = useCallback(() => {
    clearGoBackTimers();
    goBackTimerRef.current = setTimeout(() => {
      setGoBackFading(true);
      goBackFadeTimerRef.current = setTimeout(() => {
        setTokenNavBackState(null);
        setGoBackFading(false);
      }, GO_BACK_FADE_MS);
    }, GO_BACK_VISIBLE_MS);
  }, [clearGoBackTimers]);

  // Start/restart the auto-dismiss timer whenever back-state appears
  useEffect(() => {
    if (tokenNavBackState) {
      setGoBackFading(false);
      startGoBackDismissTimer();
    } else {
      clearGoBackTimers();
      setGoBackFading(false);
    }
    return clearGoBackTimers;
  }, [tokenNavBackState, startGoBackDismissTimer, clearGoBackTimers]);

  // Hover handlers: pause timer on hover, restart on leave
  const handleGoBackMouseEnter = useCallback(() => {
    clearGoBackTimers();
    setGoBackFading(false);
  }, [clearGoBackTimers]);

  const handleGoBackMouseLeave = useCallback(() => {
    if (tokenNavBackState) startGoBackDismissTimer();
  }, [tokenNavBackState, startGoBackDismissTimer]);

  // Handle "Go back" button click
  const handleTokenNavGoBack = useCallback(() => {
    if (!tokenNavBackState) return;
    clearGoBackTimers();
    const { sourceNodeId, pan, zoom } = tokenNavBackState;

    // Select the source node
    setSelectedNodeId(sourceNodeId);
    setSelectedNodeIds([sourceNodeId]);

    // Restore canvas view to the saved position
    requestAnimationFrame(() => {
      const event = new CustomEvent('restoreCanvasView', { detail: { pan, zoom } });
      window.dispatchEvent(event);
    });

    // Auto-open the token combo on the source node after animation settles (500ms animation + buffer)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('autoOpenTokenCombo', { detail: { nodeId: sourceNodeId } }));
    }, 600);

    // Clear back state
    setTokenNavBackState(null);
    setGoBackFading(false);
  }, [tokenNavBackState, clearGoBackTimers]);

  return {
    handleGoBackMouseEnter,
    handleGoBackMouseLeave,
    handleTokenNavGoBack,
  };
}
