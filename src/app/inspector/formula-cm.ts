// ─────────────────────────────────────────────────────────────
// CodeMirror pieces for the formula editor: every token drawn as a tag, rows with
// a line class, and atomic ranges so the caret steps over whole tags.
// The React component owns state; this file only turns text into decorations.
// ─────────────────────────────────────────────────────────────
import { type Extension, type Range, RangeSet, StateEffect } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { formulaRows } from '@/engine/formula-service';
import { type Tag, formulaTags } from './formula-tags';

/** Live information the tags show: swatches, row values and looked-up numbers. */
export interface TagLook {
  colorOf: (base: string) => string | null;
  row: (name: string) => { type: 'number' | 'boolean' | 'color' | 'group'; value: string; hex?: string } | null;
  /** The live value of a looked-up expression, e.g. `parent.h` → `262`. */
  valueOf: (text: string) => string | null;
  /** Channel key → short label, e.g. `l` → `L`. */
  channel: (key: string) => string;
  /** The current error's range, marked on the tags it covers. */
  error: () => { start: number; end: number } | null;
}

/** Ask the tags to redraw after outside data (results, errors) changed. */
export const refreshTags = StateEffect.define<null>();

interface TagSpec {
  kind: Tag['kind'];
  label: string;
  sub?: string;
  hex?: string | null;
  value?: string;
  title?: string;
  active: boolean;
  error: boolean;
}

class TagWidget extends WidgetType {
  constructor(readonly spec: TagSpec) { super(); }
  eq(other: TagWidget) {
    const a = this.spec; const b = other.spec;
    return a.kind === b.kind && a.label === b.label && a.sub === b.sub && a.hex === b.hex && a.value === b.value
      && a.title === b.title && a.active === b.active && a.error === b.error;
  }
  toDOM() {
    const { kind, label, sub, hex, value, title, active, error } = this.spec;
    const el = document.createElement('span');
    el.className = `fx-t fx-${kind}${active ? ' is-active' : ''}${error ? ' is-error' : ''}`;
    el.dataset.tag = kind;
    if (title) el.title = title;
    if (hex !== undefined) {
      const sw = document.createElement('span');
      sw.className = 'fx-sw checker';
      const fill = document.createElement('span');
      fill.style.background = hex ?? 'transparent';
      sw.appendChild(fill);
      el.appendChild(sw);
    }
    const text = document.createElement('span');
    text.className = 'fx-tl';
    text.textContent = label;
    el.appendChild(text);
    if (sub) {
      const s = document.createElement('span');
      s.className = 'fx-sub';
      s.textContent = sub;
      el.appendChild(s);
    }
    if (value !== undefined) {
      const v = document.createElement('span');
      v.className = 'fx-val';
      v.textContent = value;
      el.appendChild(v);
    }
    return el;
  }
  ignoreEvent() { return false; }
}

/** "Output" in front of the last row once there are several, so the result row is unmistakable. */
class OutputWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'fx-t fx-out';
    el.textContent = 'Output';
    el.title = 'The last row is this channel’s value';
    return el;
  }
  ignoreEvent() { return true; }
}

const OP_NAMES: Record<string, string> = {
  '+': 'plus', '−': 'minus', '×': 'times', '÷': 'divided by', '%': 'remainder', '>': 'greater than', '<': 'less than',
  '≥': 'at least', '≤': 'at most', '=': 'equals', '≠': 'is not', and: 'and', or: 'or', not: 'not', '?': 'then', ':': 'else',
};

function spec(tag: Tag, look: TagLook, active: boolean, error: boolean): TagSpec {
  const base: TagSpec = { kind: tag.kind, label: tag.display, active, error };
  switch (tag.kind) {
    case 'color': {
      const hex = look.colorOf(tag.base ?? '');
      const sub = tag.path?.length ? tag.path.map((p) => look.channel(p)).join(' ') : undefined;
      const live = tag.path?.length ? look.valueOf(tag.text) : null;
      return { ...base, hex, sub, title: live !== null ? `${tag.text} = ${live}` : tag.text };
    }
    case 'row': {
      const row = look.row(tag.base ?? '');
      const sub = tag.path?.length ? tag.path.map((p) => look.channel(p)).join(' ') : undefined;
      const live = tag.path?.length ? look.valueOf(tag.text) : null;
      const isColor = row?.type === 'color' && !tag.path?.length;
      return {
        ...base, sub, hex: row?.type === 'color' ? row.hex ?? null : undefined,
        title: `${tag.text} = ${live ?? row?.value ?? '…'}`,
        value: !isColor && !tag.path?.length && row ? row.value : undefined,
      };
    }
    case 'label': return { ...base, title: `Row “${tag.display}” — click to rename or delete` };
    case 'hex': return { ...base, hex: tag.text, label: tag.text.toUpperCase() };
    case 'hole': return { ...base, title: `Fill in ${tag.display}` };
    case 'op': return { ...base, title: OP_NAMES[tag.display] ? `${OP_NAMES[tag.display]} — click to change` : undefined };
    case 'fn': return { ...base, title: `${tag.display}( … )` };
    case 'const': return { ...base, label: tag.display === 'pi' ? 'π' : tag.display, title: look.valueOf(tag.text) ?? undefined };
    default: return base;
  }
}

