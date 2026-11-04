// ─────────────────────────────────────────────────────────────
// Formula editor for one channel: a row-by-row editor where every token is a tag.
//
//  · Type to get suggestions. Picking a function inserts it with its parentheses and
//    one placeholder tag per argument, the first one selected; Tab moves to the next.
//  · Click any tag (a placeholder, number, color, operator…) for suggestions that fit
//    that spot: numbers with their range, colors with swatches, channels, operators.
//  · Each row is a step with its value on the right. Enter (or + Add row) adds a row
//    that starts from the previous row's result, so the output never jumps; the last
//    row is the channel's output.
// Every edit is applied immediately, so the canvas reacts while you type.
// ─────────────────────────────────────────────────────────────
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Annotation, EditorSelection, EditorState, Prec, Transaction } from '@codemirror/state';
import { EditorView, type ViewUpdate, drawSelection, keymap, placeholder as placeholderText } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, insertNewline } from '@codemirror/commands';
import { AtSign, CircleDashed, CornerDownLeft, CornerDownRight, Hash, Layers, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { type ChannelTrace, outputColor } from '@/engine/compute';
import { type ChannelDef, type Space, SPACES, SPACE_ORDER, channelDefs, describe, formatChannel, spaceToRgb } from '@/engine/color/spaces';
import { FORMULA_FUNCTIONS } from '@/engine/formula';
import {
  type CompletionContext, type CompletionItem, type CompletionNodeInfo, type CompletionResult,
  addRowAfter, formulaCompletions, formulaRows, functionSnippet, removeRow, renameLocal, signatureAt, slotSuggestions,
} from '@/engine/formula-service';
import { isAnnotation, slugify } from '@/engine/model';
import { setChannelRule } from '../actions';
import { getEditor, useEditor } from '../store';
import { cn } from '../ui';
import { type TagLook, type TagPlugin, baseTheme, refreshTags, tagPlugin, tagsOf } from './formula-cm';
import { type Tag, formulaTags, holes, isBlankError, tagAt } from './formula-tags';

/** Characters that mean "the user is in the middle of a word worth completing". */
const WORDISH = /(?:^|[^\w.@-])[@A-Za-z_][\w-]*$|\.[A-Za-z_]*$/;
/** Marks a change that came from outside the field (undo elsewhere, renames), so it isn't committed back. */
const External = Annotation.define<boolean>();

function nodeInfos(selfId: string): CompletionNodeInfo[] {
  const { project, result } = getEditor();
  return project.nodes
    .filter((n) => n.id !== selfId && !isAnnotation(n.type) && n.type !== 'contrast')
    .map((n) => ({ slug: slugify(n.name), name: n.name, type: n.type, hex: outputColor(result.nodes[n.id], 'out')?.hex ?? null }));
}

interface Popup {
  res: CompletionResult;
  active: number;
  /** 'type': completing the word at the caret. 'slot': choices for a selected tag. */
  mode: 'type' | 'slot';
  title?: { name: string; doc: string };
}

interface Props {
  nodeId: string; def: ChannelDef; space: Space; trace: ChannelTrace | undefined; hasParent: boolean; expr: string; autoFocus?: boolean;
}

export function FormulaEditor({ nodeId, def, space, trace, hasParent, expr, autoFocus }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pluginRef = useRef<TagPlugin | null>(null);
  const [doc, setDoc] = useState(expr);
  const [focused, setFocused] = useState(false);
  const [popup, setPopupState] = useState<Popup | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const setPopup = (p: Popup | null) => { popupRef.current = p; setPopupState(p); };
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<number | undefined>(undefined);
  const [rowTops, setRowTops] = useState<number[]>([]);
  const [rename, setRename] = useState<{ index: number; name: string; left: number; top: number } | null>(null);
  /** The text the editor opened with; while it's untouched after switching to ƒ, it's a placeholder. */
  const initial = useRef(expr);
  const listId = useId();
  /** Where the blank being filled starts: picking a value there moves on to the next blank. */
  const blankAt = useRef<number | null>(null);
  /** A short status for screen readers after deliberate changes (rows added, renamed, removed). */
  const [status, setStatus] = useState('');

  const results = useEditor((s) => s.result.nodes);
  const nodes = useEditor((s) => s.project.nodes);
  const edges = useEditor((s) => s.project.edges);

  const error = trace?.error;
  const showError = !!error && !typing;
  /** An unfilled placeholder is a normal, in-progress state — not something to paint red. */
  const pending = isBlankError(error);
  const steps = trace?.explain?.steps ?? [];

  // Everything the (long-lived) CodeMirror callbacks need, always current.
  const live = useRef({ nodeId, def, space, trace, hasParent, results, nodes, edges, showError, pending });
  live.current = { nodeId, def, space, trace, hasParent, results, nodes, edges, showError, pending };

  const look: TagLook = {
    colorOf: (base) => {
      const { results: res, nodes: all, edges: links, nodeId: id } = live.current;
      if (base.startsWith('@')) {
        const slug = base.slice(1).toLowerCase();
        const n = all.find((x) => !isAnnotation(x.type) && slugify(x.name) === slug);
        return n ? outputColor(res[n.id], 'out')?.hexa ?? null : null;
      }
      switch (base) {
        case 'white': return '#FFFFFF';
        case 'black': return '#000000';
        case 'parent': {
          const edge = links.find((e) => e.target === id && e.targetHandle === 'in');
          return edge ? outputColor(res[edge.source], edge.sourceHandle)?.hexa ?? null : null;
        }
        case 'self': {
          // `self` is the node's own stored values (what the sliders hold), not its computed output.
          const self = all.find((n) => n.id === id);
          if (self?.type !== 'color') return null;
          return describe(spaceToRgb(self.data.space, self.data.values).rgb, (self.data.values.alpha ?? 100) / 100).hexa;
        }
      }
      return null;
    },
    row: (name) => {
      const step = (live.current.trace?.explain?.steps ?? []).findLast((s) => s.name === name);
      return step ? { type: step.type, value: step.value, hex: step.hex } : null;
    },
    valueOf: (text) => live.current.trace?.explain?.lookups.find((l) => l.text === text)?.value ?? null,
    channel: (key) => channelLabel(live.current.space, key),
    error: () => (live.current.showError && !live.current.pending ? live.current.trace?.error ?? null : null),
  };
  const lookRef = useRef(look);
  lookRef.current = look;

  const ctx = (): CompletionContext => ({
    space: live.current.space, channel: live.current.def.key, hasParent: live.current.hasParent, nodes: nodeInfos(live.current.nodeId),
  });
  const commit = (v: string) => setChannelRule(live.current.nodeId, live.current.def.key, { mode: 'formula', expr: v });

  // ── Suggestions ────────────────────────────────────────────
  function titleFor(src: string, from: number, tag?: Tag): Popup['title'] {
    const help = signatureAt(src, from);
    const fn = help && FORMULA_FUNCTIONS.find((f) => f.name === help.name);
    const param = fn?.args[Math.min(help!.active, fn.args.length - 1)];
    if (param && (fn!.args[fn!.args.length - 1]?.rest || help!.active < fn!.args.length)) {
      return { name: `${fn!.name} · ${param.name}`, doc: param.doc };
    }
    const d = live.current.def;
    if (!tag) return undefined;
    if (tag.kind === 'op') return { name: 'Operator', doc: 'Swap it for another one.' };
    if (tag.kind === 'color' || tag.kind === 'row' || tag.kind === 'hex') return { name: tag.path?.length ? 'Value' : 'Color', doc: tag.path?.length ? 'Read a channel from another color, or another channel.' : 'Use another color.' };
    if (tag.kind === 'hole' && /condition/i.test(tag.display)) return { name: 'Condition', doc: 'Something true or false.' };
    if (tag.kind === 'num' || tag.kind === 'hole') return { name: d.label, doc: `${formatChannel(d, d.min)}–${formatChannel(d, d.max)}${d.unit ?? ''}${d.wrap ? ', wraps around' : ''}` };
    return undefined;
  }

  function openSlot(view: EditorView, from: number, to: number, tag?: Tag) {
    blankAt.current = tag?.kind === 'hole' ? from : null;
    const src = view.state.doc.toString();
    const res = slotSuggestions(src, from, to, ctx());
    if (!res || !res.items.length) { setPopup(null); return; }
    setPopup({ res, active: 0, mode: 'slot', title: titleFor(src, from, tag) });
  }

  function refreshTyping(view: EditorView, force = false) {
    const src = view.state.doc.toString();
    const at = view.state.selection.main.head;
    const line = src.slice(src.lastIndexOf('\n', at - 1) + 1, at);
    if (!force && !WORDISH.test(line) && src.trim()) { setPopup(null); return; }
    const res = formulaCompletions(src, at, ctx());
    if (!res || !res.items.length) { setPopup(null); return; }
    const typed = src.slice(res.from, res.to);
    if (!force && res.items.length === 1 && res.items[0].insert === typed) { setPopup(null); return; }
    setPopup({ res, active: 0, mode: 'type' });
  }

  /** Select a placeholder and offer what fits there. */
  function selectHole(view: EditorView, hole: Tag) {
    view.dispatch({ selection: EditorSelection.range(hole.from, hole.to), scrollIntoView: true });
    openSlot(view, hole.from, hole.to, hole);
  }

  function nextHole(view: EditorView, dir: 1 | -1): Tag | undefined {
    const sel = view.state.selection.main;
    const all = holes(tagsOf(view, pluginRef.current!));
    return dir > 0 ? all.find((h) => h.from >= sel.to && !(h.from === sel.from && h.to === sel.to)) : all.findLast((h) => h.to <= sel.from);
  }

  function accept(item: CompletionItem) {
    const view = viewRef.current;
    const p = popupRef.current;
    if (!view || !p) return;
    const { from, to } = p.res;
    const end = from + item.insert.length;
    const selection = item.select
      ? EditorSelection.range(from + item.select.from, from + item.select.to)
      : EditorSelection.cursor(from + (item.caret ?? item.insert.length));
    // Typing into a selected blank keeps its start, so a pick there still counts as filling it.
    const filledBlank = blankAt.current === from;
    blankAt.current = null;
    view.dispatch({ changes: { from, to, insert: item.insert }, selection, userEvent: 'input.complete', scrollIntoView: true });
    setPopup(null);
    const tags = tagsOf(view, pluginRef.current!);
    if (item.select) {
      const hole = tags.find((t) => t.kind === 'hole' && t.from === from + item.select!.from);
      if (hole) { openSlot(view, hole.from, hole.to, hole); return; }
    }
    // "hsl." and other dotted completions continue straight into the next list.
    if (item.insert.endsWith('.')) { refreshTyping(view, true); return; }
    // Like a snippet: once a blank is filled, move on to the row's next one. Editing a filled tag stays put.
    const next = filledBlank ? holeInRow(view, end) : undefined;
    if (next) selectHole(view, next);
  }

  /** The first placeholder at or after `pos` in the row that contains `pos`. */
  function holeInRow(view: EditorView, pos: number): Tag | undefined {
    const row = formulaRows(view.state.doc.toString()).find((r) => r.start <= pos && pos <= Math.max(r.end, r.exprStart));
    return holes(tagsOf(view, pluginRef.current!)).find((h) => h.from >= pos && (!row || h.to <= row.end));
  }

  // ── Rows ───────────────────────────────────────────────────
  function addRow(view: EditorView, at?: number) {
    const src = view.state.doc.toString();
    const rows = formulaRows(src);
    if (!rows.length) return;
    const head = at ?? view.state.selection.main.head;
    const index = rows.findLastIndex((r) => r.start <= head);
    const edit = addRowAfter(src, Math.max(0, index));
    if (!edit.changes.length) return;
    view.dispatch({
      changes: edit.changes, selection: EditorSelection.single(edit.selection.anchor, edit.selection.head ?? edit.selection.anchor),
      userEvent: 'input.row', scrollIntoView: true,
    });
    setPopup(null);
    setStatus(`Added a row. ${live.current.def.label} is unchanged.`);
    view.focus();
  }

  function deleteRow(view: EditorView, index: number) {
    const name = formulaRows(view.state.doc.toString())[index]?.name;
    const edit = removeRow(view.state.doc.toString(), index);
    view.dispatch({ changes: edit.changes, selection: EditorSelection.single(edit.selection.anchor, edit.selection.head ?? edit.selection.anchor), userEvent: 'delete.row' });
    setPopup(null);
    setStatus(`Removed ${name ?? 'a row'}. Undo with ${navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+'}Z.`);
  }

  /** Backspace and Delete treat a call, a row label and a row break as units. */
  function smartDelete(view: EditorView, forward: boolean): boolean {
    const sel = view.state.selection.main;
    if (!sel.empty) return false;
    const src = view.state.doc.toString();
    const tags = tagsOf(view, pluginRef.current!);
    const call = (fn: Tag) => ({ from: fn.from, to: (fn.close ?? fn.to - 1) + 1 });
    const near = forward ? tagAt(tags, sel.head, 1) : tagAt(tags, sel.head, -1);
    if (near?.kind === 'fn' && near.close !== undefined) {
      const range = call(near);
      const inside = src.slice(near.to, near.close).replace(/\{[^{}]*\}|[\s,]/g, '');
      // A call whose arguments are all still placeholders goes in one step; otherwise select it first.
      if (!inside) view.dispatch({ changes: range, userEvent: forward ? 'delete.forward' : 'delete.backward' });
      else view.dispatch({ selection: EditorSelection.range(range.from, range.to) });
      return true;
    }
    if (near?.kind === 'close') {
      const fn = tags.find((t) => t.kind === 'fn' && t.close === near.from);
      if (fn) { const range = call(fn); view.dispatch({ selection: EditorSelection.range(range.from, range.to) }); return true; }
    }
    const rows = formulaRows(src);
    if (!forward) {
      const row = rows.find((r) => (r.name !== null ? r.exprStart : r.start) === sel.head);
      if (row) {
        const empty = !src.slice(row.exprStart, row.end).trim() || row.end <= row.exprStart;
        if (empty && rows.length > 1) { deleteRow(view, row.index); return true; }
        // Never glue a row onto the one above, and never drop a row's name by accident.
        if (row.index > 0) view.dispatch({ selection: EditorSelection.cursor(rows[row.index - 1].end) });
        return true;
      }
    } else {
      const row = rows.find((r) => r.end === sel.head);
      if (row && row.index < rows.length - 1) return true;
    }
    return false;
  }

  // ── CodeMirror ─────────────────────────────────────────────
  const handlers = useRef({
    onUpdate: (_u: ViewUpdate) => {},
    onMouseDown: (_e: MouseEvent, _v: EditorView) => false as boolean,
    onInput: (_v: EditorView, _from: number, _to: number, _text: string) => false as boolean,
    keys: {} as Record<string, (v: EditorView) => boolean>,
  });

  handlers.current.onUpdate = (u) => {
    if (u.docChanged) {
      const text = u.state.doc.toString();
      setDoc(text);
      if (!u.transactions.some((tr) => tr.annotation(External))) {
        commit(text);
        setTyping(true);
        window.clearTimeout(typingTimer.current);
        typingTimer.current = window.setTimeout(() => setTyping(false), 700);
        if (u.transactions.some((tr) => tr.isUserEvent('input.type') || tr.isUserEvent('delete') || tr.isUserEvent('input.paste'))) refreshTyping(u.view);
      }
    } else if (u.selectionSet) {
      const p = popupRef.current;
      const sel = u.state.selection.main;
      if (p && (p.mode === 'slot' ? sel.from !== p.res.from || sel.to !== p.res.to : sel.head < p.res.from || sel.head > p.res.to)) setPopup(null);
    }
    if (u.docChanged || u.geometryChanged || u.viewportChanged || u.heightChanged) measureRows(u.view);
  };

  handlers.current.onMouseDown = (e, view) => {
    if (e.button !== 0 || e.shiftKey || e.detail > 1) return false;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.fx-t, .fx-m');
    if (!el || !view.contentDOM.contains(el)) return false;
    const tags = tagsOf(view, pluginRef.current!);
    let tag: Tag | undefined;
    if (el.classList.contains('fx-t')) {
      const pos = view.posAtDOM(el);
      tag = tags.find((t) => t.from === pos && t.atomic) ?? tagAt(tags, pos, 1);
    } else {
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      tag = pos === null ? undefined : tagAt(tags, pos);
      const sel = view.state.selection.main;
      // A second click on a selected number edits it in place (a selection left from an earlier visit doesn't
      // count); if / then / else have nothing to swap.
      if (!tag || (view.hasFocus && sel.from === tag.from && sel.to === tag.to) || !['num', 'kw', 'name'].includes(tag.kind)) return false;
      if (tag.kind === 'kw' && ['if', 'then', 'else'].includes(tag.display)) return false;
    }
    if (!tag) return false;
    e.preventDefault();
    view.focus();
    if (tag.kind === 'label') {
      const row = formulaRows(view.state.doc.toString()).find((r) => r.start === tag!.from);
      const rect = el.getBoundingClientRect();
      if (row?.name) setRename({ index: row.index, name: row.name, left: rect.left, top: rect.bottom + 4 });
      return true;
    }
    if (tag.kind === 'name') {
      view.dispatch({ selection: EditorSelection.cursor(tag.to) });
      refreshTyping(view, true);
      return true;
    }
    if (tag.kind === 'fn' && tag.close !== undefined) {
      view.dispatch({ selection: EditorSelection.range(tag.from, tag.close + 1) });
      return true;
    }
    view.dispatch({ selection: EditorSelection.range(tag.from, tag.to) });
    openSlot(view, tag.from, tag.to, tag);
    return true;
  };

  handlers.current.onInput = (view, from, to, text) => {
    const doc = view.state.doc;
    if (text === '(') {
      const word = /[A-Za-z_]\w*$/.exec(doc.sliceString(Math.max(0, from - 32), from))?.[0];
      const next = doc.sliceString(to, to + 1);
      const snippet = word && word.toLowerCase() !== 'if' && !/[\w(]/.test(next) ? functionSnippet(word.toLowerCase()) : null;
      if (snippet) {
        // `mix(` becomes `mix({a}, {b}, {t})` with the first placeholder selected.
        const start = from - word!.length;
        const selection = snippet.select ? EditorSelection.range(start + snippet.select.from, start + snippet.select.to) : EditorSelection.cursor(start + snippet.text.length);
        view.dispatch({ changes: { from: start, to, insert: snippet.text }, selection, userEvent: 'input.complete' });
        setPopup(null);
        if (snippet.select) {
          const hole = tagsOf(view, pluginRef.current!).find((t) => t.kind === 'hole' && t.from === start + snippet.select!.from);
          if (hole) openSlot(view, hole.from, hole.to, hole);
        }
        return true;
      }
      if (from === to && !/\w/.test(next)) {
        view.dispatch({ changes: { from, insert: '()' }, selection: EditorSelection.cursor(from + 1), userEvent: 'input.type' });
        return true;
      }
    }
    const after = doc.sliceString(to, Math.min(doc.length, to + 200));
    const selected = from === to ? undefined : tagsOf(view, pluginRef.current!).find((t) => t.from === from && t.to === to);
    // A space typed over a selected placeholder is just the habit of typing `, ` — keep the placeholder.
    if (text === ' ' && selected?.kind === 'hole') return true;
    // With a placeholder selected, `,` and `)` move on without deleting it; other selections are replaced.
    if ((text === ',' || text === ')') && from !== to && selected?.kind !== 'hole') return false;
    // Typing `,` before an existing comma moves on to the next argument (selecting it if it's a placeholder),
    // so typing a whole call by hand over its snippet doesn't leave stray placeholders behind.
    if (text === ',') {
      const step = /^[^\S\r\n]*,[^\S\r\n]*/.exec(after);
      if (step) {
        view.dispatch({ selection: EditorSelection.cursor(to + step[0].length) });
        const hole = tagsOf(view, pluginRef.current!).find((t) => t.kind === 'hole' && t.from === to + step[0].length);
        if (hole) selectHole(view, hole);
        return true;
      }
    }
    // Typing `)` drops the call's remaining placeholders and steps over the existing parenthesis.
    if (text === ')') {
      const rest = /^(?:[^\S\r\n]*,[^\S\r\n]*\{[^{}\r\n]*\})*[^\S\r\n]*\)/.exec(after);
      if (rest) {
        view.dispatch({ changes: { from: to, to: to + rest[0].length - 1 }, selection: EditorSelection.cursor(to + 1), userEvent: 'input.type' });
        setPopup(null);
        return true;
      }
    }
    return false;
  };

  /** Finish editing but keep keyboard focus on the field itself: Enter goes back in. */
  function leave(view: EditorView) {
    if (box.current) box.current.focus();
    else view.contentDOM.blur();
  }

  const popupKey = (fn: (p: Popup) => void) => () => {
    const p = popupRef.current;
    if (!p) return false;
    fn(p);
    return true;
  };
  handlers.current.keys = {
    ArrowDown: popupKey((p) => setPopup({ ...p, active: (p.active + 1) % p.res.items.length })),
    ArrowUp: popupKey((p) => setPopup({ ...p, active: (p.active - 1 + p.res.items.length) % p.res.items.length })),
    Enter: (view) => {
      const p = popupRef.current;
      if (p) { accept(p.res.items[p.active]); return true; }
      // While the row still has placeholders, Enter moves to the next one; after that it adds a row.
      const next = holeInRow(view, view.state.selection.main.to);
      if (next) { selectHole(view, next); return true; }
      addRow(view);
      return true;
    },
    // Advanced: a literal line break, which the language reads as a continuation or a new statement.
    'Shift-Enter': (view) => { setPopup(null); return insertNewline(view); },
    'Mod-Enter': (view) => { setPopup(null); leave(view); return true; },
    Tab: (view) => {
      // Completing a typed word: Tab accepts. Choices for a tag or blank: Tab moves on without filling it.
      const p = popupRef.current;
      if (p?.mode === 'type') { accept(p.res.items[p.active]); return true; }
      setPopup(null);
      const hole = nextHole(view, 1);
      if (hole) { selectHole(view, hole); return true; }
      return false;
    },
    'Shift-Tab': (view) => {
      setPopup(null);
      const hole = nextHole(view, -1);
      if (hole) { selectHole(view, hole); return true; }
      return false;
    },
    Escape: (view) => {
      if (popupRef.current) { setPopup(null); return true; }
      leave(view);
      return true;
    },
    'Ctrl-Space': (view) => { refreshTyping(view, true); return true; },
    Backspace: (view) => smartDelete(view, false),
    Delete: (view) => smartDelete(view, true),
  };

  function measureRows(view: EditorView) {
    view.requestMeasure({
      key: 'fx-rows',
      read: (v) => {
        const top = box.current?.getBoundingClientRect().top ?? 0;
        return formulaRows(v.state.doc.toString()).map((r) => v.documentTop + v.lineBlockAt(r.start).top - top);
      },
      write: (tops) => setRowTops((prev) => (prev.length === tops.length && prev.every((t, i) => Math.abs(t - tops[i]) < 0.5) ? prev : tops)),
    });
  }

  useLayoutEffect(() => {
    const h = handlers.current;
    const plugin = tagPlugin(() => lookRef.current);
    pluginRef.current = plugin;
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: expr,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          placeholderText(hasParent ? `Type a value, @node or function` : 'Type a number, @node or function'),
          baseTheme,
          plugin,
          Prec.highest(keymap.of(Object.keys(h.keys).map((key) => ({ key, run: (v: EditorView) => h.keys[key](v) })))),
          keymap.of([...historyKeymap, ...defaultKeymap]),
          EditorView.inputHandler.of((v, from, to, text) => h.onInput(v, from, to, text)),
          EditorView.domEventHandlers({
            mousedown: (e, v) => h.onMouseDown(e, v),
            focus: () => { setFocused(true); },
            blur: () => { setFocused(false); setPopup(null); getEditor().breakCoalesce(); },
            keydown: (e) => { e.stopPropagation(); return false; },
          }),
          EditorView.updateListener.of((u) => h.onUpdate(u)),
          EditorView.contentAttributes.of({ 'aria-label': `${def.label} formula`, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
        ],
      }),
    });
    viewRef.current = view;
    measureRows(view);
    return () => { view.destroy(); viewRef.current = null; window.clearTimeout(typingTimer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow outside changes (undo, rename rewrites, examples) unless they came from this field.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (expr !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: expr }, annotations: [External.of(true), Transaction.addToHistory.of(false)] });
    }
  }, [expr]);

  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(''), 4000);
    return () => window.clearTimeout(t);
  }, [status]);

  // The field and its suggestions form a combobox for assistive tech.
  useEffect(() => {
    const el = viewRef.current?.contentDOM;
    if (!el) return;
    el.setAttribute('aria-haspopup', 'listbox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-expanded', popup ? 'true' : 'false');
    if (popup) {
      el.setAttribute('aria-controls', listId);
      el.setAttribute('aria-activedescendant', `${listId}-${popup.active}`);
    } else {
      el.removeAttribute('aria-controls');
      el.removeAttribute('aria-activedescendant');
    }
  }, [popup, listId]);

  // Results, colors and errors changed outside the text: redraw the tags.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: refreshTags.of(null) });
  }, [trace, results, nodes, edges, showError, pending]);

  // Just switched to a formula: focus, select the starting text and offer recipes that replace it.
  useLayoutEffect(() => {
    if (!autoFocus) return;
    const view = viewRef.current;
    if (!view) return;
    const claim = () => {
      view.focus();
      const end = view.state.doc.length;
      // Only the seed value (a channel reading or a number) is a placeholder; a restored formula is kept as is.
      const text = view.state.doc.toString();
      const placeholder = text === initial.current && /^\s*(?:parent\.\w+|-?\d+(?:\.\d+)?)\s*$/.test(text);
      view.dispatch({ selection: placeholder ? EditorSelection.range(0, end) : EditorSelection.cursor(end) });
      if (placeholder) {
        const res = formulaCompletions('', 0, ctx());
        const examples = res?.items.filter((i) => i.kind === 'example') ?? [];
        if (examples.length) setPopup({ res: { from: 0, to: end, items: examples }, active: 0, mode: 'type' });
      } else if (!text.trim()) refreshTyping(view, true);
    };
    claim();
    // A menu that is still closing (the rule menu) can take focus back; claim it again once it's gone.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { if (!view.hasFocus && view.dom.isConnected) claim(); });
    });
    return () => cancelAnimationFrame(frame);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => formulaRows(doc), [doc]);
  const failed = error ? rows.find((r) => r.start <= error.start && error.start <= Math.max(r.end, r.exprStart)) ?? null : null;
  const unit = def.unit ?? '';
  const final = trace && !error ? `${formatChannel(def, trace.value)}${unit}` : null;
  const finalStep = steps.length ? steps[steps.length - 1] : undefined;

  return (
    <div className="mt-2 space-y-1">
      <div
        ref={box}
        tabIndex={-1}
        role="group"
        aria-label={`${def.label} formula — press Enter to edit`}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const v = viewRef.current;
            if (v) { v.focus(); v.dispatch({ selection: EditorSelection.cursor(v.state.doc.length) }); }
          }
          // Keys meant for the field shouldn't fall through to canvas shortcuts (Backspace deletes nodes).
          if (e.key === 'Backspace' || e.key === 'Delete') e.stopPropagation();
        }}
        className={cn(
          'fx relative rounded-[8px] border bg-surface-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50',
          focused ? (showError && !pending ? 'border-danger/70' : 'border-accent') : showError && !pending ? 'border-danger/50' : 'border-transparent hover:border-line-strong',
        )}
        onMouseDown={(e) => {
          // Clicks in the padding or the value column still focus the field.
          if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-row-value]')) {
            e.preventDefault();
            viewRef.current?.focus();
          }
        }}
      >
        <div ref={host} />
        {rows.map((row, i) => {
          const top = rowTops[i];
          if (top === undefined) return null;
          const step = steps.find((s) => s.start === row.start);
          const waiting = !!failed && row.index > failed.index;
          return (
            <div key={i} data-row-value className="pointer-events-auto absolute right-2 flex h-[26px] items-center" style={{ top }}>
              {waiting ? (
                <span className="text-[11px] text-fg-3" title={`Waiting for ${failed!.name ?? 'the row above'}`}>…</span>
              ) : row.final ? (
                final !== null && (
                  <span className="num flex items-center gap-1 text-[12px] font-semibold text-fg" title={`${def.label} = ${final}`}>
                    {finalStep?.type === 'color' && <Swatch hex={finalStep.hex} />}= {final}
                  </span>
                )
              ) : (
                step && <RowValue step={step} />
              )}
            </div>
          );
        })}
        {popup && viewRef.current && (
          <SuggestionPopup
            id={listId}
            view={viewRef.current}
            popup={popup}
            onHover={(i) => setPopup({ ...popup, active: i })}
            onPick={accept}
          />
        )}
      </div>

      {/* Announce the output once typing settles, not on every keystroke. */}
      <span className="sr-only" aria-live="polite">{status || (focused && !typing ? (final !== null ? `${def.label} ${final}` : error?.message ?? '') : '')}</span>
      <div className="flex min-h-5 items-start justify-between gap-2 px-1 text-[11px] leading-snug text-fg-3">
        {showError ? (
          <span className="flex min-w-0 items-start gap-1.5 text-fg-2">
            {pending
              ? <CircleDashed size={12} className="mt-[2px] shrink-0 text-fg-3" />
              : <TriangleAlert size={12} className="mt-[2px] shrink-0 text-danger" />}
            <span>
              {error!.message}
              <span className="text-fg-3"> · using {hasParent ? 'the parent value' : 'the stored value'} for now</span>
            </span>
          </span>
        ) : trace?.adjusted ? (
          <span className="num pt-px text-warning">{trace.adjusted === 'wrap' ? 'wrapped' : 'clamped'} from {formatChannel(def, trace.raw)}</span>
        ) : focused ? (
          <span className="flex items-center gap-1 pt-px">
            {/\{[^{}]*\}/.test(doc)
              ? <><kbd className="font-sans">Tab</kbd> next blank</>
              : <><CornerDownLeft size={10} /> new row <span className="text-line-strong">·</span> <kbd className="font-sans">Esc</kbd> done</>}
          </span>
        ) : <span />}
        {rows.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { const v = viewRef.current; if (v) addRow(v, v.state.doc.length); }}
            className="flex h-5 shrink-0 items-center gap-1 rounded-[5px] px-1 text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Plus size={11} /> Add row
          </button>
        )}
      </div>

      {rename && viewRef.current && (
        <RenamePopover
          {...rename}
          usedBy={usersOf(doc, rename.name)}
          onClose={() => { setRename(null); viewRef.current?.focus(); }}
          onRename={(to) => {
            const view = viewRef.current!;
            const src = view.state.doc.toString();
            const next = renameLocal(src, rename.name, to);
            if (typeof next !== 'string') return next.error;
            view.dispatch({ changes: { from: 0, to: src.length, insert: next }, userEvent: 'input.rename' });
            setRename(null);
            setStatus(`Renamed ${rename.name} to ${to}.`);
            view.focus();
            return null;
          }}
          onDelete={() => { deleteRow(viewRef.current!, rename.index); setRename(null); viewRef.current?.focus(); }}
        />
      )}
    </div>
  );
}

