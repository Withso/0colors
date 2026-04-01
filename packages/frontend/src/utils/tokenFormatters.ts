import { DesignToken, ColorNode, TokenGroup, NodeAdvancedLogic } from '../types';
import { hslToRgb, hslToOklch, oklchToSrgb } from './color-conversions';
import { evaluateAllTokenAssignments, TokenAssignExportResult, TokenColor } from './advanced-logic-engine';

/**
 * Token Value Formatting
 * 
 * Theme-Specific Export Logic:
 * - Tokens are shared across themes with theme-specific values
 * - Only tokens assigned to nodes are exported (unassigned tokens have no value)
 * - Token values use themeValues[activeThemeId] or fallback to legacy properties
 * - This allows complete token sets to be exported for each theme
 */

// Helper to get theme-specific value for a token
function getTokenThemeValue(token: DesignToken, activeThemeId: string) {
  // First check theme-specific values
  if (token.themeValues && token.themeValues[activeThemeId]) {
    return token.themeValues[activeThemeId];
  }
  
  // Fallback to legacy properties for backward compatibility
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

// Helper to convert HSL to hex
function hslToHex(h: number, s: number, l: number): string {
  s = s / 100;
  l = l / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  
  if (h >= 0 && h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h >= 60 && h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h >= 120 && h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h >= 180 && h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h >= 240 && h < 300) { r1 = x; g1 = 0; b1 = c; }
  else if (h >= 300 && h < 360) { r1 = c; g1 = 0; b1 = x; }
  
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

// Helper to get color value for a token in a specific theme
// Returns native color space format when colorSpace is provided
// When hexOverrideSpaces is provided, tokens whose node color space is in
// that set will have their `native` value forced to hex.
export function getTokenColorValue(
  token: DesignToken,
  activeThemeId: string,
  colorSpace?: string,
  hexOverrideSpaces?: Set<string>,
): { hex: string; hexWithAlpha: string; hsla: string; rgba: string; rgbaObj: { r: number; g: number; b: number; a: number }; native: string; colorSpace: string } | null {
  if (token.type !== 'color') return null;
  
  const themeValue = getTokenThemeValue(token, activeThemeId);
  
  if (themeValue.hue === undefined) return null;
  
  const h = themeValue.hue ?? 0;
  const s = themeValue.saturation ?? 0;
  const l = themeValue.lightness ?? 0;
  const a = themeValue.alpha ?? 100;
  
  const hex = hslToHex(h, s, l);
  // Always build 8-char hex with alpha suffix for Figma RGBA mapping consistency
  const alphaHex = Math.round((a / 100) * 255).toString(16).padStart(2, '0').toUpperCase();
  const hexWithAlpha = `${hex}${alphaHex}`;
  const hsla = a < 100 ? `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a / 100})` : `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  
  // Convert to RGB
  const rgb = hslToRgb(h, s, l);
  const rgba = a < 100 ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a / 100})` : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  // RGBA 0-1 floats for Figma Variables
  const rgbaObj = { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255, a: a / 100 };
  
  // Determine native format based on color space
  const cs = colorSpace || 'hex';

  // If this color space is in the hex-override set, force hex output
  const forceHex = hexOverrideSpaces ? hexOverrideSpaces.has(cs) : false;

  let native: string;
  
  if (forceHex) {
    native = hexWithAlpha;
  } else if (cs === 'oklch') {
    const oklch = hslToOklch(h, s, l);
    // hslToOklch returns l: 0-100, c: 0-40 (raw chroma * 100), h: 0-360
    // CSS oklch() uses L: 0-1, C: 0-0.4 (raw chroma), H: degrees
    const L = (oklch.l / 100).toFixed(2);
    const C = (oklch.c / 100).toFixed(3);
    const H = Math.round(oklch.h);
    native = a < 100 ? `oklch(${L} ${C} ${H} / ${a / 100})` : `oklch(${L} ${C} ${H})`;
  } else if (cs === 'rgb') {
    native = rgba;
  } else if (cs === 'hsl') {
    native = hsla;
  } else {
    // hex, hct, or unknown — fall back to hex
    native = hex;
  }
  
  return { hex, hexWithAlpha, hsla, rgba, rgbaObj, native, colorSpace: cs };
}

// Helper: convert a TokenColor (HSL) to a CSS color value in the given color space
export function tokenColorToNativeCSS(
  color: TokenColor,
  colorSpace: string,
  hexOverrideSpaces?: Set<string>,
): string {
  const h = color.h, s = color.s, l = color.l, a = color.a;
  const hex = hslToHex(h, s, l);
  const cs = colorSpace || 'hsl';
  const forceHex = hexOverrideSpaces ? hexOverrideSpaces.has(cs) : false;

  if (forceHex) {
    if (a < 100) {
      const alphaHex = Math.round((a / 100) * 255).toString(16).padStart(2, '0').toUpperCase();
      return `${hex}${alphaHex}`;
    }
    return hex;
  }

  if (cs === 'oklch') {
    const oklch = hslToOklch(h, s, l);
    const L = (oklch.l / 100).toFixed(2);
    const C = (oklch.c / 100).toFixed(3);
    const H = Math.round(oklch.h);
    return a < 100 ? `oklch(${L} ${C} ${H} / ${a / 100})` : `oklch(${L} ${C} ${H})`;
  } else if (cs === 'rgb') {
    const rgb = hslToRgb(h, s, l);
    return a < 100 ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a / 100})` : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  } else if (cs === 'hsl') {
    return a < 100 ? `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a / 100})` : `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  }
  // hex, hct, or unknown — fall back to hex
  return hex;
}

