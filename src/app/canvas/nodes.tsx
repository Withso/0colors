// ─────────────────────────────────────────────────────────────
// Canvas node views. Cards stay calm and glanceable — an inset swatch, a name,
// and quiet hints about how each value is derived. Full controls live in the
// inspector. Every value shown here comes from the compute results.
// ─────────────────────────────────────────────────────────────
import { type CSSProperties, memo, type ReactNode, useEffect, useRef, useState } from 'react';
import { Handle, type NodeProps, Position, type Node as RFNode } from '@xyflow/react';
import { Blend, Contrast, Lock, Palette as PaletteIcon, Tag, TriangleAlert } from 'lucide-react';
import type { CanvasNode, ColorNode, ContrastNode, MixNode, NoteNode, PaletteNode, TokenNode } from '@/engine/model';
import { shadeHandle, tokenHandle } from '@/engine/model';
import type { ColorResult, ContrastResult, MixResult, PaletteResult, TokenResult } from '@/engine/compute';
import { SPACES, channelDefs, formatChannel } from '@/engine/color/spaces';
import { MIX_SPACES, mixStops } from '@/engine/color/mix';
import { toHex } from '@/engine/color/convert';
import { wcagGrade } from '@/engine/color/contrast';
import { getEditor, useEditor, useResult } from '../store';
import { renameNode, setChannelValue, updateNodeData } from '../actions';
import { cn } from '../ui';
import { fmt, inkOn } from '../lib/color-ui';

export type FlowNode = RFNode<{ node: CanvasNode }>;
type ViewProps = NodeProps<FlowNode>;

const outHandleStyle = (hex?: string | null): CSSProperties => (hex ? { background: hex } : {});

function Card({ selected, width, children, className }: { selected: boolean; width: number; children: ReactNode; className?: string }) {
  return (
    <div
      style={{ width }}
      className={cn(
        'rounded-[14px] bg-surface text-fg shadow-node transition-[outline-color] duration-150',
        'outline-2 outline-offset-2',
        selected ? 'outline-accent' : 'outline-transparent',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Node title that turns into a text field on double-click (Enter saves, Esc cancels). */
function EditableTitle({ id, name, className }: { id: string; name: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  if (editing) {
    return (
      <input
        ref={ref}
        defaultValue={name}
        aria-label="Node name"
        className={cn('nodrag min-w-0 flex-1 rounded-[5px] bg-surface-2 px-1 py-0 outline-none ring-2 ring-accent/70', className)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { e.currentTarget.value = name; e.currentTarget.blur(); }
        }}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          setEditing(false);
          if (v && v !== name) renameNode(id, v);
        }}
      />
    );
  }
  return (
    <span
      className={cn('min-w-0 flex-1 truncate', className)}
      title="Double-click to rename"
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      {name}
    </span>
  );
}

function Header({ id, icon, title, badge, children, mono }: { id: string; icon: ReactNode; title: string; badge?: ReactNode; children?: ReactNode; mono?: boolean }) {
  return (
    <div className="flex h-9 items-center gap-2 pl-3 pr-2.5">
      <span className="text-fg-3">{icon}</span>
      <EditableTitle id={id} name={title} className={cn('font-semibold tracking-[-0.01em]', mono ? 'num text-[12px]' : 'text-[12.5px]')} />
      {badge && <span className="text-[10px] font-medium text-fg-3">{badge}</span>}
      {children}
    </div>
  );
}

function Chip({ hex, className }: { hex: string; className?: string }) {
  return (
    <span className={cn('checker relative inline-block shrink-0 overflow-hidden rounded-[4px]', className ?? 'h-3.5 w-3.5')}>
      <span className="absolute inset-0" style={{ background: hex }} />
      <span className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.25)]" />
    </span>
  );
}

