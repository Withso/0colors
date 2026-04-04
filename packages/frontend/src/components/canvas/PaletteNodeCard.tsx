import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ColorNode, DesignToken, TokenGroup } from '../../types';
import { Input } from '../ui/input';
import { Lock, Unlock, Plus, Trash2, ChevronDown, Copy, Check, Crown, Eye, EyeOff } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import namer from 'color-namer';
import { copyTextToClipboard } from '../../utils/clipboard';
import { hslToRgb, rgbToHex, rgbToHsl, hslToOklch, oklchToHsl } from '../../utils/color-conversions';
import { ScrubberInput } from './ScrubberInput';
import { OklchGamutSlider } from './OklchGamutSlider';
import { DualRangeSlider } from './DualRangeSlider';
import { Switch } from '../ui/switch';
import { MAX_PALETTE_NAME } from '../../utils/textLimits';
import './PaletteNodeCard.css';

// ─── Color Utilities ───────────────────────────────────────────
// hslToRgb, rgbToHex, rgbToHsl, hslToOklch, oklchToHsl imported from ../utils/color-conversions

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Color Space Conversions ────────────────────────────────────

function generateColorName(h: number, s: number, l: number): string {
  try {
    const rgb = hslToRgb(h, s, l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    const names = namer(hex);
    return names.ntc[0]?.name?.toLowerCase().replace(/\s+/g, '') || 'color';
  } catch {
    return 'color';
  }
}

// ─── Curve Math ────────────────────────────────────────────────

export type CurveType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'sine' | 'exponential' | 'material' | 'custom';

/** Returns a 0-1 value mapped through the selected curve */
function applyCurve(t: number, curve: CurveType, customPoints?: number[], shadeCount?: number): number {
  if (curve === 'custom' && customPoints && shadeCount) {
    // For custom curves, interpolate between defined control points
    // customPoints has values at each shade index (length = shadeCount)
    const idx = t * (shadeCount - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi || lo >= customPoints.length - 1) return customPoints[Math.min(lo, customPoints.length - 1)];
    const frac = idx - lo;
    return customPoints[lo] + (customPoints[hi] - customPoints[lo]) * frac;
  }
  switch (curve) {
    case 'linear':
      return t;
    case 'ease-in':
      return t * t * t; // cubic ease-in
    case 'ease-out':
      return 1 - Math.pow(1 - t, 3); // cubic ease-out
    case 'ease-in-out':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'sine':
      return (1 - Math.cos(t * Math.PI)) / 2;
    case 'exponential':
      if (t === 0) return 0;
      if (t === 1) return 1;
      return t < 0.5
        ? Math.pow(2, 20 * t - 10) / 2
        : (2 - Math.pow(2, -20 * t + 10)) / 2;
    case 'material': {
      // Material Design inspired tone scale - more space in midtones
      // Uses a slightly modified sine-like curve that bunches values in the mid range
      return 0.5 - 0.5 * Math.cos(Math.pow(t, 0.85) * Math.PI);
    }
    default:
      return t;
  }
}

/** Compute saturation at each step based on saturation mode */
function computeSaturation(
  baseSat: number,
  mode: 'constant' | 'auto' | 'manual',
  t: number,
  lightness: number,
  satStart?: number,
  satEnd?: number,
): number {
  if (mode === 'constant') return baseSat;
  if (mode === 'manual') {
    const s = (satStart ?? baseSat) + ((satEnd ?? baseSat) - (satStart ?? baseSat)) * t;
    return Math.max(0, Math.min(100, s));
  }
  // Auto: reduce saturation at extreme lightness
  // At L=0 or L=100, saturation drops significantly. At L=50, it stays full.
  const lightnessDeviation = Math.abs(lightness - 50) / 50; // 0 at center, 1 at extremes
  const saturationMultiplier = 1 - lightnessDeviation * 0.6; // drops to 40% at extremes
  return Math.max(0, Math.min(100, baseSat * saturationMultiplier));
}

/** Compute hue shift at step */
function computeHue(baseHue: number, hueShift: number, t: number): number {
  return (baseHue + hueShift * t + 360) % 360;
}

// ─── Interfaces ────────────────────────────────────────────────

interface PaletteNodeCardProps {
  node: ColorNode;
  nodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  activeProjectId: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onUpdateNode: (id: string, updates: Partial<ColorNode>) => void;
  onAddChild: (parentId: string) => void;
  onDeleteNode: (id: string) => void;
  onUpdateToken?: (id: string, updates: Partial<DesignToken>) => void;
  onWireDragStart: (nodeId: string, buttonType: 'left' | 'right') => void;
  onWireHoverStart: (nodeId: string) => void;
  onWireHoverEnd: () => void;
  isWireHovered: boolean;
  wireStartButtonType: 'left' | 'right' | null;
  isDraggingWire: boolean;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (e?: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onColorPickerOpenChange: (nodeId: string, isOpen: boolean) => void;
  showInheritanceIcon?: boolean;
  activeThemeId?: string;
  isPrimaryTheme?: boolean;
  primaryThemeId?: string;
  showAllVisible?: boolean;
  isNodeHidden?: boolean;
  onToggleVisibility?: () => void;
}

// ─── Sub-Components ────────────────────────────────────────────

/** Generate default custom points from a preset curve */
function generateCustomPointsFromCurve(curve: CurveType, count: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    points.push(applyCurve(t, curve === 'custom' ? 'linear' : curve));
  }
  return points;
}

/** SVG curve visualization with interactive drag points for all curves */
function CurveVisualizer({
  curveType,
  lightnessStart,
  lightnessEnd,
  shadeCount,
  hue,
  saturation,
  customPoints,
  onPointsDrag,
}: {
  curveType: CurveType;
  lightnessStart: number;
  lightnessEnd: number;
  shadeCount: number;
  hue: number;
  saturation: number;
  customPoints?: number[];
  onPointsDrag?: (points: number[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  // Refs for stable access in imperative event handlers (no stale closures)
  const dragPointsRef = useRef<number[] | null>(null);
  const draggingIndexRef = useRef<number | null>(null);
  const onPointsDragRef = useRef(onPointsDrag);
  onPointsDragRef.current = onPointsDrag;
  
  const W = 260;
  const H = 100;
  const PAD = 12;

  // Compute effective custom points for any curve type
  const effectivePoints = useMemo(() => {
    if (curveType === 'custom' && customPoints && customPoints.length === shadeCount) {
      return customPoints;
    }
    return generateCustomPointsFromCurve(curveType, shadeCount);
  }, [curveType, customPoints, shadeCount]);

  // Keep effectivePoints in a ref so mousedown handler always sees the latest
  const effectivePointsRef = useRef(effectivePoints);
  effectivePointsRef.current = effectivePoints;

  // Generate the smooth curve path
  const resolution = 50;
  const pathParts: string[] = [];
  for (let i = 0; i <= resolution; i++) {
    const t = i / resolution;
    const curved = applyCurve(t, curveType, customPoints, shadeCount);
    const lightness = lightnessStart + (lightnessEnd - lightnessStart) * curved;
    const x = PAD + t * (W - PAD * 2);
    const y = PAD + (1 - lightness / 100) * (H - PAD * 2);
    pathParts.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
  }

  // Generate shade dots
  const dots = [];
  for (let i = 0; i < shadeCount; i++) {
    const t = shadeCount > 1 ? i / (shadeCount - 1) : 0;
    const curved = applyCurve(t, curveType, customPoints, shadeCount);
    const lightness = lightnessStart + (lightnessEnd - lightnessStart) * curved;
    const x = PAD + t * (W - PAD * 2);
    const y = PAD + (1 - lightness / 100) * (H - PAD * 2);
    const rgb = hslToRgb(hue, saturation, lightness);
    dots.push({ x, y, color: rgbToHex(rgb.r, rgb.g, rgb.b), lightness });
  }

  // Imperative drag: register global listeners on mousedown, remove on mouseup.
  // All state accessed via refs so handlers never go stale — no useEffect needed.
  const handleDotMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    if (!onPointsDragRef.current) return;
    e.stopPropagation();
    e.preventDefault();

    // Snapshot the current curve into mutable points
    dragPointsRef.current = [...effectivePointsRef.current];
    draggingIndexRef.current = index;
    setDraggingIndex(index);

    const svg = svgRef.current;
    if (!svg) return;

    const handleMouseMove = (ev: MouseEvent) => {
      const idx = draggingIndexRef.current;
      if (idx === null || !dragPointsRef.current || !svg) return;

      const rect = svg.getBoundingClientRect();
      // Map pixel Y → viewBox Y, accounting for CSS scaling
      const scaleY = H / rect.height;
      const viewBoxY = (ev.clientY - rect.top) * scaleY;
      const curveVal = Math.max(0, Math.min(1, (viewBoxY - PAD) / (H - PAD * 2)));

      dragPointsRef.current[idx] = curveVal;
      onPointsDragRef.current?.([...dragPointsRef.current]);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      dragPointsRef.current = null;
      draggingIndexRef.current = null;
      setDraggingIndex(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <svg
      ref={svgRef}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="palette-card-curve-svg"
      style={{ height: '100px' }}
    >
      {/* Grid lines */}
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--border-on-surface-0)" strokeWidth="0.5" />
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border-on-surface-0)" strokeWidth="0.5" />
      {/* 50% lightness guide */}
      <line
        x1={PAD}
        y1={PAD + (1 - 0.5) * (H - PAD * 2)}
        x2={W - PAD}
        y2={PAD + (1 - 0.5) * (H - PAD * 2)}
        stroke="var(--border-on-surface-0)"
        strokeWidth="0.5"
        strokeDasharray="2,3"
      />
      {/* 25% and 75% guides */}
      <line x1={PAD} y1={PAD + 0.25 * (H - PAD * 2)} x2={W - PAD} y2={PAD + 0.25 * (H - PAD * 2)} stroke="var(--border-on-surface-0)" strokeWidth="0.5" strokeDasharray="1,4" />
      <line x1={PAD} y1={PAD + 0.75 * (H - PAD * 2)} x2={W - PAD} y2={PAD + 0.75 * (H - PAD * 2)} stroke="var(--border-on-surface-0)" strokeWidth="0.5" strokeDasharray="1,4" />
      {/* Curve path */}
      <path d={pathParts.join(' ')} fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" opacity="0.8" />
      {/* Shade dots — always draggable */}
      {dots.map((dot, i) => (
        <g key={i}>
          {/* Invisible larger hit target */}
          <circle
            cx={dot.x}
            cy={dot.y}
            r="12"
            fill="transparent"
            style={{ cursor: 'ns-resize' }}
            onMouseDown={(e) => handleDotMouseDown(e, i)}
          />
          <circle
            cx={dot.x}
            cy={dot.y}
            r={draggingIndex !== null ? 5 : 4}
            fill={dot.color}
            stroke={draggingIndex === i ? 'var(--accent-primary)' : 'var(--surface-2)'}
            strokeWidth={draggingIndex === i ? 2 : 1}
            style={{ cursor: 'ns-resize' }}
            onMouseDown={(e) => handleDotMouseDown(e, i)}
          />
          {/* Lightness value label while dragging */}
          {draggingIndex === i && (
            <text
              x={dot.x}
              y={dot.y - 10}
              fill="var(--text-primary)"
              fontSize="9"
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              {Math.round(dot.lightness)}%
            </text>
          )}
        </g>
      ))}
      {/* Axis labels */}
      <text x={PAD} y={H - 2} fill="var(--text-disabled)" fontSize="7" fontFamily="var(--font-mono)">L</text>
      <text x={W - PAD - 6} y={H - 2} fill="var(--text-disabled)" fontSize="7" fontFamily="var(--font-mono)">R</text>
    </svg>
  );
}

/** Shade preview strip with contrast ratios and modification indicators */
function ShadePreviewStrip({
  shadeColors,
  shadeCount,
  primaryShadeHexes,
}: {
  shadeColors: Array<{ hex: string; displayValue: string; lightness: number; name: string }>;
  shadeCount: number;
  primaryShadeHexes?: string[] | null;
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyValue = useCallback((value: string, index: number) => {
    copyTextToClipboard(value);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1200);
  }, []);

  return (
    <div className="palette-card-shade-strip">
      {/* Continuous strip */}
      <div className="palette-card-shade-row">
        {shadeColors.map((shade, i) => {
          const isModified = primaryShadeHexes && primaryShadeHexes[i] && primaryShadeHexes[i] !== shade.hex;
          return (
            <div
              key={i}
              className="palette-card-shade-cell"
              style={{ backgroundColor: shade.hex }}
              title={`${shade.name}: ${shade.displayValue}${isModified ? ' (modified)' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                copyValue(shade.displayValue, i);
              }}
            >
              {/* Modification indicator dot */}
              {isModified && (
                <div className="palette-card-shade-mod-dot" />
              )}
              {copiedIndex === i && (
                <div className="palette-card-shade-copied">
                  <Check className="palette-card-shade-check" style={{ color: shade.lightness > 55 ? 'var(--absolute-black)' : 'var(--absolute-white)' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Island wrapper component ─────────────────────────────────
function Island({ 
  children, 
  isSelected, 
  isMultiSelected,
  className = '',
  noPadding = false,
}: { 
  children: React.ReactNode; 
  isSelected: boolean;
  isMultiSelected: boolean;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <div
      className={`palette-card-island ${isSelected || isMultiSelected ? 'palette-card-island--selected' : ''} ${className}`}
    >
      {noPadding ? children : (
        <div className="palette-card-island-inner">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Default accordion state for palette nodes ────────────────
const DEFAULT_PALETTE_SECTIONS: Record<string, boolean> = {
  name: true,
  color: true,
  distribution: false,
  lightnessScale: true,
  saturation: false,
  hueShift: false,
  pattern: false,
  preview: true,
};

// ─── Main Component ────────────────────────────────────────────

export function PaletteNodeCard({
  node,
  nodes,
  tokens,
  groups,
  activeProjectId,
  onMouseDown,
  onUpdateNode,
  onAddChild,
  onDeleteNode,
  onUpdateToken,
  onWireDragStart,
  onWireHoverStart,
  onWireHoverEnd,
  isWireHovered,
  wireStartButtonType,
  isDraggingWire,
  isSelected,
  isMultiSelected,
  onSelect,
  onDoubleClick,
  onColorPickerOpenChange,
  showInheritanceIcon = false,
  activeThemeId = '',
  isPrimaryTheme = true,
  primaryThemeId = '',
  showAllVisible = false,
  isNodeHidden = false,
  onToggleVisibility,
}: PaletteNodeCardProps) {
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);
  const [copiedHex, setCopiedHex] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<'color' | null>(null);

  const _rawExpandedSections = node.paletteExpandedSections ?? DEFAULT_PALETTE_SECTIONS;

  const prevColorRef = useRef({ hue: node.hue, saturation: node.saturation, lightness: node.lightness });

  // ─── Theme inheritance logic ──────────────────────────────────
  const isLinkedToPrimary = useCallback((): boolean => {
    if (isPrimaryTheme || !activeThemeId) return true;
    return !node.themeOverrides || !node.themeOverrides[activeThemeId];
  }, [isPrimaryTheme, activeThemeId, node.themeOverrides]);

  // On non-primary themes, structural changes (connect/disconnect) are blocked
  // if this palette node is inherited
  const isStructurallyLocked = !isPrimaryTheme && !!activeThemeId && isLinkedToPrimary();

  const getEffectiveColorValues = useCallback(() => {
    if (isPrimaryTheme || !activeThemeId || isLinkedToPrimary()) {
      return { hue: node.hue, saturation: node.saturation, lightness: node.lightness, alpha: node.alpha };
    }
    const overrides = node.themeOverrides?.[activeThemeId];
    return {
      hue: overrides?.hue ?? node.hue,
      saturation: overrides?.saturation ?? node.saturation,
      lightness: overrides?.lightness ?? node.lightness,
      alpha: overrides?.alpha ?? node.alpha,
    };
  }, [isPrimaryTheme, activeThemeId, isLinkedToPrimary, node.hue, node.saturation, node.lightness, node.alpha, node.themeOverrides]);

  const effectiveColors = getEffectiveColorValues();

  const handleToggleLinkToPrimary = useCallback(() => {
    if (isPrimaryTheme || !activeThemeId) return;
    if (isLinkedToPrimary()) {
      // Unlink: create theme override with current values (color only — tokens are independent)
      const currentValues = {
        hue: node.hue,
        saturation: node.saturation,
        lightness: node.lightness,
        alpha: node.alpha,
      };
      onUpdateNode(node.id, {
        themeOverrides: { ...node.themeOverrides, [activeThemeId]: currentValues },
      });
    } else {
      // Re-link: remove theme override (color only — tokens are independent)
      const newOverrides = { ...node.themeOverrides };
      delete newOverrides[activeThemeId];
      onUpdateNode(node.id, { themeOverrides: newOverrides });
    }
  }, [isPrimaryTheme, activeThemeId, isLinkedToPrimary, node, tokens, onUpdateNode, onUpdateToken]);

  // Whether color inputs should be disabled (non-primary + linked)
  const isColorInputDisabled = !isPrimaryTheme && isLinkedToPrimary();

  // Whether the entire palette is inherited (linked to primary in a non-primary theme)
  const isInherited = !isPrimaryTheme && isLinkedToPrimary();
  const isAllInputDisabled = isInherited;

  // When inherited, force-collapse all accordion sections so no content shows
  // (unless showAllVisible is on, in which case show current state for inspection)
  const ALL_COLLAPSED: Record<string, boolean> = {
    name: false, color: false, distribution: false,
    lightnessScale: false, saturation: false, hueShift: false,
    pattern: false, preview: false,
  };
  const expandedSections = (isAllInputDisabled && !showAllVisible) ? ALL_COLLAPSED : _rawExpandedSections;

  // Whether the color section is inherited (linked to primary)
  const isColorInherited = !isPrimaryTheme && isLinkedToPrimary();
  const isColorChanged = !isPrimaryTheme && !isLinkedToPrimary();
  
  // Whether the color VALUES have actually been modified from primary after unlinking
  const hasColorBeenModified = !isPrimaryTheme && !isLinkedToPrimary() && (() => {
    if (!activeThemeId || !node.themeOverrides?.[activeThemeId]) return false;
    const overrides = node.themeOverrides[activeThemeId];
    return (
      overrides.hue !== node.hue ||
      overrides.saturation !== node.saturation ||
      overrides.lightness !== node.lightness ||
      (overrides.alpha ?? node.alpha) !== node.alpha
    );
  })();

  const isColorSectionDimmed = !isPrimaryTheme && isColorInherited;
  const colorNeedsHover = isColorSectionDimmed;

  const colorDimOpacity: number | undefined = (() => {
    if (isAllInputDisabled) return undefined; // Wrapper handles dimming uniformly
    if (showAllVisible) return undefined;
    if (!isColorSectionDimmed) return undefined;
    if (hoveredSection === 'color') return 1;
    return 0.55;
  })();

  // Inheritance toggle bar opacity — matches the card's perceived dimness
  // so the bar and card have consistent visual weight.
  const barDimOpacity: number | undefined = (() => {
    if (isPrimaryTheme || !showInheritanceIcon) return undefined;
    if (showAllVisible) return undefined;
    if (!isColorSectionDimmed) return undefined; // not inherited → fully visible
    if (isSelected) return 1; // fully visible when node is selected
    if (hoveredSection === 'color') return 1;
    return 0.55;
  })();

  // ─── Derived values ───────────────────────────────────────────
  const paletteName = node.paletteName || '';
  const colorFormat = node.paletteColorFormat || 'HEX';
  const curveType: CurveType = (node.paletteCurveType as CurveType) || 'linear';
  const lightnessStart = node.paletteLightnessStart ?? 95;
  const lightnessEnd = node.paletteLightnessEnd ?? 15;
  const namingPattern = node.paletteNamingPattern || '1-9';
  const shadeCount = node.paletteShadeCount || 10;
  const satMode = (node.paletteSaturationMode as 'constant' | 'auto' | 'manual') || 'constant';
  const satStart = node.paletteSaturationStart ?? node.saturation;
  const satEnd = node.paletteSaturationEnd ?? node.saturation;
  const hueShift = node.paletteHueShift ?? 0;

  const eHue = effectiveColors.hue;
  const eSat = effectiveColors.saturation;
  const eLit = effectiveColors.lightness;
  const eAlpha = effectiveColors.alpha;

  const rgb = hslToRgb(eHue, eSat, eLit);
  const hexColor = rgbToHex(rgb.r, rgb.g, rgb.b);
  const nodeWidth = node.width || 300;
  const isLightBackground = eLit > 55;

  // ─── OKLCH / HSV derived values ───────────────────────────────
  const oklchValues = useMemo(() => hslToOklch(eHue, eSat, eLit), [eHue, eSat, eLit]);

  // ─── Display color value (native format based on paletteColorFormat) ────
  const displayColorValue = (() => {
    if (colorFormat === 'OKLCH') {
      return `oklch(${(oklchValues.l / 100).toFixed(2)} ${(oklchValues.c / 100).toFixed(3)} ${Math.round(oklchValues.h)})`;
    }
    if (colorFormat === 'HSLA') {
      const alpha = eAlpha ?? 100;
      if (alpha < 100) {
        return `hsla(${Math.round(eHue)}, ${Math.round(eSat)}%, ${Math.round(eLit)}%, ${(alpha / 100).toFixed(2)})`;
      }
      return `hsl(${Math.round(eHue)}, ${Math.round(eSat)}%, ${Math.round(eLit)}%)`;
    }
    if (colorFormat === 'RGBA') {
      const alpha = eAlpha ?? 100;
      if (alpha < 100) {
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(alpha / 100).toFixed(2)})`;
      }
      return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    }
    return hexColor;
  })();

  // ─── Auto-name ────────────────────────────────────────────────
  useEffect(() => {
    const changed =
      prevColorRef.current.hue !== node.hue ||
      prevColorRef.current.saturation !== node.saturation ||
      prevColorRef.current.lightness !== node.lightness;
    if (changed && !isManuallyEdited && !node.paletteNameLocked) {
      const newName = generateColorName(node.hue, node.saturation, node.lightness);
      onUpdateNode(node.id, { paletteName: newName });
    }
    prevColorRef.current = { hue: node.hue, saturation: node.saturation, lightness: node.lightness };
  }, [node.hue, node.saturation, node.lightness, isManuallyEdited, node.paletteNameLocked]);

  useEffect(() => {
    if (!paletteName) {
      const name = generateColorName(node.hue, node.saturation, node.lightness);
      onUpdateNode(node.id, { paletteName: name });
    }
  }, []);

  // ─── Shade computation ────────────────────────────────────────
  const shadeColors = useMemo(() => {
    const result: Array<{ hex: string; displayValue: string; lightness: number; saturation: number; hue: number; name: string }> = [];
    for (let i = 0; i < shadeCount; i++) {
      const t = shadeCount > 1 ? i / (shadeCount - 1) : 0;
      const curved = applyCurve(t, curveType);
      const lightness = lightnessStart + (lightnessEnd - lightnessStart) * curved;
      const sat = computeSaturation(eSat, satMode, t, lightness, satStart, satEnd);
      const hue = computeHue(eHue, hueShift, t);
      const srgb = hslToRgb(hue, sat, lightness);
      const hex = rgbToHex(srgb.r, srgb.g, srgb.b);

      // Compute display value based on color format
      let displayValue = hex;
      if (colorFormat === 'OKLCH') {
        const oklch = hslToOklch(hue, sat, lightness);
        displayValue = `oklch(${(oklch.l / 100).toFixed(2)} ${(oklch.c / 100).toFixed(3)} ${Math.round(oklch.h)})`;
      }

      let shadeName = '';
      switch (namingPattern) {
        case '1-9': shadeName = (i + 1).toString(); break;
        case '10-90': shadeName = ((i + 1) * 10).toString(); break;
        case '100-900': shadeName = ((i + 1) * 100).toString(); break;
        case 'a-z': shadeName = String.fromCharCode(97 + i); break;
      }

      result.push({ hex, displayValue, lightness, saturation: sat, hue, name: shadeName });
    }
    return result;
  }, [shadeCount, curveType, lightnessStart, lightnessEnd, eHue, eSat, satMode, satStart, satEnd, hueShift, namingPattern, colorFormat]);

  // ─── Primary theme shade computation (for modification indicators) ──
  const primaryShadeHexes = useMemo(() => {
    // Only compute when viewing a non-primary theme with overrides
    if (isPrimaryTheme || isLinkedToPrimary()) return null;
    const result: string[] = [];
    for (let i = 0; i < shadeCount; i++) {
      const t = shadeCount > 1 ? i / (shadeCount - 1) : 0;
      const curved = applyCurve(t, curveType);
      const lightness = lightnessStart + (lightnessEnd - lightnessStart) * curved;
      const sat = computeSaturation(node.saturation, satMode, t, lightness, satStart, satEnd);
      const hue = computeHue(node.hue, hueShift, t);
      const srgb = hslToRgb(hue, sat, lightness);
      result.push(rgbToHex(srgb.r, srgb.g, srgb.b));
    }
    return result;
  }, [isPrimaryTheme, isLinkedToPrimary, shadeCount, curveType, lightnessStart, lightnessEnd, node.hue, node.saturation, satMode, satStart, satEnd, hueShift]);

  // ─── Color update helper (handles theme overrides) ─────────────
  const updateColor = useCallback((updates: Partial<{ hue: number; saturation: number; lightness: number; alpha: number }>) => {
    if (!isPrimaryTheme && activeThemeId && !isLinkedToPrimary()) {
      // Update theme override
      const current = node.themeOverrides?.[activeThemeId] || { hue: node.hue, saturation: node.saturation, lightness: node.lightness, alpha: node.alpha };
      onUpdateNode(node.id, {
        themeOverrides: {
          ...node.themeOverrides,
          [activeThemeId]: { ...current, ...updates },
        },
      });
    } else {
      onUpdateNode(node.id, updates);
    }
  }, [isPrimaryTheme, activeThemeId, isLinkedToPrimary, node, onUpdateNode]);

  // ─── Per-property change handlers ─────────────────────────────
  const handleHueChange = useCallback((val: number) => {
    updateColor({ hue: Math.round(val) });
  }, [updateColor]);

  const handleSaturationChange = useCallback((val: number) => {
    updateColor({ saturation: Math.round(val) });
  }, [updateColor]);

  const handleLightnessChange = useCallback((val: number) => {
    updateColor({ lightness: Math.round(val) });
  }, [updateColor]);

  const handleAlphaChange = useCallback((val: number) => {
    updateColor({ alpha: Math.round(val) });
  }, [updateColor]);

  // ─── OKLCH property change handlers (convert to HSL for storage) ──
  const handleOklchLChange = useCallback((val: number) => {
    const hsl = oklchToHsl(val, oklchValues.c / 0.4, oklchValues.h);
    updateColor({ hue: Math.round(hsl.h), saturation: Math.round(hsl.s), lightness: Math.round(hsl.l) });
  }, [oklchValues.c, oklchValues.h, updateColor]);

  const handleOklchCChange = useCallback((val: number) => {
    // val is 0-100 (display scale matching OklchGamutSlider), pass directly to oklchToHsl
    const hsl = oklchToHsl(oklchValues.l, val, oklchValues.h);
    updateColor({ hue: Math.round(hsl.h), saturation: Math.round(hsl.s), lightness: Math.round(hsl.l) });
  }, [oklchValues.l, oklchValues.h, updateColor]);

  const handleOklchHChange = useCallback((val: number) => {
    const hsl = oklchToHsl(oklchValues.l, oklchValues.c / 0.4, val);
    updateColor({ hue: Math.round(hsl.h), saturation: Math.round(hsl.s), lightness: Math.round(hsl.l) });
  }, [oklchValues.l, oklchValues.c, updateColor]);



  // ─── Copy color value ──────────────────────────────────────────
  const handleCopyHex = useCallback(() => {
    copyTextToClipboard(displayColorValue);
    setCopiedHex(true);
    setTimeout(() => setCopiedHex(false), 1200);
  }, [displayColorValue]);

  // ─── Lightness mode compat → curveType ────────────────────────
  useEffect(() => {
    if (!node.paletteCurveType && node.paletteLightnessMode) {
      const mapped = node.paletteLightnessMode === 'curve' ? 'ease-in-out' : 'linear';
      onUpdateNode(node.id, { paletteCurveType: mapped });
    }
  }, []);

  // Handle curve type change
  const handleCurveChange = useCallback((value: string) => {
    const legacyMode = value === 'linear' ? 'linear' : 'curve';
    const updates: Partial<ColorNode> = {
      paletteCurveType: value as CurveType,
      paletteLightnessMode: legacyMode as any,
    };
    // Initialize custom curve points when switching to custom mode
    if (value === 'custom' && (!node.paletteCustomCurvePoints || node.paletteCustomCurvePoints.length !== (node.paletteShadeCount ?? 10))) {
      const count = node.paletteShadeCount ?? 10;
      updates.paletteCustomCurvePoints = Array.from({ length: count }, (_, i) => i / (count - 1));
    }
    onUpdateNode(node.id, updates);
  }, [node.id, node.paletteCustomCurvePoints, node.paletteShadeCount, onUpdateNode]);

  const selected = isSelected || isMultiSelected;

  const toggleSection = useCallback((key: string) => {
    if (isAllInputDisabled) return; // Don't allow toggling when inherited
    const current = node.paletteExpandedSections ?? DEFAULT_PALETTE_SECTIONS;
    onUpdateNode(node.id, {
      paletteExpandedSections: { ...current, [key]: !current[key] },
    });
  }, [node.id, node.paletteExpandedSections, onUpdateNode, isAllInputDisabled]);

  // ─── Render: Island Layout ────────────────────────────────────
  return (
    <div
      className="palette-card-root palette-node-card"
      data-node-card
      style={{ width: `${nodeWidth}px` }}
      onMouseDown={(e) => {
        // Always stop propagation to prevent canvas from starting selection/panning.
        // Dragging is initiated from the grip icon in the NodeReferenceLabel (name area).
        e.stopPropagation();
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(e); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Visibility toggle */}
      {onToggleVisibility && (
        <div
          className={`palette-card-visibility ${
            isNodeHidden
              ? 'palette-card-visibility--hidden'
              : isHovered
                ? 'palette-card-visibility--hovered'
                : 'palette-card-visibility--default'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility();
          }}
          title={isNodeHidden ? 'Show palette' : 'Hide palette'}
        >
          {isNodeHidden ? <EyeOff className="palette-card-visibility-icon" /> : <Eye className="palette-card-visibility-icon" />}
        </div>
      )}

      {/* Inheritance Toggle Bar for Non-Primary Themes — flow-based bar above the card */}
      {showInheritanceIcon && !isPrimaryTheme && (
        <div
          className="palette-card-inherit-bar"
          style={{ width: `${nodeWidth}px`, backgroundColor: 'var(--surface-2)', ...(barDimOpacity !== undefined ? { opacity: barDimOpacity } : {}) }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => { if (colorNeedsHover) setHoveredSection('color'); }}
          onMouseLeave={() => { if (hoveredSection === 'color') setHoveredSection(null); }}
        >
          <Crown
            className={`palette-card-inherit-crown ${
              isLinkedToPrimary()
                ? 'palette-card-inherit-crown--linked'
                : hasColorBeenModified
                  ? 'palette-card-inherit-crown--modified'
                  : 'palette-card-inherit-crown--dim'
            }`}
            fill={isLinkedToPrimary() ? 'currentColor' : hasColorBeenModified ? 'currentColor' : 'none'}
          />
          <Switch
            checked={isLinkedToPrimary()}
            onCheckedChange={() => handleToggleLinkToPrimary()}
            className="palette-card-inherit-switch"
          />
          <span className={`palette-card-inherit-label ${
            isLinkedToPrimary() ? 'palette-card-inherit-label--linked' : hasColorBeenModified ? 'palette-card-inherit-label--modified' : 'palette-card-inherit-label--dim'
          }`}>
            {isLinkedToPrimary()
              ? 'Node is inherited'
              : hasColorBeenModified
                ? 'Node is modified'
                : 'Node is not-inherited'}
          </span>
        </div>
      )}

      {/* Single continuous card */}
      <Island isSelected={isSelected} isMultiSelected={isMultiSelected} noPadding>
        {/* Header: Color Swatch */}
        <div
          className="palette-card-swatch"
          style={{
            backgroundColor: `hsl(${eHue}, ${eSat}%, ${eLit}%)`,
            borderRadius: '11px 11px 0 0',
          }}
        >
          {/* Inherited dim overlay on swatch — sits above content but below the crown */}
          {isAllInputDisabled && !showAllVisible && (
            <div className="palette-card-swatch-overlay" />
          )}
          <div className="palette-card-swatch-inner" style={isAllInputDisabled && !showAllVisible ? { opacity: 0.4 } : undefined}>
            <button
              className={`palette-card-copy-btn ${isLightBackground ? 'palette-card-copy-btn--light' : 'palette-card-copy-btn--dark'} ${isHovered || copiedHex ? 'palette-card-copy-btn--visible' : 'palette-card-copy-btn--hidden'}`}
              onClick={(e) => { e.stopPropagation(); handleCopyHex(); }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Copy hex"
            >
              {copiedHex ? (
                <Check className={`palette-card-copy-icon ${isLightBackground ? 'palette-card-copy-icon--light' : 'palette-card-copy-icon--dark'}`} />
              ) : (
                <Copy className={`palette-card-copy-icon ${isLightBackground ? 'palette-card-copy-icon--light-dim' : 'palette-card-copy-icon--dark-dim'}`} />
              )}
            </button>
            <span className="palette-card-swatch-value" style={{ color: isLightBackground ? 'color-mix(in srgb, var(--absolute-black) 75%, transparent)' : 'color-mix(in srgb, var(--absolute-white) 90%, transparent)' }}>
              {displayColorValue}
            </span>
          </div>
        </div>

        {/* ── All palette controls below the swatch — disabled entirely when inherited ── */}
        <div style={{ ...(isAllInputDisabled ? { pointerEvents: 'none' as const, opacity: showAllVisible ? 1 : 0.45 } : {}) }}>
        {/* ── NAME ── */}
        <div className="palette-card-section">
          <div
            className="palette-card-section-header"
            onClick={(e) => { e.stopPropagation(); toggleSection('name'); }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="palette-card-section-label">Name</span>
            <div className="palette-card-name-actions">
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateNode(node.id, { paletteNameLocked: !node.paletteNameLocked }); }}
                className="palette-card-lock-btn"
                title={node.paletteNameLocked ? 'Unlock name' : 'Lock name'}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {node.paletteNameLocked ? <Lock className="palette-card-lock-icon palette-card-lock-icon--locked" /> : <Unlock className="palette-card-lock-icon palette-card-lock-icon--unlocked" />}
              </button>
              <ChevronDown className={`palette-card-chevron ${expandedSections.name ? 'palette-card-chevron--open' : ''}`} />
            </div>
          </div>
          {expandedSections.name && (
            <div className="palette-card-section-body">
              <Input
                value={paletteName}
                onChange={(e) => { setIsManuallyEdited(true); onUpdateNode(node.id, { paletteName: e.target.value, paletteNameLocked: true }); }}
                className="palette-card-name-input"
                placeholder="Palette name"
                onMouseDown={(e) => e.stopPropagation()}
                maxLength={MAX_PALETTE_NAME}
              />
            </div>
          )}
        </div>

        {/* ── COLOR ── */}
        <div
          className="palette-card-section--color"
          style={{ opacity: colorDimOpacity }}
          onMouseEnter={() => colorNeedsHover && setHoveredSection('color')}
          onMouseLeave={() => colorNeedsHover && setHoveredSection(null)}
        >
          <button
            className="palette-card-section-header"
            onClick={(e) => { e.stopPropagation(); toggleSection('color'); }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="palette-card-color-header-left">
              <span className="palette-card-section-label">Color</span>
              {isColorChanged && <div className="palette-card-color-modified-dot" title="Modified from primary" />}
            </div>
            <div className="palette-card-color-header-right">
              <div className="palette-card-color-preview" style={{ backgroundColor: `hsl(${eHue}, ${eSat}%, ${eLit}%)` }} />
              <ChevronDown className={`palette-card-chevron ${expandedSections.color ? 'palette-card-chevron--open' : ''}`} />
            </div>
          </button>
          {expandedSections.color && (
            <div className="palette-card-section-body">
              {/* ── Per-property gradient sliders ── */}
              <div className="palette-card-color-sliders">
                {colorFormat === 'OKLCH' ? (
                  <OklchGamutSlider type="hue" value={Math.round(oklchValues.h)} lightness={Math.round(oklchValues.l)} chroma={Math.round(oklchValues.c / 0.4)} hue={Math.round(oklchValues.h)} onChange={handleOklchHChange} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled} />
                ) : (
                  <input
                    type="range" min="0" max="360" value={Math.round(eHue)}
                    onChange={(e) => handleHueChange(parseInt(e.target.value))}
                    onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()}
                    disabled={isColorInputDisabled}
                    className="palette-card-color-slider color-slider"
                    style={{
                      background: `linear-gradient(to right, hsl(0, ${eSat}%, ${eLit}%), hsl(60, ${eSat}%, ${eLit}%), hsl(120, ${eSat}%, ${eLit}%), hsl(180, ${eSat}%, ${eLit}%), hsl(240, ${eSat}%, ${eLit}%), hsl(300, ${eSat}%, ${eLit}%), hsl(360, ${eSat}%, ${eLit}%))`,
                      '--slider-thumb-color': `hsl(${eHue}, ${eSat}%, ${eLit}%)`,
                    } as React.CSSProperties}
                  />
                )}
                {/* Alpha (shared across all formats) */}
                <input
                    type="range" min="0" max="100" value={eAlpha ?? 100}
                    onChange={(e) => handleAlphaChange(parseInt(e.target.value))}
                    onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()}
                    disabled={isColorInputDisabled}
                    className="palette-card-color-slider color-slider"
                    style={{
                      backgroundImage: `linear-gradient(to right, hsla(${eHue}, ${eSat}%, ${eLit}%, 0), hsla(${eHue}, ${eSat}%, ${eLit}%, 1)), linear-gradient(45deg, var(--border-on-surface-2) 25%, transparent 25%, transparent 75%, var(--border-on-surface-2) 75%, var(--border-on-surface-2)), linear-gradient(45deg, var(--border-on-surface-2) 25%, transparent 25%, transparent 75%, var(--border-on-surface-2) 75%, var(--border-on-surface-2))`,
                      backgroundSize: '100% 100%, 8px 8px, 8px 8px',
                      backgroundPosition: '0 0, 0 0, 4px 4px',
                      backgroundColor: 'var(--on-surface-4)',
                      '--slider-thumb-color': `hsla(${eHue}, ${eSat}%, ${eLit}%, ${(eAlpha ?? 100) / 100})`,
                    } as React.CSSProperties}
                  />
              </div>

              {/* ── Format selector + value display ── */}
              <div className="palette-card-color-format-row">
                <Select value={colorFormat} onValueChange={(value) => onUpdateNode(node.id, { paletteColorFormat: value as any })}>
                  <SelectTrigger className="palette-card-select-trigger--format" onMouseDown={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
                  <SelectContent className="palette-card-select-content">
                    <SelectItem value="HEX" className="palette-card-select-item">HEX</SelectItem>
                    <SelectItem value="HSLA" className="palette-card-select-item">HSLA</SelectItem>
                    <SelectItem value="OKLCH" className="palette-card-select-item">OKLCH</SelectItem>
                    <SelectItem value="RGBA" className="palette-card-select-item">RGBA</SelectItem>
                  </SelectContent>
                </Select>
                <div className="palette-card-color-value-display">
                  {colorFormat === 'HEX' && hexColor}
                  {colorFormat === 'HSLA' && `hsla(${Math.round(eHue)}, ${Math.round(eSat)}%, ${Math.round(eLit)}%, ${(eAlpha ?? 100) / 100})`}
                  {colorFormat === 'OKLCH' && `oklch(${(oklchValues.l / 100).toFixed(2)} ${(oklchValues.c / 100).toFixed(3)} ${Math.round(oklchValues.h)})`}
                  {colorFormat === 'RGBA' && `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(eAlpha ?? 100) / 100})`}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── DISTRIBUTION ── */}
        <div className="palette-card-section">
          <button className="palette-card-section-header" onClick={(e) => { e.stopPropagation(); toggleSection('distribution'); }} onMouseDown={(e) => e.stopPropagation()}>
            <span className="palette-card-section-label">Distribution</span>
            <ChevronDown className={`palette-card-chevron ${expandedSections.distribution ? 'palette-card-chevron--open' : ''}`} />
          </button>
          {expandedSections.distribution && (
            <div className="palette-card-section-body">
              <Select value={curveType} onValueChange={handleCurveChange}>
                <SelectTrigger className="palette-card-select-trigger" onMouseDown={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
                <SelectContent className="palette-card-select-content">
                  <SelectItem value="linear" className="palette-card-select-item">Linear</SelectItem>
                  <SelectItem value="ease-in" className="palette-card-select-item">Ease In</SelectItem>
                  <SelectItem value="ease-out" className="palette-card-select-item">Ease Out</SelectItem>
                  <SelectItem value="ease-in-out" className="palette-card-select-item">Ease In-Out</SelectItem>
                  <SelectItem value="sine" className="palette-card-select-item">Sine</SelectItem>
                  <SelectItem value="exponential" className="palette-card-select-item">Exponential</SelectItem>
                  <SelectItem value="material" className="palette-card-select-item">Material</SelectItem>
                  <SelectItem value="custom" className="palette-card-select-item">Custom</SelectItem>
                </SelectContent>
              </Select>
              <div className="palette-card-curve-box">
                <CurveVisualizer curveType={curveType} lightnessStart={lightnessStart} lightnessEnd={lightnessEnd} shadeCount={shadeCount} hue={eHue} saturation={eSat} customPoints={node.paletteCustomCurvePoints} onPointsDrag={(points) => onUpdateNode(node.id, { paletteCurveType: 'custom', paletteLightnessMode: 'curve' as any, paletteCustomCurvePoints: points })} />
              </div>
            </div>
          )}
        </div>

        {/* ── LIGHTNESS SCALE ── */}
        <div className="palette-card-section">
          <button className="palette-card-section-header" onClick={(e) => { e.stopPropagation(); toggleSection('lightnessScale'); }} onMouseDown={(e) => e.stopPropagation()}>
            <span className="palette-card-section-label">Lightness Scale</span>
            <ChevronDown className={`palette-card-chevron ${expandedSections.lightnessScale ? 'palette-card-chevron--open' : ''}`} />
          </button>
          {expandedSections.lightnessScale && (
            <div className="palette-card-section-body">
              <div className="palette-card-slider-wrapper">
                <DualRangeSlider
                  min={0}
                  max={100}
                  valueStart={lightnessStart}
                  valueEnd={lightnessEnd}
                  onStartChange={(v) => onUpdateNode(node.id, { paletteLightnessStart: v })}
                  onEndChange={(v) => onUpdateNode(node.id, { paletteLightnessEnd: v })}
                  fillStyle={`linear-gradient(to right, hsl(${eHue}, ${eSat}%, ${Math.min(lightnessStart, lightnessEnd)}%), hsl(${eHue}, ${eSat}%, ${Math.max(lightnessStart, lightnessEnd)}%))`}
                  markers={shadeColors.map((shade) => ({ position: shade.lightness, color: shade.hex }))}
                />
                <div className="palette-card-slider-labels">
                  <span className="palette-card-slider-label">L:{lightnessStart}%</span>
                  <span className="palette-card-slider-label">L:{lightnessEnd}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── SATURATION ── */}
        <div className="palette-card-section">
          <button className="palette-card-section-header" onClick={(e) => { e.stopPropagation(); toggleSection('saturation'); }} onMouseDown={(e) => e.stopPropagation()}>
            <span className="palette-card-section-label">Saturation</span>
            <ChevronDown className={`palette-card-chevron ${expandedSections.saturation ? 'palette-card-chevron--open' : ''}`} />
          </button>
          {expandedSections.saturation && (
            <div className="palette-card-section-body">
              <Select value={satMode} onValueChange={(value) => onUpdateNode(node.id, { paletteSaturationMode: value as any })}>
                <SelectTrigger className="palette-card-select-trigger" onMouseDown={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
                <SelectContent className="palette-card-select-content">
                  <SelectItem value="constant" className="palette-card-select-item">Constant</SelectItem>
                  <SelectItem value="auto" className="palette-card-select-item">Auto (perceptual)</SelectItem>
                  <SelectItem value="manual" className="palette-card-select-item">Manual range</SelectItem>
                </SelectContent>
              </Select>
              {satMode === 'manual' && (
                <div className="palette-card-slider-wrapper">
                  <DualRangeSlider
                    min={0}
                    max={100}
                    valueStart={satStart}
                    valueEnd={satEnd}
                    onStartChange={(v) => onUpdateNode(node.id, { paletteSaturationStart: v })}
                    onEndChange={(v) => onUpdateNode(node.id, { paletteSaturationEnd: v })}
                    fillStyle={`linear-gradient(to right, hsl(${eHue}, ${Math.min(satStart, satEnd)}%, ${eLit}%), hsl(${eHue}, ${Math.max(satStart, satEnd)}%, ${eLit}%))`}
                  />
                  <div className="palette-card-slider-labels">
                    <span className="palette-card-slider-label">S:{satStart}%</span>
                    <span className="palette-card-slider-label">S:{satEnd}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── HUE SHIFT ── */}
        <div className="palette-card-section">
          <button className="palette-card-section-header" onClick={(e) => { e.stopPropagation(); toggleSection('hueShift'); }} onMouseDown={(e) => e.stopPropagation()}>
            <span className="palette-card-section-label">Hue Shift</span>
            <div className="palette-card-hue-header-right">
              <span className="palette-card-hue-value">{hueShift > 0 ? '+' : ''}{hueShift}°</span>
              <ChevronDown className={`palette-card-chevron ${expandedSections.hueShift ? 'palette-card-chevron--open' : ''}`} />
            </div>
          </button>
          {expandedSections.hueShift && (
            <div className="palette-card-section-body">
              <input type="range" min="-30" max="30" value={hueShift} onChange={(e) => onUpdateNode(node.id, { paletteHueShift: parseInt(e.target.value) })} className="palette-card-range-slider palette-range-slider" onMouseDown={(e) => e.stopPropagation()} />
            </div>
          )}
        </div>

        {/* ── PATTERN + SHADES ── (hidden for non-primary themes) */}
        {isPrimaryTheme && (
        <div className="palette-card-section">
          <button className="palette-card-section-header" onClick={(e) => { e.stopPropagation(); toggleSection('pattern'); }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="palette-card-pattern-header-left">
              <span className="palette-card-section-label">Pattern</span>
              <span className="palette-card-section-label">Shades</span>
            </div>
            <div className="palette-card-pattern-header-right">
              <span className="palette-card-pattern-value">{shadeCount}</span>
              <ChevronDown className={`palette-card-chevron ${expandedSections.pattern ? 'palette-card-chevron--open' : ''}`} />
            </div>
          </button>
          {expandedSections.pattern && (
            <div className="palette-card-section-body">
              <div className="palette-card-pattern-grid">
                <div>
                  <Select value={namingPattern} onValueChange={(value) => onUpdateNode(node.id, { paletteNamingPattern: value as any })}>
                    <SelectTrigger className="palette-card-select-trigger palette-card-select-trigger--no-mb" onMouseDown={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
                    <SelectContent className="palette-card-select-content">
                      <SelectItem value="1-9" className="palette-card-select-item">1-9</SelectItem>
                      <SelectItem value="10-90" className="palette-card-select-item">10-90</SelectItem>
                      <SelectItem value="100-900" className="palette-card-select-item">100-900</SelectItem>
                      <SelectItem value="a-z" className="palette-card-select-item">a-z</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <input type="range" min="2" max="20" value={shadeCount} onChange={(e) => onUpdateNode(node.id, { paletteShadeCount: parseInt(e.target.value) })} className="palette-card-range-slider palette-range-slider" onMouseDown={(e) => e.stopPropagation()} />
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* ── PREVIEW ── */}
        <div className="palette-card-section">
          <button className="palette-card-section-header" onClick={(e) => { e.stopPropagation(); toggleSection('preview'); }} onMouseDown={(e) => e.stopPropagation()}>
            <span className="palette-card-section-label">Preview</span>
            <ChevronDown className={`palette-card-chevron ${expandedSections.preview ? 'palette-card-chevron--open' : ''}`} />
          </button>
          {expandedSections.preview && (
            <div className="palette-card-section-body">
              <ShadePreviewStrip shadeColors={shadeColors} shadeCount={shadeCount} primaryShadeHexes={primaryShadeHexes} />
            </div>
          )}
        </div>
        </div>{/* End inherited-disabled wrapper */}
      </Island>

      {/* ─── Left Connection Button (parent) — always interactive for wire connections ─── */}
      <div
        className="palette-card-connect-left"
        style={{ pointerEvents: 'auto' }}
        onMouseEnter={() => {
          if (isDraggingWire && wireStartButtonType === 'right' && !isStructurallyLocked) {
            onWireHoverStart(node.id);
          }
        }}
        onMouseLeave={() => onWireHoverEnd()}
      >
        <button
          className={`palette-card-connect-btn ${
            isStructurallyLocked
              ? 'palette-card-connect-btn--locked'
              : isWireHovered && wireStartButtonType === 'right'
                ? 'palette-card-connect-btn--hovered'
                : 'palette-card-connect-btn--default'
          }`}
          onMouseDown={(e) => {
            e.stopPropagation();
            // Block wire drag start if this palette is inherited on non-primary theme
            if (isStructurallyLocked) return;
            onWireDragStart(node.id, 'left');
          }}
          data-node-id={node.id}
          data-button-type="left-connect"
          title={isStructurallyLocked ? "Inherited from primary — unlink from primary to modify" : "Connect to parent"}
        >
          <Plus className={`palette-card-connect-icon ${isStructurallyLocked ? 'palette-card-connect-icon--locked' : isWireHovered && wireStartButtonType === 'right' ? 'palette-card-connect-icon--hovered' : 'palette-card-connect-icon--default'}`} />
        </button>
      </div>

      {/* ─── Right Connection Button (add shade / child) — always interactive for wire connections ─── */}
      <div
        className="palette-card-connect-right"
        style={{ pointerEvents: 'auto' }}
        onMouseEnter={() => {
          if (isDraggingWire && wireStartButtonType === 'left' && !isStructurallyLocked) {
            onWireHoverStart(node.id);
          }
        }}
        onMouseLeave={() => onWireHoverEnd()}
      >
        <button
          className={`palette-card-connect-btn ${
            isStructurallyLocked
              ? 'palette-card-connect-btn--locked'
              : isWireHovered && wireStartButtonType === 'left'
                ? 'palette-card-connect-btn--hovered'
                : 'palette-card-connect-btn--default'
          }`}
          onMouseDown={(e) => {
            e.stopPropagation();
            // Block wire drag start if this palette is inherited on non-primary theme
            if (isStructurallyLocked) return;
            onWireDragStart(node.id, 'right');
          }}
          onClick={(e) => {
            e.stopPropagation();
            // Increment shade count — blocked when inherited
            if (!isAllInputDisabled) {
              onUpdateNode(node.id, { paletteShadeCount: Math.min(20, shadeCount + 1) });
            }
          }}
          data-node-id={node.id}
          data-button-type="right-connect"
          title={isStructurallyLocked ? "Inherited from primary — unlink from primary to modify" : "Add shade"}
        >
          <Plus className={`palette-card-connect-icon ${isStructurallyLocked ? 'palette-card-connect-icon--locked' : isWireHovered && wireStartButtonType === 'left' ? 'palette-card-connect-icon--hovered' : 'palette-card-connect-icon--default'}`} />
        </button>
      </div>

      {/* ─── Delete button — hidden when inherited ─── */}
      {!isAllInputDisabled && (
        <div className="palette-card-delete-wrapper"
          style={{ opacity: isSelected ? undefined : 0 }}
        >
          <button
            className="palette-card-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteNode(node.id);
            }}
            title="Delete palette"
          >
            <Trash2 className="palette-card-delete-icon" />
          </button>
        </div>
      )}
    </div>
  );
}
