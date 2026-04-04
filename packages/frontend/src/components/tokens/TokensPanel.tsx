import { DesignToken, ColorNode, TokenGroup, TokenProject, Page, NodeAdvancedLogic } from '../../types';
import { Copy, Check, ChevronDown, ChevronRight, Plus, Trash2, Edit2, Folder, FolderPlus, Library, Download, Upload, Target, X, GripVertical, Home, Lock, Unlock, Crown, Link2, ArrowUp, ArrowDown, Zap, Eye, EyeOff, Tag } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { copyTextToClipboard } from '../../utils/clipboard';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import namer from 'color-namer';
import "./TokensPanel.css";

import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '../ui/context-menu';
import { Tooltip, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { ScrubberInput } from '../canvas/ScrubberInput';
import { toast } from "sonner";
import { isTokenNameTaken } from '../../utils/nameValidation';
import { MAX_TOKEN_NAME, MAX_GROUP_NAME, MAX_PROJECT_NAME, MAX_PAGE_NAME, MAX_PALETTE_NAME } from '../../utils/textLimits';
import { Tip } from '../Tip';
import { CloudSyncIndicator, type CloudSyncStatus } from '../CloudSyncIndicator';
import { isNodeHiddenInTheme, isTokenExplicitlyHidden, isTokenForcedHiddenByNodes, isTokenHiddenInTheme, toggleVisibilityMap } from '../../utils/visibility';
import { TokenSearchBar, TokenSearchFilters, DEFAULT_FILTERS, hasActiveFilters, smartSearchTokens, applyTokenFilters } from './TokenSearchBar';

// Component to handle token name with text truncation
function TokenName({ name, onDoubleClick, panelWidth, hasCheckbox }: { name: string; onDoubleClick: () => void; panelWidth: number; hasCheckbox: boolean }) {
  const fixedWidth = hasCheckbox ? 148 : 128;
  const dynamicMaxWidth = Math.max(60, panelWidth - fixedWidth);

  return (
    <div
      className="tokens-panel-token-name"
      style={{ maxWidth: `${dynamicMaxWidth}px`, textOverflow: 'ellipsis' }}
      onDoubleClick={onDoubleClick}
      title={name}
    >
      <span className="tokens-panel-token-name-inner" style={{ textOverflow: 'ellipsis' }}>{name}</span>
    </div>
  );
}

// Helper: HSL to RGB (returns 0-255 values)
function hslToRgbValues(h: number, s: number, l: number): [number, number, number] {
  const s1 = s / 100, l1 = l / 100;
  const a = s1 * Math.min(l1, 1 - l1);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l1 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// Helper: HSL to Hex string
function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgbValues(h, s, l);
  const toH = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toH(r)}${toH(g)}${toH(b)}`.toUpperCase();
}

// Helper: HSL to OKLCH (approximate via sRGB → linear → OKLab → LCH)
function hslToOklch(h: number, s: number, l: number): [number, number, number] {
  const s1 = s / 100, l1 = l / 100;
  const a = s1 * Math.min(l1, 1 - l1);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l1 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lr = lin(f(0)), lg = lin(f(8)), lb = lin(f(4));
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const aa = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  const C = Math.sqrt(aa * aa + bb * bb);
  let H = Math.atan2(bb, aa) * 180 / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}

// Format a color space value string for tooltip display
function formatColorInfo(
  colorSpace: string,
  h: number, s: number, l: number, alpha: number,
  node?: ColorNode,
  themeId?: string,
  isPrimary?: boolean
): { spaceName: string; spaceValue: string; hex: string } {
  const hex = hslToHex(h, s, l);
  const cs = colorSpace.toUpperCase();

  // Resolve node values (consider theme overrides for non-primary)
  const nv = (key: string) => {
    if (node && !isPrimary && themeId && node.themeOverrides?.[themeId]) {
      return (node.themeOverrides[themeId] as any)[key] ?? (node as any)[key];
    }
    return node ? (node as any)[key] : undefined;
  };

  // Append alpha channel to hex when not fully opaque
  const alphaHex = alpha < 100
    ? hex + Math.round(alpha / 100 * 255).toString(16).padStart(2, '0').toUpperCase()
    : hex;
  const aDecimal = alpha / 100;

  switch (cs) {
    case 'OKLCH': {
      const [oL, oC, oH] = hslToOklch(h, s, l);
      const sv = alpha < 100
        ? `oklch(${oL.toFixed(2)} ${oC.toFixed(3)} ${Math.round(oH)} / ${aDecimal.toFixed(2)})`
        : `oklch(${oL.toFixed(2)} ${oC.toFixed(3)} ${Math.round(oH)})`;
      return { spaceName: 'OKLCH', spaceValue: sv, hex: alphaHex };
    }
    case 'RGBA':
    case 'RGB': {
      const [r, g, b] = hslToRgbValues(h, s, l);
      const sv = alpha < 100
        ? `rgba(${r}, ${g}, ${b}, ${aDecimal.toFixed(2)})`
        : `rgb(${r}, ${g}, ${b})`;
      return { spaceName: 'RGB', spaceValue: sv, hex: alphaHex };
    }
    case 'HCT': {
      const hctH = nv('hctH');
      const hctC = nv('hctC');
      const hctT = nv('hctT');
      if (hctH !== undefined && hctC !== undefined && hctT !== undefined) {
        return { spaceName: 'HCT', spaceValue: `hct(${Math.round(hctH)}, ${Math.round(hctC)}, ${Math.round(hctT)})`, hex: alphaHex };
      }
      const sv = alpha < 100
        ? `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${aDecimal.toFixed(2)})`
        : `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
      return { spaceName: 'HSL', spaceValue: sv, hex: alphaHex };
    }
    case 'HSL':
    default: {
      const sv = alpha < 100
        ? `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${aDecimal.toFixed(2)})`
        : `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
      return { spaceName: 'HSL', spaceValue: sv, hex: alphaHex };
    }
  }
}

// Sleek token tooltip content component
function TokenTooltipBody({ name, color, spaceName, spaceValue, hex, alpha, valueTokenRef, isTokenNode, isEmpty }: {
  name: string; color: string; spaceName: string; spaceValue: string; hex: string; alpha?: number;
  /** For token node group tokens: info about the referenced value token */
  valueTokenRef?: {
    name: string;
    color: string;
    spaceName: string;
    spaceValue: string;
    hex: string;
    alpha?: number;
    /** true if the value token is itself a token node (chain reference) */
    isChainRef?: boolean;
  } | null;
  /** Whether this is a token node group token */
  isTokenNode?: boolean;
  /** Whether this token has no color values assigned */
  isEmpty?: boolean;
}) {
  const showAlpha = alpha !== undefined && alpha < 100;
  const hasColorInfo = !!(spaceName || spaceValue || hex);

  // ── Token node group token tooltip ──
  if (isTokenNode) {
    return (
      <div className="tokens-panel-tooltip-wrapper-wide">
        {/* Header: Tag icon + own token name */}
        <div className="tokens-panel-tooltip-header">
          <Tag className="tokens-panel-tooltip-tag-icon" />
          <span className="tokens-panel-tooltip-name">{name}</span>
        </div>
        {/* CSS variable line */}
        <div className="tokens-panel-tooltip-divider" />
        <div className="tokens-panel-tooltip-var-row">
          <div className="tokens-panel-tooltip-var-inner">
            <span className="tokens-panel-tooltip-label">VAR</span>
            <span className="tokens-panel-tooltip-mono">--{name.toLowerCase().replace(/\s+/g, '-')}</span>
          </div>
        </div>
        {/* Value token reference */}
        {valueTokenRef ? (
          <>
            <div className="tokens-panel-tooltip-divider" />
            <div className="tokens-panel-tooltip-value-section">
              <div className="tokens-panel-tooltip-value-label-row">
                <span className="tokens-panel-tooltip-value-label">Value</span>
                <Link2 className="tokens-panel-tooltip-link-icon" />
              </div>
              <div className="tokens-panel-tooltip-value-row">
                {valueTokenRef.isChainRef ? (
                  <Tag className="tokens-panel-tooltip-tag-icon" />
                ) : valueTokenRef.color ? (
                  <div className="tokens-panel-tooltip-swatch" style={{ backgroundColor: valueTokenRef.color }} />
                ) : (
                  <div className="tokens-panel-tooltip-swatch-empty" />
                )}
                <span className="tokens-panel-tooltip-name">{valueTokenRef.name}</span>
              </div>
            </div>
            {/* Value token's color info */}
            {!!(valueTokenRef.spaceName || valueTokenRef.hex) && (
              <>
                <div className="tokens-panel-tooltip-divider" />
                <div className="tokens-panel-tooltip-info-section">
                  {valueTokenRef.spaceName && valueTokenRef.spaceValue && (
                    <div className="tokens-panel-tooltip-info-row">
                      <span className="tokens-panel-tooltip-label">{valueTokenRef.spaceName}</span>
                      <span className="tokens-panel-tooltip-mono">{valueTokenRef.spaceValue}</span>
                    </div>
                  )}
                  {valueTokenRef.hex && (
                    <div className="tokens-panel-tooltip-info-row">
                      <span className="tokens-panel-tooltip-label">HEX</span>
                      <span className="tokens-panel-tooltip-mono">{valueTokenRef.hex}</span>
                    </div>
                  )}
                  {valueTokenRef.alpha !== undefined && valueTokenRef.alpha < 100 && (
                    <div className="tokens-panel-tooltip-info-row">
                      <span className="tokens-panel-tooltip-label">ALPHA</span>
                      <span className="tokens-panel-tooltip-mono">{Math.round(valueTokenRef.alpha)}%</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="tokens-panel-tooltip-divider" />
            <div className="tokens-panel-tooltip-no-value">
              <span className="tokens-panel-tooltip-no-value-text">No value assigned</span>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Regular token tooltip (unchanged) ──
  return (
    <div className="tokens-panel-tooltip-wrapper">
      <div className="tokens-panel-tooltip-header">
        {color ? (
          <div className="tokens-panel-tooltip-swatch-lg" style={{ backgroundColor: color }} />
        ) : (
          <div className="tokens-panel-tooltip-swatch-lg-empty" />
        )}
        <span className="tokens-panel-tooltip-name">{name}</span>
      </div>
      {isEmpty && !hasColorInfo && (
        <>
          <div className="tokens-panel-tooltip-divider" />
          <div className="tokens-panel-tooltip-no-value">
            <span className="tokens-panel-tooltip-no-value-text">Empty — no color values assigned</span>
          </div>
        </>
      )}
      {hasColorInfo && (
        <>
          <div className="tokens-panel-tooltip-divider" />
          <div className="tokens-panel-tooltip-color-section">
            <div className="tokens-panel-tooltip-info-row">
              <span className="tokens-panel-tooltip-label">{spaceName}</span>
              <span className="tokens-panel-tooltip-mono">{spaceValue}</span>
            </div>
            <div className="tokens-panel-tooltip-info-row">
              <span className="tokens-panel-tooltip-label">HEX</span>
              <span className="tokens-panel-tooltip-mono">{hex}</span>
            </div>
            {showAlpha && (
              <div className="tokens-panel-tooltip-info-row">
                <span className="tokens-panel-tooltip-label">ALPHA</span>
                <span className="tokens-panel-tooltip-mono">{Math.round(alpha)}%</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface TokensPanelProps {
  tokens: DesignToken[];
  nodes: ColorNode[];
  allProjectTokens?: DesignToken[]; // All tokens across all pages in the project (for cross-page reference resolution)
  allProjectNodes?: ColorNode[]; // All nodes across all pages in the project (for cross-page lookups)
  projects: TokenProject[];
  pages: Page[];
  groups: TokenGroup[];
  activeProjectId: string;
  activePageId: string; // Add pageId prop
  activeThemeId?: string; // Add themeId prop for displaying theme-specific values
  isPrimaryTheme?: boolean; // Whether the current theme is the primary theme
  primaryThemeId?: string; // The primary theme's ID for checking inheritance
  showAllVisible?: boolean; // Override dimming — show all tokens at full opacity
  onAddToken: (name?: string, groupId?: string | null, projectId?: string) => void;
  onUpdateToken: (id: string, updates: Partial<DesignToken>) => void;
  onDeleteToken: (id: string) => void;
  onUpdateProjects: (projects: TokenProject[]) => void;
  onUpdatePages: (pages: Page[]) => void;
  onUpdateGroups: (groups: TokenGroup[]) => void;
  onExportProject: (projectId: string) => void;
  onImportProject: () => void;
  onUpdateNode?: (id: string, updates: Partial<ColorNode>) => void;
  onDeleteNode?: (id: string) => void;
  onNavigateToNode?: (nodeId: string) => void;
  onNavigateToProjects?: () => void;
  advancedLogic?: NodeAdvancedLogic[];
  cloudSyncStatus?: CloudSyncStatus;
  lastSyncedAt?: number;
  lastSyncError?: string;
  onManualSync?: () => void;
  dirtyCount?: number;
  readOnly?: boolean;
}

// Helper function to format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'few seconds ago';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export function TokensPanel({ tokens, nodes, allProjectTokens = [], allProjectNodes = [], projects, pages, groups, activeProjectId, activePageId, activeThemeId, isPrimaryTheme = true, primaryThemeId, showAllVisible = false, onAddToken, onUpdateToken, onDeleteToken, onUpdateProjects, onUpdatePages, onUpdateGroups, onExportProject, onImportProject, onUpdateNode, onDeleteNode, onNavigateToNode, onNavigateToProjects, advancedLogic, cloudSyncStatus = 'local', lastSyncedAt, lastSyncError, onManualSync, dirtyCount = 0, readOnly = false }: TokensPanelProps) {
  // Non-primary themes are read-only in the tokens panel:
  // the only allowed action is clicking a token to navigate to its node.
  const isReadOnly = readOnly || !isPrimaryTheme;

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingType, setEditingType] = useState<'token' | 'group' | 'project' | 'page' | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [focusedTokenId, setFocusedTokenId] = useState<string | null>(null);
  const [contextMenuOpenTokenId, setContextMenuOpenTokenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<TokenSearchFilters>(DEFAULT_FILTERS);
  const [viewFilter, setViewFilter] = useState<'tokens' | 'palettes'>(() => {
    const saved = localStorage.getItem('tokensPanelViewFilter');
    return saved === 'palettes' ? 'palettes' : 'tokens';
  });
  const prevPaletteCountRef = useRef<number>(-1);

  // ─── Auto-assign token delete confirmation ─────────────────────
  const [autoAssignDeleteDialog, setAutoAssignDeleteDialog] = useState<{
    open: boolean;
    // Items: one or more auto-assigned tokens pending confirmation
    items: { tokenId: string; tokenName: string; nodeId: string; nodeName: string }[];
    // Non-auto-assigned tokens to delete immediately upon confirm (for mixed bulk)
    nonAutoTokenIds: string[];
    excludeFromAutoAssign: boolean;
  }>({ open: false, items: [], nonAutoTokenIds: [], excludeFromAutoAssign: false });

  // Find which node has this token as its autoAssignedTokenId
  // Only returns a node if its parent still has autoAssignEnabled ON
  const findAutoAssignedNode = (tokenId: string): ColorNode | null => {
    const childNode = nodes.find(n => n.autoAssignedTokenId === tokenId);
    if (!childNode) return null;
    // Check if the parent still has auto-assign enabled
    const parentNode = childNode.parentId ? nodes.find(n => n.id === childNode.parentId) : null;
    if (!parentNode?.autoAssignEnabled) return null;
    return childNode;
  };

  // Handle token delete — if it's an auto-assigned token, show confirmation first
  const handleTokenDelete = (tokenId: string) => {
    // Guard: prevent deleting token-node-group tokens from the panel
    const tkn = tokens.find(tk => tk.id === tokenId);
    if (tkn && tkn.groupId) {
      const grp = groups.find(g => g.id === tkn.groupId);
      if (grp?.isTokenNodeGroup) return;
    }

    const assignedNode = findAutoAssignedNode(tokenId);
    if (assignedNode) {
      const token = tokens.find(t => t.id === tokenId);
      setAutoAssignDeleteDialog({
        open: true,
        items: [{
          tokenId,
          tokenName: token?.name || 'Unknown',
          nodeId: assignedNode.id,
          nodeName: assignedNode.referenceName || assignedNode.id.slice(0, 8),
        }],
        nonAutoTokenIds: [],
        excludeFromAutoAssign: false,
      });
    } else {
      // Not an auto-assigned token — delete immediately
      onDeleteToken(tokenId);
    }
  };

  // Confirm auto-assign token deletion (single or bulk)
  const confirmAutoAssignDelete = () => {
    const { items, nonAutoTokenIds, excludeFromAutoAssign } = autoAssignDeleteDialog;
    // Exclude nodes from future auto-assign if checkbox was checked
    if (excludeFromAutoAssign && onUpdateNode) {
      items.forEach(({ nodeId }) => {
        onUpdateNode(nodeId, { autoAssignExcluded: true });
      });
    }
    // Delete the auto-assigned tokens
    items.forEach(({ tokenId }) => {
      onDeleteToken(tokenId);
    });
    // Delete the non-auto-assigned tokens (from mixed bulk delete)
    nonAutoTokenIds.forEach(tokenId => {
      onDeleteToken(tokenId);
    });
    setAutoAssignDeleteDialog(prev => ({ ...prev, open: false }));
    deselectAllTokens();
  };

  // Handle bulk delete with auto-assign check
  const handleBulkDeleteTokens = () => {
    // Guard: filter out token-node-group tokens (they cannot be deleted from the panel)
    const deletableTokens = new Set<string>();
    selectedTokens.forEach(tokenId => {
      const t = tokens.find(tk => tk.id === tokenId);
      if (t && t.groupId) {
        const grp = groups.find(g => g.id === t.groupId);
        if (grp?.isTokenNodeGroup) return; // skip token-node-group tokens
      }
      deletableTokens.add(tokenId);
    });
    if (deletableTokens.size === 0) return;

    // Partition selected tokens into auto-assigned vs non-auto-assigned
    const autoItems: { tokenId: string; tokenName: string; nodeId: string; nodeName: string }[] = [];
    const nonAutoIds: string[] = [];

    deletableTokens.forEach(tokenId => {
      const assignedNode = findAutoAssignedNode(tokenId);
      if (assignedNode) {
        const token = tokens.find(t => t.id === tokenId);
        autoItems.push({
          tokenId,
          tokenName: token?.name || 'Unknown',
          nodeId: assignedNode.id,
          nodeName: assignedNode.referenceName || assignedNode.id.slice(0, 8),
        });
      } else {
        nonAutoIds.push(tokenId);
      }
    });

    if (autoItems.length > 0) {
      // Show confirmation dialog — includes both auto-assigned and non-auto tokens
      setAutoAssignDeleteDialog({
        open: true,
        items: autoItems,
        nonAutoTokenIds: nonAutoIds,
        excludeFromAutoAssign: false,
      });
    } else {
      // No auto-assigned tokens — delete all immediately
      nonAutoIds.forEach(tokenId => {
        onDeleteToken(tokenId);
      });
      deselectAllTokens();
    }
  };

  // Helper function to get theme-specific values from a token
  const getTokenThemeValues = (token: DesignToken) => {
    // If activeThemeId is provided and token has themeValues, use them
    if (activeThemeId && token.themeValues?.[activeThemeId]) {
      return token.themeValues[activeThemeId];
    }

    // Otherwise, fall back to legacy properties
    return {
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
  };

  // Helper: resolve shade node's effective color for current theme
  // Non-primary themes may store overridden values in themeOverrides
  const getShadeEffectiveColor = (shade: ColorNode) => {
    if (!isPrimaryTheme && activeThemeId && shade.themeOverrides?.[activeThemeId]) {
      const o = shade.themeOverrides[activeThemeId];
      return {
        hue: o.hue ?? shade.hue,
        saturation: o.saturation ?? shade.saturation,
        lightness: o.lightness ?? shade.lightness,
        alpha: o.alpha ?? shade.alpha ?? 100,
      };
    }
    return { hue: shade.hue, saturation: shade.saturation, lightness: shade.lightness, alpha: shade.alpha ?? 100 };
  };

  // Helper: resolve shade node's token ID for current theme
  const getShadeTokenId = (shade: ColorNode): string | undefined => {
    if (activeThemeId && shade.tokenAssignments?.[activeThemeId] !== undefined) {
      return shade.tokenAssignments[activeThemeId][0];
    }
    return shade.tokenIds?.[0];
  };

  // Project name editing state
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState('');
  const projectNameInputRef = useRef<HTMLInputElement>(null);

  // Delete group confirmation dialog state
  const [deleteGroupDialogOpen, setDeleteGroupDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<{ id: string; name: string; tokenCount: number; assignedCount: number } | null>(null);

  // Drag-to-select state
  const [isDraggingSelect, setIsDraggingSelect] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const tokenRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Highlighted token from Command Palette (⌘K) global search
  const [highlightedTokenId, setHighlightedTokenId] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const tokenId = (e as CustomEvent).detail?.tokenId;
      if (!tokenId) return;
      setHighlightedTokenId(tokenId);
      // Scroll to the token after a brief render delay
      requestAnimationFrame(() => {
        const el = tokenRefs.current.get(tokenId);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
      // Clear highlight after 2.5s
      const timer = setTimeout(() => setHighlightedTokenId(null), 2500);
      return () => clearTimeout(timer);
    };
    window.addEventListener('highlightToken', handler);
    return () => window.removeEventListener('highlightToken', handler);
  }, []);

  // Refs for drag-vs-click detection
  const dragPendingRef = useRef(false);
  const dragStartClientRef = useRef({ x: 0, y: 0 });
  const wasDraggingRef = useRef(false);
  const clickedEmptyRef = useRef(false);
  // Snapshot of selectedTokens captured at mousedown so Shift+drag can
  // union the existing selection with the rectangle selection.
  const preDragSelectionRef = useRef<Set<string>>(new Set());
  // Synchronous ref mirrors for values used inside global event listeners,
  // avoiding stale-closure issues between React state updates and effect re-runs.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingSelectRef = useRef(false);

  // Refs for range selection (anchor/cursor model)
  const selectionAnchorRef = useRef<string | null>(null);
  const selectionCursorRef = useRef<string | null>(null);

  // Drag-to-reorder state
  const [reorderDropIndicator, setReorderDropIndicator] = useState<{ groupId: string | null; index: number; dragTokenIds: string[] } | null>(null);
  const reorderDragRef = useRef<{
    tokenIds: string[];
    groupId: string | null;
    startY: number;
    active: boolean;
  } | null>(null);
  const reorderDropIndicatorRef = useRef<{ groupId: string | null; index: number } | null>(null);

  // Clean up selectedTokens when tokens are deleted
  useEffect(() => {
    const validTokenIds = new Set(tokens.map(t => t.id));
    setSelectedTokens(prev => {
      const newSet = new Set<string>();
      prev.forEach(tokenId => {
        if (validTokenIds.has(tokenId)) {
          newSet.add(tokenId);
        }
      });
      // Only update if something changed
      if (newSet.size !== prev.size) {
        return newSet;
      }
      return prev;
    });
  }, [tokens]);

  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('tokensPanelWidth');
    return saved ? parseInt(saved) : 280;
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const editInputRef = useRef<HTMLInputElement>(null);

  const copyToClipboard = (text: string, tokenId: string) => {
    copyTextToClipboard(text);
    setCopiedToken(tokenId);
    setTimeout(() => setCopiedToken(null), 2000);
  };



  const startEditing = (id: string, name: string, type: 'token' | 'group' | 'collection' | 'page') => {
    if (isReadOnly) return; // Safety net — callers should already check
    setEditingId(id);
    setEditingName(name);
    setEditingType(type);
    setTimeout(() => { editInputRef.current?.focus(); editInputRef.current?.select(); }, 0);
  };

  const saveName = () => {
    if (!editingId || isReadOnly) {
      setEditingId(null);
      setEditingName('');
      setEditingType(null);
      return;
    }

    const trimmedName = editingName.trim();

    // Validate minimum length of 2 characters - if invalid, just cancel the edit
    if (!trimmedName || trimmedName.length < 2) {
      setEditingId(null);
      setEditingName('');
      setEditingType(null);
      return;
    }

    if (editingType === 'token') {
      // Check for duplicate token names within the same project (across all pages)
      const editingToken = tokens.find(t => t.id === editingId);
      if (editingToken && isTokenNameTaken(trimmedName, tokens, editingToken.projectId, editingId)) {
        toast.error(`A token named "${trimmedName}" already exists in this project`);
        return;
      }
      onUpdateToken(editingId, { name: trimmedName });
    } else if (editingType === 'group') {
      const group = groups.find(g => g.id === editingId);
      if (!group) {
        setEditingId(null);
        setEditingName('');
        setEditingType(null);
        return;
      }

      // Check for duplicate names in the same collection
      const isDuplicate = groups.some(
        g => g.id !== editingId &&
          g.projectId === group.projectId &&
          g.name.toLowerCase() === trimmedName.toLowerCase()
      );

      if (isDuplicate) {
        toast.error(`A group named "${trimmedName}" already exists in this collection`);
        return;
      }

      onUpdateGroups(groups.map(g =>
        g.id === editingId ? { ...g, name: trimmedName } : g
      ));
    } else if (editingType === 'project') {
      // Check for duplicate project names
      const isDuplicate = projects.some(
        p => p.id !== editingId &&
          p.name.toLowerCase() === trimmedName.toLowerCase()
      );

      if (isDuplicate) {
        toast.error(`A project named "${trimmedName}" already exists`);
        return;
      }

      onUpdateProjects(projects.map(p =>
        p.id === editingId ? { ...p, name: trimmedName } : p
      ));
    } else if (editingType === 'page') {
      // Check for duplicate page names within the same project
      const page = pages.find(p => p.id === editingId);
      if (!page) {
        setEditingId(null);
        setEditingName('');
        setEditingType(null);
        return;
      }

      const isDuplicate = pages.some(
        p => p.id !== editingId &&
          p.projectId === page.projectId &&
          p.name.toLowerCase() === trimmedName.toLowerCase()
      );

      if (isDuplicate) {
        toast.error(`A page named "${trimmedName}" already exists in this project`);
        return;
      }

      onUpdatePages(pages.map(p =>
        p.id === editingId ? { ...p, name: trimmedName } : p
      ));
    }

    setEditingId(null);
    setEditingName('');
    setEditingType(null);
  };

  // Project name editing handlers
  const startEditingProjectName = () => {
    if (isReadOnly) return;
    const currentProject = projects.find(p => p.id === activeProjectId);
    if (currentProject) {
      setIsEditingProjectName(true);
      setEditingProjectName(currentProject.name);
      setTimeout(() => projectNameInputRef.current?.focus(), 0);
      setTimeout(() => projectNameInputRef.current?.select(), 0);
    }
  };

  const saveProjectName = () => {
    if (isReadOnly) { setIsEditingProjectName(false); setEditingProjectName(''); return; }
    const trimmedName = editingProjectName.trim();

    // Validate minimum length of 2 characters
    if (!trimmedName || trimmedName.length < 2) {
      setIsEditingProjectName(false);
      setEditingProjectName('');
      return;
    }

    // Check for duplicate project names
    const isDuplicate = projects.some(
      p => p.id !== activeProjectId &&
        p.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (isDuplicate) {
      console.warn(`A project named "${trimmedName}" already exists`);
      setIsEditingProjectName(false);
      setEditingProjectName('');
      return;
    }

    // Update the project name
    onUpdateProjects(projects.map(p =>
      p.id === activeProjectId ? { ...p, name: trimmedName } : p
    ));

    setIsEditingProjectName(false);
    setEditingProjectName('');
  };

  const cancelEditingProjectName = () => {
    setIsEditingProjectName(false);
    setEditingProjectName('');
  };

  const getNodesUsingToken = (tokenId: string) => {
    return nodes.filter(node => {
      // Check theme-specific assignments first
      if (activeThemeId && node.tokenAssignments?.[activeThemeId]) {
        return node.tokenAssignments[activeThemeId].includes(tokenId);
      }
      // Check primary theme assignments as inheritance fallback
      // (non-primary themes inherit assignments from primary if not explicitly set)
      if (primaryThemeId && node.tokenAssignments?.[primaryThemeId]) {
        return node.tokenAssignments[primaryThemeId].includes(tokenId);
      }
      // Fallback to legacy tokenIds for backward compatibility
      return node.tokenIds && node.tokenIds.includes(tokenId);
    });
  };

  // Check if a token's actual value OR node assignment has changed between primary and current theme
  // Considers both: (1) assignment differences (token assigned to different/no nodes) and
  // (2) resolved value differences (token HSL values differ between themes)
  const isTokenValueChanged = (tokenId: string): boolean => {
    if (isPrimaryTheme || !activeThemeId || !primaryThemeId) return false;

    // ── Token node group tokens: check owning node's valueTokenAssignments ──
    const ownerNode = nodes.find(n => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === tokenId);
    if (ownerNode) {
      const hasThemeOverride = ownerNode.valueTokenAssignments?.[activeThemeId] !== undefined;
      if (!hasThemeOverride) return false;
      const primaryVal = ownerNode.valueTokenAssignments?.[primaryThemeId] ?? ownerNode.valueTokenId;
      const currentVal = ownerNode.valueTokenAssignments[activeThemeId];
      return primaryVal !== currentVal;
    }

    // Check if node assignments differ between themes for this token
    const primaryNodes = nodes.filter(node => {
      if (node.tokenAssignments?.[primaryThemeId] !== undefined) {
        return node.tokenAssignments[primaryThemeId].includes(tokenId);
      }
      return node.tokenIds && node.tokenIds.includes(tokenId);
    });
    const currentNodes = nodes.filter(node => {
      if (node.tokenAssignments?.[activeThemeId] !== undefined) {
        return node.tokenAssignments[activeThemeId].includes(tokenId);
      }
      return node.tokenIds && node.tokenIds.includes(tokenId);
    });
    // If assigned to different node sets, it's changed
    if (primaryNodes.length !== currentNodes.length) return true;
    const primaryNodeIds = new Set(primaryNodes.map(n => n.id));
    if (currentNodes.some(n => !primaryNodeIds.has(n.id))) return true;

    // Check if token theme values differ
    const token = tokens.find(t => t.id === tokenId);
    if (!token) return false;
    const primaryValue = token.themeValues?.[primaryThemeId];
    const currentValue = token.themeValues?.[activeThemeId];
    // Both missing → same (not changed)
    if (!primaryValue && !currentValue) return false;
    // One missing, other present → changed
    if (!primaryValue || !currentValue) return true;
    // Check if color values actually differ
    if ('hue' in primaryValue && 'hue' in currentValue) {
      return (
        Math.round(primaryValue.hue ?? 0) !== Math.round(currentValue.hue ?? 0) ||
        Math.round(primaryValue.saturation ?? 0) !== Math.round(currentValue.saturation ?? 0) ||
        Math.round(primaryValue.lightness ?? 0) !== Math.round(currentValue.lightness ?? 0) ||
        (primaryValue.alpha ?? 1) !== (currentValue.alpha ?? 1)
      );
    }
    // Check if spacing values differ
    if ('value' in primaryValue && 'value' in currentValue) {
      return primaryValue.value !== currentValue.value || primaryValue.unit !== currentValue.unit;
    }
    return false;
  };

  // Token is inherited (dimmed) when its value has NOT changed from primary
  const isTokenInherited = (tokenId: string): boolean => {
    if (isPrimaryTheme || !activeThemeId) return false;
    return !isTokenValueChanged(tokenId);
  };

  // Token's assigned node inheritance state for crown icon display.
  // Returns the node-level color inheritance state:
  //   'primary'       — viewing primary theme (yellow crown)
  //   'inherited'     — node linked to primary, no themeOverrides (yellow crown)
  //   'not-inherited' — node unlinked but color values unchanged from primary (gray crown)
  //   'modified'      — node unlinked AND color values changed (blue crown)
  //   null            — no assigned node
  const getTokenNodeInheritanceState = (tokenId: string): 'primary' | 'inherited' | 'not-inherited' | 'modified' | null => {
    const assignedNodes = getNodesUsingToken(tokenId);
    if (assignedNodes.length === 0) return null;
    if (isPrimaryTheme || !activeThemeId) return 'primary';

    const node = assignedNodes[0];
    const hasOverride = node.themeOverrides && node.themeOverrides[activeThemeId];
    if (!hasOverride) return 'inherited'; // linked to primary

    // Has override — check if values actually differ from base (primary) values
    const overrides = node.themeOverrides![activeThemeId];
    const hueMatch = (overrides.hue === undefined || overrides.hue === node.hue);
    const satMatch = (overrides.saturation === undefined || overrides.saturation === node.saturation);
    const lightMatch = (overrides.lightness === undefined || overrides.lightness === node.lightness);
    const alphaMatch = (overrides.alpha === undefined || overrides.alpha === (node.alpha ?? 100));
    if (hueMatch && satMatch && lightMatch && alphaMatch) return 'not-inherited';
    return 'modified';
  };

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;

      const rect = panelRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;

      // Constrain width between 280px and 600px
      const constrainedWidth = Math.max(280, Math.min(600, newWidth));
      setPanelWidth(constrainedWidth);
      localStorage.setItem('tokensPanelWidth', constrainedWidth.toString());
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);


  const addGroup = (projectId: string) => {
    if (isReadOnly) return; // Block in sample mode
    // Get all groups in this project and page
    const projectGroups = groups.filter(g => g.projectId === projectId && g.pageId === activePageId);

    // Generate a unique name within this project and page
    let baseName = 'Group';
    let counter = 1;
    let newName = baseName;

    while (projectGroups.some(g => g.name.toLowerCase() === newName.toLowerCase())) {
      counter++;
      newName = `${baseName} ${counter}`;
    }

    // Compute the next sortOrder for the new group (append to end of regular groups)
    const existingRegular = groups.filter(g => g.projectId === projectId && g.pageId === activePageId && !g.isColorPaletteGroup && !g.isPaletteEntry);
    const maxSortOrder = existingRegular.reduce((max, g) => Math.max(max, g.sortOrder ?? -1), -1);
    const newGroup: TokenGroup = {
      id: `group-${Date.now()}`,
      name: newName,
      projectId,
      pageId: activePageId,
      isExpanded: true,
      sortOrder: maxSortOrder + 1,
      createdAt: Date.now()
    };
    onUpdateGroups([...groups, newGroup]);
  };



  const requestDeleteGroup = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    // Prevent deleting token node groups from the panel
    if (group.isTokenNodeGroup) return;

    // Find all tokens in this group
    const tokensInGroup = tokens.filter(t => t.groupId === groupId);

    // Check how many tokens are assigned to nodes
    const assignedTokens = tokensInGroup.filter(token =>
      nodes.some(node => node.tokenIds?.includes(token.id))
    );

    // If group has tokens, show confirmation dialog
    if (tokensInGroup.length > 0) {
      setGroupToDelete({
        id: groupId,
        name: group.name,
        tokenCount: tokensInGroup.length,
        assignedCount: assignedTokens.length
      });
      setDeleteGroupDialogOpen(true);
    } else {
      // No tokens, delete immediately
      confirmDeleteGroup(groupId);
    }
  };

  const confirmDeleteGroup = (groupId: string) => {
    const tokensInGroup = tokens.filter(t => t.groupId === groupId);
    const tokenIdsToDelete = tokensInGroup.map(t => t.id);

    // Delete all tokens in the group
    tokensInGroup.forEach(token => {
      onDeleteToken(token.id);
    });

    // Update nodes to remove deleted token IDs from their tokenIds arrays
    if (onUpdateNode) {
      nodes.forEach(node => {
        if (node.tokenIds && node.tokenIds.some(id => tokenIdsToDelete.includes(id))) {
          const updatedTokenIds = node.tokenIds.filter(id => !tokenIdsToDelete.includes(id));
          onUpdateNode(node.id, { tokenIds: updatedTokenIds });
        }
      });
    }

    // Delete the group
    onUpdateGroups(groups.filter(g => g.id !== groupId));

    // Close dialog
    setDeleteGroupDialogOpen(false);
    setGroupToDelete(null);
  };

  // Helper function to generate color name
  const generateColorName = (hue: number, saturation: number, lightness: number): string => {
    try {
      // Convert HSL to RGB
      const h = hue;
      const s = saturation / 100;
      const l = lightness / 100;

      const a = s * Math.min(l, 1 - l);
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color);
      };

      const r = f(0);
      const g = f(8);
      const b = f(4);

      // Convert to hex for color-namer
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      const hexColor = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

      // Use color-namer to get the best name
      const names = namer(hexColor);
      const colorName = names.ntc[0]?.name || 'Color';

      return colorName;
    } catch (e) {
      return 'Color';
    }
  };

  const deletePaletteGroup = (groupId: string, paletteNodeId: string | undefined) => {
    // If there's a palette node, delete it and let App.tsx handle cleaning up the group and tokens
    if (paletteNodeId && onDeleteNode) {
      // Delete the palette node (this will also delete all its shade children and associated group/tokens via deleteNode in App.tsx)
      onDeleteNode(paletteNodeId);
    } else {
      // No palette node, just delete the group
      onUpdateGroups(groups.filter(g => g.id !== groupId));
    }
  };

  const toggleGroup = (groupId: string) => {
    onUpdateGroups(groups.map(g =>
      g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g
    ));
  };

  // Auto-expand a group if it's currently collapsed (used when adding/moving tokens into a group)
  const ensureGroupExpanded = (groupId: string | null) => {
    if (groupId === null) return;
    const group = groups.find(g => g.id === groupId);
    if (group && !group.isExpanded) {
      onUpdateGroups(groups.map(g =>
        g.id === groupId ? { ...g, isExpanded: true } : g
      ));
    }
  };

  const toggleProject = (projectId: string) => {
    onUpdateProjects(projects.map(p =>
      p.id === projectId ? { ...p, isExpanded: !p.isExpanded } : p
    ));
  };

  // --- Selection helpers ---

  // Query the DOM for all visible token rows in render order
  const getOrderedVisibleTokenIds = (): string[] => {
    if (!scrollAreaRef.current) return [];
    const elements = scrollAreaRef.current.querySelectorAll('[data-token-id]');
    return Array.from(elements).map(el => el.getAttribute('data-token-id')!);
  };

  // Compute the range between anchor and target (inclusive) from the ordered list
  const getRangeIds = (anchorId: string, targetId: string): string[] => {
    const ordered = getOrderedVisibleTokenIds();
    const a = ordered.indexOf(anchorId);
    const b = ordered.indexOf(targetId);
    if (a === -1 || b === -1) return [targetId];
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    return ordered.slice(start, end + 1);
  };

  // Navigate to the canvas node assigned to a token
  const navigateToTokenNode = (tokenId: string) => {
    if (!onNavigateToNode) return;
    const assigned = getNodesUsingToken(tokenId);
    const onPage = assigned.filter(n => n.pageId === activePageId);
    if (onPage.length > 0) {
      onNavigateToNode(onPage[0].id);
    } else if (assigned.length > 0) {
      onNavigateToNode(assigned[0].id);
    }
  };

  // Ensure a valid anchor exists; if not, derive one from the current selection
  // or fall back to the given tokenId.
  const ensureAnchor = (tokenId: string): string => {
    if (selectionAnchorRef.current) return selectionAnchorRef.current;
    if (selectedTokens.size > 0) {
      const ordered = getOrderedVisibleTokenIds();
      const first = ordered.find(id => selectedTokens.has(id));
      if (first) {
        selectionAnchorRef.current = first;
        return first;
      }
    }
    selectionAnchorRef.current = tokenId;
    return tokenId;
  };

  // Two-mode click handler:
  //   Normal mode  (nothing selected) → plain click navigates, Ctrl/Cmd enters selection
  //   Selection mode (≥1 selected)    → plain click selects, Shift ranges, Ctrl toggles
  //
  // Shift+click range behaviour:
  //   • Plain Shift+click always sets the selection to the anchor→target range.
  //     Moving the target CLOSER to the anchor contracts (deselects) the tail end;
  //     moving it FARTHER expands the selection.  This is standard Finder/Explorer
  //     range-select and naturally supports both selection and deselection.
  //   • Ctrl/Cmd+Shift+click performs a range TOGGLE within the existing selection:
  //     if every token in anchor→target is already selected the range is removed
  //     (deselected); otherwise the range is added to the current selection.
  const handleTokenClick = (tokenId: string, e: React.MouseEvent) => {
    const inSelectionMode = selectedTokens.size > 0;

    if (e.shiftKey) {
      // --- Shift+click: range operation from anchor → target ---
      const anchor = ensureAnchor(tokenId);
      const rangeIds = getRangeIds(anchor, tokenId);

      if (e.metaKey || e.ctrlKey) {
        // Ctrl/Cmd+Shift+click → TOGGLE the range within the existing selection
        const allInRangeSelected = rangeIds.every(id => selectedTokens.has(id));
        setSelectedTokens(prev => {
          const newSet = new Set(prev);
          if (allInRangeSelected) {
            // Deselect the range but always keep the anchor itself selected
            rangeIds.forEach(id => { if (id !== anchor) newSet.delete(id); });
          } else {
            // Add the range to the existing selection
            rangeIds.forEach(id => newSet.add(id));
          }
          return newSet;
        });
      } else {
        // Plain Shift+click → replace entire selection with anchor→target range
        setSelectedTokens(new Set(rangeIds));
      }

      selectionCursorRef.current = tokenId;
      setFocusedTokenId(tokenId);
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click → toggle individual token
      const isCurrentlySelected = selectedTokens.has(tokenId);
      const willBeEmpty = isCurrentlySelected && selectedTokens.size === 1;

      setSelectedTokens(prev => {
        const newSet = new Set(prev);
        if (newSet.has(tokenId)) {
          newSet.delete(tokenId);
        } else {
          newSet.add(tokenId);
        }
        return newSet;
      });

      if (willBeEmpty) {
        // Exiting selection mode entirely — clear anchor
        selectionAnchorRef.current = null;
        selectionCursorRef.current = null;
        setFocusedTokenId(null);
      } else {
        // Set anchor only when first entering selection mode (preserves it
        // for later Shift+clicks so the range reference point stays stable).
        if (!selectionAnchorRef.current) {
          selectionAnchorRef.current = tokenId;
        }
        selectionCursorRef.current = tokenId;
        setFocusedTokenId(tokenId);
      }
    } else if (inSelectionMode) {
      // Selection mode: plain click → select only this token, reset anchor
      setSelectedTokens(new Set([tokenId]));
      selectionAnchorRef.current = tokenId;
      selectionCursorRef.current = tokenId;
      setFocusedTokenId(tokenId);
    } else {
      // Normal mode: plain click → navigate to the token's node
      navigateToTokenNode(tokenId);
    }
  };

  // Toggle used by context menu "Select/Deselect"
  const toggleTokenSelection = (tokenId: string) => {
    const isCurrentlySelected = selectedTokens.has(tokenId);
    const willBeEmpty = isCurrentlySelected && selectedTokens.size === 1;

    setSelectedTokens(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tokenId)) {
        newSet.delete(tokenId);
      } else {
        newSet.add(tokenId);
      }
      return newSet;
    });

    if (willBeEmpty) {
      selectionAnchorRef.current = null;
      selectionCursorRef.current = null;
      setFocusedTokenId(null);
    } else {
      if (!selectionAnchorRef.current) {
        selectionAnchorRef.current = tokenId;
      }
      selectionCursorRef.current = tokenId;
      setFocusedTokenId(tokenId);
    }
  };

  const selectAllTokens = () => {
    const allTokenIds = tokens
      .filter(t => t.projectId === activeProjectId && t.pageId === activePageId)
      .map(t => t.id);
    setSelectedTokens(new Set(allTokenIds));
    // Set anchor/cursor so Shift+click range operations work after Select All
    const ordered = getOrderedVisibleTokenIds();
    if (ordered.length > 0) {
      selectionAnchorRef.current = ordered[0];
      selectionCursorRef.current = ordered[ordered.length - 1];
      setFocusedTokenId(ordered[ordered.length - 1]);
    }
  };

  const deselectAllTokens = () => {
    setSelectedTokens(new Set());
    selectionAnchorRef.current = null;
    selectionCursorRef.current = null;
    setFocusedTokenId(null);
  };

  // (bulkDeleteTokens replaced by handleBulkDeleteTokens which includes auto-assign checks)

  const bulkMoveToGroup = (groupId: string | null) => {
    const tokenIds = [...selectedTokens];
    moveTokensCrossGroup(tokenIds, groupId, getTokensForGroup(groupId).length);
    deselectAllTokens();
  };

  const createGroupAndMoveTokens = (tokenIds: string[]) => {
    // Generate a unique group name
    const pgGroups = groups.filter(g => g.projectId === activeProjectId && g.pageId === activePageId);
    let baseName = 'Group';
    let counter = 1;
    let newName = baseName;
    while (pgGroups.some(g => g.name.toLowerCase() === newName.toLowerCase())) {
      counter++;
      newName = `${baseName} ${counter}`;
    }
    // Compute the next sortOrder for the new group (append to end of regular groups)
    const existingRegular = groups.filter(g => g.projectId === activeProjectId && g.pageId === activePageId && !g.isColorPaletteGroup && !g.isPaletteEntry);
    const maxSortOrder = existingRegular.reduce((max, g) => Math.max(max, g.sortOrder ?? -1), -1);
    const newGroup: TokenGroup = {
      id: `group-${Date.now()}`,
      name: newName,
      projectId: activeProjectId,
      pageId: activePageId,
      isExpanded: true,
      sortOrder: maxSortOrder + 1,
      createdAt: Date.now()
    };
    onUpdateGroups([...groups, newGroup]);
    // Move tokens into the new group — moveTokensCrossGroup only reads tokens/onUpdateToken, not groups
    moveTokensCrossGroup(tokenIds, newGroup.id, 0);
  };

  // ─── Cross-group move helper ──────────────────────────────────────────
  // Moves tokens from any source group(s) into targetGroupId at targetIndex.
  // Handles same-group reorders, cross-group moves, and multi-source bulk moves.
  const moveTokensCrossGroup = (tokenIdsToMove: string[], targetGroupId: string | null, targetIndex: number) => {
    // Guard: prevent token-node-group tokens from being moved to a different group
    // (reordering within the same group is still allowed)
    const filteredIds = tokenIdsToMove.filter(id => {
      const t = tokens.find(tk => tk.id === id);
      if (!t || t.groupId === targetGroupId) return true; // same group or not found — allow
      const srcGroup = t.groupId ? groups.find(g => g.id === t.groupId) : null;
      if (srcGroup?.isTokenNodeGroup) return false; // block cross-group move
      return true;
    });
    if (filteredIds.length === 0) return;
    tokenIdsToMove = filteredIds;

    // Also prevent moving normal tokens INTO a token node group
    const tgtGroup = targetGroupId ? groups.find(g => g.id === targetGroupId) : null;
    if (tgtGroup?.isTokenNodeGroup) {
      const allFromTarget = tokenIdsToMove.every(id => {
        const t = tokens.find(tk => tk.id === id);
        return t?.groupId === targetGroupId;
      });
      if (!allFromTarget) return;
    }

    // Auto-expand the target group so moved tokens are visible
    ensureGroupExpanded(targetGroupId);

    const moveSet = new Set(tokenIdsToMove);

    // Collect all unique source groups
    const sourceGroups = new Set<string | null>();
    tokenIdsToMove.forEach(id => {
      const t = tokens.find(tk => tk.id === id);
      if (t) sourceGroups.add(t.groupId);
    });

    // Get target group tokens (excluding the ones being moved)
    const targetTokens = ensureSortOrders(targetGroupId).filter(t => !moveSet.has(t.id));

    // Get moved tokens sorted by their current sort order
    const movedTokens = tokenIdsToMove
      .map(id => tokens.find(t => t.id === id))
      .filter(Boolean) as DesignToken[];
    movedTokens.sort(tokenSortComparator);

    // Compute adjusted target index (account for moved tokens that were
    // before the index in the same group, since the DOM still shows them)
    let adjustedIndex = targetIndex;
    if (sourceGroups.has(targetGroupId)) {
      const currentGroupTokens = ensureSortOrders(targetGroupId);
      let removeCountBefore = 0;
      for (let i = 0; i < targetIndex && i < currentGroupTokens.length; i++) {
        if (moveSet.has(currentGroupTokens[i].id)) removeCountBefore++;
      }
      adjustedIndex = targetIndex - removeCountBefore;
    }

    // Insert moved tokens at adjusted index
    const clamped = Math.max(0, Math.min(adjustedIndex, targetTokens.length));
    targetTokens.splice(clamped, 0, ...movedTokens);

    // Update all tokens in target group (groupId + sortOrder)
    targetTokens.forEach((t, i) => {
      const updates: Partial<DesignToken> = {};
      if (t.groupId !== targetGroupId) updates.groupId = targetGroupId;
      if (t.sortOrder !== i) updates.sortOrder = i;
      if (Object.keys(updates).length > 0) onUpdateToken(t.id, updates);
    });

    // Re-normalize source groups (excluding target – already handled above)
    sourceGroups.forEach(srcGroupId => {
      if (srcGroupId === targetGroupId) return;
      const remaining = ensureSortOrders(srcGroupId).filter(t => !moveSet.has(t.id));
      remaining.forEach((t, i) => {
        if (t.sortOrder !== i) onUpdateToken(t.id, { sortOrder: i });
      });
    });
  };

  // ─── Reorder helpers ──────────────────────────────────────────────────
  const ensureSortOrders = (groupId: string | null): DesignToken[] => {
    const groupTokens = getTokensForGroup(groupId);
    const needsInit = groupTokens.some(t => t.sortOrder === undefined);
    if (needsInit) {
      groupTokens.forEach((t, i) => onUpdateToken(t.id, { sortOrder: i }));
      return groupTokens.map((t, i) => ({ ...t, sortOrder: i }));
    }
    return groupTokens;
  };

  const reorderTokensToIndex = (tokenIdsToMove: string[], targetGroupId: string | null, targetIndex: number) => {
    const groupTokens = ensureSortOrders(targetGroupId);
    const moveSet = new Set(tokenIdsToMove);
    const movedTokens = groupTokens.filter(t => moveSet.has(t.id));
    const remaining = groupTokens.filter(t => !moveSet.has(t.id));
    const clampedTarget = Math.max(0, Math.min(targetIndex, remaining.length));
    remaining.splice(clampedTarget, 0, ...movedTokens);
    remaining.forEach((t, i) => {
      if (t.sortOrder !== i) onUpdateToken(t.id, { sortOrder: i });
    });
  };

  const moveSelectedTokens = (direction: 'up' | 'down') => {
    if (selectedTokens.size === 0) return;
    const byGroup = new Map<string | null, string[]>();
    selectedTokens.forEach(tid => {
      const token = tokens.find(t => t.id === tid);
      if (!token) return;
      const gid = token.groupId;
      if (!byGroup.has(gid)) byGroup.set(gid, []);
      byGroup.get(gid)!.push(tid);
    });
    byGroup.forEach((tids, gid) => {
      const groupTokens = ensureSortOrders(gid);
      const selSet = new Set(tids);
      const indices = groupTokens.map((t, i) => selSet.has(t.id) ? i : -1).filter(i => i !== -1);
      if (indices.length === 0) return;
      if (direction === 'up' && indices[0] === 0) return;
      if (direction === 'down' && indices[indices.length - 1] === groupTokens.length - 1) return;
      const newOrder = [...groupTokens];
      if (direction === 'up') {
        for (const idx of indices) {
          if (idx > 0 && !selSet.has(newOrder[idx - 1].id)) {
            [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
          }
        }
      } else {
        for (let i = indices.length - 1; i >= 0; i--) {
          const idx = indices[i];
          if (idx < newOrder.length - 1 && !selSet.has(newOrder[idx + 1].id)) {
            [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
          }
        }
      }
      newOrder.forEach((t, i) => {
        if (t.sortOrder !== i) onUpdateToken(t.id, { sortOrder: i });
      });
    });
  };

  const moveSingleToken = (tokenId: string, direction: 'up' | 'down') => {
    const token = tokens.find(t => t.id === tokenId);
    if (!token) return;
    const groupTokens = ensureSortOrders(token.groupId);
    const idx = groupTokens.findIndex(t => t.id === tokenId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === groupTokens.length - 1) return;
    const newOrder = [...groupTokens];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    newOrder.forEach((t, i) => {
      if (t.sortOrder !== i) onUpdateToken(t.id, { sortOrder: i });
    });
  };

  // ─── Group reorder helpers ────────���─────────────────────────────────────
  const ensureGroupSortOrders = (groupList: TokenGroup[]): TokenGroup[] => {
    const needsInit = groupList.some(g => g.sortOrder === undefined);
    if (!needsInit) return [...groupList].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    // Sort by createdAt descending (newest first, matching legacy behavior) then assign sortOrder
    const sorted = [...groupList].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const withOrders = sorted.map((g, i) => ({ ...g, sortOrder: i }));
    // Persist the computed sort orders
    onUpdateGroups(groups.map(g => {
      const updated = withOrders.find(u => u.id === g.id);
      return updated ? { ...g, sortOrder: updated.sortOrder } : g;
    }));
    return withOrders;
  };

  const moveGroupInDirection = (groupId: string, direction: 'up' | 'down') => {
    // Determine if this is a regular group or palette entry
    const targetGroup = groups.find(g => g.id === groupId);
    if (!targetGroup) return;
    const isPalEntry = targetGroup.isPaletteEntry === true;
    const relevantGroups = isPalEntry ? paletteEntries : regularGroups;
    const sorted = ensureGroupSortOrders(relevantGroups);
    const idx = sorted.findIndex(g => g.id === groupId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    // Swap
    const reordered = [...sorted];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    // Reassign sort orders
    const updatedMap = new Map(reordered.map((g, i) => [g.id, i]));
    onUpdateGroups(groups.map(g => updatedMap.has(g.id) ? { ...g, sortOrder: updatedMap.get(g.id)! } : g));
  };

  // ─── Group drag-to-reorder state ────────────────────────────────────────
  const [groupDropIndicator, setGroupDropIndicator] = useState<{ index: number; type: 'regular' | 'palette' } | null>(null);
  const groupDragRef = useRef<{
    groupId: string;
    type: 'regular' | 'palette';
    startY: number;
    active: boolean;
  } | null>(null);

  const handleGroupGripMouseDown = (e: React.MouseEvent, groupId: string, type: 'regular' | 'palette') => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();
    groupDragRef.current = { groupId, type, startY: e.clientY, active: false };
  };

  const reorderGroupToIndex = (groupId: string, targetIndex: number, type: 'regular' | 'palette') => {
    const relevantGroups = type === 'regular' ? regularGroups : paletteEntries;
    const sorted = ensureGroupSortOrders(relevantGroups);
    const currentIdx = sorted.findIndex(g => g.id === groupId);
    if (currentIdx === -1) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(currentIdx, 1);
    const adjustedTarget = targetIndex > currentIdx ? targetIndex - 1 : targetIndex;
    const clampedTarget = Math.max(0, Math.min(adjustedTarget, reordered.length));
    reordered.splice(clampedTarget, 0, moved);
    const updatedMap = new Map(reordered.map((g, i) => [g.id, i]));
    onUpdateGroups(groups.map(g => updatedMap.has(g.id) ? { ...g, sortOrder: updatedMap.get(g.id)! } : g));
  };

  const handleGripMouseDown = (e: React.MouseEvent, tokenId: string, groupId: string | null) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const tids = selectedTokens.has(tokenId) && selectedTokens.size > 0
      ? [...selectedTokens]
      : [tokenId];
    reorderDragRef.current = { tokenIds: tids, groupId, startY: e.clientY, active: false };
  };

  const getTokensForGroupRef = useRef<(groupId: string | null) => DesignToken[]>(null!);
  const reorderTokensToIndexRef = useRef<(tokenIdsToMove: string[], targetGroupId: string | null, targetIndex: number) => void>(null!);
  const moveSelectedTokensRef = useRef<(direction: 'up' | 'down') => void>(null!);
  const moveTokensCrossGroupRef = useRef<(tokenIds: string[], targetGroupId: string | null, targetIndex: number) => void>(null!);
  const reorderGroupToIndexRef = useRef<(groupId: string, targetIndex: number, type: 'regular' | 'palette') => void>(null!);
  const groupDropIndicatorRef = useRef<{ index: number; type: 'regular' | 'palette' } | null>(null);

  useEffect(() => {
    const handleReorderMove = (e: MouseEvent) => {
      if (!reorderDragRef.current) return;
      if (!reorderDragRef.current.active) {
        if (Math.abs(e.clientY - reorderDragRef.current.startY) < 5) return;
        reorderDragRef.current.active = true;
        document.body.style.cursor = 'grabbing';
      }

      // Scan all group drop-zones to find the target group and insertion index.
      // Each zone has a `data-group-zone` attribute ("__null__" for ungrouped).
      const scrollEl = scrollAreaRef.current;
      if (!scrollEl) return;

      const zones = Array.from(scrollEl.querySelectorAll('[data-group-zone]'));
      if (zones.length === 0) return;

      let targetGroupId: string | null = reorderDragRef.current.groupId;
      let dropIndex = 0;
      let found = false;

      for (const zone of zones) {
        const rect = zone.getBoundingClientRect();
        const gzId = zone.getAttribute('data-group-zone')!;
        const resolvedGroupId = gzId === '__null__' ? null : gzId;

        // If cursor Y is above or within this zone, this is our target
        if (e.clientY <= rect.bottom + 4) {
          targetGroupId = resolvedGroupId;
          const tokenEls = Array.from(zone.querySelectorAll('[data-token-id]'));
          dropIndex = tokenEls.length; // default: append
          for (let i = 0; i < tokenEls.length; i++) {
            const tokenRect = tokenEls[i].getBoundingClientRect();
            if (e.clientY < tokenRect.top + tokenRect.height / 2) {
              dropIndex = i;
              break;
            }
          }
          found = true;
          break;
        }
      }

      // Cursor below all zones → target the last zone's end
      if (!found && zones.length > 0) {
        const lastZone = zones[zones.length - 1];
        const gzId = lastZone.getAttribute('data-group-zone')!;
        targetGroupId = gzId === '__null__' ? null : gzId;
        const tokenEls = Array.from(lastZone.querySelectorAll('[data-token-id]'));
        dropIndex = tokenEls.length;
      }

      reorderDropIndicatorRef.current = { groupId: targetGroupId, index: dropIndex };
      setReorderDropIndicator({ groupId: targetGroupId, index: dropIndex, dragTokenIds: reorderDragRef.current!.tokenIds });
    };

    const handleReorderUp = () => {
      if (!reorderDragRef.current) return;
      if (reorderDragRef.current.active && reorderDropIndicatorRef.current) {
        const { tokenIds } = reorderDragRef.current;
        const { groupId: targetGroupId, index } = reorderDropIndicatorRef.current;
        moveTokensCrossGroupRef.current(tokenIds, targetGroupId, index);
      }
      reorderDragRef.current = null;
      reorderDropIndicatorRef.current = null;
      setReorderDropIndicator(null);
      document.body.style.cursor = '';
    };

    // ─── Group drag-to-reorder handlers ─────────────────────────────────
    const handleGroupReorderMove = (e: MouseEvent) => {
      if (!groupDragRef.current) return;
      if (!groupDragRef.current.active) {
        if (Math.abs(e.clientY - groupDragRef.current.startY) < 5) return;
        groupDragRef.current.active = true;
        document.body.style.cursor = 'grabbing';
      }
      const scrollEl = scrollAreaRef.current;
      if (!scrollEl) return;
      const type = groupDragRef.current.type;
      const headerEls = Array.from(scrollEl.querySelectorAll(`[data-group-header-type="${type}"]`));
      if (headerEls.length === 0) return;
      let dropIndex = headerEls.length; // default: append after last
      for (let i = 0; i < headerEls.length; i++) {
        const rect = headerEls[i].getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          dropIndex = i;
          break;
        }
      }
      groupDropIndicatorRef.current = { index: dropIndex, type };
      setGroupDropIndicator({ index: dropIndex, type });
    };

    const handleGroupReorderUp = () => {
      if (!groupDragRef.current) return;
      if (groupDragRef.current.active && groupDropIndicatorRef.current) {
        const { groupId } = groupDragRef.current;
        const { index, type } = groupDropIndicatorRef.current;
        reorderGroupToIndexRef.current(groupId, index, type);
      }
      groupDragRef.current = null;
      groupDropIndicatorRef.current = null;
      setGroupDropIndicator(null);
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleReorderMove);
    document.addEventListener('mouseup', handleReorderUp);
    document.addEventListener('mousemove', handleGroupReorderMove);
    document.addEventListener('mouseup', handleGroupReorderUp);
    return () => {
      document.removeEventListener('mousemove', handleReorderMove);
      document.removeEventListener('mouseup', handleReorderUp);
      document.removeEventListener('mousemove', handleGroupReorderMove);
      document.removeEventListener('mouseup', handleGroupReorderUp);
    };
  }, []);

  // Drag-to-select handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't start drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('input') ||
      target.closest('button') ||
      target.closest('[role="checkbox"]') ||
      target.closest('[data-radix-collection-item]') ||
      target.closest('[data-dropdown]') ||
      target.closest('[data-drag-handle]')
    ) {
      return;
    }

    // Prevent native text selection from starting during drag gestures
    e.preventDefault();

    const clickedOnToken = target.closest('[data-token-item]');
    clickedEmptyRef.current = !clickedOnToken;

    if (!scrollAreaRef.current) return;

    const rect = scrollAreaRef.current.getBoundingClientRect();
    const scrollTop = scrollAreaRef.current.scrollTop || 0;

    dragPendingRef.current = true;
    wasDraggingRef.current = false;
    dragStartClientRef.current = { x: e.clientX, y: e.clientY };
    // Capture current selection so Shift+drag can union with it
    preDragSelectionRef.current = new Set(selectedTokens);

    const startPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top + scrollTop
    };
    dragStartRef.current = startPos;
    setDragStart(startPos);
    setDragEnd(startPos);
  };

  const handleMouseUp = () => {
    const wasDrag = wasDraggingRef.current;

    dragPendingRef.current = false;
    isDraggingSelectRef.current = false;
    dragStartRef.current = null;
    setIsDraggingSelect(false);
    setDragStart(null);
    setDragEnd(null);

    // If clicked on empty space without dragging, clear selection
    if (!wasDrag && clickedEmptyRef.current) {
      deselectAllTokens();
    }

    // Keep wasDraggingRef true briefly so token onClick can skip
    if (wasDrag) {
      setTimeout(() => { wasDraggingRef.current = false; }, 0);
    }
  };

  const selectTokensInDragArea = (currentStart?: { x: number; y: number }, currentEnd?: { x: number; y: number }, shiftKey = false) => {
    const start = currentStart || dragStart;
    const end = currentEnd || dragEnd;
    if (!start || !end || !scrollAreaRef.current) return;

    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    const scrollTop = scrollAreaRef.current.scrollTop || 0;
    const containerRect = scrollAreaRef.current.getBoundingClientRect();

    // When Shift is held, start from the pre-drag selection so previously
    // selected tokens stay selected while the drag rectangle adds more.
    const newSelectedTokens = shiftKey
      ? new Set<string>(preDragSelectionRef.current)
      : new Set<string>();

    tokenRefs.current.forEach((element, tokenId) => {
      const tokenRect = element.getBoundingClientRect();
      const relativeTop = tokenRect.top - containerRect.top + scrollTop;
      const relativeBottom = tokenRect.bottom - containerRect.top + scrollTop;
      const relativeLeft = tokenRect.left - containerRect.left;
      const relativeRight = tokenRect.right - containerRect.left;

      // Check if token intersects with drag rectangle
      const intersects = !(
        relativeRight < minX ||
        relativeLeft > maxX ||
        relativeBottom < minY ||
        relativeTop > maxY
      );

      if (intersects) {
        newSelectedTokens.add(tokenId);
      }
    });

    setSelectedTokens(newSelectedTokens);

    // Update anchor/cursor to the first and last selected tokens in DOM order
    // so Shift+Arrow works seamlessly after a drag selection
    if (newSelectedTokens.size > 0) {
      const ordered = getOrderedVisibleTokenIds();
      const selectedInOrder = ordered.filter(id => newSelectedTokens.has(id));
      if (selectedInOrder.length > 0) {
        selectionAnchorRef.current = selectedInOrder[0];
        selectionCursorRef.current = selectedInOrder[selectedInOrder.length - 1];
        setFocusedTokenId(selectedInOrder[selectedInOrder.length - 1]);
      }
    }
  };

  // Keep refs pointing to the latest versions of callbacks so the
  // mount-once global effect below never calls stale closures.
  const handleMouseUpRef = useRef(handleMouseUp);
  handleMouseUpRef.current = handleMouseUp;
  const selectTokensInDragAreaRef = useRef(selectTokensInDragArea);
  selectTokensInDragAreaRef.current = selectTokensInDragArea;

  // Global mouse listeners for drag-to-select so it works even when the
  // cursor moves outside the scroll area (e.g. dragging bottom-to-top past
  // the visible area).
  //
  // IMPORTANT: These listeners use REFS (not state) for all guard checks so
  // they always see the latest values.  This avoids stale-closure gaps that
  // occur between a React state update and the subsequent effect re-run,
  // which previously caused bottom-to-top drags (and fast drags in general)
  // to silently drop events and never select tokens.
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Guard: only process while a drag gesture is in progress (ref-based)
      if (!isDraggingSelectRef.current && !dragPendingRef.current) return;
      if (!scrollAreaRef.current || !dragStartRef.current) return;

      const rect = scrollAreaRef.current.getBoundingClientRect();
      const scrollTop = scrollAreaRef.current.scrollTop || 0;

      const newEnd = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top + scrollTop,
      };

      // Check movement threshold before activating drag mode
      if (dragPendingRef.current && !isDraggingSelectRef.current) {
        const dx = e.clientX - dragStartClientRef.current.x;
        const dy = e.clientY - dragStartClientRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) return;

        dragPendingRef.current = false;
        wasDraggingRef.current = true;
        isDraggingSelectRef.current = true;
        setIsDraggingSelect(true);

        // Clear any residual native text selection
        window.getSelection()?.removeAllRanges();
      }

      setDragEnd(newEnd);
      selectTokensInDragAreaRef.current(dragStartRef.current, newEnd, e.shiftKey);
    };

    const handleGlobalMouseUp = () => {
      if (isDraggingSelectRef.current || dragPendingRef.current) {
        handleMouseUpRef.current();
      }
    };

    // Suppress native text selection during any drag gesture (pending or active)
    const handleSelectStart = (e: Event) => {
      if (isDraggingSelectRef.current || dragPendingRef.current) {
        e.preventDefault();
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('selectstart', handleSelectStart);
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('selectstart', handleSelectStart);
    };
    // Stable effect — all guards use refs, so no state dependencies needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts: Escape to clear selection, Shift+Arrow to extend selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when editing text
      if (editingId || isEditingProjectName) return;
      // Only respond when the panel (or nothing specific) is focused
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

      if (e.key === 'Escape' && selectedTokens.size > 0) {
        e.preventDefault();
        deselectAllTokens();
        return;
      }

      // Ctrl/Cmd+A → select all tokens in the active project
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        selectAllTokens();
        return;
      }

      // Alt+ArrowUp/Down → reorder selected tokens (primary theme only)
      if (!isReadOnly && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (selectedTokens.size > 0) {
          moveSelectedTokensRef.current(e.key === 'ArrowUp' ? 'up' : 'down');
        }
        return;
      }

      if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const ordered = getOrderedVisibleTokenIds();
        if (ordered.length === 0) return;

        // If nothing selected yet, select the first or last token
        if (selectedTokens.size === 0) {
          const id = e.key === 'ArrowDown' ? ordered[0] : ordered[ordered.length - 1];
          setSelectedTokens(new Set([id]));
          selectionAnchorRef.current = id;
          selectionCursorRef.current = id;
          setFocusedTokenId(id);
          tokenRefs.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return;
        }

        // Determine the current cursor position
        const cursor = selectionCursorRef.current;
        const cursorIdx = cursor ? ordered.indexOf(cursor) : -1;
        if (cursorIdx === -1) return;

        // Move cursor
        const nextIdx = e.key === 'ArrowDown' ? cursorIdx + 1 : cursorIdx - 1;
        if (nextIdx < 0 || nextIdx >= ordered.length) return;

        const nextId = ordered[nextIdx];
        selectionCursorRef.current = nextId;
        setFocusedTokenId(nextId);

        // Select contiguous range from anchor → new cursor
        const anchor = selectionAnchorRef.current || ensureAnchor(nextId);
        const rangeIds = getRangeIds(anchor, nextId);
        setSelectedTokens(new Set(rangeIds));

        // Scroll the newly focused token into view
        tokenRefs.current.get(nextId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedTokens, editingId, isEditingProjectName, isReadOnly]);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activePage = pages.find(p => p.id === activePageId);

  // Get tokens for the active project
  // Sort comparator: explicit sortOrder (ascending) takes priority; fall back to createdAt (descending)
  const tokenSortComparator = (a: DesignToken, b: DesignToken) => {
    if (a.sortOrder !== undefined && b.sortOrder !== undefined) return a.sortOrder - b.sortOrder;
    if (a.sortOrder !== undefined) return -1;
    if (b.sortOrder !== undefined) return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  };

  const getTokensForGroup = (groupId: string | null) => {
    if (groupId === null) {
      return tokens.filter(t => t.groupId === null && t.projectId === activeProjectId && t.pageId === activePageId).sort(tokenSortComparator);
    }
    return tokens.filter(t => t.groupId === groupId).sort(tokenSortComparator);
  };

  // Keep refs in sync for use inside global event listeners
  getTokensForGroupRef.current = getTokensForGroup;
  reorderTokensToIndexRef.current = reorderTokensToIndex;
  moveSelectedTokensRef.current = moveSelectedTokens;
  moveTokensCrossGroupRef.current = moveTokensCrossGroup;
  // reorderGroupToIndexRef is kept in sync after regularGroups/paletteEntries are computed (below)

  // Separate palette entries from regular groups - filter by both project and page
  const allProjectGroups = groups.filter(g => g.projectId === activeProjectId && g.pageId === activePageId);
  const paletteEntries = allProjectGroups.filter(g => g.isPaletteEntry === true);
  const regularGroups = allProjectGroups.filter(g => !g.isColorPaletteGroup && !g.isPaletteEntry);
  const ungroupedTokens = getTokensForGroup(null);

  // ─── Token node group helpers ─────────────────────────────────────
  // Derive set of token node group IDs (groups created by token prefix nodes)
  const tokenNodeGroupIds = (() => {
    const ids = new Set<string>();
    allProjectGroups.forEach(g => {
      if (g.isTokenNodeGroup) ids.add(g.id);
    });
    // Fallback: check nodes for backwards compatibility with groups created before the flag existed
    nodes.forEach(n => {
      if (n.isTokenPrefix && n.tokenGroupId && !ids.has(n.tokenGroupId)) {
        ids.add(n.tokenGroupId);
      }
    });
    return ids;
  })();

  const isTokenNodeGroupToken = (token: DesignToken): boolean => {
    return token.groupId !== null && tokenNodeGroupIds.has(token.groupId);
  };

  // Set of ownTokenIds that have active advanced logic (token assignment with enabled rows)
  const tokensWithActiveLogic = (() => {
    const ids = new Set<string>();
    if (!advancedLogic) return ids;
    for (const logic of advancedLogic) {
      if (!logic.tokenAssignment) continue;
      const ta = logic.tokenAssignment;
      if (!ta.rows || ta.rows.length === 0) continue;
      const hasActiveRows = ta.rows.some((r: any) => r.enabled && r.tokens && r.tokens.length > 0);
      if (!hasActiveRows) continue;
      // Find the owning node's ownTokenId
      const allN = allProjectNodes.length > 0 ? allProjectNodes : nodes;
      const ownerNode = allN.find(n => n.id === logic.nodeId);
      if (ownerNode?.isTokenNode && !ownerNode.isTokenPrefix && ownerNode.ownTokenId) {
        ids.add(ownerNode.ownTokenId);
      }
    }
    return ids;
  })();

  // Check if the current selection contains a mix of token-node-group tokens and normal tokens
  const selectionHasMixedTokenNodeTypes = (() => {
    if (selectedTokens.size === 0) return false;
    let hasTokenNodeToken = false;
    let hasNormalToken = false;
    selectedTokens.forEach(tokenId => {
      const t = tokens.find(tk => tk.id === tokenId);
      if (t && isTokenNodeGroupToken(t)) {
        hasTokenNodeToken = true;
      } else {
        hasNormalToken = true;
      }
    });
    return hasTokenNodeToken && hasNormalToken;
  })();

  // Check if ALL selected tokens are from token node groups
  const selectionAllTokenNodeTokens = (() => {
    if (selectedTokens.size === 0) return false;
    let allTokenNode = true;
    selectedTokens.forEach(tokenId => {
      const t = tokens.find(tk => tk.id === tokenId);
      if (!t || !isTokenNodeGroupToken(t)) {
        allTokenNode = false;
      }
    });
    return allTokenNode;
  })();

  // Helper: find the token node (on canvas) that owns a given token via ownTokenId
  const findTokenNodeForToken = (tokenId: string): ColorNode | undefined => {
    return nodes.find(n => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === tokenId);
  };

  // Keep group reorder ref in sync now that regularGroups/paletteEntries are available
  reorderGroupToIndexRef.current = reorderGroupToIndex;

  // Persist viewFilter to localStorage
  useEffect(() => {
    localStorage.setItem('tokensPanelViewFilter', viewFilter);
  }, [viewFilter]);

  // Auto-switch to palettes tab when a new palette entry is created
  useEffect(() => {
    const count = paletteEntries.length;
    if (prevPaletteCountRef.current >= 0 && count > prevPaletteCountRef.current) {
      setViewFilter('palettes');
    }
    prevPaletteCountRef.current = count;
  }, [paletteEntries.length]);

  // Create unified items list with type information
  type UnifiedItem =
    | { type: 'group'; data: TokenGroup; createdAt: number }
    | { type: 'paletteEntry'; data: TokenGroup; createdAt: number };

  // ─── Smart Search + Filter Engine ────────────────────────────
  const isSearchOrFilterActive = searchQuery.trim() !== '' || hasActiveFilters(searchFilters);

  // Build the set of matching token IDs from smart search (computed once per render when active)
  const allPageTokens = tokens.filter(t => t.projectId === activeProjectId && t.pageId === activePageId);

  // Build palette display name map so smart search can match palette names
  // (palette entries may have a display name from paletteNode.paletteName that differs from group.name)
  const paletteDisplayNames = (() => {
    const map = new Map<string, string>();
    paletteEntries.forEach(p => {
      const paletteNode = nodes.find(n => n.id === p.paletteNodeId);
      if (paletteNode?.paletteName) {
        map.set(p.id, paletteNode.paletteName);
      }
    });
    return map;
  })();

  const smartSearchMatchSet = (() => {
    if (!searchQuery.trim()) return null; // null = no text search active, show all
    return new Set(
      smartSearchTokens(searchQuery, allPageTokens, groups, getTokenThemeValues, paletteDisplayNames).map(r => r.tokenId)
    );
  })();

  // Build filter context
  const filterCtx = {
    nodes,
    groups,
    activeThemeId: activeThemeId || '',
    primaryThemeId: primaryThemeId || '',
    getNodesUsingToken,
    getTokenThemeValues,
    isTokenNodeGroupToken,
    isTokenModified: isTokenValueChanged,
  };

  // Combined filter: text search + attribute filters
  const tokenPassesSearch = (token: DesignToken): boolean => {
    // Text search check
    if (smartSearchMatchSet !== null && !smartSearchMatchSet.has(token.id)) return false;
    // Attribute filter check
    if (hasActiveFilters(searchFilters)) {
      if (!applyTokenFilters(token, searchFilters, filterCtx)) return false;
    }
    return true;
  };

  const filteredUngroupedTokens = isSearchOrFilterActive
    ? ungroupedTokens.filter(tokenPassesSearch)
    : ungroupedTokens;

  const filteredRegularGroups = isSearchOrFilterActive
    ? regularGroups.filter(g => {
      // Include group if any of its tokens pass the search+filter
      const groupTokens = getTokensForGroup(g.id);
      if (groupTokens.some(tokenPassesSearch)) return true;
      // Also include if group name matches text search (even with attribute filters active)
      if (searchQuery.trim() && g.name.toLowerCase().includes(searchQuery.toLowerCase().trim())) return true;
      return false;
    })
    : regularGroups;

  const filteredPaletteEntries = isSearchOrFilterActive
    ? paletteEntries.filter(p => {
      const groupTokens = getTokensForGroup(p.id);
      if (groupTokens.some(tokenPassesSearch)) return true;
      // Also include if palette/group name matches text search (even with attribute filters active)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (p.name.toLowerCase().includes(q)) return true;
        const paletteNode = nodes.find(n => n.id === p.paletteNodeId);
        if (paletteNode?.paletteName?.toLowerCase().includes(q)) return true;
      }
      return false;
    })
    : paletteEntries;

  const allUnifiedItems: UnifiedItem[] = [
    ...filteredRegularGroups.map(g => ({ type: 'group' as const, data: g, createdAt: g.createdAt || 0 })),
    ...filteredPaletteEntries.map(p => ({ type: 'paletteEntry' as const, data: p, createdAt: p.createdAt || 0 })),
  ].sort((a, b) => {
    // Sort by sortOrder ascending when available, fallback to createdAt descending (newest first)
    const aSort = a.data.sortOrder;
    const bSort = b.data.sortOrder;
    if (aSort !== undefined && bSort !== undefined) return aSort - bSort;
    if (aSort !== undefined) return -1;
    if (bSort !== undefined) return 1;
    return b.createdAt - a.createdAt;
  });

  // Filter unified items based on active view tab
  // When search/filter is active, show ALL items (combined tokens + palettes)
  const unifiedItems = isSearchOrFilterActive
    ? allUnifiedItems
    : viewFilter === 'palettes'
      ? allUnifiedItems.filter(item => item.type === 'paletteEntry')
      : allUnifiedItems.filter(item => item.type !== 'paletteEntry');

  // Keep projectGroups for dropdown menus and other uses
  const projectGroups = [
    ...regularGroups,
    ...paletteEntries
  ];

  // Drop indicator line shown during drag-to-reorder
  const renderDropIndicator = () => (
    <div className="tokens-panel-drop-indicator" />
  );
  // Drop indicator line for group-level reordering
  const renderGroupDropIndicator = () => (
    <div className="tokens-panel-group-drop-indicator" />
  );
  const shouldShowGroupDropBefore = (index: number, type: 'regular' | 'palette') =>
    groupDropIndicator !== null && groupDropIndicator.type === type && groupDropIndicator.index === index;
  const shouldShowDropBefore = (groupId: string | null, tokenIndex: number) =>
    reorderDropIndicator !== null && reorderDropIndicator.groupId === groupId && reorderDropIndicator.index === tokenIndex;
  const shouldShowDropAfterLast = (groupId: string | null, groupLength: number) =>
    reorderDropIndicator !== null && reorderDropIndicator.groupId === groupId && reorderDropIndicator.index >= groupLength;

  const renderToken = (token: DesignToken) => {
    // Get theme-specific values
    const themeValues = getTokenThemeValues(token);
    // Detect "empty" token — no color values assigned yet
    const isEmptyToken = themeValues.hue === undefined && themeValues.saturation === undefined && themeValues.lightness === undefined;
    const hue = themeValues.hue ?? 0;
    const saturation = themeValues.saturation ?? 0;
    const lightness = themeValues.lightness ?? 0;
    const alpha = themeValues.alpha ?? 100;

    const alphaDecimal = alpha / 100;
    const hslValue = isEmptyToken ? 'transparent' : `hsla(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%, ${alphaDecimal})`;

    const nodesUsingToken = getNodesUsingToken(token.id);
    const isSelected = selectedTokens.has(token.id);

    // Get the node type/color space for display
    const nodeType = nodesUsingToken.length > 0 ? (() => {
      const assignedNode = nodesUsingToken[0];
      if (assignedNode.isSpacing || assignedNode.type === 'spacing') {
        return 'spacing';
      }
      if (assignedNode.isPalette) {
        return 'palette';
      }
      // For palette shade nodes, derive color space from parent palette's paletteColorFormat
      if (assignedNode.parentId) {
        const parentPalette = nodes.find(n => n.id === assignedNode.parentId);
        if (parentPalette?.isPalette && parentPalette.paletteColorFormat) {
          const fmt = parentPalette.paletteColorFormat;
          return fmt === 'OKLCH' ? 'OKLCH' : fmt === 'RGBA' ? 'RGBA' : 'HSL';
        }
      }
      return assignedNode.colorSpace?.toUpperCase() || 'HSL';
    })() : null;

    const inherited = isTokenInherited(token.id);
    const nodeInheritanceState = getTokenNodeInheritanceState(token.id);

    // ─── Token visibility state ───
    const tokenHasAssignedNodes = nodesUsingToken.length > 0;
    const tokenForcedHidden = tokenHasAssignedNodes && isTokenForcedHiddenByNodes(token, nodes, activeThemeId || '', primaryThemeId || '');
    const tokenExplicitlyHidden = isTokenExplicitlyHidden(token, activeThemeId || '', primaryThemeId || '');
    const tokenIsHidden = tokenForcedHidden || tokenExplicitlyHidden;

    // ─── Token node group detection ───
    const isTokenNodeToken = isTokenNodeGroupToken(token);
    // For token node tokens, check if the owning canvas node is hidden
    const tokenNodeOnCanvas = isTokenNodeToken ? findTokenNodeForToken(token.id) : undefined;
    const tokenNodeHiddenOnCanvas = isTokenNodeToken && tokenNodeOnCanvas
      ? isNodeHiddenInTheme(tokenNodeOnCanvas, activeThemeId || '', primaryThemeId || '', nodes)
      : false;

    // ─── Value token type detection for TOKEN badge + tooltip ───
    // Resolves the value token reference for token node group tokens.
    // Carries badge display info AND full color details for the tooltip.
    const valueTokenInfo = (() => {
      if (!isTokenNodeToken || !tokenNodeOnCanvas) return null;
      // Resolve theme-aware valueTokenId
      const resolvedValueTokenId = (() => {
        if (activeThemeId && tokenNodeOnCanvas.valueTokenAssignments?.[activeThemeId] !== undefined) {
          return tokenNodeOnCanvas.valueTokenAssignments[activeThemeId] || undefined;
        }
        if (primaryThemeId && tokenNodeOnCanvas.valueTokenAssignments?.[primaryThemeId] !== undefined) {
          return tokenNodeOnCanvas.valueTokenAssignments[primaryThemeId] || undefined;
        }
        return tokenNodeOnCanvas.valueTokenId;
      })();
      if (!resolvedValueTokenId) return null;

      // Use allProjectTokens to resolve cross-page value token references
      const crossPageTokens = allProjectTokens.length > 0 ? allProjectTokens : tokens;
      const crossPageNodes = allProjectNodes.length > 0 ? allProjectNodes : nodes;
      const valueToken = crossPageTokens.find(t => t.id === resolvedValueTokenId);
      if (!valueToken) return null;

      // Check if the value token is itself owned by another token node (cross-page aware)
      const isValueTokenOwnedByTokenNode = crossPageNodes.some(
        n => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === valueToken.id
      );

      // Get the value token's theme-specific color values
      const vtThemeValues = getTokenThemeValues(valueToken);
      const vtIsEmpty = vtThemeValues.hue === undefined && vtThemeValues.saturation === undefined && vtThemeValues.lightness === undefined;
      const vtH = vtThemeValues.hue ?? 0;
      const vtS = vtThemeValues.saturation ?? 0;
      const vtL = vtThemeValues.lightness ?? 0;
      const vtA = vtThemeValues.alpha ?? 100;
      const vtHsl = vtIsEmpty ? 'transparent' : `hsla(${Math.round(vtH)}, ${Math.round(vtS)}%, ${Math.round(vtL)}%, ${vtA / 100})`;

      // Get the color space of the node the value token is assigned to (cross-page aware)
      const vtAssignedNode = crossPageNodes.find(n => {
        const ta = n.tokenAssignments?.[activeThemeId || ''] || [];
        const la = n.tokenIds || [];
        return (ta.length > 0 ? ta : la).includes(valueToken.id);
      });
      let vtColorSpaceLabel = 'HSL';
      if (vtAssignedNode) {
        if (vtAssignedNode.parentId) {
          const pp = crossPageNodes.find(n => n.id === vtAssignedNode.parentId);
          if (pp?.isPalette && pp.paletteColorFormat) {
            vtColorSpaceLabel = pp.paletteColorFormat === 'OKLCH' ? 'OKLCH' : pp.paletteColorFormat === 'RGBA' ? 'RGBA' : 'HSL';
          } else {
            vtColorSpaceLabel = vtAssignedNode.colorSpace?.toUpperCase() || 'HSL';
          }
        } else {
          vtColorSpaceLabel = vtAssignedNode.colorSpace?.toUpperCase() || 'HSL';
        }
      }
      const vtColorInfo = formatColorInfo(vtColorSpaceLabel, vtH, vtS, vtL, vtA, vtAssignedNode, activeThemeId, isPrimaryTheme);

      if (isValueTokenOwnedByTokenNode) {
        return {
          type: 'token-node' as const,
          color: vtHsl,
          // Tooltip details for the value token reference
          tooltipRef: {
            name: valueToken.name,
            color: vtHsl,
            spaceName: vtColorInfo.spaceName,
            spaceValue: vtColorInfo.spaceValue,
            hex: vtColorInfo.hex,
            alpha: vtA,
            isChainRef: true,
          },
        };
      }

      return {
        type: 'color' as const,
        color: vtHsl,
        // Tooltip details for the value token reference
        tooltipRef: {
          name: valueToken.name,
          color: vtHsl,
          spaceName: vtColorInfo.spaceName,
          spaceValue: vtColorInfo.spaceValue,
          hex: vtColorInfo.hex,
          alpha: vtA,
          isChainRef: false,
        },
      };
    })();

    // Tooltip color info
    const tooltipCS = nodeType === 'spacing' ? 'HSL' : nodeType === 'palette' ? 'HSL' : nodeType || 'HSL';
    const tooltipNode = nodesUsingToken.length > 0 ? nodesUsingToken[0] : undefined;
    const colorInfo = formatColorInfo(tooltipCS, hue, saturation, lightness, alpha, tooltipNode, activeThemeId, isPrimaryTheme);

    return (
      <ContextMenu
        key={token.id}
        onOpenChange={(open) => setContextMenuOpenTokenId(open ? token.id : null)}
      >
        <ContextMenuTrigger asChild>
          <div
            data-token-item
            data-token-id={token.id}
            ref={(el) => {
              if (el) {
                tokenRefs.current.set(token.id, el);
              } else {
                tokenRefs.current.delete(token.id);
              }
            }}
            className={`tokens-panel-token-row ${isSelected ? 'tokens-panel-token-row-selected' : ''} ${reorderDropIndicator?.dragTokenIds.includes(token.id) ? 'tokens-panel-token-row-dragging' : ''
              } ${highlightedTokenId === token.id
                ? 'tokens-panel-token-row-highlighted'
                : isSelected
                  ? 'tokens-panel-token-row-selected'
                  : contextMenuOpenTokenId === token.id
                    ? 'tokens-panel-token-row-context'
                    : 'tokens-panel-token-row-idle'
              } ${inherited && !showAllVisible ? 'tokens-panel-token-row-inherited' : ''} ${tokenIsHidden ? 'tokens-panel-token-row-hidden' : ''} ${tokenNodeHiddenOnCanvas && !tokenIsHidden ? 'tokens-panel-token-row-hidden' : ''} ${focusedTokenId === token.id && isSelected ? 'tokens-panel-token-row-focused' : ''}`}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (
                target.closest('input') ||
                target.closest('button') ||
                target.closest('[role="checkbox"]') ||
                target.closest('[data-radix-collection-item]') ||
                target.closest('[data-drag-handle]')
              ) {
                return;
              }
              e.stopPropagation();
              if (wasDraggingRef.current) return;
              handleTokenClick(token.id, e);
            }}
            onDoubleClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('input') || target.closest('button') || target.closest('[role="checkbox"]') || target.closest('[data-drag-handle]')) return;
              e.stopPropagation();
              if (isPrimaryTheme && !isReadOnly && !isTokenNodeToken) startEditing(token.id, token.name, 'token');
            }}
          >
            {isSelected && <div className="tokens-panel-selection-bar" />}
            <Tooltip delayDuration={400} open={editingId === token.id ? false : undefined}>
              <TooltipTrigger asChild>
                <div className="tokens-panel-token-inner">
                  {isPrimaryTheme && (
                    <div
                      data-drag-handle
                      className="tokens-panel-drag-handle"
                      onMouseDown={(e) => handleGripMouseDown(e, token.id, token.groupId)}
                    >
                      <GripVertical className="tokens-panel-drag-handle-icon" />
                    </div>
                  )}
                  {!isPrimaryTheme && (
                    <div className="tokens-panel-crown-col">
                      {isTokenValueChanged(token.id) && (
                        <Crown className="tokens-panel-crown-icon" />
                      )}
                    </div>
                  )}
                  {isTokenNodeToken ? (
                    valueTokenInfo?.color && valueTokenInfo.color !== 'transparent' ? (
                      <div
                        className={`tokens-panel-swatch ${isSelected ? 'tokens-panel-swatch-selected' : ''}`}
                        style={{ backgroundColor: valueTokenInfo.color }}
                      />
                    ) : (
                      <div
                        className={`tokens-panel-swatch tokens-panel-swatch-empty ${isSelected ? 'tokens-panel-swatch-selected' : ''}`}
                        style={{ opacity: 0.4 }}
                      />
                    )
                  ) : (
                    <div
                      className={`tokens-panel-swatch ${(nodesUsingToken.length === 0 || isEmptyToken) ? 'tokens-panel-swatch-unassigned' : ''} ${isSelected ? 'tokens-panel-swatch-selected' : ''}`}
                      style={{ backgroundColor: (nodesUsingToken.length > 0 && !isEmptyToken) ? hslValue : 'transparent', opacity: (nodesUsingToken.length === 0 || isEmptyToken) ? 0.4 : 1 }}
                    />
                  )}
                  {editingId === token.id && editingType === 'token' && !isTokenNodeToken ? (
                    <input
                      ref={editInputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      maxLength={MAX_TOKEN_NAME}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          saveName();
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                          setEditingName('');
                          setEditingType(null);
                        }
                      }}
                      onBlur={saveName}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className="tokens-panel-token-edit-input"
                    />
                  ) : (
                    <TokenName
                      name={token.name}
                      onDoubleClick={() => { if (isPrimaryTheme && !isReadOnly && !isTokenNodeToken) startEditing(token.id, token.name, 'token'); }}
                      panelWidth={panelWidth}
                      hasCheckbox={false}
                    />
                  )}

                  {isTokenNodeToken ? (
                    <div className="tokens-panel-token-badges">
                      {/* Hidden-on-canvas indicator for token node tokens (non-interactive) */}
                      {tokenNodeHiddenOnCanvas && (
                        <Tip label="Hidden on canvas" side="left">
                          <div className="tokens-panel-hidden-indicator">
                            <EyeOff className="tokens-panel-hidden-indicator-icon" />
                          </div>
                        </Tip>
                      )}
                      {/* "LOGIC" badge — shown when token has active advanced condition logic */}
                      {tokensWithActiveLogic.has(token.id) ? (
                        <span className="tokens-panel-logic-badge">
                          logic
                        </span>
                      ) : valueTokenInfo ? (
                        <span className="tokens-panel-token-badge">
                          TOKEN
                        </span>
                      ) : null}

                    </div>
                  ) : nodesUsingToken.length > 0 && (() => {
                    const badgeClass = nodeInheritanceState === 'modified' ? 'tokens-panel-node-badge-modified'
                      : nodeInheritanceState === 'inherited' ? 'tokens-panel-node-badge-inherited'
                        : 'tokens-panel-node-badge-default';

                    return (
                      <div className="tokens-panel-token-badges">
                        {/* Eye visibility toggle — only for tokens with assigned nodes */}
                        {tokenHasAssignedNodes && (
                          <button
                            className={`tokens-panel-eye-btn ${tokenIsHidden
                                ? 'tokens-panel-eye-btn-hidden'
                                : 'tokens-panel-eye-btn-visible'
                              } ${tokenForcedHidden ? 'tokens-panel-eye-btn-locked' : 'tokens-panel-eye-btn-unlocked'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (tokenForcedHidden) return; // Locked by hidden node
                              const newVis = toggleVisibilityMap(token.themeVisibility, activeThemeId || '', primaryThemeId || '', isPrimaryTheme ?? true);
                              onUpdateToken(token.id, { themeVisibility: newVis } as any);
                            }}
                            title={
                              tokenForcedHidden
                                ? 'Hidden by node — toggle visibility on the node instead'
                                : tokenExplicitlyHidden
                                  ? 'Show token'
                                  : 'Hide token'
                            }
                            disabled={tokenForcedHidden}
                          >
                            {tokenIsHidden ? <EyeOff className="tokens-panel-eye-icon" /> : <Eye className="tokens-panel-eye-icon" />}
                          </button>
                        )}
                        {nodeType && nodeType === 'spacing' ? (
                          <>
                            <span className="tokens-panel-spacing-value">
                              {`${themeValues.value ?? 16}${themeValues.unit ?? 'px'}`}
                            </span>
                          </>
                        ) : nodeType ? (
                          <>
                            <span className={`tokens-panel-node-badge ${badgeClass}`}>
                              {nodeType}
                            </span>

                          </>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              </TooltipTrigger>
              <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                  side="right"
                  sideOffset={8}
                  className="tokens-panel-tooltip-content"
                >
                  <TokenTooltipBody
                    name={token.name}
                    color={(nodesUsingToken.length > 0 && !isEmptyToken) ? hslValue : ''}
                    spaceName={(nodesUsingToken.length > 0 && !isEmptyToken) ? colorInfo.spaceName : ''}
                    spaceValue={(nodesUsingToken.length > 0 && !isEmptyToken) ? colorInfo.spaceValue : ''}
                    hex={(nodesUsingToken.length > 0 && !isEmptyToken) ? colorInfo.hex : ''}
                    alpha={(nodesUsingToken.length > 0 && !isEmptyToken) ? alpha : undefined}
                    isTokenNode={isTokenNodeToken}
                    valueTokenRef={isTokenNodeToken ? (valueTokenInfo?.tooltipRef ?? null) : undefined}
                    isEmpty={isEmptyToken}
                  />
                </TooltipPrimitive.Content>
              </TooltipPrimitive.Portal>
            </Tooltip>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="tokens-panel-context-menu">
          {/* If mixed selection (token-node + normal tokens), show nothing actionable */}
          {selectionHasMixedTokenNodeTypes && isSelected ? (
            <ContextMenuItem
              disabled
              className="tokens-panel-context-item-disabled"
            >
              Mixed selection — no actions available
            </ContextMenuItem>
          ) : isTokenNodeToken ? (
            <>
              {/* Token node group token: limited context menu */}
              <ContextMenuItem
                onClick={() => toggleTokenSelection(token.id)}
                className="tokens-panel-context-item"
              >
                <Check className={isSelected ? 'tokens-panel-context-check-active' : 'tokens-panel-context-check-inactive'} />
                {isSelected ? 'Deselect' : 'Select'}
              </ContextMenuItem>
              {/* Navigate to the owning token node on the canvas */}
              {tokenNodeOnCanvas && onNavigateToNode && tokenNodeOnCanvas.pageId === activePageId && (
                <ContextMenuItem
                  onClick={() => onNavigateToNode(tokenNodeOnCanvas.id)}
                  className="tokens-panel-context-item"
                >
                  <Target className="tokens-panel-context-icon" />
                  Navigate to node
                </ContextMenuItem>
              )}
              {isPrimaryTheme && (
                <>
                  <ContextMenuSeparator className="tokens-panel-context-separator" />
                  <ContextMenuItem
                    onClick={() => {
                      if (selectedTokens.size > 0 && isSelected) {
                        moveSelectedTokens('up');
                      } else {
                        moveSingleToken(token.id, 'up');
                      }
                    }}
                    className="tokens-panel-context-item"
                  >
                    <ArrowUp className="tokens-panel-context-icon" />
                    Move up
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      if (selectedTokens.size > 0 && isSelected) {
                        moveSelectedTokens('down');
                      } else {
                        moveSingleToken(token.id, 'down');
                      }
                    }}
                    className="tokens-panel-context-item"
                  >
                    <ArrowDown className="tokens-panel-context-icon" />
                    Move down
                  </ContextMenuItem>
                </>
              )}
            </>
          ) : (
            <>
              {/* Normal token context menu */}
              <ContextMenuItem
                onClick={() => toggleTokenSelection(token.id)}
                className="tokens-panel-context-item"
              >
                <Check className={isSelected ? 'tokens-panel-context-check-active' : 'tokens-panel-context-check-inactive'} />
                {isSelected ? 'Deselect' : 'Select'}
              </ContextMenuItem>
              {nodesUsingToken.length > 0 && onNavigateToNode && (
                <ContextMenuItem
                  onClick={() => {
                    const nodesOnCurrentPage = nodesUsingToken.filter(n => n.pageId === activePageId);
                    if (nodesOnCurrentPage.length > 0) {
                      onNavigateToNode(nodesOnCurrentPage[0].id);
                    }
                  }}
                  className="tokens-panel-context-item"
                >
                  <Target className="tokens-panel-context-icon" />
                  Navigate to node
                </ContextMenuItem>
              )}
              {isPrimaryTheme && !isReadOnly && (
                <>
                  <ContextMenuItem
                    onClick={() => startEditing(token.id, token.name, 'token')}
                    className="tokens-panel-context-item"
                  >
                    <Edit2 className="tokens-panel-context-icon" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuSeparator className="tokens-panel-context-separator" />
                  <ContextMenuItem
                    onClick={() => {
                      if (selectedTokens.size > 0 && isSelected) {
                        moveSelectedTokens('up');
                      } else {
                        moveSingleToken(token.id, 'up');
                      }
                    }}
                    className="tokens-panel-context-item"
                  >
                    <ArrowUp className="tokens-panel-context-icon" />
                    Move up
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      if (selectedTokens.size > 0 && isSelected) {
                        moveSelectedTokens('down');
                      } else {
                        moveSingleToken(token.id, 'down');
                      }
                    }}
                    className="tokens-panel-context-item"
                  >
                    <ArrowDown className="tokens-panel-context-icon" />
                    Move down
                  </ContextMenuItem>
                  <ContextMenuSeparator className="tokens-panel-context-separator" />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="tokens-panel-context-sub-trigger">
                      <Folder className="tokens-panel-context-icon" />
                      {selectedTokens.size > 1 && isSelected ? `Move ${selectedTokens.size} to group` : 'Move to group'}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="tokens-panel-context-sub-content">
                      <ContextMenuItem
                        onClick={() => {
                          if (selectedTokens.size > 0 && isSelected) {
                            const ids = [...selectedTokens];
                            moveTokensCrossGroup(ids, null, getTokensForGroup(null).length);
                            deselectAllTokens();
                          } else {
                            moveTokensCrossGroup([token.id], null, getTokensForGroup(null).length);
                          }
                        }}
                        className="tokens-panel-context-item"
                      >
                        No group
                      </ContextMenuItem>
                      {regularGroups.length > 0 && <ContextMenuSeparator className="tokens-panel-context-separator" />}
                      {regularGroups.map(g => (
                        <ContextMenuItem
                          key={g.id}
                          onClick={() => {
                            if (selectedTokens.size > 0 && isSelected) {
                              const ids = [...selectedTokens];
                              moveTokensCrossGroup(ids, g.id, getTokensForGroup(g.id).length);
                              deselectAllTokens();
                            } else {
                              moveTokensCrossGroup([token.id], g.id, getTokensForGroup(g.id).length);
                            }
                          }}
                          className="tokens-panel-context-item"
                        >
                          <Folder className="tokens-panel-context-icon-sm" />
                          {g.name}
                        </ContextMenuItem>
                      ))}
                      <ContextMenuSeparator className="tokens-panel-context-separator" />
                      <ContextMenuItem
                        onClick={() => {
                          if (selectedTokens.size > 0 && isSelected) {
                            const ids = [...selectedTokens];
                            createGroupAndMoveTokens(ids);
                            deselectAllTokens();
                          } else {
                            createGroupAndMoveTokens([token.id]);
                          }
                        }}
                        className="tokens-panel-context-item"
                      >
                        <FolderPlus className="tokens-panel-context-icon-sm" />
                        New group
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator className="tokens-panel-context-separator" />
                  <ContextMenuItem
                    onClick={() => {
                      if (selectedTokens.size > 1 && isSelected) {
                        handleBulkDeleteTokens();
                      } else {
                        handleTokenDelete(token.id);
                      }
                    }}
                    className="tokens-panel-context-item-destructive"
                  >
                    <Trash2 className="tokens-panel-context-icon" />
                    {selectedTokens.size > 1 && isSelected ? `Delete ${selectedTokens.size} variables` : 'Delete'}
                  </ContextMenuItem>
                </>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={panelRef}
        className="tokens-panel-root"
        style={{
          width: `${panelWidth}px`,
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Projects Island */}
        <div className="tokens-panel-projects-island">
          <div className="tokens-panel-projects-header">
            <h2 className="tokens-panel-project-title">
              <Tip label="All Projects" side="bottom">
                <Home
                  className="tokens-panel-home-icon"
                  onClick={() => onNavigateToProjects && onNavigateToProjects()}
                />
              </Tip>
              {isEditingProjectName ? (
                <input
                  ref={projectNameInputRef}
                  type="text"
                  value={editingProjectName}
                  onChange={(e) => setEditingProjectName(e.target.value)}
                  maxLength={MAX_PROJECT_NAME}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      saveProjectName();
                    } else if (e.key === 'Escape') {
                      cancelEditingProjectName();
                    }
                  }}
                  onBlur={saveProjectName}
                  className="tokens-panel-project-name-input"
                />
              ) : (
                <span
                  className={`tokens-panel-project-name-text ${isReadOnly ? 'tokens-panel-project-name-text-readonly' : 'tokens-panel-project-name-text-editable'}`}
                  title={projects.find(c => c.id === activeProjectId)?.name || 'Variables'}
                  onDoubleClick={isReadOnly ? undefined : startEditingProjectName}
                >
                  {projects.find(c => c.id === activeProjectId)?.name || 'Variables'}
                </span>
              )}
            </h2>
            <div className="tokens-panel-sync-group">
              {/* Cloud sync is always visible — it syncs ALL themes/pages/tokens
                in the project, not just the active view, so it must be accessible
                from any theme (including non-primary / read-only themes). */}
              <CloudSyncIndicator
                status={cloudSyncStatus}
                lastSyncedAt={lastSyncedAt}
                lastError={lastSyncError}
                onManualSync={onManualSync}
                dirtyCount={dirtyCount}
              />
            </div>
          </div>
        </div>

        {/* Tokens Island */}
        <div className="tokens-panel-tokens-island">
          {/* Search + Filters */}
          <div className="tokens-panel-search-area">
            <TokenSearchBar
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              filters={searchFilters}
              onFiltersChange={setSearchFilters}
              isPrimaryTheme={!!isPrimaryTheme}
            />
          </div>

          {/* View Filter Tabs */}
          <div className="tokens-panel-tabs">
            {isSearchOrFilterActive ? (
              /* Combined mode: single label showing both counts when search/filter is active */
              <div className="tokens-panel-tab-label">
                All Results
                {(filteredRegularGroups.length + filteredUngroupedTokens.length + filteredPaletteEntries.length) > 0 && (
                  <span className="tokens-panel-tab-label-count">
                    {filteredRegularGroups.length + filteredUngroupedTokens.length + filteredPaletteEntries.length}
                  </span>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setViewFilter('tokens')}
                  className={`tokens-panel-tab ${viewFilter === 'tokens'
                      ? 'tokens-panel-tab-active'
                      : 'tokens-panel-tab-inactive'
                    }`}
                >
                  Tokens
                  {(filteredRegularGroups.length + filteredUngroupedTokens.length) > 0 && (
                    <span className={viewFilter === 'tokens' ? 'tokens-panel-tab-count-active' : 'tokens-panel-tab-count-inactive'}>
                      {filteredRegularGroups.length + filteredUngroupedTokens.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setViewFilter('palettes')}
                  className={`tokens-panel-tab ${viewFilter === 'palettes'
                      ? 'tokens-panel-tab-active'
                      : 'tokens-panel-tab-inactive'
                    }`}
                >
                  Color Palettes
                  {filteredPaletteEntries.length > 0 && (
                    <span className={viewFilter === 'palettes' ? 'tokens-panel-tab-count-active' : 'tokens-panel-tab-count-inactive'}>
                      {filteredPaletteEntries.length}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>

          <div className="tokens-panel-scroll-wrapper">
            <ScrollArea className="tp-scroll-area">
              <div
                ref={scrollAreaRef}
                className="tokens-panel-scroll-content"
                onMouseDown={handleMouseDown}
              >
                {/* Drag Selection Rectangle */}
                {isDraggingSelect && dragStart && dragEnd && (
                  <div
                    style={{
                      position: 'absolute',
                      left: Math.min(dragStart.x, dragEnd.x),
                      top: Math.min(dragStart.y, dragEnd.y),
                      width: Math.abs(dragEnd.x - dragStart.x),
                      height: Math.abs(dragEnd.y - dragStart.y),
                      backgroundColor: 'rgba(70, 91, 254, 0.1)',
                      border: '1px solid var(--indigo-500)',
                      pointerEvents: 'none',
                      zIndex: 1000,
                    }}
                  />
                )}
                {!activeProject ? (
                  <div className="tokens-panel-no-project">
                    <p className="tokens-panel-no-project-text">No project selected</p>
                  </div>
                ) : (
                  <>
                    {/* Project Header */}
                    <div className="tokens-panel-project-header">
                      <div className="tokens-panel-project-header-inner">
                        <button
                          onClick={() => toggleProject(activeProject.id)}
                          className="tokens-panel-chevron-btn"
                        >
                          {activeProject.isExpanded ? (
                            <ChevronDown className="tokens-panel-chevron-icon" />
                          ) : (
                            <ChevronRight className="tokens-panel-chevron-icon" />
                          )}
                        </button>
                        {((editingId === activeProject.id && editingType === 'project') || (editingId === activePage?.id && editingType === 'page')) ? (
                          <Input
                            ref={editInputRef}
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            maxLength={editingType === 'page' ? MAX_PAGE_NAME : MAX_PROJECT_NAME}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') {
                                saveName();
                              } else if (e.key === 'Escape') {
                                setEditingId(null);
                                setEditingName('');
                                setEditingType(null);
                              }
                            }}
                            onBlur={saveName}
                            onClick={(e) => e.stopPropagation()}
                            className="tokens-panel-project-edit-input"
                          />
                        ) : (
                          <div className="tokens-panel-page-name-wrapper">
                            <span
                              className={`tokens-panel-page-name ${isReadOnly ? 'tokens-panel-page-name-readonly' : 'tokens-panel-page-name-editable'}`}
                              onDoubleClick={isReadOnly ? undefined : () => activePage && startEditing(activePage.id, activePage.name, 'page')}
                              title={activePage?.name || activeProject.name}
                            >
                              {activePage?.name || activeProject.name}
                            </span>
                          </div>
                        )}
                        {isPrimaryTheme && !isReadOnly && viewFilter === 'tokens' && (
                          <>
                            <Tip label="New Group" side="bottom">
                              <button
                                onClick={() => addGroup(activeProjectId)}
                                className="tokens-panel-header-action-btn tokens-panel-header-action-btn-ml"
                              >
                                <Folder className="tokens-panel-header-action-icon" />
                              </button>
                            </Tip>
                            <Tip label="New Variable" side="bottom">
                              <button
                                onClick={() => onAddToken(undefined, null, activeProjectId)}
                                className="tokens-panel-header-action-btn"
                              >
                                <Plus className="tokens-panel-header-action-icon" />
                              </button>
                            </Tip>
                          </>
                        )}
                      </div>
                    </div>

                    {activeProject.isExpanded && (
                      <>
                        {/* Unified items list - groups and palette entries */}
                        {unifiedItems.map((item, itemIdx) => {
                          if (item.type === 'paletteEntry') {
                            // Render palette entry
                            const group = item.data;
                            const paletteNode = nodes.find(n => n.id === group.paletteNodeId);
                            if (!paletteNode) return null;

                            // Check if this palette is inherited (linked to primary in non-primary theme)
                            const isPalInherited = !isPrimaryTheme && activeThemeId && (!paletteNode.themeOverrides || !paletteNode.themeOverrides[activeThemeId]);
                            const palInheritedStyle: React.CSSProperties | undefined = isPalInherited
                              ? { opacity: showAllVisible ? 1 : 0.45, pointerEvents: 'none' as const }
                              : undefined;

                            // Check if this palette node is hidden in the current theme
                            const isPalHiddenA = isNodeHiddenInTheme(paletteNode, activeThemeId || '', primaryThemeId || '', nodes);

                            const shadeNodes = nodes.filter(n => n.parentId === paletteNode.id);
                            const paletteTokens = getTokensForGroup(group.id);
                            const anyShadeModifiedA = !isPrimaryTheme && paletteTokens.some(t => isTokenValueChanged(t.id));
                            const palFmtA = paletteNode?.paletteColorFormat || 'HEX';
                            const groupColorSpaceA = palFmtA === 'OKLCH' ? 'OKLCH' : palFmtA === 'RGBA' ? 'RGBA' : 'HSL';
                            const groupBadgeClassA = anyShadeModifiedA ? 'tokens-panel-palette-badge-brand' : isPalInherited ? 'tokens-panel-palette-badge-warning' : 'tokens-panel-palette-badge-dim';

                            return (
                              <div key={group.id} className={`tokens-panel-palette-entry ${isPalHiddenA ? 'tokens-panel-palette-entry-hidden' : ''}`} style={palInheritedStyle}>
                                {shouldShowGroupDropBefore(itemIdx, 'palette') && renderGroupDropIndicator()}
                                <ContextMenu>
                                  <ContextMenuTrigger asChild>
                                    <div
                                      data-group-header-type="palette"
                                      tabIndex={0}
                                      onKeyDown={isReadOnly ? undefined : (e) => {
                                        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          moveGroupInDirection(group.id, e.key === 'ArrowUp' ? 'up' : 'down');
                                        }
                                      }}
                                      className="tokens-panel-palette-header"
                                    >
                                      {!isReadOnly && isPrimaryTheme && (
                                        <div
                                          className="tp-drag-handle"
                                          onMouseDown={(e) => handleGroupGripMouseDown(e, group.id, 'palette')}
                                        >
                                          <GripVertical className="tp-icon-3 tp-icon-dim" />
                                        </div>
                                      )}
                                      {!isPrimaryTheme && (
                                        <div className="tp-crown-col">
                                          {anyShadeModifiedA && (
                                            <Crown className="tp-icon-2\.5 tp-icon-brand-fill" />
                                          )}
                                        </div>
                                      )}
                                      <button
                                        onClick={() => toggleGroup(group.id)}
                                        className="tp-chevron-btn"
                                      >
                                        {group.isExpanded ? (
                                          <ChevronDown className="tp-icon-3 tp-icon-dim" />
                                        ) : (
                                          <ChevronRight className="tp-icon-3 tp-icon-dim" />
                                        )}
                                      </button>
                                      <div className="tp-palette-content-col">
                                        {editingId === paletteNode.id && editingType === 'group' ? (
                                          <Input
                                            ref={editInputRef}
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            maxLength={MAX_PALETTE_NAME}
                                            onKeyDown={(e) => {
                                              e.stopPropagation();
                                              if (e.key === 'Enter') {
                                                if (onUpdateNode) {
                                                  onUpdateNode(paletteNode.id, { paletteName: editingName.trim() });
                                                }
                                                setEditingId(null);
                                                setEditingName('');
                                                setEditingType(null);
                                              } else if (e.key === 'Escape') {
                                                setEditingId(null);
                                                setEditingName('');
                                                setEditingType(null);
                                              }
                                            }}
                                            onBlur={() => {
                                              if (onUpdateNode && editingName.trim()) {
                                                onUpdateNode(paletteNode.id, { paletteName: editingName.trim() });
                                              }
                                              setEditingId(null);
                                              setEditingName('');
                                              setEditingType(null);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="tp-palette-edit-input tp-palette-edit-input-wrap"
                                          />
                                        ) : (
                                          <div className="tp-palette-name-row">
                                            <div className="tp-palette-name-inner">
                                              <span
                                                className={`tp-name-subtle ${isReadOnly ? 'tp-cursor-default' : 'tp-name-subtle-editable'}`}
                                                onDoubleClick={isReadOnly ? undefined : () => {
                                                  setEditingId(paletteNode.id);
                                                  setEditingName(paletteNode.paletteName || group.name);
                                                  setEditingType('group');
                                                }}
                                                title={paletteNode.paletteName || group.name}
                                              >
                                                {paletteNode.paletteName || group.name}
                                              </span>
                                              <span className={`tokens-panel-palette-badge ${groupBadgeClassA}`}>
                                                {groupColorSpaceA}
                                              </span>
                                              {isPalHiddenA && (
                                                <EyeOff className="tp-icon-2\.5 tp-icon-dim tp-eyeoff-icon" />
                                              )}
                                            </div>
                                            {!isReadOnly && (
                                              <Tip label={paletteNode.paletteNameLocked ? "Unlock Palette Name" : "Lock Palette Name"} side="bottom">
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onUpdateNode) {
                                                      onUpdateNode(paletteNode.id, { paletteNameLocked: !paletteNode.paletteNameLocked });
                                                    }
                                                  }}
                                                  className="tp-palette-action-btn"
                                                >
                                                  {paletteNode.paletteNameLocked ? (
                                                    <Lock className="tp-icon-3 tp-icon-brand" />
                                                  ) : (
                                                    <Unlock className="tp-icon-3 tp-icon-dim" />
                                                  )}
                                                </button>
                                              </Tip>
                                            )}
                                            {!isReadOnly && (
                                              <Tip label="Delete Palette" side="bottom">
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    deletePaletteGroup(group.id, paletteNode.id);
                                                  }}
                                                  className="tp-palette-action-btn"
                                                >
                                                  <Trash2 className="tp-icon-3 tp-icon-dim-hover-destructive" />
                                                </button>
                                              </Tip>
                                            )}
                                          </div>
                                        )}
                                        {/* Gradient showing all shades */}
                                        <div className="tp-palette-gradient">
                                          {shadeNodes.sort((a, b) => a.position.y - b.position.y).map((shade, idx) => {
                                            const ec = getShadeEffectiveColor(shade);
                                            const color = `hsla(${ec.hue}, ${ec.saturation}%, ${ec.lightness}%, ${ec.alpha / 100})`;
                                            return (
                                              <div
                                                key={shade.id}
                                                className="tp-palette-gradient-swatch"
                                                style={{ backgroundColor: color }}
                                                title={`${ec.lightness.toFixed(0)}%`}
                                              />
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </ContextMenuTrigger>
                                  <ContextMenuContent className="tp-context-menu">
                                    {!isReadOnly && (
                                      <>
                                        <ContextMenuItem
                                          onClick={() => moveGroupInDirection(group.id, 'up')}
                                          className="tokens-panel-context-item"
                                        >
                                          <ArrowUp className="tokens-panel-context-icon" />
                                          Move up
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                          onClick={() => moveGroupInDirection(group.id, 'down')}
                                          className="tokens-panel-context-item"
                                        >
                                          <ArrowDown className="tokens-panel-context-icon" />
                                          Move down
                                        </ContextMenuItem>
                                        <ContextMenuSeparator className="tokens-panel-context-separator" />
                                        <ContextMenuItem
                                          onClick={() => {
                                            setEditingId(paletteNode.id);
                                            setEditingName(paletteNode.paletteName || group.name);
                                            setEditingType('group');
                                          }}
                                          className="tokens-panel-context-item"
                                        >
                                          <Edit2 className="tokens-panel-context-icon" />
                                          Rename
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                          onClick={() => deletePaletteGroup(group.id, paletteNode.id)}
                                          className="tokens-panel-context-item-destructive"
                                        >
                                          <Trash2 className="tokens-panel-context-icon" />
                                          Delete palette
                                        </ContextMenuItem>
                                      </>
                                    )}
                                  </ContextMenuContent>
                                </ContextMenu>
                                {/* Expanded: list of shade tokens — auto-expand when search/filter is active to show individual matching tokens */}
                                {(group.isExpanded || isSearchOrFilterActive) && paletteTokens.length > 0 && (
                                  <div className="tp-shade-list">
                                    {shadeNodes.sort((a, b) => a.position.y - b.position.y).map((shade) => {
                                      const shadeTokenId = getShadeTokenId(shade);
                                      const shadeToken = shadeTokenId ? paletteTokens.find(t => t.id === shadeTokenId) : null;
                                      if (!shadeToken) return null;
                                      // Filter individual shade tokens when search/filter is active
                                      if (isSearchOrFilterActive && !tokenPassesSearch(shadeToken)) return null;

                                      const ec = getShadeEffectiveColor(shade);
                                      const shadeColor = `hsla(${ec.hue}, ${ec.saturation}%, ${ec.lightness}%, ${ec.alpha / 100})`;
                                      const palFmt = paletteNode?.paletteColorFormat || 'HEX';
                                      const shadeColorSpace = palFmt === 'OKLCH' ? 'OKLCH' : palFmt === 'RGBA' ? 'RGBA' : 'HSL';
                                      const shadeCI = formatColorInfo(shadeColorSpace, ec.hue, ec.saturation, ec.lightness, ec.alpha, shade, activeThemeId, isPrimaryTheme);
                                      const shadeIsSelected1 = selectedTokens.has(shadeToken.id);

                                      return (
                                        <Tooltip key={shade.id} delayDuration={400} open={editingId === shadeToken.id ? false : undefined}>
                                          <TooltipTrigger asChild>
                                            <div
                                              data-token-item
                                              data-token-id={shadeToken.id}
                                              ref={(el) => {
                                                if (el) {
                                                  tokenRefs.current.set(shadeToken.id, el);
                                                } else {
                                                  tokenRefs.current.delete(shadeToken.id);
                                                }
                                              }}
                                              className={`tp-shade-row ${shadeIsSelected1 ? 'tp-shade-row-selected' : ''} ${highlightedTokenId === shadeToken.id
                                                  ? 'tp-shade-highlight'
                                                  : shadeIsSelected1
                                                    ? 'tp-shade-selected'
                                                    : ''
                                                } ${isTokenInherited(shadeToken.id) && !showAllVisible ? 'tp-inherited-dim' : ''} ${focusedTokenId === shadeToken.id && shadeIsSelected1 ? 'tp-shade-focus-ring' : ''}`}
                                              onClick={(e) => {
                                                const target = e.target as HTMLElement;
                                                if (target.closest('input')) return;
                                                e.stopPropagation();
                                                if (wasDraggingRef.current) return;
                                                handleTokenClick(shadeToken.id, e);
                                              }}
                                              onDoubleClick={(e) => {
                                                const target = e.target as HTMLElement;
                                                if (target.closest('input')) return;
                                                e.stopPropagation();
                                                if (isPrimaryTheme && !isReadOnly) startEditing(shadeToken.id, shadeToken.name, 'token');
                                              }}
                                            >
                                              {shadeIsSelected1 && <div className="tp-shade-select-bar-indicator tp-shade-select-bar" />}
                                              <div
                                                className={`tp-shade-swatch ${shadeIsSelected1 ? 'tp-shade-swatch-ring' : ''}`}
                                                style={{ backgroundColor: shadeColor }}
                                              />
                                              {editingId === shadeToken.id && editingType === 'token' ? (
                                                <input
                                                  ref={editInputRef}
                                                  value={editingName}
                                                  onChange={(e) => setEditingName(e.target.value)}
                                                  onKeyDown={(e) => {
                                                    e.stopPropagation();
                                                    if (e.key === 'Enter') { saveName(); }
                                                    else if (e.key === 'Escape') { setEditingId(null); setEditingName(''); setEditingType(null); }
                                                  }}
                                                  onBlur={saveName}
                                                  onClick={(e) => e.stopPropagation()}
                                                  onDoubleClick={(e) => e.stopPropagation()}
                                                  className="tp-shade-edit-input tp-shade-edit-input-wrap"
                                                  style={{ fontSize: '12px', lineHeight: 'normal', height: 'auto' }}
                                                  maxLength={MAX_TOKEN_NAME}
                                                />
                                              ) : (
                                                <span className="tp-shade-name tp-shade-name-label" title={shadeToken.name}>
                                                  {shadeToken.name}
                                                </span>
                                              )}
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipPrimitive.Portal>
                                            <TooltipPrimitive.Content
                                              side="right"
                                              sideOffset={8}
                                              className="tp-shade-tooltip tp-shade-tooltip-portal"
                                            >
                                              <TokenTooltipBody
                                                name={shadeToken.name}
                                                color={shadeColor}
                                                spaceName={shadeCI.spaceName}
                                                spaceValue={shadeCI.spaceValue}
                                                hex={shadeCI.hex}
                                                alpha={ec.alpha}
                                              />
                                            </TooltipPrimitive.Content>
                                          </TooltipPrimitive.Portal>
                                        </Tooltip>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          // Render regular group
                          const group = item.data;
                          const groupTokensRaw = getTokensForGroup(group.id);
                          const groupTokens = isSearchOrFilterActive
                            ? groupTokensRaw.filter(tokenPassesSearch)
                            : groupTokensRaw;
                          const isColorPaletteGroup = group.isColorPaletteGroup === true;
                          const isPaletteEntry = group.isPaletteEntry === true;
                          const isTokenNodeGrp = tokenNodeGroupIds.has(group.id);

                          // If this is a palette entry, find the palette node and render differently
                          if (isPaletteEntry && group.paletteNodeId) {
                            const paletteNode = nodes.find(n => n.id === group.paletteNodeId);
                            if (!paletteNode) return null;

                            // Check if this palette is inherited (linked to primary in non-primary theme)
                            const isPaletteInherited = !isPrimaryTheme && activeThemeId && (!paletteNode.themeOverrides || !paletteNode.themeOverrides[activeThemeId]);
                            const paletteInheritedStyle: React.CSSProperties | undefined = isPaletteInherited
                              ? { opacity: showAllVisible ? 1 : 0.45, pointerEvents: 'none' as const }
                              : undefined;

                            // Check if this palette node is hidden in the current theme
                            const isPalHiddenB = isNodeHiddenInTheme(paletteNode, activeThemeId || '', primaryThemeId || '', nodes);

                            // Get all shade nodes for this palette
                            const shadeNodes = nodes.filter(n => n.parentId === paletteNode.id);
                            const palTokens = getTokensForGroup(group.id);
                            const anyShadeModifiedB = !isPrimaryTheme && palTokens.some(t => isTokenValueChanged(t.id));
                            const palFmtB = paletteNode?.paletteColorFormat || 'HEX';
                            const groupColorSpaceB = palFmtB === 'OKLCH' ? 'OKLCH' : palFmtB === 'RGBA' ? 'RGBA' : 'HSL';
                            const groupBadgeClassB = anyShadeModifiedB ? 'tokens-panel-palette-badge-brand' : isPaletteInherited ? 'tokens-panel-palette-badge-warning' : 'tokens-panel-palette-badge-dim';

                            return (
                              <div key={group.id} className={`tp-group-wrapper ${isPalHiddenB ? 'tp-pal-hidden' : ''}`} style={paletteInheritedStyle}>
                                <div className="tp-palette-header-row group">
                                  {!isPrimaryTheme && (
                                    <div className="tp-crown-col">
                                      {anyShadeModifiedB && (
                                        <Crown className="tp-icon-2\.5 tp-icon-brand-fill" />
                                      )}
                                    </div>
                                  )}
                                  <button
                                    onClick={() => toggleGroup(group.id)}
                                    className="tp-chevron-btn"
                                  >
                                    {group.isExpanded ? (
                                      <ChevronDown className="tp-icon-3 tp-icon-dim" />
                                    ) : (
                                      <ChevronRight className="tp-icon-3 tp-icon-dim" />
                                    )}
                                  </button>
                                  <div className="tp-palette-content-col">
                                    {editingId === paletteNode.id && editingType === 'group' ? (
                                      <Input
                                        ref={editInputRef}
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        maxLength={MAX_PALETTE_NAME}
                                        onKeyDown={(e) => {
                                          e.stopPropagation();
                                          if (e.key === 'Enter') {
                                            if (onUpdateNode) {
                                              onUpdateNode(paletteNode.id, { paletteName: editingName.trim() });
                                            }
                                            setEditingId(null);
                                            setEditingName('');
                                            setEditingType(null);
                                          } else if (e.key === 'Escape') {
                                            setEditingId(null);
                                            setEditingName('');
                                            setEditingType(null);
                                          }
                                        }}
                                        onBlur={() => {
                                          if (onUpdateNode && editingName.trim()) {
                                            onUpdateNode(paletteNode.id, { paletteName: editingName.trim() });
                                          }
                                          setEditingId(null);
                                          setEditingName('');
                                          setEditingType(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="tp-palette-edit-input tp-palette-edit-input-wrap"
                                      />
                                    ) : (
                                      <div className="tp-palette-name-row">
                                        <div className="tp-palette-name-inner">
                                          <span
                                            className={`tp-name-subtle ${isReadOnly ? 'tp-cursor-default' : 'tp-name-subtle-editable'}`}
                                            onDoubleClick={isReadOnly ? undefined : () => {
                                              setEditingId(paletteNode.id);
                                              setEditingName(paletteNode.paletteName || group.name);
                                              setEditingType('group');
                                            }}
                                            title={paletteNode.paletteName || group.name}
                                          >
                                            {paletteNode.paletteName || group.name}
                                          </span>
                                          <span className={`tokens-panel-palette-badge ${groupBadgeClassB}`}>
                                            {groupColorSpaceB}
                                          </span>
                                          {isPalHiddenB && (
                                            <EyeOff className="tp-icon-2\.5 tp-icon-dim tp-eyeoff-icon" />
                                          )}
                                        </div>
                                        {!isReadOnly && (
                                          <Tip label={paletteNode.paletteNameLocked ? "Unlock Palette Name" : "Lock Palette Name"} side="bottom">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (onUpdateNode) {
                                                  onUpdateNode(paletteNode.id, { paletteNameLocked: !paletteNode.paletteNameLocked });
                                                }
                                              }}
                                              className="tp-palette-action-btn-static"
                                            >
                                              {paletteNode.paletteNameLocked ? (
                                                <Lock className="tp-icon-3 tp-icon-brand" />
                                              ) : (
                                                <Unlock className="tp-icon-3 tp-icon-dim" />
                                              )}
                                            </button>
                                          </Tip>
                                        )}
                                        {!isReadOnly && (
                                          <Tip label="Delete Palette" side="bottom">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deletePaletteGroup(group.id, paletteNode.id);
                                              }}
                                              className="tp-palette-action-btn-static"
                                            >
                                              <Trash2 className="tp-icon-3 tp-icon-dim-hover-destructive" />
                                            </button>
                                          </Tip>
                                        )}
                                      </div>
                                    )}
                                    {/* Gradient showing all shades */}
                                    <div className="tp-palette-gradient">
                                      {shadeNodes.sort((a, b) => a.position.y - b.position.y).map((shade, idx) => {
                                        const ec = getShadeEffectiveColor(shade);
                                        const color = `hsla(${ec.hue}, ${ec.saturation}%, ${ec.lightness}%, ${ec.alpha / 100})`;
                                        return (
                                          <div
                                            key={shade.id}
                                            className="tp-palette-gradient-swatch"
                                            style={{ backgroundColor: color }}
                                            title={`${ec.lightness.toFixed(0)}%`}
                                          />
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                                {/* Expanded: list of shade tokens — auto-expand when search/filter is active to show individual matching tokens */}
                                {(group.isExpanded || isSearchOrFilterActive) && palTokens.length > 0 && (
                                  <div className="tp-shade-list">
                                    {shadeNodes.sort((a, b) => a.position.y - b.position.y).map((shade) => {
                                      const shadeTokenId = getShadeTokenId(shade);
                                      const shadeToken = shadeTokenId ? palTokens.find(t => t.id === shadeTokenId) : null;
                                      if (!shadeToken) return null;
                                      // Filter individual shade tokens when search/filter is active
                                      if (isSearchOrFilterActive && !tokenPassesSearch(shadeToken)) return null;

                                      const ec = getShadeEffectiveColor(shade);
                                      const shadeColor = `hsla(${ec.hue}, ${ec.saturation}%, ${ec.lightness}%, ${ec.alpha / 100})`;
                                      const palFmt2 = paletteNode?.paletteColorFormat || 'HEX';
                                      const shadeColorSpace = palFmt2 === 'OKLCH' ? 'OKLCH' : palFmt2 === 'RGBA' ? 'RGBA' : 'HSL';
                                      const shadeCI2 = formatColorInfo(shadeColorSpace, ec.hue, ec.saturation, ec.lightness, ec.alpha, shade, activeThemeId, isPrimaryTheme);
                                      const shadeIsSelected2 = selectedTokens.has(shadeToken.id);

                                      return (
                                        <Tooltip key={shade.id} delayDuration={400} open={editingId === shadeToken.id ? false : undefined}>
                                          <TooltipTrigger asChild>
                                            <div
                                              data-token-item
                                              data-token-id={shadeToken.id}
                                              ref={(el) => {
                                                if (el) {
                                                  tokenRefs.current.set(shadeToken.id, el);
                                                } else {
                                                  tokenRefs.current.delete(shadeToken.id);
                                                }
                                              }}
                                              className={`tp-shade-row ${shadeIsSelected2 ? 'tp-shade-row-selected' : ''} ${highlightedTokenId === shadeToken.id
                                                  ? 'tp-shade-highlight'
                                                  : shadeIsSelected2
                                                    ? 'tp-shade-selected'
                                                    : ''
                                                } ${isTokenInherited(shadeToken.id) && !showAllVisible ? 'tp-inherited-dim' : ''} ${focusedTokenId === shadeToken.id && shadeIsSelected2 ? 'tp-shade-focus-ring' : ''}`}
                                              onClick={(e) => {
                                                const target = e.target as HTMLElement;
                                                if (target.closest('input')) return;
                                                e.stopPropagation();
                                                if (wasDraggingRef.current) return;
                                                handleTokenClick(shadeToken.id, e);
                                              }}
                                              onDoubleClick={(e) => {
                                                const target = e.target as HTMLElement;
                                                if (target.closest('input')) return;
                                                e.stopPropagation();
                                                if (isPrimaryTheme && !isReadOnly) startEditing(shadeToken.id, shadeToken.name, 'token');
                                              }}
                                            >
                                              {shadeIsSelected2 && <div className="tp-shade-select-bar-indicator tp-shade-select-bar" />}
                                              <div
                                                className={`tp-shade-swatch ${shadeIsSelected2 ? 'tp-shade-swatch-ring' : ''}`}
                                                style={{ backgroundColor: shadeColor }}
                                              />
                                              {editingId === shadeToken.id && editingType === 'token' ? (
                                                <input
                                                  ref={editInputRef}
                                                  value={editingName}
                                                  onChange={(e) => setEditingName(e.target.value)}
                                                  onKeyDown={(e) => {
                                                    e.stopPropagation();
                                                    if (e.key === 'Enter') { saveName(); }
                                                    else if (e.key === 'Escape') { setEditingId(null); setEditingName(''); setEditingType(null); }
                                                  }}
                                                  onBlur={saveName}
                                                  onClick={(e) => e.stopPropagation()}
                                                  onDoubleClick={(e) => e.stopPropagation()}
                                                  className="tp-shade-edit-input tp-shade-edit-input-wrap"
                                                  style={{ fontSize: '12px', lineHeight: 'normal', height: 'auto' }}
                                                  maxLength={MAX_TOKEN_NAME}
                                                />
                                              ) : (
                                                <span className="tp-shade-name tp-shade-name-label" title={shadeToken.name}>
                                                  {shadeToken.name}
                                                </span>
                                              )}
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipPrimitive.Portal>
                                            <TooltipPrimitive.Content
                                              side="right"
                                              sideOffset={8}
                                              className="tp-shade-tooltip tp-shade-tooltip-portal"
                                            >
                                              <TokenTooltipBody
                                                name={shadeToken.name}
                                                color={shadeColor}
                                                spaceName={shadeCI2.spaceName}
                                                spaceValue={shadeCI2.spaceValue}
                                                hex={shadeCI2.hex}
                                                alpha={ec.alpha}
                                              />
                                            </TooltipPrimitive.Content>

                                          </TooltipPrimitive.Portal>
                                        </Tooltip>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div key={group.id} className="tp-group-wrapper">
                              {shouldShowGroupDropBefore(itemIdx, 'regular') && renderGroupDropIndicator()}
                              {/* Group Header */}
                              <ContextMenu>
                                <ContextMenuTrigger asChild>
                                  <div
                                    data-group-header-type="regular"
                                    tabIndex={0}
                                    onKeyDown={isReadOnly ? undefined : (e) => {
                                      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        moveGroupInDirection(group.id, e.key === 'ArrowUp' ? 'up' : 'down');
                                      }
                                    }}
                                    className="tp-group-header tp-group-focus-ring group/group"
                                  >
                                    {isPrimaryTheme && (
                                      <div
                                        className="tp-group-drag-handle"
                                        onMouseDown={(e) => handleGroupGripMouseDown(e, group.id, 'regular')}
                                      >
                                        <GripVertical className="tp-icon-3 tp-icon-dim" />
                                      </div>
                                    )}
                                    <button
                                      onClick={() => toggleGroup(group.id)}
                                      className="tp-chevron-btn"
                                    >
                                      {group.isExpanded ? (
                                        <ChevronDown className="tp-icon-3 tp-icon-dim" />
                                      ) : (
                                        <ChevronRight className="tp-icon-3 tp-icon-dim" />
                                      )}
                                    </button>
                                    {editingId === group.id && editingType === 'group' && !isTokenNodeGrp ? (
                                      <Input
                                        ref={editInputRef}
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        onKeyDown={(e) => {
                                          e.stopPropagation();
                                          if (e.key === 'Enter') {
                                            saveName();
                                          } else if (e.key === 'Escape') {
                                            setEditingId(null);
                                            setEditingName('');
                                            setEditingType(null);
                                          }
                                        }}
                                        onBlur={saveName}
                                        onClick={(e) => e.stopPropagation()}
                                        maxLength={MAX_GROUP_NAME}
                                        className="tp-group-edit-input tp-group-edit-input-wrap"
                                      />
                                    ) : (
                                      <div className="tp-group-name-wrap">
                                        <span
                                          className={`tp-group-name-text tp-name-subtle ${isReadOnly || isTokenNodeGrp ? 'tp-cursor-default' : 'tp-name-subtle-editable tp-group-name-text-editable'}`}
                                          onDoubleClick={isReadOnly || isTokenNodeGrp ? undefined : () => startEditing(group.id, group.name, 'group')}
                                          title={group.name}
                                        >
                                          {group.name}
                                        </span>
                                      </div>
                                    )}
                                    {isPrimaryTheme && !isReadOnly && !isTokenNodeGrp && (
                                      <>
                                        <Tip label="Delete Group" side="bottom">
                                          <button
                                            onClick={() => requestDeleteGroup(group.id)}
                                            className="tp-group-action-btn tp-group-action-btn-first"
                                          >
                                            <Trash2 className="tp-icon-3 tp-icon-dim-hover-destructive" />
                                          </button>
                                        </Tip>
                                        <Tip label="Add Variable to Group" side="bottom">
                                          <button
                                            onClick={() => {
                                              ensureGroupExpanded(group.id);
                                              onAddToken(undefined, group.id, activeProjectId);
                                            }}
                                            className="tp-group-action-btn"
                                          >
                                            <Plus className="tp-icon-3 tp-icon-dim" />
                                          </button>
                                        </Tip>
                                      </>
                                    )}
                                  </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent className="tp-context-menu">
                                  {!isReadOnly && (
                                    <>
                                      <ContextMenuItem
                                        onClick={() => moveGroupInDirection(group.id, 'up')}
                                        className="tokens-panel-context-item"
                                      >
                                        <ArrowUp className="tokens-panel-context-icon" />
                                        Move up
                                      </ContextMenuItem>
                                      <ContextMenuItem
                                        onClick={() => moveGroupInDirection(group.id, 'down')}
                                        className="tokens-panel-context-item"
                                      >
                                        <ArrowDown className="tokens-panel-context-icon" />
                                        Move down
                                      </ContextMenuItem>
                                      {!isTokenNodeGrp && (
                                        <>
                                          <ContextMenuSeparator className="tokens-panel-context-separator" />
                                          <ContextMenuItem
                                            onClick={() => startEditing(group.id, group.name, 'group')}
                                            className="tokens-panel-context-item"
                                          >
                                            <Edit2 className="tokens-panel-context-icon" />
                                            Rename
                                          </ContextMenuItem>
                                          <ContextMenuItem
                                            onClick={() => requestDeleteGroup(group.id)}
                                            className="tokens-panel-context-item-destructive"
                                          >
                                            <Trash2 className="tokens-panel-context-icon" />
                                            Delete group
                                          </ContextMenuItem>
                                        </>
                                      )}
                                    </>
                                  )}
                                </ContextMenuContent>
                              </ContextMenu>

                              {group.isExpanded && (
                                <div data-group-zone={!isColorPaletteGroup ? group.id : undefined} className="tp-group-zone">
                                  {isColorPaletteGroup ? (
                                    // Render palette entries for Color Palette group
                                    paletteEntries.length === 0 ? (
                                      <div className="tp-empty-dim tp-empty-text">
                                        No palettes yet
                                      </div>
                                    ) : (
                                      paletteEntries.map(entry => {
                                        const paletteNode = nodes.find(n => n.id === entry.paletteNodeId);
                                        if (!paletteNode) return null;

                                        // Check if this palette is inherited (linked to primary in non-primary theme)
                                        const isPalEntryInherited = !isPrimaryTheme && activeThemeId && (!paletteNode.themeOverrides || !paletteNode.themeOverrides[activeThemeId]);
                                        const palEntryInheritedStyle: React.CSSProperties | undefined = isPalEntryInherited
                                          ? { opacity: showAllVisible ? 1 : 0.45, pointerEvents: 'none' as const }
                                          : undefined;

                                        // Check if this palette node is hidden in the current theme
                                        const isPalHiddenC = isNodeHiddenInTheme(paletteNode, activeThemeId || '', primaryThemeId || '', nodes);

                                        // Get all shade nodes for this palette
                                        const shadeNodes = nodes.filter(n => n.parentId === paletteNode.id).sort((a, b) => a.position.y - b.position.y);

                                        const entryPalTokens = getTokensForGroup(entry.id);
                                        const anyShadeModifiedC = !isPrimaryTheme && entryPalTokens.some(t => isTokenValueChanged(t.id));
                                        const palFmtC = paletteNode?.paletteColorFormat || 'HEX';
                                        const groupColorSpaceC = palFmtC === 'OKLCH' ? 'OKLCH' : palFmtC === 'RGBA' ? 'RGBA' : 'HSL';
                                        const groupBadgeClassC = anyShadeModifiedC ? 'tokens-panel-palette-badge-brand' : isPalEntryInherited ? 'tokens-panel-palette-badge-warning' : 'tokens-panel-palette-badge-dim';

                                        return (
                                          <div key={entry.id} className={`tp-group-wrapper ${isPalHiddenC ? 'tp-pal-hidden' : ''}`} style={palEntryInheritedStyle}>
                                            <div className="tp-palette-header-row group">
                                              {!isPrimaryTheme && (
                                                <div className="tp-crown-col">
                                                  {anyShadeModifiedC && (
                                                    <Crown className="tp-icon-2\.5 tp-icon-brand-fill" />
                                                  )}
                                                </div>
                                              )}
                                              <button
                                                onClick={() => toggleGroup(entry.id)}
                                                className="tp-chevron-btn"
                                              >
                                                {entry.isExpanded ? (
                                                  <ChevronDown className="tp-icon-3 tp-icon-dim" />
                                                ) : (
                                                  <ChevronRight className="tp-icon-3 tp-icon-dim" />
                                                )}
                                              </button>
                                              <div className="tp-palette-content-col">
                                                <div className="tp-palette-name-row">
                                                  <div className="tp-palette-name-inner">
                                                    <span className="tp-name-subtle tp-shade-name-label">{paletteNode.paletteName || entry.name}</span>
                                                    <span className={`tokens-panel-palette-badge ${groupBadgeClassC}`}>
                                                      {groupColorSpaceC}
                                                    </span>
                                                    {isPalHiddenC && (
                                                      <EyeOff className="tp-icon-2\.5 tp-icon-dim tp-eyeoff-icon" />
                                                    )}
                                                  </div>
                                                  {!isReadOnly && (
                                                    <Tip label={paletteNode.paletteNameLocked ? "Unlock Palette Name" : "Lock Palette Name"} side="bottom">
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          if (onUpdateNode) {
                                                            onUpdateNode(paletteNode.id, { paletteNameLocked: !paletteNode.paletteNameLocked });
                                                          }
                                                        }}
                                                        className="tp-palette-action-btn"
                                                      >
                                                        {paletteNode.paletteNameLocked ? (
                                                          <Lock className="tp-icon-3 tp-icon-brand" />
                                                        ) : (
                                                          <Unlock className="tp-icon-3 tp-icon-dim" />
                                                        )}
                                                      </button>
                                                    </Tip>
                                                  )}
                                                  {!isReadOnly && (
                                                    <Tip label="Delete Palette" side="bottom">
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          deletePaletteGroup(entry.id, paletteNode.id);
                                                        }}
                                                        className="tp-palette-action-btn"
                                                      >
                                                        <Trash2 className="tp-icon-3 tp-icon-dim-hover-destructive" />
                                                      </button>
                                                    </Tip>
                                                  )}
                                                </div>
                                                {/* Gradient showing all shades */}
                                                <div className="tp-palette-gradient">
                                                  {shadeNodes.map((shade) => {
                                                    const ec = getShadeEffectiveColor(shade);
                                                    const color = `hsla(${ec.hue}, ${ec.saturation}%, ${ec.lightness}%, ${ec.alpha / 100})`;
                                                    return (
                                                      <div
                                                        key={shade.id}
                                                        className="tp-palette-gradient-swatch"
                                                        style={{ backgroundColor: color }}
                                                        title={`${ec.lightness.toFixed(0)}%`}
                                                      />
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            </div>
                                            {/* Expanded: list of shade tokens */}
                                            {entry.isExpanded && entryPalTokens.length > 0 && (
                                              <div className="tp-shade-list">
                                                {shadeNodes.map((shade) => {
                                                  const shadeTokenId = getShadeTokenId(shade);
                                                  const shadeToken = shadeTokenId ? entryPalTokens.find(t => t.id === shadeTokenId) : null;
                                                  if (!shadeToken) return null;

                                                  const ec = getShadeEffectiveColor(shade);
                                                  const shadeColor = `hsla(${ec.hue}, ${ec.saturation}%, ${ec.lightness}%, ${ec.alpha / 100})`;
                                                  const palFmt3 = paletteNode?.paletteColorFormat || 'HEX';
                                                  const shadeColorSpace = palFmt3 === 'OKLCH' ? 'OKLCH' : palFmt3 === 'RGBA' ? 'RGBA' : 'HSL';
                                                  const shadeCI3 = formatColorInfo(shadeColorSpace, ec.hue, ec.saturation, ec.lightness, ec.alpha, shade, activeThemeId, isPrimaryTheme);

                                                  return (
                                                    <Tooltip key={shade.id} delayDuration={400} open={editingId === shadeToken.id ? false : undefined}>
                                                      <TooltipTrigger asChild>
                                                        <div
                                                          data-token-item
                                                          data-token-id={shadeToken.id}
                                                          ref={(el) => {
                                                            if (el) {
                                                              tokenRefs.current.set(shadeToken.id, el);
                                                            } else {
                                                              tokenRefs.current.delete(shadeToken.id);
                                                            }
                                                          }}
                                                          className={`tp-shade-row ${selectedTokens.has(shadeToken.id) ? 'tp-shade-row-selected tp-shade-selected' : ''} ${isTokenInherited(shadeToken.id) && !showAllVisible ? 'tp-inherited-dim' : ''} ${focusedTokenId === shadeToken.id && selectedTokens.has(shadeToken.id) ? 'tp-shade-focus-ring' : ''}`}
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (wasDraggingRef.current) return;
                                                            handleTokenClick(shadeToken.id, e);
                                                          }}
                                                          onDoubleClick={(e) => {
                                                            const target = e.target as HTMLElement;
                                                            if (target.closest('input')) return;
                                                            e.stopPropagation();
                                                            if (isPrimaryTheme && !isReadOnly) startEditing(shadeToken.id, shadeToken.name, 'token');
                                                          }}
                                                        >
                                                          {selectedTokens.has(shadeToken.id) && <div className="tp-shade-select-bar-indicator tp-shade-select-bar" />}
                                                          <div
                                                            className={`tp-shade-swatch ${selectedTokens.has(shadeToken.id) ? 'tp-shade-swatch-ring' : ''}`}
                                                            style={{ backgroundColor: shadeColor }}
                                                          />
                                                          <span className="tp-shade-name tp-shade-name-label">
                                                            {shadeToken.name}
                                                          </span>
                                                        </div>
                                                      </TooltipTrigger>
                                                      <TooltipPrimitive.Portal>
                                                        <TooltipPrimitive.Content
                                                          side="right"
                                                          sideOffset={8}
                                                          className="tp-shade-tooltip tp-shade-tooltip-portal"
                                                        >
                                                          <TokenTooltipBody
                                                            name={shadeToken.name}
                                                            color={shadeColor}
                                                            spaceName={shadeCI3.spaceName}
                                                            spaceValue={shadeCI3.spaceValue}
                                                            hex={shadeCI3.hex}
                                                            alpha={ec.alpha}
                                                          />
                                                        </TooltipPrimitive.Content>
                                                      </TooltipPrimitive.Portal>
                                                    </Tooltip>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })
                                    )
                                  ) : groupTokens.length === 0 ? (
                                    <div className="tp-empty-dim tp-empty-text-sm">
                                      {reorderDropIndicator?.groupId === group.id && renderDropIndicator()}
                                      No variables in this group
                                    </div>
                                  ) : (
                                    <>
                                      {groupTokens.map((token, tIdx) => (
                                        <div key={token.id}>
                                          {shouldShowDropBefore(group.id, tIdx) && renderDropIndicator()}
                                          {renderToken(token)}
                                          {tIdx === groupTokens.length - 1 && shouldShowDropAfterLast(group.id, groupTokens.length) && renderDropIndicator()}
                                        </div>
                                      ))}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Trailing group drop indicator (after last group/palette) */}
                        {groupDropIndicator && groupDropIndicator.index >= unifiedItems.length && renderGroupDropIndicator()}

                        {/* Ungrouped tokens - rendered as a contiguous block in sortOrder for correct reordering */}
                        {(isSearchOrFilterActive || viewFilter !== 'palettes') && (
                          <div data-group-zone="__null__">
                            {filteredUngroupedTokens.length === 0 && reorderDropIndicator?.groupId === null && renderDropIndicator()}
                            {filteredUngroupedTokens.map((token, tIdx) => (
                              <div key={token.id} className="tp-ungrouped-token">
                                {shouldShowDropBefore(null, tIdx) && renderDropIndicator()}
                                {renderToken(token)}
                                {tIdx === filteredUngroupedTokens.length - 1 && shouldShowDropAfterLast(null, filteredUngroupedTokens.length) && renderDropIndicator()}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Empty state */}
                        {unifiedItems.length === 0 && filteredUngroupedTokens.length === 0 && (
                          <div className="tp-empty-dim tp-empty-state">
                            <p className="tp-empty-state-text">
                              {isSearchOrFilterActive
                                ? 'No matching results'
                                : viewFilter === 'palettes' ? 'No color palettes yet' : 'No variables yet'}
                            </p>
                            <p className="tp-empty-ghost tp-empty-state-hint">
                              {isSearchOrFilterActive
                                ? hasActiveFilters(searchFilters) ? 'Try adjusting your filters' : 'Try a different search term'
                                : viewFilter === 'palettes' ? 'Add a palette node on the canvas to get started' : 'Create variables to organize your colors'}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Bulk Actions Panel - Show at bottom when tokens are selected */}
          {selectedTokens.size > 0 && (
            <div className="tp-bulk-panel">
              {/* Header */}
              <div className={`tp-bulk-header ${!isReadOnly ? 'tp-bulk-header-bordered' : ''}`}>
                <div className="tp-bulk-header-left">
                  <span className="tp-bulk-count">{selectedTokens.size} variable{selectedTokens.size > 1 ? 's' : ''} selected</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="tp-bulk-select-all tp-bulk-select-all-wrap"
                    onClick={() => {
                      const tokensInProject = tokens.filter(t => t.projectId === activeProjectId);
                      const allSelected = selectedTokens.size === tokensInProject.length && tokensInProject.length > 0;
                      if (allSelected) {
                        deselectAllTokens();
                      } else {
                        selectAllTokens();
                      }
                    }}
                  >
                    {(() => {
                      const tokensInProject = tokens.filter(t => t.projectId === activeProjectId);
                      const allSelected = selectedTokens.size === tokensInProject.length && tokensInProject.length > 0;
                      return allSelected ? 'Deselect all' : 'Select all';
                    })()}
                  </Button>
                </div>
                <div className="tp-bulk-header-right">
                  {/* Bulk visibility toggle (shown in both primary and non-primary themes) — hidden for mixed/token-node selections */}
                  {isReadOnly && !selectionHasMixedTokenNodeTypes && !selectionAllTokenNodeTokens && (() => {
                    const selectedTokenList = tokens.filter(t => selectedTokens.has(t.id));
                    const hiddenCount = selectedTokenList.filter(t => isTokenExplicitlyHidden(t, activeThemeId || '', primaryThemeId || '')).length;
                    const visibleCount = selectedTokenList.length - hiddenCount;
                    const allTokensVisible = hiddenCount === 0;
                    const allTokensHidden = visibleCount === 0;
                    const mixedTokenVis = !allTokensVisible && !allTokensHidden;
                    return (
                      <Tip label={allTokensVisible ? 'Hide selected' : allTokensHidden ? 'Show selected' : 'Mixed visibility'} side="bottom">
                        <button
                          className={`tp-bulk-vis-btn ${mixedTokenVis
                              ? 'tp-bulk-vis-ghost'
                              : allTokensHidden
                                ? 'tp-bulk-vis-brand'
                                : 'tp-bulk-vis-faint'
                            }`}
                          disabled={mixedTokenVis}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (mixedTokenVis) return;
                            selectedTokenList.forEach(token => {
                              const vis = { ...(token.themeVisibility || {}) };
                              if (allTokensVisible) {
                                vis[activeThemeId || ''] = false;
                              } else {
                                delete vis[activeThemeId || ''];
                              }
                              onUpdateToken(token.id, { themeVisibility: Object.keys(vis).length > 0 ? vis : undefined } as any);
                            });
                          }}
                        >
                          {allTokensHidden ? <EyeOff className="tp-icon-3\.5" /> : <Eye className="tp-icon-3\.5" />}
                        </button>
                      </Tip>
                    );
                  })()}
                  <Tip label="Clear Selection" side="bottom">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="tp-bulk-clear tp-bulk-clear-wrap"
                      onClick={(e) => {
                        e.stopPropagation();
                        deselectAllTokens();
                      }}
                    >
                      <X className="tp-icon-3" />
                    </Button>
                  </Tip>
                </div>
              </div>

              {/* Panel Content — primary theme only (move to group, visibility, delete) */}
              {!isReadOnly && (
                <div className="tp-bulk-content">
                  {/* When mixed selection or all-token-node selection, disable all bulk actions */}
                  {selectionHasMixedTokenNodeTypes ? (
                    <div className="tp-bulk-info-row">
                      <span className="tp-bulk-info tp-bulk-info-text">Mixed selection — actions disabled</span>
                    </div>
                  ) : selectionAllTokenNodeTokens ? (
                    <div className="tp-bulk-info-row">
                      <span className="tp-bulk-info tp-bulk-info-text">Token node variables — managed on canvas</span>
                    </div>
                  ) : (
                    <div className="tp-bulk-actions-row">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="tp-move-btn tp-move-btn-wrap"
                          >
                            <Folder className="tp-icon-3 tp-icon-mr-1\.5" />
                            Move to group
                            <ChevronDown className="tp-icon-3 tp-icon-ml-1\.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="tp-move-dropdown tp-move-dropdown-wrap">
                          <DropdownMenuItem
                            onClick={() => bulkMoveToGroup(null)}
                            className="tp-move-dropdown-item"
                          >
                            No group
                          </DropdownMenuItem>
                          {regularGroups.length > 0 && <DropdownMenuSeparator className="tp-dropdown-separator" />}
                          {regularGroups.map(group => (
                            <DropdownMenuItem
                              key={group.id}
                              onClick={() => bulkMoveToGroup(group.id)}
                              className="tp-move-dropdown-item"
                            >
                              <Folder className="tp-icon-3 tp-icon-mr-2" />
                              {group.name}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator className="tp-dropdown-separator" />
                          <DropdownMenuItem
                            onClick={() => {
                              const ids = [...selectedTokens];
                              createGroupAndMoveTokens(ids);
                              deselectAllTokens();
                            }}
                            className="tp-move-dropdown-item"
                          >
                            <FolderPlus className="tp-icon-3 tp-icon-mr-2" />
                            New group
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Bulk visibility toggle */}
                      {(() => {
                        const selectedTokenList = tokens.filter(t => selectedTokens.has(t.id));
                        const hiddenCount = selectedTokenList.filter(t => isTokenExplicitlyHidden(t, activeThemeId || '', primaryThemeId || '')).length;
                        const visibleCount = selectedTokenList.length - hiddenCount;
                        const allTokensVisible = hiddenCount === 0;
                        const allTokensHidden = visibleCount === 0;
                        const mixedTokenVis = !allTokensVisible && !allTokensHidden;
                        return (
                          <Tip label={allTokensVisible ? 'Hide selected' : allTokensHidden ? 'Show selected' : 'Mixed visibility'} side="top">
                            <Button
                              size="sm"
                              variant="outline"
                              className={`tp-bulk-vis-btn-lg ${mixedTokenVis
                                  ? 'tp-bulk-vis-ghost-btn'
                                  : allTokensHidden
                                    ? 'tp-bulk-vis-brand-active'
                                    : 'tp-bulk-vis-default-btn'
                                }`}
                              disabled={mixedTokenVis}
                              onClick={() => {
                                if (mixedTokenVis) return;
                                selectedTokenList.forEach(token => {
                                  const vis = { ...(token.themeVisibility || {}) };
                                  if (allTokensVisible) {
                                    vis[activeThemeId || ''] = false;
                                  } else {
                                    delete vis[activeThemeId || ''];
                                  }
                                  onUpdateToken(token.id, { themeVisibility: Object.keys(vis).length > 0 ? vis : undefined } as any);
                                });
                              }}
                            >
                              {allTokensHidden ? <EyeOff className="tp-icon-3\.5" /> : <Eye className="tp-icon-3\.5" />}
                            </Button>
                          </Tip>
                        );
                      })()}

                      <Tip label="Delete selected" side="top">
                        <Button
                          size="sm"
                          variant="outline"
                          className="tp-bulk-delete-btn tp-bulk-delete-btn-wrap"
                          onClick={handleBulkDeleteTokens}
                        >
                          <Trash2 className="tokens-panel-context-icon" />
                        </Button>
                      </Tip>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Resize Handle */}
          <div
            className="tp-resize-handle group"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsResizing(true);
            }}
            title="Resize panel"
          >
            <svg
              className="tp-resize-svg"
              viewBox="0 0 12 12"
              fill="none"
              style={{ color: 'var(--grey-700)' }}
            >
              <path d="M10 2L2 10M10 6L6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Delete Group Confirmation Dialog */}
      <AlertDialog open={deleteGroupDialogOpen} onOpenChange={setDeleteGroupDialogOpen}>
        <AlertDialogContent className="tp-dialog-content">
          <AlertDialogHeader>
            <AlertDialogTitle className="tp-dialog-title">Delete Group?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="tp-dialog-desc tp-dialog-space-y-2">
                {groupToDelete && (
                  <>
                    <div>
                      You are about to delete the group <span className="tp-dialog-highlight tp-dialog-font-semibold">"{groupToDelete.name}"</span>.
                    </div>
                    <div>
                      This group contains <span className="tp-dialog-highlight tp-dialog-font-semibold">{groupToDelete.tokenCount} token{groupToDelete.tokenCount !== 1 ? 's' : ''}</span>.
                    </div>
                    {groupToDelete.assignedCount > 0 && (
                      <div className="tp-dialog-text-warning">
                        ⚠️ <span className="tp-dialog-font-semibold">{groupToDelete.assignedCount} token{groupToDelete.assignedCount !== 1 ? 's are' : ' is'}</span> currently assigned to nodes and will be removed from those nodes.
                      </div>
                    )}
                    <div className="tp-dialog-destructive tp-dialog-font-semibold tp-dialog-mt-3">
                      All tokens in this group will be permanently deleted.
                    </div>
                    <div className="tp-dialog-text-sm">
                      This action cannot be undone.
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="tp-dialog-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => groupToDelete && confirmDeleteGroup(groupToDelete.id)}
              className="tp-dialog-delete-btn"
            >
              Delete Group & Tokens
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto-assign Token Delete Confirmation Dialog */}
      <AlertDialog
        open={autoAssignDeleteDialog.open}
        onOpenChange={(open) => setAutoAssignDeleteDialog(prev => ({ ...prev, open }))}
      >
        <AlertDialogContent className="tp-aa-dialog-content tp-aa-dialog-content-wrap">
          <AlertDialogHeader>
            <AlertDialogTitle className="tp-dialog-title tp-aa-dialog-title-row">
              <Zap size={14} className="tp-aa-dialog-zap" />
              {autoAssignDeleteDialog.items.length === 1
                ? 'Delete auto-assigned token?'
                : `Delete ${autoAssignDeleteDialog.items.length} auto-assigned tokens?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="tp-dialog-desc tp-dialog-space-y-3">
                {autoAssignDeleteDialog.items.length === 1 ? (
                  <>
                    <div>
                      The token <span className="tp-aa-dialog-highlight-mono">
                        {autoAssignDeleteDialog.items[0]?.tokenName}
                      </span> will be permanently deleted from the token panel.
                    </div>
                    <div className="tp-aa-dialog-subtle tp-aa-dialog-text-12">
                      This token was auto-assigned to node <span className="tp-dialog-highlight">{autoAssignDeleteDialog.items[0]?.nodeName}</span>.
                      It may be recreated if the parent node&apos;s auto-assign is re-applied.
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      The following auto-assigned tokens will be permanently deleted from the token panel:
                    </div>
                    <div className="tp-aa-dialog-list">
                      {autoAssignDeleteDialog.items.map(item => (
                        <div key={item.tokenId} className="tp-aa-dialog-item-row">
                          <Zap size={10} className="tp-aa-dialog-zap tp-eyeoff-icon" />
                          <span className="tp-aa-dialog-highlight-mono tp-truncate">
                            {item.tokenName}
                          </span>
                          <span className="tp-aa-dialog-arrow">&rarr;</span>
                          <span className="tp-aa-dialog-subtle tp-truncate">{item.nodeName}</span>
                        </div>
                      ))}
                    </div>
                    {autoAssignDeleteDialog.nonAutoTokenIds.length > 0 && (
                      <div className="tp-aa-dialog-subtle tp-aa-dialog-text-12">
                        + {autoAssignDeleteDialog.nonAutoTokenIds.length} other token{autoAssignDeleteDialog.nonAutoTokenIds.length > 1 ? 's' : ''} will also be deleted.
                      </div>
                    )}
                    <div className="tp-aa-dialog-subtle tp-aa-dialog-text-12">
                      These tokens may be recreated if the parent node&apos;s auto-assign is re-applied.
                    </div>
                  </>
                )}
                <label className="tp-aa-dialog-checkbox-label tp-aa-dialog-checkbox-wrap group">
                  <div
                    className={`tp-aa-checkbox ${autoAssignDeleteDialog.excludeFromAutoAssign
                        ? 'tp-aa-checkbox-checked'
                        : 'tp-aa-checkbox-unchecked'
                      }`}
                    onClick={(e) => {
                      e.preventDefault();
                      setAutoAssignDeleteDialog(prev => ({
                        ...prev,
                        excludeFromAutoAssign: !prev.excludeFromAutoAssign,
                      }));
                    }}
                  >
                    {autoAssignDeleteDialog.excludeFromAutoAssign && (
                      <Check size={10} className="tp-check-icon-dark" />
                    )}
                  </div>
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      setAutoAssignDeleteDialog(prev => ({
                        ...prev,
                        excludeFromAutoAssign: !prev.excludeFromAutoAssign,
                      }));
                    }}
                  >
                    <div className="tp-dialog-highlight tp-aa-checkbox-label">
                      Don&apos;t auto-assign {autoAssignDeleteDialog.items.length === 1 ? 'token for this node' : 'tokens for these nodes'}
                    </div>
                    <div className="tp-aa-dialog-faint tp-aa-checkbox-hint">
                      Future re-apply or updates will skip {autoAssignDeleteDialog.items.length === 1 ? 'this node' : 'these nodes'}
                    </div>
                  </div>
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="tp-dialog-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAutoAssignDelete}
              className="tp-dialog-delete-btn"
            >
              {autoAssignDeleteDialog.items.length === 1
                ? 'Delete Token'
                : `Delete ${autoAssignDeleteDialog.items.length + autoAssignDeleteDialog.nonAutoTokenIds.length} Tokens`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </TooltipProvider>
  );
}