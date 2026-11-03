import { describe, expect, it } from 'vitest';
import { isInGamut, oklchToRgb, rgbToOklch, toHex } from './convert';
import { oklchMaxChroma, oklchToSrgbMapped } from './gamut';
import { hctMaxChroma, hctToRgb, rgbToHct } from './hct';
import { spaceToRgb } from './spaces';

const inUnit = (c: { r: number; g: number; b: number }) =>
  [c.r, c.g, c.b].every((v) => v >= 0 && v <= 1);

describe('oklchToSrgbMapped', () => {
  it.each([
    [0, 0.16, '#C94F7C', true], [0, 0.4, '#ED007A', false],
    [60, 0.16, '#C26300', false], [60, 0.4, '#C36200', false],
    [120, 0.16, '#758C00', false], [120, 0.4, '#758D00', false],
    [180, 0.16, '#009883', false], [180, 0.4, '#009883', false],
    [240, 0.16, '#0089D5', false], [240, 0.4, '#0089D7', false],
    [300, 0.16, '#9065D0', true], [300, 0.4, '#A032FF', false],
  ] as const)('preserves mapped sRGB bytes at hue %s and chroma %s', (h, c, hex, inGamut) => {
    const mapped = oklchToSrgbMapped({ l: 0.6, c, h });
    expect(toHex(mapped.rgb)).toBe(hex);
    expect(mapped.inGamut).toBe(inGamut);
  });

  it('passes in-gamut colors through untouched', () => {
    const color = rgbToOklch({ r: 59 / 255, g: 130 / 255, b: 246 / 255 });
    const mapped = oklchToSrgbMapped(color);
    expect(mapped.inGamut).toBe(true);
    expect(mapped.rgb.r).toBeCloseTo(59 / 255, 5);
    expect(mapped.rgb.g).toBeCloseTo(130 / 255, 5);
    expect(mapped.rgb.b).toBeCloseTo(246 / 255, 5);
  });

  it('maps an out-of-gamut color into sRGB while keeping lightness and hue', () => {
    const request = { l: 0.7, c: 0.4, h: 150 };
    expect(isInGamut(oklchToRgb(request))).toBe(false);
    const mapped = oklchToSrgbMapped(request);
    expect(mapped.inGamut).toBe(false);
    expect(inUnit(mapped.rgb)).toBe(true);
    const back = rgbToOklch(mapped.rgb);
    expect(Math.abs(back.l - request.l)).toBeLessThan(0.03);
    expect(Math.abs(back.h - request.h)).toBeLessThan(4);
    expect(back.c).toBeLessThan(request.c);
  });

  it('handles several hues at extreme chroma', () => {
    for (const h of [0, 30, 90, 200, 264, 330]) {
      const mapped = oklchToSrgbMapped({ l: 0.6, c: 0.4, h });
      expect(inUnit(mapped.rgb)).toBe(true);
      expect(Math.abs(rgbToOklch(mapped.rgb).l - 0.6)).toBeLessThan(0.05);
    }
  });

  it('clamps lightness extremes to white and black', () => {
    expect(oklchToSrgbMapped({ l: 1, c: 0, h: 0 })).toEqual({ rgb: { r: 1, g: 1, b: 1 }, inGamut: true });
    expect(oklchToSrgbMapped({ l: 1.2, c: 0.2, h: 40 }).rgb).toEqual({ r: 1, g: 1, b: 1 });
    expect(oklchToSrgbMapped({ l: 0, c: 0, h: 0 })).toEqual({ rgb: { r: 0, g: 0, b: 0 }, inGamut: true });
    expect(oklchToSrgbMapped({ l: -0.1, c: 0.1, h: 0 }).rgb).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('oklchMaxChroma', () => {
  it('finds the edge of the sRGB gamut', () => {
    for (const [l, h] of [[0.6, 264], [0.7, 150], [0.9, 100], [0.3, 30]]) {
      const max = oklchMaxChroma(l, h);
      expect(max).toBeGreaterThan(0);
      expect(isInGamut(oklchToRgb({ l, c: max, h }))).toBe(true);
      expect(isInGamut(oklchToRgb({ l, c: max + 0.01, h }))).toBe(false);
    }
  });
});

describe('HCT', () => {
  it('white has tone ~100 and black tone ~0', () => {
    expect(rgbToHct({ r: 1, g: 1, b: 1 }).t).toBeCloseTo(100, 1);
    expect(rgbToHct({ r: 0, g: 0, b: 0 }).t).toBeCloseTo(0, 1);
  });

  it('round-trips rgb → hct → rgb within one 8-bit step', () => {
    for (const hex of [[59, 130, 246], [255, 87, 51], [18, 200, 86], [120, 120, 120], [250, 240, 10]]) {
      const c = { r: hex[0] / 255, g: hex[1] / 255, b: hex[2] / 255 };
      const { rgb } = hctToRgb(rgbToHct(c));
      expect(Math.abs(rgb.r - c.r)).toBeLessThanOrEqual(1 / 255 + 1e-9);
      expect(Math.abs(rgb.g - c.g)).toBeLessThanOrEqual(1 / 255 + 1e-9);
      expect(Math.abs(rgb.b - c.b)).toBeLessThanOrEqual(1 / 255 + 1e-9);
    }
  });

  it('reduces impossible chroma and reports it as out of gamut', () => {
    const { achieved } = hctToRgb({ h: 264, c: 150, t: 50 });
    expect(achieved).toBeLessThan(150);
    expect(hctMaxChroma(264, 50)).toBeCloseTo(achieved, 3);
    expect(spaceToRgb('hct', { h: 264, c: 150, t: 50 }).inGamut).toBe(false);
    const modest = spaceToRgb('hct', { h: 264, c: 20, t: 50 });
    expect(modest.inGamut).toBe(true);
    expect(inUnit(modest.rgb)).toBe(true);
  });
});
