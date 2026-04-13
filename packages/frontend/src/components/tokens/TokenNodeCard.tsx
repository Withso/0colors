import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ColorNode, DesignToken, TokenGroup, Page } from '../../types';
import { Card } from '../ui/card';
import { Plus, Trash2, Tag, ChevronsUpDown, Check, Crown, Unlink, Link2, Copy, Eye, EyeOff, Locate, X, Palette } from 'lucide-react';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Tip } from '../Tip';
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { hslToRgb, rgbToHex, hslToOklch } from '../../utils/color-conversions';
import { rgbToHct } from '../../utils/hct-utils';
import "./TokenNodeCard.css";

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
    <div className="token-card-tooltip-body">
      <div className="token-card-tooltip-header">
        <div className="token-card-tooltip-swatch" style={{ backgroundColor: color }} />
        <span className="token-card-tooltip-name">{name}</span>
      </div>
      <div className="token-card-tooltip-divider" />
      <div className="token-card-tooltip-values">
        {showSpaceRow && (
          <div className="token-card-tooltip-row">
            <span className="token-card-tooltip-label">{colorSpace}</span>
            <span className="token-card-tooltip-value">{spaceValue}</span>
          </div>
        )}
        <div className="token-card-tooltip-row">
          <span className="token-card-tooltip-label">HEX</span>
          <span className="token-card-tooltip-value">{hex}</span>
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
    if (!valueToken) return 'var(--text-secondary)';
    const tv = activeThemeId && valueToken.themeValues?.[activeThemeId];
    const l = (tv && tv.lightness !== undefined) ? tv.lightness : (valueToken.lightness ?? 0);
    return l > 55 ? 'color-mix(in srgb, var(--absolute-black) 70%, transparent)' : 'color-mix(in srgb, var(--absolute-white) 85%, transparent)';
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
    <div className="token-card-root" data-node-card data-testid={`tokens-token-node-card-${node.id}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left side + button for parent connection */}
      <div
        className="token-card-left-connect-area"
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
          className={`token-card-connect-btn ${
            isLeftConnectionLocked
              ? 'token-card-connect-btn-locked'
              : isWireHovered && wireStartButtonType === 'right' ? 'token-card-connect-btn-success' : 'token-card-connect-btn-default'
          }`}
          title={isLeftConnectionLocked ? "Inherited from primary" : isConnected ? (isMultiSelected ? "Disconnect from parent (Shift+click to unlink all selected)" : "Disconnect from parent") : "Add new parent or drag to connect"}
          data-node-id={node.id}
          data-button-type="left-connect"
        >
          <Plus className={`token-card-connect-icon ${isLeftConnectionLocked ? 'token-card-connect-icon-dim' : isWireHovered && wireStartButtonType === 'right' ? 'token-card-connect-icon-white' : 'token-card-connect-icon-default'}`} />
        </button>

        {/* Parent selection popup */}
        {showParentSelector && !isConnected && availableParents.length > 0 && (
          <div className="token-card-parent-popup">
            <div className="token-card-parent-popup-label">Select parent:</div>
            {availableParents.map((parent) => (
              <button
                key={parent.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onLinkNode(node.id, parent.id);
                  setShowParentSelector(false);
                }}
                className="token-card-parent-popup-item"
              >
                <Tag className="token-card-parent-popup-item-icon" />
                {parent.referenceName || 'Token'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right side + button for adding child */}
      <div
        className="token-card-right-connect-area"
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
          className={`token-card-connect-btn ${
            isStructurallyLocked
              ? 'token-card-connect-btn-locked'
              : isWireHovered && wireStartButtonType === 'left' ? 'token-card-connect-btn-success' : 'token-card-connect-btn-default'
          }`}
          title={isStructurallyLocked ? "Inherited from primary" : "Add child node or drag to connect"}
          data-node-id={node.id}
          data-button-type="right-connect"
        >
          <Plus className={`token-card-connect-icon ${isStructurallyLocked ? 'token-card-connect-icon-dim' : isWireHovered && wireStartButtonType === 'left' ? 'token-card-connect-icon-white' : 'token-card-connect-icon-default'}`} />
        </button>
      </div>

      {/* Connection port indicator on right top */}
      <div className="token-card-right-port" />

      <Card
        className="token-card-body"
        style={{
          border: isSelected ? '1px solid var(--accent-primary)' : isMultiSelected ? '1px solid var(--accent-primary-hover)' : '1px solid transparent',
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
          className={`token-card-name-area ${isPrefix ? 'token-card-name-area-prefix' : 'token-card-name-area-child'} ${isNodeInherited && !showAllVisible ? 'token-card-name-area-inherited' : ''}`}
          style={{
            ...(nameDimOpacity !== undefined ? { opacity: nameDimOpacity } : {}),
          }}
          onMouseEnter={() => { if (!isPrimaryTheme) setHoveredSection('name'); }}
          onMouseLeave={() => { if (hoveredSection === 'name') setHoveredSection(null); }}
        >
          {/* Visibility toggle — outside the card to the left, matching ColorNodeCard */}
          {onToggleVisibility && (
            <div
              className={`token-card-visibility-toggle ${
                isNodeHidden
                  ? 'token-card-visibility-hidden'
                  : isHovered
                    ? 'token-card-visibility-hover'
                    : 'token-card-visibility-idle'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility();
              }}
              title={isNodeHidden ? 'Show node' : 'Hide node'}
            >
              {isNodeHidden ? <EyeOff className="token-card-visibility-icon" /> : <Eye className="token-card-visibility-icon" />}
            </div>
          )}

          {/* Editable token name */}
          <div className="token-card-name-content">
            {/* Prefix badge for prefix nodes */}
            {isPrefix && (
              <span className="token-card-prefix-badge">Prefix</span>
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
                className="token-card-name-input"
                maxLength={50}
              />
            ) : (
              <button
                className="token-card-name-button"
                style={{ color: 'var(--text-tertiary)' }}
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
          className={`token-card-token-section ${isTokenSectionDimmed ? 'token-card-token-section-dimmed' : ''}`}
          style={tokenDimOpacity !== undefined ? { opacity: tokenDimOpacity } : undefined}
          onMouseEnter={() => { if (tokenNeedsHover) setHoveredSection('token'); }}
          onMouseLeave={() => { if (hoveredSection === 'token') setHoveredSection(null); }}
        >
          {/* Token inheritance toggle for non-primary themes */}
          {!isPrimaryTheme && (
            <div
              className="token-card-theme-toggle"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Crown
                className={`token-card-crown-icon ${
                  hasAnyTokenChanges
                    ? 'token-card-crown-modified'
                    : 'token-card-crown-inherited'
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
                className="token-card-switch"
                style={{
                  backgroundColor: !hasAnyTokenChanges ? 'var(--status-warning)' : 'var(--on-surface-disabled)',
                }}
              />
              <span className={`token-card-theme-label ${hasAnyTokenChanges ? 'token-card-theme-label-modified' : 'token-card-theme-label-inherited'}`}>
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
              <div className="token-card-token-field">
                {hasAdvancedTokenAssignment && (
                  <div className="token-card-advanced-overlay">
                    {advancedTokenOutput ? (
                      advancedTokenOutput.type === 'error' ? (
                        <span className="token-card-advanced-error"
                          title={advancedTokenOutput.label}>
                          {advancedTokenOutput.label}
                        </span>
                      ) : (
                        <div className="token-card-advanced-output">
                          {advancedTokenOutput.type === 'color' && advancedTokenOutput.cssColor && (
                            <span
                              className="token-card-advanced-swatch"
                              style={{ backgroundColor: advancedTokenOutput.cssColor }}
                            />
                          )}
                          {advancedTokenOutput.type === 'tokenRef' && (
                            advancedTokenOutput.cssColor ? (
                              <span
                                className="token-card-advanced-swatch token-card-advanced-swatch-token-ref"
                                style={{ backgroundColor: advancedTokenOutput.cssColor }}
                              />
                            ) : (
                              <Tag className="token-card-advanced-tag-icon" />
                            )
                          )}
                          <span className="token-card-advanced-output-label"
                            title={advancedTokenOutput.label}>
                            {advancedTokenOutput.label}
                          </span>
                        </div>
                      )
                    ) : (
                      <span className="token-card-advanced-no-output">
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
                      className={`token-card-trigger-btn ${
                        hasAdvancedTokenAssignment ? 'token-card-trigger-btn-advanced' : 'token-card-trigger-btn-pointer'
                      } ${
                        assignedToken ? 'token-card-trigger-assigned' : 'token-card-trigger-empty'
                      }`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => { if (!hasAdvancedTokenAssignment) onSelect(); }}
                    >
                      {assignedToken ? (
                        <>
                          {isAssignedOwnedByTokenNode ? (
                            <Tag className="token-card-tag-icon-sm" />
                          ) : _isEmpty0 ? (
                            <div className="token-card-swatch-sm token-card-swatch-dashed" />
                          ) : (
                            <div
                              className="token-card-swatch-sm token-card-swatch-ring"
                              style={{ backgroundColor: assignedHsl }}
                            />
                          )}
                          <span className="token-card-trigger-label">{assignedToken.name}</span>
                          <ChevronsUpDown className="token-card-trigger-chevron" />
                        </>
                      ) : (
                        <>
                          <div className="token-card-empty-swatch">
                            <Plus className="token-card-empty-swatch-icon" />
                          </div>
                          <span className="token-card-trigger-placeholder">Assign token...</span>
                        </>
                      )}
                    </button>
                  </PopoverTrigger>
              <PopoverContent
                className="token-card-dropdown"
                side="bottom"
                align="start"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* ── Page switcher ── */}
                {pages.length > 1 && (
                  <div className="token-card-page-switcher">
                    <div className="token-card-page-tabs">
                      {[
                        { id: '__current__' as string, name: 'This page' },
                        ...pages.filter(p => p.id !== node.pageId).sort((a, b) => a.createdAt - b.createdAt)
                      ].map((pg) => {
                        const isActive = dropdownPageId === pg.id;
                        return (
                          <button
                            key={pg.id}
                            className={`token-card-page-tab ${isActive ? 'token-card-page-tab-active' : 'token-card-page-tab-inactive'}`}
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
                <div className="token-card-mode-tabs-wrapper">
                  <div className="token-card-mode-tabs">
                    {([
                      { key: 'tokens' as const, label: 'Tokens', icon: <Tag className="token-card-mode-icon" /> },
                      { key: 'palettes' as const, label: 'Palettes', icon: <Palette className="token-card-mode-icon" /> },
                    ]).map(({ key, label, icon }) => {
                      const isActive = dropdownMode === key;
                      return (
                        <button
                          key={key}
                          className={`token-card-mode-tab ${isActive ? 'token-card-mode-tab-active' : 'token-card-mode-tab-inactive'}`}
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
                <Command key={`${dropdownMode}-${dropdownPageId}`} className="token-card-command-bg" filter={(value, search, keywords) => {
                  if (!search.trim()) return 1;
                  const searchable = [value, ...(keywords || [])].join(' ').toLowerCase();
                  const words = search.toLowerCase().trim().split(/\s+/);
                  return words.every(w => searchable.includes(w)) ? 1 : 0;
                }} loop={false}>
                  <CommandInput
                    placeholder={dropdownMode === 'tokens' ? 'Search tokens...' : 'Search palette colors...'}
                    className="token-card-search-input"
                  />
                  <CommandList className="token-card-command-list">
                    <CommandEmpty className="token-card-command-empty">
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
                          <div key={token.id} className="token-card-item-wrapper">
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
                              className="token-card-item"
                            >
                              {isOwnedByTokenNode ? (
                                <Tag className="token-card-item-tag" />
                              ) : hasColor ? (
                                <div
                                  className="token-card-item-swatch"
                                  style={{ backgroundColor: hslVal }}
                                />
                              ) : (
                                <Tag className="token-card-item-tag" />
                              )}
                              <span className="token-card-item-label">{token.name}</span>
                              {isCurrentValue && (
                                <Check className="token-card-item-check" />
                              )}
                              {isUsedElsewhere && (
                                <div className="token-card-item-usage-spacer" />
                              )}
                            </CommandItem>
                            </div>
                            </TooltipPrimitive.Trigger>
                            {itemColorInfo && (
                              <TooltipPrimitive.Portal>
                                <TooltipPrimitive.Content
                                  side="right"
                                  sideOffset={12}
                                  className="token-card-color-tooltip"
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
                                    className={`token-card-usage-badge ${isUsagePopoverOpen ? 'token-card-usage-badge-open' : 'token-card-usage-badge-closed'}`}
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
                                  className="token-card-usage-popover"
                                  onOpenAutoFocus={(e) => e.preventDefault()}
                                  onCloseAutoFocus={(e) => e.preventDefault()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="token-card-usage-heading">
                                    Referenced by
                                  </div>
                                  <div className="token-card-usage-list">
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
                                          className="token-card-usage-item"
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
                                              className="token-card-usage-item-swatch"
                                              style={{ backgroundColor: refHsl }}
                                            />
                                          ) : (
                                            <Tag className="token-card-usage-item-tag" />
                                          )}
                                          <span className="token-card-usage-item-label">{refPath}</span>
                                          <Locate className="token-card-usage-item-locate" />
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
                              className="token-card-group"
                            >
                              <div className="token-card-group-header">
                                <span className="token-card-group-name">
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
                                      className="token-card-group-tag-icon"
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
                            className="token-card-group"
                          >
                            <div className="token-card-group-header">
                              <span className="token-card-group-name">
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
                            className="token-card-group"
                          >
                            <div className="token-card-group-header">
                              <span className="token-card-group-name">
                                <Palette className="token-card-mode-icon" style={{ flexShrink: 0 }} />
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
                  className="token-card-color-tooltip token-card-color-tooltip-bottom"
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
                  className="token-card-unassign-btn"
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
                  <X className="token-card-unassign-icon" />
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
            className="token-card-advanced-island"
            style={{
              backgroundColor: 'var(--surface-2)',
              width: `${nodeWidth}px`,
              opacity: isVisible ? (isDormant ? 0.5 : 1) : 0,
              pointerEvents: isVisible ? undefined : 'none',
              visibility: isVisible ? 'visible' : 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="token-card-advanced-left">
              <span className={`token-card-advanced-label ${isDormant ? 'token-card-advanced-label-dormant' : 'token-card-advanced-label-active'}`}>Advanced</span>
              {hasAdvancedTokenAssignment && (
                <span className="token-card-advanced-pill">
                  TOKEN
                </span>
              )}
              {activeAdvancedChannels.length > 0 && (
                <div className="token-card-advanced-channels">
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
                        className="token-card-advanced-channel"
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              className={`token-card-advanced-btn ${isDormant ? 'token-card-advanced-btn-dormant' : 'token-card-advanced-btn-active'}`}
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
