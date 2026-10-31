import { describe, expect, it } from 'vitest';
import { CURVES, generatePalette, paletteKeys, stepNames } from './palette';
import { createPaletteNode } from './defaults';
import type { PaletteNode } from './model';

const data = (over: Partial<PaletteNode['data']> = {}): PaletteNode['data'] => ({
  ...createPaletteNode({ name: 'P', position: { x: 0, y: 0 } }).data,
  ...over,
});

describe('generatePalette', () => {
  it('hits lightStart and lightEnd exactly for every curve', () => {
    for (const curve of Object.keys(CURVES) as PaletteNode['data']['curve'][]) {
      const shades = generatePalette(data({ lightStart: 97, lightEnd: 22, steps: 11, curve }), { hue: 250, chroma: 0.1 });
      expect(shades).toHaveLength(11);
      expect(shades[0].values.l).toBeCloseTo(97);
      expect(shades[10].values.l).toBeCloseTo(22);
    }
  });

  it('decreases lightness monotonically on a linear curve', () => {
    const shades = generatePalette(data({ steps: 8, curve: 'linear' }), { hue: 250, chroma: 0.1 });
    for (let i = 1; i < shades.length; i++) expect(shades[i].values.l).toBeLessThan(shades[i - 1].values.l);
  });

  it('keeps chroma constant in constant mode', () => {
    const shades = generatePalette(data({ chromaMode: 'constant', steps: 5 }), { hue: 250, chroma: 0.13 });
    for (const s of shades) expect(s.values.c).toBeCloseTo(0.13);
  });

  it('tapers chroma toward white and black', () => {
    const shades = generatePalette(data({ chromaMode: 'taper', lightStart: 100, lightEnd: 0, steps: 11 }), { hue: 250, chroma: 0.2 });
    expect(shades[5].values.c).toBeCloseTo(0.2);
    expect(shades[0].values.c).toBeCloseTo(0.06);
    expect(shades[10].values.c).toBeCloseTo(0.06);
    expect(shades[0].values.c).toBeLessThan(shades[5].values.c);
  });

  it('interpolates manual chroma between its endpoints', () => {
    const shades = generatePalette(data({ chromaMode: 'manual', chromaStart: 0.05, chromaEnd: 0.15, steps: 5 }), { hue: 250, chroma: 0.3 });
    expect(shades[0].values.c).toBeCloseTo(0.05);
    expect(shades[2].values.c).toBeCloseTo(0.1);
    expect(shades[4].values.c).toBeCloseTo(0.15);
  });

  it('shifts hue symmetrically around the base hue', () => {
    const shades = generatePalette(data({ hueShift: 40, steps: 5, chromaMode: 'constant' }), { hue: 200, chroma: 0.1 });
    expect(shades[0].values.h).toBeCloseTo(180);
    expect(shades[2].values.h).toBeCloseTo(200);
    expect(shades[4].values.h).toBeCloseTo(220);
    const wrapped = generatePalette(data({ hueShift: 40, steps: 5 }), { hue: 10, chroma: 0.1 });
    expect(wrapped[0].values.h).toBeCloseTo(350);
  });

  it('clamps the step count to 2..24', () => {
    expect(generatePalette(data({ steps: 1 }), { hue: 0, chroma: 0.1 })).toHaveLength(2);
    expect(generatePalette(data({ steps: 99 }), { hue: 0, chroma: 0.1 })).toHaveLength(24);
  });

  it('produces displayable colors in every space', () => {
    for (const space of ['oklch', 'hct', 'hsl'] as const) {
      const keys = paletteKeys(space);
      const chroma = space === 'oklch' ? 0.2 : space === 'hct' ? 60 : 80;
      const shades = generatePalette(data({ space, steps: 6, chromaMode: 'constant' }), { hue: 140, chroma });
      for (const s of shades) {
        expect(s.color.hex).toMatch(/^#[0-9A-F]{6}$/);
        expect(Object.keys(s.values).sort()).toEqual([keys.c, keys.h, keys.l].sort());
      }
    }
  });

  it('places HCT shades on the requested tone', () => {
    const shades = generatePalette(data({ space: 'hct', lightStart: 90, lightEnd: 10, steps: 5, chromaMode: 'constant' }), { hue: 260, chroma: 30 });
    expect(shades[0].color.hct.t).toBeCloseTo(90, 0);
    expect(shades[4].color.hct.t).toBeCloseTo(10, 0);
  });
});

describe('stepNames', () => {
  it('uses Tailwind names for 11 and 10 steps', () => {
    expect(stepNames('tailwind', 11, [])).toEqual(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']);
    expect(stepNames('tailwind', 10, [])).toEqual(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']);
  });

  it('spreads Tailwind-style names for other counts', () => {
    expect(stepNames('tailwind', 5, [])).toEqual(['50', '300', '500', '750', '950']);
    expect(stepNames('tailwind', 3, [])).toEqual(['50', '500', '950']);
  });

  it('supports hundreds, index and tone naming', () => {
    expect(stepNames('hundreds', 3, [])).toEqual(['100', '200', '300']);
    expect(stepNames('index', 3, [])).toEqual(['1', '2', '3']);
    expect(stepNames('tone', 3, [97.4, 50.5, 22])).toEqual(['97', '51', '22']);
  });

  it('keeps names unique', () => {
    expect(stepNames('tone', 3, [50, 50, 50])).toEqual(['50', '50-2', '50-3']);
  });
});

describe('paletteKeys', () => {
  it('maps lightness/chroma/hue to each space’s channel keys', () => {
    expect(paletteKeys('oklch')).toEqual({ l: 'l', c: 'c', h: 'h' });
    expect(paletteKeys('hct')).toEqual({ l: 't', c: 'c', h: 'h' });
    expect(paletteKeys('hsl')).toEqual({ l: 'l', c: 's', h: 'h' });
  });
});