// Helper to get formatted variable name (no group prefix, no color- prefix)
function getFormattedVarName(token: DesignToken, tokenGroups: TokenGroup[], isCSSVar: boolean = false): string {
  const tokenName = token.name.toLowerCase().replace(/\s+/g, '-');
  
  if (isCSSVar) {
    return `--${tokenName}`;
  }
  return tokenName;
}

// Helper to check if a token is assigned to any node for a given theme
// A token only has a value if it's assigned to a node - otherwise it's empty
function isTokenAssignedToNode(token: DesignToken, nodes: ColorNode[], activeThemeId: string): boolean {
  return nodes.some(node => {
    // If theme-specific assignments exist for this theme (even if empty array = intentionally cleared),
    // use them exclusively. Only fall back to legacy tokenIds when no theme-specific key exists at all.
    if (node.tokenAssignments?.[activeThemeId] !== undefined) {
      return node.tokenAssignments[activeThemeId].includes(token.id);
    }
    return (node.tokenIds || []).includes(token.id);
  });
}

// ─── Token Node Group Token Helpers ─────────────────────────────
// Token node group tokens are special: they don't have direct node assignments.
// Instead, they reference a "value token" via the owning token node's
// valueTokenAssignments (theme-aware) or valueTokenId (legacy fallback).
// In exports, they output a REFERENCE to the value token, not a resolved color.

/** Check if a token belongs to a token node group */
function isTokenNodeGroupToken(token: DesignToken, tokenGroups: TokenGroup[]): boolean {
  if (!token.groupId) return false;
  const group = tokenGroups.find(g => g.id === token.groupId);
  return group?.isTokenNodeGroup === true;
}

/**
 * Resolve the value token reference for a token node group token.
 * Returns the referenced value token for the given theme, or null if
 * no value token is assigned (token should be skipped in that theme's export).
 */
function resolveTokenNodeValueRef(
  token: DesignToken,
  allTokens: DesignToken[],
  nodes: ColorNode[],
  activeThemeId: string,
  primaryThemeId: string,
  crossPageTokens?: DesignToken[],
  crossPageNodes?: ColorNode[],
): DesignToken | null {
  // Find the owning token node (non-prefix child with ownTokenId matching)
  // Search current-page nodes first, then fall back to cross-page nodes
  let ownerNode = nodes.find(n => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === token.id);
  if (!ownerNode && crossPageNodes) {
    ownerNode = crossPageNodes.find(n => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === token.id);
  }
  if (!ownerNode) return null;

  // Resolve theme-aware valueTokenId
  let resolvedId: string | undefined;
  if (ownerNode.valueTokenAssignments?.[activeThemeId] !== undefined) {
    // Explicit assignment for this theme (empty string = cleared → no value)
    resolvedId = ownerNode.valueTokenAssignments[activeThemeId] || undefined;
  } else if (primaryThemeId && ownerNode.valueTokenAssignments?.[primaryThemeId] !== undefined) {
    // Inherit from primary theme
    resolvedId = ownerNode.valueTokenAssignments[primaryThemeId] || undefined;
  } else {
    // Legacy fallback
    resolvedId = ownerNode.valueTokenId;
  }

  if (!resolvedId) return null;
  // Search page-scoped tokens first, then cross-page tokens for cross-page references
  return allTokens.find(t => t.id === resolvedId) || (crossPageTokens?.find(t => t.id === resolvedId) ?? null);
}

