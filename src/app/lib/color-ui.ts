// UI helpers built on the engine: slider gradients, text-on-color, formatting.
import { type ChannelValues, type ColorInfo, type Space, channelDef, spaceToRgb, describe } from '@/engine/color/spaces';
import { toHex } from '@/engine/color/convert';
import { wcagContrast } from '@/engine/color/contrast';

/** CSS gradient showing the color as one channel sweeps its range (others held). */
export function channelGradient(space: Space, values: ChannelValues, key: string, steps = 12): string {
  const def = channelDef(space, key);
  if (!def) return 'transparent';
  if (key === 'alpha') {
    const { rgb } = spaceToRgb(space, values);
    const hex = toHex(rgb);
    return `linear-gradient(to right, ${hex}00, ${hex})`;
  }
  const stops: string[] = [];
  const n = def.wrap ? steps * 2 : steps;
  for (let i = 0; i <= n; i++) {
    const v = def.min + ((def.max - def.min) * i) / n;
    const { rgb } = spaceToRgb(space, { ...values, [key]: v });
    stops.push(`${toHex(rgb)} ${((i / n) * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** Black or white, whichever reads better on the given color. */
export function inkOn(info: ColorInfo | null | undefined): string {
  if (!info) return 'var(--app-fg)';
  const bg = info.alpha < 1 ? { r: info.rgb.r * info.alpha + (1 - info.alpha), g: info.rgb.g * info.alpha + (1 - info.alpha), b: info.rgb.b * info.alpha + (1 - info.alpha) } : info.rgb;
  return wcagContrast(bg, { r: 0, g: 0, b: 0 }) >= wcagContrast(bg, { r: 1, g: 1, b: 1 }) ? '#0B0B0C' : '#FFFFFF';
}

export const WHITE_INFO = describe({ r: 1, g: 1, b: 1 });
export const BLACK_INFO = describe({ r: 0, g: 0, b: 0 });

export function fmt(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '–';
  const f = n.toFixed(decimals);
  return decimals > 0 ? f.replace(/\.?0+$/, '') || '0' : f;
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
