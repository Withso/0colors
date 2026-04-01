/**
 * Sample Template Definitions for 0colors
 *
 * Each template is a complete project snapshot that can be loaded
 * into the canvas in read-only sample mode. Users can browse
 * templates via the dropdown switcher, then duplicate to local/cloud.
 *
 * Template admins can also create cloud-backed templates via the
 * /templates endpoint (future) — those get merged with these built-ins.
 */

import type { ColorNode, DesignToken, TokenProject, TokenGroup, Page, Theme, CanvasState } from '../types';

export interface SampleTemplate {
  id: string;
  name: string;
  description: string;
  folderColor: number;
  /** The full project data snapshot */
  project: TokenProject;
  nodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  pages: Page[];
  themes: Theme[];
  canvasStates: CanvasState[];
}

// ── Helper: generate a grey scale ──
function greyScale(projectId: string, pageId: string, themeId: string): { tokens: DesignToken[]; group: TokenGroup } {
  const steps = [
    { id: `${projectId}-grey-50`, name: 'grey-50', l: 98 },
    { id: `${projectId}-grey-100`, name: 'grey-100', l: 96 },
    { id: `${projectId}-grey-200`, name: 'grey-200', l: 90 },
    { id: `${projectId}-grey-300`, name: 'grey-300', l: 83 },
    { id: `${projectId}-grey-400`, name: 'grey-400', l: 64 },
    { id: `${projectId}-grey-500`, name: 'grey-500', l: 45 },
    { id: `${projectId}-grey-600`, name: 'grey-600', l: 32 },
    { id: `${projectId}-grey-700`, name: 'grey-700', l: 25 },
    { id: `${projectId}-grey-800`, name: 'grey-800', l: 15 },
    { id: `${projectId}-grey-900`, name: 'grey-900', l: 9 },
  ];
  return {
    tokens: steps.map(s => ({
      id: s.id, name: s.name, type: 'color' as const,
      groupId: `${projectId}-grey-group`, projectId, pageId,
      themeValues: { [themeId]: { hue: 0, saturation: 0, lightness: s.l, alpha: 100 } },
      hue: 0, saturation: 0, lightness: s.l, alpha: 100,
    })),
    group: { id: `${projectId}-grey-group`, name: 'grey', projectId, isExpanded: true },
  };
}

// ── Helper: generate a color scale from hue ──
function colorScale(
  projectId: string, pageId: string, themeId: string,
  hue: number, name: string, sat = 70,
): { tokens: DesignToken[]; group: TokenGroup } {
  const steps = [
    { suffix: '50', l: 95, s: sat - 20 },
    { suffix: '100', l: 90, s: sat - 10 },
    { suffix: '200', l: 82, s: sat },
    { suffix: '300', l: 72, s: sat },
    { suffix: '400', l: 60, s: sat + 5 },
    { suffix: '500', l: 50, s: sat + 5 },
    { suffix: '600', l: 42, s: sat },
    { suffix: '700', l: 34, s: sat - 5 },
    { suffix: '800', l: 24, s: sat - 10 },
    { suffix: '900', l: 15, s: sat - 15 },
  ];
  const groupId = `${projectId}-${name}-group`;
  return {
    tokens: steps.map(s => ({
      id: `${projectId}-${name}-${s.suffix}`,
      name: `${name}-${s.suffix}`,
      type: 'color' as const,
      groupId, projectId, pageId,
      themeValues: { [themeId]: { hue, saturation: Math.min(100, Math.max(0, s.s)), lightness: s.l, alpha: 100 } },
      hue, saturation: Math.min(100, Math.max(0, s.s)), lightness: s.l, alpha: 100,
    })),
    group: { id: groupId, name, projectId, isExpanded: true },
  };
}

