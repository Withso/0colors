// Node mutation callbacks extracted from App.tsx:
// deleteNode, selectNodeWithChildren, moveSelectedNodes, unlinkNode, linkNode,
// copyNode, pasteNodes, duplicateNode, handleRestoreTokens
import { useCallback, useRef } from 'react';
import type { ColorNode, DesignToken, TokenGroup } from '../types';
import { getUniqueTokenName, getUniqueNodeName } from '../utils/nameValidation';
import { computeTokenPath } from '../utils/app-helpers';
import { toast } from 'sonner';
import { useStore } from './index';
import { useReadOnlyState } from '../hooks/useReadOnlyState';

export function useNodeMutations() {
  // Read state from store
  const allNodes = useStore(s => s.allNodes);
  const tokens = useStore(s => s.tokens);
  const groups = useStore(s => s.groups);
  const themes = useStore(s => s.themes);
  const canvasStates = useStore(s => s.canvasStates);
  const projects = useStore(s => s.projects);
  const advancedLogic = useStore(s => s.advancedLogic);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activePageId = useStore(s => s.activePageId);
  const activeThemeId = useStore(s => s.activeThemeId);
  const selectedNodeId = useStore(s => s.selectedNodeId);
  const selectedNodeIds = useStore(s => s.selectedNodeIds);
  const copiedNodes = useStore(s => s.copiedNodes);
  const pendingTokenRestore = useStore(s => s.pendingTokenRestore);

  // Read setters from store
  const setAllNodes = useStore(s => s.setAllNodes);
  const setTokens = useStore(s => s.setTokens);
  const setGroups = useStore(s => s.setGroups);
  const setAdvancedLogic = useStore(s => s.setAdvancedLogic);
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);
  const setCopiedNodes = useStore(s => s.setCopiedNodes);
  const setPendingTokenRestore = useStore(s => s.setPendingTokenRestore);
  const setMultiSelectBarDelay = useStore(s => s.setMultiSelectBarDelay);

  // Derive sample mode from store state
  const { isSampleMode } = useReadOnlyState();
  const isSampleModeRef = useRef(isSampleMode);
  isSampleModeRef.current = isSampleMode;

  // Debounced toast for sample-mode blocked actions (prevents toast spam)
  const lastSampleToastRef = useRef(0);
  const sampleModeToast = useCallback((action?: string) => {
    const now = Date.now();
    if (now - lastSampleToastRef.current < 2500) return;
    lastSampleToastRef.current = now;
    toast('Duplicate this project to make changes', {
      description: action ? `${action} is not available in sample mode` : undefined,
      duration: 3000,
    });
  }, []);

  const copyNode = useCallback((id: string | string[]) => {
    const ids = Array.isArray(id) ? id : [id];
    const nodesToCopy: ColorNode[] = [];
    const addedIds = new Set<string>();

    const findDescendants = (parentId: string) => {
      allNodes.forEach((n) => {
        if (n.parentId === parentId && !addedIds.has(n.id)) {
          addedIds.add(n.id);
          nodesToCopy.push(n);
          findDescendants(n.id);
        }
      });
    };

    for (const nodeId of ids) {
      const node = allNodes.find(n => n.id === nodeId);
      if (node && !addedIds.has(node.id)) {
        addedIds.add(node.id);
        nodesToCopy.push(node);
        findDescendants(node.id);
      }
    }

    // ── Auto-include prefix ancestors for token child nodes ──
    // Token child nodes cannot exist without their prefix parent, so we
    // walk up from every token child in the set to its root prefix and
    // include all intermediate ancestor nodes that aren't already present.
    const tokenChildrenInCopySet = nodesToCopy.filter(n => n.isTokenNode && !n.isTokenPrefix);
    for (const tokenChild of tokenChildrenInCopySet) {
      let currentId = tokenChild.parentId;
      while (currentId) {
        if (addedIds.has(currentId)) break; // already in set → chain is complete
        const ancestor = allNodes.find(n => n.id === currentId);
        if (!ancestor) break;
        addedIds.add(ancestor.id);
        nodesToCopy.push(ancestor);
        // If this is the root prefix (no token-node parent), stop walking
        if (ancestor.isTokenPrefix) {
          const ancestorParent = ancestor.parentId
            ? allNodes.find(n => n.id === ancestor.parentId)
            : null;
          if (!ancestorParent || !ancestorParent.isTokenNode) break;
        }
        currentId = ancestor.parentId;
      }
    }

    if (nodesToCopy.length > 0) {
      setCopiedNodes(nodesToCopy);
    }
  }, [allNodes]);

  const pasteNodes = useCallback(() => {
    if (isSampleModeRef.current) { sampleModeToast('Pasting nodes'); return; }
    // Only allow pasting in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Nodes can only be pasted in the primary theme. Please switch to the primary theme to paste nodes.');
      return;
    }

    if (copiedNodes.length === 0) return;

    const timestamp = Date.now();
    const oldToNewIdMap = new Map<string, string>();

    copiedNodes.forEach((node, index) => {
      const newId = `${timestamp}-paste-${index}`;
      oldToNewIdMap.set(node.id, newId);
    });

    // ── Paste at viewport center ──
    // Calculate the bounding box of copied nodes
    let bbMinX = Infinity, bbMinY = Infinity, bbMaxX = -Infinity, bbMaxY = -Infinity;
    copiedNodes.forEach(n => {
      const w = n.width || 240;
      bbMinX = Math.min(bbMinX, n.position.x);
      bbMinY = Math.min(bbMinY, n.position.y);
      bbMaxX = Math.max(bbMaxX, n.position.x + w);
      bbMaxY = Math.max(bbMaxY, n.position.y + 280);
    });
    const bbCenterX = (bbMinX + bbMaxX) / 2;
    const bbCenterY = (bbMinY + bbMaxY) / 2;

    // Get current viewport center
    const currentCSPaste = canvasStates.find(s => s.projectId === activeProjectId && s.pageId === activePageId) || {
      projectId: activeProjectId, pageId: activePageId, pan: { x: 0, y: 0 }, zoom: 1,
    };
    const safePanP = currentCSPaste.pan || { x: 0, y: 0 };
    const safeZoomP = currentCSPaste.zoom || 1;
    const tokensPanelWidthP = 372;
    const canvasWidthP = window.innerWidth - tokensPanelWidthP;
    const canvasHeightP = window.innerHeight;
    const screenCenterXP = tokensPanelWidthP + canvasWidthP / 2;
    const screenCenterYP = canvasHeightP / 2;
    const viewportCenterXP = (screenCenterXP - safePanP.x) / safeZoomP;
    const viewportCenterYP = (screenCenterYP - safePanP.y) / safeZoomP;

    // Offset so the bounding-box center lands at the viewport center
    const deltaX = viewportCenterXP - bbCenterX;
    const deltaY = viewportCenterYP - bbCenterY;

    // Check if any original node had token assignments (for restore prompt)
    const hadTokens = copiedNodes.some(n => {
      const hasLegacyToken = !!n.tokenId;
      const hasTokenIds = (n.tokenIds?.length || 0) > 0;
      const hasAssignments = n.tokenAssignments && Object.values(n.tokenAssignments).some(arr => arr.length > 0);
      const hasAutoAssigned = !!n.autoAssignedTokenId;
      return hasLegacyToken || hasTokenIds || hasAssignments || hasAutoAssigned;
    });

    const newNodes: ColorNode[] = copiedNodes.map((node) => {
      // Add "-Copy" to reference names — skip token nodes (handled separately below)
      let newRefName = node.referenceName;
      if (!node.isTokenNode && node.referenceNameLocked && node.referenceName) {
        newRefName = getUniqueNodeName(node.referenceName + '-Copy', allNodes, activePageId);
      }

      const base: ColorNode = {
        ...node,
        id: oldToNewIdMap.get(node.id)!,
        parentId: node.parentId ? oldToNewIdMap.get(node.parentId) || null : null,
        position: {
          x: node.position.x + deltaX,
          y: node.position.y + deltaY,
        },
        // Clear ALL token references and auto-assign state
        tokenId: null,
        tokenIds: [],
        tokenAssignments: {},
        autoAssignedTokenId: undefined,
        autoAssignEnabled: false,
        autoAssignGroupId: undefined,
        // Clear token node specific fields (stale refs to original's tokens/groups)
        ...(node.isTokenNode && {
          ownTokenId: undefined,
          valueTokenId: undefined,
          valueTokenAssignments: undefined,
          ...(node.isTokenPrefix && { tokenGroupId: undefined }),
        }),
        projectId: activeProjectId,
        pageId: activePageId,
        referenceName: newRefName,
      };
      return base;
    });

    // ── Token node post-processing: recreate groups & tokens ──────────────
    const pasteNewGroups: TokenGroup[] = [];
    const pasteNewTokens: DesignToken[] = [];
    // Track all existing token names (project-wide across ALL pages) to avoid duplicates
    const existingTokenNames = new Set(
      tokens
        .filter(t => t.projectId === activeProjectId)
        .map(t => t.name.toLowerCase())
    );

    // 1) Process ROOT prefix nodes: find or create group, assign tokenGroupId
    //    (Skip mid-tree prefixes — they sit under another token-node parent and don't own a group)
    const pastedPrefixNodes = newNodes.filter(n => {
      if (!n.isTokenNode || !n.isTokenPrefix) return false;
      if (!n.parentId) return true;
      const parent = newNodes.find(p => p.id === n.parentId);
      return !parent || !parent.isTokenNode;
    });
    for (const prefixNode of pastedPrefixNodes) {
      const prefixName = prefixNode.referenceName || 'color';
      // Check if a token-node group with the same name already exists (project-wide)
      const existingGroup = groups.find(g =>
        g.name === prefixName &&
        g.projectId === activeProjectId &&
        g.isTokenNodeGroup
      );
      if (existingGroup) {
        prefixNode.tokenGroupId = existingGroup.id;
      } else {
        // Check batch-created groups
        const batchGroup = pasteNewGroups.find(g => g.name === prefixName);
        if (batchGroup) {
          prefixNode.tokenGroupId = batchGroup.id;
        } else {
          const groupId = `${prefixNode.id}-group`;
          prefixNode.tokenGroupId = groupId;
          pasteNewGroups.push({
            id: groupId,
            name: prefixName,
            projectId: activeProjectId,
            pageId: activePageId,
            isExpanded: true,
            isTokenNodeGroup: true,
            createdAt: Date.now(),
          });
        }
      }
    }

    // 2) Process child token nodes: create tokens with validated unique names
    const pastedChildTokenNodes = newNodes.filter(n => n.isTokenNode && !n.isTokenPrefix);
    const pasteProjectThemes = themes.filter(t => t.projectId === activeProjectId);
    for (const childNode of pastedChildTokenNodes) {
      // Find the root prefix among the new nodes
      const rootPrefix = (() => {
        let cur: ColorNode | undefined = childNode;
        while (cur) {
          if (cur.isTokenPrefix) {
            const p = cur.parentId ? newNodes.find(n => n.id === cur!.parentId) : null;
            if (!p || !p.isTokenNode) return cur;
          }
          cur = cur.parentId ? newNodes.find(n => n.id === cur!.parentId) : undefined;
        }
        return null;
      })();
      if (!rootPrefix) continue;
      const groupId = rootPrefix.tokenGroupId;
      if (!groupId) continue;

      // Compute the full token name by walking up the new-node tree
      const tokenName = computeTokenPath(childNode, newNodes);

      // Validate uniqueness — add "-copy" suffix if name is already taken
      let finalName = tokenName;
      if (existingTokenNames.has(tokenName.toLowerCase())) {
        // Try "name-copy", then "name-copy-1", "name-copy-2", …
        const copyBase = tokenName + '-copy';
        if (!existingTokenNames.has(copyBase.toLowerCase())) {
          finalName = copyBase;
        } else {
          finalName = copyBase;
          for (let i = 1; i <= 999; i++) {
            const candidate = `${copyBase}-${i}`;
            if (!existingTokenNames.has(candidate.toLowerCase())) {
              finalName = candidate;
              break;
            }
          }
        }
      }
      existingTokenNames.add(finalName.toLowerCase());

      // Update node's referenceName and keep suffix in sync for future path recomputation
      childNode.referenceName = finalName;
      if (finalName !== tokenName) {
        const extra = finalName.slice(tokenName.length); // e.g. "-copy" or "-copy-1"
        childNode.tokenNodeSuffix = (childNode.tokenNodeSuffix || '1') + extra;
      }

      // Preserve original token's per-theme color values when available
      const origCopiedNode = copiedNodes.find(n => oldToNewIdMap.get(n.id) === childNode.id);
      const origToken = origCopiedNode?.ownTokenId
        ? tokens.find(t => t.id === origCopiedNode.ownTokenId)
        : null;

      const tokenThemeValues: { [themeId: string]: any } = {};
      pasteProjectThemes.forEach(theme => {
        const origThemeVal = origToken?.themeValues?.[theme.id];
        tokenThemeValues[theme.id] = origThemeVal
          ? { ...origThemeVal }
          : {
            hue: childNode.hue ?? 0,
            saturation: childNode.saturation ?? 0,
            lightness: childNode.lightness ?? 0,
            alpha: childNode.alpha ?? 100,
          };
      });

      const newTokenId = `${childNode.id}-token`;
      pasteNewTokens.push({
        id: newTokenId,
        name: finalName,
        type: 'color',
        groupId,
        projectId: activeProjectId,
        pageId: activePageId,
        themeValues: tokenThemeValues,
        createdAt: Date.now(),
      });
      childNode.ownTokenId = newTokenId;
    }

    // Add groups & tokens to state
    if (pasteNewGroups.length > 0) setGroups(prev => [...prev, ...pasteNewGroups]);
    if (pasteNewTokens.length > 0) {
      // Assign ascending sortOrder per group for pasted tokens
      const groupedPaste = new Map<string | null, DesignToken[]>();
      pasteNewTokens.forEach(t => {
        const gid = t.groupId ?? null;
        if (!groupedPaste.has(gid)) groupedPaste.set(gid, []);
        groupedPaste.get(gid)!.push(t);
      });
      const withSortOrder = pasteNewTokens.map(t => {
        const gid = t.groupId ?? null;
        const groupList = groupedPaste.get(gid)!;
        return { ...t, sortOrder: groupList.indexOf(t) };
      });
      setTokens(prev => [...prev, ...withSortOrder]);
    }

    setAllNodes((prev) => [...prev, ...newNodes]);

    const newNodeIds = newNodes.map(n => n.id);
    setSelectedNodeId(oldToNewIdMap.get(copiedNodes[0].id)!);
    setSelectedNodeIds(newNodeIds);

    // Store restore info if original non-token nodes had token assignments (token nodes handle their own tokens above)
    const hasAnyTokenNodes = copiedNodes.some(n => n.isTokenNode);
    if (hadTokens && !hasAnyTokenNodes) {
      const mapObj: Record<string, string> = {};
      oldToNewIdMap.forEach((v, k) => { mapObj[k] = v; });
      setPendingTokenRestore({
        oldToNewIdMap: mapObj,
        originalNodes: copiedNodes.map(n => ({ ...n })), // snapshot
        timestamp: Date.now(),
      });
      setMultiSelectBarDelay(true);
    }
  }, [copiedNodes, allNodes, activeProjectId, activePageId, themes, activeThemeId, canvasStates, tokens, groups]);

  const duplicateNode = useCallback((id: string | string[]) => {
    if (isSampleModeRef.current) { sampleModeToast('Duplicating nodes'); return; }
    // Only allow duplicating in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Nodes can only be duplicated in the primary theme. Please switch to the primary theme to duplicate nodes.');
      return;
    }

    const ids = Array.isArray(id) ? id : [id];
    const nodesToDuplicate: ColorNode[] = [];
    const addedIds = new Set<string>();

    const findDescendants = (parentId: string) => {
      allNodes.forEach((n) => {
        if (n.parentId === parentId && !addedIds.has(n.id)) {
          addedIds.add(n.id);
          nodesToDuplicate.push(n);
          findDescendants(n.id);
        }
      });
    };

    for (const nodeId of ids) {
      const node = allNodes.find(n => n.id === nodeId);
      if (node && !addedIds.has(node.id)) {
        addedIds.add(node.id);
        nodesToDuplicate.push(node);
        findDescendants(node.id);
      }
    }

    // ── Auto-include prefix ancestors for token child nodes ──
    const tokenChildrenInDupSet = nodesToDuplicate.filter(n => n.isTokenNode && !n.isTokenPrefix);
    for (const tokenChild of tokenChildrenInDupSet) {
      let currentId = tokenChild.parentId;
      while (currentId) {
        if (addedIds.has(currentId)) break;
        const ancestor = allNodes.find(n => n.id === currentId);
        if (!ancestor) break;
        addedIds.add(ancestor.id);
        nodesToDuplicate.push(ancestor);
        if (ancestor.isTokenPrefix) {
          const ancestorParent = ancestor.parentId
            ? allNodes.find(n => n.id === ancestor.parentId)
            : null;
          if (!ancestorParent || !ancestorParent.isTokenNode) break;
        }
        currentId = ancestor.parentId;
      }
    }

    if (nodesToDuplicate.length === 0) return;

    const timestamp = Date.now();
    const oldToNewIdMap = new Map<string, string>();

    nodesToDuplicate.forEach((n, index) => {
      const newId = `${timestamp}-dup-${index}`;
      oldToNewIdMap.set(n.id, newId);
    });

    // ── Duplicate at viewport center ──
    // Calculate the bounding box of nodes being duplicated
    let dupMinX = Infinity, dupMinY = Infinity, dupMaxX = -Infinity, dupMaxY = -Infinity;
    nodesToDuplicate.forEach(n => {
      const w = n.width || 240;
      dupMinX = Math.min(dupMinX, n.position.x);
      dupMinY = Math.min(dupMinY, n.position.y);
      dupMaxX = Math.max(dupMaxX, n.position.x + w);
      dupMaxY = Math.max(dupMaxY, n.position.y + 280);
    });
    const dupCenterX = (dupMinX + dupMaxX) / 2;
    const dupCenterY = (dupMinY + dupMaxY) / 2;

    // Get current viewport center
    const currentCSDup = canvasStates.find(s => s.projectId === activeProjectId && s.pageId === activePageId) || {
      projectId: activeProjectId, pageId: activePageId, pan: { x: 0, y: 0 }, zoom: 1,
    };
    const safePanD = currentCSDup.pan || { x: 0, y: 0 };
    const safeZoomD = currentCSDup.zoom || 1;
    const tokensPanelWidthD = 372;
    const canvasWidthD = window.innerWidth - tokensPanelWidthD;
    const canvasHeightD = window.innerHeight;
    const screenCenterXD = tokensPanelWidthD + canvasWidthD / 2;
    const screenCenterYD = canvasHeightD / 2;
    const viewportCenterXD = (screenCenterXD - safePanD.x) / safeZoomD;
    const viewportCenterYD = (screenCenterYD - safePanD.y) / safeZoomD;

    // Offset so the bounding-box center lands at the viewport center
    const deltaX = viewportCenterXD - dupCenterX;
    const deltaY = viewportCenterYD - dupCenterY;

    // Check if any original node had token assignments (for restore prompt)
    const hadTokens = nodesToDuplicate.some(n => {
      const hasLegacyToken = !!n.tokenId;
      const hasTokenIds = (n.tokenIds?.length || 0) > 0;
      const hasAssignments = n.tokenAssignments && Object.values(n.tokenAssignments).some(arr => arr.length > 0);
      const hasAutoAssigned = !!n.autoAssignedTokenId;
      return hasLegacyToken || hasTokenIds || hasAssignments || hasAutoAssigned;
    });

    const newNodes: ColorNode[] = nodesToDuplicate.map((origNode) => {
      // Add "-Copy" to reference names — skip token nodes (handled separately below)
      let newRefName = origNode.referenceName;
      if (!origNode.isTokenNode && origNode.referenceNameLocked && origNode.referenceName) {
        newRefName = getUniqueNodeName(origNode.referenceName + '-Copy', allNodes, activePageId);
      }

      const base: ColorNode = {
        ...origNode,
        id: oldToNewIdMap.get(origNode.id)!,
        parentId: origNode.parentId ? oldToNewIdMap.get(origNode.parentId) || null : null,
        position: {
          x: origNode.position.x + deltaX,
          y: origNode.position.y + deltaY,
        },
        // Clear ALL token references and auto-assign state
        tokenId: null,
        tokenIds: [],
        tokenAssignments: {},
        autoAssignedTokenId: undefined,
        autoAssignEnabled: false,
        autoAssignGroupId: undefined,
        // Clear token node specific fields (stale refs to original's tokens/groups)
        ...(origNode.isTokenNode && {
          ownTokenId: undefined,
          valueTokenId: undefined,
          valueTokenAssignments: undefined,
          ...(origNode.isTokenPrefix && { tokenGroupId: undefined }),
        }),
        projectId: activeProjectId,
        pageId: activePageId,
        referenceName: newRefName,
      };
      return base;
    });

    // ── Token node post-processing: recreate groups & tokens ──────────────
    const dupNewGroups: TokenGroup[] = [];
    const dupNewTokens: DesignToken[] = [];
    const existingDupTokenNames = new Set(
      tokens
        .filter(t => t.projectId === activeProjectId)
        .map(t => t.name.toLowerCase())
    );

    // 1) Process ROOT prefix nodes: find or create group
    //    (Skip mid-tree prefixes — they sit under another token-node parent and don't own a group)
    const dupPrefixNodes = newNodes.filter(n => {
      if (!n.isTokenNode || !n.isTokenPrefix) return false;
      if (!n.parentId) return true;
      const parent = newNodes.find(p => p.id === n.parentId);
      return !parent || !parent.isTokenNode;
    });
    for (const prefixNode of dupPrefixNodes) {
      const prefixName = prefixNode.referenceName || 'color';
      const existingGroup = groups.find(g =>
        g.name === prefixName &&
        g.projectId === activeProjectId &&
        g.isTokenNodeGroup
      );
      if (existingGroup) {
        prefixNode.tokenGroupId = existingGroup.id;
      } else {
        const batchGroup = dupNewGroups.find(g => g.name === prefixName);
        if (batchGroup) {
          prefixNode.tokenGroupId = batchGroup.id;
        } else {
          const groupId = `${prefixNode.id}-group`;
          prefixNode.tokenGroupId = groupId;
          dupNewGroups.push({
            id: groupId,
            name: prefixName,
            projectId: activeProjectId,
            pageId: activePageId,
            isExpanded: true,
            isTokenNodeGroup: true,
            createdAt: Date.now(),
          });
        }
      }
    }

    // 2) Process child token nodes: create tokens with validated unique names
    const dupChildTokenNodes = newNodes.filter(n => n.isTokenNode && !n.isTokenPrefix);
    const dupProjectThemes = themes.filter(t => t.projectId === activeProjectId);
    for (const childNode of dupChildTokenNodes) {
      const rootPrefix = (() => {
        let cur: ColorNode | undefined = childNode;
        while (cur) {
          if (cur.isTokenPrefix) {
            const p = cur.parentId ? newNodes.find(n => n.id === cur!.parentId) : null;
            if (!p || !p.isTokenNode) return cur;
          }
          cur = cur.parentId ? newNodes.find(n => n.id === cur!.parentId) : undefined;
        }
        return null;
      })();
      if (!rootPrefix) continue;
      const groupId = rootPrefix.tokenGroupId;
      if (!groupId) continue;

      const tokenName = computeTokenPath(childNode, newNodes);

      let finalName = tokenName;
      if (existingDupTokenNames.has(tokenName.toLowerCase())) {
        const copyBase = tokenName + '-copy';
        if (!existingDupTokenNames.has(copyBase.toLowerCase())) {
          finalName = copyBase;
        } else {
          finalName = copyBase;
          for (let i = 1; i <= 999; i++) {
            const candidate = `${copyBase}-${i}`;
            if (!existingDupTokenNames.has(candidate.toLowerCase())) {
              finalName = candidate;
              break;
            }
          }
        }
      }
      existingDupTokenNames.add(finalName.toLowerCase());

      childNode.referenceName = finalName;
      if (finalName !== tokenName) {
        const extra = finalName.slice(tokenName.length);
        childNode.tokenNodeSuffix = (childNode.tokenNodeSuffix || '1') + extra;
      }

      // Preserve original token's per-theme color values when available
      const origDupNode = nodesToDuplicate.find(n => oldToNewIdMap.get(n.id) === childNode.id);
      const origDupToken = origDupNode?.ownTokenId
        ? tokens.find(t => t.id === origDupNode.ownTokenId)
        : null;

      const tokenThemeValues: { [themeId: string]: any } = {};
      dupProjectThemes.forEach(theme => {
        const origThemeVal = origDupToken?.themeValues?.[theme.id];
        tokenThemeValues[theme.id] = origThemeVal
          ? { ...origThemeVal }
          : {
            hue: childNode.hue ?? 0,
            saturation: childNode.saturation ?? 0,
            lightness: childNode.lightness ?? 0,
            alpha: childNode.alpha ?? 100,
          };
      });

      const newTokenId = `${childNode.id}-token`;
      dupNewTokens.push({
        id: newTokenId,
        name: finalName,
        type: 'color',
        groupId,
        projectId: activeProjectId,
        pageId: activePageId,
        themeValues: tokenThemeValues,
        createdAt: Date.now(),
      });
      childNode.ownTokenId = newTokenId;
    }

    if (dupNewGroups.length > 0) setGroups(prev => [...prev, ...dupNewGroups]);
    if (dupNewTokens.length > 0) {
      // Assign ascending sortOrder per group for duplicated tokens
      const groupedDup = new Map<string | null, DesignToken[]>();
      dupNewTokens.forEach(t => {
        const gid = t.groupId ?? null;
        if (!groupedDup.has(gid)) groupedDup.set(gid, []);
        groupedDup.get(gid)!.push(t);
      });
      const withSortOrder = dupNewTokens.map(t => {
        const gid = t.groupId ?? null;
        const groupList = groupedDup.get(gid)!;
        return { ...t, sortOrder: groupList.indexOf(t) };
      });
      setTokens(prev => [...prev, ...withSortOrder]);
    }

    setAllNodes((prev) => [...prev, ...newNodes]);

    const newNodeIds = newNodes.map(n => n.id);
    setSelectedNodeId(oldToNewIdMap.get(nodesToDuplicate[0].id)!);
    setSelectedNodeIds(newNodeIds);

    // Store restore info if original nodes had tokens (skip for token nodes — they handle their own tokens above)
    if (hadTokens && !nodesToDuplicate.some(n => n.isTokenNode)) {
      const mapObj: Record<string, string> = {};
      oldToNewIdMap.forEach((v, k) => { mapObj[k] = v; });
      setPendingTokenRestore({
        oldToNewIdMap: mapObj,
        originalNodes: nodesToDuplicate.map(n => ({ ...n })), // snapshot
        timestamp: Date.now(),
      });
      setMultiSelectBarDelay(true);
    }
  }, [allNodes, activeProjectId, activePageId, themes, activeThemeId, canvasStates, tokens, groups]);

  const handleRestoreTokens = useCallback(() => {
    if (!pendingTokenRestore) return;
    const { oldToNewIdMap, originalNodes } = pendingTokenRestore;

    // 1. Collect all unique token IDs referenced by original nodes
    const allOriginalTokenIds = new Set<string>();
    const autoAssignGroupIds = new Set<string>();

    originalNodes.forEach(n => {
      if (n.tokenId) {
        allOriginalTokenIds.add(n.tokenId);
      }
      if (n.tokenAssignments) {
        Object.values(n.tokenAssignments).forEach(arr => {
          arr.forEach(tid => allOriginalTokenIds.add(tid));
        });
      }
      if (n.tokenIds) {
        n.tokenIds.forEach(tid => allOriginalTokenIds.add(tid));
      }
      if (n.autoAssignedTokenId) {
        allOriginalTokenIds.add(n.autoAssignedTokenId);
      }
      if (n.autoAssignEnabled && n.autoAssignGroupId) {
        autoAssignGroupIds.add(n.autoAssignGroupId);
      }
    });

    if (allOriginalTokenIds.size === 0) {
      setPendingTokenRestore(null);
      return;
    }

    // 2. Look up original tokens & groups
    const originalTokensSnapshot = tokens.filter(t => allOriginalTokenIds.has(t.id));
    const originalGroupsSnapshot = groups.filter(g => autoAssignGroupIds.has(g.id));

    // 3. Build group duplication map
    const oldGroupToNewGroupId: Record<string, string> = {};
    const newGroups: TokenGroup[] = [];

    originalGroupsSnapshot.forEach(g => {
      const newGroupId = `${Date.now()}-grp-${Math.random().toString(36).slice(2, 7)}`;
      oldGroupToNewGroupId[g.id] = newGroupId;

      const existingGroupNames = new Set(groups.map(eg => eg.name));
      let groupName = g.name + '-Copy';
      let suffix = 1;
      while (existingGroupNames.has(groupName) || newGroups.some(ng => ng.name === groupName)) {
        groupName = g.name + '-Copy-' + suffix;
        suffix++;
      }

      newGroups.push({
        ...g,
        id: newGroupId,
        name: groupName,
        projectId: activeProjectId,
        pageId: activePageId,
      });
    });

    // 4. Duplicate tokens
    const oldTokenToNewTokenId: Record<string, string> = {};
    const newTokens: DesignToken[] = [];

    originalTokensSnapshot.forEach(t => {
      const newTokenId = `${Date.now()}-tok-${Math.random().toString(36).slice(2, 7)}`;
      oldTokenToNewTokenId[t.id] = newTokenId;

      let newGroupId = t.groupId;
      if (t.groupId && oldGroupToNewGroupId[t.groupId]) {
        newGroupId = oldGroupToNewGroupId[t.groupId];
      }

      const newTokenName = getUniqueTokenName(
        t.name + '-Copy',
        [...tokens, ...newTokens],
        activeProjectId,
      );

      newTokens.push({
        ...t,
        id: newTokenId,
        name: newTokenName,
        groupId: newGroupId,
        projectId: activeProjectId,
        pageId: activePageId,
        createdAt: Date.now(),
      });
    });

    // 5. Update the duplicated nodes with restored token references
    setAllNodes(prev => prev.map(node => {
      const originalId = Object.keys(oldToNewIdMap).find(k => oldToNewIdMap[k] === node.id);
      if (!originalId) return node;

      const originalNode = originalNodes.find(n => n.id === originalId);
      if (!originalNode) return node;

      const newTokenAssignments: { [themeId: string]: string[] } = {};
      if (originalNode.tokenAssignments) {
        Object.keys(originalNode.tokenAssignments).forEach(themeId => {
          newTokenAssignments[themeId] = originalNode.tokenAssignments![themeId]
            .map(tid => oldTokenToNewTokenId[tid])
            .filter(Boolean);
        });
      }

      const newTokenIds = (originalNode.tokenIds || [])
        .map(tid => oldTokenToNewTokenId[tid])
        .filter(Boolean);

      // Map legacy tokenId (singular)
      const newTokenId = originalNode.tokenId
        ? oldTokenToNewTokenId[originalNode.tokenId] || null
        : null;

      const newAutoAssignedTokenId = originalNode.autoAssignedTokenId
        ? oldTokenToNewTokenId[originalNode.autoAssignedTokenId]
        : undefined;

      const newAutoAssignGroupId = originalNode.autoAssignEnabled && originalNode.autoAssignGroupId
        ? oldGroupToNewGroupId[originalNode.autoAssignGroupId] || undefined
        : node.autoAssignGroupId;

      const newAutoAssignPrefix = originalNode.autoAssignEnabled && originalNode.autoAssignPrefix
        ? originalNode.autoAssignPrefix + '-Copy'
        : node.autoAssignPrefix;

      return {
        ...node,
        tokenId: newTokenId,
        tokenIds: newTokenIds,
        tokenAssignments: newTokenAssignments,
        autoAssignedTokenId: newAutoAssignedTokenId,
        autoAssignGroupId: newAutoAssignGroupId,
        autoAssignPrefix: newAutoAssignPrefix,
        // Re-enable auto-assign for parent nodes that had it
        ...(originalNode.autoAssignEnabled ? { autoAssignEnabled: true } : {}),
        ...(originalNode.autoAssignSuffix ? { autoAssignSuffix: originalNode.autoAssignSuffix } : {}),
      };
    }));

    // 6. Add new groups and tokens to state
    if (newGroups.length > 0) {
      setGroups(prev => [...prev, ...newGroups]);
    }
    if (newTokens.length > 0) {
      // Ensure ascending sortOrder per group for cloned tokens
      const groupedClone = new Map<string | null, DesignToken[]>();
      newTokens.forEach(t => {
        const gid = t.groupId ?? null;
        if (!groupedClone.has(gid)) groupedClone.set(gid, []);
        groupedClone.get(gid)!.push(t);
      });
      const withSortOrder = newTokens.map(t => {
        if (t.sortOrder !== undefined) return t;
        const gid = t.groupId ?? null;
        const groupList = groupedClone.get(gid)!;
        return { ...t, sortOrder: groupList.indexOf(t) };
      });
      setTokens(prev => [...prev, ...withSortOrder]);
    }

    // 7. Sync token color values from the original tokens
    setTimeout(() => {
      setTokens(prevTokens => {
        return prevTokens.map(token => {
          if (!Object.values(oldTokenToNewTokenId).includes(token.id)) return token;

          const origToken = originalTokensSnapshot.find(t =>
            oldTokenToNewTokenId[t.id] === token.id
          );
          if (origToken && origToken.themeValues) {
            return {
              ...token,
              themeValues: { ...origToken.themeValues },
              hue: origToken.hue,
              saturation: origToken.saturation,
              lightness: origToken.lightness,
              alpha: origToken.alpha,
            };
          }
          return token;
        });
      });
    }, 50);

    toast.success('Assigned tokens restored');
    setPendingTokenRestore(null);
  }, [pendingTokenRestore, tokens, groups, allNodes, activeProjectId, activePageId]);

  const deleteNode = useCallback((id: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Deleting nodes'); return; }
    // Only allow node deletion in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Nodes can only be deleted in the primary theme. Please switch to the primary theme to delete nodes.');
      return;
    }

    // ── Compute ALL nodes that will be deleted (target + all descendants) ──
    const nodesToDelete = new Set<string>([id]);
    const findAllDescendants = (parentId: string) => {
      allNodes.forEach(n => {
        if (n.parentId === parentId) {
          nodesToDelete.add(n.id);
          findAllDescendants(n.id);
        }
      });
    };
    findAllDescendants(id);

    // ── Collect auto-assigned tokens to delete & groups to check ──
    const autoAssignedTokenIdsToDelete = new Set<string>();
    // Groups owned by auto-assign-enabled parent nodes that are being deleted
    const autoAssignGroupIdsToCheck = new Set<string>();

    allNodes.forEach(n => {
      if (!nodesToDelete.has(n.id)) return;
      // Any node (child) with an auto-assigned token → that token must be deleted
      if (n.autoAssignedTokenId) {
        autoAssignedTokenIdsToDelete.add(n.autoAssignedTokenId);
      }
      // Parent nodes with auto-assign enabled → their group may need cleanup
      if (n.autoAssignEnabled && n.autoAssignGroupId) {
        autoAssignGroupIdsToCheck.add(n.autoAssignGroupId);
      }
    });

    // First check if we need to delete palette groups and tokens
    const nodeToDelete = allNodes.find(n => n.id === id);

    if (nodeToDelete?.isPalette) {
      console.log(`🗑️ Deleting palette node: ${id}`);

      // Find the palette group
      const paletteGroup = groups.find(g => g.paletteNodeId === id);

      if (paletteGroup) {
        console.log(`Found palette group: ${paletteGroup.name} (${paletteGroup.id})`);

        // Remove tokens and groups (React will batch these updates)
        setTokens(prevTokens => {
          const filtered = prevTokens.filter(t => t.groupId !== paletteGroup.id);
          const removedTokens = prevTokens.filter(t => t.groupId === paletteGroup.id);
          console.log(`🗑️ Removing ${removedTokens.length} tokens:`, removedTokens.map(t => t.name));
          console.log(`Tokens: ${prevTokens.length} -> ${filtered.length}`);
          return filtered;
        });

        setGroups(prevGroups => {
          const filtered = prevGroups.filter(g => g.id !== paletteGroup.id);
          console.log(`Groups: ${prevGroups.length} -> ${filtered.length}`);
          return filtered;
        });
      } else {
        console.warn(`⚠️ No palette group found for palette node ${id}, searching all groups...`);
        // Fallback: try to find any palette entry group that might be orphaned
        setGroups(prevGroups => {
          const orphanedGroup = prevGroups.find(g => g.isPaletteEntry && g.paletteNodeId === id);
          if (orphanedGroup) {
            console.log(`Found orphaned palette group: ${orphanedGroup.name} (${orphanedGroup.id})`);

            // Delete tokens associated with this group
            setTokens(prevTokens => {
              const filtered = prevTokens.filter(t => t.groupId !== orphanedGroup.id);
              console.log(`🗑️ Removing orphaned tokens for group ${orphanedGroup.id}`);
              return filtered;
            });

            // Remove the group
            return prevGroups.filter(g => g.id !== orphanedGroup.id);
          }
          return prevGroups;
        });
      }
    }

    // ── Delete tokens auto-created for token node children ──
    const tokenNodeTokenIdsToDelete = new Set<string>();
    const tokenNodeGroupIdsToCheck = new Set<string>();
    allNodes.forEach(n => {
      if (!nodesToDelete.has(n.id)) return;
      if (n.isTokenNode && !n.isTokenPrefix && n.ownTokenId) {
        tokenNodeTokenIdsToDelete.add(n.ownTokenId);
      }
      if (n.isTokenPrefix && n.tokenGroupId) {
        tokenNodeGroupIdsToCheck.add(n.tokenGroupId);
      }
    });
    // Only delete a token-node group if NO surviving prefix nodes still reference it
    const tokenNodeGroupIdsToDelete = new Set<string>();
    tokenNodeGroupIdsToCheck.forEach(gId => {
      const survivingPrefixWithGroup = allNodes.some(n =>
        !nodesToDelete.has(n.id) && n.isTokenPrefix && n.tokenGroupId === gId
      );
      if (!survivingPrefixWithGroup) {
        tokenNodeGroupIdsToDelete.add(gId);
      }
    });
    if (tokenNodeTokenIdsToDelete.size > 0 || tokenNodeGroupIdsToDelete.size > 0) {
      setTokens(prevTokens => {
        let updated = prevTokens.filter(t => !tokenNodeTokenIdsToDelete.has(t.id));
        tokenNodeGroupIdsToDelete.forEach(gId => {
          updated = updated.filter(t => t.groupId !== gId);
        });
        return updated;
      });
      if (tokenNodeGroupIdsToDelete.size > 0) {
        setGroups(prevGroups => prevGroups.filter(g => !tokenNodeGroupIdsToDelete.has(g.id)));
      }
    }

    // ── Delete auto-assigned tokens from deleted nodes ──
    if (autoAssignedTokenIdsToDelete.size > 0) {
      setTokens(prevTokens => {
        const updated = prevTokens.filter(t => !autoAssignedTokenIdsToDelete.has(t.id));

        // For each auto-assign-enabled parent being deleted, check if its group
        // is now empty and should be removed (only isAutoAssignCreated groups).
        // This covers: "delete parent → its group should be deleted if no other
        // tokens remain in it."
        autoAssignGroupIdsToCheck.forEach(gId => {
          const remainingInGroup = updated.filter(t => t.groupId === gId);
          if (remainingInGroup.length === 0) {
            setGroups(prevGroups => {
              const group = prevGroups.find(g => g.id === gId);
              if (group?.isAutoAssignCreated) {
                return prevGroups.filter(g => g.id !== gId);
              }
              return prevGroups;
            });
          }
        });

        return updated;
      });
    }

    // ��─ Delete nodes and clean up token references on surviving nodes ──
    setAllNodes((prev) => {
      let result = prev.filter(node => !nodesToDelete.has(node.id));

      // If auto-assigned tokens were deleted, clean up stale references
      // on any surviving nodes that might point to those tokens
      if (autoAssignedTokenIdsToDelete.size > 0) {
        result = result.map(node => {
          const clearAutoAssign = autoAssignedTokenIdsToDelete.has(node.autoAssignedTokenId || '');
          const oldTokenIds = node.tokenIds || [];
          const newTokenIds = oldTokenIds.filter(tid => !autoAssignedTokenIdsToDelete.has(tid));
          const tokenIdsChanged = newTokenIds.length !== oldTokenIds.length;

          let assignmentsChanged = false;
          const updatedAssignments = { ...node.tokenAssignments };
          Object.keys(updatedAssignments).forEach(themeId => {
            const orig = updatedAssignments[themeId] || [];
            const filtered = orig.filter(tid => !autoAssignedTokenIdsToDelete.has(tid));
            if (filtered.length !== orig.length) {
              assignmentsChanged = true;
              updatedAssignments[themeId] = filtered;
            }
          });

          if (!clearAutoAssign && !tokenIdsChanged && !assignmentsChanged) return node;

          return {
            ...node,
            tokenIds: newTokenIds,
            tokenAssignments: updatedAssignments,
            ...(clearAutoAssign ? { autoAssignedTokenId: undefined } : {}),
          };
        });
      }

      return result;
    });

    // Clean up advancedLogic entries for deleted nodes
    setAdvancedLogic(prev => {
      const filtered = prev.filter(l => !nodesToDelete.has(l.nodeId));
      return filtered.length === prev.length ? prev : filtered;
    });

    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }, [allNodes, groups, themes, activeThemeId]);

  const selectNodeWithChildren = useCallback((id: string) => {
    const node = allNodes.find(n => n.id === id);
    if (!node) return;

    const idsToSelect: string[] = [id];
    const findDescendants = (parentId: string) => {
      allNodes.forEach((n) => {
        if (n.parentId === parentId) {
          idsToSelect.push(n.id);
          findDescendants(n.id);
        }
      });
    };
    findDescendants(id);

    setSelectedNodeIds(idsToSelect);
    setSelectedNodeId(id);
  }, [allNodes]);

  const moveSelectedNodes = useCallback((draggedNodeId: string, deltaX: number, deltaY: number) => {
    if (selectedNodeIds.length === 0) {
      return;
    }

    setAllNodes((prev) => {
      const updated = prev.map((node) =>
        selectedNodeIds.includes(node.id)
          ? {
            ...node,
            position: {
              x: node.position.x + deltaX,
              y: node.position.y + deltaY,
            },
          }
          : node
      );
      return updated;
    });
  }, [selectedNodeIds]);

  const unlinkNode = useCallback((id: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Unlinking nodes'); return; }
    // On non-primary themes, block unlink if either node is inherited
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary && activeThemeId) {
      const node = allNodes.find(n => n.id === id);
      if (node) {
        const parentNode = node.parentId ? allNodes.find(n => n.id === node.parentId) : null;
        const isChildInherited = !node.themeOverrides || !node.themeOverrides[activeThemeId];
        const isParentInherited = parentNode && (!parentNode.themeOverrides || !parentNode.themeOverrides[activeThemeId]);
        if (isChildInherited || isParentInherited) {
          return; // Block: one or both nodes are inherited
        }
      }
    }
    setAllNodes((prev) =>
      prev.map((node) =>
        node.id === id ? { ...node, parentId: null } : node
      )
    );
  }, [themes, activeThemeId, allNodes]);

  const linkNode = useCallback((nodeId: string, newParentId: string | null) => {
    if (isSampleModeRef.current) { sampleModeToast('Linking nodes'); return; }
    setAllNodes((prev) => {
      // On non-primary themes, block link if either node is inherited
      const currentTheme = themes.find(t => t.id === activeThemeId);
      if (currentTheme && !currentTheme.isPrimary && activeThemeId && newParentId) {
        const childNode = prev.find(n => n.id === nodeId);
        const parentNode = prev.find(n => n.id === newParentId);
        if (childNode && parentNode) {
          const isChildInherited = !childNode.themeOverrides || !childNode.themeOverrides[activeThemeId];
          const isParentInherited = !parentNode.themeOverrides || !parentNode.themeOverrides[activeThemeId];
          if (isChildInherited || isParentInherited) {
            return prev; // Block: one or both nodes are inherited
          }
        }
      }

      if (newParentId) {
        const isDescendant = (checkId: string, ancestorId: string): boolean => {
          const node = prev.find((n) => n.id === checkId);
          if (!node || !node.parentId) return false;
          if (node.parentId === ancestorId) return true;
          return isDescendant(node.parentId, ancestorId);
        };

        if (isDescendant(newParentId, nodeId)) {
          return prev;
        }
      }

      const nodeToUpdate = prev.find((n) => n.id === nodeId);
      if (!nodeToUpdate) return prev;

      // ─── Special handling for palette nodes ───
      // When a palette node gets a parent, inherit the parent's color and regenerate shades
      if (nodeToUpdate.isPalette && newParentId) {
        const newParent = prev.find((n) => n.id === newParentId);
        if (newParent) {
          // Palette inherits parent's base color (hue/saturation) with zero offsets
          const paletteHue = newParent.hue;
          const paletteSaturation = newParent.saturation;
          const paletteLightness = newParent.lightness;

          // Regenerate shade nodes with new base color
          const shadeCount = nodeToUpdate.paletteShadeCount ?? 10;
          const lightnessStart = nodeToUpdate.paletteLightnessStart ?? 95;
          const lightnessEnd = nodeToUpdate.paletteLightnessEnd ?? 15;
          const curveType = nodeToUpdate.paletteCurveType || 'linear';
          const satMode = nodeToUpdate.paletteSaturationMode || 'constant';
          const satStartVal = nodeToUpdate.paletteSaturationStart ?? paletteSaturation;
          const satEndVal = nodeToUpdate.paletteSaturationEnd ?? paletteSaturation;
          const hueShiftVal = nodeToUpdate.paletteHueShift ?? 0;

          const applyCurveFn = (t: number): number => {
            if (curveType === 'custom') {
              const pts = nodeToUpdate.paletteCustomCurvePoints;
              if (pts && pts.length > 0) {
                const idx = t * (pts.length - 1);
                const lo = Math.floor(idx);
                const hi = Math.ceil(idx);
                if (lo === hi || lo >= pts.length - 1) return pts[Math.min(lo, pts.length - 1)];
                const frac = idx - lo;
                return pts[lo] + (pts[hi] - pts[lo]) * frac;
              }
              return t;
            }
            switch (curveType) {
              case 'ease-in': return t * t * t;
              case 'ease-out': return 1 - Math.pow(1 - t, 3);
              case 'ease-in-out': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
              case 'sine': return (1 - Math.cos(t * Math.PI)) / 2;
              case 'exponential':
                if (t === 0) return 0;
                if (t === 1) return 1;
                return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
              case 'material': return 0.5 - 0.5 * Math.cos(Math.pow(t, 0.85) * Math.PI);
              default: return t;
            }
          };

          const computeSatFn = (bSat: number, t: number, lightness: number): number => {
            if (satMode === 'constant') return bSat;
            if (satMode === 'manual') return Math.max(0, Math.min(100, satStartVal + (satEndVal - satStartVal) * t));
            const dev = Math.abs(lightness - 50) / 50;
            return Math.max(0, Math.min(100, bSat * (1 - dev * 0.6)));
          };

          // Get shade children sorted by position
          const shadeChildren = prev.filter(n => n.parentId === nodeToUpdate.id).sort((a, b) => a.position.y - b.position.y);

          return prev.map((node) => {
            if (node.id === nodeId) {
              // Update palette to inherit parent's color
              return {
                ...node,
                parentId: newParentId,
                hue: paletteHue,
                saturation: paletteSaturation,
                lightness: paletteLightness,
                hueOffset: 0,
                saturationOffset: 0,
                lightnessOffset: 0,
                alphaOffset: 0,
                lockHue: false,
                lockSaturation: false,
                lockLightness: false,
                lockAlpha: false,
                diffHue: false,
                diffSaturation: false,
                diffLightness: false,
                diffAlpha: false,
              };
            }
            // Update shade children
            if (node.parentId === nodeToUpdate.id) {
              const index = shadeChildren.findIndex(child => child.id === node.id);
              if (index !== -1) {
                const t = shadeCount > 1 ? index / (shadeCount - 1) : 0;
                const curved = applyCurveFn(t);
                const shadeLightness = lightnessStart + (lightnessEnd - lightnessStart) * curved;
                const shadeSaturation = computeSatFn(paletteSaturation, t, shadeLightness);
                const shadeHue = (paletteHue + hueShiftVal * t + 360) % 360;

                return {
                  ...node,
                  hue: shadeHue,
                  saturation: shadeSaturation,
                  lightness: shadeLightness,
                  hueOffset: shadeHue - paletteHue,
                  saturationOffset: shadeSaturation - paletteSaturation,
                  lightnessOffset: shadeLightness - paletteLightness,
                };
              }
            }
            return node;
          });
        }
      }

      return prev.map((node) => {
        if (node.id === nodeId) {
          const updatedNode = { ...node, parentId: newParentId };
          if (newParentId) {
            const newParent = prev.find((n) => n.id === newParentId);
            if (newParent) {
              // HSL offsets
              updatedNode.hueOffset = (nodeToUpdate.hue - newParent.hue + 360) % 360;
              if (updatedNode.hueOffset > 180) {
                updatedNode.hueOffset -= 360;
              }
              updatedNode.saturationOffset = nodeToUpdate.saturation - newParent.saturation;
              updatedNode.lightnessOffset = nodeToUpdate.lightness - newParent.lightness;
              updatedNode.alphaOffset = nodeToUpdate.alpha - newParent.alpha;

              // RGB offsets
              if (nodeToUpdate.red !== undefined && newParent.red !== undefined) {
                updatedNode.redOffset = nodeToUpdate.red - newParent.red;
              }
              if (nodeToUpdate.green !== undefined && newParent.green !== undefined) {
                updatedNode.greenOffset = nodeToUpdate.green - newParent.green;
              }
              if (nodeToUpdate.blue !== undefined && newParent.blue !== undefined) {
                updatedNode.blueOffset = nodeToUpdate.blue - newParent.blue;
              }

              // OKLCH offsets
              if (nodeToUpdate.oklchL !== undefined && newParent.oklchL !== undefined) {
                updatedNode.oklchLOffset = nodeToUpdate.oklchL - newParent.oklchL;
              }
              if (nodeToUpdate.oklchC !== undefined && newParent.oklchC !== undefined) {
                updatedNode.oklchCOffset = nodeToUpdate.oklchC - newParent.oklchC;
              }
              if (nodeToUpdate.oklchH !== undefined && newParent.oklchH !== undefined) {
                updatedNode.oklchHOffset = (nodeToUpdate.oklchH - newParent.oklchH + 360) % 360;
                if (updatedNode.oklchHOffset > 180) {
                  updatedNode.oklchHOffset -= 360;
                }
              }

              // Lock states
              updatedNode.lockHue = updatedNode.lockHue ?? false;
              updatedNode.lockSaturation = updatedNode.lockSaturation ?? false;
              updatedNode.lockLightness = updatedNode.lockLightness ?? false;
              updatedNode.lockAlpha = updatedNode.lockAlpha ?? false;
              updatedNode.lockRed = updatedNode.lockRed ?? false;
              updatedNode.lockGreen = updatedNode.lockGreen ?? false;
              updatedNode.lockBlue = updatedNode.lockBlue ?? false;
              updatedNode.lockOklchL = updatedNode.lockOklchL ?? false;
              updatedNode.lockOklchC = updatedNode.lockOklchC ?? false;
              updatedNode.lockOklchH = updatedNode.lockOklchH ?? false;

              // Diff states
              updatedNode.diffHue = updatedNode.diffHue ?? false;
              updatedNode.diffSaturation = updatedNode.diffSaturation ?? false;
              updatedNode.diffLightness = updatedNode.diffLightness ?? false;
              updatedNode.diffAlpha = updatedNode.diffAlpha ?? false;
              updatedNode.diffRed = updatedNode.diffRed ?? false;
              updatedNode.diffGreen = updatedNode.diffGreen ?? false;
              updatedNode.diffBlue = updatedNode.diffBlue ?? false;
              updatedNode.diffOklchL = updatedNode.diffOklchL ?? false;
              updatedNode.diffOklchC = updatedNode.diffOklchC ?? false;
              updatedNode.diffOklchH = updatedNode.diffOklchH ?? false;
            }
          } else {
            updatedNode.hueOffset = 0;
            updatedNode.saturationOffset = 0;
            updatedNode.lightnessOffset = 0;
            updatedNode.alphaOffset = 0;
            updatedNode.redOffset = 0;
            updatedNode.greenOffset = 0;
            updatedNode.blueOffset = 0;
            updatedNode.oklchLOffset = 0;
            updatedNode.oklchCOffset = 0;
            updatedNode.oklchHOffset = 0;
          }
          return updatedNode;
        }
        return node;
      });
    });
  }, []);


  return {
    copyNode, pasteNodes, duplicateNode, handleRestoreTokens,
    deleteNode, selectNodeWithChildren, moveSelectedNodes, unlinkNode, linkNode,
  };
}
