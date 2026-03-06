// ═══════════════════════════════════════════════════════════════════
// Server-side Pipeline Orchestrator
// Runs the full computation pipeline headlessly (without browser).
//
// Flow: Load snapshot → Parse input → Apply to node → Propagate →
//       Compute tokens → Format output → Push to destinations
//
// Uses the full advanced-logic-engine and tokenFormatters for
// complete fidelity with client-side output.
// ═══════════════════════════════════════════════════════════════════

import type {
  ColorNode,
  DesignToken,
  TokenGroup,
  Theme,
  ProjectSnapshot,
  DevConfig,
  NodeAdvancedLogic,
} from "./computation-types.js";

import {
  hslToRgb,
  rgbToHsl,
  rgbToHex,
  hslToOklch,
  oklchToHsl,
  oklchToSrgb,
  hexToHsl,
  hexToRgb,
} from "./color-conversions.js";

import {
  rgbToHct,
  hctToRgb,
} from "./hct-utils.js";

import {
  generateCSSVariables,
  generateDTCGJSON,
  generateTailwindConfig,
  generateFigmaVariablesJSON,
} from "./tokenFormatters.js";

// ── Value Parsing ───────────────────────────────────────────────

interface ParsedColor {
  h: number; s: number; l: number; a: number;
}

/**
 * Parse an incoming webhook value into HSL.
 * Supports hex, hsl, rgb, oklch, hct formats.
 */
export function parseIncomingValue(value: string | any, format: string): ParsedColor | null {
  try {
    if (format === 'hex') {
      const hex = typeof value === 'string' ? value.trim() : String(value);
      const hsl = hexToHsl(hex);
      return { h: hsl.h, s: hsl.s, l: hsl.l, a: 100 };
    }

    if (format === 'hsl') {
      const obj = typeof value === 'string' ? JSON.parse(value) : value;
      return {
        h: obj.h ?? obj.hue ?? 0,
        s: obj.s ?? obj.saturation ?? 0,
        l: obj.l ?? obj.lightness ?? 50,
        a: obj.a ?? obj.alpha ?? 100,
      };
    }

    if (format === 'rgb') {
      const obj = typeof value === 'string' ? JSON.parse(value) : value;
      const r = obj.r ?? obj.red ?? 0;
      const g = obj.g ?? obj.green ?? 0;
      const b = obj.b ?? obj.blue ?? 0;
      const hsl = rgbToHsl(r, g, b);
      return { h: hsl.h, s: hsl.s, l: hsl.l, a: obj.a ?? obj.alpha ?? 100 };
    }

    if (format === 'oklch') {
      const obj = typeof value === 'string' ? JSON.parse(value) : value;
      const oL = obj.l ?? obj.lightness ?? 50;
      const oC = obj.c ?? obj.chroma ?? 0;
      const oH = obj.h ?? obj.hue ?? 0;
      const hsl = oklchToHsl(oL, oC, oH);
      return { h: hsl.h, s: hsl.s, l: hsl.l, a: obj.a ?? obj.alpha ?? 100 };
    }

    if (format === 'hct') {
      const obj = typeof value === 'string' ? JSON.parse(value) : value;
      const hctH = obj.h ?? obj.hue ?? 0;
      const hctC = obj.c ?? obj.chroma ?? 0;
      const hctT = obj.t ?? obj.tone ?? 50;
      const rgb = hctToRgb(hctH, hctC, hctT);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      return { h: hsl.h, s: hsl.s, l: hsl.l, a: obj.a ?? obj.alpha ?? 100 };
    }

    return null;
  } catch (e) {
    console.log(`[Pipeline] Failed to parse ${format} value: ${e}`);
    return null;
  }
}

// ── Node Value Application ──────────────────────────────────────

/**
 * Apply a parsed color to a target node, updating its native color space values.
 * Returns the deltas for propagation.
 */
