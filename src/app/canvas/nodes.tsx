// ─────────────────────────────────────────────────────────────
// Canvas node views. Nodes stay compact and glanceable; full controls live in
// the inspector. Every value shown here comes from the compute results.
// ─────────────────────────────────────────────────────────────
import { memo, type ReactNode, useEffect, useRef, useState } from 'react';
import { Handle, type NodeProps, Position, type Node as RFNode } from '@xyflow/react';
import { AlertTriangle, Blend, Contrast, FunctionSquare, Lock, Palette as PaletteIcon, Tag } from 'lucide-react';
import type {
  CanvasNode, ColorNode, ContrastNode, MixNode, NoteNode, PaletteNode, TokenNode,
} from '@/engine/model';
import { shadeHandle, tokenHandle } from '@/engine/model';
import type { ColorResult, ContrastResult, MixResult, PaletteResult, TokenResult } from '@/engine/compute';
import { SPACES, channelDefs, formatChannel } from '@/engine/color/spaces';
import { MIX_SPACES, mixStops } from '@/engine/color/mix';
import { toHex } from '@/engine/color/convert';
import { wcagGrade } from '@/engine/color/contrast';
import { useEditor, useResult } from '../store';
import { updateNodeData } from '../actions';
import { cn } from '../ui';
import { fmt, inkOn } from '../lib/color-ui';

export type FlowNode = RFNode<{ node: CanvasNode }>;
type ViewProps = NodeProps<FlowNode>;