// Helper to get the color space of the node assigned to a token
// For palette shade nodes, derives colorSpace from the parent palette's paletteColorFormat
export function getTokenNodeColorSpace(token: DesignToken, nodes: ColorNode[], activeThemeId: string): string | undefined {
  const node = nodes.find(n => {
    // If theme-specific assignments exist for this theme (even if empty array = intentionally cleared),
    // use them exclusively. Only fall back to legacy tokenIds when no theme-specific key exists at all.
    if (n.tokenAssignments?.[activeThemeId] !== undefined) {
      return n.tokenAssignments[activeThemeId].includes(token.id);
    }
    return (n.tokenIds || []).includes(token.id);
  });
  if (!node) return undefined;
  
  // If node is a palette shade, check the parent palette's paletteColorFormat
  if (node.parentId) {
    const parent = nodes.find(n => n.id === node.parentId);
    if (parent?.isPalette && parent.paletteColorFormat) {
      const formatMap: Record<string, string> = { 'HEX': 'hex', 'HSLA': 'hsl', 'OKLCH': 'oklch', 'RGBA': 'rgb' };
      return formatMap[parent.paletteColorFormat] || node.colorSpace;
    }
  }
  
  return node.colorSpace;
}

// Generate CSS Variables format
export function generateCSSVariables(tokens: DesignToken[], tokenGroups: TokenGroup[], nodes: ColorNode[], activeThemeId: string, hexOverrideSpaces?: Set<string>, primaryThemeId?: string, allProjectTokens?: DesignToken[], allProjectNodes?: ColorNode[], advancedLogic?: NodeAdvancedLogic[]): string {
  // Pre-evaluate all token assignment logic
  const computedTokens = advancedLogic
    ? evaluateAllTokenAssignments(advancedLogic, allProjectTokens || tokens, allProjectNodes || nodes, activeThemeId, primaryThemeId || activeThemeId)
    : new Map<string, TokenAssignExportResult>();

  let css = ':root {\n';
  
  // Only export tokens that are assigned to nodes (unassigned tokens have no value)
  tokens.forEach(token => {
    // ── Token node group tokens: check for advanced logic first, then value token ref ──
    if (isTokenNodeGroupToken(token, tokenGroups)) {
      const computed = computedTokens.get(token.id);
      if (computed) {
        const varName = getFormattedVarName(token, tokenGroups, true);
        if (computed.result.type === 'computedColor') {
          // Resolve the color space of the owning node
          const ownerNode = (allProjectNodes || nodes).find(n => n.ownTokenId === token.id);
          const cs = ownerNode?.colorSpace || 'hsl';
          const cssValue = tokenColorToNativeCSS(computed.result.color, cs, hexOverrideSpaces);
          css += `  ${varName}: ${cssValue}; /* ${computed.expressionText} */\n`;
        } else if (computed.result.type === 'tokenRef') {
          const refToken = (allProjectTokens || tokens).find(t => t.id === computed.result.tokenId);
          if (refToken) {
            const refVarName = getFormattedVarName(refToken, tokenGroups, true);
            css += `  ${varName}: var(${refVarName}); /* ${computed.expressionText} */\n`;
          }
        }
        return;
      }
      // Fallback: use static value token reference
      const valueToken = resolveTokenNodeValueRef(token, tokens, nodes, activeThemeId, primaryThemeId || activeThemeId, allProjectTokens, allProjectNodes);
      if (!valueToken) return; // No value token assigned → skip
      const varName = getFormattedVarName(token, tokenGroups, true);
      const refVarName = getFormattedVarName(valueToken, tokenGroups, true);
      css += `  ${varName}: var(${refVarName});\n`;
      return;
    }

    if (!isTokenAssignedToNode(token, nodes, activeThemeId)) return;
    
    const varName = getFormattedVarName(token, tokenGroups, true);
    const themeValue = getTokenThemeValue(token, activeThemeId);
    
    if (token.type === 'color') {
      const nodeColorSpace = getTokenNodeColorSpace(token, nodes, activeThemeId);
      const color = getTokenColorValue(token, activeThemeId, nodeColorSpace, hexOverrideSpaces);
      if (color) {
        css += `  ${varName}: ${color.native};\n`;
      }
    } else if (token.type === 'spacing' || token.type === 'radius' || token.type === 'fontSize') {
      if (themeValue.value !== undefined) {
        css += `  ${varName}: ${themeValue.value}${themeValue.unit || 'px'};\n`;
      }
    } else if (token.type === 'fontWeight') {
      if (themeValue.fontWeight !== undefined) {
        css += `  ${varName}: ${themeValue.fontWeight};\n`;
      }
    } else if (token.type === 'lineHeight') {
      if (themeValue.lineHeight !== undefined) {
        css += `  ${varName}: ${themeValue.lineHeight};\n`;
      }
    } else if (token.type === 'opacity') {
      if (themeValue.opacity !== undefined) {
        css += `  ${varName}: ${themeValue.opacity / 100};\n`;
      }
    } else if (token.type === 'shadow') {
      if (themeValue.shadowValue) {
        css += `  ${varName}: ${themeValue.shadowValue};\n`;
      }
    }
  });
  
  css += '}';
  return css;
}