/** The rows after `name`'s declaration that read it ("row3", "Output"). */
function usersOf(src: string, name: string): string[] {
  const rows = formulaRows(src);
  const decl = rows.find((r) => r.name === name);
  if (!decl) return [];
  const uses = formulaTags(src).filter((t) => t.kind === 'row' && t.base === name && t.from > decl.end);
  const users = rows.filter((r) => uses.some((t) => t.from >= r.start && t.to <= r.end));
  return users.map((r) => (r.final && rows.length > 1 && r.name === null ? 'Output' : r.name ?? `row ${r.index + 1}`));
}

function channelLabel(space: Space, key: string): string {
  if ((SPACE_ORDER as string[]).includes(key)) return SPACES[key as Space].label;
  if (key === 'alpha' || key === 'a') return 'A';
  const def = channelDefs(space).find((d) => d.key === key) ?? SPACE_ORDER.flatMap((s) => channelDefs(s)).find((d) => d.key === key);
  return def?.short ?? key.toUpperCase();
}

function Swatch({ hex, size = 10 }: { hex?: string | null; size?: number }) {
  return (
    <span className="checker relative inline-block shrink-0 overflow-hidden rounded-[3px] align-middle" style={{ width: size, height: size }}>
      <span className="absolute inset-0" style={{ background: hex ?? 'transparent' }} />
      <span className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.3)]" />
    </span>
  );
}

