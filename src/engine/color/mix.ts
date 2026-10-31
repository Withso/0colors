// Interpolating between two colors in different spaces — the same colors can mix
// into very different results depending on the space you mix in.
import {
  type RGB, clipRgb, lerp, lerpHue, linearToRgb, oklabToOklch, oklabToRgb, rgbToHsl, rgbToLinear,
  rgbToOklab, rgbToOklch, hslToRgb, isInGamut,
} from './convert';
import { oklchToSrgbMapped } from './gamut';

export type MixSpace = 'srgb' | 'linear' | 'oklab' | 'oklch' | 'hsl';

export const MIX_SPACES: Record<MixSpace, { label: string; blurb: string }> = {
  oklab: { label: 'OKLab', blurb: 'Perceptual and straight: smooth, even blends without hue drift. The best default.' },
  oklch: { label: 'OKLCH', blurb: 'Travels around the hue wheel, keeping colors vivid instead of passing through gray.' },
  srgb: { label: 'sRGB', blurb: 'Averages gamma-encoded values. Complementary colors meet in a muddy, dark middle.' },
  linear: { label: 'Linear RGB', blurb: 'Physically mixes light. Blends look too bright toward the lighter color.' },
  hsl: { label: 'HSL', blurb: 'Rotates hue geometrically. Can swing through unrelated, overly bright hues.' },
};

const POWERLESS = 1e-4;

export function mixRgb(a: RGB, b: RGB, t: number, space: MixSpace): { rgb: RGB; inGamut: boolean } {
  switch (space) {
    case 'srgb':
      return { rgb: { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) }, inGamut: true };
    case 'linear': {
      const la = rgbToLinear(a);
      const lb = rgbToLinear(b);
      return { rgb: clipRgb(linearToRgb({ r: lerp(la.r, lb.r, t), g: lerp(la.g, lb.g, t), b: lerp(la.b, lb.b, t) })), inGamut: true };
    }
    case 'oklab': {
      const la = rgbToOklab(a);
      const lb = rgbToOklab(b);
      const mixed = { l: lerp(la.l, lb.l, t), a: lerp(la.a, lb.a, t), b: lerp(la.b, lb.b, t) };
      const rgb = oklabToRgb(mixed);
      return isInGamut(rgb) ? { rgb: clipRgb(rgb), inGamut: true } : oklchToSrgbMapped(oklabToOklch(mixed));
    }
    case 'oklch': {
      const ca = rgbToOklch(a);
      const cb = rgbToOklch(b);
      // A gray has no meaningful hue ("powerless"), so borrow the other color's hue.
      const ha = ca.c < POWERLESS ? cb.h : ca.h;
      const hb = cb.c < POWERLESS ? ca.h : cb.h;
      return oklchToSrgbMapped({ l: lerp(ca.l, cb.l, t), c: lerp(ca.c, cb.c, t), h: lerpHue(ha, hb, t) });
    }
    case 'hsl': {
      const ha = rgbToHsl(a);
      const hb = rgbToHsl(b);
      const hueA = ha.s < 0.01 ? hb.h : ha.h;
      const hueB = hb.s < 0.01 ? ha.h : hb.h;
      return { rgb: hslToRgb({ h: lerpHue(hueA, hueB, t), s: lerp(ha.s, hb.s, t), l: lerp(ha.l, hb.l, t) }), inGamut: true };
    }
  }
}

/** n evenly spaced stops from a to b, for gradient previews. */
export function mixStops(a: RGB, b: RGB, space: MixSpace, n = 9): RGB[] {
  return Array.from({ length: n }, (_, i) => mixRgb(a, b, n === 1 ? 0 : i / (n - 1), space).rgb);
}
