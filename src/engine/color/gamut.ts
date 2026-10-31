// CSS Color 4 gamut mapping: keep OKLCH lightness and hue, reduce chroma until the
// clipped color is within a just-noticeable difference of the requested one.
import {
  type OKLCH, type RGB, clipRgb, deltaEOK, isInGamut, oklchToOklab, oklchToRgb, rgbToOklab,
} from './convert';

const JND = 0.02;
const EPSILON = 0.0001;

export function oklchToSrgbMapped(color: OKLCH): { rgb: RGB; inGamut: boolean } {
  if (color.l >= 1) return { rgb: { r: 1, g: 1, b: 1 }, inGamut: color.c < 1e-4 };
  if (color.l <= 0) return { rgb: { r: 0, g: 0, b: 0 }, inGamut: color.c < 1e-4 };

  const direct = oklchToRgb(color);
  if (isInGamut(direct)) return { rgb: clipRgb(direct), inGamut: true };

  let clipped = clipRgb(direct);
  if (deltaEOK(rgbToOklab(clipped), oklchToOklab(color)) < JND) return { rgb: clipped, inGamut: false };

  let min = 0;
  let max = color.c;
  let minInGamut = true;
  while (max - min > EPSILON) {
    const chroma = (min + max) / 2;
    const current = { l: color.l, c: chroma, h: color.h };
    const candidate = oklchToRgb(current);
    if (minInGamut && isInGamut(candidate)) {
      min = chroma;
      continue;
    }
    clipped = clipRgb(candidate);
    const e = deltaEOK(rgbToOklab(clipped), oklchToOklab(current));
    if (e < JND) {
      if (JND - e < EPSILON) break;
      minInGamut = false;
      min = chroma;
    } else {
      max = chroma;
    }
  }
  return { rgb: clipped, inGamut: false };
}

/** Highest OKLCH chroma that stays inside sRGB for a lightness (0..1) and hue. */
export function oklchMaxChroma(l: number, h: number): number {
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (isInGamut(oklchToRgb({ l, c: mid, h }), 0)) lo = mid;
    else hi = mid;
  }
  return lo;
}
