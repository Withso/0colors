// ═══════════════════════════════════════════════════════════════
// Extracted helpers from App.tsx to reduce bundle size
// ═══════════════════════════════════════════════════════════════

import { ColorNode, DesignToken, TokenGroup } from '../types';
import { hslToRgb, rgbToHex, rgbToHsl, hslToOklch as hslToOklchBase, oklchToHsl } from './color-conversions';
import { hctToRgb, rgbToHct } from './hct-utils';
import { migrateToLatest, CURRENT_SCHEMA_VERSION } from './migrations';

// ── Color space conversion utilities ─────────────────────────────

export function hslToOklchUpper(h: number, s: number, l: number): { L: number; C: number; H: number } {
  const result = hslToOklchBase(h, s, l);
  return { L: result.l, C: result.c / 0.4, H: result.h };
}

export function rgbToOklch(r: number, g: number, b: number): { L: number; C: number; H: number } {
  const hsl = rgbToHsl(r, g, b);
  return hslToOklchUpper(hsl.h, hsl.s, hsl.l);
}

export function oklchToRgb(L: number, C: number, H: number): { r: number; g: number; b: number } {
  const hsl = oklchToHsl(L, C, H);
  return hslToRgb(hsl.h, hsl.s, hsl.l);
}

export function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

export function oklchToHex(L: number, C: number, H: number): string {
  const { r, g, b } = oklchToRgb(L, C, H);
  return rgbToHex(r, g, b);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6); // strip alpha
  const num = parseInt(h, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function getNodeEffectiveHSL(
  node: ColorNode,
  themeOverride?: any
): { hue: number; saturation: number; lightness: number; alpha: number } {
  if (node.parentId) {
    return {
      hue: themeOverride?.hue !== undefined ? themeOverride.hue : node.hue,
      saturation: themeOverride?.saturation !== undefined ? themeOverride.saturation : node.saturation,
      lightness: themeOverride?.lightness !== undefined ? themeOverride.lightness : node.lightness,
      alpha: themeOverride?.alpha !== undefined ? themeOverride.alpha : node.alpha,
    };
  }
  if (node.colorSpace === 'rgb') {
    const r = themeOverride?.red !== undefined ? themeOverride.red : node.red ?? 0;
    const g = themeOverride?.green !== undefined ? themeOverride.green : node.green ?? 0;
    const b = themeOverride?.blue !== undefined ? themeOverride.blue : node.blue ?? 0;
    const hsl = rgbToHsl(r, g, b);
    return { hue: hsl.h, saturation: hsl.s, lightness: hsl.l, alpha: themeOverride?.alpha !== undefined ? themeOverride.alpha : node.alpha };
  } else if (node.colorSpace === 'oklch') {
    const l = themeOverride?.oklchL !== undefined ? themeOverride.oklchL : node.oklchL ?? 0;
    const c = themeOverride?.oklchC !== undefined ? themeOverride.oklchC : node.oklchC ?? 0;
    const h = themeOverride?.oklchH !== undefined ? themeOverride.oklchH : node.oklchH ?? 0;
    const hsl = oklchToHsl(l, c, h);
    return { hue: hsl.h, saturation: hsl.s, lightness: hsl.l, alpha: themeOverride?.alpha !== undefined ? themeOverride.alpha : node.alpha };
  } else if (node.colorSpace === 'hct') {
    const h = themeOverride?.hctH !== undefined ? themeOverride.hctH : node.hctH ?? 0;
    const c = themeOverride?.hctC !== undefined ? themeOverride.hctC : node.hctC ?? 0;
    const t = themeOverride?.hctT !== undefined ? themeOverride.hctT : node.hctT ?? 0;
    const rgb = hctToRgb(h, c, t);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return { hue: hsl.h, saturation: hsl.s, lightness: hsl.l, alpha: themeOverride?.alpha !== undefined ? themeOverride.alpha : node.alpha };
  } else if (node.colorSpace === 'hex') {
    const hexValue = themeOverride?.hexValue !== undefined ? themeOverride.hexValue : node.hexValue;
    if (hexValue) {
      const hsl = hexToHsl(hexValue);
      return { hue: hsl.h, saturation: hsl.s, lightness: hsl.l, alpha: themeOverride?.alpha !== undefined ? themeOverride.alpha : node.alpha };
    }
  }
  return {
    hue: themeOverride?.hue !== undefined ? themeOverride.hue : node.hue,
    saturation: themeOverride?.saturation !== undefined ? themeOverride.saturation : node.saturation,
    lightness: themeOverride?.lightness !== undefined ? themeOverride.lightness : node.lightness,
    alpha: themeOverride?.alpha !== undefined ? themeOverride.alpha : node.alpha,
  };
}

// Detect if running in Figma plugin
export const isInFigma = typeof window !== 'undefined' && window.parent !== window;

// ── Palette shade regeneration ───────────────────────────────────

export const regeneratePaletteShades = (
  paletteNode: ColorNode,
  updatedNodes: ColorNode[]
) => {
  const shadeCount = paletteNode.paletteShadeCount ?? 10;
  const lightnessStart = paletteNode.paletteLightnessStart ?? 95;
  const lightnessEnd = paletteNode.paletteLightnessEnd ?? 15;
  const curveType = paletteNode.paletteCurveType || 'linear';
  const satMode = paletteNode.paletteSaturationMode || 'constant';
  const baseHue = paletteNode.hue;
  const baseSat = paletteNode.saturation;
  const baseLightness = paletteNode.lightness;
  const satStartVal = paletteNode.paletteSaturationStart ?? baseSat;
  const satEndVal = paletteNode.paletteSaturationEnd ?? baseSat;
  const hueShiftVal = paletteNode.paletteHueShift ?? 0;

  const applyCurve = (t: number): number => {
    if (curveType === 'custom') {
      const pts = paletteNode.paletteCustomCurvePoints;
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

  const computeSat = (bSat: number, t: number, lightness: number): number => {
    if (satMode === 'constant') return bSat;
    if (satMode === 'manual') return Math.max(0, Math.min(100, satStartVal + (satEndVal - satStartVal) * t));
    const dev = Math.abs(lightness - 50) / 50;
    return Math.max(0, Math.min(100, bSat * (1 - dev * 0.6)));
  };

  const shadeChildren = updatedNodes
    .map((n, i) => ({ node: n, index: i }))
    .filter(({ node }) => node.parentId === paletteNode.id)
    .sort((a, b) => a.node.position.y - b.node.position.y);

  const palFormat = paletteNode.paletteColorFormat ?? 'HEX';
  const formatToCS: Record<string, string> = { 'HEX': 'hsl', 'HSLA': 'hsl', 'OKLCH': 'oklch', 'RGBA': 'rgb' };
  const paletteColorSpace = formatToCS[palFormat as string] || 'hsl';

  shadeChildren.forEach(({ node: shadeNode, index: shadeIndex }, i) => {
    const t = shadeCount > 1 ? i / (shadeCount - 1) : 0;
    const curved = applyCurve(t);
    const shadeLightness = lightnessStart + (lightnessEnd - lightnessStart) * curved;
    const shadeSaturation = computeSat(baseSat, t, shadeLightness);
    const shadeHue = (baseHue + hueShiftVal * t + 360) % 360;

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

    updatedNodes[shadeIndex] = {
      ...shadeNode,
      ...nativeProps,
      hue: shadeHue,
      saturation: shadeSaturation,
      lightness: shadeLightness,
      alpha: paletteNode.alpha ?? 100,
      hueOffset: shadeHue - baseHue,
      saturationOffset: shadeSaturation - baseSat,
      lightnessOffset: shadeLightness - baseLightness,
      hexValue: hslToHex(shadeHue, shadeSaturation, shadeLightness),
    };
  });
};

// ── Token Node Hierarchy Helpers ─────────────────────────────────

export const findTokenPrefixNode = (node: ColorNode, allNodes: ColorNode[]): ColorNode | null => {
  let current: ColorNode | undefined = node;
  while (current) {
    if (current.isTokenPrefix) {
      const parent = current.parentId ? allNodes.find(n => n.id === current!.parentId) : null;
      if (!parent || !parent.isTokenNode) {
        return current;
      }
    }
    if (!current.parentId) return null;
    current = allNodes.find(n => n.id === current!.parentId);
  }
  return null;
};

export const computeTokenPath = (node: ColorNode, allNodes: ColorNode[]): string => {
  const parts: string[] = [];
  let current: ColorNode | undefined = node;
  while (current) {
    if (current.isTokenPrefix) {
      const parent = current.parentId ? allNodes.find(n => n.id === current!.parentId) : null;
      if (!parent || !parent.isTokenNode) {
        parts.unshift(current.referenceName || 'color');
        break;
      } else {
        parts.unshift(current.tokenNodeSuffix || current.referenceName || '1');
      }
    } else {
      parts.unshift(current.tokenNodeSuffix || current.referenceName || '1');
    }
    current = current.parentId ? allNodes.find(n => n.id === current!.parentId) : undefined;
  }
  return parts.join('-');
};

export const computeAncestorPath = (node: ColorNode, allNodes: ColorNode[]): string => {
  const parts: string[] = [];
  let current: ColorNode | undefined = node.parentId ? allNodes.find(n => n.id === node.parentId) : undefined;
  while (current) {
    if (current.isTokenPrefix) {
      const parent = current.parentId ? allNodes.find(n => n.id === current!.parentId) : null;
      if (!parent || !parent.isTokenNode) {
        parts.unshift(current.referenceName || 'color');
        break;
      } else {
        parts.unshift(current.tokenNodeSuffix || current.referenceName || '1');
      }
    } else {
      parts.unshift(current.tokenNodeSuffix || current.referenceName || '1');
    }
    current = current.parentId ? allNodes.find(n => n.id === current!.parentId) : undefined;
  }
  return parts.join('-');
};

export const getNextTokenChildSuffix = (parentId: string, allNodes: ColorNode[]): string => {
  const siblings = allNodes.filter(n => n.parentId === parentId && n.isTokenNode);
  return String(siblings.length + 1);
};

export const collectTokenDescendants = (nodeId: string, allNodes: ColorNode[]): ColorNode[] => {
  const descendants: ColorNode[] = [];
  const findChildren = (parentId: string) => {
    allNodes.forEach(n => {
      if (n.parentId === parentId && n.isTokenNode) {
        descendants.push(n);
        findChildren(n.id);
      }
    });
  };
  findChildren(nodeId);
  return descendants;
};

// ── Node spacing ─────────────────────────────────────────────────

export const MIN_GAP = 40;

export const getNodeHeight = (node: ColorNode, tokens: DesignToken[], allNodes?: ColorNode[], activeThemeId?: string, primaryThemeId?: string): number => {
  if (allNodes && node.parentId) {
    const parentNode = allNodes.find(n => n.id === node.parentId);
    if (parentNode?.isPalette) {
      return 48;
    }
  }
  
  const tokenCount = (() => {
    if (activeThemeId && node.tokenAssignments?.[activeThemeId] !== undefined) {
      return node.tokenAssignments[activeThemeId].length;
    }
    return node.tokenIds?.length || 0;
  })();
  
  if (node.isSpacing) {
    const tokenRowHeight = 40;
    const tokenSectionHeight = tokenCount > 0 ? tokenCount * tokenRowHeight : 0;
    const tokenSelectorHeight = 40;
    return 80 + 200 + 40 + 30 + tokenSectionHeight + tokenSelectorHeight + 80;
  }
  
  if (node.isTokenNode) {
    const nameAreaHeight = 56;
    const refLabelArea = 32;
    if (node.isTokenPrefix) {
      const paddingAndGaps = 12;
      return nameAreaHeight + paddingAndGaps + refLabelArea;
    }
    const effectiveValueTokenId = (() => {
      if (activeThemeId && node.valueTokenAssignments?.[activeThemeId] !== undefined) {
        return node.valueTokenAssignments[activeThemeId] || undefined;
      }
      if (primaryThemeId && node.valueTokenAssignments?.[primaryThemeId] !== undefined) {
        return node.valueTokenAssignments[primaryThemeId] || undefined;
      }
      return node.valueTokenId;
    })();
    const valueTokenCount = effectiveValueTokenId ? 1 : 0;
    const tokenRowHeight = 40;
    const tokenSectionHeight = valueTokenCount > 0 ? valueTokenCount * tokenRowHeight : 0;
    const tokenSelectorHeight = 40;
    const paddingAndGaps = 24;
    const advancedIslandHeight = 38;
    return nameAreaHeight + tokenSectionHeight + tokenSelectorHeight + paddingAndGaps + refLabelArea + advancedIslandHeight;
  }
  
  const colorPreviewHeight = 96;
  const tokenRowHeight = 40;
  const tokenSectionHeight = tokenCount > 0 ? tokenCount * tokenRowHeight : 0;
  const tokenSelectorHeight = 40;
  
  if (!node.isExpanded) {
    const lockIconsHeight = node.parentId ? 48 : 0;
    return colorPreviewHeight + lockIconsHeight + tokenSectionHeight + tokenSelectorHeight + 16;
  }
  
  const slidersHeight = 4 * 70;
  const lockIconsHeight = node.parentId ? 48 : 0;
  const paddingAndSpacing = 60;
  
  return colorPreviewHeight + slidersHeight + lockIconsHeight + tokenSectionHeight + tokenSelectorHeight + paddingAndSpacing;
};

export const adjustNodeSpacing = (nodes: ColorNode[], tokens: DesignToken[], projectId: string, activeThemeId?: string): ColorNode[] => {
  const projectNodes = nodes.filter(n => n.projectId === projectId);
  const otherNodes = nodes.filter(n => n.projectId !== projectId);
  
  const autoPositionedNodes = projectNodes.map(n => ({ ...n }));
  
  const childrenMap = new Map<string, string[]>();
  autoPositionedNodes.forEach(node => {
    if (node.parentId) {
      const siblings = childrenMap.get(node.parentId) || [];
      siblings.push(node.id);
      childrenMap.set(node.parentId, siblings);
    }
  });
  
  let maxIterations = 15;
  let hadCollision = true;
  
  while (hadCollision && maxIterations > 0) {
    hadCollision = false;
    maxIterations--;
    
    for (let i = 0; i < autoPositionedNodes.length; i++) {
      const nodeA = autoPositionedNodes[i];
      const nodeAWidth = nodeA.width || 240;
      const nodeAHeight = getNodeHeight(nodeA, tokens, nodes, activeThemeId);
      
      for (let j = i + 1; j < autoPositionedNodes.length; j++) {
        const nodeB = autoPositionedNodes[j];
        const nodeBWidth = nodeB.width || 240;
        const nodeBHeight = getNodeHeight(nodeB, tokens, nodes, activeThemeId);
        
        const aLeft = nodeA.position.x;
        const aRight = nodeA.position.x + nodeAWidth;
        const aTop = nodeA.position.y;
        const aBottom = nodeA.position.y + nodeAHeight;
        
        const bLeft = nodeB.position.x;
        const bRight = nodeB.position.x + nodeBWidth;
        const bTop = nodeB.position.y;
        const bBottom = nodeB.position.y + nodeBHeight;
        
        const horizontalOverlap = !(aRight + MIN_GAP <= bLeft || bRight + MIN_GAP <= aLeft);
        const verticalOverlap = !(aBottom + MIN_GAP <= bTop || bBottom + MIN_GAP <= aTop);
        
        if (horizontalOverlap && verticalOverlap) {
          hadCollision = true;
          
          const isParentChild = nodeA.parentId === nodeB.id || nodeB.parentId === nodeA.id;
          const isSiblings = nodeA.parentId === nodeB.parentId && nodeA.parentId !== null;
          
          if (isSiblings) {
            if (nodeA.position.y < nodeB.position.y) {
              const requiredY = aBottom + MIN_GAP;
              if (nodeB.position.y < requiredY) {
                nodeB.position.y = requiredY;
              }
            } else {
              const requiredY = bBottom + MIN_GAP;
              if (nodeA.position.y < requiredY) {
                nodeA.position.y = requiredY;
              }
            }
          } else if (isParentChild) {
            if (nodeB.parentId === nodeA.id) {
              const requiredX = aRight + MIN_GAP;
              if (nodeB.position.x < requiredX) {
                nodeB.position.x = requiredX;
              }
            } else {
              const requiredX = bRight + MIN_GAP;
              if (nodeA.position.x < requiredX) {
                nodeA.position.x = requiredX;
              }
            }
          } else {
            const overlapX = Math.min(aRight - bLeft + MIN_GAP, bRight - aLeft + MIN_GAP);
            const overlapY = Math.min(aBottom - bTop + MIN_GAP, bBottom - aTop + MIN_GAP);
            
            if (overlapX < overlapY) {
              if (nodeA.position.x < nodeB.position.x) {
                nodeB.position.x = aRight + MIN_GAP;
              } else {
                nodeA.position.x = bRight + MIN_GAP;
              }
            } else {
              if (nodeA.position.y < nodeB.position.y) {
                nodeB.position.y = aBottom + MIN_GAP;
              } else {
                nodeA.position.y = bBottom + MIN_GAP;
              }
            }
          }
        }
      }
    }
  }
  
  const sortedNodes = [...autoPositionedNodes].sort((a, b) => a.position.y - b.position.y);
  
  sortedNodes.forEach((node) => {
    const nodeIndex = autoPositionedNodes.findIndex(n => n.id === node.id);
    if (nodeIndex === -1) return;
    
    const currentNode = autoPositionedNodes[nodeIndex];
    const nodeWidth = currentNode.width || 240;
    const nodeHeight = getNodeHeight(currentNode, tokens, nodes, activeThemeId);
    
    let optimalY = 0;
    if (currentNode.parentId) {
      const parent = autoPositionedNodes.find(n => n.id === currentNode.parentId);
      if (parent) {
        optimalY = parent.position.y;
      }
    }
    
    for (const otherNode of autoPositionedNodes) {
      if (otherNode.id === currentNode.id) continue;
      
      const otherWidth = otherNode.width || 240;
      const otherHeight = getNodeHeight(otherNode, tokens, nodes, activeThemeId);
      
      const currentLeft = currentNode.position.x;
      const currentRight = currentNode.position.x + nodeWidth;
      const otherLeft = otherNode.position.x;
      const otherRight = otherNode.position.x + otherWidth;
      
      const horizontalOverlap = !(currentRight + MIN_GAP <= otherLeft || otherRight + MIN_GAP <= currentLeft);
      
      if (horizontalOverlap) {
        if (otherNode.position.y <= currentNode.position.y) {
          const minY = otherNode.position.y + otherHeight + MIN_GAP;
          optimalY = Math.max(optimalY, minY);
        }
      }
    }
    
    if (currentNode.parentId) {
      const siblings = autoPositionedNodes.filter(n => n.parentId === currentNode.parentId && n.id !== currentNode.id);
      
      siblings.forEach(sibling => {
        const siblingHeight = getNodeHeight(sibling, tokens, nodes, activeThemeId);
        if (sibling.position.y <= currentNode.position.y) {
          const minY = sibling.position.y + siblingHeight + MIN_GAP;
          optimalY = Math.max(optimalY, minY);
        }
      });
    }
    
    autoPositionedNodes[nodeIndex].position.y = optimalY;
  });
  
  return [...autoPositionedNodes, ...otherNodes];
};

// ── Default data structure ───────────────────────────────────────

/**
 * Default data for brand-new users (no localStorage, no IndexedDB).
 * Contains a single sample project with one node.
 *
 * NOTE: The URL guard in useUrlRouting.ts blocks `/project/sample-project`
 * and redirects to /projects, so this data never appears at a /project/ URL.
 * It is ONLY used as initial store data and as a fallback for missing fields
 * during data hydration from localStorage/IndexedDB.
 */
export const getDefaultData = () => ({
  nodes: [] as any[],
  tokens: [] as any[],
  groups: [] as any[],
  projects: [{
    id: 'sample-project',
    name: 'Sample Project',
    isExpanded: true,
    isSample: true,
    folderColor: 145,
  }],
  pages: [{
    id: 'page-1',
    name: 'Page 1',
    projectId: 'sample-project',
    createdAt: Date.now(),
  }],
  themes: [{
    id: 'theme-1',
    name: 'Light',
    projectId: 'sample-project',
    createdAt: Date.now(),
    isPrimary: true,
  }],
  canvasStates: [{
    projectId: 'sample-project',
    pageId: 'page-1',
    pan: { x: 0, y: 0 },
    zoom: 1,
  }],
  activeProjectId: 'sample-project',
  activePageId: 'page-1',
  activeThemeId: 'theme-1',
});

// ── LocalStorage persistence ─────────────────────────────────────

export const STORAGE_KEY = 'color-tool-data';
const GROUP_EXPAND_KEY = 'color-tool-group-expand-states';

export const saveGroupExpandStates = (groups: TokenGroup[]) => {
  try {
    const expandMap: Record<string, boolean> = {};
    groups.forEach(g => { expandMap[g.id] = g.isExpanded; });
    localStorage.setItem(GROUP_EXPAND_KEY, JSON.stringify(expandMap));
  } catch (_) { /* ignore quota errors */ }
};

export const loadGroupExpandStates = (): Record<string, boolean> | null => {
  try {
    const raw = localStorage.getItem(GROUP_EXPAND_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  return null;
};

export const mergeGroupExpandStates = (groups: TokenGroup[]): TokenGroup[] => {
  const saved = loadGroupExpandStates();
  if (!saved) return groups;
  return groups.map(g => {
    if (saved.hasOwnProperty(g.id)) {
      return { ...g, isExpanded: saved[g.id] };
    }
    return g;
  });
};

export const saveToLocalStorage = (data: any) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('Saved to localStorage');
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

export const migrateTokens = (tokens: DesignToken[], themes: any[]) => {
  const tokenMap = new Map<string, DesignToken>();
  
  tokens.forEach(token => {
    const baseId = token.id.replace(/-theme-\d+$/, '');
    
    if (!tokenMap.has(baseId)) {
      const themeValues: any = {};
      const themeId = token.themeId || (themes.length > 0 ? themes[0].id : 'theme-1');
      
      themeValues[themeId] = {
        hue: token.hue,
        saturation: token.saturation,
        lightness: token.lightness,
        alpha: token.alpha,
        value: token.value,
        unit: token.unit,
        fontWeight: token.fontWeight,
        lineHeight: token.lineHeight,
        shadowValue: token.shadowValue,
        opacity: token.opacity,
      };
      
      tokenMap.set(baseId, {
        ...token,
        id: baseId,
        themeValues: token.themeValues || themeValues,
        themeId: undefined,
      });
    } else {
      const existingToken = tokenMap.get(baseId)!;
      const themeId = token.themeId || (themes.length > 0 ? themes[0].id : 'theme-1');
      
      existingToken.themeValues = existingToken.themeValues || {};
      existingToken.themeValues[themeId] = {
        hue: token.hue,
        saturation: token.saturation,
        lightness: token.lightness,
        alpha: token.alpha,
        value: token.value,
        unit: token.unit,
        fontWeight: token.fontWeight,
        lineHeight: token.lineHeight,
        shadowValue: token.shadowValue,
        opacity: token.opacity,
      };
    }
  });
  
  return Array.from(tokenMap.values());
};

export const loadFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      
      if (data.tokens && data.themes) {
        data.tokens = migrateTokens(data.tokens, data.themes);
        
        if (data.nodes) {
          data.nodes = data.nodes.map((node: any) => {
            if (node.tokenAssignments) {
              const updatedAssignments: any = {};
              Object.keys(node.tokenAssignments).forEach(themeId => {
                updatedAssignments[themeId] = node.tokenAssignments[themeId].map((tokenId: string) => 
                  tokenId.replace(/-theme-\d+$/, '')
                );
              });
              return { ...node, tokenAssignments: updatedAssignments };
            }
            return node;
          });
        }
      }
      
      const migrationResult = migrateToLatest({
        nodes: data.nodes || [],
        tokens: data.tokens || [],
        groups: data.groups || [],
        pages: data.pages || [],
        themes: data.themes || [],
        projects: data.projects || [],
        canvasStates: data.canvasStates || [],
        advancedLogic: [],
        schemaVersion: data.schemaVersion,
      });
      if (migrationResult.migrated) {
        console.log(`Schema migration applied: v${migrationResult.fromVersion} -> v${migrationResult.toVersion} (${migrationResult.appliedMigrations.join(', ')})`);
        data.nodes = migrationResult.data.nodes;
        data.tokens = migrationResult.data.tokens;
        data.groups = migrationResult.data.groups;
        data.pages = migrationResult.data.pages;
        data.themes = migrationResult.data.themes;
        data.projects = migrationResult.data.projects;
        data.canvasStates = migrationResult.data.canvasStates;
      }
      data.schemaVersion = CURRENT_SCHEMA_VERSION;

      console.log('Loaded from localStorage (with token migration)');
      return data;
    }
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
  }
  return null;
};
