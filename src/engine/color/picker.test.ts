import { describe, expect, it } from 'vitest';
import { isInGamut, oklchToRgb } from './convert';
import { hctToRgb } from './hct';
import { type PickerSpace, pickerGamutEdge, pickerPlane, renderPickerPlane } from './picker';
import { channelDef, spaceToRgb } from './spaces';

const pixel = (pixels: Uint8ClampedArray, width: number, x: number, y: number) =>
  Array.from(pixels.slice((y * width + x) * 4, (y * width + x + 1) * 4));

describe('pickerPlane', () => {
  it.each([
    ['oklch', 'oklch', 'c', 0.4, 'l'],
    ['hct', 'hct', 'c', 150, 't'],
    ['hsl', 'hsl', 's', 100, 'l'],
    ['rgb', 'hsl', 's', 100, 'l'],
  ] as const)('uses the editable channel ranges for %s', (input, space, x, max, y) => {
    const plane = pickerPlane(input);
    expect(plane).toEqual({ space, x: { key: x, min: 0, max }, y: { key: y, min: 0, max: 100 } });
    for (const axis of [plane.x, plane.y]) {
      const def = channelDef(space, axis.key)!;
      expect([axis.min, axis.max]).toEqual([def.min, def.max]);
    }
  });

  it('does not expose shared mutable channel definitions', () => {
    const plane = pickerPlane('oklch');
    plane.x.max = 10;
    expect(pickerPlane('oklch').x.max).toBe(0.4);
    expect(channelDef('oklch', 'c')!.max).toBe(0.4);
  });
});