function RowValue({ step }: { step: { type: string; value: string; hex?: string } }) {
  if (step.type === 'color') return <span title={step.hex ?? step.value}><Swatch hex={step.hex ?? step.value} size={12} /></span>;
  return <span className="num max-w-[56px] truncate text-[11px] text-fg-3" title={step.value}>{step.value}</span>;
}

// ── Suggestions popup ────────────────────────────────────────
const KIND_BADGE: Record<string, { glyph: ReactNode; cls: string }> = {
  node: { glyph: <AtSign size={11} />, cls: 'text-(--app-syn-ref)' },
  variable: { glyph: 'x', cls: 'text-(--app-syn-var) italic' },
  function: { glyph: 'ƒ', cls: 'text-(--app-syn-fn)' },
  property: { glyph: '.', cls: 'text-fg-2' },
  space: { glyph: <Layers size={11} />, cls: 'text-fg-2' },
  keyword: { glyph: 'if', cls: 'text-(--app-syn-kw) text-[9px]' },
  local: { glyph: <CornerDownRight size={11} />, cls: 'text-(--app-syn-local)' },
  example: { glyph: <Sparkles size={11} />, cls: 'text-accent' },
  value: { glyph: <Hash size={10} />, cls: 'text-(--app-syn-num)' },
  operator: { glyph: '±', cls: 'text-fg-2' },
};

