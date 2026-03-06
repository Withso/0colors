import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ColorCanvas } from './components/ColorCanvas';
import { TokensPanel } from './components/TokensPanel';
import { TokenTablePopup } from './components/TokenTablePopup';
import { DevModePanel } from './components/DevModePanel';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { ProjectsPage } from './components/ProjectsPage';
import { CodePreview } from './components/CodePreview';
import { MultiPageExport } from './components/MultiPageExport';
import { CommandPalette } from './components/CommandPalette';
import { ColorNode, DesignToken, TokenProject, TokenGroup, CanvasState, Page, Theme, NodeAdvancedLogic, ExpressionToken, ConditionRow, ChannelLogic, TokenAssignmentLogic, DevConfig, createDefaultDevConfig } from './components/types';
import { Button } from './components/ui/button';
import { Plus, Share2, Download, Upload, Copy, Palette, Library, ChevronDown, Edit2, Trash2, RotateCcw, ArrowLeft, Search, LayoutGrid, Code, Workflow, RefreshCw, Type, Wand2, Film, Grid, Crown, CircleDot, Ruler, Table, SwatchBook, Undo2, Redo2, Maximize, Locate, Lightbulb, RotateCw, Eye, EyeOff, Tag, Command, BookOpen, Lock, Sparkles, Terminal } from 'lucide-react';
import { AskAIChat } from './components/AskAIChat';
import { AISettingsPopup } from './components/AISettingsPopup';
import {
  Conversation, loadCloudConversations, saveCloudConversations,
  AISettings, ContextToggles,
  loadLocalConversations, saveLocalConversations, mergeConversations, trimConversations,
  loadAISettings, saveAISettings, loadContextTier, saveContextTier, loadContextToggles, saveContextToggles,
  loadCloudSettingsBundle, saveCloudSettingsBundle, buildCloudSettingsBundle, mergeSettingsBundles,
  setLocalSettingsUpdatedAt,
} from './utils/ai-provider';
import type { ContextTier } from './utils/ai-context-manager';
import { buildProjectContext } from './utils/ai-project-context';
import { isNodeHiddenInTheme } from './utils/visibility';
import { getAutoAssignSuffixValue } from './components/AutoAssignTokenMenu';
import { useUndoRedo, UndoableState } from './hooks/useUndoRedo';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './components/ui/dropdown-menu';
import { Input } from './components/ui/input';
import { Switch } from './components/ui/switch';

// Import HCT utilities
import { hctToRgb, rgbToHct, hctToHex } from './utils/hct-utils';
import { copyTextToClipboard } from './utils/clipboard';
import { hslToRgb, rgbToHex, rgbToHsl, hslToOklch as hslToOklchBase, oklchToHsl } from './utils/color-conversions';
import { getUniqueTokenName, getUniqueNodeName } from './utils/nameValidation';
import { toast, Toaster } from "sonner@2.0.3";
import { Tip } from './components/Tip';
import {
  evaluateChannelLogic,
  nodeToChannelMapThemeAware,
  EvalContext,
  getEffectiveChannels,
  getEffectiveBaseValues,
} from './utils/advanced-logic-engine';
import { isAdvancedDraft } from './utils/advanced-draft-registry';

// ── Cloud sync & auth ──
import { AuthPage } from './components/AuthPage';
import { getSupabaseClient, SERVER_BASE } from './utils/supabase/client';
import { publicAnonKey } from './utils/supabase/info';
import { decryptPAT } from './utils/crypto';
import {
  initCloudSync,
  destroyCloudSync,
  updateAccessToken,
  markDirty,
  removeDirty,
  forceSyncNow,
  isDirty,
  hasDirtyProjects,
  getDirtyProjectIds,
  registerCloudProject,
  unregisterCloudProject,
  loadCloudProjects,
  getCloudMeta,
} from './utils/supabase/cloud-sync';
import type { ProjectSnapshot } from './utils/supabase/cloud-sync';
import { migrateToLatest, migrateSnapshot, migrateAdvancedLogic, CURRENT_SCHEMA_VERSION } from './utils/migrations';
import { computeAllProjectTokens, type ProjectComputedTokens } from './utils/computed-tokens';
import { generateCSSVariables, generateDTCGJSON, generateTailwindConfig, generateFigmaVariablesJSON } from './utils/tokenFormatters';

// Auth session keys
const AUTH_SESSION_KEY = '0colors-auth-session';

// ═══════════════════════════════════════════════════════════════
// MODULE-LEVEL NETWORK ERROR SUPPRESSOR
// ═══════════════════════════════════════════════════════════════
// Must run at the module level — BEFORE React mounts — so it catches
// errors fired by the Supabase SDK's auto-refresh timer and any
// early fetch() calls that happen before useEffect handlers register.
// ═══════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  const _networkErrorPatterns = [
    'Failed to fetch',
    'NetworkError',
    'AbortError',
    'fetch timeout',
    'Network request failed',
    'Load failed', // Safari
    'Lock not released',        // Supabase GoTrue lock timeout (React Strict Mode)
    'Lock broken by another',   // Supabase GoTrue lock steal
  ];

  function _isNetworkError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return _networkErrorPatterns.some(p => lower.includes(p.toLowerCase()));
  }

  // Catch unhandled promise rejections (e.g. Supabase SDK internal token refresh)
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const msg = event.reason?.message || event.reason?.toString?.() || '';
    if (_isNetworkError(msg)) {
      console.log(`[Global] Suppressed network rejection (non-fatal): ${msg}`);
      event.preventDefault();
    }
  });

  // Catch synchronous errors that bubble up from async contexts
  window.addEventListener('error', (event: ErrorEvent) => {
    const msg = event.message || event.error?.message || '';
    if (_isNetworkError(msg)) {
      console.log(`[Global] Suppressed network error event (non-fatal): ${msg}`);
      event.preventDefault();
    }
  });
}

// Color space conversion utilities - base functions imported from utils/color-conversions
// Uppercase-returning wrapper for App.tsx usage pattern (L,C,H vs l,c,h)
function hslToOklchUpper(h: number, s: number, l: number): { L: number; C: number; H: number } {
  const result = hslToOklchBase(h, s, l);
  return { L: result.l, C: result.c / 0.4, H: result.h };
}

function rgbToOklch(r: number, g: number, b: number): { L: number; C: number; H: number } {
  const hsl = rgbToHsl(r, g, b);
  return hslToOklchUpper(hsl.h, hsl.s, hsl.l);
}

function oklchToRgb(L: number, C: number, H: number): { r: number; g: number; b: number } {
  const hsl = oklchToHsl(L, C, H);
  return hslToRgb(hsl.h, hsl.s, hsl.l);
}

