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

  it('recomputes two sibling nodes independently from the same parent', async () => {
    const snapshot = useStore.getState();
    const theme = createTheme({ id: 'theme-1', isPrimary: true });
    const parent = createColorNode({
      id: 'node-par',
      hue: 100,
      saturation: 80,
      lightness: 50,
      referenceName: 'Parent',
    });
    const childA = createColorNode({
      id: 'node-ch-a',
      parentId: parent.id,
      hue: 10,
      saturation: 40,
      lightness: 40,
      referenceName: 'ChildA',
    });
    const childB = createColorNode({
      id: 'node-ch-b',
      parentId: parent.id,
      hue: 20,
      saturation: 50,
      lightness: 45,
      referenceName: 'ChildB',
    });

    useStore.setState({
      ...snapshot,
      allNodes: [parent, childA, childB],
      tokens: [],
      groups: [],
      projects: [createProject()],
      pages: [createPage()],
      themes: [theme],
      canvasStates: [createCanvasState()],
      advancedLogic: [
        createNodeAdvancedLogic({
          nodeId: childA.id,
          channels: {
            hue: channelLogic([row([...parentRef('hue'), operator('+'), literal(10)], 'out_1')]),
          },
          baseValues: { hue: 10 },
        }),
        createNodeAdvancedLogic({
          nodeId: childB.id,
          channels: {
            hue: channelLogic([row([...parentRef('hue'), operator('+'), literal(50)], 'out_1')]),
          },
          baseValues: { hue: 20 },
        }),
      ],
      activeProjectId: 'project-1',
      activePageId: 'page-1',
      activeThemeId: theme.id,
    });

    try {
      render(<Harness />);

      // ChildA: parent.hue(100) + 10 = 110
      await waitFor(() => {
        expect(useStore.getState().allNodes.find((n) => n.id === childA.id)?.hue).toBe(110);
      });

      // ChildB: parent.hue(100) + 50 = 150
      await waitFor(() => {
        expect(useStore.getState().allNodes.find((n) => n.id === childB.id)?.hue).toBe(150);
      });
    } finally {
      useStore.setState(snapshot);
    }
  });

  it('applies saturation logic alongside hue logic on the same node', async () => {
    const snapshot = useStore.getState();
    const theme = createTheme({ id: 'theme-1', isPrimary: true });
    const parent = createColorNode({
      id: 'node-par2',
      hue: 200,
      saturation: 80,
      lightness: 50,
      referenceName: 'ParentNode',
    });
    const child = createColorNode({
      id: 'node-ch2',
      parentId: parent.id,
      hue: 10,
      saturation: 30,
      lightness: 45,
      referenceName: 'ChildNode',
    });

    useStore.setState({
      ...snapshot,
      allNodes: [parent, child],
      tokens: [],
      groups: [],
      projects: [createProject()],
      pages: [createPage()],
      themes: [theme],
      canvasStates: [createCanvasState()],
      advancedLogic: [
        createNodeAdvancedLogic({
          nodeId: child.id,
          channels: {
            hue: channelLogic([row([literal(180)], 'out_1')]),
            saturation: channelLogic([row([literal(65)], 'out_1')]),
          },
          baseValues: { hue: 10, saturation: 30 },
        }),
      ],
      activeProjectId: 'project-1',
      activePageId: 'page-1',
      activeThemeId: theme.id,
    });

    try {
      render(<Harness />);

      await waitFor(() => {
        const node = useStore.getState().allNodes.find((n) => n.id === child.id);
        expect(node?.hue).toBe(180);
        expect(node?.saturation).toBe(65);
      });
    } finally {
      useStore.setState(snapshot);
    }
  });

  it('uses literal value ignoring parent when logic has no parent reference', async () => {
    const snapshot = useStore.getState();
    const theme = createTheme({ id: 'theme-1', isPrimary: true });
    const parent = createColorNode({
      id: 'node-lit-par',
      hue: 300,
      saturation: 90,
      lightness: 60,
      referenceName: 'LitParent',
    });
    const child = createColorNode({
      id: 'node-lit-ch',
      parentId: parent.id,
      hue: 5,
      saturation: 20,
      lightness: 30,
      referenceName: 'LitChild',
    });

    useStore.setState({
      ...snapshot,
      allNodes: [parent, child],
      tokens: [],
      groups: [],
      projects: [createProject()],
      pages: [createPage()],
      themes: [theme],
      canvasStates: [createCanvasState()],
      advancedLogic: [
        createNodeAdvancedLogic({
          nodeId: child.id,
          channels: {
            hue: channelLogic([row([literal(42)], 'out_1')]),
          },
          baseValues: { hue: 5 },
        }),
      ],
      activeProjectId: 'project-1',
      activePageId: 'page-1',
      activeThemeId: theme.id,
    });

    try {
      render(<Harness />);

      await waitFor(() => {
        expect(useStore.getState().allNodes.find((n) => n.id === child.id)?.hue).toBe(42);
      });
    } finally {
      useStore.setState(snapshot);
    }
  });
});
