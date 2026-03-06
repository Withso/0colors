import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ColorNode, DesignToken, TokenGroup, Page } from './types';
import { Card } from './ui/card';
import { Plus, Trash2, Tag, ChevronsUpDown, Check, Crown, Unlink, Link2, Copy, Eye, EyeOff, Locate, X, Palette } from 'lucide-react';
import { Switch } from './ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { cn } from './ui/utils';
import { Tip } from './Tip';
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { hslToRgb, rgbToHex, hslToOklch } from '../utils/color-conversions';
import { rgbToHct } from '../utils/hct-utils';

interface TokenNodeCardProps {
  node: ColorNode;
  nodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  pages?: Page[];
  allProjectNodes?: ColorNode[];
  activeProjectId: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onUpdateNode: (id: string, updates: Partial<ColorNode>) => void;
  onAddChild: (parentId: string) => void;
  onAddParent: (nodeId: string) => void;
  onTogglePrefix?: (nodeId: string, makePrefix: boolean) => void;
  onDeleteNode: (id: string) => void;
  onUnlinkNode: (id: string) => void;
  onLinkNode: (nodeId: string, newParentId: string | null) => void;
  onAssignToken: (nodeId: string, tokenId: string, isAssigned: boolean) => void;
  onUpdateToken: (id: string, updates: Partial<DesignToken>) => void;
  onDeleteToken: (id: string) => void;
  onNavigateToNode: (nodeId: string) => void;
  onUpdateGroups: (updater: (prev: TokenGroup[]) => TokenGroup[]) => void;
  onWireDragStart: (nodeId: string, buttonType: 'left' | 'right') => void;
  onWireHoverStart: (nodeId: string) => void;
  onWireHoverEnd: () => void;
  isWireHovered: boolean;
  wireStartButtonType: 'left' | 'right' | null;
  isDraggingWire: boolean;
  isSelected: boolean;
  isMultiSelected: boolean;
  selectedNodeIds: string[]; // All currently multi-selected node IDs
  onSelect: (e?: React.MouseEvent) => void;
  onDoubleClick: () => void;
  showInheritanceIcon?: boolean;
  activeThemeId?: string;
  isPrimaryTheme?: boolean;
  primaryThemeId?: string;
  showAllVisible?: boolean;
  isNodeHidden?: boolean;
  onToggleVisibility?: () => void;
  activeAdvancedChannels?: string[]; // Channel keys that have active conditioned logic
  hasAdvancedTokenAssignment?: boolean; // True when advanced token assignment logic is active (disables manual dropdown)
  anyTokenNodeHasAdvancedLogic?: boolean; // True when ANY token node on the page has active advanced logic (shows island on all)
  advancedTokenOutput?: { type: 'color' | 'tokenRef' | 'error'; label: string; cssColor?: string }; // Pre-computed token assignment output for preview
  onRevertThemeAdvancedLogic?: (nodeId: string, themeId: string) => void; // Clear theme-specific advanced logic when re-linking to primary
}

function hslToHex(h: number, s: number, l: number): string {
  s = s / 100;
  l = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n: number) => Math.round(255 * f(n)).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

/** Resolve color-space info for a token given source nodes. */
function resolveTokenColorInfo(
  token: DesignToken,
  activeThemeId: string,
  scopeNodes: ColorNode[],
): { colorSpace: string; spaceValue: string; hex: string; hsla: string } | null {
  const tv = activeThemeId ? token.themeValues?.[activeThemeId] : undefined;
  const h = (tv?.hue !== undefined ? tv.hue : token.hue) ?? undefined;
  const s = (tv?.saturation !== undefined ? tv.saturation : token.saturation) ?? undefined;
  const l = (tv?.lightness !== undefined ? tv.lightness : token.lightness) ?? undefined;
  if (h === undefined || s === undefined || l === undefined) return null;

  const rgb = hslToRgb(h, s, l);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const hsla = `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;

  // Find the source color node that has this token assigned
  let sourceCS: string | undefined;
  for (const n of scopeNodes) {
    if (n.isTokenNode || n.isSpacing || n.isPalette) continue;
    // Check tokenAssignments
    if (n.tokenAssignments) {
      for (const ids of Object.values(n.tokenAssignments)) {
        if (ids.includes(token.id)) { sourceCS = n.colorSpace; break; }
      }
    }
    if (sourceCS) break;
    if (n.tokenIds?.includes(token.id)) { sourceCS = n.colorSpace; break; }
  }
  // Also check token nodes that OWN this token (they don't have a color space, so look at their source)
  if (!sourceCS) {
    for (const n of scopeNodes) {
      if (!n.isTokenNode || n.isTokenPrefix) continue;
      if (n.ownTokenId === token.id) {
        // The token node gets its color from the value token — find the value token's source
        const vtId = n.valueTokenAssignments?.[activeThemeId] || n.valueTokenId;
        if (vtId) {
          const vt = scopeNodes.find(sn => !sn.isTokenNode && !sn.isSpacing && !sn.isPalette && (
            sn.tokenAssignments && Object.values(sn.tokenAssignments).some(ids => ids.includes(vtId)) ||
            sn.tokenIds?.includes(vtId)
          ));
          if (vt) { sourceCS = vt.colorSpace; break; }
        }
      }
    }
  }

  const csRaw = (sourceCS || 'hsl').toLowerCase();
  const cs = csRaw.toUpperCase();
  let spaceValue: string;
  if (csRaw === 'oklch') {
    const oklch = hslToOklch(h, s, l);
    spaceValue = `oklch(${(oklch.l / 100).toFixed(2)} ${(oklch.c / 100 * 0.4).toFixed(3)} ${Math.round(oklch.h)})`;
  } else if (csRaw === 'rgb') {
    spaceValue = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  } else if (csRaw === 'hct') {
    const hct = rgbToHct(rgb.r, rgb.g, rgb.b);
    spaceValue = `hct(${Math.round(hct.h)}, ${Math.round(hct.c)}, ${Math.round(hct.t)})`;
  } else if (csRaw === 'hex') {
    // For hex nodes, the "space value" is the hex itself — skip the duplicate row
    return { colorSpace: 'HEX', spaceValue: hex, hex, hsla };
  } else {
    spaceValue = `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  }

  return { colorSpace: cs, spaceValue, hex, hsla };
}

