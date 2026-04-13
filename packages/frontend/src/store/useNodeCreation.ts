// Node creation callbacks extracted from App.tsx:
// addRootNode, addChildNode, addParentNode, addPaletteNode, addSpacingNode, addTokenNode, togglePrefixNode
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { ColorNode, DesignToken, TokenGroup } from '../types';
import {
  findTokenPrefixNode, computeTokenPath,
  getNextTokenChildSuffix, collectTokenDescendants,
  getNodeHeight, MIN_GAP,
} from '../utils/app-helpers';
import { useStore } from './index';
import { useReadOnlyState } from '../hooks/useReadOnlyState';

export function useNodeCreation() {
  const allNodes = useStore(s => s.allNodes);
  const tokens = useStore(s => s.tokens);
  const groups = useStore(s => s.groups);
  const themes = useStore(s => s.themes);
  const projects = useStore(s => s.projects);
  const canvasStates = useStore(s => s.canvasStates);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activePageId = useStore(s => s.activePageId);
  const activeThemeId = useStore(s => s.activeThemeId);
  const setAllNodes = useStore(s => s.setAllNodes);
  const setTokens = useStore(s => s.setTokens);
  const setGroups = useStore(s => s.setGroups);
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);

  // Derive sample mode from store
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

  const addRootNode = useCallback((colorSpace: 'hsl' | 'rgb' | 'oklch' | 'hct' = 'hsl') => {
    if (isSampleModeRef.current) { sampleModeToast('Creating nodes'); return; }
    // Only allow node creation in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Nodes can only be created in the primary theme. Please switch to the primary theme to add nodes.');
      return;
    }

    const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);
    const hue = Math.floor(Math.random() * 360);
    const saturation = 70;
    const lightness = 50;

    // Convert HSL to RGB for RGB nodes
    const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
      s = s / 100;
      l = l / 100;
      const k = (n: number) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n: number) =>
        l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return [
        Math.round(255 * f(0)),
        Math.round(255 * f(8)),
        Math.round(255 * f(4))
      ];
    };

    const [r, g, b] = hslToRgb(hue, saturation, lightness);

    // Get current canvas state for viewport position
    const currentCanvasState = canvasStates.find(s => s.projectId === activeProjectId) || {
      projectId: activeProjectId,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };

    // Ensure pan and zoom are always valid (defensive check)
    const safePan = currentCanvasState.pan || { x: 0, y: 0 };
    const safeZoom = currentCanvasState.zoom || 1;

    // Calculate viewport center in canvas coordinates
    // Account for the 320px tokens panel + 52px sidebar on the left
    const tokensPanelWidth = 372;
    const canvasWidth = window.innerWidth - tokensPanelWidth;
    const canvasHeight = window.innerHeight;
    const screenCenterX = tokensPanelWidth + canvasWidth / 2;
    const screenCenterY = canvasHeight / 2;

    const viewportCenterX = (screenCenterX - safePan.x) / safeZoom;
    const viewportCenterY = (screenCenterY - safePan.y) / safeZoom;

    // Find free space at viewport center with collision detection
    const findFreeSpace = (baseX: number, baseY: number): { x: number; y: number } => {
      const nodeWidth = 240;
      const nodeHeight = 280;
      const spacing = 50;

      // First, try exact center position
      let x = baseX - nodeWidth / 2; // Center horizontally
      let y = baseY - nodeHeight / 2; // Center vertically

      const checkCollision = (posX: number, posY: number): boolean => {
        return projectNodes.some(node => {
          const nodeW = node.width || 240;
          const dx = Math.abs(node.position.x - posX);
          const dy = Math.abs(node.position.y - posY);
          return dx < (nodeW + nodeWidth) / 2 + spacing && dy < nodeHeight + spacing;
        });
      };

      // If no collision at center, place it there
      if (!checkCollision(x, y)) {
        return { x, y };
      }

      // Otherwise, spiral outward from center to find free space
      let attempts = 1;
      const maxAttempts = 50;

      while (attempts < maxAttempts) {
        const angle = attempts * 0.5;
        const radius = attempts * 20;
        x = baseX - nodeWidth / 2 + Math.cos(angle) * radius;
        y = baseY - nodeHeight / 2 + Math.sin(angle) * radius;

        if (!checkCollision(x, y)) {
          return { x, y };
        }

        attempts++;
      }

      // Fallback to original position even if there's collision
      return { x: baseX - nodeWidth / 2, y: baseY - nodeHeight / 2 };
    };

    const position = findFreeSpace(viewportCenterX, viewportCenterY);

    const newNode: ColorNode = {
      id: Date.now().toString(),
      colorSpace,
      hue,
      saturation,
      lightness,
      alpha: 100,
      ...(colorSpace === 'rgb' && {
        red: r,
        green: g,
        blue: b,
        redOffset: 0,
        greenOffset: 0,
        blueOffset: 0,
      }),
      ...(colorSpace === 'oklch' && {
        oklchL: 65,
        oklchC: 50,
        oklchH: hue,
        oklchLOffset: 0,
        oklchCOffset: 0,
        oklchHOffset: 0,
      }),
      ...(colorSpace === 'hct' && {
        hctH: hue,
        hctC: 50,
        hctT: 50,
        hctHOffset: 0,
        hctCOffset: 0,
        hctTOffset: 0,
      }),
      position,
      parentId: null,
      hueOffset: 0,
      saturationOffset: 0,
      lightnessOffset: 0,
      alphaOffset: 0,
      tokenId: null,
      tokenIds: [],
      width: 240,
      projectId: activeProjectId,
      pageId: activePageId,
      lockHue: false,
      lockSaturation: false,
      lockLightness: false,
      lockAlpha: false,
      ...(colorSpace === 'rgb' && {
        lockRed: false,
        lockGreen: false,
        lockBlue: false,
        diffRed: false,
        diffGreen: false,
        diffBlue: false,
      }),
      ...(colorSpace === 'oklch' && {
        lockOklchL: false,
        lockOklchC: false,
        lockOklchH: false,
        diffOklchL: false,
        diffOklchC: false,
        diffOklchH: false,
      }),
      ...(colorSpace === 'hct' && {
        lockHctH: false,
        lockHctC: false,
        lockHctT: false,
        diffHctH: false,
        diffHctC: false,
        diffHctT: false,
      }),
      diffHue: false,
      diffSaturation: false,
      diffLightness: false,
      diffAlpha: false,
      isExpanded: false, // Default to collapsed
    };
    setAllNodes((prev) => [...prev, newNode]);

    // Select the newly created node
    setSelectedNodeId(newNode.id);
    setSelectedNodeIds([newNode.id]);
  }, [allNodes, activeProjectId, activePageId, canvasStates, tokens]);

  const addChildNode = useCallback((parentId: string, manualPosition?: { x: number; y: number }) => {
    if (isSampleModeRef.current) { sampleModeToast('Creating nodes'); return; }
    // Only allow node creation in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Nodes can only be created in the primary theme. Please switch to the primary theme to add nodes.');
      return;
    }

    const parent = allNodes.find((n) => n.id === parentId);
    if (!parent) return;

    const siblings = allNodes.filter((n) => n.parentId === parentId);

    let position: { x: number; y: number };

    // If manual position is provided, use it directly and skip auto-positioning
    if (manualPosition) {
      position = manualPosition;
    } else {
      // Auto-positioning logic (existing code)
      // Calculate initial position based on the bottommost sibling (by Y position)
      let initialX = parent.position.x + 350; // Default X offset from parent
      let initialY = parent.position.y; // Default Y starts at parent's Y

      if (siblings.length > 0) {
        // ── Detect sibling arrangement pattern ──
        // If ALL existing siblings are arranged horizontally (same Y row),
        // place the new child to the right of the rightmost sibling.
        // This requires 2+ siblings to establish a clear pattern.
        let isHorizontalArrangement = false;

        if (siblings.length >= 2) {
          const siblingYs = siblings.map(s => s.position.y);
          const minY = Math.min(...siblingYs);
          const maxY = Math.max(...siblingYs);
          const yRange = maxY - minY;

          // Siblings are "horizontal" if ALL their Y positions fall within
          // half a typical node height of each other. This is generous enough
          // for slight misalignment from manual dragging, but clearly
          // distinguishes from vertical stacking (which adds nodeHeight + gap).
          const referenceHeight = getNodeHeight(siblings[0], tokens, allNodes, activeThemeId);
          isHorizontalArrangement = yRange < referenceHeight * 0.5;
        }

        if (isHorizontalArrangement) {
          // ── Horizontal placement ──
          // Find the rightmost sibling and place new node to its right
          const rightmostSibling = siblings.reduce((right, sibling) => {
            const rightEdge = right.position.x + (right.width || 240);
            const siblingEdge = sibling.position.x + (sibling.width || 240);
            return siblingEdge > rightEdge ? sibling : right;
          });

          // Use the leftmost sibling's Y as the canonical row Y for alignment
          const leftmostSibling = siblings.reduce((left, sibling) =>
            sibling.position.x < left.position.x ? sibling : left
          );

          initialX = rightmostSibling.position.x + (rightmostSibling.width || 240) + MIN_GAP * 2;
          initialY = leftmostSibling.position.y;
        } else {
          // ── Vertical placement (default) ──
          // Use the X position of the first sibling to maintain consistent stack alignment
          initialX = siblings[0].position.x;

          // Find the bottommost sibling (highest Y + height value)
          const bottomMostSibling = siblings.reduce((bottom, sibling) => {
            const bottomY = bottom.position.y + getNodeHeight(bottom, tokens, allNodes, activeThemeId);
            const siblingY = sibling.position.y + getNodeHeight(sibling, tokens, allNodes, activeThemeId);
            return siblingY > bottomY ? sibling : bottom;
          });

          // Calculate actual height based on expanded state and token count
          const bottomSiblingHeight = getNodeHeight(bottomMostSibling, tokens, allNodes, activeThemeId);
          initialY = bottomMostSibling.position.y + bottomSiblingHeight + MIN_GAP; // Below with MIN_GAP
        }
      }

      // Collision detection - find free space if initial position overlaps
      const nodeWidth = 240;
      // Calculate the actual height of a new collapsed node with no tokens
      const newNodeTemplate: ColorNode = {
        id: 'temp',
        projectId: parent.projectId,
        pageId: parent.pageId,
        parentId: parent.id,
        colorSpace: parent.colorSpace,
        hue: 0,
        saturation: 0,
        lightness: 0,
        alpha: 100,
        red: 0,
        green: 0,
        blue: 0,
        oklchL: 0,
        oklchC: 0,
        oklchH: 0,
        position: { x: 0, y: 0 },
        isExpanded: false,
        tokenId: null,
        tokenIds: [],
        hueOffset: 0,
        saturationOffset: 0,
        lightnessOffset: 0,
        alphaOffset: 0,
        lockHue: false,
        lockSaturation: false,
        lockLightness: false,
        lockAlpha: false,
        lockRed: false,
        lockGreen: false,
        lockBlue: false,
        lockOklchL: false,
        lockOklchC: false,
        lockOklchH: false,
        diffHue: false,
        diffSaturation: false,
        diffLightness: false,
        diffAlpha: false,
        diffRed: false,
        diffGreen: false,
        diffBlue: false,
        diffOklchL: false,
        diffOklchC: false,
        diffOklchH: false,
        ...(parent.isTokenNode && { isTokenNode: true }),
      };
      const nodeHeight = getNodeHeight(newNodeTemplate, tokens, allNodes, activeThemeId);

      const checkCollision = (x: number, y: number) => {
        return allNodes.some(node => {
          if (node.projectId !== parent.projectId) return false;
          if (node.pageId !== parent.pageId) return false;

          const existingWidth = node.width || 240;
          const existingHeight = getNodeHeight(node, tokens, allNodes, activeThemeId);

          const horizontalOverlap = !(x + nodeWidth + MIN_GAP <= node.position.x ||
            node.position.x + existingWidth + MIN_GAP <= x);
          const verticalOverlap = !(y + nodeHeight + MIN_GAP <= node.position.y ||
            node.position.y + existingHeight + MIN_GAP <= y);

          return horizontalOverlap && verticalOverlap;
        });
      };

      const findFreeSpace = (baseX: number, baseY: number) => {
        let x = baseX;
        let y = baseY;

        // If initial position is free, use it
        if (!checkCollision(x, y)) {
          return { x, y };
        }

        // Search downward first (most natural placement), then try columns to the right
        const maxAttempts = 50;
        for (let attempt = 1; attempt < maxAttempts; attempt++) {
          // Try directly below in increments
          y = baseY + attempt * (nodeHeight + MIN_GAP);
          if (!checkCollision(x, y)) {
            return { x, y };
          }
        }

        // If downward is fully blocked, try one column to the right
        x = baseX + nodeWidth + MIN_GAP;
        y = baseY;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (!checkCollision(x, y)) {
            return { x, y };
          }
          y = baseY + (attempt + 1) * (nodeHeight + MIN_GAP);
        }

        // Fallback to original position even if there's collision
        return { x: baseX, y: baseY };
      };

      position = findFreeSpace(initialX, initialY);
    }

    // Auto-adjust siblings if the new child would overlap with them
    const adjustSiblings = (newChildPos: { x: number; y: number }, siblingNodes: ColorNode[], newChild: ColorNode) => {
      if (siblingNodes.length === 0) return siblingNodes;

      const newChildHeight = getNodeHeight(newChild, tokens, allNodes, activeThemeId); // Calculate height for new child
      const newChildBottom = newChildPos.y + newChildHeight;

      // Check if any siblings need to be pushed down
      return siblingNodes.map(sibling => {
        const siblingHeight = getNodeHeight(sibling, tokens, allNodes, activeThemeId);
        const siblingBottom = sibling.position.y + siblingHeight;

        // Check if there's vertical overlap (assuming same X position for siblings)
        if (Math.abs(sibling.position.x - newChildPos.x) < 100) { // Same column
          if (sibling.position.y < newChildBottom && siblingBottom > newChildPos.y) {
            // Push sibling down
            return {
              ...sibling,
              position: {
                ...sibling.position,
                y: newChildBottom + MIN_GAP
              }
            };
          }
        }

        return sibling;
      });
    };

    const newNode: ColorNode = {
      id: Date.now().toString(),
      colorSpace: parent.colorSpace,
      hue: parent.hue,
      saturation: parent.saturation,
      lightness: parent.lightness,
      alpha: parent.alpha,
      // Calculate hexValue based on color space
      hexValue: parent.colorSpace === 'hex'
        ? undefined // Will inherit dynamically from parent
        : undefined, // Other color spaces don't need hexValue pre-calculated
      ...(parent.colorSpace === 'rgb' && {
        red: parent.red,
        green: parent.green,
        blue: parent.blue,
        redOffset: 0,
        greenOffset: 0,
        blueOffset: 0,
      }),
      ...(parent.colorSpace === 'oklch' && {
        oklchL: parent.oklchL,
        oklchC: parent.oklchC,
        oklchH: parent.oklchH,
        oklchLOffset: 0,
        oklchCOffset: 0,
        oklchHOffset: 0,
      }),
      ...(parent.colorSpace === 'hct' && {
        hctH: parent.hctH,
        hctC: parent.hctC,
        hctT: parent.hctT,
        hctHOffset: 0,
        hctCOffset: 0,
        hctTOffset: 0,
      }),
      ...(parent.colorSpace === 'hex' && {
        hexLocked: false, // Child inherits from parent by default
        hexValue: undefined, // Will inherit dynamically from parent
      }),
      position,
      parentId: parentId,
      hueOffset: 0,
      saturationOffset: 0,
      lightnessOffset: 0,
      alphaOffset: 0,
      tokenId: null,
      tokenIds: [],
      width: 240,
      projectId: parent.projectId,
      pageId: parent.pageId,
      lockHue: false,
      lockSaturation: false,
      lockLightness: false,
      lockAlpha: false,
      ...(parent.colorSpace === 'rgb' && {
        lockRed: false,
        lockGreen: false,
        lockBlue: false,
        diffRed: false,
        diffGreen: false,
        diffBlue: false,
      }),
      ...(parent.colorSpace === 'oklch' && {
        lockOklchL: false,
        lockOklchC: false,
        lockOklchH: false,
        diffOklchL: false,
        diffOklchC: false,
        diffOklchH: false,
      }),
      ...(parent.colorSpace === 'hct' && {
        lockHctH: false,
        lockHctC: false,
        lockHctT: false,
        diffHctH: false,
        diffHctC: false,
        diffHctT: false,
      }),
      diffHue: false,
      diffSaturation: false,
      diffLightness: false,
      diffAlpha: false,
      isExpanded: false, // Default to collapsed
      // Propagate isTokenNode from parent so token node families stay as token nodes
      ...(parent.isTokenNode && (() => {
        const suffix = getNextTokenChildSuffix(parentId, allNodes);
        // We'll compute the full token name after creating the node
        return {
          isTokenNode: true,
          tokenNodeSuffix: suffix,
          referenceName: suffix, // Temporary — will be updated to full path
          referenceNameLocked: true,
        };
      })()),
    };

    // If parent is a token node, auto-create a token and assign it
    if (parent.isTokenNode) {
      // Find the ROOT prefix node to get group info (always walk up to root, even if parent is a mid-tree prefix)
      const prefixNode = findTokenPrefixNode(parent, allNodes);
      if (prefixNode) {
        // Compute the full token path for this new child
        // We need to build it manually since the node isn't in allNodes yet
        // This handles mid-tree prefixes by continuing the walk past them
        const buildPath = (node: ColorNode, nodes: ColorNode[]): string => {
          const parts: string[] = [];
          let current: ColorNode | undefined = node;
          while (current) {
            if (current.isTokenPrefix) {
              const p = current.parentId ? nodes.find(n => n.id === current!.parentId) : null;
              if (!p || !p.isTokenNode) {
                parts.unshift(current.referenceName || 'color');
                break;
              } else {
                parts.unshift(current.tokenNodeSuffix || '1');
              }
            } else {
              parts.unshift(current.tokenNodeSuffix || '1');
            }
            current = current.parentId ? nodes.find(n => n.id === current!.parentId) : undefined;
          }
          return parts.join('-');
        };
        // Build path for the new node (not yet in allNodes, so we simulate)
        const parentPath = parent.isTokenPrefix
          ? (parent.referenceName || 'color')
          : buildPath(parent, allNodes);
        const childSuffix = newNode.tokenNodeSuffix || '1';
        let fullTokenName = `${parentPath}-${childSuffix}`;

        // Validate token name uniqueness across ALL pages — add "-copy" suffix if name already taken
        const existingTokenNamesForChild = new Set(
          tokens
            .filter(t => t.projectId === activeProjectId)
            .map(t => t.name.toLowerCase())
        );
        if (existingTokenNamesForChild.has(fullTokenName.toLowerCase())) {
          const copyBase = fullTokenName + '-copy';
          if (!existingTokenNamesForChild.has(copyBase.toLowerCase())) {
            fullTokenName = copyBase;
          } else {
            fullTokenName = copyBase;
            for (let i = 1; i <= 999; i++) {
              const candidate = `${copyBase}-${i}`;
              if (!existingTokenNamesForChild.has(candidate.toLowerCase())) {
                fullTokenName = candidate;
                break;
              }
            }
          }
          // Keep tokenNodeSuffix in sync with the "-copy" addition
          const extra = fullTokenName.slice(`${parentPath}-${childSuffix}`.length);
          newNode.tokenNodeSuffix = childSuffix + extra;
        }

        // Update the node's referenceName to the full path
        newNode.referenceName = fullTokenName;

        // Find the group from the prefix node
        const groupId = prefixNode.tokenGroupId;
        if (groupId) {
          // Create the token
          // Token node tokens start empty — values are populated when a value token is assigned
          const projectThemes = themes.filter(t => t.projectId === activeProjectId);
          const tokenThemeValues: { [themeId: string]: any } = {};
          projectThemes.forEach(theme => {
            tokenThemeValues[theme.id] = {};
          });

          const newTokenId = `${newNode.id}-token`;
          const newToken: DesignToken = {
            id: newTokenId,
            name: fullTokenName,
            type: 'color',
            groupId: groupId,
            projectId: activeProjectId,
            pageId: parent.pageId,
            themeValues: tokenThemeValues,
            createdAt: Date.now(),
          };

          // Store the own token reference (not in tokenIds — token nodes ARE tokens, not assigned)
          newNode.ownTokenId = newTokenId;
          newNode.tokenIds = [];
          newNode.tokenAssignments = {};

          // Add the token to state (compute sortOrder from existing group tokens)
          setTokens(prev => {
            const groupTokens = prev.filter(t => t.groupId === groupId);
            const maxSortOrder = groupTokens.reduce((max, t) => Math.max(max, t.sortOrder ?? -1), -1);
            return [...prev, { ...newToken, sortOrder: maxSortOrder + 1 }];
          });
        }
      }
    }

    setAllNodes((prev) => {
      // Only adjust siblings if NOT using manual position
      if (manualPosition) {
        // Manual position - just add the node, no sibling adjustment
        return [...prev, newNode];
      } else {
        // Auto-position - adjust siblings if needed
        const adjustedSiblings = adjustSiblings(position, siblings, newNode);

        // Update positions of adjusted siblings
        const updatedNodes = prev.map(node => {
          const adjustedSibling = adjustedSiblings.find(s => s.id === node.id);
          return adjustedSibling || node;
        });

        // Add the new child node
        return [...updatedNodes, newNode];
      }
    });

    // Select the newly created child node
    setSelectedNodeId(newNode.id);
    setSelectedNodeIds([newNode.id]);
  }, [allNodes, tokens, activeProjectId, activeThemeId, themes]);

  const addParentNode = useCallback((nodeId: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Creating nodes'); return; }
    // Only allow node creation in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Nodes can only be created in the primary theme. Please switch to the primary theme to add nodes.');
      return;
    }

    const node = allNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);

    // Position new parent to the left of the current node
    const offsetX = -300; // 300px to the left
    const baseX = node.position.x + offsetX;
    const baseY = node.position.y;

    // Find free space to the left with collision detection
    const findFreeSpace = (baseX: number, baseY: number): { x: number; y: number } => {
      const nodeWidth = 240;
      const nodeHeight = 280;
      const spacing = 50;

      let x = baseX;
      let y = baseY;

      const checkCollision = (posX: number, posY: number): boolean => {
        return projectNodes.some(pNode => {
          const nodeW = pNode.width || 240;
          const dx = Math.abs(pNode.position.x - posX);
          const dy = Math.abs(pNode.position.y - posY);
          return dx < (nodeW + nodeWidth) / 2 + spacing && dy < nodeHeight + spacing;
        });
      };

      // If no collision at left position, place it there
      if (!checkCollision(x, y)) {
        return { x, y };
      }

      // Otherwise, spiral outward to find free space
      let attempts = 1;
      const maxAttempts = 50;

      while (attempts < maxAttempts) {
        const angle = attempts * 0.5;
        const radius = attempts * 20;
        x = baseX + Math.cos(angle) * radius;
        y = baseY + Math.sin(angle) * radius;

        if (!checkCollision(x, y)) {
          return { x, y };
        }

        attempts++;
      }

      // Fallback to original position even if there's collision
      return { x: baseX, y: baseY };
    };

    const position = findFreeSpace(baseX, baseY);

    // Create new parent with same color values as current node
    const newNode: ColorNode = {
      id: Date.now().toString(),
      colorSpace: node.colorSpace,
      hue: node.hue,
      saturation: node.saturation,
      lightness: node.lightness,
      alpha: node.alpha,
      hexValue: node.hexValue,
      ...(node.colorSpace === 'rgb' && {
        red: node.red,
        green: node.green,
        blue: node.blue,
        redOffset: 0,
        greenOffset: 0,
        blueOffset: 0,
      }),
      ...(node.colorSpace === 'oklch' && {
        oklchL: node.oklchL,
        oklchC: node.oklchC,
        oklchH: node.oklchH,
        oklchLOffset: 0,
        oklchCOffset: 0,
        oklchHOffset: 0,
      }),
      ...(node.colorSpace === 'hct' && {
        hctH: node.hctH,
        hctC: node.hctC,
        hctT: node.hctT,
        hctHOffset: 0,
        hctCOffset: 0,
        hctTOffset: 0,
      }),
      ...(node.colorSpace === 'hex' && {
        hexLocked: node.hexLocked,
        hexValue: node.hexValue,
      }),
      position,
      parentId: null,
      hueOffset: 0,
      saturationOffset: 0,
      lightnessOffset: 0,
      alphaOffset: 0,
      tokenId: null,
      tokenIds: [],
      width: 240,
      projectId: node.projectId,
      pageId: node.pageId,
      lockHue: false,
      lockSaturation: false,
      lockLightness: false,
      lockAlpha: false,
      ...(node.colorSpace === 'rgb' && {
        lockRed: false,
        lockGreen: false,
        lockBlue: false,
        diffRed: false,
        diffGreen: false,
        diffBlue: false,
      }),
      ...(node.colorSpace === 'oklch' && {
        lockOklchL: false,
        lockOklchC: false,
        lockOklchH: false,
        diffOklchL: false,
        diffOklchC: false,
        diffOklchH: false,
      }),
      ...(node.colorSpace === 'hct' && {
        lockHctH: false,
        lockHctC: false,
        lockHctT: false,
        diffHctH: false,
        diffHctC: false,
        diffHctT: false,
      }),
      diffHue: false,
      diffSaturation: false,
      diffLightness: false,
      diffAlpha: false,
      isExpanded: false,
      // Propagate isTokenNode from child so token node families stay as token nodes
      ...(node.isTokenNode && {
        isTokenNode: true,
        isTokenPrefix: true,
        referenceName: 'prefix',
        referenceNameLocked: true,
        tokenGroupId: (() => {
          const existingPrefix = findTokenPrefixNode(node, allNodes);
          return existingPrefix?.tokenGroupId || undefined;
        })(),
      }),
    };

    // If adding a parent to a token node and no existing prefix group, create one
    if (node.isTokenNode && newNode.isTokenPrefix && !newNode.tokenGroupId) {
      const groupId = `${newNode.id}-group`;
      newNode.tokenGroupId = groupId;
      const newGroup: TokenGroup = {
        id: groupId,
        name: 'prefix',
        projectId: node.projectId,
        pageId: node.pageId,
        isExpanded: true,
        isTokenNodeGroup: true,
        createdAt: Date.now(),
      };
      setGroups(prev => [...prev, newGroup]);
    }

    setAllNodes((prev) => {
      // Add the new parent node and connect the current node to it
      return prev.map(n => {
        if (n.id === nodeId) {
          // Update current node to be connected to the new parent
          return { ...n, parentId: newNode.id };
        }
        return n;
      }).concat(newNode);
    });

    // Select the newly created parent node
    setSelectedNodeId(newNode.id);
    setSelectedNodeIds([newNode.id]);
  }, [allNodes, activeProjectId, activeThemeId, themes]);

  const addPaletteNode = useCallback(() => {
    if (isSampleModeRef.current) { sampleModeToast('Creating nodes'); return; }
    // Only allow palette creation in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Palettes can only be created in the primary theme. Please switch to the primary theme to add palettes.');
      return;
    }

    const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);
    const hue = 214; // Default blue hue
    const saturation = 100;
    const lightness = 50;

    // Get current canvas state for viewport position
    const currentCanvasState = canvasStates.find(s => s.projectId === activeProjectId) || {
      projectId: activeProjectId,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };

    // Calculate viewport center in canvas coordinates
    const tokensPanelWidth = 372; // 320px panel + 52px sidebar
    const canvasWidth = window.innerWidth - tokensPanelWidth;
    const canvasHeight = window.innerHeight;
    const screenCenterX = tokensPanelWidth + canvasWidth / 2;
    const screenCenterY = canvasHeight / 2;

    const viewportCenterX = (screenCenterX - currentCanvasState.pan.x) / currentCanvasState.zoom;
    const viewportCenterY = (screenCenterY - currentCanvasState.pan.y) / currentCanvasState.zoom;

    // Find free space for palette node
    const findFreeSpace = (baseX: number, baseY: number): { x: number; y: number } => {
      const nodeWidth = 240; // Same as regular nodes
      const nodeHeight = 600; // Approximate palette node height
      const spacing = 50;

      let x = baseX - nodeWidth / 2;
      let y = baseY - nodeHeight / 2;

      const checkCollision = (posX: number, posY: number): boolean => {
        return projectNodes.some(node => {
          const nodeW = node.width || 240;
          const dx = Math.abs(node.position.x - posX);
          const dy = Math.abs(node.position.y - posY);
          return dx < (nodeW + nodeWidth) / 2 + spacing && dy < nodeHeight + spacing;
        });
      };

      if (!checkCollision(x, y)) {
        return { x, y };
      }

      // Spiral outward to find free space
      let attempts = 1;
      const maxAttempts = 50;

      while (attempts < maxAttempts) {
        const angle = attempts * 0.5;
        const radius = attempts * 20;
        x = baseX - nodeWidth / 2 + Math.cos(angle) * radius;
        y = baseY - nodeHeight / 2 + Math.sin(angle) * radius;

        if (!checkCollision(x, y)) {
          return { x, y };
        }

        attempts++;
      }

      return { x: baseX - nodeWidth / 2, y: baseY - nodeHeight / 2 };
    };

    const position = findFreeSpace(viewportCenterX, viewportCenterY);

    const paletteNode: ColorNode = {
      id: Date.now().toString(),
      colorSpace: 'hsl',
      hue,
      saturation,
      lightness,
      alpha: 100,
      position,
      parentId: null,
      hueOffset: 0,
      saturationOffset: 0,
      lightnessOffset: 0,
      alphaOffset: 0,
      tokenId: null,
      tokenIds: [],
      width: 300,
      projectId: activeProjectId,
      pageId: activePageId,
      lockHue: false,
      lockSaturation: false,
      lockLightness: false,
      lockAlpha: false,
      diffHue: false,
      diffSaturation: false,
      diffLightness: false,
      diffAlpha: false,
      isExpanded: true,
      isPalette: true,
      paletteName: 'scienceblue',
      paletteColorFormat: 'HEX',
      paletteLightnessMode: 'linear',
      paletteLightnessStart: 95,
      paletteLightnessEnd: 15,
      paletteNamingPattern: '1-9',
      paletteShadeCount: 10,
      paletteCurveType: 'linear',
      paletteSaturationMode: 'constant',
      paletteHueShift: 0,
      paletteExpandedSections: {
        name: true,
        color: true,
        distribution: false,
        lightnessScale: true,
        saturation: false,
        hueShift: false,
        pattern: false,
        preview: true,
      },
    };

    // Create shade nodes
    const shadeCount = 10;
    const lightnessStart = 95;
    const lightnessEnd = 15;
    const shadeNodes: ColorNode[] = [];

    // Calculate shade node height for proper spacing
    // Palette shade nodes use compact 44px cards
    const shadeNodeHeight = 48; // 44px card + 4px padding
    const SHADE_GAP = 2; // Minimal gap between shade nodes
    const shadeStride = shadeNodeHeight + SHADE_GAP;

    // Calculate shade column base position
    let shadeBaseX = position.x + 450;
    let shadeBaseY = position.y;

    // Collision detection for the entire shade column against existing nodes
    const shadeColumnWidth = 240;
    const shadeColumnTotalHeight = shadeCount * shadeStride;

    const checkShadeColumnCollision = (baseX: number, baseY: number): boolean => {
      return projectNodes.some(node => {
        const nodeW = node.width || 240;
        const nodeH = getNodeHeight(node, tokens, allNodes, activeThemeId);

        // Check if the shade column rectangle overlaps with this node
        const colLeft = baseX;
        const colRight = baseX + shadeColumnWidth;
        const colTop = baseY;
        const colBottom = baseY + shadeColumnTotalHeight;

        const nodeLeft = node.position.x;
        const nodeRight = node.position.x + nodeW;
        const nodeTop = node.position.y;
        const nodeBottom = node.position.y + nodeH;

        const horizontalOverlap = !(colRight + MIN_GAP <= nodeLeft || nodeRight + MIN_GAP <= colLeft);
        const verticalOverlap = !(colBottom + MIN_GAP <= nodeTop || nodeBottom + MIN_GAP <= colTop);

        return horizontalOverlap && verticalOverlap;
      });
    };

    // Find free space for shade column if initial position collides
    if (checkShadeColumnCollision(shadeBaseX, shadeBaseY)) {
      // Try shifting down first
      let found = false;
      for (let attempt = 1; attempt < 30; attempt++) {
        const testY = shadeBaseY + attempt * (shadeNodeHeight + MIN_GAP);
        if (!checkShadeColumnCollision(shadeBaseX, testY)) {
          shadeBaseY = testY;
          found = true;
          break;
        }
      }
      // If not found, try shifting right
      if (!found) {
        for (let attempt = 1; attempt < 10; attempt++) {
          const testX = shadeBaseX + attempt * (shadeColumnWidth + MIN_GAP);
          if (!checkShadeColumnCollision(testX, shadeBaseY)) {
            shadeBaseX = testX;
            break;
          }
        }
      }
    }

    for (let i = 0; i < shadeCount; i++) {
      const t = i / (shadeCount - 1);
      const shadeLightness = lightnessStart + (lightnessEnd - lightnessStart) * t;

      const shadeNode: ColorNode = {
        id: `${Date.now()}-shade-${i}`,
        colorSpace: 'hsl',
        hue,
        saturation,
        lightness: shadeLightness,
        alpha: 100,
        position: {
          x: shadeBaseX,
          y: shadeBaseY + i * shadeStride, // Stack vertically with small gap
        },
        parentId: paletteNode.id,
        hueOffset: 0,
        saturationOffset: 0,
        lightnessOffset: shadeLightness - lightness,
        alphaOffset: 0,
        tokenId: null,
        tokenIds: [],
        width: 240,
        projectId: activeProjectId,
        pageId: activePageId,
        lockHue: false,
        lockSaturation: false,
        lockLightness: false,
        lockAlpha: false,
        diffHue: false,
        diffSaturation: false,
        diffLightness: false,
        diffAlpha: false,
        isExpanded: false,
      };

      shadeNodes.push(shadeNode);
    }

    setAllNodes((prev) => [...prev, paletteNode, ...shadeNodes]);

    // Ensure "Color Palette" group exists
    const colorPaletteGroupId = `color-palette-${activeProjectId}`;
    const colorPaletteGroup = groups.find(g => g.id === colorPaletteGroupId);

    if (!colorPaletteGroup) {
      const newGroup: TokenGroup = {
        id: colorPaletteGroupId,
        name: 'Color Palette',
        projectId: activeProjectId,
        pageId: activePageId,
        isExpanded: true,
        isColorPaletteGroup: true,
      };
      setGroups(prev => [...prev, newGroup]);
    }

    // Create tokens for each shade
    const paletteTokens: DesignToken[] = [];
    const paletteName = paletteNode.paletteName || 'palette';
    const namingPattern = paletteNode.paletteNamingPattern || '1-9';
    const paletteEntryId = `palette-entry-${paletteNode.id}`;

    shadeNodes.forEach((shadeNode, index) => {
      // Generate token name based on naming pattern
      let shadeName = '';
      switch (namingPattern) {
        case '1-9':
          shadeName = (index + 1).toString();
          break;
        case '10-90':
          shadeName = ((index + 1) * 10).toString();
          break;
        case '100-900':
          shadeName = ((index + 1) * 100).toString();
          break;
        case 'a-z':
          shadeName = String.fromCharCode(97 + index);
          break;
        default:
          shadeName = (index + 1).toString();
      }

      const tokenName = `${paletteName}/${shadeName}`;
      const token: DesignToken = {
        id: `${Date.now()}-token-${index}`,
        name: tokenName,
        type: 'color',
        groupId: paletteEntryId,
        projectId: activeProjectId,
        pageId: activePageId,
        hue: shadeNode.hue,
        saturation: shadeNode.saturation,
        lightness: shadeNode.lightness,
        alpha: shadeNode.alpha,
        themeValues: (() => {
          if (!activeThemeId) return undefined;
          const tv: { [themeId: string]: { hue: number; saturation: number; lightness: number; alpha: number } } = {};
          // Initialize themeValues for ALL themes in the project with the same values
          const projectThemes = themes.filter(t => t.projectId === activeProjectId);
          projectThemes.forEach(theme => {
            tv[theme.id] = {
              hue: shadeNode.hue,
              saturation: shadeNode.saturation,
              lightness: shadeNode.lightness,
              alpha: shadeNode.alpha,
            };
          });
          return tv;
        })(),
      };

      paletteTokens.push(token);

      // Assign token to shade node
      shadeNode.tokenIds = [token.id];
    });

    // Assign ascending sortOrder to palette tokens (shade index order)
    const sortedPaletteTokens = paletteTokens.map((t, i) => ({ ...t, sortOrder: i }));
    setTokens(prev => [...prev, ...sortedPaletteTokens]);

    // Create a palette entry in the Color Palette group
    const paletteEntry: TokenGroup = {
      id: paletteEntryId,
      name: paletteName,
      projectId: activeProjectId,
      pageId: activePageId,
      isExpanded: false,
      isPaletteEntry: true,
      paletteNodeId: paletteNode.id,
      createdAt: Date.now(),
    };
    setGroups(prev => {
      const existingPalettes = prev.filter(g => g.isPaletteEntry === true && g.projectId === activeProjectId && g.pageId === activePageId);
      const maxSortOrder = existingPalettes.reduce((max, g) => Math.max(max, g.sortOrder ?? -1), -1);
      return [...prev, { ...paletteEntry, sortOrder: maxSortOrder + 1 }];
    });

    // Select the palette node
    setSelectedNodeId(paletteNode.id);
    setSelectedNodeIds([paletteNode.id]);
  }, [allNodes, activeProjectId, activePageId, canvasStates, groups, tokens, activeThemeId, themes]);

  const addSpacingNode = useCallback(() => {
    if (isSampleModeRef.current) { sampleModeToast('Creating nodes'); return; }
    // Only allow spacing node creation in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Spacing nodes can only be created in the primary theme. Please switch to the primary theme to add spacing nodes.');
      return;
    }

    const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);

    // Get current canvas state for viewport position
    const currentCanvasState = canvasStates.find(s => s.projectId === activeProjectId) || {
      projectId: activeProjectId,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };

    // Calculate viewport center in canvas coordinates
    const tokensPanelWidth = 372;
    const canvasWidth = window.innerWidth - tokensPanelWidth;
    const canvasHeight = window.innerHeight;
    const screenCenterX = tokensPanelWidth + canvasWidth / 2;
    const screenCenterY = canvasHeight / 2;

    const viewportCenterX = (screenCenterX - currentCanvasState.pan.x) / currentCanvasState.zoom;
    const viewportCenterY = (screenCenterY - currentCanvasState.pan.y) / currentCanvasState.zoom;

    // Find free space for spacing node
    const findFreeSpace = (baseX: number, baseY: number): { x: number; y: number } => {
      const nodeWidth = 240;
      const nodeHeight = 400;
      const spacing = 50;

      let x = baseX - nodeWidth / 2;
      let y = baseY - nodeHeight / 2;

      const checkCollision = (posX: number, posY: number): boolean => {
        return projectNodes.some(node => {
          const nodeW = node.width || 240;
          const dx = Math.abs(node.position.x - posX);
          const dy = Math.abs(node.position.y - posY);
          return dx < (nodeW + nodeWidth) / 2 + spacing && dy < nodeHeight + spacing;
        });
      };

      if (!checkCollision(x, y)) {
        return { x, y };
      }

      // Spiral outward to find free space
      let attempts = 1;
      const maxAttempts = 50;

      while (attempts < maxAttempts) {
        const angle = attempts * 0.5;
        const radius = attempts * 20;
        x = baseX - nodeWidth / 2 + Math.cos(angle) * radius;
        y = baseY - nodeHeight / 2 + Math.sin(angle) * radius;

        if (!checkCollision(x, y)) {
          return { x, y };
        }

        attempts++;
      }

      return { x: baseX - nodeWidth / 2, y: baseY - nodeHeight / 2 };
    };

    const position = findFreeSpace(viewportCenterX, viewportCenterY);

    const spacingNode: ColorNode = {
      id: Date.now().toString(),
      colorSpace: 'hsl',
      hue: 0,
      saturation: 0,
      lightness: 0,
      alpha: 100,
      position,
      parentId: null,
      hueOffset: 0,
      saturationOffset: 0,
      lightnessOffset: 0,
      alphaOffset: 0,
      tokenId: null,
      tokenIds: [],
      width: 240,
      projectId: activeProjectId,
      pageId: activePageId,
      lockHue: false,
      lockSaturation: false,
      lockLightness: false,
      lockAlpha: false,
      diffHue: false,
      diffSaturation: false,
      diffLightness: false,
      diffAlpha: false,
      isExpanded: false,
      isSpacing: true,
      spacingValue: 16,
      spacingUnit: 'px',
      spacingName: 'spacing',
    };

    setAllNodes((prev) => [...prev, spacingNode]);

    setSelectedNodeId(spacingNode.id);
    setSelectedNodeIds([spacingNode.id]);
  }, [allNodes, activeProjectId, activePageId, canvasStates, activeThemeId, themes]);

  const addTokenNode = useCallback(() => {
    if (isSampleModeRef.current) { sampleModeToast('Creating nodes'); return; }
    // Only allow token node creation in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Token nodes can only be created in the primary theme. Please switch to the primary theme to add token nodes.');
      return;
    }

    const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);

    // Get current canvas state for viewport position
    const currentCanvasState = canvasStates.find(s => s.projectId === activeProjectId) || {
      projectId: activeProjectId,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };

    const safePan = currentCanvasState.pan || { x: 0, y: 0 };
    const safeZoom = currentCanvasState.zoom || 1;

    const tokensPanelWidth = 372;
    const canvasWidth = window.innerWidth - tokensPanelWidth;
    const canvasHeight = window.innerHeight;
    const screenCenterX = tokensPanelWidth + canvasWidth / 2;
    const screenCenterY = canvasHeight / 2;

    const viewportCenterX = (screenCenterX - safePan.x) / safeZoom;
    const viewportCenterY = (screenCenterY - safePan.y) / safeZoom;

    const findFreeSpace = (baseX: number, baseY: number, existingNodes: ColorNode[]): { x: number; y: number } => {
      const nodeWidth = 240;
      const nodeHeight = 180;
      const spacing = 50;

      let x = baseX - nodeWidth / 2;
      let y = baseY - nodeHeight / 2;

      const checkCollision = (posX: number, posY: number): boolean => {
        return existingNodes.some(node => {
          const nodeW = node.width || 240;
          const dx = Math.abs(node.position.x - posX);
          const dy = Math.abs(node.position.y - posY);
          return dx < (nodeW + nodeWidth) / 2 + spacing && dy < nodeHeight + spacing;
        });
      };

      if (!checkCollision(x, y)) {
        return { x, y };
      }

      let attempts = 1;
      const maxAttempts = 50;

      while (attempts < maxAttempts) {
        const angle = attempts * 0.5;
        const radius = attempts * 20;
        x = baseX - nodeWidth / 2 + Math.cos(angle) * radius;
        y = baseY - nodeHeight / 2 + Math.sin(angle) * radius;

        if (!checkCollision(x, y)) {
          return { x, y };
        }

        attempts++;
      }

      return { x: baseX - nodeWidth / 2, y: baseY - nodeHeight / 2 };
    };

    // ── Create Prefix (Parent) Node ──
    const prefixPosition = findFreeSpace(viewportCenterX, viewportCenterY, projectNodes);
    const prefixId = Date.now().toString();

    // Compute a unique prefix name: "color", "color-1", "color-2", …
    const basePrefix = 'color';
    // Check across ALL pages in the project — token names must be unique project-wide
    const existingPrefixNames = new Set(
      allNodes
        .filter(n => n.isTokenPrefix && n.projectId === activeProjectId)
        .map(n => (n.referenceName || '').toLowerCase())
    );
    const existingGroupNames = new Set(
      groups
        .filter(g => g.projectId === activeProjectId && g.isTokenNodeGroup)
        .map(g => g.name.toLowerCase())
    );
    let defaultPrefix = basePrefix;
    if (existingPrefixNames.has(basePrefix.toLowerCase()) || existingGroupNames.has(basePrefix.toLowerCase())) {
      for (let i = 1; i <= 999; i++) {
        const candidate = `${basePrefix}-${i}`;
        if (!existingPrefixNames.has(candidate.toLowerCase()) && !existingGroupNames.has(candidate.toLowerCase())) {
          defaultPrefix = candidate;
          break;
        }
      }
    }

    // Create token group for this prefix
    const groupId = `${prefixId}-group`;
    const newGroup: TokenGroup = {
      id: groupId,
      name: defaultPrefix,
      projectId: activeProjectId,
      pageId: activePageId,
      isExpanded: true,
      isTokenNodeGroup: true,
      createdAt: Date.now(),
    };

    const prefixNode: ColorNode = {
      id: prefixId,
      colorSpace: 'hsl',
      hue: 0,
      saturation: 0,
      lightness: 0,
      alpha: 100,
      position: prefixPosition,
      parentId: null,
      hueOffset: 0,
      saturationOffset: 0,
      lightnessOffset: 0,
      alphaOffset: 0,
      tokenId: null,
      tokenIds: [],
      width: 240,
      projectId: activeProjectId,
      pageId: activePageId,
      lockHue: false,
      lockSaturation: false,
      lockLightness: false,
      lockAlpha: false,
      diffHue: false,
      diffSaturation: false,
      diffLightness: false,
      diffAlpha: false,
      isExpanded: false,
      isTokenNode: true,
      isTokenPrefix: true,
      referenceName: defaultPrefix,
      referenceNameLocked: true,
      tokenGroupId: groupId,
    };

    // ── Create Child Node ──
    const childSuffix = '1';
    const childId = (Date.now() + 1).toString();
    let childTokenName = `${defaultPrefix}-${childSuffix}`;

    // Validate token name uniqueness across ALL pages — add "-copy" suffix if name already taken
    const existingPanelTokenNames = new Set(
      tokens
        .filter(t => t.projectId === activeProjectId)
        .map(t => t.name.toLowerCase())
    );
    let finalChildSuffix = childSuffix;
    if (existingPanelTokenNames.has(childTokenName.toLowerCase())) {
      const copyBase = childTokenName + '-copy';
      if (!existingPanelTokenNames.has(copyBase.toLowerCase())) {
        childTokenName = copyBase;
      } else {
        childTokenName = copyBase;
        for (let i = 1; i <= 999; i++) {
          const candidate = `${copyBase}-${i}`;
          if (!existingPanelTokenNames.has(candidate.toLowerCase())) {
            childTokenName = candidate;
            break;
          }
        }
      }
      // Keep suffix in sync
      const extra = childTokenName.slice(`${defaultPrefix}-${childSuffix}`.length);
      finalChildSuffix = childSuffix + extra;
    }

    // Position child below the prefix
    const childPosition = {
      x: prefixPosition.x + 280,
      y: prefixPosition.y,
    };

    // Create the token for the child
    const projectThemes = themes.filter(t => t.projectId === activeProjectId);
    // Token node tokens start empty — values are populated when a value token is assigned
    const childTokenThemeValues: { [themeId: string]: any } = {};
    projectThemes.forEach(theme => {
      childTokenThemeValues[theme.id] = {};
    });

    const childTokenId = `${childId}-token`;
    const childToken: DesignToken = {
      id: childTokenId,
      name: childTokenName,
      type: 'color',
      groupId: groupId,
      projectId: activeProjectId,
      pageId: activePageId,
      themeValues: childTokenThemeValues,
      createdAt: Date.now(),
      sortOrder: 0, // First token in new group
    };

    const childNode: ColorNode = {
      id: childId,
      colorSpace: 'hsl',
      hue: 0,
      saturation: 0,
      lightness: 0,
      alpha: 100,
      position: childPosition,
      parentId: prefixId,
      hueOffset: 0,
      saturationOffset: 0,
      lightnessOffset: 0,
      alphaOffset: 0,
      tokenId: null,
      tokenIds: [],
      tokenAssignments: {},
      width: 240,
      projectId: activeProjectId,
      pageId: activePageId,
      lockHue: false,
      lockSaturation: false,
      lockLightness: false,
      lockAlpha: false,
      diffHue: false,
      diffSaturation: false,
      diffLightness: false,
      diffAlpha: false,
      isExpanded: false,
      isTokenNode: true,
      tokenNodeSuffix: finalChildSuffix,
      referenceName: childTokenName,
      referenceNameLocked: true,
      ownTokenId: childTokenId,
    };

    // Add everything to state
    setGroups(prev => [...prev, newGroup]);
    setTokens(prev => [...prev, childToken]);
    setAllNodes(prev => [...prev, prefixNode, childNode]);
    setSelectedNodeId(childId);
    setSelectedNodeIds([childId]);
  }, [allNodes, activeProjectId, activePageId, canvasStates, activeThemeId, themes, groups]);

  const togglePrefixNode = useCallback((nodeId: string, makePrefix: boolean) => {
    if (isSampleModeRef.current) { sampleModeToast('Editing nodes'); return; }
    const node = allNodes.find(n => n.id === nodeId);
    if (!node || !node.isTokenNode) return;

    // Find root prefix for group info
    const rootPrefix = findTokenPrefixNode(node, allNodes);
    const groupId = rootPrefix?.tokenGroupId;

    if (makePrefix) {
      // ── Convert child → prefix ──
      // Delete the node's own token
      if (node.ownTokenId) {
        setTokens(prev => prev.filter(t => t.id !== node.ownTokenId));
      }

      // Update the node
      setAllNodes(prev => {
        const updated = prev.map(n => {
          if (n.id === nodeId) {
            return {
              ...n,
              isTokenPrefix: true,
              ownTokenId: undefined,
              valueTokenId: undefined,
              valueTokenAssignments: undefined,
            };
          }
          return n;
        });

        // Recompute all descendant token paths
        const descendants = collectTokenDescendants(nodeId, updated);
        return updated.map(n => {
          const desc = descendants.find(d => d.id === n.id);
          if (desc && !desc.isTokenPrefix) {
            const newPath = computeTokenPath(n, updated);
            return { ...n, referenceName: newPath };
          }
          // Also update mid-tree prefix descendants (their referenceName stays as suffix)
          if (desc && desc.isTokenPrefix) {
            return n; // Mid-tree prefix doesn't need referenceName update
          }
          return n;
        });
      });

      // Update descendant token names with cross-page uniqueness
      const descendants = collectTokenDescendants(nodeId, allNodes);
      descendants.forEach(desc => {
        if (desc.ownTokenId) {
          const tempNodes = allNodes.map(n => n.id === nodeId ? { ...n, isTokenPrefix: true } : n);
          const newPath = computeTokenPath(desc, tempNodes);
          setTokens(prev => {
            const existingNames = new Set(
              prev
                .filter(t => t.projectId === activeProjectId && t.id !== desc.ownTokenId)
                .map(t => t.name.toLowerCase())
            );
            let finalName = newPath;
            if (existingNames.has(newPath.toLowerCase())) {
              const copyBase = newPath + '-copy';
              finalName = copyBase;
              if (existingNames.has(copyBase.toLowerCase())) {
                for (let i = 1; i <= 999; i++) {
                  const candidate = `${copyBase}-${i}`;
                  if (!existingNames.has(candidate.toLowerCase())) { finalName = candidate; break; }
                }
              }
            }
            return prev.map(t => t.id === desc.ownTokenId ? { ...t, name: finalName } : t);
          });
        }
      });

    } else {
      // ── Convert prefix → child ──
      // Create a new token for this node
      const fullPath = computeTokenPath(node, allNodes);

      // Validate uniqueness across ALL pages in the project
      const existingProjectNames = new Set(
        tokens.filter(t => t.projectId === activeProjectId).map(t => t.name.toLowerCase())
      );
      let finalTokenName = fullPath;
      if (existingProjectNames.has(fullPath.toLowerCase())) {
        const copyBase = fullPath + '-copy';
        finalTokenName = copyBase;
        if (existingProjectNames.has(copyBase.toLowerCase())) {
          for (let i = 1; i <= 999; i++) {
            const candidate = `${copyBase}-${i}`;
            if (!existingProjectNames.has(candidate.toLowerCase())) { finalTokenName = candidate; break; }
          }
        }
      }

      // Token starts empty — values are populated when a value token is assigned
      const projectThemes = themes.filter(t => t.projectId === activeProjectId);
      const tokenThemeValues: { [themeId: string]: any } = {};
      projectThemes.forEach(theme => {
        tokenThemeValues[theme.id] = {};
      });

      const newTokenId = `${nodeId}-token-${Date.now()}`;
      const newToken: DesignToken = {
        id: newTokenId,
        name: finalTokenName,
        type: 'color',
        groupId: groupId || null,
        projectId: activeProjectId,
        pageId: node.pageId,
        themeValues: tokenThemeValues,
        createdAt: Date.now(),
      };

      setTokens(prev => {
        const targetGid = newToken.groupId;
        const groupTokens = targetGid === null
          ? prev.filter(t => t.groupId === null && t.projectId === newToken.projectId && t.pageId === newToken.pageId)
          : prev.filter(t => t.groupId === targetGid);
        const maxSortOrder = groupTokens.reduce((max, t) => Math.max(max, t.sortOrder ?? -1), -1);
        return [...prev, { ...newToken, sortOrder: maxSortOrder + 1 }];
      });

      // Update the node
      setAllNodes(prev => {
        const updated = prev.map(n => {
          if (n.id === nodeId) {
            return {
              ...n,
              isTokenPrefix: false,
              ownTokenId: newTokenId,
              referenceName: finalTokenName,
            };
          }
          return n;
        });

        // Recompute all descendant token paths
        const descendants = collectTokenDescendants(nodeId, updated);
        return updated.map(n => {
          const desc = descendants.find(d => d.id === n.id);
          if (desc && !desc.isTokenPrefix) {
            const newPath = computeTokenPath(n, updated);
            return { ...n, referenceName: newPath };
          }
          return n;
        });
      });

      // Update descendant token names with cross-page uniqueness
      const descendants = collectTokenDescendants(nodeId, allNodes);
      descendants.forEach(desc => {
        if (desc.ownTokenId) {
          const tempNodes = allNodes.map(n => n.id === nodeId ? { ...n, isTokenPrefix: false } : n);
          const newPath = computeTokenPath(desc, tempNodes);
          setTokens(prev => {
            const existingNames = new Set(
              prev
                .filter(t => t.projectId === activeProjectId && t.id !== desc.ownTokenId)
                .map(t => t.name.toLowerCase())
            );
            let finalName = newPath;
            if (existingNames.has(newPath.toLowerCase())) {
              const copyBase = newPath + '-copy';
              finalName = copyBase;
              if (existingNames.has(copyBase.toLowerCase())) {
                for (let i = 1; i <= 999; i++) {
                  const candidate = `${copyBase}-${i}`;
                  if (!existingNames.has(candidate.toLowerCase())) { finalName = candidate; break; }
                }
              }
            }
            return prev.map(t => t.id === desc.ownTokenId ? { ...t, name: finalName } : t);
          });
        }
      });
    }
  }, [allNodes, tokens, themes, activeProjectId]);


  return { addRootNode, addChildNode, addParentNode, addPaletteNode, addSpacingNode, addTokenNode, togglePrefixNode };
}