describe('renderPickerPlane', () => {
  it('draws white at the top, black at the bottom and saturation left to right', () => {
    const pixels = renderPickerPlane(pickerPlane('hsl'), 0, 3, 3);
    expect(pixels).toBeInstanceOf(Uint8ClampedArray);
    expect(pixels.length).toBe(36);
    for (let x = 0; x < 3; x++) {
      expect(pixel(pixels, 3, x, 0)).toEqual([255, 255, 255, 255]);
      expect(pixel(pixels, 3, x, 2)).toEqual([0, 0, 0, 255]);
    }
    expect(pixel(pixels, 3, 0, 1)).toEqual([128, 128, 128, 255]);
    expect(pixel(pixels, 3, 1, 1)).toEqual([191, 64, 64, 255]);
    expect(pixel(pixels, 3, 2, 1)).toEqual([255, 0, 0, 255]);
  });

  it('keeps each space’s perceptual vertical scale', () => {
    const oklch = renderPickerPlane(pickerPlane('oklch'), 30, 1, 3);
    const hct = renderPickerPlane(pickerPlane('hct'), 30, 1, 3);
    expect(pixel(oklch, 1, 0, 1)).toEqual([99, 99, 99, 255]);
    expect(pixel(hct, 1, 0, 1)).toEqual([119, 119, 119, 255]);
    for (const pixels of [oklch, hct]) {
      expect(pixel(pixels, 1, 0, 0)).toEqual([255, 255, 255, 255]);
      expect(pixel(pixels, 1, 0, 2)).toEqual([0, 0, 0, 255]);
    }
  });

  it('dims mapped OKLCH samples without changing their displayed RGB', () => {
    const pixels = renderPickerPlane(pickerPlane('oklch'), 150, 5, 11);
    const sample = spaceToRgb('oklch', { h: 150, l: 70, c: 0.4 });
    expect(sample.inGamut).toBe(false);
    expect(pixel(pixels, 5, 4, 3)).toEqual([
      Math.round(sample.rgb.r * 255), Math.round(sample.rgb.g * 255), Math.round(sample.rgb.b * 255), 90,
    ]);
    expect(pixel(pixels, 5, 1, 3)[3]).toBe(255);
    expect(pixel(pixels, 5, 4, 0)).toEqual([255, 255, 255, 90]);
    expect(pixel(pixels, 5, 4, 10)).toEqual([0, 0, 0, 90]);
  });

  it('uses the HCT solver and the same chroma tolerance as the engine', () => {
    const pixels = renderPickerPlane(pickerPlane('hct'), 264, 16, 3);
    const sample = spaceToRgb('hct', { h: 264, c: 150, t: 50 });
    expect(sample.inGamut).toBe(false);
    expect(pixel(pixels, 16, 15, 1)).toEqual([
      Math.round(sample.rgb.r * 255), Math.round(sample.rgb.g * 255), Math.round(sample.rgb.b * 255), 90,
    ]);
    expect(pixel(pixels, 16, 2, 1)[3]).toBe(255);
  });

  it.each(['oklch', 'hct', 'hsl'] as const)('matches spaceToRgb across a %s plane', (space) => {
    const plane = pickerPlane(space);
    const width = 7;
    const height = 9;
    const pixels = renderPickerPlane(plane, 42, width, height, 37);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const expected = spaceToRgb(space, {
        h: 42,
        [plane.x.key]: plane.x.max * x / (width - 1),
        [plane.y.key]: plane.y.max * (1 - y / (height - 1)),
      });
      expect(pixel(pixels, width, x, y)).toEqual([
        Math.round(expected.rgb.r * 255), Math.round(expected.rgb.g * 255), Math.round(expected.rgb.b * 255), expected.inGamut ? 255 : 37,
      ]);
    }
  });

  it.each(['oklch', 'hct', 'hsl'] as const)('wraps %s hues and normalizes nonfinite hue', (space) => {
    const plane = pickerPlane(space);
    expect(renderPickerPlane(plane, -30, 5, 5)).toEqual(renderPickerPlane(plane, 330, 5, 5));
    expect(renderPickerPlane(plane, 690, 5, 5)).toEqual(renderPickerPlane(plane, 330, 5, 5));
    expect(renderPickerPlane(plane, NaN, 5, 5)).toEqual(renderPickerPlane(plane, 0, 5, 5));
  });

  it('supports cropped plane ranges and single-pixel dimensions', () => {
    const plane = pickerPlane('hsl');
    plane.x.min = 50;
    plane.y.max = 50;
    const pixels = renderPickerPlane(plane, 120, 2, 2);
    expect(pixel(pixels, 2, 0, 0)).toEqual([64, 191, 64, 255]);
    expect(pixel(pixels, 2, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(renderPickerPlane(plane, 120, 1, 1)).toEqual(new Uint8ClampedArray([64, 191, 64, 255]));
  });

  it.each([[0, 4], [4, 0], [-1, 4], [4, -1], [NaN, 2], [2, Infinity]])('returns an empty raster for dimensions %s × %s', (width, height) => {
    expect(renderPickerPlane(pickerPlane('oklch'), 40, width, height)).toHaveLength(0);
  });

  it('floors fractional dimensions and clamps the out-of-gamut alpha byte', () => {
    const plane = pickerPlane('oklch');
    expect(renderPickerPlane(plane, 0, 3.9, 2.5)).toHaveLength(24);
    expect(pixel(renderPickerPlane(plane, 0, 2, 1, -1), 2, 1, 0)[3]).toBe(0);
    expect(pixel(renderPickerPlane(plane, 0, 2, 1, 900), 2, 1, 0)[3]).toBe(255);
    expect(pixel(renderPickerPlane(plane, 0, 2, 1, NaN), 2, 1, 0)[3]).toBe(90);
    expect(pixel(renderPickerPlane(plane, 0, 2, 1, 37.6), 2, 1, 0)[3]).toBe(38);
  });

  it('returns fresh buffers without mutating the plane', () => {
    const plane = pickerPlane('hsl');
    const before = structuredClone(plane);
    const a = renderPickerPlane(plane, 20, 2, 2);
    const b = renderPickerPlane(plane, 20, 2, 2);
    a[0] = 0;
    expect(b[0]).toBe(255);
    expect(plane).toEqual(before);
  });
});

describe('pickerGamutEdge', () => {
  it.each(['hsl', 'rgb'] as const)('has no out-of-gamut edge for %s', (space) => {
    expect(pickerGamutEdge(pickerPlane(space), 200, 40)).toEqual([]);
  });

  it.each(['oklch', 'hct'] as const)('orders %s rows top to bottom and bounds chroma', (space) => {
    const plane = pickerPlane(space);
    for (const hue of [0, 30, 90, 150, 210, 264, 330]) {
      const edge = pickerGamutEdge(plane, hue, 21);
      expect(edge).toHaveLength(21);
      expect(edge.map((point) => point.y)).toEqual(Array.from({ length: 21 }, (_, i) => 100 - i * 5));
      expect(edge.every((p) => Number.isFinite(p.x) && p.x >= plane.x.min && p.x <= plane.x.max)).toBe(true);
      expect(edge.at(-1)!.x).toBeCloseTo(0, 5);
    }
  });

  it('finds the OKLCH boundary with displayable colors on the inside', () => {
    const edge = pickerGamutEdge(pickerPlane('oklch'), 264, 11);
    for (const { x: c, y } of edge.slice(1, -1)) {
      expect(isInGamut(oklchToRgb({ h: 264, l: y / 100, c }))).toBe(true);
      expect(isInGamut(oklchToRgb({ h: 264, l: y / 100, c: c + 0.001 }), 0)).toBe(false);
    }
  });

  it('finds the HCT solver’s maximum achievable chroma', () => {
    for (const { x, y } of pickerGamutEdge(pickerPlane('hct'), 30, 11)) {
      const mapped = hctToRgb({ h: 30, c: 150, t: y });
      expect(x).toBeCloseTo(mapped.achieved, 5);
      expect(spaceToRgb('hct', { h: 30, c: x + 1, t: y }).inGamut).toBe(false);
    }
  });

  it('clips the edge to a cropped chroma range', () => {
    const plane = pickerPlane('oklch');
    plane.x.max = 0.05;
    expect(pickerGamutEdge(plane, 150, 3)[1].x).toBe(0.05);
  });

  it('handles empty, fractional and single-row requests', () => {
    const plane = pickerPlane('oklch');
    for (const n of [0, -2, NaN, Infinity]) expect(pickerGamutEdge(plane, 0, n)).toEqual([]);
    expect(pickerGamutEdge(plane, 0, 2.9)).toHaveLength(2);
    expect(pickerGamutEdge(plane, 0, 1)).toEqual([{ y: 100, x: 0 }]);
    expect(pickerGamutEdge(plane, -30, 9)).toEqual(pickerGamutEdge(plane, 330, 9));
  });
});

describe('picker rendering performance smoke', () => {
  it.each([
    ['oklch', 128, 80, 20], ['hsl', 128, 80, 10], ['hct', 64, 40, 60],
  ] satisfies [PickerSpace, number, number, number][])('renders %s interactively', (space, width, height, budget) => {
    const plane = pickerPlane(space);
    for (let i = 0; i < 3; i++) renderPickerPlane(plane, i * 60, width, height);
    const timings = Array.from({ length: 5 }, (_, i) => {
      const start = performance.now();
      const pixels = renderPickerPlane(plane, 30 + i * 60, width, height);
      const elapsed = performance.now() - start;
      expect(pixels.length).toBe(width * height * 4);
      return elapsed;
    });
    // Leave headroom for concurrent workers; this smoke test catches major regressions.
    // A dedicated benchmark measures the stricter interactive target without runner contention.
    expect(Math.min(...timings)).toBeLessThan(budget);
  });
});
