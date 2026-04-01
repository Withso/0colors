/**
 * Computed Tokens Engine
 *
 * Produces a per-theme, per-project "computed tokens" snapshot — the
 * single source of truth for what tokens are visible and what their
 * resolved values are.  This snapshot is persisted in both localStorage
 * and Supabase cloud sync so that external consumers (e.g. a Figma
 * plugin) can read tokens without re-running the visibility/resolution
 * logic.
 *
 * Filtering rules (mirrors Token Table / Code View / Multi-Page Export):
 *   1. Token is NOT hidden in the theme (explicit, node-forced, token-node-owner).
 *   2. Token is assigned to at least one node in the theme
 *      — OR it's a token-node-group token with a value reference.
 *   3. Token has a resolvable value for the theme.
 *   4. Advanced-logic computed tokens override static resolution.
 *
 * The output is a flat array per theme — ready for Figma Variables sync.
 */

import type {
  ColorNode,
  DesignToken,
  TokenGroup,
  TokenProject,
  Page,
  Theme,
  NodeAdvancedLogic,
  TokenType,
} from '../types';

import {
  isTokenHiddenInTheme,
} from './visibility';

import {
  getTokenColorValue,
  getTokenNodeColorSpace,
  tokenColorToNativeCSS,
} from './tokenFormatters';

import {
  evaluateAllTokenAssignments,
  TokenAssignExportResult,
} from './advanced-logic-engine';

import { hslToRgb } from './color-conversions';

/** HSL to hex (no alpha) */
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100, lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

/** Compute hex, hexWithAlpha and rgba from HSL+A */
function hslToColorFields(h: number, s: number, l: number, a: number) {
  const hex = hslToHex(h, s, l);
  const alphaHex = Math.round((a / 100) * 255).toString(16).padStart(2, '0').toUpperCase();
  const hexWithAlpha = `${hex}${alphaHex}`;
  const rgb = hslToRgb(h, s, l);
  const rgba = { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255, a: a / 100 };
  return { hex, hexWithAlpha, rgba };
}

// ═══════════════════════════════════════════════════════════════════
// Public Types
// ═══════════════════════════════════════════════════════════════════

/** A single resolved token ready for external consumption. */
export interface ComputedToken {
  /** Original token ID — STABLE across renames. Use this as the matching key
   *  in external consumers (e.g. Figma plugin) instead of `name`. */
  id: string;
  /** Token display name */
  name: string;
  /** kebab-case variable name (no `--` prefix) */
  variableName: string;
  /** Token type */
  type: TokenType;
  /** Group ID (null = ungrouped) */
  groupId: string | null;
  /** Group display name */
  groupName: string | null;
  /** Page ID */
  pageId: string;
  /** Page display name */
  pageName: string;
  /** Resolved CSS value string (e.g. "#FF5733", "16px", "var(--primary)") */
  resolvedValue: string;
  /** For color tokens: raw HSL+A values */
  rawHSL?: { h: number; s: number; l: number; a: number };
  /** For color tokens: hex representation (no alpha) */
  hex?: string;
  /** For color tokens: hex with alpha channel (e.g. "#FF5733FF") — always 8 chars for Figma RGBA mapping */
  hexWithAlpha?: string;
  /** For color tokens: RGBA 0-1 floats (Figma Variables native format) */
  rgba?: { r: number; g: number; b: number; a: number };
  /** For non-color tokens: raw numeric value */
  numericValue?: number;
  /** For non-color tokens: unit */
  unit?: string;
  /** Color space of the assigned node (for color tokens) */
  colorSpace?: string;
  /** Whether this token is an alias / reference to another token */
  isAlias: boolean;
  /** If alias: the referenced token's variable name */
  aliasOf?: string;
  /** If alias: the referenced token ID */
  aliasOfId?: string;
  /** Sort order within its group */
  sortOrder?: number;
  /** Previous token name before the most recent rename (populated when name differs
   *  from the last computed snapshot). Helps external consumers update existing
   *  references without creating duplicates. */
  previousName?: string;
  /** Previous variable name (kebab-case) corresponding to `previousName`. */
  previousVariableName?: string;
  /** Full Figma variable path: pageName/groupName/tokenName (grouped) or
   *  pageName/tokenName (ungrouped).  The Figma plugin should use this as
   *  the variable name within a single project-level collection. */
  figmaPath: string;
  /** Previous figmaPath before the most recent rename (for Figma plugin rename handling). */
  previousFigmaPath?: string;
}

