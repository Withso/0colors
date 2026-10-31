// A tiny, dependency-free color namer used for default node names ("Light Teal").
import { type RGB, rgbToOklch } from './convert';

const HUES: [number, string][] = [
  [27, 'Red'], [52, 'Orange'], [75, 'Amber'], [102, 'Yellow'], [126, 'Lime'], [145, 'Green'],
  [162, 'Emerald'], [182, 'Teal'], [205, 'Cyan'], [232, 'Sky'], [262, 'Blue'], [280, 'Indigo'],
  [298, 'Violet'], [314, 'Purple'], [332, 'Magenta'], [354, 'Pink'],
];

export function nameColor(rgb: RGB): string {
  const { l, c, h } = rgbToOklch(rgb);
  if (c < 0.025) {
    if (l > 0.97) return 'White';
    if (l < 0.16) return 'Black';
    return l > 0.75 ? 'Light Gray' : l < 0.4 ? 'Dark Gray' : 'Gray';
  }
  let best = HUES[0];
  let bestDist = 999;
  for (const entry of HUES) {
    const d = Math.min(Math.abs(entry[0] - h), 360 - Math.abs(entry[0] - h));
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  let base = best[1];
  if ((base === 'Orange' || base === 'Amber') && l < 0.55) base = 'Brown';
  const prefix = l > 0.86 ? 'Pale ' : l > 0.72 ? 'Light ' : l < 0.36 ? 'Deep ' : l < 0.5 ? 'Dark ' : '';
  const muted = c < 0.06 && base !== 'Brown' ? 'Muted ' : '';
  return `${prefix}${muted}${base}`.trim();
}
