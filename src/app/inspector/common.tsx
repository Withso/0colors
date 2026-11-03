// Shared building blocks for the inspector panels.
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AppWindow, Blend, Contrast, Copy, Droplet, Frame, Link2, Palette, StickyNote, Tag, Trash2, TriangleAlert, Unlink } from 'lucide-react';
import type { CanvasNode, NodeType } from '@/engine/model';
import type { ColorInfo } from '@/engine/color/spaces';
import { parseHex } from '@/engine/color/convert';
import { NODE_LABELS } from '@/engine/defaults';
import { deleteNodes, disconnectInput, duplicateNodes, renameNode } from '../actions';
import { useShallow } from 'zustand/react/shallow';
import { getEditor, useEditor } from '../store';
import { CommitInput, CopyButton, IconButton, Swatch, cn } from '../ui';
import { inkOn } from '../lib/color-ui';

export const TYPE_ICONS: Record<NodeType, typeof Droplet> = {
  color: Droplet,
  palette: Palette,
  mix: Blend,
  contrast: Contrast,
  token: Tag,
  note: StickyNote,
  section: Frame,
  html: AppWindow,
};

/** Interactive field look shared with the ui kit: borderless until hovered or focused. */
export const FIELD_CLASS =
  'rounded-[7px] border border-transparent bg-surface-2 text-fg outline-none transition-[border-color,background-color] duration-150 hover:border-line-strong focus:border-accent focus:bg-surface';

/** Select a node and ask the canvas (if it listens) to bring it into view. */
export function focusNode(id: string) {
  getEditor().select([id]);
  window.dispatchEvent(new CustomEvent('0colors:focus-node', { detail: { id } }));
}

/** Title block: type label with actions, then the editable name and a one-line hint. */
export function InspectorHeader({ node, hint, children }: { node: CanvasNode; hint?: ReactNode; children?: ReactNode }) {
  const Icon = TYPE_ICONS[node.type];
  return (
    <div className="border-b border-line px-4 pb-3.5 pt-2.5">
      <div className="mb-1.5 flex h-7 items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-fg-3">
          <Icon size={13} />
          {NODE_LABELS[node.type]}
        </span>
        <div className="-mr-1.5 flex items-center">
          <IconButton label="Duplicate" shortcut="⌘D" size="icon-sm" onClick={() => duplicateNodes([node.id])}>
            <Copy size={13} />
          </IconButton>
          <IconButton label="Delete" shortcut="⌫" size="icon-sm" className="hover:bg-danger/10 hover:text-danger" onClick={() => deleteNodes([node.id])}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
      {node.type !== 'note' && (
        <CommitInput
          aria-label="Name"
          value={node.name}
          onCommit={(v) => renameNode(node.id, v)}
          className={cn('-mx-2 h-8 w-[calc(100%+16px)] bg-transparent px-2 text-[14px] font-semibold tracking-[-0.01em]', node.type === 'token' && 'num text-[13px]')}
        />
      )}
      {hint && <div className="mt-1 text-[11px] leading-relaxed text-fg-3">{hint}</div>}
      {children}
    </div>
  );
}

/** Large color preview with the hex value and a quiet copy button. */
export function HeroSwatch({ color, detail, height = 72 }: { color: ColorInfo; detail?: ReactNode; height?: number }) {
  const ink = inkOn(color);
  return (
    <div className="group checker relative overflow-hidden rounded-[10px]" style={{ height }}>
      <div className="absolute inset-0" style={{ background: color.hexa }} />
      <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.2)]" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-2.5 pb-2" style={{ color: ink }}>
        <span className="num text-[14px] font-semibold tracking-tight">{color.hexa}</span>
        {detail && <span className="num truncate text-[10.5px] opacity-75">{detail}</span>}
      </div>
      <div className="absolute right-1 top-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100" style={{ color: ink }}>
        <CopyButton text={color.hexa} label="Copy hex" className="text-current hover:bg-black/10 hover:text-current" />
      </div>
    </div>
  );
}

