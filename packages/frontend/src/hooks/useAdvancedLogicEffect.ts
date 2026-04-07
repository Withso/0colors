// Advanced logic evaluation effect extracted from App.tsx.
// Watches advancedLogic, allNodes, themes, activeThemeId changes,
// evaluates channel logic expressions, and applies computed values to allNodes.
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import type { ColorNode } from '../types';
import {
  hslToHex, oklchToHex,
  getNodeEffectiveHSL,
} from '../utils/app-helpers';
import { rgbToHex, rgbToHsl, oklchToHsl } from '../utils/color-conversions';
import { hctToRgb } from '../utils/hct-utils';
import {
  evaluateChannelLogic,
  nodeToChannelMapThemeAware,
  EvalContext,
  getEffectiveChannels,
  getEffectiveBaseValues,
} from '../utils/advanced-logic-engine';
import { isAdvancedDraft } from '../utils/advanced-draft-registry';

export function useAdvancedLogicEffect() {
  const allNodes = useStore(s => s.allNodes);
  const setAllNodes = useStore(s => s.setAllNodes);
  const tokens = useStore(s => s.tokens);
  const setTokens = useStore(s => s.setTokens);
  const themes = useStore(s => s.themes);
  const activeThemeId = useStore(s => s.activeThemeId);
  const advancedLogic = useStore(s => s.advancedLogic);

  const isApplyingAdvancedLogicRef = useRef(false);

  useEffect(() => {
    // Prevent re-entry when WE are the ones changing allNodes
    if (isApplyingAdvancedLogicRef.current) return;
    const logic = useStore.getState().advancedLogic;
    if (!logic || logic.length === 0) return;

    const currentTheme = themes.find(t => t.id === activeThemeId);
    const isPrimary = currentTheme?.isPrimary ?? true;

    // Build channel maps for ALL nodes in the dataset
    const allNodesMap = new Map<string, Record<string, number>>();
    for (const n of allNodes) {
      allNodesMap.set(n.id, nodeToChannelMapThemeAware(n, activeThemeId, isPrimary));
    }

    // Collect updates: nodeId -> channel changes
    const pendingUpdates: { idx: number; changes: Partial<ColorNode> }[] = [];

    for (const nodeLogic of logic) {
      const nodeIdx = allNodes.findIndex(n => n.id === nodeLogic.nodeId);
      if (nodeIdx === -1) continue;
      const node = allNodes[nodeIdx];

      // Skip nodes whose AdvancedPopup is currently open
      if (isAdvancedDraft(nodeLogic.nodeId)) continue;

      // Theme-aware: determine if node is unlinked in current theme
      const nodeHasThemeOverride = !isPrimary && !!(node.themeOverrides?.[activeThemeId]);
      if (!isPrimary && !nodeHasThemeOverride && !node.isTokenNode) continue;

      // Resolve theme-effective channels and base values
      const effectiveChannels = getEffectiveChannels(nodeLogic, activeThemeId, isPrimary, nodeHasThemeOverride);
      const effectiveBaseValues = getEffectiveBaseValues(nodeLogic, activeThemeId, isPrimary, nodeHasThemeOverride);

      const selfMap = allNodesMap.get(node.id)!;
      const parentMap = node.parentId ? allNodesMap.get(node.parentId) ?? null : null;

      // Use stored baseValues for `locked` keyword to prevent feedback loops
      const lockedValues = effectiveBaseValues || selfMap;

      // Cross-channel dependency ordering
      const channelEntries = Object.entries(effectiveChannels).filter(([, cl]) => {
        if (!cl || cl.rows.length === 0) return false;
        return cl.rows.some(r => r.enabled && r.tokens.length > 0);
      });

      // Build dependency graph
      const channelKeys = new Set(channelEntries.map(([k]) => k));
      const channelDeps: Record<string, Set<string>> = {};
      const propAlias: Record<string, string> = {
        h: 'hue', s: 'saturation', l: 'lightness', a: 'alpha',
        r: 'red', g: 'green', b: 'blue',
      };
      for (const [chKey, chLogic] of channelEntries) {
        const deps = new Set<string>();
        for (const row of chLogic.rows) {
          if (!row.enabled) continue;
          for (let ti = 0; ti < row.tokens.length; ti++) {
            const tok = row.tokens[ti];
            if (tok.type === 'reference' && tok.value === '@Self') {
              const nextTok = row.tokens[ti + 1];
              if (nextTok && nextTok.type === 'property') {
                const prop = nextTok.refProperty || nextTok.value.replace('.', '').toLowerCase();
                const canonical = propAlias[prop] || prop;
                if (canonical !== chKey && channelKeys.has(canonical)) {
                  deps.add(canonical);
                }
              }
            }
          }
        }
        channelDeps[chKey] = deps;
      }

      // Topological sort (Kahn's algorithm)
      const inDegree: Record<string, number> = {};
      for (const [k] of channelEntries) inDegree[k] = 0;
      for (const [k, deps] of Object.entries(channelDeps)) {
        for (const d of deps) {
          if (inDegree[d] !== undefined) inDegree[k] = (inDegree[k] || 0) + 1;
        }
      }
      const dependents: Record<string, string[]> = {};
      for (const [k] of channelEntries) dependents[k] = [];
      for (const [k, deps] of Object.entries(channelDeps)) {
        for (const d of deps) {
          if (dependents[d]) dependents[d].push(k);
        }
      }
      const queue: string[] = [];
      for (const [k, deg] of Object.entries(inDegree)) {
        if (deg === 0) queue.push(k);
      }
      const sortedChannels: string[] = [];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        sortedChannels.push(curr);
        for (const dep of (dependents[curr] || [])) {
          inDegree[dep]--;
          if (inDegree[dep] === 0) queue.push(dep);
        }
      }
      // Add any remaining channels (cycles)
      for (const [k] of channelEntries) {
        if (!sortedChannels.includes(k)) sortedChannels.push(k);
      }

      // Evaluate channels in topological order
      const mutableSelf = { ...selfMap };
      const changes: Record<string, number> = {};
      let hasChanges = false;

      for (const channelKey of sortedChannels) {
        const channelLogic = effectiveChannels[channelKey];
        if (!channelLogic) continue;

        const ctx: EvalContext = {
          self: mutableSelf,
          parent: parentMap,
          allNodes: allNodesMap,
          currentChannel: channelKey,
          lockedValues,
        };

        const baseValue = lockedValues[channelKey] ?? 0;
        const result = evaluateChannelLogic(channelLogic, ctx, baseValue);

        if (result.source === 'logic') {
          mutableSelf[channelKey] = result.value;
          if (channelKey === 'hue') mutableSelf.h = result.value;
          else if (channelKey === 'saturation') mutableSelf.s = result.value;
          else if (channelKey === 'lightness') mutableSelf.l = result.value;
          else if (channelKey === 'alpha') mutableSelf.a = result.value;
          else if (channelKey === 'red') mutableSelf.r = result.value;
          else if (channelKey === 'green') mutableSelf.g = result.value;
          else if (channelKey === 'blue') mutableSelf.b = result.value;

          let currentValue: number;
          if (nodeHasThemeOverride && node.themeOverrides?.[activeThemeId]) {
            currentValue = (node.themeOverrides[activeThemeId] as any)[channelKey] ?? (node as any)[channelKey] ?? 0;
          } else {
            currentValue = (node as any)[channelKey] ?? 0;
          }
          if (Math.abs(result.value - currentValue) > 0.001) {
            changes[channelKey] = result.value;
            hasChanges = true;
          }
        }
      }

      if (hasChanges) {
        const nodeChanges: Partial<ColorNode> = {} as any;
        const cs = node.colorSpace || 'hsl';
        const getVal = (key: string, fallback: number) => {
          if (changes[key] !== undefined) return changes[key];
          if (nodeHasThemeOverride && node.themeOverrides?.[activeThemeId]) {
            return (node.themeOverrides[activeThemeId] as any)[key] ?? (node as any)[key] ?? fallback;
          }
          return (node as any)[key] ?? fallback;
        };

        if (cs === 'hsl' || cs === 'hex') {
          const h = getVal('hue', 0); const s = getVal('saturation', 0); const l = getVal('lightness', 50);
          if (!node.hexLocked) nodeChanges.hexValue = hslToHex(h, s, l);
        } else if (cs === 'rgb') {
          const r = getVal('red', 0); const g = getVal('green', 0); const b = getVal('blue', 0);
          const hsl = rgbToHsl(r, g, b);
          changes.hue = hsl.h; changes.saturation = hsl.s; changes.lightness = hsl.l;
          if (!node.hexLocked) nodeChanges.hexValue = rgbToHex(r, g, b);
        } else if (cs === 'oklch') {
          const oL = getVal('oklchL', 0); const oC = getVal('oklchC', 0); const oH = getVal('oklchH', 0);
          const hsl = oklchToHsl(oL, oC, oH);
          changes.hue = hsl.h; changes.saturation = hsl.s; changes.lightness = hsl.l;
          if (!node.hexLocked) nodeChanges.hexValue = oklchToHex(oL, oC, oH);
        } else if (cs === 'hct') {
          const hH = getVal('hctH', 0); const hC = getVal('hctC', 0); const hT = getVal('hctT', 0);
          const rgb = hctToRgb(hH, hC, hT);
          const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
          changes.hue = hsl.h; changes.saturation = hsl.s; changes.lightness = hsl.l;
          if (!node.hexLocked) nodeChanges.hexValue = hctToHex(hH, hC, hT);
        }

        if (nodeHasThemeOverride && node.themeOverrides?.[activeThemeId]) {
          const existingOverride = { ...node.themeOverrides[activeThemeId] };
          for (const [k, v] of Object.entries(changes)) {
            (existingOverride as any)[k] = v;
          }
          if (nodeChanges.hexValue !== undefined) (existingOverride as any).hexValue = nodeChanges.hexValue;
          nodeChanges.themeOverrides = {
            ...node.themeOverrides,
            [activeThemeId]: existingOverride,
          };
        } else {
          Object.assign(nodeChanges, changes);
        }

        pendingUpdates.push({ idx: nodeIdx, changes: nodeChanges });
      }
    }

    if (pendingUpdates.length === 0) return;

    isApplyingAdvancedLogicRef.current = true;
    setAllNodes(prev => {
      const updated = [...prev];
      for (const { idx, changes } of pendingUpdates) {
        if (idx < updated.length && updated[idx].id === allNodes[idx]?.id) {
          updated[idx] = { ...updated[idx], ...changes };
        } else {
          const actualIdx = updated.findIndex(n => n.id === allNodes[idx]?.id);
          if (actualIdx !== -1) {
            updated[actualIdx] = { ...updated[actualIdx], ...changes };
          }
        }
      }
      return updated;
    });

    // Also update tokens that are assigned to the affected nodes
    const affectedNodeIds = new Set(pendingUpdates.map(u => allNodes[u.idx]?.id).filter(Boolean));
    if (affectedNodeIds.size > 0) {
      setTokens(prevTokens => {
        let finalTokens = prevTokens;
        let tokensUpdated = false;
        affectedNodeIds.forEach(nodeId => {
          const node = allNodes.find(n => n.id === nodeId);
          const update = pendingUpdates.find(u => allNodes[u.idx]?.id === nodeId);
          if (!node || !update) return;
          const effectiveNode = { ...node, ...update.changes };
          const tokenIds = new Set<string>();
          if (effectiveNode.tokenAssignments?.[activeThemeId]) {
            effectiveNode.tokenAssignments[activeThemeId].forEach(tid => tokenIds.add(tid));
          } else if (effectiveNode.tokenIds) {
            effectiveNode.tokenIds.forEach(tid => tokenIds.add(tid));
          }
          if (tokenIds.size === 0) return;
          const currentThemeObj = themes.find(t => t.id === activeThemeId);
          const isPrimaryThemeSync = currentThemeObj?.isPrimary ?? true;
          finalTokens = finalTokens.map(token => {
            if (!tokenIds.has(token.id)) return token;
            tokensUpdated = true;
            const themeOvr = effectiveNode.themeOverrides?.[activeThemeId];
            const effective = getNodeEffectiveHSL(effectiveNode, themeOvr);
            const updatedThemeValues = { ...token.themeValues };
            updatedThemeValues[activeThemeId] = {
              hue: effective.hue,
              saturation: effective.saturation,
              lightness: effective.lightness,
              alpha: effective.alpha,
            };
            if (isPrimaryThemeSync) {
              return {
                ...token,
                type: 'color' as const,
                themeValues: updatedThemeValues,
                hue: effective.hue,
                saturation: effective.saturation,
                lightness: effective.lightness,
                alpha: effective.alpha,
              };
            } else {
              return {
                ...token,
                type: 'color' as const,
                themeValues: updatedThemeValues,
              };
            }
          });
        });
        return tokensUpdated ? finalTokens : prevTokens;
      });
    }

    // Reset the guard after React processes the state update
    requestAnimationFrame(() => {
      isApplyingAdvancedLogicRef.current = false;
    });
  }, [allNodes, advancedLogic, activeThemeId, themes]);
}
