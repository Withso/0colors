import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('./hct-utils', () => ({
  rgbToHct: (r: number, g: number, b: number) => ({ h: (r + g + b) % 360, c: ((r + g + b) % 120), t: ((r + g + b) % 100) }),
  hctToRgb: (h: number, c: number, t: number) => ({ r: Math.round(h) % 255, g: Math.round(c * 2) % 255, b: Math.round(t * 2.55) % 255 }),
  hctToHex: () => '#000000',
}));
import { constrainChannelValue, evaluateChannelLogic, getEffectiveBaseValues, getEffectiveChannels, getEffectiveTokenAssignment } from './advanced-logic-engine';
import type { EvalContext } from './advanced-logic-engine';
import { channelLogic, createNodeAdvancedLogic, keyword, literal, localRef, operator, parentRef, row, selfRef, tokenAssignment, tokenRef } from '../test/advanced-logic-test-helpers';

const PROPERTY_SEED = 424242;
const propertyChannels = ['hue', 'saturation', 'lightness', 'alpha'] as const;

function numericExprArb(channelKey: string) {
  return fc.oneof(
    fc.integer({ min: -720, max: 720 }).map((value) => [literal(value)]),
    fc.integer({ min: -180, max: 180 }).map((delta) => [...selfRef(channelKey), operator('+'), literal(delta)]),
    fc.integer({ min: -180, max: 180 }).map((delta) => [...parentRef(channelKey), operator('+'), literal(delta)]),
    fc.record({
      threshold: fc.integer({ min: 0, max: 100 }),
      yesValue: fc.integer({ min: -720, max: 720 }),
      noValue: fc.option(fc.integer({ min: -720, max: 720 }), { nil: undefined }),
    }).map(({ threshold, yesValue, noValue }) => {
      const tokens = [...selfRef(channelKey), operator('>'), literal(threshold)];
      return [
        { type: 'keyword', value: 'if', id: `if-${threshold}` },
        ...tokens,
        { type: 'keyword', value: 'then', id: `then-${yesValue}` },
        literal(yesValue),
        ...(noValue === undefined ? [] : [{ type: 'keyword', value: 'else', id: `else-${noValue}` }, literal(noValue)]),
      ];
    }),
  );
}

function booleanExprArb(channelKey: string) {
  return fc.integer({ min: 0, max: 100 }).map((threshold) => [...selfRef(channelKey), operator('>'), literal(threshold)]);
}

function channelLogicArb(channelKey: string) {
  return fc
    .array(
      fc.record({
        enabled: fc.boolean(),
        kind: fc.constantFrom<'numeric' | 'boolean'>('numeric', 'boolean'),
      }),
      { minLength: 1, maxLength: 4 },
    )
    .chain((rowDefs) =>
      fc
        .tuple(
          ...rowDefs.map((rowDef) => (rowDef.kind === 'numeric' ? numericExprArb(channelKey) : booleanExprArb(channelKey))),
        )
        .map((tokenSets) =>
          channelLogic(
            tokenSets.map((tokens, index) => row(tokens as any, `out_${index + 1}`, rowDefs[index].enabled)),
            { autoConstrain: true },
          ),
        ),
    );
}

