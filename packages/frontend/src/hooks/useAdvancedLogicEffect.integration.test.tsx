import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/hct-utils', () => ({
  rgbToHct: (r: number, g: number, b: number) => ({ h: (r + g + b) % 360, c: ((r + g + b) % 120), t: ((r + g + b) % 100) }),
  hctToRgb: (h: number, c: number, t: number) => ({ r: Math.round(h) % 255, g: Math.round(c * 2) % 255, b: Math.round(t * 2.55) % 255 }),
  hctToHex: () => '#000000',
}));
import { useAdvancedLogicEffect } from './useAdvancedLogicEffect';
import { useStore } from '../store';
import {
  channelLogic,
  createCanvasState,
  createColorNode,
  createDesignToken,
  createNodeAdvancedLogic,
  createPage,
  createProject,
  createTheme,
  literal,
  operator,
  parentRef,
  row,
} from '../test/advanced-logic-test-helpers';

function Harness() {
  useAdvancedLogicEffect();
  return null;
}

afterEach(() => {
  cleanup();
});

describe('useAdvancedLogicEffect integration', () => {
  it('recomputes dependent nodes and updates assigned tokens', async () => {
    const snapshot = useStore.getState();
    const theme = createTheme({ id: 'theme-1', isPrimary: true });
    const parent = createColorNode({
      id: 'node-parent',
      hue: 40,
      saturation: 70,
      lightness: 50,
      referenceName: 'Parent',
    });
    const child = createColorNode({
      id: 'node-child',
      parentId: parent.id,
      hue: 10,
      saturation: 60,
      lightness: 45,
      tokenAssignments: { [theme.id]: ['token-child'] },
      referenceName: 'Child',
    });
    const token = createDesignToken({
      id: 'token-child',
      name: 'Child Token',
      themeValues: {
        [theme.id]: { hue: 10, saturation: 60, lightness: 45, alpha: 100 },
      },
    });

    useStore.setState({
      ...snapshot,
      allNodes: [parent, child],
      tokens: [token],
      groups: [],
      projects: [createProject()],
      pages: [createPage()],
      themes: [theme],
      canvasStates: [createCanvasState()],
      advancedLogic: [
        createNodeAdvancedLogic({
          nodeId: child.id,
          channels: {
            hue: channelLogic([row([...parentRef('hue'), operator('+'), literal(20)], 'out_1')]),
          },
          baseValues: { hue: 10 },
        }),
      ],
      activeProjectId: 'project-1',
      activePageId: 'page-1',
      activeThemeId: theme.id,
    });

    try {
      render(<Harness />);

      await waitFor(() => {
        expect(useStore.getState().allNodes.find((node) => node.id === child.id)?.hue).toBe(60);
      });

      await waitFor(() => {
        expect(useStore.getState().tokens.find((item) => item.id === token.id)?.themeValues?.[theme.id]?.hue).toBe(60);
      });
    } finally {
      useStore.setState(snapshot);
    }
  });
});