// Generate DTCG (Design Token Community Group) JSON format
export function generateDTCGJSON(tokens: DesignToken[], tokenGroups: TokenGroup[], nodes: ColorNode[], activeThemeId: string, hexOverrideSpaces?: Set<string>, primaryThemeId?: string, allProjectTokens?: DesignToken[], allProjectNodes?: ColorNode[], advancedLogic?: NodeAdvancedLogic[]): string {
  const computedTokens = advancedLogic
    ? evaluateAllTokenAssignments(advancedLogic, allProjectTokens || tokens, allProjectNodes || nodes, activeThemeId, primaryThemeId || activeThemeId)
    : new Map<string, TokenAssignExportResult>();

  const dtcg: any = {};
  
  // Only export tokens that are assigned to nodes (unassigned tokens have no value)
  tokens.forEach(token => {
    // ── Token node group tokens: check advanced logic first, then value token ref ──
    if (isTokenNodeGroupToken(token, tokenGroups)) {
      const computed = computedTokens.get(token.id);
      if (computed) {
        const varName = getFormattedVarName(token, tokenGroups, false);
        if (computed.result.type === 'computedColor') {
          const ownerNode = (allProjectNodes || nodes).find(n => n.ownTokenId === token.id);
          const cs = ownerNode?.colorSpace || 'hsl';
          const cssValue = tokenColorToNativeCSS(computed.result.color, cs, hexOverrideSpaces);
          dtcg[varName] = {
            $type: 'color',
            $value: cssValue,
            $description: `Computed: ${computed.expressionText}`,
          };
        } else if (computed.result.type === 'tokenRef') {
          const refToken = (allProjectTokens || tokens).find(t => t.id === computed.result.tokenId);
          if (refToken) {
            const refName = getFormattedVarName(refToken, tokenGroups, false);
            dtcg[varName] = {
              $type: 'color',
              $value: `{${refName}}`,
              $description: `Computed: ${computed.expressionText}`,
            };
          }
        }
        return;
      }
      const valueToken = resolveTokenNodeValueRef(token, tokens, nodes, activeThemeId, primaryThemeId || activeThemeId, allProjectTokens, allProjectNodes);
      if (!valueToken) return; // No value token assigned → skip
      const varName = getFormattedVarName(token, tokenGroups, false);
      const refName = getFormattedVarName(valueToken, tokenGroups, false);
      dtcg[varName] = {
        $type: 'color',
        $value: `{${refName}}`,
        $description: `Token alias: ${token.name} → ${valueToken.name}`,
      };
      return;
    }

    if (!isTokenAssignedToNode(token, nodes, activeThemeId)) return;
    
    const varName = getFormattedVarName(token, tokenGroups, false);
    const themeValue = getTokenThemeValue(token, activeThemeId);
    
    if (token.type === 'color') {
      const nodeColorSpace = getTokenNodeColorSpace(token, nodes, activeThemeId);
      const color = getTokenColorValue(token, activeThemeId, nodeColorSpace, hexOverrideSpaces);
      if (color) {
        dtcg[varName] = {
          $type: 'color',
          $value: color.native,
          $description: `Color token: ${token.name}`,
        };
      }
    } else if (token.type === 'spacing') {
      if (themeValue.value !== undefined) {
        dtcg[varName] = {
          $type: 'dimension',
          $value: `${themeValue.value}${themeValue.unit || 'px'}`,
          $description: `Spacing token: ${token.name}`,
        };
      }
    } else if (token.type === 'radius') {
      if (themeValue.value !== undefined) {
        dtcg[varName] = {
          $type: 'dimension',
          $value: `${themeValue.value}${themeValue.unit || 'px'}`,
          $description: `Border radius token: ${token.name}`,
        };
      }
    } else if (token.type === 'fontSize') {
      if (themeValue.value !== undefined) {
        dtcg[varName] = {
          $type: 'dimension',
          $value: `${themeValue.value}${themeValue.unit || 'px'}`,
          $description: `Font size token: ${token.name}`,
        };
      }
    } else if (token.type === 'fontWeight') {
      if (themeValue.fontWeight !== undefined) {
        dtcg[varName] = {
          $type: 'fontWeight',
          $value: themeValue.fontWeight,
          $description: `Font weight token: ${token.name}`,
        };
      }
    } else if (token.type === 'lineHeight') {
      if (themeValue.lineHeight !== undefined) {
        dtcg[varName] = {
          $type: 'number',
          $value: themeValue.lineHeight,
          $description: `Line height token: ${token.name}`,
        };
      }
    } else if (token.type === 'opacity') {
      if (themeValue.opacity !== undefined) {
        dtcg[varName] = {
          $type: 'number',
          $value: themeValue.opacity / 100,
          $description: `Opacity token: ${token.name}`,
        };
      }
    } else if (token.type === 'shadow') {
      if (themeValue.shadowValue) {
        dtcg[varName] = {
          $type: 'shadow',
          $value: themeValue.shadowValue,
          $description: `Shadow token: ${token.name}`,
        };
      }
    }
  });
  
  return JSON.stringify(dtcg, null, 2);
}

