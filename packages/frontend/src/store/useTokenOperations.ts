// Token operation callbacks extracted from App.tsx:
// addToken, updateToken, deleteToken, assignTokenToNode
import { useCallback, useRef } from 'react';
import type { Theme } from '../types';
import { useStore } from './index';
import { toast } from 'sonner';
import { getUniqueTokenName } from '../utils/nameValidation';
import { getNodeEffectiveHSL, getNodeHeight } from '../utils/app-helpers';

export function useTokenOperations() {
  // Read state from store
  const tokens = useStore(s => s.tokens);
  const allNodes = useStore(s => s.allNodes);
  const themes = useStore(s => s.themes);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activePageId = useStore(s => s.activePageId);
  const activeThemeId = useStore(s => s.activeThemeId);
  const projects = useStore(s => s.projects);

  // Read setters from store
  const setAllNodes = useStore(s => s.setAllNodes);
  const setTokens = useStore(s => s.setTokens);
  const setGroups = useStore(s => s.setGroups);

  // Derive sample mode from store state
  const isSampleMode = projects.find(p => p.id === activeProjectId)?.isSample === true;
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

  const addToken = useCallback((name?: string, groupId?: string | null, projectId?: string, tokenType?: 'color' | 'spacing' | 'radius' | 'fontSize' | 'lineHeight' | 'fontWeight' | 'shadow' | 'opacity', pageId?: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Creating tokens'); return; }
    // Only allow token creation in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Tokens can only be created in the primary theme. Please switch to the primary theme to add tokens.');
      return;
    }

    const type = tokenType || 'color';

    // Get all themes for the current project to initialize themeValues
    const projectThemes = themes.filter(t => t.projectId === (projectId || activeProjectId));

    // Initialize theme values for all themes
    const themeValues: { [themeId: string]: any } = {};
    projectThemes.forEach(theme => {
      if (type === 'color') {
        // Color tokens start empty — values are populated when assigned to a node
        themeValues[theme.id] = {};
      } else if (type === 'spacing') {
        themeValues[theme.id] = {
          value: 16,
          unit: 'px' as const,
        };
      } else if (type === 'radius') {
        themeValues[theme.id] = {
          value: 8,
          unit: 'px' as const,
        };
      } else if (type === 'fontSize') {
        themeValues[theme.id] = {
          value: 14,
          unit: 'px' as const,
        };
      } else if (type === 'lineHeight') {
        themeValues[theme.id] = {
          lineHeight: 1.5,
        };
      } else if (type === 'fontWeight') {
        themeValues[theme.id] = {
          fontWeight: 400,
        };
      } else if (type === 'shadow') {
        themeValues[theme.id] = {
          shadowValue: '0 1px 3px 0 color-mix(in srgb, var(--shadow-color-overlay) 10%, transparent)',
        };
      } else if (type === 'opacity') {
        themeValues[theme.id] = {
          opacity: 100,
        };
      }
    });

    const newToken: DesignToken = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: getUniqueTokenName(
        name || `Variable ${tokens.length + 1}`,
        tokens,
        projectId || activeProjectId,
      ),
      type,
      groupId: groupId !== undefined ? groupId : null,
      projectId: projectId || activeProjectId,
      pageId: pageId || activePageId,
      themeValues,
      createdAt: Date.now(),
      // Legacy properties for backward compatibility (use first theme's values)
      ...(type === 'color' && projectThemes.length > 0 && {
        hue: themeValues[projectThemes[0].id]?.hue,
        saturation: themeValues[projectThemes[0].id]?.saturation,
        lightness: themeValues[projectThemes[0].id]?.lightness,
        alpha: themeValues[projectThemes[0].id]?.alpha,
      }),
      ...(type === 'spacing' && projectThemes.length > 0 && {
        value: themeValues[projectThemes[0].id]?.value,
        unit: themeValues[projectThemes[0].id]?.unit,
      }),
      ...(type === 'radius' && projectThemes.length > 0 && {
        value: themeValues[projectThemes[0].id]?.value,
        unit: themeValues[projectThemes[0].id]?.unit,
      }),
      ...(type === 'fontSize' && projectThemes.length > 0 && {
        value: themeValues[projectThemes[0].id]?.value,
        unit: themeValues[projectThemes[0].id]?.unit,
      }),
      ...(type === 'lineHeight' && projectThemes.length > 0 && {
        lineHeight: themeValues[projectThemes[0].id]?.lineHeight,
      }),
      ...(type === 'fontWeight' && projectThemes.length > 0 && {
        fontWeight: themeValues[projectThemes[0].id]?.fontWeight,
      }),
      ...(type === 'shadow' && projectThemes.length > 0 && {
        shadowValue: themeValues[projectThemes[0].id]?.shadowValue,
      }),
      ...(type === 'opacity' && projectThemes.length > 0 && {
        opacity: themeValues[projectThemes[0].id]?.opacity,
      }),
    };

    setTokens((prev) => {
      // Compute sortOrder: append to end of the target group (ascending order)
      const targetGroupId = newToken.groupId;
      const groupTokens = targetGroupId === null
        ? prev.filter(t => t.groupId === null && t.projectId === newToken.projectId && t.pageId === newToken.pageId)
        : prev.filter(t => t.groupId === targetGroupId);
      const maxSortOrder = groupTokens.reduce((max, t) => Math.max(max, t.sortOrder ?? -1), -1);
      return [...prev, { ...newToken, sortOrder: maxSortOrder + 1 }];
    });
    return newToken.id;
  }, [tokens.length, activeProjectId, activePageId, themes, activeThemeId]);

  const updateToken = useCallback((id: string, updates: Partial<DesignToken>) => {
    setTokens((prev) =>
      prev.map((token) =>
        token.id === id ? { ...token, ...updates } : token
      )
    );
  }, []);

  const deleteToken = useCallback((id: string) => {
    if (isSampleModeRef.current) { sampleModeToast('Deleting tokens'); return; }
    // Only allow token deletion in primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (currentTheme && !currentTheme.isPrimary) {
      alert('Tokens can only be deleted in the primary theme. Please switch to the primary theme to delete tokens.');
      return;
    }

    setAllNodes((prev) =>
      prev.map((node) => {
        // Clean up theme-specific assignments
        const updatedAssignments = { ...node.tokenAssignments };
        Object.keys(updatedAssignments).forEach(themeId => {
          updatedAssignments[themeId] = updatedAssignments[themeId].filter(tid => tid !== id);
        });

        // Clear autoAssignedTokenId if it points to the deleted token
        const clearAutoAssign = node.autoAssignedTokenId === id;

        return {
          ...node,
          tokenIds: (node.tokenIds || []).filter(tid => tid !== id),
          tokenAssignments: updatedAssignments,
          ...(clearAutoAssign ? { autoAssignedTokenId: undefined } : {}),
        };
      })
    );
    setTokens((prev) => {
      // Find the token being deleted from current state (not stale closure)
      const deletedToken = prev.find(t => t.id === id);
      const updated = prev.filter((token) => token.id !== id);

      // Auto-cleanup: if the deleted token was in an auto-assign-created group,
      // check if that group is now empty and remove it
      if (deletedToken?.groupId) {
        const groupId = deletedToken.groupId;
        const remainingTokensInGroup = updated.filter(t => t.groupId === groupId);
        if (remainingTokensInGroup.length === 0) {
          // Use functional update to read fresh groups state (avoids stale closure)
          setGroups((prevGroups) => {
            const group = prevGroups.find(g => g.id === groupId);
            if (group?.isAutoAssignCreated) {
              return prevGroups.filter(g => g.id !== groupId);
            }
            return prevGroups;
          });
        }
      }

      return updated;
    });
  }, [themes, activeThemeId]);

  const assignTokenToNode = useCallback((nodeId: string, tokenId: string, isAssigned: boolean) => {
    if (isSampleModeRef.current) { sampleModeToast('Assigning tokens'); return; }
    console.log('🔵 assignTokenToNode called:', { nodeId, tokenId, isAssigned });
    // Check if we're in the primary theme
    const currentTheme = themes.find(t => t.id === activeThemeId);
    const isPrimaryTheme = currentTheme?.isPrimary === true;

    // Get all themes for this project to assign in primary theme
    const projectThemes = themes.filter(t => t.projectId === activeProjectId);
    const primaryThemeId = projectThemes.find(t => t.isPrimary)?.id || '';

    setAllNodes((prev) => {
      const targetNode = prev.find(n => n.id === nodeId);
      if (!targetNode) return prev;

      const updatedNodes = prev.map((node) => {
        // Get theme-specific token assignments
        const currentAssignments = node.tokenAssignments?.[activeThemeId] || [];
        // Fallback to legacy tokenIds for backward compatibility
        const legacyTokenIds = node.tokenIds || [];
        // Use theme-specific assignments if they exist (even if empty), otherwise fall back to legacy
        const currentTokenIds = (node.tokenAssignments?.[activeThemeId] !== undefined) ? currentAssignments : legacyTokenIds;

        if (isAssigned) {
          // First, remove the token from all nodes in this theme (to ensure one token = one node per theme)
          const withoutToken = currentTokenIds.filter(tid => tid !== tokenId);

          // Then add it only to the target node
          if (node.id === nodeId) {
            const newTokenIds = [...withoutToken, tokenId];

            // Update token with node's theme-specific values for ALL themes
            setTokens((prevTokens) =>
              prevTokens.map((token) => {
                if (token.id === tokenId) {
                  // Initialize themeValues if it doesn't exist
                  const themeValues = token.themeValues || {};
                  const updatedThemeValues = { ...themeValues };

                  // When in primary theme, update ALL themes using this node
                  // When in non-primary theme, only update the current theme's value
                  // (other themes retain their existing values from their own assigned nodes)
                  const allThemesToUpdate = isPrimaryTheme ? projectThemes : [{ id: activeThemeId } as Theme];

                  // Update based on node type
                  if (node.isSpacing || node.type === 'spacing') {
                    // For spacing nodes, update spacing properties in themeValues
                    allThemesToUpdate.forEach(theme => {
                      updatedThemeValues[theme.id] = {
                        value: node.spacingValue ?? 16,
                        unit: node.spacingUnit ?? 'px',
                      };
                    });

                    return {
                      ...token,
                      type: 'spacing',
                      themeValues: updatedThemeValues,
                      // Also update legacy properties for backward compatibility
                      value: node.spacingValue ?? 16,
                      unit: node.spacingUnit ?? 'px',
                    };
                  } else {
                    // For color/palette nodes, update each theme with node's effective color
                    allThemesToUpdate.forEach(theme => {
                      // Use color-space-aware helper to get correct HSL from any color space
                      const hasThemeOverride = node.themeOverrides?.[theme.id];
                      const themeOverrideData = hasThemeOverride ? node.themeOverrides![theme.id] : undefined;
                      const effective = getNodeEffectiveHSL(node, themeOverrideData);

                      updatedThemeValues[theme.id] = {
                        hue: effective.hue,
                        saturation: effective.saturation,
                        lightness: effective.lightness,
                        alpha: effective.alpha,
                      };
                    });

                    if (isPrimaryTheme) {
                      return {
                        ...token,
                        type: 'color',
                        themeValues: updatedThemeValues,
                        // Update legacy properties for backward compatibility (primary theme values)
                        hue: updatedThemeValues[activeThemeId]?.hue,
                        saturation: updatedThemeValues[activeThemeId]?.saturation,
                        lightness: updatedThemeValues[activeThemeId]?.lightness,
                        alpha: updatedThemeValues[activeThemeId]?.alpha,
                      };
                    } else {
                      // Non-primary theme: ONLY update themeValues, preserve base token properties
                      return {
                        ...token,
                        type: 'color',
                        themeValues: updatedThemeValues,
                      };
                    }
                  }
                }
                return token;
              })
            );

            // If we're in the primary theme, assign to ALL themes
            // Otherwise, only assign to the current theme
            const updatedAssignments = { ...node.tokenAssignments };

            if (isPrimaryTheme) {
              // Assign to all themes in the project
              projectThemes.forEach(theme => {
                const themeTokens = updatedAssignments[theme.id] || [];
                updatedAssignments[theme.id] = [...themeTokens.filter(tid => tid !== tokenId), tokenId];
              });
            } else {
              // Only assign to current theme
              updatedAssignments[activeThemeId] = newTokenIds;
            }

            return {
              ...node,
              tokenAssignments: updatedAssignments
            };
          } else {
            // Only update nodes that actually have the token assigned
            // Skip nodes that don't have the token to avoid creating empty tokenAssignments
            // that would override legacy tokenIds on shade nodes
            const hasTokenInCurrentScope = isPrimaryTheme
              ? (node.tokenAssignments
                ? Object.values(node.tokenAssignments).some((ids: string[]) => ids.includes(tokenId))
                : (node.tokenIds || []).includes(tokenId))
              : currentTokenIds.includes(tokenId);

            if (!hasTokenInCurrentScope) return node;

            // Remove from all other nodes in this theme (or all themes if primary)
            const updatedAssignments = { ...node.tokenAssignments };

            if (isPrimaryTheme) {
              // Remove from all themes
              projectThemes.forEach(theme => {
                const themeTokens = updatedAssignments[theme.id] || [];
                updatedAssignments[theme.id] = themeTokens.filter(tid => tid !== tokenId);
              });
            } else {
              // Only remove from current theme
              updatedAssignments[activeThemeId] = withoutToken;
            }

            return {
              ...node,
              tokenAssignments: updatedAssignments
            };
          }
        } else {
          // Remove token from the specified node
          if (node.id === nodeId) {
            const updatedAssignments = { ...node.tokenAssignments };

            if (isPrimaryTheme) {
              // Remove from all themes
              projectThemes.forEach(theme => {
                const currentThemeTokens = updatedAssignments[theme.id] || [];
                updatedAssignments[theme.id] = currentThemeTokens.filter(tid => tid !== tokenId);
              });

              // Clear the token's color values back to empty since it's no longer assigned to any node
              setTokens(prevTokens => prevTokens.map(t => {
                if (t.id === tokenId && t.type === 'color') {
                  const clearedThemeValues: { [themeId: string]: any } = {};
                  projectThemes.forEach(theme => {
                    clearedThemeValues[theme.id] = {};
                  });
                  return {
                    ...t,
                    themeValues: clearedThemeValues,
                    // Clear legacy properties
                    hue: undefined,
                    saturation: undefined,
                    lightness: undefined,
                    alpha: undefined,
                  };
                }
                return t;
              }));
            } else {
              // Only remove from current theme
              const newCurrentTokens = currentTokenIds.filter(tid => tid !== tokenId);
              updatedAssignments[activeThemeId] = newCurrentTokens;

              // Check if the resulting assignment matches the primary theme's assignment
              // If so, remove the theme-specific override entirely (inherit from primary)
              const primaryThemeTokens = updatedAssignments[primaryThemeId] !== undefined
                ? updatedAssignments[primaryThemeId]
                : (node.tokenIds || []);
              const primarySet = new Set(primaryThemeTokens);
              const currentSet = new Set(newCurrentTokens);
              const assignmentMatchesPrimary = primarySet.size === currentSet.size &&
                [...primarySet].every(id => currentSet.has(id));
              if (assignmentMatchesPrimary) {
                delete updatedAssignments[activeThemeId];
              }

              // Reset the token's themeValues for this theme to match primary values
              setTokens(prevTokens => prevTokens.map(t => {
                if (t.id === tokenId) {
                  const updatedThemeValues = { ...t.themeValues };
                  const primaryValue = updatedThemeValues[primaryThemeId];
                  if (primaryValue) {
                    updatedThemeValues[activeThemeId] = { ...primaryValue };
                  } else {
                    delete updatedThemeValues[activeThemeId];
                  }
                  return { ...t, themeValues: updatedThemeValues };
                }
                return t;
              }));
            }

            return {
              ...node,
              tokenAssignments: updatedAssignments
            };
          }
        }

        return node;
      });

      // Auto-adjust siblings if token count changed for a child node
      if (targetNode.parentId) {
        const updatedTargetNode = updatedNodes.find(n => n.id === nodeId);
        if (updatedTargetNode) {
          const MIN_GAP = 40; // Unified with canvas-level gap enforcement

          // Get all siblings (including the updated node)
          const allSiblings = updatedNodes.filter(
            n => n.parentId === targetNode.parentId
          );

          // Sort siblings by Y position
          const sortedSiblings = [...allSiblings].sort((a, b) => a.position.y - b.position.y);

          // Find the index of the changed node in the sorted list
          const changedIdx = sortedSiblings.findIndex(s => s.id === nodeId);
          if (changedIdx < 0) return updatedNodes;

          // Calculate height delta for pull-back capping
          const oldHeight = getNodeHeight(targetNode, tokens, updatedNodes, activeThemeId);
          const changedHeight = getNodeHeight(updatedTargetNode, tokens, updatedNodes, activeThemeId);
          const heightDelta = changedHeight - oldHeight;
          const changedBottom = updatedTargetNode.position.y + changedHeight;

          // Find the first sibling BELOW the changed node that horizontally overlaps
          const NODE_WIDTH = 240;
          const changedLeft = updatedTargetNode.position.x;
          const changedRight = updatedTargetNode.position.x + (updatedTargetNode.width || NODE_WIDTH);

          let firstBelowIdx = -1;
          for (let i = changedIdx + 1; i < sortedSiblings.length; i++) {
            const s = sortedSiblings[i];
            const sLeft = s.position.x;
            const sRight = s.position.x + (s.width || NODE_WIDTH);
            const horizontallyOverlapping = changedLeft < sRight && changedRight > sLeft;
            if (horizontallyOverlapping) {
              firstBelowIdx = i;
              break;
            }
          }

          if (firstBelowIdx < 0) return updatedNodes;

          // Calculate uniform shift for the first below sibling
          const firstBelow = sortedSiblings[firstBelowIdx];
          const currentGap = firstBelow.position.y - changedBottom;
          const uniformShift = currentGap < MIN_GAP ? (MIN_GAP - currentGap) : 0;
          const uniformPull = currentGap > MIN_GAP ? Math.min(currentGap - MIN_GAP, Math.abs(heightDelta)) : 0;

          const adjustedPositions = new Map<string, { x: number; y: number }>();

          if (uniformShift > 0) {
            for (let i = firstBelowIdx; i < sortedSiblings.length; i++) {
              const s = sortedSiblings[i];
              const sLeft = s.position.x;
              const sRight = s.position.x + (s.width || NODE_WIDTH);
              const horizontallyOverlapping = changedLeft < sRight && changedRight > sLeft;
              if (horizontallyOverlapping) {
                adjustedPositions.set(s.id, {
                  x: s.position.x,
                  y: s.position.y + uniformShift
                });
              }
            }
          } else if (uniformPull > 0) {
            for (let i = firstBelowIdx; i < sortedSiblings.length; i++) {
              const s = sortedSiblings[i];
              const sLeft = s.position.x;
              const sRight = s.position.x + (s.width || NODE_WIDTH);
              const horizontallyOverlapping = changedLeft < sRight && changedRight > sLeft;
              if (horizontallyOverlapping) {
                adjustedPositions.set(s.id, {
                  x: s.position.x,
                  y: s.position.y - uniformPull
                });
              }
            }
          }

          if (adjustedPositions.size === 0) return updatedNodes;

          // Apply adjusted positions
          return updatedNodes.map(node => {
            const adjustedPos = adjustedPositions.get(node.id);
            if (adjustedPos) {
              return {
                ...node,
                position: adjustedPos
              };
            }
            return node;
          });
        }
      }

      return updatedNodes;
    });
  }, [activeThemeId, themes, activeProjectId, tokens]);

  return { addToken, updateToken, deleteToken, assignTokenToNode };
}
