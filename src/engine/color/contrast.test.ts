import { describe, expect, it } from 'vitest';
import { apcaContrast, apcaGuidance, relativeLuminance, wcagContrast, wcagGrade } from './contrast';

const black = { r: 0, g: 0, b: 0 };
const white = { r: 1, g: 1, b: 1 };
const rgb = (r: number, g: number, b: number) => ({ r: r / 255, g: g / 255, b: b / 255 });

describe('WCAG 2', () => {
  it('relative luminance of the extremes', () => {
    expect(relativeLuminance(black)).toBe(0);
    expect(relativeLuminance(white)).toBeCloseTo(1, 9);
    expect(relativeLuminance(rgb(128, 128, 128))).toBeCloseTo(0.2158605, 5);
  });

  it('contrast ratio is 21 for black/white, 1 for identical, and symmetric', () => {
    expect(wcagContrast(black, white)).toBeCloseTo(21, 6);
    expect(wcagContrast(white, black)).toBeCloseTo(21, 6);
    const c = rgb(59, 130, 246);
    expect(wcagContrast(c, c)).toBeCloseTo(1, 9);
    expect(wcagContrast(c, white)).toBeCloseTo(wcagContrast(white, c), 9);
    // #767676 on white is the classic "just passes AA" gray.
    expect(wcagContrast(rgb(0x76, 0x76, 0x76), white)).toBeCloseTo(4.54, 2);
  });

  it('grades thresholds', () => {
    expect(wcagGrade(2.9)).toEqual({ aa: false, aaLarge: false, aaa: false, aaaLarge: false });
    expect(wcagGrade(3)).toEqual({ aa: false, aaLarge: true, aaa: false, aaaLarge: false });
    expect(wcagGrade(4.5)).toEqual({ aa: true, aaLarge: true, aaa: false, aaaLarge: true });
    expect(wcagGrade(7)).toEqual({ aa: true, aaLarge: true, aaa: true, aaaLarge: true });
  });
});

describe('APCA', () => {
  it('matches the reference values for black/white', () => {
    expect(apcaContrast(black, white)).toBeCloseTo(106.04, 1);
    expect(apcaContrast(white, black)).toBeCloseTo(-107.88, 1);
  });

  it('is polarity-aware and zero for equal colors', () => {
    const gray = rgb(136, 136, 136);
    expect(apcaContrast(black, gray)).toBeGreaterThan(0);
    expect(apcaContrast(gray, black)).toBeLessThan(0);
    expect(apcaContrast(gray, gray)).toBe(0);
    // Reference pair from the APCA docs: #888 text on #fff ≈ Lc 63.06.
    expect(apcaContrast(gray, white)).toBeCloseTo(63.06, 0);
  });

  it('guidance buckets by absolute Lc', () => {
    expect(apcaGuidance(95)).toBe('Ideal for body text');
    expect(apcaGuidance(-80)).toBe('Fine for body text');
    expect(apcaGuidance(62)).toBe('Large or bold text');
    expect(apcaGuidance(50)).toBe('Headlines and big text only');
    expect(apcaGuidance(-35)).toBe('Placeholder, disabled or non-text');
    expect(apcaGuidance(20)).toBe('Dividers and decoration only');
    expect(apcaGuidance(5)).toBe('Practically invisible');
  });
});