// Generate Tailwind CSS config format
export function generateTailwindConfig(tokens: DesignToken[], tokenGroups: TokenGroup[], nodes: ColorNode[], activeThemeId: string, hexOverrideSpaces?: Set<string>, primaryThemeId?: string, allProjectTokens?: DesignToken[], allProjectNodes?: ColorNode[], advancedLogic?: NodeAdvancedLogic[]): string {
  const computedTokens = advancedLogic
    ? evaluateAllTokenAssignments(advancedLogic, allProjectTokens || tokens, allProjectNodes || nodes, activeThemeId, primaryThemeId || activeThemeId)
    : new Map<string, TokenAssignExportResult>();

  const colorsByGroup: any = {};
  const spacing: any = {};
  const borderRadius: any = {};
  const fontSize: any = {};
  const fontWeight: any = {};
  const lineHeight: any = {};
  
  // Only export tokens that are assigned to nodes (unassigned tokens have no value)
  tokens.forEach(token => {
    // ── Token node group tokens: check advanced logic, then value token ref ──
    if (isTokenNodeGroupToken(token, tokenGroups)) {
      const computed = computedTokens.get(token.id);
      const tokenName = token.name.toLowerCase().replace(/\s+/g, '-');
      let colorValue: string | null = null;

      if (computed) {
        if (computed.result.type === 'computedColor') {
          const ownerNode = (allProjectNodes || nodes).find(n => n.ownTokenId === token.id);
          const cs = ownerNode?.colorSpace || 'hsl';
          colorValue = tokenColorToNativeCSS(computed.result.color, cs, hexOverrideSpaces);
        } else if (computed.result.type === 'tokenRef') {
          const refToken = (allProjectTokens || tokens).find(t => t.id === (computed.result as any).tokenId);
          if (refToken) {
            const refVarName = getFormattedVarName(refToken, tokenGroups, true);
            colorValue = `var(${refVarName})`;
          }
        }
      }

      if (!colorValue) {
        const valueToken = resolveTokenNodeValueRef(token, tokens, nodes, activeThemeId, primaryThemeId || activeThemeId, allProjectTokens, allProjectNodes);
        if (!valueToken) return;
        const refVarName = getFormattedVarName(valueToken, tokenGroups, true);
        colorValue = `var(${refVarName})`;
      }

      if (token.groupId) {
        const group = tokenGroups.find(g => g.id === token.groupId);
        if (group) {
          const groupName = group.name.toLowerCase().replace(/\s+/g, '-');
          if (!colorsByGroup[groupName]) colorsByGroup[groupName] = {};
          colorsByGroup[groupName][tokenName] = colorValue;
        }
      } else {
        colorsByGroup[tokenName] = colorValue;
      }
      return;
    }

    if (!isTokenAssignedToNode(token, nodes, activeThemeId)) return;
    
    const themeValue = getTokenThemeValue(token, activeThemeId);
    
    if (token.type === 'color') {
      const nodeColorSpace = getTokenNodeColorSpace(token, nodes, activeThemeId);
      const color = getTokenColorValue(token, activeThemeId, nodeColorSpace, hexOverrideSpaces);
      if (color) {
        // Organize colors by group
        if (token.groupId) {
          const group = tokenGroups.find(g => g.id === token.groupId);
          if (group && !group.isPaletteEntry) {
            const groupName = group.name.toLowerCase().replace(/\s+/g, '-');
            if (!colorsByGroup[groupName]) {
              colorsByGroup[groupName] = {};
            }
            const tokenName = token.name.toLowerCase().replace(/\s+/g, '-');
            colorsByGroup[groupName][tokenName] = color.native;
          } else {
            // No valid group - add to root colors
            const tokenName = token.name.toLowerCase().replace(/\s+/g, '-');
            colorsByGroup[tokenName] = color.native;
          }
        } else {
          // No group - add to root colors
          const tokenName = token.name.toLowerCase().replace(/\s+/g, '-');
          colorsByGroup[tokenName] = color.native;
        }
      }
    } else if (token.type === 'spacing') {
      if (themeValue.value !== undefined) {
        const varName = getFormattedVarName(token, tokenGroups, false);
        spacing[varName] = `${themeValue.value}${themeValue.unit || 'px'}`;
      }
    } else if (token.type === 'radius') {
      if (themeValue.value !== undefined) {
        const varName = getFormattedVarName(token, tokenGroups, false);
        borderRadius[varName] = `${themeValue.value}${themeValue.unit || 'px'}`;
      }
    } else if (token.type === 'fontSize') {
      if (themeValue.value !== undefined) {
        const varName = getFormattedVarName(token, tokenGroups, false);
        fontSize[varName] = `${themeValue.value}${themeValue.unit || 'px'}`;
      }
    } else if (token.type === 'fontWeight') {
      if (themeValue.fontWeight !== undefined) {
        const varName = getFormattedVarName(token, tokenGroups, false);
        fontWeight[varName] = themeValue.fontWeight;
      }
    } else if (token.type === 'lineHeight') {
      if (themeValue.lineHeight !== undefined) {
        const varName = getFormattedVarName(token, tokenGroups, false);
        lineHeight[varName] = themeValue.lineHeight;
      }
    }
  });
  
  const config = {
    theme: {
      extend: {
        ...(Object.keys(colorsByGroup).length > 0 && { colors: colorsByGroup }),
        ...(Object.keys(spacing).length > 0 && { spacing }),
        ...(Object.keys(borderRadius).length > 0 && { borderRadius }),
        ...(Object.keys(fontSize).length > 0 && { fontSize }),
        ...(Object.keys(fontWeight).length > 0 && { fontWeight }),
        ...(Object.keys(lineHeight).length > 0 && { lineHeight }),
      },
    },
  };
  
  return `module.exports = ${JSON.stringify(config, null, 2)}`;
}