/** Computed tokens for one theme. */
export interface ThemeComputedTokens {
  themeId: string;
  themeName: string;
  isPrimary: boolean;
  tokens: ComputedToken[];
}

/** A rename entry for external consumers (e.g. Figma plugin). */
export interface TokenRename {
  tokenId: string;
  previousName: string;
  previousVariableName: string;
  currentName: string;
  currentVariableName: string;
}

/** Full computed tokens snapshot for a project. */
export interface ProjectComputedTokens {
  projectId: string;
  projectName: string;
  themes: ThemeComputedTokens[];
  computedAt: number;
  /** Tokens that were renamed since the last computed snapshot.
   *  Keyed per-theme — the primary theme is typically the one that matters.
   *  Empty array if no renames detected. */
  renames?: TokenRename[];
}

// ═══════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════

/** Get theme-specific value for a token */
function getTokenThemeValue(token: DesignToken, activeThemeId: string) {
  if (token.themeValues?.[activeThemeId]) {
    return token.themeValues[activeThemeId];
  }
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
}

/** Is a token assigned to any node for a given theme? */
function isTokenAssignedToNode(
  token: DesignToken,
  nodes: ColorNode[],
  activeThemeId: string,
): boolean {
  return nodes.some(node => {
    // If theme-specific assignments exist for this theme (even if empty array = intentionally cleared),
    // use them exclusively. Only fall back to legacy tokenIds when no theme-specific key exists at all.
    // This matches the UI logic in ColorNodeCard.getNodeTokenIds().
    if (node.tokenAssignments?.[activeThemeId] !== undefined) {
      return node.tokenAssignments[activeThemeId].includes(token.id);
    }
    // Legacy fallback — only for nodes that haven't been migrated to per-theme assignments
    return (node.tokenIds || []).includes(token.id);
  });
}

/** Check if a token belongs to a token node group */
function isTokenNodeGroupToken(
  token: DesignToken,
  tokenGroups: TokenGroup[],
): boolean {
  if (!token.groupId) return false;
  const group = tokenGroups.find(g => g.id === token.groupId);
  return group?.isTokenNodeGroup === true;
}

/** Resolve value token reference for a token node group token */
function resolveTokenNodeValueRef(
  token: DesignToken,
  allTokens: DesignToken[],
  nodes: ColorNode[],
  activeThemeId: string,
  primaryThemeId: string,
): { valueToken: DesignToken; ownerNode: ColorNode } | null {
  const ownerNode = nodes.find(
    n => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === token.id,
  );
  if (!ownerNode) return null;

  let resolvedId: string | undefined;
  if (ownerNode.valueTokenAssignments?.[activeThemeId] !== undefined) {
    resolvedId = ownerNode.valueTokenAssignments[activeThemeId] || undefined;
  } else if (primaryThemeId && ownerNode.valueTokenAssignments?.[primaryThemeId] !== undefined) {
    resolvedId = ownerNode.valueTokenAssignments[primaryThemeId] || undefined;
  } else {
    resolvedId = ownerNode.valueTokenId;
  }

  if (!resolvedId) return null;
  const valueToken = allTokens.find(t => t.id === resolvedId);
  if (!valueToken) return null;
  return { valueToken, ownerNode };
}

/** kebab-case variable name */
function toVarName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Build the Figma variable path: pageName/groupName/tokenName (grouped) or pageName/tokenName (ungrouped).
 *  Uses `/` separator which Figma interprets as folder hierarchy. */
