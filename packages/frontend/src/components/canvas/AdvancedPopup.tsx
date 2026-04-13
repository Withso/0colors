import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Circle, ChevronRight, ChevronDown, Minus, Maximize2, Play, Save, HelpCircle, Copy, ClipboardPaste, Scissors } from 'lucide-react';
import { AdvancedHelpPopup } from './AdvancedHelpPopup';
import { motion, AnimatePresence } from 'motion/react';
import { ColorNode as ColorNodeType, DesignToken, NodeAdvancedLogic, ChannelLogic, ConditionRow, ExpressionToken, TokenAssignmentLogic, Page, NodeViewConfig, NodeViewChannelConfig } from '../../types';
import { hslToRgb, rgbToHex, oklchToSrgb } from '../../utils/color-conversions';
import { rgbToHct, hctToRgb, hctToHex } from '../../utils/hct-utils';
import namer from 'color-namer';
import { registerAdvancedDraft, unregisterAdvancedDraft } from '../../utils/advanced-draft-registry';
import './AdvancedPopup.css';

import {
  evaluateChannelLogic,
  evaluateChannelLogicDetailed,
  nodeToChannelMapThemeAware,
  PROPERTY_OPTIONS,
  TOKEN_COLORS,
  EvalContext,
  RowOutput,
  constrainChannelValue,
  CHANNEL_CONSTRAINTS,
  TokenEvalContext,
  TokenColor,
  TokenAssignResult,
  evaluateTokenAssignmentDetailed,
  TokenRowOutput,
  DetailedTokenAssignResult,
  TOKEN_COMPUTE_FUNCTIONS,
  TOKEN_PROPERTY_OPTIONS,
  tokenColorToChannelMap,
  parseTokensToAST,
  tokenColorToDisplayString,
  getEffectiveChannels,
  getEffectiveTokenAssignment,
  getEffectiveBaseValues,
} from '../../utils/advanced-logic-engine';

interface AdvancedPopupProps {
  nodeId: string;
  node: ColorNodeType;
  nodes: ColorNodeType[];
  tokens: DesignToken[];
  activeThemeId?: string;
  isPrimaryTheme?: boolean;
  primaryThemeId?: string;
  advancedLogic: NodeAdvancedLogic[];
  onUpdateAdvancedLogic: (logic: NodeAdvancedLogic[]) => void;
  onClose: () => void;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onExpand?: () => void;
  onPopupTopChange?: (topY: number) => void;
  nodeDisplayName?: string;
  onUpdateNode?: (id: string, updates: Partial<ColorNodeType>) => void;
  readOnly?: boolean;
  pages?: Page[];             // All pages in the project — for cross-page indication
  allProjectNodes?: ColorNodeType[]; // All project nodes (not just current page) — for token node cross-page refs
}

const MIN_HEIGHT = 200;

// ── Color-space channel definitions ──────────────────────────────
type ChannelDef = { label: string; key: string };

const CHANNEL_MAP: Record<string, [ChannelDef, ChannelDef, ChannelDef]> = {
  hsl: [
    { label: 'Hue', key: 'hue' },
    { label: 'Saturation', key: 'saturation' },
    { label: 'Lightness', key: 'lightness' },
  ],
  rgb: [
    { label: 'Red', key: 'red' },
    { label: 'Green', key: 'green' },
    { label: 'Blue', key: 'blue' },
  ],
  oklch: [
    { label: 'Lightness', key: 'oklchL' },
    { label: 'Chroma', key: 'oklchC' },
    { label: 'Hue', key: 'oklchH' },
  ],
  hct: [
    { label: 'Hue', key: 'hctH' },
    { label: 'Chroma', key: 'hctC' },
    { label: 'Tone', key: 'hctT' },
  ],
  hex: [
    { label: 'Hue', key: 'hue' },
    { label: 'Saturation', key: 'saturation' },
    { label: 'Lightness', key: 'lightness' },
  ],
};

// ── Channel absolute ranges (for Node View slider validation) ────
const CHANNEL_ABSOLUTE_RANGE: Record<string, { min: number; max: number }> = {
  hue:        { min: 0, max: 360 },
  saturation: { min: 0, max: 100 },
  lightness:  { min: 0, max: 100 },
  alpha:      { min: 0, max: 100 },
  red:        { min: 0, max: 255 },
  green:      { min: 0, max: 255 },
  blue:       { min: 0, max: 255 },
  oklchL:     { min: 0, max: 100 },
  oklchC:     { min: 0, max: 100 },
  oklchH:     { min: 0, max: 360 },
  hctH:       { min: 0, max: 360 },
  hctC:       { min: 0, max: 120 },
  hctT:       { min: 0, max: 100 },
};

// ── Helpers ──────────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function oklchToHex(L: number, C: number, H: number): string {
  const rgb = oklchToSrgb(L, C, H);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

interface ResolvedColorInfo {
  colorSpace: string;
  channels: [number, number, number];
  alpha: number;
  hex: string;
  cssColor: string;
}

function resolveColorNodeInfo(
  node: ColorNodeType,
  activeThemeId: string,
  isPrimaryTheme: boolean,
): ResolvedColorInfo {
  const isLinked = isPrimaryTheme || !activeThemeId || !node.themeOverrides || !node.themeOverrides[activeThemeId];
  const ov = !isLinked ? node.themeOverrides![activeThemeId] : null;

  const hue = ov?.hue ?? node.hue;
  const sat = ov?.saturation ?? node.saturation;
  const lit = ov?.lightness ?? node.lightness;
  const alpha = ov?.alpha ?? node.alpha;
  const red = (ov as any)?.red ?? node.red ?? 0;
  const green = (ov as any)?.green ?? node.green ?? 0;
  const blue = (ov as any)?.blue ?? node.blue ?? 0;
  const oklchL = (ov as any)?.oklchL ?? node.oklchL ?? 0;
  const oklchC = (ov as any)?.oklchC ?? node.oklchC ?? 0;
  const oklchH = (ov as any)?.oklchH ?? node.oklchH ?? 0;
  const hctH = (ov as any)?.hctH ?? node.hctH ?? 0;
  const hctC = (ov as any)?.hctC ?? node.hctC ?? 0;
  const hctT = (ov as any)?.hctT ?? node.hctT ?? 0;
  const hexValue = (ov as any)?.hexValue ?? node.hexValue;

  const cs = node.colorSpace || 'hsl';
  const alphaDecimal = (alpha ?? 100) / 100;

  let channels: [number, number, number];
  let hex: string;
  let cssColor: string;

  switch (cs) {
    case 'rgb': {
      channels = [red, green, blue];
      hex = rgbToHex(red, green, blue);
      cssColor = `rgba(${red}, ${green}, ${blue}, ${alphaDecimal})`;
      break;
    }
    case 'oklch': {
      channels = [oklchL, oklchC, oklchH];
      hex = oklchToHex(oklchL, oklchC, oklchH);
      const rgb = oklchToSrgb(oklchL, oklchC, oklchH);
      cssColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alphaDecimal})`;
      break;
    }
    case 'hct': {
      channels = [hctH, hctC, hctT];
      hex = hctToHex(hctH, hctC, hctT);
      const hctRgb = hctToRgb(hctH, hctC, hctT);
      cssColor = `rgba(${hctRgb.r}, ${hctRgb.g}, ${hctRgb.b}, ${alphaDecimal})`;
      break;
    }
    case 'hex': {
      channels = [hue, sat, lit];
      hex = hexValue || hslToHex(hue, sat, lit);
      const hRgb = hslToRgb(hue, sat, lit);
      cssColor = `rgba(${hRgb.r}, ${hRgb.g}, ${hRgb.b}, ${alphaDecimal})`;
      break;
    }
    default: {
      channels = [hue, sat, lit];
      hex = hslToHex(hue, sat, lit);
      cssColor = `hsla(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(lit)}%, ${alphaDecimal})`;
      break;
    }
  }

  return { colorSpace: cs, channels, alpha: alpha ?? 100, hex, cssColor };
}

function fmtVal(value: number, key: string): string {
  if (key === 'red' || key === 'green' || key === 'blue') return Math.round(value).toString();
  if (key === 'oklchL' || key === 'oklchC') return value.toFixed(1);
  if (key === 'hctC') return value.toFixed(1);
  return Math.round(value).toString();
}

function getUnit(key: string, cs: string): string {
  if (cs === 'hsl' || cs === 'hex') {
    if (key === 'hue') return '\u00B0';
    if (key === 'saturation' || key === 'lightness') return '%';
  }
  if (cs === 'oklch') {
    if (key === 'oklchH') return '\u00B0';
  }
  if (cs === 'hct') {
    if (key === 'hctH') return '\u00B0';
  }
  return '';
}

// ── Generate unique ID ──────────────────────────────────────────
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Clipboard for copy/paste of conditions ──────────────────────
// Module-level so it persists across re-renders and works across nodes
let _conditionClipboard: { rows: ConditionRow[]; sourceLabel?: string } | null = null;

/** Deep-clone a single ConditionRow (preserving original ID). */
function deepCloneRow(r: ConditionRow): ConditionRow {
  return { ...r, tokens: r.tokens.map(t => ({ ...t })) };
}

/** Deep-clone rows with fresh IDs so pasted rows are independent.
 *  `indexOffset` shifts output-name numbering (used when appending after existing rows). */
function cloneRowsWithNewIds(rows: ConditionRow[], indexOffset = 0): ConditionRow[] {
  return rows.map((r, i) => ({
    ...r,
    id: uid(),
    tokens: r.tokens.map(t => ({ ...t, id: uid() })),
    outputName: r.outputName || `out_${indexOffset + i + 1}`,
  }));
}

/** Clipboard version counter — bumped on every copy so sibling components can detect changes. */
let _clipboardVersion = 0;

// ── Expression-token clipboard (for pill multi-select copy/paste within rows) ──
let _expressionClipboard: ExpressionToken[] | null = null;

// ── Command Palette Items ───────────────────────────────────────

interface PaletteItem {
  id: string;
  category: string;
  label: string;
  description?: string;
  tokenType: ExpressionToken['type'];
  tokenValue: string;
  icon?: string;
  refNodeId?: string;
  refProperty?: string;
  refPropertyKey?: string;
  refDisplayLabel?: string;
  isBareRef?: boolean; // True for whole-node references (for contrast/apca node-ref mode)
  refTokenId?: string;    // For tokenRef items — the design token ID
  refTokenColor?: string; // For tokenRef items — CSS color string for swatch
}

interface RefInfo {
  id: string;
  name: string;
  displayName: string; // Full computed display name for description
  type: 'parent' | 'self' | 'node';
  nodeId?: string;
}

// ── Node display-name helpers (mirrors ColorCanvas logic) ───────

/** Auto-generate a human-readable color name from HSL */
function generateRefColorName(hue: number, saturation: number, lightness: number): string {
  try {
    const h = hue, s = saturation / 100, l = lightness / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
    };
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    const hexColor = `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
    const names = namer(hexColor);
    return names.ntc[0]?.name || 'Color';
  } catch { return 'Color'; }
}

/** Get the display prefix for a node (locked name → ancestor → auto color) */
function getNodePrefix(node: ColorNodeType, allNodes: ColorNodeType[]): string {
  if (node.referenceNameLocked && node.referenceName) return node.referenceName;
  let current: ColorNodeType | undefined = node;
  while (current?.parentId) {
    const parent = allNodes.find(n => n.id === current!.parentId);
    if (!parent) break;
    if (parent.referenceNameLocked && parent.referenceName) return parent.referenceName;
    current = parent;
  }
  return generateRefColorName(node.hue, node.saturation, node.lightness);
}

/** Get the hierarchy suffix for a child node (e.g. "/1", "/1/2") */
function getNodeSuffix(node: ColorNodeType, allNodes: ColorNodeType[]): string {
  if (!node.parentId) return '';
  const parent = allNodes.find(n => n.id === node.parentId);
  if (!parent) return '';
  const siblings = allNodes
    .filter(n => n.parentId === node.parentId && !n.isSpacing)
    .sort((a, b) => a.id.localeCompare(b.id));
  const index = siblings.findIndex(n => n.id === node.id) + 1;
  const parentSuffix = getNodeSuffix(parent, allNodes);
  return `${parentSuffix}/${index}`;
}

/** Full display name for a node (prefix + suffix) */
function getNodeFullDisplayName(node: ColorNodeType, allNodes: ColorNodeType[]): string {
  if (node.isSpacing) return 'Spacing';
  if (node.isPalette) {
    const prefix = node.referenceNameLocked && node.referenceName
      ? node.referenceName
      : (node.paletteName || generateRefColorName(node.hue, node.saturation, node.lightness));
    return `${prefix} palette`;
  }
  if (node.isTokenNode && node.referenceName) return node.referenceName;
  const prefix = getNodePrefix(node, allNodes);
  const suffix = getNodeSuffix(node, allNodes);
  return prefix + suffix;
}

function buildRefItems(
  node: ColorNodeType,
  nodes: ColorNodeType[],
): RefInfo[] {
  const refs: RefInfo[] = [];

  if (node.parentId) {
    const parentNode = nodes.find(n => n.id === node.parentId);
    const parentDisplayName = parentNode ? getNodeFullDisplayName(parentNode, nodes) : 'Parent';
    refs.push({ id: 'ref-parent', name: 'Parent', displayName: parentDisplayName, type: 'parent' });
  }

  const selfDisplayName = getNodeFullDisplayName(node, nodes);
  refs.push({ id: 'ref-self', name: 'Self', displayName: selfDisplayName, type: 'self' });

  const otherColorNodes = nodes.filter(n =>
    n.id !== node.id &&
    n.id !== node.parentId &&
    !n.isSpacing &&
    !n.isTokenNode &&
    !n.isPalette
  );

  otherColorNodes.forEach(n => {
    const displayName = getNodeFullDisplayName(n, nodes);
    refs.push({ id: `ref-node-${n.id}`, name: displayName, displayName, type: 'node', nodeId: n.id });
  });

  return refs;
}

