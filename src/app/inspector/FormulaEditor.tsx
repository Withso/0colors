// ─────────────────────────────────────────────────────────────
// Formula editor for one channel. Two modes:
//  · display — the formula typeset like math (× − ≥, if … then … else, node chips)
//    with its live result; click to edit.
//  · edit — a highlighted code field with autocomplete (@nodes, channels, functions,
//    locals, examples), signature help and precise, gently-timed errors.
// Every keystroke is applied immediately, so the canvas reacts while you type.
// ─────────────────────────────────────────────────────────────
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AtSign, ChevronRight, CornerDownLeft, Layers, Sparkles, TriangleAlert } from 'lucide-react';
import { type ChannelTrace, outputColor } from '@/engine/compute';
import { type ChannelDef, type Space, describe, formatChannel, spaceToRgb } from '@/engine/color/spaces';
import {
  type CompletionItem, type CompletionNodeInfo, type CompletionResult, type DisplayToken, type FormulaTokenKind,
  formulaCompletions, formulaDisplay, highlightFormula, signatureAt,
} from '@/engine/formula-service';
import { isAnnotation, slugify } from '@/engine/model';
import { setChannelRule } from '../actions';
import { getEditor, useEditor } from '../store';
import { cn } from '../ui';

const SYNTAX: Partial<Record<FormulaTokenKind, string>> = {
  number: 'text-(--app-syn-num)',
  hex: 'text-(--app-syn-num)',
  ref: 'text-(--app-syn-ref)',
  variable: 'text-(--app-syn-var)',
  function: 'text-(--app-syn-fn)',
  property: 'text-fg-2',
  keyword: 'text-(--app-syn-kw)',
  boolean: 'text-(--app-syn-kw)',
  local: 'text-(--app-syn-local)',
  name: 'text-fg',
  operator: 'text-fg-2',
  punctuation: 'text-fg-3',
  comment: 'text-fg-3 italic',
  error: 'text-danger',
};

/** Characters that mean "the user is in the middle of a word worth completing". */
const WORDISH = /(?:^|[^\w.@-])[@A-Za-z_][\w-]*$|\.[A-Za-z_]*$/;

function nodeInfos(selfId: string): CompletionNodeInfo[] {
  const { project, result } = getEditor();
  return project.nodes
    .filter((n) => n.id !== selfId && !isAnnotation(n.type) && n.type !== 'contrast')
    .map((n) => ({ slug: slugify(n.name), name: n.name, type: n.type, hex: outputColor(result.nodes[n.id], 'out')?.hex ?? null }));
}

