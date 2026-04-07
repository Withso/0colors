import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./hct-utils', () => ({
  rgbToHct: (r: number, g: number, b: number) => ({ h: (r + g + b) % 360, c: ((r + g + b) % 120), t: ((r + g + b) % 100) }),
  hctToRgb: (h: number, c: number, t: number) => ({ r: Math.round(h) % 255, g: Math.round(c * 2) % 255, b: Math.round(t * 2.55) % 255 }),
  hctToHex: () => '#000000',
}));
import {
  buildTokenEvalContextFromData,
  constrainChannelValue,
  evaluateAllTokenAssignments,
  evaluateChannelLogic,
  evaluateTokenAssignmentDetailed,
  getEffectiveBaseValues,
  getEffectiveChannels,
  getEffectiveTokenAssignment,
  parseTokensToAST,
} from './advanced-logic-engine';
import type { EvalContext, TokenEvalContext } from './advanced-logic-engine';
import {
  booleanToken,
  channelLogic,
  createColorNode,
  createDesignToken,
  createNodeAdvancedLogic,
  keyword,
  literal,
  localRef,
  operator,
  parentRef,
  row,
  tokenAssignment,
  tokenRef,
} from '../test/advanced-logic-test-helpers';

const fixturePath = path.resolve(process.cwd(), 'QA-automation/fixtures/advanced-logic/golden-cases.json');
const goldenFixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
  channelCases: Array<{
    name: string;
    channelKey: string;
    baseValue: number;
    context: { self: Record<string, number>; parent: Record<string, number> | null; allNodes: Array<[string, Record<string, number>]> };
    logic: Parameters<typeof evaluateChannelLogic>[0];
    expected: { value: number; source: 'logic' | 'fallback' };
  }>;
  tokenCases: Array<{
    name: string;
    logic: Parameters<typeof evaluateTokenAssignmentDetailed>[0];
    context: {
      self: Record<string, number>;
      parent: Record<string, number> | null;
      allNodes: Array<[string, Record<string, number>]>;
      tokenValues: Array<[string, { h: number; s: number; l: number; a: number }]>;
      tokenNames: Array<[string, string]>;
    };
    expected: { type: string; tokenId: string; tokenName: string };
  }>;
};

