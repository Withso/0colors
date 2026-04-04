import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { DesignToken, ColorNode, TokenGroup, Page, Theme, NodeAdvancedLogic } from '../../types';
import { X, ChevronDown, ChevronRight, GripHorizontal, Check, Crown, Undo2, Tag, Link2, EyeOff, ArrowUpDown, ArrowUp, ArrowDown, Zap } from 'lucide-react';
import './TokenTablePopup.css';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { hslToOklch, hslToRgb, oklchToHsl, rgbToHsl } from '../../utils/color-conversions';
import { Checkbox } from '../ui/checkbox';
import { Tip } from '../Tip';
import { MAX_TOKEN_NAME, MAX_GROUP_NAME, MAX_PAGE_NAME, MAX_THEME_NAME } from '../../utils/textLimits';
import { isTokenHiddenInTheme } from '../../utils/visibility';
import { evaluateAllTokenAssignments, TokenAssignExportResult } from '../../utils/advanced-logic-engine';
import { tokenColorToNativeCSS } from '../../utils/tokenFormatters';
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ProjectComputedTokens } from '../../utils/computed-tokens';

interface TokenTablePopupProps {
  tokens: DesignToken[];
  allNodes: ColorNode[];
  groups: TokenGroup[];
  pages: Page[];
  themes: Theme[];
  activeProjectId: string;
  activePageId: string;
  activeThemeId?: string;
  canvasPan?: { x: number; y: number };
  canvasZoom?: number;
  hexOverrideSpaces?: Set<string>;
  onHexOverrideSpacesChange?: (spaces: Set<string>) => void;
  onClose: () => void;
  onNavigateToNode?: (nodeId: string, pageId: string, themeId: string) => void;
  onRestoreView?: (pageId: string, themeId: string) => void;
  advancedLogic?: NodeAdvancedLogic[];
  computedTokens?: ProjectComputedTokens;
}

