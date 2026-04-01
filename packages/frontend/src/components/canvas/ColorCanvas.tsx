import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { ColorNode as ColorNodeType, DesignToken, TokenProject, TokenGroup, Page } from '../../types';
import { ColorNodeCard } from './ColorNodeCard';
import { SpacingNodeCard } from './SpacingNodeCard';
import { PaletteNodeCard } from './PaletteNodeCard';
import { TokenNodeCard } from '../tokens/TokenNodeCard';
import { AutoAssignTokenMenu, getAutoAssignSuffixValue } from './AutoAssignTokenMenu';
import { AdvancedPopup } from './AdvancedPopup';
import { Zap, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react';
import { Tip } from '../Tip';
import { motion, AnimatePresence } from 'motion/react';
import namer from 'color-namer';
import { toast } from "sonner";
import { isNodeNameTaken } from '../../utils/nameValidation';
import { MAX_NODE_NAME } from '../../utils/textLimits';
import { isNodeHiddenInTheme, toggleVisibilityMap } from '../../utils/visibility';
import { NodeAdvancedLogic } from '../../types';
import {
  evaluateChannelLogic,
  nodeToChannelMapThemeAware,
  EvalContext,
  evaluateAllTokenAssignments,
  TokenAssignExportResult,
  TokenColor,
} from '../../utils/advanced-logic-engine';
import { tokenColorToNativeCSS } from '../../utils/tokenFormatters';

// ─── Reference Name Utilities ──────────────────────────────────

/** Generate a human-readable color name from HSL values */
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

/**
 * Compute the display prefix for a node.
 * 1. If the node itself is locked → its own referenceName
 * 2. Walk up the tree: first locked ancestor → that ancestor's referenceName
 * 3. No locked ancestor → auto-generate from node's color
 */
function getNodePrefix(node: ColorNodeType, allNodes: ColorNodeType[]): string {
  if (node.referenceNameLocked && node.referenceName) {
    return node.referenceName;
  }
  // Walk up to find nearest locked ancestor
  let current: ColorNodeType | undefined = node;
  while (current?.parentId) {
    const parent = allNodes.find(n => n.id === current!.parentId);
    if (!parent) break;
    if (parent.referenceNameLocked && parent.referenceName) {
      return parent.referenceName;
    }
    current = parent;
  }
  // No locked ancestor → auto-generate from color
  return generateRefColorName(node.hue, node.saturation, node.lightness);
}

/**
 * Compute the hierarchical suffix for a node based on parent-child-sibling relationships.
 * Root nodes → "" (no suffix)
 * Children → parent suffix + "/" + 1-based sibling index
 * Siblings are ordered by creation time (ID ascending).
 */
function getNodeSuffix(node: ColorNodeType, allNodes: ColorNodeType[]): string {
  if (!node.parentId) return '';
  const parent = allNodes.find(n => n.id === node.parentId);
  if (!parent) return '';
  // Get siblings of this node (same parentId), sorted by ID (creation order)
  const siblings = allNodes
    .filter(n => n.parentId === node.parentId && !n.isSpacing)
    .sort((a, b) => a.id.localeCompare(b.id));
  const index = siblings.findIndex(n => n.id === node.id) + 1;
  const parentSuffix = getNodeSuffix(parent, allNodes);
  return `${parentSuffix}/${index}`;
}

/**
 * Get the full display reference name for a node.
 * - Regular nodes: prefix + suffix  (e.g. "Red", "Red/1", "Red/1/2")
 * - Palette nodes: prefix + " palette"
 * - Palette shades: not shown (return empty)
 * - Spacing nodes: not shown (return empty)
 */
function getNodeFullReferenceName(
  node: ColorNodeType,
  allNodes: ColorNodeType[],
  isPaletteShade: boolean,
): string {
  if (node.isSpacing) return '';
  if (isPaletteShade) return '';
  if (node.isPalette) {
    const prefix = node.referenceNameLocked && node.referenceName
      ? node.referenceName
      : (node.paletteName || generateRefColorName(node.hue, node.saturation, node.lightness));
    return `${prefix} palette`;
  }
  // Token nodes use their own hierarchical path naming — no "/N" suffix
  if (node.isTokenNode && node.referenceName) {
    return node.referenceName;
  }
  const prefix = getNodePrefix(node, allNodes);
  const suffix = getNodeSuffix(node, allNodes);
  return prefix + suffix;
}

/** Inline reference-name label shown above a node on hover / selection */
function NodeReferenceLabel({
  node,
  allNodes,
  isVisible,
  isPaletteShade,
  nodeWidth,
  hasInheritanceBar,
  onUpdateNode,
  groups,
  tokens,
  activeProjectId,
  onAddToken,
  onAssignToken,
  onUpdateToken,
  onDeleteToken,
  onUpdateGroups,
  isPrompted,
  isPopupOpen,
  shouldOpenPopup,
  onPopupOpened,
  onPopupOpenChange,
  onSelectNode,
  isActiveMenu,
  isPrimaryTheme,
  onDragMouseDown,
  onTogglePrefix,
  readOnly,
}: {
  node: ColorNodeType;
  allNodes: ColorNodeType[];
  isVisible: boolean;
  isPaletteShade: boolean;
  nodeWidth: number;
  hasInheritanceBar: boolean;
  onUpdateNode: (id: string, updates: Partial<ColorNodeType>) => void;
  groups: TokenGroup[];
  tokens: DesignToken[];
  activeProjectId: string;
  onAddToken: (name?: string, groupId?: string | null, projectId?: string) => string | undefined;
  onAssignToken: (nodeId: string, tokenId: string, isAssigned: boolean) => void;
  onUpdateToken: (id: string, updates: Partial<DesignToken>) => void;
  onDeleteToken: (id: string) => void;
  onUpdateGroups: (groups: TokenGroup[] | ((prev: TokenGroup[]) => TokenGroup[])) => void;
  isPrompted: boolean;
  isPopupOpen: boolean;
  shouldOpenPopup: boolean;
  onPopupOpened: () => void;
  onPopupOpenChange: (isOpen: boolean) => void;
  onSelectNode: () => void;
  isActiveMenu: boolean;
  isPrimaryTheme: boolean;
  onDragMouseDown?: (e: React.MouseEvent) => void;
  onTogglePrefix?: (nodeId: string, makePrefix: boolean) => void;
  readOnly?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when editing starts (must be before any early returns)
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const fullName = getNodeFullReferenceName(node, allNodes, isPaletteShade);

  // Compute the editable prefix and the fixed suffix (needed for menu even if fullName is empty)
  const prefix = node.isPalette
    ? (node.referenceNameLocked && node.referenceName ? node.referenceName : (node.paletteName || generateRefColorName(node.hue, node.saturation, node.lightness)))
    : (node.isTokenNode && node.referenceName ? node.referenceName : getNodePrefix(node, allNodes));
  const fixedSuffix = node.isPalette
    ? ' palette'
    : (node.isTokenNode ? '' : getNodeSuffix(node, allNodes));

  // For palette shades and spacing nodes, don't render anything
  if (node.isSpacing) return null;
  if (isPaletteShade) return null;

  const handleStartEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditValue(prefix);
    setIsEditing(true);
  };

  const handleFinishEditing = () => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      if (node.isPalette) {
        onUpdateNode(node.id, {
          referenceName: undefined,
          referenceNameLocked: false,
          paletteNameLocked: false,
        });
      } else {
        onUpdateNode(node.id, {
          referenceName: undefined,
          referenceNameLocked: false,
        });
      }
    } else if (trimmed !== prefix) {
      // Check for duplicate node names within the same page
      // For token prefix nodes, allow matching another token prefix name (group merge behavior)
      if (node.isTokenNode && node.isTokenPrefix) {
        const collidingNodes = allNodes.filter(n =>
          n.id !== node.id &&
          n.pageId === (node.pageId || '') &&
          n.referenceNameLocked &&
          n.referenceName?.toLowerCase() === trimmed.toLowerCase()
        );
        const hasNonPrefixCollision = collidingNodes.some(n => !n.isTokenPrefix);
        if (hasNonPrefixCollision) {
          toast.error(`A node named "${trimmed}" already exists`);
          setIsEditing(false);
          return;
        }
        // If all collisions are with other token prefix nodes, allow (group merge)
      } else {
        if (isNodeNameTaken(trimmed, allNodes, node.pageId || '', node.id)) {
          toast.error(`A node named "${trimmed}" already exists`);
          setIsEditing(false);
          return;
        }
      }
      if (node.isPalette) {
        onUpdateNode(node.id, {
          referenceName: trimmed,
          referenceNameLocked: true,
          paletteName: trimmed,
          paletteNameLocked: true,
        });
      } else {
        onUpdateNode(node.id, {
          referenceName: trimmed,
          referenceNameLocked: true,
        });
      }
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishEditing();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  // Position: above the node. The inheritance bar is now flow-based (part of
  // the wrapper height), so we always use the same offset above the wrapper.
  const topOffset = -32;

  const containerVisible = isVisible || isEditing || isPrompted || isPopupOpen;

  return (
    <div
      className={`absolute left-0 z-30 flex items-center justify-between transition-opacity duration-150 ${containerVisible ? 'opacity-100' : 'opacity-0'
        }`}
      style={{ top: `${topOffset}px`, width: `${nodeWidth}px`, paddingBottom: 8 }}
      onMouseDown={(e) => {
        // Allow drag handle mouseDown to propagate to canvas
        const target = e.target as HTMLElement;
        if (target.closest('[data-drag-handle="true"]')) return;
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Left: Reference name label with drag handle */}
      <div className="group/nodelabel flex-1 min-w-0 flex items-center gap-0">
        {/* Drag handle — appears on hover of the name area */}
        {onDragMouseDown && !isEditing && fullName && (
          <div
            className="cursor-move opacity-0 group-hover/nodelabel:opacity-100 text-dim hover:!text-foreground transition-all shrink-0 -ml-2"
            onMouseDown={(e) => {
              e.stopPropagation();
              onDragMouseDown(e);
            }}
            onClick={(e) => e.stopPropagation()}
            data-drag-handle="true"
            title="Drag to move"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          {fullName && (
            <>
              {isEditing ? (
                <div className="flex items-center gap-0 bg-secondary rounded-md border border-elevated px-1 max-w-full">
                  <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleFinishEditing}
                    onKeyDown={handleKeyDown}
                    maxLength={MAX_NODE_NAME}
                    className="bg-transparent text-[16px] text-foreground outline-none py-0.5 min-w-[36px] max-w-[160px]"
                    style={{ width: `${Math.max(36, editValue.length * 10)}px` }}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                  <span className="text-[16px] text-faint select-none shrink-0">{fixedSuffix}</span>
                </div>
              ) : (
                <span
                  className={`text-[16px] text-subtle truncate cursor-default transition-colors px-1 py-0.5 rounded block ${isPrimaryTheme && !readOnly ? 'hover:text-[#bbb]' : ''}`}
                  onDoubleClick={isPrimaryTheme && !readOnly ? handleStartEditing : undefined}
                  title={isPrimaryTheme && !readOnly ? `${fullName} (double-click to rename)` : fullName}
                >
                  {fullName}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: Auto-assign token menu — only in primary theme, not for token nodes */}
      {/* In readOnly mode, AutoAssignTokenMenu shows as read-only indicator for enabled nodes */}
      {isPrimaryTheme && !node.isTokenNode && (
        <AutoAssignTokenMenu
          node={node}
          allNodes={allNodes}
          groups={groups}
          tokens={tokens}
          isVisible={containerVisible}
          defaultPrefix={prefix}
          activeProjectId={activeProjectId}
          onUpdateNode={onUpdateNode}
          onAddToken={onAddToken}
          onAssignToken={onAssignToken}
          onUpdateToken={onUpdateToken}
          onDeleteToken={onDeleteToken}
          onUpdateGroups={onUpdateGroups}
          shouldOpenPopup={shouldOpenPopup}
          onPopupOpened={onPopupOpened}
          onPopupOpenChange={onPopupOpenChange}
          onSelectNode={onSelectNode}
          isActiveMenu={isActiveMenu}
          readOnly={readOnly}
        />
      )}

      {/* Right: Prefix toggle for non-root token nodes — only in primary theme */}
      {(() => {
        if (!isPrimaryTheme || readOnly || !node.isTokenNode || !onTogglePrefix) return null;
        const isPrefix = !!node.isTokenPrefix;
        // Can toggle? Must have a token-node parent (i.e. not the root prefix)
        const parentIsToken = node.parentId && allNodes.find(n => n.id === node.parentId)?.isTokenNode;
        if (!parentIsToken) return null;
        return (
          <Tip label={isPrefix ? 'Convert to token' : 'Convert to prefix'} side="top">
            <button
              className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md cursor-pointer transition-all border ${isPrefix
                  ? 'bg-brand/10 border-brand/30 text-[#7B8FFF] hover:bg-brand/20 hover:border-brand/50'
                  : 'bg-transparent border-elevated text-dim hover:bg-secondary hover:border-border hover:text-subtle'
                }`}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePrefix(node.id, !isPrefix);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {isPrefix
                ? <ToggleRight className="w-3.5 h-3.5" />
                : <ToggleLeft className="w-3.5 h-3.5" />
              }
              <span className="text-[9px] tracking-wider uppercase select-none">
                Prefix
              </span>
            </button>
          </Tip>
        );
      })()}
    </div>
  );
}

interface ColorCanvasProps {
  nodes: ColorNodeType[];
  tokens: DesignToken[];
  projects: TokenProject[];
  groups: TokenGroup[];
  activeProjectId: string;
  onUpdateNode: (id: string, updates: Partial<ColorNodeType>) => void;
  onAddChild: (parentId: string, manualPosition?: { x: number; y: number }) => void;
  onAddParent: (nodeId: string) => void;
  onTogglePrefix?: (nodeId: string, makePrefix: boolean) => void;
  onDeleteNode: (id: string) => void;
  onUnlinkNode: (id: string) => void;
  onLinkNode: (nodeId: string, newParentId: string | null) => void;
  onAssignToken: (nodeId: string, tokenId: string, isAssigned: boolean) => void;
  onAddToken: (name?: string, groupId?: string | null, projectId?: string) => string | undefined;
  onUpdateToken: (id: string, updates: Partial<DesignToken>) => void;
  onDeleteToken: (id: string) => void;
  onUpdateProjects: (projects: TokenProject[]) => void;
  onUpdateGroups: (groups: TokenGroup[] | ((prev: TokenGroup[]) => TokenGroup[])) => void;
  onExportProject: (projectId: string) => void;
  onImportProject: () => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  selectedNodeIds: string[];
  onSelectNodeWithChildren: (id: string) => void;
  onMoveSelectedNodes: (draggedNodeId: string, deltaX: number, deltaY: number) => void;
  onClearMultiSelection: () => void;
  onUpdateMultiSelection: (nodeIds: string[]) => void;
  onUpdateNodeFromPanel?: (id: string, updates: Partial<ColorNodeType>) => void;
  canvasState: any;
  onUpdateCanvasState: any;
  sidebarMode: 'color' | 'variables' | 'text' | 'components' | 'animation' | 'layout';
  onSidebarModeChange: (mode: 'color' | 'variables' | 'text' | 'components' | 'animation' | 'layout') => void;
  onNavigateToProjects: () => void;
  showInheritanceIcon?: boolean; // Show crown icon for non-primary themes
  activeThemeId?: string; // Current active theme for theme-specific token assignments
  isPrimaryTheme?: boolean; // Whether the current active theme is the primary theme
  primaryThemeId?: string; // The primary theme's ID for comparing token assignments
  showAllVisible?: boolean; // Override dimming — show all nodes at full opacity
  autoAssignTriggerNodeId?: string | null; // External trigger to open auto-assign popup for a node
  onAutoAssignTriggered?: () => void; // Callback to clear the external trigger
  pages?: Page[]; // All pages for the active project (for cross-page token assignment)
  allProjectNodes?: ColorNodeType[]; // All nodes across all pages in the project
  advancedLogic?: NodeAdvancedLogic[]; // Advanced logic layer data (stored separately from nodes)
  onUpdateAdvancedLogic?: (logic: NodeAdvancedLogic[]) => void; // Update advanced logic
  onRevertThemeAdvancedLogic?: (nodeId: string, themeId: string) => void; // Clear theme-specific logic on relink
  readOnly?: boolean; // When true, hide editing UI like auto-assign menus
  showDevMode?: boolean; // Show webhook badges on nodes when Dev Mode is active
  onToggleWebhookInput?: (nodeId: string) => void; // Toggle isWebhookInput flag on a node
}

const ANIMATION_DURATION = 500; // milliseconds — default for fit-all, restore-view
const ZOOM_STEP_DURATION = 180; // milliseconds — snappy for incremental zoom in/out steps

// Navigation duration bounds (adaptive based on travel distance)
const NAV_MIN_DURATION = 200;  // very close → fast snap
const NAV_MAX_DURATION = 700;  // very far → still finishes promptly

// Custom easing: quintic ease-out for buttery-smooth deceleration
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

// Navigation-specific easing: gentle acceleration + smooth deceleration (camera-like)
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function ColorCanvas({ nodes, tokens, projects, groups, activeProjectId, onUpdateNode, onAddChild, onAddParent, onTogglePrefix, onDeleteNode, onUnlinkNode, onLinkNode, onAssignToken, onAddToken, onUpdateToken, onDeleteToken, onUpdateProjects, onUpdateGroups, onExportProject, onImportProject, selectedNodeId, onSelectNode, selectedNodeIds, onSelectNodeWithChildren, onMoveSelectedNodes, onClearMultiSelection, onUpdateMultiSelection, onUpdateNodeFromPanel, canvasState, onUpdateCanvasState, sidebarMode, onSidebarModeChange, onNavigateToProjects, showInheritanceIcon = false, activeThemeId = '', isPrimaryTheme = true, primaryThemeId = '', showAllVisible = false, autoAssignTriggerNodeId = null, onAutoAssignTriggered, pages = [], allProjectNodes = [], advancedLogic = [], onUpdateAdvancedLogic, onRevertThemeAdvancedLogic, readOnly = false, showDevMode = false, onToggleWebhookInput }: ColorCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const isDraggingOrJustDraggedRef = useRef(false);

  // Wire connection dragging state
  const [isDraggingWire, setIsDraggingWire] = useState(false);
  const [wireStartNodeId, setWireStartNodeId] = useState<string | null>(null);
  const [wireStartButtonType, setWireStartButtonType] = useState<'left' | 'right' | null>(null);
  const [wireMousePosition, setWireMousePosition] = useState({ x: 0, y: 0 });
  const [wireHoverNodeId, setWireHoverNodeId] = useState<string | null>(null);

  // Wire hover with cross-type blocking: prevent hover highlight when dragging between token and non-token nodes
  const handleWireHoverStart = useCallback((targetNodeId: string) => {
    if (!wireStartNodeId) {
      setWireHoverNodeId(targetNodeId);
      return;
    }
    const startNode = nodes.find(n => n.id === wireStartNodeId);
    const targetNode = nodes.find(n => n.id === targetNodeId);
    if (startNode && targetNode && (!!startNode.isTokenNode !== !!targetNode.isTokenNode)) {
      // Cross-type: don't highlight
      return;
    }
    setWireHoverNodeId(targetNodeId);
  }, [wireStartNodeId, nodes]);

  // Connection error state
  const [connectionError, setConnectionError] = useState<{ nodeId: string; message: string } | null>(null);

  // Hovered node tracking for reference name labels
  const [hoveredCanvasNodeId, setHoveredCanvasNodeId] = useState<string | null>(null);

  // Auto-assign token prompt state
  const [autoAssignPromptNodeId, setAutoAssignPromptNodeId] = useState<string | null>(null);
  const autoAssignPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNodeIdsRef = useRef<Set<string>>(new Set(nodes.map(n => n.id)));
  // Tracks which node should have its auto-assign popup force-opened (after prompt bubble click)
  const [autoAssignExpandNodeId, setAutoAssignExpandNodeId] = useState<string | null>(null);
  // Tracks which node currently has its auto-assign popup open (for z-index boost + label visibility)
  const [autoAssignPopupNodeId, setAutoAssignPopupNodeId] = useState<string | null>(null);

  // ── Advanced Popup state (persisted to localStorage) ─────────────────
  const [advancedPopupNodeId, setAdvancedPopupNodeId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem('advanced-popup-state-v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.nodeId || null;
      }
    } catch { /* ignore */ }
    return null;
  });
  const advancedPopupNodeIdRef = useRef<string | null>(advancedPopupNodeId);
  const advancedPopupSavedView = useRef<{ pan: { x: number; y: number }; zoom: number } | null>(null);
  const [isAdvancedPopupMinimized, setIsAdvancedPopupMinimized] = useState(() => {
    try {
      const stored = localStorage.getItem('advanced-popup-state-v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        return !!parsed.minimized;
      }
    } catch { /* ignore */ }
    return false;
  });
  const isAdvancedPopupMinimizedRef = useRef(isAdvancedPopupMinimized);
  const advancedPopupRestoredRef = useRef(false);
  // Keep refs in sync for stable-deps effects
  useEffect(() => { advancedPopupNodeIdRef.current = advancedPopupNodeId; }, [advancedPopupNodeId]);
  useEffect(() => { isAdvancedPopupMinimizedRef.current = isAdvancedPopupMinimized; }, [isAdvancedPopupMinimized]);

  // Persist Advanced Popup state to localStorage on change
  useEffect(() => {
    try {
      if (advancedPopupNodeId) {
        localStorage.setItem('advanced-popup-state-v1', JSON.stringify({
          nodeId: advancedPopupNodeId,
          minimized: isAdvancedPopupMinimized,
        }));
      } else {
        localStorage.removeItem('advanced-popup-state-v1');
      }
    } catch { /* ignore quota errors */ }
  }, [advancedPopupNodeId, isAdvancedPopupMinimized]);

  // External trigger: open auto-assign popup for a specific node (e.g. from keyboard shortcut)
  useEffect(() => {
    if (autoAssignTriggerNodeId) {
      // Select the node first so the label row is visible
      onSelectNode(autoAssignTriggerNodeId);
      // Force-open the auto-assign popup
      setAutoAssignExpandNodeId(autoAssignTriggerNodeId);
      // Clear the external trigger
      onAutoAssignTriggered?.();
    }
  }, [autoAssignTriggerNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pan and zoom state - initialize from canvasState with defensive defaults
  const [zoom, setZoom] = useState(canvasState?.zoom || 1);
  const [pan, setPan] = useState(canvasState?.pan || { x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [hasInitializedView, setHasInitializedView] = useState(!!canvasState); // Initialize based on whether we have saved state

  const panningRef = useRef(false);
  const currentMousePos = useRef({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);
  const wheelRafId = useRef<number | null>(null);
  const pendingWheelUpdate = useRef<{ pan?: { x: number; y: number }; zoom?: number } | null>(null);

  // Shared animation cancellation ref — only one smooth animation can run at a time.
  // Both `animateTo` and toolbar-driven `smoothAnimate` write to this ref so a new
  // animation automatically cancels any in-flight one, preventing competing rAF loops
  // that cause the "zoom-out-then-zoom-in" jitter.
  const animationRafRef = useRef<number | null>(null);

  // Track the in-flight animation's TARGET pan/zoom.  When zoom-step events
  // fire faster than the animation duration (keyboard repeat), the next step
  // should chain from the *intended* target rather than the barely-changed
  // current value — otherwise zoom crawls instead of accelerating properly.
  const smoothAnimateTargetRef = useRef<{ pan: { x: number; y: number }; zoom: number } | null>(null);

  // Track whether a smooth animation is currently running (for willChange GPU hint)
  const [isAnimating, setIsAnimating] = useState(false);

  // Ref for nodesWithColorPickerOpen so wheel handler doesn't need to re-register
  const nodesWithColorPickerOpenRef = useRef<Set<string>>(new Set());

  // Track last known canvas-relative mouse position (for wire drag initialization)
  const lastCanvasMousePosRef = useRef({ x: 0, y: 0 });
  // RAF-based wire mouse position tracking
  const wireMousePosRef = useRef({ x: 0, y: 0 });
  const wireRafId = useRef<number | null>(null);

  // Track which nodes have color pickers open
  const [nodesWithColorPickerOpen, setNodesWithColorPickerOpen] = useState<Set<string>>(new Set());
  nodesWithColorPickerOpenRef.current = nodesWithColorPickerOpen;

  // Track which node should auto-open its color picker (for arrow key navigation)
  const [nodeToAutoOpenColorPicker, setNodeToAutoOpenColorPicker] = useState<string | null>(null);

  // Ensure pan is always valid (safety check) - defined early for use in callbacks
  const safePan = pan || { x: 0, y: 0 };

  // Sync local state with canvasState when project changes
  useEffect(() => {
    if (canvasState) {
      setZoom(canvasState.zoom);
      setPan(canvasState.pan);
      // Mark as initialized since we have a saved state
      setHasInitializedView(true);
    } else {
      // No saved state, allow centering to happen
      setHasInitializedView(false);
    }
  }, [activeProjectId]);

  // Update parent's canvasState when pan or zoom changes.
  // Debounced so rapid animation frames don't trigger 60+ App.tsx re-renders per second.
  const canvasStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!onUpdateCanvasState) return;
    if (canvasStateTimerRef.current) clearTimeout(canvasStateTimerRef.current);
    canvasStateTimerRef.current = setTimeout(() => {
      onUpdateCanvasState({ pan, zoom });
      canvasStateTimerRef.current = null;
    }, 150);
    return () => {
      if (canvasStateTimerRef.current) clearTimeout(canvasStateTimerRef.current);
    };
  }, [pan, zoom, onUpdateCanvasState]);

  // ─── Auto-assign: detect new nodes → prompt or auto-create tokens ──────
  useEffect(() => {
    const currentIds = new Set(nodes.map(n => n.id));
    const prevIds = prevNodeIdsRef.current;

    // Find newly added nodes
    const newNodes = nodes.filter(n => !prevIds.has(n.id) && !n.isPalette && !n.isSpacing && !n.isTokenNode);

    // Determine if this is a multi-node batch (more than one node added at once,
    // e.g. multi-select duplicate/paste or duplicating a parent-child subtree).
    // Suppress the auto-assign prompt for any multi-node operation.
    const isMultiNodeBatch = newNodes.length > 1;

    for (const newNode of newNodes) {
      // Skip palette shade children
      const nodeParent = newNode.parentId ? nodes.find(n => n.id === newNode.parentId) : null;
      if (nodeParent?.isPalette) continue;

      if (!newNode.parentId) {
        // ── New root node → prompt for auto-assign on itself (single-node ops only) ──
        if (!isMultiNodeBatch) {
          setAutoAssignPromptNodeId(newNode.id);
          if (autoAssignPromptTimerRef.current) clearTimeout(autoAssignPromptTimerRef.current);
          autoAssignPromptTimerRef.current = setTimeout(() => {
            setAutoAssignPromptNodeId(prev => prev === newNode.id ? null : prev);
          }, 5000);
        }
      } else if (nodeParent) {
        // ── New child node ──
        // Check if parent already has auto-assign enabled → prospective auto-assign
        if (nodeParent.autoAssignEnabled && !newNode.autoAssignedTokenId && !newNode.autoAssignExcluded) {
          const directSiblings = nodes
            .filter(n => n.parentId === nodeParent.id && !n.isPalette && !n.isSpacing && !n.autoAssignExcluded)
            .filter(n => !(nodes.find(p => p.id === n.parentId)?.isPalette))
            .sort((a, b) => a.id.localeCompare(b.id));
          const childIndex = directSiblings.findIndex(n => n.id === newNode.id);
          if (childIndex >= 0) {
            const suffixVal = getAutoAssignSuffixValue(
              nodeParent.autoAssignSuffix || '1-9',
              childIndex,
              nodeParent.autoAssignStartFrom
            );
            const tokenName = `${nodeParent.autoAssignPrefix || 'Color'}-${suffixVal}`;
            const newTokenId = onAddToken(tokenName, nodeParent.autoAssignGroupId ?? null, activeProjectId);
            if (newTokenId) {
              onAssignToken(newNode.id, newTokenId, true);
              onUpdateNode(newNode.id, { autoAssignedTokenId: newTokenId });
            }
          }
        } else if (!isMultiNodeBatch) {
          // Check if this is the FIRST child of its parent (prompt for auto-assign)
          // Only show prompt for single-node operations
          const allSiblingsOfParent = nodes.filter(
            n => n.parentId === nodeParent.id && !n.isPalette && !n.isSpacing &&
              !(nodes.find(p => p.id === n.parentId)?.isPalette)
          );
          if (allSiblingsOfParent.length === 1) {
            // First child — prompt on the parent
            setAutoAssignPromptNodeId(nodeParent.id);
            if (autoAssignPromptTimerRef.current) clearTimeout(autoAssignPromptTimerRef.current);
            autoAssignPromptTimerRef.current = setTimeout(() => {
              setAutoAssignPromptNodeId(prev => prev === nodeParent.id ? null : prev);
            }, 5000);
          }
        }
      }
    }

    prevNodeIdsRef.current = currentIds;
  }, [nodes, onAddToken, onAssignToken, onUpdateNode, activeProjectId]);

  // Cleanup auto-assign prompt timer on unmount only
  useEffect(() => {
    return () => {
      if (autoAssignPromptTimerRef.current) clearTimeout(autoAssignPromptTimerRef.current);
    };
  }, []);

  // Dismiss auto-assign prompt
  const dismissAutoAssignPrompt = useCallback(() => {
    setAutoAssignPromptNodeId(null);
    if (autoAssignPromptTimerRef.current) {
      clearTimeout(autoAssignPromptTimerRef.current);
      autoAssignPromptTimerRef.current = null;
    }
  }, []);

  // Selection rectangle state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
  const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 });
  const [selectionStartedWithShift, setSelectionStartedWithShift] = useState(false);
  const [initialSelectionOnShiftDrag, setInitialSelectionOnShiftDrag] = useState<string[]>([]);

  // Smooth animated pan/zoom to a target — shared by all navigation paths.
  // Uses the shared animationRafRef so only ONE animation can run at a time.
  // Accepts optional duration, easing, and onComplete via options bag.
  const animateTo = useCallback((
    targetPan: { x: number; y: number },
    targetZoom: number,
    options?: { duration?: number; easing?: (t: number) => number; onComplete?: () => void },
  ) => {
    // Cancel any in-flight animation (from animateTo OR smoothAnimate)
    if (animationRafRef.current) {
      cancelAnimationFrame(animationRafRef.current);
      animationRafRef.current = null;
    }
    // Clear zoom-step chaining target — animateTo is an absolute navigation,
    // not a chained zoom step, so it should break any running chain.
    smoothAnimateTargetRef.current = null;
    const startPan = { ...pan };
    const startZoom = zoom;
    const startTime = performance.now();
    const duration = options?.duration ?? ANIMATION_DURATION;
    const easingFn = options?.easing ?? easeOutQuint;
    setIsAnimating(true);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const t = easingFn(progress);

      setPan({
        x: startPan.x + (targetPan.x - startPan.x) * t,
        y: startPan.y + (targetPan.y - startPan.y) * t,
      });
      setZoom(startZoom + (targetZoom - startZoom) * t);

      if (progress < 1) {
        animationRafRef.current = requestAnimationFrame(tick);
      } else {
        animationRafRef.current = null;
        setIsAnimating(false);
        options?.onComplete?.();
      }
    };

    animationRafRef.current = requestAnimationFrame(tick);
  }, [pan, zoom]);

  // Navigation to node function — smooth, adaptive camera animation
  const navigateToNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !canvasRef.current) return;

    // Select immediately so the node is highlighted as soon as navigation starts
    onSelectNode(nodeId);

    const viewportElement = canvasRef.current.parentElement || canvasRef.current;
    const rect = viewportElement.getBoundingClientRect();
    const viewportW = rect.width;
    const viewportH = rect.height;
    const centerX = viewportW / 2;
    const centerY = viewportH / 2;

    // ── Node-aware centering ──
    // Account for actual node width (palettes are wider, default is 240)
    const nodeW = node.width || 240;
    const nodeH = 280; // approximate card height
    const nodeCenterX = node.position.x + nodeW / 2;
    const nodeCenterY = node.position.y + nodeH / 2;

    // ── Gentle zoom ──
    // Only adjust zoom if very zoomed-out; otherwise keep current zoom for
    // a less jarring transition. Clamp to a comfortable reading range.
    const targetZoom = zoom < 0.35
      ? 0.55                        // zoomed very far out → bring in gently
      : zoom < 0.5
        ? zoom + (0.5 - zoom) * 0.5 // slightly zoomed out → nudge toward 0.5
        : zoom;                      // already comfortable → don't change

    const targetPan = {
      x: centerX - nodeCenterX * targetZoom,
      y: centerY - nodeCenterY * targetZoom,
    };

    // ── Adaptive duration ──
    // Scale duration based on screen-space travel distance so nearby nodes
    // feel snappy while distant ones still animate smoothly.
    const dx = targetPan.x - pan.x;
    const dy = targetPan.y - pan.y;
    const screenDist = Math.sqrt(dx * dx + dy * dy);
    const diagViewport = Math.sqrt(viewportW * viewportW + viewportH * viewportH);
    // Normalise: 0 = no movement, 1 = one full viewport diagonal
    const normalised = Math.min(screenDist / diagViewport, 2);
    // Map to duration: short hop → NAV_MIN_DURATION, far pan → NAV_MAX_DURATION
    const duration = Math.round(
      NAV_MIN_DURATION + (NAV_MAX_DURATION - NAV_MIN_DURATION) * Math.pow(normalised / 2, 0.6)
    );

    animateTo(targetPan, targetZoom, {
      duration,
      easing: easeInOutCubic,
    });
  }, [nodes, zoom, pan, animateTo, onSelectNode]);

  // Listen for external navigation requests (e.g., from TokensPanel / TokenTablePopup)
  useEffect(() => {
    const handleNavigateToNode = (e: Event) => {
      const customEvent = e as CustomEvent<{ nodeId: string }>;
      const { nodeId } = customEvent.detail;
      if (nodeId) {
        navigateToNode(nodeId);
      }
    };

    window.addEventListener('navigateToNode', handleNavigateToNode);
    return () => window.removeEventListener('navigateToNode', handleNavigateToNode);
  }, [navigateToNode]);

  // Listen for "restore canvas view" requests (e.g., back-button from TokenTablePopup)
  useEffect(() => {
    const handleRestore = (e: Event) => {
      const { pan: targetPan, zoom: targetZoom } = (e as CustomEvent<{ pan: { x: number; y: number }; zoom: number }>).detail;
      if (targetPan && targetZoom != null) {
        animateTo(targetPan, targetZoom);
      }
    };
    window.addEventListener('restoreCanvasView', handleRestore);
    return () => window.removeEventListener('restoreCanvasView', handleRestore);
  }, [animateTo]);

  // ── Listen for Advanced Popup open requests from node cards ──
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail;
      if (!nodeId || !canvasRef.current) return;
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Save current view for restoration on close
      advancedPopupSavedView.current = { pan: { ...pan }, zoom };

      // Open the popup (and ensure it's expanded, not minimized)
      setAdvancedPopupNodeId(nodeId);
      setIsAdvancedPopupMinimized(false);

      // Select the node so it's highlighted
      onSelectNode(nodeId);

      // Animate the selected node into view:
      // X: centered horizontally in viewport
      // Y: centered in the top half of the viewport (popup takes bottom half)
      const viewportEl = canvasRef.current!.parentElement || canvasRef.current!;
      const rect = viewportEl.getBoundingClientRect();
      const vw = rect.width;
      const vh = rect.height;

      const nodeW = node.width || 240;
      const nodeH = 280; // approximate card height
      const nodeCenterX = node.position.x + nodeW / 2;
      const nodeCenterY = node.position.y + nodeH / 2;

      // Fixed zoom: always present the node at a constant comfortable scale
      // regardless of the user's current zoom level (matches reference design).
      const ADVANCED_POPUP_ZOOM = 1.0;

      const targetPan = {
        x: vw / 2 - nodeCenterX * ADVANCED_POPUP_ZOOM,
        y: vh / 4 - nodeCenterY * ADVANCED_POPUP_ZOOM, // center of top-half
      };

      animateTo(targetPan, ADVANCED_POPUP_ZOOM, { duration: 450, easing: easeInOutCubic });
    };

    window.addEventListener('openAdvancedPopup', handleOpen);
    return () => window.removeEventListener('openAdvancedPopup', handleOpen);
  }, [nodes, pan, zoom, animateTo, onSelectNode]);

  // Close Advanced Popup handler — restores saved view
  const handleCloseAdvancedPopup = useCallback(() => {
    const saved = advancedPopupSavedView.current;
    setAdvancedPopupNodeId(null);
    setIsAdvancedPopupMinimized(false);
    if (saved) {
      animateTo(saved.pan, saved.zoom, { duration: 400, easing: easeInOutCubic });
      advancedPopupSavedView.current = null;
    }
  }, [animateTo]);

  // Minimize Advanced Popup — restore canvas view but keep popup node tracked
  const handleMinimizeAdvancedPopup = useCallback(() => {
    setIsAdvancedPopupMinimized(true);
    const saved = advancedPopupSavedView.current;
    if (saved) {
      animateTo(saved.pan, saved.zoom, { duration: 400, easing: easeInOutCubic });
    }
  }, [animateTo]);

  // Expand Advanced Popup — always bottom half, center node in top half, auto-select
  const handleExpandAdvancedPopup = useCallback(() => {
    setIsAdvancedPopupMinimized(false);
    const nodeId = advancedPopupNodeIdRef.current;
    // Auto-select the node when expanding
    if (nodeId) onSelectNode(nodeId);
    if (!nodeId || !canvasRef.current) return;
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Re-save current view for later restoration
    advancedPopupSavedView.current = { pan: { ...pan }, zoom };

    // Popup will always be bottom half → available canvas = top half (vh/2)
    const viewportEl = canvasRef.current.parentElement || canvasRef.current;
    const rect = viewportEl.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;
    const popupTopY = vh / 2; // popup starts at 50%
    const nodeW = node.width || 240;
    const nodeH = 280;
    const nodeCenterX = node.position.x + nodeW / 2;
    const nodeCenterY = node.position.y + nodeH / 2;
    const ADVANCED_POPUP_ZOOM = 1.0;
    const targetPan = {
      x: vw / 2 - nodeCenterX * ADVANCED_POPUP_ZOOM,
      y: popupTopY / 2 - nodeCenterY * ADVANCED_POPUP_ZOOM, // center in available top half
    };
    animateTo(targetPan, ADVANCED_POPUP_ZOOM, { duration: 450, easing: easeInOutCubic });
  }, [nodes, pan, zoom, animateTo, onSelectNode]);

  // Handle popup top edge change during resize — keep selected node visible in canvas area above popup
  const handlePopupTopChange = useCallback((topY: number) => {
    const nodeId = advancedPopupNodeIdRef.current;
    if (!nodeId || !canvasRef.current) return;
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const viewportEl = canvasRef.current.parentElement || canvasRef.current;
    const rect = viewportEl.getBoundingClientRect();
    const vw = rect.width;
    const nodeW = node.width || 240;
    const nodeH = 280;
    const nodeCenterX = node.position.x + nodeW / 2;
    const nodeCenterY = node.position.y + nodeH / 2;

    // Center node in the visible area above the popup (0 to topY)
    const visibleH = Math.max(topY, 100);
    const targetPanY = visibleH / 2 - nodeCenterY * zoom;
    const targetPanX = vw / 2 - nodeCenterX * zoom;

    setPan({ x: targetPanX, y: targetPanY });
  }, [nodes, zoom]);

  // ── Restore Advanced Popup state after page reload ──────────────────
  // Waits until the stored node actually exists in the loaded nodes list
  // (nodes are loaded from localStorage asynchronously via useEffect in App.tsx).
  // The ref guard ensures this only executes the restoration logic once.
  const advancedPopupRestoreAttemptsRef = useRef(0);
  useEffect(() => {
    if (advancedPopupRestoredRef.current) return;

    // No stored popup to restore
    if (!advancedPopupNodeId) {
      advancedPopupRestoredRef.current = true;
      return;
    }

    advancedPopupRestoreAttemptsRef.current += 1;

    // Wait until the node is found in the loaded data
    // (on initial render, nodes may still be default data, not yet loaded from localStorage)
    const node = nodes.find(n => n.id === advancedPopupNodeId);
    if (!node) {
      // After a few attempts (nodes loaded but node truly doesn't exist), clean up stale state
      if (advancedPopupRestoreAttemptsRef.current > 3) {
        advancedPopupRestoredRef.current = true;
        setAdvancedPopupNodeId(null);
        setIsAdvancedPopupMinimized(false);
      }
      return;
    }

    // Node found! Mark as restored so this never runs again
    advancedPopupRestoredRef.current = true;

    // Select the node so the panel and canvas show it highlighted
    onSelectNode(advancedPopupNodeId);

    // If not minimized, center the node in the visible area above the popup
    // (popup takes bottom half). Use rAF so layout is settled.
    if (!isAdvancedPopupMinimizedRef.current && canvasRef.current) {
      requestAnimationFrame(() => {
        if (!canvasRef.current) return;
        const viewportEl = canvasRef.current.parentElement || canvasRef.current;
        const rect = viewportEl.getBoundingClientRect();
        const vw = rect.width;
        const vh = rect.height;
        const nodeW = node.width || 240;
        const nodeH = 280;
        const nodeCenterX = node.position.x + nodeW / 2;
        const nodeCenterY = node.position.y + nodeH / 2;
        const ADVANCED_POPUP_ZOOM = 1.0;
        const targetPan = {
          x: vw / 2 - nodeCenterX * ADVANCED_POPUP_ZOOM,
          y: vh / 4 - nodeCenterY * ADVANCED_POPUP_ZOOM, // center in top-half
        };
        animateTo(targetPan, ADVANCED_POPUP_ZOOM, { duration: 450, easing: easeInOutCubic });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, advancedPopupNodeId]);

  // Derived flag: is the advanced popup truly active (node exists in current nodes)?
  // Prevents overlay/dimming during the brief loading phase before nodes load from localStorage.
  const advancedPopupNodeExists = advancedPopupNodeId ? nodes.some(n => n.id === advancedPopupNodeId) : false;

  // ── Global flag: does ANY token node on the current page have active advanced logic? ──
  const anyTokenNodeHasAdvancedLogic = useMemo(() => {
    const currentPageId = nodes[0]?.pageId;
    return advancedLogic.some(entry => {
      const entryNode = nodes.find(n => n.id === entry.nodeId);
      if (!entryNode || !entryNode.isTokenNode || entryNode.isTokenPrefix) return false;
      if (currentPageId && entryNode.pageId !== currentPageId) return false;
      // Resolve theme-effective logic
      const nodeHasOverride = !isPrimaryTheme && !!(entryNode.themeOverrides?.[activeThemeId]);
      const tokenUnlinked = nodeHasOverride || (!isPrimaryTheme && !!(entryNode.valueTokenAssignments?.[activeThemeId]));
      const ta = (!isPrimaryTheme && tokenUnlinked && entry.themeTokenAssignment?.[activeThemeId])
        ? entry.themeTokenAssignment[activeThemeId]
        : entry.tokenAssignment;
      if (ta?.rows?.some(r => r.enabled && r.tokens.length > 0)) return true;
      const channels = (!isPrimaryTheme && nodeHasOverride && entry.themeChannels?.[activeThemeId])
        ? entry.themeChannels[activeThemeId]
        : entry.channels;
      if (channels) {
        return Object.values(channels).some(ch => ch.rows.some(r => r.enabled && r.tokens.length > 0));
      }
      return false;
    });
  }, [advancedLogic, nodes, isPrimaryTheme, activeThemeId]);

  // ── Pre-evaluate token assignment outputs for all token nodes (for preview badges) ──
  const tokenAssignOutputs = useMemo(() => {
    if (!advancedLogic || advancedLogic.length === 0) return new Map<string, { type: 'color' | 'tokenRef' | 'error'; label: string; cssColor?: string }>();
    const allProjectNodesArr = allProjectNodes.length > 0 ? allProjectNodes : nodes;
    const allTokens = tokens;
    let computed: Map<string, any>;
    try {
      computed = evaluateAllTokenAssignments(advancedLogic, allTokens, allProjectNodesArr, activeThemeId, primaryThemeId);
    } catch {
      return new Map<string, { type: 'color' | 'tokenRef' | 'error'; label: string; cssColor?: string }>();
    }
    const result = new Map<string, { type: 'color' | 'tokenRef' | 'error'; label: string; cssColor?: string }>();
    for (const [tokenId, entry] of computed) {
      // Find the owning node to get its color space
      const ownerNode = allProjectNodesArr.find(n => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === tokenId);
      if (entry.result.type === 'computedColor') {
        const c = entry.result.color;
        const cs = ownerNode?.colorSpace || 'hsl';
        const cssColor = `hsla(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%, ${(c.a / 100).toFixed(2)})`;
        const nativeValue = tokenColorToNativeCSS(c, cs);
        result.set(tokenId, { type: 'color', label: nativeValue, cssColor });
      } else if (entry.result.type === 'tokenRef') {
        const refTokenId = entry.result.tokenId;
        const refTokenName = entry.result.tokenName;
        let refToken = allTokens.find(t => t.id === refTokenId);
        // Name-based fallback when ID is empty/stale
        if (!refToken && refTokenName) {
          refToken = allTokens.find(t => t.name === refTokenName || t.name.toLowerCase() === refTokenName.toLowerCase());
        }
        const refName = refToken?.name || refTokenName || 'unknown';
        // Also try to resolve the referenced token's color for display
        let refCssColor: string | undefined;
        if (refToken) {
          const tv = refToken.themeValues ? (refToken.themeValues[activeThemeId] || Object.values(refToken.themeValues)[0]) : null;
          const h = tv?.hue ?? refToken.hue ?? 0;
          const s = tv?.saturation ?? refToken.saturation ?? 0;
          const l = tv?.lightness ?? refToken.lightness ?? 50;
          const a = tv?.alpha ?? refToken.alpha ?? 100;
          if (tv?.hue !== undefined || refToken.hue !== undefined) {
            refCssColor = `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${(a / 100).toFixed(2)})`;
          }
        }
        result.set(tokenId, { type: 'tokenRef', label: refName, cssColor: refCssColor });
      } else if (entry.result.type === 'error') {
        const errMsg = entry.result.message;
        result.set(tokenId, { type: 'error', label: errMsg });
      }
    }
    return result;
  }, [advancedLogic, tokens, nodes, allProjectNodes, activeThemeId, primaryThemeId]);

  // ── Advanced Logic Evaluation → push computed values to nodes ──
  // Debounced to avoid rapid updates; only runs when advancedLogic changes
  const advancedLogicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!advancedLogic || advancedLogic.length === 0) return;

    // Debounce to batch rapid edits in the popup
    if (advancedLogicTimerRef.current) clearTimeout(advancedLogicTimerRef.current);
    advancedLogicTimerRef.current = setTimeout(() => {
      const currentNodes = nodes;
      advancedLogic.forEach(logicEntry => {
        const targetNode = currentNodes.find(n => n.id === logicEntry.nodeId);
        if (!targetNode) return;

        // Build evaluation context for this node
        const selfMap = nodeToChannelMapThemeAware(targetNode, activeThemeId, isPrimaryTheme);
        let parentMap: Record<string, number> | null = null;
        if (targetNode.parentId) {
          const parentNode = currentNodes.find(n => n.id === targetNode.parentId);
          if (parentNode) {
            parentMap = nodeToChannelMapThemeAware(parentNode, activeThemeId, isPrimaryTheme);
          }
        }
        const allNodesMap = new Map<string, Record<string, number>>();
        currentNodes.forEach(n => {
          if (!n.isSpacing && !n.isTokenNode) {
            allNodesMap.set(n.id, nodeToChannelMapThemeAware(n, activeThemeId, isPrimaryTheme));
          }
        });
        // Use stored baseValues for `locked` keyword to prevent feedback loops
        const lockedValues = logicEntry.baseValues || selfMap;
        // Build tokenValues map so {token}.H references work in channel logic
        const tokenValuesMap = new Map<string, TokenColor>();
        const projectTokens = tokens.filter(t => t.projectId === activeProjectId);
        projectTokens.forEach(t => {
          const tv = t.themeValues ? (t.themeValues[activeThemeId] || Object.values(t.themeValues)[0]) : null;
          const h = tv?.hue ?? t.hue ?? 0;
          const s = tv?.saturation ?? t.saturation ?? 0;
          const l = tv?.lightness ?? t.lightness ?? 50;
          const a = tv?.alpha ?? t.alpha ?? 100;
          if (tv?.hue !== undefined || tv?.saturation !== undefined || tv?.lightness !== undefined || t.hue !== undefined) {
            tokenValuesMap.set(t.id, { h, s, l, a });
          }
        });
        // Also resolve token node tokens through value assignments
        currentNodes.forEach(n => {
          if (!n.isTokenNode || n.isTokenPrefix || !n.ownTokenId) return;
          if (tokenValuesMap.has(n.ownTokenId)) return;
          const vtId = n.valueTokenAssignments?.[activeThemeId]
            || (primaryThemeId ? n.valueTokenAssignments?.[primaryThemeId] : undefined)
            || n.valueTokenId;
          if (!vtId) return;
          const vt = projectTokens.find(t => t.id === vtId);
          if (!vt) return;
          const vtv = vt.themeValues ? (vt.themeValues[activeThemeId] || Object.values(vt.themeValues)[0]) : null;
          const h = vtv?.hue ?? vt.hue ?? 0;
          const s = vtv?.saturation ?? vt.saturation ?? 0;
          const l = vtv?.lightness ?? vt.lightness ?? 50;
          const a = vtv?.alpha ?? vt.alpha ?? 100;
          tokenValuesMap.set(n.ownTokenId, { h, s, l, a });
        });
        const evalCtx: EvalContext = { self: selfMap, parent: parentMap, allNodes: allNodesMap, lockedValues };
        (evalCtx as any).tokenValues = tokenValuesMap;

        // Evaluate each channel that has logic
        const updates: Partial<ColorNodeType> = {};
        let hasUpdates = false;

        Object.entries(logicEntry.channels).forEach(([channelKey, channelLogic]) => {
          if (!channelLogic.rows || channelLogic.rows.length === 0) return;
          // Only evaluate enabled rows with tokens
          const hasEnabledRows = channelLogic.rows.some(r => r.enabled && r.tokens.length > 0);
          if (!hasEnabledRows) return;

          const baseValue = lockedValues[channelKey] ?? 0;
          const result = evaluateChannelLogic(channelLogic, { ...evalCtx, currentChannel: channelKey }, baseValue);

          if (result.source === 'logic' && !result.error) {
            const computedValue = result.value;
            // Only update if value is finite and actually changed (avoid infinite loops / bad values)
            if (isFinite(computedValue)) {
              const currentValue = selfMap[channelKey] ?? 0;
              if (Math.abs(computedValue - currentValue) > 0.01) {
                (updates as any)[channelKey] = computedValue;
                hasUpdates = true;
              }
            }
          }
        });

        if (hasUpdates) {
          onUpdateNode(logicEntry.nodeId, updates);
        }
      });
    }, 300);

    return () => {
      if (advancedLogicTimerRef.current) clearTimeout(advancedLogicTimerRef.current);
    };
  }, [advancedLogic, activeThemeId, isPrimaryTheme]);

  // ───── Listen for toolbar-driven canvas commands ─────
  // Uses refs (zoomRef, panRef, nodesRef) instead of state so this effect
  // registers listeners exactly ONCE and never re-runs during animation.
  useEffect(() => {
    // Stable animation helper — reads start values from refs at call-time.
    // Uses shared animationRafRef so only ONE animation runs at a time.
    const smoothAnimate = (targetPan: { x: number; y: number }, targetZoom: number, duration: number = ANIMATION_DURATION) => {
      // Cancel any in-flight animation (from animateTo OR a previous smoothAnimate)
      if (animationRafRef.current) {
        cancelAnimationFrame(animationRafRef.current);
        animationRafRef.current = null;
      }
      // Record the target so rapid-fire zoom steps (key repeat) can chain
      // from the intended destination instead of the partially-animated current.
      smoothAnimateTargetRef.current = { pan: { ...targetPan }, zoom: targetZoom };
      const startPan = { ...panRef.current };
      const startZoom = zoomRef.current;
      const startTime = performance.now();
      setIsAnimating(true);
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const t = easeOutQuint(progress);
        setPan({
          x: startPan.x + (targetPan.x - startPan.x) * t,
          y: startPan.y + (targetPan.y - startPan.y) * t,
        });
        setZoom(startZoom + (targetZoom - startZoom) * t);
        if (progress < 1) {
          animationRafRef.current = requestAnimationFrame(tick);
        } else {
          animationRafRef.current = null;
          smoothAnimateTargetRef.current = null;
          setIsAnimating(false);
        }
      };
      animationRafRef.current = requestAnimationFrame(tick);
    };

    const handleFitAll = () => {
      const ns = nodesRef.current;
      if (ns.length === 0 || !canvasRef.current) return;
      const viewportElement = canvasRef.current.parentElement || canvasRef.current;
      const rect = viewportElement.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const nodeWidth = 240;
      const nodeHeight = 280;
      let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
      ns.forEach(n => {
        const w = n.width || nodeWidth;
        mnX = Math.min(mnX, n.position.x);
        mnY = Math.min(mnY, n.position.y);
        mxX = Math.max(mxX, n.position.x + w);
        mxY = Math.max(mxY, n.position.y + nodeHeight);
      });
      const bw = mxX - mnX, bh = mxY - mnY;
      const pad = 300;
      const pw = bw + pad * 2, ph = bh + pad * 2;
      const tZ = Math.min(Math.max(Math.min(rect.width / pw, rect.height / ph), 0.1), 3);
      const ncx = (mnX + mxX) / 2, ncy = (mnY + mxY) / 2;
      smoothAnimate({ x: centerX - ncx * tZ, y: centerY - ncy * tZ }, tZ);
    };
    const handleResetView = () => {
      smoothAnimate({ x: 0, y: 0 }, 1);
    };
    const handleZoomIn = () => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.parentElement?.getBoundingClientRect() || canvasRef.current.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      // Chain from the in-flight animation's TARGET (not the partially-animated
      // current value) so keyboard-repeat zoom steps compound correctly.
      const target = smoothAnimateTargetRef.current;
      const z = target ? target.zoom : zoomRef.current;
      const p = target ? target.pan : panRef.current;
      const newZoom = Math.min(3, z * 1.25);
      const newPan = { x: cx - (cx - p.x) * (newZoom / z), y: cy - (cy - p.y) * (newZoom / z) };
      smoothAnimate(newPan, newZoom, ZOOM_STEP_DURATION);
    };
    const handleZoomOut = () => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.parentElement?.getBoundingClientRect() || canvasRef.current.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      // Chain from the in-flight animation's TARGET (see handleZoomIn comment)
      const target = smoothAnimateTargetRef.current;
      const z = target ? target.zoom : zoomRef.current;
      const p = target ? target.pan : panRef.current;
      const newZoom = Math.max(0.1, z * 0.8);
      const newPan = { x: cx - (cx - p.x) * (newZoom / z), y: cy - (cy - p.y) * (newZoom / z) };
      smoothAnimate(newPan, newZoom, ZOOM_STEP_DURATION);
    };
    window.addEventListener('canvasFitAll', handleFitAll);
    window.addEventListener('canvasResetView', handleResetView);
    window.addEventListener('canvasZoomIn', handleZoomIn);
    window.addEventListener('canvasZoomOut', handleZoomOut);

    // ───── Stable keyboard handler for zoom shortcuts ─────
    // Registered here (in the [] deps effect) so it is set up ONCE and never
    // torn down / re-registered.  The dep-heavy keyboard effect below handles
    // Space, arrow-nav, etc. that genuinely need reactive deps.
    const handleZoomKeyDown = (e: KeyboardEvent) => {
      // Block zoom shortcuts while advanced popup is open (but allow when minimized)
      if (advancedPopupNodeIdRef.current && !isAdvancedPopupMinimizedRef.current) return;
      // Don't interfere with input fields
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Cmd/Ctrl + = / +: Zoom in
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        e.stopImmediatePropagation(); // prevent the dep-heavy handler from also firing
        handleZoomIn();
        return;
      }

      // Cmd/Ctrl + -: Zoom out
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleZoomOut();
        return;
      }

      // Shift + 1: Zoom to fit all nodes
      if (!isTyping && e.shiftKey && e.key === '!') {
        const ns = nodesRef.current;
        if (ns.length === 0 || !canvasRef.current) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handleFitAll();
        return;
      }

      // Shift + 0: Reset view
      if (!isTyping && e.shiftKey && e.key === ')') {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleResetView();
        return;
      }
    };
    // Capture phase so it fires before any bubble-phase handlers
    window.addEventListener('keydown', handleZoomKeyDown, true);

    return () => {
      window.removeEventListener('canvasFitAll', handleFitAll);
      window.removeEventListener('canvasResetView', handleResetView);
      window.removeEventListener('canvasZoomIn', handleZoomIn);
      window.removeEventListener('canvasZoomOut', handleZoomOut);
      window.removeEventListener('keydown', handleZoomKeyDown, true);
    };
  }, []); // Stable — reads from refs, setPan/setZoom are stable React dispatchers

  // Center all nodes on initial load or when switching collections
  useEffect(() => {
    // Only center if we haven't initialized the view yet (no saved state)
    if (hasInitializedView || nodes.length === 0 || !canvasRef.current) {
      return;
    }

    // FIXED: Use parentElement to get the actual viewport container size
    const viewportElement = canvasRef.current.parentElement || canvasRef.current;
    const rect = viewportElement.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate bounding box of all nodes
    const nodeWidth = 240; // default node width
    const nodeHeight = 280; // approximate node height

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach(node => {
      const width = node.width || nodeWidth;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + width);
      maxY = Math.max(maxY, node.position.y + nodeHeight);
    });

    // Calculate bounding box dimensions
    const boundingWidth = maxX - minX;
    const boundingHeight = maxY - minY;

    // Add extra padding for a comfortable zoomed-out overview (600px on each side when zoomed)
    const padding = 600;
    const paddedWidth = boundingWidth + (padding * 2);
    const paddedHeight = boundingHeight + (padding * 2);

    // Calculate zoom to fit all nodes (with min zoom of 0.1 and max of 0.5 for a nice overview)
    const zoomToFitWidth = rect.width / paddedWidth;
    const zoomToFitHeight = rect.height / paddedHeight;
    const targetZoom = Math.min(Math.max(Math.min(zoomToFitWidth, zoomToFitHeight), 0.1), 0.5);

    // Calculate center of all nodes
    const nodesCenterX = (minX + maxX) / 2;
    const nodesCenterY = (minY + maxY) / 2;

    // Calculate pan to center the nodes with the new zoom
    const targetPan = {
      x: centerX - nodesCenterX * targetZoom,
      y: centerY - nodesCenterY * targetZoom,
    };

    setZoom(targetZoom);
    setPan(targetPan);
    setHasInitializedView(true);
  }, [nodes, hasInitializedView]);

  // Keyboard event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block canvas keyboard shortcuts while advanced popup is open (but allow when minimized)
      if (advancedPopupNodeIdRef.current && !isAdvancedPopupMinimizedRef.current) return;

      // Check if user is typing in an input field
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // NOTE: Zoom shortcuts (Cmd+=/-, Shift+1, Shift+0) are handled in the
      // stable [] deps effect above so they are never torn down / re-registered.

      // Arrow key navigation (only when not typing and a node is selected)
      if (!isTyping && selectedNodeId && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();

        const currentNode = nodes.find(n => n.id === selectedNodeId);
        if (!currentNode) return;

        // Check if the current node has its color picker open
        const wasColorPickerOpen = nodesWithColorPickerOpen.has(selectedNodeId);

        let newNodeId: string | null = null;

        // ── Detect sibling layout orientation ──
        // Gather all siblings (same parent) including the current node
        const allSiblingsIncludingCurrent = nodes
          .filter(n => n.parentId === currentNode.parentId && n.pageId === currentNode.pageId);

        // Determine if siblings are arranged horizontally or vertically
        let isHorizontalLayout = false;
        if (allSiblingsIncludingCurrent.length >= 2) {
          const xs = allSiblingsIncludingCurrent.map(n => n.position.x);
          const ys = allSiblingsIncludingCurrent.map(n => n.position.y);
          const xRange = Math.max(...xs) - Math.min(...xs);
          const yRange = Math.max(...ys) - Math.min(...ys);
          // Horizontal if X spread significantly exceeds Y spread
          isHorizontalLayout = xRange > yRange * 1.5 && xRange > 50;
        }

        // ── Map arrow keys based on layout orientation ──
        // Vertical layout (default):  Left=parent, Right=child, Up/Down=siblings
        // Horizontal layout:          Up=parent, Down=child, Left/Right=siblings
        const goToParent = isHorizontalLayout
          ? e.key === 'ArrowUp'
          : e.key === 'ArrowLeft';
        const goToChild = isHorizontalLayout
          ? e.key === 'ArrowDown'
          : e.key === 'ArrowRight';
        const goToPrevSibling = isHorizontalLayout
          ? e.key === 'ArrowLeft'
          : e.key === 'ArrowUp';
        const goToNextSibling = isHorizontalLayout
          ? e.key === 'ArrowRight'
          : e.key === 'ArrowDown';

        if (goToParent) {
          // Navigate to parent node
          if (currentNode.parentId) {
            newNodeId = currentNode.parentId;
          }
        } else if (goToChild) {
          // Navigate to first child node
          const children = nodes.filter(n => n.parentId === currentNode.id);
          if (children.length > 0) {
            // Detect children's own layout orientation (independent of parent's sibling layout)
            let childrenHorizontal = false;
            if (children.length >= 2) {
              const cxs = children.map(n => n.position.x);
              const cys = children.map(n => n.position.y);
              const cxRange = Math.max(...cxs) - Math.min(...cxs);
              const cyRange = Math.max(...cys) - Math.min(...cys);
              childrenHorizontal = cxRange > cyRange * 1.5 && cxRange > 50;
            }
            // Sort by primary axis of the children's layout to select the first one
            if (childrenHorizontal) {
              children.sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
            } else {
              children.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
            }
            newNodeId = children[0].id;
          }
        } else if (goToPrevSibling || goToNextSibling) {
          // Navigate between siblings
          if (allSiblingsIncludingCurrent.length > 1) {
            // Sort by the appropriate axis for the layout direction
            const sorted = [...allSiblingsIncludingCurrent].sort((a, b) =>
              isHorizontalLayout
                ? (a.position.x - b.position.x || a.position.y - b.position.y)
                : (a.position.y - b.position.y || a.position.x - b.position.x)
            );
            const currentIndex = sorted.findIndex(n => n.id === currentNode.id);

            if (goToPrevSibling) {
              if (currentIndex > 0) {
                newNodeId = sorted[currentIndex - 1].id;
              }
            } else {
              if (currentIndex < sorted.length - 1) {
                newNodeId = sorted[currentIndex + 1].id;
              }
            }
          }
        }

        // If we're navigating to a new node and the color picker was open, signal the new node to open its picker
        if (newNodeId && wasColorPickerOpen) {
          setNodeToAutoOpenColorPicker(newNodeId);
        }

        // Select the new node
        if (newNodeId) {
          onSelectNode(newNodeId);
        }

        return;
      }

      if (e.code === 'Space') {
        // Don't interfere with typing in input fields
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }

        // Don't allow panning if any color picker is open
        if (nodesWithColorPickerOpen.size > 0) {
          return;
        }

        // Prevent default scrolling behavior
        e.preventDefault();
        if (!isSpacePressed) {
          setIsSpacePressed(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Don't interfere with typing in input fields
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }

        e.preventDefault();
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    // Use capture phase to ensure we get the event before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      // Clean up any pending animation frames
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
      if (wheelRafId.current) {
        cancelAnimationFrame(wheelRafId.current);
      }
    };
  }, [isSpacePressed, nodesWithColorPickerOpen, selectedNodeId, nodes, onSelectNode, setNodeToAutoOpenColorPicker]);

  const handleColorPickerOpenChange = useCallback((nodeId: string, isOpen: boolean) => {
    setNodesWithColorPickerOpen(prev => {
      const newSet = new Set(prev);
      if (isOpen) {
        newSet.add(nodeId);
      } else {
        newSet.delete(nodeId);
      }
      return newSet;
    });
  }, []);

  const handleNodeSelect = (nodeId: string, e?: React.MouseEvent) => {
    // Prevent selection change if we're currently dragging or just finished dragging
    if (isDraggingOrJustDraggedRef.current) {
      return;
    }

    // If shift is pressed, toggle the node in multi-selection
    if (e?.shiftKey) {
      // Get current selection state
      const currentSelection = selectedNodeIds.length > 0
        ? selectedNodeIds
        : (selectedNodeId ? [selectedNodeId] : []);

      if (currentSelection.includes(nodeId)) {
        // Node is already selected, remove it from selection
        const newSelection = currentSelection.filter(id => id !== nodeId);

        if (newSelection.length === 0) {
          // If no nodes left in multi-selection, clear everything
          onSelectNode(null);
          onClearMultiSelection();
        } else if (newSelection.length === 1) {
          // If only one node left, switch back to single selection
          onSelectNode(newSelection[0]);
          onClearMultiSelection();
        } else {
          // Update multi-selection
          onUpdateMultiSelection(newSelection);
        }
      } else {
        // Node is not selected, add it to multi-selection
        const newSelection = [...currentSelection, nodeId];
        onUpdateMultiSelection(newSelection);
      }
    } else {
      // Normal click - select only this node
      onSelectNode(nodeId);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    // If space is pressed, allow panning instead of dragging node
    if (isSpacePressed) {
      return;
    }

    // In sample/readOnly mode we intentionally allow transient in-memory
    // repositioning so visitors can explore the canvas layout.  Changes
    // won't persist (localStorage save is skipped in sample mode).
    // Wire creation is still blocked separately below.

    // Don't start drag from interactive elements (dropdowns, inputs, sliders, etc.)
    const target = e.target as HTMLElement;
    if (
      target.closest('select') ||
      target.closest('[role="combobox"]') ||
      target.closest('[role="listbox"]') ||
      target.closest('[data-radix-popper-content-wrapper]') ||
      target.closest('[data-radix-select-viewport]') ||
      (target.tagName === 'INPUT' && !target.closest('[data-drag-handle="true"]'))
    ) {
      return;
    }

    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Don't deselect on shift+mousedown - let shift+drag work normally
    // The shift+click deselection is handled in onClick of the card

    setHasDragged(false); // Reset drag flag at start
    isDraggingOrJustDraggedRef.current = true; // Set flag to prevent clicks
    document.body.classList.add('dragging');
    setDraggedNode(nodeId);
    setDragOffset({
      x: (e.clientX - safePan.x) / zoom - node.position.x,
      y: (e.clientY - safePan.y) / zoom - node.position.y,
    });
  };

  // Helper function to calculate selected nodes based on selection rectangle
  const calculateSelectedNodes = (startX: number, startY: number, endX: number, endY: number): string[] => {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    const selectionWidth = maxX - minX;
    const selectionHeight = maxY - minY;

    // Only process if there's a meaningful selection area
    if (selectionWidth < 5 || selectionHeight < 5) {
      return [];
    }

    const selectedNodes: string[] = [];
    nodes.forEach(node => {
      const nodeWidth = node.width || 240;
      // Use actual measured height when available; fall back to a conservative
      // default of 120px (deliberately smaller than the old 280px so that nodes
      // whose DOM hasn't been measured yet are harder — not easier — to select
      // by accident).
      const nodeHeight = measuredNodeHeights.current.get(node.id) || 120;

      const nodeLeft = node.position.x;
      const nodeRight = node.position.x + nodeWidth;
      const nodeTop = node.position.y;
      const nodeBottom = node.position.y + nodeHeight;

      // Check for any intersection between the selection rectangle and the node bounds.
      // A node is selected when the selection rectangle actually touches it.
      const intersects =
        minX < nodeRight &&
        maxX > nodeLeft &&
        minY < nodeBottom &&
        maxY > nodeTop;

      if (intersects) {
        selectedNodes.push(node.id);
      }
    });

    return selectedNodes;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Always track canvas-relative mouse position for wire drag initialization
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (canvasRect) {
      lastCanvasMousePosRef.current = {
        x: (e.clientX - canvasRect.left - pan.x) / zoom,
        y: (e.clientY - canvasRect.top - pan.y) / zoom,
      };
    }

    // Panning takes priority when active
    if (isPanning) {
      // Don't allow panning if any color picker is open
      if (nodesWithColorPickerOpen.size > 0) {
        setIsPanning(false);
        return;
      }

      // Store current mouse position for requestAnimationFrame
      currentMousePos.current = { x: e.clientX, y: e.clientY };

      // Use requestAnimationFrame for smooth panning
      if (!rafId.current) {
        rafId.current = requestAnimationFrame(() => {
          setPan({
            x: currentMousePos.current.x - panStart.x,
            y: currentMousePos.current.y - panStart.y,
          });
          rafId.current = null;
        });
      }
    } else if (isDraggingWire) {
      // Update wire preview position using RAF for smooth rendering
      if (canvasRect) {
        wireMousePosRef.current = {
          x: (e.clientX - canvasRect.left - pan.x) / zoom,
          y: (e.clientY - canvasRect.top - pan.y) / zoom,
        };
        if (!wireRafId.current) {
          wireRafId.current = requestAnimationFrame(() => {
            setWireMousePosition({ ...wireMousePosRef.current });
            wireRafId.current = null;
          });
        }
      }
    } else if (draggedNode && !isSpacePressed) {
      const node = nodes.find((n) => n.id === draggedNode);
      if (!node) return;

      setHasDragged(true); // Mark that we've started dragging

      const newX = (e.clientX - pan.x) / zoom - dragOffset.x;
      const newY = (e.clientY - pan.y) / zoom - dragOffset.y;

      // If this node is part of a multi-selection, move all selected nodes
      if (selectedNodeIds.length > 0 && selectedNodeIds.includes(draggedNode)) {
        const deltaX = newX - node.position.x;
        const deltaY = newY - node.position.y;
        onMoveSelectedNodes(draggedNode, deltaX, deltaY);
      } else {
        // Single node drag
        onUpdateNode(draggedNode, {
          position: { x: newX, y: newY },
        });
      }
    } else if (isSelecting) {
      // Update selection rectangle end position
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const endX = (e.clientX - rect.left - pan.x) / zoom;
        const endY = (e.clientY - rect.top - pan.y) / zoom;

        setSelectionEnd({ x: endX, y: endY });

        // Calculate and update selected nodes in real-time
        const nodesInRectangle = calculateSelectedNodes(
          selectionStart.x,
          selectionStart.y,
          endX,
          endY
        );

        if (selectionStartedWithShift) {
          // Shift+drag: toggle logic based on initial selection
          const initialSet = new Set(initialSelectionOnShiftDrag);
          const rectangleSet = new Set(nodesInRectangle);
          const finalSelection = new Set<string>();

          // Start with all initially selected nodes
          initialSelectionOnShiftDrag.forEach(id => finalSelection.add(id));

          // Toggle nodes in the rectangle
          nodesInRectangle.forEach(id => {
            if (initialSet.has(id)) {
              // Was selected initially, now should be deselected
              finalSelection.delete(id);
            } else {
              // Was not selected initially, now should be selected
              finalSelection.add(id);
            }
          });

          const event = new CustomEvent('dragSelectNodes', {
            detail: {
              nodeIds: Array.from(finalSelection),
              addToSelection: false, // Don't use toggle logic in App.tsx, we already calculated final state
              isRealtime: true
            }
          });
          window.dispatchEvent(event);
        } else {
          // Normal drag: just select nodes in rectangle
          if (nodesInRectangle.length > 0) {
            const event = new CustomEvent('dragSelectNodes', {
              detail: {
                nodeIds: nodesInRectangle,
                addToSelection: false,
                isRealtime: true
              }
            });
            window.dispatchEvent(event);
          } else {
            onSelectNode(null);
            onClearMultiSelection();
          }
        }
      }
    }
  };

  // ── Minimum gap enforcement ──────────────────────────────────────
  // After a drag ends, enforce a minimum vertical gap between nodes
  // that overlap horizontally. Only push nodes BELOW the dragged node(s)
  // downward — never move the dragged node itself.
  const MIN_NODE_GAP = 40; // px in canvas space — unified minimum gap for all auto-layout
  const COLUMN_OVERLAP_THRESHOLD = 10; // horizontal overlap threshold — only push when nodes truly overlap (or within ~10px)
  const GAP_TRANSITION_MS = 100; // ms — cleanup delay (no CSS transition, instant repositioning)

  // Helper: collect all descendant node IDs of a given node (children, grandchildren, etc.)
  const getDescendantIds = useCallback((rootId: string, allNodes: ColorNodeType[]): Set<string> => {
    const descendants = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const n of allNodes) {
        if (n.parentId === current && !descendants.has(n.id)) {
          descendants.add(n.id);
          stack.push(n.id);
        }
      }
    }
    return descendants;
  }, []);

  const enforceMinimumGapAfterDrag = useCallback((draggedIds: string[]) => {
    const currentNodes = nodesRef.current;
    const draggedSet = new Set(draggedIds);
    if (draggedSet.size === 0) return;

    // Collect all descendants of dragged nodes — they move with the parent
    const allDescendants = new Set<string>();
    for (const id of draggedIds) {
      getDescendantIds(id, currentNodes).forEach(d => allDescendants.add(d));
    }

    const allShifts = new Map<string, number>();

    for (const draggedId of draggedIds) {
      const dNode = currentNodes.find(n => n.id === draggedId);
      if (!dNode) continue;

      const dLeft = dNode.position.x;
      const dRight = dNode.position.x + (dNode.width || 240);
      const dHeight = measuredNodeHeights.current.get(draggedId) || 120;
      const dBottom = dNode.position.y + dHeight;

      // Collect nodes below the dragged node that overlap horizontally
      // (excluding descendants which move with the dragged node)
      const belowNodes = currentNodes
        .filter(n => {
          if (draggedSet.has(n.id) || allDescendants.has(n.id)) return false;
          const nLeft = n.position.x;
          const nRight = n.position.x + (n.width || 240);
          if (nRight < dLeft - COLUMN_OVERLAP_THRESHOLD || nLeft > dRight + COLUMN_OVERLAP_THRESHOLD) return false;
          const nTop = n.position.y + (allShifts.get(n.id) || 0);
          return nTop >= dNode.position.y - 10;
        })
        .sort((a, b) =>
          (a.position.y + (allShifts.get(a.id) || 0)) -
          (b.position.y + (allShifts.get(b.id) || 0))
        );

      // Uniform shift: calculate based on closest below node, apply same to all
      if (belowNodes.length > 0) {
        const firstTop = belowNodes[0].position.y + (allShifts.get(belowNodes[0].id) || 0);
        const currentGap = firstTop - dBottom;
        const uniformShift = currentGap < MIN_NODE_GAP ? (MIN_NODE_GAP - currentGap) : 0;

        if (uniformShift > 0) {
          for (const bNode of belowNodes) {
            allShifts.set(bNode.id, (allShifts.get(bNode.id) || 0) + uniformShift);
          }
        }
      }
    }

    // Dispatch only meaningful shifts
    const shiftEntries: { id: string; dy: number }[] = [];
    allShifts.forEach((dy, id) => {
      if (Math.abs(dy) > 0.5) {
        shiftEntries.push({ id, dy });
        const el = document.querySelector(`[data-node-wrapper-id="${id}"]`) as HTMLElement | null;
        if (el) el.dataset.autoShift = '1';
      }
    });

    if (shiftEntries.length > 0) {
      window.dispatchEvent(new CustomEvent('batchShiftNodes', { detail: shiftEntries }));
      // Keep wires glued to sliding nodes during the CSS transition
      window.dispatchEvent(new CustomEvent('triggerWireAnimLoop', { detail: GAP_TRANSITION_MS + 60 }));
      setTimeout(() => {
        document.querySelectorAll('[data-auto-shift]').forEach(el => {
          delete (el as HTMLElement).dataset.autoShift;
        });
      }, GAP_TRANSITION_MS + 50);
    }
  }, [getDescendantIds]);

  const handleMouseUp = () => {
    // Cancel any pending animation frames
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    if (wheelRafId.current) {
      cancelAnimationFrame(wheelRafId.current);
      wheelRafId.current = null;
    }

    // Handle wire connection completion
    if (isDraggingWire && wireStartNodeId && wireStartButtonType) {
      if (wireHoverNodeId) {
        // Dragged to another node - create connection
        // Check if connection is valid (no cycles, not self)
        if (wireStartNodeId !== wireHoverNodeId) {
          // ── Multi-select wire connection ──
          // When dragging from LEFT + and the start node is multi-selected,
          // connect ALL selected nodes to the target parent.
          // When dragging from RIGHT +, only single-node behavior applies.
          const isMultiWire = wireStartButtonType === 'left'
            && selectedNodeIds.length > 1
            && selectedNodeIds.includes(wireStartNodeId);

          // Determine the target parent (the node the wire was dropped on)
          const targetParentId = wireStartButtonType === 'right' ? wireStartNodeId : wireHoverNodeId;
          const parentNode = nodes.find(n => n.id === targetParentId);

          // Gather child IDs: all selected nodes for multi-wire, or just the single child
          const childIdsToConnect = isMultiWire
            ? selectedNodeIds.filter(id => id !== wireHoverNodeId) // Exclude the target from the selection
            : [wireStartButtonType === 'right' ? wireHoverNodeId : wireStartNodeId];

          // Cross-type blocking helper
          const areNodesSameType = (a: ColorNodeType, b: ColorNodeType): boolean => {
            return !!a.isTokenNode === !!b.isTokenNode;
          };

          let connectedCount = 0;
          let lastError: string | null = null;

          for (const childId of childIdsToConnect) {
            if (childId === targetParentId) continue; // Skip self-connection

            const childNode = nodes.find(n => n.id === childId);
            if (!parentNode || !childNode) continue;

            // Cross-type blocking
            const isCrossTypeBlocked = !areNodesSameType(parentNode, childNode);

            // Color space compatibility
            const isCompatible =
              parentNode.colorSpace === childNode.colorSpace ||
              (parentNode.colorSpace === 'hex' && (childNode.colorSpace === 'hsl' || childNode.colorSpace === 'rgb')) ||
              (childNode.colorSpace === 'hex' && (parentNode.colorSpace === 'hsl' || parentNode.colorSpace === 'rgb')) ||
              (parentNode.isTokenNode && childNode.isTokenNode);

            // On non-primary themes, block connection if either node is inherited
            const isInheritanceBlocked = !isPrimaryTheme && activeThemeId && (
              (!parentNode.themeOverrides || !parentNode.themeOverrides[activeThemeId]) ||
              (!childNode.themeOverrides || !childNode.themeOverrides[activeThemeId])
            );

            if (isInheritanceBlocked) {
              lastError = 'Cannot connect inherited nodes';
            } else if (isCrossTypeBlocked) {
              lastError = 'Cannot connect token and color nodes';
            } else if (!isCompatible) {
              lastError = 'Cannot connect to other type';
            } else if (!wouldCreateCycle(childId, targetParentId)) {
              onLinkNode(childId, targetParentId);
              connectedCount++;
            }
          }

          // Show error for last failure if nothing connected
          if (connectedCount === 0 && lastError) {
            setConnectionError({
              nodeId: wireStartNodeId,
              message: lastError
            });
            setTimeout(() => setConnectionError(null), 2000);
          }
        }
      } else if (wireStartButtonType === 'right') {
        // Dragged to empty space from right button - create child at that position
        // Pass the position directly to onAddChild to avoid auto-positioning and sibling adjustment
        onAddChild(wireStartNodeId, wireMousePosition);
      }
    }

    // Handle selection rectangle completion
    if (isSelecting) {
      const nodesInRectangle = calculateSelectedNodes(
        selectionStart.x,
        selectionStart.y,
        selectionEnd.x,
        selectionEnd.y
      );

      if (selectionStartedWithShift) {
        // Shift+drag: toggle logic based on initial selection
        const initialSet = new Set(initialSelectionOnShiftDrag);
        const finalSelection = new Set<string>();

        // Start with all initially selected nodes
        initialSelectionOnShiftDrag.forEach(id => finalSelection.add(id));

        // Toggle nodes in the rectangle
        nodesInRectangle.forEach(id => {
          if (initialSet.has(id)) {
            // Was selected initially, now should be deselected
            finalSelection.delete(id);
          } else {
            // Was not selected initially, now should be selected
            finalSelection.add(id);
          }
        });

        const finalArray = Array.from(finalSelection);
        if (finalArray.length > 0) {
          const event = new CustomEvent('dragSelectNodes', {
            detail: {
              nodeIds: finalArray,
              addToSelection: false // We already calculated the final state
            }
          });
          window.dispatchEvent(event);
        } else {
          // All nodes were deselected
          onSelectNode(null);
          onClearMultiSelection();
        }
      } else {
        // Normal drag-to-select - replace selection
        if (nodesInRectangle.length > 0) {
          const event = new CustomEvent('dragSelectNodes', {
            detail: {
              nodeIds: nodesInRectangle,
              addToSelection: false
            }
          });
          window.dispatchEvent(event);
        } else {
          onSelectNode(null);
          onClearMultiSelection();
        }
      }

      document.body.classList.remove('selecting');
      setIsSelecting(false);
      setSelectionStartedWithShift(false); // Reset the flag
      setInitialSelectionOnShiftDrag([]); // Reset initial selection
    }

    document.body.classList.remove('dragging');
    document.body.classList.remove('selecting');

    // ── Enforce minimum gap after drag ends ──
    if (draggedNode && hasDragged) {
      // Collect all IDs that were being moved (multi-select or single)
      const movedIds = (selectedNodeIds.length > 0 && selectedNodeIds.includes(draggedNode))
        ? [...selectedNodeIds]
        : [draggedNode];
      // Reset auto-shift accumulator for manually dragged nodes — the user
      // "owns" their new position, so future collapses should not pull them back.
      for (const id of movedIds) {
        autoShiftAccumulator.current.delete(id);
      }
      // Double-rAF ensures React has committed the final node positions
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          enforceMinimumGapAfterDrag(movedIds);
        });
      });
    }

    // Clear the dragging flag after a short delay to allow the click event to be blocked
    if (draggedNode) {
      setTimeout(() => {
        isDraggingOrJustDraggedRef.current = false;
      }, 100);
    } else {
      isDraggingOrJustDraggedRef.current = false;
    }

    setDraggedNode(null);
    setIsPanning(false);
    setIsDraggingWire(false);
    setWireStartNodeId(null);
    setWireStartButtonType(null);
    setWireHoverNodeId(null);
    setHasDragged(false); // Reset drag flag
    // Cancel any pending wire RAF
    if (wireRafId.current) {
      cancelAnimationFrame(wireRafId.current);
      wireRafId.current = null;
    }
  };

  // Check if connecting childId to parentId would create a cycle
  const wouldCreateCycle = (childId: string, parentId: string): boolean => {
    let currentId: string | null = parentId;
    while (currentId) {
      if (currentId === childId) return true;
      const node = nodes.find(n => n.id === currentId);
      currentId = node?.parentId || null;
    }
    return false;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Block all canvas interaction while advanced popup is open (but allow when minimized)
    if (advancedPopupNodeExists && !isAdvancedPopupMinimized) return;

    // Handle spacebar panning anywhere on the canvas
    if (isSpacePressed && e.button === 0) {
      // Don't allow panning if any color picker is open
      if (nodesWithColorPickerOpen.size > 0) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      setPanStart({
        x: e.clientX - pan.x,
        y: e.clientY - pan.y,
      });
      return;
    }

    // Check if clicking on canvas background (not on nodes or SVG)
    const target = e.target as HTMLElement;
    const isCanvasBackground =
      e.target === e.currentTarget ||
      target.classList.contains('canvas-background') ||
      (target.tagName === 'DIV' && !target.classList.contains('pointer-events-auto') && !target.closest('[data-node-card]') && !target.closest('.palette-node-card'));

    // Only handle left clicks on canvas background for selection
    if (isCanvasBackground && e.button === 0) {
      // Deselect when clicking on canvas background (but NOT when shift is pressed)
      if (!e.shiftKey) {
        onSelectNode(null);
        onClearMultiSelection();
      }

      // Start selection rectangle
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const startX = (e.clientX - rect.left - pan.x) / zoom;
        const startY = (e.clientY - rect.top - pan.y) / zoom;
        document.body.classList.add('selecting');
        setIsSelecting(true);
        setSelectionStart({ x: startX, y: startY });
        setSelectionEnd({ x: startX, y: startY });
        setSelectionStartedWithShift(e.shiftKey); // Track if shift was pressed
        // Store initial selection for shift+drag toggle logic
        if (e.shiftKey) {
          setInitialSelectionOnShiftDrag(selectedNodeIds);
        }
      }
    }
  };

  // Wheel handler — registered once via refs so the listener is never torn down
  // and re-added during rapid scroll/zoom.  Reads zoom, pan, and colorPickerOpen
  // from refs that are kept in sync during render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      // Allow native scrolling inside the Advanced Popup (columns need overflow-y scroll)
      const target = e.target as HTMLElement;
      if (target.closest('[data-advanced-popup]')) return;

      // Block zooming/panning while advanced popup is open (but allow when minimized)
      if (advancedPopupNodeIdRef.current && !isAdvancedPopupMinimizedRef.current) { e.preventDefault(); return; }
      // Don't handle if a dropdown is open
      if (document.body.hasAttribute('data-dropdown-open')) return;

      // Don't allow panning/zooming if any color picker is open
      if (nodesWithColorPickerOpenRef.current.size > 0) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Cancel any in-flight smooth animation — direct wheel input takes priority
      if (animationRafRef.current) {
        cancelAnimationFrame(animationRafRef.current);
        animationRafRef.current = null;
        smoothAnimateTargetRef.current = null;
        setIsAnimating(false);
      }

      const currentPan = panRef.current || { x: 0, y: 0 };
      const currentZoom = zoomRef.current;

      // Detect zoom gestures:
      // 1. Cmd/Ctrl + scroll  2. Pinch gesture (ctrlKey set automatically)
      const isZoomGesture = e.metaKey || e.ctrlKey;

      if (isZoomGesture) {
        // ZOOM MODE (Figma-style) — compound multiple events within the same frame
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const baseZoom = pendingWheelUpdate.current?.zoom ?? currentZoom;
        const basePan = pendingWheelUpdate.current?.pan ?? currentPan;
        const newZoom = Math.min(Math.max(0.1, baseZoom * delta), 3);

        // Zoom towards mouse position
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        pendingWheelUpdate.current = {
          pan: {
            x: mouseX - (mouseX - basePan.x) * (newZoom / baseZoom),
            y: mouseY - (mouseY - basePan.y) * (newZoom / baseZoom),
          },
          zoom: newZoom,
        };
      } else {
        // PAN MODE (Figma-style) — accumulate deltas within the same frame
        const basePan = pendingWheelUpdate.current?.pan ?? currentPan;
        pendingWheelUpdate.current = {
          ...pendingWheelUpdate.current,
          pan: {
            x: basePan.x - e.deltaX,
            y: basePan.y - e.deltaY,
          },
        };
      }

      // Single rAF batch per frame
      if (!wheelRafId.current) {
        wheelRafId.current = requestAnimationFrame(() => {
          if (pendingWheelUpdate.current) {
            if (pendingWheelUpdate.current.zoom !== undefined) {
              setZoom(pendingWheelUpdate.current.zoom);
            }
            if (pendingWheelUpdate.current.pan) {
              setPan(pendingWheelUpdate.current.pan);
            }
            pendingWheelUpdate.current = null;
          }
          wheelRafId.current = null;
        });
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — reads from stable refs

  // Measure button OFFSETS relative to node position for accurate wire connections.
  // Storing offsets (not absolute positions) means wires track nodes instantly during
  // dragging — the current node.position is combined with the measured offset at render time,
  // eliminating the one-frame lag that absolute DOM measurements cause.
  const [buttonOffsets, setButtonOffsets] = useState<Map<string, { left: { dx: number; dy: number } | null, right: { dx: number; dy: number } | null }>>(new Map());
  // Synchronous ref mirror — the rAF wire-animation loop reads this without
  // waiting for a React re-render, and the connections computation uses it
  // so React-rendered paths always reflect the most recent measurement.
  const buttonOffsetsRef = useRef(buttonOffsets);
  // rAF handle for the wire-animation loop that keeps SVG paths in sync
  // with CSS-transitioning / expanding / collapsing nodes.
  const wireAnimRafRef = useRef<number | null>(null);
  // Only sync ref ← state when no animation loop is running;
  // during animation the rAF loop keeps the ref fresher than state.
  if (!wireAnimRafRef.current) {
    buttonOffsetsRef.current = buttonOffsets;
  }

  // Use refs for pan/zoom/nodes so measurement can access latest values without causing re-runs
  const panRef = useRef(safePan);
  const zoomRef = useRef(zoom);
  const nodesRef = useRef(nodes);
  panRef.current = safePan;
  zoomRef.current = zoom;
  nodesRef.current = nodes;

  // Track actual rendered node heights for accurate drag-selection hit-testing.
  // Updated via ResizeObserver so heights stay current when nodes expand/collapse.
  const measuredNodeHeights = useRef<Map<string, number>>(new Map());

  // Timer for trailing-edge processing after the leading-edge throttle
  const autoShiftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulated height deltas across multiple ResizeObserver fires
  const pendingHeightDeltas = useRef<Map<string, { oldH: number; newH: number; delta: number }>>(new Map());
  // Leading-edge throttle: timestamp of last shift processing
  const lastShiftProcessTimeRef = useRef(0);
  // Timer for removing CSS transitions after shifts settle
  const transitionCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks cumulative auto-shift (in px) applied to each node from expand/collapse.
  // When a node is pushed down by auto-layout, the amount is recorded here.
  // When the source node collapses, we pull the node back up by up to this amount.
  const autoShiftAccumulator = useRef<Map<string, number>>(new Map());
  // Stable ref for draggedNode so the ResizeObserver closure isn't stale
  const draggedNodeRef = useRef(draggedNode);
  draggedNodeRef.current = draggedNode;

  // Stable dependency: only changes when nodes are added/removed, NOT on position changes.
  // This prevents the measurement effect from re-running on every drag frame.
  const nodeIdList = nodes.map(n => n.id).sort().join(',');

  useEffect(() => {
    // ── Raw offset measurement (pure, no React state) ──────────────
    // Returns a fresh Map of button offsets by reading DOM positions.
    // Offset = (visual screen position → canvas-space) − node.position
    // so  wire_endpoint = node.position + offset  always equals the
    // button's current *visual* location, even when CSS transitions
    // are mid-animation and node.position has already jumped ahead.
    type OffsetMap = Map<string, { left: { dx: number; dy: number } | null; right: { dx: number; dy: number } | null }>;

    const measureButtonOffsetsRaw = (): OffsetMap => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return buttonOffsetsRef.current;

      const currentPan = panRef.current;
      const currentZoom = zoomRef.current;
      const currentNodes = nodesRef.current;

      const offsets: OffsetMap = new Map();

      currentNodes.forEach(node => {
        const leftButton = document.querySelector(`[data-node-id="${node.id}"][data-button-type="left-connect"]`);
        const rightButton = document.querySelector(`[data-node-id="${node.id}"][data-button-type="right-connect"]`);

        let leftOffset: { dx: number; dy: number } | null = null;
        if (leftButton) {
          const rect = leftButton.getBoundingClientRect();
          const absX = (rect.left + rect.width / 2 - canvasRect.left - currentPan.x) / currentZoom;
          const absY = (rect.top + rect.height / 2 - canvasRect.top - currentPan.y) / currentZoom;
          leftOffset = { dx: absX - node.position.x, dy: absY - node.position.y };
        }

        let rightOffset: { dx: number; dy: number } | null = null;
        if (rightButton) {
          const rect = rightButton.getBoundingClientRect();
          const absX = (rect.left + rect.width / 2 - canvasRect.left - currentPan.x) / currentZoom;
          const absY = (rect.top + rect.height / 2 - canvasRect.top - currentPan.y) / currentZoom;
          rightOffset = { dx: absX - node.position.x, dy: absY - node.position.y };
        }

        offsets.set(node.id, { left: leftOffset, right: rightOffset });
      });

      return offsets;
    };

    // ── Measure + commit to both ref AND React state ─────────────
    const measureButtons = () => {
      const offsets = measureButtonOffsetsRaw();
      buttonOffsetsRef.current = offsets;
      setButtonOffsets(offsets);
    };

    // ── Direct SVG wire patch (no React, pure DOM) ───────────────
    // Reads all <path data-conn-id="parentId__childId"> elements and
    // recomputes + sets their `d` attribute from fresh measurements.
    const updateWirePathsDirect = (offsets: OffsetMap) => {
      const paths = document.querySelectorAll<SVGPathElement>('path[data-conn-id]');
      const currentNodes = nodesRef.current;

      paths.forEach(pathEl => {
        const connId = pathEl.dataset.connId;
        if (!connId) return;
        const sepIdx = connId.indexOf('__');
        if (sepIdx < 0) return;
        const parentId = connId.slice(0, sepIdx);
        const childId = connId.slice(sepIdx + 2);
        const parent = currentNodes.find(n => n.id === parentId);
        const child = currentNodes.find(n => n.id === childId);
        if (!parent || !child) return;

        const parentOff = offsets.get(parentId);
        const childOff = offsets.get(childId);

        // from = parent's right-connect button
        let fromX: number, fromY: number;
        if (parentOff?.right) {
          fromX = parent.position.x + parentOff.right.dx;
          fromY = parent.position.y + parentOff.right.dy;
        } else {
          fromX = parent.position.x + (parent.width || 240);
          fromY = parent.position.y + (parent.isSpacing ? 70 : parent.isPalette ? 28 : 29);
        }

        // to = child's left-connect button
        let toX: number, toY: number;
        if (childOff?.left) {
          toX = child.position.x + childOff.left.dx;
          toY = child.position.y + childOff.left.dy;
        } else {
          const childIsPaletteShade = !!(child.parentId && currentNodes.find(n => n.id === child.parentId)?.isPalette);
          toX = child.position.x;
          toY = child.position.y + (child.isSpacing ? 70 : childIsPaletteShade ? 22 : 48);
        }

        if (!isFinite(fromX) || !isFinite(fromY) || !isFinite(toX) || !isFinite(toY)) return;
        const midX = (fromX + toX) / 2;
        pathEl.setAttribute('d', `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`);
      });
    };

    // ── rAF loop: keep wires glued to nodes during CSS transitions ─
    // Runs for `durationMs`, measuring + patching every frame.
    // At the end it commits final offsets to React state so that
    // subsequent renders use accurate data.
    const startWireAnimLoop = (durationMs: number) => {
      if (wireAnimRafRef.current) cancelAnimationFrame(wireAnimRafRef.current);
      const t0 = performance.now();
      const tick = () => {
        const offsets = measureButtonOffsetsRaw();
        buttonOffsetsRef.current = offsets;
        updateWirePathsDirect(offsets);
        if (performance.now() - t0 < durationMs) {
          wireAnimRafRef.current = requestAnimationFrame(tick);
        } else {
          wireAnimRafRef.current = null;
          // Final sync to React state
          setButtonOffsets(offsets);
        }
      };
      wireAnimRafRef.current = requestAnimationFrame(tick);
    };

    // Listen for gap-enforcement wire-anim requests
    const handleGapWireAnim = (evt: Event) => {
      const ms = (evt as CustomEvent<number>).detail || 300;
      startWireAnimLoop(ms);
    };
    window.addEventListener('triggerWireAnimLoop', handleGapWireAnim);

    // Measure after render
    requestAnimationFrame(measureButtons);

    // Re-measure after a short delay for nodes that may still be rendering
    const timer = setTimeout(measureButtons, 50);

    // Measure actual rendered heights of all node card wrappers for
    // accurate drag-selection hit-testing (replaces the old hardcoded 280px).
    const measureNodeHeights = () => {
      const currentZoom = zoomRef.current;
      nodesRef.current.forEach(node => {
        const el = document.querySelector(`[data-node-wrapper-id="${node.id}"]`) as HTMLElement | null;
        if (el) {
          // getBoundingClientRect().height is in screen px (scaled by zoom);
          // divide by zoom to get canvas-space height.
          measuredNodeHeights.current.set(node.id, el.getBoundingClientRect().height / currentZoom);
        }
      });
    };
    requestAnimationFrame(measureNodeHeights);
    const heightTimer = setTimeout(measureNodeHeights, 60);

    // ── Helper: compute shifts from accumulated deltas and dispatch ──
    const THROTTLE_MS = 30; // Leading-edge throttle interval
    // No CSS transition on `top` — nodes below reposition instantly to maintain gap.
    // Preserve opacity transitions on the wrapper div by only allowing opacity in transition-property.
    const styleEl = document.createElement('style');
    styleEl.textContent = `[data-auto-shift]{transition-property:opacity!important}`;
    document.head.appendChild(styleEl);

    const processShifts = () => {
      // Snapshot and clear accumulated deltas
      const deltasSnapshot = new Map(pendingHeightDeltas.current);
      pendingHeightDeltas.current.clear();

      // Drop deltas that cancelled out during accumulation (threshold: 2px)
      deltasSnapshot.forEach((val, key) => {
        if (Math.abs(val.delta) <= 2) deltasSnapshot.delete(key);
      });
      if (deltasSnapshot.size === 0) return;

      lastShiftProcessTimeRef.current = Date.now();

      // Read fresh node positions
      const freshNodes = nodesRef.current;
      const MIN_GAP = 40; // px — minimum gap to preserve (matches MIN_NODE_GAP)
      const COL_OVERLAP = 10; // px — horizontal overlap threshold (matches COLUMN_OVERLAP_THRESHOLD)

      // Sort changed nodes top→bottom so cumulative shifts stack correctly
      const sortedDeltas = Array.from(deltasSnapshot.entries())
        .map(([nodeId, d]) => ({ nodeId, ...d }))
        .sort((a, b) => {
          const na = freshNodes.find(n => n.id === a.nodeId);
          const nb = freshNodes.find(n => n.id === b.nodeId);
          return (na?.position.y ?? 0) - (nb?.position.y ?? 0);
        });

      // For each changed node, shift nodes below with CASCADING:
      //  • Expansion (positive delta): push down if gap < minimum, then cascade
      //  • Collapse  (negative delta): pull back up, but only by the amount
      //    the node was previously auto-shifted (never above its original pos)
      const shifts = new Map<string, number>();

      // Helper: check if two nodes overlap horizontally within the threshold
      const overlapsHorizontally = (
        aLeft: number, aRight: number,
        bLeft: number, bRight: number,
      ) => !(bRight < aLeft - COL_OVERLAP || bLeft > aRight + COL_OVERLAP);

      for (const { nodeId, oldH, newH, delta } of sortedDeltas) {
        const changedNode = freshNodes.find(n => n.id === nodeId);
        if (!changedNode) continue;

        // Descendants of the changed node move WITH it — never shift them
        const descendantIds = getDescendantIds(nodeId, freshNodes);

        const changedLeft = changedNode.position.x;
        const changedRight = changedNode.position.x + (changedNode.width || 240);
        const changedNewBottom = changedNode.position.y + newH;

        if (delta > 0) {
          // ── Expansion: push ALL below nodes by the SAME uniform amount ──
          // This preserves the original gaps between below nodes instead of
          // compressing them to MIN_GAP via cascading.
          const belowNodes = freshNodes
            .filter(n => {
              if (n.id === nodeId || descendantIds.has(n.id)) return false;
              const nLeft = n.position.x;
              const nRight = n.position.x + (n.width || 240);
              if (!overlapsHorizontally(changedLeft, changedRight, nLeft, nRight)) return false;
              const nTop = n.position.y + (shifts.get(n.id) || 0);
              return nTop >= changedNode.position.y + oldH - 10;
            })
            .sort((a, b) =>
              (a.position.y + (shifts.get(a.id) || 0)) -
              (b.position.y + (shifts.get(b.id) || 0))
            );

          if (belowNodes.length > 0) {
            // Calculate uniform shift: ensure the closest below node keeps MIN_GAP
            const firstTop = belowNodes[0].position.y + (shifts.get(belowNodes[0].id) || 0);
            const currentGap = firstTop - changedNewBottom;
            const uniformShift = currentGap < MIN_GAP ? (MIN_GAP - currentGap) : 0;

            // Apply the SAME shift to every below node — gaps are preserved
            if (uniformShift > 0) {
              for (const bNode of belowNodes) {
                shifts.set(bNode.id, (shifts.get(bNode.id) || 0) + uniformShift);
              }
            }
          }
        } else {
          // ── Collapse: pull ALL below nodes back up by the SAME uniform amount ──
          // Mirror of expansion: preserves gaps between below nodes.
          const belowNodes = freshNodes
            .filter(n => {
              if (n.id === nodeId || descendantIds.has(n.id)) return false;
              const accumulated = autoShiftAccumulator.current.get(n.id) || 0;
              if (accumulated <= 1) return false;
              const nLeft = n.position.x;
              const nRight = n.position.x + (n.width || 240);
              if (!overlapsHorizontally(changedLeft, changedRight, nLeft, nRight)) return false;
              const nTop = n.position.y + (shifts.get(n.id) || 0);
              return nTop >= changedNewBottom;
            })
            .sort((a, b) =>
              (a.position.y + (shifts.get(a.id) || 0)) -
              (b.position.y + (shifts.get(b.id) || 0))
            );

          if (belowNodes.length > 0) {
            // Calculate uniform pull-back based on the closest below node's excess gap
            const firstTop = belowNodes[0].position.y + (shifts.get(belowNodes[0].id) || 0);
            const currentGap = firstTop - changedNewBottom;
            const excessGap = currentGap - MIN_GAP;

            if (excessGap > 1) {
              // Cap by the minimum accumulated auto-shift so no node goes above its original pos
              let minAccumulated = Infinity;
              for (const bNode of belowNodes) {
                const acc = autoShiftAccumulator.current.get(bNode.id) || 0;
                if (acc < minAccumulated) minAccumulated = acc;
              }
              const uniformPullBack = Math.min(excessGap, minAccumulated);

              if (uniformPullBack > 1) {
                for (const bNode of belowNodes) {
                  shifts.set(bNode.id, (shifts.get(bNode.id) || 0) - uniformPullBack);
                }
              }
            }
          }
        }
      }

      if (shifts.size === 0) return;

      // Tag shifted wrappers with data-auto-shift so the CSS rule applies.
      const shiftEntries: { id: string; dy: number }[] = [];
      shifts.forEach((dy, id) => {
        if (Math.abs(dy) > 1) {
          shiftEntries.push({ id, dy });
          const el = document.querySelector(`[data-node-wrapper-id="${id}"]`) as HTMLElement | null;
          if (el) el.dataset.autoShift = '1';
        }
      });

      if (shiftEntries.length > 0) {
        window.dispatchEvent(new CustomEvent('batchShiftNodes', { detail: shiftEntries }));
        // Update the auto-shift accumulator so we know how much to reverse on collapse.
        // Positive dy = pushed down (add to accumulator), negative dy = pulled back up (subtract).
        for (const { id, dy } of shiftEntries) {
          const prev = autoShiftAccumulator.current.get(id) || 0;
          const next = Math.max(0, prev + dy); // Never go below 0
          if (next <= 0) {
            autoShiftAccumulator.current.delete(id);
          } else {
            autoShiftAccumulator.current.set(id, next);
          }
        }
        // Keep wires in sync — short loop since there's no CSS transition to track
        startWireAnimLoop(100);
      }

      // Schedule cleanup of data-auto-shift flags and re-measure after settlement
      if (transitionCleanupTimerRef.current) clearTimeout(transitionCleanupTimerRef.current);
      transitionCleanupTimerRef.current = setTimeout(() => {
        transitionCleanupTimerRef.current = null;
        document.querySelectorAll('[data-auto-shift]').forEach(el => {
          delete (el as HTMLElement).dataset.autoShift;
        });
        // Re-measure heights and button offsets after everything settles
        measureNodeHeights();
        measureButtons();
      }, 80);
    };

    // ── ResizeObserver ──────────────────────────────────────────────
    const resizeObserver = new ResizeObserver((entries) => {
      // Immediately measure + patch wires synchronously so the very first
      // paint after a node expands/collapses already has correct paths.
      // (The rAF below handles the auto-push logic which must not run here.)
      {
        const earlyOffsets = measureButtonOffsetsRaw();
        buttonOffsetsRef.current = earlyOffsets;
        updateWirePathsDirect(earlyOffsets);
      }

      requestAnimationFrame(() => {
        measureButtons();

        // Skip auto-push while the user is dragging a node
        if (draggedNodeRef.current) {
          measureNodeHeights();
          return;
        }

        const currentZoom = zoomRef.current;

        // Accumulate height deltas into the ref (survives across throttle resets)
        let hasNewDeltas = false;
        for (const entry of entries) {
          const wrapperId = (entry.target as HTMLElement).dataset?.nodeWrapperId;
          if (!wrapperId) continue;
          const newH = entry.target.getBoundingClientRect().height / currentZoom;
          const oldH = measuredNodeHeights.current.get(wrapperId) || newH;
          const delta = newH - oldH;
          if (Math.abs(delta) > 2) {
            const existing = pendingHeightDeltas.current.get(wrapperId);
            const baseOldH = existing ? existing.oldH : oldH;
            pendingHeightDeltas.current.set(wrapperId, {
              oldH: baseOldH,
              newH,
              delta: newH - baseOldH,
            });
            hasNewDeltas = true;
          }
        }

        // Always keep measured heights current
        measureNodeHeights();

        // If a node changed height (expand/collapse), start a short
        // wire-animation loop so wires track the Collapsible animation
        // smoothly rather than snapping when the resize settles.
        if (hasNewDeltas && !wireAnimRafRef.current) {
          startWireAnimLoop(350);
        }

        if (!hasNewDeltas && pendingHeightDeltas.current.size === 0) return;

        // ── Leading-edge throttle with trailing-edge cleanup ──
        const now = Date.now();
        const elapsed = now - lastShiftProcessTimeRef.current;

        if (elapsed >= THROTTLE_MS) {
          // Leading edge — process immediately
          processShifts();
        } else {
          // Schedule trailing-edge to catch remaining deltas
          if (autoShiftTimerRef.current) clearTimeout(autoShiftTimerRef.current);
          autoShiftTimerRef.current = setTimeout(() => {
            autoShiftTimerRef.current = null;
            processShifts();
          }, THROTTLE_MS - elapsed);
        }
      });
    });

    // Observe all node cards
    const currentNodes = nodesRef.current;
    currentNodes.forEach(node => {
      const nodeElement = document.querySelector(`[data-node-wrapper-id="${node.id}"]`);
      if (nodeElement) {
        resizeObserver.observe(nodeElement);
      }
    });

    return () => {
      clearTimeout(timer);
      clearTimeout(heightTimer);
      if (autoShiftTimerRef.current) clearTimeout(autoShiftTimerRef.current);
      if (transitionCleanupTimerRef.current) clearTimeout(transitionCleanupTimerRef.current);
      if (wireAnimRafRef.current) cancelAnimationFrame(wireAnimRafRef.current);
      pendingHeightDeltas.current.clear();
      resizeObserver.disconnect();
      styleEl.remove();
      window.removeEventListener('triggerWireAnimLoop', handleGapWireAnim);
    };
  }, [nodeIdList]);

  // Calculate connections: combine current node positions with measured offsets.
  // Read from the ref (always freshest) so React renders after rAF-loop
  // state sync already use accurate data.
  const liveOffsets = buttonOffsetsRef.current;
  const connections = nodes
    .filter((node) => node.parentId)
    .map((node) => {
      const parent = nodes.find((n) => n.id === node.parentId);
      if (!parent) return null;

      const parentOff = liveOffsets.get(parent.id);
      const childOff = liveOffsets.get(node.id);

      return {
        from: parent.position,
        to: node.position,
        parentRightOffset: parentOff?.right || null,
        childLeftOffset: childOff?.left || null,
        parentId: parent.id,
        childId: node.id,
        parentIsSpacing: !!parent.isSpacing,
        childIsSpacing: !!node.isSpacing,
        parentIsPalette: !!parent.isPalette,
        childIsPaletteShade: !!parent.isPalette,
        parentWidth: parent.width || 240,
      };
    })
    .filter(Boolean);

  // Auto-focus the canvas container on mount so keyboard events reach this window
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.focus({ preventScroll: true });
    }
  }, []);

  return (
    <div
      ref={canvasRef}
      tabIndex={-1}
      className="flex-1 relative overflow-hidden outline-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseDown={handleCanvasMouseDown}
      style={{
        background: '#141414',
        backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.02) 0.1em, transparent 0.1em), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 0.1em, transparent 0.1em)`,
        backgroundSize: `${1.5 * zoom}em ${1.5 * zoom}em`,
        backgroundPosition: `${safePan.x}px ${safePan.y}px`,
        cursor: isSpacePressed ? (isPanning ? 'grabbing' : 'grab') : 'default',
        userSelect: draggedNode || isDraggingWire || isSelecting ? 'none' : 'auto',
        touchAction: 'none',
      }}
    >
      <div
        className="relative canvas-background"
        style={{
          transform: `translate(${safePan.x}px, ${safePan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: '20000px',
          height: '20000px',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          willChange: isPanning || draggedNode || isAnimating ? 'transform' : 'auto',
        }}
      >
        {/* SVG for connections */}
        <svg
          className="absolute pointer-events-none"
          width="20000"
          height="20000"
          overflow="visible"
          style={{
            zIndex: 5,
            left: '-5000px',
            top: '-5000px',
            opacity: (advancedPopupNodeExists && !isAdvancedPopupMinimized) ? 0.12 : undefined,
            transition: 'opacity 0.35s ease',
          }}
          viewBox="-5000 -5000 20000 20000"
        >
          {connections.map((conn) => {
            if (!conn) return null;

            // Start: parent's right button = parent position + measured offset (or fallback)
            let fromX: number, fromY: number;
            if (conn.parentRightOffset) {
              fromX = conn.from.x + conn.parentRightOffset.dx;
              fromY = conn.from.y + conn.parentRightOffset.dy;
            } else {
              // Fallback: approximate right-side center
              // Palette nodes have right-connect at top-7 (~28px), spacing at ~70px, regular at ~29px
              fromX = conn.from.x + conn.parentWidth;
              fromY = conn.from.y + (conn.parentIsSpacing ? 70 : conn.parentIsPalette ? 28 : 29);
            }

            // End: child's left button = child position + measured offset (or fallback)
            let toX: number, toY: number;
            if (conn.childLeftOffset) {
              toX = conn.to.x + conn.childLeftOffset.dx;
              toY = conn.to.y + conn.childLeftOffset.dy;
            } else {
              // Palette shade cards are compact (44px) with button at vertical center (~22px)
              // Spacing nodes at ~70px, regular color nodes at ~48px
              toX = conn.to.x;
              toY = conn.to.y + (conn.childIsSpacing ? 70 : conn.childIsPaletteShade ? 22 : 48);
            }

            // Safety: skip if any coordinate is NaN or Infinity
            if (!isFinite(fromX) || !isFinite(fromY) || !isFinite(toX) || !isFinite(toY)) return null;

            // Calculate control points for curved line
            const midX = (fromX + toX) / 2;

            // Check if this wire connects to any selected node (single or multi-selection)
            const isSelectedWire = (selectedNodeId && (conn.parentId === selectedNodeId || conn.childId === selectedNodeId)) ||
              (selectedNodeIds.length > 0 && (selectedNodeIds.includes(conn.parentId) || selectedNodeIds.includes(conn.childId)));
            const wireColor = isSelectedWire ? 'var(--brand)' : 'var(--dim)';

            const connKey = `${conn.parentId}__${conn.childId}`;
            return (
              <g key={connKey}>
                <path
                  data-conn-id={connKey}
                  d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                  stroke={wireColor}
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* Preview wire(s) while dragging — multi-wire when dragging from left + on a multi-selected node */}
          {isDraggingWire && wireStartNodeId && wireStartButtonType && (() => {
            // Determine which nodes should show preview wires
            const isMultiWireDrag = wireStartButtonType === 'left'
              && selectedNodeIds.length > 1
              && selectedNodeIds.includes(wireStartNodeId);

            // For multi-wire: all selected nodes; for single: just the start node
            const wireSourceIds = isMultiWireDrag ? selectedNodeIds : [wireStartNodeId];

            const toX = wireMousePosition.x;
            const toY = wireMousePosition.y;
            const wireColor = wireHoverNodeId ? 'var(--brand)' : 'var(--dim)';

            // Helper to compute the "from" position for a given node
            const getFromPosition = (nodeId: string): { x: number; y: number } | null => {
              const node = nodes.find(n => n.id === nodeId);
              if (!node) return null;

              const offsets = buttonOffsetsRef.current.get(nodeId);
              // For multi-wire sources we always use the left button;
              // for single-wire we use whichever button type started the drag
              const buttonSide = isMultiWireDrag ? 'left' : wireStartButtonType!;
              const offset = buttonSide === 'right' ? offsets?.right : offsets?.left;

              if (offset) {
                return { x: node.position.x + offset.dx, y: node.position.y + offset.dy };
              }
              // Fallback approximations
              const isSpacing = !!node.isSpacing;
              const isPalette = !!node.isPalette;
              const isPaletteShade = !!(node.parentId && nodes.find(n => n.id === node.parentId)?.isPalette);
              if (buttonSide === 'right') {
                return {
                  x: node.position.x + (node.width || 240),
                  y: node.position.y + (isSpacing ? 70 : isPalette ? 28 : 29),
                };
              }
              return {
                x: node.position.x,
                y: node.position.y + (isSpacing ? 70 : isPaletteShade ? 22 : 48),
              };
            };

            return wireSourceIds.map((nodeId) => {
              const from = getFromPosition(nodeId);
              if (!from) return null;
              const midX = (from.x + toX) / 2;
              const isPrimary = nodeId === wireStartNodeId;
              return (
                <path
                  key={`wire-preview-${nodeId}`}
                  d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${toY}, ${toX} ${toY}`}
                  stroke={wireColor}
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="5,5"
                  opacity={isPrimary ? 1 : 0.5}
                />
              );
            });
          })()}

          {/* Selection rectangle */}
          {isSelecting && (() => {
            const minX = Math.min(selectionStart.x, selectionEnd.x);
            const minY = Math.min(selectionStart.y, selectionEnd.y);
            const width = Math.abs(selectionEnd.x - selectionStart.x);
            const height = Math.abs(selectionEnd.y - selectionStart.y);

            return (
              <rect
                x={minX}
                y={minY}
                width={width}
                height={height}
                fill="rgba(0, 108, 255, 0.1)"
                stroke="var(--brand)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
            );
          })()}
        </svg>

        {/* Nodes - render children first, then parents, so parents appear on top */}
        {(() => {
          return (
            <>
              {/* Render all nodes */}
              {[...nodes]
                .sort((a, b) => {
                  // Node with active auto-assign popup always renders last (DOM-order
                  // backup for z-index boost) so its popup is never occluded by siblings.
                  if (autoAssignPopupNodeId === a.id) return 1;
                  if (autoAssignPopupNodeId === b.id) return -1;
                  // Nodes with parentId (children) come first (lower z-index)
                  // Nodes without parentId (parents) come last (higher z-index)
                  if (a.parentId && !b.parentId) return -1;
                  if (!a.parentId && b.parentId) return 1;
                  return 0;
                })
                .map((node) => {
                  const isPaletteShadeNode = !!(node.parentId && nodes.find(n => n.id === node.parentId)?.isPalette);
                  const hasInheritBar = showInheritanceIcon && !isPrimaryTheme && !isPaletteShadeNode && !node.isSpacing && !node.isTokenNode;
                  const isNodeRefVisible = hoveredCanvasNodeId === node.id || selectedNodeId === node.id || selectedNodeIds.includes(node.id);
                  const nodeHidden = isNodeHiddenInTheme(node, activeThemeId, primaryThemeId, nodes);
                  return (
                    <div
                      key={node.id}
                      className="pointer-events-auto"
                      data-node-wrapper-id={node.id}
                      style={{
                        position: 'absolute',
                        left: node.position.x,
                        top: node.position.y,
                        opacity: (advancedPopupNodeExists && !isAdvancedPopupMinimized)
                          ? (node.id === advancedPopupNodeId ? 1 : 0.12)
                          : nodeHidden ? 0.35 : undefined,
                        transition: 'opacity 0.35s ease',
                        zIndex: autoAssignPopupNodeId === node.id
                          ? 1000 // Boost z-index when auto-assign popup is open so it stays on top
                          : node.parentId ? 10 : 20,
                      }}
                      onMouseEnter={() => setHoveredCanvasNodeId(node.id)}
                      onMouseLeave={() => setHoveredCanvasNodeId(prev => prev === node.id ? null : prev)}
                    >
                      {/* Node Reference Name Label */}
                      <NodeReferenceLabel
                        node={node}
                        allNodes={nodes}
                        isVisible={isNodeRefVisible}
                        isPaletteShade={isPaletteShadeNode}
                        nodeWidth={node.isPalette ? (node.width || 300) : (node.width || 240)}
                        hasInheritanceBar={hasInheritBar}
                        onUpdateNode={onUpdateNode}
                        groups={groups}
                        tokens={tokens}
                        activeProjectId={activeProjectId}
                        onAddToken={onAddToken}
                        onAssignToken={onAssignToken}
                        onUpdateToken={onUpdateToken}
                        onDeleteToken={onDeleteToken}
                        onUpdateGroups={onUpdateGroups}
                        isPrompted={autoAssignPromptNodeId === node.id}
                        isPopupOpen={autoAssignPopupNodeId === node.id}
                        shouldOpenPopup={autoAssignExpandNodeId === node.id}
                        onPopupOpened={() => setAutoAssignExpandNodeId(null)}
                        onPopupOpenChange={(isOpen) => {
                          if (isOpen) {
                            setAutoAssignPopupNodeId(node.id);
                          } else {
                            // Only clear if THIS node was the active popup — prevents
                            // other nodes' close callbacks from clearing the boost.
                            setAutoAssignPopupNodeId(prev => prev === node.id ? null : prev);
                          }
                        }}
                        onSelectNode={() => onSelectNode(node.id)}
                        isActiveMenu={autoAssignPopupNodeId === node.id}
                        isPrimaryTheme={isPrimaryTheme}
                        onDragMouseDown={!isPaletteShadeNode ? (e) => handleMouseDown(e, node.id) : undefined}
                        onTogglePrefix={onTogglePrefix}
                        readOnly={readOnly}
                      />

                      {/* Connection error message */}
                      {connectionError?.nodeId === node.id && (() => {
                        // Generate the node's color for background
                        let bgColor = '';
                        if (node.colorSpace === 'hsl') {
                          bgColor = `hsla(${node.hue}, ${node.saturation}%, ${node.lightness}%, ${node.alpha / 100})`;
                        } else if (node.colorSpace === 'rgb') {
                          bgColor = `rgba(${node.red}, ${node.green}, ${node.blue}, ${node.alpha / 100})`;
                        } else if (node.colorSpace === 'oklch') {
                          const l = (node.oklchL || 50) / 100;
                          const c = ((node.oklchC || 0) / 100) * 0.4;
                          const h = node.oklchH || 0;
                          bgColor = `oklch(${l} ${c} ${h} / ${node.alpha / 100})`;
                        }

                        const nodeWidth = node.width || 240;

                        return (
                          <div
                            className="absolute -top-10 left-0 flex items-center justify-center shadow-lg text-white text-sm z-50 rounded-[20px]"
                            style={{
                              backgroundColor: bgColor,
                              width: `${nodeWidth}px`,
                              height: '36px',
                            }}
                          >
                            {connectionError.message}
                          </div>
                        );
                      })()}

                      {node.isSpacing ? (
                        <SpacingNodeCard
                          node={node}
                          nodes={nodes}
                          tokens={tokens.filter(t => t.projectId === activeProjectId)}
                          groups={groups.filter(g => g.projectId === activeProjectId)}
                          activeProjectId={activeProjectId}
                          onMouseDown={(e) => handleMouseDown(e, node.id)}
                          onUpdateNode={onUpdateNode}
                          onAddChild={onAddChild}
                          onAddParent={onAddParent}
                          onDeleteNode={onDeleteNode}
                          onUnlinkNode={onUnlinkNode}
                          onAssignToken={onAssignToken}
                          onAddToken={onAddToken}
                          onUpdateToken={onUpdateToken}
                          isSelected={selectedNodeId === node.id}
                          onSelect={(e) => handleNodeSelect(node.id, e)}
                          onDoubleClick={() => onSelectNodeWithChildren(node.id)}
                          onColorPickerOpenChange={handleColorPickerOpenChange}
                          onWireStartDrag={(nodeId, buttonType, event) => {
                            if (readOnly) return;
                            setIsDraggingWire(true);
                            setWireStartNodeId(nodeId);
                            setWireStartButtonType(buttonType);
                            setWireMousePosition({ ...lastCanvasMousePosRef.current });
                          }}
                          onWireEndDrag={() => {
                            setIsDraggingWire(false);
                            setWireStartNodeId(null);
                            setWireStartButtonType(null);
                          }}
                          onWireHover={(nodeId, isHovering) => {
                            if (isHovering) {
                              handleWireHoverStart(nodeId);
                            } else {
                              setWireHoverNodeId(null);
                            }
                          }}
                          isWireHovered={wireHoverNodeId === node.id}
                        />
                      ) : node.isPalette ? (
                        <PaletteNodeCard
                          node={node}
                          nodes={nodes}
                          tokens={tokens.filter(t => t.projectId === activeProjectId)}
                          groups={groups.filter(g => g.projectId === activeProjectId)}
                          activeProjectId={activeProjectId}
                          onMouseDown={(e) => handleMouseDown(e, node.id)}
                          onUpdateNode={onUpdateNode}
                          onAddChild={onAddChild}
                          onDeleteNode={onDeleteNode}
                          onUpdateToken={onUpdateToken}
                          onWireDragStart={(nodeId, buttonType) => {
                            if (readOnly) return;
                            setIsDraggingWire(true);
                            setWireStartNodeId(nodeId);
                            setWireStartButtonType(buttonType);
                            setWireMousePosition({ ...lastCanvasMousePosRef.current });
                          }}
                          onWireHoverStart={handleWireHoverStart}
                          onWireHoverEnd={() => setWireHoverNodeId(null)}
                          isWireHovered={wireHoverNodeId === node.id}
                          wireStartButtonType={wireStartButtonType}
                          isDraggingWire={isDraggingWire}
                          isSelected={selectedNodeId === node.id}
                          isMultiSelected={selectedNodeIds.includes(node.id)}
                          onSelect={(e) => handleNodeSelect(node.id, e)}
                          onDoubleClick={() => onSelectNodeWithChildren(node.id)}
                          onColorPickerOpenChange={handleColorPickerOpenChange}
                          showInheritanceIcon={showInheritanceIcon}
                          activeThemeId={activeThemeId}
                          isPrimaryTheme={isPrimaryTheme}
                          primaryThemeId={primaryThemeId}
                          showAllVisible={showAllVisible}
                          isNodeHidden={nodeHidden}
                          onToggleVisibility={() => {
                            const newVis = toggleVisibilityMap(node.themeVisibility, activeThemeId, primaryThemeId, isPrimaryTheme);
                            onUpdateNode(node.id, { themeVisibility: newVis });
                          }}
                        />
                      ) : node.isTokenNode ? (
                        <TokenNodeCard
                          node={node}
                          nodes={nodes}
                          tokens={tokens.filter(t => t.projectId === activeProjectId)}
                          groups={groups.filter(g => g.projectId === activeProjectId)}
                          pages={pages}
                          allProjectNodes={allProjectNodes}
                          activeProjectId={activeProjectId}
                          onMouseDown={(e) => handleMouseDown(e, node.id)}
                          onUpdateNode={onUpdateNode}
                          onAddChild={onAddChild}
                          onAddParent={onAddParent}
                          onTogglePrefix={onTogglePrefix}
                          onDeleteNode={onDeleteNode}
                          onUnlinkNode={onUnlinkNode}
                          onLinkNode={onLinkNode}
                          onAssignToken={onAssignToken}
                          onUpdateToken={onUpdateToken}
                          onDeleteToken={onDeleteToken}
                          onNavigateToNode={navigateToNode}
                          onUpdateGroups={onUpdateGroups as (updater: (prev: TokenGroup[]) => TokenGroup[]) => void}
                          onWireDragStart={(nodeId, buttonType) => {
                            if (readOnly) return;
                            setIsDraggingWire(true);
                            setWireStartNodeId(nodeId);
                            setWireStartButtonType(buttonType);
                            setWireMousePosition({ ...lastCanvasMousePosRef.current });
                          }}
                          onWireHoverStart={handleWireHoverStart}
                          onWireHoverEnd={() => setWireHoverNodeId(null)}
                          isWireHovered={wireHoverNodeId === node.id}
                          wireStartButtonType={wireStartButtonType}
                          isDraggingWire={isDraggingWire}
                          isSelected={selectedNodeId === node.id}
                          isMultiSelected={selectedNodeIds.includes(node.id)}
                          selectedNodeIds={selectedNodeIds}
                          onSelect={(e) => handleNodeSelect(node.id, e)}
                          onDoubleClick={() => onSelectNodeWithChildren(node.id)}
                          showInheritanceIcon={showInheritanceIcon}
                          activeThemeId={activeThemeId}
                          isPrimaryTheme={isPrimaryTheme}
                          primaryThemeId={primaryThemeId}
                          showAllVisible={showAllVisible}
                          isNodeHidden={nodeHidden}
                          onToggleVisibility={() => {
                            const newVis = toggleVisibilityMap(node.themeVisibility, activeThemeId, primaryThemeId, isPrimaryTheme);
                            onUpdateNode(node.id, { themeVisibility: newVis });
                          }}
                          activeAdvancedChannels={(() => {
                            const entry = advancedLogic.find(l => l.nodeId === node.id);
                            if (!entry) return [];
                            const nodeHasOverride = !isPrimaryTheme && !!(node.themeOverrides?.[activeThemeId]);
                            const channels = (!isPrimaryTheme && nodeHasOverride && entry.themeChannels?.[activeThemeId])
                              ? entry.themeChannels[activeThemeId]
                              : entry.channels || {};
                            return Object.entries(channels)
                              .filter(([, ch]) => ch.rows.some(r => r.enabled && r.tokens.length > 0))
                              .map(([key]) => key);
                          })()}
                          hasAdvancedTokenAssignment={(() => {
                            const entry = advancedLogic.find(l => l.nodeId === node.id);
                            if (!entry) return false;
                            const nodeHasOverride = !isPrimaryTheme && !!(node.themeOverrides?.[activeThemeId]);
                            const tokenUnlinked = nodeHasOverride || (!isPrimaryTheme && !!(node.valueTokenAssignments?.[activeThemeId]));
                            const ta = (!isPrimaryTheme && tokenUnlinked && entry.themeTokenAssignment?.[activeThemeId])
                              ? entry.themeTokenAssignment[activeThemeId]
                              : entry.tokenAssignment;
                            return !!(ta?.rows?.some(r => r.enabled && r.tokens.length > 0));
                          })()}
                          anyTokenNodeHasAdvancedLogic={anyTokenNodeHasAdvancedLogic}
                          advancedTokenOutput={node.ownTokenId ? tokenAssignOutputs.get(node.ownTokenId) : undefined}
                          onRevertThemeAdvancedLogic={onRevertThemeAdvancedLogic}
                        />
                      ) : (
                        <ColorNodeCard
                          node={node}
                          nodes={nodes}
                          tokens={tokens.filter(t => t.projectId === activeProjectId)}
                          groups={groups.filter(g => g.projectId === activeProjectId)}
                          pages={pages}
                          activeProjectId={activeProjectId}
                          onMouseDown={(e) => handleMouseDown(e, node.id)}
                          onUpdateNode={onUpdateNode}
                          onAddChild={onAddChild}
                          onAddParent={onAddParent}
                          onDelete={onDeleteNode}
                          onUnlink={onUnlinkNode}
                          onLink={onLinkNode}
                          onAssignToken={onAssignToken}
                          onUpdateToken={onUpdateToken}
                          onDeleteToken={onDeleteToken}
                          onNavigateToNode={navigateToNode}
                          onWireDragStart={(nodeId, buttonType) => {
                            if (readOnly) return;
                            setIsDraggingWire(true);
                            setWireStartNodeId(nodeId);
                            setWireStartButtonType(buttonType);
                            setWireMousePosition({ ...lastCanvasMousePosRef.current });
                          }}
                          onWireHoverStart={handleWireHoverStart}
                          onWireHoverEnd={() => setWireHoverNodeId(null)}
                          isWireHovered={wireHoverNodeId === node.id}
                          wireStartButtonType={wireStartButtonType}
                          isDraggingWire={isDraggingWire}
                          isSelected={selectedNodeId === node.id}
                          isMultiSelected={selectedNodeIds.includes(node.id)}
                          selectedNodeIds={selectedNodeIds}
                          onSelect={(e) => handleNodeSelect(node.id, e)}
                          onDoubleClick={() => onSelectNodeWithChildren(node.id)}
                          onColorPickerOpenChange={handleColorPickerOpenChange}
                          shouldAutoOpenColorPicker={nodeToAutoOpenColorPicker === node.id}
                          onColorPickerAutoOpened={() => setNodeToAutoOpenColorPicker(null)}
                          isPaletteShade={!!(node.parentId && nodes.find(n => n.id === node.parentId)?.isPalette)}
                          showInheritanceIcon={showInheritanceIcon}
                          activeThemeId={activeThemeId}
                          isPrimaryTheme={isPrimaryTheme}
                          primaryThemeId={primaryThemeId}
                          showAllVisible={showAllVisible}
                          isNodeHidden={nodeHidden}
                          onToggleVisibility={() => {
                            const newVis = toggleVisibilityMap(node.themeVisibility, activeThemeId, primaryThemeId, isPrimaryTheme);
                            onUpdateNode(node.id, { themeVisibility: newVis });
                          }}
                          activeAdvancedChannels={(() => {
                            const entry = advancedLogic.find(l => l.nodeId === node.id);
                            if (!entry) return [];
                            const nodeHasOverride = !isPrimaryTheme && !!(node.themeOverrides?.[activeThemeId]);
                            const channels = (!isPrimaryTheme && nodeHasOverride && entry.themeChannels?.[activeThemeId])
                              ? entry.themeChannels[activeThemeId]
                              : entry.channels;
                            return Object.entries(channels)
                              .filter(([, ch]) => ch.rows.some(r => r.enabled && r.tokens.length > 0))
                              .map(([key]) => key);
                          })()}
                          nodeViewConfig={(() => {
                            const entry = advancedLogic.find(l => l.nodeId === node.id);
                            if (!entry) return {};
                            const nodeHasOverride = !isPrimaryTheme && !!(node.themeOverrides?.[activeThemeId]);
                            if (!isPrimaryTheme && nodeHasOverride && entry.themeNodeViewConfig?.[activeThemeId]) {
                              return entry.themeNodeViewConfig[activeThemeId];
                            }
                            return entry.nodeViewConfig || {};
                          })()}
                          onRevertThemeAdvancedLogic={onRevertThemeAdvancedLogic}
                          readOnly={readOnly}
                          showDevMode={showDevMode}
                          onToggleWebhookInput={onToggleWebhookInput}
                        />
                      )}

                      {/* Auto-assign prompt bubble — floats below node card without
                      affecting wrapper height (zero-height container + position:absolute)
                      so it doesn't trigger ResizeObserver shifts */}
                      <div className="relative" style={{ height: 0, overflow: 'visible' }}>
                        <AnimatePresence>
                          {isPrimaryTheme &&
                            !readOnly &&
                            autoAssignPromptNodeId === node.id &&
                            !node.autoAssignEnabled &&
                            !node.isPalette &&
                            !node.isSpacing &&
                            !node.isTokenNode &&
                            !isPaletteShadeNode && (
                              <motion.div
                                key="auto-assign-prompt"
                                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                className="flex justify-center pt-2.5 relative z-40"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* Upward caret connecting to the node */}
                                <div className="absolute top-[4px] left-1/2 -translate-x-1/2">
                                  <div
                                    className="w-0 h-0"
                                    style={{
                                      borderLeft: '6px solid transparent',
                                      borderRight: '6px solid transparent',
                                      borderBottom: '6px solid var(--elevated)',
                                    }}
                                  />
                                </div>
                                <button
                                  className="group flex items-center gap-2.5 bg-secondary/95 backdrop-blur-sm border border-elevated rounded-lg px-3.5 py-2 shadow-lg shadow-black/30 hover:border-brand/40 hover:shadow-[0_0_12px_rgba(70,91,254,0.08)] transition-all duration-200 cursor-pointer whitespace-nowrap"
                                  onClick={() => {
                                    // Select the node so the label row stays visible
                                    onSelectNode(node.id);
                                    // Force-open the auto-assign popup
                                    setAutoAssignExpandNodeId(node.id);
                                    // Dismiss the prompt timer/bubble
                                    dismissAutoAssignPrompt();
                                  }}
                                >
                                  <div className="flex items-center justify-center w-5 h-5 rounded bg-brand/15 shrink-0">
                                    <Zap size={11} className="text-brand" />
                                  </div>
                                  <span className="text-[13px] text-foreground group-hover:text-foreground transition-colors">
                                    Auto-assign tokens
                                  </span>
                                  <svg width="5" height="8" viewBox="0 0 5 8" fill="none" className="text-dim group-hover:text-subtle transition-colors ml-0.5">
                                    <path d="M1 1L4 4L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                              </motion.div>
                            )}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}{/* end node map */}

            </>
          );
        })()}
      </div>

      {/* ── Advanced Popup: interaction blocker + dimming overlay ── */}
      {/* Only show blocker when popup is open, NOT minimized, AND node exists in current nodes */}
      <AnimatePresence>
        {advancedPopupNodeExists && !isAdvancedPopupMinimized && (
          <motion.div
            key="advanced-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
            style={{ zIndex: 9000, pointerEvents: 'all' }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          />
        )}
      </AnimatePresence>

      {/* ── Advanced Popup panel ── */}
      <AnimatePresence>
        {advancedPopupNodeId && (() => {
          const popupNode = nodes.find(n => n.id === advancedPopupNodeId);
          if (!popupNode) return null;
          const popupIsPaletteShade = !!(popupNode.parentId && nodes.find(n => n.id === popupNode.parentId)?.isPalette);
          const popupNodeDisplayName = getNodeFullReferenceName(popupNode, nodes, popupIsPaletteShade);
          return (
            <AdvancedPopup
              key="advanced-popup"
              nodeId={advancedPopupNodeId}
              node={popupNode}
              nodes={nodes}
              nodeDisplayName={popupNodeDisplayName}
              tokens={tokens}
              activeThemeId={activeThemeId}
              isPrimaryTheme={isPrimaryTheme}
              primaryThemeId={primaryThemeId}
              advancedLogic={advancedLogic}
              onUpdateAdvancedLogic={onUpdateAdvancedLogic || (() => { })}
              onClose={handleCloseAdvancedPopup}
              isMinimized={isAdvancedPopupMinimized}
              onMinimize={handleMinimizeAdvancedPopup}
              onExpand={handleExpandAdvancedPopup}
              onPopupTopChange={handlePopupTopChange}
              onUpdateNode={onUpdateNode}
              readOnly={readOnly}
              pages={pages}
              allProjectNodes={allProjectNodes}
            />
          );
        })()}
      </AnimatePresence>

    </div>
  );
}