describe('advanced logic domain', () => {
  it('parses conditional expressions with local references', () => {
    const ast = parseTokensToAST([
      keyword('if'),
      ...parentRef('hue'),
      operator('>'),
      literal(100),
      keyword('then'),
      localRef('out_1'),
      keyword('else'),
      literal(0),
    ]);

    expect(ast).not.toBeNull();
    expect(ast?.type).toBe('Conditional');
  });

  it('chains local outputs and honors final output selection', () => {
    const logic = channelLogic(
      [
        row([literal(10)], 'seed'),
        row([localRef('seed'), operator('+'), literal(25)], 'shifted'),
      ],
      { finalOutputVar: 'seed' },
    );
    const ctx: EvalContext = {
      self: { hue: 0, h: 0 },
      parent: null,
      allNodes: new Map(),
      currentChannel: 'hue',
    };

    const result = evaluateChannelLogic(logic, ctx, 0);
    expect(result).toEqual({ value: 10, source: 'logic' });
  });

  it('falls back when a false conditional has no else branch', () => {
    const logic = channelLogic([
      row([keyword('if'), booleanToken(false), keyword('then'), literal(90)], 'out_1'),
    ]);
    const ctx: EvalContext = {
      self: { hue: 20, h: 20 },
      parent: { hue: 40, h: 40 },
      allNodes: new Map(),
      currentChannel: 'hue',
    };

    const result = evaluateChannelLogic(logic, ctx, 20);
    expect(result).toEqual({ value: 40, source: 'fallback', error: undefined });
  });

  it('uses locked values instead of mutable self state when requested', () => {
    const logic = channelLogic([
      row([keyword('locked'), operator('+'), literal(15)], 'out_1'),
    ]);
    const ctx: EvalContext = {
      self: { hue: 90, h: 90 },
      parent: null,
      allNodes: new Map(),
      currentChannel: 'hue',
      lockedValues: { hue: 25, h: 25 },
    };

    const result = evaluateChannelLogic(logic, ctx, 25);
    expect(result).toEqual({ value: 40, source: 'logic' });
  });

  it('wraps hue and clamps saturation', () => {
    expect(constrainChannelValue('hue', 390)).toMatchObject({ constrained: 30, mode: 'wrap', wasConstrained: true });
    expect(constrainChannelValue('saturation', 140)).toMatchObject({
      constrained: 100,
      mode: 'clamp',
      wasConstrained: true,
    });
  });

  it('resolves theme-effective logic only when the node is unlinked', () => {
    const baseChannels = { hue: channelLogic([row([literal(10)], 'out_1')]) };
    const themeChannels = { 'theme-2': { hue: channelLogic([row([literal(20)], 'out_1')]) } };
    const baseAssignment = tokenAssignment([row([tokenRef('Base Token', 'token-base')], 'out_1')]);
    const themeAssignment = { 'theme-2': tokenAssignment([row([tokenRef('Theme Token', 'token-theme')], 'out_1')]) };
    const logic = createNodeAdvancedLogic({
      channels: baseChannels,
      tokenAssignment: baseAssignment,
      baseValues: { hue: 11 },
      themeChannels,
      themeTokenAssignment: themeAssignment,
      themeBaseValues: { 'theme-2': { hue: 22 } },
    });

    expect(getEffectiveChannels(logic, 'theme-2', false, false)).toBe(baseChannels);
    expect(getEffectiveChannels(logic, 'theme-2', false, true)).toEqual(themeChannels['theme-2']);
    expect(getEffectiveTokenAssignment(logic, 'theme-2', false, true)).toEqual(themeAssignment['theme-2']);
    expect(getEffectiveBaseValues(logic, 'theme-2', false, true)).toEqual({ hue: 22 });
  });

  it('keeps golden advanced-logic fixtures stable', () => {
    for (const testCase of goldenFixtures.channelCases) {
      const ctx: EvalContext = {
        self: testCase.context.self,
        parent: testCase.context.parent,
        allNodes: new Map(testCase.context.allNodes),
        currentChannel: testCase.channelKey,
      };
      expect(evaluateChannelLogic(testCase.logic, ctx, testCase.baseValue)).toEqual(testCase.expected);
    }

    for (const testCase of goldenFixtures.tokenCases) {
      const ctx: TokenEvalContext = {
        self: testCase.context.self,
        parent: testCase.context.parent,
        allNodes: new Map(testCase.context.allNodes),
        tokenValues: new Map(testCase.context.tokenValues),
        tokenNames: new Map(testCase.context.tokenNames),
      };
      const result = evaluateTokenAssignmentDetailed(testCase.logic, ctx);
      expect(result.finalResult).toMatchObject(testCase.expected);
    }
  });

  it('evaluates token assignments for export through token nodes', () => {
    const primaryTheme = 'theme-1';
    const paletteToken = createDesignToken({
      id: 'palette-blue-40',
      name: 'Brand Blue',
      themeValues: {
        [primaryTheme]: { hue: 210, saturation: 80, lightness: 50, alpha: 100 },
      },
    });
    const semanticToken = createDesignToken({
      id: 'semantic-primary',
      name: 'sys/primary',
      themeValues: {
        [primaryTheme]: { hue: 210, saturation: 80, lightness: 50, alpha: 100 },
      },
    });
    const tokenNode = createColorNode({
      id: 'node-token',
      isTokenNode: true,
      ownTokenId: semanticToken.id,
      valueTokenId: paletteToken.id,
      valueTokenAssignments: { [primaryTheme]: paletteToken.id },
      tokenNodeSuffix: 'primary',
      referenceName: 'sys',
    });
    const results = evaluateAllTokenAssignments(
      [
        createNodeAdvancedLogic({
          nodeId: tokenNode.id,
          tokenAssignment: tokenAssignment([row([tokenRef('Brand Blue')], 'out_1')]),
        }),
      ],
      [paletteToken, semanticToken],
      [tokenNode],
      primaryTheme,
      primaryTheme,
    );

    expect(results.get(semanticToken.id)?.result).toMatchObject({
      type: 'tokenRef',
      tokenId: paletteToken.id,
      tokenName: 'Brand Blue',
    });
  });

  it('builds token evaluation context with resolved value-token chains', () => {
    const themeId = 'theme-1';
    const paletteToken = createDesignToken({
      id: 'palette-red-50',
      name: 'Palette Red 50',
      themeValues: {
        [themeId]: { hue: 0, saturation: 80, lightness: 60, alpha: 100 },
      },
    });
    const tokenNode = createColorNode({
      id: 'token-node',
      isTokenNode: true,
      ownTokenId: 'semantic-alert',
      valueTokenAssignments: { [themeId]: paletteToken.id },
      valueTokenId: paletteToken.id,
    });

    const ctx = buildTokenEvalContextFromData([paletteToken], [tokenNode], themeId, themeId, tokenNode.id);
    expect(ctx.tokenValues.get('semantic-alert')).toMatchObject({ h: 0, s: 80, l: 60, a: 100 });
  });
});