// ── Color ────────────────────────────────────────────────────
export const ColorNodeView = memo(function ColorNodeView({ id, data, selected }: ViewProps) {
  const node = data.node as ColorNode;
  const res = useResult(id) as ColorResult | undefined;
  if (!res) return null;
  const { color } = res;
  const ink = inkOn(color);
  const hasParent = !!res.parentId;
  const errors = res.channels.filter((c) => c.error).length;
  const defs = channelDefs(node.data.space);
  const alpha = res.channels.find((c) => c.key === 'alpha');
  const showAlpha = color.alpha < 1 || (!!alpha && alpha.mode !== (hasParent ? 'inherit' : 'root'));
  const channels = res.channels.filter((c) => c.key !== 'alpha' || showAlpha);

  // Drag a channel cell sideways to scrub its value (⇧ ×10, ⌥ ÷10), right on the canvas.
  const scrub = (e: React.PointerEvent, key: string, start: number, def: { step: number; min: number; max: number; wrap?: boolean }) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      const range = def.max - def.min;
      const perPx = Math.max(def.step, range / 400) * k;
      let v = start + dx * perPx;
      v = def.wrap ? ((v % 360) + 360) % 360 : Math.min(def.max, Math.max(def.min, v));
      setChannelValue(id, key, Math.round(v / def.step) * def.step);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      getEditor().breakCoalesce();
      if (!moved) getEditor().select([id]);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <Card selected={selected} width={208}>
      <div className="relative p-1.5">
        <Handle type="target" position={Position.Left} id="in" />
        <div className="checker relative h-[68px] overflow-hidden rounded-[10px]">
          <div className="absolute inset-0" style={{ background: color.hexa }} />
          <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.18)]" />
          <div className="absolute right-2 top-1.5 flex items-center gap-1" style={{ color: ink }}>
            {res.channels.some((c) => c.mode === 'formula') && <span className="num text-[11px] font-semibold opacity-75" title="Uses a formula">ƒ</span>}
            {!color.inGamut && <span title="Outside sRGB — showing the closest displayable color" className="opacity-75"><TriangleAlert size={11} /></span>}
          </div>
        </div>
        <Handle type="source" position={Position.Right} id="out" style={outHandleStyle(color.hex)} />
      </div>
      <div className="px-3 pb-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <EditableTitle id={id} name={node.name} className="text-[12.5px] font-semibold tracking-[-0.01em]" />
          <span className="shrink-0 text-[10px] font-medium text-fg-3">{SPACES[node.data.space].label}</span>
        </div>
        <div className="num text-[11px] text-fg-2">{color.hexa}</div>
      </div>
      <div className={cn('mx-1.5 mb-1.5 mt-1.5 grid overflow-hidden rounded-[8px] bg-surface-2', channels.length > 3 ? 'grid-cols-4' : 'grid-cols-3')}>
        {channels.map((c, i) => {
          const def = defs.find((d) => d.key === c.key)!;
          const derived = hasParent || c.mode === 'formula';
          return (
            <div
              key={c.key}
              title={c.error ? c.error.message : c.mode === 'formula' ? `${def.label} is driven by a formula` : `${def.label} ${formatChannel(def, c.value)}${def.unit ?? ''} — drag to adjust`}
              onPointerDown={c.mode === 'formula' ? undefined : (e) => scrub(e, c.key, c.value, def)}
              className={cn(
                'min-w-0 px-2 py-1.5 transition-colors',
                c.mode !== 'formula' && 'nodrag cursor-ew-resize hover:bg-surface-3/70',
                i > 0 && 'shadow-[inset_0.5px_0_0_var(--app-line-strong)]',
                c.error && 'bg-danger/10',
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9.5px] font-semibold text-fg-3">{def.short}</span>
                {derived && c.mode === 'offset' && (
                  <span className="num text-[9.5px] font-medium text-accent">{(c.delta ?? 0) >= 0 ? '+' : '−'}{fmt(Math.abs(c.delta ?? 0), def.decimals)}</span>
                )}
                {derived && c.mode === 'fixed' && <Lock size={8.5} className="text-fg-3" />}
                {c.mode === 'formula' && <span className={cn('num text-[10px] font-semibold', c.error ? 'text-danger' : 'text-warning')}>ƒ</span>}
              </div>
              <div className="num truncate text-[11.5px] text-fg">{formatChannel(def, c.value)}</div>
            </div>
          );
        })}
      </div>
      {errors > 0 && (
        <div className="flex items-center gap-1.5 px-3 pb-2 text-[11px] font-medium text-danger">
          <TriangleAlert size={11} /> {errors === 1 ? 'Formula error' : `${errors} formula errors`}
        </div>
      )}
    </Card>
  );
});

