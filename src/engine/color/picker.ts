import { clamp, wrapHue } from './convert';
import { oklchChromaMapper, oklchMaxChroma } from './gamut';
import { hctMaxChroma } from './hct';
import { type ChannelValues, type Space, channelDef, spaceToRgb } from './spaces';

export type PickerSpace = 'oklch' | 'hct' | 'hsl';
export interface PickerAxis { key: string; min: number; max: number }
export interface PickerPlane { space: PickerSpace; x: PickerAxis; y: PickerAxis }

/** Channel units, with y.max at the top. RGB editing uses the HSL plane. */
export function pickerPlane(space: Space): PickerPlane {
  const target = space === 'rgb' ? 'hsl' : space;
  const axis = (key: string): PickerAxis => {
    const def = channelDef(target, key)!;
    return { key, min: def.min, max: def.max };
  };
  return { space: target, x: axis(target === 'hsl' ? 's' : 'c'), y: axis(target === 'hct' ? 't' : 'l') };
}

const count = (n: number) => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
const hueAngle = (hue: number) => Number.isFinite(hue) ? wrapHue(hue) : 0;

/**
 * Row-major sRGB bytes. Dimensions are floored; nonpositive/nonfinite sizes are empty.
 * A single row samples y.max; a single column samples x.min.
 */
export function renderPickerPlane(plane: PickerPlane, hue: number, width: number, height: number, outAlpha = 90): Uint8ClampedArray {
  const w = count(width);
  const h = count(height);
  const pixels = new Uint8ClampedArray(w * h * 4);
  if (!w || !h) return pixels;
  const alpha = Math.round(clamp(Number.isFinite(outAlpha) ? outAlpha : 90, 0, 255));
  const dx = (plane.x.max - plane.x.min) / Math.max(1, w - 1);
  const dy = (plane.y.max - plane.y.min) / Math.max(1, h - 1);
  const values: ChannelValues = { h: hueAngle(hue) };
  let offset = 0;
  for (let row = 0; row < h; row++) {
    values[plane.y.key] = plane.y.max - row * dy;
    const mapChroma = plane.space === 'oklch' ? oklchChromaMapper(values.l / 100, values.h) : null;
    for (let col = 0; col < w; col++) {
      values[plane.x.key] = plane.x.min + col * dx;
      const { rgb, inGamut } = mapChroma
        ? mapChroma(Math.max(0, values.c))
        : spaceToRgb(plane.space, values);
      pixels[offset++] = Math.round(rgb.r * 255);
      pixels[offset++] = Math.round(rgb.g * 255);
      pixels[offset++] = Math.round(rgb.b * 255);
      pixels[offset++] = inGamut ? 255 : alpha;
    }
  }
  return pixels;
}

/** sRGB's chroma boundary, in channel units and clipped to the visible plane. */
export function pickerGamutEdge(plane: PickerPlane, hue: number, rows: number): { y: number; x: number }[] {
  if (plane.space === 'hsl') return [];
  const n = count(rows);
  const h = hueAngle(hue);
  const dy = (plane.y.max - plane.y.min) / Math.max(1, n - 1);
  return Array.from({ length: n }, (_, row) => {
    const y = plane.y.max - row * dy;
    const max = plane.space === 'oklch' ? oklchMaxChroma(y / 100, h) : hctMaxChroma(h, y);
    return { y, x: clamp(max, plane.x.min, plane.x.max) };
  });
}