function buildPaletteItems(
  node: ColorNodeType,
  nodes: ColorNodeType[],
  colorSpace: string,
  inputText: string,
): PaletteItem[] {
  const items: PaletteItem[] = [];
  const lower = inputText.toLowerCase().replace(/^\//, '');
  const isAtMode = lower.startsWith('@');
  const atText = isAtMode ? lower.slice(1) : '';

  if (isAtMode) {
    const refs = buildRefItems(node, nodes);
    const propOptions = PROPERTY_OPTIONS[colorSpace] || PROPERTY_OPTIONS.hsl;

    const dotIdx = atText.indexOf('.');
    if (dotIdx >= 0) {
      const refPart = atText.slice(0, dotIdx).toLowerCase();
      const propPart = atText.slice(dotIdx + 1).toLowerCase();

      const matchedRef = refs.find(r =>
        r.name.toLowerCase() === refPart ||
        r.name.toLowerCase().startsWith(refPart) ||
        (r.type === 'parent' && 'parent'.startsWith(refPart)) ||
        (r.type === 'self' && 'self'.startsWith(refPart))
      );

      if (matchedRef) {
        // Bare node reference — for contrast(@Parent, @Self) / apca() / deltaE() node-ref mode
        const bareLabel = `@${matchedRef.name}`;
        if (!propPart) {
          items.push({
            id: `refnode-${matchedRef.id}`,
            category: `@${matchedRef.name}`,
            label: bareLabel,
            description: 'Whole node (for contrast, apca, deltaE)',
            tokenType: 'reference',
            tokenValue: matchedRef.type === 'parent' ? '@Parent' : matchedRef.type === 'self' ? '@Self' : `@${matchedRef.name}`,
            refNodeId: matchedRef.nodeId,
            isBareRef: true,
          });
        }
        propOptions.forEach(p => {
          const propLabel = `@${matchedRef.name}.${p.short}`;
          if (!propPart || p.short.toLowerCase().startsWith(propPart) || p.label.toLowerCase().startsWith(propPart)) {
            items.push({
              id: `refprop-${matchedRef.id}-${p.key}`,
              category: `@${matchedRef.name}`,
              label: propLabel,
              description: p.label,
              tokenType: 'reference',
              tokenValue: matchedRef.type === 'parent' ? '@Parent' : matchedRef.type === 'self' ? '@Self' : `@${matchedRef.name}`,
              refNodeId: matchedRef.nodeId,
              refProperty: `.${p.short}`,
              refPropertyKey: p.key,
              refDisplayLabel: propLabel,
            });
          }
        });
      }
    } else {
      // Flat list: show only bare node references (no property sub-items).
      // Clicking a ref transitions to @Name. mode where properties are shown.
      refs.forEach(ref => {
        if (!atText || ref.name.toLowerCase().startsWith(atText)) {
          items.push({
            id: `ref-${ref.id}`,
            category: 'References',
            label: `@${ref.name}`,
            description: ref.displayName,
            tokenType: 'reference',
            tokenValue: ref.type === 'parent' ? '@Parent' : ref.type === 'self' ? '@Self' : `@${ref.name}`,
            refNodeId: ref.nodeId,
            refDisplayLabel: ref.displayName,
          });
        }
      });
    }

    return items;
  }

  // Non-@ mode
  items.push(
    { id: 'kw-if', category: 'Logic', label: 'if', description: 'Condition start', tokenType: 'keyword', tokenValue: 'if' },
    { id: 'kw-then', category: 'Logic', label: 'then', description: 'True branch', tokenType: 'keyword', tokenValue: 'then' },
    { id: 'kw-else', category: 'Logic', label: 'else', description: 'False branch', tokenType: 'keyword', tokenValue: 'else' },
    { id: 'kw-and', category: 'Logic', label: 'AND', description: 'Both must be true', tokenType: 'keyword', tokenValue: 'AND' },
    { id: 'kw-or', category: 'Logic', label: 'OR', description: 'Either can be true', tokenType: 'keyword', tokenValue: 'OR' },
    { id: 'kw-true', category: 'Logic', label: 'true', description: 'Boolean true', tokenType: 'boolean', tokenValue: 'true' },
    { id: 'kw-false', category: 'Logic', label: 'false', description: 'Boolean false', tokenType: 'boolean', tokenValue: 'false' },
    { id: 'kw-locked', category: 'Logic', label: 'locked', description: 'Keep base value', tokenType: 'keyword', tokenValue: 'locked' },
  );

  items.push(
    { id: 'op-gt', category: 'Compare', label: '>', description: 'Greater than', tokenType: 'operator', tokenValue: '>' },
    { id: 'op-lt', category: 'Compare', label: '<', description: 'Less than', tokenType: 'operator', tokenValue: '<' },
    { id: 'op-gte', category: 'Compare', label: '>=', description: 'Greater or equal', tokenType: 'operator', tokenValue: '>=' },
    { id: 'op-lte', category: 'Compare', label: '<=', description: 'Less or equal', tokenType: 'operator', tokenValue: '<=' },
    { id: 'op-eq', category: 'Compare', label: '==', description: 'Equals', tokenType: 'operator', tokenValue: '==' },
    { id: 'op-neq', category: 'Compare', label: '!=', description: 'Not equals', tokenType: 'operator', tokenValue: '!=' },
  );

  items.push(
    { id: 'op-add', category: 'Math', label: '+', description: 'Add', tokenType: 'operator', tokenValue: '+' },
    { id: 'op-sub', category: 'Math', label: '-', description: 'Subtract', tokenType: 'operator', tokenValue: '-' },
    { id: 'op-mul', category: 'Math', label: '*', description: 'Multiply', tokenType: 'operator', tokenValue: '*' },
    { id: 'op-div', category: 'Math', label: '/', description: 'Divide', tokenType: 'operator', tokenValue: '/' },
    { id: 'op-mod', category: 'Math', label: '%', description: 'Modulo (remainder)', tokenType: 'operator', tokenValue: '%' },
  );

  items.push(
    // ── Rounding & Clamping ──
    { id: 'fn-clamp', category: 'Functions', label: 'clamp', description: 'clamp(min, max, value)', tokenType: 'function', tokenValue: 'clamp' },
    { id: 'fn-min', category: 'Functions', label: 'min', description: 'min(a, b)', tokenType: 'function', tokenValue: 'min' },
    { id: 'fn-max', category: 'Functions', label: 'max', description: 'max(a, b)', tokenType: 'function', tokenValue: 'max' },
    { id: 'fn-round', category: 'Functions', label: 'round', description: 'Round to integer', tokenType: 'function', tokenValue: 'round' },
    { id: 'fn-abs', category: 'Functions', label: 'abs', description: 'Absolute value', tokenType: 'function', tokenValue: 'abs' },
    { id: 'fn-floor', category: 'Functions', label: 'floor', description: 'Round down', tokenType: 'function', tokenValue: 'floor' },
    { id: 'fn-ceil', category: 'Functions', label: 'ceil', description: 'Round up', tokenType: 'function', tokenValue: 'ceil' },
    // ── Interpolation & Mapping ──
    { id: 'fn-lerp', category: 'Functions', label: 'lerp', description: 'lerp(a, b, t) — linear interpolation', tokenType: 'function', tokenValue: 'lerp' },
    { id: 'fn-map', category: 'Functions', label: 'map', description: 'map(val, in0, in1, out0, out1) — remap range', tokenType: 'function', tokenValue: 'map' },
    // ── Modular & Power ──
    { id: 'fn-mod', category: 'Functions', label: 'mod', description: 'mod(a, b) — positive modulo', tokenType: 'function', tokenValue: 'mod' },
    { id: 'fn-pow', category: 'Functions', label: 'pow', description: 'pow(base, exp) — power / gamma', tokenType: 'function', tokenValue: 'pow' },
    { id: 'fn-sqrt', category: 'Functions', label: 'sqrt', description: 'sqrt(val) — square root', tokenType: 'function', tokenValue: 'sqrt' },
    // ── Threshold & Stepping ──
    { id: 'fn-step', category: 'Functions', label: 'step', description: 'step(edge, x) — 0 or 1 threshold', tokenType: 'function', tokenValue: 'step' },
    { id: 'fn-smoothstep', category: 'Functions', label: 'smoothstep', description: 'smoothstep(e0, e1, x) — smooth S-curve', tokenType: 'function', tokenValue: 'smoothstep' },
    { id: 'fn-sign', category: 'Functions', label: 'sign', description: 'sign(val) — returns -1, 0, or 1', tokenType: 'function', tokenValue: 'sign' },
    { id: 'fn-snap', category: 'Functions', label: 'snap', description: 'snap(val, grid) — snap to nearest multiple', tokenType: 'function', tokenValue: 'snap' },
    // ── Tier 3: Powerful but niche ──
    { id: 'fn-sin', category: 'Functions', label: 'sin', description: 'sin(deg) — sine (degrees, not radians)', tokenType: 'function', tokenValue: 'sin' },
    { id: 'fn-cos', category: 'Functions', label: 'cos', description: 'cos(deg) — cosine (degrees, not radians)', tokenType: 'function', tokenValue: 'cos' },
    { id: 'fn-tan', category: 'Functions', label: 'tan', description: 'tan(deg) — tangent (degrees, capped ±1e6)', tokenType: 'function', tokenValue: 'tan' },
    { id: 'fn-atan2', category: 'Functions', label: 'atan2', description: 'atan2(y, x) — angle in degrees [0, 360)', tokenType: 'function', tokenValue: 'atan2' },
    { id: 'fn-log', category: 'Functions', label: 'log', description: 'log(val) — natural logarithm', tokenType: 'function', tokenValue: 'log' },
    { id: 'fn-log2', category: 'Functions', label: 'log2', description: 'log2(val) — base-2 logarithm', tokenType: 'function', tokenValue: 'log2' },
    { id: 'fn-log10', category: 'Functions', label: 'log10', description: 'log10(val) — base-10 logarithm', tokenType: 'function', tokenValue: 'log10' },
    { id: 'fn-exp', category: 'Functions', label: 'exp', description: 'exp(val) — e^value', tokenType: 'function', tokenValue: 'exp' },
    { id: 'fn-fract', category: 'Functions', label: 'fract', description: 'fract(val) — fractional part (0..1)', tokenType: 'function', tokenValue: 'fract' },
    { id: 'fn-inverselerp', category: 'Functions', label: 'inverseLerp', description: 'inverseLerp(a, b, v) — where v falls in a..b', tokenType: 'function', tokenValue: 'inverselerp' },
    { id: 'fn-invlerp', category: 'Functions', label: 'invLerp', description: 'invLerp(a, b, v) — alias for inverseLerp', tokenType: 'function', tokenValue: 'invlerp' },
    // ── Color / WCAG ──
    { id: 'fn-luminance', category: 'Color', label: 'luminance', description: 'luminance(r, g, b) — WCAG relative luminance', tokenType: 'function', tokenValue: 'luminance' },
    { id: 'fn-contrast', category: 'Color', label: 'contrast', description: 'contrast(…) — WCAG 2.x ratio (nums or @node refs)', tokenType: 'function', tokenValue: 'contrast' },
    { id: 'fn-apca', category: 'Color', label: 'apca', description: 'apca(text, bg) — APCA Lc contrast (WCAG 3.0)', tokenType: 'function', tokenValue: 'apca' },
    { id: 'fn-huelerp', category: 'Color', label: 'huelerp', description: 'huelerp(a, b, t) — shortest-path hue interpolation', tokenType: 'function', tokenValue: 'huelerp' },
    { id: 'fn-srgbtolinear', category: 'Color', label: 'srgbToLinear', description: 'srgbToLinear(ch) — sRGB 0-255 → linear 0-1', tokenType: 'function', tokenValue: 'srgbtolinear' },
    { id: 'fn-lineartosrgb', category: 'Color', label: 'linearToSrgb', description: 'linearToSrgb(v) — linear 0-1 → sRGB 0-255', tokenType: 'function', tokenValue: 'lineartosrgb' },
    { id: 'fn-deltae', category: 'Color', label: 'deltaE', description: 'deltaE(@A, @B) or (L1,a1,b1,L2,a2,b2) — CIEDE2000 ΔE', tokenType: 'function', tokenValue: 'deltae' },
  );

  items.push(
    { id: 'syn-oparen', category: 'Syntax', label: '(', description: 'Open paren', tokenType: 'paren', tokenValue: '(' },
    { id: 'syn-cparen', category: 'Syntax', label: ')', description: 'Close paren', tokenType: 'paren', tokenValue: ')' },
    { id: 'syn-comma', category: 'Syntax', label: ',', description: 'Separator', tokenType: 'comma', tokenValue: ',' },
  );

  const refs = buildRefItems(node, nodes);
  refs.forEach(ref => {
    items.push({
      id: `ref-${ref.id}`,
      category: 'References',
      label: ref.type === 'parent' ? '@Parent' : ref.type === 'self' ? '@Self' : `@${ref.name}`,
      description: ref.displayName,
      tokenType: 'reference',
      tokenValue: ref.type === 'parent' ? '@Parent' : ref.type === 'self' ? '@Self' : `@${ref.name}`,
      refNodeId: ref.nodeId,
      refDisplayLabel: ref.displayName,
    });
  });

  return items;
}

// ── Token Palette Builder (for token assignment mode) ────────────

interface TokenRefInfo {
  tokenId: string;
  tokenName: string;
  groupName: string;
  cssColor: string | null;
  displayLabel: string | null; // Color-space-aware display string (e.g., "oklch(0.72, 0.15, 142)")
  colorSpace: string; // Color space of the source node (hsl, oklch, rgb, hct, hex)
  hasColor: boolean;
  pageName?: string; // Page name for cross-page indication in token node popup
  pageId?: string;   // Page ID for grouping
}

function buildTokenPaletteItems(
  node: ColorNodeType,
  nodes: ColorNodeType[],
  tokens: DesignToken[],
  tokenRefs: TokenRefInfo[],
  inputText: string,
  pages: Page[] = [],
): PaletteItem[] {
  const items: PaletteItem[] = [];
  const lower = inputText.toLowerCase().replace(/^\//, '');

  // ── Token reference mode: {tokenName... ──
  const isCurlyMode = lower.startsWith('{');
  const curlyText = isCurlyMode ? lower.slice(1) : '';

  if (isCurlyMode) {
    const dotIdx = curlyText.indexOf('.');
    if (dotIdx >= 0) {
      // {tokenName.property — show property options for the matched token
      const namePart = curlyText.slice(0, dotIdx).toLowerCase();
      const propPart = curlyText.slice(dotIdx + 1).toLowerCase();
      const matchedRef = tokenRefs.find(r =>
        r.tokenName.toLowerCase() === namePart ||
        r.tokenName.toLowerCase().startsWith(namePart)
      );
      if (matchedRef) {
        const tokenPageSuffix = matchedRef.pageName ? ` · ${matchedRef.pageName}` : '';
        const tokenCategory = `{${matchedRef.tokenName}}${tokenPageSuffix}`;
        // Bare token ref (for assignment / function arg) — show even without color
        if (!propPart) {
          items.push({
            id: `tokenref-bare-${matchedRef.tokenId}`,
            category: tokenCategory,
            label: matchedRef.tokenName,
            description: (matchedRef.hasColor ? 'Token reference (for assignment or function)' : 'Token (no color assigned)') + tokenPageSuffix,
            tokenType: 'tokenRef',
            tokenValue: `{${matchedRef.tokenName}}`,
            refTokenId: matchedRef.tokenId,
            refTokenColor: matchedRef.cssColor || undefined,
            isBareRef: true,
          });
        }
        // Property access options only for tokens with color
        if (matchedRef.hasColor) {
          // Use color-space-aware property options based on the token's source node
          const tokenPropOptions = PROPERTY_OPTIONS[matchedRef.colorSpace] || TOKEN_PROPERTY_OPTIONS;
          tokenPropOptions.forEach(p => {
            const propLabel = `{${matchedRef.tokenName}}.${p.short}`;
            if (!propPart || p.short.toLowerCase().startsWith(propPart) || p.label.toLowerCase().startsWith(propPart)) {
              items.push({
                id: `tokenrefprop-${matchedRef.tokenId}-${p.key}`,
                category: tokenCategory,
                label: `${matchedRef.tokenName}.${p.short}`,
                description: p.label,
                tokenType: 'tokenRef',
                tokenValue: `{${matchedRef.tokenName}}`,
                refTokenId: matchedRef.tokenId,
                refTokenColor: matchedRef.cssColor || undefined,
                refProperty: `.${p.short}`,
                refPropertyKey: p.key,
              });
            }
          });
        }
      }
    } else {
      // {partial... — show only bare token refs (no property sub-items).
      // Clicking transitions to {tokenName. mode where properties are shown.
      tokenRefs.forEach(ref => {
        if (!curlyText || ref.tokenName.toLowerCase().includes(curlyText)) {
          const pageSuffix = ref.pageName ? ` · ${ref.pageName}` : '';
          items.push({
            id: `tokenref-bare-${ref.tokenId}`,
            category: ref.pageName ? `${ref.groupName || 'Tokens'} · ${ref.pageName}` : (ref.groupName || 'Tokens'),
            label: ref.tokenName,
            description: (ref.hasColor ? (ref.displayLabel || ref.cssColor || 'Color token') : 'Token (no color)') + pageSuffix,
            tokenType: 'tokenRef',
            tokenValue: `{${ref.tokenName}}`,
            refTokenId: ref.tokenId,
            refTokenColor: ref.cssColor || undefined,
          });
        }
      });
    }
    return items;
  }

  // ── @ reference mode — show node references (no @Parent/@Self for token nodes) ──
  const isAtMode = lower.startsWith('@');
  if (isAtMode) {
    // For token nodes, show all color nodes as references (not parent/self)
    const colorNodes = nodes.filter(n =>
      n.id !== node.id && !n.isSpacing && !n.isTokenNode && !n.isPalette
    );
    const atText = lower.slice(1);
    const dotIdx = atText.indexOf('.');
    if (dotIdx >= 0) {
      const refPart = atText.slice(0, dotIdx).toLowerCase();
      const propPart = atText.slice(dotIdx + 1).toLowerCase();
      const matchedNode = colorNodes.find(n => {
        const name = getNodeFullDisplayName(n, nodes).toLowerCase();
        return name === refPart || name.startsWith(refPart);
      });
      if (matchedNode) {
        const displayName = getNodeFullDisplayName(matchedNode, nodes);
        const cs = matchedNode.colorSpace || 'hsl';
        const propOptions = PROPERTY_OPTIONS[cs] || PROPERTY_OPTIONS.hsl;
        const matchedNodePage = pages.find(p => p.id === matchedNode.pageId);
        const matchedPageSuffix = (matchedNodePage && matchedNode.pageId !== node.pageId) ? ` · ${matchedNodePage.name}` : '';
        const categoryLabel = `@${displayName}${matchedPageSuffix}`;
        // Bare node ref
        if (!propPart) {
          items.push({
            id: `refnode-${matchedNode.id}`,
            category: categoryLabel,
            label: `@${displayName}`,
            description: 'Whole node (for contrast, apca, deltaE)' + matchedPageSuffix,
            tokenType: 'reference',
            tokenValue: `@${displayName}`,
            refNodeId: matchedNode.id,
            isBareRef: true,
          });
        }
        propOptions.forEach(p => {
          if (!propPart || p.short.toLowerCase().startsWith(propPart) || p.label.toLowerCase().startsWith(propPart)) {
            items.push({
              id: `refprop-${matchedNode.id}-${p.key}`,
              category: categoryLabel,
              label: `@${displayName}.${p.short}`,
              description: p.label,
              tokenType: 'reference',
              tokenValue: `@${displayName}`,
              refNodeId: matchedNode.id,
              refProperty: `.${p.short}`,
              refPropertyKey: p.key,
              refDisplayLabel: `@${displayName}.${p.short}`,
            });
          }
        });
      }
    } else {
      // Flat list: show only bare node refs (no property sub-items).
      // Clicking transitions to @Name. mode where properties are shown.
      colorNodes.forEach(n => {
        const displayName = getNodeFullDisplayName(n, nodes);
        const nodePage = pages.find(p => p.id === n.pageId);
        const pageSuffix = (nodePage && n.pageId !== node.pageId) ? ` · ${nodePage.name}` : '';
        if (!atText || displayName.toLowerCase().startsWith(atText) || displayName.toLowerCase().includes(atText)) {
          items.push({
            id: `ref-${n.id}`,
            category: pageSuffix ? `References · ${nodePage!.name}` : 'References',
            label: `@${displayName}`,
            description: displayName + pageSuffix,
            tokenType: 'reference',
            tokenValue: `@${displayName}`,
            refNodeId: n.id,
            refDisplayLabel: displayName,
          });
        }
      });
    }
    return items;
  }

  // ── Non-@ non-{ mode: logic, operators, functions, token compute functions ──
  // Logic keywords (NO locked for token mode)
  items.push(
    { id: 'kw-if', category: 'Logic', label: 'if', description: 'Condition start', tokenType: 'keyword', tokenValue: 'if' },
    { id: 'kw-then', category: 'Logic', label: 'then', description: 'True branch', tokenType: 'keyword', tokenValue: 'then' },
    { id: 'kw-else', category: 'Logic', label: 'else', description: 'False branch', tokenType: 'keyword', tokenValue: 'else' },
    { id: 'kw-and', category: 'Logic', label: 'AND', description: 'Both must be true', tokenType: 'keyword', tokenValue: 'AND' },
    { id: 'kw-or', category: 'Logic', label: 'OR', description: 'Either can be true', tokenType: 'keyword', tokenValue: 'OR' },
    { id: 'kw-true', category: 'Logic', label: 'true', description: 'Boolean true', tokenType: 'boolean', tokenValue: 'true' },
    { id: 'kw-false', category: 'Logic', label: 'false', description: 'Boolean false', tokenType: 'boolean', tokenValue: 'false' },
  );

  // Comparison operators
  items.push(
    { id: 'op-gt', category: 'Compare', label: '>', description: 'Greater than', tokenType: 'operator', tokenValue: '>' },
    { id: 'op-lt', category: 'Compare', label: '<', description: 'Less than', tokenType: 'operator', tokenValue: '<' },
    { id: 'op-gte', category: 'Compare', label: '>=', description: 'Greater or equal', tokenType: 'operator', tokenValue: '>=' },
    { id: 'op-lte', category: 'Compare', label: '<=', description: 'Less or equal', tokenType: 'operator', tokenValue: '<=' },
    { id: 'op-eq', category: 'Compare', label: '==', description: 'Equals', tokenType: 'operator', tokenValue: '==' },
    { id: 'op-neq', category: 'Compare', label: '!=', description: 'Not equals', tokenType: 'operator', tokenValue: '!=' },
  );

  items.push(
    { id: 'op-add', category: 'Math', label: '+', description: 'Add', tokenType: 'operator', tokenValue: '+' },
    { id: 'op-sub', category: 'Math', label: '-', description: 'Subtract', tokenType: 'operator', tokenValue: '-' },
    { id: 'op-mul', category: 'Math', label: '*', description: 'Multiply', tokenType: 'operator', tokenValue: '*' },
    { id: 'op-div', category: 'Math', label: '/', description: 'Divide', tokenType: 'operator', tokenValue: '/' },
    { id: 'op-mod', category: 'Math', label: '%', description: 'Modulo', tokenType: 'operator', tokenValue: '%' },
  );

  // Token-specific computational functions
  items.push(
    { id: 'fn-lighten', category: 'Token Color', label: 'lighten', description: 'lighten({token}, amount) — increase lightness', tokenType: 'function', tokenValue: 'lighten' },
    { id: 'fn-darken', category: 'Token Color', label: 'darken', description: 'darken({token}, amount) — decrease lightness', tokenType: 'function', tokenValue: 'darken' },
    { id: 'fn-mix', category: 'Token Color', label: 'mix', description: 'mix({a}, {b}, weight) — blend two colors', tokenType: 'function', tokenValue: 'mix' },
    { id: 'fn-saturate', category: 'Token Color', label: 'saturate', description: 'saturate({token}, amount) — increase saturation', tokenType: 'function', tokenValue: 'saturate' },
    { id: 'fn-desaturate', category: 'Token Color', label: 'desaturate', description: 'desaturate({token}, amount)', tokenType: 'function', tokenValue: 'desaturate' },
    { id: 'fn-adjusthue', category: 'Token Color', label: 'adjustHue', description: 'adjustHue({token}, degrees)', tokenType: 'function', tokenValue: 'adjusthue' },
    { id: 'fn-complement', category: 'Token Color', label: 'complement', description: 'complement({token}) — hue+180°', tokenType: 'function', tokenValue: 'complement' },
    { id: 'fn-tint', category: 'Token Color', label: 'tint', description: 'tint({token}, amount) — mix with white', tokenType: 'function', tokenValue: 'tint' },
    { id: 'fn-shade', category: 'Token Color', label: 'shade', description: 'shade({token}, amount) — mix with black', tokenType: 'function', tokenValue: 'shade' },
    { id: 'fn-opacity', category: 'Token Color', label: 'opacity', description: 'opacity({token}, alpha) — set alpha', tokenType: 'function', tokenValue: 'opacity' },
    { id: 'fn-rgba', category: 'Token Color', label: 'rgba', description: 'rgba({token}, alpha) — set alpha', tokenType: 'function', tokenValue: 'rgba' },
  );

  // Standard math functions (same as color node)
  items.push(
    { id: 'fn-clamp', category: 'Functions', label: 'clamp', description: 'clamp(min, max, value)', tokenType: 'function', tokenValue: 'clamp' },
    { id: 'fn-min', category: 'Functions', label: 'min', description: 'min(a, b)', tokenType: 'function', tokenValue: 'min' },
    { id: 'fn-max', category: 'Functions', label: 'max', description: 'max(a, b)', tokenType: 'function', tokenValue: 'max' },
    { id: 'fn-round', category: 'Functions', label: 'round', description: 'Round to integer', tokenType: 'function', tokenValue: 'round' },
    { id: 'fn-abs', category: 'Functions', label: 'abs', description: 'Absolute value', tokenType: 'function', tokenValue: 'abs' },
    { id: 'fn-lerp', category: 'Functions', label: 'lerp', description: 'lerp(a, b, t)', tokenType: 'function', tokenValue: 'lerp' },
    { id: 'fn-pow', category: 'Functions', label: 'pow', description: 'pow(base, exp)', tokenType: 'function', tokenValue: 'pow' },
    { id: 'fn-sqrt', category: 'Functions', label: 'sqrt', description: 'sqrt(val)', tokenType: 'function', tokenValue: 'sqrt' },
  );

  // Color/WCAG functions
  // Accessibility / Contrast functions (token-aware)
  items.push(
    { id: 'fn-contrast', category: 'Accessibility', label: 'contrast', description: 'contrast({a}, {b}) — WCAG 2.x ratio (1–21)', tokenType: 'function', tokenValue: 'contrast' },
    { id: 'fn-wcag', category: 'Accessibility', label: 'wcag', description: 'wcag({a}, {b}) — alias for contrast()', tokenType: 'function', tokenValue: 'wcag' },
    { id: 'fn-apca', category: 'Accessibility', label: 'apca', description: 'apca({text}, {bg}) — APCA Lc contrast', tokenType: 'function', tokenValue: 'apca' },
    { id: 'fn-luminance', category: 'Accessibility', label: 'luminance', description: 'luminance({token}) — relative luminance (0–1)', tokenType: 'function', tokenValue: 'luminance' },
    { id: 'fn-deltae', category: 'Accessibility', label: 'deltaE', description: 'deltaE({a}, {b}) — CIEDE2000 color difference', tokenType: 'function', tokenValue: 'deltae' },
    { id: 'fn-isreadable', category: 'Accessibility', label: 'isReadable', description: 'isReadable({fg}, {bg}) — WCAG AA normal text (≥4.5)', tokenType: 'function', tokenValue: 'isreadable' },
    { id: 'fn-isreadablelarge', category: 'Accessibility', label: 'isReadableLarge', description: 'isReadableLarge({fg}, {bg}) — WCAG AA large text (≥3)', tokenType: 'function', tokenValue: 'isreadablelarge' },
  );

  // Syntax
  items.push(
    { id: 'syn-oparen', category: 'Syntax', label: '(', description: 'Open paren', tokenType: 'paren', tokenValue: '(' },
    { id: 'syn-cparen', category: 'Syntax', label: ')', description: 'Close paren', tokenType: 'paren', tokenValue: ')' },
    { id: 'syn-comma', category: 'Syntax', label: ',', description: 'Separator', tokenType: 'comma', tokenValue: ',' },
  );

  // Node references (for token popup, no @Parent/@Self)
  // Show only bare refs — clicking transitions to @Name. mode for property selection
  const colorNodes = nodes.filter(n =>
    n.id !== node.id && !n.isSpacing && !n.isTokenNode && !n.isPalette
  );
  colorNodes.forEach(n => {
    const displayName = getNodeFullDisplayName(n, nodes);
    const nodePage = pages.find(p => p.id === n.pageId);
    const pageSuffix = (nodePage && n.pageId !== node.pageId) ? ` · ${nodePage.name}` : '';
    items.push({
      id: `ref-${n.id}`,
      category: pageSuffix ? `References · ${nodePage!.name}` : 'References',
      label: `@${displayName}`,
      description: displayName + pageSuffix,
      tokenType: 'reference',
      tokenValue: `@${displayName}`,
      refNodeId: n.id,
      refDisplayLabel: displayName,
    });
  });

  // Token references (always available in non-@ mode)
  // Show only bare refs — clicking transitions to {tokenName. mode for property selection
  tokenRefs.forEach(ref => {
    const pageSuffix = ref.pageName ? ` · ${ref.pageName}` : '';
    items.push({
      id: `tokenref-bare-${ref.tokenId}`,
      category: ref.pageName ? `${ref.groupName || 'Tokens'} · ${ref.pageName}` : (ref.groupName || 'Tokens'),
      label: ref.tokenName,
      description: (ref.hasColor ? (ref.displayLabel || ref.cssColor || 'Color token') : 'Token (no color)') + pageSuffix,
      tokenType: 'tokenRef',
      tokenValue: `{${ref.tokenName}}`,
      refTokenId: ref.tokenId,
      refTokenColor: ref.cssColor || undefined,
    });
  });

  return items;
}

// ── Filter logic ────────────────────────────────────────────────

function filterPaletteItems(items: PaletteItem[], filter: string): PaletteItem[] {
  if (!filter) return items;
  const q = filter.toLowerCase().replace(/^\//, '');
  if (!q) return items;

  if (q.startsWith('@')) return items;
  if (q.startsWith('{')) return items; // Token reference mode — pre-filtered

  const matched = items.filter(
    i => i.label.toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q)
  );

  // Sort: exact label match > label starts with > label includes > description-only match
  matched.sort((a, b) => {
    const aLabel = a.label.toLowerCase();
    const bLabel = b.label.toLowerCase();
    // Score: 4 = exact, 3 = startsWith, 2 = label includes, 1 = description/category only
    const score = (label: string) => {
      if (label === q) return 4;
      if (label.startsWith(q)) return 3;
      if (label.includes(q)) return 2;
      return 1; // matched via description or category
    };
    return score(bLabel) - score(aLabel);
  });

  return matched;
}

function groupByCategory(items: PaletteItem[]): Record<string, PaletteItem[]> {
  const groups: Record<string, PaletteItem[]> = {};
  items.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });
  return groups;
}

// ═════════════════════════════════════════════════════════════════
// TokenPill — renders a single token as a colored pill
// ALL token types get pill treatment for consistency
// ═════════════════════════════════════════════════════════════════