function Frame({ selected, width, children, className }: { selected: boolean; width: number; children: ReactNode; className?: string }) {
  return (
    <div
      style={{ width }}
      className={cn(
        'rounded-xl border border-line bg-surface text-fg shadow-node transition-[box-shadow,border-color] hover:border-line-strong',
        selected && 'ring-2 ring-accent ring-offset-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

function Header({ icon, title, badge, children }: { icon: ReactNode; title: string; badge?: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative flex h-9 items-center gap-2 px-3">
      <span className="text-fg-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{title}</span>
      {badge && <span className="num rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-fg-2">{badge}</span>}
      {children}
    </div>
  );
}

const RULE_TEXT = (mode: string, delta?: number, decimals = 1) => {
  switch (mode) {
    case 'inherit': return '= parent';
    case 'offset': return `${(delta ?? 0) >= 0 ? '+' : '−'}${fmt(Math.abs(delta ?? 0), decimals)}`;
    case 'fixed': return 'fixed';
    case 'formula': return 'ƒ formula';
    default: return '';
  }
};

// ── Color ────────────────────────────────────────────────────
export const ColorNodeView = memo(function ColorNodeView({ id, data, selected }: ViewProps) {
  const node = data.node as ColorNode;
  const res = useResult(id) as ColorResult | undefined;
  if (!res) return null;
  const { color } = res;
  const ink = inkOn(color);
  const hasParent = !!res.parentId;
  const errors = res.channels.filter((c) => c.error).length;
  const usesFormula = res.channels.some((c) => c.mode === 'formula');
  const defs = channelDefs(node.data.space);
  const showAlpha = color.alpha < 1 || (res.channels.find((c) => c.key === 'alpha')?.mode ?? 'root') !== (hasParent ? 'inherit' : 'root');
  const channels = res.channels.filter((c) => c.key !== 'alpha' || showAlpha);

  return (
    <Frame selected={selected} width={216}>
      <div className="relative">
        <Handle type="target" position={Position.Left} id="in" />
        <div className="checker relative h-[76px] overflow-hidden rounded-t-[11px]">
          <div className="absolute inset-0 flex flex-col justify-between p-2.5" style={{ background: color.hexa, color: ink }}>
            <div className="flex items-start justify-between gap-2">
              <span className="truncate text-[13px] font-semibold leading-tight">{node.name}</span>
              <span className="flex shrink-0 items-center gap-1 opacity-80">
                {usesFormula && <FunctionSquare size={13} />}
                {!color.inGamut && <span title="Outside sRGB — showing the closest displayable color"><AlertTriangle size={13} /></span>}
              </span>
            </div>
            <div className="flex items-end justify-between">
              <span className="num text-[11px] font-medium opacity-90">{color.hexa}</span>
              <span className="num text-[10px] opacity-70">{SPACES[node.data.space].label}</span>
            </div>
          </div>
        </div>
        <Handle type="source" position={Position.Right} id="out" />
      </div>
      <div className={cn('grid gap-1 p-1.5', channels.length > 3 ? 'grid-cols-4' : 'grid-cols-3')}>
        {channels.map((c) => {
          const def = defs.find((d) => d.key === c.key)!;
          const ruleText = hasParent || c.mode === 'formula' ? RULE_TEXT(c.mode, c.delta, def.decimals) : '';
          return (
            <div
              key={c.key}
              title={c.error ? c.error.message : `${def.label}: ${formatChannel(def, c.value)}${def.unit ?? ''}`}
              className={cn('min-w-0 rounded-md bg-surface-2 px-1.5 py-1', c.error && 'ring-1 ring-danger/60')}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[10px] font-semibold text-fg-3">{def.short}</span>
                <span className="num truncate text-[11px]">{formatChannel(def, c.value)}</span>
              </div>
              {ruleText && (
                <div className={cn('num mt-0.5 flex items-center gap-0.5 truncate text-[9.5px]',
                  c.mode === 'offset' ? 'text-accent' : c.mode === 'formula' ? 'text-warning' : 'text-fg-3')}>
                  {c.mode === 'fixed' && <Lock size={8} />}
                  {ruleText}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {errors > 0 && (
        <div className="flex items-center gap-1.5 border-t border-line px-2.5 py-1.5 text-[11px] text-danger">
          <AlertTriangle size={12} /> {errors === 1 ? 'Formula error' : `${errors} formula errors`}
        </div>
      )}
    </Frame>
  );
});

// ── Palette ──────────────────────────────────────────────────
export const PaletteNodeView = memo(function PaletteNodeView({ id, data, selected }: ViewProps) {
  const node = data.node as PaletteNode;
  const res = useResult(id) as PaletteResult | undefined;
  if (!res) return null;
  return (
    <Frame selected={selected} width={236}>
      <div className="relative">
        <Handle type="target" position={Position.Left} id="in" />
        <Header icon={<PaletteIcon size={14} />} title={node.name} badge={node.data.space.toUpperCase()} />
        <Handle type="source" position={Position.Right} id="out" />
      </div>
      <div className="px-1.5 pb-1.5">
        {res.shades.map((shade, i) => {
          const ink = inkOn(shade.color);
          return (
            <div
              key={i}
              className={cn('relative flex h-6 items-center justify-between px-2.5', i === 0 && 'rounded-t-md', i === res.shades.length - 1 && 'rounded-b-md')}
              style={{ background: shade.color.hex, color: ink }}
            >
              <span className="num text-[11px] font-semibold">{shade.name}</span>
              <span className="num flex items-center gap-1.5 text-[10.5px] opacity-80">
                {!shade.color.inGamut && (
                  <span title="Requested chroma is outside sRGB here; showing the closest displayable color" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                )}
                {shade.color.hex}
              </span>
              <Handle type="source" position={Position.Right} id={shadeHandle(i)} className="!h-2.5 !w-2.5" />
            </div>
          );
        })}
      </div>
    </Frame>
  );
});

// ── Mix ──────────────────────────────────────────────────────
export const MixNodeView = memo(function MixNodeView({ id, data, selected }: ViewProps) {
  const node = data.node as MixNode;
  const res = useResult(id) as MixResult | undefined;
  if (!res) return null;
  const stops = mixStops(res.a.rgb, res.b.rgb, node.data.space, 11).map(toHex);
  const gradient = `linear-gradient(to right, ${stops.join(', ')})`;
  const input = (handle: 'a' | 'b', label: string, info = handle === 'a' ? res.a : res.b, connected = handle === 'a' ? res.aConnected : res.bConnected) => (
    <div className="relative flex h-7 items-center gap-2 px-3">
      <Handle type="target" position={Position.Left} id={handle} />
      <span className="w-3 text-[10px] font-semibold text-fg-3">{label}</span>
      <span className="checker h-4 w-4 overflow-hidden rounded ring-1 ring-inset ring-line"><span className="block h-full w-full" style={{ background: info.hexa }} /></span>
      <span className="num text-[11px] text-fg-2">{info.hexa}</span>
      {!connected && <span className="ml-auto text-[10px] text-fg-3">not connected</span>}
    </div>
  );
  return (
    <Frame selected={selected} width={236}>
      <Header icon={<Blend size={14} />} title={node.name} badge={MIX_SPACES[node.data.space].label} />
      {input('a', 'A')}
      {input('b', 'B')}
      <div className="px-3 pb-1.5 pt-1">
        <div className="relative h-3 rounded ring-1 ring-inset ring-line" style={{ background: gradient }}>
          <span className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white bg-transparent shadow" style={{ left: `${node.data.ratio * 100}%` }} />
        </div>
      </div>
      <div className="relative p-1.5 pt-0">
        <div className="checker overflow-hidden rounded-md">
          <div className="flex h-11 items-center justify-between px-2.5" style={{ background: res.color.hexa, color: inkOn(res.color) }}>
            <span className="text-[11px] font-semibold">{Math.round(node.data.ratio * 100)}% B</span>
            <span className="num text-[11px]">{res.color.hexa}</span>
          </div>
        </div>
        <Handle type="source" position={Position.Right} id="out" />
      </div>
    </Frame>
  );
});

// ── Contrast ─────────────────────────────────────────────────
export const ContrastNodeView = memo(function ContrastNodeView({ id, data, selected }: ViewProps) {
  const node = data.node as ContrastNode;
  const res = useResult(id) as ContrastResult | undefined;
  if (!res) return null;
  const grade = wcagGrade(res.wcag);
  const row = (handle: 'fg' | 'bg', label: string, info: typeof res.fg, connected: boolean) => (
    <div className="relative flex h-7 items-center gap-2 px-3">
      <Handle type="target" position={Position.Left} id={handle} />
      <span className="w-16 text-[10.5px] text-fg-3">{label}</span>
      <span className="checker h-4 w-4 overflow-hidden rounded ring-1 ring-inset ring-line"><span className="block h-full w-full" style={{ background: info.hexa }} /></span>
      <span className="num text-[11px] text-fg-2">{info.hexa}</span>
      {!connected && <span className="ml-auto text-[10px] text-fg-3">manual</span>}
    </div>
  );
  return (
    <Frame selected={selected} width={256}>
      <Header icon={<Contrast size={14} />} title={node.name} />
      {row('fg', 'Text', res.fg, res.fgConnected)}
      {row('bg', 'Background', res.bg, res.bgConnected)}
      <div className="p-1.5">
        <div className="rounded-md px-3 py-2.5" style={{ background: res.bg.hex, color: res.seen.hex }}>
          <div className="truncate text-[15px] font-semibold leading-tight">{node.data.sample || 'Aa'}</div>
          <div className="truncate text-[11px] leading-snug">Body text looks like this.</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-1.5 pb-1.5">
        <div className="rounded-md bg-surface-2 px-2 py-1.5">
          <div className="text-[10px] text-fg-3">WCAG 2</div>
          <div className="num text-[14px] font-semibold">{fmt(res.wcag, 2)}:1</div>
          <div className={cn('text-[10px] font-medium', grade.aa ? 'text-success' : grade.aaLarge ? 'text-warning' : 'text-danger')}>
            {grade.aaa ? 'AAA' : grade.aa ? 'AA' : grade.aaLarge ? 'AA large only' : 'Fails'}
          </div>
        </div>
        <div className="rounded-md bg-surface-2 px-2 py-1.5">
          <div className="text-[10px] text-fg-3">APCA</div>
          <div className="num text-[14px] font-semibold">Lc {fmt(res.apca, 0)}</div>
          <div className={cn('text-[10px] font-medium', Math.abs(res.apca) >= 75 ? 'text-success' : Math.abs(res.apca) >= 60 ? 'text-warning' : 'text-danger')}>
            {Math.abs(res.apca) >= 75 ? 'Body text' : Math.abs(res.apca) >= 60 ? 'Large text' : Math.abs(res.apca) >= 45 ? 'Headlines only' : 'Too low'}
          </div>
        </div>
      </div>
    </Frame>
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
    <Frame selected={selected} width={236}>
      <div className="relative">
        <Header icon={<Tag size={13} />} title={node.name}>
          {res?.color && <span className="checker h-4 w-4 overflow-hidden rounded ring-1 ring-inset ring-line"><span className="block h-full w-full" style={{ background: res.color.hexa }} /></span>}
        </Header>
        <Handle type="source" position={Position.Right} id="out" />
      </div>
      <div className="px-1.5 pb-1.5">
        {themes.map((t, i) => {
          const src = label(tokenHandle(t.id));
          const active = t.id === themeId;
          return (
            <div key={t.id} className={cn('relative flex h-8 items-center gap-2 rounded-md px-2', active && 'bg-surface-2')}>
              <Handle type="target" position={Position.Left} id={tokenHandle(t.id)} />
              <span className={cn('w-12 shrink-0 truncate text-[10.5px]', active ? 'font-semibold text-fg' : 'text-fg-3')}>{t.name}</span>
              <span className={cn('min-w-0 flex-1 truncate text-[11px]', src ? 'text-fg-2' : 'italic text-fg-3')}>
                {src ?? (i === 0 ? 'not set' : `↳ ${themes[0].name}`)}
              </span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
});

// ── Note ─────────────────────────────────────────────────────
const NOTE_TONES: Record<NoteNode['data']['tone'], string> = {
  neutral: 'oklch(0.5 0 0 / 0.12)',
  yellow: 'oklch(0.85 0.12 90 / 0.22)',
  blue: 'oklch(0.7 0.12 250 / 0.2)',
  green: 'oklch(0.75 0.12 150 / 0.2)',
  pink: 'oklch(0.72 0.14 350 / 0.2)',
  purple: 'oklch(0.68 0.14 300 / 0.2)',
};
export const NOTE_DOTS: Record<NoteNode['data']['tone'], string> = {
  neutral: 'oklch(0.6 0 0)', yellow: 'oklch(0.85 0.15 90)', blue: 'oklch(0.68 0.15 250)',
  green: 'oklch(0.72 0.15 150)', pink: 'oklch(0.72 0.16 350)', purple: 'oklch(0.66 0.16 300)',
};

/** Tiny markdown: **bold**, `code`, "- " bullets, blank-line paragraphs. */
export function NoteText({ text }: { text: string }) {
  const inline = (line: string, key: number) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return (
      <span key={key}>
        {parts.map((p, i) => p.startsWith('**') ? <strong key={i} className="font-semibold text-fg">{p.slice(2, -2)}</strong>
          : p.startsWith('`') ? <code key={i} className="num rounded bg-black/10 px-1 py-px text-[11px] dark:bg-white/10">{p.slice(1, -1)}</code>
          : p)}
      </span>
    );
  };
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (/^\s*[-•]\s+/.test(line)) return <div key={i} className="flex gap-1.5 pl-0.5"><span className="text-fg-3">•</span><span>{inline(line.replace(/^\s*[-•]\s+/, ''), i)}</span></div>;
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
      className={cn('rounded-xl border border-line px-3.5 py-3 text-[12.5px] leading-relaxed text-fg-2 backdrop-blur-sm', selected && 'ring-2 ring-accent')}
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