/** A quiet note for warnings and errors: neutral surface, colored icon. */
export function Callout({ tone = 'warning', children, className }: { tone?: 'warning' | 'danger'; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-[8px] bg-surface-2 px-2.5 py-2 text-[11.5px] leading-snug text-fg-2', className)}>
      <TriangleAlert size={13} className={cn('mt-px shrink-0', tone === 'danger' ? 'text-danger' : 'text-warning')} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Body text used for short teaching explanations. */
export function Explain({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[11px] leading-relaxed text-fg-3', className)}>{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="num rounded-[4px] bg-surface-2 px-1 py-px text-[10.5px] text-fg-2">{children}</code>;
}

/**
 * An input slot (Mix A/B, Contrast text/background): shows the connected source,
 * or a hex field for the fallback color when nothing is wired in.
 */
export function ColorInputSlot({
  label, nodeId, handle, connected, info, fallbackHex, onFallback,
}: {
  label: string; nodeId: string; handle: string; connected: boolean; info: ColorInfo;
  fallbackHex: string; onFallback: (hex: string) => void;
}) {
  const source = useEditor(useShallow((s) => {
    const edge = s.project.edges.find((e) => e.target === nodeId && e.targetHandle === handle);
    const src = edge && s.project.nodes.find((n) => n.id === edge.source);
    if (!edge || !src) return { id: '', label: '' };
    if (src.type === 'palette' && edge.sourceHandle !== 'out') {
      const r = s.result.nodes[src.id];
      const shade = r?.type === 'palette' ? r.shades[Number(edge.sourceHandle.slice(1))] : undefined;
      return { id: src.id, label: `${src.name} ${shade?.name ?? ''}`.trim() };
    }
    return { id: src.id, label: src.name };
  }));
  const sourceLabel = source.id ? source : null;
  return (
    <div className="grid grid-cols-[84px_1fr] items-center gap-x-2 py-[3px]">
      <span className="truncate text-[12px] text-fg-2">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <Swatch color={info.hexa} className="h-7 w-7 rounded-[7px]" />
        {connected && sourceLabel ? (
          <>
            <button
              type="button"
              onClick={() => focusNode(sourceLabel.id)}
              className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[7px] px-1.5 text-left text-[12.5px] text-fg transition-colors hover:bg-surface-2"
              title="Select the connected node"
            >
              <Link2 size={12} className="shrink-0 text-fg-3" />
              <span className="truncate">{sourceLabel.label}</span>
            </button>
            <IconButton label="Disconnect" size="icon-sm" onClick={() => disconnectInput(nodeId, handle)}>
              <Unlink size={13} />
            </IconButton>
          </>
        ) : (
          <HexInput value={fallbackHex} onCommit={onFallback} className="min-w-0 flex-1" />
        )}
      </div>
    </div>
  );
}

/** Hex text field that only commits valid colors. */
export function HexInput({ value, onCommit, className }: { value: string; onCommit: (hex: string) => void; className?: string }) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(value); setInvalid(false); }, [value]);
  const commit = () => {
    const raw = draft.trim();
    const withHash = raw.startsWith('#') ? raw : `#${raw}`;
    if (parseHex(withHash)) {
      setInvalid(false);
      if (withHash.toUpperCase() !== value.toUpperCase()) onCommit(withHash.toUpperCase());
    } else {
      setInvalid(true);
    }
  };
  return (
    <input
      aria-label="Hex color"
      aria-invalid={invalid}
      spellCheck={false}
      value={draft}
      onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(value); setInvalid(false); }
      }}
      className={cn('num h-7 px-2 text-[12px]', FIELD_CLASS, invalid && 'border-danger hover:border-danger focus:border-danger', className)}
    />
  );
}

/** A row with a label, a value in mono, and a copy button that appears on hover. */
export function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="group -mx-1.5 flex h-7 items-center gap-2 rounded-[6px] px-1.5 transition-colors hover:bg-surface-2">
      <span className="w-12 shrink-0 text-[11px] font-medium text-fg-3">{label}</span>
      <span className="num min-w-0 flex-1 truncate text-[12px] text-fg">{value}</span>
      <CopyButton text={value} label={`Copy ${label}`} className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" />
    </div>
  );
}

/** Auto-growing textarea that doesn't leak keystrokes to canvas shortcuts. */
export function AutoTextarea({
  value, onChange, onBlur, className, placeholder, ariaLabel, mono, textareaRef, minRows = 2,
}: {
  value: string; onChange: (v: string) => void; onBlur?: () => void; className?: string; placeholder?: string;
  ariaLabel: string; mono?: boolean; textareaRef?: React.RefObject<HTMLTextAreaElement | null>; minRows?: number;
}) {
  const local = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? local;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, ref]);
  return (
    <textarea
      ref={ref}
      aria-label={ariaLabel}
      rows={minRows}
      spellCheck={!mono}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        'block w-full resize-none overflow-hidden px-2.5 py-1.5 text-[12.5px] leading-relaxed placeholder:text-fg-3',
        FIELD_CLASS,
        'rounded-[8px]',
        mono && 'num text-[12px]',
        className,
      )}
    />
  );
}

/** Debounced local draft that commits to the store. */
export function useDraft(value: string, commit: (v: string) => void, delay = 250) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(commit);
  latest.current = commit;
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(value); }, [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const change = (v: string) => {
    editing.current = true;
    setDraft(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => latest.current(v), delay);
  };
  const flush = () => {
    window.clearTimeout(timer.current);
    editing.current = false;
    if (draft !== value) latest.current(draft);
    // Leaving the field ends this edit's undo step.
    getEditor().breakCoalesce();
  };
  return { draft, change, flush, setDraft };
}
