import { describe, expect, it } from 'vitest';
import {
  getVisibleTokens,
  isNodeHiddenInTheme,
  isTokenForcedHiddenByNodes,
  isTokenHiddenInTheme,
  isTokenNodeOwnerHidden,
  toggleVisibilityMap,
} from './visibility';
import { createColorNode, createDesignToken } from '../test/advanced-logic-test-helpers';

describe('visibility domain', () => {
  it('toggles visibility per theme and cleans up empty maps', () => {
    expect(toggleVisibilityMap(undefined, 'theme-1', 'theme-1', true)).toEqual({ 'theme-1': false });
    expect(toggleVisibilityMap({ 'theme-1': false }, 'theme-1', 'theme-1', true)).toBeUndefined();
    expect(toggleVisibilityMap({ 'theme-1': false, 'theme-2': false }, 'theme-1', 'theme-1', true)).toEqual({
      'theme-2': false,
    });
  });

  it('treats palette shades as hidden when their parent palette is hidden in the same theme', () => {
    const parent = createColorNode({
      id: 'palette-parent',
      isPalette: true,
      themeVisibility: { 'theme-2': false },
    });
    const child = createColorNode({
      id: 'palette-child',
      parentId: parent.id,
    });

    expect(isNodeHiddenInTheme(parent, 'theme-1', 'theme-1', [parent, child])).toBe(false);
    expect(isNodeHiddenInTheme(parent, 'theme-2', 'theme-1', [parent, child])).toBe(true);
    expect(isNodeHiddenInTheme(child, 'theme-1', 'theme-1', [parent, child])).toBe(false);
    expect(isNodeHiddenInTheme(child, 'theme-2', 'theme-1', [parent, child])).toBe(true);
  });

  it('treats token visibility as explicit, forced-by-node, and owner-hidden', () => {
    const visibleToken = createDesignToken({ id: 'token-visible', name: 'Visible Token' });
    const forcedHiddenToken = createDesignToken({ id: 'token-forced-hidden', name: 'Forced Hidden Token' });
    const mixedVisibilityToken = createDesignToken({ id: 'token-mixed', name: 'Mixed Visibility Token' });
    const ownedToken = createDesignToken({ id: 'token-owned', name: 'Owned Token' });

    const visibleNode = createColorNode({
      id: 'visible-node',
      tokenIds: [visibleToken.id, mixedVisibilityToken.id],
    });
    const hiddenNode = createColorNode({
      id: 'hidden-node',
      tokenIds: [forcedHiddenToken.id, mixedVisibilityToken.id],
      themeVisibility: { 'theme-1': false },
    });
    const ownerHiddenNode = createColorNode({
      id: 'owner-hidden-node',
      isTokenNode: true,
      isTokenPrefix: false,
      ownTokenId: ownedToken.id,
      themeVisibility: { 'theme-1': false },
    });

    expect(isTokenForcedHiddenByNodes(forcedHiddenToken, [hiddenNode], 'theme-1', 'theme-1')).toBe(true);
    expect(isTokenForcedHiddenByNodes(mixedVisibilityToken, [visibleNode, hiddenNode], 'theme-1', 'theme-1')).toBe(false);
    expect(isTokenHiddenInTheme(forcedHiddenToken, [hiddenNode], 'theme-1', 'theme-1')).toBe(true);
    expect(isTokenNodeOwnerHidden(ownedToken, [ownerHiddenNode], 'theme-1', 'theme-1')).toBe(true);
    expect(isTokenHiddenInTheme(ownedToken, [ownerHiddenNode], 'theme-1', 'theme-1')).toBe(true);
    expect(isTokenHiddenInTheme(visibleToken, [visibleNode], 'theme-1', 'theme-1')).toBe(false);
  });

  it('filters visible tokens without leaking hidden node or owner-hidden tokens', () => {
    const visibleToken = createDesignToken({ id: 'token-visible', name: 'Visible Token' });
    const hiddenToken = createDesignToken({ id: 'token-hidden', name: 'Hidden Token' });
    const mixedVisibilityToken = createDesignToken({ id: 'token-mixed', name: 'Mixed Visibility Token' });
    const ownedToken = createDesignToken({ id: 'token-owned', name: 'Owned Token' });

    const visibleNode = createColorNode({
      id: 'visible-node',
      tokenIds: [visibleToken.id, mixedVisibilityToken.id],
    });
    const hiddenNode = createColorNode({
      id: 'hidden-node',
      tokenIds: [hiddenToken.id, mixedVisibilityToken.id],
      themeVisibility: { 'theme-1': false },
    });
    const ownerHiddenNode = createColorNode({
      id: 'owner-hidden-node',
      isTokenNode: true,
      isTokenPrefix: false,
      ownTokenId: ownedToken.id,
      themeVisibility: { 'theme-1': false },
    });

    expect(
      getVisibleTokens(
        [visibleToken, hiddenToken, mixedVisibilityToken, ownedToken],
        [visibleNode, hiddenNode, ownerHiddenNode],
        'theme-1',
        'theme-1',
      ).map((token) => token.id),
    ).toEqual([visibleToken.id, mixedVisibilityToken.id]);
  });
});
