import React, { useRef, useCallback, useState, useEffect } from 'react';
import './DualRangeSlider.css';

interface DualRangeSliderProps {
  min: number;
  max: number;
  valueStart: number;
  valueEnd: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  /** Gradient fill between the two thumbs */
  fillStyle?: string;
  /** Optional dot markers rendered on the track */
  markers?: { position: number; color: string }[];
}

/**
 * A custom dual-thumb range slider built with div-based thumbs
 * and pointer event handling. Replaces overlapping native <input type="range">
 * which break when thumbs are near each other.
 */
export function DualRangeSlider({
  min,
  max,
  valueStart,
  valueEnd,
  onStartChange,
  onEndChange,
  fillStyle,
  markers,
}: DualRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);

  const THUMB_SIZE = 16; // px, matches w-4 h-4

  // Convert a value to a percentage position on the track
  const toPercent = (value: number) => ((value - min) / (max - min)) * 100;

  // Convert a pixel position relative to the track to a clamped value
  const posToValue = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return min;
      const rect = track.getBoundingClientRect();
      // Account for thumb radius so edges are reachable
      const thumbRadius = THUMB_SIZE / 2;
      const usableLeft = rect.left + thumbRadius;
      const usableWidth = rect.width - THUMB_SIZE;
      const ratio = Math.max(0, Math.min(1, (clientX - usableLeft) / usableWidth));
      return Math.round(min + ratio * (max - min));
    },
    [min, max],
  );

  // Determine which thumb to grab based on click proximity
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      const val = posToValue(e.clientX);
      const distStart = Math.abs(val - valueStart);
      const distEnd = Math.abs(val - valueEnd);
      // Prefer the closer thumb; on tie, prefer 'start'
      const target = distStart <= distEnd ? 'start' : 'end';
      setDragging(target);
      // Immediately update the chosen thumb
      if (target === 'start') onStartChange(val);
      else onEndChange(val);
      // Capture pointer on the track element for smooth dragging
      trackRef.current?.setPointerCapture(e.pointerId);
    },
    [posToValue, valueStart, valueEnd, onStartChange, onEndChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      e.stopPropagation();
      e.preventDefault();
      const val = posToValue(e.clientX);
      if (dragging === 'start') onStartChange(val);
      else onEndChange(val);
    },
    [dragging, posToValue, onStartChange, onEndChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      e.stopPropagation();
      setDragging(null);
      trackRef.current?.releasePointerCapture(e.pointerId);
    },
    [dragging],
  );

  // Safety: clear dragging state if pointer leaves the window
  useEffect(() => {
    if (!dragging) return;
    const handleGlobalUp = () => setDragging(null);
    window.addEventListener('pointerup', handleGlobalUp);
    return () => window.removeEventListener('pointerup', handleGlobalUp);
  }, [dragging]);

  const startPct = toPercent(valueStart);
  const endPct = toPercent(valueEnd);
  const leftPct = Math.min(startPct, endPct);
  const rightPct = Math.max(startPct, endPct);

  return (
    <div
      ref={trackRef}
      className="dual-slider-track"
      style={{ cursor: dragging ? 'grabbing' : 'default' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Track background */}
      <div className="dual-slider-rail" />

      {/* Colored fill between thumbs */}
      {fillStyle && (
        <div
          className="dual-slider-fill"
          style={{
            left: `${leftPct}%`,
            right: `${100 - rightPct}%`,
            background: fillStyle,
          }}
        />
      )}

      {/* Optional dot markers (shade positions) */}
      {markers?.map((m, i) => (
        <div
          key={i}
          className="dual-slider-marker"
          style={{
            left: `${m.position}%`,
            backgroundColor: m.color,
            zIndex: 5,
          }}
        />
      ))}

      {/* Start thumb */}
      <div
        className="dual-slider-thumb-wrapper"
        style={{
          left: `${startPct}%`,
          zIndex: dragging === 'start' ? 30 : 20,
        }}
      >
        <div
          className="dual-slider-thumb"
          style={{
            background: 'var(--accent-primary-strong)',
            transform: 'rotate(45deg)',
            cursor: dragging === 'start' ? 'grabbing' : 'grab',
            boxShadow: dragging === 'start'
              ? '0 0 0 3px color-mix(in srgb, var(--focus-ring) 35%, transparent), 0 1px 4px color-mix(in srgb, var(--shadow-color-overlay) 35%, transparent)'
              : '0 1px 4px color-mix(in srgb, var(--shadow-color-overlay) 35%, transparent)',
          }}
        />
      </div>

      {/* End thumb */}
      <div
        className="dual-slider-thumb-wrapper"
        style={{
          left: `${endPct}%`,
          zIndex: dragging === 'end' ? 30 : 20,
        }}
      >
        <div
          className="dual-slider-thumb"
          style={{
            background: 'var(--accent-primary-strong)',
            transform: 'rotate(45deg)',
            cursor: dragging === 'end' ? 'grabbing' : 'grab',
            boxShadow: dragging === 'end'
              ? '0 0 0 3px color-mix(in srgb, var(--focus-ring) 35%, transparent), 0 1px 4px color-mix(in srgb, var(--shadow-color-overlay) 35%, transparent)'
              : '0 1px 4px color-mix(in srgb, var(--shadow-color-overlay) 35%, transparent)',
          }}
        />
      </div>
    </div>
  );
}