describe('advanced logic property suite', () => {
  it('generates valid channel logic without throwing and keeps constrained outputs in range', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...propertyChannels),
        fc.integer({ min: -360, max: 360 }),
        fc.integer({ min: -360, max: 360 }),
        fc.integer({ min: -360, max: 360 }),
        (channelKey, selfValue, parentValue, baseValue) => {
          const logic = fc.sample(channelLogicArb(channelKey), 1, { seed: PROPERTY_SEED + selfValue + parentValue + baseValue })[0];
          const ctx: EvalContext = {
            self: { [channelKey]: selfValue, h: selfValue, s: selfValue, l: selfValue, a: selfValue },
            parent: { [channelKey]: parentValue, h: parentValue, s: parentValue, l: parentValue, a: parentValue },
            allNodes: new Map(),
            currentChannel: channelKey,
            lockedValues: { [channelKey]: baseValue },
          };

          const result = evaluateChannelLogic(logic, ctx, baseValue);
          expect(Number.isFinite(result.value)).toBe(true);
          if (result.source === 'logic') {
            if (channelKey === 'hue') expect(result.value).toBeGreaterThanOrEqual(0);
            if (channelKey === 'hue') expect(result.value).toBeLessThan(360);
            if (channelKey !== 'hue') expect(result.value).toBeGreaterThanOrEqual(0);
            if (channelKey === 'alpha' || channelKey === 'saturation' || channelKey === 'lightness') {
              expect(result.value).toBeLessThanOrEqual(100);
            }
          }
        },
      ),
      { seed: PROPERTY_SEED, numRuns: 40 },
    );
  });

  it('keeps generated checks pinned to a fixed replay seed', () => {
    const samples = fc.sample(channelLogicArb('hue'), 5, { seed: PROPERTY_SEED });
    expect(PROPERTY_SEED).toBe(424242);
    expect(samples).toHaveLength(5);
    expect(samples.every((sample) => Array.isArray(sample.rows) && sample.rows.length > 0)).toBe(true);
  });

  it('generates valid multi-row chaining with local references between rows', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...propertyChannels),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 4 }),
        (channelKey, baseValue, rowCount) => {
          // Build N rows where each subsequent row references the previous local
          const rows = [];
          for (let i = 0; i < rowCount; i++) {
            const outputName = `out_${i + 1}`;
            if (i === 0) {
              rows.push(row([literal(baseValue)], outputName));
            } else {
              const prevOutput = `out_${i}`;
              rows.push(row([localRef(prevOutput), operator('+'), literal(1)], outputName));
            }
          }
          const logic = channelLogic(rows, { autoConstrain: true });
          const ctx: EvalContext = {
            self: { [channelKey]: baseValue },
            parent: null,
            allNodes: new Map(),
            currentChannel: channelKey,
          };
          const result = evaluateChannelLogic(logic, ctx, baseValue);
          expect(Number.isFinite(result.value)).toBe(true);
          expect(result.source).toBe('logic');
        },
      ),
      { seed: PROPERTY_SEED, numRuns: 40 },
    );
  });

  it('generates valid conditional expressions with varied thresholds', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...propertyChannels),
        fc.integer({ min: 0, max: 360 }),
        fc.integer({ min: 0, max: 360 }),
        fc.integer({ min: 0, max: 360 }),
        (channelKey, selfValue, threshold, thenValue) => {
          const logic = channelLogic([
            row([
              keyword('if'), ...selfRef(channelKey), operator('>'), literal(threshold),
              keyword('then'), literal(thenValue),
              keyword('else'), literal(0),
            ], 'out_1'),
          ], { autoConstrain: true });
          const ctx: EvalContext = {
            self: { [channelKey]: selfValue, h: selfValue, s: selfValue, l: selfValue, a: selfValue },
            parent: null,
            allNodes: new Map(),
            currentChannel: channelKey,
          };
          const result = evaluateChannelLogic(logic, ctx, selfValue);
          expect(Number.isFinite(result.value)).toBe(true);
          expect(result.source).toBe('logic');
        },
      ),
      { seed: PROPERTY_SEED, numRuns: 40 },
    );
  });

  it('validates constraint behavior across all color space channels', () => {
    const allChannels: [string, number, number, 'wrap' | 'clamp'][] = [
      ['hue', 0, 360, 'wrap'],
      ['saturation', 0, 100, 'clamp'],
      ['lightness', 0, 100, 'clamp'],
      ['alpha', 0, 100, 'clamp'],
      ['red', 0, 255, 'clamp'],
      ['green', 0, 255, 'clamp'],
      ['blue', 0, 255, 'clamp'],
      ['oklchL', 0, 100, 'clamp'],
      ['oklchC', 0, 100, 'clamp'],
      ['oklchH', 0, 360, 'wrap'],
      ['hctH', 0, 360, 'wrap'],
      ['hctC', 0, 120, 'clamp'],
      ['hctT', 0, 100, 'clamp'],
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...allChannels),
        fc.integer({ min: -720, max: 720 }),
        ([channelKey, min, max, mode], rawValue) => {
          const result = constrainChannelValue(channelKey, rawValue);
          expect(result.constrained).toBeGreaterThanOrEqual(min);
          if (mode === 'wrap') {
            expect(result.constrained).toBeLessThan(max);
          } else {
            expect(result.constrained).toBeLessThanOrEqual(max);
          }
          expect(result.mode).toBe(mode);
        },
      ),
      { seed: PROPERTY_SEED, numRuns: 40 },
    );
  });

  it('generates token assignment logic without throwing', () => {
    const tokenNames = ['Brand Blue', 'Warm Red', 'Cool Green', 'Accent Gold'];
    fc.assert(
      fc.property(
        fc.constantFrom(...tokenNames),
        fc.constantFrom(...tokenNames),
        fc.integer({ min: 0, max: 360 }),
        (thenToken, elseToken, threshold) => {
          const logic = tokenAssignment([
            row([
              keyword('if'), ...selfRef('hue'), operator('>'), literal(threshold),
              keyword('then'), tokenRef(thenToken, `id-${thenToken}`),
              keyword('else'), tokenRef(elseToken, `id-${elseToken}`),
            ], 'out_1'),
          ]);
          // Should not throw
          expect(logic.rows).toHaveLength(1);
          expect(logic.rows[0].tokens.length).toBeGreaterThan(0);
        },
      ),
      { seed: PROPERTY_SEED, numRuns: 40 },
    );
  });

  it('keeps theme resolution deterministic across pairwise primary/unlinked combinations', () => {
    const logic = createNodeAdvancedLogic({
      channels: { hue: channelLogic([row([literal(10)], 'out_1')]) },
      baseValues: { hue: 10 },
      tokenAssignment: tokenAssignment([row([{ id: 'token-base', type: 'tokenRef', value: '{Base}', refTokenId: 'base-token' }], 'out_1')]),
      themeChannels: { 'theme-2': { hue: channelLogic([row([literal(20)], 'out_1')]) } },
      themeBaseValues: { 'theme-2': { hue: 20 } },
      themeTokenAssignment: {
        'theme-2': tokenAssignment([row([{ id: 'token-theme', type: 'tokenRef', value: '{Theme}', refTokenId: 'theme-token' }], 'out_1')]),
      },
    });

    const matrix = [
      { isPrimary: true, unlinked: false, expected: 10, base: 10, token: 'base-token' },
      { isPrimary: false, unlinked: false, expected: 10, base: 10, token: 'base-token' },
      { isPrimary: false, unlinked: true, expected: 20, base: 20, token: 'theme-token' },
    ];

    for (const combo of matrix) {
      expect(getEffectiveChannels(logic, 'theme-2', combo.isPrimary, combo.unlinked).hue.rows[0].tokens[0].value).toBe(
        String(combo.expected),
      );
      expect(getEffectiveBaseValues(logic, 'theme-2', combo.isPrimary, combo.unlinked)?.hue).toBe(combo.base);
      expect(
        (getEffectiveTokenAssignment(logic, 'theme-2', combo.isPrimary, combo.unlinked)?.rows[0].tokens[0] as any).refTokenId,
      ).toBe(combo.token);
    }
  });
});