function SuggestionPopup({ id, view, popup, onHover, onPick }: {
  id: string; view: EditorView; popup: Popup; onHover: (i: number) => void; onPick: (item: CompletionItem) => void;
}) {
  const { res, active, title } = popup;
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    // Follow the anchor wherever layout moves it (scrolling, resizing, content changing above it).
    let frame = 0;
    let last = '';
    const tick = () => {
      const c = view.coordsAtPos(Math.min(res.from, view.state.doc.length), 1) ?? view.dom.getBoundingClientRect();
      const box = view.dom.getBoundingClientRect();
      const key = `${c.left}|${c.top}|${c.bottom}|${box.left}`;
      if (key !== last) { last = key; setPos({ left: Math.max(box.left, Math.min(c.left - 6, box.right - 250)), top: c.top, bottom: c.bottom }); }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [view, res.from]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  if (!pos) return null;
  const current = res.items[active];
  const below = innerHeight - pos.bottom > 260 || pos.top < 280;
  const style = below ? { left: pos.left, top: pos.bottom + 6, width: 250 } : { left: pos.left, bottom: innerHeight - pos.top + 6, width: 250 };
  return createPortal(
    <div
      id={id}
      role="listbox"
      aria-label={title ? `Choices for ${title.name}` : 'Suggestions'}
      className="glass animate-pop fixed z-[60] overflow-hidden rounded-[10px] shadow-panel"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      {title && (
        <div className="border-b border-line px-2.5 pb-1.5 pt-2 text-[11px] leading-snug">
          <div className="num font-semibold text-fg">{title.name}</div>
          <div className="text-fg-3">{title.doc}</div>
        </div>
      )}
      <div ref={list} className="max-h-[208px] overflow-y-auto p-1">
        {res.items.map((item, i) => {
          const badge = KIND_BADGE[item.kind] ?? KIND_BADGE.value;
          return (
            <div
              key={`${item.kind}:${item.label}:${i}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              data-index={i}
              onMouseMove={() => { if (i !== active) onHover(i); }}
              onClick={() => onPick(item)}
              className={cn('flex h-7 cursor-default items-center gap-2 rounded-[6px] px-1.5', i === active ? 'bg-accent text-accent-fg' : 'text-fg')}
            >
              {item.hex ? <Swatch hex={item.hex} size={14} /> : (
                <span className={cn('num grid h-3.5 w-3.5 shrink-0 place-items-center text-[11px] font-semibold', i === active ? 'text-accent-fg' : badge.cls)}>{badge.glyph}</span>
              )}
              <span className={cn('min-w-0 flex-1 truncate', item.kind === 'example' ? 'text-[12px]' : 'num text-[12px]')}>{item.label}</span>
              {item.detail && <span className={cn('num shrink-0 text-[10.5px]', i === active ? 'text-accent-fg/80' : 'text-fg-3')}>{item.detail}</span>}
            </div>
          );
        })}
      </div>
      {current?.doc && current.doc !== title?.doc && (
        <div className="border-t border-line px-2.5 py-1.5 text-[11px] leading-snug text-fg-2">
          {current.kind === 'example' && <div className="num mb-0.5 truncate text-fg">{current.insert.replace(/\n/g, ' ⏎ ')}</div>}
          {current.doc}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Rename a row ─────────────────────────────────────────────
function RenamePopover({ name, left, top, usedBy, onClose, onRename, onDelete }: {
  name: string; left: number; top: number; usedBy: string[]; onClose: () => void; onRename: (to: string) => string | null; onDelete: () => void;
}) {
  const [value, setValue] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.select(); }, []);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('[data-rename]')) onClose(); };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [onClose]);
  return createPortal(
    <div data-rename className="glass animate-pop fixed z-[60] w-[220px] rounded-[10px] p-2 shadow-panel" style={{ left, top }}>
      <div className="mb-1.5 text-[11px] text-fg-3">Row name — other rows use it to read this value</div>
      <div className="flex items-center gap-1.5">
        <input
          ref={input}
          value={value}
          spellCheck={false}
          aria-label="Row name"
          onChange={(e) => { setValue(e.target.value); setProblem(null); }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            if (e.key === 'Enter') {
              e.preventDefault();
              const to = value.trim();
              if (!to || to === name) { onClose(); return; }
              setProblem(onRename(to));
            }
          }}
          className="num h-7 min-w-0 flex-1 rounded-[6px] border border-line bg-surface-2 px-2 text-[12px] text-fg outline-none focus:border-accent"
        />
        <button
          type="button"
          title="Delete row"
          aria-label="Delete row"
          onClick={onDelete}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-fg-3 transition-colors hover:bg-surface-3 hover:text-danger"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {problem && <div className="mt-1.5 text-[11px] text-danger">{problem}</div>}
      {usedBy.length > 0 && (
        <div className="mt-1.5 text-[11px] leading-snug text-fg-3">
          Used by {usedBy.join(', ')}. Renaming updates them; deleting leaves them waiting for a value.
        </div>
      )}
    </div>,
    document.body,
  );
}
