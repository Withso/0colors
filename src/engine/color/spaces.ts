// Editable color spaces, their channels, and conversions to/from displayable sRGB.
import {
  type HSL, type OKLCH, type RGB, clamp, hslToRgb, rgbToHsl, rgbToOklch, toHex, toRgb255, wrapHue,
} from './convert';
import { oklchToSrgbMapped } from './gamut';
import { type HCT, hctToRgb, rgbToHct } from './hct';
import { relativeLuminance } from './contrast';

export type Space = 'oklch' | 'hct' | 'hsl' | 'rgb';
export type ChannelValues = Record<string, number>;

export interface ChannelDef {
  key: string;
  label: string;
  short: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
  unit?: string;
  wrap?: boolean;
  hint: string;
}

const hue = (hint: string): ChannelDef => ({
  key: 'h', label: 'Hue', short: 'H', min: 0, max: 360, step: 0.5, decimals: 1, unit: '°', wrap: true, hint,
});

export const SPACES: Record<Space, { label: string; blurb: string; channels: ChannelDef[] }> = {
  oklch: {
    label: 'OKLCH',
    blurb: 'Perceptual space used by modern CSS. Equal steps in L look like equal steps in lightness.',
    channels: [
      { key: 'l', label: 'Lightness', short: 'L', min: 0, max: 100, step: 0.1, decimals: 1, unit: '%', hint: 'Perceived lightness, from black (0) to white (100).' },
      { key: 'c', label: 'Chroma', short: 'C', min: 0, max: 0.4, step: 0.001, decimals: 3, hint: 'Colorfulness. 0 is gray; sRGB tops out around 0.37 depending on hue.' },
      hue('Angle on the OKLab color wheel. Unlike HSL, the same L stays equally light across hues.'),
    ],
  },
  hct: {
    label: 'HCT',
    blurb: 'Material Design 3 space. Tone matches CIE L*, so tone differences predict contrast.',
    channels: [
      hue('CAM16 hue angle — how humans name the color.'),
      { key: 'c', label: 'Chroma', short: 'C', min: 0, max: 150, step: 0.5, decimals: 1, hint: 'Colorfulness. Very high values only fit in sRGB at certain hues and tones.' },
      { key: 't', label: 'Tone', short: 'T', min: 0, max: 100, step: 0.5, decimals: 1, hint: 'Perceived lightness (CIE L*). A tone gap of 40+ usually means 3:1 contrast, 50+ means 4.5:1.' },
    ],
  },
  hsl: {
    label: 'HSL',
    blurb: 'Simple geometric model of sRGB. Easy to reason about, but its lightness is not perceptual.',
    channels: [
      hue('Position on the RGB color wheel.'),
      { key: 's', label: 'Saturation', short: 'S', min: 0, max: 100, step: 0.5, decimals: 1, unit: '%', hint: 'Distance from gray, relative to the most vivid color at this lightness.' },
      { key: 'l', label: 'Lightness', short: 'L', min: 0, max: 100, step: 0.5, decimals: 1, unit: '%', hint: 'Geometric lightness. Yellow at 50% looks far brighter than blue at 50%.' },
    ],
  },
  rgb: {
    label: 'RGB',
    blurb: 'How screens mix light: red, green and blue intensities in sRGB.',
    channels: [
      { key: 'r', label: 'Red', short: 'R', min: 0, max: 255, step: 1, decimals: 0, hint: 'Red light intensity.' },
      { key: 'g', label: 'Green', short: 'G', min: 0, max: 255, step: 1, decimals: 0, hint: 'Green light intensity. Our eyes are most sensitive to green.' },
      { key: 'b', label: 'Blue', short: 'B', min: 0, max: 255, step: 1, decimals: 0, hint: 'Blue light intensity. Contributes the least to perceived lightness.' },
    ],
  },
};

export const ALPHA: ChannelDef = {
  key: 'alpha', label: 'Alpha', short: 'A', min: 0, max: 100, step: 1, decimals: 0, unit: '%',
  hint: 'Opacity. Translucent colors depend on whatever sits behind them.',
};

export const SPACE_ORDER: Space[] = ['oklch', 'hct', 'hsl', 'rgb'];

export function channelDefs(space: Space, withAlpha = true): ChannelDef[] {
  return withAlpha ? [...SPACES[space].channels, ALPHA] : SPACES[space].channels;
}

export function channelDef(space: Space, key: string): ChannelDef | undefined {
  return key === 'alpha' ? ALPHA : SPACES[space].channels.find((c) => c.key === key);
}

/** Keep a channel inside its range: hues wrap around, everything else clamps. */
export function constrainChannel(def: ChannelDef, value: number): number {
  if (!Number.isFinite(value)) return def.min;
  return def.wrap ? wrapHue(value) : clamp(value, def.min, def.max);
}