function TokenPill({
  token,
  isMerged,
  mergedLabel,
  isSelected,
  onClick,
  onMouseDown,
  onMouseEnter,
  onContextMenu,
  vtIndex,
}: {
  token: ExpressionToken;
  isMerged?: boolean;
  mergedLabel?: string;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  vtIndex?: number;
}) {
  const color = TOKEN_COLORS[token.type] || 'var(--text-disabled)';
  const label = isMerged ? mergedLabel! : (token.displayLabel || token.value);

  // Merged ref+property uses reference color; tokenRef+property uses tokenRef color
  const isTokenRef = token.type === 'tokenRef';
  const pillColor = isMerged
    ? (token.type === 'tokenRef' ? TOKEN_COLORS.tokenRef : TOKEN_COLORS.reference)
    : color;

  // Special color for `locked` keyword — distinct amber to differentiate from control flow
  const isLocked = token.type === 'keyword' && token.value === 'locked';
  const finalColor = isLocked ? 'var(--text-warning)' : pillColor;

  return (
    <span
      className="advanced-pill"
      style={{
        color: 'var(--text-primary)',
        backgroundColor: isSelected
          ? `color-mix(in srgb, ${finalColor} 28%, transparent)`
          : `color-mix(in srgb, ${finalColor} 14%, transparent)`,
        border: 'none',
        outline: isSelected ? `1px solid ${finalColor}` : 'none',
        outlineOffset: '1px',
      }}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onContextMenu={onContextMenu}
      data-vt-index={vtIndex}
    >
      {isLocked && (
        <svg width="8" height="8" viewBox="0 0 16 16" fill="none" className="advanced-pill-lock-icon">
          <rect x="3" y="7" width="10" height="7" rx="1.5" fill={finalColor} />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke={finalColor} strokeWidth="1.5" fill="none" />
        </svg>
      )}
      {isTokenRef && !isMerged && token.refTokenColor && (
        <span
          className="advanced-pill-swatch"
          style={{ backgroundColor: token.refTokenColor, boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--on-surface-0) 15%, transparent)' }}
        />
      )}
      {isTokenRef && !isMerged && !token.refTokenColor && (
        <span
          className="advanced-pill-swatch"
          style={{ backgroundColor: 'transparent', boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--on-surface-0) 20%, transparent)' }}
        />
      )}
      {label}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════
// DropdownPortal — renders command palette dropdown via portal
// to escape overflow:hidden/auto clipping from parent containers
// ═════════════════════════════════════════════════════════════════

function DropdownPortal({
  rowRef,
  dropdownRef,
  groupedItems,
  flatItems,
  highlightIndex,
  setHighlightIndex,
  commitItem,
}: {
  rowRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  groupedItems: Record<string, PaletteItem[]>;
  flatItems: PaletteItem[];
  highlightIndex: number;
  setHighlightIndex: (i: number) => void;
  commitItem: (item: PaletteItem) => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  // Track whether the dropdown is actively being scrolled to suppress onMouseEnter highlight changes
  const isScrollingRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const update = () => {
      if (!rowRef.current) return;
      const rect = rowRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    update();
    // Update position on scroll/resize of any ancestor — but ignore the dropdown's own scroll
    const handleScroll = (e: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      update();
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', update);
    };
  }, [rowRef, dropdownRef]);

  // Determine if dropdown should appear above or below
  const maxH = 260;
  const spaceBelow = window.innerHeight - pos.top;
  const showAbove = spaceBelow < maxH + 20 && pos.top > maxH + 20;
  const finalTop = showAbove
    ? pos.top - maxH - 8 - (rowRef.current?.getBoundingClientRect().height || 0)
    : pos.top;

  const handleDropdownScroll = useCallback(() => {
    isScrollingRef.current = true;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => { isScrollingRef.current = false; }, 150);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: showAbove ? 4 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: showAbove ? 4 : -4 }}
      transition={{ duration: 0.12 }}
      style={{
        position: 'fixed',
        top: finalTop,
        left: pos.left,
        width: pos.width,
        zIndex: 'var(--z-advanced-popup)' as any,
        pointerEvents: 'auto',
      }}
    >
      <div
        ref={dropdownRef}
        onScroll={handleDropdownScroll}
        className="advanced-dropdown-inner"
        style={{ maxHeight: `${maxH}px` }}
      >
        {Object.entries(groupedItems).map(([category, items]) => (
          <div key={category}>
            <div
              className="advanced-dropdown-category"
            >
              {category}
            </div>
            {items.map(item => {
              const globalIdx = flatItems.indexOf(item);
              const isHighlighted = globalIdx === highlightIndex;
              return (
                <button
                  key={item.id}
                  data-highlighted={isHighlighted}
                  className="advanced-dropdown-item"
                  style={{
                    background: isHighlighted ? 'var(--surface-hover-strong)' : 'transparent',
                  }}
                  onMouseEnter={() => { if (!isScrollingRef.current) setHighlightIndex(globalIdx); }}
                  onMouseDown={(e) => {
                    // Prevent stealing focus from input
                    e.preventDefault();
                  }}
                  onClick={() => commitItem(item)}
                >
                  {item.tokenType === 'tokenRef' && item.refTokenColor && (
                    <span
                      className="advanced-dropdown-item-swatch"
                      style={{ backgroundColor: item.refTokenColor, boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--on-surface-0) 15%, transparent)' }}
                    />
                  )}
                  {item.tokenType === 'tokenRef' && !item.refTokenColor && (
                    <span
                      className="advanced-dropdown-item-swatch"
                      style={{ backgroundColor: 'transparent', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--on-surface-0) 15%, transparent)' }}
                    />
                  )}
                  <span
                    className="advanced-dropdown-item-label"
                    style={{ color: (item.tokenType === 'keyword' && item.tokenValue === 'locked') ? 'var(--text-warning)' : (TOKEN_COLORS[item.tokenType] || 'var(--text-tertiary)') }}
                  >
                    {item.label}
                  </span>
                  {item.description && (
                    <span className="advanced-dropdown-item-desc">
                      {item.description}
                    </span>
                  )}
                  {item.tokenType === 'reference' && !item.refProperty && !item.isBareRef && (
                    <ChevronRight size={10} className="advanced-dropdown-item-chevron" />
                  )}
                  {item.tokenType === 'tokenRef' && !item.refProperty && !item.isBareRef && (
                    <ChevronRight size={10} className="advanced-dropdown-item-chevron" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════���═══════════════════════
// ConditionRowEditor — cursor-based token editor for one row
// ═════════════════════════════════════════════════════════════════

interface ConditionRowEditorProps {
  row: ConditionRow;
  channelKey: string;
  colorSpace: string;
  node: ColorNodeType;
  nodes: ColorNodeType[];
  evalCtx: EvalContext;
  onUpdate: (row: ConditionRow) => void;
  onDelete: () => void;
  onCopy?: () => void; // Copy this condition row to clipboard
  availableLocals?: string[]; // Output variable names from previous rows
  mode?: 'channel' | 'tokenAssignment'; // Default: 'channel'
  tokenRefs?: TokenRefInfo[]; // For tokenAssignment mode — available token references
  designTokens?: DesignToken[]; // For tokenAssignment mode
  pages?: Page[]; // For cross-page indication in token node popup
  testIdBase?: string;
}

function ConditionRowEditor({
  row,
  channelKey,
  colorSpace,
  node,
  nodes,
  evalCtx,
  onUpdate,
  onDelete,
  onCopy,
  availableLocals = [],
  mode = 'channel',
  tokenRefs = [],
  designTokens = [],
  pages = [],
  testIdBase,
}: ConditionRowEditorProps) {
  const [showPalette, setShowPalette] = useState(false);
  const [inputText, setInputText] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  // Cursor position: index in the tokens array where input sits
  // 0 = before first token, tokens.length = after last token
  const [cursorPos, setCursorPos] = useState(row.tokens.length);
  const [selectedPills, setSelectedPills] = useState<Set<number>>(new Set());
  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartVtRef = useRef<number | null>(null);
  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expressionContainerRef = useRef<HTMLDivElement>(null);

  // Keep cursorPos within bounds
  useEffect(() => {
    if (cursorPos > row.tokens.length) setCursorPos(row.tokens.length);
  }, [row.tokens.length, cursorPos]);

  const paletteItems = useMemo(() => {
    const items = mode === 'tokenAssignment'
      ? buildTokenPaletteItems(node, nodes, designTokens ?? [], tokenRefs ?? [], inputText, pages)
      : buildPaletteItems(node, nodes, colorSpace, inputText);
    // Add available local variable references from previous row outputs
    if (availableLocals.length > 0) {
      const lower = inputText.toLowerCase().replace(/^\//, '');
      const isAtMode = lower.startsWith('@');
      const isCurlyMode = lower.startsWith('{');
      if (!isAtMode && !isCurlyMode) {
        availableLocals.forEach(name => {
          items.push({
            id: `local-${name}`,
            category: 'Variables',
            label: `$${name}`,
            description: 'Previous row output',
            tokenType: 'local',
            tokenValue: name,
          });
        });
      }
    }
    return items;
  }, [node, nodes, colorSpace, inputText, availableLocals, mode, designTokens, tokenRefs, pages]);

  const filteredItems = useMemo(
    () => filterPaletteItems(paletteItems, inputText),
    [paletteItems, inputText]
  );

  const groupedItems = useMemo(() => groupByCategory(filteredItems), [filteredItems]);

  const flatItems = useMemo(() => {
    const flat: PaletteItem[] = [];
    Object.values(groupedItems).forEach(items => flat.push(...items));
    return flat;
  }, [groupedItems]);

  // Only reset highlight when inputText actually changes — not when flatItems recompute with same content
  const prevInputRef = useRef(inputText);
  useEffect(() => {
    if (prevInputRef.current === inputText) return; // Skip if only flatItems reference changed
    prevInputRef.current = inputText;
    // When filter changes, prefer highlighting an exact-match item (if any)
    if (inputText && flatItems.length > 0) {
      const q = inputText.toLowerCase().replace(/^\//, '');
      if (q && !q.startsWith('@')) {
        const exactIdx = flatItems.findIndex(i => i.label.toLowerCase() === q);
        if (exactIdx >= 0) {
          setHighlightIndex(exactIdx);
          return;
        }
      }
    }
    setHighlightIndex(0);
  }, [flatItems, inputText]);

  useEffect(() => {
    if (!dropdownRef.current) return;
    const highlighted = dropdownRef.current.querySelector('[data-highlighted="true"]');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  useEffect(() => {
    if (!showPalette) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Check if click is inside the row OR inside the portal dropdown
      if (rowRef.current && rowRef.current.contains(target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      setShowPalette(false);
      setInputText('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPalette]);

  // Helper: get the "visual index" accounting for merged ref+property pairs
  // Returns pairs of [tokenIndex, count] for visual elements
  const visualTokens = useMemo(() => {
    const items: { startIndex: number; count: number; isMerged: boolean }[] = [];
    let i = 0;
    while (i < row.tokens.length) {
      if ((row.tokens[i].type === 'reference' || row.tokens[i].type === 'tokenRef') && row.tokens[i + 1]?.type === 'property') {
        items.push({ startIndex: i, count: 2, isMerged: true });
        i += 2;
      } else {
        items.push({ startIndex: i, count: 1, isMerged: false });
        i += 1;
      }
    }
    return items;
  }, [row.tokens]);

  const insertTokensAtCursor = useCallback((newTokens: ExpressionToken[]) => {
    const before = row.tokens.slice(0, cursorPos);
    const after = row.tokens.slice(cursorPos);

    // ── Auto-insert comma when inside function parentheses ──
    // If we're inserting a value token and the previous token is a completed argument
    // (not ( or ,), auto-prepend a comma separator.
    const needsAutoComma = (() => {
      if (before.length === 0 || newTokens.length === 0) return false;
      const prevToken = before[before.length - 1];
      const nextToken = newTokens[0];
      // Only auto-comma for value-like tokens being inserted
      const valueTypes = new Set(['tokenRef', 'literal', 'reference', 'function', 'boolean', 'local', 'keyword']);
      if (!valueTypes.has(nextToken.type)) return false;
      // Don't add comma if prev is already ( or ,
      if (prevToken.type === 'paren' && prevToken.value === '(') return false;
      if (prevToken.type === 'comma') return false;
      // Don't add comma if prev is an operator or keyword (if/then/else/AND/OR)
      if (prevToken.type === 'operator') return false;
      if (prevToken.type === 'keyword') return false;
      // Check if we're inside function parentheses by scanning backwards
      let parenDepth = 0;
      for (let i = before.length - 1; i >= 0; i--) {
        const t = before[i];
        if (t.type === 'paren' && t.value === ')') parenDepth++;
        if (t.type === 'paren' && t.value === '(') {
          if (parenDepth > 0) { parenDepth--; continue; }
          // Found the unmatched open paren — check if preceded by a function
          if (i > 0 && before[i - 1].type === 'function') return true;
          return false;
        }
      }
      return false;
    })();

    const tokensToInsert = needsAutoComma
      ? [{ id: uid(), type: 'comma' as const, value: ',' } as ExpressionToken, ...newTokens]
      : newTokens;

    onUpdate({ ...row, tokens: [...before, ...tokensToInsert, ...after] });
    setCursorPos(cursorPos + tokensToInsert.length);
    setSelectedPills(new Set());
  }, [row, cursorPos, onUpdate]);

  const commitItem = useCallback((item: PaletteItem) => {
    // Token reference with property: {token}.H → tokenRef + property pair
    if (item.tokenType === 'tokenRef' && item.refProperty && item.refPropertyKey) {
      const tRefToken: ExpressionToken = {
        id: uid(),
        type: 'tokenRef',
        value: `{${item.label.split('.')[0]}}`,
        displayLabel: `{${item.label.split('.')[0]}}`,
        refTokenId: item.refTokenId,
        refTokenColor: item.refTokenColor,
      };
      const propToken: ExpressionToken = {
        id: uid(),
        type: 'property',
        value: item.refProperty,
        displayLabel: item.refProperty,
        refProperty: item.refPropertyKey,
      };
      insertTokensAtCursor([tRefToken, propToken]);
      setInputText('');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    // Bare token reference — commit as tokenRef (for assignment or as function arg)
    if (item.tokenType === 'tokenRef' && item.isBareRef) {
      // Strip any existing braces from label to avoid double-bracing
      const cleanLabel = item.label.replace(/^\{|\}$/g, '');
      const tRefToken: ExpressionToken = {
        id: uid(),
        type: 'tokenRef',
        value: `{${cleanLabel}}`,
        displayLabel: `{${cleanLabel}}`,
        refTokenId: item.refTokenId,
        refTokenColor: item.refTokenColor,
      };
      insertTokensAtCursor([tRefToken]);
      setInputText('');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    // Token reference without property — transition to property selection mode
    if (item.tokenType === 'tokenRef' && !item.refProperty) {
      const tokenName = item.label.replace(/^\{|\}$/g, '');
      setInputText(`{${tokenName}.`);
      setHighlightIndex(0);
      setShowPalette(true);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    if (item.refProperty && item.refPropertyKey) {
      const refToken: ExpressionToken = {
        id: uid(),
        type: 'reference',
        value: item.tokenValue,
        displayLabel: item.label.split('.')[0],
        refNodeId: item.refNodeId,
      };
      const propToken: ExpressionToken = {
        id: uid(),
        type: 'property',
        value: item.refProperty,
        displayLabel: item.refProperty,
        refProperty: item.refPropertyKey,
      };
      insertTokensAtCursor([refToken, propToken]);
      setInputText('');
      // Keep palette open (input stays focused)
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    // Bare node reference — commit just the @Ref token (no property) for contrast/apca/deltaE
    if (item.isBareRef) {
      const refToken: ExpressionToken = {
        id: uid(),
        type: 'reference',
        value: item.tokenValue,
        displayLabel: item.label,
        refNodeId: item.refNodeId,
      };
      insertTokensAtCursor([refToken]);
      setInputText('');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    if (item.tokenType === 'reference' && !item.refProperty) {
      // Transition to property selection mode: show @Ref.X options
      const refName = item.label.replace(/^@/, '');
      setInputText(`@${refName}.`);
      setHighlightIndex(0);
      setShowPalette(true); // Ensure palette stays open for property selection
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    if (item.tokenType === 'function') {
      const fnToken: ExpressionToken = { id: uid(), type: 'function', value: item.tokenValue, displayLabel: item.label };
      const parenToken: ExpressionToken = { id: uid(), type: 'paren', value: '(' };
      insertTokensAtCursor([fnToken, parenToken]);
      setInputText('');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    const newToken: ExpressionToken = {
      id: uid(),
      type: item.tokenType,
      value: item.tokenValue,
      displayLabel: item.label,
      refNodeId: item.refNodeId,
    };
    insertTokensAtCursor([newToken]);
    setInputText('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [insertTokensAtCursor]);

  const deleteTokenAtIndex = useCallback((index: number) => {
    // Check if this token is part of a merged pair
    const tok = row.tokens[index];
    let deleteCount = 1;
    let deleteStart = index;

    if (tok.type === 'property' && index > 0 && (row.tokens[index - 1].type === 'reference' || row.tokens[index - 1].type === 'tokenRef')) {
      // Delete both ref/tokenRef + property
      deleteStart = index - 1;
      deleteCount = 2;
    } else if ((tok.type === 'reference' || tok.type === 'tokenRef') && row.tokens[index + 1]?.type === 'property') {
      // Delete both ref/tokenRef + property
      deleteCount = 2;
    }

    const newTokens = [...row.tokens];
    newTokens.splice(deleteStart, deleteCount);
    onUpdate({ ...row, tokens: newTokens });

    // Adjust cursor
    if (cursorPos > deleteStart) {
      setCursorPos(Math.max(deleteStart, cursorPos - deleteCount));
    }
    setSelectedPills(new Set());
  }, [row, cursorPos, onUpdate]);

  /** Delete all tokens whose visual-token startIndex is in the selected set. */
  const deleteSelectedPills = useCallback(() => {
    if (selectedPills.size === 0) return;
    // Collect raw token indices to remove (expand merged pairs)
    const indicesToRemove = new Set<number>();
    for (const vtIdx of selectedPills) {
      const vt = visualTokens.find(v => v.startIndex === vtIdx);
      if (vt) {
        for (let k = 0; k < vt.count; k++) indicesToRemove.add(vt.startIndex + k);
      }
    }
    const newTokens = row.tokens.filter((_, i) => !indicesToRemove.has(i));
    onUpdate({ ...row, tokens: newTokens });
    // Adjust cursor: move to the position of the earliest removed token
    const minRemoved = Math.min(...indicesToRemove);
    setCursorPos(Math.min(minRemoved, newTokens.length));
    setSelectedPills(new Set());
  }, [selectedPills, visualTokens, row, onUpdate]);

  /** Collect ExpressionTokens from selected pills (preserving order). */
  const getSelectedTokens = useCallback((): ExpressionToken[] => {
    const tokens: ExpressionToken[] = [];
    // Sort selected visual token indices to preserve order
    const sorted = [...selectedPills].sort((a, b) => a - b);
    for (const vtIdx of sorted) {
      const vt = visualTokens.find(v => v.startIndex === vtIdx);
      if (vt) {
        for (let k = 0; k < vt.count; k++) {
          if (row.tokens[vt.startIndex + k]) tokens.push({ ...row.tokens[vt.startIndex + k] });
        }
      }
    }
    return tokens;
  }, [selectedPills, visualTokens, row.tokens]);

  // ── Drag selection: select pills by dragging across them ──
  // isDragPending: mousedown happened but mouse hasn't moved to a different pill yet
  const isDragPendingRef = useRef(false);
  const dragShiftRef = useRef(false);
  const preDragSelectionRef = useRef<Set<number>>(new Set());

  const handlePillMouseDown = useCallback((vtIdx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return; // left click only
    e.preventDefault(); // prevent text selection
    dragStartVtRef.current = vtIdx;
    isDragPendingRef.current = true;
    dragShiftRef.current = e.shiftKey;
    preDragSelectionRef.current = new Set(e.shiftKey ? selectedPills : []);
  }, [selectedPills]);

  const handlePillMouseEnter = useCallback((vtIdx: number) => {
    if (dragStartVtRef.current === null) return;
    if (!isDragPendingRef.current && !isDragging) return;
    // Mouse moved to a different pill → start real drag
    let activeDrag = isDragging;
    if (isDragPendingRef.current && vtIdx !== dragStartVtRef.current) {
      isDragPendingRef.current = false;
      setIsDragging(true);
      activeDrag = true;
    }
    if (!activeDrag) return;
    const start = dragStartVtRef.current;
    const lo = Math.min(start, vtIdx);
    const hi = Math.max(start, vtIdx);
    const newSel = new Set<number>(preDragSelectionRef.current);
    for (const vt of visualTokens) {
      if (vt.startIndex >= lo && vt.startIndex <= hi) newSel.add(vt.startIndex);
    }
    setSelectedPills(newSel);
  }, [isDragging, visualTokens]);

  // Global mouseup to end drag
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging || isDragPendingRef.current) {
        setIsDragging(false);
        isDragPendingRef.current = false;
        dragStartVtRef.current = null;
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging]);

  // ── Cut: copy selected pills to clipboard, then delete them ──
  const cutSelectedPills = useCallback(() => {
    if (selectedPills.size === 0) return;
    _expressionClipboard = getSelectedTokens();
    deleteSelectedPills();
  }, [selectedPills, getSelectedTokens, deleteSelectedPills]);

  // ── Context menu handler ──
  const handlePillContextMenu = useCallback((e: React.MouseEvent, vtIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    // If right-clicked pill is not already selected, select only it
    if (!selectedPills.has(vtIdx)) {
      setSelectedPills(new Set([vtIdx]));
    }
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [selectedPills]);

  // Close context menu on outside click, scroll, or Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const closeOnEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', closeOnEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', closeOnEsc);
    };
  }, [ctxMenu]);

  // ── Cmd+X: cut selected pills ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isMod = e.ctrlKey || e.metaKey;

    // ── Cmd+X: cut selected pills ──
    if (isMod && e.key === 'x' && selectedPills.size > 0) {
      e.preventDefault();
      e.stopPropagation();
      cutSelectedPills();
      return;
    }

    // ── Cmd+A: select all pills ──
    if (isMod && e.key === 'a' && row.tokens.length > 0) {
      e.preventDefault();
      const allIndices = new Set(visualTokens.map(vt => vt.startIndex));
      setSelectedPills(allIndices);
      setInputText('');
      return;
    }

    // ── Cmd+C: copy selected pills to expression clipboard ──
    if (isMod && e.key === 'c' && selectedPills.size > 0) {
      e.preventDefault();
      e.stopPropagation(); // Don't let document handler also fire
      _expressionClipboard = getSelectedTokens();
      return;
    }

    // ── Cmd+V: paste expression tokens from expression clipboard ──
    if (isMod && e.key === 'v' && _expressionClipboard && _expressionClipboard.length > 0 && inputText === '') {
      e.preventDefault();
      e.stopPropagation(); // Don't let document handler also fire
      // Deep-clone with fresh IDs
      const cloned = _expressionClipboard.map(t => ({ ...t, id: uid() }));
      // If pills are selected, delete them first, then insert at earliest position
      if (selectedPills.size > 0) {
        const indicesToRemove = new Set<number>();
        for (const vtIdx of selectedPills) {
          const vt = visualTokens.find(v => v.startIndex === vtIdx);
          if (vt) { for (let k = 0; k < vt.count; k++) indicesToRemove.add(vt.startIndex + k); }
        }
        const minRemoved = Math.min(...indicesToRemove);
        const remaining = row.tokens.filter((_, i) => !indicesToRemove.has(i));
        const insertPos = Math.min(minRemoved, remaining.length);
        const before = remaining.slice(0, insertPos);
        const after = remaining.slice(insertPos);
        onUpdate({ ...row, tokens: [...before, ...cloned, ...after] });
        setCursorPos(insertPos + cloned.length);
        setSelectedPills(new Set());
      } else {
        insertTokensAtCursor(cloned);
      }
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    // ── Cmd+V fallback: paste tokens from a copied condition row into THIS row ──
    // When the user copies an entire condition row (via the Copy button) and then
    // presses Cmd+V inside another row's expression input, we insert the copied
    // row's tokens at the cursor — instead of letting the column-level handler
    // replace ALL conditions in the column.
    if (isMod && e.key === 'v' && _conditionClipboard && _conditionClipboard.rows.length > 0 && inputText === '') {
      e.preventDefault();
      e.stopPropagation();
      const sourceRow = _conditionClipboard.rows[0];
      if (sourceRow.tokens.length > 0) {
        const cloned = sourceRow.tokens.map(t => ({ ...t, id: uid() }));
        if (selectedPills.size > 0) {
          const indicesToRemove = new Set<number>();
          for (const vtIdx of selectedPills) {
            const vt = visualTokens.find(v => v.startIndex === vtIdx);
            if (vt) { for (let k = 0; k < vt.count; k++) indicesToRemove.add(vt.startIndex + k); }
          }
          const minRemoved = Math.min(...indicesToRemove);
          const remaining = row.tokens.filter((_, i) => !indicesToRemove.has(i));
          const insertPos = Math.min(minRemoved, remaining.length);
          const before = remaining.slice(0, insertPos);
          const after = remaining.slice(insertPos);
          onUpdate({ ...row, tokens: [...before, ...cloned, ...after] });
          setCursorPos(insertPos + cloned.length);
          setSelectedPills(new Set());
        } else {
          insertTokensAtCursor(cloned);
        }
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      return;
    }

    // If pills are selected, handle delete/backspace on them
    if (selectedPills.size > 0) {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteSelectedPills();
        return;
      }
      // Any non-modifier key deselects
      if (!isMod && !e.shiftKey && e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Meta' && e.key !== 'Alt') {
        setSelectedPills(new Set());
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showPalette && flatItems.length > 0) {
        setHighlightIndex(prev => Math.min(prev + 1, flatItems.length - 1));
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showPalette && flatItems.length > 0) {
        setHighlightIndex(prev => Math.max(prev - 1, 0));
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      if (inputText === '' && cursorPos > 0) {
        e.preventDefault();
        // Determine the visual token to the left of cursor
        const prevTok = row.tokens[cursorPos - 1];
        let stepBack = 1;
        if (prevTok?.type === 'property' && cursorPos >= 2 && (row.tokens[cursorPos - 2]?.type === 'reference' || row.tokens[cursorPos - 2]?.type === 'tokenRef')) {
          stepBack = 2;
        }
        const newCursor = cursorPos - stepBack;
        if (e.shiftKey) {
          // Shift+Left: extend selection to include the pill at newCursor
          const vt = visualTokens.find(v => v.startIndex === newCursor || (v.isMerged && v.startIndex === newCursor));
          if (vt) {
            setSelectedPills(prev => {
              const next = new Set(prev);
              if (next.has(vt.startIndex)) next.delete(vt.startIndex); else next.add(vt.startIndex);
              return next;
            });
          }
        } else {
          setSelectedPills(new Set());
        }
        setCursorPos(newCursor);
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      if (inputText === '' && cursorPos < row.tokens.length) {
        e.preventDefault();
        const nextTok = row.tokens[cursorPos];
        let stepFwd = 1;
        if ((nextTok?.type === 'reference' || nextTok?.type === 'tokenRef') && row.tokens[cursorPos + 1]?.type === 'property') {
          stepFwd = 2;
        }
        if (e.shiftKey) {
          // Shift+Right: extend selection to include the pill at cursorPos
          const vt = visualTokens.find(v => v.startIndex === cursorPos);
          if (vt) {
            setSelectedPills(prev => {
              const next = new Set(prev);
              if (next.has(vt.startIndex)) next.delete(vt.startIndex); else next.add(vt.startIndex);
              return next;
            });
          }
        } else {
          setSelectedPills(new Set());
        }
        setCursorPos(cursorPos + stepFwd);
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (showPalette && flatItems.length > 0 && highlightIndex < flatItems.length) {
        commitItem(flatItems[highlightIndex]);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // If the input is a pure number, commit it directly — don't let palette steal it (e.g. "10" matching "log10")
      const trimmedForNum = inputText.trim();
      if (trimmedForNum && !isNaN(Number(trimmedForNum)) && isFinite(Number(trimmedForNum))) {
        const newToken: ExpressionToken = { id: uid(), type: 'literal', value: trimmedForNum };
        insertTokensAtCursor([newToken]);
        setInputText('');
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      if (showPalette && flatItems.length > 0 && highlightIndex < flatItems.length) {
        commitItem(flatItems[highlightIndex]);
        return;
      }
      // Try to parse remaining text (non-numeric fallback)
      if (inputText.trim()) {
        const trimmed = inputText.trim();
        const num = parseFloat(trimmed);
        if (!isNaN(num)) {
          const newToken: ExpressionToken = { id: uid(), type: 'literal', value: trimmed };
          insertTokensAtCursor([newToken]);
          setInputText('');
          requestAnimationFrame(() => inputRef.current?.focus());
          return;
        }
        // Try as bare reference word (e.g. "parent", "self") → transition to property selection
        const bareRef = trimmed.toLowerCase();
        if (bareRef === 'parent' || bareRef === 'self') {
          const refLabel = bareRef === 'parent' ? 'Parent' : 'Self';
          setInputText(`@${refLabel}.`);
          setHighlightIndex(0);
          setShowPalette(true);
          requestAnimationFrame(() => inputRef.current?.focus());
          return;
        }
      }
      setInputText('');
      return;
    }
    if (e.key === 'Backspace' && inputText === '') {
      e.preventDefault();
      if (cursorPos > 0) {
        // Check for merged pair before cursor (reference+property or tokenRef+property)
        const prevTok = row.tokens[cursorPos - 1];
        if (prevTok?.type === 'property' && cursorPos >= 2 && (row.tokens[cursorPos - 2]?.type === 'reference' || row.tokens[cursorPos - 2]?.type === 'tokenRef')) {
          const newTokens = [...row.tokens];
          newTokens.splice(cursorPos - 2, 2);
          onUpdate({ ...row, tokens: newTokens });
          setCursorPos(cursorPos - 2);
        } else {
          const newTokens = [...row.tokens];
          newTokens.splice(cursorPos - 1, 1);
          onUpdate({ ...row, tokens: newTokens });
          setCursorPos(cursorPos - 1);
        }
      }
      return;
    }
    if (e.key === 'Delete' && inputText === '') {
      e.preventDefault();
      if (cursorPos < row.tokens.length) {
        const nextTok = row.tokens[cursorPos];
        if ((nextTok?.type === 'reference' || nextTok?.type === 'tokenRef') && row.tokens[cursorPos + 1]?.type === 'property') {
          const newTokens = [...row.tokens];
          newTokens.splice(cursorPos, 2);
          onUpdate({ ...row, tokens: newTokens });
        } else {
          const newTokens = [...row.tokens];
          newTokens.splice(cursorPos, 1);
          onUpdate({ ...row, tokens: newTokens });
        }
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowPalette(false);
      setInputText('');
      return;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    setSelectedPills(new Set());

    // Auto-commit recognized single-char operators when typed inline
    const operatorChars: Record<string, ExpressionToken['type']> = {
      '>': 'operator', '<': 'operator', '+': 'operator', '-': 'operator',
      '*': 'operator', '/': 'operator', '%': 'operator', '(': 'paren', ')': 'paren', ',': 'comma',
    };

    // Check for multi-char operators
    if (val === '>=' || val === '<=' || val === '==' || val === '!=') {
      const newToken: ExpressionToken = { id: uid(), type: 'operator', value: val, displayLabel: val };
      insertTokensAtCursor([newToken]);
      setInputText('');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    // Single char operators - only auto-commit if it's a standalone operator character
    // and not part of a multi-char operator being typed
    if (val.length === 1 && operatorChars[val] && val !== '>' && val !== '<' && val !== '!' && val !== '=') {
      const newToken: ExpressionToken = { id: uid(), type: operatorChars[val], value: val, displayLabel: val };
      insertTokensAtCursor([newToken]);
      setInputText('');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    // Auto-commit function name + opening paren when user types e.g. "lerp("
    if (val.endsWith('(') && val.length > 1) {
      const fnName = val.slice(0, -1).toLowerCase();
      const knownFunctions = new Set([
        'clamp', 'min', 'max', 'round', 'abs', 'floor', 'ceil',
        'lerp', 'map', 'mod', 'pow', 'sqrt',
        'step', 'smoothstep', 'sign', 'snap',
        'sin', 'cos', 'tan', 'atan2', 'log', 'log2', 'log10', 'exp', 'fract', 'inverselerp', 'invlerp',
        'luminance', 'contrast', 'apca', 'huelerp', 'srgbtolinear', 'lineartosrgb', 'deltae',
        // Token compute functions
        'lighten', 'darken', 'mix', 'saturate', 'desaturate', 'adjusthue',
        'complement', 'tint', 'shade', 'opacity', 'rgba',
      ]);
      if (knownFunctions.has(fnName)) {
        const fnToken: ExpressionToken = { id: uid(), type: 'function', value: fnName, displayLabel: fnName };
        const parenToken: ExpressionToken = { id: uid(), type: 'paren', value: '(' };
        insertTokensAtCursor([fnToken, parenToken]);
        setInputText('');
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
    }

    // Auto-commit token reference when user types closing brace: {tokenName}
    if (val.endsWith('}') && val.startsWith('{') && val.length > 2) {
      const tokenName = val.slice(1, -1);
      // Find matching tokenRef from palette (search against current items)
      const matchRef = paletteItems.find(pi =>
        pi.tokenType === 'tokenRef' && pi.isBareRef &&
        (pi.label === tokenName || pi.label === `{${tokenName}}`)
      );
      if (matchRef) {
        const tRefToken: ExpressionToken = {
          id: uid(), type: 'tokenRef', value: `{${tokenName}}`, displayLabel: `{${tokenName}}`,
          refTokenId: matchRef.refTokenId, refTokenColor: matchRef.refTokenColor,
        };
        insertTokensAtCursor([tRefToken]);
      } else {
        // Palette match failed — try resolving refTokenId from designTokens by name
        const matchToken = designTokens.find(dt => dt.name === tokenName || dt.name.toLowerCase() === tokenName.toLowerCase());
        const tRefToken: ExpressionToken = {
          id: uid(), type: 'tokenRef', value: `{${tokenName}}`, displayLabel: `{${tokenName}}`,
          ...(matchToken ? { refTokenId: matchToken.id } : {}),
        };
        insertTokensAtCursor([tRefToken]);
      }
      setInputText('');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    // Always keep palette open while input is focused (filtering happens automatically)
    setShowPalette(true);
  };

  // Auto-commit on space: numbers, held-back operators, recognized keywords, and references
  const handleInputKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' && inputText.trim()) {
      const trimmed = inputText.trim();
      const lower = trimmed.toLowerCase();

      // Try as number
      const num = parseFloat(trimmed);
      if (!isNaN(num)) {
        const newToken: ExpressionToken = { id: uid(), type: 'literal', value: trimmed, displayLabel: trimmed };
        insertTokensAtCursor([newToken]);
        setInputText('');
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      // Try as single-char operator that was held back (>, <)
      const heldOperators: Record<string, ExpressionToken['type']> = {
        '>': 'operator', '<': 'operator',
      };
      if (heldOperators[trimmed]) {
        const newToken: ExpressionToken = { id: uid(), type: heldOperators[trimmed], value: trimmed, displayLabel: trimmed };
        insertTokensAtCursor([newToken]);
        setInputText('');
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      // Try as recognized keyword — auto-commit on space
      const keywordMap: Record<string, { type: ExpressionToken['type']; value: string; label: string }> = {
        'if': { type: 'keyword', value: 'if', label: 'if' },
        'then': { type: 'keyword', value: 'then', label: 'then' },
        'else': { type: 'keyword', value: 'else', label: 'else' },
        'and': { type: 'keyword', value: 'AND', label: 'AND' },
        'or': { type: 'keyword', value: 'OR', label: 'OR' },
        'true': { type: 'boolean', value: 'true', label: 'true' },
        'false': { type: 'boolean', value: 'false', label: 'false' },
        'locked': { type: 'keyword', value: 'locked', label: 'locked' },
      };
      if (keywordMap[lower]) {
        const kw = keywordMap[lower];
        const newToken: ExpressionToken = { id: uid(), type: kw.type, value: kw.value, displayLabel: kw.label };
        insertTokensAtCursor([newToken]);
        setInputText('');
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      // Try as recognized function name — auto-commit function + opening paren on space
      const functionNames = new Set([
        'clamp', 'min', 'max', 'round', 'abs', 'floor', 'ceil',
        'lerp', 'map', 'mod', 'pow', 'sqrt',
        'step', 'smoothstep', 'sign', 'snap',
        'sin', 'cos', 'tan', 'atan2', 'log', 'log2', 'log10', 'exp', 'fract', 'inverselerp', 'invlerp',
        'luminance', 'contrast', 'apca', 'huelerp', 'srgbtolinear', 'lineartosrgb', 'deltae',
        // Token compute functions
        'lighten', 'darken', 'mix', 'saturate', 'desaturate', 'adjusthue',
        'complement', 'tint', 'shade', 'opacity', 'rgba',
      ]);
      if (functionNames.has(lower)) {
        const fnToken: ExpressionToken = { id: uid(), type: 'function', value: lower, displayLabel: lower };
        const parenToken: ExpressionToken = { id: uid(), type: 'paren', value: '(' };
        insertTokensAtCursor([fnToken, parenToken]);
        setInputText('');
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      // Try as token reference: {tokenName} → auto-commit as tokenRef on space
      if (trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.length > 2) {
        const tokenName = trimmed.slice(1, -1);
        // Find matching token ref in palette
        const matchingItem = paletteItems.find(pi =>
          pi.tokenType === 'tokenRef' && pi.isBareRef &&
          (pi.label === `{${tokenName}}` || pi.label === tokenName)
        );
        if (matchingItem) {
          commitItem(matchingItem);
          return;
        }
        // Palette match failed — try resolving refTokenId from designTokens by name
        const matchToken = designTokens.find(dt => dt.name === tokenName || dt.name.toLowerCase() === tokenName.toLowerCase());
        const tRefToken: ExpressionToken = {
          id: uid(),
          type: 'tokenRef',
          value: `{${tokenName}}`,
          displayLabel: `{${tokenName}}`,
          ...(matchToken ? { refTokenId: matchToken.id } : {}),
        };
        insertTokensAtCursor([tRefToken]);
        setInputText('');
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      // Try as bare reference word → transition to property selection
      if (lower === 'parent' || lower === 'self') {
        const refLabel = lower === 'parent' ? 'Parent' : 'Self';
        setInputText(`@${refLabel}.`);
        setHighlightIndex(0);
        setShowPalette(true);
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
    }
  };

  // Helper: clickable gap zone between pills for cursor positioning
  const renderGap = (targetCursorPos: number, key: string) => (
    <span
      key={key}
      className="advanced-row-gap"
      onClick={(e) => {
        e.stopPropagation();
        setCursorPos(targetCursorPos);
        setSelectedPills(new Set());
        setShowPalette(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }}
    />
  );

  // Render pills with cursor and clickable gaps
  const renderTokensWithCursor = () => {
    const elements: React.ReactNode[] = [];

    // Normalize cursor: snap out of merged pairs
    let normCursor = cursorPos;
    for (const vt of visualTokens) {
      if (vt.isMerged && normCursor === vt.startIndex + 1) {
        normCursor = vt.startIndex + 2;
        break;
      }
    }

    for (let vi = 0; vi < visualTokens.length; vi++) {
      const vt = visualTokens[vi];

      // Insert input at cursor position (before this visual token)
      if (normCursor === vt.startIndex) {
        elements.push(renderInput(`input-before-${vt.startIndex}`));
      } else {
        // Insert a clickable gap before this token (if cursor is NOT here)
        // Skip the leading gap if this is the first token (handled by container click)
        if (vi === 0) {
          elements.push(renderGap(vt.startIndex, `gap-start`));
        }
      }

      if (vt.isMerged) {
        const refToken = row.tokens[vt.startIndex];
        const propToken = row.tokens[vt.startIndex + 1];
        const mergedLabel = `${refToken.displayLabel || refToken.value}${propToken.displayLabel || propToken.value}`;
        const isSelected = selectedPills.has(vt.startIndex);
        elements.push(
          <TokenPill
            key={refToken.id}
            token={refToken}
            isMerged
            mergedLabel={mergedLabel}
            isSelected={isSelected}
            vtIndex={vt.startIndex}
            onMouseDown={(e) => handlePillMouseDown(vt.startIndex, e)}
            onMouseEnter={() => handlePillMouseEnter(vt.startIndex)}
            onContextMenu={(e) => handlePillContextMenu(e, vt.startIndex)}
            onClick={(e) => {
              e.stopPropagation();
              if (isDragging) return; // drag end handled by mouseup
              if (e.shiftKey) {
                setSelectedPills(prev => {
                  const next = new Set(prev);
                  if (next.has(vt.startIndex)) next.delete(vt.startIndex); else next.add(vt.startIndex);
                  return next;
                });
                return;
              }
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const isLeftHalf = clickX < rect.width / 2;
              setSelectedPills(new Set());
              setCursorPos(isLeftHalf ? vt.startIndex : vt.startIndex + 2);
              setShowPalette(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          />
        );
      } else {
        const token = row.tokens[vt.startIndex];
        const isSelected = selectedPills.has(vt.startIndex);
        elements.push(
          <TokenPill
            key={token.id}
            token={token}
            isSelected={isSelected}
            vtIndex={vt.startIndex}
            onMouseDown={(e) => handlePillMouseDown(vt.startIndex, e)}
            onMouseEnter={() => handlePillMouseEnter(vt.startIndex)}
            onContextMenu={(e) => handlePillContextMenu(e, vt.startIndex)}
            onClick={(e) => {
              e.stopPropagation();
              if (isDragging) return;
              if (e.shiftKey) {
                setSelectedPills(prev => {
                  const next = new Set(prev);
                  if (next.has(vt.startIndex)) next.delete(vt.startIndex); else next.add(vt.startIndex);
                  return next;
                });
                return;
              }
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const isLeftHalf = clickX < rect.width / 2;
              setSelectedPills(new Set());
              setCursorPos(isLeftHalf ? vt.startIndex : vt.startIndex + vt.count);
              setShowPalette(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          />
        );
      }

      // After this pill (and before next), add a gap if cursor is not between them
      const nextCursorPos = vt.startIndex + vt.count;
      if (normCursor !== nextCursorPos && vi < visualTokens.length - 1) {
        elements.push(renderGap(nextCursorPos, `gap-after-${vt.startIndex}`));
      }
    }

    // Input at the end (or if no tokens)
    if (normCursor >= row.tokens.length) {
      elements.push(renderInput('input-end'));
    } else if (visualTokens.length > 0) {
      // If cursor is after the last token (but not rendered yet), show input
      const lastVt = visualTokens[visualTokens.length - 1];
      const afterLast = lastVt.startIndex + lastVt.count;
      if (normCursor === afterLast) {
        // Already handled by the loop (input-before or input-end)
      }
    }

    return elements;
  };

  const renderInput = (key: string) => (
    <input
      key={key}
      ref={inputRef}
      className="advanced-row-input"
      data-testid={testIdBase ? `${testIdBase}-input` : undefined}
      style={{ width: `${Math.max(row.tokens.length > 0 ? 6 : 60, inputText.length * 7 + 4)}px`, minWidth: row.tokens.length > 0 ? '6px' : '60px' }}
      placeholder={row.tokens.length === 0 ? 'Type expression...' : ''}
      value={inputText}
      onChange={handleInputChange}
      onKeyDown={handleKeyDown}
      onKeyUp={handleInputKeyUp}
      onFocus={() => {
        // Cancel any pending blur timeout — we're focused again
        if (blurTimeoutRef.current) {
          clearTimeout(blurTimeoutRef.current);
          blurTimeoutRef.current = null;
        }
        setShowPalette(true);
        setSelectedPills(new Set());
      }}
      onBlur={() => {
        // Small delay so portal dropdown clicks and commit transitions register before we close
        blurTimeoutRef.current = setTimeout(() => {
          blurTimeoutRef.current = null;
          // Don't close if input is already re-focused (e.g. after commitItem transition)
          if (document.activeElement === inputRef.current) return;
          if (!dropdownRef.current?.matches(':hover')) {
            setShowPalette(false);
            setInputText('');
          }
        }, 200);
      }}
    />
  );

  return (
    <div
      ref={rowRef}
      className="advanced-row"
      data-testid={testIdBase ? `${testIdBase}-row` : undefined}
      data-palette-open={showPalette || undefined}
      data-row-enabled={row.enabled ? 'true' : 'false'}
    >
      <div className="advanced-row-inner">
        {/* Enable/disable dot */}
        <button
          className="advanced-row-enable-btn"
          data-testid={testIdBase ? `${testIdBase}-enable` : undefined}
          onClick={() => onUpdate({ ...row, enabled: !row.enabled })}
          title={row.enabled ? 'Disable condition' : 'Enable condition'}
        >
          <Circle
            size={8}
            fill={row.enabled ? 'var(--status-success)' : 'var(--on-surface-disabled)'}
            stroke="none"
          />
        </button>

        {/* Expression tokens + cursor-positioned input */}
        <div
          ref={expressionContainerRef}
          className="advanced-row-expression"
          data-testid={testIdBase ? `${testIdBase}-expression` : undefined}
          onClick={(e) => {
            // Click in the container background (not on a pill or gap) → move cursor to end
            if (e.target === e.currentTarget) {
              setCursorPos(row.tokens.length);
              setSelectedPills(new Set());
              setShowPalette(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }
          }}
          style={{ opacity: row.enabled ? 1 : 0.4 }}
        >
          {renderTokensWithCursor()}
          {/* Selection count badge */}
          {selectedPills.size > 1 && (
            <span
              className="advanced-row-selection-badge"
            >
              {selectedPills.size} sel
            </span>
          )}
        </div>

        {/* Copy + Delete buttons — visible on row hover */}
        <div className="advanced-row-actions">
          {onCopy && (
            <button
              className="advanced-row-copy-btn"
              data-testid={testIdBase ? `${testIdBase}-copy` : undefined}
              onClick={onCopy}
              title="Copy condition"
            >
              <Copy size={10} />
            </button>
          )}
          <button
            className="advanced-row-delete-btn"
            data-testid={testIdBase ? `${testIdBase}-delete` : undefined}
            onClick={onDelete}
            title="Delete condition"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* ── Context menu on pills (portal) ── */}
      {ctxMenu && createPortal(
        <div
          className="advanced-ctx-menu"
          style={{
            left: ctxMenu.x,
            top: ctxMenu.y,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="advanced-ctx-menu-item"
            onClick={() => {
              _expressionClipboard = getSelectedTokens();
              setCtxMenu(null);
            }}
          >
            <Copy size={11} style={{ color: 'var(--icon-info)' }} /> Copy
            <span className="advanced-ctx-menu-shortcut">⌘C</span>
          </button>
          <button
            className="advanced-ctx-menu-item"
            onClick={() => {
              cutSelectedPills();
              setCtxMenu(null);
            }}
          >
            <Scissors size={11} style={{ color: 'var(--icon-warning)' }} /> Cut
            <span className="advanced-ctx-menu-shortcut">⌘X</span>
          </button>
          {((_expressionClipboard && _expressionClipboard.length > 0) ||
            (_conditionClipboard && _conditionClipboard.rows.length > 0 && _conditionClipboard.rows[0].tokens.length > 0)) && (
            <button
              className="advanced-ctx-menu-item"
              onClick={() => {
                // Prefer expression clipboard; fall back to condition clipboard tokens
                const sourceTokens = (_expressionClipboard && _expressionClipboard.length > 0)
                  ? _expressionClipboard
                  : _conditionClipboard!.rows[0].tokens;
                const cloned = sourceTokens.map(t => ({ ...t, id: uid() }));
                if (selectedPills.size > 0) {
                  const indicesToRemove = new Set<number>();
                  for (const vtIdx of selectedPills) {
                    const vt = visualTokens.find(v => v.startIndex === vtIdx);
                    if (vt) { for (let k = 0; k < vt.count; k++) indicesToRemove.add(vt.startIndex + k); }
                  }
                  const minRemoved = Math.min(...indicesToRemove);
                  const remaining = row.tokens.filter((_, i) => !indicesToRemove.has(i));
                  const insertPos = Math.min(minRemoved, remaining.length);
                  const before = remaining.slice(0, insertPos);
                  const after = remaining.slice(insertPos);
                  onUpdate({ ...row, tokens: [...before, ...cloned, ...after] });
                  setCursorPos(insertPos + cloned.length);
                  setSelectedPills(new Set());
                } else {
                  insertTokensAtCursor(cloned);
                }
                setCtxMenu(null);
              }}
            >
              <ClipboardPaste size={11} style={{ color: 'var(--icon-success)' }} /> Paste
              <span className="advanced-ctx-menu-shortcut">⌘V</span>
            </button>
          )}
          <div className="advanced-ctx-menu-divider" />
          <button
            className="advanced-ctx-menu-item"
            onClick={() => {
              deleteSelectedPills();
              setCtxMenu(null);
            }}
          >
            <Trash2 size={11} style={{ color: 'var(--icon-critical)' }} /> Delete
            <span className="advanced-ctx-menu-shortcut">⌫</span>
          </button>
        </div>,
        document.body,
      )}

      {/* ── Command Palette Dropdown (portal to escape overflow clipping) ── */}
      {showPalette && filteredItems.length > 0 && createPortal(
        <DropdownPortal
          rowRef={rowRef}
          dropdownRef={dropdownRef}
          groupedItems={groupedItems}
          flatItems={flatItems}
          highlightIndex={highlightIndex}
          setHighlightIndex={setHighlightIndex}
          commitItem={commitItem}
        />,
        document.body,
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// OutputNameInput — local-state editing to fix "can't clear" bug
// ═════════════════════════════════════════════════════════════════

function OutputNameInput({ value, defaultName, onChange }: {
  value: string | undefined;
  defaultName: string;
  onChange: (name: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState('');
  const displayValue = isEditing ? localValue : (value || defaultName);

  return (
    <input
      className="advanced-output-name-input"
      value={displayValue}
      onChange={(e) => {
        setLocalValue(e.target.value);
        if (!isEditing) setIsEditing(true);
      }}
      onFocus={(e) => {
        setIsEditing(true);
        setLocalValue(value || defaultName);
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={() => {
        setIsEditing(false);
        const trimmed = localValue.trim();
        onChange(trimmed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setIsEditing(false);
          setLocalValue(value || defaultName);
          (e.target as HTMLInputElement).blur();
        }
      }}
      spellCheck={false}
    />
  );
}

// ═════════════════════════════════════════════════════════════════
// ChannelColumn — one column (Hue / Saturation / etc.)
// ═════════════════════════════════════════════════════════════════

interface ChannelColumnProps {
  channelDef: ChannelDef;
  channelKey: string;
  colorSpace: string;
  node: ColorNodeType;
  nodes: ColorNodeType[];
  channelLogic: ChannelLogic | undefined;
  baseValue: number;
  evalCtx: EvalContext;
  isLast?: boolean;
  onUpdateChannelLogic: (channelKey: string, logic: ChannelLogic) => void;
  onSaveChannel: (channelKey: string) => void;
  channelHasUnsaved: boolean;
  channelSaveFlash: boolean;
}

function ChannelColumn({
  channelDef,
  channelKey,
  colorSpace,
  node,
  nodes,
  channelLogic,
  baseValue,
  evalCtx,
  isLast,
  onUpdateChannelLogic,
  onSaveChannel,
  channelHasUnsaved,
  channelSaveFlash,
}: ChannelColumnProps) {
  const logic = channelLogic || { rows: [], fallbackMode: 'default' as const };
  const hasRows = logic.rows.length > 0;

  // Augment evalCtx with currentChannel so `locked` keyword resolves correctly
  const channelEvalCtx = useMemo<EvalContext>(() => ({
    ...evalCtx,
    currentChannel: channelKey,
  }), [evalCtx, channelKey]);

  // Auto-evaluate all rows for per-row output display
  const detailedResult = useMemo(() => {
    if (!hasRows) return null;
    return evaluateChannelLogicDetailed(logic, channelEvalCtx, baseValue);
  }, [logic, channelEvalCtx, baseValue, hasRows]);

  // Map rowId → RowOutput for easy lookup
  const rowOutputMap = useMemo(() => {
    const map = new Map<string, RowOutput>();
    if (detailedResult) {
      detailedResult.rowOutputs.forEach(ro => map.set(ro.rowId, ro));
    }
    return map;
  }, [detailedResult]);

  const updateRow = (index: number, updatedRow: ConditionRow) => {
    const newRows = [...logic.rows];
    newRows[index] = updatedRow;
    onUpdateChannelLogic(channelKey, { ...logic, rows: newRows });
  };

  const updateRowOutputName = (index: number, newName: string) => {
    const newRows = [...logic.rows];
    newRows[index] = { ...newRows[index], outputName: newName || undefined };
    onUpdateChannelLogic(channelKey, { ...logic, rows: newRows });
  };

  const deleteRow = (index: number) => {
    const newRows = logic.rows.filter((_, i) => i !== index);
    onUpdateChannelLogic(channelKey, { ...logic, rows: newRows });
  };

  const addRow = () => {
    const newRow: ConditionRow = {
      id: uid(),
      tokens: [],
      enabled: true,
      outputName: `out_${logic.rows.length + 1}`,
    };
    onUpdateChannelLogic(channelKey, { ...logic, rows: [...logic.rows, newRow] });
  };

  const [headerHovered, setHeaderHovered] = useState(false);
  const [columnHovered, setColumnHovered] = useState(false);
  const [, setClipVer] = useState(_clipboardVersion);
  const hasClipboard = !!_conditionClipboard && _conditionClipboard.rows.length > 0;

  const handleCopyColumn = useCallback(() => {
    if (logic.rows.length === 0) return;
    _conditionClipboard = { rows: logic.rows.map(deepCloneRow), sourceLabel: channelDef.label };
    _clipboardVersion++;
    setClipVer(_clipboardVersion);
  }, [logic.rows, channelDef.label]);

  const handlePasteColumn = useCallback((append = false) => {
    if (!_conditionClipboard || _conditionClipboard.rows.length === 0) return;
    const count = _conditionClipboard.rows.length;
    const src = _conditionClipboard.sourceLabel || 'clipboard';
    if (append) {
      const offset = logic.rows.length;
      const cloned = cloneRowsWithNewIds(_conditionClipboard.rows, offset);
      onUpdateChannelLogic(channelKey, { ...logic, rows: [...logic.rows, ...cloned] });
    } else {
      const cloned = cloneRowsWithNewIds(_conditionClipboard.rows);
      onUpdateChannelLogic(channelKey, { ...logic, rows: cloned });
    }
  }, [channelKey, channelDef.label, logic, onUpdateChannelLogic]);

  const handleCopyRow = useCallback((row: ConditionRow) => {
    _conditionClipboard = { rows: [deepCloneRow(row)], sourceLabel: `${channelDef.label} row` };
    _clipboardVersion++;
    setClipVer(_clipboardVersion);
  }, [channelDef.label]);

  // Re-sync clipboard version on header hover so paste button reflects latest state
  const onHeaderEnter = useCallback(() => {
    setHeaderHovered(true);
    setClipVer(_clipboardVersion);
  }, []);

  // ── Keyboard shortcuts: Ctrl+C / Ctrl+V on hovered column ──
  useEffect(() => {
    if (!columnHovered) return;
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      const isInputLike = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key === 'c') {
        // Don't intercept copy when user is in an editable field (they want to copy text)
        if (isInputLike) return;
        if (logic.rows.length === 0) return;
        e.preventDefault();
        handleCopyColumn();
      } else if (e.key === 'v') {
        // Must have condition data to paste
        if (!_conditionClipboard || _conditionClipboard.rows.length === 0) return;
        // If user is focused on an input (e.g. expression input inside a
        // ConditionRowEditor), let the row-level handler deal with the paste
        // so that only the target row is affected — not the entire column.
        if (isInputLike) return;
        e.preventDefault();
        handlePasteColumn(e.shiftKey);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [columnHovered, handleCopyColumn, handlePasteColumn, logic.rows.length]);

  return (
    <div
      className="advanced-channel-col"
      data-testid={`advanced-channel-column-${channelKey}`}
      style={{
        borderRight: isLast ? 'none' : '1px solid var(--border-subtle)',
        outline: columnHovered ? '1px solid color-mix(in srgb, var(--border-focus) 8%, transparent)' : 'none',
      }}
      onMouseEnter={() => setColumnHovered(true)}
      onMouseLeave={() => setColumnHovered(false)}
    >
      {/* Column header */}
      <div
        className="advanced-channel-header"
        onMouseEnter={onHeaderEnter}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        <div className="advanced-channel-header-left">
          <span className="advanced-channel-label">
            {channelDef.label}
          </span>
          {hasRows && (
            <button
              className="advanced-channel-play-btn"
              data-testid={`advanced-channel-play-${channelKey}`}
              onClick={() => onSaveChannel(channelKey)}
              title="Re-evaluate and apply logic"
            >
              <Play size={8} style={{ color: 'var(--icon-success)' }} fill="var(--icon-success)" />
            </button>
          )}
          {/* Copy / Paste column buttons — visible on header hover */}
          {headerHovered && (
            <>
              {hasRows && (
                <button
                  className="advanced-channel-copy-btn"
                  onClick={handleCopyColumn}
                  title={`Copy all ${channelDef.label} conditions (⌘C)`}
                >
                  <Copy size={8} style={{ color: 'var(--icon-disabled)' }} />
                </button>
              )}
              {hasClipboard && (
                <button
                  className="advanced-channel-paste-btn"
                  onClick={(e) => handlePasteColumn(e.shiftKey)}
                  title={`Paste${_conditionClipboard?.sourceLabel ? ` from ${_conditionClipboard.sourceLabel}` : ''} (${_conditionClipboard?.rows.length} row${(_conditionClipboard?.rows.length ?? 0) > 1 ? 's' : ''}) · ⌘V · Shift = append`}
                >
                  <ClipboardPaste size={8} style={{ color: 'var(--icon-info)' }} />
                </button>
              )}
            </>
          )}
          {channelHasUnsaved && (
            <span className="advanced-channel-unsaved">unsaved</span>
          )}
        </div>
        <div className="advanced-channel-header-right">
          <span className="advanced-channel-base-value">
            {fmtVal(baseValue, channelKey)}{getUnit(channelKey, colorSpace)}
          </span>
          {/* Per-column save button with text */}
          {channelHasUnsaved ? (
            <button
              className="advanced-channel-save-btn"
              data-testid={`advanced-channel-save-${channelKey}`}
              onClick={() => onSaveChannel(channelKey)}
              title={`Save ${channelDef.label} logic`}
            >
              <Save size={9} style={{ color: 'var(--icon-success)' }} />
              <span className="advanced-channel-save-label">Save</span>
            </button>
          ) : channelSaveFlash ? (
            <span className="advanced-channel-saved-badge">
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="var(--status-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="advanced-channel-saved-label">Saved</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Column body — condition rows with per-row outputs */}
      <div className="advanced-channel-body">
        {logic.rows.map((row, index) => {
          const rowOutput = rowOutputMap.get(row.id);
          const outputName = row.outputName || `out_${index + 1}`;
          return (
            <div key={row.id}>
              <ConditionRowEditor
                row={row}
                channelKey={channelKey}
                colorSpace={colorSpace}
                node={node}
                nodes={nodes}
                evalCtx={channelEvalCtx}
                onUpdate={(updatedRow) => updateRow(index, updatedRow)}
                onDelete={() => deleteRow(index)}
                onCopy={() => handleCopyRow(row)}
                availableLocals={logic.rows.slice(0, index).map((r, i) => r.outputName || `out_${i + 1}`)}
                testIdBase={`advanced-row-${channelKey}-${index}`}
              />
              {/* Per-row output box */}
              <div className="advanced-row-output" data-testid={`advanced-row-output-${channelKey}-${index}`}>
                <div className="advanced-row-output-left">
                  <span className="advanced-row-output-dollar">$</span>
                  <OutputNameInput
                    value={row.outputName}
                    defaultName={`out_${index + 1}`}
                    onChange={(name) => updateRowOutputName(index, name)}
                  />
                </div>
                <span className="advanced-row-output-value" style={{
                  color: rowOutput?.error ? 'var(--text-critical)'
                    : rowOutput?.skipped ? 'var(--text-disabled)'
                    : rowOutput?.isNaN ? 'var(--text-disabled)'
                    : rowOutput?.isBoolean ? 'var(--text-info)'
                    : rowOutput?.value !== null ? 'var(--text-tertiary)'
                    : 'var(--text-disabled)',
                }}>
                  {rowOutput?.error ? 'err'
                    : rowOutput?.skipped ? '—'
                    : rowOutput?.isNaN ? 'skip'
                    : rowOutput?.isBoolean && rowOutput?.value !== null
                      ? (rowOutput.value ? 'true' : 'false')
                    : rowOutput?.value !== null
                      ? `${Math.round(rowOutput.value * 100) / 100}${getUnit(channelKey, colorSpace)}`
                      : '—'
                  }
                </span>
              </div>
            </div>
          );
        })}

        {/* Add condition row */}
        <button
          className="advanced-add-condition-btn"
          data-testid={`advanced-add-condition-${channelKey}`}
          onClick={addRow}
        >
          <Plus size={10} />
          <span>Add condition</span>
        </button>
      </div>

      {/* Constraint Bar + Final Output — always visible when rows exist */}
      {hasRows && (() => {
        // Build list of available output variable names from all rows
        const availableOutputs = logic.rows.map((r, i) => r.outputName || `out_${i + 1}`);
        const selectedVar = logic.finalOutputVar;
        // Determine if the selected variable is valid
        const selectedVarValid = selectedVar ? detailedResult?.locals[selectedVar] !== undefined : false;
        // Check if the selected variable is boolean (can't be used as channel value)
        const selectedVarIsBoolean = selectedVar ? detailedResult?.booleanLocals?.has(selectedVar) ?? false : false;
        // A variable is usable only if it exists AND is not boolean
        const selectedVarUsable = selectedVarValid && !selectedVarIsBoolean;
        // Compute fallback value
        const fallbackVal = logic.fallbackMode === 'custom' && logic.fallbackValue !== undefined
          ? logic.fallbackValue
          : baseValue;
        // Resolve the RAW final displayed value (before constraint)
        const rawResolvedValue = selectedVarUsable
          ? detailedResult!.locals[selectedVar!]
          : selectedVar
            ? fallbackVal
            : detailedResult?.finalValue;
        const resolvedSource: 'logic' | 'fallback' = selectedVarUsable
          ? 'logic'
          : selectedVar
            ? 'fallback'
            : (detailedResult?.finalSource ?? 'fallback');
        const hasValidationError = !!selectedVar && !selectedVarValid;
        const hasBooleanWarning = !!selectedVar && selectedVarIsBoolean;

        // ── Constraint computation ──
        const isAutoConstrain = logic.autoConstrain !== false; // default true
        const constraintInfo = rawResolvedValue !== undefined && resolvedSource === 'logic'
          ? constrainChannelValue(channelKey, rawResolvedValue)
          : null;
        const showConstraintBar = constraintInfo?.wasConstrained ?? false;
        // The value that will actually be applied to the node
        const displayValue = (isAutoConstrain && constraintInfo?.wasConstrained)
          ? constraintInfo.constrained
          : rawResolvedValue;

        const warningMessage = hasValidationError
          ? `$${selectedVar} has no value — using fallback (${fmtVal(fallbackVal, channelKey)}${getUnit(channelKey, colorSpace)})`
          : hasBooleanWarning
            ? `$${selectedVar} is boolean — using fallback (${fmtVal(fallbackVal, channelKey)}${getUnit(channelKey, colorSpace)})`
            : null;

        const constraint = CHANNEL_CONSTRAINTS[channelKey];
        const unit = getUnit(channelKey, colorSpace);

        return (
          <>
            {/* ── Constraint Bar — shows when raw value exceeds channel range ── */}
            {showConstraintBar && (
              <div
                className="advanced-constraint-bar"
                style={{
                  borderTop: '1px solid var(--border-warning)',
                  background: isAutoConstrain
                    ? 'var(--surface-warning-subtle)'
                    : 'var(--surface-critical-subtle)',
                }}
              >
                <div className="advanced-constraint-bar-inner">
                  <div className="advanced-constraint-bar-left">
                    {/* Shield/constrain icon */}
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="advanced-constraint-icon">
                      <path
                        d="M8 1L2 4v4c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V4L8 1z"
                        fill={isAutoConstrain ? 'color-mix(in srgb, var(--status-warning) 30%, transparent)' : 'color-mix(in srgb, var(--status-critical) 20%, transparent)'}
                        stroke={isAutoConstrain ? 'var(--status-warning)' : 'var(--status-critical)'}
                        strokeWidth="1.2"
                      />
                    </svg>
                    <span className="advanced-constraint-label" style={{
                      color: isAutoConstrain ? 'var(--text-warning)' : 'var(--text-critical)',
                    }}>
                      {isAutoConstrain ? 'Auto-Constrain' : 'Out of Range'}
                    </span>
                  </div>
                  <div className="advanced-constraint-bar-right">
                    {/* Raw → Constrained display */}
                    <span className="advanced-constraint-values" style={{
                      color: isAutoConstrain ? 'var(--text-warning)' : 'var(--text-critical)',
                    }}>
                      {constraintInfo && (
                        <>
                          <span style={{ opacity: 0.6 }}>{Math.round(constraintInfo.raw * 100) / 100}{unit}</span>
                          <span style={{ opacity: 0.4 }}>{' \u2192 '}</span>
                          <span>{Math.round(constraintInfo.constrained * 100) / 100}{unit}</span>
                          <span style={{ opacity: 0.5, marginLeft: '4px' }}>
                            ({constraintInfo.mode === 'wrap' ? 'wrapped' : 'clamped'})
                          </span>
                        </>
                      )}
                    </span>
                    {/* Toggle button */}
                    <button
                      className="advanced-constraint-toggle"
                      style={{
                        background: isAutoConstrain
                          ? 'color-mix(in srgb, var(--status-warning) 15%, transparent)'
                          : 'color-mix(in srgb, var(--surface-3) 40%, transparent)',
                        border: `1px solid ${isAutoConstrain ? 'color-mix(in srgb, var(--status-warning) 30%, transparent)' : 'color-mix(in srgb, var(--on-surface-disabled) 45%, transparent)'}`,
                      }}
                      title={isAutoConstrain
                        ? `Disable auto-constrain (allow values outside ${constraint?.min ?? 0}–${constraint?.max ?? '?'})`
                        : `Enable auto-constrain (${constraintInfo?.mode === 'wrap' ? 'wrap' : 'clamp'} to ${constraint?.min ?? 0}–${constraint?.max ?? '?'})`
                      }
                      onClick={() => {
                        onUpdateChannelLogic(channelKey, {
                          ...logic,
                          autoConstrain: !isAutoConstrain,
                        });
                      }}
                    >
                      {isAutoConstrain ? (
                        <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="var(--status-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <X size={7} style={{ color: 'var(--icon-disabled)' }} />
                      )}
                    </button>
                  </div>
                </div>
                {/* Range info line */}
                {!isAutoConstrain && constraint && (
                  <div className="advanced-constraint-range-info">
                    {Math.round(constraintInfo!.raw * 100) / 100}{unit} exceeds {channelKey} range ({constraint.min}–{constraint.max})
                  </div>
                )}
              </div>
            )}

            {/* ── Final Output bar ── */}
            <div className="advanced-final-output-wrapper">
              {/* Warning floated above the final output bar */}
              {warningMessage && (
                <div className="advanced-final-output-warning">
                  {warningMessage}
                </div>
              )}
              <div
                className="advanced-final-output"
                style={{
                  borderTop: showConstraintBar
                    ? 'none'
                    : '1px solid var(--border-success)',
                  background: resolvedSource === 'logic'
                    ? 'var(--surface-success-subtle)'
                    : 'color-mix(in srgb, var(--surface-3) 38%, transparent)',
                }}
              >
                <div className="advanced-final-output-inner">
                  {/* Left side: label + inline dropdown */}
                  <div className="advanced-final-output-left">
                    <span className="advanced-final-output-label" style={{
                      color: resolvedSource === 'logic' ? 'var(--text-success)' : 'var(--text-tertiary)',
                    }}>
                      Final Output
                    </span>
                    {/* Inline dropdown selector */}
                    {availableOutputs.length > 0 && (
                      <div className="advanced-final-output-select-wrapper">
                        <select
                          className="advanced-final-output-select"
                          data-testid={`advanced-final-output-select-${channelKey}`}
                          style={{
                            background: (hasValidationError || hasBooleanWarning)
                              ? 'color-mix(in srgb, var(--status-critical) 12%, transparent)'
                              : 'color-mix(in srgb, var(--status-success) 12%, transparent)',
                            color: (hasValidationError || hasBooleanWarning) ? 'var(--text-critical)' : 'var(--text-success)',
                            border: `1px solid ${(hasValidationError || hasBooleanWarning) ? 'color-mix(in srgb, var(--status-critical) 25%, transparent)' : 'color-mix(in srgb, var(--status-success) 25%, transparent)'}`,
                          }}
                          value={selectedVar || '__last__'}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateChannelLogic(channelKey, {
                              ...logic,
                              finalOutputVar: val === '__last__' ? undefined : val,
                            });
                          }}
                        >
                          <option value="__last__">last</option>
                          {availableOutputs.map((varName, i) => (
                            <option key={`${i}-${varName}`} value={varName}>${varName}</option>
                          ))}
                        </select>
                        <ChevronDown
                          size={8}
                          className="advanced-final-output-chevron"
                          style={{ color: (hasValidationError || hasBooleanWarning) ? 'var(--text-critical)' : 'var(--text-success)' }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Right side: value */}
                  {detailedResult?.finalError && !selectedVarUsable ? (
                    <span className="advanced-final-output-value-error" title={detailedResult.finalError}>
                      Error
                    </span>
                  ) : (
                    <span
                      className="advanced-final-output-value"
                      data-testid={`advanced-final-output-value-${channelKey}`}
                      style={{
                        color: resolvedSource === 'logic' ? 'var(--text-success)' : 'var(--text-disabled)',
                      }}
                    >
                      {displayValue !== undefined ? `${Math.round(displayValue * 100) / 100}${getUnit(channelKey, colorSpace)}` : '—'}
                      {resolvedSource === 'fallback' && (
                        <span className="advanced-final-output-fallback">(fallback)</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Fallback */}
      <div className="advanced-fallback-bar" data-testid={`advanced-fallback-${channelKey}`}>
        <span className="advanced-fallback-label">
          Fallback
        </span>
        <span className="advanced-fallback-value">
          {logic.fallbackMode === 'custom' && logic.fallbackValue !== undefined
            ? Math.round(logic.fallbackValue * 100) / 100
            : fmtVal(baseValue, channelKey)
          }
          {getUnit(channelKey, colorSpace)}
        </span>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// TokenAssignmentPanel — 2-column layout for token node Advanced
// ═════════════════════════════════════════════════════════════════

function TokenAssignmentPanel({ node, nodes, tokens, logic, tokenRefs, evalCtx, tokenEvalCtx, onUpdateLogic, onSave, previewResult, onPlay, hasUnsaved, saveFlash, pages }: {
  node: ColorNodeType; nodes: ColorNodeType[]; tokens: DesignToken[]; logic: TokenAssignmentLogic; tokenRefs: TokenRefInfo[];
  evalCtx: EvalContext; tokenEvalCtx: TokenEvalContext | null; onUpdateLogic: (l: TokenAssignmentLogic) => void; onSave: () => void;
  previewResult: TokenAssignResult | null; onPlay: () => void; hasUnsaved: boolean; saveFlash: boolean; pages?: Page[];
}) {
  const hasRows = logic.rows.length > 0;

  const tokenName = useMemo(() => {
    if (node.ownTokenId) { const ownT = tokens.find(t => t.id === node.ownTokenId); if (ownT) return ownT.name; }
    const buildPfx = (n: ColorNodeType): string => {
      if (!n.parentId) return n.referenceName || '';
      const p = nodes.find(pp => pp.id === n.parentId);
      if (!p) return n.referenceName || '';
      const pp = buildPfx(p);
      if (p.isTokenPrefix || p.isTokenNode) return pp ? `${pp}/${n.tokenNodeSuffix || ''}` : (n.tokenNodeSuffix || '');
      return n.referenceName || '';
    };
    return buildPfx(node) || node.tokenNodeSuffix || 'Token';
  }, [node, nodes, tokens]);

  const currentValueToken = useMemo(() => {
    if (node.valueTokenAssignments) {
      const fk = Object.keys(node.valueTokenAssignments)[0];
      if (fk) { const tid = node.valueTokenAssignments[fk]; const t = tokens.find(tk => tk.id === tid); return t ? t.name : null; }
    }
    if (node.valueTokenId) { const t = tokens.find(tk => tk.id === node.valueTokenId); return t ? t.name : null; }
    return null;
  }, [node, tokens]);

  // ── Auto-evaluate all rows for per-row output display ──
  const detailedResult = useMemo<DetailedTokenAssignResult | null>(() => {
    if (!hasRows || !tokenEvalCtx) {
      return null;
    }
    try {
      return evaluateTokenAssignmentDetailed(logic, tokenEvalCtx);
    } catch (e: any) {
      // Catch any unexpected errors to prevent component crash
      return {
        rowOutputs: logic.rows.map((r, i) => ({
          rowId: r.id, outputName: r.outputName || `out_${i + 1}`,
          result: { type: 'error' as const, message: e?.message || 'Unexpected evaluation error' },
          skipped: false, isNaN: false,
        })),
        finalResult: { type: 'error' as const, message: e?.message || 'Unexpected evaluation error' },
        finalSource: 'fallback' as const,
        locals: {},
      };
    }
  }, [logic, tokenEvalCtx, hasRows]);

  // Map rowId → TokenRowOutput for easy lookup
  const rowOutputMap = useMemo(() => {
    const map = new Map<string, TokenRowOutput>();
    if (detailedResult) {
      detailedResult.rowOutputs.forEach(ro => map.set(ro.rowId, ro));
    }
    return map;
  }, [detailedResult]);

  // Helper to get color space for a token ID (from its owner node)
  const getTokenColorSpace = useCallback((tokenId: string): string => {
    const ownerNode = nodes.find(n => n.ownTokenId === tokenId)
      || nodes.find(n => n.tokenAssignments && Object.values(n.tokenAssignments).some(ids => Array.isArray(ids) ? ids.includes(tokenId) : ids === tokenId))
      || nodes.find(n => n.valueTokenAssignments && Object.values(n.valueTokenAssignments).includes(tokenId))
      || nodes.find(n => n.tokenId === tokenId || n.tokenIds?.includes(tokenId));
    return ownerNode?.colorSpace || 'hsl';
  }, [nodes]);

  // Helper to get display string for a TokenColor in a given color space
  const formatColorDisplay = useCallback((tc: TokenColor, cs: string): string => {
    return tokenColorToDisplayString(tc, cs);
  }, []);

  // Helper to get the color space for a row (from the first tokenRef in the row's expression)
  const getRowColorSpace = useCallback((row: { tokens: { type: string; refTokenId?: string }[] }): string => {
    for (const tok of row.tokens) {
      if (tok.type === 'tokenRef' && tok.refTokenId) {
        return getTokenColorSpace(tok.refTokenId);
      }
    }
    return 'hsl';
  }, [getTokenColorSpace]);

  // Helper to get CSS color for a token ID
  const getTokenCssColor = useCallback((tokenId: string): string => {
    const t = tokens.find(tk => tk.id === tokenId);
    if (!t) return 'var(--text-disabled)';
    if (t.themeValues) {
      const fv = Object.values(t.themeValues)[0];
      if (fv) return `hsla(${fv.hue ?? 0}, ${fv.saturation ?? 0}%, ${fv.lightness ?? 50}%, ${(fv.alpha ?? 100) / 100})`;
    }
    return 'var(--text-disabled)';
  }, [tokens]);

  // ── Row output rendering helper ──
  const renderRowOutputValue = (ro: TokenRowOutput, row: ConditionRow) => {
    if (ro.skipped) return <span className="advanced-token-row-label" style={{ color: 'var(--text-disabled)' }}>—</span>;
    if (ro.isNaN) return <span className="advanced-token-row-label" style={{ color: 'var(--text-disabled)' }}>skip</span>;
    if (!ro.result) return <span className="advanced-token-row-label" style={{ color: 'var(--text-disabled)' }}>—</span>;
    if (ro.result.type === 'error') return <span className="advanced-token-row-label" style={{ color: 'var(--text-critical)' }} title={ro.result.message}>err</span>;
    if (ro.result.type === 'tokenRef') {
      const css = getTokenCssColor(ro.result.tokenId);
      return (
        <span className="advanced-token-row-output-wrap">
          <span className="advanced-token-row-swatch" style={{ backgroundColor: css, boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--on-surface-0) 15%, transparent)' }} />
          <span className="advanced-token-row-label advanced-token-row-label--token-ref">
            {'{' + ro.result.tokenName + '}'}
          </span>
        </span>
      );
    }
    if (ro.result.type === 'computedColor') {
      const rowCs = getRowColorSpace(row);
      const displayStr = formatColorDisplay(ro.result.color, rowCs);
      return (
        <span className="advanced-token-row-output-wrap">
          <span className="advanced-token-row-swatch" style={{ backgroundColor: ro.result.cssColor, boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--on-surface-0) 15%, transparent)' }} />
          <span className="advanced-token-row-label" style={{ color: 'var(--text-tertiary)' }}>{displayStr}</span>
        </span>
      );
    }
    if (ro.result.type === 'number') {
      return <span className="advanced-token-row-label" style={{ color: 'var(--text-tertiary)' }}>{Math.round(ro.result.value * 100) / 100}</span>;
    }
    if (ro.result.type === 'boolean') {
      return <span className="advanced-token-row-label" style={{ color: 'var(--text-info)' }}>{ro.result.value ? 'true' : 'false'}</span>;
    }
    return <span className="advanced-token-row-label" style={{ color: 'var(--text-disabled)' }}>—</span>;
  };

  const addRow = useCallback(() => {
    const nr: ConditionRow = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, tokens: [], enabled: true, outputName: `out_${logic.rows.length + 1}` };
    onUpdateLogic({ ...logic, rows: [...logic.rows, nr] });
  }, [logic, onUpdateLogic]);

  const updateRow = useCallback((rowId: string, r: ConditionRow) => {
    onUpdateLogic({ ...logic, rows: logic.rows.map(rr => rr.id === rowId ? r : rr) });
  }, [logic, onUpdateLogic]);

  const updateRowOutputName = useCallback((rowId: string, newName: string) => {
    onUpdateLogic({ ...logic, rows: logic.rows.map(rr => rr.id === rowId ? { ...rr, outputName: newName || undefined } : rr) });
  }, [logic, onUpdateLogic]);

  const deleteRow = useCallback((rowId: string) => {
    onUpdateLogic({ ...logic, rows: logic.rows.filter(r => r.id !== rowId) });
  }, [logic, onUpdateLogic]);

  const getAvailableLocals = (idx: number): string[] => {
    const ls: string[] = [];
    for (let i = 0; i < idx; i++) { const r = logic.rows[i]; if (r.enabled && r.tokens.length > 0) ls.push(r.outputName || `out_${i + 1}`); }
    return ls;
  };

  const [tokenHeaderHovered, setTokenHeaderHovered] = useState(false);
  const [tokenColumnHovered, setTokenColumnHovered] = useState(false);
  const [, setTokenClipVer] = useState(_clipboardVersion);
  const tokenHasClipboard = !!_conditionClipboard && _conditionClipboard.rows.length > 0;

  const handleCopyTokenColumn = useCallback(() => {
    if (logic.rows.length === 0) return;
    _conditionClipboard = { rows: logic.rows.map(deepCloneRow), sourceLabel: 'Assign Token' };
    _clipboardVersion++;
    setTokenClipVer(_clipboardVersion);
  }, [logic.rows]);

  const handlePasteTokenColumn = useCallback((append = false) => {
    if (!_conditionClipboard || _conditionClipboard.rows.length === 0) return;
    const count = _conditionClipboard.rows.length;
    const src = _conditionClipboard.sourceLabel || 'clipboard';
    if (append) {
      const offset = logic.rows.length;
      const cloned = cloneRowsWithNewIds(_conditionClipboard.rows, offset);
      onUpdateLogic({ ...logic, rows: [...logic.rows, ...cloned] });
    } else {
      const cloned = cloneRowsWithNewIds(_conditionClipboard.rows);
      onUpdateLogic({ ...logic, rows: cloned });
    }
  }, [logic, onUpdateLogic]);

  const handleCopyTokenRow = useCallback((row: ConditionRow) => {
    _conditionClipboard = { rows: [deepCloneRow(row)], sourceLabel: 'Token row' };
    _clipboardVersion++;
    setTokenClipVer(_clipboardVersion);
  }, []);

  const onTokenHeaderEnter = useCallback(() => {
    setTokenHeaderHovered(true);
    setTokenClipVer(_clipboardVersion);
  }, []);

  // ── Keyboard shortcuts: Ctrl+C / Ctrl+V on hovered token column ──
  useEffect(() => {
    if (!tokenColumnHovered) return;
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      const isInputLike = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key === 'c') {
        if (isInputLike) return;
        if (logic.rows.length === 0) return;
        e.preventDefault();
        handleCopyTokenColumn();
      } else if (e.key === 'v') {
        if (!_conditionClipboard || _conditionClipboard.rows.length === 0) return;
        // If user is focused on an input (e.g. expression input inside a
        // ConditionRowEditor), let the row-level handler deal with the paste
        // so that only the target row is affected — not the entire column.
        if (isInputLike) return;
        e.preventDefault();
        handlePasteTokenColumn(e.shiftKey);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [tokenColumnHovered, handleCopyTokenColumn, handlePasteTokenColumn, logic.rows.length]);

  return (
    <div className="advanced-token-panel" data-testid="advanced-token-assignment-panel">
      {/* Column 1: Token Info */}
      <div className="advanced-token-info-col">
        <div className="advanced-token-info-title">Token Info</div>
        <div className="advanced-token-info-group">
          <div>
            <div className="advanced-token-info-label">Name</div>
            <div className="advanced-token-info-name">{tokenName}</div>
          </div>
          {currentValueToken && (
            <div>
              <div className="advanced-token-info-label">Current Value</div>
              <div className="advanced-token-info-value">
                {'{' + currentValueToken + '}'}
              </div>
            </div>
          )}
          {logic.rows.length > 0 && (
            <div>
              <div className="advanced-token-info-label">Rows</div>
              <div className="advanced-token-info-rows">{logic.rows.length}</div>
            </div>
          )}
        </div>
      </div>
      {/* Column 2: Assign Token */}
      <div
        className="advanced-token-assign-col"
        style={{ outline: tokenColumnHovered ? '1px solid color-mix(in srgb, var(--border-focus) 8%, transparent)' : 'none' }}
        onMouseEnter={() => setTokenColumnHovered(true)}
        onMouseLeave={() => setTokenColumnHovered(false)}
      >
        {/* Column header */}
        <div
          className="advanced-token-assign-header"
          onMouseEnter={onTokenHeaderEnter}
          onMouseLeave={() => setTokenHeaderHovered(false)}
        >
          <div className="advanced-token-assign-header-left">
            <span className="advanced-token-assign-label">Assign Token</span>
            {hasRows && (
              <button
                className="advanced-channel-play-btn"
                data-testid="advanced-token-play"
                onClick={onPlay}
                title="Re-evaluate and apply logic"
              >
                <Play size={8} style={{ color: 'var(--icon-success)' }} fill="var(--icon-success)" />
              </button>
            )}
            {/* Copy / Paste column buttons — visible on header hover */}
            {tokenHeaderHovered && (
              <>
                {hasRows && (
                  <button
                    className="advanced-channel-copy-btn"
                    onClick={handleCopyTokenColumn}
                    title="Copy all conditions (⌘C)"
                  >
                    <Copy size={8} style={{ color: 'var(--icon-disabled)' }} />
                  </button>
                )}
                {tokenHasClipboard && (
                  <button
                    className="advanced-channel-paste-btn"
                    onClick={(e) => handlePasteTokenColumn(e.shiftKey)}
                    title={`Paste${_conditionClipboard?.sourceLabel ? ` from ${_conditionClipboard.sourceLabel}` : ''} (${_conditionClipboard?.rows.length} row${(_conditionClipboard?.rows.length ?? 0) > 1 ? 's' : ''}) · ⌘V · Shift = append`}
                  >
                    <ClipboardPaste size={8} style={{ color: 'var(--icon-info)' }} />
                  </button>
                )}
              </>
            )}
            {hasUnsaved && (
              <span className="advanced-channel-unsaved">unsaved</span>
            )}
          </div>
          <div className="advanced-token-assign-header-right">
            {/* Per-column save button with text */}
            {hasUnsaved ? (
              <button
                className="advanced-channel-save-btn"
                data-testid="advanced-token-save"
                onClick={onSave}
                title="Save token assignment logic"
              >
                <Save size={9} style={{ color: 'var(--icon-success)' }} />
                <span className="advanced-channel-save-label">Save</span>
              </button>
            ) : saveFlash ? (
              <span className="advanced-channel-saved-badge">
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="var(--status-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="advanced-channel-saved-label">Saved</span>
              </span>
            ) : null}
          </div>
        </div>

        {/* Column body — condition rows with per-row outputs */}
        <div className="advanced-token-assign-body">
          {logic.rows.length === 0 ? (
            <div className="advanced-token-assign-empty">
              <div className="advanced-token-assign-empty-inner">
                <div className="advanced-token-assign-empty-text">No assignment rules yet</div>
                <button type="button" className="advanced-token-assign-add-btn" data-testid="advanced-token-add-rule" onClick={addRow}>+ Add Rule</button>
              </div>
            </div>
          ) : (
            <>
              {logic.rows.map((row, idx) => {
                const rowOutput = rowOutputMap.get(row.id);
                const outputName = row.outputName || `out_${idx + 1}`;
                return (
                  <div key={row.id}>
                    <ConditionRowEditor
                      row={row} channelKey="" colorSpace="hsl" node={node} nodes={nodes} evalCtx={evalCtx}
                      onUpdate={(ur) => updateRow(row.id, ur)} onDelete={() => deleteRow(row.id)}
                      onCopy={() => handleCopyTokenRow(row)}
                      availableLocals={getAvailableLocals(idx)}
                      mode="tokenAssignment" tokenRefs={tokenRefs} designTokens={tokens}
                      pages={pages}
                      testIdBase={`advanced-token-row-${idx}`}
                    />
                    {/* Per-row output box */}
                    <div className="advanced-row-output" data-testid={`advanced-token-row-output-${idx}`}>
                      <div className="advanced-row-output-left">
                        <span className="advanced-row-output-dollar">$</span>
                        <OutputNameInput
                          value={row.outputName}
                          defaultName={`out_${idx + 1}`}
                          onChange={(name) => updateRowOutputName(row.id, name)}
                        />
                      </div>
                      {rowOutput && renderRowOutputValue(rowOutput, row)}
                    </div>
                  </div>
                );
              })}

              {/* Add condition row */}
              <button
                className="advanced-add-condition-btn"
                data-testid="advanced-token-add-condition"
                onClick={addRow}
              >
                <Plus size={10} />
                <span>Add condition</span>
              </button>
            </>
          )}
        </div>

        {/* Auto-constrain + Final Output + Fallback — always visible when rows exist */}
        {hasRows && (() => {
          const availableOutputs = logic.rows.map((r, i) => r.outputName || `out_${i + 1}`);
          const selectedVar = logic.finalOutputVar;

          // Determine the resolved final result based on selected variable
          let resolvedResult: TokenAssignResult | null = null;
          let resolvedSource: 'logic' | 'fallback' = 'fallback';
          let hasValidationError = false;
          let hasBooleanWarning = false;
          let hasNumberWarning = false;

          if (selectedVar && detailedResult) {
            // Check if the selected variable exists in locals (for number/boolean outputs)
            const localValue = detailedResult.locals[selectedVar];
            const selectedVarExists = localValue !== undefined;
            // Also check in row outputs for tokenRef/computedColor results
            const matchingRowOutput = detailedResult.rowOutputs.find(ro => ro.outputName === selectedVar);

            if (!selectedVarExists && !matchingRowOutput?.result) {
              hasValidationError = true;
            } else if (matchingRowOutput?.result) {
              if (matchingRowOutput.result.type === 'boolean') {
                hasBooleanWarning = true;
              } else if (matchingRowOutput.result.type === 'number') {
                hasNumberWarning = true;
              } else if (matchingRowOutput.result.type === 'tokenRef' || matchingRowOutput.result.type === 'computedColor') {
                resolvedResult = matchingRowOutput.result;
                resolvedSource = 'logic';
              }
            } else if (selectedVarExists) {
              // It's a numeric local — not valid as a token assignment
              hasNumberWarning = true;
            }
          } else if (!selectedVar && detailedResult) {
            // "last" mode — use the final result from evaluation
            resolvedResult = detailedResult.finalResult;
            resolvedSource = detailedResult.finalSource;
          }

          const hasAnyWarning = hasValidationError || hasBooleanWarning || hasNumberWarning;

          // Determine color space for the final output display
          let finalColorSpace = 'hsl';
          if (resolvedResult?.type === 'tokenRef') {
            finalColorSpace = getTokenColorSpace(resolvedResult.tokenId);
          } else if (resolvedResult?.type === 'computedColor') {
            // Find the row that produced the result and get its primary token's color space
            if (selectedVar && detailedResult) {
              const matchRow = logic.rows.find(r => (r.outputName || `out_${logic.rows.indexOf(r) + 1}`) === selectedVar);
              if (matchRow) finalColorSpace = getRowColorSpace(matchRow);
            } else {
              // "last" mode — find last row with a valid tokenRef/computedColor
              for (let i = logic.rows.length - 1; i >= 0; i--) {
                const ro = detailedResult?.rowOutputs[i];
                if (ro?.result?.type === 'tokenRef' || ro?.result?.type === 'computedColor') {
                  finalColorSpace = getRowColorSpace(logic.rows[i]);
                  break;
                }
              }
            }
          }

          // ── Auto-constrain for computedColor ──
          // Check if computed color's H/S/L/A values are out of their natural ranges
          let constraintIssues: { channel: string; raw: number; constrained: number; mode: 'wrap' | 'clamp'; unit: string }[] = [];
          const isAutoConstrain = logic.autoConstrain !== false; // default true
          if (resolvedResult?.type === 'computedColor' && resolvedSource === 'logic') {
            const c = resolvedResult.color;
            const channelChecks = [
              { key: 'hue', val: c.h, min: 0, max: 360, mode: 'wrap' as const, unit: '°' },
              { key: 'saturation', val: c.s, min: 0, max: 100, mode: 'clamp' as const, unit: '%' },
              { key: 'lightness', val: c.l, min: 0, max: 100, mode: 'clamp' as const, unit: '%' },
              { key: 'alpha', val: c.a, min: 0, max: 100, mode: 'clamp' as const, unit: '%' },
            ];
            channelChecks.forEach(ch => {
              let constrained: number;
              if (ch.mode === 'wrap') {
                const range = ch.max - ch.min;
                constrained = ((((ch.val - ch.min) % range) + range) % range) + ch.min;
              } else {
                constrained = Math.max(ch.min, Math.min(ch.max, ch.val));
              }
              if (Math.abs(constrained - ch.val) > 0.0001) {
                constraintIssues.push({ channel: ch.key, raw: ch.val, constrained, mode: ch.mode, unit: ch.unit });
              }
            });
          }
          const showConstraintBar = constraintIssues.length > 0;

          const warningMessage = hasValidationError
            ? `$${selectedVar} has no value — using fallback`
            : hasBooleanWarning
              ? `$${selectedVar} is boolean — not valid as token assignment, using fallback`
              : hasNumberWarning
                ? `$${selectedVar} is numeric — not valid as token assignment, using fallback`
                : null;

          // Resolve display for the final output
          const renderFinalValue = () => {
            if (hasAnyWarning || !resolvedResult) {
              // Fallback display
              return (
                <span className="advanced-token-final-fallback">
                  {currentValueToken ? `{${currentValueToken}}` : '—'}
                  {resolvedSource === 'fallback' && currentValueToken && (
                    <span className="advanced-token-final-fallback-note">(fallback)</span>
                  )}
                </span>
              );
            }
            if (resolvedResult.type === 'tokenRef') {
              const css = getTokenCssColor(resolvedResult.tokenId);
              return (
                <span className="advanced-token-row-output-wrap">
                  <span className="advanced-token-final-swatch" style={{ backgroundColor: css, boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--on-surface-0) 20%, transparent)' }} />
                  <span className="advanced-token-final-label" style={{ color: 'var(--text-success)' }}>
                    {'{' + resolvedResult.tokenName + '}'}
                  </span>
                </span>
              );
            }
            if (resolvedResult.type === 'computedColor') {
              const finalDisplayStr = formatColorDisplay(resolvedResult.color, finalColorSpace);
              return (
                <span className="advanced-token-row-output-wrap">
                  <span className="advanced-token-final-swatch" style={{ backgroundColor: resolvedResult.cssColor, boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--on-surface-0) 20%, transparent)' }} />
                  <span className="advanced-token-final-label" style={{ color: 'var(--text-success)' }}>{finalDisplayStr}</span>
                </span>
              );
            }
            return <span className="advanced-token-final-label" style={{ color: 'var(--text-disabled)' }}>—</span>;
          };

          return (
            <>
              {/* ── Auto-Constrain Bar — shows when computedColor has out-of-range channels ── */}
              {showConstraintBar && (
                <div
                  className="advanced-constraint-bar"
                  style={{
                    borderTop: '1px solid var(--border-warning)',
                    background: isAutoConstrain
                      ? 'var(--surface-warning-subtle)'
                      : 'var(--surface-critical-subtle)',
                  }}
                >
                  <div className="advanced-constraint-bar-inner">
                    <div className="advanced-constraint-bar-left">
                      {/* Shield/constrain icon */}
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="advanced-constraint-icon">
                        <path
                          d="M8 1L2 4v4c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V4L8 1z"
                          fill={isAutoConstrain ? 'color-mix(in srgb, var(--status-warning) 30%, transparent)' : 'color-mix(in srgb, var(--status-critical) 20%, transparent)'}
                          stroke={isAutoConstrain ? 'var(--status-warning)' : 'var(--status-critical)'}
                          strokeWidth="1.2"
                        />
                      </svg>
                      <span className="advanced-constraint-label" style={{
                        color: isAutoConstrain ? 'var(--text-warning)' : 'var(--text-critical)',
                      }}>
                        {isAutoConstrain ? 'Auto-Constrain' : 'Out of Range'}
                      </span>
                    </div>
                    <div className="advanced-constraint-bar-right">
                      <span className="advanced-token-constraint-issues" style={{
                        color: isAutoConstrain ? 'var(--text-warning)' : 'var(--text-critical)',
                      }}>
                        {constraintIssues.map((ci, i) => (
                          <span key={ci.channel}>
                            {i > 0 && <span style={{ opacity: 0.3 }}>{' · '}</span>}
                            <span style={{ opacity: 0.5 }}>{ci.channel[0].toUpperCase()}: </span>
                            <span style={{ opacity: 0.6 }}>{Math.round(ci.raw * 100) / 100}{ci.unit}</span>
                            <span style={{ opacity: 0.4 }}>{' → '}</span>
                            <span>{Math.round(ci.constrained * 100) / 100}{ci.unit}</span>
                            <span style={{ opacity: 0.5 }}> ({ci.mode === 'wrap' ? 'wrapped' : 'clamped'})</span>
                          </span>
                        ))}
                      </span>
                      {/* Toggle button */}
                      <button
                        className="advanced-constraint-toggle"
                        style={{
                          background: isAutoConstrain
                            ? 'color-mix(in srgb, var(--status-warning) 15%, transparent)'
                            : 'color-mix(in srgb, var(--surface-3) 40%, transparent)',
                          border: `1px solid ${isAutoConstrain ? 'color-mix(in srgb, var(--status-warning) 30%, transparent)' : 'color-mix(in srgb, var(--on-surface-disabled) 45%, transparent)'}`,
                        }}
                        title={isAutoConstrain
                          ? 'Disable auto-constrain (allow out-of-range color values)'
                          : 'Enable auto-constrain (clamp/wrap color channels to valid ranges)'
                        }
                        onClick={() => {
                          onUpdateLogic({
                            ...logic,
                            autoConstrain: !isAutoConstrain,
                          });
                        }}
                      >
                        {isAutoConstrain ? (
                          <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="var(--status-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <X size={7} style={{ color: 'var(--icon-disabled)' }} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Final Output bar ── */}
              <div className="advanced-final-output-wrapper">
                {/* Warning floated above the final output bar */}
                {warningMessage && (
                  <div className="advanced-final-output-warning">
                    {warningMessage}
                  </div>
                )}
                <div
                  className="advanced-final-output"
                  style={{
                    borderTop: showConstraintBar
                      ? 'none'
                      : '1px solid var(--border-success)',
                    background: resolvedSource === 'logic'
                      ? 'var(--surface-success-subtle)'
                      : 'color-mix(in srgb, var(--surface-3) 38%, transparent)',
                  }}
                >
                  <div className="advanced-final-output-inner">
                    {/* Left side: label + inline dropdown */}
                    <div className="advanced-final-output-left">
                      <span className="advanced-final-output-label" style={{
                        color: resolvedSource === 'logic' ? 'var(--text-success)' : 'var(--text-tertiary)',
                      }}>
                        Final Output
                      </span>
                      {/* Inline dropdown selector */}
                      {availableOutputs.length > 0 && (
                        <div className="advanced-final-output-select-wrapper">
                          <select
                            className="advanced-final-output-select"
                            data-testid="advanced-token-final-output-select"
                            style={{
                              background: hasAnyWarning
                                ? 'color-mix(in srgb, var(--status-critical) 12%, transparent)'
                                : 'color-mix(in srgb, var(--status-success) 12%, transparent)',
                              color: hasAnyWarning ? 'var(--text-critical)' : 'var(--text-success)',
                              border: `1px solid ${hasAnyWarning ? 'color-mix(in srgb, var(--status-critical) 25%, transparent)' : 'color-mix(in srgb, var(--status-success) 25%, transparent)'}`,
                            }}
                            value={selectedVar || '__last__'}
                            onChange={(e) => {
                              const val = e.target.value;
                              onUpdateLogic({
                                ...logic,
                                finalOutputVar: val === '__last__' ? undefined : val,
                              });
                            }}
                          >
                            <option value="__last__">last</option>
                            {availableOutputs.map((varName, i) => (
                              <option key={`${i}-${varName}`} value={varName}>${varName}</option>
                            ))}
                          </select>
                          <ChevronDown
                            size={8}
                            className="advanced-final-output-chevron"
                            style={{ color: hasAnyWarning ? 'var(--text-critical)' : 'var(--text-success)' }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Right side: value */}
                    <div data-testid="advanced-token-final-output-value">{renderFinalValue()}</div>
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* Fallback */}
        <div className="advanced-fallback-bar" data-testid="advanced-token-fallback">
          <span className="advanced-fallback-label">Fallback</span>
          <span className="advanced-fallback-value">{currentValueToken ? `{${currentValueToken}}` : 'Manual assignment'}</span>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Node View Section — UI-only controls (hide channel / slider range)
// ═════════════════════════════════════════════════════════════════

interface NodeViewSectionProps {
  colorSpace: string;
  channelDefs: { label: string; key: string }[];
  config: NodeViewConfig;
  onUpdateConfig: (config: NodeViewConfig) => void;
  readOnly?: boolean;
  hasTokensAssigned?: boolean;
}

function NodeViewSection({ colorSpace, channelDefs, config, onUpdateConfig, readOnly, hasTokensAssigned = false }: NodeViewSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Editing state for slider inputs: { [channelKey]: { min: string; max: string } }
  const [editingSlider, setEditingSlider] = useState<Record<string, { min: string; max: string }>>({});

  // All channels including alpha
  const allChannels = useMemo(() => {
    return [...channelDefs, { label: 'Alpha', key: 'alpha' }];
  }, [channelDefs]);

  // Count active configs
  const activeCount = useMemo(() => {
    let count = 0;
    for (const ch of allChannels) {
      const c = config[ch.key];
      if (c?.hidden) count++;
      else if (c?.sliderMin !== undefined || c?.sliderMax !== undefined) count++;
    }
    // Count token section hidden
    if (config['_tokenSection']?.hidden) count++;
    return count;
  }, [config, allChannels]);

  const toggleHidden = useCallback((channelKey: string) => {
    if (readOnly) return;
    const prev = config[channelKey] || {};
    const newHidden = !prev.hidden;
    const newChannelConfig: NodeViewChannelConfig = { ...prev, hidden: newHidden };
    // If turning off hidden and no slider config, remove the entry
    if (!newHidden && newChannelConfig.sliderMin === undefined && newChannelConfig.sliderMax === undefined) {
      const next = { ...config };
      delete next[channelKey];
      onUpdateConfig(next);
    } else {
      // If hiding, clear slider config since it's redundant
      if (newHidden) {
        delete newChannelConfig.sliderMin;
        delete newChannelConfig.sliderMax;
      }
      onUpdateConfig({ ...config, [channelKey]: newChannelConfig });
    }
  }, [config, onUpdateConfig, readOnly]);

  const startEditingSlider = useCallback((channelKey: string) => {
    const range = CHANNEL_ABSOLUTE_RANGE[channelKey] || { min: 0, max: 100 };
    const c = config[channelKey] || {};
    setEditingSlider(prev => ({
      ...prev,
      [channelKey]: {
        min: c.sliderMin !== undefined ? String(c.sliderMin) : String(range.min),
        max: c.sliderMax !== undefined ? String(c.sliderMax) : String(range.max),
      },
    }));
  }, [config]);

  const commitSlider = useCallback((channelKey: string) => {
    const edit = editingSlider[channelKey];
    if (!edit) return;
    const range = CHANNEL_ABSOLUTE_RANGE[channelKey] || { min: 0, max: 100 };
    let minVal = parseFloat(edit.min);
    let maxVal = parseFloat(edit.max);
    // Validate
    if (isNaN(minVal)) minVal = range.min;
    if (isNaN(maxVal)) maxVal = range.max;
    // Clamp to absolute range
    minVal = Math.max(range.min, Math.min(range.max, minVal));
    maxVal = Math.max(range.min, Math.min(range.max, maxVal));
    // Ensure min < max
    if (minVal >= maxVal) {
      // Reset to defaults if invalid
      minVal = range.min;
      maxVal = range.max;
    }
    // Round for cleanliness
    minVal = Math.round(minVal * 100) / 100;
    maxVal = Math.round(maxVal * 100) / 100;

    const isDefault = minVal === range.min && maxVal === range.max;
    const prev = config[channelKey] || {};
    if (isDefault) {
      // Remove slider config
      const next = { ...config };
      const newEntry = { ...prev };
      delete newEntry.sliderMin;
      delete newEntry.sliderMax;
      if (!newEntry.hidden) {
        delete next[channelKey];
      } else {
        next[channelKey] = newEntry;
      }
      onUpdateConfig(next);
    } else {
      onUpdateConfig({ ...config, [channelKey]: { ...prev, hidden: undefined, sliderMin: minVal, sliderMax: maxVal } });
    }
    // Clear editing
    setEditingSlider(prev => {
      const next = { ...prev };
      delete next[channelKey];
      return next;
    });
  }, [editingSlider, config, onUpdateConfig]);

  const removeSlider = useCallback((channelKey: string) => {
    if (readOnly) return;
    const prev = config[channelKey] || {};
    const next = { ...config };
    const newEntry = { ...prev };
    delete newEntry.sliderMin;
    delete newEntry.sliderMax;
    if (!newEntry.hidden) {
      delete next[channelKey];
    } else {
      next[channelKey] = newEntry;
    }
    onUpdateConfig(next);
    setEditingSlider(prev2 => {
      const n = { ...prev2 };
      delete n[channelKey];
      return n;
    });
  }, [config, onUpdateConfig, readOnly]);

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="advanced-nodeview-toggle"
      >
        {isExpanded ? <ChevronDown size={10} className="advanced-nodeview-chevron" /> : <ChevronRight size={10} className="advanced-nodeview-chevron" />}
        <span className="advanced-nodeview-label">
          Node View
        </span>
        {activeCount > 0 && (
          <span className="advanced-nodeview-badge">
            {activeCount}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="advanced-nodeview-body">
          {allChannels.map(ch => {
            const c = config[ch.key] || {};
            const isHidden = !!c.hidden;
            const hasSlider = c.sliderMin !== undefined || c.sliderMax !== undefined;
            const isEditingThis = !!editingSlider[ch.key];
            const range = CHANNEL_ABSOLUTE_RANGE[ch.key] || { min: 0, max: 100 };

            return (
              <div key={ch.key} style={{ marginTop: '4px' }}>
                <div className="advanced-nodeview-channel-row">
                  <span className="advanced-nodeview-channel-label">{ch.label}</span>
                  <div className="advanced-nodeview-channel-actions">
                    {/* Hide toggle */}
                    <button
                      onClick={() => toggleHidden(ch.key)}
                      disabled={readOnly}
                      className={`advanced-nodeview-hide-btn ${
                        isHidden
                          ? 'advanced-nodeview-hide-btn--active'
                          : 'advanced-nodeview-hide-btn--inactive'
                      }`}
                      title={isHidden ? 'Channel hidden in node UI — click to show' : 'Hide this channel in node UI'}
                    >
                      hide
                    </button>
                    {/* Slider toggle — only when not hidden */}
                    {!isHidden && (
                      <button
                        onClick={() => {
                          if (readOnly) return;
                          if (hasSlider && !isEditingThis) {
                            // Remove slider
                            removeSlider(ch.key);
                          } else if (!isEditingThis) {
                            // Start editing
                            startEditingSlider(ch.key);
                          }
                        }}
                        disabled={readOnly}
                        className={`advanced-nodeview-slider-btn ${
                          hasSlider
                            ? 'advanced-nodeview-slider-btn--active'
                            : 'advanced-nodeview-slider-btn--inactive'
                        }`}
                        title={hasSlider ? `slider(${c.sliderMin}, ${c.sliderMax}) — click to remove` : 'Set custom slider range'}
                      >
                        slider
                      </button>
                    )}
                  </div>
                </div>

                {/* Slider range editor */}
                {isEditingThis && !isHidden && (
                  <div className="advanced-nodeview-slider-editor">
                    <span className="advanced-nodeview-slider-sep">(</span>
                    <input
                      type="number"
                      value={editingSlider[ch.key]?.min ?? ''}
                      onChange={(e) => setEditingSlider(prev => ({ ...prev, [ch.key]: { ...prev[ch.key], min: e.target.value } }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitSlider(ch.key); if (e.key === 'Escape') setEditingSlider(prev => { const n = { ...prev }; delete n[ch.key]; return n; }); }}
                      className="advanced-nodeview-slider-input"
                      min={range.min}
                      max={range.max}
                      step={1}
                      placeholder={String(range.min)}
                      autoFocus
                    />
                    <span className="advanced-nodeview-slider-sep">,</span>
                    <input
                      type="number"
                      value={editingSlider[ch.key]?.max ?? ''}
                      onChange={(e) => setEditingSlider(prev => ({ ...prev, [ch.key]: { ...prev[ch.key], max: e.target.value } }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitSlider(ch.key); if (e.key === 'Escape') setEditingSlider(prev => { const n = { ...prev }; delete n[ch.key]; return n; }); }}
                      className="advanced-nodeview-slider-input"
                      min={range.min}
                      max={range.max}
                      step={1}
                      placeholder={String(range.max)}
                    />
                    <span className="advanced-nodeview-slider-sep">)</span>
                    <button
                      onClick={() => commitSlider(ch.key)}
                      className="advanced-nodeview-slider-apply"
                      title="Apply slider range"
                    >
                      &#10003;
                    </button>
                  </div>
                )}

                {/* Show current slider range if set and not editing */}
                {hasSlider && !isEditingThis && !isHidden && (
                  <div
                    className="advanced-nodeview-slider-display"
                    onClick={() => { if (!readOnly) startEditingSlider(ch.key); }}
                    title="Click to edit slider range"
                  >
                    <span className="advanced-nodeview-slider-display-text">
                      slider({c.sliderMin}, {c.sliderMax})
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Token Section hide — only when no tokens are assigned */}
          {!hasTokensAssigned && (
            <div className="advanced-nodeview-token-section">
              <div className="advanced-nodeview-channel-row">
                <span className="advanced-nodeview-channel-label">Token Section</span>
                <div className="advanced-nodeview-channel-actions">
                  <button
                    onClick={() => {
                      if (readOnly) return;
                      const prev = config['_tokenSection'] || {};
                      const newHidden = !prev.hidden;
                      if (newHidden) {
                        onUpdateConfig({ ...config, ['_tokenSection']: { hidden: true } });
                      } else {
                        const next = { ...config };
                        delete next['_tokenSection'];
                        onUpdateConfig(next);
                      }
                    }}
                    disabled={readOnly}
                    className={`advanced-nodeview-hide-btn ${
                      config['_tokenSection']?.hidden
                        ? 'advanced-nodeview-hide-btn--active'
                        : 'advanced-nodeview-hide-btn--inactive'
                    }`}
                    title={config['_tokenSection']?.hidden ? 'Token section hidden in node UI — click to show' : 'Hide the token assignment section from node UI'}
                  >
                    hide
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════

export function AdvancedPopup({
  nodeId,
  node,
  nodes,
  tokens,
  activeThemeId = '',
  isPrimaryTheme = true,
  primaryThemeId = '',
  advancedLogic,
  onUpdateAdvancedLogic,
  onClose,
  isMinimized = false,
  onMinimize,
  onExpand,
  onPopupTopChange,
  nodeDisplayName,
  onUpdateNode,
  readOnly = false,
  pages = [],
  allProjectNodes,
}: AdvancedPopupProps) {
  // --- Dimensions & position state ---
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: Math.round(window.innerHeight / 2),
  }));
  const [position, setPosition] = useState(() => ({
    x: 0,
    y: Math.round(window.innerHeight / 2),
  }));

  // --- Drag state ---
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // --- Resize state ---
  const [isResizing, setIsResizing] = useState(false);
  const resizeStart = useRef({
    mx: 0,
    my: 0,
    w: 0,
    h: 0,
    px: 0,
    py: 0,
    edge: '' as string,
  });

  // ── Theme-aware: determine if node is unlinked in current theme ──
  const nodeIsUnlinked = !isPrimaryTheme && !!(node.themeOverrides?.[activeThemeId]);
  // For token nodes, also check if valueTokenAssignments has a theme-specific entry
  const tokenIsUnlinked = nodeIsUnlinked || (!isPrimaryTheme && !!(node.valueTokenAssignments?.[activeThemeId]));

  // --- Draft state for per-channel save ---
  const [draftChannels, setDraftChannels] = useState<Record<string, ChannelLogic>>({});
  // Per-channel unsaved tracking: { [channelKey]: true/false }
  const [unsavedChannels, setUnsavedChannels] = useState<Record<string, boolean>>({});
  // Per-channel save flash: { [channelKey]: true/false }
  const [saveFlashChannels, setSaveFlashChannels] = useState<Record<string, boolean>>({});
  // Help popup state
  const [showHelp, setShowHelp] = useState(false);

  // Derived: any channel has unsaved changes?
  const hasUnsavedChanges = Object.values(unsavedChannels).some(Boolean);

  // Initialize draft from saved logic
  const nodeLogic = useMemo(
    () => advancedLogic.find(l => l.nodeId === nodeId),
    [advancedLogic, nodeId]
  );

  // Theme-effective channels: resolves primary vs theme-specific logic
  const effectiveChannels = useMemo(() => {
    if (!nodeLogic) return {};
    return getEffectiveChannels(nodeLogic, activeThemeId, isPrimaryTheme, nodeIsUnlinked);
  }, [nodeLogic, activeThemeId, isPrimaryTheme, nodeIsUnlinked]);

  // Theme-effective base values
  const effectiveBaseValues = useMemo(() => {
    if (!nodeLogic) return undefined;
    return getEffectiveBaseValues(nodeLogic, activeThemeId, isPrimaryTheme, nodeIsUnlinked);
  }, [nodeLogic, activeThemeId, isPrimaryTheme, nodeIsUnlinked]);

  // ── Node View config (UI-only: hide channels / slider range) ──
  const effectiveNodeViewConfig = useMemo<NodeViewConfig>(() => {
    if (!nodeLogic) return {};
    if (!isPrimaryTheme && nodeIsUnlinked && nodeLogic.themeNodeViewConfig?.[activeThemeId]) {
      return nodeLogic.themeNodeViewConfig[activeThemeId];
    }
    return nodeLogic.nodeViewConfig || {};
  }, [nodeLogic, activeThemeId, isPrimaryTheme, nodeIsUnlinked]);

  const [draftNodeViewConfig, setDraftNodeViewConfig] = useState<NodeViewConfig>({});

  // Sync draft node view config from saved logic
  useEffect(() => {
    setDraftNodeViewConfig(effectiveNodeViewConfig);
  }, [effectiveNodeViewConfig]);

  // Persist Node View config whenever it changes (auto-save with debounce)
  const nodeViewPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistNodeViewConfig = useCallback((newConfig: NodeViewConfig) => {
    setDraftNodeViewConfig(newConfig);
    if (nodeViewPersistTimerRef.current) clearTimeout(nodeViewPersistTimerRef.current);
    nodeViewPersistTimerRef.current = setTimeout(() => {
      const existing = advancedLogic.find(l => l.nodeId === nodeId);
      const isThemeSpecific = !isPrimaryTheme && nodeIsUnlinked;
      const hasAnyConfig = Object.keys(newConfig).length > 0 && Object.values(newConfig).some(c => c.hidden || c.sliderMin !== undefined || c.sliderMax !== undefined);
      if (existing) {
        onUpdateAdvancedLogic(advancedLogic.map(l => {
          if (l.nodeId !== nodeId) return l;
          if (isThemeSpecific) {
            const themeNVC = { ...(l.themeNodeViewConfig || {}) };
            if (hasAnyConfig) themeNVC[activeThemeId] = newConfig;
            else delete themeNVC[activeThemeId];
            return { ...l, themeNodeViewConfig: Object.keys(themeNVC).length > 0 ? themeNVC : undefined };
          }
          return { ...l, nodeViewConfig: hasAnyConfig ? newConfig : undefined };
        }));
      } else if (hasAnyConfig) {
        if (isThemeSpecific) {
          onUpdateAdvancedLogic([...advancedLogic, { nodeId, channels: {}, themeNodeViewConfig: { [activeThemeId]: newConfig } }]);
        } else {
          onUpdateAdvancedLogic([...advancedLogic, { nodeId, channels: {}, nodeViewConfig: newConfig }]);
        }
      }
      nodeViewPersistTimerRef.current = null;
    }, 500);
  }, [advancedLogic, nodeId, onUpdateAdvancedLogic, isPrimaryTheme, nodeIsUnlinked, activeThemeId]);

  useEffect(() => {
    return () => { if (nodeViewPersistTimerRef.current) clearTimeout(nodeViewPersistTimerRef.current); };
  }, []);

  // Track the last auto-persisted channels to detect external changes (undo/redo)
  const lastAutoPersistedRef = useRef<Record<string, ChannelLogic> | null>(null);

  // Sync draft when nodeLogic changes externally (undo/redo or no unsaved changes)
  useEffect(() => {
    if (!hasUnsavedChanges) {
      setDraftChannels(effectiveChannels);
    } else {
      // If effectiveChannels changed but NOT from our auto-persist, it's an external
      // change (e.g. undo/redo). Force sync and clear unsaved state.
      if (lastAutoPersistedRef.current && effectiveChannels !== lastAutoPersistedRef.current) {
        // Check if the external state differs from what we auto-persisted
        const isExternal = JSON.stringify(effectiveChannels) !== JSON.stringify(lastAutoPersistedRef.current);
        if (isExternal) {
          setDraftChannels(effectiveChannels);
          setUnsavedChannels({});
          lastAutoPersistedRef.current = null;
        }
      }
    }
  }, [effectiveChannels, hasUnsavedChanges]);

  // Initialize on first mount or when theme/node changes
  useEffect(() => {
    setDraftChannels(effectiveChannels);
    setUnsavedChannels({});
    lastAutoPersistedRef.current = null;
  }, [nodeId, activeThemeId]);

  // ── Draft registration: suppress reactive evaluation while popup is open ──
  // The reactive loop in App.tsx skips nodes registered here.
  // Evaluation only happens on explicit Save or Play actions.
  // On unmount, we force a re-evaluation by creating a new advancedLogic reference
  // so the reactive loop picks up any changes that occurred while the popup was open.
  const advancedLogicRef = useRef(advancedLogic);
  advancedLogicRef.current = advancedLogic;
  const onUpdateAdvancedLogicRef = useRef(onUpdateAdvancedLogic);
  onUpdateAdvancedLogicRef.current = onUpdateAdvancedLogic;
  useEffect(() => {
    registerAdvancedDraft(nodeId);
    return () => {
      unregisterAdvancedDraft(nodeId);
      // Force reactive loop to re-evaluate by creating a new array reference.
      // This ensures any parent/sibling changes that occurred while the popup
      // was open (and the reactive loop was suppressed) are now applied.
      const currentLogic = advancedLogicRef.current;
      if (currentLogic && currentLogic.length > 0) {
        onUpdateAdvancedLogicRef.current([...currentLogic]);
      }
    };
  }, [nodeId]);

  // ── Auto-persist draft channels to advancedLogic for undo/redo coverage ──
  // This writes draft state on every meaningful edit (debounced) so global
  // undo/redo captures even unsaved condition changes. The explicit Save
  // button still applies computed values to the node.
  // NOTE: The reactive evaluation loop in App.tsx SKIPS this node while the
  // popup is open (via the draft registry), so auto-persist does NOT cause
  // live auto-evaluation. Only Save/Play triggers actual evaluation.
  const autoPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    if (autoPersistTimerRef.current) clearTimeout(autoPersistTimerRef.current);
    autoPersistTimerRef.current = setTimeout(() => {
      const existing = advancedLogic.find(l => l.nodeId === nodeId);
      const hasAnyRows = Object.values(draftChannels).some(ch => ch.rows.length > 0);
      if (hasAnyRows) {
        const isThemeSpecific = !isPrimaryTheme && nodeIsUnlinked;
        // Always include baseValues to prevent `locked` keyword feedback loops.
        // Preserve existing baseValues; only snapshot current values if none exist yet.
        const currentBaseValues = nodeToChannelMapThemeAware(node, activeThemeId, isPrimaryTheme);
        if (existing) {
          onUpdateAdvancedLogic(advancedLogic.map(l => {
            if (l.nodeId !== nodeId) return l;
            if (isThemeSpecific) {
              const themeBase = l.themeBaseValues?.[activeThemeId] || l.baseValues || currentBaseValues;
              return {
                ...l,
                themeChannels: { ...(l.themeChannels || {}), [activeThemeId]: draftChannels },
                themeBaseValues: { ...(l.themeBaseValues || {}), [activeThemeId]: themeBase },
              };
            }
            return { ...l, channels: draftChannels, baseValues: l.baseValues || currentBaseValues };
          }));
        } else {
          if (isThemeSpecific) {
            onUpdateAdvancedLogic([...advancedLogic, {
              nodeId,
              channels: {},
              themeChannels: { [activeThemeId]: draftChannels },
              themeBaseValues: { [activeThemeId]: currentBaseValues },
            }]);
          } else {
            onUpdateAdvancedLogic([...advancedLogic, { nodeId, channels: draftChannels, baseValues: currentBaseValues }]);
          }
        }
      }
      lastAutoPersistedRef.current = draftChannels;
      autoPersistTimerRef.current = null;
    }, 800); // Longer debounce than undo (400ms) to batch rapid edits
    return () => { if (autoPersistTimerRef.current) clearTimeout(autoPersistTimerRef.current); };
  }, [draftChannels, hasUnsavedChanges, isPrimaryTheme, nodeIsUnlinked, activeThemeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Responsive: update on window resize ---
  useEffect(() => {
    const onResize = () => {
      const vh = window.innerHeight;
      setSize(prev => {
        const newH = Math.min(prev.height, vh - 40);
        return { width: window.innerWidth, height: newH };
      });
      setPosition(prev => {
        const currentH = Math.min(prev.height || (vh / 2), vh - 40);
        return { x: 0, y: vh - currentH };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // --- Drag handlers ---
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = { mx: e.clientX, my: e.clientY, px: position.x, py: position.y };
    },
    [position],
  );

  // --- Resize handlers ---
  const handleResizeStart = useCallback(
    (edge: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = {
        mx: e.clientX,
        my: e.clientY,
        w: size.width,
        h: size.height,
        px: position.x,
        py: position.y,
        edge,
      };
    },
    [size, position],
  );

  // Pointer-move: drag or resize
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const onMove = (e: MouseEvent) => {
      if (isDragging) {
        const dy = e.clientY - dragStart.current.my;
        const vh = window.innerHeight;
        const newY = Math.max(0, Math.min(dragStart.current.py + dy, vh - 40));
        const newH = vh - newY;

        if (newH <= vh * 0.25 && onMinimize) {
          setIsDragging(false);
          setIsResizing(false);
          onMinimize();
          return;
        }

        setPosition({ x: 0, y: newY });
        setSize({ width: window.innerWidth, height: newH });
        onPopupTopChange?.(newY);
      }
      if (isResizing) {
        const { my, h, py } = resizeStart.current;
        const dy = e.clientY - my;
        const vh = window.innerHeight;

        const delta = Math.min(dy, h - MIN_HEIGHT);
        let newH = h - delta;
        let newY = py + delta;

        newH = Math.min(newH, vh - newY);
        newH = Math.max(MIN_HEIGHT, newH);
        newY = vh - newH;

        if (newH <= vh * 0.25 && onMinimize) {
          setIsDragging(false);
          setIsResizing(false);
          onMinimize();
          return;
        }

        setSize({ width: window.innerWidth, height: newH });
        setPosition({ x: 0, y: newY });
        onPopupTopChange?.(newY);
      }
    };

    const onUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, isResizing, onMinimize, onPopupTopChange]);

  // Expand always resets to bottom half of viewport
  useEffect(() => {
    if (!isMinimized) {
      const vh = window.innerHeight;
      const halfH = Math.round(vh / 2);
      setSize({ width: window.innerWidth, height: halfH });
      setPosition({ x: 0, y: vh - halfH });
    }
  }, [isMinimized]);

  // Mark body when popup is open and NOT minimized
  useEffect(() => {
    if (!isMinimized) {
      document.body.setAttribute('data-advanced-popup-open', 'true');
    } else {
      document.body.removeAttribute('data-advanced-popup-open');
    }
    return () => document.body.removeAttribute('data-advanced-popup-open');
  }, [isMinimized]);

  // Close on Escape; block Delete/Backspace from propagating to canvas;
  // E = expand (when minimized), M = minimize (when expanded)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // E/M shortcuts work regardless of minimized state (but not when typing)
      if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if ((e.key === 'e' || e.key === 'E') && isMinimized && onExpand) {
          e.preventDefault();
          e.stopPropagation();
          onExpand();
          return;
        }
        if ((e.key === 'm' || e.key === 'M') && !isMinimized && onMinimize) {
          e.preventDefault();
          e.stopPropagation();
          onMinimize();
          return;
        }
      }

      if (isMinimized) return;

      if (e.key === 'Escape') {
        const activePalette = document.querySelector('[data-palette-open]');
        if (activePalette) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isTyping) {
          e.stopPropagation();
        }
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose, isMinimized, onExpand, onMinimize]);

  // Resize edge handles
  const edgeStyle = (edge: string): React.CSSProperties => {
    const base: React.CSSProperties = { position: 'absolute', zIndex: 10 };
    const s = 6;
    switch (edge) {
      case 'top':
        return { ...base, top: -s / 2, left: s, right: s, height: s, cursor: 'ns-resize' };
      default:
        return base;
    }
  };

  const edges = ['top'];

  // ── Resolve color info ────────────────────────────────────────
  const isColorNode = !node.isTokenNode && !node.isSpacing && !node.isPalette;

  const colorInfo = useMemo<ResolvedColorInfo | null>(() => {
    if (isColorNode) {
      return resolveColorNodeInfo(node, activeThemeId, isPrimaryTheme);
    }
    return null;
  }, [node, activeThemeId, isPrimaryTheme, isColorNode]);

  const channelDefs = colorInfo ? (CHANNEL_MAP[colorInfo.colorSpace] || CHANNEL_MAP.hsl) : CHANNEL_MAP.hsl;

  // ── Build evaluation context ──────────────────────────────────
  const evalCtx = useMemo<EvalContext>(() => {
    const selfMap = nodeToChannelMapThemeAware(node, activeThemeId, isPrimaryTheme);
    let parentMap: Record<string, number> | null = null;
    if (node.parentId) {
      const parentNode = nodes.find(n => n.id === node.parentId);
      if (parentNode) {
        parentMap = nodeToChannelMapThemeAware(parentNode, activeThemeId, isPrimaryTheme);
      }
    }
    const allNodesMap = new Map<string, Record<string, number>>();
    nodes.forEach(n => {
      if (!n.isSpacing && !n.isTokenNode) {
        allNodesMap.set(n.id, nodeToChannelMapThemeAware(n, activeThemeId, isPrimaryTheme));
      }
    });
    // Include stored baseValues for `locked` keyword resolution in live preview
    const existingEntry = advancedLogic.find(l => l.nodeId === node.id);
    const isThemeSpecificCtx = !isPrimaryTheme && nodeIsUnlinked;
    const lockedValues = (isThemeSpecificCtx
      ? (existingEntry?.themeBaseValues?.[activeThemeId] ?? existingEntry?.baseValues)
      : existingEntry?.baseValues) || selfMap;
    // Build tokenValues so {token}.H references work in channel logic
    const tokenValues = new Map<string, TokenColor>();
    tokens.forEach(t => {
      const tv = t.themeValues ? (t.themeValues[activeThemeId] || Object.values(t.themeValues)[0]) : null;
      const h = tv?.hue ?? t.hue ?? 0;
      const s = tv?.saturation ?? t.saturation ?? 0;
      const l = tv?.lightness ?? t.lightness ?? 50;
      const a = tv?.alpha ?? t.alpha ?? 100;
      if (tv?.hue !== undefined || tv?.saturation !== undefined || tv?.lightness !== undefined || t.hue !== undefined) {
        tokenValues.set(t.id, { h, s, l, a });
      }
    });
    // Resolve token node tokens through value assignments.
    // ALWAYS overwrite first-pass defaults with resolved color from value token chain.
    nodes.forEach(n => {
      if (!n.isTokenNode || n.isTokenPrefix || !n.ownTokenId) return;
      const vtId = n.valueTokenAssignments?.[activeThemeId]
        || n.valueTokenId;
      if (!vtId) return;
      const vt = tokens.find(t => t.id === vtId);
      if (!vt) return;
      const vtv = vt.themeValues ? (vt.themeValues[activeThemeId] || Object.values(vt.themeValues)[0]) : null;
      tokenValues.set(n.ownTokenId, {
        h: vtv?.hue ?? vt.hue ?? 0, s: vtv?.saturation ?? vt.saturation ?? 0,
        l: vtv?.lightness ?? vt.lightness ?? 50, a: vtv?.alpha ?? vt.alpha ?? 100,
      });
    });
    // Also inject tokenNames so name-based fallback works for channel {token}.H references
    const tokenNames = new Map<string, string>();
    tokens.forEach(t => tokenNames.set(t.id, t.name));
    const ctx: EvalContext = { self: selfMap, parent: parentMap, allNodes: allNodesMap, lockedValues };
    (ctx as any).tokenValues = tokenValues;
    (ctx as any).tokenNames = tokenNames;
    return ctx;
  }, [node, nodes, tokens, activeThemeId, isPrimaryTheme, advancedLogic, nodeIsUnlinked]);

  // ── Draft channel logic updates (per-channel unsaved tracking) ─
  const updateDraftChannelLogic = useCallback((channelKey: string, channelLogicUpdate: ChannelLogic) => {
    setDraftChannels(prev => ({ ...prev, [channelKey]: channelLogicUpdate }));
    setUnsavedChannels(prev => ({ ...prev, [channelKey]: true }));
  }, []);

  // ── Per-channel save: persist ONE channel's logic and apply its result ──
  const handleSaveChannel = useCallback((channelKey: string) => {
    // ── Sandbox mode: discard the condition instead of persisting ──
    if (readOnly) {
      setDraftChannels(prev => ({ ...prev, [channelKey]: { rows: [] } }));
      setUnsavedChannels(prev => ({ ...prev, [channelKey]: false }));
      return;
    }
    // Build the full channels map with this channel updated
    const updatedChannels = { ...draftChannels };
    const hasAnyLogic = Object.values(updatedChannels).some(ch => ch.rows.length > 0);

    // 1. Persist the logic definition (with baseValues for `locked` keyword)
    const isThemeSpecific = !isPrimaryTheme && nodeIsUnlinked;

    if (!hasAnyLogic) {
      if (isThemeSpecific) {
        // Only clear the theme-specific slot; keep primary intact
        const existing = advancedLogic.find(l => l.nodeId === nodeId);
        if (existing) {
          const newThemeChannels = { ...(existing.themeChannels || {}) };
          delete newThemeChannels[activeThemeId];
          const newThemeBaseValues = { ...(existing.themeBaseValues || {}) };
          delete newThemeBaseValues[activeThemeId];
          const hasAnything = Object.values(existing.channels || {}).some(ch => ch.rows.length > 0)
            || existing.tokenAssignment?.rows?.length
            || Object.keys(newThemeChannels).length > 0;
          if (!hasAnything) {
            onUpdateAdvancedLogic(advancedLogic.filter(l => l.nodeId !== nodeId));
          } else {
            onUpdateAdvancedLogic(advancedLogic.map(l =>
              l.nodeId === nodeId ? { ...l, themeChannels: newThemeChannels, themeBaseValues: newThemeBaseValues } : l
            ));
          }
        }
      } else {
        onUpdateAdvancedLogic(advancedLogic.filter(l => l.nodeId !== nodeId));
      }
    } else {
      // Snapshot current channel values as baseValues for `locked` keyword.
      const existing = advancedLogic.find(l => l.nodeId === nodeId);
      const currentBaseValues = nodeToChannelMapThemeAware(node, activeThemeId, isPrimaryTheme);

      if (isThemeSpecific) {
        const themeBaseVals = existing?.themeBaseValues?.[activeThemeId] || existing?.baseValues || currentBaseValues;
        if (existing) {
          onUpdateAdvancedLogic(advancedLogic.map(l =>
            l.nodeId === nodeId ? {
              ...l,
              themeChannels: { ...(l.themeChannels || {}), [activeThemeId]: updatedChannels },
              themeBaseValues: { ...(l.themeBaseValues || {}), [activeThemeId]: themeBaseVals },
            } : l
          ));
        } else {
          onUpdateAdvancedLogic([...advancedLogic, {
            nodeId, channels: {},
            themeChannels: { [activeThemeId]: updatedChannels },
            themeBaseValues: { [activeThemeId]: currentBaseValues },
          }]);
        }
      } else {
        const baseValues = existing?.baseValues || currentBaseValues;
        if (existing) {
          onUpdateAdvancedLogic(advancedLogic.map(l =>
            l.nodeId === nodeId ? { ...l, channels: updatedChannels, baseValues } : l
          ));
        } else {
          onUpdateAdvancedLogic([...advancedLogic, { nodeId, channels: updatedChannels, baseValues: currentBaseValues }]);
        }
      }
    }

    // 2. Evaluate ALL channels with active logic in dependency order.
    //    When hue references @Self.lightness and lightness has logic,
    //    lightness is evaluated first so hue gets the computed value.
    if (onUpdateNode) {
      const selfMap = nodeToChannelMapThemeAware(node, activeThemeId, isPrimaryTheme);
      // Use stored baseValues for `locked` resolution to prevent feedback loops
      const existingEntry = advancedLogic.find(l => l.nodeId === nodeId);
      const lockedValues = (isThemeSpecific
        ? (existingEntry?.themeBaseValues?.[activeThemeId] ?? existingEntry?.baseValues)
        : existingEntry?.baseValues) || selfMap;

      // Collect all active channels
      const activeChannels = Object.entries(updatedChannels).filter(([, cl]) =>
        cl && cl.rows.length > 0 && cl.rows.some(r => r.enabled && r.tokens.length > 0)
      );

      if (activeChannels.length > 0) {
        // Build dependency graph for topological ordering
        const activeKeys = new Set(activeChannels.map(([k]) => k));
        const propAlias: Record<string, string> = {
          h: 'hue', s: 'saturation', l: 'lightness', a: 'alpha',
          r: 'red', g: 'green', b: 'blue',
        };
        const channelDeps: Record<string, Set<string>> = {};
        for (const [chKey, chLogic] of activeChannels) {
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
                  if (canonical !== chKey && activeKeys.has(canonical)) {
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
        for (const [k] of activeChannels) inDegree[k] = 0;
        for (const [k, deps] of Object.entries(channelDeps)) {
          for (const d of deps) {
            if (inDegree[d] !== undefined) inDegree[k] = (inDegree[k] || 0) + 1;
          }
        }
        const dependents: Record<string, string[]> = {};
        for (const [k] of activeChannels) dependents[k] = [];
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
        // Append any remaining (cycles)
        for (const [k] of activeChannels) {
          if (!sortedChannels.includes(k)) sortedChannels.push(k);
        }

        // Evaluate in dependency order with mutable self map
        const mutableSelf = { ...selfMap };
        const allChanges: Record<string, number> = {};
        for (const chKey of sortedChannels) {
          const chLogic = updatedChannels[chKey];
          if (!chLogic) continue;
          const baseValue = lockedValues[chKey] ?? 0;
          const ctx: EvalContext = {
            ...evalCtx,
            self: mutableSelf,
            currentChannel: chKey,
            lockedValues,
          };
          const result = evaluateChannelLogic(chLogic, ctx, baseValue);
          if (result.source === 'logic' && !result.error) {
            mutableSelf[chKey] = result.value;
            // Update aliases
            if (chKey === 'hue') mutableSelf.h = result.value;
            else if (chKey === 'saturation') mutableSelf.s = result.value;
            else if (chKey === 'lightness') mutableSelf.l = result.value;
            else if (chKey === 'alpha') mutableSelf.a = result.value;
            else if (chKey === 'red') mutableSelf.r = result.value;
            else if (chKey === 'green') mutableSelf.g = result.value;
            else if (chKey === 'blue') mutableSelf.b = result.value;
            allChanges[chKey] = result.value;
          }
        }

        // Apply all computed changes to the node
        if (Object.keys(allChanges).length > 0) {
          onUpdateNode(nodeId, allChanges as Partial<ColorNodeType>);
        }
      }
    }

    // Mark this channel as saved
    setUnsavedChannels(prev => ({ ...prev, [channelKey]: false }));
    setSaveFlashChannels(prev => ({ ...prev, [channelKey]: true }));
    setTimeout(() => {
      setSaveFlashChannels(prev => ({ ...prev, [channelKey]: false }));
    }, 1200);
  }, [draftChannels, advancedLogic, nodeId, onUpdateAdvancedLogic, onUpdateNode, node, activeThemeId, isPrimaryTheme, nodeIsUnlinked, evalCtx, readOnly]);

  // ── Channel base values: inherit from parent when available ──
  // The "base" value shown in the column header is the parent's corresponding
  // channel value (the value this node inherits). When the parent changes,
  // the base updates reactively. Falls back to node's own value for root nodes.
  const getBaseValue = (channelKey: string): number => {
    // Primary: use parent's current channel value (reactive to parent changes)
    if (evalCtx.parent) {
      const parentVal = evalCtx.parent[channelKey];
      if (parentVal !== undefined) return parentVal;
    }
    // Fallback for root nodes (no parent): use node's own value
    const selfMap = nodeToChannelMapThemeAware(node, activeThemeId, isPrimaryTheme);
    return selfMap[channelKey] ?? 0;
  };

  // ── Token Assignment State (for token nodes) ──────────────────
  const isTokenNodeChild = !!node.isTokenNode && !node.isTokenPrefix;

  // Helper: resolve a token node's ACTUAL color by following valueTokenAssignments → value token
  const resolveTokenNodeColor = useCallback((tokenNodeOwner: ColorNodeType, ownToken: DesignToken): { h: number; s: number; l: number; a: number; hasColor: boolean } => {
    const valueTokenId = (() => {
      if (tokenNodeOwner.valueTokenAssignments) {
        const vtId = tokenNodeOwner.valueTokenAssignments[activeThemeId!]
          || (primaryThemeId ? tokenNodeOwner.valueTokenAssignments[primaryThemeId] : undefined)
          || Object.values(tokenNodeOwner.valueTokenAssignments)[0];
        if (vtId) return vtId;
      }
      return tokenNodeOwner.valueTokenId;
    })();
    if (!valueTokenId) return { h: 0, s: 0, l: 0, a: 100, hasColor: false };
    const valueToken = tokens.find(vt => vt.id === valueTokenId);
    if (valueToken) {
      const vtv = valueToken.themeValues ? (valueToken.themeValues[activeThemeId!] || Object.values(valueToken.themeValues)[0]) : null;
      return { h: vtv?.hue ?? valueToken.hue ?? 0, s: vtv?.saturation ?? valueToken.saturation ?? 0, l: vtv?.lightness ?? valueToken.lightness ?? 50, a: vtv?.alpha ?? valueToken.alpha ?? 100, hasColor: true };
    }
    const tv = ownToken.themeValues ? (ownToken.themeValues[activeThemeId!] || Object.values(ownToken.themeValues)[0]) : null;
    const h = tv?.hue ?? ownToken.hue;
    const s = tv?.saturation ?? ownToken.saturation;
    const l = tv?.lightness ?? ownToken.lightness;
    if (h === undefined && s === undefined && l === undefined) return { h: 0, s: 0, l: 0, a: 100, hasColor: false };
    return { h: h ?? 0, s: s ?? 0, l: l ?? 50, a: tv?.alpha ?? ownToken.alpha ?? 100, hasColor: true };
  }, [tokens, activeThemeId, primaryThemeId]);

  // For token nodes: look up tokens/nodes across ALL project pages (allProjectNodes)
  // Page name map for cross-page indication
  const pageNameMap = useMemo(() => {
    const m = new Map<string, string>();
    pages.forEach(p => m.set(p.id, p.name));
    return m;
  }, [pages]);

  const tokenRefs = useMemo<TokenRefInfo[]>(() => {
    if (!isTokenNodeChild) return [];
    const refs: TokenRefInfo[] = [];
    // Use all project nodes for cross-page lookup when available
    const lookupNodes = allProjectNodes ?? nodes;

    tokens.forEach(t => {
      if (t.id === node.ownTokenId) return;
      const hasThemeColor = t.themeValues && Object.values(t.themeValues).some(tv => tv.hue !== undefined || tv.saturation !== undefined || tv.lightness !== undefined);
      const hasDirectColor = t.hue !== undefined || t.saturation !== undefined || t.lightness !== undefined;
      if (!hasThemeColor && !hasDirectColor) return;

      // Find the owner node (4-strategy lookup) — search all project nodes
      const ownerNode = lookupNodes.find(n => n.ownTokenId === t.id)
        || lookupNodes.find(n => n.tokenAssignments && Object.values(n.tokenAssignments).some(ids => Array.isArray(ids) ? ids.includes(t.id) : ids === t.id))
        || lookupNodes.find(n => n.valueTokenAssignments && Object.values(n.valueTokenAssignments).includes(t.id))
        || lookupNodes.find(n => n.tokenId === t.id || n.tokenIds?.includes(t.id));
      const cs = ownerNode?.colorSpace || 'hsl';

      // For token nodes without a value token assigned: mark hasColor = false
      const isTokenNodeOwner = ownerNode?.isTokenNode && !ownerNode?.isTokenPrefix;
      let h: number, s: number, l: number, a: number, hasColor: boolean;
      if (isTokenNodeOwner && ownerNode) {
        const resolved = resolveTokenNodeColor(ownerNode, t);
        h = resolved.h; s = resolved.s; l = resolved.l; a = resolved.a; hasColor = resolved.hasColor;
      } else {
        const tv = t.themeValues ? (t.themeValues[activeThemeId!] || Object.values(t.themeValues)[0]) : null;
        // Detect empty tokens (no color values assigned yet)
        const tvIsEmpty = tv && tv.hue === undefined && tv.saturation === undefined && tv.lightness === undefined;
        h = tv?.hue ?? t.hue ?? 0; s = tv?.saturation ?? t.saturation ?? 0; l = tv?.lightness ?? t.lightness ?? 50; a = tv?.alpha ?? t.alpha ?? 100;
        hasColor = !tvIsEmpty && (tv?.hue !== undefined || t.hue !== undefined);
      }

      const tc: TokenColor = { h, s, l, a };
      const cssColor = hasColor ? `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${(a / 100).toFixed(2)})` : null;
      const displayLabel = hasColor ? tokenColorToDisplayString(tc, cs) : null;
      const isParent = ownerNode?.id === node.parentId;
      // Cross-page indication: show page name if token is on a different page
      const tokenPage = t.pageId !== node.pageId ? pageNameMap.get(t.pageId || '') : undefined;
      refs.push({ tokenId: t.id, tokenName: t.name, groupName: isParent ? 'Parent Token' : '', cssColor, displayLabel, colorSpace: cs, hasColor, pageName: tokenPage, pageId: t.pageId });
    });

    // ── Ensure parent token node reference is included ──
    if (node.parentId) {
      const parentNode = lookupNodes.find(n => n.id === node.parentId);
      if (parentNode && parentNode.isTokenNode && !parentNode.isTokenPrefix && parentNode.ownTokenId) {
        const alreadyIncluded = refs.some(r => r.tokenId === parentNode.ownTokenId);
        if (!alreadyIncluded) {
          const parentToken = tokens.find(t => t.id === parentNode.ownTokenId);
          if (parentToken) {
            const resolved = resolveTokenNodeColor(parentNode, parentToken);
            const cs = parentNode.colorSpace || 'hsl';
            const tc: TokenColor = { h: resolved.h, s: resolved.s, l: resolved.l, a: resolved.a };
            const cssColor = resolved.hasColor ? `hsla(${Math.round(resolved.h)}, ${Math.round(resolved.s)}%, ${Math.round(resolved.l)}%, ${(resolved.a / 100).toFixed(2)})` : null;
            const dLabel = resolved.hasColor ? tokenColorToDisplayString(tc, cs) : null;
            const tokenPage = parentToken.pageId !== node.pageId ? pageNameMap.get(parentToken.pageId || '') : undefined;
            refs.unshift({ tokenId: parentToken.id, tokenName: parentToken.name, groupName: 'Parent Token', cssColor, displayLabel: dLabel, colorSpace: cs, hasColor: resolved.hasColor, pageName: tokenPage, pageId: parentToken.pageId });
          }
        }
      }
    }

    return refs;
  }, [isTokenNodeChild, tokens, nodes, allProjectNodes, node.ownTokenId, node.parentId, node.pageId, activeThemeId, primaryThemeId, resolveTokenNodeColor, pageNameMap]);

  // Theme-effective token assignment: resolves primary vs theme-specific
  const effectiveTokenAssignment = useMemo(() => {
    if (!nodeLogic) return undefined;
    return getEffectiveTokenAssignment(nodeLogic, activeThemeId, isPrimaryTheme, tokenIsUnlinked);
  }, [nodeLogic, activeThemeId, isPrimaryTheme, tokenIsUnlinked]);

  const [draftTokenAssignment, setDraftTokenAssignment] = useState<TokenAssignmentLogic>(() => {
    return effectiveTokenAssignment || { rows: [], fallbackMode: 'default' };
  });
  const [tokenUnsaved, setTokenUnsaved] = useState(false);
  const [tokenSaveFlash, setTokenSaveFlash] = useState(false);
  const [tokenPreviewResult, setTokenPreviewResult] = useState<TokenAssignResult | null>(null);

  const lastAutoPersistedTARef = useRef<TokenAssignmentLogic | null>(null);

  useEffect(() => {
    if (!tokenUnsaved) {
      if (effectiveTokenAssignment) setDraftTokenAssignment(effectiveTokenAssignment);
    } else if (lastAutoPersistedTARef.current && effectiveTokenAssignment) {
      // Detect external change (undo/redo)
      const isExternal = JSON.stringify(effectiveTokenAssignment) !== JSON.stringify(lastAutoPersistedTARef.current);
      if (isExternal) {
        setDraftTokenAssignment(effectiveTokenAssignment);
        setTokenUnsaved(false);
        lastAutoPersistedTARef.current = null;
      }
    }
  }, [effectiveTokenAssignment, tokenUnsaved]);

  // Re-init when theme changes
  useEffect(() => {
    setDraftTokenAssignment(effectiveTokenAssignment || { rows: [], fallbackMode: 'default' });
    setTokenUnsaved(false);
    lastAutoPersistedTARef.current = null;
  }, [activeThemeId]);

  // ── Auto-persist draft token assignment for undo/redo coverage ──
  const tokenAutoPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!tokenUnsaved) return;
    if (tokenAutoPersistTimerRef.current) clearTimeout(tokenAutoPersistTimerRef.current);
    tokenAutoPersistTimerRef.current = setTimeout(() => {
      const existing = advancedLogic.find(l => l.nodeId === nodeId);
      const isThemeSpecificToken = !isPrimaryTheme && tokenIsUnlinked;
      if (draftTokenAssignment.rows.length > 0) {
        if (existing) {
          onUpdateAdvancedLogic(advancedLogic.map(l => {
            if (l.nodeId !== nodeId) return l;
            if (isThemeSpecificToken) {
              return { ...l, themeTokenAssignment: { ...(l.themeTokenAssignment || {}), [activeThemeId]: draftTokenAssignment } };
            }
            return { ...l, tokenAssignment: draftTokenAssignment };
          }));
        } else {
          if (isThemeSpecificToken) {
            onUpdateAdvancedLogic([...advancedLogic, { nodeId, channels: {}, themeTokenAssignment: { [activeThemeId]: draftTokenAssignment } }]);
          } else {
            onUpdateAdvancedLogic([...advancedLogic, { nodeId, channels: {}, tokenAssignment: draftTokenAssignment }]);
          }
        }
      }
      lastAutoPersistedTARef.current = draftTokenAssignment;
      tokenAutoPersistTimerRef.current = null;
    }, 800);
    return () => { if (tokenAutoPersistTimerRef.current) clearTimeout(tokenAutoPersistTimerRef.current); };
  }, [draftTokenAssignment, tokenUnsaved, isPrimaryTheme, tokenIsUnlinked, activeThemeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateDraftTokenAssignment = useCallback((logic: TokenAssignmentLogic) => {
    setDraftTokenAssignment(logic);
    setTokenUnsaved(true);
    setTokenPreviewResult(null);
  }, []);

  const buildTokenEvalCtx = useCallback((): TokenEvalContext => {
    const tokenValues = new Map<string, TokenColor>();
    const tokenNames = new Map<string, string>();
    tokens.forEach(t => {
      const tv = t.themeValues ? (t.themeValues[activeThemeId] || Object.values(t.themeValues)[0]) : null;
      const h = tv?.hue ?? t.hue ?? 0;
      const s = tv?.saturation ?? t.saturation ?? 0;
      const l = tv?.lightness ?? t.lightness ?? 50;
      const a = tv?.alpha ?? t.alpha ?? 100;
      if (tv?.hue !== undefined || tv?.saturation !== undefined || tv?.lightness !== undefined || t.hue !== undefined) {
        tokenValues.set(t.id, { h, s, l, a });
      }
      tokenNames.set(t.id, t.name);
    });
    // ── Resolve token node tokens through value token assignments ──
    // Token nodes derive their color from a value token. ALWAYS overwrite
    // the first-pass defaults (which may be empty placeholders) with the
    // correctly resolved color from the value token chain.
    nodes.forEach(n => {
      if (!n.isTokenNode || n.isTokenPrefix || !n.ownTokenId) return;
      const ownToken = tokens.find(tt => tt.id === n.ownTokenId);
      if (!ownToken) return;
      const resolved = resolveTokenNodeColor(n, ownToken);
      if (resolved.hasColor) {
        tokenValues.set(n.ownTokenId, { h: resolved.h, s: resolved.s, l: resolved.l, a: resolved.a });
      }
    });
    return { self: evalCtx.self, parent: evalCtx.parent, allNodes: evalCtx.allNodes, tokenValues, tokenNames };
  }, [tokens, activeThemeId, evalCtx, nodes, resolveTokenNodeColor]);

  // Memoized token eval context for live per-row evaluation in the panel
  const memoTokenEvalCtx = useMemo<TokenEvalContext | null>(() => {
    if (!isTokenNodeChild) return null;
    return buildTokenEvalCtx();
  }, [isTokenNodeChild, buildTokenEvalCtx]);

  const handleTokenPlay = useCallback(() => {
    // ── Sandbox mode: discard the token assignment instead of evaluating ──
    if (readOnly) {
      setDraftTokenAssignment({ rows: [], fallbackMode: 'default' });
      setTokenUnsaved(false);
      setTokenPreviewResult(null);
      return;
    }
    if (draftTokenAssignment.rows.length === 0) { setTokenPreviewResult({ type: 'error', message: 'No assignment rules to evaluate' }); return; }
    const tCtx = buildTokenEvalCtx();
    let result: DetailedTokenAssignResult;
    try {
      result = evaluateTokenAssignmentDetailed(draftTokenAssignment, tCtx);
    } catch (e: any) {
      setTokenPreviewResult({ type: 'error', message: e?.message || 'Unexpected evaluation error' });
      return;
    }
    if (result.finalResult) {
      if (result.finalResult.type === 'tokenRef') {
        // Validate token exists — try by ID first, then by name fallback
        let exists = tokens.find(t => t.id === result.finalResult!.tokenId);
        if (!exists && (result.finalResult as any).tokenName) {
          // Try name-based lookup as fallback
          const name = (result.finalResult as any).tokenName;
          exists = tokens.find(t => t.name === name || t.name.toLowerCase() === name.toLowerCase());
          if (exists) {
            // Patch the tokenId to the correct one
            (result.finalResult as any).tokenId = exists.id;
          }
        }
        if (!exists) { setTokenPreviewResult({ type: 'error', message: `Token "${(result.finalResult as any).tokenName}" not found` }); return; }
      }
      setTokenPreviewResult(result.finalResult);
    } else {
      setTokenPreviewResult({ type: 'error', message: 'No valid output from rules' });
    }
  }, [draftTokenAssignment, buildTokenEvalCtx, tokens, readOnly]);

  const handleTokenSave = useCallback(() => {
    // ── Sandbox mode: discard the token assignment instead of persisting ──
    if (readOnly) {
      setDraftTokenAssignment({ rows: [], fallbackMode: 'default' });
      setTokenUnsaved(false);
      setTokenPreviewResult(null);
      return;
    }
    const hasAnyLogic = draftTokenAssignment.rows.length > 0;
    const existing = advancedLogic.find(l => l.nodeId === nodeId);
    const isThemeSpecificToken = !isPrimaryTheme && tokenIsUnlinked;

    if (!hasAnyLogic) {
      if (existing) {
        if (isThemeSpecificToken) {
          // Clear theme-specific token assignment only
          const newThemeTA = { ...(existing.themeTokenAssignment || {}) };
          delete newThemeTA[activeThemeId];
          onUpdateAdvancedLogic(advancedLogic.map(l =>
            l.nodeId === nodeId ? { ...l, themeTokenAssignment: Object.keys(newThemeTA).length > 0 ? newThemeTA : undefined } : l
          ));
        } else {
          const hasChannelLogic = Object.values(existing.channels || {}).some(ch => ch.rows.length > 0);
          if (!hasChannelLogic) { onUpdateAdvancedLogic(advancedLogic.filter(l => l.nodeId !== nodeId)); }
          else { onUpdateAdvancedLogic(advancedLogic.map(l => l.nodeId === nodeId ? { ...l, tokenAssignment: undefined } : l)); }
        }
      }
    } else {
      if (isThemeSpecificToken) {
        if (existing) {
          onUpdateAdvancedLogic(advancedLogic.map(l =>
            l.nodeId === nodeId ? { ...l, themeTokenAssignment: { ...(l.themeTokenAssignment || {}), [activeThemeId]: draftTokenAssignment } } : l
          ));
        } else {
          onUpdateAdvancedLogic([...advancedLogic, { nodeId, channels: {}, themeTokenAssignment: { [activeThemeId]: draftTokenAssignment } }]);
        }
      } else {
        if (existing) { onUpdateAdvancedLogic(advancedLogic.map(l => l.nodeId === nodeId ? { ...l, tokenAssignment: draftTokenAssignment } : l)); }
        else { onUpdateAdvancedLogic([...advancedLogic, { nodeId, channels: {}, tokenAssignment: draftTokenAssignment }]); }
      }
    }
    // Always evaluate logic on save to apply the result (don't require Play first)
    if (hasAnyLogic && onUpdateNode) {
      const tCtx = buildTokenEvalCtx();
      let evalResult: DetailedTokenAssignResult;
      try {
        evalResult = evaluateTokenAssignmentDetailed(draftTokenAssignment, tCtx);
      } catch {
        setTokenUnsaved(false);
        setTokenSaveFlash(true);
        setTimeout(() => setTokenSaveFlash(false), 1200);
        return;
      }
      // Determine effective final result (respecting finalOutputVar if set)
      let effectiveResult: TokenAssignResult | null = null;
      if (draftTokenAssignment.finalOutputVar && evalResult) {
        const matchRow = evalResult.rowOutputs.find(ro => ro.outputName === draftTokenAssignment.finalOutputVar && ro.result);
        if (matchRow?.result?.type === 'tokenRef' || matchRow?.result?.type === 'computedColor') {
          effectiveResult = matchRow.result;
        }
      } else {
        effectiveResult = evalResult.finalResult;
      }
      // Apply tokenRef results to the node's valueTokenAssignments
      if (effectiveResult?.type === 'tokenRef') {
        let exists = tokens.find(t => t.id === effectiveResult!.tokenId);
        // Name-based fallback for resolved tokens with stale/empty IDs
        if (!exists && (effectiveResult as any).tokenName) {
          const name = (effectiveResult as any).tokenName;
          exists = tokens.find(t => t.name === name || t.name.toLowerCase() === name.toLowerCase());
          if (exists) (effectiveResult as any).tokenId = exists.id;
        }
        if (exists) {
          const newAssign = { ...(node.valueTokenAssignments || {}) };
          newAssign[activeThemeId || 'primary'] = effectiveResult.tokenId;
          onUpdateNode(nodeId, { valueTokenAssignments: newAssign } as Partial<ColorNodeType>);
        }
      }
      // Update preview to reflect the evaluated result
      if (effectiveResult) setTokenPreviewResult(effectiveResult);
    } else if (tokenPreviewResult && onUpdateNode) {
      // Fallback: use preview result from Play if available
      if (tokenPreviewResult.type === 'tokenRef') {
        const newAssign = { ...(node.valueTokenAssignments || {}) };
        newAssign[activeThemeId || 'primary'] = tokenPreviewResult.tokenId;
        onUpdateNode(nodeId, { valueTokenAssignments: newAssign } as Partial<ColorNodeType>);
      }
    }
    setTokenUnsaved(false);
    setTokenSaveFlash(true);
    setTimeout(() => setTokenSaveFlash(false), 1200);
  }, [draftTokenAssignment, advancedLogic, nodeId, onUpdateAdvancedLogic, tokenPreviewResult, onUpdateNode, node, activeThemeId, buildTokenEvalCtx, tokens, isPrimaryTheme, tokenIsUnlinked, readOnly]);

  // ── Render ────────────────────────────────────────────────────

  const MINIMIZED_HEIGHT = Math.max(60, Math.round(window.innerHeight * 0.08));
  const minimizedY = window.innerHeight - MINIMIZED_HEIGHT;

  const handleMinimizeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMinimize) {
      onMinimize();
    }
  }, [onMinimize]);

  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onExpand) {
      onExpand();
    }
  }, [onExpand]);

  const animatedTop = isMinimized ? minimizedY : position.y;
  const animatedLeft = isMinimized ? 0 : position.x;
  const animatedWidth = isMinimized ? window.innerWidth : size.width;
  const animatedHeight = isMinimized ? MINIMIZED_HEIGHT : size.height;

  // Count active channels for info display
  const activeChannelCount = Object.values(draftChannels).filter(ch => ch.rows.length > 0).length;

  return (
    <motion.div
      data-advanced-popup
      data-testid={`advanced-popup-panel-${node.id}`}
      initial={{ y: 40, opacity: 0 }}
      animate={{
        y: 0,
        opacity: 1,
        top: animatedTop,
        left: animatedLeft,
        width: animatedWidth,
        height: animatedHeight,
      }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="advanced-popup"
      style={{
        position: 'fixed',
        zIndex: 9999,
        borderRadius: '12px 12px 0 0',
        overflow: 'hidden',
        border: '1px solid color-mix(in srgb, var(--border-on-surface-0) 65%, transparent)',
        borderBottom: 'none',
        background: 'var(--surface-0)',
        boxShadow:
          '0 -12px 48px color-mix(in srgb, var(--shadow-color-overlay) 85%, transparent), 0 0 0 1px color-mix(in srgb, var(--border-on-surface-0) 50%, transparent)',
        userSelect: isDragging || isResizing ? 'none' : 'auto',
      }}
    >
      {/* Resize edge handles */}
      {!isMinimized && edges.map((edge) => (
        <div key={edge} style={edgeStyle(edge)} onMouseDown={(e) => handleResizeStart(edge, e)} />
      ))}

      {/* Header */}
      <div
        className="advanced-popup-header"
        data-testid="advanced-popup-header"
        style={{
          borderBottom: isMinimized ? 'none' : '1px solid color-mix(in srgb, var(--border-on-surface-0) 55%, transparent)',
          cursor: isMinimized ? 'default' : (isDragging ? 'grabbing' : 'grab'),
        }}
        onMouseDown={isMinimized ? undefined : handleDragStart}
      >
        <div className="advanced-popup-header-left">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="advanced-popup-header-icon"
          >
            <path d="M3 19a2 2 0 0 0 2 2c2 0 2 -4 3 -9s1 -9 3 -9a2 2 0 0 1 2 2" />
            <path d="M5 12h6" />
            <path d="M15 12l6 6" />
            <path d="M15 18l6 -6" />
          </svg>
          <span className="advanced-popup-header-title">Advanced</span>
          <span className="advanced-popup-header-node-badge">
            {nodeDisplayName || node.referenceName || node.id.slice(0, 8)}
          </span>
          {isTokenNodeChild && (
            <span className="advanced-popup-header-token-badge">Token</span>
          )}
        </div>

        <div className="advanced-popup-header-right">
          {/* Minimize / Expand toggle */}
          <button
            className="advanced-popup-header-btn"
            onClick={isMinimized ? handleExpandClick : handleMinimizeClick}
            title={isMinimized ? 'Expand' : 'Minimize'}
            data-testid="advanced-popup-minimize-button"
          >
            {isMinimized ? <Maximize2 size={12} /> : <Minus size={14} />}
          </button>
          {/* Close */}
          <button
            className="advanced-popup-header-btn"
            data-testid="advanced-popup-close-button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Sandbox banner */}
      {readOnly && !isMinimized && (
        <div className="advanced-sandbox-banner">
          <span className="advanced-sandbox-text">Sandbox — explore freely, changes won't be saved</span>
        </div>
      )}

      {/* ── Minimized state ── */}
      {isMinimized ? (
        <div className="advanced-minimized-overlay">
          <div className="advanced-minimized-gradient" />
          <button
            className="advanced-minimized-expand-btn"
            onClick={handleExpandClick}
          >
            <Maximize2 size={14} />
            <span className="advanced-minimized-expand-label">Expand</span>
          </button>
        </div>
      ) : (
        /* ── Normal body ── */
        <div className="advanced-body">
        {isTokenNodeChild ? (
          /* ── Token Node: 2-column layout ── */
          <TokenAssignmentPanel
            node={node}
            nodes={allProjectNodes ?? nodes}
            tokens={tokens}
            logic={draftTokenAssignment}
            tokenRefs={tokenRefs}
            evalCtx={evalCtx}
            tokenEvalCtx={memoTokenEvalCtx}
            onUpdateLogic={updateDraftTokenAssignment}
            onSave={handleTokenSave}
            previewResult={tokenPreviewResult}
            onPlay={handleTokenPlay}
            hasUnsaved={tokenUnsaved}
            saveFlash={tokenSaveFlash}
            pages={pages}
          />
        ) : colorInfo ? (
          <div className="advanced-color-layout">
            <div className="advanced-color-columns">
              {/* ── Column 1: Info ── */}
              <div className="advanced-info-col">
                <div className="advanced-info-col-inner">
                  {/* Color swatch + space badge */}
                  <div className="advanced-info-swatch-row">
                    <div
                      className="advanced-info-swatch"
                      style={{
                        backgroundColor: colorInfo.cssColor,
                        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--on-surface-0) 8%, transparent)',
                      }}
                    />
                    <span className="advanced-info-cs-badge">
                      {colorInfo.colorSpace.toUpperCase()}
                    </span>
                  </div>

                  {/* Channel values */}
                  <div className="advanced-info-channels">
                    {channelDefs.map((ch, i) => {
                      const chLogic = draftChannels[ch.key];
                      const isConditioned = chLogic && chLogic.rows.length > 0;
                      return (
                        <div key={ch.key} className="advanced-info-channel-row">
                          <span className="advanced-info-channel-label">{ch.label}</span>
                          {isConditioned ? (
                            <span className="advanced-info-channel-value--active">
                              {fmtVal(colorInfo.channels[i], ch.key)}
                              {getUnit(ch.key, colorInfo.colorSpace)}
                            </span>
                          ) : (
                            <span className="advanced-info-channel-value">
                              {fmtVal(colorInfo.channels[i], ch.key)}
                              {getUnit(ch.key, colorInfo.colorSpace)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {(() => {
                      const alphaLogic = draftChannels.alpha;
                      const isAlphaConditioned = alphaLogic && alphaLogic.rows.length > 0;
                      return (
                        <div className="advanced-info-channel-row">
                          <span className="advanced-info-channel-label">Alpha</span>
                          {isAlphaConditioned ? (
                            <span className="advanced-info-channel-value--active">
                              {Math.round(colorInfo.alpha)}%
                            </span>
                          ) : (
                            <span className="advanced-info-channel-value">
                              {Math.round(colorInfo.alpha)}%
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="advanced-info-divider" />

                  <div className="advanced-info-hex-row">
                    <span className="advanced-info-hex-label">Hex</span>
                    <span className="advanced-info-hex-value">
                      {colorInfo.hex}
                    </span>
                  </div>

                  {/* Active logic indicator */}
                  {activeChannelCount > 0 && (
                    <>
                      <div className="advanced-info-divider" />
                      <div className="advanced-info-active-indicator">
                        <Circle size={6} fill="var(--status-success)" stroke="none" />
                        <span className="advanced-info-active-text">
                          {activeChannelCount} active channel{activeChannelCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </>
                  )}

                  {/* ── Node View section ── */}
                  <div className="advanced-info-divider" />
                  <NodeViewSection
                    colorSpace={colorInfo.colorSpace}
                    channelDefs={channelDefs}
                    config={draftNodeViewConfig}
                    onUpdateConfig={persistNodeViewConfig}
                    readOnly={readOnly}
                    hasTokensAssigned={(() => {
                      if (activeThemeId && node.tokenAssignments?.[activeThemeId] !== undefined) {
                        return node.tokenAssignments[activeThemeId].length > 0;
                      }
                      return (node.tokenIds || []).length > 0;
                    })()}
                  />
                </div>

                {/* Help button — pushed to bottom */}
                <div className="advanced-info-help-footer">
                  <button
                    onClick={() => setShowHelp(true)}
                    className="advanced-info-help-btn"
                    title="Logic Reference Guide"
                  >
                    <HelpCircle size={12} className="advanced-info-help-icon" />
                    <span className="advanced-info-help-text">Reference Guide</span>
                  </button>
                </div>
              </div>

              {/* ── Columns 2-4: Channel columns ── */}
              {channelDefs.map((ch) => (
                <ChannelColumn
                  key={ch.key}
                  channelDef={ch}
                  channelKey={ch.key}
                  colorSpace={colorInfo.colorSpace}
                  node={node}
                  nodes={nodes}
                  channelLogic={draftChannels[ch.key]}
                  baseValue={getBaseValue(ch.key)}
                  evalCtx={evalCtx}
                  onUpdateChannelLogic={updateDraftChannelLogic}
                  onSaveChannel={handleSaveChannel}
                  channelHasUnsaved={!!unsavedChannels[ch.key]}
                  channelSaveFlash={!!saveFlashChannels[ch.key]}
                />
              ))}

              {/* ── Column 5: Alpha ── */}
              <ChannelColumn
                channelDef={{ label: 'Alpha', key: 'alpha' }}
                channelKey="alpha"
                colorSpace={colorInfo.colorSpace}
                node={node}
                nodes={nodes}
                channelLogic={draftChannels.alpha}
                baseValue={getBaseValue('alpha')}
                evalCtx={evalCtx}
                isLast
                onUpdateChannelLogic={updateDraftChannelLogic}
                onSaveChannel={handleSaveChannel}
                channelHasUnsaved={!!unsavedChannels.alpha}
                channelSaveFlash={!!saveFlashChannels.alpha}
              />
            </div>
          </div>
        ) : (
          <div className="advanced-empty-state">
            <div className="advanced-empty-text">
              Advanced options for this node will appear here.
            </div>
          </div>
        )}
      </div>
      )}

      {/* Help reference popup */}
      <AnimatePresence>
        {showHelp && <AdvancedHelpPopup onClose={() => setShowHelp(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}
