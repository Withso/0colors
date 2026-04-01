// ═══════════════════════════════════════════════════════════════════
// AI Project Context Builder
// Builds a concise text summary of the current project state
// to inject into the AI system prompt so it has full awareness.
// ═══════════════════════════════════════════════════════════════════

import { ColorNode, DesignToken, TokenGroup, TokenProject, Page, Theme, NodeAdvancedLogic } from '../types';

// Helper to get computed CSS color from HSL
function hslToHex(h: number, s: number, l: number): string {
  const hDeg = ((h % 360) + 360) % 360;
  const sF = Math.max(0, Math.min(100, s)) / 100;
  const lF = Math.max(0, Math.min(100, l)) / 100;
  const a2 = sF * Math.min(lF, 1 - lF);
  const f = (n: number) => {
    const k = (n + hDeg / 30) % 12;
    const color = lF - a2 * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, color)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function getNodeColorSummary(node: ColorNode, themeId?: string): string {
  const overrides = themeId && node.themeOverrides?.[themeId];
  if (node.colorSpace === 'hsl') {
    const h = overrides ? overrides.hue : node.hue;
    const s = overrides ? overrides.saturation : node.saturation;
    const l = overrides ? overrides.lightness : node.lightness;
    return `hsl(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%) ${hslToHex(h, s, l)}`;
  }
  if (node.colorSpace === 'rgb') {
    const r = overrides?.red ?? node.red ?? 0;
    const g = overrides?.green ?? node.green ?? 0;
    const b = overrides?.blue ?? node.blue ?? 0;
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }
  if (node.colorSpace === 'oklch') {
    const oL = overrides?.oklchL ?? node.oklchL ?? 50;
    const oC = overrides?.oklchC ?? node.oklchC ?? 0;
    const oH = overrides?.oklchH ?? node.oklchH ?? 0;
    return `oklch(${oL.toFixed(1)}% ${(oC / 100 * 0.4).toFixed(3)} ${oH.toFixed(0)})`;
  }
  if (node.colorSpace === 'hct') {
    const hH = overrides?.hctH ?? node.hctH ?? 0;
    const hC = overrides?.hctC ?? node.hctC ?? 0;
    const hT = overrides?.hctT ?? node.hctT ?? 50;
    return `hct(${hH.toFixed(0)},${hC.toFixed(0)},${hT.toFixed(0)})`;
  }
  if (node.colorSpace === 'hex') {
    return node.hexValue || '#000000';
  }
  return 'unknown';
}

function describeNode(node: ColorNode, allNodes: ColorNode[], tokens: DesignToken[], themeId?: string): string {
  const parts: string[] = [];
  const name = node.referenceName || node.id.slice(0, 8);
  parts.push(`"${name}" [${node.colorSpace.toUpperCase()}]`);
  parts.push(getNodeColorSummary(node, themeId));

  if (node.parentId) {
    const parent = allNodes.find(n => n.id === node.parentId);
    if (parent) parts.push(`parent="${parent.referenceName || parent.id.slice(0, 8)}"`);
  }

  if (node.isPalette) parts.push(`PALETTE(shades=${node.paletteShadeCount || 10})`);
  if (node.isTokenNode) parts.push('TOKEN-NODE');
  if (node.isTokenPrefix) parts.push('TOKEN-PREFIX');
  if (node.isSpacing) parts.push(`SPACING(${node.spacingValue}${node.spacingUnit || 'px'})`);

  // Token assignments
  const assignedTokens = tokens.filter(t => {
    if (themeId && node.tokenAssignments?.[themeId]?.includes(t.id)) return true;
    if (node.tokenIds?.includes(t.id)) return true;
    return false;
  });
  if (assignedTokens.length > 0) {
    parts.push(`tokens=[${assignedTokens.map(t => t.name).join(', ')}]`);
  }

  // Lock/diff summary (only if non-default)
  const locks: string[] = [];
  if (node.lockHue) locks.push('H');
  if (node.lockSaturation) locks.push('S');
  if (node.lockLightness) locks.push('L');
  if (node.lockAlpha) locks.push('A');
  if (node.lockRed) locks.push('R');
  if (node.lockGreen) locks.push('G');
  if (node.lockBlue) locks.push('B');
  if (node.lockOklchL) locks.push('oL');
  if (node.lockOklchC) locks.push('oC');
  if (node.lockOklchH) locks.push('oH');
  if (node.lockHctH) locks.push('hH');
  if (node.lockHctC) locks.push('hC');
  if (node.lockHctT) locks.push('hT');
  if (locks.length > 0) parts.push(`locked=[${locks.join(',')}]`);

  const diffs: string[] = [];
  if (node.diffHue) diffs.push(`H+${node.hueOffset || 0}`);
  if (node.diffSaturation) diffs.push(`S+${node.saturationOffset || 0}`);
  if (node.diffLightness) diffs.push(`L+${node.lightnessOffset || 0}`);
  if (locks.length > 0 || diffs.length > 0) {
    if (diffs.length > 0) parts.push(`diffs=[${diffs.join(',')}]`);
  }

  // Children count
  const children = allNodes.filter(n => n.parentId === node.id);
  if (children.length > 0) parts.push(`${children.length} children`);

  return parts.join(' | ');
}

function describeAdvancedLogic(logic: NodeAdvancedLogic, allNodes: ColorNode[]): string {
  const node = allNodes.find(n => n.id === logic.nodeId);
  const name = node?.referenceName || logic.nodeId.slice(0, 8);
  const channelKeys = Object.keys(logic.channels);
  if (channelKeys.length === 0 && !logic.tokenAssignment) return '';

  const parts: string[] = [`"${name}" advanced logic:`];

  for (const ch of channelKeys) {
    const cl = logic.channels[ch];
    if (!cl.rows || cl.rows.length === 0) continue;
    const rowDescs = cl.rows
      .filter(r => r.enabled)
      .map(r => {
        const expr = r.tokens.map(t => t.value).join(' ');
        return `${r.outputName || 'out'}: ${expr}`;
      });
    if (rowDescs.length > 0) {
      parts.push(`  ${ch}: ${rowDescs.join(' | ')}`);
    }
    if (cl.fallbackMode === 'custom' && cl.fallbackValue !== undefined) {
      parts.push(`  ${ch} fallback: ${cl.fallbackValue}`);
    }
  }

  if (logic.tokenAssignment) {
    const ta = logic.tokenAssignment;
    const rowDescs = ta.rows
      .filter(r => r.enabled)
      .map(r => {
        const expr = r.tokens.map(t => t.value).join(' ');
        return `${r.outputName || 'out'}: ${expr}`;
      });
    if (rowDescs.length > 0) {
      parts.push(`  TOKEN-ASSIGN: ${rowDescs.join(' | ')}`);
    }
  }

  return parts.length > 1 ? parts.join('\n') : '';
}

export interface ProjectContextInput {
  projects: TokenProject[];
  activeProjectId: string;
  pages: Page[];
  activePageId: string;
  themes: Theme[];
  activeThemeId: string;
  allNodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  advancedLogic: NodeAdvancedLogic[];
  maxChars?: number; // Optional hard cap on output length
}

/**
 * Build a concise project context string for the AI system prompt.
 * Respects optional maxChars limit by progressively dropping detail.
 */
export function buildProjectContext(input: ProjectContextInput): string {
  const {
    projects, activeProjectId, pages, activePageId,
    themes, activeThemeId, allNodes, tokens, groups, advancedLogic,
    maxChars,
  } = input;

  const project = projects.find(p => p.id === activeProjectId);
  if (!project) return '[No active project]';

  const projectPages = pages.filter(p => p.projectId === activeProjectId);
  const activePage = projectPages.find(p => p.id === activePageId);
  const projectThemes = themes.filter(t => t.projectId === activeProjectId).sort((a, b) => a.createdAt - b.createdAt);
  const activeTheme = projectThemes.find(t => t.id === activeThemeId);
  const primaryTheme = projectThemes.find(t => t.isPrimary);
  const isPrimary = activeTheme?.isPrimary ?? false;

  // Nodes on the active page (not filtered by theme - nodes are shared)
  const pageNodes = allNodes.filter(n => n.projectId === activeProjectId && n.pageId === activePageId);
  const pageTokens = tokens.filter(t => t.projectId === activeProjectId && t.pageId === activePageId);
  const pageGroups = groups.filter(g => g.projectId === activeProjectId && g.pageId === activePageId);
  const pageLogic = advancedLogic.filter(l => pageNodes.some(n => n.id === l.nodeId));

  // All tokens across all pages for this project
  const allProjectTokens = tokens.filter(t => t.projectId === activeProjectId);

  const lines: string[] = [];

  // Header
  lines.push(`== CURRENT PROJECT CONTEXT ==`);
  lines.push(`Project: "${project.name}" (${project.isCloud ? 'cloud' : project.isTemplate ? 'template' : 'local'})`);
  lines.push(`Page: "${activePage?.name || 'unknown'}" (${projectPages.length} pages total: ${projectPages.map(p => p.name).join(', ')})`);
  lines.push(`Theme: "${activeTheme?.name || 'unknown'}" ${isPrimary ? '(PRIMARY)' : '(non-primary)'} (${projectThemes.length} themes: ${projectThemes.map(t => `${t.name}${t.isPrimary ? '*' : ''}`).join(', ')})`);
  lines.push('');

  // Nodes summary
  const rootNodes = pageNodes.filter(n => !n.parentId);
  lines.push(`--- NODES (${pageNodes.length} total, ${rootNodes.length} root) ---`);

  // Build hierarchy
  const describeTree = (nodeId: string, depth: number) => {
    const node = pageNodes.find(n => n.id === nodeId);
    if (!node) return;
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${describeNode(node, pageNodes, pageTokens, activeThemeId)}`);
    const children = pageNodes.filter(n => n.parentId === nodeId);
    // Limit children display for very large palettes
    if (children.length > 15) {
      children.slice(0, 10).forEach(c => describeTree(c.id, depth + 1));
      lines.push(`${indent}  ... and ${children.length - 10} more children`);
    } else {
      children.forEach(c => describeTree(c.id, depth + 1));
    }
  };

  rootNodes.forEach(n => describeTree(n.id, 0));
  lines.push('');

  // Token groups and tokens
  lines.push(`--- TOKENS (${pageTokens.length} on page, ${allProjectTokens.length} in project) ---`);
  const ungrouped = pageTokens.filter(t => !t.groupId);
  const groupedMap = new Map<string, DesignToken[]>();
  for (const t of pageTokens) {
    if (t.groupId) {
      if (!groupedMap.has(t.groupId)) groupedMap.set(t.groupId, []);
      groupedMap.get(t.groupId)!.push(t);
    }
  }

  for (const g of pageGroups) {
    const gTokens = groupedMap.get(g.id) || [];
    if (gTokens.length > 0) {
      lines.push(`  Group "${g.name}" (${gTokens.length} tokens):`);
      for (const t of gTokens.slice(0, 20)) {
        const tv = t.themeValues?.[activeThemeId];
        const val = tv
          ? (tv.hue !== undefined ? `hsl(${tv.hue},${tv.saturation}%,${tv.lightness}%)` : tv.value !== undefined ? `${tv.value}${tv.unit || ''}` : '?')
          : 'no value';
        lines.push(`    ${t.name} (${t.type || 'color'}): ${val}`);
      }
      if (gTokens.length > 20) lines.push(`    ... and ${gTokens.length - 20} more`);
    }
  }

  if (ungrouped.length > 0) {
    lines.push(`  Ungrouped (${ungrouped.length} tokens):`);
    for (const t of ungrouped.slice(0, 15)) {
      lines.push(`    ${t.name} (${t.type || 'color'})`);
    }
    if (ungrouped.length > 15) lines.push(`    ... and ${ungrouped.length - 15} more`);
  }
  lines.push('');

  // Advanced logic
  if (pageLogic.length > 0) {
    lines.push(`--- ADVANCED LOGIC (${pageLogic.length} nodes with logic) ---`);
    for (const logic of pageLogic.slice(0, 10)) {
      const desc = describeAdvancedLogic(logic, pageNodes);
      if (desc) lines.push(desc);
    }
    if (pageLogic.length > 10) lines.push(`... and ${pageLogic.length - 10} more nodes with logic`);
    lines.push('');
  }

  // Other pages summary (brief)
  if (projectPages.length > 1) {
    lines.push(`--- OTHER PAGES ---`);
    for (const p of projectPages) {
      if (p.id === activePageId) continue;
      const pNodes = allNodes.filter(n => n.projectId === activeProjectId && n.pageId === p.id);
      const pTokens = tokens.filter(t => t.projectId === activeProjectId && t.pageId === p.id);
      lines.push(`  "${p.name}": ${pNodes.length} nodes, ${pTokens.length} tokens`);
    }
  }

  // Build sections in priority order so we can progressively drop them
  const sections: { label: string; lines: string[] }[] = [];
  let currentSection: string[] = [];
  let currentLabel = 'header';

  for (const line of lines) {
    if (line.startsWith('--- NODES')) {
      sections.push({ label: currentLabel, lines: currentSection });
      currentSection = [line];
      currentLabel = 'nodes';
    } else if (line.startsWith('--- TOKENS')) {
      sections.push({ label: currentLabel, lines: currentSection });
      currentSection = [line];
      currentLabel = 'tokens';
    } else if (line.startsWith('--- ADVANCED LOGIC')) {
      sections.push({ label: currentLabel, lines: currentSection });
      currentSection = [line];
      currentLabel = 'logic';
    } else if (line.startsWith('--- OTHER PAGES')) {
      sections.push({ label: currentLabel, lines: currentSection });
      currentSection = [line];
      currentLabel = 'otherPages';
    } else {
      currentSection.push(line);
    }
  }
  sections.push({ label: currentLabel, lines: currentSection });

  // If no maxChars, return full context
  let context = lines.join('\n');
  if (!maxChars || context.length <= maxChars) {
    return context;
  }

  // Progressive dropping — lowest priority first
  const dropOrder = ['otherPages', 'logic', 'tokens', 'nodes'];
  let activeSections = [...sections];

  for (const label of dropOrder) {
    if (context.length <= maxChars) break;
    activeSections = activeSections.filter(s => s.label !== label);
    context = activeSections.flatMap(s => s.lines).join('\n');
  }

  // Hard truncate as last resort
  if (context.length > maxChars) {
    context = context.slice(0, maxChars - 50) + '\n... [project context truncated for model limits]';
  }

  return context;
}