// Node mutation callbacks extracted from App.tsx:
// deleteNode, selectNodeWithChildren, moveSelectedNodes, unlinkNode, linkNode
import { useCallback } from 'react';
import type { ColorNode, DesignToken, TokenGroup, Theme, NodeAdvancedLogic } from '../components/types';

interface UseNodeMutationsParams {
  allNodes: ColorNode[];
  groups: TokenGroup[];
  themes: Theme[];
  activeThemeId: string;
  selectedNodeIds: string[];
  isSampleModeRef: React.MutableRefObject<boolean>;
  sampleModeToast: (action?: string) => void;
  setAllNodes: React.Dispatch<React.SetStateAction<ColorNode[]>>;
  setTokens: React.Dispatch<React.SetStateAction<DesignToken[]>>;
  setGroups: React.Dispatch<React.SetStateAction<TokenGroup[]>>;
  setAdvancedLogic: React.Dispatch<React.SetStateAction<NodeAdvancedLogic[]>>;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useNodeMutations({
  allNodes, groups, themes, activeThemeId, selectedNodeIds,
  isSampleModeRef, sampleModeToast,
  setAllNodes, setTokens, setGroups, setAdvancedLogic,
  setSelectedNodeId, setSelectedNodeIds,
}: UseNodeMutationsParams) {

  const deleteNode = useCallback((id: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Deleting nodes'); return; }
    // Only allow node deletion in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Nodes can only be deleted in the primary theme. Please switch to the primary theme to delete nodes.');
      return;
    }

    // Compute ALL nodes that will be deleted (target + all descendants)
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

    // Collect auto-assigned tokens to delete & groups to check
    const autoAssignedTokenIdsToDelete = new Set<string>();
    const autoAssignGroupIdsToCheck = new Set<string>();

    allNodes.forEach(n => {
      if (!nodesToDelete.has(n.id)) return;
      if (n.autoAssignedTokenId) {
        autoAssignedTokenIdsToDelete.add(n.autoAssignedTokenId);
      }
      if (n.autoAssignEnabled && n.autoAssignGroupId) {
        autoAssignGroupIdsToCheck.add(n.autoAssignGroupId);
      }
    });

    // First check if we need to delete palette groups and tokens
    const nodeToDelete = allNodes.find(n => n.id === id);
    
    if (nodeToDelete?.isPalette) {
      console.log(`Deleting palette node: ${id}`);
      const paletteGroup = groups.find(g => g.paletteNodeId === id);
      
      if (paletteGroup) {
        console.log(`Found palette group: ${paletteGroup.name} (${paletteGroup.id})`);
        setTokens(prevTokens => {
          const filtered = prevTokens.filter(t => t.groupId !== paletteGroup.id);
          const removedTokens = prevTokens.filter(t => t.groupId === paletteGroup.id);
          console.log(`Removing ${removedTokens.length} tokens:`, removedTokens.map(t => t.name));
          console.log(`Tokens: ${prevTokens.length} -> ${filtered.length}`);
          return filtered;
        });
        setGroups(prevGroups => {
          const filtered = prevGroups.filter(g => g.id !== paletteGroup.id);
          console.log(`Groups: ${prevGroups.length} -> ${filtered.length}`);
          return filtered;
        });
      } else {
        console.warn(`No palette group found for palette node ${id}, searching all groups...`);
        setGroups(prevGroups => {
          const orphanedGroup = prevGroups.find(g => g.isPaletteEntry && g.paletteNodeId === id);
          if (orphanedGroup) {
            console.log(`Found orphaned palette group: ${orphanedGroup.name} (${orphanedGroup.id})`);
            setTokens(prevTokens => {
              const filtered = prevTokens.filter(t => t.groupId !== orphanedGroup.id);
              console.log(`Removing orphaned tokens for group ${orphanedGroup.id}`);
              return filtered;
            });
            return prevGroups.filter(g => g.id !== orphanedGroup.id);
          }
          return prevGroups;
        });
      }
    }

    // Delete tokens auto-created for token node children
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

    // Delete auto-assigned tokens from deleted nodes
    if (autoAssignedTokenIdsToDelete.size > 0) {
      setTokens(prevTokens => {
        const updated = prevTokens.filter(t => !autoAssignedTokenIdsToDelete.has(t.id));
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

    // Delete nodes and clean up token references on surviving nodes
    setAllNodes((prev) => {
      let result = prev.filter(node => !nodesToDelete.has(node.id));
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
    if (selectedNodeIds.length === 0) return;
    setAllNodes((prev) => {
      const updated = prev.map((node) =>
        selectedNodeIds.includes(node.id)
          ? { ...node, position: { x: node.position.x + deltaX, y: node.position.y + deltaY } }
          : node
      );
      return updated;
    });
  }, [selectedNodeIds]);

  const unlinkNode = useCallback((id: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Unlinking nodes'); return; }
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary && activeThemeId) {
      const node = allNodes.find(n => n.id === id);
      if (node) {
        const parentNode = node.parentId ? allNodes.find(n => n.id === node.parentId) : null;
        const isChildInherited = !node.themeOverrides || !node.themeOverrides[activeThemeId];
        const isParentInherited = parentNode && (!parentNode.themeOverrides || !parentNode.themeOverrides[activeThemeId]);
        if (isChildInherited || isParentInherited) return;
      }
    }
    setAllNodes((prev) =>
      prev.map((node) => node.id === id ? { ...node, parentId: null } : node)
    );
  }, [themes, activeThemeId, allNodes]);

  const linkNode = useCallback((nodeId: string, newParentId: string | null) => {
    if (isSampleModeRef.current) { sampleModeToast('Linking nodes'); return; }
    setAllNodes((prev) => {
      const currentTheme = themes.find(t => t.id === activeThemeId);
      if (currentTheme && !currentTheme.isPrimary && activeThemeId && newParentId) {
        const childNode = prev.find(n => n.id === nodeId);
        const parentNode = prev.find(n => n.id === newParentId);
        if (childNode && parentNode) {
          const isChildInherited = !childNode.themeOverrides || !childNode.themeOverrides[activeThemeId];
          const isParentInherited = !parentNode.themeOverrides || !parentNode.themeOverrides[activeThemeId];
          if (isChildInherited || isParentInherited) return prev;
        }
      }

      if (newParentId) {
        const isDescendant = (checkId: string, ancestorId: string): boolean => {
          const node = prev.find((n) => n.id === checkId);
          if (!node || !node.parentId) return false;
          if (node.parentId === ancestorId) return true;
          return isDescendant(node.parentId, ancestorId);
        };
        if (isDescendant(newParentId, nodeId)) return prev;
      }

      const nodeToUpdate = prev.find((n) => n.id === nodeId);
      if (!nodeToUpdate) return prev;

      // Special handling for palette nodes
      if (nodeToUpdate.isPalette && newParentId) {
        const newParent = prev.find((n) => n.id === newParentId);
        if (newParent) {
          const paletteHue = newParent.hue;
          const paletteSaturation = newParent.saturation;
          const paletteLightness = newParent.lightness;
          
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
          
          const shadeChildren = prev.filter(n => n.parentId === nodeToUpdate.id).sort((a, b) => a.position.y - b.position.y);
          
          return prev.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node, parentId: newParentId,
                hue: paletteHue, saturation: paletteSaturation, lightness: paletteLightness,
                hueOffset: 0, saturationOffset: 0, lightnessOffset: 0, alphaOffset: 0,
                lockHue: false, lockSaturation: false, lockLightness: false, lockAlpha: false,
                diffHue: false, diffSaturation: false, diffLightness: false, diffAlpha: false,
              };
            }
            if (node.parentId === nodeToUpdate.id) {
              const index = shadeChildren.findIndex(child => child.id === node.id);
              if (index !== -1) {
                const t = shadeCount > 1 ? index / (shadeCount - 1) : 0;
                const curved = applyCurveFn(t);
                const shadeLightness = lightnessStart + (lightnessEnd - lightnessStart) * curved;
                const shadeSaturation = computeSatFn(paletteSaturation, t, shadeLightness);
                const shadeHue = (paletteHue + hueShiftVal * t + 360) % 360;
                return {
                  ...node, hue: shadeHue, saturation: shadeSaturation, lightness: shadeLightness,
                  hueOffset: shadeHue - paletteHue, saturationOffset: shadeSaturation - paletteSaturation,
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
              updatedNode.hueOffset = (nodeToUpdate.hue - newParent.hue + 360) % 360;
              if (updatedNode.hueOffset > 180) updatedNode.hueOffset -= 360;
              updatedNode.saturationOffset = nodeToUpdate.saturation - newParent.saturation;
              updatedNode.lightnessOffset = nodeToUpdate.lightness - newParent.lightness;
              updatedNode.alphaOffset = nodeToUpdate.alpha - newParent.alpha;
              if (nodeToUpdate.red !== undefined && newParent.red !== undefined) updatedNode.redOffset = nodeToUpdate.red - newParent.red;
              if (nodeToUpdate.green !== undefined && newParent.green !== undefined) updatedNode.greenOffset = nodeToUpdate.green - newParent.green;
              if (nodeToUpdate.blue !== undefined && newParent.blue !== undefined) updatedNode.blueOffset = nodeToUpdate.blue - newParent.blue;
              if (nodeToUpdate.oklchL !== undefined && newParent.oklchL !== undefined) updatedNode.oklchLOffset = nodeToUpdate.oklchL - newParent.oklchL;
              if (nodeToUpdate.oklchC !== undefined && newParent.oklchC !== undefined) updatedNode.oklchCOffset = nodeToUpdate.oklchC - newParent.oklchC;
              if (nodeToUpdate.oklchH !== undefined && newParent.oklchH !== undefined) {
                updatedNode.oklchHOffset = (nodeToUpdate.oklchH - newParent.oklchH + 360) % 360;
                if (updatedNode.oklchHOffset > 180) updatedNode.oklchHOffset -= 360;
              }
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
            updatedNode.hueOffset = 0; updatedNode.saturationOffset = 0;
            updatedNode.lightnessOffset = 0; updatedNode.alphaOffset = 0;
            updatedNode.redOffset = 0; updatedNode.greenOffset = 0; updatedNode.blueOffset = 0;
            updatedNode.oklchLOffset = 0; updatedNode.oklchCOffset = 0; updatedNode.oklchHOffset = 0;
          }
          return updatedNode;
        }
        return node;
      });
    });
  }, []);

  return { deleteNode, selectNodeWithChildren, moveSelectedNodes, unlinkNode, linkNode };
}
