// The 2D color picker: a plane of two channels at the current hue (OKLCH chroma × lightness,
// HCT chroma × tone, HSL saturation × lightness; RGB nodes use HSL), with the sRGB edge drawn.
// Dragging sets both channels in one step, following the same rules as the sliders.
import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import type { ColorNode } from '@/engine/model';
import type { ColorResult } from '@/engine/compute';
import { SPACES, channelDef, formatChannel, spaceToRgb } from '@/engine/color/spaces';
import { pickerGamutEdge, pickerPlane, renderPickerPlane } from '@/engine/color/picker';
import { setChannelValues, setColorRgb } from '../actions';
import { getEditor } from '../store';
import { Tooltip, cn } from '../ui';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function ColorPlane({ node, result }: { node: ColorNode; result: ColorResult }) {
  const plane = useMemo(() => pickerPlane(node.data.space), [node.data.space]);
  const native = plane.space === node.data.space;
  // RGB nodes have no hue channel: derive it from the color, but keep the last meaningful hue through
  // grays and hold it fixed for a whole drag, so rounding can't drift it (or flip a gray to red).
  const gestureHue = useRef<number | null>(null);
  const lastHue = useRef(result.color.hsl.h);
  if (!native && gestureHue.current === null && result.color.hsl.s > 0.5) lastHue.current = result.color.hsl.h;
  const hue = native ? result.values.h ?? 0 : gestureHue.current ?? lastHue.current;
  const x = native ? result.values[plane.x.key] ?? 0 : result.color.hsl.s;
  const y = native ? result.values[plane.y.key] ?? 0 : result.color.hsl.l;
  // Re-render the plane per whole degree, and let a fast hue drag skip frames.
  const hueKey = useDeferredValue(Math.round(hue));
  const W = plane.space === 'hct' ? 72 : 144;
  const H = plane.space === 'hct' ? 40 : 80;
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    img.data.set(renderPickerPlane(plane, hueKey, W, H));
    ctx.putImageData(img, 0, 0);
  }, [plane, hueKey, W, H]);

  const edge = useMemo(() => {
    const pts = pickerGamutEdge(plane, hueKey, 48);
    if (!pts.length) return '';
    const sx = (v: number) => ((v - plane.x.min) / (plane.x.max - plane.x.min)) * 100;
    const sy = (v: number) => (1 - (v - plane.y.min) / (plane.y.max - plane.y.min)) * 100;
    return pts.map((p) => `${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ');
  }, [plane, hueKey]);

  const locked = native
    ? [plane.x.key, plane.y.key].some((k) => node.data.rules[k]?.mode === 'formula')
    : ['r', 'g', 'b'].some((k) => node.data.rules[k]?.mode === 'formula');

  const apply = (nx: number, ny: number) => {
    const cx = Math.min(plane.x.max, Math.max(plane.x.min, nx));
    const cy = Math.min(plane.y.max, Math.max(plane.y.min, ny));
    if (native) setChannelValues(node.id, { [plane.x.key]: cx, [plane.y.key]: cy });
    else setColorRgb(node.id, spaceToRgb('hsl', { h: hue, s: cx, l: cy }).rgb, undefined, `pad:${node.id}`);
  };
  const fromPointer = (clientX: number, clientY: number) => {
    const r = pad.current!.getBoundingClientRect();
    const tx = clamp01((clientX - r.left) / r.width);
    const ty = clamp01((clientY - r.top) / r.height);
    apply(plane.x.min + tx * (plane.x.max - plane.x.min), plane.y.max - ty * (plane.y.max - plane.y.min));
  };

  const xDef = channelDef(plane.space, plane.x.key)!;
  const yDef = channelDef(plane.space, plane.y.key)!;
  const left = clamp01((x - plane.x.min) / (plane.x.max - plane.x.min)) * 100;
  const top = (1 - clamp01((y - plane.y.min) / (plane.y.max - plane.y.min))) * 100;
  const label = `${yDef.label} and ${xDef.label.toLowerCase()} at hue ${Math.round(hue)}°`;

  return (
    <div className="mt-2">
      <Tooltip content={locked ? 'A formula drives one of these channels' : `Drag to set ${yDef.label.toLowerCase()} ↕ and ${xDef.label.toLowerCase()} ↔ together`} side="left">
        <div
          ref={pad}
          role="slider"
          aria-label={label}
          aria-valuetext={`${yDef.label} ${formatChannel(yDef, y)}, ${xDef.label} ${formatChannel(xDef, x)}`}
          aria-disabled={locked}
          tabIndex={locked ? -1 : 0}
          className={cn(
            'relative h-28 w-full touch-none select-none overflow-hidden rounded-[10px] bg-surface-2 outline-none',
            'shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.25)] focus-visible:ring-2 focus-visible:ring-accent/60',
            locked ? 'cursor-not-allowed opacity-70' : 'cursor-crosshair',
          )}
          onPointerDown={(e) => {
            if (locked || e.button !== 0) return;
            e.preventDefault();
            // Take focus so arrow keys nudge the color next (instead of moving the selected node).
            e.currentTarget.focus({ preventScroll: true });
            e.currentTarget.setPointerCapture(e.pointerId);
            gestureHue.current = hue;
            fromPointer(e.clientX, e.clientY);
          }}
          // Only a press that began on the plane edits it (a node dragged across the panel must not).
          onPointerMove={(e) => { if (!locked && e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientX, e.clientY); }}
          onPointerUp={() => { gestureHue.current = null; getEditor().breakCoalesce(); }}
          onLostPointerCapture={() => { gestureHue.current = null; }}
          onKeyDown={(e) => {
            if (locked) return;
            const k = e.shiftKey ? 10 : 1;
            const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            const dy = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
            if (!dx && !dy) return;
            e.preventDefault();
            e.stopPropagation();
            apply(x + dx * xDef.step * k * (plane.space === 'oklch' ? 5 : 1), y + dy * yDef.step * k * (plane.space === 'oklch' ? 5 : 1));
          }}
        >
          <canvas ref={canvas} width={W} height={H} className="absolute inset-0 h-full w-full" />
          {edge && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <polyline points={edge} fill="none" stroke="white" strokeOpacity={0.85} strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          <span
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_0.5px_oklch(0_0_0/0.45),0_1px_4px_oklch(0_0_0/0.4)]"
            style={{ left: `${left}%`, top: `${top}%`, background: result.color.hex }}
          />
        </div>
      </Tooltip>
      <div className="num mt-1 flex justify-between px-0.5 text-[10.5px] text-fg-3">
        <span>{xDef.short} → · {yDef.short} ↑{native ? '' : ` (${SPACES.hsl.label})`}</span>
        <span className="flex items-center gap-2">
          {plane.space !== 'hsl' && (
            <span className="flex items-center gap-1">
              <svg width="12" height="2" aria-hidden><line x1="0" y1="1" x2="12" y2="1" stroke="currentColor" strokeDasharray="2 2" /></svg>
              sRGB edge
            </span>
          )}
          <span>H {Math.round(hue)}°</span>
        </span>
      </div>
    </div>
  );
}
