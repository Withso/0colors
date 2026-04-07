import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/hct-utils', () => ({
  rgbToHct: (r: number, g: number, b: number) => ({ h: (r + g + b) % 360, c: ((r + g + b) % 120), t: ((r + g + b) % 100) }),
  hctToRgb: (h: number, c: number, t: number) => ({ r: Math.round(h) % 255, g: Math.round(c * 2) % 255, b: Math.round(t * 2.55) % 255 }),
  hctToHex: () => '#000000',
}));
import { AdvancedPopup } from './AdvancedPopup';
import {
  channelLogic,
  createColorNode,
  createDesignToken,
  createNodeAdvancedLogic,
  createPage,
  keyword,
  literal,
  row,
  tokenAssignment,
  tokenRef,
} from '../../test/advanced-logic-test-helpers';

describe('AdvancedPopup component selectors', () => {
  it('renders channel column controls with stable test hooks', async () => {
    const node = createColorNode({
      id: 'node-color',
      hue: 25,
      saturation: 50,
      lightness: 40,
      referenceName: 'Seed',
    });
    const advancedLogic = [
      createNodeAdvancedLogic({
        nodeId: node.id,
        channels: {
          hue: channelLogic([row([literal(15)], 'out_1')]),
        },
        baseValues: { hue: 25 },
      }),
    ];

    render(
      <AdvancedPopup
        nodeId={node.id}
        node={node}
        nodes={[node]}
        tokens={[]}
        activeThemeId="theme-1"
        isPrimaryTheme
        primaryThemeId="theme-1"
        advancedLogic={advancedLogic}
        onUpdateAdvancedLogic={vi.fn()}
        onClose={vi.fn()}
        nodeDisplayName="Seed"
        pages={[createPage()]}
      />,
    );

    expect(await screen.findByTestId(`advanced-popup-panel-${node.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('advanced-popup-header')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-channel-column-hue')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-row-hue-0-row')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-row-hue-0-input')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-row-output-hue-0')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-add-condition-hue')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-final-output-select-hue')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-final-output-value-hue')).toHaveTextContent('15');
    expect(screen.getByTestId('advanced-fallback-hue')).toBeInTheDocument();
  });

  it('renders token assignment selectors for token-node advanced logic', async () => {
    const tokenNode = createColorNode({
      id: 'node-token',
      isTokenNode: true,
      ownTokenId: 'semantic-primary',
      valueTokenId: 'palette-blue-40',
      valueTokenAssignments: { 'theme-1': 'palette-blue-40' },
      tokenNodeSuffix: 'primary',
      referenceName: 'sys',
    });
    const paletteToken = createDesignToken({
      id: 'palette-blue-40',
      name: 'Brand Blue',
    });
    const semanticToken = createDesignToken({
      id: 'semantic-primary',
      name: 'sys/primary',
    });
    const logic = tokenAssignment([
      row([keyword('if'), literal(1), keyword('then'), tokenRef('Brand Blue', paletteToken.id)], 'out_1'),
    ]);

    render(
      <AdvancedPopup
        nodeId={tokenNode.id}
        node={tokenNode}
        nodes={[tokenNode]}
        tokens={[paletteToken, semanticToken]}
        activeThemeId="theme-1"
        isPrimaryTheme
        primaryThemeId="theme-1"
        advancedLogic={[
          createNodeAdvancedLogic({
            nodeId: tokenNode.id,
            channels: {},
            tokenAssignment: logic,
          }),
        ]}
        onUpdateAdvancedLogic={vi.fn()}
        onClose={vi.fn()}
        nodeDisplayName="sys/primary"
        pages={[createPage()]}
        allProjectNodes={[tokenNode]}
      />,
    );

    expect(await screen.findByTestId(`advanced-popup-panel-${tokenNode.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('advanced-token-assignment-panel')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-token-row-0-row')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-token-row-0-input')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-token-row-output-0')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-token-add-condition')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-token-final-output-select')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-token-final-output-value')).toHaveTextContent('Brand Blue');
    expect(screen.getByTestId('advanced-token-fallback')).toBeInTheDocument();
  });
});
