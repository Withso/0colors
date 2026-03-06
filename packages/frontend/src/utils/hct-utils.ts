// HCT (Hue, Chroma, Tone) color space utilities
// Uses official Material Design 3 library

import { Hct, hexFromArgb, argbFromHex } from "@material/material-color-utilities";

export function rgbToHct(r: number, g: number, b: number): { h: number; c: number; t: number } {
  // Convert RGB to hex string
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const hexString = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  
  // Convert to ARGB integer
  const argb = argbFromHex(hexString);
  
  // Convert to HCT
  const hct = Hct.fromInt(argb);
  
  return {
    h: Math.round(hct.hue * 10) / 10,
    c: Math.round(hct.chroma * 10) / 10,
    t: Math.round(hct.tone * 10) / 10
  };
}

export function hctToRgb(hue: number, chroma: number, tone: number): { r: number; g: number; b: number } {
  // Normalize values
  hue = ((hue % 360) + 360) % 360;
  chroma = Math.max(0, chroma);
  tone = Math.max(0, Math.min(100, tone));
  
  // Create HCT and convert to ARGB
  const hct = Hct.from(hue, chroma, tone);
  const argb = hct.toInt();
  
  // Extract RGB from ARGB integer
  const r = (argb >> 16) & 0xFF;
  const g = (argb >> 8) & 0xFF;
  const b = argb & 0xFF;
  
  return { r, g, b };
}

export function hctToHex(hue: number, chroma: number, tone: number): string {
  // Normalize values
  hue = ((hue % 360) + 360) % 360;
  chroma = Math.max(0, chroma);
  tone = Math.max(0, Math.min(100, tone));
  
  // Create HCT and convert to hex
  const hct = Hct.from(hue, chroma, tone);
  const argb = hct.toInt();
  const hexString = hexFromArgb(argb);
  
  return hexString.toUpperCase();
}

export function hexToHct(hex: string): { h: number; c: number; t: number } {
  // Ensure hex has # prefix
  const hexString = hex.startsWith('#') ? hex : `#${hex}`;
  
  // Convert to ARGB integer
  const argb = argbFromHex(hexString);
  
  // Convert to HCT
  const hct = Hct.fromInt(argb);
  
  return {
    h: Math.round(hct.hue * 10) / 10,
    c: Math.round(hct.chroma * 10) / 10,
    t: Math.round(hct.tone * 10) / 10
  };
}

/**
 * Get the maximum achievable chroma in sRGB gamut for a given HCT hue and tone.
 * Uses the Material Color Utilities library's built-in gamut mapping:
 * requesting an impossibly high chroma returns the gamut-clamped result.
 */
export function getMaxChroma(hue: number, tone: number): number {
  hue = ((hue % 360) + 360) % 360;
  tone = Math.max(0, Math.min(100, tone));
  // Request a very high chroma; the library clamps to the max achievable
  const hct = Hct.from(hue, 200, tone);
  return Math.round(hct.chroma * 10) / 10;
}