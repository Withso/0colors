import { describe, expect, it } from 'vitest';
import {
  hslToOklch,
  hslToRgb,
  oklchToHsl,
  oklchToSrgb,
  rgbToHex,
  rgbToHsl,
} from './color-conversions';

describe('color conversions', () => {
  it('formats RGB values as uppercase hex and clamps out-of-range channels', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#FFFFFF');
    expect(rgbToHex(16, 160, 255)).toBe('#10A0FF');
    expect(rgbToHex(300, -10, 15.5)).toBe('#FF0010');
  });

  it('round-trips canonical RGB values through HSL exactly or within a one-step tolerance', () => {
    const samples = [
      [0, 0, 0],
      [255, 255, 255],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [64, 128, 192],
    ] as const;

    for (const [r, g, b] of samples) {
      const hsl = rgbToHsl(r, g, b);
      const roundTrip = hslToRgb(hsl.h, hsl.s, hsl.l);

      expect(Math.abs(roundTrip.r - r)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTrip.g - g)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTrip.b - b)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps muted HSL colors reasonably stable through OKLCH', () => {
    const samples = [
      [210, 35, 42],
      [28, 30, 55],
      [320, 24, 64],
      [175, 28, 38],
    ] as const;

    for (const [h, s, l] of samples) {
      const oklch = hslToOklch(h, s, l);
      const sourceRgb = hslToRgb(h, s, l);
      const roundTripRgb = oklchToSrgb(oklch.l, oklch.c, oklch.h);

      expect(Number.isFinite(oklch.l)).toBe(true);
      expect(Number.isFinite(oklch.c)).toBe(true);
      expect(Number.isFinite(oklch.h)).toBe(true);
      expect(Math.abs(roundTripRgb.r - sourceRgb.r)).toBeLessThanOrEqual(35);
      expect(Math.abs(roundTripRgb.g - sourceRgb.g)).toBeLessThanOrEqual(35);
      expect(Math.abs(roundTripRgb.b - sourceRgb.b)).toBeLessThanOrEqual(35);
    }
  });

  it('keeps neutral colors stable when round-tripping through OKLCH', () => {
    const samples = [
      [0, 0, 0],
      [0, 0, 22],
      [0, 0, 50],
      [0, 0, 100],
    ] as const;

    for (const [h, s, l] of samples) {
      const oklch = hslToOklch(h, s, l);
      const roundTrip = oklchToHsl(oklch.l, oklch.c, oklch.h);

      expect(Number.isFinite(oklch.l)).toBe(true);
      expect(Number.isFinite(oklch.c)).toBe(true);
      expect(Number.isFinite(oklch.h)).toBe(true);
      expect(Math.abs(roundTrip.l - l)).toBeLessThanOrEqual(2);
      expect(roundTrip.s).toBeLessThanOrEqual(2);
      expect(hslToRgb(roundTrip.h, roundTrip.s, roundTrip.l)).toEqual(hslToRgb(0, 0, l));
    }
  });

  it('clamps out-of-gamut OKLCH values into valid sRGB output', () => {
    const rgb = oklchToSrgb(65, 180, 25);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

    expect(rgb.r).toBeGreaterThanOrEqual(0);
    expect(rgb.r).toBeLessThanOrEqual(255);
    expect(rgb.g).toBeGreaterThanOrEqual(0);
    expect(rgb.g).toBeLessThanOrEqual(255);
    expect(rgb.b).toBeGreaterThanOrEqual(0);
    expect(rgb.b).toBeLessThanOrEqual(255);
    expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});
