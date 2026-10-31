// Edge views: color connections are drawn with a gradient from the source color to
// the target's color; formula references are dashed "logic" lines between node borders.
import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, type Edge as RFEdge, type EdgeProps, getBezierPath, useInternalNode } from '@xyflow/react';
import { outputColor } from '@/engine/compute';
import { channelDef } from '@/engine/color/spaces';
import { useEditor } from '../store';
import { fmt } from '../lib/color-ui';

/** One-line summary of how a derived color differs from its parent, e.g. "L −6 · H +180". */
function useRuleSummary(target: string, handle: string | null | undefined) {
  return useEditor((s) => {
    if (handle && handle !== 'in') return '';
    const r = s.result.nodes[target];
    if (!r || r.type !== 'color') return '';
    const parts: string[] = [];
    for (const c of r.channels) {
      const def = channelDef(r.space, c.key);
      if (!def) continue;
      if (c.mode === 'offset' && Math.abs(c.delta ?? 0) > 1e-9) {
        parts.push(`${def.short} ${(c.delta ?? 0) > 0 ? '+' : '−'}${fmt(Math.abs(c.delta ?? 0), def.decimals)}`);
      } else if (c.mode === 'fixed') parts.push(`${def.short} fixed`);
      else if (c.mode === 'formula') parts.push(`${def.short} ƒ`);
    }
    return parts.join(' · ');
  });
}

export type ColorFlowEdge = RFEdge<{ kind: 'color' }>;
export type RefFlowEdge = RFEdge<{ kind: 'ref' }>;

export const ColorEdgeView = memo(function ColorEdgeView(props: EdgeProps<ColorFlowEdge>) {
  const { id, source, target, sourceHandleId, targetHandleId, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props;
  const summary = useRuleSummary(target, targetHandleId);
  const from = useEditor((s) => outputColor(s.result.nodes[source], sourceHandleId ?? 'out')?.hex ?? 'var(--app-fg-3)');
  const to = useEditor((s) => {
    const r = s.result.nodes[target];
    return (r && (r.type === 'color' || r.type === 'mix' || r.type === 'token') ? r.color?.hex : null) ?? from;
  });
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 });
  const gradientId = `edge-gradient-${id}`;
  return (
    <>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      {selected && <path d={path} fill="none" stroke="var(--app-accent)" strokeWidth={7} strokeOpacity={0.35} strokeLinecap="round" />}
      <path d={path} fill="none" stroke="var(--app-canvas)" strokeWidth={4.5} strokeOpacity={0.9} />
      <BaseEdge id={id} path={path} interactionWidth={18} style={{ stroke: `url(#${gradientId})`, strokeWidth: selected ? 3 : 2.25 }} />
      {summary && (
        <EdgeLabelRenderer>
          <div
            className="num pointer-events-none absolute rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-fg-2 shadow-sm"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {summary}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

type Rect = { x: number; y: number; w: number; h: number };

/** Point where the line from a rect's center toward `to` leaves the rect. */
function borderPoint(r: Rect, to: { x: number; y: number }) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = to.x - cx;
  const dy = to.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = (r.w / 2) / Math.abs(dx || 1e-9);
  const sy = (r.h / 2) / Math.abs(dy || 1e-9);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

export const RefEdgeView = memo(function RefEdgeView({ id, source, target }: EdgeProps<RefFlowEdge>) {
  const a = useInternalNode(source);
  const b = useInternalNode(target);
  const color = useEditor((s) => outputColor(s.result.nodes[source], 'out')?.hex ?? 'var(--app-fg-3)');
  if (!a || !b) return null;
  const ra: Rect = { x: a.internals.positionAbsolute.x, y: a.internals.positionAbsolute.y, w: a.measured.width ?? 200, h: a.measured.height ?? 120 };
  const rb: Rect = { x: b.internals.positionAbsolute.x, y: b.internals.positionAbsolute.y, w: b.measured.width ?? 200, h: b.measured.height ?? 120 };
  const ca = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 };
  const cb = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
  const p1 = borderPoint(ra, cb);
  const p2 = borderPoint(rb, ca);
  const path = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  return (
    <g className="pointer-events-none">
      <path id={id} d={path} fill="none" stroke={color} strokeWidth={1.75} strokeDasharray="5 5" strokeOpacity={0.85} className="edge-ref" />
      <circle cx={p2.x} cy={p2.y} r={3.5} fill={color} stroke="var(--app-canvas)" strokeWidth={1.5} />
    </g>
  );
});

export const edgeTypes = { color: ColorEdgeView, ref: RefEdgeView };
