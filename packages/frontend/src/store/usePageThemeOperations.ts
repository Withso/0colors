// Page & Theme operation callbacks extracted from App.tsx
import { useCallback, useRef } from 'react';
import type { CanvasState, Theme } from '../types';
import { getNodeEffectiveHSL } from '../utils/app-helpers';
import { toast } from 'sonner';
import { useStore } from './index';
import { useReadOnlyState } from '../hooks/useReadOnlyState';

export function usePageThemeOperations() {
  // ── Read from Zustand store ──
  // Only subscribe to state needed for render-time derivations (isSampleMode).
  // All other state is read via useStore.getState() inside callbacks to avoid unnecessary re-renders.
  const projects = useStore(s => s.projects);
  const activeProjectId = useStore(s => s.activeProjectId);
  const setAllNodes = useStore(s => s.setAllNodes);
  const setTokens = useStore(s => s.setTokens);
  const setThemes = useStore(s => s.setThemes);
  const setPages = useStore(s => s.setPages);
  const setGroups = useStore(s => s.setGroups);
  const setCanvasStates = useStore(s => s.setCanvasStates);
  const setAdvancedLogic = useStore(s => s.setAdvancedLogic);
  const setActivePageId = useStore(s => s.setActivePageId);
  const setActiveThemeId = useStore(s => s.setActiveThemeId);
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);

  // ── Sample mode guard (local, like useNodeCreation) ──
  const { isSampleMode } = useReadOnlyState();
  const isSampleModeRef = useRef(isSampleMode);
  isSampleModeRef.current = isSampleMode;

  const lastSampleToastRef = useRef(0);
  const sampleModeToast = useCallback((action?: string) => {
    const now = Date.now();
    if (now - lastSampleToastRef.current < 2500) return;
    lastSampleToastRef.current = now;
    toast('Duplicate this project to make changes', {
      description: action ? `${action} is not available in sample mode` : undefined,
    });
  }, []);

  // ── Per-theme selection persistence (local ref) ──
  const themeSelectionsRef = useRef<Record<string, { selectedNodeId: string | null; selectedNodeIds: string[] }>>({});

  const handleCreatePage = useCallback(() => {
    if (isSampleModeRef.current) { sampleModeToast('Creating pages'); return; }
    const { pages: currentPages, activeProjectId: projId } = useStore.getState();
    const timestamp = Date.now();
    const newPageId = `page-${timestamp}`;
    const projectPages = currentPages.filter(p => p.projectId === projId);
    const newPageName = `Page ${projectPages.length + 1}`;

    const newPage = {
      id: newPageId,
      name: newPageName,
      projectId: projId,
      createdAt: timestamp,
    };

    setPages(prev => [...prev, newPage]);

    // Create canvas state for the new page
    const newCanvasState: CanvasState = {
      projectId: projId,
      pageId: newPageId,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };
    setCanvasStates(prev => [...prev, newCanvasState]);

    // Switch to the new page
    setActivePageId(newPageId);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }, [setPages, setCanvasStates, setActivePageId, setSelectedNodeId, setSelectedNodeIds, sampleModeToast]);

  const handleSwitchPage = useCallback((pageId: string) => {
    setActivePageId(pageId);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }, [setActivePageId, setSelectedNodeId, setSelectedNodeIds]);

  const handleRenamePage = useCallback((pageId: string, newName: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Renaming pages'); return; }
    setPages(prev => prev.map(p =>
      p.id === pageId ? { ...p, name: newName } : p
    ));
  }, [setPages, sampleModeToast]);

  const handleDeletePage = useCallback((pageId: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Deleting pages'); return; }
    const { pages: currentPages, activeProjectId: projId, activePageId: currentActivePageId, allNodes: currentAllNodes } = useStore.getState();
    const projectPages = currentPages.filter(p => p.projectId === projId);

    // Don't allow deleting the last page
    if (projectPages.length <= 1) {
      alert('Cannot delete the last page');
      return;
    }

    // Collect node IDs belonging to this page for advancedLogic cleanup
    const pageNodeIds = new Set(currentAllNodes.filter(n => n.pageId === pageId).map(n => n.id));

    // Delete all nodes, tokens, groups, and canvas states on this page
    setAllNodes(prev => prev.filter(n => n.pageId !== pageId));
    setTokens(prev => prev.filter(t => t.pageId !== pageId));
    setGroups(prev => prev.filter(g => g.pageId !== pageId));
    setCanvasStates(prev => prev.filter(cs => cs.pageId !== pageId));
    setPages(prev => prev.filter(p => p.id !== pageId));

    // Clean up advancedLogic entries for deleted page's nodes
    if (pageNodeIds.size > 0) {
      setAdvancedLogic(prev => {
        const filtered = prev.filter(l => !pageNodeIds.has(l.nodeId));
        return filtered.length === prev.length ? prev : filtered;
      });
    }

    // Switch to another page if we're deleting the active page
    if (pageId === currentActivePageId) {
      const remainingPages = projectPages.filter(p => p.id !== pageId);
      if (remainingPages.length > 0) {
        setActivePageId(remainingPages[0].id);
      }
    }
  }, [setAllNodes, setTokens, setGroups, setCanvasStates, setPages, setAdvancedLogic, setActivePageId, sampleModeToast]);

  const handleCreateTheme = useCallback(() => {
    if (isSampleModeRef.current) { sampleModeToast('Creating themes'); return; }
    const {
      themes: currentThemes, activeProjectId: projId, activePageId: currentActivePageId,
      activeThemeId: currentActiveThemeId, allNodes: currentAllNodes,
      selectedNodeId: currentSelectedNodeId, selectedNodeIds: currentSelectedNodeIds,
    } = useStore.getState();

    const timestamp = Date.now();
    const newThemeId = `theme-${timestamp}`;
    const projectThemes = currentThemes.filter(t => t.projectId === projId);
    const newThemeName = `Theme ${projectThemes.length + 1}`;

    // Find the primary theme to duplicate from
    const primaryTheme = currentThemes.find(t => t.projectId === projId && t.isPrimary);
    const primaryThemeId = primaryTheme?.id;

    const newTheme: Theme = {
      id: newThemeId,
      name: newThemeName,
      projectId: projId,
      createdAt: timestamp,
    };

    setThemes(prev => [...prev, newTheme]);

    // Initialize themeValues for existing tokens based on assigned nodes
    setTokens(prev => prev.map(token => {
      if (token.projectId === projId && token.pageId === currentActivePageId) {
        // Initialize themeValues if it doesn't exist
        const themeValues = token.themeValues || {};

        // Find the node that has this token assigned in the primary theme
        const assignedNode = currentAllNodes.find(node => {
          const primaryAssignments = node.tokenAssignments?.[primaryThemeId || ''] || node.tokenIds || [];
          return primaryAssignments.includes(token.id);
        });

        let newThemeValue;
        if (assignedNode) {
          // Get the node's color using color-space-aware conversion
          if (assignedNode.isSpacing || assignedNode.type === 'spacing') {
            newThemeValue = {
              value: assignedNode.spacingValue,
              unit: assignedNode.spacingUnit,
            };
          } else {
            const effective = getNodeEffectiveHSL(assignedNode, undefined);
            newThemeValue = {
              hue: effective.hue,
              saturation: effective.saturation,
              lightness: effective.lightness,
              alpha: effective.alpha,
            };
          }
        } else {
          // Fallback: Copy values from the primary theme
          const sourceThemeId = primaryThemeId || currentActiveThemeId;
          newThemeValue = themeValues[sourceThemeId] || {
            hue: token.hue,
            saturation: token.saturation,
            lightness: token.lightness,
            alpha: token.alpha,
            value: token.value,
            unit: token.unit,
          };
        }

        // Also ensure primary theme has a themeValues entry (migrates legacy tokens)
        const updatedThemeValues = { ...themeValues, [newThemeId]: { ...newThemeValue } };
        if (primaryThemeId && !updatedThemeValues[primaryThemeId]) {
          updatedThemeValues[primaryThemeId] = {
            hue: token.hue,
            saturation: token.saturation,
            lightness: token.lightness,
            alpha: token.alpha,
            value: token.value,
            unit: token.unit,
          };
        }

        return {
          ...token,
          themeValues: updatedThemeValues,
        };
      }
      return token;
    }));

    // Copy token assignments from primary theme to new theme for all nodes.
    // Also falls back to legacy tokenIds if no theme-specific assignments exist,
    // and migrates the primary theme's legacy tokenIds into tokenAssignments.
    if (primaryThemeId) {
      setAllNodes(prev => prev.map(node => {
        if (node.projectId === projId) {
          const primaryTokenAssignments = node.tokenAssignments?.[primaryThemeId] !== undefined
            ? node.tokenAssignments[primaryThemeId]
            : (node.tokenIds || []);

          // Also ensure the primary theme has an explicit entry (migrates legacy tokenIds)
          const updatedAssignments = { ...node.tokenAssignments };
          if (updatedAssignments[primaryThemeId] === undefined && (node.tokenIds || []).length > 0) {
            updatedAssignments[primaryThemeId] = [...(node.tokenIds || [])];
          }
          updatedAssignments[newThemeId] = [...primaryTokenAssignments];

          return {
            ...node,
            tokenAssignments: updatedAssignments
          };
        }
        return node;
      }));
    }

    // Switch to the new theme — save current selection and clear for the new theme
    themeSelectionsRef.current[currentActiveThemeId] = {
      selectedNodeId: currentSelectedNodeId,
      selectedNodeIds: [...currentSelectedNodeIds],
    };
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setActiveThemeId(newThemeId);
  }, [setThemes, setTokens, setAllNodes, setSelectedNodeId, setSelectedNodeIds, setActiveThemeId, sampleModeToast]);

  const createThemeProgrammatic = useCallback((name?: string): string => {
    handleCreateTheme();
    const themeId = `theme-${Date.now()}`;
    if (name) {
      setTimeout(() => { setThemes(prev => prev.map(t => t.id === themeId ? { ...t, name } : t)); }, 0);
    }
    return themeId;
  }, [handleCreateTheme, setThemes]);

  const createPageProgrammatic = useCallback((name?: string): string => {
    handleCreatePage();
    const pageId = `page-${Date.now()}`;
    if (name) {
      setTimeout(() => { setPages(prev => prev.map(p => p.id === pageId ? { ...p, name } : p)); }, 0);
    }
    return pageId;
  }, [handleCreatePage, setPages]);

  const handleSwitchTheme = useCallback((themeId: string) => {
    // Save the current theme's selection state before switching
    const {
      activeThemeId: currentActiveThemeId,
      selectedNodeId: currentSelectedNodeId,
      selectedNodeIds: currentSelectedNodeIds,
      allNodes: currentAllNodes,
      themes: currentThemes,
    } = useStore.getState();

    themeSelectionsRef.current[currentActiveThemeId] = {
      selectedNodeId: currentSelectedNodeId,
      selectedNodeIds: [...currentSelectedNodeIds],
    };

    // Restore selection for the target theme (or clear if none saved)
    const savedSelection = themeSelectionsRef.current[themeId];
    if (savedSelection) {
      setSelectedNodeId(savedSelection.selectedNodeId);
      setSelectedNodeIds(savedSelection.selectedNodeIds);
    } else {
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    }

    setActiveThemeId(themeId);

    // Sync all token values with their assigned nodes for the new theme
    const targetTheme = currentThemes.find(t => t.id === themeId);
    const isTargetPrimary = targetTheme?.isPrimary ?? true;
    setTokens(prevTokens => {
      return prevTokens.map(token => {
        // Find the node that has this token assigned in the new theme
        const assignedNode = currentAllNodes.find(node => {
          // If theme-specific assignments exist (even if empty = intentionally cleared), use them exclusively
          if (node.tokenAssignments?.[themeId] !== undefined) {
            return node.tokenAssignments[themeId].includes(token.id);
          }
          return (node.tokenIds || []).includes(token.id);
        });

        if (!assignedNode) return token;

        // Get the effective color using color-space-aware conversion (handles RGB, OKLCH, HCT, HEX → HSL)
        const hasThemeOverride = assignedNode.themeOverrides?.[themeId];
        const themeOverride = hasThemeOverride ? assignedNode.themeOverrides![themeId] : undefined;
        const effective = getNodeEffectiveHSL(assignedNode, themeOverride);

        // Update token's themeValues for this theme
        const updatedThemeValues = { ...token.themeValues };

        if (assignedNode.isSpacing || assignedNode.type === 'spacing') {
          updatedThemeValues[themeId] = {
            value: assignedNode.spacingValue ?? 16,
            unit: assignedNode.spacingUnit ?? 'px',
          };
        } else {
          updatedThemeValues[themeId] = {
            hue: effective.hue,
            saturation: effective.saturation,
            lightness: effective.lightness,
            alpha: effective.alpha,
          };
        }

        if (isTargetPrimary) {
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
      });
    });
  }, [setSelectedNodeId, setSelectedNodeIds, setActiveThemeId, setTokens]);

  const handleRenameTheme = useCallback((themeId: string, newName: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Renaming themes'); return; }
    setThemes(prev => prev.map(t =>
      t.id === themeId ? { ...t, name: newName } : t
    ));
  }, [setThemes, sampleModeToast]);

  const handleDeleteTheme = useCallback((themeId: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Deleting themes'); return; }
    const {
      themes: currentThemes, activeProjectId: projId, activeThemeId: currentActiveThemeId,
    } = useStore.getState();
    const projectThemes = currentThemes.filter(t => t.projectId === projId);
    const themeToDelete = currentThemes.find(t => t.id === themeId);

    // Don't allow deleting the last theme
    if (projectThemes.length <= 1) {
      alert('Cannot delete the last theme');
      return;
    }

    // Don't allow deleting the primary theme
    if (themeToDelete?.isPrimary) {
      alert('Cannot delete the primary (default) theme.');
      return;
    }

    // Clean up theme-specific data from tokens (remove themeValues and themeVisibility for this theme)
    setTokens(prev => prev.map(token => {
      let updated = token;
      if (updated.themeValues && updated.themeValues[themeId]) {
        const { [themeId]: _, ...remainingThemeValues } = updated.themeValues;
        updated = { ...updated, themeValues: remainingThemeValues };
      }
      if (updated.themeVisibility && updated.themeVisibility[themeId] !== undefined) {
        const { [themeId]: _, ...remainingVis } = updated.themeVisibility;
        updated = { ...updated, themeVisibility: remainingVis };
      }
      return updated;
    }));

    // Clean up theme-specific data from nodes (remove themeOverrides, tokenAssignments, valueTokenAssignments, themeVisibility for this theme)
    setAllNodes(prev => prev.map(node => {
      let updatedNode = { ...node };

      if (updatedNode.themeOverrides && updatedNode.themeOverrides[themeId]) {
        const { [themeId]: _, ...remainingOverrides } = updatedNode.themeOverrides;
        updatedNode.themeOverrides = remainingOverrides;
      }

      if (updatedNode.tokenAssignments && updatedNode.tokenAssignments[themeId]) {
        const { [themeId]: _, ...remainingAssignments } = updatedNode.tokenAssignments;
        updatedNode.tokenAssignments = remainingAssignments;
      }

      if (updatedNode.valueTokenAssignments && updatedNode.valueTokenAssignments[themeId]) {
        const { [themeId]: _, ...remainingValueAssignments } = updatedNode.valueTokenAssignments;
        updatedNode.valueTokenAssignments = remainingValueAssignments;
      }

      if (updatedNode.themeVisibility && updatedNode.themeVisibility[themeId] !== undefined) {
        const { [themeId]: _, ...remainingVis } = updatedNode.themeVisibility;
        updatedNode.themeVisibility = remainingVis;
      }

      return updatedNode;
    }));

    // Clean up theme-specific advanced logic entries
    setAdvancedLogic(prev => prev.map(entry => {
      let updated = { ...entry };
      if (updated.themeChannels?.[themeId]) {
        const { [themeId]: _, ...rest } = updated.themeChannels;
        updated.themeChannels = Object.keys(rest).length > 0 ? rest : undefined;
      }
      if (updated.themeBaseValues?.[themeId]) {
        const { [themeId]: _, ...rest } = updated.themeBaseValues;
        updated.themeBaseValues = Object.keys(rest).length > 0 ? rest : undefined;
      }
      if (updated.themeTokenAssignment?.[themeId]) {
        const { [themeId]: _, ...rest } = updated.themeTokenAssignment;
        updated.themeTokenAssignment = Object.keys(rest).length > 0 ? rest : undefined;
      }
      return updated;
    }));

    setThemes(prev => prev.filter(t => t.id !== themeId));

    // Clean up per-theme selection state for the deleted theme
    delete themeSelectionsRef.current[themeId];

    // Switch to another theme if we're deleting the active theme
    if (themeId === currentActiveThemeId) {
      const remainingThemes = projectThemes.filter(t => t.id !== themeId);
      if (remainingThemes.length > 0) {
        // Clear current selection when forced to switch themes due to deletion
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        setActiveThemeId(remainingThemes[0].id);
      }
    }
  }, [setTokens, setAllNodes, setAdvancedLogic, setThemes, setSelectedNodeId, setSelectedNodeIds, setActiveThemeId, sampleModeToast]);


  return {
    handleCreatePage, handleSwitchPage, handleRenamePage, handleDeletePage,
    handleCreateTheme, handleSwitchTheme, handleRenameTheme, handleDeleteTheme,
    createThemeProgrammatic, createPageProgrammatic,
    themeSelectionsRef,
  };
}
