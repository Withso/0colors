// ─────────────────────────────────────────────────────────────
// Formula source → the tags the editor draws. Pure: no DOM, no React.
//
// The source text stays the single source of truth; tags are a view of it. Atomic
// tags (colors, rows, functions, operators, placeholders, row labels) are drawn as
// widgets the caret steps over; the rest (numbers, keywords, words being typed)
// stay editable text with a tag look.
// ─────────────────────────────────────────────────────────────
import { type FormulaSpan, formulaRows, highlightFormula } from '@/engine/formula-service';

export type TagKind =
  | 'label' //   `row1 =` at the start of a named row
  | 'color' //   parent, self, white, black or @node, optionally with a channel path
  | 'row' //     a reference to an earlier row, optionally with a channel path
  | 'const' //   dark, light, pi
  | 'fn' //      a function name with its opening parenthesis: `mix(`
  | 'close' //   the closing parenthesis of a call
  | 'paren' //   grouping parentheses
  | 'comma'
  | 'op' //      operators, drawn as math glyphs
  | 'kw' //      if, then, else, and, or, not, true, false
  | 'num'
  | 'hex'
  | 'hole' //    an argument still to fill in: {a}
  | 'prop' //    a channel that isn't merged into a color tag, e.g. the `.l` of `mix(…).l`
  | 'name' //    an unknown or unfinished word
  | 'comment'
  | 'error'
  | 'punct';

export interface Tag {
  from: number;
  to: number;
  kind: TagKind;
  /** Source text. */
  text: string;
  /** What the tag shows. */
  display: string;
  /** Drawn as a widget; the caret never lands inside. */
  atomic: boolean;
  /** Color and row tags: the base (`parent`, `@brand`, `row1`) and the channel path after it. */
  base?: string;
  path?: string[];
  /** Function tags: where the matching `)` is, if typed. */
  close?: number;
}

const COLOR_VARS = new Set(['parent', 'self', 'white', 'black']);
const CONSTS = new Set(['dark', 'light', 'pi']);

const GLYPHS: Record<string, string> = {
  '*': '×', '·': '×', '/': '÷', '-': '−', '>=': '≥', '<=': '≤', '!=': '≠', '==': '=', '&&': 'and', '||': 'or', '!': 'not',
};
export const operatorGlyph = (op: string) => GLYPHS[op] ?? op;

/** Every tag in `src`, sorted and non-overlapping. Whitespace between tags is not a tag. */
export function formulaTags(src: string): Tag[] {
  const spans = highlightFormula(src);
  const rows = formulaRows(src);
  // A row label covers `name =` and the spaces after it, never a line break or comment (CodeMirror can't
  // replace line breaks from a plugin, and the expression may start on the next line).
  const labels = new Map<number, number>();
  for (const row of rows) {
    if (row.name === null) continue;
    const eq = spans.find((s) => s.start >= row.start && s.kind === 'operator' && src.slice(s.start, s.end) === '=');
    if (!eq) continue;
    let end = eq.end;
    while (end < row.exprStart && (src[end] === ' ' || src[end] === '\t')) end++;
    labels.set(row.start, end);
  }

  const text = (s: FormulaSpan) => src.slice(s.start, s.end);
  const out: Tag[] = [];
  const closers = new Map<number, number>(); // index of a call's `(` span → index of its `)` span
  const stack: number[] = [];
  for (let i = 0; i < spans.length; i++) {
    const t = text(spans[i]);
    if (spans[i].kind === 'comment') continue;
    if (t === '(') stack.push(i);
    else if (t === ')' && stack.length) closers.set(stack.pop()!, i);
  }
  const closeAt = new Map<number, number>(); // `)` span index → its function tag
  let skipTo = -1;

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span.start < skipTo) continue;
    const t = text(span);
    const label = labels.get(span.start);
    if (label !== undefined) {
      out.push({ from: span.start, to: label, kind: 'label', text: src.slice(span.start, label), display: t, atomic: true });
      skipTo = label;
      continue;
    }
    const push = (kind: TagKind, atomic: boolean, extra: Partial<Tag> = {}) =>
      out.push({ from: span.start, to: span.end, kind, text: t, display: t, atomic, ...extra });

    switch (span.kind) {
      case 'ref':
      case 'variable':
      case 'local': {
        const isColor = span.kind === 'ref' || COLOR_VARS.has(t);
        if (!isColor && span.kind === 'variable') { push(CONSTS.has(t) ? 'const' : 'name', CONSTS.has(t)); break; }
        // Merge `@brand` `.` `hsl` `.` `l` into one tag.
        const path: string[] = [];
        let j = i + 1;
        let end = span.end;
        while (spans[j] && text(spans[j]) === '.' && spans[j + 1]?.kind === 'property' && spans[j].start === end && spans[j + 1].start === spans[j].end) {
          path.push(text(spans[j + 1]));
          end = spans[j + 1].end;
          j += 2;
        }
        const base = span.kind === 'ref' ? t.slice(1) : t;
        out.push({
          from: span.start, to: end, kind: isColor ? 'color' : 'row', text: src.slice(span.start, end), display: base,
          atomic: true, base: t, path,
        });
        i = j - 1;
        break;
      }
      case 'function': {
        const open = spans[i + 1];
        if (open && text(open) === '(' && open.start === span.end) {
          const closeIndex = closers.get(i + 1);
          if (closeIndex !== undefined) closeAt.set(closeIndex, out.length);
          out.push({
            from: span.start, to: open.end, kind: 'fn', text: src.slice(span.start, open.end), display: t, atomic: true,
            close: closeIndex === undefined ? undefined : spans[closeIndex].start,
          });
          i++;
        } else push('name', false);
        break;
      }
      case 'punctuation':
        if (t === '(') push('paren', false);
        else if (t === ')') push(closeAt.has(i) ? 'close' : 'paren', false);
        else if (t === ',') push('comma', false);
        else push('punct', false);
        break;
      case 'operator':
        push('op', true, { display: operatorGlyph(t) });
        break;
      case 'keyword':
      case 'boolean':
        push('kw', false, { display: t.toLowerCase() });
        break;
      case 'number': push('num', false); break;
      case 'hex': push('hex', true); break;
      case 'placeholder': push('hole', true, { display: t.replace(/^\{\s*|\s*\}$/g, '') }); break;
      case 'property': push('prop', false); break;
      case 'comment': push('comment', false); break;
      case 'error': push('error', false); break;
      default: push('name', false);
    }
  }
  return out;
}

/** The tag that contains `pos` (or ends at it when `side` is -1 / starts at it when `side` is 1). */
export function tagAt(tags: Tag[], pos: number, side: -1 | 0 | 1 = 0): Tag | undefined {
  return tags.find((t) => (side < 0 ? t.from < pos && pos <= t.to : side > 0 ? t.from <= pos && pos < t.to : t.from <= pos && pos <= t.to));
}

/** Placeholders, in order. */
export const holes = (tags: Tag[]) => tags.filter((t) => t.kind === 'hole');

/** An unfilled blank is work in progress, not a mistake: the UI shows it calmly. */
export const isBlankError = (error: { message: string } | null | undefined) => !!error && /^Fill in\b/.test(error.message);
