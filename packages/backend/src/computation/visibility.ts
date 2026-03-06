// ═══════════════════════════════════════════════════════════════════
// Server-side Visibility — mirror of /utils/visibility.ts
// Used by the computation pipeline to filter hidden tokens/nodes.
// ═══════════════════════════════════════════════════════════════════

import type { ColorNode, DesignToken } from "./computation-types.js";

/** Check raw themeVisibility map (no palette-parent inheritance). */
function isExplicitlyHidden(
  vis: Record<string, boolean> | undefined,
  activeThemeId: string,
): boolean {
  if (!vis) return false;
  return vis[activeThemeId] === false;
}

/**
 * Is this node hidden in the given theme?
 * Palette shades inherit from their parent palette's visibility.
 */
export function isNodeHiddenInTheme(
  node: ColorNode,
  activeThemeId: string,
  _primaryThemeId: string,
  allNodes?: ColorNode[],
): boolean {
  // Direct visibility check
  if (isExplicitlyHidden(node.themeVisibility, activeThemeId)) return true;

  // Palette shade inherits from parent palette
  if (node.parentId && allNodes) {
    const parent = allNodes.find(n => n.id === node.parentId);
    if (parent?.isPalette) {
      return isExplicitlyHidden(parent.themeVisibility, activeThemeId);
    }
  }

  return false;
}

/**
 * Is this token hidden in the given theme?
 * - Explicitly hidden via themeVisibility
 * - Or all nodes that own this token (in this theme) are hidden
 */
export function isTokenHiddenInTheme(
  token: DesignToken,
  activeThemeId: string,
  _primaryThemeId: string,
  allNodes?: ColorNode[],
): boolean {
  // Direct token visibility
  if (isExplicitlyHidden(token.themeVisibility, activeThemeId)) return true;

  // If any owning node is hidden AND token-node-owned, the token is hidden
  if (allNodes) {
    const ownerNodes = allNodes.filter(n => {
      if (n.ownTokenId === token.id) return true;
      const assignments = n.tokenAssignments?.[activeThemeId];
      if (assignments?.includes(token.id)) return true;
      return false;
    });

    // If ALL owner nodes are hidden → token is hidden
    if (ownerNodes.length > 0 && ownerNodes.every(n => isNodeHiddenInTheme(n, activeThemeId, _primaryThemeId, allNodes))) {
      return true;
    }
  }

  return false;
}
