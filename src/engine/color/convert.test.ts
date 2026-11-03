import { describe, expect, it } from 'vitest';
import {
  clamp, clamp01, clipRgb, compositeOver, deltaEOK, hslToRgb, isInGamut, lerp, lerpHue, linearToRgb,
  linearToSrgb, oklabToOklch, oklchToOklab, oklchToRgb, parseHex, rgbToHsl, rgbToLinear, rgbToOklab,
  rgbToOklch, srgbToLinear, toHex, toRgb255, wrapHue,
} from './convert';

const rgb = (r: number, g: number, b: number) => ({ r: r / 255, g: g / 255, b: b / 255 });

describe('basic helpers', () => {
  it('clamps, wraps and lerps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(wrapHue(370)).toBe(10);
    expect(wrapHue(-10)).toBe(350);
    expect(wrapHue(360)).toBe(0);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('lerpHue takes the short arc across 0/360', () => {
    expect(lerpHue(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(lerpHue(10, 350, 0.5)).toBeCloseTo(0, 6);
    expect(lerpHue(350, 10, 0.25)).toBeCloseTo(355, 6);
    expect(lerpHue(0, 90, 0.5)).toBeCloseTo(45, 6);
    expect(lerpHue(0, 270, 0.5)).toBeCloseTo(315, 6);
  });
});

describe('hex', () => {
  it('parses #rgb, #rgba, #rrggbb and #rrggbbaa', () => {
    expect(parseHex('#fff')).toEqual({ rgb: { r: 1, g: 1, b: 1 }, alpha: 1 });
    const short = parseHex('#f008')!;
    expect(short.rgb).toEqual({ r: 1, g: 0, b: 0 });
    expect(short.alpha).toBeCloseTo(0x88 / 255, 6);
    const full = parseHex('#3B82F6')!;
    expect(toRgb255(full.rgb)).toEqual({ r: 59, g: 130, b: 246 });
    expect(full.alpha).toBe(1);
    const withAlpha = parseHex('3b82f680')!;
    expect(withAlpha.alpha).toBeCloseTo(128 / 255, 6);
    expect(parseHex('  #abc  ')).not.toBeNull();
  });

  it('rejects invalid input', () => {
    for (const bad of ['', '#', '#12', '#12345', '#1234567', '#ggg', 'blue', '#fffffffff']) {
      expect(parseHex(bad)).toBeNull();
    }
  });

  it('formats uppercase and only adds alpha when translucent', () => {
    expect(toHex(rgb(59, 130, 246))).toBe('#3B82F6');
    expect(toHex(rgb(59, 130, 246), 1)).toBe('#3B82F6');
    expect(toHex(rgb(59, 130, 246), 0.5)).toBe('#3B82F680');
    expect(toHex({ r: 2, g: -1, b: 0.5 })).toBe('#FF0080');
  });

  it('round-trips through parse/format', () => {
    for (const hex of ['#000000', '#FFFFFF', '#3B82F6', '#FF5733', '#12345678']) {
      const p = parseHex(hex)!;
      expect(toHex(p.rgb, p.alpha)).toBe(hex);
    }
  });
});

describe('HSL', () => {
  it('converts known colors', () => {
    expect(toRgb255(hslToRgb({ h: 0, s: 100, l: 50 }))).toEqual({ r: 255, g: 0, b: 0 });
    expect(toRgb255(hslToRgb({ h: 120, s: 100, l: 50 }))).toEqual({ r: 0, g: 255, b: 0 });
    expect(toRgb255(hslToRgb({ h: 240, s: 100, l: 50 }))).toEqual({ r: 0, g: 0, b: 255 });
    expect(toRgb255(hslToRgb({ h: 0, s: 0, l: 50 }))).toEqual({ r: 128, g: 128, b: 128 });
    expect(toRgb255(hslToRgb({ h: 360, s: 100, l: 50 }))).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('round-trips rgb → hsl → rgb', () => {
    for (const c of [rgb(59, 130, 246), rgb(255, 87, 51), rgb(18, 52, 86), rgb(250, 250, 10), rgb(128, 0, 128)]) {
      const back = hslToRgb(rgbToHsl(c));
      expect(back.r).toBeCloseTo(c.r, 6);
      expect(back.g).toBeCloseTo(c.g, 6);
      expect(back.b).toBeCloseTo(c.b, 6);
    }
  });

  it('reports hue 0 and saturation 0 for grays', () => {
    expect(rgbToHsl(rgb(128, 128, 128))).toEqual({ h: 0, s: 0, l: (128 / 255) * 100 });
  });
});

describe('linear sRGB', () => {
  it('round-trips the transfer function, including negatives', () => {
    for (const v of [0, 0.001, 0.04, 0.2, 0.5, 0.9, 1, -0.3, 1.2]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 9);
    }
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214041, 5);
    const c = rgb(59, 130, 246);
    const back = linearToRgb(rgbToLinear(c));
    expect(back.r).toBeCloseTo(c.r, 9);
  });
});

describe('OKLab / OKLCH', () => {
  it('white and black', () => {
    const white = rgbToOklch({ r: 1, g: 1, b: 1 });
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeLessThan(1e-3);
    const black = rgbToOklch({ r: 0, g: 0, b: 0 });
    expect(black.l).toBeCloseTo(0, 6);
    expect(black.c).toBeCloseTo(0, 6);
    expect(black.h).toBe(0);
  });

  it('pure red and blue match published values', () => {
    const red = rgbToOklch({ r: 1, g: 0, b: 0 });
    expect(red.l).toBeCloseTo(0.628, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
    const blue = rgbToOklch({ r: 0, g: 0, b: 1 });
    expect(blue.l).toBeCloseTo(0.452, 3);
    expect(blue.c).toBeCloseTo(0.313, 3);
    expect(blue.h).toBeCloseTo(264.05, 1);
  });

  it('round-trips in-gamut colors', () => {
    for (const c of [rgb(59, 130, 246), rgb(255, 87, 51), rgb(18, 200, 86), rgb(240, 240, 240), rgb(10, 10, 10)]) {
      const back = oklchToRgb(rgbToOklch(c));
      expect(back.r).toBeCloseTo(c.r, 5);
      expect(back.g).toBeCloseTo(c.g, 5);
      expect(back.b).toBeCloseTo(c.b, 5);
      // Near-grays snap to hue 0 below 1e-6 chroma, so allow ~1e-6 drift in a/b.
      const lab = rgbToOklab(c);
      const lab2 = oklchToOklab(oklabToOklch(lab));
      expect(lab2.a).toBeCloseTo(lab.a, 6);
      expect(lab2.b).toBeCloseTo(lab.b, 6);
    }
  });

  it('deltaEOK is zero for identical colors and grows with difference', () => {
    const a = rgbToOklab(rgb(59, 130, 246));
    expect(deltaEOK(a, a)).toBe(0);
    expect(deltaEOK(rgbToOklab({ r: 0, g: 0, b: 0 }), rgbToOklab({ r: 1, g: 1, b: 1 }))).toBeCloseTo(1, 3);
  });
});

describe('gamut helpers', () => {
  it('detects and clips out-of-range rgb', () => {
    expect(isInGamut({ r: 0.5, g: 0, b: 1 })).toBe(true);
    expect(isInGamut({ r: 1.01, g: 0, b: 0 })).toBe(false);
    expect(isInGamut({ r: -0.01, g: 0, b: 0 })).toBe(false);
    expect(clipRgb({ r: 1.2, g: -0.2, b: 0.4 })).toEqual({ r: 1, g: 0, b: 0.4 });
  });
});

describe('compositeOver', () => {
  it('blends in gamma space by alpha', () => {
    expect(compositeOver({ r: 1, g: 1, b: 1 }, 0.5, { r: 0, g: 0, b: 0 })).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
    expect(compositeOver({ r: 1, g: 0, b: 0 }, 1, { r: 0, g: 0, b: 1 })).toEqual({ r: 1, g: 0, b: 0 });
    expect(compositeOver({ r: 1, g: 0, b: 0 }, 0, { r: 0, g: 0, b: 1 })).toEqual({ r: 0, g: 0, b: 1 });
  });
});
