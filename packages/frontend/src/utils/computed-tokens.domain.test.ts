import { describe, expect, it, vi } from 'vitest';
import { computeAllProjectTokens, computeProjectTokens } from './computed-tokens';
import { createColorNode, createDesignToken, createPage, createProject, createTheme } from '../test/advanced-logic-test-helpers';
import type { TokenGroup } from '../types';

vi.mock('./hct-utils', () => ({
  rgbToHct: (r: number, g: number, b: number) => ({ h: (r + g + b) % 360, c: ((r + g + b) % 120), t: ((r + g + b) % 100) }),
  hctToRgb: (h: number, c: number, t: number) => ({ r: Math.round(h) % 255, g: Math.round(c * 2) % 255, b: Math.round(t * 2.55) % 255 }),
  hctToHex: () => '#000000',
}));

function createTokenNodeGroup(overrides: Partial<TokenGroup> = {}): TokenGroup {
  return {
    id: 'token-node-group',
    name: 'Token Node Group',
    projectId: 'project-1',
    pageId: 'page-1',
    isExpanded: true,
    isTokenNodeGroup: true,
    createdAt: 1,
    ...overrides,
  };
}

describe('computed tokens domain', () => {
  it('computes a visible color token with stable export metadata', () => {
    const project = createProject();
    const page = createPage();
    const theme = createTheme();
    const token = createDesignToken({
      id: 'brand-500',
      name: 'Brand 500',
      projectId: project.id,
      pageId: page.id,
      themeValues: {
        [theme.id]: { hue: 210, saturation: 80, lightness: 50, alpha: 100 },
      },
    });
    const node = createColorNode({
      id: 'brand-node',
      projectId: project.id,
      pageId: page.id,
      colorSpace: 'hsl',
      tokenIds: [token.id],
    });

    const computed = computeProjectTokens(project, [node], [token], [], [page], [theme], []);
    const output = computed.themes[0].tokens[0];

    expect(output).toMatchObject({
      id: token.id,
      name: token.name,
      variableName: 'brand-500',
      pageId: page.id,
      pageName: page.name,
      resolvedValue: 'hsl(210, 80%, 50%)',
      colorSpace: 'hsl',
      isAlias: false,
      figmaPath: 'Page 1/Brand 500',
    });
    expect(output.rawHSL).toEqual({ h: 210, s: 80, l: 50, a: 100 });
    expect(output.hex).toBe('#1980E6');
    expect(output.hexWithAlpha).toBe('#1980E6FF');
    expect(output.rgba).toMatchObject({
      r: 25 / 255,
      g: 128 / 255,
      b: 230 / 255,
      a: 1,
    });
  });

  it('resolves token-node value refs from the active theme and falls back to primary', () => {
    const project = createProject();
    const page = createPage();
    const primaryTheme = createTheme({ id: 'theme-primary', isPrimary: true });
    const secondaryTheme = createTheme({ id: 'theme-secondary', name: 'Secondary', isPrimary: false });
    const valueTokenPrimary = createDesignToken({
      id: 'brand-500',
      name: 'Brand 500',
      projectId: project.id,
      pageId: page.id,
      themeValues: {
        [primaryTheme.id]: { hue: 210, saturation: 80, lightness: 50, alpha: 100 },
        [secondaryTheme.id]: { hue: 210, saturation: 80, lightness: 50, alpha: 100 },
      },
    });
    const valueTokenSecondary = createDesignToken({
      id: 'brand-600',
      name: 'Brand 600',
      projectId: project.id,
      pageId: page.id,
      themeValues: {
        [primaryTheme.id]: { hue: 220, saturation: 75, lightness: 45, alpha: 100 },
        [secondaryTheme.id]: { hue: 220, saturation: 75, lightness: 45, alpha: 100 },
      },
    });
    const group = createTokenNodeGroup({ projectId: project.id, pageId: page.id });
    const themeSpecificSemantic = createDesignToken({
      id: 'semantic-theme',
      name: 'Semantic Theme',
      projectId: project.id,
      pageId: page.id,
      groupId: group.id,
    });
    const fallbackSemantic = createDesignToken({
      id: 'semantic-fallback',
      name: 'Semantic Fallback',
      projectId: project.id,
      pageId: page.id,
      groupId: group.id,
    });
    const visibleValueNode = createColorNode({
      id: 'value-node',
      projectId: project.id,
      pageId: page.id,
      tokenIds: [valueTokenPrimary.id, valueTokenSecondary.id],
    });
    const themeSpecificOwner = createColorNode({
      id: 'theme-owner',
      projectId: project.id,
      pageId: page.id,
      isTokenNode: true,
      isTokenPrefix: false,
      ownTokenId: themeSpecificSemantic.id,
      valueTokenAssignments: {
        [secondaryTheme.id]: valueTokenSecondary.id,
      },
    });
    const fallbackOwner = createColorNode({
      id: 'fallback-owner',
      projectId: project.id,
      pageId: page.id,
      isTokenNode: true,
      isTokenPrefix: false,
      ownTokenId: fallbackSemantic.id,
      valueTokenAssignments: {
        [primaryTheme.id]: valueTokenPrimary.id,
      },
    });

    const computed = computeProjectTokens(
      project,
      [visibleValueNode, themeSpecificOwner, fallbackOwner],
      [valueTokenPrimary, valueTokenSecondary, themeSpecificSemantic, fallbackSemantic],
      [group],
      [page],
      [primaryTheme, secondaryTheme],
      [],
    );

    const secondaryTokens = computed.themes.find((theme) => theme.themeId === secondaryTheme.id)?.tokens ?? [];
    expect(secondaryTokens.find((token) => token.id === themeSpecificSemantic.id)).toMatchObject({
      isAlias: true,
      aliasOfId: valueTokenSecondary.id,
      resolvedValue: 'var(--brand-600)',
    });
    expect(secondaryTokens.find((token) => token.id === fallbackSemantic.id)).toMatchObject({
      isAlias: true,
      aliasOfId: valueTokenPrimary.id,
      resolvedValue: 'var(--brand-500)',
    });
  });

  it('omits hidden palette-shade and token-node owner tokens from the computed outputs', () => {
    const project = createProject();
    const page = createPage();
    const primaryTheme = createTheme({ id: 'theme-primary', isPrimary: true });
    const secondaryTheme = createTheme({ id: 'theme-secondary', name: 'Secondary', isPrimary: false });
    const visibleValue = createDesignToken({
      id: 'visible-value',
      name: 'Visible Value',
      projectId: project.id,
      pageId: page.id,
      themeValues: {
        [primaryTheme.id]: { hue: 0, saturation: 0, lightness: 50, alpha: 100 },
        [secondaryTheme.id]: { hue: 0, saturation: 0, lightness: 50, alpha: 100 },
      },
    });
    const hiddenPaletteValue = createDesignToken({
      id: 'palette-value',
      name: 'Palette Value',
      projectId: project.id,
      pageId: page.id,
      themeValues: {
        [primaryTheme.id]: { hue: 30, saturation: 70, lightness: 55, alpha: 100 },
        [secondaryTheme.id]: { hue: 30, saturation: 70, lightness: 55, alpha: 100 },
      },
    });
    const hiddenTokenNodeToken = createDesignToken({
      id: 'hidden-token-node',
      name: 'Hidden Token Node',
      projectId: project.id,
      pageId: page.id,
      groupId: 'token-node-group',
    });
    const hiddenParent = createColorNode({
      id: 'palette-parent',
      projectId: project.id,
      pageId: page.id,
      isPalette: true,
      themeVisibility: { [secondaryTheme.id]: false },
    });
    const hiddenChild = createColorNode({
      id: 'palette-child',
      projectId: project.id,
      pageId: page.id,
      parentId: hiddenParent.id,
      tokenIds: [hiddenPaletteValue.id],
    });
    const visibleNode = createColorNode({
      id: 'visible-node',
      projectId: project.id,
      pageId: page.id,
      tokenIds: [visibleValue.id],
    });
    const hiddenOwner = createColorNode({
      id: 'hidden-owner',
      projectId: project.id,
      pageId: page.id,
      isTokenNode: true,
      isTokenPrefix: false,
      ownTokenId: hiddenTokenNodeToken.id,
      themeVisibility: { [secondaryTheme.id]: false },
    });
    const group = createTokenNodeGroup({ projectId: project.id, pageId: page.id });

    const computed = computeProjectTokens(
      project,
      [visibleNode, hiddenParent, hiddenChild, hiddenOwner],
      [visibleValue, hiddenPaletteValue, hiddenTokenNodeToken],
      [group],
      [page],
      [primaryTheme, secondaryTheme],
      [],
    );

    const secondaryIds = computed.themes.find((theme) => theme.themeId === secondaryTheme.id)?.tokens.map((token) => token.id) ?? [];
    expect(secondaryIds).toContain(visibleValue.id);
    expect(secondaryIds).not.toContain(hiddenPaletteValue.id);
    expect(secondaryIds).not.toContain(hiddenTokenNodeToken.id);
  });

  it('keeps project-level computations isolated when computing all projects', () => {
    const projectA = createProject({ id: 'project-a', name: 'Project A' });
    const projectB = createProject({ id: 'project-b', name: 'Project B' });
    const pageA = createPage({ id: 'page-a', projectId: projectA.id, name: 'Page A' });
    const pageB = createPage({ id: 'page-b', projectId: projectB.id, name: 'Page B' });
    const themeA = createTheme({ id: 'theme-a', projectId: projectA.id, isPrimary: true });
    const themeB = createTheme({ id: 'theme-b', projectId: projectB.id, isPrimary: true });
    const tokenA = createDesignToken({
      id: 'token-a',
      name: 'Token A',
      projectId: projectA.id,
      pageId: pageA.id,
      themeValues: { [themeA.id]: { hue: 10, saturation: 20, lightness: 30, alpha: 100 } },
    });
    const tokenB = createDesignToken({
      id: 'token-b',
      name: 'Token B',
      projectId: projectB.id,
      pageId: pageB.id,
      themeValues: { [themeB.id]: { hue: 40, saturation: 50, lightness: 60, alpha: 100 } },
    });
    const nodeA = createColorNode({
      id: 'node-a',
      projectId: projectA.id,
      pageId: pageA.id,
      tokenIds: [tokenA.id],
    });
    const nodeB = createColorNode({
      id: 'node-b',
      projectId: projectB.id,
      pageId: pageB.id,
      tokenIds: [tokenB.id],
    });

    const allComputed = computeAllProjectTokens(
      [projectA, projectB],
      [nodeA, nodeB],
      [tokenA, tokenB],
      [],
      [pageA, pageB],
      [themeA, themeB],
      [],
    );

    expect(allComputed[projectA.id].themes[0].tokens.map((token) => token.id)).toEqual([tokenA.id]);
    expect(allComputed[projectB.id].themes[0].tokens.map((token) => token.id)).toEqual([tokenB.id]);
  });
});
