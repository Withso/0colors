import type { DesignToken, ColorNode } from '../types';

// ─── Token Name Uniqueness ─────────────────────────────────────

/**
 * Check whether a token name is already used by another token
 * within the same project scope (across ALL pages).
 *
 * Token names must be unique project-wide because they all export to
 * the same CSS / Figma variable namespace.
 */
export function isTokenNameTaken(
  name: string,
  tokens: DesignToken[],
  projectId: string,
  excludeId?: string,
): boolean {
  const lower = name.toLowerCase();
  return tokens.some(
    t =>
      t.id !== excludeId &&
      t.projectId === projectId &&
      t.name.toLowerCase() === lower,
  );
}

/**
 * Given a desired base name, returns a name guaranteed unique among
 * existing tokens in the same project (across all pages).
 *
 * Strategy: if `baseName` is free, return it as-is.
 * Otherwise try `baseName-1`, `baseName-2`, ... up to 999.
 */
export function getUniqueTokenName(
  baseName: string,
  tokens: DesignToken[],
  projectId: string,
  excludeId?: string,
): string {
  if (!isTokenNameTaken(baseName, tokens, projectId, excludeId)) {
    return baseName;
  }
  for (let i = 1; i <= 999; i++) {
    const candidate = `${baseName}-${i}`;
    if (!isTokenNameTaken(candidate, tokens, projectId, excludeId)) {
      return candidate;
    }
  }
  // Extremely unlikely fallback
  return `${baseName}-${Date.now()}`;
}

// ─── Node Reference Name Uniqueness ────────────────────────────

/**
 * Compute the effective full reference name for a node.
 * This mirrors the logic in ColorCanvas.tsx getNodeFullReferenceName.
 *
 * We need this here because the utility module can't import that
 * component-scoped function, and we want a lightweight version
 * that works with the raw node data.
 *
 * For simplicity we only check the *locked* referenceName (prefix).
 * Auto-generated names from color are transient and handled separately.
 */
export function getNodeLockedName(node: ColorNode): string | null {
  if (node.referenceNameLocked && node.referenceName) {
    return node.referenceName;
  }
  return null;
}

/**
 * Check whether a *locked* node reference name is already used by
 * another node within the same page.
 */
export function isNodeNameTaken(
  name: string,
  allNodes: ColorNode[],
  pageId: string,
  excludeId?: string,
): boolean {
  const lower = name.toLowerCase();
  return allNodes.some(
    n =>
      n.id !== excludeId &&
      n.pageId === pageId &&
      n.referenceNameLocked &&
      n.referenceName?.toLowerCase() === lower,
  );
}

/**
 * Given a desired base name, returns a name guaranteed unique among
 * locked node reference names in the same page.
 */
export function getUniqueNodeName(
  baseName: string,
  allNodes: ColorNode[],
  pageId: string,
  excludeId?: string,
): string {
  if (!isNodeNameTaken(baseName, allNodes, pageId, excludeId)) {
    return baseName;
  }
  for (let i = 1; i <= 999; i++) {
    const candidate = `${baseName}-${i}`;
    if (!isNodeNameTaken(candidate, allNodes, pageId, excludeId)) {
      return candidate;
    }
  }
  return `${baseName}-${Date.now()}`;
}