export function applyValueToNode(
  node: ColorNode,
  color: ParsedColor,
): { updatedNode: ColorNode; deltas: Record<string, number> } {
  const prevH = node.hue, prevS = node.saturation, prevL = node.lightness, prevA = node.alpha;

  const updatedNode = { ...node, hue: color.h, saturation: color.s, lightness: color.l, alpha: color.a };

  // Also update RGB/OKLCH/HCT values if the node uses those color spaces
  const rgb = hslToRgb(color.h, color.s, color.l);
  updatedNode.red = rgb.r;
  updatedNode.green = rgb.g;
  updatedNode.blue = rgb.b;

  const oklch = hslToOklch(color.h, color.s, color.l);
  updatedNode.oklchL = oklch.l;
  updatedNode.oklchC = oklch.c;
  updatedNode.oklchH = oklch.h;

  const hct = rgbToHct(rgb.r, rgb.g, rgb.b);
  updatedNode.hctH = hct.h;
  updatedNode.hctC = hct.c;
  updatedNode.hctT = hct.t;

  updatedNode.hexValue = rgbToHex(rgb.r, rgb.g, rgb.b);

  return {
    updatedNode,
    deltas: {
      hue: color.h - prevH,
      saturation: color.s - prevS,
      lightness: color.l - prevL,
      alpha: color.a - prevA,
    },
  };
}

// ── Simplified Propagation ──────────────────────────────────────

/**
 * Simplified server-side propagation.
 * Walks the node tree from the changed node and applies HSL deltas
 * to all descendants, respecting locks and diff states.
 *
 * NOTE: This is a simplified version. The full client-side version
 * handles cross-color-space conversions, palette regeneration, and
 * theme-specific overrides (~550 lines). This covers the primary
 * use case of HSL-based propagation for the initial server release.
 */
export function propagateToDescendants(
  nodes: ColorNode[],
  parentId: string,
  hueD: number, satD: number, lightD: number, alphaD: number,
): void {
  const children = nodes.filter(n => n.parentId === parentId);

  for (const child of children) {
    const idx = nodes.findIndex(n => n.id === child.id);
    if (idx === -1) continue;

    const node = nodes[idx];
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) continue;

    let hueChanged = false, satChanged = false, lightChanged = false, alphaChanged = false;

    // Apply HSL propagation
    if (hueD !== 0 && !node.lockHue) {
      if (node.diffHue === false) {
        nodes[idx] = { ...nodes[idx], hue: parent.hue };
      } else {
        nodes[idx] = { ...nodes[idx], hue: (node.hue + hueD + 360) % 360 };
      }
      hueChanged = true;
    }
    if (satD !== 0 && !node.lockSaturation) {
      if (node.diffSaturation === false) {
        nodes[idx] = { ...nodes[idx], saturation: parent.saturation };
      } else {
        nodes[idx] = { ...nodes[idx], saturation: Math.max(0, Math.min(100, node.saturation + satD)) };
      }
      satChanged = true;
    }
    if (lightD !== 0 && !node.lockLightness) {
      if (node.diffLightness === false) {
        nodes[idx] = { ...nodes[idx], lightness: parent.lightness };
      } else {
        nodes[idx] = { ...nodes[idx], lightness: Math.max(0, Math.min(100, node.lightness + lightD)) };
      }
      lightChanged = true;
    }
    if (alphaD !== 0 && !node.lockAlpha) {
      if (node.diffAlpha === false) {
        nodes[idx] = { ...nodes[idx], alpha: parent.alpha };
      } else {
        nodes[idx] = { ...nodes[idx], alpha: Math.max(0, Math.min(100, node.alpha + alphaD)) };
      }
      alphaChanged = true;
    }

    // Update derived color spaces
    const updated = nodes[idx];
    const rgb = hslToRgb(updated.hue, updated.saturation, updated.lightness);
    const oklch = hslToOklch(updated.hue, updated.saturation, updated.lightness);
    const hct = rgbToHct(rgb.r, rgb.g, rgb.b);
    nodes[idx] = {
      ...nodes[idx],
      red: rgb.r, green: rgb.g, blue: rgb.b,
      oklchL: oklch.l, oklchC: oklch.c, oklchH: oklch.h,
      hctH: hct.h, hctC: hct.c, hctT: hct.t,
      hexValue: rgbToHex(rgb.r, rgb.g, rgb.b),
    };

    // Recurse to grandchildren
    if (hueChanged || satChanged || lightChanged || alphaChanged) {
      propagateToDescendants(
        nodes, node.id,
        hueChanged ? hueD : 0,
        satChanged ? satD : 0,
        lightChanged ? lightD : 0,
        alphaChanged ? alphaD : 0,
      );
    }
  }
}

// ── Simplified Token Output ─────────────────────────────────────

/**
 * Generate CSS variables from a project snapshot.
 * Legacy simplified fallback — kept for backward compatibility but
 * runPipeline now uses the full tokenFormatters instead.
 */
