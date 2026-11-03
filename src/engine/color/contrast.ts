// Contrast metrics: WCAG 2.x ratio and APCA (WCAG 3 draft, 0.0.98G-4g constants).
import { type RGB, clamp01, srgbToLinear } from './convert';

/** WCAG relative luminance (0..1). */
export function relativeLuminance(c: RGB): number {
  return 0.2126 * srgbToLinear(clamp01(c.r)) + 0.7152 * srgbToLinear(clamp01(c.g)) + 0.0722 * srgbToLinear(clamp01(c.b));
}

/** WCAG 2 contrast ratio, 1..21. Order does not matter. */
export function wcagContrast(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function wcagGrade(ratio: number): { aa: boolean; aaLarge: boolean; aaa: boolean; aaaLarge: boolean } {
  return { aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7, aaaLarge: ratio >= 4.5 };
}

// APCA uses a simple 2.4 exponent instead of the piecewise sRGB curve.
function apcaY(c: RGB): number {
  const f = (v: number) => Math.pow(clamp01(v), 2.4);
  return 0.2126729 * f(c.r) + 0.7151522 * f(c.g) + 0.072175 * f(c.b);
}

/**
 * APCA lightness contrast (Lc), roughly -108..106. Positive = dark text on a light
 * background, negative = light text on a dark background. Order matters.
 */
export function apcaContrast(text: RGB, background: RGB): number {
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  const clampBlack = (y: number) => (y > blkThrs ? y : y + Math.pow(blkThrs - y, blkClmp));
  const txtY = clampBlack(apcaY(text));
  const bgY = clampBlack(apcaY(background));
  if (Math.abs(bgY - txtY) < 0.0005) return 0;

  if (bgY > txtY) {
    const sapc = (Math.pow(bgY, 0.56) - Math.pow(txtY, 0.57)) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  const sapc = (Math.pow(bgY, 0.65) - Math.pow(txtY, 0.62)) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}

/** Plain-language reading of an APCA Lc value. */
export function apcaGuidance(lc: number): string {
  const v = Math.abs(lc);
  if (v >= 90) return 'Ideal for body text';
  if (v >= 75) return 'Fine for body text';
  if (v >= 60) return 'Large or bold text';
  if (v >= 45) return 'Headlines and big text only';
  if (v >= 30) return 'Placeholder, disabled or non-text';
  if (v >= 15) return 'Dividers and decoration only';
  return 'Practically invisible';
}