function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function oklchToHex(L: number, C: number, H: number): string {
  const rgb = oklchToRgb(L, C, H);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  // Remove the # if present
  const cleanHex = hex.replace('#', '');
  
  // Parse the hex values
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  return { r, g, b };
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const rgb = hexToRgb(hex);
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

// Helper: Get effective HSL values from a node, properly converting from its native color space
// This MUST be used everywhere we derive token HSL values from a node
function getNodeEffectiveHSL(
  node: ColorNode,
  themeOverride?: any
): { hue: number; saturation: number; lightness: number; alpha: number } {
  // For child nodes (palette shades, linked children), HSL is always the ground truth
  // because shade generation computes HSL first and derives native props from it.
  // Skip native color-space conversion to avoid round-trip errors or stale derived values.
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
  // Default: HSL color space (or fallback)
  return {
    hue: themeOverride?.hue !== undefined ? themeOverride.hue : node.hue,
    saturation: themeOverride?.saturation !== undefined ? themeOverride.saturation : node.saturation,
    lightness: themeOverride?.lightness !== undefined ? themeOverride.lightness : node.lightness,
    alpha: themeOverride?.alpha !== undefined ? themeOverride.alpha : node.alpha,
  };
}

// Detect if running in Figma plugin
const isInFigma = typeof window !== 'undefined' && window.parent !== window;

// Helper: regenerate palette shade children in an updatedNodes array
// Called when a palette node's base color changes due to parent propagation
const regeneratePaletteShades = (
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
    // auto mode
    const dev = Math.abs(lightness - 50) / 50;
    return Math.max(0, Math.min(100, bSat * (1 - dev * 0.6)));
  };

  // Find shade children sorted by position (same as palette node card logic)
  const shadeChildren = updatedNodes
    .map((n, i) => ({ node: n, index: i }))
    .filter(({ node }) => node.parentId === paletteNode.id)
    .sort((a, b) => a.node.position.y - b.node.position.y);

  // Determine shade colorSpace from the palette's paletteColorFormat
  const palFormat = paletteNode.paletteColorFormat ?? 'HEX';
  const formatToCS: Record<string, string> = { 'HEX': 'hsl', 'HSLA': 'hsl', 'OKLCH': 'oklch', 'RGBA': 'rgb' };
  const paletteColorSpace = formatToCS[palFormat as string] || 'hsl';

  shadeChildren.forEach(({ node: shadeNode, index: shadeIndex }, i) => {
    const t = shadeCount > 1 ? i / (shadeCount - 1) : 0;
    const curved = applyCurve(t);
    const shadeLightness = lightnessStart + (lightnessEnd - lightnessStart) * curved;
    const shadeSaturation = computeSat(baseSat, t, shadeLightness);
    const shadeHue = (baseHue + hueShiftVal * t + 360) % 360;

    // Compute native color space properties
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

// ─── Token Node Hierarchy Helpers ─────────────────────────────────────────────

/** Walk up from a token node to find its ROOT prefix ancestor (skips mid-tree prefixes) */
const findTokenPrefixNode = (node: ColorNode, allNodes: ColorNode[]): ColorNode | null => {
  let current: ColorNode | undefined = node;
  while (current) {
    if (current.isTokenPrefix) {
      // Check if this is the ROOT prefix (no token-node parent)
      const parent = current.parentId ? allNodes.find(n => n.id === current!.parentId) : null;
      if (!parent || !parent.isTokenNode) {
        return current; // Root prefix found
      }
    }
    if (!current.parentId) return null;
    current = allNodes.find(n => n.id === current!.parentId);
  }
  return null;
};

/** Compute the full token name for a token node by walking up to the root prefix.
 *  Mid-tree prefixes contribute their tokenNodeSuffix and the walk continues upward.
 *  E.g. root prefix="color-bg", child="primary", mid-prefix="text", grandchild="1" → "color-bg-primary-text-1"
 */
const computeTokenPath = (node: ColorNode, allNodes: ColorNode[]): string => {
  const parts: string[] = [];
  let current: ColorNode | undefined = node;
  while (current) {
    if (current.isTokenPrefix) {
      // Check if this is the root prefix (no token-node parent)
      const parent = current.parentId ? allNodes.find(n => n.id === current!.parentId) : null;
      if (!parent || !parent.isTokenNode) {
        // Root prefix — use referenceName and stop
        parts.unshift(current.referenceName || 'color');
        break;
      } else {
        // Mid-tree prefix — use tokenNodeSuffix and continue walking
        parts.unshift(current.tokenNodeSuffix || current.referenceName || '1');
      }
    } else {
      parts.unshift(current.tokenNodeSuffix || current.referenceName || '1');
    }
    current = current.parentId ? allNodes.find(n => n.id === current!.parentId) : undefined;
  }
  return parts.join('-');
};

/** Compute the token path from the root prefix DOWN TO (but not including) a given node.
 *  This gives the "parent path prefix" for deriving a node's suffix from its full referenceName.
 *  E.g. for a mid-tree prefix at depth 2 under root "brand" → child "primary" → this node,
 *  the ancestor path would be "brand-primary".
 */
const computeAncestorPath = (node: ColorNode, allNodes: ColorNode[]): string => {
  const parts: string[] = [];
  let current: ColorNode | undefined = node.parentId ? allNodes.find(n => n.id === node.parentId) : undefined;
  while (current) {
    if (current.isTokenPrefix) {
      const parent = current.parentId ? allNodes.find(n => n.id === current!.parentId) : null;
      if (!parent || !parent.isTokenNode) {
        // Root prefix — use referenceName and stop
        parts.unshift(current.referenceName || 'color');
        break;
      } else {
        // Mid-tree prefix — use tokenNodeSuffix and continue walking
        parts.unshift(current.tokenNodeSuffix || current.referenceName || '1');
      }
    } else {
      parts.unshift(current.tokenNodeSuffix || current.referenceName || '1');
    }
    current = current.parentId ? allNodes.find(n => n.id === current!.parentId) : undefined;
  }
  return parts.join('-');
};

/** Get next auto-increment suffix for a new child under a token node parent */
const getNextTokenChildSuffix = (parentId: string, allNodes: ColorNode[]): string => {
  const siblings = allNodes.filter(n => n.parentId === parentId && n.isTokenNode);
  return String(siblings.length + 1);
};

/** Collect all descendant token node IDs recursively */
const collectTokenDescendants = (nodeId: string, allNodes: ColorNode[]): ColorNode[] => {
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

// Auto-spacing utility: maintains 40px gaps between all nodes (extra space for floating label)
const MIN_GAP = 40;

const getNodeHeight = (node: ColorNode, tokens: DesignToken[], allNodes?: ColorNode[], activeThemeId?: string, primaryThemeId?: string): number => {
  // Handle palette shade nodes (compact 44px card)
  if (allNodes && node.parentId) {
    const parentNode = allNodes.find(n => n.id === node.parentId);
    if (parentNode?.isPalette) {
      return 48; // 44px card + 4px padding
    }
  }
  
  // Theme-aware token count: use tokenAssignments[themeId] when available, fallback to tokenIds
  const tokenCount = (() => {
    if (activeThemeId && node.tokenAssignments?.[activeThemeId] !== undefined) {
      return node.tokenAssignments[activeThemeId].length;
    }
    return node.tokenIds?.length || 0;
  })();
  
  // Handle spacing nodes
  if (node.isSpacing) {
    const tokenRowHeight = 40;
    const tokenSectionHeight = tokenCount > 0 ? tokenCount * tokenRowHeight : 0;
    const tokenSelectorHeight = 40;
    // Header (40) + Preview box (200-ish max) + Value input (40) + Display (30) + tokens + padding
    return 80 + 200 + 40 + 30 + tokenSectionHeight + tokenSelectorHeight + 80; // Approximate height
  }
  
  // Handle token nodes (name area instead of color swatch, no sliders)
  if (node.isTokenNode) {
    const nameAreaHeight = 56; // h-14 compact token name area
    // Reserve vertical space for the floating reference label shown above the card.
    // The label sits at top: -32px above the card. Including it in height ensures
    // sibling token nodes are spaced far enough apart that labels don't overlap.
    const refLabelArea = 32;
    // Prefix nodes have no token section
    if (node.isTokenPrefix) {
      const paddingAndGaps = 12; // mb-3 bottom only, no token section
      return nameAreaHeight + paddingAndGaps + refLabelArea;
    }
    // Token node children: 0 or 1 value token row + selector (theme-aware)
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
    const paddingAndGaps = 24; // mb-3 (12px gap) + pb-3 (12px token section bottom)
    // Advanced island is always rendered for non-prefix token nodes (visibility-toggled, not removed).
    // py-[8px]*2 (16) + text line ~18px + mt-[2px] + border 2px = ~38px
    const advancedIslandHeight = 38;
    return nameAreaHeight + tokenSectionHeight + tokenSelectorHeight + paddingAndGaps + refLabelArea + advancedIslandHeight;
  }
  
  const colorPreviewHeight = 96; // h-24
  const tokenRowHeight = 40; // Each token row (h-8 = 32px + space-y-2 = 8px gap)
  const tokenSectionHeight = tokenCount > 0 ? tokenCount * tokenRowHeight : 0; // No extra padding needed
  const tokenSelectorHeight = 40; // The "Select token..." dropdown (h-8 = 32px + space-y-2 = 8px gap)
  
  if (!node.isExpanded) {
    // Collapsed: color preview + lock icons + token section + token selector
    const lockIconsHeight = node.parentId ? 48 : 0; // Lock icons only shown when has parent
    return colorPreviewHeight + lockIconsHeight + tokenSectionHeight + tokenSelectorHeight + 16; // 16px padding
  }
  
  // Expanded: color preview + all sliders + lock icons + token section + token selector
  // Each slider row is about 70px (label + input + slider)
  const slidersHeight = 4 * 70; // HSL has 4 properties (H, S, L, A)
  const lockIconsHeight = node.parentId ? 48 : 0;
  const paddingAndSpacing = 60; // Various paddings and gaps (includes space-y-3, px-4, etc.)
  
  return colorPreviewHeight + slidersHeight + lockIconsHeight + tokenSectionHeight + tokenSelectorHeight + paddingAndSpacing;
};

const adjustNodeSpacing = (nodes: ColorNode[], tokens: DesignToken[], projectId: string, activeThemeId?: string): ColorNode[] => {
  const projectNodes = nodes.filter(n => n.projectId === projectId);
  const otherNodes = nodes.filter(n => n.projectId !== projectId);
  
  // Create copies of all nodes for auto-positioning
  const autoPositionedNodes = projectNodes.map(n => ({ ...n }));
  
  // Build a map of parent-child relationships (only for auto-positioned nodes)
  const childrenMap = new Map<string, string[]>();
  autoPositionedNodes.forEach(node => {
    if (node.parentId) {
      const siblings = childrenMap.get(node.parentId) || [];
      siblings.push(node.id);
      childrenMap.set(node.parentId, siblings);
    }
  });
  
  // Phase 1: Check and resolve collisions iteratively (only among auto-positioned nodes)
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
        
        // Calculate the bounding boxes with desired spacing
        const aLeft = nodeA.position.x;
        const aRight = nodeA.position.x + nodeAWidth;
        const aTop = nodeA.position.y;
        const aBottom = nodeA.position.y + nodeAHeight;
        
        const bLeft = nodeB.position.x;
        const bRight = nodeB.position.x + nodeBWidth;
        const bTop = nodeB.position.y;
        const bBottom = nodeB.position.y + nodeBHeight;
        
        // Check for overlap or insufficient gap
        const horizontalOverlap = !(aRight + MIN_GAP <= bLeft || bRight + MIN_GAP <= aLeft);
        const verticalOverlap = !(aBottom + MIN_GAP <= bTop || bBottom + MIN_GAP <= aTop);
        
        if (horizontalOverlap && verticalOverlap) {
          hadCollision = true;
          
          // Determine push direction based on parent-child relationship
          const isParentChild = nodeA.parentId === nodeB.id || nodeB.parentId === nodeA.id;
          const isSiblings = nodeA.parentId === nodeB.parentId && nodeA.parentId !== null;
          
          if (isSiblings) {
            // Siblings: push vertically (down)
            // Always push the lower one down
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
            // Parent-child: maintain horizontal relationship
            if (nodeB.parentId === nodeA.id) {
              // B is child of A - ensure B is to the right of A
              const requiredX = aRight + MIN_GAP;
              if (nodeB.position.x < requiredX) {
                nodeB.position.x = requiredX;
              }
            } else {
              // A is child of B - ensure A is to the right of B
              const requiredX = bRight + MIN_GAP;
              if (nodeA.position.x < requiredX) {
                nodeA.position.x = requiredX;
              }
            }
          } else {
            // No relationship: push in the direction of least overlap
            const overlapX = Math.min(aRight - bLeft + MIN_GAP, bRight - aLeft + MIN_GAP);
            const overlapY = Math.min(aBottom - bTop + MIN_GAP, bBottom - aTop + MIN_GAP);
            
            if (overlapX < overlapY) {
              // Push horizontally
              if (nodeA.position.x < nodeB.position.x) {
                nodeB.position.x = aRight + MIN_GAP;
              } else {
                nodeA.position.x = bRight + MIN_GAP;
              }
            } else {
              // Push vertically
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
  
  // Phase 2: Optimize positions by moving nodes closer together when possible
  // Sort by Y position to process top-to-bottom
  const sortedNodes = [...autoPositionedNodes].sort((a, b) => a.position.y - b.position.y);
  
  sortedNodes.forEach((node) => {
    // Find the node in autoPositionedNodes to modify
    const nodeIndex = autoPositionedNodes.findIndex(n => n.id === node.id);
    if (nodeIndex === -1) return;
    
    const currentNode = autoPositionedNodes[nodeIndex];
    const nodeWidth = currentNode.width || 240;
    const nodeHeight = getNodeHeight(currentNode, tokens, nodes, activeThemeId);
    
    // Start with an ideal Y position based on parent or 0
    let optimalY = 0;
    if (currentNode.parentId) {
      const parent = autoPositionedNodes.find(n => n.id === currentNode.parentId);
      if (parent) {
        optimalY = parent.position.y;
      }
    }
    
    // Check against only other auto-positioned nodes to find constraints
    for (const otherNode of autoPositionedNodes) {
      if (otherNode.id === currentNode.id) continue;
      
      const otherWidth = otherNode.width || 240;
      const otherHeight = getNodeHeight(otherNode, tokens, nodes, activeThemeId);
      
      // Check for horizontal overlap
      const currentLeft = currentNode.position.x;
      const currentRight = currentNode.position.x + nodeWidth;
      const otherLeft = otherNode.position.x;
      const otherRight = otherNode.position.x + otherWidth;
      
      const horizontalOverlap = !(currentRight + MIN_GAP <= otherLeft || otherRight + MIN_GAP <= currentLeft);
      
      if (horizontalOverlap) {
        // If other node is above or at the same level, we need to be below it
        if (otherNode.position.y <= currentNode.position.y) {
          const minY = otherNode.position.y + otherHeight + MIN_GAP;
          optimalY = Math.max(optimalY, minY);
        }
      }
    }
    
    // For siblings, ensure proper vertical stacking order (only auto-positioned siblings)
    if (currentNode.parentId) {
      const siblings = autoPositionedNodes.filter(n => n.parentId === currentNode.parentId && n.id !== currentNode.id);
      
      // Find all siblings that should be above this node
      siblings.forEach(sibling => {
        const siblingHeight = getNodeHeight(sibling, tokens, nodes, activeThemeId);
        // If sibling was originally above us, ensure we stay below it
        if (sibling.position.y <= currentNode.position.y) {
          const minY = sibling.position.y + siblingHeight + MIN_GAP;
          optimalY = Math.max(optimalY, minY);
        }
      });
    }
    
    // Move the node to optimal position
    autoPositionedNodes[nodeIndex].position.y = optimalY;
  });
  
  // Combine all nodes: auto-positioned + other projects
  return [...autoPositionedNodes, ...otherNodes];
};

// Default data structure
const getDefaultData = () => ({
  nodes: [
    {
      id: '1',
      colorSpace: 'hsl' as const,
      hue: 120,
      saturation: 70,
      lightness: 50,
      alpha: 100,
      position: { x: 100, y: 200 },
      parentId: null,
      hueOffset: 0,
      saturationOffset: 0,
      lightnessOffset: 0,
      alphaOffset: 0,
      tokenId: null,
      tokenIds: [],
      width: 240,
      projectId: 'sample-project',
      pageId: 'page-1',
      lockHue: false,
      lockSaturation: false,
      lockLightness: false,
      lockAlpha: false,
      lockRed: false,
      lockGreen: false,
      lockBlue: false,
      diffHue: false,
      diffSaturation: false,
      diffLightness: false,
      diffAlpha: false,
      diffRed: false,
      diffGreen: false,
      diffBlue: false,
      isExpanded: false,
    },
  ],
  tokens: [
    { id: 'grey-50', name: 'grey-50', type: 'color' as const, groupId: 'grey-group', projectId: 'sample-project', pageId: 'page-1', themeValues: { 'theme-1': { hue: 0, saturation: 0, lightness: 98, alpha: 100 } }, hue: 0, saturation: 0, lightness: 98, alpha: 100 },
    { id: 'grey-100', name: 'grey-100', type: 'color' as const, groupId: 'grey-group', projectId: 'sample-project', pageId: 'page-1', themeValues: { 'theme-1': { hue: 0, saturation: 0, lightness: 96, alpha: 100 } }, hue: 0, saturation: 0, lightness: 96, alpha: 100 },
    { id: 'grey-200', name: 'grey-200', type: 'color' as const, groupId: 'grey-group', projectId: 'sample-project', pageId: 'page-1', themeValues: { 'theme-1': { hue: 0, saturation: 0, lightness: 90, alpha: 100 } }, hue: 0, saturation: 0, lightness: 90, alpha: 100 },
    { id: 'grey-300', name: 'grey-300', type: 'color' as const, groupId: 'grey-group', projectId: 'sample-project', pageId: 'page-1', themeValues: { 'theme-1': { hue: 0, saturation: 0, lightness: 83, alpha: 100 } }, hue: 0, saturation: 0, lightness: 83, alpha: 100 },
    { id: 'grey-400', name: 'grey-400', type: 'color' as const, groupId: 'grey-group', projectId: 'sample-project', pageId: 'page-1', themeValues: { 'theme-1': { hue: 0, saturation: 0, lightness: 64, alpha: 100 } }, hue: 0, saturation: 0, lightness: 64, alpha: 100 },
    { id: 'grey-500', name: 'grey-500', type: 'color' as const, groupId: 'grey-group', projectId: 'sample-project', pageId: 'page-1', themeValues: { 'theme-1': { hue: 0, saturation: 0, lightness: 45, alpha: 100 } }, hue: 0, saturation: 0, lightness: 45, alpha: 100 },
    { id: 'grey-600', name: 'grey-600', type: 'color' as const, groupId: 'grey-group', projectId: 'sample-project', pageId: 'page-1', themeValues: { 'theme-1': { hue: 0, saturation: 0, lightness: 32, alpha: 100 } }, hue: 0, saturation: 0, lightness: 32, alpha: 100 },
    { id: 'grey-700', name: 'grey-700', type: 'color' as const, groupId: 'grey-group', projectId: 'sample-project', pageId: 'page-1', themeValues: { 'theme-1': { hue: 0, saturation: 0, lightness: 25, alpha: 100 } }, hue: 0, saturation: 0, lightness: 25, alpha: 100 },
    { id: 'grey-800', name: 'grey-800', type: 'color' as const, groupId: 'grey-group', projectId: 'sample-project', pageId: 'page-1', themeValues: { 'theme-1': { hue: 0, saturation: 0, lightness: 15, alpha: 100 } }, hue: 0, saturation: 0, lightness: 15, alpha: 100 },
    { id: 'grey-900', name: 'grey-900', type: 'color' as const, groupId: 'grey-group', projectId: 'sample-project', pageId: 'page-1', themeValues: { 'theme-1': { hue: 0, saturation: 0, lightness: 9, alpha: 100 } }, hue: 0, saturation: 0, lightness: 9, alpha: 100 },
  ],
  groups: [{
    id: 'grey-group',
    name: 'grey',
    projectId: 'sample-project',
    isExpanded: true,
  }],
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

// LocalStorage key
const STORAGE_KEY = 'color-tool-data';
const GROUP_EXPAND_KEY = 'color-tool-group-expand-states';

// Helper: immediately save group expand/collapse states (no debounce)
const saveGroupExpandStates = (groups: TokenGroup[]) => {
  try {
    const expandMap: Record<string, boolean> = {};
    groups.forEach(g => { expandMap[g.id] = g.isExpanded; });
    localStorage.setItem(GROUP_EXPAND_KEY, JSON.stringify(expandMap));
  } catch (_) { /* ignore quota errors */ }
};

// Helper: load saved group expand/collapse states
const loadGroupExpandStates = (): Record<string, boolean> | null => {
  try {
    const raw = localStorage.getItem(GROUP_EXPAND_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  return null;
};

// Helper: merge saved expand states into a groups array
const mergeGroupExpandStates = (groups: TokenGroup[]): TokenGroup[] => {
  const saved = loadGroupExpandStates();
  if (!saved) return groups;
  return groups.map(g => {
    if (saved.hasOwnProperty(g.id)) {
      return { ...g, isExpanded: saved[g.id] };
    }
    return g;
  });
};

// Helper function to save data to localStorage
const saveToLocalStorage = (data: any) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('✅ Saved to localStorage');
  } catch (error) {
    console.error('❌ Failed to save to localStorage:', error);
  }
};

// Helper function to migrate old token format to new format
const migrateTokens = (tokens: DesignToken[], themes: any[]) => {
  // First, deduplicate tokens (remove theme-specific duplicates)
  const tokenMap = new Map<string, DesignToken>();
  
  tokens.forEach(token => {
    // Extract base token ID (remove theme suffix if it exists)
    const baseId = token.id.replace(/-theme-\d+$/, '');
    
    if (!tokenMap.has(baseId)) {
      // First time seeing this token, create it
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
        id: baseId, // Use base ID without theme suffix
        themeValues: token.themeValues || themeValues,
        themeId: undefined, // Remove deprecated themeId
      });
    } else {
      // Token already exists, merge themeValues
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

// Helper function to load data from localStorage
const loadFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      
      // Migrate tokens to new format if needed
      if (data.tokens && data.themes) {
        data.tokens = migrateTokens(data.tokens, data.themes);
        
        // Also migrate node tokenAssignments to use base token IDs
        if (data.nodes) {
          data.nodes = data.nodes.map((node: any) => {
            if (node.tokenAssignments) {
              const updatedAssignments: any = {};
              Object.keys(node.tokenAssignments).forEach(themeId => {
                updatedAssignments[themeId] = node.tokenAssignments[themeId].map((tokenId: string) => 
                  tokenId.replace(/-theme-\d+$/, '') // Remove theme suffix
                );
              });
              return { ...node, tokenAssignments: updatedAssignments };
            }
            return node;
          });
        }
      }
      
      // ── Schema migration pipeline ──
      // Run all pending migrations to bring data up to current schema version.
      // This handles any data structure changes from previous versions automatically.
      const migrationResult = migrateToLatest({
        nodes: data.nodes || [],
        tokens: data.tokens || [],
        groups: data.groups || [],
        pages: data.pages || [],
        themes: data.themes || [],
        projects: data.projects || [],
        canvasStates: data.canvasStates || [],
        advancedLogic: [], // advancedLogic is stored separately in localStorage
        schemaVersion: data.schemaVersion,
      });
      if (migrationResult.migrated) {
        console.log(`🔄 Schema migration applied: v${migrationResult.fromVersion} → v${migrationResult.toVersion} (${migrationResult.appliedMigrations.join(', ')})`);
        data.nodes = migrationResult.data.nodes;
        data.tokens = migrationResult.data.tokens;
        data.groups = migrationResult.data.groups;
        data.pages = migrationResult.data.pages;
        data.themes = migrationResult.data.themes;
        data.projects = migrationResult.data.projects;
        data.canvasStates = migrationResult.data.canvasStates;
      }
      data.schemaVersion = CURRENT_SCHEMA_VERSION;

      console.log('✅ Loaded from localStorage (with token migration)');
      return data;
    }
  } catch (error) {
    console.error('❌ Failed to load from localStorage:', error);
  }
  return null;
};

// Auto-dismiss "Go back" button timing
const GO_BACK_VISIBLE_MS = 5000;  // how long the button stays visible before fading
const GO_BACK_FADE_MS = 400;      // fade-out animation duration

export default function App() {
  // NOTE: Network error suppression is handled at module level (above)
  // so it's active before React mounts — no useEffect needed.

  // ── Sample mode: isSampleMode is always false; dead-code blocks below still reference these vars ──
  const isSampleMode = false;
  const sampleTemplates = [] as any[], filteredSampleTemplates = [] as any[], activeSampleIdx = 0;
  const sampleTemplateSearch = '', setSampleTemplateSearch = (() => {}) as any;
  const handleSwitchSampleTemplate = (() => {}) as any, handleDuplicateSampleProject = (() => {}) as any;










  // ── Auth state ──
  const [authSession, setAuthSession] = useState<{
    accessToken: string;
    userId: string;
    email: string;
    name: string;
    isAdmin?: boolean;
    isTemplateAdmin?: boolean;
  } | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_SESSION_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return null;
  });
  const [authChecking, setAuthChecking] = useState(true);
  const [authSkipped, setAuthSkipped] = useState(() => {
    return localStorage.getItem('0colors-auth-skipped') === 'true';
  });
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'local' | 'idle' | 'dirty' | 'syncing' | 'synced' | 'error' | 'offline'>('local');
  const [lastSyncError, setLastSyncError] = useState<string | undefined>(undefined);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const authSessionRef = useRef(authSession);
  authSessionRef.current = authSession;

  const [viewingProjects, setViewingProjects] = useState(true);

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [copiedNodes, setCopiedNodes] = useState<ColorNode[]>([]);

  // Pending token restore after duplicate/paste — stores info needed to recreate tokens
  const [pendingTokenRestore, setPendingTokenRestore] = useState<{
    oldToNewIdMap: Record<string, string>;
    originalNodes: ColorNode[];
    timestamp: number;
  } | null>(null);

  // "Go back" state — saved when navigating away from a node via token-assignment Target icon
  const [tokenNavBackState, setTokenNavBackState] = useState<{
    sourceNodeId: string;
    pan: { x: number; y: number };
    zoom: number;
  } | null>(null);
  const [goBackFading, setGoBackFading] = useState(false);
  const goBackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goBackFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delay flag — suppresses multi-select toolbar briefly after duplicate/paste triggers restore prompt
  const [multiSelectBarDelay, setMultiSelectBarDelay] = useState(false);

  // Initialize with default data
  const defaultData = getDefaultData();
  const [allNodes, setAllNodes] = useState<ColorNode[]>(defaultData.nodes);
  const [tokens, setTokens] = useState<DesignToken[]>(defaultData.tokens);
  const [canvasStates, setCanvasStates] = useState<CanvasState[]>(defaultData.canvasStates);
  const [projects, setProjects] = useState<TokenProject[]>(defaultData.projects);
  const [pages, setPages] = useState<Page[]>(defaultData.pages);
  const [themes, setThemes] = useState<Theme[]>(defaultData.themes);
  const [groups, setGroups] = useState<TokenGroup[]>(defaultData.groups);
  const [activeProjectId, setActiveProjectId] = useState<string>(defaultData.activeProjectId);
  const [activePageId, setActivePageId] = useState<string>(defaultData.activePageId);
  const [activeThemeId, setActiveThemeId] = useState<string>(defaultData.activeThemeId);

  // Advanced Logic Layer — stored separately from nodes
  const [advancedLogic, setAdvancedLogic] = useState<NodeAdvancedLogic[]>(() => {
    try {
      const stored = localStorage.getItem('advanced-logic-v1');
      const parsed = stored ? JSON.parse(stored) : [];
      // Run migration pipeline on separately-stored advancedLogic
      const { data, migrated } = migrateAdvancedLogic(parsed);
      if (migrated) {
        // Persist migrated data back immediately
        localStorage.setItem('advanced-logic-v1', JSON.stringify(data));
      }
      return data;
    } catch { return []; }
  });
  const advancedLogicRef = useRef<NodeAdvancedLogic[]>(advancedLogic);
  advancedLogicRef.current = advancedLogic; // Inline update (not useEffect) so snapshot always has latest

  // ── Always-current refs for core state arrays ──
  // Used by getProjectSnapshot (called asynchronously from cloud-sync module)
  // to guarantee the snapshot always reflects the LATEST state, even if the
  // React re-render / useCallback refresh hasn't committed yet.
  const allNodesRef = useRef(allNodes);
  allNodesRef.current = allNodes;
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const themesRef = useRef(themes);
  themesRef.current = themes;
  const canvasStatesRef = useRef(canvasStates);
  canvasStatesRef.current = canvasStates;

  // Per-theme selection state: remembers which nodes are selected in each theme
  // so switching away and back restores the previous selection.
  const themeSelectionsRef = useRef<Record<string, { selectedNodeId: string | null; selectedNodeIds: string[] }>>({});
  const selectedNodeIdRef = useRef<string | null>(selectedNodeId);
  const selectedNodeIdsRef = useRef<string[]>(selectedNodeIds);
  const activeThemeIdRef = useRef<string>(activeThemeId);
  selectedNodeIdRef.current = selectedNodeId;
  selectedNodeIdsRef.current = selectedNodeIds;
  activeThemeIdRef.current = activeThemeId;

  // Project editing state
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  
  // Theme editing state
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [editingThemeName, setEditingThemeName] = useState('');

  // Page editing state
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingPageName, setEditingPageName] = useState('');
  
  // Highlighted project state (for newly imported/duplicated projects)
  const [highlightedProjectId, setHighlightedProjectId] = useState<string | null>(null);
  
  // Sidebar mode state
  const [sidebarMode, setSidebarMode] = useState<'color' | 'variables' | 'text' | 'components' | 'animation' | 'layout'>('color');
  
  // View mode state (canvas, code, or export)
  const [viewMode, setViewMode] = useState<'canvas' | 'code' | 'export'>('canvas');
  
  // Persistent state for CodePreview "Show as Hex" (per-page)
  const [codePreviewHexByPage, setCodePreviewHexByPage] = useState<Record<string, Set<string>>>({});

  // Persistent state for MultiPageExport selections (null = use defaults on first render)
  const [multiExportPageIds, setMultiExportPageIds] = useState<Set<string> | null>(null);
  const [multiExportThemeIds, setMultiExportThemeIds] = useState<Set<string> | null>(null);
  const [multiExportHexSpaces, setMultiExportHexSpaces] = useState<Set<string>>(new Set());

  // Token table popup state — persisted in localStorage
  const [showTokenTable, setShowTokenTable] = useState(() => {
    return localStorage.getItem('showTokenTable') === 'true';
  });

  // Token table "Show as Hex" override spaces — persisted in localStorage
  const [tokenTableHexSpaces, setTokenTableHexSpaces] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('tokenTableHexSpaces');
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set();
  });

  useEffect(() => {
    localStorage.setItem('showTokenTable', String(showTokenTable));
  }, [showTokenTable]);

  useEffect(() => {
    localStorage.setItem('tokenTableHexSpaces', JSON.stringify([...tokenTableHexSpaces]));
  }, [tokenTableHexSpaces]);

  // ── Dev Mode state ──
  const [showDevMode, setShowDevMode] = useState(false);
  const [devConfigs, setDevConfigs] = useState<Record<string, DevConfig>>(() => {
    try {
      const saved = localStorage.getItem('0colors-dev-configs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // Get/set dev config for active project
  const activeDevConfig = useMemo(() => {
    return devConfigs[activeProjectId] || createDefaultDevConfig();
  }, [devConfigs, activeProjectId]);

  const updateDevConfig = useCallback((config: DevConfig) => {
    setDevConfigs(prev => {
      const next = { ...prev, [activeProjectId]: config };
      localStorage.setItem('0colors-dev-configs', JSON.stringify(next));
      return next;
    });
  }, [activeProjectId]);

  // Debounced cloud save for devConfig
  const devConfigSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!authSession || !activeDevConfig) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (!project?.isCloud) return;

    if (devConfigSaveTimerRef.current) clearTimeout(devConfigSaveTimerRef.current);
    devConfigSaveTimerRef.current = setTimeout(async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        await fetch(`${SERVER_BASE}/dev/save-config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': session.access_token,
          },
          body: JSON.stringify({ projectId: activeProjectId, devConfig: activeDevConfig }),
        });
      } catch (e) {
        console.error('[DevMode] Cloud save error:', e);
      }
    }, 3000); // 3s debounce

    return () => {
      if (devConfigSaveTimerRef.current) clearTimeout(devConfigSaveTimerRef.current);
    };
  }, [activeDevConfig, activeProjectId, authSession, projects]);

  // Load devConfig from cloud when active cloud project changes
  useEffect(() => {
    if (!authSession) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (!project?.isCloud) return;

    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch(`${SERVER_BASE}/dev/load-config/${activeProjectId}`, {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': session.access_token,
          },
        });
        const data = await res.json();
        if (data.devConfig) {
          setDevConfigs(prev => {
            const next = { ...prev, [activeProjectId]: data.devConfig };
            localStorage.setItem('0colors-dev-configs', JSON.stringify(next));
            return next;
          });
        }
      } catch (e) {
        // Silently fail — local config is the fallback
      }
    })();
  }, [authSession, activeProjectId, projects]);

  // ── Webhook Input Polling ──
  // When the app is open and webhook input is enabled, poll for pending triggers
  useEffect(() => {
    if (!authSession || !activeDevConfig?.webhookEnabled) return;
    // Poll if either a target node is configured OR any node is marked as webhook input
    const hasWebhookTargets = activeDevConfig.webhookTargetNodeId ||
      allNodes.some(n => n.projectId === activeProjectId && n.isWebhookInput);
    if (!hasWebhookTargets) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (!project?.isCloud) return;

    const POLL_INTERVAL = 5000; // 5 seconds
    let running = true;

    const pollPending = async () => {
      if (!running) return;
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const headers = {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': session.access_token,
        };

        const res = await fetch(`${SERVER_BASE}/webhook-pending/${activeProjectId}`, { headers });
        const data = await res.json();

        if (data.pending && data.pending.value) {
          // Process the pending trigger
          const { value, format, targetNodeId } = data.pending;
          const nodeId = targetNodeId || activeDevConfig.webhookTargetNodeId;
          const targetNode = allNodesRef.current.find(n => n.id === nodeId);
          
          if (targetNode) {
            // Parse incoming value and apply to node
            // For hex format, convert to HSL and update
            if (format === 'hex' && typeof value === 'string') {
              const hex = value.replace('#', '');
              let r = 0, g = 0, b = 0;
              if (hex.length === 6 || hex.length === 8) {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
              }
              const hsl = rgbToHsl(r, g, b);
              // Use the existing updateNode function to apply changes
              window.dispatchEvent(new CustomEvent('devModeWebhookApply', {
                detail: { nodeId, hue: hsl.h, saturation: hsl.s, lightness: hsl.l }
              }));
            }
            toast.info(`Webhook received: ${value}`);
          }

          // Clear the pending trigger
          await fetch(`${SERVER_BASE}/webhook-clear/${activeProjectId}`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        // Silently ignore polling errors
      }
    };

    const timer = setInterval(pollPending, POLL_INTERVAL);
    pollPending(); // Check immediately

    return () => {
      running = false;
      clearInterval(timer);
    };
  }, [authSession, activeDevConfig?.webhookEnabled, activeDevConfig?.webhookTargetNodeId, activeProjectId, projects, allNodes]);

  // Persist advanced logic to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('advanced-logic-v1', JSON.stringify(advancedLogic));
    } catch { /* ignore quota errors */ }
  }, [advancedLogic]);

  // ═══════════════════════════════════════════════════════════════
  // COMPUTED TOKENS — derived per-project, per-theme resolved tokens
  // ═══════════════════════════════════════════════════════════════

  const computedTokensRef = useRef<Record<string, ProjectComputedTokens>>({});

  // Recompute whenever source data changes (debounced)
  useEffect(() => {
    if (isInitialLoad) return;

    const timeoutId = setTimeout(() => {
      try {
        // Pass previous computed tokens for rename detection
        const previousMap = computedTokensRef.current;
        const result = computeAllProjectTokens(
          projects,
          allNodes,
          tokens,
          groups,
          pages,
          themes,
          advancedLogic,
          Object.keys(previousMap).length > 0 ? previousMap : undefined,
        );
        computedTokensRef.current = result;

        // Persist to localStorage
        try {
          localStorage.setItem('0colors-computed-tokens', JSON.stringify(result));
        } catch { /* ignore quota errors */ }

        // Log summary
        let totalTokens = 0;
        let totalRenames = 0;
        for (const proj of Object.values(result)) {
          for (const theme of proj.themes) {
            totalTokens += theme.tokens.length;
          }
          totalRenames += proj.renames?.length || 0;
        }
        console.log(`🧮 Computed tokens updated: ${Object.keys(result).length} projects, ${totalTokens} total tokens across all themes${totalRenames > 0 ? `, ${totalRenames} renames detected` : ''}`);
      } catch (err) {
        console.error('🧮 Computed tokens error:', err);
      }
    }, 1500); // Slightly longer debounce than save (1s) to avoid double-work

    return () => clearTimeout(timeoutId);
  }, [allNodes, tokens, groups, projects, pages, themes, advancedLogic, isInitialLoad]);

  // ═══════════════════════════════════════════════════════════════
  // AUTH SESSION RESTORATION & CLOUD SYNC
  // ═══════════════════════════════════════════════════════════════

  // Restore auth session on mount
  useEffect(() => {
    let aborted = false; // Guard against React Strict Mode double-mount races

    const checkSession = async () => {
      try {
        const supabase = getSupabaseClient();

        // First try to get the cached session
        const { data: sessionData } = await supabase.auth.getSession();
        if (aborted) return;

        if (sessionData?.session) {
          // We have a cached session — refresh it to ensure the access token is fresh.
          // This is critical because getSession() returns the local cache which may have
          // an expired JWT. refreshSession() contacts Supabase to get a new JWT.
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (aborted) return;

          if (refreshError || !refreshData?.session?.access_token) {
            console.log(`🔑 Session refresh failed: ${refreshError?.message || 'no session returned'}`);
            // Fall back to cached session — preserve isAdmin/isTemplateAdmin from previous load to avoid blink
            setAuthSession((prev) => {
              const session = {
                accessToken: sessionData.session.access_token,
                userId: sessionData.session.user.id,
                email: sessionData.session.user.email || '',
                name: sessionData.session.user.user_metadata?.name || sessionData.session.user.email?.split('@')[0] || '',
                isAdmin: prev?.isAdmin,
                isTemplateAdmin: prev?.isTemplateAdmin,
              };
              localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
              return session;
            });
          } else {
            // Use the refreshed session — preserve isAdmin/isTemplateAdmin from cache to avoid blink
            console.log('🔑 Session refreshed successfully');
            setAuthSession((prev) => {
              const session = {
                accessToken: refreshData.session.access_token,
                userId: refreshData.session.user.id,
                email: refreshData.session.user.email || '',
                name: refreshData.session.user.user_metadata?.name || refreshData.session.user.email?.split('@')[0] || '',
                isAdmin: prev?.isAdmin,
                isTemplateAdmin: prev?.isTemplateAdmin,
              };
              localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
              return session;
            });
          }
        } else {
          // No active session
          console.log('🔑 No active Supabase session');
        }
      } catch (e) {
        console.log(`Auth session check error (may be offline): ${e}`);
      } finally {
        if (!aborted) setAuthChecking(false);
      }
    };
    checkSession();

    // Listen for auth state changes (e.g., sign-out from another tab)
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const supabase = getSupabaseClient();
      const result = supabase.auth.onAuthStateChange((event: string, session: any) => {
        if (event === 'TOKEN_REFRESHED' && session?.access_token) {
          console.log('🔑 Token refreshed — updating session');
          setAuthSession((prev: any) => {
            if (!prev) return prev;
            const updated = { ...prev, accessToken: session.access_token };
            localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(updated));
            updateAccessToken(session.access_token);
            return updated;
          });
        } else if (event === 'SIGNED_OUT') {
          console.log('🔑 Signed out via auth state change');
          setAuthSession(null);
          localStorage.removeItem(AUTH_SESSION_KEY);
          updateAccessToken(null);
          destroyCloudSync();
        }
      });
      subscription = result.data?.subscription ?? null;
    } catch (e) {
      console.log(`Auth state listener setup error (non-fatal): ${e}`);
    }

    // Manual token refresh timer (since autoRefreshToken is disabled to prevent
    // unhandled rejections from the SDK's internal refresh mechanism).
    // Refresh every 10 minutes — Supabase JWTs typically last 1 hour.
    const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
    const refreshTimer = setInterval(async () => {
      if (aborted) return;
      try {
        const sb = getSupabaseClient();
        const { data, error } = await sb.auth.refreshSession();
        if (aborted) return;
        if (data?.session?.access_token) {
          setAuthSession((prev: any) => {
            if (!prev) return prev;
            const updated = { ...prev, accessToken: data.session!.access_token };
            localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(updated));
            updateAccessToken(data.session!.access_token);
            return updated;
          });
          console.log('🔑 Manual token refresh succeeded');
        } else if (error) {
          console.log(`🔑 Manual token refresh failed (non-fatal): ${error.message}`);
        }
      } catch (e) {
        console.log(`🔑 Manual token refresh error (non-fatal): ${e}`);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      aborted = true;
      subscription?.unsubscribe();
      clearInterval(refreshTimer);
    };
  }, []);

  // Helper: get project snapshot for cloud sync
  const getProjectSnapshotRef = useRef<(projectId: string) => ProjectSnapshot | null>(null);
  // Ref to always hold the latest projects state — used by async loadCloudData()
  // to avoid stale-closure timestamp comparisons that could overwrite local changes.
  const projectsRef = useRef<TokenProject[]>(projects);
  projectsRef.current = projects;
  // Synchronous map of projectId → lastSyncedAt, updated immediately when
  // onSynced fires (before React commits the re-render). This closes the tiny
  // window where projectsRef.current might still be stale.
  const lastSyncedAtMapRef = useRef<Record<string, number>>({});
  // Suppresses the markDirty effect while loadCloudData / reconcile is merging
  // server data into local state. Without this guard, every setState call during
  // the merge triggers markDirty → flushDirty → re-upload, creating a wasteful
  // sync-back loop and updating lastSyncedAtMapRef to new timestamps that can
  // block future merges.
  const isLoadingCloudDataRef = useRef(false);

  // getProjectSnapshot reads from always-current REFS (not closure values)
  // so that even if called from an async context (cloud-sync timer, forceSyncNow)
  // it always returns the absolute latest state — eliminating any stale-closure
  // race where the user clicks save before React recreates the useCallback.
  getProjectSnapshotRef.current = (projectId: string): ProjectSnapshot | null => {
    const project = projectsRef.current.find(p => p.id === projectId);
    if (!project || !(project.isCloud || project.isTemplate)) return null;

    const curNodes = allNodesRef.current;
    const projectNodes = curNodes.filter(n => n.projectId === projectId);
    const projectNodeIds = new Set(projectNodes.map(n => n.id));

    return {
      project,
      nodes: projectNodes,
      tokens: tokensRef.current.filter(t => t.projectId === projectId),
      groups: groupsRef.current.filter(g => g.projectId === projectId),
      pages: pagesRef.current.filter(p => p.projectId === projectId),
      themes: themesRef.current.filter(t => t.projectId === projectId),
      // canvasStates stripped from cloud snapshots to save storage (~5-20 KB/project).
      // They hold only viewport/zoom UI state and regenerate to defaults on cloud load.
      canvasStates: [],
      advancedLogic: advancedLogicRef.current.filter(l => projectNodeIds.has(l.nodeId)),
      computedTokens: computedTokensRef.current[projectId],
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  };

  // Initialize cloud sync when auth session is available
  useEffect(() => {
    if (!authSession) {
      destroyCloudSync();
      return;
    }

    let loadCancelled = false; // Cancellation flag — prevents stale loadCloudData from modifying state when token refreshes

    initCloudSync({
      accessToken: authSession.accessToken,
      getSnapshot: (pid) => getProjectSnapshotRef.current?.(pid) || null,
      onStart: () => {
        setCloudSyncStatus('syncing');
      },
      onComplete: (success, pids) => {
        if (success) {
          setCloudSyncStatus('synced');
          setLastSyncError(undefined);
          console.log(`☁️ Cloud sync complete for ${pids.length} projects`);
        } else {
          setCloudSyncStatus('error');
        }
      },
      onError: (err) => {
        setCloudSyncStatus('error');
        setLastSyncError(String(err));
        console.log(`☁️ Cloud sync error: ${err}`);
      },
      onSynced: (pids, timestamps) => {
        // Update synchronous ref IMMEDIATELY — this ensures loadCloudData
        // (which may be awaiting a response right now) will see the correct
        // lastSyncedAt even before React commits the re-render.
        for (const pid of pids) {
          if (timestamps[pid]) {
            lastSyncedAtMapRef.current[pid] = timestamps[pid];
          }
        }
        // Update lastSyncedAt for synced projects (async via React state)
        setProjects(prev => prev.map(p => {
          if (timestamps[p.id]) {
            return { ...p, lastSyncedAt: timestamps[p.id] };
          }
          return p;
        }));
      },
    });

    // Load cloud project data on first auth
    const loadCloudData = async () => {
      try {
        // ── CRITICAL: Flush dirty local data before fetching cloud state ──
        // Prevents any scenario where older server data overwrites newer local changes.
        if (hasDirtyProjects()) {
          console.log(`☁️ [loadCloudData] Flushing ${getDirtyProjectIds().length} dirty project(s) before fetching cloud data…`);
          await forceSyncNow().catch((e) => console.log('☁️ [loadCloudData] Pre-load flush failed:', e));
          if (loadCancelled) return;
        }

        // ── Step 1: Fetch cloud metadata (includes admin & template admin status) ──
        // Admin roles are managed manually in Supabase dashboard (kv_store_c36383cd table).
        // No auto-assignment — see server comments for KV key format.
        const cloudMeta = await getCloudMeta(authSession.accessToken).catch((e: any) => {
          console.log(`☁️ getCloudMeta failed: ${e}`);
          return null;
        });
        if (loadCancelled) return; // bail if token changed mid-flight
        console.log(`☁️ Cloud meta result:`, JSON.stringify(cloudMeta));
        if (cloudMeta) {
          const isAdmin = cloudMeta.isAdmin ?? false;
          const isTemplateAdmin = cloudMeta.isTemplateAdmin ?? false;
          console.log(`☁️ Admin status: isAdmin=${isAdmin}, isTemplateAdmin=${isTemplateAdmin}`);
          setAuthSession(prev => prev ? { ...prev, isAdmin, isTemplateAdmin } : prev);
          const updatedSession = { ...authSession, isAdmin, isTemplateAdmin };
          localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(updatedSession));
          if (isAdmin) {
            console.log(`[ADMIN] Logged in as admin${isTemplateAdmin ? ' + template admin' : ''} - unlimited cloud projects`);
          }
        }

        // ── Step 2: Load cloud project snapshots ──
        const cloudData = await loadCloudProjects(authSession.accessToken).catch((e: any) => {
          console.log(`☁️ loadCloudProjects FAILED: ${e}`);
          return [] as any[];
        });
        if (loadCancelled) return; // bail if token changed mid-flight
        
        // ── Enhanced diagnostic logging ──
        const localCloudProjects = projectsRef.current.filter(p => p.isCloud || p.isTemplate);
        console.log(`☁️ ═══ CLOUD LOAD DIAGNOSTIC ═══`);
        console.log(`☁️ Server returned ${cloudData.length} project(s)`);
        console.log(`☁️ Server project IDs: ${cloudData.map((e: any) => e.projectId).join(', ') || '(none)'}`);
        console.log(`☁️ Server projects detail:`, cloudData.map((e: any) => ({
          id: e.projectId,
          name: e.snapshot?.project?.name,
          hasSnapshot: !!e.snapshot,
          _syncedAt: e.snapshot?._syncedAt,
          isCloud: e.snapshot?.project?.isCloud,
          isTemplate: e.snapshot?.project?.isTemplate,
          nodeCount: e.snapshot?.nodes?.length,
          tokenCount: e.snapshot?.tokens?.length,
        })));
        console.log(`☁️ Local cloud/template projects: ${localCloudProjects.map(p => `${p.id}("${p.name}")`).join(', ') || '(none)'}`);
        console.log(`☁️ lastSyncedAtMapRef:`, JSON.stringify(lastSyncedAtMapRef.current));
        console.log(`☁️ cloudMeta.cloudProjectIds: ${JSON.stringify(cloudMeta?.cloudProjectIds || [])}`);
        
        if (cloudData.length > 0) {
          // Suppress markDirty during merge — prevents wasteful re-upload cycle
          isLoadingCloudDataRef.current = true;
          // Merge cloud data into local state
          for (const cloudEntry of cloudData) {
            if (!cloudEntry.snapshot) {
              console.log(`☁️ Skipping project ${cloudEntry.projectId} — null snapshot`);
              continue;
            }
            const projectId = cloudEntry.projectId;
            let snapshot = cloudEntry.snapshot;
            
            // ── Run schema migrations on cloud snapshot ──
            const migResult = migrateSnapshot(snapshot);
            if (migResult.migrated) {
              console.log(`🔄 Cloud migration for ${projectId}: ${migResult.appliedMigrations.join(', ')}`);
              snapshot = migResult.snapshot as ProjectSnapshot;
            }
            
            // Check if we already have this project locally.
            // IMPORTANT: read from projectsRef (always latest) instead of the
            // closure's `projects` to avoid a stale-timestamp race condition.
            const existingProject = projectsRef.current.find(p => p.id === projectId);
            const localSyncedAt = lastSyncedAtMapRef.current[projectId]
              || existingProject?.lastSyncedAt || 0;
            const remoteSyncedAt = (snapshot as any)._syncedAt || 0;
            
            // ── KEY FIX: Always merge if project doesn't exist locally ──
            // Previously: `remoteSyncedAt > localSyncedAt` — failed when both
            // were 0 (missing _syncedAt) and silently skipped new projects.
            // Now: ALWAYS add if missing locally; only timestamp-check for updates.
            // ── CRITICAL GUARD: Never overwrite dirty local data with stale cloud data ──
            const projectIsDirty = existingProject && isDirty(projectId);
            const shouldMerge = !existingProject || (remoteSyncedAt > localSyncedAt && !projectIsDirty);
            
            if (projectIsDirty && remoteSyncedAt > localSyncedAt) {
              console.log(`☁️ SKIPPING cloud overwrite for dirty project ${projectId} — local has unsaved changes (remote=${remoteSyncedAt}, local=${localSyncedAt})`);
            }
            
            if (shouldMerge) {
              console.log(`☁️ ${existingProject ? 'Updating' : 'Adding NEW'} cloud project "${snapshot.project?.name}" (${projectId}) — remote=${remoteSyncedAt}, local=${localSyncedAt}`);
              
              // Keep synchronous ref in sync with the new timestamp
              lastSyncedAtMapRef.current[projectId] = remoteSyncedAt || Date.now();

              setProjects(prev => {
                const exists = prev.find(p => p.id === projectId);
                if (exists) {
                  return prev.map(p => p.id === projectId ? { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt } : p);
                }
                return [...prev, { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt }];
              });

              // Replace project-specific data (defensive || [] for missing arrays)
              setAllNodes(prev => [
                ...prev.filter(n => n.projectId !== projectId),
                ...(snapshot.nodes || []),
              ]);
              setTokens(prev => [
                ...prev.filter(t => t.projectId !== projectId),
                ...(snapshot.tokens || []),
              ]);
              setGroups(prev => [
                ...prev.filter(g => g.projectId !== projectId),
                ...(snapshot.groups || []),
              ]);
              setPages(prev => [
                ...prev.filter(p => p.projectId !== projectId),
                ...(snapshot.pages || []),
              ]);
              setThemes(prev => [
                ...prev.filter(t => t.projectId !== projectId),
                ...(snapshot.themes || []),
              ]);
              setCanvasStates(prev => [
                ...prev.filter(cs => cs.projectId !== projectId),
                ...(snapshot.canvasStates || []),
              ]);
              if (snapshot.advancedLogic?.length) {
                const remoteNodeIds = new Set(snapshot.nodes.map((n: any) => n.id));
                setAdvancedLogic(prev => [
                  ...prev.filter(l => !remoteNodeIds.has(l.nodeId)),
                  ...snapshot.advancedLogic,
                ]);
              }
            } else {
              console.log(`☁️ Skipping cloud overwrite for ${projectId} — local is up-to-date (remote=${remoteSyncedAt}, local=${localSyncedAt})`);
            }
          }
          // NOTE: Don't reset isLoadingCloudDataRef here — it stays true
          // through Step 3 and gets reset in the finally block via setTimeout
          // to ensure markDirty effect is suppressed during React's re-render.
        }

        // ── Step 3: Remove stale cloud/template projects that no longer exist on the server ──
        // When a project is deleted in Browser A (via cloud-unregister), it's removed
        // from the server's cloudProjectIds. But Browser B still has it in localStorage.
        // This step reconciles: any local project marked isCloud/isTemplate whose ID is
        // NOT in the server's authoritative cloudProjectIds list gets purged.
        if (cloudMeta?.cloudProjectIds) {
          const serverProjectIds = new Set(cloudMeta.cloudProjectIds as string[]);
          // Also include IDs from cloudData (in case meta was slightly stale)
          for (const entry of cloudData) {
            if (entry.projectId) serverProjectIds.add(entry.projectId);
          }

          const staleIds: string[] = [];
          for (const p of projectsRef.current) {
            if ((p.isCloud || p.isTemplate) && !serverProjectIds.has(p.id)) {
              staleIds.push(p.id);
            }
          }

          if (staleIds.length > 0) {
            console.log(`☁️ Removing ${staleIds.length} stale cloud/template project(s) deleted on another device:`, staleIds);
            const staleSet = new Set(staleIds);

            setProjects(prev => prev.filter(p => !staleSet.has(p.id)));
            setAllNodes(prev => prev.filter(n => !staleSet.has(n.projectId)));
            setTokens(prev => prev.filter(t => !staleSet.has(t.projectId)));
            setGroups(prev => prev.filter(g => !staleSet.has(g.projectId)));
            setPages(prev => prev.filter(p => !staleSet.has(p.projectId)));
            setThemes(prev => prev.filter(t => !staleSet.has(t.projectId)));
            setCanvasStates(prev => prev.filter(cs => !staleSet.has(cs.projectId)));
            setAdvancedLogic(prev => {
              // Collect node IDs belonging to stale projects
              const staleNodeIds = new Set(
                allNodesRef.current.filter(n => staleSet.has(n.projectId)).map(n => n.id)
              );
              return staleNodeIds.size > 0 ? prev.filter(l => !staleNodeIds.has(l.nodeId)) : prev;
            });

            // Clean up stale lastSyncedAtMapRef entries to prevent them from
            // blocking future merges if the project is re-created on another browser
            for (const id of staleIds) delete lastSyncedAtMapRef.current[id];

            // If the active project was deleted on another device, switch to first available
            if (activeProjectId && staleSet.has(activeProjectId)) {
              const remaining = projectsRef.current.filter(p => !staleSet.has(p.id));
              if (remaining.length > 0) {
                setActiveProjectId(remaining[0].id);
                const firstPage = pagesRef.current.find(pg => pg.projectId === remaining[0].id);
                if (firstPage) setActivePageId(firstPage.id);
              }
            }
          }
        }
      } catch (e) {
        console.log(`☁️ Failed to load cloud data: ${e}`);
      } finally {
        // Defer the reset so the flag is still true when React processes the
        // batched state updates and fires the markDirty effect. setTimeout(0)
        // runs after React's synchronous re-render + effect flush.
        setTimeout(() => { isLoadingCloudDataRef.current = false; }, 100);
      }
    };

    loadCloudData();

    return () => { loadCancelled = true; isLoadingCloudDataRef.current = false; destroyCloudSync(); };
  }, [authSession?.accessToken]);

  // ── Full cloud reconciliation: add NEW + update CHANGED + remove STALE ──
  // Runs every time the user navigates to the projects page.
  // This is the ONLY way to discover cross-browser changes (creates & deletes)
  // without a full page refresh, since loadCloudData only runs once on auth init.
  const mountTimeRef = useRef(Date.now());
  useEffect(() => {
    if (!viewingProjects || !authSession) return;
    // Skip reconciliation within the first 5s of mount — loadCloudData (which
    // fires on auth init) already handles the initial load. Running both in
    // parallel would cause duplicate requests and potential race conditions.
    if (Date.now() - mountTimeRef.current < 5000) return;

    let cancelled = false;
    const fullReconcile = async () => {
      try {
        // ── CRITICAL: Flush dirty local data to cloud BEFORE downloading ──
        // This ensures the server has our latest changes before we compare
        // timestamps, preventing any scenario where stale server data
        // overwrites newer local changes.
        if (hasDirtyProjects()) {
          console.log(`☁️ [Reconcile] Flushing ${getDirtyProjectIds().length} dirty project(s) before downloading…`);
          await forceSyncNow().catch((e) => console.log('☁️ [Reconcile] Pre-reconcile flush failed:', e));
          if (cancelled) return;
        }

        const accessToken = authSessionRef.current?.accessToken || authSession.accessToken;
        // Fetch authoritative cloud meta + all snapshots in parallel
        const [meta, cloudData] = await Promise.all([
          getCloudMeta(accessToken).catch(() => null),
          loadCloudProjects(accessToken).catch(() => [] as any[]),
        ]);
        if (cancelled) return;
        if (!meta?.cloudProjectIds) {
          console.log(`☁️ [Reconcile] Could not fetch cloud meta — skipping`);
          return;
        }

        // Suppress markDirty AFTER fetch, right before state mutations begin
        isLoadingCloudDataRef.current = true;
        const serverIds = new Set(meta.cloudProjectIds as string[]);
        const localCloudCount = projectsRef.current.filter(p => p.isCloud || p.isTemplate).length;
        console.log(`☁️ [Reconcile] Server has ${serverIds.size} project(s), local has ${localCloudCount} cloud/template project(s)`);

        // ── Part A: ADD or UPDATE projects from cloud ──
        let addedCount = 0;
        let updatedCount = 0;
        for (const entry of cloudData) {
          if (cancelled) return;
          if (!entry.snapshot) continue;
          const projectId = entry.projectId;
          let snapshot = entry.snapshot;

          const migResult = migrateSnapshot(snapshot);
          if (migResult.migrated) snapshot = migResult.snapshot as ProjectSnapshot;

          const existing = projectsRef.current.find(p => p.id === projectId);
          const localSyncedAt = lastSyncedAtMapRef.current[projectId] || existing?.lastSyncedAt || 0;
          const remoteSyncedAt = (snapshot as any)._syncedAt || 0;

          if (!existing) {
            // NEW: project on server but not locally
            console.log(`☁️ [Reconcile] Adding missing project ${projectId} ("${snapshot.project?.name}")`);
            lastSyncedAtMapRef.current[projectId] = remoteSyncedAt || Date.now();
            setProjects(prev => {
              if (prev.find(p => p.id === projectId)) return prev;
              return [...prev, { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt }];
            });
            setAllNodes(prev => [...prev.filter(n => n.projectId !== projectId), ...(snapshot.nodes || [])]);
            setTokens(prev => [...prev.filter(t => t.projectId !== projectId), ...(snapshot.tokens || [])]);
            setGroups(prev => [...prev.filter(g => g.projectId !== projectId), ...(snapshot.groups || [])]);
            setPages(prev => [...prev.filter(p => p.projectId !== projectId), ...(snapshot.pages || [])]);
            setThemes(prev => [...prev.filter(t => t.projectId !== projectId), ...(snapshot.themes || [])]);
            setCanvasStates(prev => [...prev.filter(cs => cs.projectId !== projectId), ...(snapshot.canvasStates || [])]);
            if (snapshot.advancedLogic?.length) {
              const nodeIds = new Set(snapshot.nodes.map((n: any) => n.id));
              setAdvancedLogic(prev => [...prev.filter(l => !nodeIds.has(l.nodeId)), ...snapshot.advancedLogic]);
            }
            addedCount++;
          } else if (remoteSyncedAt > localSyncedAt) {
            // ── CRITICAL GUARD: Never overwrite a project that still has dirty local changes ──
            // If the pre-reconcile flush failed or new changes arrived after the flush,
            // the local version is the source of truth. Skip the overwrite.
            if (isDirty(projectId)) {
              console.log(`☁️ [Reconcile] SKIPPING overwrite for ${projectId} — project has dirty local changes (remote=${remoteSyncedAt}, local=${localSyncedAt})`);
              continue;
            }
            // UPDATED: cloud version is newer
            console.log(`☁️ [Reconcile] Updating project ${projectId} (remote=${remoteSyncedAt} > local=${localSyncedAt})`);
            lastSyncedAtMapRef.current[projectId] = remoteSyncedAt;
            setProjects(prev => prev.map(p => p.id === projectId ? { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt } : p));
            setAllNodes(prev => [...prev.filter(n => n.projectId !== projectId), ...(snapshot.nodes || [])]);
            setTokens(prev => [...prev.filter(t => t.projectId !== projectId), ...(snapshot.tokens || [])]);
            setGroups(prev => [...prev.filter(g => g.projectId !== projectId), ...(snapshot.groups || [])]);
            setPages(prev => [...prev.filter(p => p.projectId !== projectId), ...(snapshot.pages || [])]);
            setThemes(prev => [...prev.filter(t => t.projectId !== projectId), ...(snapshot.themes || [])]);
            setCanvasStates(prev => [...prev.filter(cs => cs.projectId !== projectId), ...(snapshot.canvasStates || [])]);
            if (snapshot.advancedLogic?.length) {
              const nodeIds = new Set(snapshot.nodes.map((n: any) => n.id));
              setAdvancedLogic(prev => [...prev.filter(l => !nodeIds.has(l.nodeId)), ...snapshot.advancedLogic]);
            }
            updatedCount++;
          }
        }

        if (cancelled) return;

        // ── Part B: REMOVE local cloud/template projects not on server ──
        const staleIds: string[] = [];
        for (const p of projectsRef.current) {
          if ((p.isCloud || p.isTemplate) && !serverIds.has(p.id)) {
            staleIds.push(p.id);
          }
        }
        if (staleIds.length > 0) {
          console.log(`☁️ [Reconcile] Removing ${staleIds.length} stale project(s):`, staleIds);
          const staleSet = new Set(staleIds);
          setProjects(prev => prev.filter(p => !staleSet.has(p.id)));
          setAllNodes(prev => prev.filter(n => !staleSet.has(n.projectId)));
          setTokens(prev => prev.filter(t => !staleSet.has(t.projectId)));
          setGroups(prev => prev.filter(g => !staleSet.has(g.projectId)));
          setPages(prev => prev.filter(p => !staleSet.has(p.projectId)));
          setThemes(prev => prev.filter(t => !staleSet.has(t.projectId)));
          setCanvasStates(prev => prev.filter(cs => !staleSet.has(cs.projectId)));
          setAdvancedLogic(prev => {
            const staleNodeIds = new Set(
              allNodesRef.current.filter(n => staleSet.has(n.projectId)).map(n => n.id)
            );
            return staleNodeIds.size > 0 ? prev.filter(l => !staleNodeIds.has(l.nodeId)) : prev;
          });
          for (const id of staleIds) delete lastSyncedAtMapRef.current[id];
        }

        if (addedCount > 0 || updatedCount > 0 || staleIds.length > 0) {
          console.log(`☁️ [Reconcile] Done: +${addedCount} added, ~${updatedCount} updated, -${staleIds.length} removed`);
        }
      } catch (e) {
        console.log(`☁️ [Reconcile] Error: ${e}`);
      } finally {
        setTimeout(() => { isLoadingCloudDataRef.current = false; }, 100);
      }
    };
    fullReconcile();
    return () => { cancelled = true; isLoadingCloudDataRef.current = false; };
  }, [viewingProjects, authSession]);

  // Mark cloud projects dirty when their data changes
  useEffect(() => {
    if (isInitialLoad || isImporting || !authSession) return;
    // ── KEY FIX: Skip markDirty while merging cloud data into local state ──
    // Without this, loadCloudData triggers setAllNodes/setTokens/etc → markDirty
    // → flushDirty → re-upload, creating a wasteful sync-back loop that also
    // advances lastSyncedAtMapRef timestamps and can block future merges.
    if (isLoadingCloudDataRef.current) return;

    const cloudProjectIds = projects.filter(p => p.isCloud || p.isTemplate).map(p => p.id);
    for (const pid of cloudProjectIds) {
      markDirty(pid);
    }
    // Update status to show unsaved changes (only if not currently syncing)
    if (cloudProjectIds.length > 0 && cloudSyncStatus !== 'syncing') {
      setCloudSyncStatus('dirty');
    }
  }, [allNodes, tokens, groups, pages, themes, canvasStates, advancedLogic, isInitialLoad, isImporting, authSession]);

  // Auth handlers
  const handleAuth = useCallback((session: { accessToken: string; userId: string; email: string; name: string }) => {
    setAuthSession(session);
    setAuthSkipped(false);
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    localStorage.removeItem('0colors-auth-skipped');
    updateAccessToken(session.accessToken);
  }, []);

  // ── Force Cloud Refresh: bypass all caches/timestamps and re-download everything ──
  const handleForceCloudRefresh = useCallback(async () => {
    const token = authSessionRef.current?.accessToken;
    if (!token) {
      console.log(`☁️ [ForceRefresh] No auth token — cannot refresh`);
      return;
    }
    console.log(`☁️ ═══ FORCE CLOUD REFRESH START ═══`);
    setCloudSyncStatus('syncing');

    try {
      // 0. CRITICAL: Flush dirty local data to cloud FIRST — so the server
      // has our latest changes before we re-download everything.
      if (hasDirtyProjects()) {
        console.log(`☁️ [ForceRefresh] Flushing ${getDirtyProjectIds().length} dirty project(s) before refresh…`);
        await forceSyncNow().catch((e) => console.log('☁️ [ForceRefresh] Pre-refresh flush failed:', e));
      }

      // 1. Clear ALL timestamp caches — this ensures everything merges
      console.log(`☁️ [ForceRefresh] Clearing lastSyncedAtMapRef (had ${Object.keys(lastSyncedAtMapRef.current).length} entries)`);
      lastSyncedAtMapRef.current = {};

      // 2. Also clear lastSyncedAt on all local projects so timestamps don't block
      setProjects(prev => prev.map(p => (p.isCloud || p.isTemplate) ? { ...p, lastSyncedAt: 0 } : p));

      // 3. Fetch fresh data from server
      isLoadingCloudDataRef.current = true;
      const [meta, cloudData] = await Promise.all([
        getCloudMeta(token).catch((e: any) => { console.log(`☁️ [ForceRefresh] getCloudMeta FAILED: ${e}`); return null; }),
        loadCloudProjects(token).catch((e: any) => { console.log(`☁️ [ForceRefresh] loadCloudProjects FAILED: ${e}`); return [] as any[]; }),
      ]);

      console.log(`☁️ [ForceRefresh] Server meta: ${JSON.stringify(meta?.cloudProjectIds || [])}`);
      console.log(`☁️ [ForceRefresh] Server returned ${cloudData.length} snapshot(s)`);
      for (const entry of cloudData) {
        console.log(`☁️ [ForceRefresh]   → ${entry.projectId}: "${entry.snapshot?.project?.name}" hasSnap=${!!entry.snapshot} _syncedAt=${entry.snapshot?._syncedAt} nodes=${entry.snapshot?.nodes?.length} tokens=${entry.snapshot?.tokens?.length}`);
      }

      // 4. Force-merge ALL projects (no timestamp check)
      let added = 0, updated = 0;
      for (const entry of cloudData) {
        if (!entry.snapshot) continue;
        const projectId = entry.projectId;
        let snapshot = entry.snapshot;

        const migResult = migrateSnapshot(snapshot);
        if (migResult.migrated) snapshot = migResult.snapshot as ProjectSnapshot;

        const existing = projectsRef.current.find(p => p.id === projectId);
        const remoteSyncedAt = (snapshot as any)._syncedAt || Date.now();
        lastSyncedAtMapRef.current[projectId] = remoteSyncedAt;

        console.log(`☁️ [ForceRefresh] ${existing ? 'UPDATING' : 'ADDING'} "${snapshot.project?.name}" (${projectId})`);

        setProjects(prev => {
          const exists = prev.find(p => p.id === projectId);
          if (exists) return prev.map(p => p.id === projectId ? { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt } : p);
          return [...prev, { ...snapshot.project, isCloud: true, lastSyncedAt: remoteSyncedAt }];
        });
        setAllNodes(prev => [...prev.filter(n => n.projectId !== projectId), ...(snapshot.nodes || [])]);
        setTokens(prev => [...prev.filter(t => t.projectId !== projectId), ...(snapshot.tokens || [])]);
        setGroups(prev => [...prev.filter(g => g.projectId !== projectId), ...(snapshot.groups || [])]);
        setPages(prev => [...prev.filter(p => p.projectId !== projectId), ...(snapshot.pages || [])]);
        setThemes(prev => [...prev.filter(t => t.projectId !== projectId), ...(snapshot.themes || [])]);
        setCanvasStates(prev => [...prev.filter(cs => cs.projectId !== projectId), ...(snapshot.canvasStates || [])]);
        if (snapshot.advancedLogic?.length) {
          const nodeIds = new Set(snapshot.nodes.map((n: any) => n.id));
          setAdvancedLogic(prev => [...prev.filter(l => !nodeIds.has(l.nodeId)), ...snapshot.advancedLogic]);
        }
        if (existing) updated++; else added++;
      }

      // 5. Remove stale projects
      if (meta?.cloudProjectIds) {
        const serverIds = new Set(meta.cloudProjectIds as string[]);
        for (const e of cloudData) if (e.projectId) serverIds.add(e.projectId);
        const staleIds = projectsRef.current
          .filter(p => (p.isCloud || p.isTemplate) && !serverIds.has(p.id))
          .map(p => p.id);
        if (staleIds.length > 0) {
          console.log(`☁️ [ForceRefresh] Removing ${staleIds.length} stale project(s):`, staleIds);
          const staleSet = new Set(staleIds);
          setProjects(prev => prev.filter(p => !staleSet.has(p.id)));
          setAllNodes(prev => prev.filter(n => !staleSet.has(n.projectId)));
          setTokens(prev => prev.filter(t => !staleSet.has(t.projectId)));
          setGroups(prev => prev.filter(g => !staleSet.has(g.projectId)));
          setPages(prev => prev.filter(p => !staleSet.has(p.projectId)));
          setThemes(prev => prev.filter(t => !staleSet.has(t.projectId)));
          setCanvasStates(prev => prev.filter(cs => !staleSet.has(cs.projectId)));
          for (const id of staleIds) delete lastSyncedAtMapRef.current[id];
        }
      }

      console.log(`☁️ ═══ FORCE CLOUD REFRESH DONE: +${added} added, ~${updated} updated ═══`);
      setCloudSyncStatus('synced');
    } catch (e) {
      console.log(`☁️ [ForceRefresh] ERROR: ${e}`);
      setCloudSyncStatus('error');
    } finally {
      setTimeout(() => { isLoadingCloudDataRef.current = false; }, 100);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    // Flush any pending sync before signing out (best-effort)
    try { await forceSyncNow(); } catch { /* ignore sync errors on signout */ }
    
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.log(`Sign out network error (continuing): ${e}`);
    }
    setAuthSession(null);
    localStorage.removeItem(AUTH_SESSION_KEY);
    updateAccessToken(null);
    destroyCloudSync();
  }, []);

  const handleSkipAuth = useCallback(() => {
    setAuthChecking(false);
    setAuthSkipped(true);
    localStorage.setItem('0colors-auth-skipped', 'true');
    // User continues without auth — all projects are local
  }, []);

  // Online/offline tracking for cloud sync indicator
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => { setIsOnline(false); setCloudSyncStatus('offline'); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── Ask AI: Load conversations from cloud & merge with local ──
  useEffect(() => {
    if (!authSession?.accessToken || aiConvLoadedRef.current) return;
    aiConvLoadedRef.current = true;
    loadCloudConversations(authSession.accessToken).then(cloudConvs => {
      if (cloudConvs && cloudConvs.length > 0) {
        setAIConversations(prev => {
          const merged = mergeConversations(prev, cloudConvs);
          saveLocalConversations(merged);
          console.log(`[AI] Merged ${prev.length} local + ${cloudConvs.length} cloud → ${merged.length} conversations`);
          return merged;
        });
      }
    });
  }, [authSession?.accessToken]);

  // ── Ask AI: Flush pending cloud save on page unload ──
  const aiConvPendingRef = useRef<Conversation[] | null>(null);
  const aiSettingsPendingRef = useRef<string | null>(null); // Pre-serialized bundle JSON for beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Flush any pending debounced conversation save
      if (aiConvSaveTimerRef.current) {
        clearTimeout(aiConvSaveTimerRef.current);
        aiConvSaveTimerRef.current = null;
      }
      if (aiConvPendingRef.current && authSession?.accessToken) {
        const payload = JSON.stringify({ conversations: trimConversations(aiConvPendingRef.current) });
        try {
          if (SERVER_BASE) {
            fetch(`${SERVER_BASE}/ai-conversations`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authSession.accessToken}`,
              },
              body: payload,
              keepalive: true,
            }).catch(() => {});
          }
        } catch {}
        aiConvPendingRef.current = null;
      }
      // Flush any pending debounced settings save
      if (aiSettingsSaveTimerRef.current) {
        clearTimeout(aiSettingsSaveTimerRef.current);
        aiSettingsSaveTimerRef.current = null;
      }
      if (aiSettingsPendingRef.current && authSession?.accessToken) {
        try {
          if (SERVER_BASE) {
            fetch(`${SERVER_BASE}/ai-settings`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authSession.accessToken}`,
              },
              body: JSON.stringify({ settings: JSON.parse(aiSettingsPendingRef.current) }),
              keepalive: true,
            }).catch(() => {});
          }
        } catch {}
        aiSettingsPendingRef.current = null;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [authSession?.accessToken]);

  // ── Ask AI: Save conversations on every change ──
  const handleAIConversationsChange = useCallback((newConvs: Conversation[] | ((prev: Conversation[]) => Conversation[])) => {
    setAIConversations(prev => {
      const resolved = typeof newConvs === 'function' ? newConvs(prev) : newConvs;
      const trimmed = trimConversations(resolved);

      // Always save to localStorage immediately (offline-first)
      saveLocalConversations(trimmed);

      // Debounced cloud save (2s after last change)
      if (authSession?.accessToken) {
        aiConvPendingRef.current = trimmed;
        if (aiConvSaveTimerRef.current) clearTimeout(aiConvSaveTimerRef.current);
        aiConvSaveTimerRef.current = setTimeout(() => {
          saveCloudConversations(authSession.accessToken, trimmed).then(ok => {
            if (ok) {
              console.log(`[AI] Cloud saved ${trimmed.length} conversations`);
              aiConvPendingRef.current = null;
            } else {
              console.log('[AI] Cloud save failed — data is safe in localStorage');
            }
          });
        }, 2000);
      }
      return trimmed;
    });
  }, [authSession?.accessToken]);

  // ── Ask AI: Load cloud settings & merge with local on auth ──
  const aiSettingsLoadedRef = useRef(false);
  useEffect(() => {
    if (!authSession?.accessToken || !authSession?.userId || aiSettingsLoadedRef.current) return;
    aiSettingsLoadedRef.current = true;
    loadCloudSettingsBundle(authSession.accessToken).then(async (cloudBundle) => {
      if (!cloudBundle || !cloudBundle.settings) return;
      try {
        const localSettings = loadAISettings();
        const localTier = loadContextTier();
        const localToggles = loadContextToggles();
        const merged = await mergeSettingsBundles(localSettings, localTier, localToggles, cloudBundle, authSession.userId);
        if (merged.changed) {
          saveAISettings(merged.settings);
          saveContextTier(merged.contextTier);
          saveContextToggles(merged.contextToggles);
          console.log(`[AI] Cloud settings merged — provider: ${merged.settings.activeProvider}, tier: ${merged.contextTier}`);
        } else {
          console.log('[AI] Local settings are up to date (cloud not newer)');
        }
      } catch (e: any) {
        console.log(`[AI] Settings merge error: ${e?.message}`);
      }
    });
  }, [authSession?.accessToken, authSession?.userId]);

  // ── Ask AI: Save AI settings to cloud (encrypted) ──
  const aiSettingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAISettingsSaved = useCallback((settings: AISettings, contextTier?: ContextTier, contextToggles?: ContextToggles) => {
    // Update local timestamp
    setLocalSettingsUpdatedAt(Date.now());
    // Debounced encrypted cloud save (1s)
    if (authSession?.accessToken && authSession?.userId) {
      if (aiSettingsSaveTimerRef.current) clearTimeout(aiSettingsSaveTimerRef.current);
      aiSettingsSaveTimerRef.current = setTimeout(async () => {
        try {
          const tier = contextTier || loadContextTier();
          const toggles = contextToggles || loadContextToggles();
          const bundle = await buildCloudSettingsBundle(settings, tier, toggles, authSession.userId);
          // Cache for beforeunload flush
          aiSettingsPendingRef.current = JSON.stringify(bundle);
          const ok = await saveCloudSettingsBundle(authSession.accessToken, bundle);
          if (ok) {
            console.log('[AI] Settings synced to cloud (encrypted)');
            aiSettingsPendingRef.current = null;
          } else {
            console.log('[AI] Settings cloud save failed — safe in localStorage');
          }
        } catch (e: any) {
          console.log(`[AI] Settings cloud save error: ${e?.message}`);
        }
      }, 1000);
    }
  }, [authSession?.accessToken, authSession?.userId]);

  // ── Ask AI: Build raw project context (context manager handles KB + budgeting in AskAIChat) ──
  const aiProjectContext = useMemo(() => {
    return buildProjectContext({
      projects, activeProjectId, pages, activePageId,
      themes, activeThemeId, allNodes, tokens, groups, advancedLogic,
    });
  }, [projects, activeProjectId, pages, activePageId, themes, activeThemeId, allNodes, tokens, groups, advancedLogic]);

  // Manual sync handler — triggers immediate flush.
  // Reads from always-current REFS so there is zero risk of stale-closure
  // data, even if the user clicks save within the same frame as a state update.
  const handleManualSync = useCallback(async () => {
    if (cloudSyncStatus === 'syncing') return;

    // Show spinner IMMEDIATELY so the user gets instant visual feedback.
    setCloudSyncStatus('syncing');

    // Safety timeout: reset indicator if sync hasn't resolved in 45 s.
    const safetyTimer = setTimeout(() => {
      setCloudSyncStatus((prev: any) =>
        prev === 'syncing' ? 'error' : prev,
      );
      setLastSyncError('Sync timed out — please try again');
    }, 45_000);

    // ── 1. Explicitly mark ALL cloud/template projects dirty ──
    // Belt-and-suspenders: the markDirty useEffect may not have fired yet
    // if the user clicked save in the same frame as the state update.
    const curProjects = projectsRef.current;
    for (const p of curProjects) {
      if (p.isCloud || p.isTemplate) markDirty(p.id);
    }

    // ── 2. Recompute computed tokens from REFS (always latest) ──
    try {
      const previousMap = computedTokensRef.current;
      const freshComputed = computeAllProjectTokens(
        curProjects,
        allNodesRef.current,
        tokensRef.current,
        groupsRef.current,
        pagesRef.current,
        themesRef.current,
        advancedLogicRef.current,
        Object.keys(previousMap).length > 0 ? previousMap : undefined,
      );
      computedTokensRef.current = freshComputed;
      try {
        localStorage.setItem('0colors-computed-tokens', JSON.stringify(freshComputed));
      } catch { /* ignore quota errors */ }
    } catch (err) {
      console.error('🧮 Pre-sync computed tokens refresh failed:', err);
    }

    // ── 3. Flush to server ──
    try {
      const success = await forceSyncNow();
      clearTimeout(safetyTimer);
      if (success) {
        // forceSyncNow may return true via the "no dirty projects" fast-path
        // without calling onSyncComplete. Ensure the UI settles to 'synced'.
        setCloudSyncStatus((prev: any) =>
          prev === 'syncing' ? 'synced' : prev,
        );
        setLastSyncError(undefined);
      } else {
        if (!navigator.onLine) {
          setCloudSyncStatus('offline');
        } else {
          setCloudSyncStatus((prev: any) =>
            prev === 'syncing' ? 'dirty' : prev,
          );
        }
      }
    } catch (err) {
      clearTimeout(safetyTimer);
      console.error('☁️ Manual sync failed:', err);
      setCloudSyncStatus('error');
      setLastSyncError(String(err));
    }
  }, [cloudSyncStatus]);

  // Compute effective cloud sync status for active project
  const effectiveCloudSyncStatus = useMemo(() => {
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (!activeProject) return 'local' as const;
    const isCloud = activeProject.isCloud || activeProject.isTemplate;
    if (!isCloud) return 'local' as const;
    if (!isOnline) return 'offline' as const;
    // Use tracked status
    return cloudSyncStatus;
  }, [projects, activeProjectId, isOnline, cloudSyncStatus]);

  const activeProjectLastSyncedAt = useMemo(() => {
    const activeProject = projects.find(p => p.id === activeProjectId);
    return activeProject?.lastSyncedAt;
  }, [projects, activeProjectId]);

  const cloudDirtyCount = useMemo(() => {
    return projects.filter(p => (p.isCloud || p.isTemplate)).length;
  }, [projects]);

  // Auto-transition from 'synced' → 'idle' after 3 seconds
  useEffect(() => {
    if (cloudSyncStatus === 'synced') {
      const t = setTimeout(() => setCloudSyncStatus('idle'), 3500);
      return () => clearTimeout(t);
    }
  }, [cloudSyncStatus]);

  // ── Reactive Advanced Logic Evaluation ─────────────────────────
  // Whenever node values or logic expressions change, re-evaluate all
  // active advanced logic and apply computed values back to nodes.
  // Convergence is guaranteed because we only update when values
  // differ by > 0.001, and evaluation is deterministic.
  const isApplyingAdvancedLogicRef = useRef(false);

  useEffect(() => {
    // Prevent re-entry when WE are the ones changing allNodes
    if (isApplyingAdvancedLogicRef.current) return;
    const logic = advancedLogicRef.current;
    if (!logic || logic.length === 0) return;

    const currentTheme = themes.find(t => t.id === activeThemeId);
    const isPrimary = currentTheme?.isPrimary ?? true;

    // Build channel maps for ALL nodes in the dataset
    const allNodesMap = new Map<string, Record<string, number>>();
    for (const n of allNodes) {
      allNodesMap.set(n.id, nodeToChannelMapThemeAware(n, activeThemeId, isPrimary));
    }

    // Collect updates: nodeId → channel changes
    const pendingUpdates: { idx: number; changes: Partial<ColorNode> }[] = [];

    for (const nodeLogic of logic) {
      const nodeIdx = allNodes.findIndex(n => n.id === nodeLogic.nodeId);
      if (nodeIdx === -1) continue;
      const node = allNodes[nodeIdx];

      // ── Skip nodes whose AdvancedPopup is currently open ──
      // Evaluation only happens on explicit Save/Play, not while editing.
      if (isAdvancedDraft(nodeLogic.nodeId)) continue;

      // ── Theme-aware: determine if node is unlinked in current theme ──
      const nodeHasThemeOverride = !isPrimary && !!(node.themeOverrides?.[activeThemeId]);
      // For inherited nodes in non-primary themes, primary's computed values
      // are already inherited — skip re-evaluation to avoid double-applying.
      if (!isPrimary && !nodeHasThemeOverride && !node.isTokenNode) continue;

      // Resolve theme-effective channels and base values
      const effectiveChannels = getEffectiveChannels(nodeLogic, activeThemeId, isPrimary, nodeHasThemeOverride);
      const effectiveBaseValues = getEffectiveBaseValues(nodeLogic, activeThemeId, isPrimary, nodeHasThemeOverride);

      const selfMap = allNodesMap.get(node.id)!;
      const parentMap = node.parentId ? allNodesMap.get(node.parentId) ?? null : null;

      // Use stored baseValues for `locked` keyword to prevent feedback loops
      const lockedValues = effectiveBaseValues || selfMap;

      // ── Cross-channel dependency ordering ──
      // Determine evaluation order: channels that other channels reference
      // via @Self.X should be evaluated first (topological sort).
      const channelEntries = Object.entries(effectiveChannels).filter(([, cl]) => {
        if (!cl || cl.rows.length === 0) return false;
        return cl.rows.some(r => r.enabled && r.tokens.length > 0);
      });

      // Build dependency graph: for each channel, find which other channels it references via @Self
      const channelKeys = new Set(channelEntries.map(([k]) => k));
      const channelDeps: Record<string, Set<string>> = {};
      // Map property aliases to canonical channel keys
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

      // Topological sort (Kahn's algorithm) — channels with no deps first
      const inDegree: Record<string, number> = {};
      for (const [k] of channelEntries) inDegree[k] = 0;
      for (const [k, deps] of Object.entries(channelDeps)) {
        for (const d of deps) {
          if (inDegree[d] !== undefined) inDegree[k] = (inDegree[k] || 0) + 1;
        }
      }
      // Reverse map: which channels depend on X?
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
      // Add any remaining channels (cycles — just append in original order)
      for (const [k] of channelEntries) {
        if (!sortedChannels.includes(k)) sortedChannels.push(k);
      }

      // ── Evaluate channels in topological order ──
      // Use a mutable copy of selfMap so channels evaluated later see computed values from earlier channels
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
          // Update mutableSelf so subsequent channels see this computed value
          mutableSelf[channelKey] = result.value;
          // Also update aliases
          if (channelKey === 'hue') mutableSelf.h = result.value;
          else if (channelKey === 'saturation') mutableSelf.s = result.value;
          else if (channelKey === 'lightness') mutableSelf.l = result.value;
          else if (channelKey === 'alpha') mutableSelf.a = result.value;
          else if (channelKey === 'red') mutableSelf.r = result.value;
          else if (channelKey === 'green') mutableSelf.g = result.value;
          else if (channelKey === 'blue') mutableSelf.b = result.value;

          // For non-primary themes with overrides, compare against override values
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
        // Build the Partial<ColorNode> with cross-color-space sync
        const nodeChanges: Partial<ColorNode> = {} as any;

        // Recompute hex and keep color spaces in sync
        const cs = node.colorSpace || 'hsl';
        // For non-primary theme-overridden nodes, read current values from themeOverrides
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

        // For non-primary theme with overrides, write to themeOverrides instead of top-level
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
          // Don't set top-level properties
        } else {
          // Primary theme or inherited: write to top-level
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
        // Re-verify idx is still the same node (guard against concurrent mutations)
        if (idx < updated.length && updated[idx].id === allNodes[idx]?.id) {
          updated[idx] = { ...updated[idx], ...changes };
        } else {
          // Fallback: find by id
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
          // Determine if this is a non-primary theme update
          const currentThemeObj = themes.find(t => t.id === activeThemeId);
          const isPrimaryThemeSync = currentThemeObj?.isPrimary ?? true;
          finalTokens = finalTokens.map(token => {
            if (!tokenIds.has(token.id)) return token;
            tokensUpdated = true;
            // Pass theme override for correct color resolution in non-primary themes
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
              // Primary theme: update both base properties and themeValues
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
              // Non-primary theme: ONLY update themeValues, preserve base token properties
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

  // Shortcuts panel popup state
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Command palette (⌘K) state
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // ── Ask AI state ──
  const [showAIChat, setShowAIChat] = useState(false);
  const [showAISettingsPopup, setShowAISettingsPopup] = useState(false);
  const [aiConversations, setAIConversations] = useState<Conversation[]>(() => loadLocalConversations());
  const [aiChatDocked, setAIChatDocked] = useState(() => {
    try { return localStorage.getItem('0colors-ai-chat-docked') === 'true'; } catch { return false; }
  });
  const handleAIChatDockChange = useCallback((docked: boolean) => {
    setAIChatDocked(docked);
    try { localStorage.setItem('0colors-ai-chat-docked', String(docked)); } catch {}
  }, []);
  const aiConvSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiConvLoadedRef = useRef(false);

  // Auto-assign trigger state (for Alt+T keyboard shortcut)
  const [autoAssignTriggerNodeId, setAutoAssignTriggerNodeId] = useState<string | null>(null);

  // Ref for handleSwitchTheme so the keyboard shortcut useEffect (declared before
  // handleSwitchTheme) can call it without a temporal-dead-zone error.
  const handleSwitchThemeRef = useRef<((themeId: string) => void) | null>(null);

  // Get nodes for the active project and page (nodes are NOT filtered by theme - they're shared)
  const nodes = allNodes.filter(node => node.projectId === activeProjectId && node.pageId === activePageId);
  
  // Get tokens for the active project and page
  // Tokens are now theme-agnostic - they're shared across all themes
  // Only their values (stored in themeValues) differ per theme
  const pageTokens = tokens.filter(token => 
    token.projectId === activeProjectId && token.pageId === activePageId
  );
  
  // All tokens across all pages for the active project (for cross-page reference resolution)
  const allProjectTokens = tokens.filter(token => token.projectId === activeProjectId);
  
  // All nodes across all pages for the active project (for cross-page lookups)
  const allProjectNodes = allNodes.filter(node => node.projectId === activeProjectId);
  
  // Get groups for the active project and page
  const pageGroups = groups.filter(group => group.projectId === activeProjectId && group.pageId === activePageId);
  
  // Get active page
  const activePage = pages.find(p => p.id === activePageId);
  
  // Get active theme
  const activeTheme = themes.find(t => t.id === activeThemeId);
  
  // Get primary theme for this project
  const primaryTheme = themes.find(t => t.projectId === activeProjectId && t.isPrimary);
  
  // Check if current theme is primary
  const isViewingPrimaryTheme = activeTheme?.isPrimary === true;

  // "Show all visible" override — press O to toggle dimming off on non-primary themes
  const [showAllVisible, setShowAllVisible] = useState(false);

  // Reset showAllVisible when switching back to a primary theme
  useEffect(() => {
    if (isViewingPrimaryTheme) setShowAllVisible(false);
  }, [isViewingPrimaryTheme]);

  // -----------------------------------------------------------------------
  // Undo / Redo  (snapshot-based, debounced)
  // -----------------------------------------------------------------------
  const undoableState = useMemo<UndoableState>(() => ({
    allNodes,
    tokens,
    groups,
    projects,
    pages,
    themes,
    activeProjectId,
    activePageId,
    activeThemeId,
    advancedLogic,
  }), [allNodes, tokens, groups, projects, pages, themes, activeProjectId, activePageId, activeThemeId, advancedLogic]);

  const restoreUndoableState = useCallback((snapshot: UndoableState) => {
    setAllNodes(snapshot.allNodes);
    setTokens(snapshot.tokens);
    setGroups(snapshot.groups);
    setProjects(snapshot.projects);
    setPages(snapshot.pages);
    setThemes(snapshot.themes);
    setActiveProjectId(snapshot.activeProjectId);
    setActivePageId(snapshot.activePageId);
    setActiveThemeId(snapshot.activeThemeId);
    setAdvancedLogic(snapshot.advancedLogic);
  }, []);

  const { undo, redo, canUndo, canRedo, undoCount, redoCount, flush: flushUndo } = useUndoRedo(
    undoableState,
    restoreUndoableState,
    { enabled: !isInitialLoad, maxHistory: 80, debounceMs: 400 },
  );

  // Prune stale selection — remove selectedNodeId(s) that no longer exist in allNodes
  // (covers undo removing duplicated nodes, external state changes, etc.)
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

  // Get or create canvas state for active project and page
  const getCanvasState = (): CanvasState => {
    const existing = canvasStates.find(s => s.projectId === activeProjectId && s.pageId === activePageId);
    if (existing) return existing;
    
    return {
      projectId: activeProjectId,
      pageId: activePageId,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };
  };
  
  const canvasState = getCanvasState();
  
  // Update canvas state for active project
  const updateCanvasState = useCallback((updates: Partial<Omit<CanvasState, 'projectId'>>) => {
    setCanvasStates(prev => {
      const existing = prev.find(s => s.projectId === activeProjectId);
      if (existing) {
        return prev.map(s => 
          s.projectId === activeProjectId 
            ? { ...s, ...updates }
            : s
        );
      } else {
        return [...prev, {
          projectId: activeProjectId,
          pan: updates.pan ?? { x: 0, y: 0 },
          zoom: updates.zoom ?? 1,
        }];
      }
    });
  }, [activeProjectId]);

  // Prevent browser zoom on Ctrl/Cmd + wheel
  useEffect(() => {
    const preventBrowserZoom = (e: WheelEvent) => {
      // Prevent browser zoom when Ctrl/Cmd + wheel is used
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    // Also prevent keyboard zoom shortcuts
    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
      }
    };

    // Add listeners with passive: false to allow preventDefault
    window.addEventListener('wheel', preventBrowserZoom, { passive: false });
    window.addEventListener('keydown', preventKeyboardZoom, { passive: false });

    return () => {
      window.removeEventListener('wheel', preventBrowserZoom);
      window.removeEventListener('keydown', preventKeyboardZoom);
    };
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    const storedData = loadFromLocalStorage();
    if (storedData) {
      // Migration: convert old tokenId to tokenIds array and add colorSpace
      const migratedNodes = (storedData.nodes || []).map((node: any) => {
        let migrated = { ...node };
        
        // Migration 1: tokenId -> tokenIds
        if (node.tokenId !== undefined && node.tokenIds === undefined) {
          const { tokenId, ...rest } = migrated;
          migrated = {
            ...rest,
            tokenIds: tokenId ? [tokenId] : [],
          };
        }
        
        // Migration 2: add colorSpace (default to 'hsl' for old nodes)
        if (!migrated.colorSpace) {
          migrated.colorSpace = 'hsl';
        }
        
        // Migration 3: add pageId (assign to page-1 for old nodes)
        if (!migrated.pageId) {
          migrated.pageId = 'page-1';
        }
        
        return migrated;
      });

      // Migrate tokens to have pageId
      const migratedTokens = (storedData.tokens || []).map((token: any) => {
        if (!token.pageId) {
          return { ...token, pageId: 'page-1' };
        }
        return token;
      });

      // Migrate groups to have pageId
      const migratedGroups = (storedData.groups || defaultData.groups).map((group: any) => {
        if (!group.pageId) {
          return { ...group, pageId: 'page-1' };
        }
        return group;
      });

      setAllNodes(migratedNodes);
      
      // DATA INTEGRITY CHECK (non-destructive — log warnings but preserve all data)
      // Data is never auto-deleted; only explicit user actions (delete node, reset to defaults) remove data.
      const loadedGroups = migratedGroups;
      const loadedTokens = migratedTokens || defaultData.tokens;
      
      console.log('📋 Running data integrity check on load...');
      console.log(`Loaded data: ${migratedNodes.length} nodes, ${loadedGroups.length} groups, ${loadedTokens.length} tokens`);
      
      // Check for orphaned palette groups (palette entries without corresponding nodes)
      const paletteEntryGroups = loadedGroups.filter(g => g.isPaletteEntry);
      paletteEntryGroups.forEach(group => {
        const paletteNodeExists = migratedNodes.some(n => n.id === group.paletteNodeId && n.isPalette);
        if (!paletteNodeExists) {
          console.warn(`⚠️ Palette group "${group.name}" (${group.id}) has no matching palette node — data preserved`);
        }
      });
      
      // Check for tokens referencing non-existent groups
      const validGroupIds = new Set(loadedGroups.map(g => g.id));
      loadedTokens.forEach(t => {
        if (t.groupId && !validGroupIds.has(t.groupId)) {
          console.warn(`⚠️ Token "${t.name}" (${t.id}) references non-existent group ${t.groupId} — data preserved`);
        }
      });
      
      console.log('✅ Data integrity check complete — all data preserved');
      
      setTokens(loadedTokens);
      // Merge immediately-saved expand states on top of loaded groups
      setGroups(mergeGroupExpandStates(loadedGroups));
      setProjects(storedData.projects || defaultData.projects);
      // Initialize lastSyncedAtMapRef from loaded projects so the
      // synchronous guard is correct from the very first cloud load.
      for (const p of (storedData.projects || defaultData.projects)) {
        if (p.lastSyncedAt) {
          lastSyncedAtMapRef.current[p.id] = p.lastSyncedAt;
        }
      }
      setPages(storedData.pages || defaultData.pages);
      setThemes(storedData.themes || defaultData.themes);
      setCanvasStates(storedData.canvasStates || defaultData.canvasStates);
      setActiveProjectId(storedData.activeProjectId || defaultData.activeProjectId);
      setActivePageId(storedData.activePageId || defaultData.activePageId);
      setActiveThemeId(storedData.activeThemeId || defaultData.activeThemeId);
      // Restore page state - if user was on canvas, stay on canvas
      if (storedData.viewingProjects !== undefined) {
        setViewingProjects(storedData.viewingProjects);
      }

      // Restore computed tokens from saved data or separate key
      if (storedData.computedTokens && typeof storedData.computedTokens === 'object') {
        computedTokensRef.current = storedData.computedTokens;
      } else {
        try {
          const savedComputed = localStorage.getItem('0colors-computed-tokens');
          if (savedComputed) {
            computedTokensRef.current = JSON.parse(savedComputed);
          }
        } catch { /* ignore */ }
      }
    }
    
    // Set timeout after state updates have settled
    setTimeout(() => {
      console.log('📋 Post-load state settled');
      setIsInitialLoad(false);
    }, 0);
  }, []);

  // NOTE: Reactive palette-orphan cleanup effect removed — it ran on every
  // allNodes/groups/tokens change and auto-deleted data without user
  // confirmation, risking cascading deletions during transient states.
  // The deleteNode handler already cleans up palette groups/tokens on
  // explicit user deletion, and the one-time on-load cleanup inside
  // loadFromLocalStorage handles startup data-integrity.

  // NOTE: Reactive orphaned-token cleanup effect removed — same reasoning
  // as above; the deleteNode handler + on-load cleanup are sufficient.

  // Sync token values with assigned nodes when theme changes
  useEffect(() => {
    if (isInitialLoad || !activeThemeId) return;
    
    const currentThemeSync = themes.find(t => t.id === activeThemeId);
    const isPrimarySync = currentThemeSync?.isPrimary ?? true;
    
    // Sync all token values with their assigned nodes for the current theme
    setTokens(prevTokens => {
      let anyChanged = false;
      const newTokens = prevTokens.map(token => {
        // Find the node that has this token assigned in the current theme
        const assignedNode = allNodes.find(node => {
          // If theme-specific assignments exist (even if empty = intentionally cleared), use them exclusively
          if (node.tokenAssignments?.[activeThemeId] !== undefined) {
            return node.tokenAssignments[activeThemeId].includes(token.id);
          }
          return (node.tokenIds || []).includes(token.id);
        });
        
        if (!assignedNode) return token;
        
        // Get the effective color using color-space-aware conversion (handles RGB, OKLCH, HCT, HEX → HSL)
        const hasThemeOverride = assignedNode.themeOverrides?.[activeThemeId];
        const themeOverride = hasThemeOverride ? assignedNode.themeOverrides![activeThemeId] : undefined;
        const effective = getNodeEffectiveHSL(assignedNode, themeOverride);
        
        // Only update if token doesn't have the correct value already
        const currentThemeValue = token.themeValues?.[activeThemeId];
        
        if (assignedNode.isSpacing || assignedNode.type === 'spacing') {
          const newValue = assignedNode.spacingValue ?? 16;
          const newUnit = assignedNode.spacingUnit ?? 'px';
          
          if (currentThemeValue?.value !== newValue || currentThemeValue?.unit !== newUnit) {
            anyChanged = true;
            const updatedThemeValues = { ...token.themeValues };
            updatedThemeValues[activeThemeId] = {
              value: newValue,
              unit: newUnit,
            };
            return {
              ...token,
              themeValues: updatedThemeValues,
            };
          }
        } else {
          if (currentThemeValue?.hue !== effective.hue || 
              currentThemeValue?.saturation !== effective.saturation ||
              currentThemeValue?.lightness !== effective.lightness ||
              currentThemeValue?.alpha !== effective.alpha) {
            anyChanged = true;
            const updatedThemeValues = { ...token.themeValues };
            updatedThemeValues[activeThemeId] = {
              hue: effective.hue,
              saturation: effective.saturation,
              lightness: effective.lightness,
              alpha: effective.alpha,
            };
            if (isPrimarySync) {
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
          }
        }
        
        return token;
      });
      // Return the same reference if nothing changed — avoids spurious
      // state updates that would confuse the undo/redo system.
      return anyChanged ? newTokens : prevTokens;
    });
  }, [activeThemeId, allNodes, isInitialLoad, themes]);

  // Immediately persist group expand/collapse states (no debounce)
  useEffect(() => {
    if (isInitialLoad || isImporting) return;
    saveGroupExpandStates(groups);
  }, [groups, isInitialLoad, isImporting]);

  // Auto-save to localStorage whenever data changes (with debounce)
  useEffect(() => {
    if (isInitialLoad || isImporting) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const dataToSave = {
        nodes: allNodes,
        tokens,
        groups,
        projects,
        pages,
        themes,
        canvasStates,
        activeProjectId,
        activePageId,
        activeThemeId,
        viewingProjects, // Save current page state
        computedTokens: computedTokensRef.current, // Derived per-theme token snapshots
        schemaVersion: CURRENT_SCHEMA_VERSION, // Stamp version for migration system
      };
      
      saveToLocalStorage(dataToSave);
    }, 1000); // Debounce by 1s

    return () => clearTimeout(timeoutId);
  }, [allNodes, tokens, groups, projects, pages, themes, canvasStates, activeProjectId, activePageId, activeThemeId, viewingProjects, isInitialLoad, isImporting]);

  // Debug: Log tokens state changes
  useEffect(() => {
    console.log(`📊 Tokens state updated. Count: ${tokens.length}`);
    const paletteGroupIds = new Set(groups.filter(g => g.isPaletteEntry).map(g => g.id));
    const paletteTokens = tokens.filter(t => t.groupId && paletteGroupIds.has(t.groupId));
    console.log(`📊 Palette tokens in state: ${paletteTokens.length}`, paletteTokens.map(t => ({ name: t.name, groupId: t.groupId })));
  }, [tokens, groups]);

  // NOTE: Reactive orphaned-palette-token cleanup effect REMOVED.
  // It ran on every allNodes/groups/tokens change and auto-deleted data
  // without user confirmation, risking cascading deletions during transient
  // states (undo/redo, batch operations, imports).  The deleteNode handler
  // already cleans up palette groups/tokens on explicit user deletion.
  // Data should only be removed when the user explicitly requests it.

  // Node operation functions
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

  // Auto-dismiss pending token restore after 15 seconds
  useEffect(() => {
    if (!pendingTokenRestore) return;
    const timer = setTimeout(() => {
      setPendingTokenRestore(null);
    }, 15000);
    return () => clearTimeout(timer);
  }, [pendingTokenRestore]);

  // Auto-clear multi-select bar delay after a short pause
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

  // ─── Token-assignment "Go back" navigation ──────────────────────────
  // Listen for the save event dispatched from ColorNodeCard / TokenNodeCard navigation
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

  // ── Auto-dismiss "Go back" button ──
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

  // Restore assigned tokens for recently duplicated/pasted nodes
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

  // Handle drag selection from ColorCanvas
  useEffect(() => {
    const handleDragSelect = (e: Event) => {
      const customEvent = e as CustomEvent<{ nodeIds: string[], addToSelection: boolean, isRealtime?: boolean }>;
      const { nodeIds } = customEvent.detail;
      
      if (nodeIds && nodeIds.length > 0) {
        // The ColorCanvas already calculated the final selection state
        // Just apply it directly
        setSelectedNodeId(nodeIds[0]);
        setSelectedNodeIds(nodeIds);
      }
    };

    window.addEventListener('dragSelectNodes', handleDragSelect);
    return () => window.removeEventListener('dragSelectNodes', handleDragSelect);
  }, []);

  // Handle batch node shifts from canvas auto-layout (expand/collapse, theme switch)
  useEffect(() => {
    const handleBatchShift = (evt: Event) => {
      const entries = (evt as CustomEvent<{ id: string; dy: number }[]>).detail;
      if (!entries || entries.length === 0) return;
      setAllNodes(prev => {
        const shiftMap = new Map(entries.map(e => [e.id, e.dy]));
        return prev.map(node => {
          const dy = shiftMap.get(node.id);
          if (dy === undefined) return node;
          return { ...node, position: { x: node.position.x, y: node.position.y + dy } };
        });
      });
    };
    window.addEventListener('batchShiftNodes', handleBatchShift);
    return () => window.removeEventListener('batchShiftNodes', handleBatchShift);
  }, []);

  const addRootNode = useCallback((colorSpace: 'hsl' | 'rgb' | 'oklch' | 'hct' = 'hsl') => {
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

  /** Toggle a child token node into a prefix or back to a child.
   *  When making a child a prefix: delete its own token, clear valueTokenId.
   *  When making a prefix back to a child: create a new token for it.
   *  In both cases, cascade-recompute all descendant token paths.
   */
  const togglePrefixNode = useCallback((nodeId: string, makePrefix: boolean) => {
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

  const updateNode = useCallback((id: string, updates: Partial<ColorNode>) => {
    setAllNodes((prev) => {
      const nodeBeingUpdated = prev.find((n) => n.id === id);
      if (!nodeBeingUpdated) return prev;

      // Handle palette shade count changes
      if (nodeBeingUpdated.isPalette && updates.paletteShadeCount !== undefined) {
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
            case '1-9':     shadeName = (index + 1).toString(); break;
            case '10-90':   shadeName = ((index + 1) * 10).toString(); break;
            case '100-900': shadeName = ((index + 1) * 100).toString(); break;
            case 'a-z':     shadeName = String.fromCharCode(97 + index); break;
            default:        shadeName = (index + 1).toString();
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
        const currentLogic = advancedLogicRef.current;
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

  const deleteNode = useCallback((id: string) => {
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

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field - if so, ignore keyboard shortcuts
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.isContentEditable;

      // Actions with Cmd/Ctrl+K (works globally)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
        return;
      }

      // Toggle Ask AI with Ctrl/Cmd+Shift+A (works globally)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setShowAIChat(prev => !prev);
        return;
      }

      // Undo with Cmd/Ctrl+Z (works globally — all views)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        if (isTyping) return; // allow native undo inside text inputs
        e.preventDefault();
        undo();
        return;
      }

      // Redo with Cmd/Ctrl+Shift+Z (works globally)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        if (isTyping) return;
        e.preventDefault();
        redo();
        return;
      }

      // Copy with Cmd/Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedNodeId && !isTyping) {
        e.preventDefault();
        if (selectedNodeIds.length > 1) {
          copyNode(selectedNodeIds);
        } else {
          copyNode(selectedNodeId);
        }
        return;
      }
      
      // Paste with Cmd/Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && copiedNodes.length > 0 && !isTyping) {
        e.preventDefault();
        pasteNodes();
        return;
      }
      
      // Duplicate with Cmd/Ctrl+D
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedNodeId && !isTyping) {
        e.preventDefault();
        if (selectedNodeIds.length > 1) {
          duplicateNode(selectedNodeIds);
        } else {
          duplicateNode(selectedNodeId);
        }
        return;
      }
      
      // Delete with Delete or Backspace - only if NOT typing in an input field
      // Also block when advanced popup is open (node shouldn't be deleted while editing logic)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping) {
        if (document.body.hasAttribute('data-advanced-popup-open')) return;
        e.preventDefault();
        
        // Delete multi-selected nodes
        if (selectedNodeIds.length > 0) {
          selectedNodeIds.forEach(nodeId => deleteNode(nodeId));
          setSelectedNodeIds([]);
          setSelectedNodeId(null);
        }
        // Delete single selected node
        else if (selectedNodeId) {
          deleteNode(selectedNodeId);
          setSelectedNodeId(null);
        }
      }
      
      // Deselect with Escape
      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
      }

      // Toggle "show all visible" with O key (non-primary themes only)
      if ((e.key === 'o' || e.key === 'O') && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping) {
        setShowAllVisible(prev => !prev);
      }

      // Open auto-assign token popup with Alt/Opt+T
      // Use e.code because macOS Option+T produces '†' for e.key
      if (e.altKey && e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && !isTyping) {
        e.preventDefault();
        if (selectedNodeId) {
          setAutoAssignTriggerNodeId(selectedNodeId);
        }
      }

      // Open Advanced Logic popup with Alt/Opt+F
      // Use e.code because macOS Option+F produces 'ƒ' for e.key
      if (e.altKey && e.code === 'KeyF' && !e.metaKey && !e.ctrlKey && !isTyping) {
        e.preventDefault();
        if (selectedNodeId) {
          window.dispatchEvent(new CustomEvent('openAdvancedPopup', { detail: { nodeId: selectedNodeId } }));
        }
      }

      // Switch themes with 1-9 keys (first 9 themes in the active project)
      if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          const projectThemes = themes
            .filter(t => t.projectId === activeProjectId)
            .sort((a, b) => a.createdAt - b.createdAt);
          const targetTheme = projectThemes[num - 1];
          if (targetTheme && targetTheme.id !== activeThemeId) {
            e.preventDefault();
            handleSwitchThemeRef.current?.(targetTheme.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedNodeIds, copiedNodes, duplicateNode, deleteNode, copyNode, pasteNodes, undo, redo, themes, activeProjectId, activeThemeId]);

  // ── Dev Mode: Webhook apply listener ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.nodeId && detail?.hue !== undefined) {
        updateNode(detail.nodeId, {
          hue: detail.hue,
          saturation: detail.saturation,
          lightness: detail.lightness,
        });
      }
    };
    window.addEventListener('devModeWebhookApply', handler);
    return () => window.removeEventListener('devModeWebhookApply', handler);
  }, [updateNode]);

  const generateShareLink = useCallback(() => {
    try {
      const exportData = {
        nodes: allNodes,
        projects,
        canvasStates,
        activeProjectId,
      };
      const json = JSON.stringify(exportData);
      const encoded = btoa(json);
      const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
      
      setShareLink(url);
      setShareDialogOpen(true);
    } catch (error) {
      console.error('Failed to generate share link:', error);
    }
  }, [allNodes, projects, canvasStates, activeProjectId]);

  const exportToFigma = useCallback(() => {
    if (!isInFigma) {
      return;
    }

    if (nodes.length === 0) {
      return;
    }

    parent.postMessage(
      {
        pluginMessage: {
          type: 'create-color-styles',
          nodes: nodes,
        },
      },
      '*'
    );
  }, [nodes]);

  useEffect(() => {
    if (!isInFigma) return;

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === 'styles-created') {
        // Styles created successfully
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const copyToClipboard = useCallback(() => {
    copyTextToClipboard(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareLink]);

  const exportJSON = useCallback(() => {
    const exportData = {
      nodes: allNodes,
      tokens,
      groups,
      projects,
      canvasStates,
      activeProjectId,
    };
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'color-tool-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [allNodes, tokens, groups, projects, canvasStates, activeProjectId]);

  const importJSON = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target?.result as string);
            
            if (imported.nodes && (imported.projects || imported.collections)) {
              flushUndo(); // commit any pending undo batch so the import becomes its own entry
              setIsImporting(true);
              
              const nodesToImport = imported.nodes || [];
              const tokensToImport = imported.tokens || [];
              const groupsToImport = imported.groups || [];
              const projectsToImport = imported.projects || imported.collections || [];
              const canvasStatesToImport = imported.canvasStates || [];
              const activeProjectToImport = imported.activeProjectId || imported.activeCollectionId || projectsToImport[0]?.id || 'sample-project';
              
              // Migration: convert old tokenId to tokenIds array and add colorSpace
              const migratedNodes = nodesToImport.map((node: any) => {
                let migrated = { ...node };
                
                // Migration 1: tokenId -> tokenIds
                if (node.tokenId !== undefined && node.tokenIds === undefined) {
                  const { tokenId, ...rest } = migrated;
                  migrated = {
                    ...rest,
                    tokenIds: tokenId ? [tokenId] : [],
                  };
                }
                
                // Migration 2: add colorSpace
                if (!migrated.colorSpace) {
                  migrated.colorSpace = 'hsl';
                }
                
                return migrated;
              });
              
              setAllNodes(migratedNodes);
              setTokens(tokensToImport);
              setGroups(groupsToImport);
              setProjects(projectsToImport);
              setCanvasStates(canvasStatesToImport);
              setActiveProjectId(activeProjectToImport);
              
              setTimeout(() => {
                setIsImporting(false);
              }, 500);
            } else if (Array.isArray(imported)) {
              const migratedNodes = imported.map((node: any) => ({
                ...node,
                colorSpace: node.colorSpace || 'hsl',
                tokenIds: node.tokenId ? [node.tokenId] : (node.tokenIds || []),
                projectId: node.projectId ?? node.collectionId ?? activeProjectId,
              }));
              setAllNodes(prev => [...prev.filter(n => n.projectId !== activeProjectId), ...migratedNodes]);
            }
          } catch (error) {
            console.error('Failed to import:', error);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [activeProjectId, flushUndo]);

  // Manual cleanup function to remove orphaned palette groups and tokens
  const cleanupOrphanedData = useCallback(() => {
    console.log('🧹 Manual cleanup triggered...');
    
    // Find orphaned palette groups (no corresponding palette node)
    const paletteEntryGroups = groups.filter(g => g.isPaletteEntry);
    const orphanedGroupIds: string[] = [];
    
    paletteEntryGroups.forEach(group => {
      if (!group.paletteNodeId) {
        orphanedGroupIds.push(group.id);
        return;
      }
      const paletteNodeExists = allNodes.some(n => n.id === group.paletteNodeId && n.isPalette);
      if (!paletteNodeExists) {
        orphanedGroupIds.push(group.id);
      }
    });
    
    // Find orphaned tokens (tokens whose groupId doesn't exist)
    const validGroupIds = new Set(groups.filter(g => !orphanedGroupIds.includes(g.id)).map(g => g.id));
    const orphanedTokenIds = tokens.filter(t => t.groupId && !validGroupIds.has(t.groupId)).map(t => t.id);
    
    if (orphanedGroupIds.length > 0 || orphanedTokenIds.length > 0) {
      console.log(`🗑️ Removing ${orphanedGroupIds.length} groups and ${orphanedTokenIds.length} tokens`);
      
      setGroups(prev => prev.filter(g => !orphanedGroupIds.includes(g.id)));
      setTokens(prev => prev.filter(t => !orphanedGroupIds.includes(t.groupId || '') && !orphanedTokenIds.includes(t.id)));
      
      console.log('✅ Cleanup complete');
    } else {
      console.log('✅ No orphaned data found');
    }
  }, [allNodes, groups, tokens]);

  const exportProjectJSON = useCallback((projectId: string) => {
    const project = projects.find(c => c.id === projectId);
    if (!project) {
      return;
    }

    const projectNodes = allNodes.filter(n => n.projectId === projectId);
    const projectTokens = tokens.filter(t => t.projectId === projectId);
    const projectGroups = groups.filter(g => g.projectId === projectId);
    const projectCanvasState = canvasStates.find(cs => cs.projectId === projectId);
    const projectPages = pages.filter(p => p.projectId === projectId);
    const projectThemes = themes.filter(t => t.projectId === projectId);
    const projectNodeIds = new Set(projectNodes.map(n => n.id));
    const projectLogic = advancedLogic.filter(l => projectNodeIds.has(l.nodeId));

    const exportData = {
      project,
      nodes: projectNodes,
      tokens: projectTokens,
      groups: projectGroups,
      canvasState: projectCanvasState,
      pages: projectPages,
      themes: projectThemes,
      advancedLogic: projectLogic,
      schemaVersion: CURRENT_SCHEMA_VERSION, // Stamp version for migration system
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}-project.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allNodes, tokens, groups, projects, canvasStates, pages, themes, advancedLogic]);

  const importProjectJSON = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const fileContent = event.target?.result as string;
            console.log('📦 File loaded, size:', fileContent?.length, 'characters');
            
            if (!fileContent || fileContent.trim() === '') {
              alert('Error: The file is empty.');
              return;
            }

            let imported;
            try {
              imported = JSON.parse(fileContent);
            } catch (parseError) {
              console.error('❌ JSON parse error:', parseError);
              alert('Error: The file is not valid JSON.\n\n' + parseError);
              return;
            }

            console.log('📦 RAW JSON:', fileContent.substring(0, 500));
            console.log('📦 Imported data:', imported);
            console.log('📦 Type:', typeof imported);
            console.log('📦 Keys:', imported && typeof imported === 'object' ? Object.keys(imported) : 'N/A');
            console.log('📦 Has project?', !!imported?.project);
            console.log('📦 Has collection?', !!imported?.collection);
            console.log('📦 Has nodes?', Array.isArray(imported?.nodes), '- Count:', imported?.nodes?.length);
            console.log('📦 Has tokens?', Array.isArray(imported?.tokens), '- Count:', imported?.tokens?.length);
            console.log('📦 Has groups?', Array.isArray(imported?.groups), '- Count:', imported?.groups?.length);

            // Validate structure - be more lenient for debugging
            const hasProject = imported?.project || imported?.collection;
            const hasNodes = Array.isArray(imported?.nodes);
            const hasTokens = Array.isArray(imported?.tokens);
            const hasRequiredArrays = hasNodes && hasTokens;
            
            console.log('🔍 Validation:', { hasProject, hasNodes, hasTokens, hasRequiredArrays });
            
            if (hasProject && hasRequiredArrays) {
              // ── Run schema migrations on imported data ──
              const importMigration = migrateToLatest({
                nodes: imported.nodes || [],
                tokens: imported.tokens || [],
                groups: imported.groups || [],
                pages: imported.pages || [],
                themes: imported.themes || [],
                schemaVersion: imported.schemaVersion,
              });
              if (importMigration.migrated) {
                console.log(`🔄 Import migration: ${importMigration.appliedMigrations.join(', ')}`);
                imported.nodes = importMigration.data.nodes;
                imported.tokens = importMigration.data.tokens;
                imported.groups = importMigration.data.groups;
                imported.pages = importMigration.data.pages;
                imported.themes = importMigration.data.themes;
              }

              const timestamp = Date.now();
              const newProjectId = `project-${timestamp}`;
              const importedProject = imported.project || imported.collection;
              const newProject: TokenProject = {
                id: newProjectId,
                name: (importedProject.name || 'Untitled Project') + ' (Imported)',
                isExpanded: true,
                isSample: false,
                folderColor: importedProject.folderColor ?? Math.floor(Math.random() * 360),
              };

              console.log('Creating new project:', newProject);

              // ── Build ALL ID remapping tables ──
              const nodeIdMap = new Map<string, string>();
              const groupIdMap = new Map<string, string>();
              const tokenIdMap = new Map<string, string>();
              const pageIdMap = new Map<string, string>();
              const themeIdMap = new Map<string, string>();

              // Pre-register node IDs first (two-pass for forward references)
              (imported.nodes || []).forEach((node: any, i: number) => {
                nodeIdMap.set(node.id, `node-${timestamp}-${i}`);
              });
              (imported.groups || []).forEach((group: any, i: number) => {
                groupIdMap.set(group.id, `group-${timestamp}-${i}`);
              });
              (imported.tokens || []).forEach((token: any, i: number) => {
                tokenIdMap.set(token.id, `token-${timestamp}-${i}`);
              });

              // ── Pages: import from file or create a default ──
              const importedPages = Array.isArray(imported.pages) ? imported.pages : [];
              let newPages: Page[];
              if (importedPages.length > 0) {
                importedPages.forEach((page: any, i: number) => {
                  pageIdMap.set(page.id, `page-${timestamp}-p${i}`);
                });
                newPages = importedPages.map((page: any) => ({
                  ...page,
                  id: pageIdMap.get(page.id)!,
                  projectId: newProjectId,
                }));
              } else {
                const defaultPageId = `page-${timestamp}`;
                // Map all old pageIds found on nodes to this one default page
                const uniquePageIds = new Set<string>();
                (imported.nodes || []).forEach((n: any) => { if (n.pageId) uniquePageIds.add(n.pageId); });
                (imported.groups || []).forEach((g: any) => { if (g.pageId) uniquePageIds.add(g.pageId); });
                (imported.tokens || []).forEach((t: any) => { if (t.pageId) uniquePageIds.add(t.pageId); });
                uniquePageIds.forEach(pid => pageIdMap.set(pid, defaultPageId));
                newPages = [{ id: defaultPageId, name: 'Page 1', projectId: newProjectId, createdAt: timestamp }];
              }

              // ── Themes: import from file or create a default ──
              const importedThemes = Array.isArray(imported.themes) ? imported.themes : [];
              let newThemes: Theme[];
              if (importedThemes.length > 0) {
                importedThemes.forEach((theme: any, i: number) => {
                  themeIdMap.set(theme.id, `theme-${timestamp}-t${i}`);
                });
                newThemes = importedThemes.map((theme: any) => ({
                  ...theme,
                  id: themeIdMap.get(theme.id)!,
                  projectId: newProjectId,
                }));
              } else {
                const defaultThemeId = `theme-${timestamp}`;
                // Map all old themeIds found in data to default theme
                const uniqueThemeIds = new Set<string>();
                (imported.nodes || []).forEach((n: any) => {
                  if (n.themeOverrides) Object.keys(n.themeOverrides).forEach(k => uniqueThemeIds.add(k));
                  if (n.tokenAssignments) Object.keys(n.tokenAssignments).forEach(k => uniqueThemeIds.add(k));
                  if (n.valueTokenAssignments) Object.keys(n.valueTokenAssignments).forEach(k => uniqueThemeIds.add(k));
                });
                (imported.tokens || []).forEach((t: any) => {
                  if (t.themeValues) Object.keys(t.themeValues).forEach(k => uniqueThemeIds.add(k));
                });
                uniqueThemeIds.forEach(tid => themeIdMap.set(tid, defaultThemeId));
                newThemes = [{ id: defaultThemeId, name: 'Default', projectId: newProjectId, createdAt: timestamp, isPrimary: true }];
              }

              // ── Helper: remap theme-keyed dicts ──
              const remapThemeKeys = <T,>(dict: Record<string, T> | undefined): Record<string, T> | undefined => {
                if (!dict) return dict;
                const remapped: Record<string, T> = {};
                for (const [oldId, val] of Object.entries(dict)) {
                  remapped[themeIdMap.get(oldId) || oldId] = val;
                }
                return remapped;
              };

              const newGroups = (imported.groups || []).map((group: any) => ({
                ...group,
                id: groupIdMap.get(group.id)!,
                projectId: newProjectId,
                pageId: pageIdMap.get(group.pageId) || newPages[0].id,
                paletteNodeId: group.paletteNodeId ? nodeIdMap.get(group.paletteNodeId) || group.paletteNodeId : undefined,
              }));

              const newTokens = (imported.tokens || []).map((token: any) => ({
                ...token,
                id: tokenIdMap.get(token.id)!,
                projectId: newProjectId,
                pageId: pageIdMap.get(token.pageId) || newPages[0].id,
                groupId: token.groupId ? groupIdMap.get(token.groupId) || null : null,
                themeValues: remapThemeKeys(token.themeValues),
                themeVisibility: remapThemeKeys(token.themeVisibility),
              }));

              // ── Helper: remap token assignment objects ──
              const remapTokenAssignments = (assignments: any): any => {
                if (!assignments) return assignments;
                const remapped: any = {};
                for (const [oldThemeId, tokenIds] of Object.entries(assignments)) {
                  const newThemeId = themeIdMap.get(oldThemeId) || oldThemeId;
                  remapped[newThemeId] = Array.isArray(tokenIds)
                    ? (tokenIds as string[]).map(tid => tokenIdMap.get(tid) || tid)
                    : tokenIdMap.get(tokenIds as string) || tokenIds;
                }
                return remapped;
              };

              const newNodes = (imported.nodes || []).map((node: any) => {
                const tokenIds = node.tokenId
                  ? [tokenIdMap.get(node.tokenId) || node.tokenId]
                  : (node.tokenIds || []).map((tid: string) => tokenIdMap.get(tid) || tid);

                return {
                  ...node,
                  colorSpace: node.colorSpace || 'hsl',
                  id: nodeIdMap.get(node.id)!,
                  projectId: newProjectId,
                  pageId: pageIdMap.get(node.pageId) || newPages[0].id,
                  parentId: node.parentId ? nodeIdMap.get(node.parentId) || null : null,
                  tokenIds,
                  tokenId: node.tokenId ? tokenIdMap.get(node.tokenId) || node.tokenId : node.tokenId,
                  tokenAssignments: remapTokenAssignments(node.tokenAssignments),
                  ownTokenId: node.ownTokenId ? tokenIdMap.get(node.ownTokenId) || node.ownTokenId : node.ownTokenId,
                  valueTokenId: node.valueTokenId ? tokenIdMap.get(node.valueTokenId) || node.valueTokenId : node.valueTokenId,
                  valueTokenAssignments: node.valueTokenAssignments ? remapTokenAssignments(node.valueTokenAssignments) : undefined,
                  tokenGroupId: node.tokenGroupId ? groupIdMap.get(node.tokenGroupId) || node.tokenGroupId : node.tokenGroupId,
                  autoAssignGroupId: node.autoAssignGroupId ? groupIdMap.get(node.autoAssignGroupId) || node.autoAssignGroupId : node.autoAssignGroupId,
                  autoAssignedTokenId: node.autoAssignedTokenId ? tokenIdMap.get(node.autoAssignedTokenId) || node.autoAssignedTokenId : node.autoAssignedTokenId,
                  themeOverrides: remapThemeKeys(node.themeOverrides),
                  themeVisibility: remapThemeKeys(node.themeVisibility),
                };
              });

              // ── Canvas states ──
              const newCanvasStates: CanvasState[] = [];
              if (imported.canvasState) {
                newCanvasStates.push({
                  ...imported.canvasState,
                  projectId: newProjectId,
                  pageId: pageIdMap.get(imported.canvasState.pageId) || newPages[0].id,
                });
              } else {
                newPages.forEach(p => {
                  newCanvasStates.push({ projectId: newProjectId, pageId: p.id, pan: { x: 0, y: 0 }, zoom: 1 });
                });
              }

              // ── Advanced logic ──
              const importedLogic: NodeAdvancedLogic[] = Array.isArray(imported.advancedLogic) ? imported.advancedLogic : [];
              const newLogicEntries: NodeAdvancedLogic[] = importedLogic
                .filter((l: any) => nodeIdMap.has(l.nodeId))
                .map((entry: any) => ({
                  ...entry,
                  nodeId: nodeIdMap.get(entry.nodeId)!,
                  channels: Object.fromEntries(
                    Object.entries(entry.channels || {}).map(([key, ch]: [string, any]) => [key, {
                      ...ch,
                      rows: (ch.rows || []).map((row: any) => ({
                        ...row,
                        id: `${row.id}-imp-${timestamp}`,
                        tokens: (row.tokens || []).map((et: any) => ({
                          ...et,
                          refNodeId: et.refNodeId ? nodeIdMap.get(et.refNodeId) || et.refNodeId : et.refNodeId,
                          refTokenId: et.refTokenId ? tokenIdMap.get(et.refTokenId) || et.refTokenId : et.refTokenId,
                        })),
                      })),
                    }])
                  ),
                  tokenAssignment: entry.tokenAssignment ? {
                    ...entry.tokenAssignment,
                    rows: (entry.tokenAssignment.rows || []).map((row: any) => ({
                      ...row,
                      id: `${row.id}-imp-${timestamp}`,
                      tokens: (row.tokens || []).map((et: any) => ({
                        ...et,
                        refNodeId: et.refNodeId ? nodeIdMap.get(et.refNodeId) || et.refNodeId : et.refNodeId,
                        refTokenId: et.refTokenId ? tokenIdMap.get(et.refTokenId) || et.refTokenId : et.refTokenId,
                      })),
                    })),
                    fallbackTokenId: entry.tokenAssignment.fallbackTokenId
                      ? tokenIdMap.get(entry.tokenAssignment.fallbackTokenId) || entry.tokenAssignment.fallbackTokenId
                      : entry.tokenAssignment.fallbackTokenId,
                  } : entry.tokenAssignment,
                  // Theme-specific overrides: remap theme keys and expression refs
                  themeChannels: entry.themeChannels ? Object.fromEntries(
                    Object.entries(entry.themeChannels).map(([tid, channels]: [string, any]) => [
                      themeIdMap.get(tid) || tid,
                      Object.fromEntries(
                        Object.entries(channels || {}).map(([key, ch]: [string, any]) => [key, {
                          ...ch,
                          rows: (ch.rows || []).map((row: any) => ({
                            ...row,
                            id: `${row.id}-imp-${timestamp}`,
                            tokens: (row.tokens || []).map((et: any) => ({
                              ...et,
                              refNodeId: et.refNodeId ? nodeIdMap.get(et.refNodeId) || et.refNodeId : et.refNodeId,
                              refTokenId: et.refTokenId ? tokenIdMap.get(et.refTokenId) || et.refTokenId : et.refTokenId,
                            })),
                          })),
                        }])
                      ),
                    ])
                  ) : undefined,
                  themeBaseValues: entry.themeBaseValues ? remapThemeKeys(entry.themeBaseValues) : undefined,
                  themeTokenAssignment: entry.themeTokenAssignment ? Object.fromEntries(
                    Object.entries(entry.themeTokenAssignment).map(([tid, ta]: [string, any]) => [
                      themeIdMap.get(tid) || tid,
                      {
                        ...ta,
                        rows: (ta.rows || []).map((row: any) => ({
                          ...row,
                          id: `${row.id}-imp-${timestamp}`,
                          tokens: (row.tokens || []).map((et: any) => ({
                            ...et,
                            refNodeId: et.refNodeId ? nodeIdMap.get(et.refNodeId) || et.refNodeId : et.refNodeId,
                            refTokenId: et.refTokenId ? tokenIdMap.get(et.refTokenId) || et.refTokenId : et.refTokenId,
                          })),
                        })),
                        fallbackTokenId: ta.fallbackTokenId
                          ? tokenIdMap.get(ta.fallbackTokenId) || ta.fallbackTokenId
                          : ta.fallbackTokenId,
                      },
                    ])
                  ) : undefined,
                }));

              setProjects(prev => {
                console.log('Adding project to list. Current projects:', prev.length);
                const updated = [...prev, newProject];
                console.log('New projects count:', updated.length);
                return updated;
              });
              setPages(prev => [...prev, ...newPages]);
              setThemes(prev => [...prev, ...newThemes]);
              setGroups(prev => [...prev, ...newGroups]);
              setTokens(prev => [...prev, ...newTokens]);
              setAllNodes(prev => [...prev, ...newNodes]);
              setCanvasStates(prev => [...prev, ...newCanvasStates]);
              if (newLogicEntries.length > 0) {
                setAdvancedLogic(prev => [...prev, ...newLogicEntries]);
              }
              
              console.log('✅ Project imported successfully:', newProject.name);
              
              // Highlight the imported project without switching to it
              setHighlightedProjectId(newProjectId);
              setTimeout(() => setHighlightedProjectId(null), 3000);
            } else {
              console.error('❌ Invalid JSON structure. Expected project/collection, nodes, and tokens.');
              const receivedKeys = imported && typeof imported === 'object' ? Object.keys(imported) : [];
              console.log('❌ Received keys:', receivedKeys);
              console.log('❌ Validation failed:');
              console.log('  - Has project/collection?', hasProject);
              console.log('  - Has nodes array?', hasNodes);
              console.log('  - Has tokens array?', hasTokens);
              
              let errorMsg = 'Invalid project file format.\n\n';
              if (!hasProject) errorMsg += '• Missing "project" object\n';
              if (!Array.isArray(imported.nodes)) errorMsg += '• Missing or invalid "nodes" array\n';
              if (!Array.isArray(imported.tokens)) errorMsg += '• Missing or invalid "tokens" array\n';
              
              alert(errorMsg + '\nPlease make sure you\'re importing a valid project export.');
            }
          } catch (error) {
            console.error('❌ Failed to import project:', error);
            alert('Error importing project: ' + (error instanceof Error ? error.message : String(error)));
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, []);

  const addToken = useCallback((name?: string, groupId?: string | null, projectId?: string, tokenType?: 'color' | 'spacing' | 'radius' | 'fontSize' | 'lineHeight' | 'fontWeight' | 'shadow' | 'opacity', pageId?: string) => {
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
          shadowValue: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
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

  const addProject = useCallback((type: 'local' | 'cloud' | 'template' = 'local') => {
    const isCloud = type === 'cloud' || type === 'template';
    const isTemplate = type === 'template';
    
    // Enforce 2-cloud-project limit for regular cloud projects (admins are exempt)
    const isAdmin = authSessionRef.current?.isAdmin;
    if (type === 'cloud' && !isAdmin && projects.filter(p => p.isCloud && !p.isTemplate).length >= 2) {
      toast.error('Cloud project limit reached (max 2)');
      return;
    }

    let counter = 1;
    let newName = isTemplate ? `Template ${counter}` : `Project ${counter}`;
    
    while (projects.some(p => p.name.toLowerCase() === newName.toLowerCase())) {
      counter++;
      newName = isTemplate ? `Template ${counter}` : `Project ${counter}`;
    }
    
    const timestamp = Date.now();
    const newProjectId = `project-${timestamp}`;
    const newPageId = `page-${timestamp}`;
    
    const newProject: TokenProject = {
      id: newProjectId,
      name: newName,
      isExpanded: true,
      isSample: false,
      folderColor: Math.floor(Math.random() * 360),
      isCloud,
      isTemplate,
    };
    setProjects(prev => [...prev, newProject]);

    // Register cloud project with backend (both regular cloud and template projects)
    if (isCloud && authSessionRef.current) {
      registerCloudProject(newProjectId, authSessionRef.current.accessToken).then(result => {
        if (!result.ok) {
          console.log(`☁️ Cloud registration failed: ${result.error}`);
          toast.error(`Failed to register ${isTemplate ? 'template' : 'cloud'} project: ${result.error}`);
          setProjects(prev => prev.map(p => p.id === newProjectId ? { ...p, isCloud: false, isTemplate: false } : p));
        } else {
          markDirty(newProjectId);
        }
      });
    }
    
    // Create default page for the new project
    const newPage: Page = {
      id: newPageId,
      name: 'Page 1',
      projectId: newProjectId,
      createdAt: timestamp,
    };
    setPages(prev => [...prev, newPage]);
    
    // Create canvas state for the new page
    const newCanvasState: CanvasState = {
      projectId: newProjectId,
      pageId: newPageId,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };
    setCanvasStates(prev => [...prev, newCanvasState]);
    
    // Create default primary theme for the new project
    const newThemeId = `theme-${timestamp}`;
    const newTheme: Theme = {
      id: newThemeId,
      name: 'Light',
      projectId: newProjectId,
      createdAt: timestamp,
      isPrimary: true, // First theme is always primary
    };
    setThemes(prev => [...prev, newTheme]);
    
    const newNode: ColorNode = {
      id: `node-${timestamp + 1}`,
      colorSpace: 'hsl',
      hue: Math.floor(Math.random() * 360),
      saturation: 70,
      lightness: 50,
      alpha: 100,
      position: { x: 100, y: 200 },
      parentId: null,
      hueOffset: 0,
      saturationOffset: 0,
      lightnessOffset: 0,
      alphaOffset: 0,
      tokenId: null,
      tokenIds: [],
      width: 240,
      projectId: newProjectId,
      pageId: newPageId,
      lockHue: false,
      lockSaturation: false,
      lockLightness: false,
      lockAlpha: false,
      lockRed: false,
      lockGreen: false,
      lockBlue: false,
      diffHue: true,
      diffSaturation: true,
      diffLightness: true,
      diffAlpha: true,
      diffRed: true,
      diffGreen: true,
      diffBlue: true,
      isExpanded: false,
    };
    setAllNodes(prev => [...prev, newNode]);
    
    // Save current theme's selection before switching to new project
    themeSelectionsRef.current[activeThemeIdRef.current] = {
      selectedNodeId: selectedNodeIdRef.current,
      selectedNodeIds: [...selectedNodeIdsRef.current],
    };
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setActiveProjectId(newProjectId);
    setActivePageId(newPageId);
    setActiveThemeId(newThemeId); // Set the new theme as active
  }, [projects]);

  const deleteProject = useCallback((projectId: string) => {
    const projectToDelete = projects.find(p => p.id === projectId);
    if (!projectToDelete) return;

    // If cloud or template project, unregister from backend
    if ((projectToDelete.isCloud || projectToDelete.isTemplate) && authSessionRef.current) {
      unregisterCloudProject(projectId, authSessionRef.current.accessToken).catch(e => {
        console.log(`Failed to unregister cloud/template project ${projectId}: ${e}`);
      });
      // Clean up sync timestamp so reconciliation doesn't skip re-adding if undone
      delete lastSyncedAtMapRef.current[projectId];
      // Remove from dirty set so flushDirtyProjects doesn't try to re-upload
      removeDirty(projectId);
    }

    // Collect node IDs belonging to this project for advancedLogic cleanup
    const projectNodeIds = new Set(allNodes.filter(n => n.projectId === projectId).map(n => n.id));

    setAllNodes(prev => prev.filter(n => n.projectId !== projectId));
    setGroups(prev => prev.filter(g => g.projectId !== projectId));
    setTokens(prev => prev.filter(t => t.projectId !== projectId));
    setPages(prev => prev.filter(p => p.projectId !== projectId));
    setThemes(prev => prev.filter(t => t.projectId !== projectId));
    setCanvasStates(prev => prev.filter(cs => cs.projectId !== projectId));

    // Clean up advancedLogic entries for deleted project's nodes
    if (projectNodeIds.size > 0) {
      setAdvancedLogic(prev => {
        const filtered = prev.filter(l => !projectNodeIds.has(l.nodeId));
        return filtered.length === prev.length ? prev : filtered;
      });
    }

    if (activeProjectId === projectId) {
      const remainingProjects = projects.filter(p => p.id !== projectId);
      if (remainingProjects.length > 0) {
        setActiveProjectId(remainingProjects[0].id);
      } else {
        // Create a new default project if no projects remain
        const newProjectId = `project-${Date.now()}`;
        const newProject: Project = {
          id: newProjectId,
          name: 'Untitled Project',
          isExpanded: true,
          folderColor: Math.floor(Math.random() * 360),
        };
        setProjects([newProject]);
        setActiveProjectId(newProjectId);
        const newCanvasState: CanvasState = {
          projectId: newProjectId,
          offset: { x: 0, y: 0 },
          zoom: 1
        };
        setCanvasStates([newCanvasState]);
        return;
      }
    }

    setProjects(prev => prev.filter(p => p.id !== projectId));
  }, [projects, activeProjectId]);

  const duplicateProject = useCallback((projectId: string) => {
    const projectToDuplicate = projects.find(p => p.id === projectId);
    if (!projectToDuplicate) return;

    const timestamp = Date.now();
    const newProjectId = `project-${timestamp}`;
    
    // ── Determine if duplicate should be cloud ──
    // Cloud projects duplicate as cloud by default; fall back to local only when limit is reached.
    let duplicateAsCloud = false;
    if (projectToDuplicate.isCloud && !projectToDuplicate.isTemplate) {
      const isAdmin = authSessionRef.current?.isAdmin;
      const existingCloudCount = projects.filter(p => p.isCloud && !p.isTemplate).length;
      if (isAdmin || existingCloudCount < 2) {
        duplicateAsCloud = true;
      } else {
        toast.info('Cloud project limit reached — duplicating as local project instead');
      }
    }

    // Create new project
    const newProject: TokenProject = {
      id: newProjectId,
      name: `${projectToDuplicate.name} (Copy)`,
      isExpanded: true,
      isSample: false,
      folderColor: Math.floor(Math.random() * 360),
      isCloud: duplicateAsCloud,
    };

    // ── Build ALL ID remapping tables ──

    // 1. Page ID map
    const projectPages = pages.filter(p => p.projectId === projectId);
    const pageIdMap = new Map<string, string>();
    projectPages.forEach((page, i) => {
      pageIdMap.set(page.id, `page-${timestamp}-${i}`);
    });

    // 2. Theme ID map
    const projectThemes = themes.filter(t => t.projectId === projectId);
    const themeIdMap = new Map<string, string>();
    projectThemes.forEach((theme, i) => {
      themeIdMap.set(theme.id, `theme-${timestamp}-${i}`);
    });

    // 3. Node ID map
    const projectNodes = allNodes.filter(n => n.projectId === projectId);
    const oldToNewIdMap = new Map<string, string>();
    projectNodes.forEach(node => {
      oldToNewIdMap.set(node.id, `node-${timestamp}-${node.id}`);
    });

    // 4. Group ID map
    const projectGroups = groups.filter(g => g.projectId === projectId);
    const groupIdMap = new Map<string, string>();
    projectGroups.forEach(group => {
      groupIdMap.set(group.id, `group-${timestamp}-${group.id}`);
    });

    // 5. Token ID map
    const projectTokens = tokens.filter(t => t.projectId === projectId);
    const tokenIdMap = new Map<string, string>();
    projectTokens.forEach((token, i) => {
      tokenIdMap.set(token.id, `token-${timestamp}-${i}`);
    });

    // ── Helper: remap theme-keyed dictionaries ──
    const remapThemeKeys = <T,>(dict: Record<string, T> | undefined): Record<string, T> | undefined => {
      if (!dict) return dict;
      const remapped: Record<string, T> = {};
      for (const [oldThemeId, value] of Object.entries(dict)) {
        const newThemeId = themeIdMap.get(oldThemeId) || oldThemeId;
        remapped[newThemeId] = value;
      }
      return remapped;
    };

    // ── Helper: remap token IDs in a string[] array ──
    const remapTokenIdArray = (arr: string[]): string[] =>
      arr.map(tid => tokenIdMap.get(tid) || tid);

    // ── Helper: remap theme-keyed token assignment dicts ──
    const remapTokenAssignments = (
      assignments: { [themeId: string]: string[] } | undefined
    ): { [themeId: string]: string[] } | undefined => {
      if (!assignments) return assignments;
      const remapped: { [themeId: string]: string[] } = {};
      for (const [oldThemeId, tokenIds] of Object.entries(assignments)) {
        const newThemeId = themeIdMap.get(oldThemeId) || oldThemeId;
        remapped[newThemeId] = remapTokenIdArray(tokenIds);
      }
      return remapped;
    };

    // ── Helper: remap theme-keyed single-value token assignments ──
    const remapValueTokenAssignments = (
      assignments: { [themeId: string]: string } | undefined
    ): { [themeId: string]: string } | undefined => {
      if (!assignments) return assignments;
      const remapped: { [themeId: string]: string } = {};
      for (const [oldThemeId, tokenId] of Object.entries(assignments)) {
        const newThemeId = themeIdMap.get(oldThemeId) || oldThemeId;
        remapped[newThemeId] = tokenIdMap.get(tokenId) || tokenId;
      }
      return remapped;
    };

    // ── Duplicate pages ──
    const newPages: Page[] = projectPages.map((page, i) => ({
      ...page,
      id: pageIdMap.get(page.id)!,
      projectId: newProjectId,
      createdAt: timestamp + i,
    }));

    // ── Duplicate themes ──
    const newThemes: Theme[] = projectThemes.map((theme, index) => ({
      ...theme,
      id: themeIdMap.get(theme.id)!,
      projectId: newProjectId,
      createdAt: timestamp + index,
    }));

    // ── Duplicate groups (remap pageId, paletteNodeId) ──
    const newGroups: TokenGroup[] = projectGroups.map(group => ({
      ...group,
      id: groupIdMap.get(group.id)!,
      projectId: newProjectId,
      pageId: pageIdMap.get(group.pageId) || group.pageId,
      paletteNodeId: group.paletteNodeId ? oldToNewIdMap.get(group.paletteNodeId) || group.paletteNodeId : undefined,
    }));

    // ── Duplicate tokens (remap groupId, pageId, themeValues keys) ──
    const newTokens: DesignToken[] = projectTokens.map((token, index) => ({
      ...token,
      id: tokenIdMap.get(token.id)!,
      projectId: newProjectId,
      pageId: pageIdMap.get(token.pageId) || token.pageId,
      groupId: token.groupId ? groupIdMap.get(token.groupId) || null : null,
      themeValues: remapThemeKeys(token.themeValues),
      themeVisibility: remapThemeKeys(token.themeVisibility) as Record<string, boolean> | undefined,
    }));

    // ── Duplicate nodes (remap ALL cross-references) ──
    const newNodes: ColorNode[] = projectNodes.map(node => ({
      ...node,
      id: oldToNewIdMap.get(node.id)!,
      projectId: newProjectId,
      pageId: pageIdMap.get(node.pageId) || node.pageId,
      parentId: node.parentId ? oldToNewIdMap.get(node.parentId) || null : null,
      // Token assignments (theme → token ID[])
      tokenAssignments: remapTokenAssignments(node.tokenAssignments),
      tokenIds: node.tokenIds ? remapTokenIdArray(node.tokenIds) : node.tokenIds,
      tokenId: node.tokenId ? tokenIdMap.get(node.tokenId) || node.tokenId : node.tokenId,
      // Token node references
      ownTokenId: node.ownTokenId ? tokenIdMap.get(node.ownTokenId) || node.ownTokenId : node.ownTokenId,
      valueTokenId: node.valueTokenId ? tokenIdMap.get(node.valueTokenId) || node.valueTokenId : node.valueTokenId,
      valueTokenAssignments: remapValueTokenAssignments(node.valueTokenAssignments),
      tokenGroupId: node.tokenGroupId ? groupIdMap.get(node.tokenGroupId) || node.tokenGroupId : node.tokenGroupId,
      // Auto-assign references
      autoAssignGroupId: node.autoAssignGroupId ? groupIdMap.get(node.autoAssignGroupId) || node.autoAssignGroupId : node.autoAssignGroupId,
      autoAssignedTokenId: node.autoAssignedTokenId ? tokenIdMap.get(node.autoAssignedTokenId) || node.autoAssignedTokenId : node.autoAssignedTokenId,
      // Theme-specific overrides (remap theme keys)
      themeOverrides: remapThemeKeys(node.themeOverrides) as ColorNode['themeOverrides'],
      themeVisibility: remapThemeKeys(node.themeVisibility) as Record<string, boolean> | undefined,
    }));

    // ── Duplicate canvas states (one per page) ���─
    const projectCanvasStatesAll = canvasStates.filter(cs => cs.projectId === projectId);
    const newCanvasStates: CanvasState[] = projectCanvasStatesAll.length > 0
      ? projectCanvasStatesAll.map(cs => ({
          ...cs,
          projectId: newProjectId,
          pageId: pageIdMap.get(cs.pageId) || cs.pageId,
        }))
      : [{ projectId: newProjectId, pageId: newPages[0]?.id || 'page-1', pan: { x: 0, y: 0 }, zoom: 1 }];

    // ── Duplicate advancedLogic entries (remap nodeId and token refs in expressions) ──
    const projectLogicEntries = advancedLogic.filter(l => oldToNewIdMap.has(l.nodeId));
    const remapExpressionTokens = (exprTokens: ExpressionToken[]): ExpressionToken[] =>
      exprTokens.map(et => ({
        ...et,
        refNodeId: et.refNodeId ? oldToNewIdMap.get(et.refNodeId) || et.refNodeId : et.refNodeId,
        refTokenId: et.refTokenId ? tokenIdMap.get(et.refTokenId) || et.refTokenId : et.refTokenId,
      }));
    const remapConditionRows = (rows: ConditionRow[]): ConditionRow[] =>
      rows.map(row => ({
        ...row,
        id: `${row.id}-dup-${timestamp}`,
        tokens: remapExpressionTokens(row.tokens),
      }));
    const remapChannelDict = (channels: Record<string, ChannelLogic>): Record<string, ChannelLogic> =>
      Object.fromEntries(
        Object.entries(channels).map(([key, ch]) => [key, { ...ch, rows: remapConditionRows(ch.rows) }])
      );
    const remapTokenAssignmentLogic = (ta: TokenAssignmentLogic): TokenAssignmentLogic => ({
      ...ta,
      rows: remapConditionRows(ta.rows),
      fallbackTokenId: ta.fallbackTokenId ? tokenIdMap.get(ta.fallbackTokenId) || ta.fallbackTokenId : ta.fallbackTokenId,
    });
    const newLogicEntries: NodeAdvancedLogic[] = projectLogicEntries.map(entry => ({
      ...entry,
      nodeId: oldToNewIdMap.get(entry.nodeId)!,
      channels: remapChannelDict(entry.channels),
      tokenAssignment: entry.tokenAssignment ? remapTokenAssignmentLogic(entry.tokenAssignment) : entry.tokenAssignment,
      // Duplicate theme-specific overrides with remapped theme keys and expression refs
      themeChannels: entry.themeChannels ? Object.fromEntries(
        Object.entries(entry.themeChannels).map(([tid, ch]) => [themeIdMap.get(tid) || tid, remapChannelDict(ch)])
      ) : undefined,
      themeBaseValues: entry.themeBaseValues ? remapThemeKeys(entry.themeBaseValues) as { [themeId: string]: Record<string, number> } : undefined,
      themeTokenAssignment: entry.themeTokenAssignment ? Object.fromEntries(
        Object.entries(entry.themeTokenAssignment).map(([tid, ta]) => [themeIdMap.get(tid) || tid, remapTokenAssignmentLogic(ta)])
      ) : undefined,
    }));

    setProjects(prev => [...prev, newProject]);
    setPages(prev => [...prev, ...newPages]);
    setAllNodes(prev => [...prev, ...newNodes]);
    setGroups(prev => [...prev, ...newGroups]);
    setTokens(prev => [...prev, ...newTokens]);
    setThemes(prev => [...prev, ...newThemes]);
    setCanvasStates(prev => [...prev, ...newCanvasStates]);
    if (newLogicEntries.length > 0) {
      setAdvancedLogic(prev => [...prev, ...newLogicEntries]);
    }
    
    // Highlight the duplicated project without switching to it
    setHighlightedProjectId(newProjectId);
    setTimeout(() => setHighlightedProjectId(null), 3000);

    // ── Register with cloud backend if duplicating as cloud ──
    if (duplicateAsCloud && authSessionRef.current) {
      registerCloudProject(newProjectId, authSessionRef.current.accessToken).then(result => {
        if (!result.ok) {
          console.log(`☁️ Cloud registration failed for duplicate: ${result.error}`);
          toast.error(`Failed to register cloud project: ${result.error}`);
          // Fall back to local on server-side rejection
          setProjects(prev => prev.map(p => p.id === newProjectId ? { ...p, isCloud: false } : p));
        } else {
          markDirty(newProjectId);
        }
      });
    }
  }, [projects, allNodes, groups, tokens, themes, canvasStates, pages, advancedLogic]);

  const handleSelectProject = useCallback((projectId: string) => {
    // Save current theme's selection before switching projects
    themeSelectionsRef.current[activeThemeIdRef.current] = {
      selectedNodeId: selectedNodeIdRef.current,
      selectedNodeIds: [...selectedNodeIdsRef.current],
    };

    // ── CRITICAL: Flush dirty projects to cloud before switching ──
    // Prevents data loss when the user switches between projects.
    if (hasDirtyProjects() && authSessionRef.current) {
      console.log('☁️ [SelectProject] Flushing dirty projects before switching…');
      forceSyncNow().catch((e) => console.log('☁️ [SelectProject] Flush failed (will retry):', e));
    }

    setActiveProjectId(projectId);
    
    // Switch to the first page of the selected project
    const projectPages = pages.filter(p => p.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
    if (projectPages.length > 0) {
      setActivePageId(projectPages[0].id);
    }
    
    // Switch to the primary theme of the selected project
    const projectThemes = themes.filter(t => t.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
    const primaryTheme = projectThemes.find(t => t.isPrimary) || projectThemes[0];
    if (primaryTheme) {
      // Restore selection for the target project's theme, or clear
      const savedSelection = themeSelectionsRef.current[primaryTheme.id];
      if (savedSelection) {
        setSelectedNodeId(savedSelection.selectedNodeId);
        setSelectedNodeIds(savedSelection.selectedNodeIds);
      } else {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
      }
      setActiveThemeId(primaryTheme.id);
    } else {
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    }
    
    setViewingProjects(false);
  }, [pages, themes]);

  const handleCreateProject = useCallback((type: 'local' | 'cloud' | 'template' = 'local') => {
    addProject(type);
    setViewingProjects(false);
  }, [addProject]);

  // ── Dev Mode Handlers ──────────────────────────────────────────

  const handleDevModeRun = useCallback(async () => {
    const config = devConfigs[activeProjectId];
    if (!config) {
      toast.error('No Dev Mode config found for this project');
      return;
    }

    try {
      // Get project tokens and nodes for the active project
      const projectTokens = tokens.filter(t => t.projectId === activeProjectId);
      const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);
      const projectGroups = groups.filter(g => g.projectId === activeProjectId);
      const projectThemes = themes.filter(t => t.projectId === activeProjectId);
      const primaryTheme = projectThemes.find(t => t.isPrimary);
      const primaryThemeId = primaryTheme?.id || activeThemeId;

      // Generate output for each target theme
      const themesToExport = config.outputTheme 
        ? projectThemes.filter(t => t.id === config.outputTheme)
        : projectThemes;

      const outputs: Record<string, string> = {};
      for (const theme of themesToExport) {
        let output = '';
        const themeId = theme.id;
        switch (config.outputFormat) {
          case 'css':
            output = generateCSSVariables(projectTokens, projectGroups, projectNodes, themeId, undefined, primaryThemeId, projectTokens, projectNodes, advancedLogic);
            break;
          case 'dtcg':
            output = generateDTCGJSON(projectTokens, projectGroups, projectNodes, themeId, undefined, primaryThemeId, projectTokens, projectNodes, advancedLogic);
            break;
          case 'tailwind':
            output = generateTailwindConfig(projectTokens, projectGroups, projectNodes, themeId, undefined, primaryThemeId, projectTokens, projectNodes, advancedLogic);
            break;
          case 'figma':
            output = generateFigmaVariablesJSON(projectTokens, projectGroups, projectNodes, projects.find(p => p.id === activeProjectId)?.name || 'Design Tokens', themeId, primaryThemeId, projectTokens, projectNodes, advancedLogic);
            break;
        }
        outputs[theme.name || theme.id] = output;
      }

      // Combine outputs (if multiple themes, join with separator)
      const combinedOutput = Object.entries(outputs).length === 1
        ? Object.values(outputs)[0]
        : Object.entries(outputs).map(([name, out]) => `/* Theme: ${name} */\n${out}`).join('\n\n');

      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      if (!authToken) {
        toast.error('Not authenticated. Sign in to use Dev Mode.');
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
        'X-User-Token': authToken,
      };

      let hasError = false;

      // 1. Save cached output for Pull API
      if (config.pullApiEnabled) {
        try {
          await fetch(`${SERVER_BASE}/dev/save-output`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ projectId: activeProjectId, format: config.outputFormat, output: combinedOutput }),
          });
        } catch (e: any) {
          console.error('[DevMode] Save output error:', e);
        }
      }

      // 2. Push to GitHub
      if (config.githubEnabled && config.githubRepo && config.githubPath && config.githubPATEncrypted) {
        try {
          // Decrypt PAT client-side before sending to server proxy
          const userId = authSession?.userId;
          let plainPAT = '';
          if (userId) {
            plainPAT = await decryptPAT(config.githubPATEncrypted, userId);
          }
          if (!plainPAT) {
            hasError = true;
            console.error('[DevMode] Failed to decrypt GitHub PAT — re-enter your token');
            toast.error('Failed to decrypt GitHub PAT. Please re-enter your token.');
          } else {
          const res = await fetch(`${SERVER_BASE}/dev/github-push`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              repo: config.githubRepo,
              path: config.githubPath,
              branch: config.githubBranch || 'main',
              content: combinedOutput,
              commitMessage: `Update tokens via 0colors [${config.outputFormat}]`,
              pat: plainPAT,
            }),
          });
          const result = await res.json();
          if (!result.ok) {
            hasError = true;
            console.error('[DevMode] GitHub push failed:', result);
          }
          } // close else (plainPAT ok)
        } catch (e: any) {
          hasError = true;
          console.error('[DevMode] GitHub push error:', e);
        }
      }

      // 3. Push to webhook output
      if (config.webhookOutputEnabled && config.webhookOutputUrl) {
        try {
          const res = await fetch(`${SERVER_BASE}/dev/webhook-push`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              url: config.webhookOutputUrl,
              payload: { format: config.outputFormat, tokens: combinedOutput, timestamp: Date.now(), projectId: activeProjectId },
              headers: config.webhookOutputHeaders,
            }),
          });
          const result = await res.json();
          if (!result.ok) {
            hasError = true;
            console.error('[DevMode] Webhook push failed:', result);
          }
        } catch (e: any) {
          hasError = true;
          console.error('[DevMode] Webhook push error:', e);
        }
      }

      // Update run metadata
      updateDevConfig({
        ...config,
        lastRunAt: Date.now(),
        lastRunStatus: hasError ? 'error' : 'success',
        lastRunError: hasError ? 'One or more destinations failed. Check console.' : null,
      });

      if (hasError) {
        toast.error('Pipeline completed with errors');
      } else {
        const destinations = [
          config.pullApiEnabled && 'Pull API',
          config.githubEnabled && 'GitHub',
          config.webhookOutputEnabled && 'Webhook',
        ].filter(Boolean);
        toast.success(`Tokens pushed to ${destinations.join(', ') || 'cache'}`);
      }
    } catch (e: any) {
      console.error('[DevMode] Run error:', e);
      toast.error(`Dev Mode run failed: ${e?.message}`);
      updateDevConfig({
        ...devConfigs[activeProjectId],
        lastRunAt: Date.now(),
        lastRunStatus: 'error',
        lastRunError: e?.message || 'Unknown error',
      });
    }
  }, [devConfigs, activeProjectId, tokens, allNodes, groups, themes, activeThemeId, advancedLogic, projects, updateDevConfig, authSession]);

  const handleDevModeTestWebhook = useCallback(async () => {
    const config = devConfigs[activeProjectId];
    if (!config?.webhookEnabled) {
      toast.error('Enable webhook input first');
      return;
    }
    if (!config.webhookTargetNodeId) {
      toast.error('Select a target node first');
      return;
    }

    // Send a test webhook with a sample value
    try {
      const res = await fetch(`${SERVER_BASE}/webhook/${activeProjectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': config.webhookSecret,
        },
        body: JSON.stringify({ value: '#FF5500', format: 'hex' }),
      });
      const result = await res.json();
      if (result.ok) {
        toast.success('Test webhook sent successfully');
      } else {
        toast.error(`Test failed: ${result.error}`);
      }
    } catch (e: any) {
      toast.error(`Test webhook error: ${e?.message}`);
    }
  }, [devConfigs, activeProjectId]);

  const handleBackToProjects = useCallback(() => {
    // ── CRITICAL: Flush dirty cloud projects to server before leaving the project ──
    // This ensures the user's local changes are uploaded to cloud immediately
    // when they navigate away, preventing data loss on subsequent reconcile.
    if (hasDirtyProjects() && authSessionRef.current) {
      console.log('☁️ [BackToProjects] Flushing dirty projects before navigating away…');
      forceSyncNow().catch((e) => console.log('☁️ [BackToProjects] Flush failed (will retry):', e));
    }

    setViewingProjects(true);
    setViewMode('canvas');
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }, []);

  // Page management functions
  const handleCreatePage = useCallback(() => {
    const timestamp = Date.now();
    const newPageId = `page-${timestamp}`;
    const projectPages = pages.filter(p => p.projectId === activeProjectId);
    const newPageName = `Page ${projectPages.length + 1}`;
    
    const newPage: Page = {
      id: newPageId,
      name: newPageName,
      projectId: activeProjectId,
      createdAt: timestamp,
    };
    
    setPages(prev => [...prev, newPage]);
    
    // Create canvas state for the new page
    const newCanvasState: CanvasState = {
      projectId: activeProjectId,
      pageId: newPageId,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };
    setCanvasStates(prev => [...prev, newCanvasState]);
    
    // Switch to the new page
    setActivePageId(newPageId);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }, [pages, activeProjectId]);

  const handleSwitchPage = useCallback((pageId: string) => {
    setActivePageId(pageId);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }, []);

  const handleRenamePage = useCallback((pageId: string, newName: string) => {
    setPages(prev => prev.map(p => 
      p.id === pageId ? { ...p, name: newName } : p
    ));
  }, []);

  const handleDeletePage = useCallback((pageId: string) => {
    const projectPages = pages.filter(p => p.projectId === activeProjectId);
    
    // Don't allow deleting the last page
    if (projectPages.length <= 1) {
      alert('Cannot delete the last page');
      return;
    }
    
    // Collect node IDs belonging to this page for advancedLogic cleanup
    const pageNodeIds = new Set(allNodes.filter(n => n.pageId === pageId).map(n => n.id));

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
    if (pageId === activePageId) {
      const remainingPages = projectPages.filter(p => p.id !== pageId);
      if (remainingPages.length > 0) {
        setActivePageId(remainingPages[0].id);
      }
    }
  }, [pages, activeProjectId, activePageId]);

  // Theme management functions
  const handleCreateTheme = useCallback(() => {
    const timestamp = Date.now();
    const newThemeId = `theme-${timestamp}`;
    const projectThemes = themes.filter(t => t.projectId === activeProjectId);
    const newThemeName = `Theme ${projectThemes.length + 1}`;
    
    // Find the primary theme to duplicate from
    const primaryTheme = themes.find(t => t.projectId === activeProjectId && t.isPrimary);
    const primaryThemeId = primaryTheme?.id;
    
    const newTheme: Theme = {
      id: newThemeId,
      name: newThemeName,
      projectId: activeProjectId,
      createdAt: timestamp,
    };
    
    setThemes(prev => [...prev, newTheme]);
    
    // Initialize themeValues for existing tokens based on assigned nodes
    setTokens(prev => prev.map(token => {
      if (token.projectId === activeProjectId && token.pageId === activePageId) {
        // Initialize themeValues if it doesn't exist
        const themeValues = token.themeValues || {};
        
        // Find the node that has this token assigned in the primary theme
        const assignedNode = allNodes.find(node => {
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
          const sourceThemeId = primaryThemeId || activeThemeId;
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
        if (node.projectId === activeProjectId) {
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
    themeSelectionsRef.current[activeThemeIdRef.current] = {
      selectedNodeId: selectedNodeIdRef.current,
      selectedNodeIds: [...selectedNodeIdsRef.current],
    };
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setActiveThemeId(newThemeId);
  }, [themes, activeProjectId, tokens, activePageId, activeThemeId, allNodes]);

  const handleSwitchTheme = useCallback((themeId: string) => {
    // Save the current theme's selection state before switching
    const currentThemeId = activeThemeIdRef.current;
    themeSelectionsRef.current[currentThemeId] = {
      selectedNodeId: selectedNodeIdRef.current,
      selectedNodeIds: [...selectedNodeIdsRef.current],
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
    const targetTheme = themes.find(t => t.id === themeId);
    const isTargetPrimary = targetTheme?.isPrimary ?? true;
    setTokens(prevTokens => {
      return prevTokens.map(token => {
        // Find the node that has this token assigned in the new theme
        const assignedNode = allNodes.find(node => {
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
  }, [allNodes, themes]);

  // Keep the ref in sync so the keyboard-shortcut useEffect (declared earlier) can call it
  handleSwitchThemeRef.current = handleSwitchTheme;

  const handleRenameTheme = useCallback((themeId: string, newName: string) => {
    setThemes(prev => prev.map(t => 
      t.id === themeId ? { ...t, name: newName } : t
    ));
  }, []);

  const handleDeleteTheme = useCallback((themeId: string) => {
    const projectThemes = themes.filter(t => t.projectId === activeProjectId);
    const themeToDelete = themes.find(t => t.id === themeId);
    
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
    if (themeId === activeThemeId) {
      const remainingThemes = projectThemes.filter(t => t.id !== themeId);
      if (remainingThemes.length > 0) {
        // Clear current selection when forced to switch themes due to deletion
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        setActiveThemeId(remainingThemes[0].id);
      }
    }
  }, [themes, activeProjectId, activeThemeId]);

  const startEditingProject = (projectId: string, currentName: string) => {
    setEditingProjectId(projectId);
    setEditingProjectName(currentName);
  };

  const saveProjectName = () => {
    if (!editingProjectId || !editingProjectName.trim()) {
      setEditingProjectId(null);
      return;
    }

    const updatedProjects = projects.map(p =>
      p.id === editingProjectId
        ? { ...p, name: editingProjectName.trim() }
        : p
    );
    setProjects(updatedProjects);
    setEditingProjectId(null);
  };

  const cancelEditingProject = () => {
    setEditingProjectId(null);
    setEditingProjectName('');
  };

  const resetToDefaults = useCallback(() => {
    if (confirm('Are you sure you want to reset to default data? This will clear all your nodes and tokens.')) {
      flushUndo(); // commit any pending undo batch before reset
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(GROUP_EXPAND_KEY);
      localStorage.removeItem('advanced-logic-v1');
      localStorage.removeItem('advanced-popup-state-v1');
      localStorage.removeItem('0colors-computed-tokens');
      computedTokensRef.current = {};
      const defaultData = getDefaultData();
      setAllNodes(defaultData.nodes);
      setTokens(defaultData.tokens);
      setGroups(defaultData.groups);
      setProjects(defaultData.projects);
      setPages(defaultData.pages);
      setCanvasStates(defaultData.canvasStates);
      setActiveProjectId(defaultData.activeProjectId);
      setActivePageId(defaultData.activePageId);
      setActiveThemeId(defaultData.activeThemeId);
      setThemes(defaultData.themes);
      setAdvancedLogic([]);
    }
  }, [flushUndo]);

  // Auth gate — show auth page if still checking or not authenticated and user hasn't skipped
  if (authChecking) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#555] text-[13px]">Loading…</div>
      </div>
    );
  }

  if (!authSession && !authSkipped) {
    return <AuthPage onAuth={handleAuth} onSkip={handleSkipAuth} />;
  }

  // If viewing projects page, show that instead of the app
  if (viewingProjects) {
    return (
      <>
        <ProjectsPage
          projects={projects}
          allNodes={allNodes}
          tokens={tokens}
          collections={[]} // Using empty array as we don't have separate collections
          groups={groups}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onDuplicateProject={duplicateProject}
          onDeleteProject={deleteProject}
          onImportProject={importProjectJSON}
          onExportProject={exportProjectJSON}
          highlightedProjectId={highlightedProjectId}
          isAuthenticated={!!authSession}
          isAdmin={!!authSession?.isAdmin}
          isTemplateAdmin={!!authSession?.isTemplateAdmin}
          userEmail={authSession?.email}
          onSignOut={handleSignOut}
          cloudSyncStatus={cloudSyncStatus}
          
          
          onForceCloudRefresh={handleForceCloudRefresh}
          onOpenAISettings={() => setShowAISettingsPopup(true)}
        />
        {showAISettingsPopup && (
          <AISettingsPopup
            onClose={() => setShowAISettingsPopup(false)}
            onSettingsSaved={handleAISettingsSaved}
            projectContext={aiProjectContext}
          />
        )}
      </>
    );
  }

  return (
    <div className="h-screen flex bg-[#000] p-2 gap-2 overflow-hidden">
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: 'rgba(26, 26, 26, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #2a2a2a',
            color: '#ededed',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
            borderRadius: '8px',
            fontSize: '13px',
          },
        }}
      />
      {/* TokensPanel - Floating Island */}
      <TokensPanel 
        tokens={pageTokens} 
        nodes={nodes}
        allProjectTokens={allProjectTokens}
        allProjectNodes={allProjectNodes}
        projects={projects}
        pages={pages}
        groups={groups}
        activeProjectId={activeProjectId}
        activePageId={activePageId}
        activeThemeId={activeThemeId}
        isPrimaryTheme={isViewingPrimaryTheme}
        primaryThemeId={primaryTheme?.id}
        showAllVisible={showAllVisible}
        onAddToken={addToken}
        onUpdateToken={updateToken}
        onDeleteToken={deleteToken}
        onUpdateProjects={setProjects}
        onUpdatePages={setPages}
        onUpdateGroups={setGroups}
        onExportProject={exportProjectJSON}
        onImportProject={importProjectJSON}
        onUpdateNode={updateNode}
        onDeleteNode={deleteNode}
        onNavigateToNode={(nodeId) => {
          setSelectedNodeId(nodeId);
          setSelectedNodeIds([nodeId]);
          // Dispatch event for ColorCanvas to handle navigation with animation
          const event = new CustomEvent('navigateToNode', { detail: { nodeId } });
          window.dispatchEvent(event);
        }}
        onNavigateToProjects={handleBackToProjects}
        advancedLogic={advancedLogic}
        cloudSyncStatus={effectiveCloudSyncStatus}
        lastSyncedAt={activeProjectLastSyncedAt}
        lastSyncError={lastSyncError}
        onManualSync={handleManualSync}
        dirtyCount={cloudDirtyCount}
        readOnly={false}
      />

      {/* Right Column - Header + Canvas as separate islands */}
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        {/* Top Bar - Floating Island */}
        <div className="shrink-0 relative bg-[#111] rounded-2xl px-4 h-14 flex items-center justify-between select-none">
          <>
          {/* Left: View Mode Switcher + Search */}
          <div className="flex items-center gap-3">
            {viewMode === 'export' ? (
              <button 
                onClick={() => setViewMode('canvas')}
                className="flex items-center gap-1.5 h-[28px] px-2.5 rounded-md text-[11px] text-[#555] hover:text-[#aaa] transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <>
                {/* View Switcher */}
                <div className="flex p-1 bg-[#111] border border-[#333] rounded-lg">
                  <Tip label="Canvas View" side="bottom">
                  <button 
                    onClick={() => setViewMode('canvas')}
                    className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                      viewMode === 'canvas' 
                        ? 'bg-[#333] text-[#ededed] shadow-sm' 
                        : 'text-[#666] hover:text-[#a1a1a1]'
                    }`}
                  >
                    <Workflow className="h-4 w-4" />
                  </button>
                  </Tip>
                  <Tip label="Code Preview" side="bottom">
                  <button 
                    onClick={() => setViewMode('code')}
                    className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                      viewMode === 'code' 
                        ? 'bg-[#333] text-[#ededed] shadow-sm' 
                        : 'text-[#666] hover:text-[#a1a1a1]'
                    }`}
                  >
                    <Code className="h-4 w-4" />
                  </button>
                  </Tip>
                </div>

                {/* Export button */}
                <Tip label="Export Tokens" side="bottom">
                  <button
                    onClick={() => setViewMode('export')}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-[#666] hover:text-[#a1a1a1] transition-all"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </Tip>
              </>
            )}
          </div>

          {/* Center: Page Selector */}
          {viewMode !== 'export' && (
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
               <div className="flex items-center h-9 px-1 gap-1 text-sm font-medium text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#1a1a1a] rounded-lg border border-transparent hover:border-[#333] transition-all">
                {/* Text Area - Handles Double Click for Rename */}
                <div 
                   className="px-2 h-full flex items-center cursor-default select-none max-w-[200px]"
                   onDoubleClick={(e) => {
                     e.stopPropagation();
                     const currentPage = pages.find(p => p.id === activePageId);
                     if (currentPage) {
                       setEditingPageId(activePageId);
                       setEditingPageName(currentPage.name);
                     }
                   }}
                >
                    {editingPageId === activePageId ? (
                       <input
                        value={editingPageName}
                        onChange={(e) => setEditingPageName(e.target.value)}
                        maxLength={32}
                        onBlur={() => {
                          if (editingPageName.trim() && editingPageName !== pages.find(p => p.id === activePageId)?.name) {
                            handleRenamePage(activePageId, editingPageName.trim());
                          }
                          setEditingPageId(null);
                          setEditingPageName('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (editingPageName.trim() && editingPageName !== pages.find(p => p.id === activePageId)?.name) {
                              handleRenamePage(activePageId, editingPageName.trim());
                            }
                            setEditingPageId(null);
                            setEditingPageName('');
                          } else if (e.key === 'Escape') {
                            setEditingPageId(null);
                            setEditingPageName('');
                          }
                        }}
                        className="bg-transparent border-none outline-none text-white w-24 p-0 h-auto font-medium text-center"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="truncate">
                        {pages.find(p => p.id === activePageId)?.name || 'Page'}
                      </span>
                    )}
                </div>

                {/* Dropdown Trigger - Only Icon */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-[#252525] text-[#666] hover:text-[#ededed] transition-colors outline-none cursor-pointer">
                      <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={8} className="w-64 bg-[#111] border-[#252525] p-1 shadow-xl z-[60] ml-[-60px]">
                    <div className="px-2 py-1.5 text-xs font-medium text-[#666] uppercase tracking-wider">
                      Pages
                    </div>
                    {pages
                      .filter(p => p.projectId === activeProjectId)
                      .sort((a, b) => a.createdAt - b.createdAt)
                      .map(page => (
                        <DropdownMenuItem
                          key={page.id}
                          onClick={() => {
                            if (editingPageId !== page.id) {
                              handleSwitchPage(page.id);
                            }
                          }}
                          className={`flex items-center justify-between px-2 py-2 rounded-md cursor-pointer transition-colors focus:bg-[#1a1a1a] focus:text-[#ededed] ${
                            activePageId === page.id 
                              ? 'bg-[#141820] text-[#ededed]' 
                              : 'text-[#878787]'
                          } group mb-0.5`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden flex-1">
                            {editingPageId === page.id ? (
                               <input
                                value={editingPageName}
                                onChange={(e) => setEditingPageName(e.target.value)}
                                maxLength={32}
                                onBlur={() => {
                                  if (editingPageName.trim() && editingPageName !== page.name) {
                                    handleRenamePage(page.id, editingPageName.trim());
                                  }
                                  setEditingPageId(null);
                                  setEditingPageName('');
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (editingPageName.trim() && editingPageName !== page.name) {
                                      handleRenamePage(page.id, editingPageName.trim());
                                    }
                                    setEditingPageId(null);
                                    setEditingPageName('');
                                  } else if (e.key === 'Escape') {
                                    setEditingPageId(null);
                                    setEditingPageName('');
                                  }
                                }}
                                className="bg-transparent border-none outline-none text-white w-full p-0 h-auto font-medium"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span 
                                className="truncate flex-1"
                                onDoubleClick={(e) => {
                                  if (isSampleMode) return;
                                  e.stopPropagation();
                                  setEditingPageId(page.id);
                                  setEditingPageName(page.name);
                                }}
                              >
                                {page.name}
                              </span>
                            )}
                          </div>
                          
                          {editingPageId !== page.id && (
                            <div className="flex items-center gap-1">
                               <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                 {pages.filter(p => p.projectId === activeProjectId).length > 1 && (
                                  <Tip label="Delete Page" side="right">
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`Delete page "${page.name}"? All nodes and tokens on this page will be deleted.`)) {
                                        handleDeletePage(page.id);
                                      }
                                    }}
                                    className="p-1 hover:bg-[#252525] rounded text-[#666] hover:text-[#e5484d] transition-colors"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </div>
                                  </Tip>
                                 )}
                               </div>
                            </div>
                          )}
                        </DropdownMenuItem>
                      ))}
                                            <div className="h-[1px] bg-[#252525] my-1" />
                      <DropdownMenuItem
                        onClick={handleCreatePage}
                        className="flex items-center gap-2 px-2 py-2 text-[#878787] focus:text-[#ededed] focus:bg-[#1a1a1a] rounded-md cursor-pointer"
                      >
                        <div className="w-5 h-5 flex items-center justify-center rounded border border-dashed border-[#333]">
                          <Plus className="h-3 w-3" />
                        </div>
                        <span>Add new page</span>
                      </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {viewMode === 'export' && (
             <div className="absolute left-1/2 transform -translate-x-1/2">
                <span className="text-[13px] text-[#777] tracking-wide">Multi-Page Token Export</span>
              </div>
          )}

          {/* Right: Theme Selector */}
          {viewMode !== 'export' && (
            <div className="flex items-center gap-1.5">
               {/* Table icon — independent from theme dropdown */}
               <Tip label="Token Overview Table" side="bottom">
               <button
                 onClick={() => setShowTokenTable(prev => !prev)}
                 className={`flex items-center gap-2 h-9 px-3 rounded-lg border transition-all cursor-pointer ${showTokenTable ? 'border-[#333] bg-[#1a1a1a] text-[#ededed]' : 'border-transparent hover:border-[#333] hover:bg-[#1a1a1a] text-[#999] hover:text-[#ededed]'}`}
               >
                 <Table className="h-4 w-4" />
                 <span className="text-[13px]">Token Table</span>
               </button>
               </Tip>
               {/* Dev Mode toggle — moved to bottom toolbar */}
               <div className="flex items-center h-9 px-1 gap-1 text-sm font-medium text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#1a1a1a] rounded-lg border border-transparent hover:border-[#333] transition-all">
                {/* Theme Name Area - Handles Double Click */}
                <div className="flex items-center px-2 h-full gap-2 cursor-default select-none max-w-[200px]">
                    {themes.find(t => t.id === activeThemeId)?.isPrimary ? (
                      <Crown className="h-3.5 w-3.5 text-yellow-500/80 fill-yellow-500/80 shrink-0" />
                    ) : (
                      <SwatchBook className="h-3.5 w-3.5 text-[#777] shrink-0" />
                    )}
                    
                    <div
                      className="flex items-center h-full overflow-hidden"
                      onDoubleClick={(e) => {
                          if (isSampleMode) return;
                          e.stopPropagation();
                          const currentTheme = themes.find(t => t.id === activeThemeId);
                          if (currentTheme) {
                            setEditingThemeId(activeThemeId);
                            setEditingThemeName(currentTheme.name);
                          }
                        }}
                    >
                      {editingThemeId === activeThemeId ? (
                         <input
                          value={editingThemeName}
                          onChange={(e) => setEditingThemeName(e.target.value)}
                          maxLength={32}
                          onBlur={() => {
                            if (editingThemeName.trim() && editingThemeName !== themes.find(t => t.id === activeThemeId)?.name) {
                              handleRenameTheme(activeThemeId, editingThemeName.trim());
                            }
                            setEditingThemeId(null);
                            setEditingThemeName('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingThemeName.trim() && editingThemeName !== themes.find(t => t.id === activeThemeId)?.name) {
                                handleRenameTheme(activeThemeId, editingThemeName.trim());
                              }
                              setEditingThemeId(null);
                              setEditingThemeName('');
                            } else if (e.key === 'Escape') {
                              setEditingThemeId(null);
                              setEditingThemeName('');
                            }
                          }}
                          className="bg-transparent border-none outline-none text-white w-24 p-0 h-auto font-medium"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="truncate">
                          {themes.find(t => t.id === activeThemeId)?.name || 'Theme'}
                        </span>
                      )}
                    </div>
                </div>

                {/* Dropdown Trigger - Only Icon */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-[#252525] text-[#666] hover:text-[#ededed] transition-colors outline-none cursor-pointer">
                      <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={8} className="w-64 bg-[#111] border-[#252525] p-1 shadow-xl z-[60]">
                    <div className="px-2 py-1.5 text-xs font-medium text-[#666] uppercase tracking-wider">
                      Themes
                    </div>
                    {themes
                      .filter(t => t.projectId === activeProjectId)
                      .sort((a, b) => a.createdAt - b.createdAt)
                      .map((theme, index) => (
                        <DropdownMenuItem
                          key={theme.id}
                          onClick={() => {
                            if (editingThemeId !== theme.id) {
                              handleSwitchTheme(theme.id);
                            }
                          }}
                          className={`flex items-center justify-between px-2 py-2 rounded-md cursor-pointer transition-colors focus:bg-[#1a1a1a] focus:text-[#ededed] ${
                            activeThemeId === theme.id 
                              ? 'bg-[#141820] text-[#ededed]' 
                              : 'text-[#878787]'
                          } group mb-0.5`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden flex-1">
                            {/* Primary Indicator (default theme is always primary — not switchable) */}
                            <div 
                              className="w-5 h-5 flex items-center justify-center flex-shrink-0"
                              title={theme.isPrimary ? "Primary Theme" : ""}
                            >
                              {theme.isPrimary ? (
                                <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                              ) : (
                                <SwatchBook className={`h-3.5 w-3.5 flex-shrink-0 ${
                                  activeThemeId === theme.id ? 'text-[#888]' : 'text-[#555]'
                                }`} />
                              )}
                            </div>
                            
                            {editingThemeId === theme.id ? (
                              <input
                                value={editingThemeName}
                                onChange={(e) => setEditingThemeName(e.target.value)}
                                maxLength={32}
                                onBlur={() => {
                                  if (editingThemeName.trim() && editingThemeName !== theme.name) {
                                    handleRenameTheme(theme.id, editingThemeName.trim());
                                  }
                                  setEditingThemeId(null);
                                  setEditingThemeName('');
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (editingThemeName.trim() && editingThemeName !== theme.name) {
                                      handleRenameTheme(theme.id, editingThemeName.trim());
                                    }
                                    setEditingThemeId(null);
                                    setEditingThemeName('');
                                  } else if (e.key === 'Escape') {
                                    setEditingThemeId(null);
                                    setEditingThemeName('');
                                  }
                                }}
                                className="bg-transparent border-none outline-none text-white w-full p-0 h-auto font-medium"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span 
                                className="truncate flex-1"
                                onDoubleClick={(e) => {
                                  if (isSampleMode) return;
                                  e.stopPropagation();
                                  setEditingThemeId(theme.id);
                                  setEditingThemeName(theme.name);
                                }}
                              >
                                {theme.name}
                              </span>
                            )}
                          </div>
                          
                          {editingThemeId !== theme.id && (
                            <div className="flex items-center gap-1">
                               <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {themes.filter(t => t.projectId === activeProjectId).length > 1 && !theme.isPrimary && (
                                    <Tip label="Delete Theme" side="left">
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`Delete theme "${theme.name}"? All theme-specific values will be removed.`)) {
                                          handleDeleteTheme(theme.id);
                                        }
                                      }}
                                      className="p-1 hover:bg-[#252525] rounded text-[#666] hover:text-[#e5484d] transition-colors"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </div>
                                    </Tip>
                                  )}
                               </div>
                               {index < 9 && (
                                 <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] text-[#555] bg-[#161616] border border-[#262626]" style={{ fontFamily: 'inherit' }}>
                                   {index + 1}
                                 </kbd>
                               )}
                            </div>
                          )}
                          {editingThemeId !== theme.id && index < 9 && (
                            <div className="flex items-center gap-1">
                               <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] text-[#555] bg-[#161616] border border-[#262626]" style={{ fontFamily: 'inherit' }}>
                                   {index + 1}
                               </kbd>
                            </div>
                          )}
                        </DropdownMenuItem>
                      ))}
                                            <div className="h-[1px] bg-[#252525] my-1" />
                       <DropdownMenuItem
                        onClick={handleCreateTheme}
                        className="flex items-center gap-2 px-2 py-2 text-[#878787] focus:text-[#ededed] focus:bg-[#1a1a1a] rounded-md cursor-pointer"
                      >
                        <div className="w-5 h-5 flex items-center justify-center rounded border border-dashed border-[#333]">
                          <Plus className="h-3 w-3" />
                        </div>
                        <span>Add new theme</span>
                      </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
          </>
        </div>

        {/* Canvas Area - Floating Island */}
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-[#000] min-h-0">

        
        {/* sample-mode dead code removed */}{false && (<div><DropdownMenu><DropdownMenuTrigger asChild><button>
                  <BookOpen className="h-3.5 w-3.5 text-[#22C55E]" />
                  <span className="text-[12px] max-w-[160px] truncate">
                    {sampleTemplates[activeSampleIdx]?.name || 'Template'}
                  </span>
                  {sampleTemplates.length > 1 && (
                    <span className="text-[10px] text-[#555] tabular-nums">{activeSampleIdx + 1}/{sampleTemplates.length}</span>
                  )}
                  <ChevronDown className="h-3 w-3 text-[#666]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-72 bg-[#111] border-[#252525] p-1 shadow-xl" style={{ zIndex: 100001 }}>
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#666] uppercase tracking-wider">Sample Templates</span>
                  <span className="text-[10px] text-[#555] tabular-nums">{sampleTemplates.length} template{sampleTemplates.length !== 1 ? 's' : ''}</span>
                </div>
                {sampleTemplates.length >= 5 && (
                  <div className="px-1.5 pb-1.5">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#555]" />
                      <input
                        className="w-full h-7 pl-7 pr-2 rounded-md bg-[#0a0a0a] border border-[#252525] text-[12px] text-[#ededed] placeholder:text-[#444] outline-none focus:border-[#333] transition-colors"
                        placeholder="Search templates…"
                        value={sampleTemplateSearch}
                        onChange={(e) => setSampleTemplateSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    </div>
                  </div>
                )}
                <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
                  {filteredSampleTemplates.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-[#555]">No templates match "{sampleTemplateSearch}"</div>
                  ) : (
                    filteredSampleTemplates.map((t) => (
                      <DropdownMenuItem
                        key={t.projectId}
                        onClick={() => handleSwitchSampleTemplate(t._origIdx)}
                        className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors focus:bg-[#1a1a1a] focus:text-[#ededed] ${
                          activeSampleIdx === t._origIdx
                            ? 'bg-[#141820] text-[#ededed]'
                            : 'text-[#878787]'
                        } mb-0.5`}
                      >
                        <BookOpen className={`h-3.5 w-3.5 shrink-0 ${activeSampleIdx === t._origIdx ? 'text-[#22C55E]' : ''}`} />
                        <span className="truncate flex-1">{t.name}</span>
                        {activeSampleIdx === t._origIdx && (
                          <span className="ml-auto text-[10px] text-[#22C55E] font-medium shrink-0">Active</span>
                        )}
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {false && (
          <div className={`absolute ${viewMode === 'canvas' && isViewingPrimaryTheme ? 'bottom-[5rem]' : 'bottom-6'} left-1/2 -translate-x-1/2 pointer-events-auto`} style={{ zIndex: 100000 }}>
            <div className="flex items-center gap-4 bg-[#111]/95 backdrop-blur-md border border-[#252525] rounded-full px-4 py-2 shadow-xl"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)' }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-5 h-5 rounded-md bg-[#22C55E]/10">
                  <Lock className="h-3 w-3 text-[#22C55E]" />
                </div>
                <span className="text-[12px] text-[#888] whitespace-nowrap">
                  You are viewing a read-only sample project
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20 hover:bg-[#22C55E]/20 text-[#22C55E] transition-all cursor-pointer text-[12px] font-medium">
                    <Copy className="h-3 w-3" />
                    <span>Duplicate</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-56 bg-[#111] border-[#252525] p-1 shadow-xl" style={{ zIndex: 100001 }}>
                  <div className="px-2 py-1.5 text-xs font-medium text-[#666] uppercase tracking-wider">
                    Duplicate as
                  </div>
                  {!!authSession && (
                    <DropdownMenuItem
                      onClick={() => handleDuplicateSampleProject('cloud')}
                      className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors text-[#ededed] focus:bg-[#1a1a1a] focus:text-[#ededed]"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-[#3B82F6]" />
                      <div className="flex flex-col">
                        <span className="text-[13px]">Cloud Project</span>
                        <span className="text-[11px] text-[#666]">Synced to Supabase</span>
                      </div>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => handleDuplicateSampleProject('local')}
                    className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors text-[#ededed] focus:bg-[#1a1a1a] focus:text-[#ededed]"
                  >
                    <Download className="h-3.5 w-3.5 text-[#A855F7]" />
                    <div className="flex flex-col">
                      <span className="text-[13px]">Local Project</span>
                      <span className="text-[11px] text-[#666]">Saved to browser storage</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {/* "Go back" prompt — shown after navigating to a node via Target icon (color or token node) */}
        {viewMode === 'canvas' && tokenNavBackState && (() => {
          const multiBarVisible = isViewingPrimaryTheme && selectedNodeIds.length > 1 && !multiSelectBarDelay;
          const restoreBarVisible = isViewingPrimaryTheme && !!pendingTokenRestore;
          let bottomClass = 'bottom-[5.5rem]';
          if (multiBarVisible && restoreBarVisible) bottomClass = 'bottom-[12rem]';
          else if (multiBarVisible || restoreBarVisible) bottomClass = 'bottom-[8.75rem]';
          return (
          <div
            className={`absolute ${bottomClass} left-0 right-0 flex items-center justify-center z-[52] pointer-events-none transition-[bottom] duration-300 ease-out`}
            style={{
              animation: goBackFading
                ? `goBackFadeOut ${GO_BACK_FADE_MS}ms ease-in forwards`
                : 'fadeSlideUp 0.25s ease-out',
            }}
          >
            <button
              className="pointer-events-auto group flex items-center gap-2.5 bg-[#1c1c1c] backdrop-blur-xl border border-[#ffffff]/[0.08] rounded-2xl pl-2.5 pr-4 h-11 shadow-lg hover:border-[#ffffff]/[0.14] hover:bg-[#222] transition-all duration-200 cursor-pointer whitespace-nowrap"
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset' }}
              onClick={handleTokenNavGoBack}
              onMouseEnter={handleGoBackMouseEnter}
              onMouseLeave={handleGoBackMouseLeave}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#0070f3]/15 shrink-0">
                <ArrowLeft size={13} className="text-[#0070f3]" />
              </div>
              <span className="text-[13px] text-[#999] group-hover:text-[#ccc] transition-colors">
                Go back
              </span>
            </button>
          </div>
          );
        })()}

        {/* Restore assigned tokens prompt — above the floating bottom bar (primary theme only) */}
        {viewMode === 'canvas' && isViewingPrimaryTheme && pendingTokenRestore && (() => {
          const multiBarVisible = isViewingPrimaryTheme && selectedNodeIds.length > 1 && !multiSelectBarDelay;
          return (
          <div className={`absolute ${multiBarVisible ? 'bottom-[8.75rem]' : 'bottom-[5.5rem]'} left-0 right-0 flex items-center justify-center z-[52] pointer-events-none transition-[bottom] duration-300 ease-out`}
            style={{ animation: 'fadeSlideUp 0.25s ease-out' }}
          >
            <button
              className="pointer-events-auto group flex items-center gap-2.5 bg-[#1c1c1c] backdrop-blur-xl border border-[#ffffff]/[0.08] rounded-2xl pl-2.5 pr-4 h-11 shadow-lg hover:border-[#ffffff]/[0.14] hover:bg-[#222] transition-all duration-200 cursor-pointer whitespace-nowrap"
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset' }}
              onClick={handleRestoreTokens}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#0070f3]/15 shrink-0">
                <RotateCw size={13} className="text-[#0070f3]" />
              </div>
              <span className="text-[13px] text-[#999] group-hover:text-[#ccc] transition-colors">
                Restore assigned tokens
              </span>
            </button>
          </div>
          );
        })()}

        {/* Multi-Selection Floating Toolbar — appears above the bottom bar when ≥2 nodes are multi-selected */}
        {viewMode === 'canvas' && isViewingPrimaryTheme && selectedNodeIds.length > 1 && !multiSelectBarDelay && (() => {
          const selectedNodes = allNodes.filter(n => selectedNodeIds.includes(n.id));
          const hiddenCount = selectedNodes.filter(n => isNodeHiddenInTheme(n, activeThemeId, primaryTheme?.id || '', allNodes)).length;
          const visibleCount = selectedNodes.length - hiddenCount;
          const allVisible = hiddenCount === 0;
          const allHidden = visibleCount === 0;
          const mixed = !allVisible && !allHidden;

          return (
            <div
              className="absolute bottom-[5.5rem] left-0 right-0 flex items-center justify-center z-[52] pointer-events-none"
              style={{ animation: 'fadeSlideUp 0.2s ease-out' }}
            >
              <div
                className="pointer-events-auto flex items-center bg-[#1c1c1c] backdrop-blur-xl border border-[#ffffff]/[0.08] rounded-2xl h-11 pl-1 pr-1 gap-0"
                style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset' }}
              >
                {/* Selection count label */}
                <span className="text-[13px] text-[#777] px-3 select-none tabular-nums whitespace-nowrap">
                  {selectedNodeIds.length} selected
                </span>

                {/* Divider */}
                <div className="w-px h-5 bg-[#ffffff]/[0.07]" />

                {/* Visibility toggle */}
                <Tip label={allVisible ? 'Hide Selected' : allHidden ? 'Show Selected' : 'Mixed Visibility'} side="top">
                  <button
                    className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${
                      mixed
                        ? 'text-[#444] cursor-not-allowed'
                        : allHidden
                          ? 'text-[#3B82F6] hover:bg-[#3B82F6]/10'
                          : 'text-[#777] hover:text-[#ccc] hover:bg-[#ffffff]/[0.05]'
                    }`}
                    disabled={mixed}
                    onClick={() => {
                      if (mixed) return;
                      setAllNodes(prev => prev.map(node => {
                        if (!selectedNodeIds.includes(node.id)) return node;
                        const vis = { ...(node.themeVisibility || {}) };
                        if (allVisible) {
                          vis[activeThemeId] = false;
                        } else {
                          delete vis[activeThemeId];
                        }
                        return { ...node, themeVisibility: Object.keys(vis).length > 0 ? vis : undefined };
                      }));
                    }}
                  >
                    {allHidden ? <EyeOff className="h-[16px] w-[16px]" /> : <Eye className="h-[16px] w-[16px]" />}
                  </button>
                </Tip>

                {/* Duplicate */}
                <Tip label="Duplicate" side="top">
                  <button
                    className="flex items-center justify-center h-9 w-9 rounded-xl text-[#777] hover:text-[#ccc] hover:bg-[#ffffff]/[0.05] transition-all"
                    onClick={() => {
                      if (selectedNodeIds.length > 1) {
                        duplicateNode(selectedNodeIds);
                      } else if (selectedNodeId) {
                        duplicateNode(selectedNodeId);
                      }
                    }}
                  >
                    <Copy className="h-[16px] w-[16px]" />
                  </button>
                </Tip>

                {/* Delete */}
                <Tip label="Delete" side="top">
                  <button
                    className="flex items-center justify-center h-9 w-9 rounded-xl text-[#777] hover:text-[#EF4444] hover:bg-[#EF4444]/[0.08] transition-all"
                    onClick={() => {
                      selectedNodeIds.forEach(nodeId => deleteNode(nodeId));
                      setSelectedNodeIds([]);
                      setSelectedNodeId(null);
                    }}
                  >
                    <Trash2 className="h-[16px] w-[16px]" />
                  </button>
                </Tip>
              </div>
            </div>
          );
        })()}

        {/* Non-Primary Theme Multi-Selection Floating Toolbar — visibility + inheritance toggles */}
        {viewMode === 'canvas' && !isViewingPrimaryTheme && selectedNodeIds.length > 1 && (() => {
          const selectedNodes = allNodes.filter(n => selectedNodeIds.includes(n.id));
          // Visibility state
          const hiddenCount = selectedNodes.filter(n => isNodeHiddenInTheme(n, activeThemeId, primaryTheme?.id || '', allNodes)).length;
          const visibleCount = selectedNodes.length - hiddenCount;
          const allVisible = hiddenCount === 0;
          const allHidden = visibleCount === 0;
          const mixedVisibility = !allVisible && !allHidden;

          // Inheritance state
          const inheritedCount = selectedNodes.filter(n => !n.themeOverrides || !n.themeOverrides[activeThemeId]).length;
          const notInheritedCount = selectedNodes.length - inheritedCount;
          const allInherited = notInheritedCount === 0;
          const allNotInherited = inheritedCount === 0;
          const mixedInheritance = !allInherited && !allNotInherited;

          return (
            <div
              className="absolute bottom-6 left-0 right-0 flex items-center justify-center z-[52] pointer-events-none"
              style={{ animation: 'fadeSlideUp 0.2s ease-out' }}
            >
              <div
                className="pointer-events-auto flex items-center bg-[#1c1c1c] backdrop-blur-xl border border-[#ffffff]/[0.08] rounded-2xl h-11 pl-1 pr-1 gap-0"
                style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset' }}
              >
                {/* Selection count label */}
                <span className="text-[13px] text-[#777] px-3 select-none tabular-nums whitespace-nowrap">
                  {selectedNodeIds.length} selected
                </span>

                {/* Divider */}
                <div className="w-px h-5 bg-[#ffffff]/[0.07]" />

                {/* Inheritance toggle */}
                <Tip label={allInherited ? 'Unlink all from primary' : allNotInherited ? 'Link all to primary' : 'Mixed inheritance'} side="top">
                  <div
                    className={`flex items-center gap-1.5 h-9 px-2 rounded-xl transition-all ${
                      mixedInheritance ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-[#ffffff]/[0.05]'
                    }`}
                  >
                    <Crown
                      className={`h-3 w-3 shrink-0 transition-all ${
                        mixedInheritance
                          ? 'text-[#555] fill-none'
                          : allInherited
                            ? 'text-yellow-500 fill-yellow-500'
                            : allNotInherited
                              ? 'text-[#3B82F6] fill-[#3B82F6]'
                              : 'text-[#555] fill-none'
                      }`}
                    />
                    <Switch
                      checked={allInherited}
                      disabled={mixedInheritance}
                      onCheckedChange={(checked) => {
                        if (mixedInheritance) return;
                        setAllNodes(prev => prev.map(node => {
                          if (!selectedNodeIds.includes(node.id)) return node;
                          if (checked) {
                            // Re-link: remove theme override for this theme
                            const newOverrides = { ...node.themeOverrides };
                            delete newOverrides[activeThemeId];
                            // Also clear theme-specific advanced logic
                            revertThemeAdvancedLogic(node.id, activeThemeId);
                            return {
                              ...node,
                              themeOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : undefined,
                            };
                          } else {
                            // Unlink: create theme override with current color values
                            const currentValues = {
                              hue: node.hue,
                              saturation: node.saturation,
                              lightness: node.lightness,
                              alpha: node.alpha,
                              red: node.red,
                              green: node.green,
                              blue: node.blue,
                              oklchL: node.oklchL,
                              oklchC: node.oklchC,
                              oklchH: node.oklchH,
                              hctH: node.hctH,
                              hctC: node.hctC,
                              hctT: node.hctT,
                              hexValue: node.hexValue,
                            };
                            return {
                              ...node,
                              themeOverrides: {
                                ...node.themeOverrides,
                                [activeThemeId]: currentValues,
                              },
                            };
                          }
                        }));
                      }}
                      className="data-[state=checked]:bg-[#EFB100] data-[state=unchecked]:bg-[#333] dark:data-[state=unchecked]:bg-[#333] h-[16px] w-[30px] shrink-0"
                    />
                  </div>
                </Tip>

                {/* Divider */}
                <div className="w-px h-5 bg-[#ffffff]/[0.07]" />

                {/* Visibility toggle */}
                <Tip label={allVisible ? 'Hide Selected' : allHidden ? 'Show Selected' : 'Mixed Visibility'} side="top">
                  <button
                    className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${
                      mixedVisibility
                        ? 'text-[#444] cursor-not-allowed'
                        : allHidden
                          ? 'text-[#3B82F6] hover:bg-[#3B82F6]/10'
                          : 'text-[#777] hover:text-[#ccc] hover:bg-[#ffffff]/[0.05]'
                    }`}
                    disabled={mixedVisibility}
                    onClick={() => {
                      if (mixedVisibility) return;
                      setAllNodes(prev => prev.map(node => {
                        if (!selectedNodeIds.includes(node.id)) return node;
                        const vis = { ...(node.themeVisibility || {}) };
                        if (allVisible) {
                          vis[activeThemeId] = false;
                        } else {
                          delete vis[activeThemeId];
                        }
                        return { ...node, themeVisibility: Object.keys(vis).length > 0 ? vis : undefined };
                      }));
                    }}
                  >
                    {allHidden ? <EyeOff className="h-[16px] w-[16px]" /> : <Eye className="h-[16px] w-[16px]" />}
                  </button>
                </Tip>
              </div>
            </div>
          );
        })()}

        {/* Floating Bottom Toolbar - Figma-style unified bar */}
        {viewMode === 'canvas' && isViewingPrimaryTheme && (
        <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-2 z-[51] pointer-events-none">
          {/* Ask AI Island (leftmost) */}
          <div
            className="pointer-events-auto flex items-center bg-[#111] border border-[#333] rounded-2xl shadow-2xl h-12 px-1.5 gap-0.5"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)' }}
          >
            <Tip label="Ask AI" side="top">
            <button
              className={`flex items-center gap-1.5 h-9 px-2.5 rounded-xl transition-all ${
                showAIChat
                  ? 'text-[#E5A336] bg-[#E5A336]/10'
                  : 'text-[#a1a1a1] hover:text-[#E5A336] hover:bg-[#252525]'
              }`}
              onClick={() => {
                const activeProject = projects.find(p => p.id === activeProjectId);
                const isCloud = !!activeProject?.isCloud;
                const isTemplate = !!activeProject?.isTemplate;
                if (!isCloud && !isTemplate) {
                  toast('Ask AI is available for Cloud and Template projects only', {
                    description: 'Switch to a Cloud project or open a Template to use Ask AI.',
                  });
                  return;
                }
                setShowAIChat(prev => !prev);
              }}
            >
              <Sparkles className="h-[18px] w-[18px]" />
              <span className="text-[11px] tracking-wide">AI</span>
            </button>
            </Tip>
          </div>

          <div className="pointer-events-auto flex items-center bg-[#111] border border-[#333] rounded-2xl shadow-2xl h-12 px-1.5 gap-0.5"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)' }}
          >
            {/* Node tool with dropdown */}
            <DropdownMenu>
              <Tip label="Add Color Node" side="top">
              <DropdownMenuTrigger asChild>
                <button 
                  className="flex items-center gap-0.5 h-9 pl-2.5 pr-1.5 rounded-xl text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525] transition-all group"
                >
                  <Workflow className="h-[18px] w-[18px]" />
                  <ChevronDown className="h-3 w-3 opacity-50 group-hover:opacity-80" />
                </button>
              </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent align="center" sideOffset={12} className="w-[140px] bg-[#111] border-[#333]">
                <DropdownMenuItem
                  onClick={() => addRootNode('hsl')}
                  className="text-[#ededed] focus:bg-[#252525] focus:text-[#ededed] cursor-pointer"
                >
                  HSL
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addRootNode('rgb')}
                  className="text-[#ededed] focus:bg-[#252525] focus:text-[#ededed] cursor-pointer"
                >
                  RGB
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addRootNode('oklch')}
                  className="text-[#ededed] focus:bg-[#252525] focus:text-[#ededed] cursor-pointer"
                >
                  OKLCH
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addRootNode('hct')}
                  className="text-[#ededed] focus:bg-[#252525] focus:text-[#ededed] cursor-pointer"
                >
                  HCT
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Palette tool */}
            <Tip label="Add Palette" side="top">
            <button 
              className="flex items-center justify-center h-9 w-9 rounded-xl text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525] transition-all"
              onClick={addPaletteNode}
            >
              <Palette className="h-[18px] w-[18px]" />
            </button>
            </Tip>

            {/* Token Node tool */}
            <Tip label="Add Token Node" side="top">
            <button 
              className="flex items-center justify-center h-9 w-9 rounded-xl text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525] transition-all"
              onClick={addTokenNode}
            >
              <Tag className="h-[18px] w-[18px]" />
            </button>
            </Tip>

            {/* Spacing tool — hidden for now, will implement later */}
            {/* <button 
              className="flex items-center justify-center h-9 w-9 rounded-xl text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525] transition-all"
              onClick={addSpacingNode}
              title="Add spacing node"
            >
              <Ruler className="h-[18px] w-[18px]" />
            </button> */}

            {/* Reset tool — hidden for now */}
            {/* <button 
              className="flex items-center justify-center h-9 w-9 rounded-xl text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525] transition-all"
              onClick={resetToDefaults}
              title="Reset to default data"
            >
              <RotateCcw className="h-[18px] w-[18px]" />
            </button> */}
          </div>

          {/* Companion bar — View controls */}
          <div
            className="pointer-events-auto flex items-center bg-[#111] border border-[#333] rounded-2xl shadow-2xl h-12 px-1.5 gap-0.5"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)' }}
          >
            {/* Fit all nodes */}
            <Tip label="Zoom to Fit" side="top">
            <button
              className="flex items-center justify-center h-9 w-9 rounded-xl text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525] transition-all"
              onClick={() => window.dispatchEvent(new Event('canvasFitAll'))}
            >
              <Maximize className="h-[18px] w-[18px]" />
            </button>
            </Tip>

            {/* Reset view */}
            <Tip label="Reset View" side="top">
            <button
              className="flex items-center justify-center h-9 w-9 rounded-xl text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525] transition-all"
              onClick={() => window.dispatchEvent(new Event('canvasResetView'))}
            >
              <Locate className="h-[18px] w-[18px]" />
            </button>
            </Tip>
          </div>

          {/* Dev Mode Island — only for cloud projects */}
          {(() => {
            const proj = projects.find(p => p.id === activeProjectId);
            return proj?.isCloud ? (
              <div
                className="pointer-events-auto flex items-center bg-[#111] border border-[#333] rounded-2xl shadow-2xl h-12 px-1.5 gap-0.5"
                style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)' }}
              >
                <Tip label="Dev Mode — Code Sync & Webhooks" side="top">
                <button
                  className={`flex items-center gap-1.5 h-9 px-2.5 rounded-xl transition-all ${
                    showDevMode
                      ? 'text-emerald-400 bg-emerald-400/10'
                      : 'text-[#a1a1a1] hover:text-emerald-400 hover:bg-[#252525]'
                  }`}
                  onClick={() => setShowDevMode(prev => !prev)}
                >
                  <Terminal className="h-[18px] w-[18px]" />
                  <span className="text-[11px] tracking-wide">Dev</span>
                </button>
                </Tip>
              </div>
            ) : null;
          })()}

          {/* Actions (⌘K) Island */}
          <div
            className="pointer-events-auto flex items-center bg-[#111] border border-[#333] rounded-2xl shadow-2xl h-12 px-1.5 gap-0.5"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)' }}
          >
            <Tip label="Actions (⌘K)" side="top">
            <button
              className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525] transition-all"
              onClick={() => setShowCommandPalette(true)}
            >
              <Command className="h-[18px] w-[18px]" />
              <span className="text-[11px] text-[#555] tracking-wide">⌘K</span>
            </button>
            </Tip>
          </div>

          {/* Shortcuts & Tips Island */}
          <div
            className="pointer-events-auto flex items-center bg-[#111] border border-[#333] rounded-2xl shadow-2xl h-12 px-1.5 gap-0.5"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)' }}
          >
            <Tip label="Shortcuts & Tips" side="top">
            <button
              className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${
                showShortcuts
                  ? 'text-[#ededed] bg-[#252525]'
                  : 'text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525]'
              }`}
              onClick={() => setShowShortcuts(prev => !prev)}
            >
              <Lightbulb className="h-[18px] w-[18px]" />
            </button>
            </Tip>
          </div>
        </div>
        )}

        {/* Ask AI floating button — for non-primary themes (primary themes have it in the main toolbar) */}
        {viewMode === 'canvas' && !isViewingPrimaryTheme && (
          <div className="absolute bottom-6 right-6 z-[51] pointer-events-auto">
            <div
              className="flex items-center bg-[#111] border border-[#333] rounded-2xl shadow-2xl h-12 px-1.5"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)' }}
            >
              <Tip label="Ask AI" side="top">
              <button
                className={`flex items-center gap-1.5 h-9 px-2.5 rounded-xl transition-all ${
                  showAIChat
                    ? 'text-[#E5A336] bg-[#E5A336]/10'
                    : 'text-[#a1a1a1] hover:text-[#E5A336] hover:bg-[#252525]'
                }`}
                onClick={() => {
                  const activeProject = projects.find(p => p.id === activeProjectId);
                  const isCloud = !!activeProject?.isCloud;
                  const isTemplate = !!activeProject?.isTemplate;
                  if (!isCloud && !isTemplate) {
                    toast('Ask AI is available for Cloud and Template projects only', {
                      description: 'Switch to a Cloud project or open a Template to use Ask AI.',
                    });
                    return;
                  }
                  setShowAIChat(prev => !prev);
                }}
              >
                <Sparkles className="h-[18px] w-[18px]" />
                <span className="text-[11px] tracking-wide">AI</span>
              </button>
              </Tip>
            </div>
          </div>
        )}

        {/* Undo / Redo buttons — bottom-left of canvas (canvas view only) */}
        {viewMode === 'canvas' && (
          <div className="absolute bottom-5 left-5 z-[51] flex items-center gap-1">
            <div className="group/undo relative">
              <Tip label="Undo" side="top" enabled={canUndo}>
              <button
                className={`flex items-center justify-center h-8 w-8 rounded-lg transition-all ${
                  canUndo
                    ? 'text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525] bg-[#111]/80 border border-[#333] backdrop-blur-sm'
                    : 'text-[#444] bg-[#111]/50 border border-[#282828] cursor-default'
                }`}
                onClick={undo}
                disabled={!canUndo}
              >
                <Undo2 className="h-[15px] w-[15px]" />
              </button>
              </Tip>
              {canUndo && (
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/undo:opacity-100 transition-opacity duration-150 bg-[#1a1a1a] border border-[#333] text-[#ededed] rounded-md px-1.5 py-0.5 tabular-nums"
                  style={{ fontSize: '10px', lineHeight: '14px', minWidth: '18px', textAlign: 'center' }}
                >
                  {undoCount}
                </span>
              )}
            </div>
            <div className="group/redo relative">
              <Tip label="Redo" side="top" enabled={canRedo}>
              <button
                className={`flex items-center justify-center h-8 w-8 rounded-lg transition-all ${
                  canRedo
                    ? 'text-[#a1a1a1] hover:text-[#ededed] hover:bg-[#252525] bg-[#111]/80 border border-[#333] backdrop-blur-sm'
                    : 'text-[#444] bg-[#111]/50 border border-[#282828] cursor-default'
                }`}
                onClick={redo}
                disabled={!canRedo}
              >
                <Redo2 className="h-[15px] w-[15px]" />
              </button>
              </Tip>
              {canRedo && (
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/redo:opacity-100 transition-opacity duration-150 bg-[#1a1a1a] border border-[#333] text-[#ededed] rounded-md px-1.5 py-0.5 tabular-nums"
                  style={{ fontSize: '10px', lineHeight: '14px', minWidth: '18px', textAlign: 'center' }}
                >
                  {redoCount}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Canvas Content Area */}
        <div className="absolute inset-0 overflow-hidden">
{viewMode === 'canvas' ? (
            <ColorCanvas
              nodes={nodes}
              tokens={tokens}
              projects={projects}
              groups={groups}
              activeProjectId={activeProjectId}
              onUpdateNode={updateNode}
              onAddChild={addChildNode}
              onAddParent={addParentNode}
              onTogglePrefix={togglePrefixNode}
              onDeleteNode={deleteNode}
              onUnlinkNode={unlinkNode}
              onLinkNode={linkNode}
              onAssignToken={assignTokenToNode}
              onAddToken={addToken}
              onUpdateToken={updateToken}
              onDeleteToken={deleteToken}
              onUpdateProjects={setProjects}
              onUpdateGroups={setGroups}
              onExportProject={exportProjectJSON}
              onImportProject={importProjectJSON}
              selectedNodeId={selectedNodeId}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                if (id !== null) {
                  setSelectedNodeIds([]);
                }
              }}
              selectedNodeIds={selectedNodeIds}
              onSelectNodeWithChildren={selectNodeWithChildren}
              onMoveSelectedNodes={moveSelectedNodes}
              onClearMultiSelection={() => setSelectedNodeIds([])}
              onUpdateMultiSelection={(nodeIds) => {
                setSelectedNodeIds(nodeIds);
                setSelectedNodeId(null);
              }}
              onUpdateNodeFromPanel={updateNode}
              canvasState={canvasState}
              onUpdateCanvasState={updateCanvasState}
              sidebarMode={sidebarMode}
              onSidebarModeChange={setSidebarMode}
              onNavigateToProjects={handleBackToProjects}
              showInheritanceIcon={!isViewingPrimaryTheme}
              activeThemeId={activeThemeId}
              isPrimaryTheme={isViewingPrimaryTheme}
              primaryThemeId={primaryTheme?.id || ''}
              showAllVisible={showAllVisible}
              autoAssignTriggerNodeId={autoAssignTriggerNodeId}
              onAutoAssignTriggered={() => setAutoAssignTriggerNodeId(null)}
              readOnly={false}
              pages={pages.filter(p => p.projectId === activeProjectId)}
              allProjectNodes={allNodes.filter(n => n.projectId === activeProjectId)}
              advancedLogic={advancedLogic}
              onUpdateAdvancedLogic={setAdvancedLogic}
              onRevertThemeAdvancedLogic={revertThemeAdvancedLogic}
              showDevMode={showDevMode}
              onToggleWebhookInput={(nodeId: string) => {
                const node = allNodes.find(n => n.id === nodeId);
                if (node) {
                  updateNode(nodeId, { isWebhookInput: !node.isWebhookInput });
                }
              }}
            />
          ) : viewMode === 'code' ? (
            <CodePreview
              tokens={pageTokens}
              tokenGroups={pageGroups}
              nodes={nodes}
              allProjectTokens={allProjectTokens}
              allProjectNodes={allProjectNodes}
              activePage={activePage}
              themes={themes}
              activeThemeId={activeThemeId}
              hexOverridesByPage={codePreviewHexByPage}
              onHexOverridesByPageChange={setCodePreviewHexByPage}
              advancedLogic={advancedLogic}
              computedTokens={computedTokensRef.current[activeProjectId]}
            />
          ) : (
            <MultiPageExport
              pages={pages}
              tokens={tokens}
              tokenGroups={groups}
              nodes={allNodes}
              activeProjectId={activeProjectId}
              themes={themes}
              activeThemeId={activeThemeId}
              selectedPageIds={multiExportPageIds}
              onSelectedPageIdsChange={setMultiExportPageIds}
              selectedThemeIds={multiExportThemeIds}
              onSelectedThemeIdsChange={setMultiExportThemeIds}
              hexOverrideSpaces={multiExportHexSpaces}
              onHexOverrideSpacesChange={setMultiExportHexSpaces}
              advancedLogic={advancedLogic}
              computedTokens={computedTokensRef.current[activeProjectId]}
            />
          )}

          {/* Bottom-left hint for O key visibility toggle (non-primary themes, canvas mode only) */}
          {viewMode === 'canvas' && !isViewingPrimaryTheme && (
            <div className={`absolute top-4 left-4 z-[52] pointer-events-none select-none transition-opacity duration-200 ${showAllVisible ? 'opacity-100' : 'opacity-80'}`}>
              <div className="flex items-center gap-2 bg-[#161616]/90 backdrop-blur-sm border border-[#333] rounded-lg px-3 py-2">
                <kbd className="text-[11px] text-[#a1a1a1] bg-[#252525] border border-[#444] rounded px-1.5 py-0.5" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>O</kbd>
                <span className="text-[11px] text-[#888]">
                  {showAllVisible ? 'press O \u2014 restore to default' : 'press O \u2014 make it visible'}
                </span>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ── Ask AI Chat (single instance — docked renders inline, floating uses portal) ── */}
      <AskAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        conversations={aiConversations}
        onConversationsChange={handleAIConversationsChange}
        isCloudProject={!!projects.find(p => p.id === activeProjectId)?.isCloud}
        isTemplate={!!projects.find(p => p.id === activeProjectId)?.isTemplate}
        projectContext={aiProjectContext}
        isDocked={aiChatDocked}
        onDockChange={handleAIChatDockChange}
        onSettingsSaved={handleAISettingsSaved}
      />

      {/* Token Table Popup */}
      {showTokenTable && (
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
          onNavigateToNode={(nodeId, pageId, themeId) => {
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
          }}
          onRestoreView={(pageId, themeId) => {
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
          }}
          advancedLogic={advancedLogic}
          computedTokens={computedTokensRef.current[activeProjectId]}
        />
      )}
      {/* Dev Mode Panel */}
      {showDevMode && (
        <DevModePanel
          devConfig={activeDevConfig}
          onUpdateDevConfig={updateDevConfig}
          nodes={allNodes}
          themes={themes}
          activeProjectId={activeProjectId}
          activeProject={projects.find(p => p.id === activeProjectId)}
          userId={authSession?.userId}
          onClose={() => setShowDevMode(false)}
          onRunNow={() => {
            // Run the computation pipeline and push to destinations
            handleDevModeRun();
          }}
          onTestWebhook={() => {
            // Send a test webhook to verify the endpoint works
            handleDevModeTestWebhook();
          }}
        />
      )}
      {/* Shortcuts Panel Popup */}
      {showShortcuts && (
        <ShortcutsPanel onClose={() => setShowShortcuts(false)} />
      )}

      {/* Command Palette (⌘K) */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        allNodes={allNodes}
        tokens={tokens}
        groups={groups}
        pages={pages}
        themes={themes}
        activeProjectId={activeProjectId}
        activePageId={activePageId}
        activeThemeId={activeThemeId}
        onNavigateToNode={(nodeId, pageId, themeId) => {
          // Switch page if needed
          const needsPageSwitch = pageId !== activePageId;
          if (needsPageSwitch) {
            setActivePageId(pageId);
          }
          // Switch theme if needed
          if (themeId !== activeThemeId) {
            themeSelectionsRef.current[activeThemeIdRef.current] = {
              selectedNodeId: selectedNodeIdRef.current,
              selectedNodeIds: [...selectedNodeIdsRef.current],
            };
            setActiveThemeId(themeId);
          }
          // Select the node
          setSelectedNodeId(nodeId);
          setSelectedNodeIds([nodeId]);
          // Ensure canvas view
          setViewMode('canvas');
          // Dispatch navigation event
          const dispatchNav = () => {
            const event = new CustomEvent('navigateToNode', { detail: { nodeId } });
            window.dispatchEvent(event);
          };
          if (needsPageSwitch) {
            setTimeout(dispatchNav, 180);
          } else {
            requestAnimationFrame(dispatchNav);
          }
        }}
        onNavigateToToken={(tokenId, pageId) => {
          // Switch page if needed
          if (pageId !== activePageId) {
            setActivePageId(pageId);
          }
          // Ensure canvas view (token panel is visible in canvas mode)
          setViewMode('canvas');
          // Dispatch a custom event for token highlighting
          setTimeout(() => {
            const event = new CustomEvent('highlightToken', { detail: { tokenId } });
            window.dispatchEvent(event);
          }, pageId !== activePageId ? 200 : 50);
        }}
        onOpenTokenTable={() => {
          setShowTokenTable(true);
          setViewMode('canvas');
        }}
        onOpenCodeView={() => setViewMode('code')}
        onAddColorNode={(cs) => addRootNode(cs)}
        onAddPaletteNode={addPaletteNode}
        onAddTokenNode={addTokenNode}
        onAddSpacingNode={addSpacingNode}
        onCreatePage={handleCreatePage}
        onCreateTheme={handleCreateTheme}
        onAddVariable={() => addToken()}
        onSwitchPage={handleSwitchPage}
        onSwitchTheme={handleSwitchTheme}
      />

    </div>
  );
}
