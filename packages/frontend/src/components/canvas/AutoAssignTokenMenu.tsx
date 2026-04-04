import { useState, useRef, useEffect, useCallback } from 'react';
import { ColorNode as ColorNodeType, DesignToken, TokenGroup } from '../../types';
import { Zap, ChevronDown, Check, X, RefreshCw, UserX } from 'lucide-react';
import { getUniqueTokenName } from '../../utils/nameValidation';
import { MAX_AUTO_ASSIGN_PREFIX } from '../../utils/textLimits';
import './AutoAssignTokenMenu.css';

// ─── Suffix helpers ────────────────────────────────────────────
type SuffixPattern = string; // '1-9' | '10-90' | '100-900' | 'a-z' | 'custom-N' where N is the increment

const PRESET_SUFFIXES = ['1-9', '10-90', '100-900', 'a-z'] as const;

/** Check if a suffix pattern is a custom increment (e.g. 'custom-5') */
function isCustomSuffix(pattern: string): boolean {
  return pattern.startsWith('custom-');
}

/** Extract the increment value from a custom suffix pattern */
function getCustomIncrement(pattern: string): number {
  const val = parseInt(pattern.replace('custom-', ''), 10);
  return isNaN(val) || val < 1 ? 1 : val;
}

/** Get the numeric increment for any suffix pattern */
function getPatternIncrement(pattern: string): number {
  if (isCustomSuffix(pattern)) return getCustomIncrement(pattern);
  switch (pattern) {
    case '1-9': return 1;
    case '10-90': return 10;
    case '100-900': return 100;
    default: return 1;
  }
}

/** Get the default "start from" value for a suffix pattern (= the increment itself, preserving backward compat) */
export function getDefaultStartFrom(pattern: string): number {
  if (pattern === 'a-z') return 0; // a-z doesn't use numeric start
  return getPatternIncrement(pattern);
}

/** Get a human-readable label for a suffix pattern */
export function getSuffixLabel(pattern: string): string {
  if (isCustomSuffix(pattern)) {
    const inc = getCustomIncrement(pattern);
    return `+${inc} (${inc}, ${inc * 2}, ${inc * 3}...)`;
  }
  return pattern;
}

export function getAutoAssignSuffixValue(pattern: SuffixPattern, index: number, startFrom?: number): string {
  if (pattern === 'a-z') return String.fromCharCode(97 + (index % 26));
  const inc = getPatternIncrement(pattern);
  const start = startFrom ?? inc; // Default: start at increment value (backward compat: 1,2,3... / 10,20,30... etc.)
  return String(start + index * inc);
}

// ─── Props ─────────────────────────────────────────────────────
interface AutoAssignTokenMenuProps {
  node: ColorNodeType;
  allNodes: ColorNodeType[];
  groups: TokenGroup[];
  tokens: DesignToken[];
  isVisible: boolean;
  defaultPrefix: string;
  activeProjectId: string;
  onUpdateNode: (id: string, updates: Partial<ColorNodeType>) => void;
  onAddToken: (name?: string, groupId?: string | null, projectId?: string) => string | undefined;
  onAssignToken: (nodeId: string, tokenId: string, isAssigned: boolean) => void;
  onUpdateToken: (id: string, updates: Partial<DesignToken>) => void;
  onDeleteToken: (id: string) => void;
  onUpdateGroups: (groups: TokenGroup[]) => void;
  // External popup trigger (from prompt bubble rendered at node level)
  shouldOpenPopup: boolean;
  onPopupOpened: () => void;
  // Report popup open/close state back to parent (for z-index + visibility)
  onPopupOpenChange: (isOpen: boolean) => void;
  // Select this node (ensures label stays visible and node gets visual selection)
  onSelectNode: () => void;
  // True when THIS node is the one whose menu/popup is active at canvas level.
  // When another node takes over, this goes false and we must close local state.
  isActiveMenu: boolean;
  // When true, show auto-assign status as read-only (sample/community/read-only projects)
  readOnly?: boolean;
}

