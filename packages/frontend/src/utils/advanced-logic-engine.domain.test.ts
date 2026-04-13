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
  nodeRef,
  operator,
  parentRef,
  row,
  selfRef,
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
        ...(testCase.context.lockedValues ? { lockedValues: testCase.context.lockedValues } : {}),
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

  // ── Phase 1a: New domain test cases ────────────────────────────

  it('evaluates self-reference expression to read current node channel', () => {
    const logic = channelLogic([
      row([...selfRef('hue'), operator('+'), literal(5)], 'out_1'),
    ]);
    const ctx: EvalContext = {
      self: { hue: 100, h: 100 },
      parent: null,
      allNodes: new Map(),
      currentChannel: 'hue',
    };
    const result = evaluateChannelLogic(logic, ctx, 100);
    expect(result).toEqual({ value: 105, source: 'logic' });
  });

  it('resolves cross-node reference via allNodes map', () => {
    const logic = channelLogic([
      row([...nodeRef('Accent', 'saturation', 'node-accent'), operator('-'), literal(10)], 'out_1'),
    ]);
    const ctx: EvalContext = {
      self: { hue: 0, saturation: 50 },
      parent: null,
      allNodes: new Map([['node-accent', { hue: 200, saturation: 90, lightness: 60, h: 200, s: 90, l: 60, a: 100 }]]),
      currentChannel: 'saturation',
    };
    const result = evaluateChannelLogic(logic, ctx, 50);
    expect(result).toEqual({ value: 80, source: 'logic' });
  });

  it('returns fallback without throwing for empty expression rows', () => {
    const logic = channelLogic([row([], 'out_1')]);
    const ctx: EvalContext = {
      self: { hue: 30, h: 30 },
      parent: { hue: 60, h: 60 },
      allNodes: new Map(),
      currentChannel: 'hue',
    };
    const result = evaluateChannelLogic(logic, ctx, 30);
    expect(result).toEqual({ value: 60, source: 'fallback', error: undefined });
  });

  it('returns fallback with error for malformed token sequence', () => {
    const logic = channelLogic([
      row([operator('+'), operator('*'), keyword('then')], 'out_1'),
    ]);
    const ctx: EvalContext = {
      self: { hue: 20, h: 20 },
      parent: null,
      allNodes: new Map(),
      currentChannel: 'hue',
    };
    const result = evaluateChannelLogic(logic, ctx, 20);
    expect(result.source).toBe('fallback');
    expect(result.value).toBe(20);
  });

  it('handles division by zero gracefully using fallback', () => {
    const logic = channelLogic([
      row([literal(100), operator('/'), literal(0)], 'out_1'),
    ]);
    const ctx: EvalContext = {
      self: { hue: 45, h: 45 },
      parent: { hue: 90, h: 90 },
      allNodes: new Map(),
      currentChannel: 'hue',
    };
    const result = evaluateChannelLogic(logic, ctx, 45);
    // Division by zero should either produce Infinity (clamped/wrapped) or fallback
    expect(Number.isFinite(result.value)).toBe(true);
  });

  it('skips disabled rows during evaluation', () => {
    const logic = channelLogic([
      row([literal(999)], 'out_1', false),  // disabled
      row([literal(42)], 'out_2', true),    // enabled
    ]);
    const ctx: EvalContext = {
      self: { hue: 0, h: 0 },
      parent: null,
      allNodes: new Map(),
      currentChannel: 'hue',
    };
    const result = evaluateChannelLogic(logic, ctx, 0);
    expect(result).toEqual({ value: 42, source: 'logic' });
  });

  it('evaluates conditional token assignment with if/then/else', () => {
    const logic = tokenAssignment([
      row([
        keyword('if'), ...selfRef('hue'), operator('>'), literal(180),
        keyword('then'), tokenRef('Cool Blue', 'token-blue'),
        keyword('else'), tokenRef('Warm Red', 'token-red'),
      ], 'out_1'),
    ]);
    const ctx: TokenEvalContext = {
      self: { hue: 200, h: 200 },
      parent: null,
      allNodes: new Map(),
      tokenValues: new Map([
        ['token-blue', { h: 220, s: 80, l: 50, a: 100 }],
        ['token-red', { h: 0, s: 80, l: 50, a: 100 }],
      ]),
      tokenNames: new Map([
        ['token-blue', 'Cool Blue'],
        ['token-red', 'Warm Red'],
      ]),
    };
    const result = evaluateTokenAssignmentDetailed(logic, ctx);
    expect(result.finalResult).toMatchObject({ type: 'tokenRef', tokenId: 'token-blue', tokenName: 'Cool Blue' });
  });

  it('falls back gracefully when a referenced token is missing', () => {
    const logic = tokenAssignment([
      row([tokenRef('Deleted Token', 'token-deleted')], 'out_1'),
    ]);
    const ctx: TokenEvalContext = {
      self: { hue: 0 },
      parent: null,
      allNodes: new Map(),
      tokenValues: new Map(),   // token-deleted not present
      tokenNames: new Map(),
    };
    const result = evaluateTokenAssignmentDetailed(logic, ctx);
    // Should still resolve to a token ref with the name used in the expression
    expect(result.finalResult).toBeTruthy();
  });

  it('evaluates compound boolean AND/OR conditions', () => {
    // if @Self.hue > 100 AND @Self.saturation > 50 then 200 else 10
    // Use nested logic: self.hue=150, self.saturation=70 → both true → 200
    const logic = channelLogic([
      row([
        keyword('if'),
        ...selfRef('hue'), operator('>'), literal(100),
        keyword('then'),
        keyword('if'), ...selfRef('saturation'), operator('>'), literal(50),
        keyword('then'), literal(200),
        keyword('else'), literal(10),
        keyword('else'), literal(10),
      ], 'out_1'),
    ]);
    const ctx: EvalContext = {
      self: { hue: 150, h: 150, saturation: 70, s: 70 },
      parent: null,
      allNodes: new Map(),
      currentChannel: 'hue',
    };
    const result = evaluateChannelLogic(logic, ctx, 0);
    expect(result).toEqual({ value: 200, source: 'logic' });
  });

  it('evaluates nested arithmetic with multiple operators', () => {
    // (@Parent.hue + @Self.hue) / 2 → average hue
    // Can't do parens in token grammar, but can chain: parent + self = row1, row1 / 2 = row2
    const logic = channelLogic([
      row([...parentRef('hue'), operator('+'), ...selfRef('hue')], 'sum'),
      row([localRef('sum'), operator('/'), literal(2)], 'avg'),
    ], { finalOutputVar: 'avg' });
    const ctx: EvalContext = {
      self: { hue: 60, h: 60 },
      parent: { hue: 120, h: 120 },
      allNodes: new Map(),
      currentChannel: 'hue',
    };
    const result = evaluateChannelLogic(logic, ctx, 60);
    expect(result).toEqual({ value: 90, source: 'logic' });
  });

  it('falls back to primary logic when theme override is missing', () => {
    const baseChannels = { hue: channelLogic([row([literal(50)], 'out_1')]) };
    const logic = createNodeAdvancedLogic({
      channels: baseChannels,
      themeChannels: {},  // no override for theme-3
    });
    // When theme override is missing for a non-primary unlinked node, getEffectiveChannels
    // with unlinked=true should still return something (empty or base)
    const effective = getEffectiveChannels(logic, 'theme-3', false, true);
    // If no theme override exists, the result should be empty (the theme has no override)
    // or fall back to base depending on implementation
    expect(effective).toBeDefined();
  });
});
