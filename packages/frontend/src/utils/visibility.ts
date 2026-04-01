import { ColorNode, DesignToken } from '../types';

/**
 * Node / Token Visibility System
 *
 * - Each node/token stores `themeVisibility?: Record<string, boolean>`.
 *   false  = hidden in that theme
 *   absent = visible (default)
 *
 * Theme-specific visibility:
 *   Hiding a node/token in ANY theme (including primary) only affects that
 *   specific theme. There is NO cascade from primary to non-primary themes.
 *   Each theme's visibility is fully independent.
 *
 * Palette shades follow their parent palette's visibility automatically
 * (within the same theme).
 */

// ─── Node Visibility ────────────────────────────────────────────

/** Check raw themeVisibility map (no palette-parent inheritance). */
function isExplicitlyHidden(
  vis: Record<string, boolean> | undefined,
  activeThemeId: string,
  _primaryThemeId: string,
): boolean {
  if (!vis) return false;
  // Theme-specific: only hidden if explicitly set to false for this theme
  return vis[activeThemeId] === false;
}

/** Is a node hidden in the given theme? Also accounts for palette-shade inheritance. */
export function isNodeHiddenInTheme(
  node: ColorNode,
  activeThemeId: string,
  primaryThemeId: string,
  allNodes?: ColorNode[],
): boolean {
  // Own visibility
  if (isExplicitlyHidden(node.themeVisibility, activeThemeId, primaryThemeId)) {
    return true;
  }

  // Palette shade: follow parent palette visibility (same theme)
  if (node.parentId && allNodes) {
    const parent = allNodes.find((n) => n.id === node.parentId);
    if (parent?.isPalette) {
      return isExplicitlyHidden(parent.themeVisibility, activeThemeId, primaryThemeId);
    }
  }

  return false;
}

/** Compute the new themeVisibility map after toggling a node's visibility. */
export function toggleVisibilityMap(
  currentVis: Record<string, boolean> | undefined,
  activeThemeId: string,
  _primaryThemeId: string,
  _isPrimaryTheme: boolean,
): Record<string, boolean> | undefined {
  const vis = { ...(currentVis || {}) };

  if (vis[activeThemeId] === false) {
    // Currently hidden → make visible: remove the entry
    delete vis[activeThemeId];
  } else {
    // Currently visible → hide: set false for this theme only
    vis[activeThemeId] = false;
  }

  // Return undefined when map is empty (clean up storage)
  return Object.keys(vis).length > 0 ? vis : undefined;
}

// ─── Token Visibility ───────────────────────────────────────────

/** Is a token explicitly hidden via its own themeVisibility? */
export function isTokenExplicitlyHidden(
  token: DesignToken,
  activeThemeId: string,
  primaryThemeId: string,
): boolean {
  return isExplicitlyHidden(token.themeVisibility, activeThemeId, primaryThemeId);
}

/**
 * Is a token forced-hidden because ALL of its assigned nodes are hidden?
 * Returns true only when the token has at least one assigned node AND all of
 * them are hidden.
 */
export function isTokenForcedHiddenByNodes(
  token: DesignToken,
  nodes: ColorNode[],
  activeThemeId: string,
  primaryThemeId: string,
): boolean {
  const assignedNodes = getNodesAssignedToToken(token, nodes, activeThemeId);
  if (assignedNodes.length === 0) return false;
  return assignedNodes.every((n) =>
    isNodeHiddenInTheme(n, activeThemeId, primaryThemeId, nodes),
  );
}

/**
 * Is a token owned by a token node (via ownTokenId) that is hidden in the
 * given theme?  Returns true when the owning canvas node is hidden.
 * Returns false when no owning node exists (regular tokens).
 */
export function isTokenNodeOwnerHidden(
  token: DesignToken,
  nodes: ColorNode[],
  activeThemeId: string,
  primaryThemeId: string,
): boolean {
  const ownerNode = nodes.find(
    (n) => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === token.id,
  );
  if (!ownerNode) return false;
  return isNodeHiddenInTheme(ownerNode, activeThemeId, primaryThemeId, nodes);
}

/**
 * Effective token visibility: hidden if explicitly hidden OR force-hidden
 * by all assigned nodes being hidden OR owned by a hidden token node.
 */
export function isTokenHiddenInTheme(
  token: DesignToken,
  nodes: ColorNode[],
  activeThemeId: string,
  primaryThemeId: string,
): boolean {
  if (isTokenExplicitlyHidden(token, activeThemeId, primaryThemeId)) return true;
  if (isTokenForcedHiddenByNodes(token, nodes, activeThemeId, primaryThemeId)) return true;
  if (isTokenNodeOwnerHidden(token, nodes, activeThemeId, primaryThemeId)) return true;
  return false;
}

/** Return only visible tokens for a given theme. */
export function getVisibleTokens(
  tokens: DesignToken[],
  nodes: ColorNode[],
  activeThemeId: string,
  primaryThemeId: string,
): DesignToken[] {
  return tokens.filter(
    (t) => !isTokenHiddenInTheme(t, nodes, activeThemeId, primaryThemeId),
  );
}

// ─── Helpers ────────────────────────────────────────────────────

/** Find all nodes that have a given token assigned in the given theme. */
function getNodesAssignedToToken(
  token: DesignToken,
  nodes: ColorNode[],
  activeThemeId: string,
): ColorNode[] {
  return nodes.filter((node) => {
    // If theme-specific assignments exist for this theme (even if empty array = intentionally cleared),
    // use them exclusively. Only fall back to legacy tokenIds when no theme-specific key exists at all.
    if (node.tokenAssignments?.[activeThemeId] !== undefined) {
      return node.tokenAssignments[activeThemeId].includes(token.id);
    }
    // Legacy fallback
    return (node.tokenIds || []).includes(token.id);
  });
}