function buildFigmaPath(pageName: string, groupName: string | null | undefined, tokenName: string): string {
  if (groupName) {
    return `${pageName}/${groupName}/${tokenName}`;
  }
  return `${pageName}/${tokenName}`;
}

// ═══════════════════════════════════════════════════════════════════
// Main Computation
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute the resolved token list for a single theme within a project.
 */
function computeTokensForTheme(
  themeId: string,
  primaryThemeId: string,
  projectTokens: DesignToken[],
  projectNodes: ColorNode[],
  projectGroups: TokenGroup[],
  projectPages: Page[],
  advancedLogic: NodeAdvancedLogic[],
): ComputedToken[] {
  const result: ComputedToken[] = [];

  // Pre-compute advanced logic results for this theme
  const computedLogic: Map<string, TokenAssignExportResult> =
    advancedLogic.length > 0
      ? evaluateAllTokenAssignments(
          advancedLogic,
          projectTokens,
          projectNodes,
          themeId,
          primaryThemeId,
        )
      : new Map();

  // Build page name lookup
  const pageNameMap = new Map(projectPages.map(p => [p.id, p.name]));
  // Build group name lookup
  const groupNameMap = new Map(projectGroups.map(g => [g.id, g.name]));

  for (const token of projectTokens) {
    // ── 1. Visibility check ──
    if (isTokenHiddenInTheme(token, projectNodes, themeId, primaryThemeId)) {
      continue;
    }

    const isTokenNode = isTokenNodeGroupToken(token, projectGroups);
    const variableName = toVarName(token.name);

    // ── 2a. Token node group tokens ──
    if (isTokenNode) {
      // Check for advanced logic result first
      const computed = computedLogic.get(token.id);
      if (computed) {
        if (computed.result.type === 'computedColor') {
          const c = computed.result.color;
          const ownerNode = projectNodes.find(n => n.ownTokenId === token.id);
          const cs = ownerNode?.colorSpace || 'hsl';
          const cssValue = tokenColorToNativeCSS(c, cs);
          result.push({
            id: token.id,
            name: token.name,
            variableName,
            type: 'color',
            groupId: token.groupId,
            groupName: token.groupId ? groupNameMap.get(token.groupId) || null : null,
            pageId: token.pageId,
            pageName: pageNameMap.get(token.pageId) || '',
            resolvedValue: cssValue,
            rawHSL: { h: c.h, s: c.s, l: c.l, a: c.a },
            ...hslToColorFields(c.h, c.s, c.l, c.a),
            colorSpace: cs,
            isAlias: false,
            sortOrder: token.sortOrder,
            figmaPath: buildFigmaPath(pageNameMap.get(token.pageId) || '', groupNameMap.get(token.groupId), token.name),
          });
        } else if (computed.result.type === 'tokenRef') {
          const refToken = projectTokens.find(t => t.id === computed.result.tokenId);
          if (refToken) {
            const refVarName = toVarName(refToken.name);
            result.push({
              id: token.id,
              name: token.name,
              variableName,
              type: token.type || 'color',
              groupId: token.groupId,
              groupName: token.groupId ? groupNameMap.get(token.groupId) || null : null,
              pageId: token.pageId,
              pageName: pageNameMap.get(token.pageId) || '',
              resolvedValue: `var(--${refVarName})`,
              isAlias: true,
              aliasOf: refVarName,
              aliasOfId: refToken.id,
              sortOrder: token.sortOrder,
              figmaPath: buildFigmaPath(pageNameMap.get(token.pageId) || '', groupNameMap.get(token.groupId), token.name),
            });
          }
        }
        continue;
      }

      // Static value token reference
      const ref = resolveTokenNodeValueRef(
        token,
        projectTokens,
        projectNodes,
        themeId,
        primaryThemeId,
      );
      if (!ref) continue; // No value assigned → skip

      const refVarName = toVarName(ref.valueToken.name);
      result.push({
        id: token.id,
        name: token.name,
        variableName,
        type: token.type || 'color',
        groupId: token.groupId,
        groupName: token.groupId ? groupNameMap.get(token.groupId) || null : null,
        pageId: token.pageId,
        pageName: pageNameMap.get(token.pageId) || '',
        resolvedValue: `var(--${refVarName})`,
        isAlias: true,
        aliasOf: refVarName,
        aliasOfId: ref.valueToken.id,
        sortOrder: token.sortOrder,
        figmaPath: buildFigmaPath(pageNameMap.get(token.pageId) || '', groupNameMap.get(token.groupId), token.name),
      });
      continue;
    }

    // ── 2b. Regular tokens: must be assigned to a node ──
    if (!isTokenAssignedToNode(token, projectNodes, themeId)) {
      continue;
    }

    const themeValue = getTokenThemeValue(token, themeId);

    // ── 3. Resolve value by type ──
    if (token.type === 'color') {
      const nodeColorSpace = getTokenNodeColorSpace(token, projectNodes, themeId);
      const color = getTokenColorValue(token, themeId, nodeColorSpace);
      if (!color) continue;

      result.push({
        id: token.id,
        name: token.name,
        variableName,
        type: 'color',
        groupId: token.groupId,
        groupName: token.groupId ? groupNameMap.get(token.groupId) || null : null,
        pageId: token.pageId,
        pageName: pageNameMap.get(token.pageId) || '',
        resolvedValue: color.native,
        rawHSL: {
          h: themeValue.hue ?? 0,
          s: themeValue.saturation ?? 0,
          l: themeValue.lightness ?? 0,
          a: themeValue.alpha ?? 100,
        },
        hex: color.hex,
        hexWithAlpha: color.hexWithAlpha,
        rgba: color.rgbaObj,
        colorSpace: color.colorSpace,
        isAlias: false,
        sortOrder: token.sortOrder,
        figmaPath: buildFigmaPath(pageNameMap.get(token.pageId) || '', groupNameMap.get(token.groupId), token.name),
      });
    } else if (
      token.type === 'spacing' ||
      token.type === 'radius' ||
      token.type === 'fontSize'
    ) {
      if (themeValue.value === undefined) continue;
      const unit = themeValue.unit || 'px';
      result.push({
        id: token.id,
        name: token.name,
        variableName,
        type: token.type,
        groupId: token.groupId,
        groupName: token.groupId ? groupNameMap.get(token.groupId) || null : null,
        pageId: token.pageId,
        pageName: pageNameMap.get(token.pageId) || '',
        resolvedValue: `${themeValue.value}${unit}`,
        numericValue: themeValue.value,
        unit,
        isAlias: false,
        sortOrder: token.sortOrder,
        figmaPath: buildFigmaPath(pageNameMap.get(token.pageId) || '', groupNameMap.get(token.groupId), token.name),
      });
    } else if (token.type === 'fontWeight') {
      if (themeValue.fontWeight === undefined) continue;
      result.push({
        id: token.id,
        name: token.name,
        variableName,
        type: 'fontWeight',
        groupId: token.groupId,
        groupName: token.groupId ? groupNameMap.get(token.groupId) || null : null,
        pageId: token.pageId,
        pageName: pageNameMap.get(token.pageId) || '',
        resolvedValue: String(themeValue.fontWeight),
        numericValue: themeValue.fontWeight,
        isAlias: false,
        sortOrder: token.sortOrder,
        figmaPath: buildFigmaPath(pageNameMap.get(token.pageId) || '', groupNameMap.get(token.groupId), token.name),
      });
    } else if (token.type === 'lineHeight') {
      if (themeValue.lineHeight === undefined) continue;
      result.push({
        id: token.id,
        name: token.name,
        variableName,
        type: 'lineHeight',
        groupId: token.groupId,
        groupName: token.groupId ? groupNameMap.get(token.groupId) || null : null,
        pageId: token.pageId,
        pageName: pageNameMap.get(token.pageId) || '',
        resolvedValue: String(themeValue.lineHeight),
        numericValue: themeValue.lineHeight,
        isAlias: false,
        sortOrder: token.sortOrder,
        figmaPath: buildFigmaPath(pageNameMap.get(token.pageId) || '', groupNameMap.get(token.groupId), token.name),
      });
    } else if (token.type === 'opacity') {
      if (themeValue.opacity === undefined) continue;
      result.push({
        id: token.id,
        name: token.name,
        variableName,
        type: 'opacity',
        groupId: token.groupId,
        groupName: token.groupId ? groupNameMap.get(token.groupId) || null : null,
        pageId: token.pageId,
        pageName: pageNameMap.get(token.pageId) || '',
        resolvedValue: String(themeValue.opacity / 100),
        numericValue: themeValue.opacity / 100,
        isAlias: false,
        sortOrder: token.sortOrder,
        figmaPath: buildFigmaPath(pageNameMap.get(token.pageId) || '', groupNameMap.get(token.groupId), token.name),
      });
    } else if (token.type === 'shadow') {
      if (!themeValue.shadowValue) continue;
      result.push({
        id: token.id,
        name: token.name,
        variableName,
        type: 'shadow',
        groupId: token.groupId,
        groupName: token.groupId ? groupNameMap.get(token.groupId) || null : null,
        pageId: token.pageId,
        pageName: pageNameMap.get(token.pageId) || '',
        resolvedValue: themeValue.shadowValue,
        isAlias: false,
        sortOrder: token.sortOrder,
        figmaPath: buildFigmaPath(pageNameMap.get(token.pageId) || '', groupNameMap.get(token.groupId), token.name),
      });
    }
  }

  // ── Post-processing: validate alias chains & resolve color data ──
  //
  // 1) Remove alias tokens whose referenced target is not itself in the
  //    result (meaning the target has no resolvable value for this theme).
  //    Iterate until stable to handle chained aliases (A→B→C where C has no value).
  //
  // 2) For remaining alias tokens of type 'color', resolve the actual
  //    hex / rgba values by following the chain to the ultimate non-alias token.
  //    This ensures every color token in the output has concrete color data
  //    that external consumers (e.g. Figma plugin) can read directly.

  const tokenById = new Map(result.map(t => [t.id, t]));

  // Step 1: iteratively prune broken alias chains
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (let i = result.length - 1; i >= 0; i--) {
      const ct = result[i];
      if (ct.isAlias && ct.aliasOfId && !tokenById.has(ct.aliasOfId)) {
        result.splice(i, 1);
        tokenById.delete(ct.id);
        pruned = true;
      }
    }
  }

  // Step 2: resolve hex/rgba for valid alias tokens
  for (const ct of result) {
    if (!ct.isAlias || !ct.aliasOfId || ct.type !== 'color') continue;
    // Already has color data (e.g. advanced logic computed color)
    if (ct.hex) continue;

    // Walk the alias chain to find the ultimate resolved color
    let target = tokenById.get(ct.aliasOfId);
    const visited = new Set<string>();
    while (target && target.isAlias && target.aliasOfId && !visited.has(target.id)) {
      visited.add(target.id);
      target = tokenById.get(target.aliasOfId);
    }
    if (target && target.hex) {
      ct.hex = target.hex;
      ct.hexWithAlpha = target.hexWithAlpha;
      ct.rgba = target.rgba;
      ct.rawHSL = target.rawHSL;
      ct.colorSpace = target.colorSpace;
    }
  }

  return result;
}

