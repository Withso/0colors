import React, { useMemo } from 'react';
import './OklchGamutSlider.css';

interface OklchGamutSliderProps {
  type: 'lightness' | 'chroma' | 'hue';
  value: number;
  lightness: number;
  chroma: number;
  hue: number;
  onChange: (value: number) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
}

// Convert OKLCH to RGB to check if color is in sRGB gamut
function oklchToRgb(L: number, C: number, H: number): { r: number; g: number; b: number; inGamut: boolean } {
  // Convert to radians
  const hRad = (H * Math.PI) / 180;
  
  // Convert LCH to Lab
  const a = C * Math.cos(hRad);
  const b_lab = C * Math.sin(hRad);
  
  // OKLab to linear RGB
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b_lab;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b_lab;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b_lab;
  
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  
  const r_linear = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g_linear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b_linear = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  
  // Convert linear RGB to sRGB
  const toSrgb = (val: number) => {
    if (val <= 0.0031308) return 12.92 * val;
    return 1.055 * Math.pow(val, 1 / 2.4) - 0.055;
  };
  
  const r = toSrgb(r_linear);
  const g = toSrgb(g_linear);
  const b = toSrgb(b_linear);
  
  // Check if color is in gamut (all RGB values between 0 and 1)
  const inGamut = r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1;
  
  return {
    r: Math.max(0, Math.min(255, Math.round(r * 255))),
    g: Math.max(0, Math.min(255, Math.round(g * 255))),
    b: Math.max(0, Math.min(255, Math.round(b * 255))),
    inGamut
  };
}

export function OklchGamutSlider({
  type,
  value,
  lightness,
  chroma,
  hue,
  onChange,
  onMouseDown,
  onMouseMove,
  disabled,
  className = ''
}: OklchGamutSliderProps) {
  
  // Generate gradient with gamut clipping
  const gradientStyle = useMemo(() => {
    const stops: string[] = [];
    const numStops = 40; // Increased for smoother gradient
    
    if (type === 'lightness') {
      // Lightness: 0-100
      for (let i = 0; i <= numStops; i++) {
        const L = (i / numStops) * 100;
        const C = chroma / 100 * 0.4; // Convert from 0-100 to 0-0.4
        const { r, g, b, inGamut } = oklchToRgb(L / 100, C, hue);
        
        if (inGamut) {
          stops.push(`rgb(${r}, ${g}, ${b}) ${(i / numStops) * 100}%`);
        } else {
          // Out of gamut - show as transparent
          stops.push(`rgba(${r}, ${g}, ${b}, 0) ${(i / numStops) * 100}%`);
        }
      }
    } else if (type === 'chroma') {
      // Chroma: 0-100 (maps to 0-0.4 in OKLCH)
      for (let i = 0; i <= numStops; i++) {
        const C = (i / numStops) * 0.4;
        const L = lightness / 100;
        const { r, g, b, inGamut } = oklchToRgb(L, C, hue);
        
        if (inGamut) {
          stops.push(`rgb(${r}, ${g}, ${b}) ${(i / numStops) * 100}%`);
        } else {
          // Out of gamut - show as transparent
          stops.push(`rgba(${r}, ${g}, ${b}, 0) ${(i / numStops) * 100}%`);
        }
      }
    } else if (type === 'hue') {
      // Hue: 0-360
      for (let i = 0; i <= numStops; i++) {
        const H = (i / numStops) * 360;
        const L = lightness / 100;
        const C = chroma / 100 * 0.4;
        const { r, g, b, inGamut } = oklchToRgb(L, C, H);
        
        if (inGamut) {
          stops.push(`rgb(${r}, ${g}, ${b}) ${(i / numStops) * 100}%`);
        } else {
          // Out of gamut - show as transparent
          stops.push(`rgba(${r}, ${g}, ${b}, 0) ${(i / numStops) * 100}%`);
        }
      }
    }
    
    return {
      background: `linear-gradient(to right, ${stops.join(', ')})`,
    };
  }, [type, lightness, chroma, hue]);
  
  // Calculate current color for thumb
  const thumbColor = useMemo(() => {
    const L = lightness / 100;
    const C = chroma / 100 * 0.4;
    const { r, g, b } = oklchToRgb(L, C, hue);
    return `rgb(${r}, ${g}, ${b})`;
  }, [lightness, chroma, hue]);
  
  // Get min/max values for slider
  const min = 0;
  const max = type === 'hue' ? 360 : 100;
  
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      disabled={disabled}
      className={`gamut-slider-input color-slider ${className}`}
      style={{
        ...gradientStyle,
        '--slider-thumb-color': thumbColor,
      } as React.CSSProperties}
    />
  );
}