export function FormulaEditor({
  nodeId, def, space, trace, hasParent, expr, autoFocus,
}: {
  nodeId: string; def: ChannelDef; space: Space; trace: ChannelTrace | undefined; hasParent: boolean; expr: string; autoFocus?: boolean;
}) {
  const [editing, setEditing] = useState(!!autoFocus || !expr.trim());
  const [draft, setDraft] = useState(expr);
  const [caret, setCaret] = useState(expr.length);
  const [comp, setComp] = useState<{ res: CompletionResult; active: number } | null>(null);
  const [typing, setTyping] = useState(false);
  const [explain, setExplain] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const focusedOnce = useRef(false);
  /** The text the editor opened with; while it's untouched after switching to ƒ, it's a placeholder. */
  const initial = useRef(expr);

  // Follow outside changes (undo, rename rewrites, examples) unless they came from this field.
  useEffect(() => { if (expr !== draft) setDraft(expr); }, [expr]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(typingTimer.current), []);

  useLayoutEffect(() => {
    if (!editing) return;
    const el = ta.current;
    if (!el || document.activeElement === el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    // Idempotent on purpose: effects can run twice for one mount (React StrictMode).
    const placeholder = !!autoFocus && !!el.value.trim() && el.value === initial.current;
    const select = () => el.setSelectionRange(placeholder ? 0 : end, end);
    // A menu that is still closing (the rule menu) can take focus back; claim it again once it's gone.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (document.activeElement !== el && el.isConnected) {
          el.focus({ preventScroll: true });
          select();
        }
      });
    });
    if (placeholder) {
      // Just switched to a formula: the starting text is a placeholder. Select it and offer recipes
      // that replace it; typing replaces it too.
      select();
      setCaret(end);
      const res = formulaCompletions('', 0, { space, channel: def.key, hasParent, nodes: nodeInfos(nodeId) });
      const examples = res?.items.filter((i) => i.kind === 'example') ?? [];
      if (examples.length) setComp({ res: { from: 0, to: end, items: examples }, active: 0 });
    } else {
      select();
      setCaret(end);
      if (!focusedOnce.current && !el.value.trim()) refresh(el.value, 0, true);
    }
    focusedOnce.current = true;
    return () => cancelAnimationFrame(frame);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (v: string) => setChannelRule(nodeId, def.key, { mode: 'formula', expr: v });

  function refresh(src: string, at: number, force = false) {
    const before = src.slice(0, at);
    if (!force && !WORDISH.test(before) && src.trim()) { setComp(null); return; }
    const res = formulaCompletions(src, at, { space, channel: def.key, hasParent, nodes: nodeInfos(nodeId) });
    if (!res || !res.items.length) { setComp(null); return; }
    const typed = src.slice(res.from, res.to);
    if (!force && res.items.length === 1 && res.items[0].insert === typed) { setComp(null); return; }
    setComp({ res, active: 0 });
  }

  const change = (v: string, at: number) => {
    setDraft(v);
    setCaret(at);
    commit(v);
    setTyping(true);
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => setTyping(false), 700);
    refresh(v, at);
  };

  const accept = (item: CompletionItem) => {
    if (!comp) return;
    const { from, to } = comp.res;
    const next = draft.slice(0, from) + item.insert + draft.slice(to);
    const at = from + (item.caret ?? item.insert.length);
    setDraft(next);
    commit(next);
    setCaret(at);
    setComp(null);
    requestAnimationFrame(() => {
      const el = ta.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at);
      // "hsl." and other dotted completions continue straight into the next list.
      if (item.insert.endsWith('.')) refresh(next, at, true);
    });
  };

  const finish = () => {
    setComp(null);
    setEditing(false);
    ta.current?.blur();
    getEditor().breakCoalesce();
  };

  const error = trace?.error;
  const showError = !!error && (!editing || !typing);
  const unit = def.unit ?? '';
  const value = trace ? `${formatChannel(def, trace.value)}${unit}` : '';
  const sig = editing ? signatureAt(draft, caret) : null;
  const spans = useMemo(() => highlightFormula(draft), [draft]);
  const steps = trace?.explain?.steps ?? [];
  // Locals are already listed as steps; only show lookups that add something new.
  const localNames = new Set(steps.map((s) => s.name).filter(Boolean));
  const lookups = (trace?.explain?.lookups ?? []).filter((l) => !localNames.has(l.text));
  const canExplain = !error && (steps.length > 1 || lookups.length > 0 || !!trace?.adjusted);

  return (
    <div className="mt-2 space-y-1.5">
      {editing ? (
        <div
          ref={box}
          className={cn(
            'relative rounded-[8px] border bg-surface-2 transition-colors',
            showError ? 'border-danger/70' : 'border-accent',
          )}
        >
          <pre aria-hidden className="formula-text pointer-events-none m-0 min-h-[30px] px-2.5 py-[6px] text-fg">
            <Highlighted src={draft} spans={spans} error={showError ? error : undefined} />
            {'​'}
          </pre>
          <textarea
            ref={ta}
            aria-label={`${def.label} formula`}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            value={draft}
            placeholder={hasParent ? `parent.${def.key} + 10` : 'if dark then 80 else 30'}
            onChange={(e) => change(e.target.value, e.target.selectionStart)}
            onSelect={(e) => {
              const { selectionStart, selectionEnd } = e.currentTarget;
              // A range selection (e.g. the placeholder after switching to ƒ) keeps the current suggestions.
              if (selectionStart !== selectionEnd || selectionEnd === caret) return;
              setCaret(selectionEnd);
              // Suggestions always describe the word at the caret: recompute (or close) when it moves.
              if (comp) refresh(draft, selectionEnd);
            }}
            onBlur={(e) => {
              // Focus moving into a menu that's closing will come straight back; don't leave edit mode for it.
              if ((e.relatedTarget as HTMLElement | null)?.closest('[role="menu"]')) return;
              setComp(null);
              if (draft.trim()) setEditing(false);
              getEditor().breakCoalesce();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (comp) {
                const n = comp.res.items.length;
                if (e.key === 'ArrowDown') { e.preventDefault(); setComp({ ...comp, active: (comp.active + 1) % n }); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setComp({ ...comp, active: (comp.active - 1 + n) % n }); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(comp.res.items[comp.active]); return; }
                if (e.key === 'Escape') { e.preventDefault(); setComp(null); return; }
              }
              if (e.key === ' ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); refresh(draft, e.currentTarget.selectionStart, true); return; }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(); return; }
              if (e.key === 'Escape') { e.preventDefault(); finish(); }
            }}
            className="formula-text absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent px-2.5 py-[6px] text-transparent caret-fg outline-none placeholder:text-fg-3 selection:bg-accent-soft"
          />
          {comp && box.current && (
            <CompletionPopup
              anchor={box.current}
              items={comp.res.items}
              active={comp.active}
              onHover={(i) => setComp({ ...comp, active: i })}
              onPick={accept}
            />
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`${def.label} formula: ${expr}. Click to edit.`}
          className={cn(
            'group flex w-full items-start gap-2 rounded-[8px] border border-transparent bg-surface-2 px-2.5 py-[7px] text-left outline-none transition-colors',
            'hover:border-line-strong focus-visible:border-accent',
            error && 'border-danger/50',
          )}
        >
          <span className="min-w-0 flex-1">
            <MathDisplay nodeId={nodeId} src={expr} error={error} />
          </span>
          {!error && (
            <span className="num shrink-0 pt-px text-right text-[12px] font-semibold text-fg">
              = {value}
              {trace?.adjusted && (
                <span className="block text-[10.5px] font-normal text-warning">{trace.adjusted === 'wrap' ? 'wrapped' : 'clamped'} from {formatChannel(def, trace.raw)}</span>
              )}
            </span>
          )}
        </button>
      )}

      {editing && sig && !comp && (
        <div className="num px-1 text-[11px] leading-snug text-fg-3">
          <span className="text-(--app-syn-fn)">{sig.name}</span>(
          {sig.params.map((p, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <span className={cn(i === sig.active && 'font-semibold text-fg underline decoration-accent decoration-2 underline-offset-[3px]')}>{p}</span>
            </span>
          ))}
          ) <span className="font-sans">— {sig.doc}</span>
        </div>
      )}

      {showError ? (
        <div className="flex items-start gap-1.5 px-1 text-[11.5px] leading-snug text-fg-2">
          <TriangleAlert size={12} className="mt-[2px] shrink-0 text-danger" />
          <span>
            {error!.message}
            <span className="text-fg-3"> · using {hasParent ? 'the parent value' : 'the stored value'}</span>
          </span>
        </div>
      ) : editing ? (
        <div className="flex h-5 items-center justify-between gap-2 px-1 text-[11px] text-fg-3">
          <span className="num">
            {trace && !error ? <>= <span className="font-semibold text-fg">{value}</span></> : typing ? '…' : ''}
            {trace?.adjusted && !error && (
              <span className="ml-1.5 text-warning">{trace.adjusted === 'wrap' ? 'wrapped' : 'clamped'} from {formatChannel(def, trace.raw)}</span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <span><kbd className="font-sans">@</kbd> nodes</span>
            <span className="text-line-strong">·</span>
            <span className="flex items-center gap-0.5">⇧<CornerDownLeft size={10} /> new line</span>
          </span>
        </div>
      ) : (
        canExplain && (
          <button
            type="button"
            onClick={() => setExplain((v) => !v)}
            aria-expanded={explain}
            className="flex h-5 items-center gap-1 px-1 text-[11px] text-fg-3 transition-colors hover:text-fg-2"
          >
            <ChevronRight size={11} className={cn('transition-transform', explain && 'rotate-90')} />
            How it’s computed
            {trace?.adjusted && <span className="text-warning">· {trace.adjusted === 'wrap' ? 'wrapped' : 'clamped'} from {formatChannel(def, trace.raw)}</span>}
          </button>
        )
      )}

      {!editing && explain && canExplain && (
        <div className="num animate-fade space-y-0.5 rounded-[8px] bg-surface-2/60 px-2.5 py-2 text-[11px]">
          {steps.length > 1 && steps.map((s, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="truncate text-fg-3">{s.name ?? 'result'}</span>
              <span className="text-fg-2">{s.value}</span>
            </div>
          ))}
          {steps.length > 1 && lookups.length > 0 && <div className="my-1 h-px bg-line" />}
          {lookups.map((l, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="truncate text-fg-3">{l.text}</span>
              <span className="text-fg-2">{l.value}</span>
            </div>
          ))}
          {steps.length <= 1 && trace?.explain?.substituted && trace.explain.substituted !== expr.trim() && (
            <div className="mt-1 break-all text-fg-3">→ {trace.explain.substituted}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Source text with syntax colors; the error range gets a wavy underline. */
function Highlighted({ src, spans, error }: { src: string; spans: ReturnType<typeof highlightFormula>; error?: { start: number; end: number } }) {
  const out: ReactNode[] = [];
  let at = 0;
  const push = (text: string, cls: string | undefined, start: number) => {
    if (!text) return;
    if (error && error.end > error.start && start < error.end && start + text.length > error.start) {
      // Split around the error range so only the offending characters are marked.
      const a = Math.max(error.start, start) - start;
      const b = Math.min(error.end, start + text.length) - start;
      if (a > 0) out.push(<span key={`${start}a`} className={cls}>{text.slice(0, a)}</span>);
      out.push(<span key={`${start}b`} className={cn(cls, 'formula-error')}>{text.slice(a, b)}</span>);
      if (b < text.length) out.push(<span key={`${start}c`} className={cls}>{text.slice(b)}</span>);
      return;
    }
    out.push(<span key={start} className={cls}>{text}</span>);
  };
  for (const s of spans) {
    if (s.start > at) push(src.slice(at, s.start), undefined, at);
    push(src.slice(s.start, s.end), SYNTAX[s.kind], s.start);
    at = s.end;
  }
  if (at < src.length) push(src.slice(at), undefined, at);
  if (error && error.start >= src.length) out.push(<span key="eof" className="formula-error">{' '}</span>);
  return <>{out}</>;
}

// ── Display mode ─────────────────────────────────────────────
type Piece =
  | { t: 'chip'; label: string; channel?: string; hex: string | null; title: string }
  | { t: 'token'; kind: DisplayToken['kind']; text: string };

const COLOR_VARS = new Set(['parent', 'self', 'white', 'black']);

/** Merge `@brand` `.` `l` (and `parent.hsl.l`) into one chip that shows the color it reads. */
function toPieces(tokens: DisplayToken[], colorOf: (t: DisplayToken) => string | null): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const isColor = t.kind === 'ref' || (t.kind === 'variable' && COLOR_VARS.has(t.text));
    if (!isColor) { out.push({ t: 'token', kind: t.kind, text: t.text }); continue; }
    const path: string[] = [];
    let j = i + 1;
    while (tokens[j]?.kind === 'punctuation' && tokens[j].text === '.' && tokens[j + 1]?.kind === 'property') {
      path.push(tokens[j + 1].text);
      j += 2;
    }
    const name = t.kind === 'ref' ? t.text.slice(1) : t.text;
    out.push({
      t: 'chip', label: name, channel: path.length ? path.join('.') : undefined, hex: colorOf(t),
      title: `${t.text}${path.length ? `.${path.join('.')}` : ''}`,
    });
    i = j - 1;
  }
  return out;
}

function MathDisplay({ nodeId, src, error }: { nodeId: string; src: string; error?: { message: string } }) {
  const tokens = useMemo(() => (error ? null : formulaDisplay(src)), [src, error]);
  const results = useEditor((s) => s.result.nodes);
  const nodes = useEditor((s) => s.project.nodes);
  const edges = useEditor((s) => s.project.edges);
  if (!tokens) {
    return <span className="formula-text block whitespace-pre-wrap text-fg-2">{src || <span className="text-fg-3">Empty formula</span>}</span>;
  }
  const self = nodes.find((n) => n.id === nodeId);
  const parentEdge = edges.find((e) => e.target === nodeId && e.targetHandle === 'in');
  const parentHex = parentEdge ? outputColor(results[parentEdge.source], parentEdge.sourceHandle)?.hex ?? null : null;
  const colorOf = (t: DisplayToken): string | null => {
    if (t.kind === 'ref') {
      // Same lookup as evaluation: notes, sections and frames have no @name.
      const n = nodes.find((x) => !isAnnotation(x.type) && slugify(x.name) === t.ref);
      return n ? outputColor(results[n.id], 'out')?.hex ?? null : null;
    }
    if (t.text === 'white') return '#FFFFFF';
    if (t.text === 'black') return '#000000';
    if (t.text === 'parent') return parentHex;
    if (t.text === 'self' && self?.type === 'color') {
      // `self` is the node's own stored values (what the sliders hold), not its computed output.
      const { rgb } = spaceToRgb(self.data.space, self.data.values);
      return describe(rgb).hex;
    }
    return null;
  };
  const pieces = toPieces(tokens, colorOf);
  return (
    <span className="formula-math block text-[12.5px] leading-[22px] text-fg">
      {pieces.map((p, i) => {
        if (p.t === 'chip') {
          return (
            <span key={i} title={p.title} className="mx-px inline-flex h-[19px] translate-y-[-1px] items-center gap-1 rounded-[5px] bg-surface-3 pl-1 pr-1.5 align-middle text-[11.5px]">
              <span className="checker relative h-2.5 w-2.5 overflow-hidden rounded-[3px]">
                <span className="absolute inset-0" style={{ background: p.hex ?? 'transparent' }} />
                <span className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.3)]" />
              </span>
              <span className="font-medium text-fg">{p.label}</span>
              {p.channel && <span className="num text-[10.5px] uppercase text-fg-3">{p.channel.replace(/\./g, ' ')}</span>}
            </span>
          );
        }
        switch (p.kind) {
          case 'newline': return <br key={i} />;
          case 'keyword': return <span key={i} className="text-[11.5px] font-medium text-fg-3">{p.text}</span>;
          case 'operator': return <span key={i} className="text-fg-2">{p.text}</span>;
          case 'local': return <span key={i} className="font-serif italic text-fg">{p.text}</span>;
          case 'function': return <span key={i} className="text-(--app-syn-fn)">{p.text}</span>;
          case 'number': return <span key={i} className="num">{p.text}</span>;
          case 'variable': return <span key={i} className="italic text-(--app-syn-var)">{p.text}</span>;
          case 'comment': return null;
          default: return <span key={i} className="text-fg-2">{p.text}</span>;
        }
      })}
    </span>
  );
}

// ── Completion popup ─────────────────────────────────────────
const KIND_BADGE: Record<CompletionItem['kind'], { glyph: ReactNode; cls: string }> = {
  node: { glyph: <AtSign size={11} />, cls: 'text-(--app-syn-ref)' },
  variable: { glyph: 'x', cls: 'text-(--app-syn-var) italic' },
  function: { glyph: 'ƒ', cls: 'text-(--app-syn-fn)' },
  property: { glyph: '.', cls: 'text-fg-2' },
  space: { glyph: <Layers size={11} />, cls: 'text-fg-2' },
  keyword: { glyph: 'if', cls: 'text-(--app-syn-kw) text-[9px]' },
  local: { glyph: 'x', cls: 'text-(--app-syn-local) italic' },
  example: { glyph: <Sparkles size={11} />, cls: 'text-accent' },
};

function CompletionPopup({ anchor, items, active, onHover, onPick }: {
  anchor: HTMLElement; items: CompletionItem[]; active: number; onHover: (i: number) => void; onPick: (item: CompletionItem) => void;
}) {
  const [rect, setRect] = useState(() => anchor.getBoundingClientRect());
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Follow the field wherever layout moves it (scrolling, resizing, or content changing above it).
    let frame = 0;
    let last = '';
    const tick = () => {
      const r = anchor.getBoundingClientRect();
      const key = `${r.left}|${r.top}|${r.width}|${r.height}`;
      if (key !== last) { last = key; setRect(r); }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [anchor]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const current = items[active];
  const below = innerHeight - rect.bottom > 240 || rect.top < 260;
  const style = below
    ? { left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 260) }
    : { left: rect.left, bottom: innerHeight - rect.top + 4, width: Math.max(rect.width, 260) };
  return createPortal(
    <div
      role="listbox"
      aria-label="Suggestions"
      className="glass animate-pop fixed z-[60] overflow-hidden rounded-[10px] shadow-panel"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div ref={list} className="max-h-[208px] overflow-y-auto p-1">
        {items.map((item, i) => {
          const badge = KIND_BADGE[item.kind];
          return (
            <div
              key={`${item.kind}:${item.label}:${i}`}
              role="option"
              aria-selected={i === active}
              data-index={i}
              onMouseMove={() => { if (i !== active) onHover(i); }}
              onClick={() => onPick(item)}
              className={cn('flex h-7 cursor-default items-center gap-2 rounded-[6px] px-1.5', i === active ? 'bg-accent text-accent-fg' : 'text-fg')}
            >
              {item.kind === 'node' && item.hex ? (
                <span className="checker relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-[4px]">
                  <span className="absolute inset-0" style={{ background: item.hex }} />
                  <span className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.3)]" />
                </span>
              ) : (
                <span className={cn('num grid h-3.5 w-3.5 shrink-0 place-items-center text-[11px] font-semibold', i === active ? 'text-accent-fg' : badge.cls)}>{badge.glyph}</span>
              )}
              <span className={cn('min-w-0 flex-1 truncate', item.kind === 'example' ? 'text-[12px]' : 'num text-[12px]')}>{item.label}</span>
              {item.detail && <span className={cn('num shrink-0 text-[10.5px]', i === active ? 'text-accent-fg/80' : 'text-fg-3')}>{item.detail}</span>}
            </div>
          );
        })}
      </div>
      {current?.doc && (
        <div className="border-t border-line px-2.5 py-1.5 text-[11px] leading-snug text-fg-2">
          {current.kind === 'example' && <div className="num mb-0.5 truncate text-fg">{current.insert.replace(/\n/g, ' ⏎ ')}</div>}
          {current.doc}
        </div>
      )}
    </div>,
    document.body,
  );
}