/**
 * Compute the full computed tokens snapshot for a project across all its themes.
 * Optionally accepts previous computed tokens to detect renames and populate
 * `previousName` / `previousVariableName` fields on each token.
 */
export function computeProjectTokens(
  project: TokenProject,
  allNodes: ColorNode[],
  allTokens: DesignToken[],
  allGroups: TokenGroup[],
  allPages: Page[],
  allThemes: Theme[],
  advancedLogic: NodeAdvancedLogic[],
  previousComputed?: ProjectComputedTokens | null,
): ProjectComputedTokens {
  const projectNodes = allNodes.filter(n => n.projectId === project.id);
  const projectTokens = allTokens.filter(t => t.projectId === project.id);
  const projectGroups = allGroups.filter(g => g.projectId === project.id);
  const projectPages = allPages.filter(p => p.projectId === project.id);
  const projectThemes = allThemes.filter(t => t.projectId === project.id);
  const projectNodeIds = new Set(projectNodes.map(n => n.id));
  const projectAdvanced = advancedLogic.filter(l => projectNodeIds.has(l.nodeId));

  const primaryTheme = projectThemes.find(t => t.isPrimary) || projectThemes[0];
  const primaryThemeId = primaryTheme?.id || '';

  // Build previous name lookup: tokenId → { name, variableName, figmaPath } across ALL themes
  // (a single token may appear in multiple themes with the same name)
  const prevNameMap = new Map<string, { name: string; variableName: string; figmaPath?: string }>();
  if (previousComputed?.themes) {
    for (const prevTheme of previousComputed.themes) {
      for (const pt of prevTheme.tokens) {
        if (!prevNameMap.has(pt.id)) {
          prevNameMap.set(pt.id, { name: pt.name, variableName: pt.variableName, figmaPath: pt.figmaPath });
        }
      }
    }
  }

  const allRenames: TokenRename[] = [];

  const themes: ThemeComputedTokens[] = projectThemes.map(theme => {
    const tokens = computeTokensForTheme(
      theme.id,
      primaryThemeId,
      projectTokens,
      projectNodes,
      projectGroups,
      projectPages,
      projectAdvanced,
    );

    // Annotate tokens with previousName if a rename was detected
    // Also track figmaPath changes (page/group renames even when token name unchanged)
    if (prevNameMap.size > 0) {
      for (const token of tokens) {
        const prev = prevNameMap.get(token.id);
        if (!prev) continue;
        // Token name changed
        if (prev.name !== token.name) {
          token.previousName = prev.name;
          token.previousVariableName = prev.variableName;
          token.previousFigmaPath = prev.figmaPath;
          // Only add to top-level renames once per token (from primary theme)
          if (theme.isPrimary || theme.id === primaryThemeId) {
            allRenames.push({
              tokenId: token.id,
              previousName: prev.name,
              previousVariableName: prev.variableName,
              currentName: token.name,
              currentVariableName: token.variableName,
            });
          }
        } else if (prev.figmaPath && prev.figmaPath !== token.figmaPath) {
          // Page or group renamed (token name unchanged but path changed)
          token.previousFigmaPath = prev.figmaPath;
        }
      }
    }

    return {
      themeId: theme.id,
      themeName: theme.name,
      isPrimary: theme.isPrimary === true,
      tokens,
    };
  });

  return {
    projectId: project.id,
    projectName: project.name,
    themes,
    computedAt: Date.now(),
    renames: allRenames.length > 0 ? allRenames : undefined,
  };
}

/**
 * Compute computed tokens for ALL projects at once.
 * Returns a map of projectId → ProjectComputedTokens.
 * Optionally accepts previous computed tokens map for rename detection.
 */
export function computeAllProjectTokens(
  projects: TokenProject[],
  allNodes: ColorNode[],
  allTokens: DesignToken[],
  allGroups: TokenGroup[],
  allPages: Page[],
  allThemes: Theme[],
  advancedLogic: NodeAdvancedLogic[],
  previousComputedMap?: Record<string, ProjectComputedTokens>,
): Record<string, ProjectComputedTokens> {
  const result: Record<string, ProjectComputedTokens> = {};
  for (const project of projects) {
    result[project.id] = computeProjectTokens(
      project,
      allNodes,
      allTokens,
      allGroups,
      allPages,
      allThemes,
      advancedLogic,
      previousComputedMap?.[project.id] || null,
    );
  }
  return result;
}