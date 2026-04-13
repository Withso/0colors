// Node update callbacks extracted from App.tsx:
// updateNode, revertThemeAdvancedLogic
import { useCallback, useRef } from 'react';
import type { ColorNode, DesignToken, TokenGroup, Theme, NodeAdvancedLogic } from '../types';
import { useStore } from './index';
import { useReadOnlyState } from '../hooks/useReadOnlyState';
import { toast } from 'sonner';
import {
  hslToOklchUpper, rgbToOklch, oklchToRgb, hslToHex, oklchToHex,
  hexToRgb, hexToHsl, getNodeEffectiveHSL,
  regeneratePaletteShades, computeTokenPath,
  computeAncestorPath, collectTokenDescendants,
  getNodeHeight, MIN_GAP,
} from '../utils/app-helpers';
import { hslToRgb, rgbToHex, rgbToHsl, hslToOklch as hslToOklchBase, oklchToHsl } from '../utils/color-conversions';
import { hctToRgb, rgbToHct, hctToHex } from '../utils/hct-utils';
import { nodeToChannelMapThemeAware, evaluateChannelLogic } from '../utils/advanced-logic-engine';

export function useNodeUpdate() {
  // Read state from store
  const allNodes = useStore(s => s.allNodes);
  const tokens = useStore(s => s.tokens);
  const themes = useStore(s => s.themes);
  const groups = useStore(s => s.groups);
  const advancedLogic = useStore(s => s.advancedLogic);
  const activeThemeId = useStore(s => s.activeThemeId);
  const activeProjectId = useStore(s => s.activeProjectId);
  const projects = useStore(s => s.projects);

  // Read setters from store
  const setAllNodes = useStore(s => s.setAllNodes);
  const setTokens = useStore(s => s.setTokens);
  const setGroups = useStore(s => s.setGroups);
  const setAdvancedLogic = useStore(s => s.setAdvancedLogic);

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

  const updateNode = useCallback((id: string, updates: Partial<ColorNode>) => {
    setAllNodes((prev) => {
      const nodeBeingUpdated = prev.find((n) => n.id === id);
      if (!nodeBeingUpdated) return prev;

      // Handle palette shade count changes
      if (nodeBeingUpdated.isPalette && updates.paletteShadeCount !== undefined) {
        // Block structural shade count changes in sample mode (creates/removes child nodes)
        if (isSampleModeRef.current) return prev;
        const oldShadeCount = nodeBeingUpdated.paletteShadeCount ?? 10;
        const newShadeCount = updates.paletteShadeCount;

        // Find the palette entry group for this palette node
        const paletteEntryId = `palette-entry-${id}`;

        console.log(`🔄 Updating palette shade count from ${oldShadeCount} to ${newShadeCount}`);
        console.log(`🗑️ Deleting all tokens for palette group: ${paletteEntryId}`);

        // Remove ALL tokens that belong to this palette's group (relational cleanup)
        setTokens(prevTokens => {
          const filtered = prevTokens.filter(t => t.groupId !== paletteEntryId);
          const removedTokens = prevTokens.filter(t => t.groupId === paletteEntryId);
          console.log(`Removed ${removedTokens.length} palette tokens:`, removedTokens.map(t => t.name));
          return filtered;
        });

        // Remove old shade nodes
        const filteredNodes = prev.filter(n => n.parentId !== id);

        // Create new shade nodes
        const lightnessStart = nodeBeingUpdated.paletteLightnessStart ?? 95;
        const lightnessEnd = nodeBeingUpdated.paletteLightnessEnd ?? 15;
        const curveType = nodeBeingUpdated.paletteCurveType || 'linear';
        const satMode = nodeBeingUpdated.paletteSaturationMode || 'constant';
        const satStart = nodeBeingUpdated.paletteSaturationStart ?? nodeBeingUpdated.saturation;
        const satEnd = nodeBeingUpdated.paletteSaturationEnd ?? nodeBeingUpdated.saturation;
        const hueShift = nodeBeingUpdated.paletteHueShift ?? 0;
        const shadeNodes: ColorNode[] = [];

        // Calculate shade node height for proper spacing (must match initial creation)
        const shadeNodeHeight = 48; // 44px compact card + 4px padding
        const SHADE_GAP_LOCAL = 2;
        const shadeStride = shadeNodeHeight + SHADE_GAP_LOCAL;

        // Calculate shade column base position with collision detection
        const shadeColumnWidth = 240;
        const shadeColumnTotalHeight = newShadeCount * shadeStride;
        let shadeBaseX = nodeBeingUpdated.position.x + 450;
        let shadeBaseY = nodeBeingUpdated.position.y;

        // Collision detection for the entire shade column against remaining nodes
        const checkShadeColCollision = (baseX: number, baseY: number): boolean => {
          return filteredNodes.some(existingNode => {
            if (existingNode.projectId !== nodeBeingUpdated.projectId || existingNode.pageId !== nodeBeingUpdated.pageId) return false;
            const nodeW = existingNode.width || 240;
            const nodeH = getNodeHeight(existingNode, tokens, filteredNodes, activeThemeId);

            const colLeft = baseX;
            const colRight = baseX + shadeColumnWidth;
            const colTop = baseY;
            const colBottom = baseY + shadeColumnTotalHeight;

            const nodeLeft = existingNode.position.x;
            const nodeRight = existingNode.position.x + nodeW;
            const nodeTop = existingNode.position.y;
            const nodeBottom = existingNode.position.y + nodeH;

            const horizontalOverlap = !(colRight + MIN_GAP <= nodeLeft || nodeRight + MIN_GAP <= colLeft);
            const verticalOverlap = !(colBottom + MIN_GAP <= nodeTop || nodeBottom + MIN_GAP <= colTop);

            return horizontalOverlap && verticalOverlap;
          });
        };

        // Find free space for shade column if initial position collides
        if (checkShadeColCollision(shadeBaseX, shadeBaseY)) {
          let found = false;
          // Try shifting down first
          for (let attempt = 1; attempt < 30; attempt++) {
            const testY = shadeBaseY + attempt * (shadeNodeHeight + MIN_GAP);
            if (!checkShadeColCollision(shadeBaseX, testY)) {
              shadeBaseY = testY;
              found = true;
              break;
            }
          }
          // If not found, try shifting right
          if (!found) {
            for (let attempt = 1; attempt < 10; attempt++) {
              const testX = shadeBaseX + attempt * (shadeColumnWidth + MIN_GAP);
              if (!checkShadeColCollision(testX, shadeBaseY)) {
                shadeBaseX = testX;
                break;
              }
            }
          }
        }

        // Curve function for shade creation
        const applyCurveForShade = (t: number): number => {
          if (curveType === 'custom') {
            const pts = nodeBeingUpdated.paletteCustomCurvePoints;
            if (pts && pts.length > 0) {
              const idx = t * (pts.length - 1);
              const lo = Math.floor(idx);
              const hi = Math.ceil(idx);
              if (lo === hi || lo >= pts.length - 1) return pts[Math.min(lo, pts.length - 1)];
              const frac = idx - lo;
              return pts[lo] + (pts[hi] - pts[lo]) * frac;
            }
            return t; // fallback to linear if no custom points
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

        // Prepare for token creation
        const paletteName = nodeBeingUpdated.paletteName || 'palette';
        const namingPattern = nodeBeingUpdated.paletteNamingPattern || '1-9';
        const paletteEntryGroupId = `palette-entry-${id}`;
        const newTokens: DesignToken[] = [];

        for (let i = 0; i < newShadeCount; i++) {
          const t = newShadeCount > 1 ? i / (newShadeCount - 1) : 0;
          const curved = applyCurveForShade(t);
          const shadeLightness = lightnessStart + (lightnessEnd - lightnessStart) * curved;

          // Compute saturation
          let shadeSaturation = nodeBeingUpdated.saturation;
          if (satMode === 'manual') {
            shadeSaturation = Math.max(0, Math.min(100, satStart + (satEnd - satStart) * t));
          } else if (satMode === 'auto') {
            const dev = Math.abs(shadeLightness - 50) / 50;
            shadeSaturation = Math.max(0, Math.min(100, nodeBeingUpdated.saturation * (1 - dev * 0.6)));
          }

          // Compute hue
          const shadeHue = (nodeBeingUpdated.hue + hueShift * t + 360) % 360;

          // Generate token name
          let shadeName = '';
          switch (namingPattern) {
            case '1-9':
              shadeName = (i + 1).toString();
              break;
            case '10-90':
              shadeName = ((i + 1) * 10).toString();
              break;
            case '100-900':
              shadeName = ((i + 1) * 100).toString();
              break;
            case 'a-z':
              shadeName = String.fromCharCode(97 + i);
              break;
            default:
              shadeName = (i + 1).toString();
          }

          const tokenName = `${paletteName}/${shadeName}`;
          const tokenId = `${Date.now()}-token-${i}-${Math.random()}`;

          const token: DesignToken = {
            id: tokenId,
            name: tokenName,
            type: 'color',
            groupId: paletteEntryGroupId,
            projectId: nodeBeingUpdated.projectId,
            pageId: nodeBeingUpdated.pageId,
            hue: shadeHue,
            saturation: shadeSaturation,
            lightness: shadeLightness,
            alpha: nodeBeingUpdated.alpha,
            themeValues: (() => {
              if (!activeThemeId) return undefined;
              const tv: { [themeId: string]: { hue: number; saturation: number; lightness: number; alpha: number } } = {};
              const projectThemes = themes.filter(t => t.projectId === nodeBeingUpdated.projectId);
              projectThemes.forEach(theme => {
                tv[theme.id] = {
                  hue: shadeHue,
                  saturation: shadeSaturation,
                  lightness: shadeLightness,
                  alpha: nodeBeingUpdated.alpha,
                };
              });
              return tv;
            })(),
          };

          newTokens.push(token);

          // Compute native color space properties for the shade
          // Derive shade colorSpace from the palette's paletteColorFormat
          const shadeNativeProps: Partial<ColorNode> = {};
          const parentFormat = nodeBeingUpdated.paletteColorFormat || 'HEX';
          const parentColorSpace = ({ 'HEX': 'hsl', 'HSLA': 'hsl', 'OKLCH': 'oklch', 'RGBA': 'rgb' } as Record<string, string>)[parentFormat] || 'hsl';
          if (parentColorSpace === 'oklch') {
            const oklch = hslToOklchUpper(shadeHue, shadeSaturation, shadeLightness);
            shadeNativeProps.oklchL = oklch.L;
            shadeNativeProps.oklchC = oklch.C;
            shadeNativeProps.oklchH = oklch.H;
          } else if (parentColorSpace === 'rgb') {
            const rgb = hslToRgb(shadeHue, shadeSaturation, shadeLightness);
            shadeNativeProps.red = rgb.r;
            shadeNativeProps.green = rgb.g;
            shadeNativeProps.blue = rgb.b;
          } else if (parentColorSpace === 'hct') {
            const rgb = hslToRgb(shadeHue, shadeSaturation, shadeLightness);
            const hct = rgbToHct(rgb.r, rgb.g, rgb.b);
            shadeNativeProps.hctH = hct.hue;
            shadeNativeProps.hctC = hct.chroma;
            shadeNativeProps.hctT = hct.tone;
          }

          const shadeNode: ColorNode = {
            id: `${Date.now()}-shade-${i}-${Math.random()}`,
            colorSpace: parentColorSpace,
            hue: shadeHue,
            saturation: shadeSaturation,
            lightness: shadeLightness,
            alpha: nodeBeingUpdated.alpha,
            position: {
              x: shadeBaseX,
              y: shadeBaseY + i * shadeStride,
            },
            parentId: id,
            hueOffset: shadeHue - nodeBeingUpdated.hue,
            saturationOffset: shadeSaturation - nodeBeingUpdated.saturation,
            lightnessOffset: shadeLightness - nodeBeingUpdated.lightness,
            alphaOffset: 0,
            tokenId: tokenId,
            tokenIds: [tokenId],
            width: 240,
            projectId: nodeBeingUpdated.projectId,
            pageId: nodeBeingUpdated.pageId,
            lockHue: false,
            lockSaturation: false,
            lockLightness: false,
            lockAlpha: false,
            diffHue: false,
            diffSaturation: false,
            diffLightness: false,
            diffAlpha: false,
            isExpanded: false,
            ...shadeNativeProps,
          };

          shadeNodes.push(shadeNode);
        }

        // Add new tokens with ascending sortOrder within the palette group
        setTokens(prevTokens => {
          const existingGroupTokens = prevTokens.filter(t => t.groupId === paletteEntryGroupId);
          const maxSortOrder = existingGroupTokens.reduce((max, t) => Math.max(max, t.sortOrder ?? -1), -1);
          const withSortOrder = newTokens.map((t, i) => ({ ...t, sortOrder: maxSortOrder + 1 + i }));
          return [...prevTokens, ...withSortOrder];
        });

        // Update the palette node and add new shade nodes
        return [
          ...filteredNodes.map(n => n.id === id ? { ...n, ...updates } : n),
          ...shadeNodes
        ];
      }

      // Handle palette lightness/mode/curve/saturation/hueShift/base color changes - regenerate shades
      const isPalettePropertyChange = nodeBeingUpdated.isPalette && (
        updates.paletteLightnessStart !== undefined ||
        updates.paletteLightnessEnd !== undefined ||
        updates.paletteLightnessMode !== undefined ||
        updates.paletteCurveType !== undefined ||
        updates.paletteSaturationMode !== undefined ||
        updates.paletteSaturationStart !== undefined ||
        updates.paletteSaturationEnd !== undefined ||
        updates.paletteHueShift !== undefined ||
        updates.paletteCustomCurvePoints !== undefined
      );
      // Also regenerate shades when base color changes on a palette node
      const isPaletteBaseColorChange = nodeBeingUpdated.isPalette && (
        updates.hue !== undefined ||
        updates.saturation !== undefined ||
        updates.alpha !== undefined
      );
      // Also detect color changes via themeOverrides for non-primary themes
      // Only triggers when the ACTIVE theme's override has color properties
      const isPaletteThemeOverrideColorChange = nodeBeingUpdated.isPalette && updates.themeOverrides !== undefined && (() => {
        const activeOverride = (updates.themeOverrides as any)?.[activeThemeId];
        if (!activeOverride || typeof activeOverride !== 'object') return false;
        return activeOverride.hue !== undefined || activeOverride.saturation !== undefined || activeOverride.lightness !== undefined || activeOverride.alpha !== undefined;
      })();
      if (isPalettePropertyChange || isPaletteBaseColorChange || isPaletteThemeOverrideColorChange) {
        const shadeCount = nodeBeingUpdated.paletteShadeCount ?? 10;
        const lightnessStart = updates.paletteLightnessStart ?? nodeBeingUpdated.paletteLightnessStart ?? 95;
        const lightnessEnd = updates.paletteLightnessEnd ?? nodeBeingUpdated.paletteLightnessEnd ?? 15;
        const curveType = updates.paletteCurveType ?? nodeBeingUpdated.paletteCurveType ?? 'linear';
        const satMode = updates.paletteSaturationMode ?? nodeBeingUpdated.paletteSaturationMode ?? 'constant';

        // Resolve base color: for theme override changes, extract from the override
        let baseHue: number;
        let baseSaturation: number;
        let baseAlpha: number;
        if (isPaletteThemeOverrideColorChange && !isPaletteBaseColorChange) {
          const overrideValues = updates.themeOverrides?.[activeThemeId];
          baseHue = (overrideValues as any)?.hue ?? nodeBeingUpdated.hue;
          baseSaturation = (overrideValues as any)?.saturation ?? nodeBeingUpdated.saturation;
          baseAlpha = (overrideValues as any)?.alpha ?? nodeBeingUpdated.themeOverrides?.[activeThemeId]?.alpha ?? nodeBeingUpdated.alpha ?? 100;
        } else {
          baseHue = updates.hue ?? nodeBeingUpdated.hue;
          baseSaturation = updates.saturation ?? nodeBeingUpdated.saturation;
          baseAlpha = updates.alpha ?? nodeBeingUpdated.alpha ?? 100;
        }

        const satStart = updates.paletteSaturationStart ?? nodeBeingUpdated.paletteSaturationStart ?? baseSaturation;
        const satEnd = updates.paletteSaturationEnd ?? nodeBeingUpdated.paletteSaturationEnd ?? baseSaturation;
        const hueShift = updates.paletteHueShift ?? nodeBeingUpdated.paletteHueShift ?? 0;

        // Curve function
        const applyCurve = (t: number): number => {
          if (curveType === 'custom') {
            const pts = (updates.paletteCustomCurvePoints ?? nodeBeingUpdated.paletteCustomCurvePoints) as number[] | undefined;
            if (pts && pts.length > 0) {
              const idx = t * (pts.length - 1);
              const lo = Math.floor(idx);
              const hi = Math.ceil(idx);
              if (lo === hi || lo >= pts.length - 1) return pts[Math.min(lo, pts.length - 1)];
              const frac = idx - lo;
              return pts[lo] + (pts[hi] - pts[lo]) * frac;
            }
            return t; // fallback to linear if no custom points
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
            default: return t; // linear
          }
        };

        // Saturation function
        const computeSat = (bSat: number, t: number, lightness: number): number => {
          if (satMode === 'constant') return bSat;
          if (satMode === 'manual') return Math.max(0, Math.min(100, satStart + (satEnd - satStart) * t));
          // Auto: reduce at extreme lightness
          const dev = Math.abs(lightness - 50) / 50;
          return Math.max(0, Math.min(100, bSat * (1 - dev * 0.6)));
        };

        // Determine if this is a theme-override-only change (non-primary theme)
        const isThemeOverrideChange = isPaletteThemeOverrideColorChange && !isPaletteBaseColorChange && !isPalettePropertyChange;

        // Check if we also need to update shade theme overrides when palette properties change
        const paletteHasActiveThemeOverride = nodeBeingUpdated.themeOverrides?.[activeThemeId];
        const shouldAlsoUpdateShadeThemeOverrides = !isThemeOverrideChange && isPalettePropertyChange && paletteHasActiveThemeOverride;

        // Theme-specific base color for recalculating shade overrides
        let themeBaseHue = baseHue;
        let themeBaseSaturation = baseSaturation;
        let themeBaseAlpha = baseAlpha;
        if (shouldAlsoUpdateShadeThemeOverrides && paletteHasActiveThemeOverride) {
          themeBaseHue = paletteHasActiveThemeOverride.hue ?? nodeBeingUpdated.hue;
          themeBaseSaturation = paletteHasActiveThemeOverride.saturation ?? nodeBeingUpdated.saturation;
          themeBaseAlpha = paletteHasActiveThemeOverride.alpha ?? nodeBeingUpdated.alpha ?? 100;
        }

        // Collect shade updates for token sync (base values + optional theme-specific values)
        const shadeUpdates: Array<{ nodeId: string; hue: number; saturation: number; lightness: number; alpha: number; themeHue?: number; themeSaturation?: number; themeLightness?: number; themeAlpha?: number }> = [];

        // Update existing shade nodes
        // Determine shade colorSpace from the palette's paletteColorFormat
        const palFormat = updates.paletteColorFormat ?? nodeBeingUpdated.paletteColorFormat ?? 'HEX';
        const formatToCS: Record<string, string> = { 'HEX': 'hsl', 'HSLA': 'hsl', 'OKLCH': 'oklch', 'RGBA': 'rgb' };
        const paletteColorSpace = formatToCS[palFormat as string] || 'hsl';
        const updatedNodes = prev.map(n => {
          if (n.parentId === id) {
            const children = prev.filter(child => child.parentId === id).sort((a, b) => a.position.y - b.position.y);
            const index = children.findIndex(child => child.id === n.id);

            if (index !== -1) {
              const t = shadeCount > 1 ? index / (shadeCount - 1) : 0;
              const curved = applyCurve(t);
              const shadeLightness = lightnessStart + (lightnessEnd - lightnessStart) * curved;
              const shadeSaturation = computeSat(baseSaturation, t, shadeLightness);
              const shadeHue = (baseHue + hueShift * t + 360) % 360;

              // Compute native color space properties for the shade
              const nativeProps: Partial<ColorNode> = { colorSpace: paletteColorSpace as ColorNode['colorSpace'] };
              if (paletteColorSpace === 'oklch') {
                const oklch = hslToOklchUpper(shadeHue, shadeSaturation, shadeLightness);
                nativeProps.oklchL = oklch.L;
                nativeProps.oklchC = oklch.C;
                nativeProps.oklchH = oklch.H;
              } else if (paletteColorSpace === 'rgb') {
                const rgb = hslToRgb(shadeHue, shadeSaturation, shadeLightness);
                nativeProps.red = rgb.r;
                nativeProps.green = rgb.g;
                nativeProps.blue = rgb.b;
              } else if (paletteColorSpace === 'hct') {
                const rgb = hslToRgb(shadeHue, shadeSaturation, shadeLightness);
                const hct = rgbToHct(rgb.r, rgb.g, rgb.b);
                nativeProps.hctH = hct.hue;
                nativeProps.hctC = hct.chroma;
                nativeProps.hctT = hct.tone;
              }

              if (isThemeOverrideChange) {
                // Non-primary theme color change: shade values ARE the theme values
                shadeUpdates.push({ nodeId: n.id, hue: shadeHue, saturation: shadeSaturation, lightness: shadeLightness, alpha: n.alpha ?? 100, themeHue: shadeHue, themeSaturation: shadeSaturation, themeLightness: shadeLightness, themeAlpha: baseAlpha });
                const existingOverrides = n.themeOverrides || {};
                return {
                  ...n,
                  ...nativeProps,
                  themeOverrides: {
                    ...existingOverrides,
                    [activeThemeId]: {
                      hue: shadeHue,
                      saturation: shadeSaturation,
                      lightness: shadeLightness,
                      alpha: baseAlpha,
                    },
                  },
                };
              } else {
                // Primary theme or palette property change: update base values
                const baseUpdate = {
                  ...n,
                  ...nativeProps,
                  hue: shadeHue,
                  saturation: shadeSaturation,
                  lightness: shadeLightness,
                  hueOffset: shadeHue - baseHue,
                  saturationOffset: shadeSaturation - baseSaturation,
                  lightnessOffset: shadeLightness - nodeBeingUpdated.lightness,
                  hexValue: hslToHex(shadeHue, shadeSaturation, shadeLightness),
                };

                if (shouldAlsoUpdateShadeThemeOverrides) {
                  // Also recalculate shade theme overrides using palette's theme colors
                  const themeShadeSat = computeSat(themeBaseSaturation, t, shadeLightness);
                  const themeShadeHue = (themeBaseHue + hueShift * t + 360) % 360;
                  // Include theme-specific values for token sync
                  shadeUpdates.push({ nodeId: n.id, hue: shadeHue, saturation: shadeSaturation, lightness: shadeLightness, alpha: baseAlpha, themeHue: themeShadeHue, themeSaturation: themeShadeSat, themeLightness: shadeLightness, themeAlpha: themeBaseAlpha });
                  const existingOverrides = n.themeOverrides || {};
                  return {
                    ...baseUpdate,
                    alpha: baseAlpha,
                    themeOverrides: {
                      ...existingOverrides,
                      [activeThemeId]: {
                        hue: themeShadeHue,
                        saturation: themeShadeSat,
                        lightness: shadeLightness,
                        alpha: themeBaseAlpha,
                      },
                    },
                  };
                }

                // No theme overrides to update — only base values
                shadeUpdates.push({ nodeId: n.id, hue: shadeHue, saturation: shadeSaturation, lightness: shadeLightness, alpha: baseAlpha });
                return { ...baseUpdate, alpha: baseAlpha };
              }
            }
          }

          return n.id === id ? { ...n, ...updates } : n;
        });

        // Sync tokens with updated shade values
        if (shadeUpdates.length > 0) {
          setTokens(prevTokens => prevTokens.map(token => {
            const shadeUpdate = shadeUpdates.find(su => {
              const shadeNode = prev.find(n => n.id === su.nodeId);
              if (!shadeNode) return false;
              // If theme-specific assignments exist (even if empty = intentionally cleared), use them exclusively
              if (shadeNode.tokenAssignments?.[activeThemeId] !== undefined) {
                return shadeNode.tokenAssignments[activeThemeId].includes(token.id);
              }
              return (shadeNode.tokenIds || []).includes(token.id);
            });
            if (shadeUpdate) {
              // Use theme-specific values if available, otherwise fall back to base values
              const themeH = shadeUpdate.themeHue ?? shadeUpdate.hue;
              const themeS = shadeUpdate.themeSaturation ?? shadeUpdate.saturation;
              const themeL = shadeUpdate.themeLightness ?? shadeUpdate.lightness;
              const themeA = shadeUpdate.themeAlpha ?? shadeUpdate.alpha;

              const updatedThemeValues = { ...token.themeValues };
              updatedThemeValues[activeThemeId] = {
                hue: themeH,
                saturation: themeS,
                lightness: themeL,
                alpha: themeA,
              };
              if (isThemeOverrideChange) {
                // Non-primary theme: only update themeValues, preserve base values
                return {
                  ...token,
                  themeValues: updatedThemeValues,
                };
              } else {
                // Primary theme or palette property: update base values + themeValues
                return {
                  ...token,
                  hue: shadeUpdate.hue,
                  saturation: shadeUpdate.saturation,
                  lightness: shadeUpdate.lightness,
                  alpha: shadeUpdate.alpha,
                  themeValues: updatedThemeValues,
                };
              }
            }
            return token;
          }));
        }

        return updatedNodes;
      }

      // Handle palette re-link to primary: clean up shade nodes' theme overrides
      const isPaletteRelinkToPrimary = nodeBeingUpdated.isPalette && updates.themeOverrides !== undefined && (() => {
        const hadOverride = nodeBeingUpdated.themeOverrides?.[activeThemeId];
        const hasOverride = (updates.themeOverrides as any)?.[activeThemeId];
        return hadOverride && !hasOverride;
      })();
      if (isPaletteRelinkToPrimary) {
        const updatedNodes = prev.map(n => {
          if (n.parentId === id && n.themeOverrides?.[activeThemeId]) {
            const newOverrides = { ...n.themeOverrides };
            delete newOverrides[activeThemeId];
            return { ...n, themeOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : undefined };
          }
          return n.id === id ? { ...n, ...updates } : n;
        });

        // Token values are NOT synced here — node and token inheritance are independent.
        // The user can revert tokens separately via the token inheritance toggle.

        return updatedNodes;
      }

      // Handle palette name or naming pattern changes — rename tokens and group
      const isPaletteNameOrPatternChange = nodeBeingUpdated.isPalette && (
        updates.paletteName !== undefined ||
        updates.paletteNamingPattern !== undefined
      );
      if (isPaletteNameOrPatternChange) {
        const newPaletteName = updates.paletteName ?? nodeBeingUpdated.paletteName ?? 'palette';
        const newNamingPattern = updates.paletteNamingPattern ?? nodeBeingUpdated.paletteNamingPattern ?? '1-9';
        const paletteEntryGroupId = `palette-entry-${id}`;

        // Get shade nodes sorted by position (same order tokens were originally created)
        const shadeNodes = prev.filter(n => n.parentId === id).sort((a, b) => a.position.y - b.position.y);

        // Build a mapping of token ID → new token name
        const tokenRenames = new Map<string, string>();
        shadeNodes.forEach((shade, index) => {
          let shadeName = '';
          switch (newNamingPattern) {
            case '1-9': shadeName = (index + 1).toString(); break;
            case '10-90': shadeName = ((index + 1) * 10).toString(); break;
            case '100-900': shadeName = ((index + 1) * 100).toString(); break;
            case 'a-z': shadeName = String.fromCharCode(97 + index); break;
            default: shadeName = (index + 1).toString();
          }
          const tokenName = `${newPaletteName}/${shadeName}`;

          // Collect all token IDs for this shade (theme-aware + legacy)
          const shadeTokenIds = shade.tokenAssignments?.[activeThemeId] !== undefined
            ? shade.tokenAssignments[activeThemeId]
            : (shade.tokenIds || []);
          shadeTokenIds.forEach(tid => tokenRenames.set(tid, tokenName));
        });

        // Rename tokens with cross-page uniqueness validation
        if (tokenRenames.size > 0) {
          setTokens(prevTokens => {
            const renameIds = new Set(tokenRenames.keys());
            const existingNames = new Set(
              prevTokens
                .filter(t => t.projectId === nodeBeingUpdated.projectId && !renameIds.has(t.id))
                .map(t => t.name.toLowerCase())
            );
            return prevTokens.map(token => {
              const desiredName = tokenRenames.get(token.id);
              if (!desiredName) return token;
              let finalName = desiredName;
              if (existingNames.has(desiredName.toLowerCase())) {
                const copyBase = desiredName + '-copy';
                finalName = copyBase;
                if (existingNames.has(copyBase.toLowerCase())) {
                  for (let i = 1; i <= 999; i++) {
                    const candidate = `${copyBase}-${i}`;
                    if (!existingNames.has(candidate.toLowerCase())) { finalName = candidate; break; }
                  }
                }
              }
              existingNames.add(finalName.toLowerCase());
              return { ...token, name: finalName };
            });
          });
        }

        // Rename palette entry group
        setGroups(prevGroups => prevGroups.map(g =>
          g.id === paletteEntryGroupId ? { ...g, name: newPaletteName } : g
        ));
      }

      // Handle palette colorFormat change — propagate colorSpace to all shade nodes
      // The palette uses `paletteColorFormat` (HEX, HSLA, OKLCH, RGBA) for its display format.
      // Map it to the underlying colorSpace for shade nodes.
      const isPaletteColorFormatChange = nodeBeingUpdated.isPalette && updates.paletteColorFormat !== undefined && updates.paletteColorFormat !== nodeBeingUpdated.paletteColorFormat;
      if (isPaletteColorFormatChange) {
        const formatToColorSpace: Record<string, string> = {
          'HEX': 'hsl', 'HSLA': 'hsl', 'OKLCH': 'oklch', 'RGBA': 'rgb',
        };
        const newColorSpace = formatToColorSpace[updates.paletteColorFormat as string] || 'hsl';
        const updatedNodes = prev.map(n => {
          if (n.parentId === id) {
            // Compute native color space properties from the shade's HSL values
            const shadeUpdate: Partial<ColorNode> = { colorSpace: newColorSpace };
            if (newColorSpace === 'oklch') {
              const oklch = hslToOklchUpper(n.hue, n.saturation, n.lightness);
              shadeUpdate.oklchL = oklch.L;
              shadeUpdate.oklchC = oklch.C;
              shadeUpdate.oklchH = oklch.H;
            } else if (newColorSpace === 'rgb') {
              const rgb = hslToRgb(n.hue, n.saturation, n.lightness);
              shadeUpdate.red = rgb.r;
              shadeUpdate.green = rgb.g;
              shadeUpdate.blue = rgb.b;
            } else if (newColorSpace === 'hct') {
              const rgb = hslToRgb(n.hue, n.saturation, n.lightness);
              const hct = rgbToHct(rgb.r, rgb.g, rgb.b);
              shadeUpdate.hctH = hct.hue;
              shadeUpdate.hctC = hct.chroma;
              shadeUpdate.hctT = hct.tone;
            }
            return { ...n, ...shadeUpdate };
          }
          return n.id === id ? { ...n, ...updates } : n;
        });
        return updatedNodes;
      }

      // ── Handle token prefix referenceName change — cascade to group + descendant tokens ──
      const isTokenPrefixRename = nodeBeingUpdated.isTokenNode && nodeBeingUpdated.isTokenPrefix &&
        updates.referenceName !== undefined && updates.referenceName !== nodeBeingUpdated.referenceName;

      if (isTokenPrefixRename) {
        const newPrefixName = updates.referenceName as string;
        const oldGroupId = nodeBeingUpdated.tokenGroupId;

        // Check if this is a ROOT prefix (no token-node parent)
        const parentNode = nodeBeingUpdated.parentId ? prev.find(n => n.id === nodeBeingUpdated.parentId) : null;
        const isRootPrefix = !parentNode || !parentNode.isTokenNode;

        if (isRootPrefix && oldGroupId) {
          // 1) Find existing group matching new prefix name, or rename current group
          const existingGroup = groups.find(g =>
            g.name === newPrefixName &&
            g.projectId === nodeBeingUpdated.projectId &&
            g.pageId === nodeBeingUpdated.pageId &&
            g.isTokenNodeGroup
          );

          let targetGroupId = oldGroupId;
          let shouldDeleteOldGroup = false;
          let shouldMoveOldGroupTokens = false;

          if (existingGroup && existingGroup.id !== oldGroupId) {
            // Merge into existing group
            targetGroupId = existingGroup.id;
            updates.tokenGroupId = existingGroup.id;

            // Delete old group if no other prefix references it
            const otherPrefixUsingOldGroup = prev.some(n =>
              n.id !== id && n.isTokenPrefix && n.tokenGroupId === oldGroupId
            );
            if (!otherPrefixUsingOldGroup) {
              shouldDeleteOldGroup = true;
              shouldMoveOldGroupTokens = true;
            }
          } else if (!existingGroup) {
            // No matching group — rename the existing group to new prefix name
            setGroups(prevGroups => prevGroups.map(g =>
              g.id === oldGroupId ? { ...g, name: newPrefixName } : g
            ));
          }

          // 2) Build updated node list with prefix rename applied
          const updatedNodes = prev.map(n => n.id === id ? { ...n, ...updates } : n);

          // 3) Recompute descendant token names with uniqueness validation
          const descendants = collectTokenDescendants(id, updatedNodes);

          // Build set of ALL existing token names in this project (across ALL pages)
          // EXCLUDING the descendants' own tokens (since those will be recomputed)
          const descendantOwnTokenIds = new Set<string>();
          descendants.forEach(desc => {
            if (desc.ownTokenId) descendantOwnTokenIds.add(desc.ownTokenId);
          });
          const existingTokenNames = new Set(
            tokens
              .filter(t =>
                t.projectId === nodeBeingUpdated.projectId &&
                !descendantOwnTokenIds.has(t.id)
              )
              .map(t => t.name.toLowerCase())
          );

          const tokenRenames = new Map<string, { name: string; groupId: string }>();
          const nodeUpdates = new Map<string, { referenceName: string; tokenNodeSuffix?: string }>();

          for (const desc of descendants) {
            if (desc.isTokenPrefix) continue; // Skip mid-tree prefixes — they don't own tokens

            const newPath = computeTokenPath(desc, updatedNodes);

            // Validate uniqueness — add "-copy" suffix if name already taken
            let finalName = newPath;
            if (existingTokenNames.has(newPath.toLowerCase())) {
              const copyBase = newPath + '-copy';
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

            // Track node referenceName update + keep tokenNodeSuffix in sync
            const nodeUpdate: { referenceName: string; tokenNodeSuffix?: string } = { referenceName: finalName };
            if (finalName !== newPath) {
              const extra = finalName.slice(newPath.length); // e.g. "-copy" or "-copy-1"
              nodeUpdate.tokenNodeSuffix = (desc.tokenNodeSuffix || '1') + extra;
            }
            nodeUpdates.set(desc.id, nodeUpdate);

            // Track token rename + group reassignment
            if (desc.ownTokenId) {
              tokenRenames.set(desc.ownTokenId, { name: finalName, groupId: targetGroupId });
            }
          }

          // 4) Apply descendant node updates
          const finalNodes = updatedNodes.map(n => {
            const update = nodeUpdates.get(n.id);
            if (update) return { ...n, ...update };
            return n;
          });

          // 5) Apply token renames, group reassignments, and old group cleanup in a single setTokens call
          setTokens(prevTokens => {
            let result = prevTokens.map(t => {
              const rename = tokenRenames.get(t.id);
              if (rename) return { ...t, name: rename.name, groupId: rename.groupId };
              // Move remaining tokens from old group to target group during merge
              if (shouldMoveOldGroupTokens && t.groupId === oldGroupId) {
                return { ...t, groupId: targetGroupId };
              }
              return t;
            });
            return result;
          });

          // Delete old group if needed
          if (shouldDeleteOldGroup) {
            setGroups(prevGroups => prevGroups.filter(g => g.id !== oldGroupId));
          }

          return finalNodes;
        } else if (!isRootPrefix) {
          // ── Mid-tree prefix rename cascade ──
          // When a mid-tree prefix's referenceName changes, we need to:
          // 1. Derive the new tokenNodeSuffix from the new referenceName
          // 2. Recompute all descendant token paths with uniqueness validation
          // 3. Update DesignToken records

          // Derive new suffix: strip the ancestor path prefix from the new referenceName
          const ancestorPath = computeAncestorPath(nodeBeingUpdated, prev);
          const expectedPrefix = ancestorPath ? ancestorPath + '-' : '';
          const newRefName = updates.referenceName as string;
          const newSuffix = expectedPrefix && newRefName.startsWith(expectedPrefix)
            ? newRefName.slice(expectedPrefix.length)
            : newRefName; // User typed something entirely new — use as-is for suffix

          // Also update tokenNodeSuffix so computeTokenPath picks it up
          updates.tokenNodeSuffix = newSuffix;

          // Correct referenceName to the actual full path (ancestorPath + "-" + newSuffix)
          const correctedRefName = expectedPrefix ? expectedPrefix + newSuffix : newSuffix;
          updates.referenceName = correctedRefName;

          // Build updated node list with the mid-tree prefix rename applied
          const updatedNodes = prev.map(n => n.id === id ? { ...n, ...updates } : n);

          // Recompute descendant token names with uniqueness validation
          const descendants = collectTokenDescendants(id, updatedNodes);

          // Build set of existing token names EXCLUDING descendants' own tokens
          const descendantOwnTokenIds = new Set<string>();
          descendants.forEach(desc => {
            if (desc.ownTokenId) descendantOwnTokenIds.add(desc.ownTokenId);
          });
          const existingTokenNames = new Set(
            tokens
              .filter(t =>
                t.projectId === nodeBeingUpdated.projectId &&
                !descendantOwnTokenIds.has(t.id)
              )
              .map(t => t.name.toLowerCase())
          );

          const tokenRenames = new Map<string, string>();
          const nodeUpdates = new Map<string, { referenceName: string; tokenNodeSuffix?: string }>();

          for (const desc of descendants) {
            // Recompute path for ALL descendants (including mid-tree prefix sub-descendants)
            const newPath = computeTokenPath(desc, updatedNodes);

            if (desc.isTokenPrefix) {
              // Mid-tree prefix descendant: update its referenceName to the new full path
              // (tokenNodeSuffix stays unchanged — only this node's ancestor changed)
              nodeUpdates.set(desc.id, { referenceName: newPath });
              continue;
            }

            // Leaf child: validate uniqueness
            let finalName = newPath;
            if (existingTokenNames.has(newPath.toLowerCase())) {
              const copyBase = newPath + '-copy';
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

            // Track node update
            const nodeUpdate: { referenceName: string; tokenNodeSuffix?: string } = { referenceName: finalName };
            if (finalName !== newPath) {
              const extra = finalName.slice(newPath.length);
              nodeUpdate.tokenNodeSuffix = (desc.tokenNodeSuffix || '1') + extra;
            }
            nodeUpdates.set(desc.id, nodeUpdate);

            // Track token rename
            if (desc.ownTokenId) {
              tokenRenames.set(desc.ownTokenId, finalName);
            }
          }

          // Apply descendant node updates
          const finalNodes = updatedNodes.map(n => {
            const update = nodeUpdates.get(n.id);
            if (update) return { ...n, ...update };
            return n;
          });

          // Apply token renames
          if (tokenRenames.size > 0) {
            setTokens(prevTokens => prevTokens.map(t => {
              const newName = tokenRenames.get(t.id);
              if (newName) return { ...t, name: newName };
              return t;
            }));
          }

          return finalNodes;
        }
      }

      // ── Handle non-prefix token child referenceName change — update own token + cascade descendants ──
      const isTokenChildRename = nodeBeingUpdated.isTokenNode && !nodeBeingUpdated.isTokenPrefix &&
        updates.referenceName !== undefined && updates.referenceName !== nodeBeingUpdated.referenceName;

      if (isTokenChildRename) {
        const newChildRefName = updates.referenceName as string;

        // Derive tokenNodeSuffix from the new referenceName if not provided
        // (e.g., when rename comes from InlineRefLabel which only sends referenceName)
        if (updates.tokenNodeSuffix === undefined) {
          const ancestorPath = computeAncestorPath(nodeBeingUpdated, prev);
          const expectedPrefix = ancestorPath ? ancestorPath + '-' : '';
          if (expectedPrefix && newChildRefName.startsWith(expectedPrefix)) {
            updates.tokenNodeSuffix = newChildRefName.slice(expectedPrefix.length);
          } else {
            updates.tokenNodeSuffix = newChildRefName; // Fallback: use entire name as suffix
          }
        }

        // Build set of existing token names EXCLUDING this node's and descendants' own tokens
        const tempUpdatedNodes = prev.map(n => n.id === id ? { ...n, ...updates } : n);
        const descendants = collectTokenDescendants(id, tempUpdatedNodes);

        const excludedTokenIds = new Set<string>();
        if (nodeBeingUpdated.ownTokenId) excludedTokenIds.add(nodeBeingUpdated.ownTokenId);
        descendants.forEach(desc => {
          if (desc.ownTokenId) excludedTokenIds.add(desc.ownTokenId);
        });
        const existingTokenNames = new Set(
          tokens
            .filter(t =>
              t.projectId === nodeBeingUpdated.projectId &&
              !excludedTokenIds.has(t.id)
            )
            .map(t => t.name.toLowerCase())
        );

        const tokenRenames = new Map<string, string>();
        const nodeUpdates = new Map<string, { referenceName: string; tokenNodeSuffix?: string }>();

        // Uniqueness helper
        const deduplicateName = (computedPath: string): string => {
          let finalName = computedPath;
          if (existingTokenNames.has(computedPath.toLowerCase())) {
            const copyBase = computedPath + '-copy';
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
          return finalName;
        };

        // Handle this node's own token
        if (nodeBeingUpdated.ownTokenId) {
          const thisNodeFinalName = deduplicateName(newChildRefName);
          tokenRenames.set(nodeBeingUpdated.ownTokenId, thisNodeFinalName);

          // If name changed due to dedup, update the node's referenceName and tokenNodeSuffix
          if (thisNodeFinalName !== newChildRefName) {
            const extra = thisNodeFinalName.slice(newChildRefName.length);
            updates.referenceName = thisNodeFinalName;
            updates.tokenNodeSuffix = (updates.tokenNodeSuffix || nodeBeingUpdated.tokenNodeSuffix || '1') + extra;
          }
        }

        // Handle descendants (if any)
        const updatedNodesWithThis = prev.map(n => n.id === id ? { ...n, ...updates } : n);
        for (const desc of descendants) {
          const newPath = computeTokenPath(desc, updatedNodesWithThis);

          if (desc.isTokenPrefix) {
            nodeUpdates.set(desc.id, { referenceName: newPath });
            continue;
          }

          const finalName = deduplicateName(newPath);
          const nodeUpdate: { referenceName: string; tokenNodeSuffix?: string } = { referenceName: finalName };
          if (finalName !== newPath) {
            const extra = finalName.slice(newPath.length);
            nodeUpdate.tokenNodeSuffix = (desc.tokenNodeSuffix || '1') + extra;
          }
          nodeUpdates.set(desc.id, nodeUpdate);

          if (desc.ownTokenId) {
            tokenRenames.set(desc.ownTokenId, finalName);
          }
        }

        // Apply descendant node updates
        const finalNodes = updatedNodesWithThis.map(n => {
          const update = nodeUpdates.get(n.id);
          if (update) return { ...n, ...update };
          return n;
        });

        // Apply token renames
        if (tokenRenames.size > 0) {
          setTokens(prevTokens => prevTokens.map(t => {
            const newName = tokenRenames.get(t.id);
            if (newName) return { ...t, name: newName };
            return t;
          }));
        }

        return finalNodes;
      }

      // Track deltas for all color properties
      let hueOffsetDelta = 0;
      let satOffsetDelta = 0;
      let lightOffsetDelta = 0;
      let alphaOffsetDelta = 0;
      let redOffsetDelta = 0;
      let greenOffsetDelta = 0;
      let blueOffsetDelta = 0;
      let oklchLOffsetDelta = 0;
      let oklchCOffsetDelta = 0;
      let oklchHOffsetDelta = 0;
      let hctHOffsetDelta = 0;
      let hctCOffsetDelta = 0;
      let hctTOffsetDelta = 0;

      // Check if we're in a non-primary theme and the node has a theme override
      const currentTheme = themes.find(t => t.id === activeThemeId);
      const isInNonPrimaryTheme = currentTheme && !currentTheme.isPrimary;
      const hasThemeOverride = isInNonPrimaryTheme && nodeBeingUpdated.themeOverrides?.[activeThemeId];

      // Get the current values (from theme override if exists, otherwise from base node)
      const currentHue = hasThemeOverride ? nodeBeingUpdated.themeOverrides![activeThemeId].hue : nodeBeingUpdated.hue;
      const currentSat = hasThemeOverride ? nodeBeingUpdated.themeOverrides![activeThemeId].saturation : nodeBeingUpdated.saturation;
      const currentLight = hasThemeOverride ? nodeBeingUpdated.themeOverrides![activeThemeId].lightness : nodeBeingUpdated.lightness;
      const currentAlpha = hasThemeOverride ? nodeBeingUpdated.themeOverrides![activeThemeId].alpha : nodeBeingUpdated.alpha;
      const currentRed = hasThemeOverride && nodeBeingUpdated.themeOverrides![activeThemeId].red !== undefined
        ? nodeBeingUpdated.themeOverrides![activeThemeId].red
        : nodeBeingUpdated.red;
      const currentGreen = hasThemeOverride && nodeBeingUpdated.themeOverrides![activeThemeId].green !== undefined
        ? nodeBeingUpdated.themeOverrides![activeThemeId].green
        : nodeBeingUpdated.green;
      const currentBlue = hasThemeOverride && nodeBeingUpdated.themeOverrides![activeThemeId].blue !== undefined
        ? nodeBeingUpdated.themeOverrides![activeThemeId].blue
        : nodeBeingUpdated.blue;
      const currentOklchL = hasThemeOverride && nodeBeingUpdated.themeOverrides![activeThemeId].oklchL !== undefined
        ? nodeBeingUpdated.themeOverrides![activeThemeId].oklchL
        : nodeBeingUpdated.oklchL;
      const currentOklchC = hasThemeOverride && nodeBeingUpdated.themeOverrides![activeThemeId].oklchC !== undefined
        ? nodeBeingUpdated.themeOverrides![activeThemeId].oklchC
        : nodeBeingUpdated.oklchC;
      const currentOklchH = hasThemeOverride && nodeBeingUpdated.themeOverrides![activeThemeId].oklchH !== undefined
        ? nodeBeingUpdated.themeOverrides![activeThemeId].oklchH
        : nodeBeingUpdated.oklchH;
      const currentHctH = hasThemeOverride && nodeBeingUpdated.themeOverrides![activeThemeId].hctH !== undefined
        ? nodeBeingUpdated.themeOverrides![activeThemeId].hctH
        : nodeBeingUpdated.hctH;
      const currentHctC = hasThemeOverride && nodeBeingUpdated.themeOverrides![activeThemeId].hctC !== undefined
        ? nodeBeingUpdated.themeOverrides![activeThemeId].hctC
        : nodeBeingUpdated.hctC;
      const currentHctT = hasThemeOverride && nodeBeingUpdated.themeOverrides![activeThemeId].hctT !== undefined
        ? nodeBeingUpdated.themeOverrides![activeThemeId].hctT
        : nodeBeingUpdated.hctT;

      // HSL deltas - calculate from theme-aware current values
      if (updates.hue !== undefined) {
        hueOffsetDelta = updates.hue - currentHue;
      }
      if (updates.saturation !== undefined) {
        satOffsetDelta = updates.saturation - currentSat;
      }
      if (updates.lightness !== undefined) {
        lightOffsetDelta = updates.lightness - currentLight;
      }
      if (updates.alpha !== undefined) {
        alphaOffsetDelta = updates.alpha - currentAlpha;
      }

      // RGB deltas
      if (updates.red !== undefined && currentRed !== undefined) {
        redOffsetDelta = updates.red - currentRed;
      }
      if (updates.green !== undefined && currentGreen !== undefined) {
        greenOffsetDelta = updates.green - currentGreen;
      }
      if (updates.blue !== undefined && currentBlue !== undefined) {
        blueOffsetDelta = updates.blue - currentBlue;
      }

      // OKLCH deltas
      if (updates.oklchL !== undefined && currentOklchL !== undefined) {
        oklchLOffsetDelta = updates.oklchL - currentOklchL;
      }
      if (updates.oklchC !== undefined && currentOklchC !== undefined) {
        oklchCOffsetDelta = updates.oklchC - currentOklchC;
      }
      if (updates.oklchH !== undefined && currentOklchH !== undefined) {
        oklchHOffsetDelta = updates.oklchH - currentOklchH;
      }

      // HCT deltas
      if (updates.hctH !== undefined && currentHctH !== undefined) {
        hctHOffsetDelta = updates.hctH - currentHctH;
      }
      if (updates.hctC !== undefined && currentHctC !== undefined) {
        hctCOffsetDelta = updates.hctC - currentHctC;
      }
      if (updates.hctT !== undefined && currentHctT !== undefined) {
        hctTOffsetDelta = updates.hctT - currentHctT;
      }

      // Apply updates - if in non-primary theme with override, update the override instead of base properties
      const updatedNodes = prev.map((node) => {
        if (node.id !== id) return node;

        // Create a copy of updates that we can augment with derived values
        let augmentedUpdates = { ...updates };

        // Auto-calculate HSL values for non-HSL color spaces to ensure consistency
        // This is critical for the TokensPanel which relies on HSL values
        if (node.colorSpace === 'rgb' && (updates.red !== undefined || updates.green !== undefined || updates.blue !== undefined)) {
          // Get effective RGB values (mix of updates and existing state)
          // If in override mode, read from override, otherwise from node
          const source = (hasThemeOverride && activeThemeId) ? node.themeOverrides?.[activeThemeId] || node : node;

          const r = updates.red !== undefined ? updates.red : (source.red ?? 0);
          const g = updates.green !== undefined ? updates.green : (source.green ?? 0);
          const b = updates.blue !== undefined ? updates.blue : (source.blue ?? 0);

          const hsl = rgbToHsl(r, g, b);
          augmentedUpdates.hue = hsl.h;
          augmentedUpdates.saturation = hsl.s;
          augmentedUpdates.lightness = hsl.l;
        } else if (node.colorSpace === 'oklch' && (updates.oklchL !== undefined || updates.oklchC !== undefined || updates.oklchH !== undefined)) {
          const source = (hasThemeOverride && activeThemeId) ? node.themeOverrides?.[activeThemeId] || node : node;

          const l = updates.oklchL !== undefined ? updates.oklchL : (source.oklchL ?? 0);
          const c = updates.oklchC !== undefined ? updates.oklchC : (source.oklchC ?? 0);
          const h = updates.oklchH !== undefined ? updates.oklchH : (source.oklchH ?? 0);

          const hsl = oklchToHsl(l, c, h);
          augmentedUpdates.hue = hsl.h;
          augmentedUpdates.saturation = hsl.s;
          augmentedUpdates.lightness = hsl.l;
        } else if (node.colorSpace === 'hct' && (updates.hctH !== undefined || updates.hctC !== undefined || updates.hctT !== undefined)) {
          const source = (hasThemeOverride && activeThemeId) ? node.themeOverrides?.[activeThemeId] || node : node;

          const h = updates.hctH !== undefined ? updates.hctH : (source.hctH ?? 0);
          const c = updates.hctC !== undefined ? updates.hctC : (source.hctC ?? 0);
          const t = updates.hctT !== undefined ? updates.hctT : (source.hctT ?? 0);

          const rgb = hctToRgb(h, c, t);
          const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
          augmentedUpdates.hue = hsl.h;
          augmentedUpdates.saturation = hsl.s;
          augmentedUpdates.lightness = hsl.l;
        }

        // If themeOverrides is explicitly being updated (e.g., when linking/unlinking), apply it directly
        if (augmentedUpdates.themeOverrides !== undefined) {
          return { ...node, ...augmentedUpdates };
        }

        // If we're in a non-primary theme and the node has a theme override,
        // apply color/spacing updates to the theme override instead of base properties
        if (hasThemeOverride && activeThemeId) {
          const themeOverride = { ...node.themeOverrides![activeThemeId] };

          // Update theme override with color properties if they exist in augmentedUpdates
          if (augmentedUpdates.hue !== undefined) themeOverride.hue = augmentedUpdates.hue;
          if (augmentedUpdates.saturation !== undefined) themeOverride.saturation = augmentedUpdates.saturation;
          if (augmentedUpdates.lightness !== undefined) themeOverride.lightness = augmentedUpdates.lightness;
          if (augmentedUpdates.alpha !== undefined) themeOverride.alpha = augmentedUpdates.alpha;
          if (augmentedUpdates.red !== undefined) themeOverride.red = augmentedUpdates.red;
          if (augmentedUpdates.green !== undefined) themeOverride.green = augmentedUpdates.green;
          if (augmentedUpdates.blue !== undefined) themeOverride.blue = augmentedUpdates.blue;
          if (augmentedUpdates.oklchL !== undefined) themeOverride.oklchL = augmentedUpdates.oklchL;
          if (augmentedUpdates.oklchC !== undefined) themeOverride.oklchC = augmentedUpdates.oklchC;
          if (augmentedUpdates.oklchH !== undefined) themeOverride.oklchH = augmentedUpdates.oklchH;
          if (augmentedUpdates.hctH !== undefined) themeOverride.hctH = augmentedUpdates.hctH;
          if (augmentedUpdates.hctC !== undefined) themeOverride.hctC = augmentedUpdates.hctC;
          if (augmentedUpdates.hctT !== undefined) themeOverride.hctT = augmentedUpdates.hctT;
          if (augmentedUpdates.hexValue !== undefined) themeOverride.hexValue = augmentedUpdates.hexValue;

          // Recompute hexValue for theme override when color properties change
          // (same logic as the reactive loop's hex sync, but applied here for immediate consistency)
          const hasColorChange = augmentedUpdates.hue !== undefined || augmentedUpdates.saturation !== undefined ||
            augmentedUpdates.lightness !== undefined || augmentedUpdates.red !== undefined ||
            augmentedUpdates.green !== undefined || augmentedUpdates.blue !== undefined ||
            augmentedUpdates.oklchL !== undefined || augmentedUpdates.oklchC !== undefined ||
            augmentedUpdates.oklchH !== undefined || augmentedUpdates.hctH !== undefined ||
            augmentedUpdates.hctC !== undefined || augmentedUpdates.hctT !== undefined;
          if (hasColorChange && !node.hexLocked && augmentedUpdates.hexValue === undefined) {
            const cs = node.colorSpace || 'hsl';
            if (cs === 'hsl' || cs === 'hex') {
              themeOverride.hexValue = hslToHex(
                themeOverride.hue ?? node.hue,
                themeOverride.saturation ?? node.saturation,
                themeOverride.lightness ?? node.lightness
              );
            } else if (cs === 'rgb') {
              themeOverride.hexValue = rgbToHex(
                themeOverride.red ?? node.red ?? 0,
                themeOverride.green ?? node.green ?? 0,
                themeOverride.blue ?? node.blue ?? 0
              );
            } else if (cs === 'oklch') {
              const oL = themeOverride.oklchL ?? node.oklchL ?? 0;
              const oC = themeOverride.oklchC ?? node.oklchC ?? 0;
              const oH = themeOverride.oklchH ?? node.oklchH ?? 0;
              themeOverride.hexValue = oklchToHex(oL, oC, oH);
            } else if (cs === 'hct') {
              const hH = themeOverride.hctH ?? node.hctH ?? 0;
              const hC = themeOverride.hctC ?? node.hctC ?? 0;
              const hT = themeOverride.hctT ?? node.hctT ?? 0;
              themeOverride.hexValue = hctToHex(hH, hC, hT);
            }
          }

          // Create a copy of augmentedUpdates without the color properties (they go in theme override)
          const nonColorUpdates = { ...augmentedUpdates };
          delete nonColorUpdates.hue;
          delete nonColorUpdates.saturation;
          delete nonColorUpdates.lightness;
          delete nonColorUpdates.alpha;
          delete nonColorUpdates.red;
          delete nonColorUpdates.green;
          delete nonColorUpdates.blue;
          delete nonColorUpdates.oklchL;
          delete nonColorUpdates.oklchC;
          delete nonColorUpdates.oklchH;
          delete nonColorUpdates.hctH;
          delete nonColorUpdates.hctC;
          delete nonColorUpdates.hctT;
          delete nonColorUpdates.hexValue;

          return {
            ...node,
            ...nonColorUpdates, // Apply non-color updates to base node
            themeOverrides: {
              ...node.themeOverrides,
              [activeThemeId]: themeOverride,
            },
          };
        }

        // For primary theme or nodes without overrides, apply updates normally
        return { ...node, ...augmentedUpdates };
      });

      // Propagate changes to descendants
      const hasChanges =
        updates.hue !== undefined || updates.saturation !== undefined ||
        updates.lightness !== undefined || updates.alpha !== undefined ||
        updates.red !== undefined || updates.green !== undefined || updates.blue !== undefined ||
        updates.oklchL !== undefined || updates.oklchC !== undefined || updates.oklchH !== undefined ||
        updates.hctH !== undefined || updates.hctC !== undefined || updates.hctT !== undefined;

      // Calculate propagated values for ALL descendants FIRST
      // This mutates updatedNodes in place so that setTokens sees the correct child values
      if (hasChanges) {
        const propagateToDescendants = (
          parentId: string,
          hueChange: number, satChange: number, lightChange: number, alphaChange: number,
          redChange: number, greenChange: number, blueChange: number,
          oklchLChange: number, oklchCChange: number, oklchHChange: number,
          hctHChange: number, hctCChange: number, hctTChange: number
        ) => {
          // If the parent is a palette node, regenerate its shades instead of normal propagation
          const parentNodeCheck = updatedNodes.find(n => n.id === parentId);
          if (parentNodeCheck?.isPalette) {
            regeneratePaletteShades(parentNodeCheck, updatedNodes);
            return;
          }

          // Find all children indices first to safely mutate array
          const childIndices: number[] = [];
          updatedNodes.forEach((node, index) => {
            if (node.parentId === parentId) {
              childIndices.push(index);
            }
          });

          // Process each child by index
          childIndices.forEach((childIndex) => {
            const node = updatedNodes[childIndex];
            const parentNode = updatedNodes.find(n => n.id === parentId);
            if (!parentNode) return;

            // ─── Palette child handling ───
            // If this child is a palette node, update its base color and regenerate shades
            if (node.isPalette) {
              const paletteUpdates: Partial<ColorNode> = {};

              if (parentNode.colorSpace === 'hsl' || !parentNode.colorSpace) {
                if (!node.lockHue && hueChange !== 0) {
                  paletteUpdates.hue = node.diffHue === false ? parentNode.hue : (node.hue + hueChange + 360) % 360;
                }
                if (!node.lockSaturation && satChange !== 0) {
                  paletteUpdates.saturation = node.diffSaturation === false ? parentNode.saturation : Math.max(0, Math.min(100, node.saturation + satChange));
                }
                if (!node.lockLightness && lightChange !== 0) {
                  paletteUpdates.lightness = node.diffLightness === false ? parentNode.lightness : Math.max(0, Math.min(100, node.lightness + lightChange));
                }
                if (!node.lockAlpha && alphaChange !== 0) {
                  paletteUpdates.alpha = node.diffAlpha === false ? parentNode.alpha : Math.max(0, Math.min(100, node.alpha + alphaChange));
                }
              } else {
                // Cross-color-space: convert parent color to HSL for palette base
                let pH = parentNode.hue, pS = parentNode.saturation, pL = parentNode.lightness;
                if (parentNode.colorSpace === 'rgb') {
                  const hsl = rgbToHsl(parentNode.red || 0, parentNode.green || 0, parentNode.blue || 0);
                  pH = hsl.h; pS = hsl.s; pL = hsl.l;
                } else if (parentNode.colorSpace === 'oklch') {
                  const hsl = oklchToHsl(parentNode.oklchL || 0, parentNode.oklchC || 0, parentNode.oklchH || 0);
                  pH = hsl.h; pS = hsl.s; pL = hsl.l;
                } else if (parentNode.colorSpace === 'hex' && parentNode.hexValue) {
                  const hsl = hexToHsl(parentNode.hexValue);
                  pH = hsl.h; pS = hsl.s; pL = hsl.l;
                } else if (parentNode.colorSpace === 'hct') {
                  const rgb = hctToRgb(parentNode.hctH || 0, parentNode.hctC || 0, parentNode.hctT || 0);
                  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
                  pH = hsl.h; pS = hsl.s; pL = hsl.l;
                }
                paletteUpdates.hue = pH;
                paletteUpdates.saturation = pS;
                paletteUpdates.lightness = pL;
              }

              const updatedPalette = { ...node, ...paletteUpdates };
              updatedNodes[childIndex] = updatedPalette;
              regeneratePaletteShades(updatedPalette, updatedNodes);
              return;
            }

            // Check if we're in a non-primary theme with both parent and child unlinked
            const currentTheme = themes.find(t => t.id === activeThemeId);
            const isInNonPrimaryTheme = currentTheme && !currentTheme.isPrimary;
            const parentHasOverride = isInNonPrimaryTheme && parentNode.themeOverrides?.[activeThemeId];
            const childHasOverride = isInNonPrimaryTheme && node.themeOverrides?.[activeThemeId];

            // If both are unlinked in a non-primary theme, use theme-specific values
            if (parentHasOverride && childHasOverride) {
              const parentOverride = parentNode.themeOverrides![activeThemeId];
              const childOverride = { ...node.themeOverrides![activeThemeId] }; // Create a mutable copy

              // Handle HSL propagation with theme overrides
              if (parentNode.colorSpace === 'hsl' || !parentNode.colorSpace) {
                if (hueChange !== 0 && !node.lockHue) {
                  // Update child's theme override hue
                  if (node.diffHue === false) {
                    childOverride.hue = parentOverride.hue;
                  } else {
                    childOverride.hue = (childOverride.hue + hueChange + 360) % 360;
                  }
                }

                if (satChange !== 0 && !node.lockSaturation) {
                  if (node.diffSaturation === false) {
                    childOverride.saturation = parentOverride.saturation;
                  } else {
                    childOverride.saturation = Math.max(0, Math.min(100, childOverride.saturation + satChange));
                  }
                }

                if (lightChange !== 0 && !node.lockLightness) {
                  if (node.diffLightness === false) {
                    childOverride.lightness = parentOverride.lightness;
                  } else {
                    childOverride.lightness = Math.max(0, Math.min(100, childOverride.lightness + lightChange));
                  }
                }

                if (alphaChange !== 0 && !node.lockAlpha) {
                  if (node.diffAlpha === false) {
                    childOverride.alpha = parentOverride.alpha;
                  } else {
                    childOverride.alpha = Math.max(0, Math.min(100, childOverride.alpha + alphaChange));
                  }
                }
              }

              // Handle RGB propagation with theme overrides
              if (parentNode.colorSpace === 'rgb' && childOverride.red !== undefined) {
                if (redChange !== 0 && !node.lockRed && parentOverride.red !== undefined) {
                  if (node.diffRed === false) {
                    childOverride.red = parentOverride.red;
                  } else {
                    childOverride.red = Math.max(0, Math.min(255, childOverride.red + redChange));
                  }
                }

                if (greenChange !== 0 && !node.lockGreen && parentOverride.green !== undefined) {
                  if (node.diffGreen === false) {
                    childOverride.green = parentOverride.green;
                  } else {
                    childOverride.green = Math.max(0, Math.min(255, childOverride.green + greenChange));
                  }
                }

                if (blueChange !== 0 && !node.lockBlue && parentOverride.blue !== undefined) {
                  if (node.diffBlue === false) {
                    childOverride.blue = parentOverride.blue;
                  } else {
                    childOverride.blue = Math.max(0, Math.min(255, childOverride.blue + blueChange));
                  }
                }

                if (alphaChange !== 0 && !node.lockAlpha) {
                  if (node.diffAlpha === false) {
                    childOverride.alpha = parentOverride.alpha;
                  } else {
                    childOverride.alpha = Math.max(0, Math.min(100, childOverride.alpha + alphaChange));
                  }
                }
              }

              // Handle OKLCH propagation with theme overrides
              if (parentNode.colorSpace === 'oklch' && childOverride.oklchL !== undefined) {
                if (oklchLChange !== 0 && !node.lockOklchL && parentOverride.oklchL !== undefined) {
                  if (node.diffOklchL === false) {
                    childOverride.oklchL = parentOverride.oklchL;
                  } else {
                    childOverride.oklchL = Math.max(0, Math.min(100, childOverride.oklchL + oklchLChange));
                  }
                }

                if (oklchCChange !== 0 && !node.lockOklchC && parentOverride.oklchC !== undefined) {
                  if (node.diffOklchC === false) {
                    childOverride.oklchC = parentOverride.oklchC;
                  } else {
                    childOverride.oklchC = Math.max(0, Math.min(100, childOverride.oklchC + oklchCChange));
                  }
                }

                if (oklchHChange !== 0 && !node.lockOklchH && parentOverride.oklchH !== undefined) {
                  if (node.diffOklchH === false) {
                    childOverride.oklchH = parentOverride.oklchH;
                  } else {
                    childOverride.oklchH = (childOverride.oklchH + oklchHChange + 360) % 360;
                  }
                }

                if (alphaChange !== 0 && !node.lockAlpha) {
                  if (node.diffAlpha === false) {
                    childOverride.alpha = parentOverride.alpha;
                  } else {
                    childOverride.alpha = Math.max(0, Math.min(100, childOverride.alpha + alphaChange));
                  }
                }
              }

              // Handle HCT propagation with theme overrides
              if (parentNode.colorSpace === 'hct' && childOverride.hctH !== undefined) {
                if (hctHChange !== 0 && !node.lockHctH && parentOverride.hctH !== undefined) {
                  if (node.diffHctH === false) {
                    childOverride.hctH = parentOverride.hctH;
                  } else {
                    childOverride.hctH = (childOverride.hctH + hctHChange + 360) % 360;
                  }
                }

                if (hctCChange !== 0 && !node.lockHctC && parentOverride.hctC !== undefined) {
                  if (node.diffHctC === false) {
                    childOverride.hctC = parentOverride.hctC;
                  } else {
                    childOverride.hctC = Math.max(0, Math.min(100, childOverride.hctC + hctCChange));
                  }
                }

                if (hctTChange !== 0 && !node.lockHctT && parentOverride.hctT !== undefined) {
                  if (node.diffHctT === false) {
                    childOverride.hctT = parentOverride.hctT;
                  } else {
                    childOverride.hctT = Math.max(0, Math.min(100, childOverride.hctT + hctTChange));
                  }
                }

                if (alphaChange !== 0 && !node.lockAlpha) {
                  if (node.diffAlpha === false) {
                    childOverride.alpha = parentOverride.alpha;
                  } else {
                    childOverride.alpha = Math.max(0, Math.min(100, childOverride.alpha + alphaChange));
                  }
                }
              }

              // Update the node in the array with the modified theme override
              updatedNodes[childIndex] = {
                ...node,
                themeOverrides: {
                  ...node.themeOverrides,
                  [activeThemeId]: childOverride
                }
              };

              // Recursively propagate to grandchildren
              propagateToDescendants(
                node.id,
                hueChange, satChange, lightChange, alphaChange,
                redChange, greenChange, blueChange,
                oklchLChange, oklchCChange, oklchHChange,
                hctHChange, hctCChange, hctTChange
              );

              return; // Skip the regular propagation logic below
            }

            // Check if parent and child have different color spaces
            const differentColorSpace = parentNode.colorSpace !== node.colorSpace;

            // Skip propagation for locked hex nodes
            if (node.colorSpace === 'hex' && node.hexLocked) {
              // Locked hex nodes don't inherit from parent
              return;
            }

            if (differentColorSpace) {
              // Cross-color-space conversion - convert parent's color to child's color space
              // ... (Logic continues in next block) ...
              // BUT we need to update the node in updatedNodes array immediately
              // The previous code block was doing it, but let's ensure we capture the changes

              // Temporary variable to hold changes
              const updates: Partial<ColorNode> = {};

              if (parentNode.colorSpace === 'hsl' && node.colorSpace === 'rgb') {
                // HSL parent -> RGB child
                const rgb = hslToRgb(parentNode.hue, parentNode.saturation, parentNode.lightness);
                if (!node.lockRed) updates.red = rgb.r;
                if (!node.lockGreen) updates.green = rgb.g;
                if (!node.lockBlue) updates.blue = rgb.b;
                if (alphaChange !== 0 && !node.lockAlpha) {
                  updates.alpha = parentNode.alpha ?? 100;
                }
              } else if (parentNode.colorSpace === 'hsl' && node.colorSpace === 'hex') {
                // HSL parent -> HEX child
                if (!node.hexLocked) {
                  updates.hexValue = hslToHex(parentNode.hue, parentNode.saturation, parentNode.lightness);
                  // Also update HSL values for internal consistency
                  updates.hue = parentNode.hue;
                  updates.saturation = parentNode.saturation;
                  updates.lightness = parentNode.lightness;
                }
                if (alphaChange !== 0 && !node.lockAlpha) {
                  updates.alpha = parentNode.alpha ?? 100;
                }
              } else if (parentNode.colorSpace === 'hsl' && node.colorSpace === 'oklch') {
                // HSL parent -> OKLCH child
                const oklch = hslToOklchUpper(parentNode.hue, parentNode.saturation, parentNode.lightness);
                if (!node.lockOklchL) updates.oklchL = oklch.L;
                if (!node.lockOklchC) updates.oklchC = oklch.C;
                if (!node.lockOklchH) updates.oklchH = oklch.H;
                if (alphaChange !== 0 && !node.lockAlpha) {
                  updates.alpha = parentNode.alpha ?? 100;
                }
              } else if (parentNode.colorSpace === 'rgb' && node.colorSpace === 'hsl') {
                // RGB parent -> HSL child
                const hsl = rgbToHsl(parentNode.red || 0, parentNode.green || 0, parentNode.blue || 0);
                if (!node.lockHue) updates.hue = hsl.h;
                if (!node.lockSaturation) updates.saturation = hsl.s;
                if (!node.lockLightness) updates.lightness = hsl.l;
                if (alphaChange !== 0 && !node.lockAlpha) {
                  updates.alpha = parentNode.alpha ?? 100;
                }
              } else if (parentNode.colorSpace === 'rgb' && node.colorSpace === 'hex') {
                // RGB parent -> HEX child
                if (!node.hexLocked) {
                  updates.hexValue = rgbToHex(parentNode.red || 0, parentNode.green || 0, parentNode.blue || 0);
                  // Also update HSL values for internal consistency
                  const hsl = rgbToHsl(parentNode.red || 0, parentNode.green || 0, parentNode.blue || 0);
                  updates.hue = hsl.h;
                  updates.saturation = hsl.s;
                  updates.lightness = hsl.l;
                }
                if (alphaChange !== 0 && !node.lockAlpha) {
                  updates.alpha = parentNode.alpha ?? 100;
                }
              } else if (parentNode.colorSpace === 'rgb' && node.colorSpace === 'oklch') {
                // RGB parent -> OKLCH child
                const oklch = rgbToOklch(parentNode.red || 0, parentNode.green || 0, parentNode.blue || 0);
                if (!node.lockOklchL) updates.oklchL = oklch.L;
                if (!node.lockOklchC) updates.oklchC = oklch.C;
                if (!node.lockOklchH) updates.oklchH = oklch.H;
                if (alphaChange !== 0 && !node.lockAlpha) {
                  updates.alpha = parentNode.alpha ?? 100;
                }
              } else if (parentNode.colorSpace === 'hex' && node.colorSpace === 'hsl') {
                // HEX parent -> HSL child
                // Get the hex value from parent
                let hexValue = parentNode.hexValue;
                if (!hexValue && parentNode.hue !== undefined) {
                  // Fallback: calculate from HSL if hexValue not set
                  hexValue = hslToHex(parentNode.hue, parentNode.saturation, parentNode.lightness);
                }
                if (hexValue) {
                  const hsl = hexToHsl(hexValue);
                  if (!node.lockHue) updates.hue = hsl.h;
                  if (!node.lockSaturation) updates.saturation = hsl.s;
                  if (!node.lockLightness) updates.lightness = hsl.l;
                }
                if (alphaChange !== 0 && !node.lockAlpha) {
                  updates.alpha = parentNode.alpha ?? 100;
                }
              } else if (parentNode.colorSpace === 'hex' && node.colorSpace === 'rgb') {
                // HEX parent -> RGB child
                // Get the hex value from parent
                let hexValue = parentNode.hexValue;
                if (!hexValue && parentNode.hue !== undefined) {
                  // Fallback: calculate from HSL if hexValue not set
                  hexValue = hslToHex(parentNode.hue, parentNode.saturation, parentNode.lightness);
                }
                if (hexValue) {
                  const rgb = hexToRgb(hexValue);
                  if (!node.lockRed) updates.red = rgb.r;
                  if (!node.lockGreen) updates.green = rgb.g;
                  if (!node.lockBlue) updates.blue = rgb.b;
                }
                if (alphaChange !== 0 && !node.lockAlpha) {
                  updates.alpha = parentNode.alpha ?? 100;
                }
              } else if (parentNode.colorSpace === 'oklch' && node.colorSpace === 'hsl') {
                // OKLCH parent -> HSL child
                const hsl = oklchToHsl(parentNode.oklchL || 0, parentNode.oklchC || 0, parentNode.oklchH || 0);
                if (!node.lockHue) updates.hue = hsl.h;
                if (!node.lockSaturation) updates.saturation = hsl.s;
                if (!node.lockLightness) updates.lightness = hsl.l;
                if (alphaChange !== 0 && !node.lockAlpha) {
                  updates.alpha = parentNode.alpha ?? 100;
                }
              } else if (parentNode.colorSpace === 'oklch' && node.colorSpace === 'rgb') {
                // OKLCH parent -> RGB child
                const rgb = oklchToRgb(parentNode.oklchL || 0, parentNode.oklchC || 0, parentNode.oklchH || 0);
                if (!node.lockRed) updates.red = rgb.r;
                if (!node.lockGreen) updates.green = rgb.g;
                if (!node.lockBlue) updates.blue = rgb.b;
                if (alphaChange !== 0 && !node.lockAlpha) {
                  updates.alpha = parentNode.alpha ?? 100;
                }
              }

              // ... (Other conversions similar pattern) ...

              // Apply updates to node
              updatedNodes[childIndex] = { ...node, ...updates };

              // Recurse for grandchildren
              propagateToDescendants(
                node.id,
                hueChange, satChange, lightChange, alphaChange,
                redChange, greenChange, blueChange,
                oklchLChange, oklchCChange, oklchHChange,
                hctHChange, hctCChange, hctTChange
              );

              return;
            }

            // Standard propagation (same color space)
            const updates: Partial<ColorNode> = {};

            if (node.colorSpace === 'hsl' || !node.colorSpace) {
              if (!node.lockHue && hueChange !== 0) {
                if (node.diffHue === false) updates.hue = parentNode.hue;
                else updates.hue = (node.hue + hueChange + 360) % 360;
              }
              if (!node.lockSaturation && satChange !== 0) {
                if (node.diffSaturation === false) updates.saturation = parentNode.saturation;
                else updates.saturation = Math.max(0, Math.min(100, node.saturation + satChange));
              }
              if (!node.lockLightness && lightChange !== 0) {
                if (node.diffLightness === false) updates.lightness = parentNode.lightness;
                else updates.lightness = Math.max(0, Math.min(100, node.lightness + lightChange));
              }
              if (!node.lockAlpha && alphaChange !== 0) {
                if (node.diffAlpha === false) updates.alpha = parentNode.alpha;
                else updates.alpha = Math.max(0, Math.min(100, node.alpha + alphaChange));
              }
              // HSL is the source of truth, so derived hexValue should be updated if needed
              if (!node.hexLocked) {
                const h = updates.hue !== undefined ? updates.hue : node.hue;
                const s = updates.saturation !== undefined ? updates.saturation : node.saturation;
                const l = updates.lightness !== undefined ? updates.lightness : node.lightness;
                updates.hexValue = hslToHex(h, s, l);
              }
            } else if (node.colorSpace === 'rgb') {
              if (!node.lockRed && redChange !== 0) {
                if (node.diffRed === false) updates.red = parentNode.red;
                else updates.red = Math.max(0, Math.min(255, (node.red || 0) + redChange));
              }
              if (!node.lockGreen && greenChange !== 0) {
                if (node.diffGreen === false) updates.green = parentNode.green;
                else updates.green = Math.max(0, Math.min(255, (node.green || 0) + greenChange));
              }
              if (!node.lockBlue && blueChange !== 0) {
                if (node.diffBlue === false) updates.blue = parentNode.blue;
                else updates.blue = Math.max(0, Math.min(255, (node.blue || 0) + blueChange));
              }
              if (!node.lockAlpha && alphaChange !== 0) {
                if (node.diffAlpha === false) updates.alpha = parentNode.alpha;
                else updates.alpha = Math.max(0, Math.min(100, node.alpha + alphaChange));
              }

              // Keep HSL and Hex in sync for RGB nodes
              const r = updates.red !== undefined ? updates.red : (node.red || 0);
              const g = updates.green !== undefined ? updates.green : (node.green || 0);
              const b = updates.blue !== undefined ? updates.blue : (node.blue || 0);

              const hsl = rgbToHsl(r, g, b);
              updates.hue = hsl.h;
              updates.saturation = hsl.s;
              updates.lightness = hsl.l;
              if (!node.hexLocked) {
                updates.hexValue = rgbToHex(r, g, b);
              }
            } else if (node.colorSpace === 'oklch') {
              if (!node.lockOklchL && oklchLChange !== 0) {
                if (node.diffOklchL === false) updates.oklchL = parentNode.oklchL;
                else updates.oklchL = Math.max(0, Math.min(100, (node.oklchL || 0) + oklchLChange));
              }
              if (!node.lockOklchC && oklchCChange !== 0) {
                if (node.diffOklchC === false) updates.oklchC = parentNode.oklchC;
                else updates.oklchC = Math.max(0, Math.min(100, (node.oklchC || 0) + oklchCChange));
              }
              if (!node.lockOklchH && oklchHChange !== 0) {
                if (node.diffOklchH === false) updates.oklchH = parentNode.oklchH;
                else updates.oklchH = ((node.oklchH || 0) + oklchHChange + 360) % 360;
              }
              if (!node.lockAlpha && alphaChange !== 0) {
                if (node.diffAlpha === false) updates.alpha = parentNode.alpha;
                else updates.alpha = Math.max(0, Math.min(100, node.alpha + alphaChange));
              }

              // Keep HSL and Hex in sync for OKLCH nodes - CRITICAL for Token Panel updates
              const l = updates.oklchL !== undefined ? updates.oklchL : (node.oklchL || 0);
              const c = updates.oklchC !== undefined ? updates.oklchC : (node.oklchC || 0);
              const h = updates.oklchH !== undefined ? updates.oklchH : (node.oklchH || 0);

              const hsl = oklchToHsl(l, c, h);
              updates.hue = hsl.h;
              updates.saturation = hsl.s;
              updates.lightness = hsl.l;
              if (!node.hexLocked) {
                updates.hexValue = oklchToHex(l, c, h);
              }
            } else if (node.colorSpace === 'hct') {
              if (!node.lockHctH && hctHChange !== 0) {
                if (node.diffHctH === false) updates.hctH = parentNode.hctH;
                else updates.hctH = ((node.hctH || 0) + hctHChange + 360) % 360;
              }
              if (!node.lockHctC && hctCChange !== 0) {
                if (node.diffHctC === false) updates.hctC = parentNode.hctC;
                else updates.hctC = Math.max(0, Math.min(100, (node.hctC || 0) + hctCChange));
              }
              if (!node.lockHctT && hctTChange !== 0) {
                if (node.diffHctT === false) updates.hctT = parentNode.hctT;
                else updates.hctT = Math.max(0, Math.min(100, (node.hctT || 0) + hctTChange));
              }
              if (!node.lockAlpha && alphaChange !== 0) {
                if (node.diffAlpha === false) updates.alpha = parentNode.alpha;
                else updates.alpha = Math.max(0, Math.min(100, node.alpha + alphaChange));
              }

              // Keep HSL and Hex in sync for HCT nodes
              const h = updates.hctH !== undefined ? updates.hctH : (node.hctH || 0);
              const c = updates.hctC !== undefined ? updates.hctC : (node.hctC || 0);
              const t = updates.hctT !== undefined ? updates.hctT : (node.hctT || 0);

              const rgb = hctToRgb(h, c, t);
              const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

              updates.hue = hsl.h;
              updates.saturation = hsl.s;
              updates.lightness = hsl.l;
              if (!node.hexLocked) {
                updates.hexValue = hctToHex(h, c, t);
              }
            } else if (node.colorSpace === 'hex') {
              // Hex same-color-space: inherit parent's hex value directly
              if (!node.hexLocked && parentNode.hexValue) {
                updates.hexValue = parentNode.hexValue;
                // Keep HSL in sync for internal consistency
                const hsl = hexToHsl(parentNode.hexValue);
                updates.hue = hsl.h;
                updates.saturation = hsl.s;
                updates.lightness = hsl.l;
              }
              if (!node.lockAlpha && alphaChange !== 0) {
                if (node.diffAlpha === false) updates.alpha = parentNode.alpha;
                else updates.alpha = Math.max(0, Math.min(100, node.alpha + alphaChange));
              }
            }

            // Apply updates
            updatedNodes[childIndex] = { ...node, ...updates };

            // Recurse
            propagateToDescendants(
              node.id,
              hueChange, satChange, lightChange, alphaChange,
              redChange, greenChange, blueChange,
              oklchLChange, oklchCChange, oklchHChange,
              hctHChange, hctCChange, hctTChange
            );
          });
        };

        // Execute propagation immediately to update descendants in updatedNodes array
        propagateToDescendants(
          id,
          hueOffsetDelta, satOffsetDelta, lightOffsetDelta, alphaOffsetDelta,
          redOffsetDelta, greenOffsetDelta, blueOffsetDelta,
          oklchLOffsetDelta, oklchCOffsetDelta, oklchHOffsetDelta,
          hctHOffsetDelta, hctCOffsetDelta, hctTOffsetDelta
        );

        // ── Restore channels controlled by advanced logic ──────────────
        // Advanced logic is the authority for these channels. Revert any
        // values that inheritance propagation overwrote so the reactive
        // evaluation useEffect can compute the correct result.
        const currentLogic = advancedLogic;
        if (currentLogic && currentLogic.length > 0) {
          for (const nodeLogic of currentLogic) {
            // Don't revert the target node (user is directly editing it)
            if (nodeLogic.nodeId === id) continue;

            const nodeIdx = updatedNodes.findIndex(n => n.id === nodeLogic.nodeId);
            if (nodeIdx === -1) continue;

            const originalNode = prev.find(n => n.id === nodeLogic.nodeId);
            if (!originalNode) continue;

            const restores: Partial<ColorNode> = {};
            let hasRestores = false;

            for (const [channelKey, chLogic] of Object.entries(nodeLogic.channels)) {
              if (!chLogic || chLogic.rows.length === 0) continue;
              const hasActiveRows = chLogic.rows.some((r: any) => r.enabled && r.tokens.length > 0);
              if (!hasActiveRows) continue;

              const origVal = (originalNode as any)[channelKey];
              const propVal = (updatedNodes[nodeIdx] as any)[channelKey];
              if (origVal !== undefined && origVal !== propVal) {
                (restores as any)[channelKey] = origVal;
                hasRestores = true;
              }
            }

            if (hasRestores) {
              // Apply channel restores and recompute hex/HSL sync
              const restored = { ...updatedNodes[nodeIdx], ...restores };
              const cs = restored.colorSpace || 'hsl';
              if (cs === 'hsl' || cs === 'hex') {
                if (!restored.hexLocked) {
                  restored.hexValue = hslToHex(restored.hue, restored.saturation, restored.lightness);
                }
              } else if (cs === 'rgb') {
                const hsl2 = rgbToHsl(restored.red ?? 0, restored.green ?? 0, restored.blue ?? 0);
                restored.hue = hsl2.h; restored.saturation = hsl2.s; restored.lightness = hsl2.l;
                if (!restored.hexLocked) restored.hexValue = rgbToHex(restored.red ?? 0, restored.green ?? 0, restored.blue ?? 0);
              } else if (cs === 'oklch') {
                const hsl3 = oklchToHsl(restored.oklchL ?? 0, restored.oklchC ?? 0, restored.oklchH ?? 0);
                restored.hue = hsl3.h; restored.saturation = hsl3.s; restored.lightness = hsl3.l;
                if (!restored.hexLocked) restored.hexValue = oklchToHex(restored.oklchL ?? 0, restored.oklchC ?? 0, restored.oklchH ?? 0);
              } else if (cs === 'hct') {
                const rgb2 = hctToRgb(restored.hctH ?? 0, restored.hctC ?? 0, restored.hctT ?? 0);
                const hsl4 = rgbToHsl(rgb2.r, rgb2.g, rgb2.b);
                restored.hue = hsl4.h; restored.saturation = hsl4.s; restored.lightness = hsl4.l;
                if (!restored.hexLocked) restored.hexValue = hctToHex(restored.hctH ?? 0, restored.hctC ?? 0, restored.hctT ?? 0);
              }
              updatedNodes[nodeIdx] = restored;
            }
          }

          // ── Immediate advanced logic evaluation ──────────────────────
          // Evaluate logic NOW (synchronously) so values are correct in the
          // same render frame—prevents flicker during rapid scrubbing.
          const allNodesMapSync = new Map<string, Record<string, number>>();
          const currentThemeSync = themes.find(t => t.id === activeThemeId);
          const isPrimarySync = currentThemeSync?.isPrimary ?? true;
          for (const n of updatedNodes) {
            allNodesMapSync.set(n.id, nodeToChannelMapThemeAware(n, activeThemeId, isPrimarySync));
          }

          for (const nodeLogic of currentLogic) {
            const nIdx = updatedNodes.findIndex(n => n.id === nodeLogic.nodeId);
            if (nIdx === -1) continue;
            const nd = updatedNodes[nIdx];

            const selfMapSync = allNodesMapSync.get(nd.id)!;
            const parentMapSync = nd.parentId ? allNodesMapSync.get(nd.parentId) ?? null : null;

            const changesSync: Record<string, number> = {};
            let hasCSync = false;

            for (const [chKey, chLogic] of Object.entries(nodeLogic.channels)) {
              if (!chLogic || chLogic.rows.length === 0) continue;
              const hasActiveR = chLogic.rows.some((r: any) => r.enabled && r.tokens.length > 0);
              if (!hasActiveR) continue;

              // Use stored baseValues for `locked` keyword to prevent feedback loops
              const lockedValuesSync = nodeLogic.baseValues || selfMapSync;

              const ctxSync: EvalContext = {
                self: selfMapSync,
                parent: parentMapSync,
                allNodes: allNodesMapSync,
                currentChannel: chKey,
                lockedValues: lockedValuesSync,
              };

              const baseVal = lockedValuesSync[chKey] ?? 0;
              const res = evaluateChannelLogic(chLogic, ctxSync, baseVal);

              if (res.source === 'logic') {
                const curVal = (nd as any)[chKey] ?? 0;
                if (Math.abs(res.value - curVal) > 0.001) {
                  changesSync[chKey] = res.value;
                  hasCSync = true;
                }
              }
            }

            if (hasCSync) {
              const ncSync: Partial<ColorNode> = { ...changesSync } as any;
              const csSync = nd.colorSpace || 'hsl';
              if (csSync === 'hsl' || csSync === 'hex') {
                const hv = changesSync.hue !== undefined ? changesSync.hue : nd.hue;
                const sv = changesSync.saturation !== undefined ? changesSync.saturation : nd.saturation;
                const lv = changesSync.lightness !== undefined ? changesSync.lightness : nd.lightness;
                if (!nd.hexLocked) ncSync.hexValue = hslToHex(hv, sv, lv);
              } else if (csSync === 'rgb') {
                const rv = changesSync.red !== undefined ? changesSync.red : (nd.red ?? 0);
                const gv = changesSync.green !== undefined ? changesSync.green : (nd.green ?? 0);
                const bv = changesSync.blue !== undefined ? changesSync.blue : (nd.blue ?? 0);
                const hslSync = rgbToHsl(rv, gv, bv);
                ncSync.hue = hslSync.h; ncSync.saturation = hslSync.s; ncSync.lightness = hslSync.l;
                if (!nd.hexLocked) ncSync.hexValue = rgbToHex(rv, gv, bv);
              } else if (csSync === 'oklch') {
                const olSync = changesSync.oklchL !== undefined ? changesSync.oklchL : (nd.oklchL ?? 0);
                const ocSync = changesSync.oklchC !== undefined ? changesSync.oklchC : (nd.oklchC ?? 0);
                const ohSync = changesSync.oklchH !== undefined ? changesSync.oklchH : (nd.oklchH ?? 0);
                const hslSync2 = oklchToHsl(olSync, ocSync, ohSync);
                ncSync.hue = hslSync2.h; ncSync.saturation = hslSync2.s; ncSync.lightness = hslSync2.l;
                if (!nd.hexLocked) ncSync.hexValue = oklchToHex(olSync, ocSync, ohSync);
              } else if (csSync === 'hct') {
                const hhSync = changesSync.hctH !== undefined ? changesSync.hctH : (nd.hctH ?? 0);
                const hcSync = changesSync.hctC !== undefined ? changesSync.hctC : (nd.hctC ?? 0);
                const htSync = changesSync.hctT !== undefined ? changesSync.hctT : (nd.hctT ?? 0);
                const rgbSync = hctToRgb(hhSync, hcSync, htSync);
                const hslSync3 = rgbToHsl(rgbSync.r, rgbSync.g, rgbSync.b);
                ncSync.hue = hslSync3.h; ncSync.saturation = hslSync3.s; ncSync.lightness = hslSync3.l;
                if (!nd.hexLocked) ncSync.hexValue = hctToHex(hhSync, hcSync, htSync);
              }
              updatedNodes[nIdx] = { ...nd, ...ncSync };
              // Update the channel map for subsequent logic that references this node
              allNodesMapSync.set(nd.id, nodeToChannelMapThemeAware(updatedNodes[nIdx], activeThemeId, isPrimarySync));
            }
          }
        }
      }

      // Update assigned tokens for ALL affected nodes (target + descendants)
      // This ensures tokens are updated when values propagate or when re-assigned
      const nodesToUpdate = new Set<string>();
      nodesToUpdate.add(id); // Always update the target node

      // If we propagated changes, we need to find all descendants that were affected
      if (hasChanges) {
        const findDescendants = (parentId: string) => {
          updatedNodes.forEach(n => {
            if (n.parentId === parentId) {
              nodesToUpdate.add(n.id);
              findDescendants(n.id);
            }
          });
        };
        findDescendants(id);
      }

      // Check for token updates for ALL affected nodes - Using proper state setter pattern
      if (nodesToUpdate.size > 0) {
        setTokens(prevTokens => {

          let finalTokens = prevTokens;
          let tokensUpdated = false;

          nodesToUpdate.forEach(nodeId => {
            const node = updatedNodes.find(n => n.id === nodeId);
            if (!node) return;

            // Get tokens assigned to this node on the CURRENT active theme only
            // This prevents incorrectly overwriting token values for themes where
            // the token is not assigned to this node
            const currentThemeTokenIds = new Set<string>();
            if (node.tokenAssignments?.[activeThemeId] !== undefined) {
              node.tokenAssignments[activeThemeId].forEach(tokenId => currentThemeTokenIds.add(tokenId));
            } else if (node.tokenIds) {
              // Fallback to legacy tokenIds when no theme-specific assignments exist
              node.tokenIds.forEach(tokenId => currentThemeTokenIds.add(tokenId));
            }

            if (currentThemeTokenIds.size > 0) {
              // Update tokens for this node on the current theme
              finalTokens = finalTokens.map(token => {
                if (currentThemeTokenIds.has(token.id)) {
                  tokensUpdated = true;

                  // Get the effective color for the current theme
                  const currentTheme = themes.find(t => t.id === activeThemeId);
                  const isPrimaryTheme = currentTheme?.isPrimary ?? true;
                  const hasThemeOverride = !isPrimaryTheme && node.themeOverrides?.[activeThemeId];
                  const themeOverride = hasThemeOverride ? node.themeOverrides![activeThemeId] : undefined;

                  // Only update if token doesn't have the correct value already or needs refresh
                  const updatedThemeValues = { ...token.themeValues };

                  if (node.isSpacing || node.type === 'spacing') {
                    updatedThemeValues[activeThemeId] = {
                      value: node.spacingValue ?? 16,
                      unit: node.spacingUnit ?? 'px',
                    };

                    if (isPrimaryTheme) {
                      return {
                        ...token,
                        type: 'spacing',
                        themeValues: updatedThemeValues,
                        value: node.spacingValue ?? 16,
                        unit: node.spacingUnit ?? 'px',
                      };
                    } else {
                      // Non-primary: only update themeValues, preserve base
                      return {
                        ...token,
                        type: 'spacing',
                        themeValues: updatedThemeValues,
                      };
                    }
                  } else {
                    // Calculate effective HSL values using color-space-aware helper
                    const effective = getNodeEffectiveHSL(node, themeOverride);

                    updatedThemeValues[activeThemeId] = {
                      hue: effective.hue,
                      saturation: effective.saturation,
                      lightness: effective.lightness,
                      alpha: effective.alpha,
                    };

                    if (isPrimaryTheme) {
                      // Primary theme: update both base properties and themeValues
                      return {
                        ...token,
                        type: 'color',
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
                        type: 'color',
                        themeValues: updatedThemeValues,
                      };
                    }
                  }
                }
                return token;
              });
            }
          });

          return tokensUpdated ? finalTokens : prevTokens;
        });
      }


      // Auto-adjust siblings if this is a child node and its height changed
      // (from expanding/collapsing or token assignment changes)
      const heightAffectingChanges = updates.isExpanded !== undefined ||
        updates.tokenIds !== undefined ||
        updates.tokenAssignments !== undefined;

      if (heightAffectingChanges && nodeBeingUpdated.parentId) {
        const updatedNode = updatedNodes.find(n => n.id === id);
        if (updatedNode) {
          const MIN_GAP = 40; // Unified with canvas-level gap enforcement

          // Get all siblings (including the updated node)
          const allSiblings = updatedNodes.filter(
            n => n.parentId === nodeBeingUpdated.parentId
          );

          // Sort siblings by Y position
          const sortedSiblings = [...allSiblings].sort((a, b) => a.position.y - b.position.y);

          // Find the index of the changed node in the sorted list
          const changedIdx = sortedSiblings.findIndex(s => s.id === id);
          if (changedIdx < 0) return updatedNodes;

          // Calculate height delta (old → new) for pull-back capping
          const oldHeight = getNodeHeight(nodeBeingUpdated, tokens, updatedNodes, activeThemeId);
          const changedHeight = getNodeHeight(updatedNode, tokens, updatedNodes, activeThemeId);
          const heightDelta = changedHeight - oldHeight; // positive = expanded, negative = collapsed
          const changedBottom = updatedNode.position.y + changedHeight;

          // Find the first sibling BELOW the changed node that horizontally overlaps
          const NODE_WIDTH = 240;
          const changedLeft = updatedNode.position.x;
          const changedRight = updatedNode.position.x + (updatedNode.width || NODE_WIDTH);

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

          // Calculate uniform shift: how much the first below sibling needs to move
          const firstBelow = sortedSiblings[firstBelowIdx];
          const currentGap = firstBelow.position.y - changedBottom;
          const uniformShift = currentGap < MIN_GAP ? (MIN_GAP - currentGap) : 0;
          // Also allow pulling back if gap is much larger (collapse case)
          // but only if the gap is larger than MIN_GAP
          const uniformPull = currentGap > MIN_GAP ? Math.min(currentGap - MIN_GAP, Math.abs(heightDelta)) : 0;

          const adjustedPositions = new Map<string, { x: number; y: number }>();

          if (uniformShift > 0) {
            // Push all siblings at and below firstBelowIdx by the same amount
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
            // Pull all siblings at and below firstBelowIdx back up by the same amount
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
  }, [tokens, activeThemeId, themes, groups]);

  // ── Revert theme-specific advanced logic when a node re-links to primary ──
  const revertThemeAdvancedLogic = useCallback((nodeId: string, themeId: string) => {
    setAdvancedLogic(prev => {
      const entry = prev.find(l => l.nodeId === nodeId);
      if (!entry) return prev;
      const newThemeChannels = { ...(entry.themeChannels || {}) };
      delete newThemeChannels[themeId];
      const newThemeBaseValues = { ...(entry.themeBaseValues || {}) };
      delete newThemeBaseValues[themeId];
      const newThemeTokenAssignment = { ...(entry.themeTokenAssignment || {}) };
      delete newThemeTokenAssignment[themeId];
      return prev.map(l => l.nodeId === nodeId ? {
        ...l,
        themeChannels: Object.keys(newThemeChannels).length > 0 ? newThemeChannels : undefined,
        themeBaseValues: Object.keys(newThemeBaseValues).length > 0 ? newThemeBaseValues : undefined,
        themeTokenAssignment: Object.keys(newThemeTokenAssignment).length > 0 ? newThemeTokenAssignment : undefined,
      } : l);
    });
  }, []);

  return { updateNode, revertThemeAdvancedLogic };
}