const MARK_CLASS: Partial<Record<Tag['kind'], string>> = {
  num: 'fx-m fx-num', kw: 'fx-m fx-kw', name: 'fx-m fx-name', prop: 'fx-m fx-prop', paren: 'fx-paren', close: 'fx-close',
  comma: 'fx-comma', comment: 'fx-comment', error: 'fx-m fx-bad', punct: 'fx-punct',
};

export interface TagState { tags: Tag[]; decorations: DecorationSet; atomic: RangeSet<Decoration> }

function build(view: EditorView, look: TagLook): TagState {
  const src = view.state.doc.toString();
  const tags = formulaTags(src);
  const sel = view.state.selection.main;
  const err = look.error();
  const ranges: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  for (const tag of tags) {
    const active = !sel.empty && sel.from === tag.from && sel.to === tag.to;
    const error = !!err && err.end > err.start && tag.from < err.end && tag.to > err.start;
    if (tag.atomic) {
      const deco = Decoration.replace({ widget: new TagWidget(spec(tag, look, active, error)) });
      ranges.push(deco.range(tag.from, tag.to));
      atomic.push(deco.range(tag.from, tag.to));
    } else {
      const cls = MARK_CLASS[tag.kind];
      if (!cls) continue;
      ranges.push(Decoration.mark({ class: `${cls}${active ? ' is-active' : ''}${error ? ' is-error' : ''}` }).range(tag.from, tag.to));
    }
  }
  // Errors that sit between tags (a missing value at the end, say) still get a mark.
  if (err && err.end > err.start && !tags.some((t) => t.from < err.end && t.to > err.start) && err.end <= src.length) {
    ranges.push(Decoration.mark({ class: 'fx-bad-gap' }).range(err.start, err.end));
  }
  // Rows: a line class so each row reserves room for its value; the output row is emphasized.
  const rows = formulaRows(src);
  const doc = view.state.doc;
  const last = rows[rows.length - 1];
  if (rows.length > 1 && last.name === null) ranges.push(Decoration.widget({ widget: new OutputWidget(), side: -1 }).range(last.start));
  for (const row of rows) {
    const first = doc.lineAt(row.start).number;
    const last = doc.lineAt(Math.max(row.start, row.end)).number;
    for (let n = first; n <= last; n++) {
      ranges.push(Decoration.line({ class: row.final ? 'fx-line is-final' : 'fx-line' }).range(doc.line(n).from));
    }
  }
  return { tags, decorations: Decoration.set(ranges, true), atomic: RangeSet.of(atomic, true) };
}

/** The decorations plugin. `look` is read on every rebuild, so it can return live data. */
export function tagPlugin(look: () => TagLook) {
  return ViewPlugin.fromClass(class {
    state: TagState;
    constructor(view: EditorView) { this.state = build(view, look()); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshTags)))) {
        this.state = build(u.view, look());
      }
    }
  }, {
    decorations: (p) => p.state.decorations,
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.state.atomic ?? RangeSet.empty),
  });
}

export type TagPlugin = ReturnType<typeof tagPlugin>;

/** Current tags, as last drawn. */
export const tagsOf = (view: EditorView, plugin: TagPlugin): Tag[] => view.plugin(plugin)?.state.tags ?? [];

// CodeMirror's own styles are unlayered, so editor-level overrides live here rather than in index.css.
export const baseTheme: Extension = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--app-fg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'inherit', overflow: 'visible' },
  '.cm-content': { padding: '5px 0', caretColor: 'var(--app-fg)' },
  '.cm-line': { padding: '0 8px' },
  '.cm-line.fx-line': { paddingRight: '64px' }, // room for the row's value
  '.cm-placeholder': { color: 'var(--app-fg-3)' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '1.5px solid var(--app-fg)' },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { background: 'var(--app-accent-soft)' },
});
