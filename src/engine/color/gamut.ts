// CSS Color 4 gamut mapping: keep OKLCH lightness and hue, reduce chroma until the
// clipped color is within a just-noticeable difference of the requested one.
import {
  type OKLab, type OKLCH, type RGB, clipRgb, isInGamut, linearRgbToOklab, linearToRgb,
  oklabToLinearRgb, oklchToOklab, oklchToRgb, srgbToLinear,
} from './convert';

const JND = 0.02;
const EPSILON = 0.0001;
const LINEAR_MIN = srgbToLinear(-1e-4);
const LINEAR_MAX = srgbToLinear(1 + 1e-4);
const inLinearGamut = ({ r, g, b }: RGB) =>
  r >= LINEAR_MIN && r <= LINEAR_MAX && g >= LINEAR_MIN && g <= LINEAR_MAX && b >= LINEAR_MIN && b <= LINEAR_MAX;
const errorSquared = (linear: RGB, target: OKLab) => {
  const actual = linearRgbToOklab(linear);
  const l = actual.l - target.l, a = actual.a - target.a, b = actual.b - target.b;
  return l * l + a * a + b * b;
};

function mapChroma(lightness: number, chroma: number, a: number, b: number): { rgb: RGB; inGamut: boolean } {
  if (lightness >= 1) return { rgb: { r: 1, g: 1, b: 1 }, inGamut: chroma < 1e-4 };
  if (lightness <= 0) return { rgb: { r: 0, g: 0, b: 0 }, inGamut: chroma < 1e-4 };

  const lab = { l: lightness, a: chroma * a, b: chroma * b };
  const direct = oklabToLinearRgb(lab);
  if (inLinearGamut(direct)) return { rgb: linearToRgb(clipRgb(direct)), inGamut: true };

  // Clipping commutes with sRGB's transfer function. Stay linear during the search
  // to avoid encoding and decoding every candidate just to measure its OKLab error.
  let clipped = clipRgb(direct);
  if (errorSquared(clipped, lab) < JND * JND) return { rgb: linearToRgb(clipped), inGamut: false };

  let min = 0;
  let max = chroma;
  let minInGamut = true;
  while (max - min > EPSILON) {
    const candidateChroma = (min + max) / 2;
    const current = { l: lightness, a: candidateChroma * a, b: candidateChroma * b };
    const candidate = oklabToLinearRgb(current);
    if (minInGamut && inLinearGamut(candidate)) {
      min = candidateChroma;
      continue;
    }
    clipped = clipRgb(candidate);
    const e = errorSquared(clipped, current);
    if (e < JND * JND) {
      if (e > (JND - EPSILON) ** 2) break;
      minInGamut = false;
      min = candidateChroma;
    } else {
      max = candidateChroma;
    }
  }
  return { rgb: linearToRgb(clipped), inGamut: false };
}

export function oklchToSrgbMapped(color: OKLCH): { rgb: RGB; inGamut: boolean } {
  const { a, b } = oklchToOklab({ l: color.l, c: 1, h: color.h });
  return mapChroma(color.l, color.c, a, b);
}

/** Reuse the hue direction while rasterizing a row at a fixed lightness. */
export function oklchChromaMapper(lightness: number, hue: number): (chroma: number) => { rgb: RGB; inGamut: boolean } {
  const { a, b } = oklchToOklab({ l: lightness, c: 1, h: hue });
  return (chroma) => mapChroma(lightness, chroma, a, b);
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