// ── Palette ──────────────────────────────────────────────────
export const PaletteNodeView = memo(function PaletteNodeView({ id, data, selected }: ViewProps) {
  const node = data.node as PaletteNode;
  const res = useResult(id) as PaletteResult | undefined;
  if (!res) return null;
  const last = res.shades.length - 1;
  return (
    <Card selected={selected} width={228}>
      <div className="relative">
        <Handle type="target" position={Position.Left} id="in" />
        <Header id={id} icon={<PaletteIcon size={13} />} title={node.name} badge={node.data.space.toUpperCase()} />
        <Handle type="source" position={Position.Right} id="out" style={outHandleStyle(res.base.hex)} />
      </div>
      <div className="pb-1.5">
        {res.shades.map((shade, i) => (
          <div key={i} className="relative h-[22px] px-1.5">
            <div
              className={cn('flex h-full items-center justify-between px-2.5', i === 0 && 'rounded-t-[9px]', i === last && 'rounded-b-[9px]')}
              style={{ background: shade.color.hex, color: inkOn(shade.color) }}
            >
              <span className="num text-[10.5px] font-semibold">{shade.name}</span>
              <span className="num flex items-center gap-1.5 text-[10px] opacity-75">
                {!shade.color.inGamut && (
                  <span title="Requested chroma is outside sRGB here; showing the closest displayable color" className="h-1 w-1 rounded-full bg-current" />
                )}
                {shade.color.hex}
              </span>
            </div>
            <Handle type="source" position={Position.Right} id={shadeHandle(i)} style={{ ...outHandleStyle(shade.color.hex), width: 9, height: 9 }} />
          </div>
        ))}
      </div>
    </Card>
  );
});

// ── Mix ──────────────────────────────────────────────────────
export const MixNodeView = memo(function MixNodeView({ id, data, selected }: ViewProps) {
  const node = data.node as MixNode;
  const res = useResult(id) as MixResult | undefined;
  if (!res) return null;
  const stops = mixStops(res.a.rgb, res.b.rgb, node.data.space, 13).map(toHex);
  const input = (handle: 'a' | 'b') => {
    const info = handle === 'a' ? res.a : res.b;
    const connected = handle === 'a' ? res.aConnected : res.bConnected;
    return (
      <div className="relative flex h-7 items-center gap-2 px-3">
        <Handle type="target" position={Position.Left} id={handle} />
        <span className="w-2.5 text-[10px] font-semibold text-fg-3">{handle.toUpperCase()}</span>
        <Chip hex={info.hexa} />
        <span className="num text-[11px] text-fg-2">{info.hexa}</span>
        {!connected && <span className="ml-auto text-[10px] text-fg-3">fallback</span>}
      </div>
    );
  };
  return (
    <Card selected={selected} width={228}>
      <Header id={id} icon={<Blend size={13} />} title={node.name} badge={MIX_SPACES[node.data.space].label} />
      {input('a')}
      {input('b')}
      <div className="px-3 pb-2 pt-1.5">
        <div className="relative h-2 rounded-full shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.2)]" style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}>
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_0.5px_oklch(0_0_0/0.35),0_1px_3px_oklch(0_0_0/0.3)]"
            style={{ left: `${node.data.ratio * 100}%`, background: res.color.hex }}
          />
        </div>
      </div>
      <div className="relative px-1.5 pb-1.5">
        <div className="checker overflow-hidden rounded-[9px]">
          <div className="flex h-10 items-center justify-between px-2.5" style={{ background: res.color.hexa, color: inkOn(res.color) }}>
            <span className="text-[11px] font-semibold">{Math.round(node.data.ratio * 100)}% B</span>
            <span className="num text-[11px] opacity-85">{res.color.hexa}</span>
          </div>
        </div>
        <Handle type="source" position={Position.Right} id="out" style={outHandleStyle(res.color.hex)} />
      </div>
    </Card>
  );
});