/** Rich tooltip body for token color info. */
function TokenColorTooltipBody({ name, color, colorSpace, spaceValue, hex }: {
  name: string; color: string; colorSpace: string; spaceValue: string; hex: string;
}) {
  const showSpaceRow = colorSpace !== 'HEX' && spaceValue.toUpperCase() !== hex.toUpperCase();
  return (
    <div className="min-w-[190px] max-w-[300px]">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <div className="w-3.5 h-3.5 rounded-[4px] shrink-0 ring-1 ring-white/10" style={{ backgroundColor: color }} />
        <span className="text-[11px] text-[#e0e0e0] truncate">{name}</span>
      </div>
      <div className="h-px bg-[#ffffff]/[0.06] mx-2" />
      <div className="px-3 pt-1.5 pb-2.5 space-y-1">
        {showSpaceRow && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] text-[#666] uppercase tracking-wide shrink-0">{colorSpace}</span>
            <span className="text-[10px] font-mono text-[#888]">{spaceValue}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] text-[#666] uppercase tracking-wide shrink-0">HEX</span>
          <span className="text-[10px] font-mono text-[#888]">{hex}</span>
        </div>
      </div>
    </div>
  );
}

export function TokenNodeCard({
  node,
  nodes,
  tokens,
  groups,
  pages = [],
  allProjectNodes = [],
  activeProjectId,
  onMouseDown,
  onUpdateNode,
  onAddChild,
  onAddParent,
  onTogglePrefix,
  onDeleteNode,
  onUnlinkNode,
  onLinkNode,
  onAssignToken,
  onUpdateToken,
  onDeleteToken,
  onNavigateToNode,
  onUpdateGroups,
  onWireDragStart,
  onWireHoverStart,
  onWireHoverEnd,
  isWireHovered,
  wireStartButtonType,
  isDraggingWire,
  isSelected,
  isMultiSelected,
  selectedNodeIds = [],
  onSelect,
  onDoubleClick,
  showInheritanceIcon = false,
  activeThemeId = '',
  isPrimaryTheme = true,
  primaryThemeId = '',
  showAllVisible = false,
  isNodeHidden = false,
  onToggleVisibility,
  activeAdvancedChannels = [],
  hasAdvancedTokenAssignment = false,
  anyTokenNodeHasAdvancedLogic = false,
  advancedTokenOutput,
  onRevertThemeAdvancedLogic,
}: TokenNodeCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [tokenComboOpenIndex, setTokenComboOpenIndex] = useState<number | null>(null);
  const [showParentSelector, setShowParentSelector] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [usagePopoverTokenId, setUsagePopoverTokenId] = useState<string | null>(null);
  // ── Cross-page token assignment dropdown state ──
  const [dropdownPageId, setDropdownPageId] = useState<string>('__current__');
  const [dropdownMode, setDropdownMode] = useState<'tokens' | 'palettes'>('tokens');
  const isPrefix = !!node.isTokenPrefix;
  // Root prefix = prefix with no token-node parent (the top-level namespace node)
  const isRootPrefix = isPrefix && (() => {
    if (!node.parentId) return true;
    const parent = nodes.find(n => n.id === node.parentId);
    return !parent || !parent.isTokenNode;
  })();
  const [nameInputValue, setNameInputValue] = useState(
    isRootPrefix ? (node.referenceName || 'color') : (node.tokenNodeSuffix || node.referenceName || '')
  );
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ─── Token Path Helpers ──────────────────────────────────────────
  /** Walk up to find the ROOT prefix ancestor (skips mid-tree prefixes) */
  const findPrefixNode = useCallback((): ColorNode | null => {
    let current: ColorNode | undefined = node;
    while (current) {
      if (current.isTokenPrefix) {
        const parent = current.parentId ? nodes.find(n => n.id === current!.parentId) : null;
        if (!parent || !parent.isTokenNode) {
          return current; // Root prefix
        }
      }
      if (!current.parentId) return null;
      current = nodes.find(n => n.id === current!.parentId);
    }
    return null;
  }, [node, nodes]);

  /** Compute full token path from root prefix down to a given node.
   *  Mid-tree prefixes contribute their tokenNodeSuffix and the walk continues. */
  const computePath = useCallback((targetNode: ColorNode, searchNodes?: ColorNode[]): string => {
    const scope = searchNodes || nodes;
    const parts: string[] = [];
    let current: ColorNode | undefined = targetNode;
    while (current) {
      if (current.isTokenPrefix) {
        const parent = current.parentId ? scope.find(n => n.id === current!.parentId) : null;
        if (!parent || !parent.isTokenNode) {
          // Root prefix — use referenceName and stop
          parts.unshift(current.referenceName || 'color');
          break;
        } else {
          // Mid-tree prefix — use tokenNodeSuffix and continue
          parts.unshift(current.tokenNodeSuffix || current.referenceName || '1');
        }
      } else {
        parts.unshift(current.tokenNodeSuffix || current.referenceName || '1');
      }
      current = current.parentId ? scope.find(n => n.id === current!.parentId) : undefined;
    }
    return parts.join('-');
  }, [nodes]);

  /** Collect all descendant token nodes recursively */
  const collectDescendants = useCallback((parentId: string): ColorNode[] => {
    const result: ColorNode[] = [];
    const walk = (pid: string) => {
      nodes.forEach(n => {
        if (n.parentId === pid && n.isTokenNode) {
          result.push(n);
          walk(n.id);
        }
      });
    };
    walk(parentId);
    return result;
  }, [nodes]);

  // ─── Computed display values ─────────────────────────────────────
  const prefixNode = findPrefixNode();
  const fullTokenPath = isPrefix ? '' : computePath(node);

  // ─── Theme-aware valueTokenId resolution ───
  // For token nodes, resolve the effective valueTokenId considering theme-specific assignments.
  // Priority: valueTokenAssignments[activeThemeId] → valueTokenAssignments[primaryThemeId] → legacy valueTokenId
  const getEffectiveValueTokenId = (): string | undefined => {
    if (activeThemeId && node.valueTokenAssignments?.[activeThemeId] !== undefined) {
      return node.valueTokenAssignments[activeThemeId] || undefined;
    }
    if (primaryThemeId && node.valueTokenAssignments?.[primaryThemeId] !== undefined) {
      return node.valueTokenAssignments[primaryThemeId] || undefined;
    }
    return node.valueTokenId;
  };
  const effectiveValueTokenId = getEffectiveValueTokenId();

  // Resolve value token color for child nodes
  const valueToken = (!isPrefix && effectiveValueTokenId) ? tokens.find(t => t.id === effectiveValueTokenId) : null;
  const valueTokenColor = (() => {
    if (!valueToken) return null;
    const tv = activeThemeId && valueToken.themeValues?.[activeThemeId];
    const h = (tv && tv.hue !== undefined) ? tv.hue : (valueToken.hue ?? 0);
    const s = (tv && tv.saturation !== undefined) ? tv.saturation : (valueToken.saturation ?? 0);
    const l = (tv && tv.lightness !== undefined) ? tv.lightness : (valueToken.lightness ?? 0);
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  })();
  // Determine if text over the value token color should be light or dark
  const valueTokenTextColor = (() => {
    if (!valueToken) return '#999';
    const tv = activeThemeId && valueToken.themeValues?.[activeThemeId];
    const l = (tv && tv.lightness !== undefined) ? tv.lightness : (valueToken.lightness ?? 0);
    return l > 55 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)';
  })();

  // Helper function to get theme-specific token assignments
  const getNodeTokenIds = (n: ColorNode): string[] => {
    if (activeThemeId && n.tokenAssignments?.[activeThemeId] !== undefined) {
      return n.tokenAssignments[activeThemeId];
    }
    return n.tokenIds || [];
  };

  // All nodes in scope for tooltip color-space resolution
  const tooltipScopeNodes = useMemo(
    () => allProjectNodes.length > 0 ? allProjectNodes : nodes,
    [allProjectNodes, nodes]
  );

  // ── Advanced Island visibility for token nodes ──
  // Show for non-prefix token nodes that have their own active logic,
  // or when the node is selected (so user can always open the popup).
  const showAdvancedIsland = (() => {
    if (isPrefix) return false;
    // Show when this node's own channels or token assignment have active logic
    if (activeAdvancedChannels.length > 0) return true;
    if (hasAdvancedTokenAssignment) return true;
    // Show when selected (so user can always open the popup)
    if (isSelected) return true;
    return false;
  })();

  // Helper to check if node is linked to primary theme
  const isLinkedToPrimary = (): boolean => {
    if (isPrimaryTheme || !activeThemeId) return true;
    return !node.themeOverrides || !node.themeOverrides[activeThemeId];
  };

  // Helper to check if a specific node is inherited (linked to primary) on the current theme
  const isNodeInheritedOnTheme = (n: ColorNode): boolean => {
    if (isPrimaryTheme || !activeThemeId) return false;
    return !n.themeOverrides || !n.themeOverrides[activeThemeId];
  };

  // Structural lock: on non-primary themes, inherited nodes cannot be structurally modified
  const isStructurallyLocked = !isPrimaryTheme && isLinkedToPrimary();
  const parentNode = node.parentId ? nodes.find(n => n.id === node.parentId) : null;

  // For the left connection button
  const isConnected = node.parentId !== null;
  const isLeftConnectionLocked = isStructurallyLocked || (
    isConnected && !!node.parentId && (() => {
      const parent = nodes.find(n => n.id === node.parentId);
      return parent ? isNodeInheritedOnTheme(parent) : false;
    })()
  );

  // Available parents for linking
  const getAvailableParents = () => {
    // Get all descendants of this node (to prevent cycles)
    const descendants = new Set<string>();
    const findDescendants = (parentId: string) => {
      nodes.forEach(n => {
        if (n.parentId === parentId) {
          descendants.add(n.id);
          findDescendants(n.id);
        }
      });
    };
    findDescendants(node.id);

    return nodes.filter(n =>
      n.id !== node.id &&
      n.id !== node.parentId &&
      !descendants.has(n.id) &&
      n.projectId === node.projectId &&
      n.pageId === node.pageId &&
      n.isTokenNode // Only allow linking to other token nodes
    );
  };
  const availableParents = getAvailableParents();

  // Wire drag threshold state
  const [wireButtonPressed, setWireButtonPressed] = useState<{ buttonType: 'left' | 'right'; startX: number; startY: number } | null>(null);

  // Effect to handle wire drag threshold
  useEffect(() => {
    if (!wireButtonPressed) return;

    const DRAG_THRESHOLD = 5;
    let hasDragStarted = false;

    const handleMouseMove = (e: MouseEvent) => {
      if (!wireButtonPressed || hasDragStarted) return;

      const deltaX = e.clientX - wireButtonPressed.startX;
      const deltaY = e.clientY - wireButtonPressed.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > DRAG_THRESHOLD) {
        hasDragStarted = true;
        onWireDragStart(node.id, wireButtonPressed.buttonType);
        setWireButtonPressed(null);
      }
    };

    const handleMouseUp = () => {
      setWireButtonPressed(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [wireButtonPressed, node.id, onWireDragStart]);

  // Token section: theme-specific checks
  const hasTokenAssignmentChanges = (() => {
    if (isPrimaryTheme || !activeThemeId || !primaryThemeId) return false;
    // For token nodes: check if valueTokenAssignments differs between themes
    if (node.isTokenNode && !node.isTokenPrefix) {
      const hasThemeOverride = node.valueTokenAssignments?.[activeThemeId] !== undefined;
      if (!hasThemeOverride) return false;
      const primaryVal = node.valueTokenAssignments?.[primaryThemeId] ?? node.valueTokenId;
      const currentVal = node.valueTokenAssignments[activeThemeId];
      return primaryVal !== currentVal;
    }
    // For regular color nodes
    const primaryTokenIds = node.tokenAssignments?.[primaryThemeId] || node.tokenIds || [];
    const currentTokenIds = node.tokenAssignments?.[activeThemeId];
    if (currentTokenIds === undefined) return false;
    if (primaryTokenIds.length !== currentTokenIds.length) return true;
    return !primaryTokenIds.every(id => currentTokenIds.includes(id));
  })();

  const hasTokenValueChanges = (() => {
    if (isPrimaryTheme || !activeThemeId || !primaryThemeId) return false;
    // For token nodes: token value changes are tracked via valueTokenAssignments, not themeValues
    if (node.isTokenNode && !node.isTokenPrefix) return false;
    const currentTokenIds = getNodeTokenIds(node);
    if (currentTokenIds.length === 0) return false;
    return currentTokenIds.some(tokenId => {
      const token = tokens.find(t => t.id === tokenId);
      if (!token?.themeValues) return false;
      const pv = token.themeValues[primaryThemeId];
      const cv = token.themeValues[activeThemeId];
      if (!pv || !cv) return false;
      return pv.hue !== cv.hue || pv.saturation !== cv.saturation || pv.lightness !== cv.lightness || pv.alpha !== cv.alpha;
    });
  })();

  const hasAnyTokenChanges = hasTokenAssignmentChanges || hasTokenValueChanges;
  const isTokenSectionDimmed = !isPrimaryTheme && !hasAnyTokenChanges;
  
  const [hoveredSection, setHoveredSection] = useState<'name' | 'token' | null>(null);
  const tokenNeedsHover = !isPrimaryTheme;

  const tokenDimOpacity: number | undefined = (() => {
    if (showAllVisible) return undefined;
    if (!isTokenSectionDimmed) return undefined;
    if (hoveredSection === 'token') return 1;
    return 0.55;
  })();

  // Node dim opacity for non-primary inherited
  // Token nodes: dim name section based on token section state (no separate node-level inheritance)
  const isNodeInherited = !isPrimaryTheme && (node.isTokenNode ? !hasAnyTokenChanges : isLinkedToPrimary());
  const nameDimOpacity: number | undefined = (() => {
    if (showAllVisible) return undefined;
    if (!isNodeInherited) return undefined;
    if (hoveredSection === 'name' || hoveredSection === 'token') return 1;
    return 0.55;
  })();

  // Handle toggle link to primary
  const handleToggleLinkToPrimary = () => {
    if (isLinkedToPrimary()) {
      // Unlink from primary: create theme override with current values
      onUpdateNode(node.id, {
        themeOverrides: {
          ...node.themeOverrides,
          [activeThemeId]: {
            hue: node.hue,
            saturation: node.saturation,
            lightness: node.lightness,
            alpha: node.alpha,
          },
        },
      });
    } else {
      // Relink to primary: remove theme override
      const newOverrides = { ...node.themeOverrides };
      delete newOverrides[activeThemeId];
      onUpdateNode(node.id, {
        themeOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : undefined,
      });
      // Also clear theme-specific advanced logic for this node+theme
      if (activeThemeId && onRevertThemeAdvancedLogic) {
        onRevertThemeAdvancedLogic(node.id, activeThemeId);
      }
    }
  };

  // Handle revert tokens to primary
  const handleRevertTokensToPrimary = () => {
    // For token nodes: remove the theme-specific valueTokenAssignment
    if (node.isTokenNode && !node.isTokenPrefix) {
      const newAssignments = { ...node.valueTokenAssignments };
      delete newAssignments[activeThemeId];
      onUpdateNode(node.id, {
        valueTokenAssignments: Object.keys(newAssignments).length > 0 ? newAssignments : undefined,
      });
      // Also clear theme-specific token assignment advanced logic
      if (activeThemeId && onRevertThemeAdvancedLogic) {
        onRevertThemeAdvancedLogic(node.id, activeThemeId);
      }
      return;
    }
    // For regular color nodes
    const primaryTokenIds = node.tokenAssignments?.[primaryThemeId] || node.tokenIds || [];
    onUpdateNode(node.id, {
      tokenAssignments: {
        ...node.tokenAssignments,
        [activeThemeId]: [...primaryTokenIds],
      },
    });
  };

  // Handle name editing
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameSubmit = () => {
    const trimmed = nameInputValue.trim();
    if (!trimmed) {
      setIsEditingName(false);
      return;
    }

    if (isRootPrefix) {
      // ── ROOT PREFIX NODE: rename prefix ──
      // Only update the prefix node's referenceName here.
      // The App.tsx updateNode cascade handles:
      //   - Group rename / merge with existing group
      //   - Descendant node referenceName + tokenNodeSuffix updates
      //   - Token name updates with uniqueness validation ("-copy" suffixes)
      const oldPrefix = node.referenceName || 'color';
      if (trimmed !== oldPrefix) {
        onUpdateNode(node.id, { referenceName: trimmed, referenceNameLocked: true });
      }
    } else {
      // ── CHILD NODE or MID-TREE PREFIX: rename suffix ──
      // Only update this node. The App.tsx updateNode cascade handles:
      //   - This node's own token name update with uniqueness validation
      //   - Descendant node + token cascade for mid-tree prefixes
      const oldSuffix = node.tokenNodeSuffix || '';
      if (trimmed !== oldSuffix) {
        // Build new full path for this node using computePath-compatible logic
        const parentPath = (() => {
          const parts: string[] = [];
          let current: ColorNode | undefined = node.parentId ? nodes.find(n => n.id === node.parentId) : undefined;
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
        })();
        const newFullPath = `${parentPath}-${trimmed}`;

        // Update this node — App.tsx updateNode handles the token name + descendant cascade
        onUpdateNode(node.id, {
          tokenNodeSuffix: trimmed,
          referenceName: newFullPath,
          referenceNameLocked: true,
        });
      }
    }

    setIsEditingName(false);
  };

  // Sync name with external changes
  useEffect(() => {
    setNameInputValue(
      isRootPrefix ? (node.referenceName || 'color') : (node.tokenNodeSuffix || node.referenceName || '')
    );
  }, [node.referenceName, node.tokenNodeSuffix, isRootPrefix]);

  // Prevent canvas zoom when token dropdown is open
  useEffect(() => {
    if (tokenComboOpenIndex === null) {
      document.body.removeAttribute('data-dropdown-open');
      return;
    }
    document.body.setAttribute('data-dropdown-open', 'true');
    return () => {
      document.body.removeAttribute('data-dropdown-open');
    };
  }, [tokenComboOpenIndex]);

  // Listen for external token assign command
  useEffect(() => {
    const handleOpenTokenAssign = (e: Event) => {
      const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail;
      if (nodeId === node.id) {
        setTokenComboOpenIndex(-1);
      }
    };
    window.addEventListener('openTokenAssign', handleOpenTokenAssign);
    return () => window.removeEventListener('openTokenAssign', handleOpenTokenAssign);
  }, [node.id]);

  // Listen for "autoOpenTokenCombo" event — triggered when "Go back" restores this node
  useEffect(() => {
    const handleAutoOpen = (e: Event) => {
      const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail;
      if (nodeId === node.id) {
        setTokenComboOpenIndex(-1);
      }
    };
    window.addEventListener('autoOpenTokenCombo', handleAutoOpen);
    return () => window.removeEventListener('autoOpenTokenCombo', handleAutoOpen);
  }, [node.id]);

  const nodeWidth = node.width || 240;
  const displayName = node.referenceName || 'Token';

  // Bar dim opacity for inheritance bar
  const barDimOpacity: number | undefined = (() => {
    if (showAllVisible) return undefined;
    if (!isNodeInherited) return undefined;
    if (hoveredSection === 'name') return 1;
    return 0.55;
  })();

  return (
    <div className="relative" data-node-card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left side + button for parent connection */}
      <div
        className="absolute -left-3 top-6 z-20"
        style={{ pointerEvents: 'auto' }}
        onMouseEnter={() => {
          if (isDraggingWire && wireStartButtonType === 'right' && !isLeftConnectionLocked) {
            onWireHoverStart(node.id);
          }
        }}
        onMouseLeave={() => onWireHoverEnd()}
      >
        <button
          onMouseDown={(e) => {
            e.stopPropagation();
            if (isLeftConnectionLocked) return;
            setWireButtonPressed({
              buttonType: 'left',
              startX: e.clientX,
              startY: e.clientY,
            });
          }}
          onClick={(e) => {
            e.stopPropagation();
            // Shift+click on left + when multi-selected: unlink ALL selected nodes from their parents
            if (e.shiftKey && isMultiSelected && selectedNodeIds.length > 1) {
              let unlinkedCount = 0;
              for (const nid of selectedNodeIds) {
                const n = nodes.find(nd => nd.id === nid);
                if (n?.parentId) {
                  onUnlinkNode(nid);
                  unlinkedCount++;
                }
              }
              if (unlinkedCount > 0) {
                setShowParentSelector(false);
              }
              return;
            }
            if (isConnected) {
              if (isLeftConnectionLocked) return;
              onUnlinkNode(node.id);
              setShowParentSelector(false);
            } else {
              if (isStructurallyLocked) return;
              onAddParent(node.id);
            }
          }}
          className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-md ${
            isLeftConnectionLocked
              ? 'bg-[#222] cursor-not-allowed'
              : isWireHovered && wireStartButtonType === 'right' ? 'bg-green-500' : 'bg-[#333] hover:bg-[#444]'
          }`}
          title={isLeftConnectionLocked ? "Inherited from primary" : isConnected ? (isMultiSelected ? "Disconnect from parent (Shift+click to unlink all selected)" : "Disconnect from parent") : "Add new parent or drag to connect"}
          data-node-id={node.id}
          data-button-type="left-connect"
        >
          <Plus className={`w-3 h-3 ${isLeftConnectionLocked ? 'text-[#555]' : isWireHovered && wireStartButtonType === 'right' ? 'text-white' : 'text-[#ededed]'}`} strokeWidth={3} />
        </button>

        {/* Parent selection popup */}
        {showParentSelector && !isConnected && availableParents.length > 0 && (
          <div className="absolute left-8 top-0 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-lg p-2 min-w-[120px] z-30">
            <div className="text-xs mb-1 px-2 py-1 text-[#888]">Select parent:</div>
            {availableParents.map((parent) => (
              <button
                key={parent.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onLinkNode(node.id, parent.id);
                  setShowParentSelector(false);
                }}
                className="w-full text-left px-2 py-1 text-sm hover:bg-[#252525] rounded flex items-center gap-2 text-[#ededed]"
              >
                <Tag className="w-3 h-3 text-[#0070f3]" />
                {parent.referenceName || 'Token'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right side + button for adding child */}
      <div
        className="absolute -right-3 top-6 z-20 flex flex-col gap-1"
        style={{ pointerEvents: 'auto' }}
        onMouseEnter={() => {
          if (isDraggingWire && wireStartButtonType === 'left' && !isStructurallyLocked) {
            onWireHoverStart(node.id);
          }
        }}
        onMouseLeave={() => onWireHoverEnd()}
      >
        <button
          onMouseDown={(e) => {
            e.stopPropagation();
            if (isStructurallyLocked) return;
            setWireButtonPressed({
              buttonType: 'right',
              startX: e.clientX,
              startY: e.clientY,
            });
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (isStructurallyLocked) return;
            onAddChild(node.id);
          }}
          className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-md ${
            isStructurallyLocked
              ? 'bg-[#222] cursor-not-allowed'
              : isWireHovered && wireStartButtonType === 'left' ? 'bg-green-500' : 'bg-[#333] hover:bg-[#444]'
          }`}
          title={isStructurallyLocked ? "Inherited from primary" : "Add child node or drag to connect"}
          data-node-id={node.id}
          data-button-type="right-connect"
        >
          <Plus className={`w-3 h-3 ${isStructurallyLocked ? 'text-[#555]' : isWireHovered && wireStartButtonType === 'left' ? 'text-white' : 'text-[#ededed]'}`} strokeWidth={3} />
        </button>
      </div>

      {/* Connection port indicator on right top */}
      <div
        className="absolute -right-[5px] top-6 z-10 w-[10px] h-[10px] rounded-full bg-[#0070f3]"
      />

      <Card
        className="overflow-visible cursor-default relative rounded-[20px] gap-0"
        style={{
          backgroundColor: '#0e0e0e',
          border: isSelected ? '1px solid #0070f3' : isMultiSelected ? '1px solid #52a8ff' : '1px solid transparent',
          width: `${nodeWidth}px`,
          maxWidth: `${nodeWidth}px`,
          minWidth: `${nodeWidth}px`,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const isInteractive = target.tagName === 'INPUT' ||
                               target.tagName === 'BUTTON' ||
                               target.closest('button') ||
                               target.closest('input');
          if (!isInteractive) {
            onSelect(e);
          }
        }}
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          const isInteractive = target.tagName === 'INPUT' ||
                               target.tagName === 'BUTTON' ||
                               target.closest('button') ||
                               target.closest('input');
          if (!isInteractive) {
            onDoubleClick();
          }
        }}
      >
        {/* Inheritance Toggle Bar for Non-Primary Themes — NOT shown for token nodes (node IS the token) */}

        {/* Token Name Area — replaces color swatch */}
        <div
          className={`h-14 flex items-center justify-center relative ${isPrefix ? 'rounded-[19px]' : 'rounded-tl-[19px] rounded-tr-[19px] mb-3'} ${isNodeInherited && !showAllVisible ? 'transition-opacity duration-200' : ''}`}
          style={{
            backgroundColor: '#0e0e0e',
            border: '1px solid #252525',
            ...(nameDimOpacity !== undefined ? { opacity: nameDimOpacity } : {}),
          }}
          onMouseEnter={() => { if (!isPrimaryTheme) setHoveredSection('name'); }}
          onMouseLeave={() => { if (hoveredSection === 'name') setHoveredSection(null); }}
        >
          {/* Visibility toggle — outside the card to the left, matching ColorNodeCard */}
          {onToggleVisibility && (
            <div
              className={`absolute top-2 -left-[22px] transition-all cursor-pointer ${
                isNodeHidden
                  ? 'opacity-100 text-[#3B82F6]'
                  : isHovered
                    ? 'opacity-100 text-[#a1a1a1] hover:text-[#ededed]'
                    : 'opacity-0'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility();
              }}
              title={isNodeHidden ? 'Show node' : 'Hide node'}
            >
              {isNodeHidden ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </div>
          )}

          {/* Editable token name */}
          <div className="flex flex-col items-center justify-center px-6 w-full gap-0.5">
            {/* Prefix badge for prefix nodes */}
            {isPrefix && (
              <span className="text-[10px] tracking-widest uppercase text-[#555]">Prefix</span>
            )}
            {/* Full path label removed for child nodes — shown in floating label instead */}
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={nameInputValue}
                onChange={(e) => setNameInputValue(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSubmit();
                  if (e.key === 'Escape') {
                    setNameInputValue(
                      isRootPrefix ? (node.referenceName || 'color') : (node.tokenNodeSuffix || node.referenceName || '')
                    );
                    setIsEditingName(false);
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="bg-transparent text-center text-[#ededed] text-sm rounded-lg px-3 py-1.5 outline-none w-full max-w-[180px] border-none focus:bg-[#1a1a1a] transition-colors selection:bg-[#0070f3]/30"
                maxLength={50}
              />
            ) : (
              <button
                className="text-sm hover:text-[#ededed] transition-colors truncate max-w-[180px] cursor-text"
                style={{ color: '#999' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                  setIsEditingName(true);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {isRootPrefix ? (node.referenceName || 'color') : (node.tokenNodeSuffix || displayName)}
              </button>
            )}
          </div>
        </div>

        {/* Design Token Assignment Section — hidden for prefix nodes */}
        {!isPrefix && (
        <div
          className={`relative ${isTokenSectionDimmed ? 'transition-opacity duration-200' : ''} px-[16px] pt-[0px] pb-[12px] mx-[0px] mt-[4px] mb-[0px]`}
          style={tokenDimOpacity !== undefined ? { opacity: tokenDimOpacity } : undefined}
          onMouseEnter={() => { if (tokenNeedsHover) setHoveredSection('token'); }}
          onMouseLeave={() => { if (hoveredSection === 'token') setHoveredSection(null); }}
        >
          {/* Token inheritance toggle for non-primary themes */}
          {!isPrimaryTheme && (
            <div
              className="flex items-center gap-1.5 pb-1.5 pt-0.5"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Crown
                className={`h-3 w-3 shrink-0 transition-all ${
                  hasAnyTokenChanges
                    ? 'text-[#3B82F6] fill-[#3B82F6]'
                    : 'text-[#EFB100] fill-[#EFB100]'
                }`}
              />
              <Switch
                checked={!hasAnyTokenChanges}
                onCheckedChange={() => {
                  if (hasAnyTokenChanges) {
                    handleRevertTokensToPrimary();
                  }
                }}
                disabled={!hasAnyTokenChanges}
                className="data-[state=checked]:bg-[#EFB100] data-[state=unchecked]:bg-[#333] dark:data-[state=unchecked]:bg-[#333] h-[16px] w-[30px] shrink-0 disabled:opacity-100 disabled:cursor-default"
              />
              <span className={`text-[11px] select-none transition-colors ${hasAnyTokenChanges ? 'text-[#999]' : 'text-[#666]'}`}>
                {hasAnyTokenChanges ? 'Tokens modified' : 'Tokens inherited'}
              </span>
            </div>
          )}

          {/* Unified token assignment — single interactive field */}
          {(() => {
            const assignedToken = effectiveValueTokenId ? tokens.find(t => t.id === effectiveValueTokenId) : null;
            const _tv0 = assignedToken && activeThemeId && assignedToken.themeValues?.[activeThemeId];
            const _isEmpty0 = assignedToken ? (_tv0 ? (_tv0.hue === undefined && _tv0.saturation === undefined && _tv0.lightness === undefined) : (assignedToken.hue === undefined && assignedToken.saturation === undefined && assignedToken.lightness === undefined)) : true;
            const _h0 = assignedToken ? ((_tv0 && _tv0.hue !== undefined) ? _tv0.hue : (assignedToken.hue ?? 0)) : 0;
            const _s0 = assignedToken ? ((_tv0 && _tv0.saturation !== undefined) ? _tv0.saturation : (assignedToken.saturation ?? 0)) : 0;
            const _l0 = assignedToken ? ((_tv0 && _tv0.lightness !== undefined) ? _tv0.lightness : (assignedToken.lightness ?? 0)) : 0;
            const assignedHsl = (assignedToken && !_isEmpty0) ? `hsl(${Math.round(_h0)}, ${Math.round(_s0)}%, ${Math.round(_l0)}%)` : '';

            // Check if assigned token is owned by another token node (show Tag icon instead of swatch)
            const isAssignedOwnedByTokenNode = assignedToken ? nodes.some(n =>
              n.isTokenNode && !n.isTokenPrefix &&
              n.pageId === node.pageId &&
              n.ownTokenId === assignedToken.id &&
              n.ownTokenId !== node.ownTokenId
            ) : false;

            const assignedColorInfo = assignedToken ? resolveTokenColorInfo(assignedToken, activeThemeId, tooltipScopeNodes) : null;
            const isDropdownOpen = tokenComboOpenIndex === -1;

            return (
              <div className="relative group/tokenfield">
                {hasAdvancedTokenAssignment && (
                  <div className="absolute inset-0 z-10 flex items-center rounded-[10px] pointer-events-none px-2.5"
                    style={{ background: 'rgba(10,10,10,0.7)', border: '1px solid rgba(106,179,243,0.2)' }}>
                    {advancedTokenOutput ? (
                      advancedTokenOutput.type === 'error' ? (
                        <span className="text-[9px] tracking-wide text-red-400/90 select-none px-1.5 py-0.5 rounded truncate w-full"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                          title={advancedTokenOutput.label}>
                          {advancedTokenOutput.label}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5 min-w-0 w-full">
                          {advancedTokenOutput.type === 'color' && advancedTokenOutput.cssColor && (
                            <span
                              className="w-[14px] h-[14px] rounded-[4px] shrink-0 ring-1 ring-white/10"
                              style={{ backgroundColor: advancedTokenOutput.cssColor }}
                            />
                          )}
                          {advancedTokenOutput.type === 'tokenRef' && (
                            advancedTokenOutput.cssColor ? (
                              <span
                                className="w-[14px] h-[14px] rounded-[4px] shrink-0 ring-1 ring-amber-500/30"
                                style={{ backgroundColor: advancedTokenOutput.cssColor }}
                              />
                            ) : (
                              <Tag className="w-3.5 h-3.5 shrink-0 text-amber-500/60" />
                            )
                          )}
                          <span className="text-[10px] text-[#b0b0b0] select-none truncate min-w-0 flex-1 font-mono"
                            title={advancedTokenOutput.label}>
                            {advancedTokenOutput.label}
                          </span>
                        </div>
                      )
                    ) : (
                      <span className="text-[9px] tracking-wide uppercase text-[#6AB3F3]/50 select-none px-1.5 py-0.5 rounded mx-auto"
                        style={{ background: 'rgba(106,179,243,0.05)', border: '1px solid rgba(106,179,243,0.1)' }}>
                        No output
                      </span>
                    )}
                  </div>
                )}
                <TooltipPrimitive.Provider delayDuration={400}>
                <TooltipPrimitive.Root open={(!isDropdownOpen && assignedColorInfo) ? undefined : false}>
                <TooltipPrimitive.Trigger asChild>
                <div>
                <Popover open={hasAdvancedTokenAssignment ? false : isDropdownOpen} onOpenChange={(open) => {
                  if (hasAdvancedTokenAssignment) return;
                  setTokenComboOpenIndex(open ? -1 : null);
                  if (!open) setUsagePopoverTokenId(null);
                }}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "w-full flex items-center gap-2.5 h-9 px-3 rounded-[10px] transition-all text-xs outline-none",
                        hasAdvancedTokenAssignment ? "cursor-default opacity-50" : "cursor-pointer",
                        assignedToken
                          ? "bg-[#161616] hover:bg-[#1c1c1c] border border-[#252525] hover:border-[#333]"
                          : "bg-transparent border border-dashed border-[#2a2a2a] hover:border-[#444] hover:bg-[#ffffff]/[0.02]"
                      )}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => { if (!hasAdvancedTokenAssignment) onSelect(); }}
                    >
                      {assignedToken ? (
                        <>
                          {isAssignedOwnedByTokenNode ? (
                            <Tag className="size-3.5 shrink-0 text-[#666]" />
                          ) : _isEmpty0 ? (
                            <div className="w-3.5 h-3.5 rounded-[4px] shrink-0 border border-dashed border-[#333] opacity-40" />
                          ) : (
                            <div
                              className="w-3.5 h-3.5 rounded-[4px] shrink-0 ring-1 ring-inset ring-white/[0.08]"
                              style={{ backgroundColor: assignedHsl }}
                            />
                          )}
                          <span className="truncate flex-1 text-left text-[#ededed] min-w-0">{assignedToken.name}</span>
                          <ChevronsUpDown className="h-3 w-3 shrink-0 text-[#444] opacity-0 group-hover/tokenfield:opacity-100 transition-opacity" />
                        </>
                      ) : (
                        <>
                          <div className="w-3.5 h-3.5 rounded-[4px] shrink-0 border border-dashed border-[#333] flex items-center justify-center">
                            <Plus className="h-2 w-2 text-[#444]" />
                          </div>
                          <span className="text-[#555] flex-1 text-left">Assign token...</span>
                        </>
                      )}
                    </button>
                  </PopoverTrigger>
              <PopoverContent
                className="w-[260px] p-0 bg-[#161616] border-[#252525]"
                side="bottom"
                align="start"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* ── Page switcher ── */}
                {pages.length > 1 && (
                  <div className="px-1.5 pt-1.5">
                    <div className="flex gap-0.5 overflow-x-auto rounded-lg bg-[#0e0e0e] p-[3px]" style={{ scrollbarWidth: 'none' }}>
                      {[
                        { id: '__current__' as string, name: 'This page' },
                        ...pages.filter(p => p.id !== node.pageId).sort((a, b) => a.createdAt - b.createdAt)
                      ].map((pg) => {
                        const isActive = dropdownPageId === pg.id;
                        return (
                          <button
                            key={pg.id}
                            className={cn(
                              "shrink-0 px-2 py-[3px] rounded-md text-[10px] transition-all cursor-pointer whitespace-nowrap",
                              isActive
                                ? "bg-[#252525] text-[#ededed] shadow-sm"
                                : "text-[#666] hover:text-[#999]"
                            )}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => { e.stopPropagation(); setDropdownPageId(pg.id); }}
                          >
                            {pg.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Mode tabs: Tokens / Color Palettes ── */}
                <div className="px-1.5 pt-1">
                  <div className="flex gap-0.5 rounded-lg bg-[#0e0e0e] p-[3px]">
                    {([
                      { key: 'tokens' as const, label: 'Tokens', icon: <Tag className="size-[10px]" /> },
                      { key: 'palettes' as const, label: 'Palettes', icon: <Palette className="size-[10px]" /> },
                    ]).map(({ key, label, icon }) => {
                      const isActive = dropdownMode === key;
                      return (
                        <button
                          key={key}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-[5px] py-[3px] rounded-md text-[10px] transition-all cursor-pointer",
                            isActive
                              ? "bg-[#252525] text-[#ededed] shadow-sm"
                              : "text-[#666] hover:text-[#999]"
                          )}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => { e.stopPropagation(); setDropdownMode(key); }}
                        >
                          {icon}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <TooltipPrimitive.Provider delayDuration={350}>
                <Command key={`${dropdownMode}-${dropdownPageId}`} className="bg-[#161616]" filter={(value, search, keywords) => {
                  if (!search.trim()) return 1;
                  const searchable = [value, ...(keywords || [])].join(' ').toLowerCase();
                  const words = search.toLowerCase().trim().split(/\s+/);
                  return words.every(w => searchable.includes(w)) ? 1 : 0;
                }} loop={false}>
                  <CommandInput
                    placeholder={dropdownMode === 'tokens' ? 'Search tokens...' : 'Search palette colors...'}
                    className="h-9 text-xs bg-[#0e0e0e] pl-[10px] mx-1.5 mt-1 mb-1 rounded-md text-[#ededed] placeholder:text-[#555] focus-visible:outline-none focus-visible:ring-0"
                  />
                  <CommandList className="pb-[5px] max-h-[260px]">
                    <CommandEmpty className="py-6 text-xs text-center text-[#888888]">
                      {dropdownMode === 'tokens' ? 'No tokens found.' : 'No palette colors found.'}
                    </CommandEmpty>

                    {(() => {
                      const activeFilterPageId = dropdownPageId === '__current__' ? node.pageId : dropdownPageId;
                      const paletteGroupIds = new Set(groups.filter(g => g.isPaletteEntry).map(g => g.id));
                      const selfTokenId = node.ownTokenId;

                      // Collect descendant IDs to prevent circular references
                      const descendantOwnTokenIds = new Set<string>();
                      collectDescendants(node.id).forEach(desc => {
                        if (desc.ownTokenId) descendantOwnTokenIds.add(desc.ownTokenId);
                      });

                      // Use allProjectNodes for cross-page lookups, current-page nodes for same-page
                      const scopeNodes = allProjectNodes.length > 0 ? allProjectNodes : nodes;

                      // Build map: tokenId → token node IDs that reference it as valueTokenId (theme-aware)
                      const resolveNodeEffectiveValueTokenId = (n: ColorNode): string | undefined => {
                        if (activeThemeId && n.valueTokenAssignments?.[activeThemeId] !== undefined) {
                          return n.valueTokenAssignments[activeThemeId] || undefined;
                        }
                        if (primaryThemeId && n.valueTokenAssignments?.[primaryThemeId] !== undefined) {
                          return n.valueTokenAssignments[primaryThemeId] || undefined;
                        }
                        return n.valueTokenId;
                      };
                      const valueTokenUsageMap = new Map<string, string[]>();
                      scopeNodes.forEach(n => {
                        if (n.isTokenNode && !n.isTokenPrefix && n.id !== node.id) {
                          const nVal = resolveNodeEffectiveValueTokenId(n);
                          if (nVal) {
                            const list = valueTokenUsageMap.get(nVal) || [];
                            list.push(n.id);
                            valueTokenUsageMap.set(nVal, list);
                          }
                        }
                      });

                      // Tokens actually assigned to a color node on the filtered page
                      const colorNodeAssignedTokenIds = new Set<string>();
                      scopeNodes.forEach(n => {
                        if (n.isTokenNode || n.isSpacing || n.isPalette) return;
                        if (n.pageId !== activeFilterPageId) return;
                        const nTokenIds = getNodeTokenIds(n);
                        nTokenIds.forEach(tid => colorNodeAssignedTokenIds.add(tid));
                      });

                      // Tokens owned by other token nodes on the filtered page
                      const tokenNodeOwnedTokenIds = new Set<string>();
                      scopeNodes.forEach(n => {
                        if (!n.isTokenNode || n.isTokenPrefix) return;
                        if (n.pageId !== activeFilterPageId) return;
                        if (n.ownTokenId && n.ownTokenId !== selfTokenId && !descendantOwnTokenIds.has(n.ownTokenId)) {
                          tokenNodeOwnedTokenIds.add(n.ownTokenId);
                        }
                      });

                      // Tokens currently referenced as valueTokenId by token nodes on the filtered page
                      const valueTokenInUseIds = new Set<string>();
                      scopeNodes.forEach(n => {
                        if (!n.isTokenNode || n.isTokenPrefix) return;
                        if (n.pageId !== activeFilterPageId) return;
                        const nVal = resolveNodeEffectiveValueTokenId(n);
                        if (nVal) valueTokenInUseIds.add(nVal);
                      });

                      // ─── Shared token item renderer ───
                      const renderTokenItem = (token: DesignToken, groupName: string, isPaletteToken?: boolean) => {
                        const _tv1 = activeThemeId && token.themeValues?.[activeThemeId];
                        const _h1raw = (_tv1 && _tv1.hue !== undefined) ? _tv1.hue : token.hue;
                        const _s1raw = (_tv1 && _tv1.saturation !== undefined) ? _tv1.saturation : token.saturation;
                        const _l1raw = (_tv1 && _tv1.lightness !== undefined) ? _tv1.lightness : token.lightness;
                        const hasColor = _h1raw != null && _s1raw != null && _l1raw != null;
                        const _h1 = _h1raw ?? 0;
                        const _s1 = _s1raw ?? 0;
                        const _l1 = _l1raw ?? 0;
                        const hslVal = hasColor ? `hsl(${Math.round(_h1)}, ${Math.round(_s1)}%, ${Math.round(_l1)}%)` : '';
                        const hexVal = hasColor ? hslToHex(_h1, _s1, _l1) : '';
                        const isCurrentValue = effectiveValueTokenId === token.id;
                        const isOwnedByTokenNode = !isPaletteToken && tokenNodeOwnedTokenIds.has(token.id);
                        const usedByNodeIds = valueTokenUsageMap.get(token.id);
                        const isUsedElsewhere = !!usedByNodeIds && usedByNodeIds.length > 0;
                        const usageCount = usedByNodeIds?.length ?? 0;
                        const isUsagePopoverOpen = usagePopoverTokenId === token.id;
                        const itemColorInfo = hasColor ? resolveTokenColorInfo(token, activeThemeId, tooltipScopeNodes) : null;

                        const numbers1 = token.name.match(/\d+/g);
                        const searchKeywords1 = [groupName, token.name, hexVal, ...(numbers1 || [])];

                        return (
                          <div key={token.id} className="relative">
                            <TooltipPrimitive.Root>
                            <TooltipPrimitive.Trigger asChild>
                            <div>
                            <CommandItem
                              value={`${token.id}__${token.name}`}
                              keywords={searchKeywords1}
                              onSelect={() => {
                                if (!isCurrentValue) {
                                  const themeKey = activeThemeId || primaryThemeId;
                                  const updates: Partial<ColorNode> = {
                                    valueTokenId: isPrimaryTheme ? token.id : node.valueTokenId,
                                    valueTokenAssignments: {
                                      ...node.valueTokenAssignments,
                                      [themeKey]: token.id,
                                    },
                                  };
                                  onUpdateNode(node.id, updates);
                                  if (node.ownTokenId && hasColor) {
                                    const ownTokenUpdates: Partial<DesignToken> = {
                                      hue: _h1,
                                      saturation: _s1,
                                      lightness: _l1,
                                    };
                                    const valueThemeValues = token.themeValues || {};
                                    const syncedThemeValues: { [themeId: string]: any } = {};
                                    Object.keys(valueThemeValues).forEach(tid => {
                                      syncedThemeValues[tid] = { ...valueThemeValues[tid] };
                                    });
                                    if (Object.keys(syncedThemeValues).length > 0) {
                                      ownTokenUpdates.themeValues = syncedThemeValues;
                                    }
                                    onUpdateToken(node.ownTokenId, ownTokenUpdates);
                                  }
                                } else {
                                  const themeKey = activeThemeId || primaryThemeId;
                                  const newAssignments = { ...node.valueTokenAssignments };
                                  delete newAssignments[themeKey];
                                  const updates: Partial<ColorNode> = {
                                    valueTokenId: isPrimaryTheme ? undefined : node.valueTokenId,
                                    valueTokenAssignments: Object.keys(newAssignments).length > 0 ? newAssignments : undefined,
                                  };
                                  onUpdateNode(node.id, updates);
                                  // Clear the own token's values back to empty since no value token is assigned
                                  if (node.ownTokenId && isPrimaryTheme) {
                                    const clearedThemeValues: { [tid: string]: any } = {};
                                    if (node.ownTokenId) {
                                      const ownToken = tokens.find(t => t.id === node.ownTokenId);
                                      if (ownToken?.themeValues) {
                                        Object.keys(ownToken.themeValues).forEach(tid => {
                                          clearedThemeValues[tid] = {};
                                        });
                                      }
                                    }
                                    onUpdateToken(node.ownTokenId, {
                                      themeValues: clearedThemeValues,
                                      hue: undefined,
                                      saturation: undefined,
                                      lightness: undefined,
                                      alpha: undefined,
                                    } as Partial<DesignToken>);
                                  }
                                }
                                setTokenComboOpenIndex(null);
                              }}
                              className="text-xs text-[#ededed] cursor-pointer flex items-center gap-2 px-3 py-[7px] aria-selected:bg-[#1e1e1e]"
                            >
                              {isOwnedByTokenNode ? (
                                <Tag className="size-2.5 shrink-0 text-[#555]" />
                              ) : hasColor ? (
                                <div
                                  className="w-3 h-3 rounded-sm shrink-0 ring-1 ring-inset ring-white/[0.06]"
                                  style={{ backgroundColor: hslVal }}
                                />
                              ) : (
                                <Tag className="size-2.5 shrink-0 text-[#555]" />
                              )}
                              <span className="truncate flex-1">{token.name}</span>
                              {isCurrentValue && (
                                <Check className="h-3 w-3 text-[#0070f3] shrink-0" />
                              )}
                              {isUsedElsewhere && (
                                <div className="w-5 shrink-0" />
                              )}
                            </CommandItem>
                            </div>
                            </TooltipPrimitive.Trigger>
                            {itemColorInfo && (
                              <TooltipPrimitive.Portal>
                                <TooltipPrimitive.Content
                                  side="right"
                                  sideOffset={12}
                                  className="z-[300] bg-[#161616]/95 backdrop-blur-md border border-[#ffffff]/[0.06] rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.5)] animate-in fade-in-0 zoom-in-95 data-[side=right]:slide-in-from-left-2 data-[side=left]:slide-in-from-right-2"
                                >
                                  <TokenColorTooltipBody
                                    name={token.name}
                                    color={itemColorInfo.hsla}
                                    colorSpace={itemColorInfo.colorSpace}
                                    spaceValue={itemColorInfo.spaceValue}
                                    hex={itemColorInfo.hex}
                                  />
                                </TooltipPrimitive.Content>
                              </TooltipPrimitive.Portal>
                            )}
                            </TooltipPrimitive.Root>
                            {isUsedElsewhere && (
                              <Popover open={isUsagePopoverOpen} onOpenChange={(open) => {
                                setUsagePopoverTokenId(open ? token.id : null);
                              }}>
                                <PopoverTrigger asChild>
                                  <button
                                    className={cn(
                                      "absolute right-3 top-1/2 -translate-y-1/2 z-10",
                                      "min-w-[20px] h-[20px] rounded-full flex items-center justify-center",
                                      "text-[10px] tabular-nums transition-colors cursor-pointer",
                                      isUsagePopoverOpen
                                        ? "bg-[#0070f3]/25 text-[#5ea3f8]"
                                        : "bg-[#ffffff]/[0.06] text-[#777] hover:bg-[#ffffff]/[0.12] hover:text-[#aaa]"
                                    )}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {usageCount}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent
                                  side="right"
                                  align="start"
                                  sideOffset={12}
                                  className="w-[200px] p-0 bg-[#1a1a1a] border-[#333] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                                  onOpenAutoFocus={(e) => e.preventDefault()}
                                  onCloseAutoFocus={(e) => e.preventDefault()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="px-3 pt-2.5 pb-1.5 text-[10px] tracking-wide uppercase text-[#666]">
                                    Referenced by
                                  </div>
                                  <div className="px-1.5 pb-1.5 flex flex-col">
                                    {usedByNodeIds!.map((refNodeId) => {
                                      const refNode = scopeNodes.find(n => n.id === refNodeId);
                                      if (!refNode) return null;
                                      const refPath = computePath(refNode, scopeNodes);
                                      const refEffectiveVtId = resolveNodeEffectiveValueTokenId(refNode);
                                      const refVt = refEffectiveVtId ? tokens.find(t => t.id === refEffectiveVtId) : null;
                                      const refTv = refVt && activeThemeId ? refVt.themeValues?.[activeThemeId] : null;
                                      const refH = (refTv && refTv.hue !== undefined) ? refTv.hue : (refVt?.hue ?? 0);
                                      const refS = (refTv && refTv.saturation !== undefined) ? refTv.saturation : (refVt?.saturation ?? 0);
                                      const refL = (refTv && refTv.lightness !== undefined) ? refTv.lightness : (refVt?.lightness ?? 0);
                                      const refHasColor = refVt != null;
                                      const refHsl = refHasColor ? `hsl(${Math.round(refH)}, ${Math.round(refS)}%, ${Math.round(refL)}%)` : '';

                                      return (
                                        <button
                                          key={refNodeId}
                                          className="flex items-center gap-2 px-2 py-[6px] rounded-md text-xs text-[#ccc] hover:bg-[#ffffff]/[0.06] hover:text-[#ededed] transition-colors w-full text-left cursor-pointer"
                                          onClick={() => {
                                            setUsagePopoverTokenId(null);
                                            setTokenComboOpenIndex(null);
                                            window.dispatchEvent(new CustomEvent('saveTokenNavBackState', {
                                              detail: { sourceNodeId: node.id }
                                            }));
                                            onNavigateToNode(refNodeId);
                                          }}
                                        >
                                          {refHasColor ? (
                                            <div
                                              className="w-3 h-3 rounded-sm shrink-0"
                                              style={{ backgroundColor: refHsl }}
                                            />
                                          ) : (
                                            <Tag className="w-3 h-3 shrink-0 text-[#555]" />
                                          )}
                                          <span className="truncate flex-1 min-w-0">{refPath}</span>
                                          <Locate className="w-3 h-3 shrink-0 text-[#555]" />
                                        </button>
                                      );
                                    })}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        );
                      };

                      // ─── TOKENS MODE ───
                      if (dropdownMode === 'tokens') {
                        const eligibleGroups = groups.filter(g =>
                          !g.isPaletteEntry && g.pageId === activeFilterPageId
                        );
                        const eligibleGroupIds = new Set(eligibleGroups.map(g => g.id));

                        const isTokenEligible = (t: DesignToken) =>
                          !paletteGroupIds.has(t.groupId || '') &&
                          t.pageId === activeFilterPageId &&
                          (colorNodeAssignedTokenIds.has(t.id) || tokenNodeOwnedTokenIds.has(t.id) || valueTokenInUseIds.has(t.id)) &&
                          t.id !== selfTokenId &&
                          !descendantOwnTokenIds.has(t.id);

                        const groupedSections = eligibleGroups.map((group) => {
                          const groupTokens = tokens.filter(t =>
                            t.groupId === group.id && isTokenEligible(t)
                          );
                          if (groupTokens.length === 0) return null;

                          const isTokenNodeGrp = !!group.isTokenNodeGroup;

                          return (
                            <CommandGroup
                              key={group.id}
                              heading={group.name}
                              className="[&_[cmdk-group-heading]]:!hidden p-0"
                            >
                              <div className="flex items-center text-xs text-[#888] font-semibold sticky top-0 z-10 bg-[#161616] pl-[10px] pr-2 py-1.5">
                                <span className="inline-flex items-center gap-[5px] bg-white/[0.035] rounded-[5px] px-[6px] py-[1px]">
                                  {isTokenNodeGrp && (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      style={{ flexShrink: 0 }}
                                    >
                                      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/>
                                      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>
                                    </svg>
                                  )}
                                  {group.name}
                                </span>
                              </div>
                              {groupTokens.map((token) => renderTokenItem(token, group.name))}
                            </CommandGroup>
                          );
                        });

                        const ungroupedTokens = tokens.filter(t =>
                          (!t.groupId || !eligibleGroupIds.has(t.groupId)) &&
                          isTokenEligible(t)
                        );
                        const ungroupedSection = ungroupedTokens.length > 0 ? (
                          <CommandGroup
                            key="__others__"
                            heading="Others"
                            className="[&_[cmdk-group-heading]]:!hidden p-0"
                          >
                            <div className="flex items-center text-xs text-[#888] font-semibold sticky top-0 z-10 bg-[#161616] pl-[10px] pr-2 py-1.5">
                              <span className="inline-flex items-center gap-[5px] bg-white/[0.035] rounded-[5px] px-[6px] py-[1px]">
                                Others
                              </span>
                            </div>
                            {ungroupedTokens.map((token) => renderTokenItem(token, 'Others'))}
                          </CommandGroup>
                        ) : null;

                        return [...groupedSections, ungroupedSection];
                      }

                      // ─── PALETTES MODE ───
                      const paletteGroups = groups.filter(g =>
                        g.isPaletteEntry && g.pageId === activeFilterPageId
                      );

                      if (paletteGroups.length === 0) {
                        return null; // CommandEmpty will show
                      }

                      return paletteGroups.map((group) => {
                        const paletteTokens = tokens.filter(t =>
                          t.groupId === group.id &&
                          t.pageId === activeFilterPageId &&
                          t.id !== selfTokenId &&
                          !descendantOwnTokenIds.has(t.id)
                        );
                        if (paletteTokens.length === 0) return null;

                        return (
                          <CommandGroup
                            key={group.id}
                            heading={group.name}
                            className="[&_[cmdk-group-heading]]:!hidden p-0"
                          >
                            <div className="flex items-center text-xs text-[#888] font-semibold sticky top-0 z-10 bg-[#161616] pl-[10px] pr-2 py-1.5">
                              <span className="inline-flex items-center gap-[5px] bg-white/[0.035] rounded-[5px] px-[6px] py-[1px]">
                                <Palette className="size-[10px] shrink-0" />
                                {group.name}
                              </span>
                            </div>
                            {paletteTokens.map((token) => renderTokenItem(token, group.name, true))}
                          </CommandGroup>
                        );
                      });
                    })()}
                  </CommandList>
                </Command>
                </TooltipPrimitive.Provider>
              </PopoverContent>
            </Popover>
            </div>
            </TooltipPrimitive.Trigger>
            {assignedColorInfo && (
              <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                  side="bottom"
                  sideOffset={8}
                  className="z-[200] bg-[#161616]/95 backdrop-blur-md border border-[#ffffff]/[0.06] rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.5)] animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
                >
                  <TokenColorTooltipBody
                    name={assignedToken!.name}
                    color={assignedColorInfo.hsla}
                    colorSpace={assignedColorInfo.colorSpace}
                    spaceValue={assignedColorInfo.spaceValue}
                    hex={assignedColorInfo.hex}
                  />
                </TooltipPrimitive.Content>
              </TooltipPrimitive.Portal>
            )}
            </TooltipPrimitive.Root>
            </TooltipPrimitive.Provider>

            {/* Remove button — hover-only overlay, only when a token is assigned */}
            {assignedToken && (
              <Tip label="Unassign" side="top">
                <button
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover/tokenfield:opacity-100 transition-all hover:bg-red-500/10 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onSelect();
                    // Clear this theme's valueTokenAssignment
                    const themeKey = activeThemeId || primaryThemeId;
                    const newAssignments = { ...node.valueTokenAssignments };
                    delete newAssignments[themeKey];
                    onUpdateNode(node.id, {
                      valueTokenId: isPrimaryTheme ? undefined : node.valueTokenId,
                      valueTokenAssignments: Object.keys(newAssignments).length > 0 ? newAssignments : undefined,
                    });
                    // Clear the own token's values back to empty since no value token is assigned
                    if (node.ownTokenId && isPrimaryTheme) {
                      const ownToken = tokens.find(t => t.id === node.ownTokenId);
                      const clearedThemeValues: { [tid: string]: any } = {};
                      if (ownToken?.themeValues) {
                        Object.keys(ownToken.themeValues).forEach(tid => {
                          clearedThemeValues[tid] = {};
                        });
                      }
                      onUpdateToken(node.ownTokenId, {
                        themeValues: clearedThemeValues,
                        hue: undefined,
                        saturation: undefined,
                        lightness: undefined,
                        alpha: undefined,
                      } as Partial<DesignToken>);
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <X className="h-3 w-3 text-[#555] hover:text-red-400 transition-colors" />
                </button>
              </Tip>
            )}
          </div>
            );
          })()}
        </div>
        )}
      </Card>

      {/* Advanced Island — always rendered for non-prefix nodes to reserve space and prevent layout shifts.
           Visibility is toggled via opacity + visibility so the DOM height stays constant. */}
      {!isPrefix && (() => {
        const thisNodeHasLogic = hasAdvancedTokenAssignment || activeAdvancedChannels.length > 0;
        const isDormant = false;
        const isVisible = showAdvancedIsland;
        return (
          <div
            className="flex items-center justify-between px-4 py-[8px] rounded-[16px] mt-[2px] transition-opacity"
            style={{
              backgroundColor: '#0E0E0E',
              border: `1px solid ${isDormant ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'}`,
              width: `${nodeWidth}px`,
              opacity: isVisible ? (isDormant ? 0.5 : 1) : 0,
              pointerEvents: isVisible ? undefined : 'none',
              visibility: isVisible ? 'visible' : 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className={`text-[14px] select-none ${isDormant ? 'text-[#333]' : 'text-[#555]'}`}>Advanced</span>
              {hasAdvancedTokenAssignment && (
                <span
                  className="text-[9px] tracking-wide uppercase px-1.5 h-[16px] flex items-center justify-center rounded select-none"
                  style={{
                    color: '#E5A336',
                    backgroundColor: 'rgba(229,163,54,0.12)',
                    border: '1px solid rgba(229,163,54,0.25)',
                  }}
                >
                  TOKEN
                </span>
              )}
              {activeAdvancedChannels.length > 0 && (
                <div className="flex items-center gap-[3px]">
                  {activeAdvancedChannels.map(chKey => {
                    const label = ({
                      hue: 'H', saturation: 'S', lightness: 'L', alpha: 'A',
                      red: 'R', green: 'G', blue: 'B',
                      oklchL: 'L', oklchC: 'C', oklchH: 'H',
                      hctH: 'H', hctC: 'C', hctT: 'T',
                    } as Record<string, string>)[chKey] || chKey[0]?.toUpperCase();
                    return (
                      <span
                        key={chKey}
                        className="text-[9px] font-mono w-[16px] h-[16px] flex items-center justify-center rounded select-none"
                        style={{
                          color: '#45B36B',
                          backgroundColor: 'rgba(69,179,107,0.12)',
                          border: '1px solid rgba(69,179,107,0.25)',
                        }}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              className={`cursor-pointer transition-colors p-0.5 rounded hover:bg-white/[0.04] ${isDormant ? 'text-[#333] hover:text-[#666]' : 'text-[#555] hover:text-[#999]'}`}
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('openAdvancedPopup', { detail: { nodeId: node.id } }));
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 19a2 2 0 0 0 2 2c2 0 2 -4 3 -9s1 -9 3 -9a2 2 0 0 1 2 2" /><path d="M5 12h6" /><path d="M15 12l6 6" /><path d="M15 18l6 -6" /></svg>
            </button>
          </div>
        );
      })()}
    </div>
  );
}