/** Convert displayable sRGB into a space's channel values (no alpha). */
export function rgbToSpace(space: Space, rgb: RGB): ChannelValues {
  switch (space) {
    case 'oklch': {
      const v = rgbToOklch(rgb);
      return { l: v.l * 100, c: v.c, h: v.h };
    }
    case 'hct': {
      const v = rgbToHct(rgb);
      return { h: v.h, c: v.c, t: v.t };
    }
    case 'hsl': {
      const v = rgbToHsl(rgb);
      return { h: v.h, s: v.s, l: v.l };
    }
    case 'rgb':
      return { r: rgb.r * 255, g: rgb.g * 255, b: rgb.b * 255 };
  }
}

/** Convert channel values into displayable sRGB, mapping out-of-gamut colors. */
export function spaceToRgb(space: Space, v: ChannelValues): { rgb: RGB; inGamut: boolean } {
  switch (space) {
    case 'oklch':
      return oklchToSrgbMapped({ l: (v.l ?? 0) / 100, c: Math.max(0, v.c ?? 0), h: v.h ?? 0 });
    case 'hct': {
      const { rgb, achieved } = hctToRgb({ h: v.h ?? 0, c: v.c ?? 0, t: v.t ?? 0 });
      return { rgb, inGamut: achieved >= (v.c ?? 0) - 0.5 };
    }
    case 'hsl':
      return { rgb: hslToRgb({ h: v.h ?? 0, s: v.s ?? 0, l: v.l ?? 0 }), inGamut: true };
    case 'rgb':
      return {
        rgb: { r: clamp(v.r ?? 0, 0, 255) / 255, g: clamp(v.g ?? 0, 0, 255) / 255, b: clamp(v.b ?? 0, 0, 255) / 255 },
        inGamut: true,
      };
  }
}

/** Everything the UI and formulas need to know about a resolved color. */
export interface ColorInfo {
  rgb: RGB;
  alpha: number; // 0..1
  hex: string; // #RRGGBB
  hexa: string; // #RRGGBBAA when translucent, otherwise #RRGGBB
  rgb255: { r: number; g: number; b: number };
  hsl: HSL;
  oklch: OKLCH; // l 0..1
  hct: HCT;
  luminance: number;
  inGamut: boolean;
}

export function describe(rgb: RGB, alpha = 1, inGamut = true): ColorInfo {
  return {
    rgb,
    alpha,
    hex: toHex(rgb),
    hexa: toHex(rgb, alpha),
    rgb255: toRgb255(rgb),
    hsl: rgbToHsl(rgb),
    oklch: rgbToOklch(rgb),
    hct: rgbToHct(rgb),
    luminance: relativeLuminance(rgb),
    inGamut,
  };
}

/** Channel values of an already-resolved color, expressed in a given space. */
export function infoToSpace(space: Space, info: ColorInfo): ChannelValues {
  switch (space) {
    case 'oklch':
      return { l: info.oklch.l * 100, c: info.oklch.c, h: info.oklch.h };
    case 'hct':
      return { h: info.hct.h, c: info.hct.c, t: info.hct.t };
    case 'hsl':
      return { h: info.hsl.h, s: info.hsl.s, l: info.hsl.l };
    case 'rgb':
      return { r: info.rgb.r * 255, g: info.rgb.g * 255, b: info.rgb.b * 255 };
  }
}

export function formatChannel(def: ChannelDef, value: number): string {
  // Values that round to zero would otherwise print as "-0".
  const v = Math.abs(value) < 0.5 * 10 ** -def.decimals ? 0 : value;
  const fixed = v.toFixed(def.decimals);
  return def.decimals > 0 ? fixed.replace(/\.?0+$/, '') || '0' : fixed;
}

/** CSS color string in the given notation. */
export function cssColor(info: ColorInfo, format: 'hex' | 'oklch' | 'hsl' | 'rgb' = 'hex'): string {
  const a = info.alpha < 0.999 ? ` / ${round(info.alpha * 100, 1)}%` : '';
  switch (format) {
    case 'oklch':
      return `oklch(${round(info.oklch.l * 100, 2)}% ${round(info.oklch.c, 4)} ${round(info.oklch.h, 2)}${a})`;
    case 'hsl':
      return `hsl(${round(info.hsl.h, 1)} ${round(info.hsl.s, 1)}% ${round(info.hsl.l, 1)}%${a})`;
    case 'rgb':
      return `rgb(${info.rgb255.r} ${info.rgb255.g} ${info.rgb255.b}${a})`;
    default:
      return info.hexa;
  }
}

export function round(v: number, decimals: number): number {
  const p = 10 ** decimals;
  return Math.round(v * p) / p;
}