// ── Contrast ─────────────────────────────────────────────────
export const ContrastNodeView = memo(function ContrastNodeView({ id, data, selected }: ViewProps) {
  const node = data.node as ContrastNode;
  const res = useResult(id) as ContrastResult | undefined;
  if (!res) return null;
  const grade = wcagGrade(res.wcag);
  const lc = Math.abs(res.apca);
  const row = (handle: 'fg' | 'bg', label: string, info: typeof res.fg, connected: boolean) => (
    <div className="relative flex h-7 items-center gap-2 px-3">
      <Handle type="target" position={Position.Left} id={handle} />
      <span className="w-[68px] text-[11px] text-fg-3">{label}</span>
      <Chip hex={info.hexa} />
      <span className="num text-[11px] text-fg-2">{info.hexa}</span>
      {!connected && <span className="ml-auto text-[10px] text-fg-3">manual</span>}
    </div>
  );
  const tone = (ok: boolean, mid: boolean) => (ok ? 'text-success' : mid ? 'text-warning' : 'text-danger');
  return (
    <Card selected={selected} width={248}>
      <Header id={id} icon={<Contrast size={13} />} title={node.name} />
      {row('fg', 'Text', res.fg, res.fgConnected)}
      {row('bg', 'Background', res.bg, res.bgConnected)}
      <div className="px-1.5 pt-1.5">
        <div className="rounded-[9px] px-3 py-2.5 shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.15)]" style={{ background: res.bg.hex, color: res.seen.hex }}>
          <div className="truncate text-[15px] font-semibold leading-tight tracking-[-0.01em]">{node.data.sample || 'Aa'}</div>
          <div className="truncate text-[11px] leading-snug opacity-95">Body text looks like this.</div>
        </div>
      </div>
      <div className="grid grid-cols-2 px-3 py-2">
        <div>
          <div className="text-[10px] text-fg-3">WCAG 2</div>
          <div className="num text-[14px] font-semibold tracking-[-0.02em]">{fmt(res.wcag, 2)}<span className="text-fg-3">:1</span></div>
          <div className={cn('text-[10.5px] font-medium', tone(grade.aa, grade.aaLarge))}>
            {grade.aaa ? 'AAA' : grade.aa ? 'AA' : grade.aaLarge ? 'AA large only' : 'Fails'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-fg-3">APCA</div>
          <div className="num text-[14px] font-semibold tracking-[-0.02em]"><span className="text-fg-3">Lc </span>{fmt(res.apca, 0)}</div>
          <div className={cn('text-[10.5px] font-medium', tone(lc >= 75, lc >= 60))}>
            {lc >= 75 ? 'Body text' : lc >= 60 ? 'Large text' : lc >= 45 ? 'Headlines only' : 'Too low'}
          </div>
        </div>
      </div>
    </Card>
  );
});

// ── Token ────────────────────────────────────────────────────
export const TokenNodeView = memo(function TokenNodeView({ id, data, selected }: ViewProps) {
  const node = data.node as TokenNode;
  const themes = useEditor((s) => s.project.themes);
  const themeId = useEditor((s) => s.themeId);
  const res = useResult(id) as TokenResult | undefined;
  const edges = useEditor((s) => s.project.edges);
  const nodes = useEditor((s) => s.project.nodes);
  const results = useEditor((s) => s.result.nodes);
  const label = (handle: string) => {
    const e = edges.find((x) => x.target === id && x.targetHandle === handle);
    if (!e) return null;
    const src = nodes.find((n) => n.id === e.source);
    if (!src) return null;
    if (src.type === 'palette' && e.sourceHandle !== 'out') {
      const r = results[src.id] as PaletteResult | undefined;
      return `${src.name} ${r?.shades[Number(e.sourceHandle.slice(1))]?.name ?? ''}`;
    }
    return src.name;
  };
  return (
    <Card selected={selected} width={228}>
      <div className="relative">
        <Header id={id} icon={<Tag size={12} />} title={node.name} mono>
          {res?.color ? <Chip hex={res.color.hexa} className="h-4 w-4" /> : <span className="h-4 w-4 rounded-[4px] border border-dashed border-line-strong" />}
        </Header>
        <Handle type="source" position={Position.Right} id="out" style={outHandleStyle(res?.color?.hex)} />
      </div>
      <div className="px-1.5 pb-1.5">
        {themes.map((t, i) => {
          const src = label(tokenHandle(t.id));
          const active = t.id === themeId;
          return (
            <div key={t.id} className={cn('relative flex h-7 items-center gap-2 rounded-[7px] px-1.5', active && 'bg-surface-2')}>
              <Handle type="target" position={Position.Left} id={tokenHandle(t.id)} style={{ left: -6 }} />
              <span className={cn('w-11 shrink-0 truncate text-[10.5px]', active ? 'font-semibold text-fg' : 'text-fg-3')}>{t.name}</span>
              <span className={cn('min-w-0 flex-1 truncate text-[11px]', src ? 'text-fg-2' : 'text-fg-3')}>
                {src ?? (i === 0 ? 'Not set' : `Uses ${themes[0].name}`)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
});

// ── Note ─────────────────────────────────────────────────────
const NOTE_TONES: Record<NoteNode['data']['tone'], string> = {
  neutral: 'oklch(0.55 0 0 / 0.1)',
  yellow: 'oklch(0.86 0.13 92 / 0.16)',
  blue: 'oklch(0.7 0.13 250 / 0.14)',
  green: 'oklch(0.75 0.13 155 / 0.14)',
  pink: 'oklch(0.74 0.14 350 / 0.14)',
  purple: 'oklch(0.7 0.14 300 / 0.14)',
};

/** Tiny markdown: **bold**, `code`, "- " bullets, blank-line paragraphs. */
export function NoteText({ text }: { text: string }) {
  const inline = (line: string, key: number) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return (
      <span key={key}>
        {parts.map((p, i) => p.startsWith('**') ? <strong key={i} className="font-semibold text-fg">{p.slice(2, -2)}</strong>
          : p.startsWith('`') ? <code key={i} className="num rounded-[4px] bg-fg/8 px-1 py-px text-[11px] text-fg">{p.slice(1, -1)}</code>
          : p)}
      </span>
    );
  };
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-0.5" />;
        if (/^\s*[-•]\s+/.test(line)) {
          return (
            <div key={i} className="flex gap-2 pl-0.5">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-fg-3" />
              <span>{inline(line.replace(/^\s*[-•]\s+/, ''), i)}</span>
            </div>
          );
        }
        return <p key={i}>{inline(line, i)}</p>;
      })}
    </div>
  );
}

export const NoteNodeView = memo(function NoteNodeView({ id, data, selected }: ViewProps) {
  const node = data.node as NoteNode;
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.style.height = 'auto';
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [editing]);
  return (
    <div
      style={{ width: node.data.width, background: NOTE_TONES[node.data.tone] }}
      className={cn(
        'rounded-[14px] px-4 py-3.5 text-[12.5px] leading-[1.6] text-fg-2 shadow-[inset_0_0_0_0.5px_var(--app-line-strong)] backdrop-blur-md',
        'outline-2 outline-offset-2 transition-[outline-color] duration-150',
        selected ? 'outline-accent' : 'outline-transparent',
      )}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      {editing ? (
        <textarea
          ref={ref}
          defaultValue={node.data.text}
          className="nodrag nowheel block w-full resize-none bg-transparent text-fg outline-none"
          onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur(); }}
          onBlur={(e) => {
            const text = e.currentTarget.value;
            setEditing(false);
            if (text !== node.data.text) updateNodeData<NoteNode>(id, (d) => { d.text = text; });
          }}
        />
      ) : (
        <NoteText text={node.data.text} />
      )}
    </div>
  );
});

export const nodeTypes = {
  color: ColorNodeView,
  palette: PaletteNodeView,
  mix: MixNodeView,
  contrast: ContrastNodeView,
  token: TokenNodeView,
  note: NoteNodeView,
};
