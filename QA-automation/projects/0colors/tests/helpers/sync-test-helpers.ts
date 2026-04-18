/**
 * Test factories for creating valid project data structures.
 * Used across unit, domain, and integration tests.
 */

import type {
  ColorNode, DesignToken, TokenProject, TokenGroup,
  Page, Theme, CanvasState, NodeAdvancedLogic,
} from '@frontend/types';

// ── ID generators ──

let _idCounter = 0;
export function testId(prefix = 'test'): string {
  return `${prefix}-${++_idCounter}-${Date.now()}`;
}

export function resetIdCounter() {
  _idCounter = 0;
}

// ── Factory: TokenProject ──

export function makeProject(overrides: Partial<TokenProject> = {}): TokenProject {
  const id = overrides.id ?? testId('proj');
  return {
    id,
    name: `Test Project ${id}`,
    isExpanded: true,
    folderColor: 200,
    ...overrides,
  };
}

// ── Factory: Page ──

export function makePage(projectId: string, overrides: Partial<Page> = {}): Page {
  const id = overrides.id ?? testId('page');
  return {
    id,
    name: `Page ${id}`,
    projectId,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── Factory: Theme ──

export function makeTheme(projectId: string, overrides: Partial<Theme> = {}): Theme {
  const id = overrides.id ?? testId('theme');
  return {
    id,
    name: `Theme ${id}`,
    projectId,
    createdAt: Date.now(),
    isPrimary: false,
    ...overrides,
  };
}

// ── Factory: ColorNode ──

export function makeNode(projectId: string, pageId: string, overrides: Partial<ColorNode> = {}): ColorNode {
  const id = overrides.id ?? testId('node');
  return {
    id,
    colorSpace: 'hsl',
    hue: 200,
    saturation: 70,
    lightness: 50,
    alpha: 100,
    position: { x: 100, y: 100 },
    parentId: null,
    hueOffset: 0,
    saturationOffset: 0,
    lightnessOffset: 0,
    alphaOffset: 0,
    tokenId: null,
    projectId,
    pageId,
    ...overrides,
  };
}

// ── Factory: DesignToken ──

export function makeToken(projectId: string, pageId: string, groupId: string, themeId: string, overrides: Partial<DesignToken> = {}): DesignToken {
  const id = overrides.id ?? testId('token');
  return {
    id,
    name: `token-${id}`,
    type: 'color',
    groupId,
    projectId,
    pageId,
    themeValues: {
      [themeId]: { hue: 200, saturation: 70, lightness: 50, alpha: 100 },
    },
    hue: 200,
    saturation: 70,
    lightness: 50,
    alpha: 100,
    ...overrides,
  };
}

// ── Factory: TokenGroup ──

export function makeGroup(projectId: string, pageId: string, overrides: Partial<TokenGroup> = {}): TokenGroup {
  const id = overrides.id ?? testId('group');
  return {
    id,
    name: `Group ${id}`,
    projectId,
    pageId,
    isExpanded: true,
    ...overrides,
  };
}

// ── Factory: CanvasState ──

export function makeCanvasState(projectId: string, pageId: string, overrides: Partial<CanvasState> = {}): CanvasState {
  return {
    projectId,
    pageId,
    pan: { x: 0, y: 0 },
    zoom: 1,
    ...overrides,
  };
}

// ── Factory: NodeAdvancedLogic ──

export function makeAdvancedLogic(nodeId: string, overrides: Partial<NodeAdvancedLogic> = {}): NodeAdvancedLogic {
  return {
    nodeId,
    channels: {},
    ...overrides,
  };
}

// ── Factory: Full project snapshot ──

export interface TestProjectData {
  project: TokenProject;
  page: Page;
  theme: Theme;
  nodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  pages: Page[];
  themes: Theme[];
  canvasStates: CanvasState[];
  advancedLogic: NodeAdvancedLogic[];
}

export function makeFullProject(projectId?: string): TestProjectData {
  const pid = projectId ?? testId('proj');
  const project = makeProject({ id: pid });
  const page = makePage(pid, { id: `${pid}-page-1`, name: 'Page 1' });
  const theme = makeTheme(pid, { id: `${pid}-theme-1`, name: 'Primary', isPrimary: true });
  const group = makeGroup(pid, page.id, { id: `${pid}-group-1`, name: 'Colors' });
  const node = makeNode(pid, page.id, { id: `${pid}-node-1` });
  const token = makeToken(pid, page.id, group.id, theme.id, { id: `${pid}-token-1`, name: 'primary' });
  const canvasState = makeCanvasState(pid, page.id);

  return {
    project,
    page,
    theme,
    nodes: [node],
    tokens: [token],
    groups: [group],
    pages: [page],
    themes: [theme],
    canvasStates: [canvasState],
    advancedLogic: [],
  };
}