export function generateCSSOutput(
  nodes: ColorNode[],
  tokens: DesignToken[],
  themes: Theme[],
  targetThemeId: string | null,
): string {
  const outputThemes = targetThemeId
    ? themes.filter(t => t.id === targetThemeId)
    : themes;

  const lines: string[] = ['/* Generated by 0colors Dev Mode */'];

  for (const theme of outputThemes) {
    const selector = theme.isPrimary ? ':root' : `[data-theme="${theme.name.toLowerCase().replace(/\s+/g, '-')}"]`;
    lines.push(`\n${selector} {`);

    for (const token of tokens) {
      if (token.projectId !== nodes[0]?.projectId) continue;

      // Get theme-specific or fallback values
      const tv = token.themeValues?.[theme.id];
      const h = tv?.hue ?? token.hue;
      const s = tv?.saturation ?? token.saturation;
      const l = tv?.lightness ?? token.lightness;
      const a = tv?.alpha ?? token.alpha;

      if (h === undefined && s === undefined && l === undefined) {
        // Try to resolve from assigned nodes
        const assignedNodeIds = (() => {
          for (const node of nodes) {
            if (node.tokenAssignments?.[theme.id]?.includes(token.id)) return node;
            if (node.tokenIds?.includes(token.id)) return node;
          }
          return null;
        })();

        if (assignedNodeIds) {
          const n = assignedNodeIds;
          const nH = n.themeOverrides?.[theme.id]?.hue ?? n.hue;
          const nS = n.themeOverrides?.[theme.id]?.saturation ?? n.saturation;
          const nL = n.themeOverrides?.[theme.id]?.lightness ?? n.lightness;
          const nA = n.themeOverrides?.[theme.id]?.alpha ?? n.alpha;
          const rgb = hslToRgb(nH, nS, nL);
          const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
          const varName = `--${token.name.toLowerCase().replace(/\s+/g, '-')}`;
          if (nA !== undefined && nA < 100) {
            lines.push(`  ${varName}: hsla(${Math.round(nH)}, ${Math.round(nS)}%, ${Math.round(nL)}%, ${(nA / 100).toFixed(2)});`);
          } else {
            lines.push(`  ${varName}: ${hex};`);
          }
        }
        continue;
      }

      const varName = `--${token.name.toLowerCase().replace(/\s+/g, '-')}`;
      const rgb = hslToRgb(h ?? 0, s ?? 0, l ?? 50);
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      if (a !== undefined && a < 100) {
        lines.push(`  ${varName}: hsla(${Math.round(h ?? 0)}, ${Math.round(s ?? 0)}%, ${Math.round(l ?? 50)}%, ${(a / 100).toFixed(2)});`);
      } else {
        lines.push(`  ${varName}: ${hex};`);
      }
    }

    lines.push('}');
  }

  return lines.join('\n');
}

/**
 * Generate DTCG JSON output from tokens.
 */