// Helper: HSL to hex
function hslToHex(h: number, s: number, l: number, a: number = 100): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lNorm - sNorm * Math.min(lNorm, 1 - lNorm) * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, color)));
  };
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const hex = `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  if (a < 100) {
    return `${hex}${toHex(Math.round((a / 100) * 255))}`;
  }
  return hex;
}

// Checkerboard for transparent colors
const checkerboardBg = `linear-gradient(45deg, var(--grey-800) 25%, transparent 25%), linear-gradient(-45deg, var(--grey-800) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--grey-800) 75%), linear-gradient(-45deg, transparent 75%, var(--grey-800) 75%)`;

// ─── Rich tooltip body for token table cells ───
interface CellTooltipData {
  /** Token name */
  name: string;
  /** Whether this is a token node group token */
  isTokenNode: boolean;
  /** Color swatch (hsla string) — for regular tokens */
  color?: string;
  /** Color space label (HSL, OKLCH, RGB) */
  spaceName?: string;
  /** Formatted color space value */
  spaceValue?: string;
  /** Hex value */
  hex?: string;
  /** Alpha (0-100) */
  alpha?: number;
  /** Value token reference — for token node group tokens */
  valueRef?: {
    name: string;
    color?: string;
    isChainRef: boolean;
    spaceName?: string;
    spaceValue?: string;
    hex?: string;
    alpha?: number;
  } | null;
  /** Computed expression result — for token nodes with advanced logic */
  computed?: {
    expressionText: string;
    cssColor: string;
    nativeValue: string;
    spaceName: string;
  } | null;
}

function CellTooltipBody({ data }: { data: CellTooltipData }) {
  // ── Token node group token tooltip ──
  if (data.isTokenNode) {
    // Deduplicate: if spaceValue is same as hex (hex-override active), skip space row
    const vtShowSpace = data.valueRef?.spaceName && data.valueRef?.spaceValue
      && data.valueRef.spaceValue.toUpperCase() !== data.valueRef.hex?.toUpperCase();
    return (
      <div className="token-table-tooltip-tn">
        {/* Header: Tag icon + own token name */}
        <div className="token-table-tooltip-header">
          <Tag className="token-table-tooltip-header-icon" />
          <span className="token-table-tooltip-header-name">{data.name}</span>
        </div>
        {/* CSS variable line */}
        <div className="token-table-tooltip-divider" />
        <div className="token-table-tooltip-var-section">
          <div className="token-table-tooltip-var-row">
            <span className="token-table-tooltip-var-label">VAR</span>
            <span className="token-table-tooltip-var-value">--{data.name.toLowerCase().replace(/\s+/g, '-')}</span>
          </div>
        </div>
        {/* Computed expression result — shown when advanced logic is active */}
        {data.computed ? (
          <>
            <div className="token-table-tooltip-divider" />
            <div className="token-table-tooltip-computed-section">
              <div className="token-table-tooltip-computed-label-row">
                <span className="token-table-tooltip-computed-label">Computed</span>
              </div>
              <div className="token-table-tooltip-computed-color-row">
                <div className="token-table-tooltip-computed-swatch" style={{ backgroundColor: data.computed.cssColor }} />
                <span className="token-table-tooltip-computed-native">{data.computed.nativeValue}</span>
              </div>
              <div className="token-table-tooltip-computed-expr" title={data.computed.expressionText}>
                {data.computed.expressionText}
              </div>
            </div>
          </>
        ) : null}
        {/* Value token reference */}
        {data.valueRef ? (
          <>
            <div className="token-table-tooltip-divider" />
            <div className="token-table-tooltip-value-section">
              <div className="token-table-tooltip-value-label-row">
                <span className="token-table-tooltip-value-label">Value</span>
                <Link2 className="token-table-tooltip-value-link-icon" />
              </div>
              <div className="token-table-tooltip-value-row">
                {data.valueRef.isChainRef ? (
                  <Tag className="token-table-tooltip-value-tag-icon" />
                ) : data.valueRef.color ? (
                  <div className="token-table-tooltip-value-swatch" style={{ backgroundColor: data.valueRef.color }} />
                ) : (
                  <div className="token-table-tooltip-value-swatch-empty" />
                )}
                <span className="token-table-tooltip-value-name">{data.valueRef.name}</span>
              </div>
            </div>
            {/* Value token's color info */}
            {!!(vtShowSpace || data.valueRef.hex) && (
              <>
                <div className="token-table-tooltip-divider" />
                <div className="token-table-tooltip-colorinfo-section">
                  {vtShowSpace && (
                    <div className="token-table-tooltip-colorinfo-row">
                      <span className="token-table-tooltip-var-label">{data.valueRef.spaceName}</span>
                      <span className="token-table-tooltip-var-value">{data.valueRef.spaceValue}</span>
                    </div>
                  )}
                  {data.valueRef.hex && (
                    <div className="token-table-tooltip-colorinfo-row">
                      <span className="token-table-tooltip-var-label">HEX</span>
                      <span className="token-table-tooltip-var-value">{data.valueRef.hex}</span>
                    </div>
                  )}
                  {data.valueRef.alpha !== undefined && data.valueRef.alpha < 100 && (
                    <div className="token-table-tooltip-colorinfo-row">
                      <span className="token-table-tooltip-var-label">ALPHA</span>
                      <span className="token-table-tooltip-var-value">{Math.round(data.valueRef.alpha)}%</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="token-table-tooltip-divider" />
            <div className="token-table-tooltip-no-value">
              <span className="token-table-tooltip-no-value-text">No value assigned</span>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Regular token tooltip ──
  // Deduplicate: if spaceValue is same as hex (hex-override active), skip space row
  const showSpace = data.spaceName && data.spaceValue
    && data.spaceValue.toUpperCase() !== data.hex?.toUpperCase();
  const hasColorInfo = !!(showSpace || data.hex);
  return (
    <div className="token-table-tooltip-regular">
      <div className="token-table-tooltip-header">
        {data.color ? (
          <div className="token-table-tooltip-header-swatch" style={{ backgroundColor: data.color }} />
        ) : (
          <div className="token-table-tooltip-header-swatch-empty" />
        )}
        <span className="token-table-tooltip-header-name">{data.name}</span>
      </div>
      {hasColorInfo && (
        <>
          <div className="token-table-tooltip-divider" />
          <div className="token-table-tooltip-colorinfo-section">
            {showSpace && (
              <div className="token-table-tooltip-colorinfo-row">
                <span className="token-table-tooltip-var-label">{data.spaceName}</span>
                <span className="token-table-tooltip-var-value">{data.spaceValue}</span>
              </div>
            )}
            {data.hex && (
              <div className="token-table-tooltip-colorinfo-row">
                <span className="token-table-tooltip-var-label">HEX</span>
                <span className="token-table-tooltip-var-value">{data.hex}</span>
              </div>
            )}
            {data.alpha !== undefined && data.alpha < 100 && (
              <div className="token-table-tooltip-colorinfo-row">
                <span className="token-table-tooltip-var-label">ALPHA</span>
                <span className="token-table-tooltip-var-value">{Math.round(data.alpha)}%</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function TokenTablePopup({
  tokens,
  allNodes,
  groups,
  pages,
  themes,
  activeProjectId,
  activePageId,
  activeThemeId,
  canvasPan,
  canvasZoom,
  hexOverrideSpaces = new Set(),
  onHexOverrideSpacesChange,
  onClose,
  onNavigateToNode,
  onRestoreView,
  advancedLogic,
  computedTokens: projectComputedTokens,
}: TokenTablePopupProps) {
  const [selectedPageId, setSelectedPageId] = useState(activePageId);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [tableViewFilter, setTableViewFilter] = useState<'tokens' | 'palettes'>(() => {
    const saved = localStorage.getItem('tokenTableViewFilter');
    return saved === 'palettes' ? 'palettes' : 'tokens';
  });

  // ───── Sorting ─────
  type SortField = 'name' | 'none';
  type SortDir = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortField('none'); setSortDir('asc'); }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }, [sortField, sortDir]);

  // ───── Logic filter ─────
  type LogicFilter = 'all' | 'with-logic' | 'no-logic';
  const [logicFilter, setLogicFilter] = useState<LogicFilter>('all');

  // ───── "Show as Hex" toggle ─────
  const toggleHexOverride = useCallback((space: string) => {
    if (!onHexOverrideSpacesChange) return;
    const next = new Set(hexOverrideSpaces);
    if (next.has(space)) {
      next.delete(space);
    } else {
      next.add(space);
    }
    onHexOverrideSpacesChange(next);
  }, [hexOverrideSpaces, onHexOverrideSpacesChange]);

  // ───── Flash feedback for navigated cell ─────
  const [flashCellKey, setFlashCellKey] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ───── Row highlight from Command Palette (⌘K) navigation ─────
  const [highlightRowTokenId, setHighlightRowTokenId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const tokenId = (e as CustomEvent).detail?.tokenId;
      if (!tokenId) return;

      // Find which group this token belongs to and expand it
      const targetToken = tokens.find(t => t.id === tokenId);
      if (targetToken?.groupId) {
        setExpandedGroups(prev => {
          if (prev.has(targetToken.groupId!)) return prev;
          const next = new Set(prev);
          next.add(targetToken.groupId!);
          return next;
        });
      } else {
        // Ungrouped — expand the "Others" section
        setExpandedGroups(prev => {
          if (prev.has('__others__')) return prev;
          const next = new Set(prev);
          next.add('__others__');
          return next;
        });
      }

      // Switch to the correct page if the token is on a different page
      if (targetToken?.pageId && targetToken.pageId !== selectedPageId) {
        setSelectedPageId(targetToken.pageId);
      }

      // Set highlight and scroll after DOM update
      setHighlightRowTokenId(tokenId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightRowTokenId(null), 2500);

      // Scroll to the row after a delay for DOM to settle (group expansion + page switch)
      const needsPageSwitch = targetToken?.pageId && targetToken.pageId !== selectedPageId;
      const scrollDelay = needsPageSwitch ? 200 : 80;
      requestAnimationFrame(() => {
        setTimeout(() => {
          const row = tableScrollRef.current?.querySelector(`[data-table-token-id="${tokenId}"]`);
          if (row) {
            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }, scrollDelay);
      });
    };
    window.addEventListener('highlightToken', handler);
    return () => {
      window.removeEventListener('highlightToken', handler);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, [tokens, selectedPageId]);

  // ───── Navigation history for back button ─────
  interface ViewSnapshot { pageId: string; themeId: string; pan: { x: number; y: number }; zoom: number }
  const [viewHistory, setViewHistory] = useState<ViewSnapshot[]>([]);

  // Sync selected page when parent changes
  useEffect(() => {
    setSelectedPageId(activePageId);
  }, [activePageId]);

  // Popup position & size — restored from localStorage when available
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('tokenTableLayout');
      if (saved) { const p = JSON.parse(saved); if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y }; }
    } catch {}
    return { x: 0, y: 0 };
  });
  const [size, setSize] = useState(() => {
    try {
      const saved = localStorage.getItem('tokenTableLayout');
      if (saved) { const p = JSON.parse(saved); if (typeof p.width === 'number' && typeof p.height === 'number') return { width: p.width, height: p.height }; }
    } catch {}
    return { width: 820, height: 560 };
  });
  const [initialized, setInitialized] = useState(() => {
    try {
      const saved = localStorage.getItem('tokenTableLayout');
      if (saved) { const p = JSON.parse(saved); return typeof p.x === 'number' && typeof p.y === 'number'; }
    } catch {}
    return false;
  });

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeEdge, setResizeEdge] = useState('');
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

  const popupRef = useRef<HTMLDivElement>(null);

  // Active/inactive state — popup stays open but dims when user interacts elsewhere
  const [isActive, setIsActive] = useState(true);

  // Detect clicks outside popup to deactivate, clicks inside to activate
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Defer state update so the target element's handlers run uninterrupted
      requestAnimationFrame(() => {
        if (popupRef.current && popupRef.current.contains(e.target as Node)) {
          setIsActive(true);
        } else {
          setIsActive(false);
        }
      });
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Center on mount
  useEffect(() => {
    if (!initialized) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setPosition({
        x: Math.max(16, (w - size.width) / 2),
        y: Math.max(16, (h - size.height) / 2),
      });
      setInitialized(true);
    }
  }, [initialized, size.width, size.height]);

  // Initialize all groups as expanded
  useEffect(() => {
    const pg = groups.filter(
      g => g.projectId === activeProjectId && g.pageId === selectedPageId
    );
    setExpandedGroups(new Set([...pg.map(g => g.id), '__others__']));
  }, [selectedPageId, groups, activeProjectId]);

  // Escape key to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // ───── Drag ─────
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('[data-dropdown]')) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragStart.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragStart.current.y)),
      });
    };
    const up = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [isDragging]);

  // Persist position & size to localStorage after drag ends
  const prevIsDragging = useRef(isDragging);
  useEffect(() => {
    if (prevIsDragging.current && !isDragging) {
      localStorage.setItem('tokenTableLayout', JSON.stringify({ x: position.x, y: position.y, width: size.width, height: size.height }));
    }
    prevIsDragging.current = isDragging;
  }, [isDragging, position, size]);

  // ───── Resize ─────
  const handleResizeStart = useCallback((e: React.MouseEvent, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeEdge(edge);
    resizeStart.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height, posX: position.x, posY: position.y };
  }, [size, position]);

  useEffect(() => {
    if (!isResizing) return;
    const move = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      let w = resizeStart.current.width, h = resizeStart.current.height;
      let px = resizeStart.current.posX, py = resizeStart.current.posY;
      if (resizeEdge.includes('e')) w = Math.max(420, resizeStart.current.width + dx);
      if (resizeEdge.includes('w')) { w = Math.max(420, resizeStart.current.width - dx); px = resizeStart.current.posX + (resizeStart.current.width - w); }
      if (resizeEdge.includes('s')) h = Math.max(260, resizeStart.current.height + dy);
      if (resizeEdge.includes('n')) { h = Math.max(260, resizeStart.current.height - dy); py = resizeStart.current.posY + (resizeStart.current.height - h); }
      setSize({ width: w, height: h });
      setPosition({ x: px, y: py });
    };
    const up = () => { setIsResizing(false); setResizeEdge(''); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [isResizing, resizeEdge]);

  // Persist position & size to localStorage after resize ends
  const prevIsResizing = useRef(isResizing);
  useEffect(() => {
    if (prevIsResizing.current && !isResizing) {
      localStorage.setItem('tokenTableLayout', JSON.stringify({ x: position.x, y: position.y, width: size.width, height: size.height }));
    }
    prevIsResizing.current = isResizing;
  }, [isResizing, position, size]);

  // ───── Data ─────
  const projectThemes = useMemo(
    () => themes.filter(t => t.projectId === activeProjectId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [themes, activeProjectId]
  );

  const primaryThemeId = useMemo(
    () => projectThemes.find(t => t.isPrimary)?.id || '',
    [projectThemes]
  );

  // Pre-evaluate advanced logic per theme (cached for tooltip lookups)
  const computedTokensByTheme = useMemo(() => {
    if (!advancedLogic || advancedLogic.length === 0) return new Map<string, Map<string, TokenAssignExportResult>>();
    const result = new Map<string, Map<string, TokenAssignExportResult>>();
    for (const theme of projectThemes) {
      const computed = evaluateAllTokenAssignments(advancedLogic, tokens, allNodes, theme.id, primaryThemeId);
      if (computed.size > 0) result.set(theme.id, computed);
    }
    return result;
  }, [advancedLogic, projectThemes, tokens, allNodes, primaryThemeId]);

  const projectPages = useMemo(
    () => pages.filter(p => p.projectId === activeProjectId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [pages, activeProjectId]
  );

  const pageNodes = useMemo(
    () => allNodes.filter(n => n.projectId === activeProjectId && n.pageId === selectedPageId),
    [allNodes, activeProjectId, selectedPageId]
  );

  const pageTokens = useMemo(
    () => tokens.filter(t => t.projectId === activeProjectId && t.pageId === selectedPageId),
    [tokens, activeProjectId, selectedPageId]
  );

  const filteredGroups = useMemo(
    () => groups.filter(g => g.projectId === activeProjectId && g.pageId === selectedPageId),
    [groups, activeProjectId, selectedPageId]
  );

  // Reverse lookup: tokenId-themeId → node
  // Handles inheritance: if a token is assigned to a node on the primary theme but
  // not explicitly on a non-primary theme, it inherits from primary.
  const tokenNodeMap = useMemo(() => {
    const map = new Map<string, ColorNode>();
    const primaryTheme = projectThemes.find(t => t.isPrimary);

    // First pass: map all explicit tokenAssignments
    for (const node of pageNodes) {
      if (node.tokenAssignments) {
        for (const [themeId, tIds] of Object.entries(node.tokenAssignments)) {
          for (const tId of tIds) map.set(`${tId}-${themeId}`, node);
        }
      }
    }

    // Second pass: legacy tokenIds fallback for all themes
    for (const node of pageNodes) {
      if (node.tokenIds) {
        for (const tId of node.tokenIds) {
          for (const th of projectThemes) {
            const k = `${tId}-${th.id}`;
            if (!map.has(k)) map.set(k, node);
          }
        }
      }
    }

    // Third pass: inherit primary theme assignments to non-primary themes
    // If a token is mapped to a node on the primary theme but has no mapping
    // for a non-primary theme, inherit the primary mapping.
    if (primaryTheme) {
      for (const node of pageNodes) {
        const primaryTokens = node.tokenAssignments?.[primaryTheme.id];
        if (primaryTokens && primaryTokens.length > 0) {
          for (const tId of primaryTokens) {
            for (const th of projectThemes) {
              if (th.isPrimary) continue;
              const k = `${tId}-${th.id}`;
              if (!map.has(k)) map.set(k, node);
            }
          }
        }
      }
    }

    return map;
  }, [pageNodes, projectThemes]);

  // ───── Token node ownership lookups ─────
  // Maps tokenId → owning token node (non-prefix) for quick lookup
  const tokenNodeOwnerMap = useMemo(() => {
    const map = new Map<string, ColorNode>();
    for (const node of pageNodes) {
      if (node.isTokenNode && !node.isTokenPrefix && node.ownTokenId) {
        map.set(node.ownTokenId, node);
      }
    }
    return map;
  }, [pageNodes]);

  // Set of all token IDs owned by token nodes
  const tokenNodeOwnedTokenIds = useMemo(
    () => new Set(tokenNodeOwnerMap.keys()),
    [tokenNodeOwnerMap]
  );

  // Set of token node group IDs
  const tokenNodeGroupIds = useMemo(
    () => new Set(filteredGroups.filter(g => g.isTokenNodeGroup).map(g => g.id)),
    [filteredGroups]
  );

  // Helper: get effective HSL color for a node in a specific theme.
  // Mirrors App.tsx's getNodeEffectiveHSL: converts from the node's native color space
  // (oklch, rgb, etc.) to HSL, rather than returning potentially stale stored HSL values.
  const getNodeEffectiveColor = useCallback(
    (node: ColorNode, themeId: string) => {
      const override = node.themeOverrides?.[themeId];
      const alpha = override?.alpha !== undefined ? override.alpha : node.alpha;

      // For child nodes (palette shades), HSL is the ground truth — skip native conversion
      if (node.parentId) {
        if (override) {
          return { hue: override.hue, saturation: override.saturation, lightness: override.lightness, alpha };
        }
        return { hue: node.hue, saturation: node.saturation, lightness: node.lightness, alpha };
      }

      if (node.colorSpace === 'oklch') {
        const l = override?.oklchL !== undefined ? override.oklchL : node.oklchL ?? 0;
        const c = override?.oklchC !== undefined ? override.oklchC : node.oklchC ?? 0;
        const h = override?.oklchH !== undefined ? override.oklchH : node.oklchH ?? 0;
        const hsl = oklchToHsl(l, c, h);
        return { hue: hsl.h, saturation: hsl.s, lightness: hsl.l, alpha };
      }

      if (node.colorSpace === 'rgb') {
        const r = override?.red !== undefined ? override.red : node.red ?? 0;
        const g = override?.green !== undefined ? override.green : node.green ?? 0;
        const b = override?.blue !== undefined ? override.blue : node.blue ?? 0;
        const hsl = rgbToHsl(r, g, b);
        return { hue: hsl.h, saturation: hsl.s, lightness: hsl.l, alpha };
      }

      // HSL, hex, hct, and any other — use stored HSL values directly
      if (override) {
        return { hue: override.hue, saturation: override.saturation, lightness: override.lightness, alpha };
      }
      return { hue: node.hue, saturation: node.saturation, lightness: node.lightness, alpha };
    },
    []
  );

  // Reference name: palette/shade
  const getTokenReference = useCallback(
    (token: DesignToken, themeId: string): string | null => {
      const node = tokenNodeMap.get(`${token.id}-${themeId}`);
      if (!node) return null;
      if (node.parentId) {
        const parent = pageNodes.find(n => n.id === node.parentId && n.isPalette);
        if (parent) {
          const siblings = pageNodes
            .filter(n => n.parentId === parent.id)
            .sort((a, b) => a.position.y - b.position.y);
          const idx = siblings.findIndex(s => s.id === node.id);
          const pattern = parent.paletteNamingPattern || '1-9';
          let shade = '';
          switch (pattern) {
            case '1-9': shade = (idx + 1).toString(); break;
            case '10-90': shade = ((idx + 1) * 10).toString(); break;
            case '100-900': shade = ((idx + 1) * 100).toString(); break;
            case 'a-z': shade = String.fromCharCode(97 + idx); break;
            default: shade = (idx + 1).toString();
          }
          return `${parent.paletteName || 'palette'}/${shade}`;
        }
      }
      return null;
    },
    [tokenNodeMap, pageNodes]
  );

  // Token color for a theme — computed from LIVE node data.
  // Priority: explicit themeValues → node effective color (with themeOverrides) → legacy base → none
  // This ensures non-primary themes always reflect the current node state (inheritance)
  // rather than relying on stale cached themeValues.
  const getTokenColor = useCallback(
    (token: DesignToken, themeId: string) => {
      // 1. Check if the token is actually assigned to a node for this theme.
      //    Without a node assignment, themeValues are just default placeholders
      //    and should not be treated as real values.
      const node = tokenNodeMap.get(`${token.id}-${themeId}`);

      if (node) {
        // 2. Node exists — compute from live node data (handles inheritance correctly)
        //    This is the authoritative source, preferred over potentially stale themeValues.
        const nodeColor = getNodeEffectiveColor(node, themeId);
        return { hue: nodeColor.hue, saturation: nodeColor.saturation, lightness: nodeColor.lightness, alpha: nodeColor.alpha, hasValue: true };
      }

      // 3. No node assignment — check legacy base values fallback for primary theme only.
      //    This covers old tokens that predate the tokenAssignments architecture.
      const isPrimary = projectThemes.find(t => t.id === themeId)?.isPrimary;
      if (isPrimary && (token.hue !== undefined || token.saturation !== undefined || token.lightness !== undefined)) {
        // Only treat legacy values as real if the token doesn't have themeValues
        // (tokens with themeValues but no node are newly-created empty tokens)
        if (!token.themeValues || Object.keys(token.themeValues).length === 0) {
          return { hue: token.hue ?? 0, saturation: token.saturation ?? 0, lightness: token.lightness ?? 0, alpha: token.alpha ?? 100, hasValue: true };
        }
      }

      return { hue: 0, saturation: 0, lightness: 0, alpha: 100, hasValue: false };
    },
    [projectThemes, tokenNodeMap, getNodeEffectiveColor]
  );

  // Cross-page-aware wrapper: resolves token color even when the value token's
  // node is on another page (not in page-scoped tokenNodeMap).
  const getTokenColorCrossPage = useCallback(
    (token: DesignToken, themeId: string) => {
      const color = getTokenColor(token, themeId);
      if (color.hasValue) return color;
      // Cross-page fallback: search allNodes for the assigned node
      const crossPageNode = allNodes.find(n => {
        const ta = n.tokenAssignments?.[themeId] || [];
        if (ta.includes(token.id)) return true;
        if (primaryThemeId && primaryThemeId !== themeId) {
          const primaryTa = n.tokenAssignments?.[primaryThemeId] || [];
          if (primaryTa.includes(token.id)) return true;
        }
        const la = n.tokenIds || [];
        return la.includes(token.id);
      });
      if (crossPageNode) {
        const nodeColor = getNodeEffectiveColor(crossPageNode, themeId);
        return { hue: nodeColor.hue, saturation: nodeColor.saturation, lightness: nodeColor.lightness, alpha: nodeColor.alpha, hasValue: true };
      }
      // Fall back to themeValues
      if (token.themeValues?.[themeId]) {
        const tv = token.themeValues[themeId];
        return { hue: tv.hue ?? 0, saturation: tv.saturation ?? 0, lightness: tv.lightness ?? 0, alpha: tv.alpha ?? 100, hasValue: true };
      }
      // Legacy base value fallback
      if (token.hue !== undefined) {
        return { hue: token.hue ?? 0, saturation: token.saturation ?? 0, lightness: token.lightness ?? 0, alpha: token.alpha ?? 100, hasValue: true };
      }
      return color;
    },
    [getTokenColor, allNodes, primaryThemeId, getNodeEffectiveColor]
  );

  // Get non-color token value for a theme.
  // For non-primary themes with no explicit themeValues, falls back to primary theme values
  // (since non-color node properties like spacingValue aren't theme-specific).
  // Only returns a value when the token is actually assigned to a node — default
  // themeValues from token creation are not meaningful.
  const getNonColorValue = useCallback(
    (token: DesignToken, themeId: string): string | null => {
      // Guard: non-color tokens are only meaningful when assigned to a node.
      // Without node assignment, themeValues hold creation-time defaults.
      const hasNode = tokenNodeMap.has(`${token.id}-${themeId}`);
      if (!hasNode) {
        // Check if ANY theme has a node for this token (for legacy fallback)
        const anyAssigned = projectThemes.some(t => tokenNodeMap.has(`${token.id}-${t.id}`));
        if (!anyAssigned) return null;
      }

      const tv = token.themeValues?.[themeId];
      const isPrimary = projectThemes.find(t => t.id === themeId)?.isPrimary;
      const primaryTheme = projectThemes.find(t => t.isPrimary);

      // For non-primary themes, check if the node has a themeOverride.
      // If no override, the value should match primary (inherited).
      let vals: any = tv;
      if (!vals && isPrimary) {
        vals = token; // Legacy base values for primary
      }
      if (!vals && !isPrimary && primaryTheme) {
        // Fall back to primary theme values (non-color node properties are shared across themes)
        vals = token.themeValues?.[primaryTheme.id] || token;
      }
      if (!vals) return null;

      if (token.type === 'spacing' || token.type === 'radius' || token.type === 'fontSize') {
        const v = (vals as any).value;
        const u = (vals as any).unit || 'px';
        if (v !== undefined && v !== null) return `${v}${u}`;
      }
      if (token.type === 'fontWeight') {
        const fw = (vals as any).fontWeight;
        if (fw !== undefined) return `${fw}`;
      }
      if (token.type === 'lineHeight') {
        const lh = (vals as any).lineHeight;
        if (lh !== undefined) return `${lh}`;
      }
      if (token.type === 'opacity') {
        const op = (vals as any).opacity;
        if (op !== undefined) return `${op}%`;
      }
      if (token.type === 'shadow') {
        const sv = (vals as any).shadowValue;
        if (sv) return sv;
      }
      return null;
    },
    [projectThemes, tokenNodeMap]
  );

  // ───── Filter out tokens that are empty/hidden across ALL themes ─────
  // A token is "active" if it has a node assignment AND is visible in at least one theme.
  // Uses computed tokens as the source of truth when available, falls back to legacy logic.
  const activeTokenIds = useMemo(() => {
    // Fast path: use pre-computed token snapshots when available
    if (projectComputedTokens?.themes && projectComputedTokens.themes.length > 0) {
      const set = new Set<string>();
      for (const themeSnapshot of projectComputedTokens.themes) {
        for (const ct of themeSnapshot.tokens) {
          set.add(ct.id);
        }
      }
      // Intersect with page tokens (computed tokens are project-wide, but table shows one page)
      const pageTokenIds = new Set(pageTokens.map(t => t.id));
      const filtered = new Set<string>();
      for (const id of set) {
        if (pageTokenIds.has(id)) filtered.add(id);
      }
      return filtered;
    }

    // Fallback: legacy computation
    const set = new Set<string>();
    for (const token of pageTokens) {
      if (token.groupId && tokenNodeGroupIds.has(token.groupId)) {
        const ownerNode = tokenNodeOwnerMap.get(token.id);
        if (ownerNode) {
          let hasVisibleValueInAnyTheme = false;
          for (const theme of projectThemes) {
            if (isTokenHiddenInTheme(token, allNodes, theme.id, primaryThemeId)) continue;
            const themeComputed = computedTokensByTheme.get(theme.id);
            if (themeComputed?.has(token.id)) {
              hasVisibleValueInAnyTheme = true;
              break;
            }
            const themeVal = ownerNode.valueTokenAssignments?.[theme.id];
            if (themeVal !== undefined && themeVal !== '' && themeVal !== null) {
              hasVisibleValueInAnyTheme = true;
              break;
            }
            if (ownerNode.valueTokenId) {
              hasVisibleValueInAnyTheme = true;
              break;
            }
          }
          if (hasVisibleValueInAnyTheme) {
            set.add(token.id);
          }
        }
        continue;
      }
      
      let hasVisibleAssignment = false;
      for (const theme of projectThemes) {
        if (!tokenNodeMap.has(`${token.id}-${theme.id}`)) continue;
        if (isTokenHiddenInTheme(token, allNodes, theme.id, primaryThemeId)) continue;
        hasVisibleAssignment = true;
        break;
      }
      if (hasVisibleAssignment) {
        set.add(token.id);
      }
    }
    return set;
  }, [pageTokens, projectThemes, tokenNodeMap, allNodes, primaryThemeId, tokenNodeGroupIds, tokenNodeOwnerMap, computedTokensByTheme, projectComputedTokens]);

  // Separate groups
  const regularGroups = useMemo(
    () => filteredGroups.filter(g => !g.isColorPaletteGroup && !g.isPaletteEntry),
    [filteredGroups]
  );
  const paletteEntries = useMemo(
    () => filteredGroups.filter(g => g.isPaletteEntry === true),
    [filteredGroups]
  );

  // ───── Set of all token IDs that have active advanced logic in any theme ─────
  const tokensWithLogicIds = useMemo(() => {
    const set = new Set<string>();
    for (const [, themeMap] of computedTokensByTheme) {
      for (const tokenId of themeMap.keys()) {
        set.add(tokenId);
      }
    }
    return set;
  }, [computedTokensByTheme]);

  const getTokensForGroup = useCallback(
    (groupId: string | null) => {
      const raw = groupId === null
        ? pageTokens.filter(t => t.groupId === null)
        : pageTokens.filter(t => t.groupId === groupId);
      let result = raw.filter(t => activeTokenIds.has(t.id));

      // Apply logic filter
      if (logicFilter === 'with-logic') {
        result = result.filter(t => tokensWithLogicIds.has(t.id));
      } else if (logicFilter === 'no-logic') {
        result = result.filter(t => !tokensWithLogicIds.has(t.id));
      }

      // Apply sorting
      if (sortField === 'name') {
        result = [...result].sort((a, b) => {
          const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }

      return result;
    },
    [pageTokens, activeTokenIds, logicFilter, tokensWithLogicIds, sortField, sortDir]
  );

  const ungroupedTokens = useMemo(() => getTokensForGroup(null), [getTokensForGroup]);

  const allGroups = useMemo(
    () => [...regularGroups, ...paletteEntries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [regularGroups, paletteEntries]
  );

  // Persist tableViewFilter to localStorage
  useEffect(() => {
    localStorage.setItem('tokenTableViewFilter', tableViewFilter);
  }, [tableViewFilter]);

  // Filtered groups & ungrouped tokens based on the active view tab
  const displayGroups = useMemo(
    () => tableViewFilter === 'palettes'
      ? allGroups.filter(g => g.isPaletteEntry === true)
      : allGroups.filter(g => !g.isPaletteEntry),
    [allGroups, tableViewFilter]
  );
  const displayUngrouped = tableViewFilter === 'tokens' ? ungroupedTokens : [];

  // Whether any group or ungrouped section has visible tokens after filtering
  const hasVisibleTokens = useMemo(() => {
    if (displayUngrouped.length > 0) return true;
    return displayGroups.some(g => getTokensForGroup(g.id).length > 0);
  }, [displayUngrouped, displayGroups, getTokensForGroup]);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalCols = 1 + projectThemes.length;

  // ───── Token modification state for crown icon ─────
  // Compares the EFFECTIVE value for a given theme against the primary theme.
  // Uses live node data (base HSL + themeOverrides) rather than potentially stale
  // token.themeValues to ensure accurate inherited/modified detection.
  //   'primary'   — this IS the primary theme (yellow crown)
  //   'inherited' — effective value matches primary (yellow crown)
  //   'modified'  — effective value differs from primary (blue crown)
  const getTokenModificationState = useCallback(
    (token: DesignToken, themeId: string): 'primary' | 'inherited' | 'modified' => {
      const theme = projectThemes.find(t => t.id === themeId);
      const primaryTheme = projectThemes.find(t => t.isPrimary);
      if (!theme || !primaryTheme || theme.isPrimary) return 'primary';

      // ── Token node group tokens: check owning node's valueTokenAssignments ──
      const isTokenNodeToken = token.groupId ? tokenNodeGroupIds.has(token.groupId) : false;
      if (isTokenNodeToken) {
        const ownerNode = tokenNodeOwnerMap.get(token.id);
        if (!ownerNode) return 'inherited';
        const hasThemeOverride = ownerNode.valueTokenAssignments?.[themeId] !== undefined;
        if (!hasThemeOverride) return 'inherited';
        const primaryVal = ownerNode.valueTokenAssignments?.[primaryTheme.id] ?? ownerNode.valueTokenId;
        const currentVal = ownerNode.valueTokenAssignments[themeId];
        return primaryVal !== currentVal ? 'modified' : 'inherited';
      }

      // ── Color tokens: compare effective node-derived colors ──
      if (!token.type || token.type === 'color') {
        const primaryNode = tokenNodeMap.get(`${token.id}-${primaryTheme.id}`);
        const themeNode = tokenNodeMap.get(`${token.id}-${themeId}`);

        // No node for either → both unresolvable → inherited
        if (!primaryNode && !themeNode) return 'inherited';
        // Only one side has a node → different → modified
        if (!primaryNode || !themeNode) return 'modified';

        // Compute effective colors from live node data
        const primaryColor = getNodeEffectiveColor(primaryNode, primaryTheme.id);
        const themeColor = getNodeEffectiveColor(themeNode, themeId);

        const hueMatch = Math.round(primaryColor.hue) === Math.round(themeColor.hue);
        const satMatch = Math.round(primaryColor.saturation) === Math.round(themeColor.saturation);
        const lightMatch = Math.round(primaryColor.lightness) === Math.round(themeColor.lightness);
        const alphaMatch = (primaryColor.alpha ?? 100) === (themeColor.alpha ?? 100);

        return (hueMatch && satMatch && lightMatch && alphaMatch) ? 'inherited' : 'modified';
      }

      // ── Non-color tokens: compare themeValues with primary fallback ──
      const primaryValue = token.themeValues?.[primaryTheme.id];
      const currentValue = token.themeValues?.[themeId];

      // If non-primary has no explicit value, it inherits from primary
      if (!currentValue) return 'inherited';
      // Primary has no value but non-primary does → modified
      if (!primaryValue) return 'modified';

      if (token.type === 'spacing' || token.type === 'radius' || token.type === 'fontSize') {
        if ((primaryValue as any).value === (currentValue as any).value &&
            (primaryValue as any).unit === (currentValue as any).unit) return 'inherited';
        return 'modified';
      }
      if (token.type === 'fontWeight') {
        if ((primaryValue as any).fontWeight === (currentValue as any).fontWeight) return 'inherited';
        return 'modified';
      }
      if (token.type === 'lineHeight') {
        if ((primaryValue as any).lineHeight === (currentValue as any).lineHeight) return 'inherited';
        return 'modified';
      }
      if (token.type === 'opacity') {
        if ((primaryValue as any).opacity === (currentValue as any).opacity) return 'inherited';
        return 'modified';
      }
      if (token.type === 'shadow') {
        if ((primaryValue as any).shadowValue === (currentValue as any).shadowValue) return 'inherited';
        return 'modified';
      }

      return 'inherited';
    },
    [projectThemes, tokenNodeMap, getNodeEffectiveColor, tokenNodeGroupIds, tokenNodeOwnerMap]
  );

  const renderCrownIcon = (token: DesignToken, themeId: string) => {
    // For token node group tokens, check the owning node (not tokenNodeMap)
    const isTokenNodeToken = token.groupId ? tokenNodeGroupIds.has(token.groupId) : false;
    if (isTokenNodeToken) {
      const ownerNode = tokenNodeOwnerMap.get(token.id);
      if (!ownerNode) return null;
      const state = getTokenModificationState(token, themeId);
      if (state === 'primary') return null;
      if (state === 'inherited') {
        return <Crown className="token-table-cell-crown token-table-cell-crown-inherited" />;
      }
      return <Crown className="token-table-cell-crown token-table-cell-crown-modified" />;
    }
    const node = tokenNodeMap.get(`${token.id}-${themeId}`);
    if (!node) return null;
    const state = getTokenModificationState(token, themeId);
    // No crown icon in primary theme cells
    if (state === 'primary') return null;
    if (state === 'inherited') {
      // Inherited from primary: yellow crown
      return <Crown className="token-table-cell-crown token-table-cell-crown-inherited" />;
    }
    // Modified: accent crown
    return <Crown className="token-table-cell-crown token-table-cell-crown-modified" />;
  };

  // ───── Cell click → navigate to node ─────
  const handleCellClick = useCallback((token: DesignToken, themeId: string) => {
    if (!onNavigateToNode) return;

    // Resolve the target node: regular tokens use tokenNodeMap, token node group
    // tokens navigate to their owning token node (found via tokenNodeOwnerMap).
    let node = tokenNodeMap.get(`${token.id}-${themeId}`);
    if (!node && token.groupId && tokenNodeGroupIds.has(token.groupId)) {
      node = tokenNodeOwnerMap.get(token.id);
    }
    if (!node) return;
    const pageId = node.pageId || token.pageId || selectedPageId;

    // ───── Save current view to navigation history before navigating ─────
    if (activePageId && activeThemeId && canvasPan && canvasZoom != null) {
      setViewHistory(prev => [...prev, {
        pageId: activePageId,
        themeId: activeThemeId,
        pan: { ...canvasPan },
        zoom: canvasZoom,
      }]);
    }

    // ───── Flash feedback ─────
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashCellKey(`${token.id}-${themeId}`);
    flashTimerRef.current = setTimeout(() => setFlashCellKey(null), 600);

    // Navigate
    onNavigateToNode(node.id, pageId, themeId);
  }, [onNavigateToNode, tokenNodeMap, tokenNodeGroupIds, tokenNodeOwnerMap, selectedPageId, activePageId, activeThemeId, canvasPan, canvasZoom]);

  // ───── Back to previous view ─────
  const handleGoBack = useCallback(() => {
    if (viewHistory.length === 0) return;
    const prev = viewHistory[viewHistory.length - 1];
    setViewHistory(h => h.slice(0, -1));

    // Switch page & theme
    if (onRestoreView) {
      onRestoreView(prev.pageId, prev.themeId);
    }

    // Restore canvas pan/zoom (with delay if page might be switching)
    const needsPageSwitch = prev.pageId !== activePageId;
    const dispatchRestore = () => {
      const event = new CustomEvent('restoreCanvasView', { detail: { pan: prev.pan, zoom: prev.zoom } });
      window.dispatchEvent(event);
    };
    if (needsPageSwitch) {
      setTimeout(dispatchRestore, 180);
    } else {
      requestAnimationFrame(dispatchRestore);
    }
  }, [viewHistory, activePageId, onRestoreView]);

  // Keyboard handler for accessible cell navigation
  const handleCellKeyDown = useCallback((e: React.KeyboardEvent, token: DesignToken, themeId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCellClick(token, themeId);
    }
  }, [handleCellClick]);

  // ───── Cell renderers ─────

  // Helper: derive the effective color space for a node, accounting for
  // palette shade → parent paletteColorFormat inheritance.
  const getNodeColorSpace = useCallback(
    (node: ColorNode): string => {
      if (node.parentId) {
        const parent = pageNodes.find(n => n.id === node.parentId && n.isPalette);
        if (parent?.paletteColorFormat) {
          const fmtMap: Record<string, string> = { 'HEX': 'hex', 'HSLA': 'hsl', 'OKLCH': 'oklch', 'RGBA': 'rgb' };
          return fmtMap[parent.paletteColorFormat] || node.colorSpace;
        }
      }
      return node.colorSpace;
    },
    [pageNodes]
  );

  // Helper: format a color value in the node's native color space.
  // Uses stored native values (oklchL/C/H, red/green/blue, etc.) when available,
  // falling back to HSL → conversion when they're not.
  const formatNativeColorValue = useCallback(
    (node: ColorNode, themeId: string, hslColor: { hue: number; saturation: number; lightness: number; alpha: number }): string => {
      const cs = getNodeColorSpace(node);
      const { hue: h, saturation: s, lightness: l, alpha: a } = hslColor;

      // If this color space is in the hex-override set, force hex output
      if (hexOverrideSpaces.has(cs)) {
        return hslToHex(h, s, l, a).toUpperCase();
      }

      if (cs === 'hsl') {
        if (a < 100) {
          return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${+(a / 100).toFixed(2)})`;
        }
        return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
      }

      if (cs === 'oklch') {
        // Prefer stored native OKLCH values on the node / themeOverride
        const override = node.themeOverrides?.[themeId];
        const oL = override?.oklchL ?? node.oklchL;
        const oC = override?.oklchC ?? node.oklchC;
        const oH = override?.oklchH ?? node.oklchH;
        if (oL != null && oC != null && oH != null) {
          // Node stores oklchL: 0-100, oklchC: 0-100 (display-scaled), oklchH: 0-360
          // CSS oklch() uses L: 0-1, C: 0-0.4 (raw chroma), H: degrees
          // oklchC display-scale 0-100 maps to raw chroma 0-0.4: raw = oklchC / 100 * 0.4
          const L = (oL / 100).toFixed(2);
          const C = (oC / 100 * 0.4).toFixed(3);
          const H = Math.round(oH);
          if (a < 100) return `oklch(${L} ${C} ${H} / ${+(a / 100).toFixed(2)})`;
          return `oklch(${L} ${C} ${H})`;
        }
        // Fallback: convert from HSL
        const oklch = hslToOklch(h, s, l);
        const L = (oklch.l / 100).toFixed(2);
        const C = (oklch.c / 100).toFixed(3);
        const H = Math.round(oklch.h);
        if (a < 100) return `oklch(${L} ${C} ${H} / ${+(a / 100).toFixed(2)})`;
        return `oklch(${L} ${C} ${H})`;
      }

      if (cs === 'rgb') {
        // Prefer stored native RGB values
        const override = node.themeOverrides?.[themeId];
        const r = override?.red ?? node.red;
        const g = override?.green ?? node.green;
        const b = override?.blue ?? node.blue;
        if (r != null && g != null && b != null) {
          if (a < 100) return `rgba(${r}, ${g}, ${b}, ${+(a / 100).toFixed(2)})`;
          return `rgb(${r}, ${g}, ${b})`;
        }
        // Fallback: convert from HSL
        const rgb = hslToRgb(h, s, l);
        if (a < 100) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${+(a / 100).toFixed(2)})`;
        return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      }

      // hct, hex, or unknown — always hex
      return hslToHex(h, s, l, a).toUpperCase();
    },
    [getNodeColorSpace, pageNodes, hexOverrideSpaces]
  );

  const renderColorCell = (token: DesignToken, themeId: string) => {
    // ─── Token node group tokens: show value token info instead of color ───
    const isTokenNodeToken = token.groupId ? tokenNodeGroupIds.has(token.groupId) : false;
    if (isTokenNodeToken) {
      const ownerNode = tokenNodeOwnerMap.get(token.id);
      if (!ownerNode) {
        return (
          <div className="token-table-cell-flex">
            <span className="token-table-cell-placeholder">--</span>
          </div>
        );
      }
      // Check if this token node token is hidden in this theme (owner node hidden)
      if (isTokenHiddenInTheme(token, allNodes, themeId, primaryThemeId)) {
        return (
          <div className="token-table-cell-flex">
            <EyeOff className="token-table-cell-hidden-icon" />
            <span className="token-table-cell-hidden-text">Hidden</span>
          </div>
        );
      }
      // Crown icon + dimming for token node group tokens
      const tnModState = getTokenModificationState(token, themeId);
      const tnCrown = (() => {
        if (tnModState === 'primary') return null;
        if (tnModState === 'inherited') return <Crown className="token-table-cell-crown token-table-cell-crown-inherited" />;
        return <Crown className="token-table-cell-crown token-table-cell-crown-modified" />;
      })();
      const tnDimClass = tnModState === 'inherited' ? 'token-table-cell-dimmed' : '';
      // Check for computed result from advanced logic — show computed color when available
      const themeComputedMap = computedTokensByTheme.get(themeId);
      const computedResult = themeComputedMap?.get(token.id);
      if (computedResult) {
        if (computedResult.result.type === 'computedColor') {
          const c = computedResult.result.color;
          const cssColor = `hsla(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%, ${(c.a / 100).toFixed(2)})`;
          const cs = ownerNode.colorSpace || 'hsl';
          const nativeValue = tokenColorToNativeCSS(c, cs);
          return (
            <div className={`token-table-cell-flex-sm ${tnDimClass}`}>
              <div
                className="token-table-cell-tn-swatch token-table-cell-tn-swatch-computed"
                style={{ backgroundColor: cssColor }}
              />
              <span className="token-table-cell-tn-text-subtle" title={computedResult.expressionText}>
                {nativeValue}
              </span>
              {tnCrown}
            </div>
          );
        } else if (computedResult.result.type === 'tokenRef') {
          // Logic evaluated to a token reference
          const refToken = tokens.find(t => t.id === computedResult.result.tokenId);
          if (refToken) {
            const isRefOwnedByTokenNode = tokenNodeOwnedTokenIds.has(refToken.id);
            // Resolve the referenced token's color
            const refColor = getTokenColorCrossPage(refToken, themeId);
            if (isRefOwnedByTokenNode) {
              return (
                <div className={`token-table-cell-flex-sm ${tnDimClass}`}>
                  <Tag className="token-table-cell-tn-tag-icon token-table-cell-tn-tag-warning" />
                  <span className="token-table-cell-tn-text-subtle" title={computedResult.expressionText}>
                    {refToken.name}
                  </span>
                  {tnCrown}
                </div>
              );
            } else if (refColor.hasValue) {
              const vtHsl = `hsla(${Math.round(refColor.hue)}, ${Math.round(refColor.saturation)}%, ${Math.round(refColor.lightness)}%, ${refColor.alpha / 100})`;
              return (
                <div className={`token-table-cell-flex-sm ${tnDimClass}`}>
                  <div
                    className="token-table-cell-tn-swatch token-table-cell-tn-swatch-computed"
                    style={{ backgroundColor: vtHsl }}
                  />
                  <span className="token-table-cell-tn-text-subtle" title={computedResult.expressionText}>
                    {refToken.name}
                  </span>
                  {tnCrown}
                </div>
              );
            }
          }
        }
      }

      // Resolve theme-aware valueTokenId
      const resolvedValueTokenId = (() => {
        if (themeId && ownerNode.valueTokenAssignments?.[themeId] !== undefined) {
          return ownerNode.valueTokenAssignments[themeId] || undefined;
        }
        if (primaryThemeId && ownerNode.valueTokenAssignments?.[primaryThemeId] !== undefined) {
          return ownerNode.valueTokenAssignments[primaryThemeId] || undefined;
        }
        return ownerNode.valueTokenId;
      })();
      if (!resolvedValueTokenId) {
        return (
          <div className={`token-table-cell-flex ${tnDimClass}`}>
            <span className="token-table-cell-placeholder">--</span>
            {tnCrown}
          </div>
        );
      }
      // Find the value token
      const valueToken = tokens.find(t => t.id === resolvedValueTokenId);
      if (!valueToken) {
        return (
          <div className={`token-table-cell-flex ${tnDimClass}`}>
            <span className="token-table-cell-placeholder">--</span>
            {tnCrown}
          </div>
        );
      }
      // Determine if value token is owned by another token node (→ Tag) or a regular color token (→ color swatch)
      const isValueOwnedByTokenNode = tokenNodeOwnedTokenIds.has(valueToken.id);
      if (isValueOwnedByTokenNode) {
        // Value is another token node's token → Tag icon + name
        return (
          <div className={`token-table-cell-flex-sm ${tnDimClass}`}>
            <Tag className="token-table-cell-tn-tag-icon token-table-cell-tn-tag-dim" />
            <span className="token-table-cell-tn-text-faint">{valueToken.name}</span>
            {tnCrown}
          </div>
        );
      }
      // Value is a regular color token → color swatch + name
      const vtColor = getTokenColorCrossPage(valueToken, themeId);
      if (vtColor.hasValue) {
        const vtHsl = `hsla(${Math.round(vtColor.hue)}, ${Math.round(vtColor.saturation)}%, ${Math.round(vtColor.lightness)}%, ${vtColor.alpha / 100})`;
        return (
          <div className={`token-table-cell-flex-sm ${tnDimClass}`}>
            <div
              className="token-table-cell-tn-swatch token-table-cell-tn-swatch-regular"
              style={{ backgroundColor: vtHsl }}
            />
            <span className="token-table-cell-tn-text-faint">{valueToken.name}</span>
            {tnCrown}
          </div>
        );
      }
      // Value token has no color data
      return (
        <div className={`token-table-cell-flex-sm ${tnDimClass}`}>
          <span className="token-table-cell-tn-text-faint">{valueToken.name}</span>
          {tnCrown}
        </div>
      );
    }

    // ─── Per-theme visibility: show hidden indicator if token is hidden in THIS theme ───
    // The token row is still shown (it's visible in at least one theme),
    // but this specific theme cell shows a hidden indicator because the token/node is hidden here.
    if (isTokenHiddenInTheme(token, allNodes, themeId, primaryThemeId)) {
      return (
        <div className="token-table-cell-flex">
          <EyeOff className="token-table-cell-hidden-icon" />
          <span className="token-table-cell-hidden-text">Hidden</span>
        </div>
      );
    }

    const crownIcon = renderCrownIcon(token, themeId);
    const theme = projectThemes.find(t => t.id === themeId);

    // Determine if this cell should be dimmed:
    // Non-primary themes with inherited (unmodified) tokens are dimmed.
    const isDimmed = theme && !theme.isPrimary && getTokenModificationState(token, themeId) === 'inherited';
    const dimClass = isDimmed ? 'token-table-cell-dimmed' : '';

    // Non-color tokens
    if (token.type && token.type !== 'color') {
      const val = getNonColorValue(token, themeId);
      if (!val) {
        return (
          <div className={`token-table-cell-flex ${dimClass}`}>
            <span className="token-table-cell-placeholder">--</span>
            {crownIcon}
          </div>
        );
      }
      return (
        <div className={`token-table-cell-flex ${dimClass}`}>
          <span className="token-table-cell-value-text">{val}</span>
          {crownIcon}
        </div>
      );
    }

    // Color tokens
    const color = getTokenColor(token, themeId);
    if (!color.hasValue) {
      return (
        <div className={`token-table-cell-flex ${dimClass}`}>
          <span className="token-table-cell-placeholder">--</span>
          {crownIcon}
        </div>
      );
    }

    const hsl = `hsla(${Math.round(color.hue)}, ${Math.round(color.saturation)}%, ${Math.round(color.lightness)}%, ${color.alpha / 100})`;
    const isTransparent = color.alpha < 100;

    // Format value in the node's native color space (HSL, OKLCH, RGB, hex, etc.)
    const node = tokenNodeMap.get(`${token.id}-${themeId}`);
    const displayValue = node
      ? formatNativeColorValue(node, themeId, color)
      : hslToHex(color.hue, color.saturation, color.lightness, color.alpha).toUpperCase();

    return (
      <div className={`token-table-cell-flex ${dimClass}`}>
        <div
          className="token-table-cell-swatch"
          style={
            isTransparent
              ? {
                  background: checkerboardBg,
                  backgroundSize: '6px 6px',
                  backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
                  position: 'relative' as const,
                }
              : { backgroundColor: hsl }
          }
        >
          {isTransparent && (
            <div
              className="token-table-cell-swatch-transparent-overlay"
              style={{ backgroundColor: hsl }}
            />
          )}
        </div>
        <span className="token-table-cell-color-text">
          {displayValue}
        </span>
        {crownIcon}
      </div>
    );
  };

  // ───── Compute rich tooltip data for a cell ─────
  const getCellTooltipData = (token: DesignToken, themeId: string): CellTooltipData | null => {
    const isTokenNodeToken = token.groupId ? tokenNodeGroupIds.has(token.groupId) : false;

    // ── Token node group token ──
    if (isTokenNodeToken) {
      const ownerNode = tokenNodeOwnerMap.get(token.id);
      if (!ownerNode) return null;

      // Hidden in this theme → no tooltip
      if (isTokenHiddenInTheme(token, allNodes, themeId, primaryThemeId)) return null;

      // Check for computed result from advanced logic
      let computedInfo: CellTooltipData['computed'] = null;
      const themeComputed = computedTokensByTheme.get(themeId);
      if (themeComputed) {
        const computed = themeComputed.get(token.id);
        if (computed) {
          if (computed.result.type === 'computedColor') {
            const c = computed.result.color;
            const cs = ownerNode.colorSpace || 'hsl';
            const cssColor = `hsla(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%, ${(c.a / 100).toFixed(2)})`;
            const nativeValue = tokenColorToNativeCSS(c, cs);
            const spaceName = cs === 'hsl' ? 'HSL' : cs === 'oklch' ? 'OKLCH' : cs === 'rgb' ? 'RGB' : cs.toUpperCase();
            computedInfo = { expressionText: computed.expressionText, cssColor, nativeValue, spaceName };
          } else if (computed.result.type === 'tokenRef') {
            // Resolve the referenced token's color for the tooltip
            const refToken = tokens.find(t => t.id === computed.result.tokenId);
            if (refToken) {
              const refColor = getTokenColorCrossPage(refToken, themeId);
              const cssColor = refColor.hasValue
                ? `hsla(${Math.round(refColor.hue)}, ${Math.round(refColor.saturation)}%, ${Math.round(refColor.lightness)}%, ${refColor.alpha / 100})`
                : 'transparent';
              computedInfo = {
                expressionText: computed.expressionText,
                cssColor,
                nativeValue: refToken.name,
                spaceName: 'REF',
              };
            }
          }
        }
      }

      // Resolve theme-aware valueTokenId
      const resolvedValueTokenId = (() => {
        if (themeId && ownerNode.valueTokenAssignments?.[themeId] !== undefined)
          return ownerNode.valueTokenAssignments[themeId] || undefined;
        if (primaryThemeId && ownerNode.valueTokenAssignments?.[primaryThemeId] !== undefined)
          return ownerNode.valueTokenAssignments[primaryThemeId] || undefined;
        return ownerNode.valueTokenId;
      })();

      if (!resolvedValueTokenId) {
        return { name: token.name, isTokenNode: true, valueRef: null, computed: computedInfo };
      }

      const valueToken = tokens.find(t => t.id === resolvedValueTokenId);
      if (!valueToken) {
        return { name: token.name, isTokenNode: true, valueRef: null, computed: computedInfo };
      }

      const isChainRef = tokenNodeOwnedTokenIds.has(valueToken.id);

      // For chain refs (value token is itself a token-node-owned token),
      // getTokenColorCrossPage handles cross-page resolution automatically.
      // Resolve through the chain to find the final regular token's color.
      let resolvedColor = getTokenColorCrossPage(valueToken, themeId);
      let resolvedColorNode: ColorNode | undefined = tokenNodeMap.get(`${valueToken.id}-${themeId}`);
      // Cross-page fallback for resolvedColorNode (used for color space info)
      if (!resolvedColorNode) {
        resolvedColorNode = allNodes.find(n => {
          const ta = n.tokenAssignments?.[themeId] || [];
          if (ta.includes(valueToken.id)) return true;
          if (primaryThemeId && primaryThemeId !== themeId) {
            const primaryTa = n.tokenAssignments?.[primaryThemeId] || [];
            if (primaryTa.includes(valueToken.id)) return true;
          }
          const la = n.tokenIds || [];
          return la.includes(valueToken.id);
        });
      }
      if (!resolvedColor.hasValue && isChainRef) {
        // Follow the chain: find the token node that owns this value token,
        // then resolve its value token recursively
        let chainToken = valueToken;
        const visited = new Set<string>();
        while (chainToken && !resolvedColor.hasValue && !visited.has(chainToken.id)) {
          visited.add(chainToken.id);
          const chainOwner = tokenNodeOwnerMap.get(chainToken.id);
          if (!chainOwner) break;
          const chainValueTokenId = (() => {
            if (themeId && chainOwner.valueTokenAssignments?.[themeId] !== undefined)
              return chainOwner.valueTokenAssignments[themeId] || undefined;
            if (primaryThemeId && chainOwner.valueTokenAssignments?.[primaryThemeId] !== undefined)
              return chainOwner.valueTokenAssignments[primaryThemeId] || undefined;
            return chainOwner.valueTokenId;
          })();
          if (!chainValueTokenId) break;
          const nextToken = tokens.find(t => t.id === chainValueTokenId);
          if (!nextToken) break;
          resolvedColor = getTokenColorCrossPage(nextToken, themeId);
          resolvedColorNode = tokenNodeMap.get(`${nextToken.id}-${themeId}`);
          // Cross-page fallback for chain node
          if (!resolvedColorNode) {
            resolvedColorNode = allNodes.find(n => {
              const ta = n.tokenAssignments?.[themeId] || [];
              if (ta.includes(nextToken.id)) return true;
              if (primaryThemeId && primaryThemeId !== themeId) {
                const primaryTa = n.tokenAssignments?.[primaryThemeId] || [];
                if (primaryTa.includes(nextToken.id)) return true;
              }
              const la = n.tokenIds || [];
              return la.includes(nextToken.id);
            });
          }
          chainToken = nextToken;
        }
      }

      const vtHsl = resolvedColor.hasValue
        ? `hsla(${Math.round(resolvedColor.hue)}, ${Math.round(resolvedColor.saturation)}%, ${Math.round(resolvedColor.lightness)}%, ${resolvedColor.alpha / 100})`
        : undefined;

      // Resolve color space info for the resolved color
      let vtSpaceName: string | undefined;
      let vtSpaceValue: string | undefined;
      let vtHex: string | undefined;
      if (resolvedColor.hasValue) {
        vtHex = hslToHex(resolvedColor.hue, resolvedColor.saturation, resolvedColor.lightness, resolvedColor.alpha).toUpperCase();
        if (resolvedColorNode) {
          const cs = getNodeColorSpace(resolvedColorNode);
          const csLabel = cs === 'hsl' ? 'HSL' : cs === 'oklch' ? 'OKLCH' : cs === 'rgb' ? 'RGB' : '';
          if (csLabel) {
            vtSpaceName = csLabel;
            vtSpaceValue = formatNativeColorValue(resolvedColorNode, themeId, resolvedColor);
          }
        } else {
          vtSpaceName = 'HSL';
          vtSpaceValue = resolvedColor.alpha < 100
            ? `hsla(${Math.round(resolvedColor.hue)}, ${Math.round(resolvedColor.saturation)}%, ${Math.round(resolvedColor.lightness)}%, ${+(resolvedColor.alpha / 100).toFixed(2)})`
            : `hsl(${Math.round(resolvedColor.hue)}, ${Math.round(resolvedColor.saturation)}%, ${Math.round(resolvedColor.lightness)}%)`;
        }
      }

      return {
        name: token.name,
        isTokenNode: true,
        valueRef: {
          name: valueToken.name,
          color: vtHsl,
          isChainRef,
          spaceName: vtSpaceName,
          spaceValue: vtSpaceValue,
          hex: vtHex,
          alpha: resolvedColor.hasValue ? resolvedColor.alpha : undefined,
        },
        computed: computedInfo,
      };
    }

    // ── Hidden in theme → no tooltip ──
    if (isTokenHiddenInTheme(token, allNodes, themeId, primaryThemeId)) {
      return null;
    }

    // ── Non-color tokens → no rich tooltip ──
    if (token.type && token.type !== 'color') {
      return null;
    }

    // ── Regular color token ──
    const color = getTokenColor(token, themeId);
    if (!color.hasValue) return null;

    const hsl = `hsla(${Math.round(color.hue)}, ${Math.round(color.saturation)}%, ${Math.round(color.lightness)}%, ${color.alpha / 100})`;
    const hex = hslToHex(color.hue, color.saturation, color.lightness, color.alpha).toUpperCase();
    const node = tokenNodeMap.get(`${token.id}-${themeId}`);
    let spaceName: string | undefined;
    let spaceValue: string | undefined;
    if (node) {
      const cs = getNodeColorSpace(node);
      const csLabel = cs === 'hsl' ? 'HSL' : cs === 'oklch' ? 'OKLCH' : cs === 'rgb' ? 'RGB' : '';
      if (csLabel) {
        spaceName = csLabel;
        spaceValue = formatNativeColorValue(node, themeId, color);
      }
    } else {
      spaceName = 'HSL';
      spaceValue = color.alpha < 100
        ? `hsla(${Math.round(color.hue)}, ${Math.round(color.saturation)}%, ${Math.round(color.lightness)}%, ${+(color.alpha / 100).toFixed(2)})`
        : `hsl(${Math.round(color.hue)}, ${Math.round(color.saturation)}%, ${Math.round(color.lightness)}%)`;
    }

    return {
      name: token.name,
      isTokenNode: false,
      color: hsl,
      spaceName,
      spaceValue,
      hex,
      alpha: color.alpha,
    };
  };

  const renderTokenRow = (token: DesignToken, isGroupChild: boolean = false) => (
    <tr
      key={token.id}
      data-table-token-id={token.id}
      className={`token-table-row ${highlightRowTokenId === token.id ? 'token-table-row-highlight' : ''}`}
    >
      <td className="token-table-row-name-td" style={{ paddingLeft: isGroupChild ? 36 : 16 }}>
        <div className="token-table-row-name-inner">
          <span className="token-table-row-name-text" title={token.name}>{token.name}</span>
          {/* LOGIC badge — shown when token has active computed logic in any theme */}
          {(() => {
            const isTokenNodeToken = token.groupId ? tokenNodeGroupIds.has(token.groupId) : false;
            if (!isTokenNodeToken) return null;
            // Check if any theme has a computed result for this token
            for (const [, themeMap] of computedTokensByTheme) {
              if (themeMap.has(token.id)) {
                return (
                  <span className="token-table-row-logic-badge">
                    logic
                  </span>
                );
              }
            }
            return null;
          })()}
        </div>
      </td>
      {projectThemes.map(theme => {
        const cellKey = `${token.id}-${theme.id}`;
        const isHiddenInTheme = isTokenHiddenInTheme(token, allNodes, theme.id, primaryThemeId);
        const hasNode = !isHiddenInTheme && !!tokenNodeMap.get(cellKey);
        // Token node group tokens: navigate to the owning token node (disabled when hidden)
        const isTokenNodeToken = token.groupId ? tokenNodeGroupIds.has(token.groupId) : false;
        const hasTokenNodeOwner = isTokenNodeToken && !isHiddenInTheme && !!tokenNodeOwnerMap.get(token.id);
        const canNavigate = (hasNode || hasTokenNodeOwner) && !!onNavigateToNode;
        const isFlashing = flashCellKey === cellKey;
        const tooltipData = getCellTooltipData(token, theme.id);
        return (
          <td
            key={theme.id}
            role={canNavigate ? 'button' : undefined}
            tabIndex={canNavigate ? 0 : undefined}
            className={`token-table-row-cell-td ${
              canNavigate
                ? 'token-table-row-cell-td-navigable'
                : 'token-table-row-cell-td-static'
            }`}
            style={isFlashing ? { animation: 'cellFlash 600ms ease-out' } : undefined}
            onClick={canNavigate ? () => handleCellClick(token, theme.id) : undefined}
            onKeyDown={canNavigate ? (e) => handleCellKeyDown(e, token, theme.id) : undefined}
            aria-label={canNavigate ? `Navigate to ${token.name} in ${themes.find(t => t.id === theme.id)?.name || 'theme'}` : undefined}
          >
            {tooltipData ? (
              <TooltipPrimitive.Root>
                <TooltipPrimitive.Trigger asChild>
                  <div>{renderColorCell(token, theme.id)}</div>
                </TooltipPrimitive.Trigger>
                <TooltipPrimitive.Portal>
                  <TooltipPrimitive.Content
                    side="bottom"
                    sideOffset={8}
                    className="token-table-cell-tooltip-content"
                  >
                    <CellTooltipBody data={tooltipData} />
                  </TooltipPrimitive.Content>
                </TooltipPrimitive.Portal>
              </TooltipPrimitive.Root>
            ) : (
              renderColorCell(token, theme.id)
            )}
          </td>
        );
      })}
    </tr>
  );

  const renderGroup = (group: TokenGroup) => {
    const isExpanded = expandedGroups.has(group.id);
    const groupTokens = getTokensForGroup(group.id);
    let displayName = group.name;
    if (group.isPaletteEntry && group.paletteNodeId) {
      const pn = pageNodes.find(n => n.id === group.paletteNodeId);
      if (pn) displayName = pn.paletteName || group.name;
    }
    if (groupTokens.length === 0) return null;

    const isTokenNodeGrp = group.isTokenNodeGroup === true;

    return (
      <tbody key={group.id}>
        {/* Group header */}
        <tr
          className="token-table-group-header-row"
          onClick={() => toggleGroup(group.id)}
        >
          <td colSpan={totalCols} className="token-table-group-header-td">
            <div className="token-table-group-header-inner">
              <div className="token-table-group-header-chevron-wrap">
                {isExpanded
                  ? <ChevronDown className="token-table-group-header-chevron" />
                  : <ChevronRight className="token-table-group-header-chevron" />}
              </div>
              {isTokenNodeGrp && <Tag className="token-table-group-header-tag-icon" />}
              <span className="token-table-group-header-name" title={displayName}>{displayName}</span>
              <span className="token-table-group-header-count">{groupTokens.length}</span>
            </div>
          </td>
        </tr>
        {/* Group tokens */}
        {isExpanded && groupTokens.map(token => renderTokenRow(token, true))}
      </tbody>
    );
  };

  const selectedPage = projectPages.find(p => p.id === selectedPageId);

  // Resize edge hit areas
  const edge = (cursor: string, style: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', zIndex: 20, cursor, ...style,
  });

  return (
    <>
      {/* Panel — fixed positioned, no full-screen overlay so canvas/panels remain fully interactive */}
      <div
        ref={popupRef}
        className="token-table-panel"
        style={{
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          boxShadow: isActive
            ? '0 24px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.06) inset'
            : '0 16px 48px rgba(0,0,0,.4)',
        }}
      >
        {/* Resize handles */}
        <div style={edge('ew-resize', { top: 0, right: -3, bottom: 0, width: 6 })} onMouseDown={e => handleResizeStart(e, 'e')} />
        <div style={edge('ew-resize', { top: 0, left: -3, bottom: 0, width: 6 })} onMouseDown={e => handleResizeStart(e, 'w')} />
        <div style={edge('ns-resize', { bottom: -3, left: 0, right: 0, height: 6 })} onMouseDown={e => handleResizeStart(e, 's')} />
        <div style={edge('ns-resize', { top: -3, left: 0, right: 0, height: 6 })} onMouseDown={e => handleResizeStart(e, 'n')} />
        <div style={edge('nwse-resize', { bottom: -4, right: -4, width: 14, height: 14 })} onMouseDown={e => handleResizeStart(e, 'se')} />
        <div style={edge('nesw-resize', { bottom: -4, left: -4, width: 14, height: 14 })} onMouseDown={e => handleResizeStart(e, 'sw')} />
        <div style={edge('nesw-resize', { top: -4, right: -4, width: 14, height: 14 })} onMouseDown={e => handleResizeStart(e, 'ne')} />
        <div style={edge('nwse-resize', { top: -4, left: -4, width: 14, height: 14 })} onMouseDown={e => handleResizeStart(e, 'nw')} />

        {/* ─── Header ─── */}
        <div
          className="token-table-header"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleDragStart}
        >
          <div className="token-table-header-left">
            <GripHorizontal className="token-table-header-grip" />
            <span className="token-table-header-title">Token Table</span>

            {/* Separator */}
            <div className="token-table-header-separator" />

            {/* Page switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-dropdown
                  className="token-table-header-page-btn"
                >
                  <span className="token-table-header-page-btn-text" title={selectedPage?.name || 'Page'}>{selectedPage?.name || 'Page'}</span>
                  <ChevronDown className="token-table-header-page-chevron" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="token-table-header-page-dropdown"
              >
                {projectPages.map(pg => (
                  <DropdownMenuItem
                    key={pg.id}
                    onClick={() => setSelectedPageId(pg.id)}
                    className="token-table-header-page-item"
                  >
                    <span className={`token-table-header-page-item-name ${pg.id === selectedPageId ? 'token-table-header-page-item-name-active' : 'token-table-header-page-item-name-inactive'}`} title={pg.name}>{pg.name}</span>
                    {pg.id === selectedPageId && <Check className="token-table-header-page-item-check" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Separator */}
            <div className="token-table-header-separator" />

            {/* View Filter Tabs */}
            <div className="token-table-header-tabs">
              <button
                data-dropdown
                onClick={() => setTableViewFilter('tokens')}
                className={`token-table-header-tab ${
                  tableViewFilter === 'tokens'
                    ? 'token-table-header-tab-active'
                    : 'token-table-header-tab-inactive'
                }`}
              >
                Tokens
                {(regularGroups.length + ungroupedTokens.length) > 0 && (
                  <span className={tableViewFilter === 'tokens' ? 'token-table-header-tab-count-active' : 'token-table-header-tab-count-inactive'}>
                    {regularGroups.length + ungroupedTokens.length}
                  </span>
                )}
              </button>
              <button
                data-dropdown
                onClick={() => setTableViewFilter('palettes')}
                className={`token-table-header-tab ${
                  tableViewFilter === 'palettes'
                    ? 'token-table-header-tab-active'
                    : 'token-table-header-tab-inactive'
                }`}
              >
                Color Palettes
                {paletteEntries.length > 0 && (
                  <span className={tableViewFilter === 'palettes' ? 'token-table-header-tab-count-active' : 'token-table-header-tab-count-inactive'}>
                    {paletteEntries.length}
                  </span>
                )}
              </button>
            </div>

            {/* Separator */}
            <div className="token-table-header-separator" />

            {/* Show as Hex dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-dropdown
                  className={`token-table-header-hex-btn ${
                    hexOverrideSpaces.size > 0
                      ? 'token-table-header-hex-btn-active'
                      : 'token-table-header-hex-btn-inactive'
                  }`}
                >
                  <span>Show as Hex{hexOverrideSpaces.size > 0 ? ` (${hexOverrideSpaces.size})` : ''}</span>
                  <ChevronDown className="token-table-header-hex-chevron" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="token-table-header-hex-dropdown"
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                {([
                  { key: 'hsl', label: 'HSL' },
                  { key: 'oklch', label: 'OKLCH' },
                ] as const).map(({ key, label }) => (
                  <DropdownMenuItem
                    key={key}
                    onSelect={(e) => {
                      e.preventDefault(); // keep dropdown open
                      toggleHexOverride(key);
                    }}
                    className="token-table-header-hex-item"
                  >
                    <div className="token-table-header-hex-item-checkbox">
                      <Checkbox
                        checked={hexOverrideSpaces.has(key)}
                      />
                    </div>
                    <span className={hexOverrideSpaces.has(key) ? 'token-table-header-hex-item-label-active' : 'token-table-header-hex-item-label-inactive'}>
                      {label}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Separator */}
            <div className="token-table-header-separator" />

            {/* Logic filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-dropdown
                  className={`token-table-header-logic-btn ${
                    logicFilter !== 'all'
                      ? 'token-table-header-logic-btn-active'
                      : 'token-table-header-logic-btn-inactive'
                  }`}
                >
                  <Zap className="token-table-header-logic-icon" />
                  <span>{logicFilter === 'all' ? 'Logic' : logicFilter === 'with-logic' ? 'With Logic' : 'No Logic'}</span>
                  <ChevronDown className="token-table-header-hex-chevron" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="token-table-header-logic-dropdown"
              >
                {([
                  { key: 'all' as const, label: 'All tokens' },
                  { key: 'with-logic' as const, label: 'With logic' },
                  { key: 'no-logic' as const, label: 'Without logic' },
                ]).map(({ key, label }) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => setLogicFilter(key)}
                    className="token-table-header-logic-item"
                  >
                    <span className={logicFilter === key ? 'token-table-header-logic-item-active' : 'token-table-header-logic-item-inactive'}>{label}</span>
                    {logicFilter === key && <Check className="token-table-header-logic-item-check" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Tip label="Close Token Table" side="bottom">
          <button
            onClick={onClose}
            className="token-table-header-close-btn"
          >
            <X className="token-table-header-close-icon" />
          </button>
          </Tip>
        </div>

        {/* ─── Table ─── */}
        <TooltipPrimitive.Provider delayDuration={400}>
        <div ref={tableScrollRef} className="token-table-body-scroll">
          <table className="token-table-body-table" style={{ minWidth: Math.max(400, 200 + projectThemes.length * 180) }}>
            <thead className="token-table-body-thead">
              <tr className="token-table-body-thead-row">
                <th
                  className="token-table-body-thead-name-th"
                  onClick={() => toggleSort('name')}
                >
                  <div className="token-table-body-thead-name-inner">
                    <span>Name</span>
                    {sortField === 'name' ? (
                      sortDir === 'asc'
                        ? <ArrowUp className="token-table-body-thead-sort-icon" />
                        : <ArrowDown className="token-table-body-thead-sort-icon" />
                    ) : (
                      <ArrowUpDown className="token-table-body-thead-sort-icon-ghost" />
                    )}
                  </div>
                </th>
                {projectThemes.map(theme => (
                  <th
                    key={theme.id}
                    className="token-table-body-thead-theme-th"
                  >
                    <div className="token-table-body-thead-theme-inner">
                      {theme.isPrimary && (
                        <Crown className="token-table-body-thead-crown" />
                      )}
                      <span className="token-table-body-thead-theme-name" title={theme.name}>{theme.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Groups */}
            {displayGroups.map(g => renderGroup(g))}

            {/* Ungrouped tokens — shown under "Others" group */}
            {displayUngrouped.length > 0 && (() => {
              const isOthersExpanded = expandedGroups.has('__others__');
              return (
                <tbody>
                  <tr
                    className="token-table-group-header-row"
                    onClick={() => toggleGroup('__others__')}
                  >
                    <td colSpan={totalCols} className="token-table-group-header-td">
                      <div className="token-table-group-header-inner">
                        <div className="token-table-group-header-chevron-wrap">
                          {isOthersExpanded
                            ? <ChevronDown className="token-table-group-header-chevron" />
                            : <ChevronRight className="token-table-group-header-chevron" />}
                        </div>
                        <span className="token-table-group-header-name">Others</span>
                        <span className="token-table-group-header-count">{displayUngrouped.length}</span>
                      </div>
                    </td>
                  </tr>
                  {isOthersExpanded && displayUngrouped.map(token => renderTokenRow(token, true))}
                </tbody>
              );
            })()}
          </table>

          {/* Empty state */}
          {!hasVisibleTokens && (
            <div className="token-table-empty">
              <span className="token-table-empty-text">
                {logicFilter !== 'all'
                  ? `No tokens ${logicFilter === 'with-logic' ? 'with' : 'without'} logic on this page`
                  : tableViewFilter === 'palettes'
                    ? 'No color palettes on this page'
                    : 'No tokens on this page'}
              </span>
              {logicFilter !== 'all' && (
                <button
                  onClick={() => setLogicFilter('all')}
                  className="token-table-empty-clear-btn"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>
        </TooltipPrimitive.Provider>

        {/* ─── Footer ─── */}
        <div className="token-table-footer">
          <div className="token-table-footer-left">
            <span className="token-table-footer-stats">
              {activeTokenIds.size} token{activeTokenIds.size !== 1 ? 's' : ''}
              {' \u00b7 '}
              {allGroups.length + (ungroupedTokens.length > 0 ? 1 : 0)} group{(allGroups.length + (ungroupedTokens.length > 0 ? 1 : 0)) !== 1 ? 's' : ''}
              {' \u00b7 '}
              {projectThemes.length} theme{projectThemes.length !== 1 ? 's' : ''}
              {tokensWithLogicIds.size > 0 && (
                <>
                  {' \u00b7 '}
                  <span className="token-table-footer-logic-count">{tokensWithLogicIds.size} with logic</span>
                </>
              )}
            </span>
          </div>
          <div className="token-table-footer-right">
            {viewHistory.length > 0 && (
              <Tip label="Back to Previous View" side="top">
              <button
                onClick={handleGoBack}
                className="token-table-footer-back-btn"
              >
                <Undo2 className="token-table-footer-back-icon" />
                <span>Back</span>
              </button>
              </Tip>
            )}
            <span className="token-table-footer-readonly">Read-only</span>
          </div>
        </div>
      </div>
    </>
  );
}