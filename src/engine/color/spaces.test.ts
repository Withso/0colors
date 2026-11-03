import { describe, expect, it } from 'vitest';
import {
  ALPHA, SPACES, SPACE_ORDER, channelDef, channelDefs, constrainChannel, cssColor, describe as describeColor,
  formatChannel, infoToSpace, rgbToSpace, round, spaceToRgb,
} from './spaces';

const rgb = (r: number, g: number, b: number) => ({ r: r / 255, g: g / 255, b: b / 255 });

describe('channel definitions', () => {
  it('lists channels per space plus alpha', () => {
    expect(channelDefs('oklch').map((c) => c.key)).toEqual(['l', 'c', 'h', 'alpha']);
    expect(channelDefs('hct', false).map((c) => c.key)).toEqual(['h', 'c', 't']);
    expect(channelDefs('hsl', false).map((c) => c.key)).toEqual(['h', 's', 'l']);
    expect(channelDefs('rgb', false).map((c) => c.key)).toEqual(['r', 'g', 'b']);
    expect(channelDef('oklch', 'alpha')).toBe(ALPHA);
    expect(channelDef('oklch', 'nope')).toBeUndefined();
    expect(SPACE_ORDER).toEqual(['oklch', 'hct', 'hsl', 'rgb']);
  });

  it('constrainChannel wraps hues and clamps everything else', () => {
    const hue = channelDef('oklch', 'h')!;
    expect(constrainChannel(hue, 370)).toBeCloseTo(10, 9);
    expect(constrainChannel(hue, -10)).toBeCloseTo(350, 9);
    expect(constrainChannel(hue, 360)).toBe(0);
    const l = channelDef('oklch', 'l')!;
    expect(constrainChannel(l, 120)).toBe(100);
    expect(constrainChannel(l, -5)).toBe(0);
    expect(constrainChannel(channelDef('oklch', 'c')!, 0.9)).toBe(0.4);
    expect(constrainChannel(channelDef('rgb', 'r')!, 300)).toBe(255);
    expect(constrainChannel(ALPHA, 150)).toBe(100);
    expect(constrainChannel(l, Number.NaN)).toBe(0);
  });
});

describe('space conversions', () => {
  const samples = [rgb(59, 130, 246), rgb(255, 87, 51), rgb(18, 200, 86), rgb(200, 200, 200), rgb(30, 20, 60)];

  for (const space of SPACE_ORDER) {
    it(`round-trips sRGB through ${space}`, () => {
      for (const c of samples) {
        const values = rgbToSpace(space, c);
        expect(Object.keys(values).sort()).toEqual(SPACES[space].channels.map((ch) => ch.key).sort());
        const back = spaceToRgb(space, values);
        expect(back.inGamut).toBe(true);
        const tol = space === 'hct' ? 1.01 / 255 : 1e-4;
        expect(Math.abs(back.rgb.r - c.r)).toBeLessThanOrEqual(tol);
        expect(Math.abs(back.rgb.g - c.g)).toBeLessThanOrEqual(tol);
        expect(Math.abs(back.rgb.b - c.b)).toBeLessThanOrEqual(tol);
      }
    });
  }

  it('uses the documented scales', () => {
    const red = rgbToSpace('oklch', { r: 1, g: 0, b: 0 });
    expect(red.l).toBeCloseTo(62.8, 1);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(rgbToSpace('rgb', { r: 1, g: 0.5, b: 0 })).toEqual({ r: 255, g: 127.5, b: 0 });
    expect(rgbToSpace('hsl', { r: 1, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('clamps rgb input and flags out-of-gamut oklch', () => {
    expect(spaceToRgb('rgb', { r: 300, g: -4, b: 127.5 }).rgb).toEqual({ r: 1, g: 0, b: 0.5 });
    const wild = spaceToRgb('oklch', { l: 70, c: 0.4, h: 150 });
    expect(wild.inGamut).toBe(false);
    expect([wild.rgb.r, wild.rgb.g, wild.rgb.b].every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it('infoToSpace agrees with rgbToSpace', () => {
    for (const space of SPACE_ORDER) {
      const c = rgb(59, 130, 246);
      const info = describeColor(c);
      const a = infoToSpace(space, info);
      const b = rgbToSpace(space, c);
      for (const key of Object.keys(b)) expect(a[key]).toBeCloseTo(b[key], 6);
    }
  });
});

describe('describe()', () => {
  it('fills every field', () => {
    const info = describeColor(rgb(59, 130, 246), 0.5, false);
    expect(info.hex).toBe('#3B82F6');
    expect(info.hexa).toBe('#3B82F680');
    expect(info.rgb255).toEqual({ r: 59, g: 130, b: 246 });
    expect(info.alpha).toBe(0.5);
    expect(info.inGamut).toBe(false);
    expect(info.luminance).toBeGreaterThan(0.2);
    expect(info.luminance).toBeLessThan(0.25);
    expect(info.oklch.l).toBeGreaterThan(0.6);
    expect(info.hct.t).toBeGreaterThan(50);
    expect(info.hsl.h).toBeCloseTo(217.2, 1);
  });

  it('defaults to opaque and in gamut', () => {
    const info = describeColor({ r: 1, g: 1, b: 1 });
    expect(info.alpha).toBe(1);
    expect(info.hexa).toBe('#FFFFFF');
    expect(info.inGamut).toBe(true);
  });
});

describe('formatting', () => {
  it('cssColor renders each notation', () => {
    const info = describeColor(rgb(255, 0, 0));
    expect(cssColor(info)).toBe('#FF0000');
    expect(cssColor(info, 'hex')).toBe('#FF0000');
    expect(cssColor(info, 'rgb')).toBe('rgb(255 0 0)');
    expect(cssColor(info, 'hsl')).toBe('hsl(0 100% 50%)');
    expect(cssColor(info, 'oklch')).toMatch(/^oklch\(62\.\d+% 0\.25\d+ 29\.\d+\)$/);
    const translucent = describeColor(rgb(255, 0, 0), 0.5);
    expect(cssColor(translucent, 'rgb')).toBe('rgb(255 0 0 / 50%)');
    expect(cssColor(translucent, 'hex')).toBe('#FF000080');
  });

  it('formatChannel trims trailing zeros', () => {
    const c = channelDef('oklch', 'c')!; // 3 decimals
    expect(formatChannel(c, 0.1)).toBe('0.1');
    expect(formatChannel(c, 0.12345)).toBe('0.123');
    expect(formatChannel(c, 0)).toBe('0');
    const l = channelDef('oklch', 'l')!; // 1 decimal
    expect(formatChannel(l, 50)).toBe('50');
    expect(formatChannel(l, 62.84)).toBe('62.8');
    expect(formatChannel(l, 100)).toBe('100');
    expect(formatChannel(channelDef('rgb', 'r')!, 127.6)).toBe('128');
    expect(formatChannel(channelDef('rgb', 'r')!, 100)).toBe('100');
    // Tiny negatives must not render as "-0".
    expect(formatChannel(l, -0.00001)).toBe('0');
    expect(formatChannel(channelDef('rgb', 'r')!, -0.4)).toBe('0');
    expect(formatChannel(l, -2.5)).toBe('-2.5');
  });

  it('round()', () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.235, 0)).toBe(1);
  });
});