export function generateDTCGOutput(
  nodes: ColorNode[],
  tokens: DesignToken[],
  themes: Theme[],
  targetThemeId: string | null,
): string {
  const result: any = {};
  const outputThemes = targetThemeId
    ? themes.filter(t => t.id === targetThemeId)
    : themes;

  for (const token of tokens) {
    const tokenKey = token.name.toLowerCase().replace(/\s+/g, '-');
    result[tokenKey] = { $type: 'color' };

    for (const theme of outputThemes) {
      const tv = token.themeValues?.[theme.id];
      const h = tv?.hue ?? token.hue ?? 0;
      const s = tv?.saturation ?? token.saturation ?? 0;
      const l = tv?.lightness ?? token.lightness ?? 50;
      const a = tv?.alpha ?? token.alpha ?? 100;
      const rgb = hslToRgb(h, s, l);
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

      if (outputThemes.length === 1) {
        result[tokenKey].$value = a < 100
          ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(a / 100).toFixed(2)})`
          : hex;
      } else {
        if (!result[tokenKey].$extensions) result[tokenKey].$extensions = {};
        if (!result[tokenKey].$extensions['com.0colors.themes']) result[tokenKey].$extensions['com.0colors.themes'] = {};
        result[tokenKey].$extensions['com.0colors.themes'][theme.name] = a < 100
          ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(a / 100).toFixed(2)})`
          : hex;
        if (theme.isPrimary) {
          result[tokenKey].$value = a < 100
            ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(a / 100).toFixed(2)})`
            : hex;
        }
      }
    }
  }

  return JSON.stringify(result, null, 2);
}

// ── Main Pipeline ───────────────────────────────────────────────

export interface PipelineResult {
  success: boolean;
  output?: Record<string, string>; // format → content
  updatedSnapshot?: ProjectSnapshot;
  error?: string;
}

/**
 * Run the full headless computation pipeline.
 *
 * 1. Parse incoming value
 * 2. Apply to target node
 * 3. Propagate to descendants
 * 4. Generate formatted output (using full tokenFormatters for fidelity)
 * 5. Return results for pushing to destinations
 */
export function runPipeline(
  snapshot: ProjectSnapshot,
  targetNodeId: string,
  incomingValue: string | any,
  incomingFormat: string,
  outputFormat: string,
  outputThemeId: string | null,
): PipelineResult {
  try {
    // 1. Parse incoming value
    const color = parseIncomingValue(incomingValue, incomingFormat);
    if (!color) {
      return { success: false, error: `Failed to parse ${incomingFormat} value: ${incomingValue}` };
    }

    // 2. Find and update target node
    const nodesCopy = snapshot.nodes.map(n => ({ ...n }));
    const targetIdx = nodesCopy.findIndex(n => n.id === targetNodeId);
    if (targetIdx === -1) {
      return { success: false, error: `Target node ${targetNodeId} not found in snapshot` };
    }

    const { updatedNode, deltas } = applyValueToNode(nodesCopy[targetIdx], color);
    nodesCopy[targetIdx] = updatedNode;

    // 3. Propagate to descendants
    propagateToDescendants(
      nodesCopy, targetNodeId,
      deltas.hue, deltas.saturation, deltas.lightness, deltas.alpha,
    );

    // 4. Generate output using full tokenFormatters
    const output: Record<string, string> = {};
    const groups: TokenGroup[] = snapshot.groups || [];
    const advancedLogic: NodeAdvancedLogic[] = snapshot.advancedLogic || [];

    // Determine themes to export
    const outputThemes = outputThemeId
      ? snapshot.themes.filter(t => t.id === outputThemeId)
      : snapshot.themes;
    const primaryTheme = snapshot.themes.find(t => t.isPrimary);
    const primaryThemeId = primaryTheme?.id || (snapshot.themes[0]?.id ?? '');

    for (const theme of outputThemes) {
      const themeId = theme.id;
      const projectTokens = snapshot.tokens;
      const projectNodes = nodesCopy;
      const isPrimaryOrOnly = outputThemes.length === 1 || theme.isPrimary;

      if (outputFormat === 'css' || outputFormat === 'all') {
        const css = generateCSSVariables(
          projectTokens, groups, projectNodes, themeId,
          undefined, primaryThemeId, projectTokens, projectNodes, advancedLogic,
        );
        // Always store under simple key for primary/only theme (Pull API expects this)
        if (isPrimaryOrOnly) output['css'] = css;
        if (outputThemes.length > 1) output[`css:${theme.name}`] = css;
      }
      if (outputFormat === 'dtcg' || outputFormat === 'all') {
        const dtcg = generateDTCGJSON(
          projectTokens, groups, projectNodes, themeId,
          undefined, primaryThemeId, projectTokens, projectNodes, advancedLogic,
        );
        if (isPrimaryOrOnly) output['dtcg'] = dtcg;
        if (outputThemes.length > 1) output[`dtcg:${theme.name}`] = dtcg;
      }
      if (outputFormat === 'tailwind' || outputFormat === 'all') {
        const tw = generateTailwindConfig(
          projectTokens, groups, projectNodes, themeId,
          undefined, primaryThemeId, projectTokens, projectNodes, advancedLogic,
        );
        if (isPrimaryOrOnly) output['tailwind'] = tw;
        if (outputThemes.length > 1) output[`tailwind:${theme.name}`] = tw;
      }
      if (outputFormat === 'figma' || outputFormat === 'all') {
        const projectName = 'Design Tokens'; // Snapshot doesn't carry project name; use default
        const figma = generateFigmaVariablesJSON(
          projectTokens, groups, projectNodes, projectName, themeId,
          primaryThemeId, projectTokens, projectNodes, advancedLogic,
        );
        if (isPrimaryOrOnly) output['figma'] = figma;
        if (outputThemes.length > 1) output[`figma:${theme.name}`] = figma;
      }
    }

    // 5. Return updated snapshot + output
    const updatedSnapshot: ProjectSnapshot = {
      ...snapshot,
      nodes: nodesCopy,
    };

    return { success: true, output, updatedSnapshot };
  } catch (e: any) {
    console.log(`[Pipeline] Error: ${e?.message}`);
    return { success: false, error: `Pipeline error: ${e?.message}` };
  }
}