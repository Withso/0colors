// ═══════════════════════════════════════════════════════════════════
// Server-side Color Conversions — EXACT copy of /utils/color-conversions.ts
// Must produce identical results to the client-side version.
// Zero browser dependencies — pure math.
// ═══════════════════════════════════════════════════════════════════

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s = s / 100;
  l = l / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h >= 0 && h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h >= 60 && h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h >= 120 && h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h >= 180 && h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h >= 240 && h < 300) { r1 = x; g1 = 0; b1 = c; }
  else if (h >= 300 && h < 360) { r1 = c; g1 = 0; b1 = x; }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r = r / 255; g = g / 255; b = b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return {
    h: Math.round(h * 360 * 100) / 100,
    s: Math.round(s * 100 * 100) / 100,
    l: Math.round(l * 100 * 100) / 100,
  };
}

function srgbToLinear(val: number): number {
  const v = val / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(val: number): number {
  const c = Math.max(0, Math.min(1, val));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const M1_0 = [0.4122214708, 0.5363325363, 0.0514459929] as const;
const M1_1 = [0.2119034982, 0.6806995451, 0.1073969566] as const;
const M1_2 = [0.0883024619, 0.2817188376, 0.6299787005] as const;
const M2_0 = [0.2104542553, 0.7936177850, -0.0040720468] as const;
const M2_1 = [1.9779984951, -2.4285922050, 0.4505937099] as const;
const M2_2 = [0.0259040371, 0.7827717662, -0.8086757660] as const;
const M2I_0 = [1.0, 0.3963377774, 0.2158037573] as const;
const M2I_1 = [1.0, -0.1055613458, -0.0638541728] as const;
const M2I_2 = [1.0, -0.0894841775, -1.2914855480] as const;
const M1I_0 = [+4.0767416621, -3.3077115913, +0.2309699292] as const;
const M1I_1 = [-1.2684380046, +2.6097574011, -0.3413193965] as const;
const M1I_2 = [-0.0041960863, -0.7034186147, +1.7076147010] as const;

export function hslToOklch(h: number, s: number, l: number): { l: number; c: number; h: number } {
  const rgb = hslToRgb(h, s, l);
  const rLin = srgbToLinear(rgb.r);
  const gLin = srgbToLinear(rgb.g);
  const bLin = srgbToLinear(rgb.b);
  const lms_l = M1_0[0] * rLin + M1_0[1] * gLin + M1_0[2] * bLin;
  const lms_m = M1_1[0] * rLin + M1_1[1] * gLin + M1_1[2] * bLin;
  const lms_s = M1_2[0] * rLin + M1_2[1] * gLin + M1_2[2] * bLin;
  const l_ = Math.cbrt(lms_l);
  const m_ = Math.cbrt(lms_m);
  const s_ = Math.cbrt(lms_s);
  const labL = M2_0[0] * l_ + M2_0[1] * m_ + M2_0[2] * s_;
  const labA = M2_1[0] * l_ + M2_1[1] * m_ + M2_1[2] * s_;
  const labB = M2_2[0] * l_ + M2_2[1] * m_ + M2_2[2] * s_;
  const chroma = Math.sqrt(labA * labA + labB * labB);
  let hue = Math.atan2(labB, labA) * 180 / Math.PI;
  if (hue < 0) hue += 360;
  return { l: labL * 100, c: chroma * 100, h: hue };
}

function oklchToLinearSrgb(lightness: number, chroma: number, hue: number): { r: number; g: number; b: number } {
  const okL = lightness / 100;
  const rawC = chroma / 100 * 0.4;
  const hRad = hue * Math.PI / 180;
  const labA = rawC * Math.cos(hRad);
  const labB = rawC * Math.sin(hRad);
  const l_ = M2I_0[0] * okL + M2I_0[1] * labA + M2I_0[2] * labB;
  const m_ = M2I_1[0] * okL + M2I_1[1] * labA + M2I_1[2] * labB;
  const s_ = M2I_2[0] * okL + M2I_2[1] * labA + M2I_2[2] * labB;
  const lms_l = l_ * l_ * l_;
  const lms_m = m_ * m_ * m_;
  const lms_s = s_ * s_ * s_;
  const rLin = M1I_0[0] * lms_l + M1I_0[1] * lms_m + M1I_0[2] * lms_s;
  const gLin = M1I_1[0] * lms_l + M1I_1[1] * lms_m + M1I_1[2] * lms_s;
  const bLin = M1I_2[0] * lms_l + M1I_2[1] * lms_m + M1I_2[2] * lms_s;
  return { r: rLin, g: gLin, b: bLin };
}

export function oklchToHsl(lightness: number, chroma: number, hue: number): { h: number; s: number; l: number } {
  const lin = oklchToLinearSrgb(lightness, chroma, hue);
  const rSrgb = Math.round(linearToSrgb(lin.r) * 255);
  const gSrgb = Math.round(linearToSrgb(lin.g) * 255);
  const bSrgb = Math.round(linearToSrgb(lin.b) * 255);
  return rgbToHsl(rSrgb, gSrgb, bSrgb);
}

export function oklchToSrgb(lightness: number, chroma: number, hue: number): { r: number; g: number; b: number } {
  const lin = oklchToLinearSrgb(lightness, chroma, hue);
  return {
    r: Math.max(0, Math.min(255, Math.round(linearToSrgb(lin.r) * 255))),
    g: Math.max(0, Math.min(255, Math.round(linearToSrgb(lin.g) * 255))),
    b: Math.max(0, Math.min(255, Math.round(linearToSrgb(lin.b) * 255))),
  };
}

/** Hex string → HSL */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return rgbToHsl(r, g, b);
}

/** Hex string → RGB */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}
