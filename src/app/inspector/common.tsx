// Shared building blocks for the inspector panels.
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Blend, Contrast, Copy, Droplet, Link2, Palette, StickyNote, Tag, Trash2, Unlink } from 'lucide-react';
import type { CanvasNode, NodeType } from '@/engine/model';
import type { ColorInfo } from '@/engine/color/spaces';
import { parseHex } from '@/engine/color/convert';
import { NODE_LABELS } from '@/engine/defaults';
import { deleteNodes, disconnectInput, duplicateNodes, renameNode } from '../actions';
import { useShallow } from 'zustand/react/shallow';
import { getEditor, useEditor } from '../store';
import { Badge, CommitInput, CopyButton, IconButton, Swatch, cn } from '../ui';

export const TYPE_ICONS: Record<NodeType, typeof Droplet> = {
  color: Droplet,
  palette: Palette,
  mix: Blend,
  contrast: Contrast,
  token: Tag,
  note: StickyNote,
};

/** Select a node and ask the canvas (if it listens) to bring it into view. */
export function focusNode(id: string) {
  getEditor().select([id]);
  window.dispatchEvent(new CustomEvent('0colors:focus-node', { detail: { id } }));
}

/** Title row: type badge, editable name, duplicate/delete. */
export function InspectorHeader({ node, hint, children }: { node: CanvasNode; hint?: ReactNode; children?: ReactNode }) {
  const Icon = TYPE_ICONS[node.type];
  return (
    <div className="border-b border-line px-4 pb-3.5 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <Badge tone="neutral" className="gap-1.5">
          <Icon size={12} />
          {NODE_LABELS[node.type]}
        </Badge>
        <div className="flex items-center gap-0.5">
          <IconButton label="Duplicate" shortcut="⌘D" size="icon-sm" onClick={() => duplicateNodes([node.id])}>
            <Copy size={13} />
          </IconButton>
          <IconButton label="Delete" shortcut="⌫" size="icon-sm" variant="danger" onClick={() => deleteNodes([node.id])}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
      {node.type !== 'note' && (
        <CommitInput
          aria-label="Name"
          value={node.name}
          onCommit={(v) => renameNode(node.id, v)}
          className={cn('h-9 text-[14px] font-semibold', node.type === 'token' && 'num text-[13px]')}
        />
      )}
      {hint && <div className="mt-1.5 text-[11px] leading-snug text-fg-3">{hint}</div>}
      {children}
    </div>
  );
}

/** Body text used for short teaching explanations. */
export function Explain({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[11.5px] leading-relaxed text-fg-3', className)}>{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="num rounded bg-surface-3 px-1 py-px text-[11px] text-fg-2">{children}</code>;
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
    <div className="flex items-center gap-2 py-1">
      <span className="w-20 shrink-0 text-xs text-fg-2">{label}</span>
      <Swatch color={info.hexa} className="h-7 w-7 rounded-lg" />
      {connected && sourceLabel ? (
        <>
          <button
            type="button"
            onClick={() => focusNode(sourceLabel.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md px-1 py-0.5 text-left text-[12px] text-fg hover:bg-surface-3"
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
        <HexInput value={fallbackHex} onCommit={onFallback} className="flex-1" />
      )}
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
      spellCheck={false}
      value={draft}
      onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(value); setInvalid(false); }
      }}
      className={cn(
        'num h-7 min-w-0 rounded-lg border bg-surface-2 px-2 text-[12px] text-fg outline-none transition-colors focus:border-accent',
        invalid ? 'border-danger' : 'border-line hover:border-line-strong',
        className,
      )}
    />
  );
}

/** A row with a label, a value in mono, and a copy button. */
export function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="group flex h-7 items-center gap-2">
      <span className="w-12 shrink-0 text-[11px] font-medium text-fg-3">{label}</span>
      <span className="num min-w-0 flex-1 truncate text-[12px] text-fg">{value}</span>
      <CopyButton text={value} label={`Copy ${label}`} className="opacity-60 group-hover:opacity-100" />
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
        'block w-full resize-none overflow-hidden rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[12.5px] leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-line-strong focus:border-accent',
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
  };
  return { draft, change, flush, setDraft };
}
