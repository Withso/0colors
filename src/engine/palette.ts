// Palette generation: lightness follows a curve, chroma follows a mode, hue can drift.
import type { PaletteCurve, PaletteNaming, PaletteNode } from './model';
import { type ChannelValues, type ColorInfo, describe, spaceToRgb } from './color/spaces';
import { clamp, wrapHue } from './color/convert';

export interface Shade {
  index: number;
  name: string;
  /** Requested channel values in the palette's space. */
  values: ChannelValues;
  color: ColorInfo;
}

export const CURVES: Record<PaletteCurve, { label: string; fn: (t: number) => number }> = {
  linear: { label: 'Linear', fn: (t) => t },
  'ease-in': { label: 'Ease in', fn: (t) => t * t },
  'ease-out': { label: 'Ease out', fn: (t) => 1 - (1 - t) * (1 - t) },
  'ease-in-out': { label: 'Ease in-out', fn: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) },
  sine: { label: 'Sine', fn: (t) => (1 - Math.cos(Math.PI * t)) / 2 },
};

export const NAMINGS: Record<PaletteNaming, string> = {
  tailwind: '50 – 950',
  hundreds: '100, 200, …',
  index: '1, 2, 3, …',
  tone: 'Lightness value',
};

const TAILWIND = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export function stepNames(naming: PaletteNaming, count: number, lightness: number[]): string[] {
  let names: string[];
  switch (naming) {
    case 'tailwind':
      names = count === 11 ? TAILWIND.map(String)
        : count === 10 ? TAILWIND.slice(0, 10).map(String)
        : Array.from({ length: count }, (_, i) => String(Math.round((50 + (count === 1 ? 0 : (i / (count - 1)) * 900)) / 50) * 50));
      break;
    case 'hundreds':
      names = Array.from({ length: count }, (_, i) => String((i + 1) * 100));
      break;
    case 'index':
      names = Array.from({ length: count }, (_, i) => String(i + 1));
      break;
    case 'tone':
      names = lightness.map((l) => String(Math.round(l)));
      break;
  }
  // Keep names unique so tokens and exports never collide.
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = seen.get(n) ?? 0;
    seen.set(n, k + 1);
    return k === 0 ? n : `${n}-${k + 1}`;
  });
}

/** Key names of the lightness/chroma/hue channels in each palette space. */
export function paletteKeys(space: PaletteNode['data']['space']) {
  return space === 'hct' ? { l: 't', c: 'c', h: 'h' } : space === 'hsl' ? { l: 'l', c: 's', h: 'h' } : { l: 'l', c: 'c', h: 'h' };
}

export function generatePalette(data: PaletteNode['data'], base: { hue: number; chroma: number }): Shade[] {
  const count = clamp(Math.round(data.steps), 2, 24);
  const keys = paletteKeys(data.space);
  const curve = CURVES[data.curve]?.fn ?? CURVES.linear.fn;
  const lightness: number[] = [];
  const raw: ChannelValues[] = [];

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const l = clamp(data.lightStart + (data.lightEnd - data.lightStart) * curve(t), 0, 100);
    let c = base.chroma;
    if (data.chromaMode === 'taper') {
      // Gamuts narrow toward white and black, so ease chroma off at the ends.
      const dev = Math.abs(l - 50) / 50;
      c = base.chroma * (1 - 0.7 * dev * dev);
    } else if (data.chromaMode === 'manual') {
      c = data.chromaStart + (data.chromaEnd - data.chromaStart) * t;
    }
    const h = wrapHue(base.hue + data.hueShift * (t - 0.5));
    lightness.push(l);
    raw.push({ [keys.l]: l, [keys.c]: Math.max(0, c), [keys.h]: h });
  }

  const names = stepNames(data.naming, count, lightness);
  return raw.map((values, index) => {
    const { rgb, inGamut } = spaceToRgb(data.space, values);
    return { index, name: names[index], values, color: describe(rgb, 1, inGamut) };
  });
}
