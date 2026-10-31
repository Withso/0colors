// HCT (Hue, Chroma, Tone) — Material Design 3's perceptual color space.
// Tone is CIE L* (perceived lightness, 0..100); chroma is CAM16 colorfulness.
import { Hct, argbFromRgb } from '@material/material-color-utilities';
import { type RGB, clamp, clamp01, wrapHue } from './convert';

export interface HCT { h: number; c: number; t: number }

export function rgbToHct(c: RGB): HCT {
  const argb = argbFromRgb(
    Math.round(clamp01(c.r) * 255),
    Math.round(clamp01(c.g) * 255),
    Math.round(clamp01(c.b) * 255),
  );
  const hct = Hct.fromInt(argb);
  return { h: hct.hue, c: hct.chroma, t: hct.tone };
}

/**
 * HCT → sRGB. Material's solver keeps hue and tone and lowers chroma until the
 * color fits inside sRGB, so the result is always displayable. `achieved` is the
 * chroma that actually fits.
 */
export function hctToRgb(v: HCT): { rgb: RGB; achieved: number } {
  const hct = Hct.from(wrapHue(v.h), Math.max(0, v.c), clamp(v.t, 0, 100));
  const argb = hct.toInt();
  return {
    rgb: { r: ((argb >> 16) & 255) / 255, g: ((argb >> 8) & 255) / 255, b: (argb & 255) / 255 },
    achieved: hct.chroma,
  };
}

/** Highest chroma sRGB can show for this hue and tone. */
export function hctMaxChroma(h: number, t: number): number {
  return Hct.from(wrapHue(h), 200, clamp(t, 0, 100)).chroma;
}