// ── Helper: create a color node ──
function makeNode(
  projectId: string, pageId: string,
  id: string, hue: number, sat: number, light: number,
  x: number, y: number, parentId: string | null = null,
): ColorNode {
  return {
    id, colorSpace: 'hsl' as const,
    hue, saturation: sat, lightness: light, alpha: 100,
    position: { x, y }, parentId,
    hueOffset: 0, saturationOffset: 0, lightnessOffset: 0, alphaOffset: 0,
    tokenId: null, tokenIds: [], width: 240,
    projectId, pageId,
    lockHue: false, lockSaturation: false, lockLightness: false, lockAlpha: false,
    lockRed: false, lockGreen: false, lockBlue: false,
    diffHue: false, diffSaturation: false, diffLightness: false, diffAlpha: false,
    diffRed: false, diffGreen: false, diffBlue: false,
    isExpanded: false,
  } as ColorNode;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 1: Starter (Grey Palette) — the default sample
// ═══════════════════════════════════════════════════════════════
function createStarterTemplate(): SampleTemplate {
  const pid = 'sample-project';
  const pageId = 'page-1';
  const themeId = 'theme-1';
  const grey = greyScale(pid, pageId, themeId);
  return {
    id: 'starter',
    name: 'Starter — Grey Palette',
    description: 'A simple neutral grey scale to get started.',
    folderColor: 145,
    project: { id: pid, name: 'Sample: Starter', isExpanded: true, isSample: true, folderColor: 145 } as TokenProject,
    nodes: [makeNode(pid, pageId, `${pid}-node-1`, 120, 70, 50, 100, 200)],
    tokens: grey.tokens,
    groups: [grey.group],
    pages: [{ id: pageId, name: 'Page 1', projectId: pid, createdAt: Date.now() }],
    themes: [{ id: themeId, name: 'Light', projectId: pid, createdAt: Date.now(), isPrimary: true }],
    canvasStates: [{ projectId: pid, pageId, pan: { x: 0, y: 0 }, zoom: 1 }],
  };
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 2: Brand Colors — primary + secondary + accent
// ═══════════════════════════════════════════════════════════════
function createBrandTemplate(): SampleTemplate {
  const pid = 'sample-project';
  const pageId = 'page-1';
  const themeId = 'theme-1';
  const primary = colorScale(pid, pageId, themeId, 220, 'primary', 75);
  const secondary = colorScale(pid, pageId, themeId, 160, 'secondary', 60);
  const accent = colorScale(pid, pageId, themeId, 340, 'accent', 80);
  const grey = greyScale(pid, pageId, themeId);
  return {
    id: 'brand',
    name: 'Brand Kit',
    description: 'Primary, secondary, and accent scales with neutral grey.',
    folderColor: 220,
    project: { id: pid, name: 'Sample: Brand Kit', isExpanded: true, isSample: true, folderColor: 220 } as TokenProject,
    nodes: [
      makeNode(pid, pageId, `${pid}-node-primary`, 220, 75, 50, 100, 150),
      makeNode(pid, pageId, `${pid}-node-secondary`, 160, 60, 50, 400, 150),
      makeNode(pid, pageId, `${pid}-node-accent`, 340, 80, 50, 700, 150),
    ],
    tokens: [...primary.tokens, ...secondary.tokens, ...accent.tokens, ...grey.tokens],
    groups: [primary.group, secondary.group, accent.group, grey.group],
    pages: [{ id: pageId, name: 'Page 1', projectId: pid, createdAt: Date.now() }],
    themes: [{ id: themeId, name: 'Light', projectId: pid, createdAt: Date.now(), isPrimary: true }],
    canvasStates: [{ projectId: pid, pageId, pan: { x: 0, y: 0 }, zoom: 1 }],
  };
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 3: Material-style palette
// ═══════════════════════════════════════════════════════════════
function createMaterialTemplate(): SampleTemplate {
  const pid = 'sample-project';
  const pageId = 'page-1';
  const themeId = 'theme-1';
  const red = colorScale(pid, pageId, themeId, 0, 'red', 85);
  const blue = colorScale(pid, pageId, themeId, 210, 'blue', 90);
  const green = colorScale(pid, pageId, themeId, 120, 'green', 65);
  const amber = colorScale(pid, pageId, themeId, 45, 'amber', 95);
  const grey = greyScale(pid, pageId, themeId);
  return {
    id: 'material',
    name: 'Material Palette',
    description: 'Google Material-inspired scales: red, blue, green, amber, grey.',
    folderColor: 210,
    project: { id: pid, name: 'Sample: Material', isExpanded: true, isSample: true, folderColor: 210 } as TokenProject,
    nodes: [
      makeNode(pid, pageId, `${pid}-node-red`, 0, 85, 50, 100, 150),
      makeNode(pid, pageId, `${pid}-node-blue`, 210, 90, 50, 400, 150),
      makeNode(pid, pageId, `${pid}-node-green`, 120, 65, 50, 700, 150),
      makeNode(pid, pageId, `${pid}-node-amber`, 45, 95, 58, 1000, 150),
    ],
    tokens: [...red.tokens, ...blue.tokens, ...green.tokens, ...amber.tokens, ...grey.tokens],
    groups: [red.group, blue.group, green.group, amber.group, grey.group],
    pages: [{ id: pageId, name: 'Page 1', projectId: pid, createdAt: Date.now() }],
    themes: [{ id: themeId, name: 'Light', projectId: pid, createdAt: Date.now(), isPrimary: true }],
    canvasStates: [{ projectId: pid, pageId, pan: { x: 0, y: 0 }, zoom: 1 }],
  };
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 4: Warm Earth Tones
// ═══════════════════════════════════════════════════════════════
function createEarthTemplate(): SampleTemplate {
  const pid = 'sample-project';
  const pageId = 'page-1';
  const themeId = 'theme-1';
  const terracotta = colorScale(pid, pageId, themeId, 15, 'terracotta', 55);
  const sand = colorScale(pid, pageId, themeId, 38, 'sand', 45);
  const olive = colorScale(pid, pageId, themeId, 80, 'olive', 35);
  const grey = greyScale(pid, pageId, themeId);
  return {
    id: 'earth',
    name: 'Earth Tones',
    description: 'Warm, natural palette: terracotta, sand, and olive.',
    folderColor: 25,
    project: { id: pid, name: 'Sample: Earth Tones', isExpanded: true, isSample: true, folderColor: 25 } as TokenProject,
    nodes: [
      makeNode(pid, pageId, `${pid}-node-terra`, 15, 55, 50, 100, 150),
      makeNode(pid, pageId, `${pid}-node-sand`, 38, 45, 60, 400, 150),
      makeNode(pid, pageId, `${pid}-node-olive`, 80, 35, 40, 700, 150),
    ],
    tokens: [...terracotta.tokens, ...sand.tokens, ...olive.tokens, ...grey.tokens],
    groups: [terracotta.group, sand.group, olive.group, grey.group],
    pages: [{ id: pageId, name: 'Page 1', projectId: pid, createdAt: Date.now() }],
    themes: [{ id: themeId, name: 'Light', projectId: pid, createdAt: Date.now(), isPrimary: true }],
    canvasStates: [{ projectId: pid, pageId, pan: { x: 0, y: 0 }, zoom: 1 }],
  };
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 5: Ocean Breeze — cool blues and teals
// ═══════════════════════════════════════════════════════════════
function createOceanTemplate(): SampleTemplate {
  const pid = 'sample-project';
  const pageId = 'page-1';
  const themeId = 'theme-1';
  const ocean = colorScale(pid, pageId, themeId, 200, 'ocean', 70);
  const teal = colorScale(pid, pageId, themeId, 175, 'teal', 60);
  const sky = colorScale(pid, pageId, themeId, 195, 'sky', 80);
  const grey = greyScale(pid, pageId, themeId);
  return {
    id: 'ocean',
    name: 'Ocean Breeze',
    description: 'Cool and calming: ocean, teal, and sky blue scales.',
    folderColor: 195,
    project: { id: pid, name: 'Sample: Ocean Breeze', isExpanded: true, isSample: true, folderColor: 195 } as TokenProject,
    nodes: [
      makeNode(pid, pageId, `${pid}-node-ocean`, 200, 70, 48, 100, 150),
      makeNode(pid, pageId, `${pid}-node-teal`, 175, 60, 45, 400, 150),
      makeNode(pid, pageId, `${pid}-node-sky`, 195, 80, 55, 700, 150),
    ],
    tokens: [...ocean.tokens, ...teal.tokens, ...sky.tokens, ...grey.tokens],
    groups: [ocean.group, teal.group, sky.group, grey.group],
    pages: [{ id: pageId, name: 'Page 1', projectId: pid, createdAt: Date.now() }],
    themes: [{ id: themeId, name: 'Light', projectId: pid, createdAt: Date.now(), isPrimary: true }],
    canvasStates: [{ projectId: pid, pageId, pan: { x: 0, y: 0 }, zoom: 1 }],
  };
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 6: Dark Mode — light/dark theme pair
// ═══════════════════════════════════════════════════════════════
function createDarkModeTemplate(): SampleTemplate {
  const pid = 'sample-project';
  const pageId = 'page-1';
  const lightTheme = 'theme-1';
  const darkTheme = `${pid}-theme-dark`;
  const primary = colorScale(pid, pageId, lightTheme, 230, 'primary', 80);
  // Add dark-theme values to tokens
  primary.tokens = primary.tokens.map(t => ({
    ...t,
    themeValues: {
      ...t.themeValues,
      [darkTheme]: { hue: 230, saturation: Math.max(0, (t.themeValues[lightTheme]?.saturation ?? 80) - 10), lightness: Math.min(100, 100 - (t.themeValues[lightTheme]?.lightness ?? 50)), alpha: 100 },
    },
  }));
  const neutral = greyScale(pid, pageId, lightTheme);
  neutral.tokens = neutral.tokens.map(t => ({
    ...t,
    themeValues: {
      ...t.themeValues,
      [darkTheme]: { hue: 0, saturation: 0, lightness: Math.min(100, 100 - (t.themeValues[lightTheme]?.lightness ?? 50)), alpha: 100 },
    },
  }));
  return {
    id: 'darkmode',
    name: 'Light + Dark Mode',
    description: 'Primary scale with automatic light and dark theme variants.',
    folderColor: 265,
    project: { id: pid, name: 'Sample: Dark Mode', isExpanded: true, isSample: true, folderColor: 265 } as TokenProject,
    nodes: [
      makeNode(pid, pageId, `${pid}-node-pri`, 230, 80, 50, 100, 150),
      makeNode(pid, pageId, `${pid}-node-neut`, 0, 0, 50, 400, 150),
    ],
    tokens: [...primary.tokens, ...neutral.tokens],
    groups: [primary.group, neutral.group],
    pages: [{ id: pageId, name: 'Page 1', projectId: pid, createdAt: Date.now() }],
    themes: [
      { id: lightTheme, name: 'Light', projectId: pid, createdAt: Date.now(), isPrimary: true },
      { id: darkTheme, name: 'Dark', projectId: pid, createdAt: Date.now() - 1, isPrimary: false },
    ],
    canvasStates: [{ projectId: pid, pageId, pan: { x: 0, y: 0 }, zoom: 1 }],
  };
}

// ═══════════════════════════════════════════════════════════════
// Export all built-in templates
// ═══════════════════════════════════════════════════════════════
export function getBuiltInTemplates(): SampleTemplate[] {
  return [
    createStarterTemplate(),
    createBrandTemplate(),
    createMaterialTemplate(),
    createEarthTemplate(),
    createOceanTemplate(),
    createDarkModeTemplate(),
  ];
}

/** Get a single template by ID */
export function getTemplateById(id: string): SampleTemplate | undefined {
  return getBuiltInTemplates().find(t => t.id === id);
}
