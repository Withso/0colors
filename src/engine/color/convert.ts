// ─────────────────────────────────────────────────────────────
// Color conversions between sRGB, linear sRGB, HSL, OKLab and OKLCH.
//
// Conventions used across the engine:
//   RGB    r,g,b in 0..1 (gamma-encoded sRGB; may leave 0..1 before clipping)
//   HSL    h 0..360, s 0..100, l 0..100
//   OKLab  l 0..1, a/b roughly -0.4..0.4
//   OKLCH  l 0..1, c 0..~0.37 (sRGB), h 0..360
// HCT lives in ./hct.ts because it relies on Material Color Utilities.
// ─────────────────────────────────────────────────────────────

export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }
export interface OKLab { l: number; a: number; b: number }
export interface OKLCH { l: number; c: number; h: number }

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const wrapHue = (h: number) => ((h % 360) + 360) % 360;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolate hues along the shorter arc. */
export function lerpHue(a: number, b: number, t: number): number {
  let d = wrapHue(b) - wrapHue(a);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return wrapHue(a + d * t);
}

// ── sRGB transfer function ───────────────────────────────────
export function srgbToLinear(c: number): number {
  const a = Math.abs(c);
  const v = a <= 0.04045 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4);
  return c < 0 ? -v : v;
}

export function linearToSrgb(c: number): number {
  const a = Math.abs(c);
  const v = a <= 0.0031308 ? a * 12.92 : 1.055 * Math.pow(a, 1 / 2.4) - 0.055;
  return c < 0 ? -v : v;
}

export const rgbToLinear = (c: RGB): RGB => ({ r: srgbToLinear(c.r), g: srgbToLinear(c.g), b: srgbToLinear(c.b) });
export const linearToRgb = (c: RGB): RGB => ({ r: linearToSrgb(c.r), g: linearToSrgb(c.g), b: linearToSrgb(c.b) });

// ── Gamut helpers ────────────────────────────────────────────
export function isInGamut(c: RGB, eps = 1e-4): boolean {
  return c.r >= -eps && c.r <= 1 + eps && c.g >= -eps && c.g <= 1 + eps && c.b >= -eps && c.b <= 1 + eps;
}

export const clipRgb = (c: RGB): RGB => ({ r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b) });

// ── HSL ──────────────────────────────────────────────────────
export function hslToRgb({ h, s, l }: HSL): RGB {
  const sat = clamp(s, 0, 100) / 100;
  const lig = clamp(l, 0, 100) / 100;
  const k = (n: number) => (n + wrapHue(h) / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4) };
}

export function rgbToHsl(c: RGB): HSL {
  const r = clamp01(c.r), g = clamp01(c.g), b = clamp01(c.b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 1e-9) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: wrapHue(h), s: s * 100, l: l * 100 };
}

// ── OKLab / OKLCH (Björn Ottosson) ───────────────────────────
export function linearRgbToOklab({ r, g, b }: RGB): OKLab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToLinearRgb({ l: L, a, b }: OKLab): RGB {
  const lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = L - 0.0894841775 * a - 1.291485548 * b;
  // This is the inner loop of gamut mapping; multiplication avoids general pow calls.
  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export const rgbToOklab = (c: RGB): OKLab => linearRgbToOklab(rgbToLinear(c));
export const oklabToRgb = (c: OKLab): RGB => linearToRgb(oklabToLinearRgb(c));

export function oklabToOklch({ l, a, b }: OKLab): OKLCH {
  const c = Math.sqrt(a * a + b * b);
  const h = c < 1e-6 ? 0 : wrapHue((Math.atan2(b, a) * 180) / Math.PI);
  return { l, c, h };
}

export function oklchToOklab({ l, c, h }: OKLCH): OKLab {
  const rad = (wrapHue(h) * Math.PI) / 180;
  return { l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

export const rgbToOklch = (c: RGB): OKLCH => oklabToOklch(rgbToOklab(c));
export const oklchToRgb = (c: OKLCH): RGB => oklabToRgb(oklchToOklab(c));

/** Euclidean distance in OKLab (ΔEOK). A "just noticeable difference" is ~0.02. */
export function deltaEOK(a: OKLab, b: OKLab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

// ── Hex ──────────────────────────────────────────────────────
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function parseHex(input: string): { rgb: RGB; alpha: number } | null {
  const m = HEX_RE.exec(input.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length <= 4) hex = hex.split('').map((ch) => ch + ch).join('');
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return { rgb: { r: n(0), g: n(2), b: n(4) }, alpha: hex.length === 8 ? n(6) : 1 };
}

const byte = (v: number) => Math.round(clamp01(v) * 255);
const hex2 = (v: number) => byte(v).toString(16).padStart(2, '0');

export function toHex(c: RGB, alpha = 1): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return (alpha < 0.999 ? base + hex2(alpha) : base).toUpperCase();
}

export const toRgb255 = (c: RGB) => ({ r: byte(c.r), g: byte(c.g), b: byte(c.b) });

/** Composite a translucent color over an opaque backdrop (in gamma space, as browsers do). */
export function compositeOver(fg: RGB, alpha: number, bg: RGB): RGB {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  };
}
