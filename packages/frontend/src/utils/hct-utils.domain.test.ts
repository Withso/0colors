import { describe, expect, it, vi } from 'vitest';
import { rgbToHex } from './color-conversions';

vi.mock('@material/material-color-utilities', () => {
  class MockHct {
    hue: number;
    chroma: number;
    tone: number;

    constructor(hue: number, chroma: number, tone: number) {
      this.hue = hue;
      this.chroma = chroma;
      this.tone = tone;
    }

    static fromInt(argb: number) {
      const r = (argb >> 16) & 0xff;
      const g = (argb >> 8) & 0xff;
      const b = argb & 0xff;
      return new MockHct(r, g, Math.round((b / 255) * 100));
    }

    static from(hue: number, chroma: number, tone: number) {
      const normalizedHue = ((hue % 360) + 360) % 360;
      const normalizedTone = Math.max(0, Math.min(100, tone));
      const maxChroma = 40 + ((Math.round(normalizedHue) + Math.round(normalizedTone)) % 5) * 20;
      const normalizedChroma = Math.max(0, Math.min(maxChroma, chroma));
      return new MockHct(normalizedHue, normalizedChroma, normalizedTone);
    }

    toInt() {
      const r = Math.max(0, Math.min(255, Math.round(this.hue)));
      const g = Math.max(0, Math.min(255, Math.round(this.chroma)));
      const b = Math.max(0, Math.min(255, Math.round((this.tone / 100) * 255)));
      return (0xff << 24) | (r << 16) | (g << 8) | b;
    }
  }

  const hexFromArgb = (argb: number) => {
    const hex = (argb >>> 0).toString(16).padStart(8, '0');
    return `#${hex.slice(-6)}`.toUpperCase();
  };

  const argbFromHex = (hex: string) => {
    const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
    return (parseInt(normalized.padStart(6, '0'), 16) | 0xff000000) >>> 0;
  };

  return {
    Hct: MockHct,
    hexFromArgb,
    argbFromHex,
  };
});

import { getMaxChroma, hctToHex, hctToRgb, hexToHct, rgbToHct } from './hct-utils';

function circularDiff(a: number, b: number) {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

describe('HCT utilities', () => {
  it('normalizes hue and clamps chroma/tone before converting', () => {
    const normalized = hctToRgb(330, 0, 100);
    expect(hctToRgb(-30, -5, 120)).toEqual(normalized);
    expect(hctToHex(-30, -5, 120)).toBe(hctToHex(330, 0, 100));
  });

  it('round-trips HCT-derived RGB values back into close HCT readings', () => {
    const samples = [
      [0, 0, 0],
      [0, 0, 100],
      [210, 48, 54],
      [32, 82, 52],
      [280, 36, 42],
    ] as const;

    for (const [h, c, t] of samples) {
      const rgb = hctToRgb(h, c, t);
      const roundTrip = rgbToHct(rgb.r, rgb.g, rgb.b);

      expect(circularDiff(roundTrip.h, ((h % 360) + 360) % 360)).toBeLessThanOrEqual(25);
      expect(Math.abs(roundTrip.c - Math.max(0, Math.min(200, c)))).toBeLessThanOrEqual(25);
      expect(Math.abs(roundTrip.t - Math.max(0, Math.min(100, t)))).toBeLessThanOrEqual(25);
    }
  });

  it('treats hex input with or without a hash consistently', () => {
    expect(hexToHct('#336699')).toEqual(hexToHct('336699'));
  });

  it('agrees with rgbToHex when converting through HCT to RGB', () => {
    const samples = [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
      [0, 128, 255],
      [64, 160, 96],
    ] as const;

    for (const [r, g, b] of samples) {
      const hct = rgbToHct(r, g, b);
      const rgb = hctToRgb(hct.h, hct.c, hct.t);
      expect(hctToHex(hct.h, hct.c, hct.t)).toBe(rgbToHex(rgb.r, rgb.g, rgb.b));
    }
  });

  it('reports finite max chroma values within the supported gamut', () => {
    const samples = [
      [0, 50],
      [120, 50],
      [240, 50],
      [330, 75],
    ] as const;

    for (const [h, t] of samples) {
      const maxChroma = getMaxChroma(h, t);
      expect(Number.isFinite(maxChroma)).toBe(true);
      expect(maxChroma).toBeGreaterThan(0);
      expect(maxChroma).toBeLessThanOrEqual(200);
    }
  });
});