export function AutoAssignTokenMenu({
  node,
  allNodes,
  groups,
  tokens,
  isVisible,
  defaultPrefix,
  activeProjectId,
  onUpdateNode,
  onAddToken,
  onAssignToken,
  onUpdateToken,
  onDeleteToken,
  onUpdateGroups,
  shouldOpenPopup,
  onPopupOpened,
  onPopupOpenChange,
  onSelectNode,
  isActiveMenu,
  readOnly = false,
}: AutoAssignTokenMenuProps) {
  // ─── UI state ────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // ─── Form state ──────────────────────────────────────────────
  const [prefix, setPrefix] = useState(node.autoAssignPrefix || defaultPrefix);
  const [suffix, setSuffix] = useState<SuffixPattern>(node.autoAssignSuffix || '1-9');
  const [startFrom, setStartFrom] = useState<number | undefined>(node.autoAssignStartFrom);
  const [startFromInput, setStartFromInput] = useState<string>(
    node.autoAssignStartFrom !== undefined ? String(node.autoAssignStartFrom) : ''
  );
  const [groupId, setGroupId] = useState<string | null>(node.autoAssignGroupId ?? null);
  const [createNewGroup, setCreateNewGroup] = useState(false);
  const [suffixDropdownOpen, setSuffixDropdownOpen] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  // Custom increment input state
  const [customIncrementInput, setCustomIncrementInput] = useState<string>(
    isCustomSuffix(node.autoAssignSuffix || '') ? String(getCustomIncrement(node.autoAssignSuffix!)) : '5'
  );
  const customIncrementRef = useRef<HTMLInputElement>(null);

  const isEnabled = node.autoAssignEnabled === true;

  // Available groups (exclude color palette groups and palette entries)
  const availableGroups = groups.filter(
    g =>
      g.projectId === activeProjectId &&
      g.pageId === node.pageId &&
      !g.isColorPaletteGroup &&
      !g.isPaletteEntry
  );

  // ─── Excluded children tracking ──────────────────────────────
  const directChildren = allNodes
    .filter(
      n =>
        n.parentId === node.id &&
        !n.isPalette &&
        !n.isSpacing &&
        !allNodes.find(p => p.id === n.parentId)?.isPalette
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  const excludedChildren = directChildren.filter(c => c.autoAssignExcluded === true);

  // ─── Report popup/menu state to parent ───────────────────────
  // Use a ref to hold the callback so the effect only fires when
  // popupOpen/menuOpen ACTUALLY change — not when the callback
  // identity changes due to parent re-renders.  This prevents
  // other nodes' effects from spuriously calling onPopupOpenChange(false)
  // and clearing the z-index boost on the active popup node.
  const onPopupOpenChangeRef = useRef(onPopupOpenChange);
  onPopupOpenChangeRef.current = onPopupOpenChange;

  useEffect(() => {
    onPopupOpenChangeRef.current(popupOpen || menuOpen);
  }, [popupOpen, menuOpen]);

  // ─── Close local state when another node's menu takes over ───
  useEffect(() => {
    if (!isActiveMenu && (menuOpen || popupOpen)) {
      setMenuOpen(false);
      setPopupOpen(false);
      setSuffixDropdownOpen(false);
      setGroupDropdownOpen(false);
    }
  }, [isActiveMenu]); // intentionally only depend on isActiveMenu

  // Sync form state when node config changes externally
  useEffect(() => {
    if (node.autoAssignPrefix) setPrefix(node.autoAssignPrefix);
    if (node.autoAssignSuffix) {
      setSuffix(node.autoAssignSuffix);
      if (isCustomSuffix(node.autoAssignSuffix)) {
        setCustomIncrementInput(String(getCustomIncrement(node.autoAssignSuffix)));
      }
    }
    if (node.autoAssignStartFrom !== undefined) {
      setStartFrom(node.autoAssignStartFrom);
      setStartFromInput(String(node.autoAssignStartFrom));
    }
    if (node.autoAssignGroupId !== undefined) setGroupId(node.autoAssignGroupId);
  }, [node.autoAssignPrefix, node.autoAssignSuffix, node.autoAssignStartFrom, node.autoAssignGroupId]);

  // External trigger: open popup when prompt bubble is clicked
  useEffect(() => {
    if (shouldOpenPopup && !popupOpen) {
      if (!node.autoAssignPrefix) setPrefix(defaultPrefix);
      setPopupOpen(true);
      setMenuOpen(false);
      onPopupOpened();
    }
  }, [shouldOpenPopup, popupOpen, defaultPrefix, node.autoAssignPrefix, onPopupOpened]);

  // Close popup/menu on outside click (uses capture phase to work even with stopPropagation)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isOutsideMenu = !menuRef.current?.contains(target);
      const isOutsidePopup = !popupRef.current?.contains(target);
      if (isOutsideMenu && isOutsidePopup) {
        setMenuOpen(false);
        setPopupOpen(false);
        setSuffixDropdownOpen(false);
        setGroupDropdownOpen(false);
      }
    };
    if (menuOpen || popupOpen) {
      // Use capture phase so this fires even when other elements call stopPropagation
      document.addEventListener('mousedown', handler, true);
      return () => document.removeEventListener('mousedown', handler, true);
    }
  }, [menuOpen, popupOpen]);

  // ─── Helper: get direct color children of a parent ───────────
  const getDirectChildren = useCallback(
    (parentNode: ColorNodeType) => {
      return allNodes
        .filter(
          n =>
            n.parentId === parentNode.id &&
            !n.isPalette &&
            !n.isSpacing &&
            !allNodes.find(p => p.id === n.parentId)?.isPalette
        )
        .sort((a, b) => a.id.localeCompare(b.id));
    },
    [allNodes]
  );

  // ─── Auto-assign logic (comprehensive) ──────────────────────
  // Creates tokens for all eligible direct children.
  // Skips children with autoAssignExcluded === true.
  // Skips children that already have a live auto-assigned token
  // (unless that token was just deleted — tracked via deletedTokenIds).
  const runAutoAssign = useCallback(
    (
      parentNode: ColorNodeType,
      prefixVal: string,
      suffixVal: SuffixPattern,
      targetGroupId: string | null,
      deletedTokenIds: Set<string> = new Set(),
    ) => {
      const children = getDirectChildren(parentNode);
      // Build index only for non-excluded children to get correct suffix ordering
      let assignIndex = 0;

      children.forEach((child) => {
        // Skip excluded children
        if (child.autoAssignExcluded) return;

        const suffixValue = getAutoAssignSuffixValue(suffixVal, assignIndex, startFrom);
        const tokenName = `${prefixVal}-${suffixValue}`;
        assignIndex++;

        // If the child already has a live auto-assigned token that wasn't just deleted, skip
        if (child.autoAssignedTokenId && !deletedTokenIds.has(child.autoAssignedTokenId)) {
          const existingToken = tokens.find(t => t.id === child.autoAssignedTokenId);
          if (existingToken) return;
        }

        // Create a new token for this child
        const newTokenId = onAddToken(tokenName, targetGroupId, activeProjectId);
        if (newTokenId) {
          onAssignToken(child.id, newTokenId, true);
          onUpdateNode(child.id, { autoAssignedTokenId: newTokenId });
        }
      });
    },
    [getDirectChildren, tokens, onAddToken, onAssignToken, onUpdateNode, activeProjectId, startFrom]
  );

  // ─── Re-include an excluded child ────────────────────────────
  const handleReincludeChild = (childId: string) => {
    onUpdateNode(childId, { autoAssignExcluded: false });

    // After re-including, re-index all auto-assigned tokens to maintain correct
    // suffix ordering and create a token for the re-included child.
    if (isEnabled) {
      const currentPrefix = node.autoAssignPrefix || defaultPrefix;
      const currentSuffix = node.autoAssignSuffix || '1-9';
      const currentStartFrom = node.autoAssignStartFrom;
      const currentGroupId = node.autoAssignGroupId ?? null;
      const children = getDirectChildren(node);
      let assignIndex = 0;

      children.forEach((child) => {
        // Skip excluded children (but NOT the one being re-included)
        if (child.autoAssignExcluded && child.id !== childId) return;

        const suffixValue = getAutoAssignSuffixValue(currentSuffix, assignIndex, currentStartFrom);
        const tokenName = `${currentPrefix}-${suffixValue}`;
        assignIndex++;

        if (child.autoAssignedTokenId) {
          const existingToken = tokens.find(t => t.id === child.autoAssignedTokenId);
          if (existingToken) {
            // Rename existing token to reflect updated ordering (dedup against existing names)
            const uniqueName = getUniqueTokenName(tokenName, tokens, activeProjectId, existingToken.id);
            if (existingToken.name !== uniqueName) {
              onUpdateToken(existingToken.id, { name: uniqueName });
            }
            return;
          }
        }

        // Create a new token for this child (re-included child or gap)
        const newTokenId = onAddToken(tokenName, currentGroupId, activeProjectId);
        if (newTokenId) {
          onAssignToken(child.id, newTokenId, true);
          onUpdateNode(child.id, {
            autoAssignedTokenId: newTokenId,
            ...(child.id === childId ? { autoAssignExcluded: false } : {}),
          });
        }
      });
    }
  };

  // ─── Toggle handler (from dropdown) ──────────────────────────
  const handleToggle = () => {
    if (isEnabled) {
      onUpdateNode(node.id, { autoAssignEnabled: false });
      setPopupOpen(false);
      setMenuOpen(false);
    } else {
      // Enable → open full popup, select node
      onSelectNode();
      setMenuOpen(false);
      setPopupOpen(true);
      if (!node.autoAssignPrefix) setPrefix(defaultPrefix);
    }
  };

  // ─── Re-apply handler (from dropdown) ────────────────────────
  // Re-creates tokens for children that lost theirs (accidental delete, etc.)
  // Also re-indexes existing token names to ensure consistent suffix ordering.
  const handleReapply = () => {
    if (!isEnabled) return;
    const currentPrefix = node.autoAssignPrefix || defaultPrefix;
    const currentSuffix: SuffixPattern = node.autoAssignSuffix || '1-9';
    const currentStartFrom = node.autoAssignStartFrom;
    const currentGroupId = node.autoAssignGroupId ?? null;
    const children = getDirectChildren(node);
    let assignIndex = 0;

    children.forEach((child) => {
      if (child.autoAssignExcluded) return;

      const suffixValue = getAutoAssignSuffixValue(currentSuffix, assignIndex, currentStartFrom);
      const tokenName = `${currentPrefix}-${suffixValue}`;
      assignIndex++;

      if (child.autoAssignedTokenId) {
        const existingToken = tokens.find(t => t.id === child.autoAssignedTokenId);
        if (existingToken) {
          // Rename existing token if its name is out of date (dedup against existing names)
          const uniqueName = getUniqueTokenName(tokenName, tokens, activeProjectId, existingToken.id);
          if (existingToken.name !== uniqueName) {
            onUpdateToken(existingToken.id, { name: uniqueName });
          }
          return;
        }
      }

      // Create a new token for this child (missing token)
      const newTokenId = onAddToken(tokenName, currentGroupId, activeProjectId);
      if (newTokenId) {
        onAssignToken(child.id, newTokenId, true);
        onUpdateNode(child.id, { autoAssignedTokenId: newTokenId });
      }
    });

    setMenuOpen(false);
  };

  // ─── Apply config ────────────────────────────────────────────
  const handleApply = () => {
    let targetGroupId = groupId;
    const effectivePrefix = prefix || defaultPrefix;
    const oldGroupId = node.autoAssignGroupId ?? null;

    // Determine if settings actually changed
    const prefixChanged = effectivePrefix !== (node.autoAssignPrefix || defaultPrefix);
    const suffixChanged = suffix !== (node.autoAssignSuffix || '1-9');
    const effectiveOldStartApply = node.autoAssignStartFrom ?? getDefaultStartFrom(node.autoAssignSuffix || '1-9');
    const effectiveNewStartApply = startFrom ?? getDefaultStartFrom(suffix);
    const startFromChanged = effectiveOldStartApply !== effectiveNewStartApply;
    // Group change is determined after new group creation below

    // Track group mutations — we'll apply them in a single onUpdateGroups call
    // to avoid React batching race conditions between multiple setState calls.
    let pendingGroups: TokenGroup[] | null = null;
    let newGroupObject: TokenGroup | null = null;

    if (createNewGroup) {
      const newGroupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const existingRegular = groups.filter(
        g =>
          g.projectId === activeProjectId &&
          g.pageId === node.pageId &&
          !g.isColorPaletteGroup &&
          !g.isPaletteEntry
      );
      const maxSortOrder = existingRegular.reduce(
        (max, g) => Math.max(max, g.sortOrder ?? -1),
        -1
      );
      newGroupObject = {
        id: newGroupId,
        name: effectivePrefix,
        projectId: activeProjectId,
        pageId: node.pageId,
        isExpanded: true,
        isAutoAssignCreated: true,
        sortOrder: maxSortOrder + 1,
        createdAt: Date.now(),
      };
      pendingGroups = [...groups, newGroupObject];
      targetGroupId = newGroupId;
    }

    const groupChanged = targetGroupId !== oldGroupId;
    const anySettingChanged = prefixChanged || suffixChanged || startFromChanged || groupChanged;

    // ── If settings changed, UPDATE existing tokens in-place ──────────────────
    // Instead of deleting and recreating, we MOVE (change groupId) and RENAME (change name)
    // existing auto-assigned tokens. This preserves token identity and references.
    // This runs both when updating an already-enabled config AND when re-enabling
    // after a disable — children may still hold auto-assigned tokens from the
    // previous session that need renaming/moving to the new prefix/group.
    if (anySettingChanged) {
      const children = getDirectChildren(node);
      let assignIndex = 0;
      const movedTokenIds = new Set<string>();

      children.forEach((child) => {
        // Skip excluded children — their tokens (if any) are not managed
        if (child.autoAssignExcluded) return;

        const suffixValue = getAutoAssignSuffixValue(suffix, assignIndex, startFrom);
        const newTokenName = `${effectivePrefix}-${suffixValue}`;
        assignIndex++;

        if (child.autoAssignedTokenId) {
          const existingToken = tokens.find(t => t.id === child.autoAssignedTokenId);
          if (existingToken) {
            const updates: Partial<DesignToken> = {};

            // Rename if prefix, suffix, or startFrom changed (dedup against existing names)
            if (prefixChanged || suffixChanged || startFromChanged) {
              updates.name = getUniqueTokenName(newTokenName, tokens, activeProjectId, existingToken.id);
            }

            // Move if group changed
            if (groupChanged) {
              updates.groupId = targetGroupId;
              movedTokenIds.add(existingToken.id);
            }

            if (Object.keys(updates).length > 0) {
              onUpdateToken(existingToken.id, updates);
            }
          }
        }
      });

      // Clean up old group if empty after moving tokens out
      if (oldGroupId && groupChanged) {
        const remainingInOldGroup = tokens.filter(
          t => t.groupId === oldGroupId && !movedTokenIds.has(t.id)
        );
        if (remainingInOldGroup.length === 0) {
          const oldGroup = groups.find(g => g.id === oldGroupId);
          if (oldGroup?.isAutoAssignCreated) {
            // Remove old group from the pending groups (or current groups)
            const baseGroups = pendingGroups || groups;
            pendingGroups = baseGroups.filter(g => g.id !== oldGroupId);
          }
        }
      }
    }

    // Apply any pending group changes in a single call
    if (pendingGroups) {
      onUpdateGroups(pendingGroups);
    }

    // Save config to parent node
    onUpdateNode(node.id, {
      autoAssignEnabled: true,
      autoAssignPrefix: effectivePrefix,
      autoAssignSuffix: suffix,
      autoAssignStartFrom: startFrom,
      autoAssignGroupId: targetGroupId,
    });

    // Create tokens for any children that don't have them yet
    // (new children added after initial setup, or first-time enable)
    // Since we kept existing tokens (moved/renamed), runAutoAssign will correctly
    // skip children that still have live tokens and only create for gaps.
    runAutoAssign(node, effectivePrefix, suffix, targetGroupId);

    setPopupOpen(false);
    setMenuOpen(false);
    setCreateNewGroup(false);
  };

  // Skip if the node itself is a palette or spacing
  if (node.isPalette || node.isSpacing) return null;

  // Also skip if this is a palette shade child
  const parentNode = node.parentId ? allNodes.find(n => n.id === node.parentId) : null;
  if (parentNode?.isPalette) return null;

  // In readOnly mode, only show the Zap indicator when auto-assign is enabled
  if (readOnly && !isEnabled) return null;

  // ─── Zap button click handler ────────────────────────────────
  const handleZapClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Always select the node when interacting with the Zap button
    onSelectNode();

    if (readOnly) {
      // In readOnly mode, toggle the read-only popup (view settings only)
      if (popupOpen) {
        setPopupOpen(false);
      } else {
        setPopupOpen(true);
      }
      return;
    }

    if (popupOpen) {
      // Already showing popup → close it
      setPopupOpen(false);
      setMenuOpen(false);
    } else if (!isEnabled) {
      // Not enabled → skip the dropdown, go directly to the full config popup
      setMenuOpen(false);
      setPopupOpen(true);
      if (!node.autoAssignPrefix) setPrefix(defaultPrefix);
    } else {
      // Enabled → toggle the dropdown (with toggle switch + Edit settings)
      setMenuOpen(!menuOpen);
    }
  };

  // ─── Compute change summary for "Update & Apply" ─────────────
  // Also shows when re-enabling if children already have auto-assigned tokens
  // from a previous session that will be renamed/moved.
  const getChangeSummary = (): string[] => {
    // Check if any children have existing auto-assigned tokens (re-enable scenario)
    const hasExistingAutoTokens = directChildren.some(
      c => c.autoAssignedTokenId && tokens.find(t => t.id === c.autoAssignedTokenId)
    );
    // Only show changes when editing an enabled config OR re-enabling with existing tokens
    if (!isEnabled && !hasExistingAutoTokens) return [];

    const changes: string[] = [];
    const currentPrefix = node.autoAssignPrefix || defaultPrefix;
    const currentSuffix = node.autoAssignSuffix || '1-9';
    const currentGroupId = node.autoAssignGroupId ?? null;
    const effectivePrefix = prefix || defaultPrefix;

    if (effectivePrefix !== currentPrefix) {
      changes.push(`Rename: "${currentPrefix}-*" → "${effectivePrefix}-*"`);
    }
    if (suffix !== currentSuffix) {
      const oldLabel = isCustomSuffix(currentSuffix) ? `Custom (+${getCustomIncrement(currentSuffix)})` : currentSuffix;
      const newLabel = isCustomSuffix(suffix) ? `Custom (+${getCustomIncrement(suffix)})` : suffix;
      changes.push(`Suffix: ${oldLabel} → ${newLabel}`);
    }
    // Detect startFrom change: compare effective start values (accounting for defaults)
    const effectiveOldStart = node.autoAssignStartFrom ?? getDefaultStartFrom(currentSuffix);
    const effectiveNewStart = startFrom ?? getDefaultStartFrom(suffix);
    if (effectiveOldStart !== effectiveNewStart) {
      changes.push(`Start from: ${effectiveOldStart} → ${effectiveNewStart}`);
    }
    if (createNewGroup || (!createNewGroup && groupId !== currentGroupId)) {
      const oldGroupName = currentGroupId
        ? availableGroups.find(g => g.id === currentGroupId)?.name || 'Unknown'
        : 'Ungrouped';
      const newGroupName = createNewGroup
        ? `New group (${effectivePrefix})`
        : groupId
        ? availableGroups.find(g => g.id === groupId)?.name || 'Unknown'
        : 'Ungrouped';
      if (oldGroupName !== newGroupName) {
        changes.push(`Move: ${oldGroupName} → ${newGroupName}`);
      }
    }
    return changes;
  };

  const changeSummary = getChangeSummary();
  const hasChanges = changeSummary.length > 0;

  // Count children that currently have missing tokens (for re-apply badge)
  const missingTokenCount = isEnabled
    ? directChildren.filter(c => {
        if (c.autoAssignExcluded) return false;
        if (!c.autoAssignedTokenId) return true;
        return !tokens.find(t => t.id === c.autoAssignedTokenId);
      }).length
    : 0;

  return (
    <>
      {/* Menu button — always rendered in the label row */}
      <div
        ref={menuRef}
        className={`auto-assign-wrapper ${
          isVisible || popupOpen || menuOpen ? '' : 'auto-assign-wrapper-hidden'
        }`}
      >
        <button
          className={`auto-assign-zap-btn ${
            isEnabled
              ? 'auto-assign-zap-btn-enabled'
              : popupOpen || menuOpen
              ? 'auto-assign-zap-btn-open'
              : 'auto-assign-zap-btn-default'
          }`}
          onClick={handleZapClick}
          onMouseDown={(e) => e.stopPropagation()}
          title={isEnabled ? 'Auto-assign tokens (active)' : 'Auto-assign tokens'}
        >
          <Zap size={13} className="fill-current" />
        </button>

        {/* Toggle dropdown (only shown when auto-assign is already ENABLED) */}
        {menuOpen && !popupOpen && (
          <div
            className="auto-assign-dropdown"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="auto-assign-dropdown-item auto-assign-dropdown-item-primary"
              onClick={handleToggle}
            >
              <div
                className={`auto-assign-toggle ${
                  isEnabled ? 'auto-assign-toggle-on' : 'auto-assign-toggle-off'
                }`}
              >
                <div className="auto-assign-toggle-knob" />
              </div>
              <span>Auto-assign tokens</span>
            </button>
            {isEnabled && (
              <>
                {/* Re-apply tokens */}
                <button
                  className="auto-assign-dropdown-item auto-assign-dropdown-item-secondary"
                  onClick={handleReapply}
                >
                  <RefreshCw size={12} style={{ marginLeft: 6 }} />
                  <span>Re-apply/Refresh</span>
                  {missingTokenCount > 0 && (
                    <span className="auto-assign-badge">
                      {missingTokenCount}
                    </span>
                  )}
                </button>
                {/* Edit settings */}
                <button
                  className="auto-assign-dropdown-item auto-assign-dropdown-item-secondary"
                  onClick={() => {
                    onSelectNode();
                    setMenuOpen(false);
                    setPopupOpen(true);
                  }}
                >
                  <span className="auto-assign-dropdown-indent">Edit settings...</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Auto-assign configuration popup */}
        {popupOpen && (
          <div
            ref={popupRef}
            className="auto-assign-popup"
            style={{
              left: '100%',
              top: 0,
              marginLeft: 6,
              width: 280,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="auto-assign-popup-header">
              <div className="auto-assign-popup-header-left">
                <Zap size={12} style={{ color: 'var(--icon-brand)' }} />
                <span className="auto-assign-popup-title">
                  {readOnly ? 'Auto-assign settings' : isEnabled ? 'Edit auto-assign' : 'Auto-assign tokens'}
                </span>
              </div>
              <button
                className="auto-assign-popup-close"
                onClick={() => {
                  setPopupOpen(false);
                  setMenuOpen(false);
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div className="auto-assign-popup-body">
              {readOnly ? (
                <>
                  {/* Read-only view of auto-assign settings */}
                  <div className="auto-assign-field" style={{ gap: 10 }}>
                    <div className="auto-assign-field">
                      <div className="auto-assign-label">Prefix</div>
                      <div className="auto-assign-ro-value">
                        {node.autoAssignPrefix || defaultPrefix}
                      </div>
                    </div>
                    <div className="auto-assign-field">
                      <div className="auto-assign-label">Suffix</div>
                      <div className="auto-assign-ro-plain">
                        {isCustomSuffix(node.autoAssignSuffix || '1-9')
                          ? `Custom (+${getCustomIncrement(node.autoAssignSuffix!)})`
                          : node.autoAssignSuffix || '1-9'}
                      </div>
                    </div>
                    {(node.autoAssignSuffix || '1-9') !== 'a-z' && node.autoAssignStartFrom !== undefined && (
                      <div className="auto-assign-field">
                        <div className="auto-assign-label">Start from</div>
                        <div className="auto-assign-ro-plain">
                          {node.autoAssignStartFrom}
                        </div>
                      </div>
                    )}
                    <div className="auto-assign-field">
                      <div className="auto-assign-label">Group</div>
                      <div className="auto-assign-ro-plain auto-assign-ro-plain-truncate">
                        {node.autoAssignGroupId
                          ? availableGroups.find(g => g.id === node.autoAssignGroupId)?.name || 'Unknown'
                          : 'Ungrouped'}
                      </div>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="auto-assign-preview">
                    <div className="auto-assign-preview-label">Preview</div>
                    <div className="auto-assign-preview-text">
                      {node.autoAssignPrefix || defaultPrefix}-
                      {getAutoAssignSuffixValue(node.autoAssignSuffix || '1-9', 0, node.autoAssignStartFrom)},{' '}
                      {node.autoAssignPrefix || defaultPrefix}-
                      {getAutoAssignSuffixValue(node.autoAssignSuffix || '1-9', 1, node.autoAssignStartFrom)},{' '}
                      {node.autoAssignPrefix || defaultPrefix}-
                      {getAutoAssignSuffixValue(node.autoAssignSuffix || '1-9', 2, node.autoAssignStartFrom)}
                      <span className="auto-assign-preview-ellipsis">...</span>
                    </div>
                  </div>

                  {/* Children count */}
                  <div className="auto-assign-children-info">
                    <span>{directChildren.filter(c => !c.autoAssignExcluded).length} children assigned</span>
                    {excludedChildren.length > 0 && (
                      <span className="auto-assign-children-excluded">{excludedChildren.length} excluded</span>
                    )}
                  </div>

                  {/* Read-only notice */}
                  <div className="auto-assign-ro-notice">
                    Read-only preview
                  </div>
                </>
              ) : (
                <>
              {/* Prefix */}
              <div className="auto-assign-field">
                <label className="auto-assign-label">
                  Prefix
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  maxLength={MAX_AUTO_ASSIGN_PREFIX}
                  className="auto-assign-text-input"
                  placeholder={defaultPrefix}
                />
              </div>

              {/* Suffix */}
              <div className="auto-assign-field">
                <label className="auto-assign-label">
                  Suffix
                </label>
                <div style={{ position: 'relative' }}>
                  <button
                    className="auto-assign-select-btn"
                    onClick={() => {
                      setSuffixDropdownOpen(!suffixDropdownOpen);
                      setGroupDropdownOpen(false);
                    }}
                  >
                    <span>{isCustomSuffix(suffix) ? `Custom (+${getCustomIncrement(suffix)})` : suffix}</span>
                    <ChevronDown size={12} style={{ color: 'var(--icon-disabled)' }} />
                  </button>
                  {suffixDropdownOpen && (
                    <div className="auto-assign-options">
                      {PRESET_SUFFIXES.map((opt) => (
                        <button
                          key={opt}
                          className={`auto-assign-option ${suffix === opt ? 'auto-assign-option-active' : ''}`}
                          onClick={() => {
                            setSuffix(opt);
                            setSuffixDropdownOpen(false);
                          }}
                        >
                          <span>{opt}</span>
                          {suffix === opt && <Check size={12} />}
                        </button>
                      ))}
                      {/* Divider */}
                      <div className="auto-assign-options-divider" />
                      {/* Custom increment option */}
                      <button
                        className={`auto-assign-option ${isCustomSuffix(suffix) ? 'auto-assign-option-active' : ''}`}
                        onClick={() => {
                          const inc = parseInt(customIncrementInput, 10);
                          const safeInc = isNaN(inc) || inc < 1 ? 5 : inc;
                          setSuffix(`custom-${safeInc}`);
                          setCustomIncrementInput(String(safeInc));
                          setSuffixDropdownOpen(false);
                          setTimeout(() => customIncrementRef.current?.focus(), 50);
                        }}
                      >
                        <span>Custom increment...</span>
                        {isCustomSuffix(suffix) && <Check size={12} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Custom increment input (shown when custom suffix is active) */}
                {isCustomSuffix(suffix) && (
                  <div className="auto-assign-increment-row">
                    <label className="auto-assign-increment-label">Increment by</label>
                    <input
                      ref={customIncrementRef}
                      type="number"
                      min={1}
                      max={10000}
                      value={customIncrementInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setCustomIncrementInput(raw);
                        const parsed = parseInt(raw, 10);
                        if (!isNaN(parsed) && parsed >= 1) {
                          setSuffix(`custom-${parsed}`);
                        }
                      }}
                      onBlur={() => {
                        const parsed = parseInt(customIncrementInput, 10);
                        const safeVal = isNaN(parsed) || parsed < 1 ? 1 : parsed;
                        setCustomIncrementInput(String(safeVal));
                        setSuffix(`custom-${safeVal}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="auto-assign-text-input auto-assign-text-input-center"
                      style={{ flex: 1 }}
                    />
                  </div>
                )}
              </div>

              {/* Start from (only for numeric suffix patterns, not a-z) */}
              {suffix !== 'a-z' && (
              <div className="auto-assign-field">
                <label className="auto-assign-label">
                  Start from
                </label>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={startFromInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setStartFromInput(raw);
                    const parsed = parseInt(raw, 10);
                    if (!isNaN(parsed) && parsed >= 0) {
                      setStartFrom(parsed);
                    }
                  }}
                  onBlur={() => {
                    if (startFromInput.trim() === '') {
                      setStartFrom(undefined);
                      return;
                    }
                    const parsed = parseInt(startFromInput, 10);
                    const safeVal = isNaN(parsed) || parsed < 0 ? 0 : parsed;
                    setStartFromInput(String(safeVal));
                    setStartFrom(safeVal);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder={String(getDefaultStartFrom(suffix))}
                  className="auto-assign-text-input"
                />
                <div className="auto-assign-hint">
                  Leave empty for default ({getDefaultStartFrom(suffix)})
                </div>
              </div>
              )}

              {/* Group */}
              <div className="auto-assign-field">
                <label className="auto-assign-label">
                  Group
                </label>
                <div style={{ position: 'relative' }}>
                  <button
                    className={`auto-assign-select-btn ${createNewGroup ? 'auto-assign-text-input-disabled' : ''}`}
                    disabled={createNewGroup}
                    onClick={() => {
                      setGroupDropdownOpen(!groupDropdownOpen);
                      setSuffixDropdownOpen(false);
                    }}
                  >
                    <span className="auto-assign-option-truncate" title={
                      createNewGroup
                        ? 'New group'
                        : groupId
                        ? availableGroups.find((g) => g.id === groupId)?.name || 'Unknown'
                        : 'Ungrouped'
                    }>
                      {createNewGroup
                        ? 'New group'
                        : groupId
                        ? availableGroups.find((g) => g.id === groupId)?.name || 'Unknown'
                        : 'Ungrouped'}
                    </span>
                    <ChevronDown size={12} style={{ color: 'var(--icon-disabled)', flexShrink: 0 }} />
                  </button>
                  {groupDropdownOpen && !createNewGroup && (
                    <div className="auto-assign-options auto-assign-options-scroll">
                      <button
                        className={`auto-assign-option ${!groupId ? 'auto-assign-option-active' : ''}`}
                        onClick={() => {
                          setGroupId(null);
                          setGroupDropdownOpen(false);
                        }}
                      >
                        <span>Ungrouped</span>
                        {!groupId && <Check size={12} />}
                      </button>
                      {availableGroups.map((g) => (
                        <button
                          key={g.id}
                          className={`auto-assign-option ${groupId === g.id ? 'auto-assign-option-active' : ''}`}
                          onClick={() => {
                            setGroupId(g.id);
                            setGroupDropdownOpen(false);
                          }}
                        >
                          <span className="auto-assign-option-truncate" title={g.name}>{g.name}</span>
                          {groupId === g.id && <Check size={12} style={{ flexShrink: 0 }} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* New group checkbox */}
                <div className="auto-assign-checkbox-row">
                  <div
                    className={`auto-assign-checkbox ${createNewGroup ? 'auto-assign-checkbox-checked' : ''}`}
                    onClick={() => {
                      setCreateNewGroup(!createNewGroup);
                      setGroupDropdownOpen(false);
                    }}
                  >
                    {createNewGroup && <Check size={10} style={{ color: 'white' }} />}
                  </div>
                  <span
                    className="auto-assign-checkbox-label"
                    onClick={() => {
                      setCreateNewGroup(!createNewGroup);
                      setGroupDropdownOpen(false);
                    }}
                  >
                    Create new group ({prefix || defaultPrefix})
                  </span>
                </div>
              </div>

              {/* Preview */}
              <div className="auto-assign-preview">
                <div className="auto-assign-preview-label">Preview</div>
                <div className="auto-assign-preview-text">
                  {prefix || defaultPrefix}-
                  {getAutoAssignSuffixValue(suffix, 0, startFrom)},{' '}
                  {prefix || defaultPrefix}-
                  {getAutoAssignSuffixValue(suffix, 1, startFrom)},{' '}
                  {prefix || defaultPrefix}-
                  {getAutoAssignSuffixValue(suffix, 2, startFrom)}
                  <span className="auto-assign-preview-ellipsis">...</span>
                </div>
              </div>

              {/* Excluded children list */}
              {excludedChildren.length > 0 && (
                <div className="auto-assign-excluded-box">
                  <div className="auto-assign-excluded-header">
                    <UserX size={10} style={{ color: 'var(--icon-warning)' }} />
                    <span className="auto-assign-excluded-title">
                      Excluded nodes ({excludedChildren.length})
                    </span>
                  </div>
                  <div className="auto-assign-excluded-list">
                    {excludedChildren.map((child) => (
                      <div
                        key={child.id}
                        className="auto-assign-excluded-row"
                      >
                        <span className="auto-assign-excluded-name">
                          {child.referenceName || child.id.slice(0, 8)}
                        </span>
                        <button
                          className="auto-assign-excluded-reinclude"
                          onClick={() => handleReincludeChild(child.id)}
                        >
                          Re-include
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Change summary (shown when editing enabled config or re-enabling with changed settings) */}
              {hasChanges && (
                <div className="auto-assign-changes">
                  <div className="auto-assign-changes-title">
                    Changes to apply
                  </div>
                  {changeSummary.map((change, idx) => (
                    <div key={idx} className="auto-assign-change-item">
                      <span className="auto-assign-change-bullet">•</span>
                      <span>{change}</span>
                    </div>
                  ))}
                  <div className="auto-assign-changes-note">
                    Existing auto-assigned tokens will be updated in-place.
                  </div>
                </div>
              )}

              {/* Apply button */}
              <button
                className="auto-assign-apply-btn"
                onClick={handleApply}
              >
                <Zap size={12} />
                {isEnabled ? 'Update & Apply' : 'Enable & Apply'}
              </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