// Generate Figma Variables JSON format (for import to Figma)
export function generateFigmaVariablesJSON(tokens: DesignToken[], tokenGroups: TokenGroup[], nodes: ColorNode[], collectionName: string = 'Design Tokens', activeThemeId: string, primaryThemeId: string, allProjectTokens?: DesignToken[], allProjectNodes?: ColorNode[], advancedLogic?: NodeAdvancedLogic[]): string {
  const computedTokens = advancedLogic
    ? evaluateAllTokenAssignments(advancedLogic, allProjectTokens || tokens, allProjectNodes || nodes, activeThemeId, primaryThemeId || activeThemeId)
    : new Map<string, TokenAssignExportResult>();

  const tokensByGroup: { [key: string]: any } = {};
  
  // Only export tokens that are assigned to nodes (unassigned tokens have no value)
  tokens.forEach((token) => {
    // ── Token node group tokens: check advanced logic, then value token ref ──
    if (isTokenNodeGroupToken(token, tokenGroups)) {
      const computed = computedTokens.get(token.id);

      const tokenKey = token.name.toLowerCase().replace(/\s+/g, '-');
      let groupKey: string | null = null;
      if (token.groupId) {
        const group = tokenGroups.find(g => g.id === token.groupId);
        if (group && !group.isPaletteEntry) {
          groupKey = group.name.toLowerCase().replace(/\s+/g, '-');
        }
      }
      const variableId = `VariableID:${token.id.replace(/[^0-9]/g, '')}:${Math.floor(Math.random() * 1000)}`;

      if (computed) {
        let resolvedValue: any = null;
        if (computed.result.type === 'computedColor') {
          const c = computed.result.color;
          const rgb = hslToRgb(c.h, c.s, c.l);
          resolvedValue = {
            $type: 'color',
            $value: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255, a: (c.a ?? 100) / 100 },
            $description: `Computed: ${computed.expressionText}`,
            $extensions: { 'com.figma.variableId': variableId, 'com.figma.scopes': ['ALL_SCOPES'] },
          };
        } else if (computed.result.type === 'tokenRef') {
          const refToken = (allProjectTokens || tokens).find(t => t.id === computed.result.tokenId);
          if (refToken) {
            const refTokenKey = refToken.name.toLowerCase().replace(/\s+/g, '-');
            let refPath = refTokenKey;
            if (refToken.groupId) {
              const refGroup = tokenGroups.find(g => g.id === refToken.groupId);
              if (refGroup && !refGroup.isPaletteEntry) {
                refPath = `${refGroup.name.toLowerCase().replace(/\s+/g, '-')}.${refTokenKey}`;
              }
            }
            resolvedValue = {
              $type: 'color',
              $value: `{${refPath}}`,
              $description: `Computed: ${computed.expressionText}`,
              $extensions: { 'com.figma.variableId': variableId, 'com.figma.scopes': ['ALL_SCOPES'] },
            };
          }
        }

        if (resolvedValue) {
          if (groupKey) {
            if (!tokensByGroup[groupKey]) tokensByGroup[groupKey] = {};
            tokensByGroup[groupKey][tokenKey] = resolvedValue;
          } else {
            tokensByGroup[tokenKey] = resolvedValue;
          }
          return;
        }
      }

      // Fallback: static value token reference
      const valueToken = resolveTokenNodeValueRef(token, tokens, nodes, activeThemeId, primaryThemeId, allProjectTokens, allProjectNodes);
      if (!valueToken) return; // No value token assigned → skip

      // Build the reference path matching the Figma JSON nesting: {group.token-name}
      const refTokenKey = valueToken.name.toLowerCase().replace(/\s+/g, '-');
      let refPath = refTokenKey;
      if (valueToken.groupId) {
        const refGroup = tokenGroups.find(g => g.id === valueToken.groupId);
        if (refGroup && !refGroup.isPaletteEntry) {
          refPath = `${refGroup.name.toLowerCase().replace(/\s+/g, '-')}.${refTokenKey}`;
        }
      }

      const fallbackVariableId = `VariableID:${token.id.replace(/[^0-9]/g, '')}:${Math.floor(Math.random() * 1000)}`;
      const tokenValue = {
        $type: 'color',
        $value: `{${refPath}}`,
        $extensions: {
          'com.figma.variableId': fallbackVariableId,
          'com.figma.scopes': ['ALL_SCOPES'],
        },
      };

      if (groupKey) {
        if (!tokensByGroup[groupKey]) tokensByGroup[groupKey] = {};
        tokensByGroup[groupKey][tokenKey] = tokenValue;
      } else {
        tokensByGroup[tokenKey] = tokenValue;
      }
      return;
    }

    if (!isTokenAssignedToNode(token, nodes, activeThemeId)) return;
    
    const themeValue = getTokenThemeValue(token, activeThemeId);
    
    // Get the group for this token
    let groupKey: string | null = null;
    if (token.groupId) {
      const group = tokenGroups.find(g => g.id === token.groupId);
      if (group && !group.isPaletteEntry) {
        groupKey = group.name.toLowerCase().replace(/\s+/g, '-');
      }
    }
    
    // Format token name (remove spaces, replace with dashes)
    const tokenKey = token.name.toLowerCase().replace(/\s+/g, '-');
    
    // Create the token value object based on type
    let tokenValue: any = null;
    
    if (token.type === 'color') {
      // Figma Variables always use sRGB color space.
      // For maximum accuracy, determine the node's native color space and
      // convert directly to sRGB instead of relying on HSL intermediates.
      const nodeCS = getTokenNodeColorSpace(token, nodes, activeThemeId);
      const h = themeValue.hue ?? 0;
      const s = themeValue.saturation ?? 0;
      const l = themeValue.lightness ?? 0;
      const a = (themeValue.alpha ?? 100) / 100;

      let r8: number, g8: number, b8: number; // 0-255 sRGB

      if (nodeCS === 'oklch') {
        // Convert the token's HSL to OKLCH, then OKLCH → sRGB directly
        // (avoids OKLCH→HSL→hex double rounding)
        const oklch = hslToOklch(h, s, l);
        // hslToOklch returns { l: 0-100, c: 0-40 raw×100, h: 0-360 }
        // oklchToSrgb expects { L: 0-100, C: 0-100 display-scale, H: 0-360 }
        const srgb = oklchToSrgb(oklch.l, oklch.c / 0.4, oklch.h);
        r8 = srgb.r; g8 = srgb.g; b8 = srgb.b;
      } else {
        // HSL / hex / rgb / hct — standard HSL → sRGB path
        const rgb = hslToRgb(h, s, l);
        r8 = rgb.r; g8 = rgb.g; b8 = rgb.b;
      }

      // Normalized 0-1 components
      const rN = r8 / 255;
      const gN = g8 / 255;
      const bN = b8 / 255;

      // Build hex string
      const hexStr = '#' + [r8, g8, b8].map(x =>
        Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')
      ).join('').toUpperCase();

      const variableId = `VariableID:${token.id.replace(/[^0-9]/g, '')}:${Math.floor(Math.random() * 1000)}`;

      tokenValue = {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [
            parseFloat(rN.toFixed(17)),
            parseFloat(gN.toFixed(17)),
            parseFloat(bN.toFixed(17))
          ],
          alpha: parseFloat(a.toFixed(17)),
          hex: hexStr
        },
        $extensions: {
          'com.figma.variableId': variableId,
          'com.figma.scopes': ['ALL_SCOPES']
        }
      };
    } else if (token.type === 'spacing' || token.type === 'radius' || token.type === 'fontSize') {
      if (themeValue.value !== undefined) {
        const variableId = `VariableID:${token.id.replace(/[^0-9]/g, '')}:${Math.floor(Math.random() * 1000)}`;
        
        tokenValue = {
          $type: 'dimension',
          $value: `${themeValue.value}${themeValue.unit || 'px'}`,
          $extensions: {
            'com.figma.variableId': variableId,
            'com.figma.scopes': ['ALL_SCOPES']
          }
        };
      }
    } else if (token.type === 'fontWeight') {
      if (themeValue.fontWeight !== undefined) {
        const variableId = `VariableID:${token.id.replace(/[^0-9]/g, '')}:${Math.floor(Math.random() * 1000)}`;
        
        tokenValue = {
          $type: 'number',
          $value: themeValue.fontWeight,
          $extensions: {
            'com.figma.variableId': variableId,
            'com.figma.scopes': ['ALL_SCOPES']
          }
        };
      }
    } else if (token.type === 'lineHeight') {
      if (themeValue.lineHeight !== undefined) {
        const variableId = `VariableID:${token.id.replace(/[^0-9]/g, '')}:${Math.floor(Math.random() * 1000)}`;
        
        tokenValue = {
          $type: 'number',
          $value: themeValue.lineHeight,
          $extensions: {
            'com.figma.variableId': variableId,
            'com.figma.scopes': ['ALL_SCOPES']
          }
        };
      }
    } else if (token.type === 'opacity') {
      if (themeValue.opacity !== undefined) {
        const variableId = `VariableID:${token.id.replace(/[^0-9]/g, '')}:${Math.floor(Math.random() * 1000)}`;
        
        tokenValue = {
          $type: 'number',
          $value: themeValue.opacity / 100,
          $extensions: {
            'com.figma.variableId': variableId,
            'com.figma.scopes': ['ALL_SCOPES']
          }
        };
      }
    }
    
    // Add token to the appropriate group or root
    if (tokenValue) {
      if (groupKey) {
        // Add to group
        if (!tokensByGroup[groupKey]) {
          tokensByGroup[groupKey] = {};
        }
        tokensByGroup[groupKey][tokenKey] = tokenValue;
      } else {
        // Add to root (no group)
        tokensByGroup[tokenKey] = tokenValue;
      }
    }
  });
  
  // Add collection-level metadata
  const result = {
    ...tokensByGroup,
    $extensions: {
      'com.figma.modeName': collectionName
    }
  };
  
  return JSON.stringify(result, null, 2);
}