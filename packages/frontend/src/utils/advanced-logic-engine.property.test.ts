import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('./hct-utils', () => ({
  rgbToHct: (r: number, g: number, b: number) => ({ h: (r + g + b) % 360, c: ((r + g + b) % 120), t: ((r + g + b) % 100) }),
  hctToRgb: (h: number, c: number, t: number) => ({ r: Math.round(h) % 255, g: Math.round(c * 2) % 255, b: Math.round(t * 2.55) % 255 }),
  hctToHex: () => '#000000',
}));
import { evaluateChannelLogic, getEffectiveBaseValues, getEffectiveChannels, getEffectiveTokenAssignment } from './advanced-logic-engine';
import type { EvalContext } from './advanced-logic-engine';
import { channelLogic, createNodeAdvancedLogic, literal, operator, parentRef, row, selfRef, tokenAssignment } from '../test/advanced-logic-test-helpers';

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
