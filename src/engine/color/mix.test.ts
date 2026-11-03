import { describe, expect, it } from 'vitest';
import { rgbToOklch } from './convert';
import { MIX_SPACES, type MixSpace, mixRgb, mixStops } from './mix';
import { nameColor } from './names';

const red = { r: 1, g: 0, b: 0 };
const blue = { r: 0, g: 0, b: 1 };
const yellow = { r: 1, g: 1, b: 0 };
const spaces = Object.keys(MIX_SPACES) as MixSpace[];

const close = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, digits = 4) => {
  expect(a.r).toBeCloseTo(b.r, digits);
  expect(a.g).toBeCloseTo(b.g, digits);
  expect(a.b).toBeCloseTo(b.b, digits);
};

describe('mixRgb', () => {
  for (const space of spaces) {
    it(`${space}: t=0 is A and t=1 is B`, () => {
      close(mixRgb(red, blue, 0, space).rgb, red, 3);
      close(mixRgb(red, blue, 1, space).rgb, blue, 3);
      const m = mixRgb(red, blue, 0.5, space).rgb;
      expect([m.r, m.g, m.b].every((v) => v >= 0 && v <= 1)).toBe(true);
    });
  }

  it('srgb midpoint of red and blue is (0.5, 0, 0.5)', () => {
    close(mixRgb(red, blue, 0.5, 'srgb').rgb, { r: 0.5, g: 0, b: 0.5 }, 9);
  });

  it('linear midpoint is brighter than the srgb midpoint', () => {
    const lin = mixRgb(red, blue, 0.5, 'linear').rgb;
    expect(lin.r).toBeGreaterThan(0.5);
    expect(lin.b).toBeGreaterThan(0.5);
  });

  it('oklch keeps complementary blends more colorful than srgb', () => {
    const viaOklch = rgbToOklch(mixRgb(blue, yellow, 0.5, 'oklch').rgb);
    const viaSrgb = rgbToOklch(mixRgb(blue, yellow, 0.5, 'srgb').rgb);
    expect(viaOklch.c).toBeGreaterThan(viaSrgb.c);
  });

  it('oklch borrows the hue of the chromatic color when mixing with gray', () => {
    const gray = { r: 0.5, g: 0.5, b: 0.5 };
    const m = rgbToOklch(mixRgb(gray, blue, 0.5, 'oklch').rgb);
    expect(Math.abs(m.h - rgbToOklch(blue).h)).toBeLessThan(3);
    const m2 = rgbToOklch(mixRgb(blue, gray, 0.5, 'oklch').rgb);
    expect(Math.abs(m2.h - rgbToOklch(blue).h)).toBeLessThan(3);
  });

  it('hsl borrows the hue of the saturated color when mixing with gray', () => {
    const gray = { r: 0.5, g: 0.5, b: 0.5 };
    const m = mixRgb(gray, red, 0.5, 'hsl').rgb;
    expect(m.r).toBeGreaterThan(m.g);
    expect(m.g).toBeCloseTo(m.b, 6);
  });
});

describe('mixStops', () => {
  it('returns n stops with exact endpoints', () => {
    const stops = mixStops(red, blue, 'oklab', 7);
    expect(stops).toHaveLength(7);
    close(stops[0], red, 3);
    close(stops[6], blue, 3);
    expect(mixStops(red, blue, 'srgb')).toHaveLength(9);
    expect(mixStops(red, blue, 'srgb', 1)).toHaveLength(1);
  });
});

describe('nameColor', () => {
  it('names a few familiar colors', () => {
    expect(nameColor({ r: 1, g: 1, b: 1 })).toBe('White');
    expect(nameColor({ r: 0, g: 0, b: 0 })).toBe('Black');
    expect(nameColor({ r: 0.5, g: 0.5, b: 0.5 })).toBe('Gray');
    expect(nameColor(red)).toMatch(/Red/);
    expect(nameColor({ r: 59 / 255, g: 130 / 255, b: 246 / 255 })).toMatch(/Blue/);
  });
});
