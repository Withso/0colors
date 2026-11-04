import { type NodeType, hasOutput } from './model';
import { type Space, SPACE_ORDER, SPACES, channelDefs, formatChannel } from './color/spaces';
import { parseHex, toHex } from './color/convert';
import { type Expr, type FormulaParam, FORMULA_FUNCTIONS, FORMULA_VARIABLES, RESERVED_NAMES, parseCached } from './formula';

export type FormulaTokenKind =
  | 'number' | 'hex' | 'ref' | 'variable' | 'function' | 'property' | 'operator' | 'keyword'
  | 'boolean' | 'local' | 'name' | 'placeholder' | 'punctuation' | 'comment' | 'error';
export interface FormulaSpan { start: number; end: number; kind: FormulaTokenKind }

export interface CompletionNodeInfo { slug: string; name: string; type: NodeType; hex?: string | null }
export interface CompletionContext {
  space: Space;
  channel: string;
  hasParent: boolean;
  nodes: CompletionNodeInfo[];
}
export type CompletionKind = 'node' | 'variable' | 'function' | 'property' | 'space' | 'keyword' | 'local' | 'example' | 'value' | 'operator';
export interface CompletionItem {
  label: string;
  insert: string;
  caret?: number;
  select?: { from: number; to: number };
  kind: CompletionKind;
  detail?: string;
  doc?: string;
  hex?: string | null;
}
export interface CompletionResult { from: number; to: number; items: CompletionItem[] }
export interface SignatureHelp { name: string; signature: string; params: string[]; active: number; doc: string }
export interface DisplayToken { kind: FormulaTokenKind | 'newline'; text: string; ref?: string }

interface Lexeme extends FormulaSpan { text: string }
interface Segment { tokens: Lexeme[]; completeAt: number | null }
type ValueType = 'number' | 'boolean' | 'color' | 'unknown' | Space;
interface LocalInfo { name: string; type: ValueType; availableAt: number }

const functions = new Map(FORMULA_FUNCTIONS.map((f) => [f.name, f]));
const variables = new Map(FORMULA_VARIABLES.filter((v) => /^[a-z]+$/.test(v.name)).map((v) => [v.name, v]));
const keywords = new Set(['if', 'then', 'else', 'and', 'or', 'not']);
const binaryOperators = new Set(['+', '-', '*', '/', '%', '<', '<=', '>', '>=', '==', '!=', '&&', '||', '×', '·', '÷', '−', '≤', '≥', '≠', 'and', 'or']);
const isWord = (text: string) => /^[A-Za-z_]\w*$/.test(text);
const isSpace = (name: string): name is Space => SPACE_ORDER.some((s) => s === name);

/** Recovery lexer: an unfinished token is data, never an exception. */
function scan(src: string): Lexeme[] {
  const out: Lexeme[] = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    const start = i;
    let kind: FormulaTokenKind;
    if (src.startsWith('//', i)) {
      while (i < src.length && !/[\r\n]/.test(src[i])) i++;
      kind = 'comment';
    } else if (src[i] === '{') {
      i++;
      while (i < src.length && !/[{}\r\n]/.test(src[i])) i++;
      const inner = src.slice(start + 1, i);
      const closed = src[i] === '}';
      if (closed) i++;
      kind = closed && inner.trim() && inner.length <= 32 ? 'placeholder' : 'error';
    } else if (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      if (/[eE]/.test(src[i] ?? '')) {
        i++;
        if (src[i] === '+' || src[i] === '-') i++;
        while (i < src.length && /[0-9]/.test(src[i])) i++;
      }
      kind = Number.isFinite(Number(src.slice(start, i))) ? 'number' : 'error';
    } else if (src[i] === '#') {
      i++;
      while (i < src.length && /\w/.test(src[i])) i++;
      kind = parseHex(src.slice(start, i)) ? 'hex' : 'error';
    } else if (src[i] === '@') {
      i++;
      while (i < src.length && /[\w-]/.test(src[i])) i++;
      kind = 'ref';
    } else if (/[A-Za-z_]/.test(src[i])) {
      while (i < src.length && /\w/.test(src[i])) i++;
      const text = src.slice(start, i);
      const word = text.toLowerCase();
      const previous = out.findLast((t) => t.kind !== 'comment');
      kind = previous?.text === '.' ? 'property'
        : keywords.has(word) ? 'keyword'
        : word === 'true' || word === 'false' ? 'boolean'
        : variables.has(text) ? 'variable'
        : functions.has(word) ? 'function' : 'name';
    } else if (['<=', '>=', '==', '!=', '&&', '||'].includes(src.slice(i, i + 2))) {
      i += 2;
      kind = 'operator';
    } else if ('+-*/%?:<>!=×·÷−≤≥≠'.includes(src[i])) {
      i++;
      kind = 'operator';
    } else if ('(),.;'.includes(src[i])) {
      i++;
      kind = 'punctuation';
    } else {
      i += (src.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
      kind = 'error';
    }
    out.push({ start, end: i, kind, text: src.slice(start, i) });
  }
  return out;
}

function canEnd(t: Lexeme): boolean {
  return t.text === ')' || ['number', 'hex', 'ref', 'variable', 'function', 'property', 'boolean', 'local', 'name', 'placeholder'].includes(t.kind);
}

function continuesLine(previous: Lexeme, next: Lexeme): boolean {
  const word = next.text.toLowerCase();
  return !canEnd(previous) || binaryOperators.has(word) || ['.', '?', ':', 'then', 'else'].includes(word)
    || (next.text === '(' && isWord(previous.text));
}

function segments(src: string, tokens: Lexeme[]): Segment[] {
  const out: Segment[] = [];
  let current: Lexeme[] = [];
  let depth = 0;
  for (const t of tokens) {
    if (t.kind === 'comment') continue;
    const previous = current[current.length - 1];
    if (depth === 0 && previous && /[\r\n]/.test(src.slice(previous.end, t.start)) && !continuesLine(previous, t)) {
      out.push({ tokens: current, completeAt: t.start });
      current = [];
    }
    if (depth === 0 && t.text === ';') {
      if (current.length) out.push({ tokens: current, completeAt: t.end });
      current = [];
      continue;
    }
    current.push(t);
    if (t.text === '(') depth++;
    if (t.text === ')') depth = Math.max(0, depth - 1);
  }
  if (current.length) {
    const last = current[current.length - 1];
    const terminated = depth === 0 && canEnd(last) && /[\r\n]/.test(src.slice(last.end));
    out.push({ tokens: current, completeAt: terminated ? src.length : null });
  }
  return out;
}

function valueType(expr: Expr, locals: Map<string, ValueType>, expected: ValueType = 'unknown'): ValueType {
  switch (expr.k) {
    case 'num': return 'number';
    case 'bool': return 'boolean';
    case 'hole': return expected;
    case 'ref':
    case 'hex': return 'color';
    case 'id': return locals.get(expr.name) ?? (['parent', 'self', 'white', 'black'].includes(expr.name) ? 'color'
      : ['dark', 'light'].includes(expr.name) ? 'boolean' : expr.name === 'pi' ? 'number' : 'unknown');
    case 'member': return valueType(expr.obj, locals) === 'color' && isSpace(expr.prop) ? expr.prop : 'number';
    case 'unary': return expr.op === '!' ? 'boolean' : 'number';
    case 'bin': return ['+', '-', '*', '/', '%'].includes(expr.op) ? 'number' : 'boolean';
    case 'cond': {
      const a = valueType(expr.a, locals, expected);
      return a === valueType(expr.b, locals, expected) ? a : 'unknown';
    }
    case 'call': {
      if (expr.fn === 'if' && expr.args.length === 3) {
        const a = valueType(expr.args[1], locals, 'number');
        return a === valueType(expr.args[2], locals, 'number') ? a : 'unknown';
      }
      return functions.get(expr.fn)?.returns ?? 'unknown';
    }
    case 'program': return valueType(expr.statements[expr.statements.length - 1].expr, locals);
  }
}

function localInfo(src: string, parts: Segment[]): LocalInfo[] {
  const out: LocalInfo[] = [];
  const types = new Map<string, ValueType>();
  for (const part of parts) {
    if (part.completeAt === null || part.tokens[1]?.text !== '=') continue;
    const first = part.tokens[0];
    const last = part.tokens[part.tokens.length - 1];
    try {
      const ast = parseCached(src.slice(first.start, last.end));
      if (ast.k !== 'program') continue;
      for (const statement of ast.statements) {
        if (statement.name === null) continue;
        const type = valueType(statement.expr, types);
        types.set(statement.name, type);
        out.push({ name: statement.name, type, availableAt: part.completeAt });
      }
    } catch { /* The next complete statement can still supply useful completions. */ }
  }
  return out;
}

/** Sorted, non-overlapping spans, including malformed and unfinished tokens. */
export function highlightFormula(src: string): FormulaSpan[] {
  const tokens = scan(src);
  const parts = segments(src, tokens);
  const locals = localInfo(src, parts);
  const declarations = new Set(parts.filter((p) => p.tokens[0]?.kind === 'name' && p.tokens[1]?.text === '=').map((p) => p.tokens[0].start));
  return tokens.map(({ start, end, kind, text }) => ({
    start, end,
    kind: kind === 'name' && (declarations.has(start) || locals.some((l) => l.name === text && l.availableAt <= start)) ? 'local' : kind,
  }));
}

/** Match class dominates ranking, so a fuzzy match never hides a prefix match. */
function matchScore(query: string, text: string): number {
  const needle = query.toLowerCase();
  const hay = text.toLowerCase();
  if (!needle) return 0;
  if (hay === needle) return 0;
  if (hay.startsWith(needle)) return 1;
  const starts = [...text.matchAll(/(?:^|[\s_\-/])([^\s_\-/]+)|[A-Z][a-z]+/g)];
  if (starts.some((m) => (m[1] ?? m[0]).toLowerCase().startsWith(needle))) return 100;
  let at = -1;
  let gaps = 0;
  for (const ch of needle) {
    const next = hay.indexOf(ch, at + 1);
    if (next < 0) return Infinity;
    gaps += next - at - 1;
    at = next;
  }
  return 200 + gaps;
}

function ranked(items: CompletionItem[], query: string, extra: (item: CompletionItem) => string = () => ''): CompletionItem[] {
  return items.map((item, index) => ({ item, index, score: Math.min(matchScore(query, item.label.replace(/^@/, '')), matchScore(query, extra(item))) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, 40).map((entry) => entry.item);
}

function nodeItems(nodes: CompletionNodeInfo[]): CompletionItem[] {
  return nodes.filter((n) => hasOutput(n.type)).map((n) => ({
    label: `@${n.slug}`, insert: `@${n.slug}`, kind: 'node', detail: n.type,
    doc: `Read the color from “${n.name}”.`, hex: n.hex,
  }));
}

function examples(ctx: CompletionContext): CompletionItem[] {
  const base = ctx.hasParent ? 'parent' : 'self';
  const subject = ctx.hasParent ? 'the parent' : 'this color';
  const def = channelDefs(ctx.space).find((d) => d.key === ctx.channel) ?? SPACES[ctx.space].channels[0];
  const key = def.key;
  const start = `${base}.${key}`;
  const offset = key === 'h' ? `mod(${start} + 30, 360)`
    : key === 'c' || key === 's' || key === 'alpha' ? `${start} * 0.75`
    : `clamp(${start} - 10, ${def.min}, ${def.max})`;
  const doc = key === 'h' ? `Rotate ${subject}’s hue by 30°.`
    : key === 'c' || key === 's' || key === 'alpha' ? `Reduce ${subject}’s ${def.label.toLowerCase()} by 25%.`
    : `Darker than ${subject} by 10, within the channel’s range.`;
  const light = key === 'c' && ctx.space === 'oklch' ? 0.16 : key === 'h' ? 250 : key === 'alpha' ? 100 : def.max * 0.25;
  const dark = key === 'c' && ctx.space === 'oklch' ? 0.1 : key === 'h' ? 280 : key === 'alpha' ? 80 : def.max * 0.8;
  const conditional = `if dark then ${dark} else ${light}`;
  const step = (from: string) => (key === 'h' ? `mod(${from}.h + 30, 360)` : key === 'c' || key === 's' || key === 'alpha' ? `${from}.${key} * 0.75` : `clamp(${from}.${key} - 10, ${def.min}, ${def.max})`);
  const make = (label: string, insert: string, description: string): CompletionItem => ({ label, insert, kind: 'example', detail: 'Example', doc: description });
  const out = [
    make(key === 'h' ? 'Rotate the hue' : key === 'alpha' ? 'More transparent' : key === 'c' || key === 's' ? `Less ${def.label.toLowerCase()}` : `Darker than ${subject}`, offset, doc),
    make('Blend with white', `mix(${base}, white, 0.5)`, `Halfway from ${subject} to white; the channel takes the blend’s ${def.label.toLowerCase()}.`),
    make('Light and dark themes', conditional, 'Use a different value in light and dark themes.'),
    make('Two steps: blend, then adjust', `row1 = mix(${base}, white, 0.5)\n${step('row1')}`, 'Row 1 blends; the last row adjusts row 1 and is the output.'),
  ];
  if (key === 'l' || key === 't' || ctx.space === 'rgb') {
    const contrast = `if contrast(${base}, white) >= 4.5 then ${ctx.space === 'rgb' ? 255 : 98} else ${ctx.space === 'rgb' ? 0 : 12}`;
    out.push(make('Readable text', contrast, `Choose a light or dark channel value for text on ${subject}.`));
  }
  return out;
}

/** Find the complete primary expression immediately to the left of a dot. */
function primaryStart(tokens: Lexeme[], end: number): number | null {
  if (end < 0) return null;
  let start = end;
  if (tokens[end].text === ')') {
    let depth = 1;
    start--;
    for (; start >= 0; start--) {
      if (tokens[start].text === ')') depth++;
      if (tokens[start].text === '(' && --depth === 0) break;
    }
    if (start < 0) return null;
    if (start > 0 && isWord(tokens[start - 1].text) && !keywords.has(tokens[start - 1].text.toLowerCase())) start--;
    else if (start > 0 && tokens[start - 1].text.toLowerCase() === 'if') start--;
  } else if (!canEnd(tokens[end])) return null;
  if (tokens[start - 1]?.text === '.') return primaryStart(tokens, start - 2);
  return start;
}

function propertyItems(src: string, tokens: Lexeme[], dot: number, ctx: CompletionContext, locals: Map<string, ValueType>): CompletionItem[] {
  const start = primaryStart(tokens, dot - 1);
  if (start === null) return [];
  try {
    const ast = parseCached(src.slice(tokens[start].start, tokens[dot].start));
    const type = valueType(ast, locals);
    if (type !== 'color' && !isSpace(type)) return [];
    const space = type === 'color' ? ctx.space : type;
    const defs = channelDefs(space);
    const ordered = [...defs].sort((a, b) => Number(b.key === ctx.channel) - Number(a.key === ctx.channel));
    const items: CompletionItem[] = ordered.map((ch) => ({
      label: ch.key, insert: ch.key, kind: 'property', detail: `${ch.min}–${ch.max}${ch.unit ?? ''}`, doc: ch.hint,
    }));
    if (type === 'color') {
      items.push(...SPACE_ORDER.map((s): CompletionItem => ({ label: s, insert: `${s}.`, kind: 'space', detail: SPACES[s].label, doc: `Read this color in ${SPACES[s].label}.` })));
    }
    return items;
  } catch { return []; }
}

function conditionalKeyword(tokens: Lexeme[]): 'then' | 'else' | null {
  const stack: ('then' | 'else')[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].text.toLowerCase();
    if (tokens[i].text === ';') { stack.length = 0; continue; }
    if (word === 'if') {
      // A comma at this call's first level distinguishes the legacy if(a, b, c).
      let depth = 0;
      let call = false;
      if (tokens[i + 1]?.text === '(') {
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].text === '(') depth++;
          if (tokens[j].text === ',' && depth === 1) { call = true; break; }
          if (tokens[j].text === ')' && --depth === 0) break;
        }
      }
      if (!call) stack.push('then');
    } else if (word === 'then' && stack[stack.length - 1] === 'then') stack[stack.length - 1] = 'else';
    else if (word === 'else' && stack[stack.length - 1] === 'else') stack.pop();
  }
  return stack[stack.length - 1] ?? null;
}

const keywordItem = (word: string): CompletionItem => ({
  label: word, insert: `${word} `, kind: 'keyword',
  doc: word === 'then' ? 'The value to use when the condition is true.' : word === 'else' ? 'The value to use when the condition is false.'
    : word === 'and' ? 'True when both conditions are true.' : word === 'or' ? 'True when either condition is true.' : 'Reverse a condition.',
});

export function functionSnippet(name: string): { text: string; select: { from: number; to: number } | null } | null {
  const fn = functions.get(name.toLowerCase());
  if (!fn) return null;
  const args = fn.args.filter((arg) => !arg.optional).map((arg) => `{${arg.name}}`);
  const from = fn.name.length + 1;
  return { text: `${fn.name}(${args.join(', ')})`, select: args.length ? { from, to: from + args[0].length } : null };
}

interface SlotExpectation { type: ValueType | 'any'; param?: FormulaParam }
const paramAt = (name: string, index: number) => {
  const args = functions.get(name)?.args;
  return args?.[index] ?? args?.find((arg) => arg.rest);
};
const numberSlot: SlotExpectation = { type: 'number' };
const booleanSlot: SlotExpectation = { type: 'boolean' };
const arithmetic = new Set(['+', '-', '*', '/', '%', '×', '·', '÷', '−']);
const comparisons = new Set(['>', '>=', '<', '<=', '==', '!=', '≥', '≤', '≠']);
const logical = new Set(['and', 'or', '&&', '||']);

function expectedSlot(src: string, from: number, to: number, parts: Segment[]): SlotExpectation {
  const candidate = parts.findLast((p) => p.tokens[0].start <= from);
  const last = candidate?.tokens[candidate.tokens.length - 1];
  const afterRow = candidate?.completeAt !== null && last && last.end < from && /[;\r\n]/.test(src.slice(last.end, from));
  const part = afterRow ? undefined : candidate;
  const fallback: SlotExpectation = { type: part?.tokens[1]?.text === '=' ? 'any' : 'number' };
  if (part) {
    const offset = part.tokens[0].start;
    const a = from - offset; const b = to - offset;
    const contains = (expr: Expr) => expr.s <= a && b <= expr.e;
    const visit = (expr: Expr, expected: SlotExpectation): SlotExpectation | null => {
      if (!contains(expr)) return null;
      if (a <= expr.s && expr.e <= b) return expected;
      switch (expr.k) {
        case 'call':
          for (let i = 0; i < expr.args.length; i++) {
            const param = paramAt(expr.fn, i);
            const found = visit(expr.args[i], param ? { type: param.type, param } : { type: 'unknown' });
            if (found) return found;
          }
          return null;
        case 'member': return visit(expr.obj, { type: 'color' });
        case 'unary': return visit(expr.arg, expr.op === '!' ? booleanSlot : numberSlot);
        case 'bin': {
          const operand = ['&&', '||'].includes(expr.op) ? booleanSlot : numberSlot;
          const threshold = (other: Expr): SlotExpectation => comparisons.has(expr.op) && other.k === 'call' && other.fn === 'contrast'
            ? { type: 'number', param: { name: 'ratio', type: 'number', doc: 'Contrast target: 3 for large text, 4.5 for body text, 7 for stronger contrast.', range: [1, 21], examples: ['3', '4.5', '7'] } } : operand;
          return visit(expr.l, threshold(expr.r)) ?? visit(expr.r, threshold(expr.l));
        }
        case 'cond': return visit(expr.test, booleanSlot) ?? visit(expr.a, numberSlot) ?? visit(expr.b, numberSlot);
        case 'program': return null;
        default: return expected;
      }
    };
    try {
      const ast = parseCached(src.slice(offset, part.tokens[part.tokens.length - 1].end));
      const found = visit(ast.k === 'program' ? ast.statements[0].expr : ast, fallback);
      if (found) return found;
    } catch { /* Missing arguments and delimiters still have a useful lexical context. */ }
  }
  const tokens = part?.tokens ?? [];
  const before = tokens.filter((t) => t.end <= from);
  const previous = before[before.length - 1]?.text.toLowerCase() ?? '';
  const next = tokens.find((t) => t.start >= to)?.text.toLowerCase() ?? '';
  if (arithmetic.has(previous) || comparisons.has(previous) || arithmetic.has(next) || comparisons.has(next)) return numberSlot;
  if (logical.has(previous) || logical.has(next) || ['if', 'not', '!'].includes(previous) || ['then', '?'].includes(next)) return booleanSlot;
  if (['then', 'else', '?', ':'].includes(previous)) return numberSlot;
  const call = signatureAt(src, from);
  const param = call ? paramAt(call.name, call.active) : undefined;
  if (param) return { type: param.type, param };
  if (conditionalKeyword(before) === 'then') return booleanSlot;
  return fallback;
}

function localHexes(src: string, parts: Segment[], from: number, ctx: CompletionContext): Map<string, string> {
  const known = new Map<string, string>();
  const hex = (expr: Expr): string | undefined => {
    if (expr.k === 'hex') { const color = parseHex(expr.v)!; return toHex(color.rgb, color.alpha); }
    if (expr.k === 'ref') return ctx.nodes.find((n) => n.slug.toLowerCase() === expr.name && hasOutput(n.type))?.hex ?? undefined;
    if (expr.k === 'id') return expr.name === 'white' ? '#FFFFFF' : expr.name === 'black' ? '#000000' : known.get(expr.name);
    if (expr.k === 'cond') { const a = hex(expr.a); return a === hex(expr.b) ? a : undefined; }
    return undefined;
  };
  for (const part of parts) {
    if (part.completeAt === null || part.completeAt > from || part.tokens[1]?.text !== '=') continue;
    try {
      const ast = parseCached(src.slice(part.tokens[0].start, part.tokens[part.tokens.length - 1].end));
      if (ast.k !== 'program') continue;
      for (const statement of ast.statements) {
        if (statement.name === null) continue;
        const value = hex(statement.expr);
        if (value) known.set(statement.name, value);
        else known.delete(statement.name);
      }
    } catch { /* A malformed row has no known swatch. */ }
  }
  return known;
}

function slotColors(ctx: CompletionContext, locals: Map<string, ValueType>, hexes: Map<string, string>): CompletionItem[] {
  const items: CompletionItem[] = [];
  for (const name of ctx.hasParent ? ['parent', 'self'] : ['self']) {
    items.push({ label: name, insert: name, kind: 'variable', detail: name === 'self' ? 'Stored color' : 'Color', doc: variables.get(name)!.description });
  }
  for (const [name, type] of [...locals].reverse()) {
    if (type === 'color') items.push({ label: name, insert: name, kind: 'local', detail: 'Color', doc: 'Reuse this color from an earlier row.', ...(hexes.has(name) ? { hex: hexes.get(name) } : {}) });
  }
  items.push(...nodeItems(ctx.nodes).map((item) => ({ ...item, detail: item.hex ?? 'Color' })));
  for (const [name, hex] of [['white', '#FFFFFF'], ['black', '#000000']]) {
    items.push({ label: name, insert: name, kind: 'variable', detail: 'Color', doc: variables.get(name)!.description, hex });
  }
  items.push({ label: '#3b82f6', insert: '#3b82f6', kind: 'value', detail: 'Color', doc: 'Use a hex color; replace the digits with your own.', hex: '#3B82F6' });
  return items;
}

function slotNumbers(ctx: CompletionContext, locals: Map<string, ValueType>, param?: FormulaParam): CompletionItem[] {
  const def = channelDefs(ctx.space).find((d) => d.key === (ctx.channel === 'a' ? 'alpha' : ctx.channel)) ?? SPACES[ctx.space].channels[0];
  // A channel value offers values in the edited channel's range; other numbers offer their own examples.
  // A number with its own scale (a 0–1 blend, an angle, a contrast ratio) never offers channel readings.
  const channel = !param || !!param.channel;
  const scaled = !!param?.range;
  const values = def.key === 'h' ? [0, 90, 180, 270] : ctx.space === 'oklch' && def.key === 'c' ? [0, 0.05, 0.1, 0.2] : [def.min, (def.min + def.max) / 2, def.max];
  const detail = scaled ? param!.range!.join('–') : channel ? def.unit ?? `${def.min}–${def.max}` : 'Number';
  const items: CompletionItem[] = (channel ? values.map((v) => formatChannel(def, v)) : param!.examples ?? []).map((value) => ({
    label: value, insert: value, kind: 'value', detail, doc: param?.doc ?? def.hint,
  }));
  if (!scaled) {
    for (const name of ctx.hasParent ? ['parent', 'self'] : ['self']) {
      items.push({ label: `${name}.${def.key}`, insert: `${name}.${def.key}`, kind: 'property', detail: def.unit ?? `${def.min}–${def.max}`, doc: `Read ${name === 'parent' ? 'the parent’s' : 'this color’s stored'} ${def.label.toLowerCase()}.` });
    }
  }
  for (const [name, type] of [...locals].reverse()) {
    if (type === 'number') items.push({ label: name, insert: name, kind: 'local', detail: 'Number', doc: 'Reuse this value from an earlier row.' });
  }
  return items;
}

function slotBooleans(ctx: CompletionContext): CompletionItem[] {
  const base = ctx.hasParent ? 'parent' : 'self';
  const lightness = ctx.space === 'rgb' ? 'hsl.l' : ctx.space === 'hct' ? 't' : 'l';
  return [
    { label: 'dark', insert: 'dark', kind: 'variable', detail: 'Boolean', doc: variables.get('dark')!.description },
    { label: 'light', insert: 'light', kind: 'variable', detail: 'Boolean', doc: variables.get('light')!.description },
    { label: `${base}.${lightness} > 50`, insert: `${base}.${lightness} > 50`, kind: 'example', detail: 'Condition', doc: 'Check whether the color is light.' },
    { label: `contrast(${base}, white) >= 4.5`, insert: `contrast(${base}, white) >= 4.5`, kind: 'example', detail: 'Condition', doc: 'Check for readable text against white.' },
    { label: 'true', insert: 'true', kind: 'value', detail: 'Boolean', doc: 'A condition that is always true.' },
    { label: 'false', insert: 'false', kind: 'value', detail: 'Boolean', doc: 'A condition that is always false.' },
  ];
}

function memberItems(text: string, expr: Expr & { k: 'member' }, ctx: CompletionContext, locals: Map<string, ValueType>, colors: CompletionItem[]): CompletionItem[] {
  const objectType = valueType(expr.obj, locals);
  if (objectType !== 'color' && !isSpace(objectType)) return [];
  const space = objectType === 'color' ? ctx.space : objectType;
  const object = text.slice(expr.obj.s, expr.obj.e);
  const group = objectType === 'color' && isSpace(expr.prop);
  const suffix = objectType === 'color' ? `.${expr.prop}` : `.${space}.${expr.prop}`;
  const def = channelDefs(space).find((d) => d.key === (expr.prop === 'a' ? 'alpha' : expr.prop));
  const items: CompletionItem[] = def || group ? colors.map((color) => ({
    label: `${color.insert}${suffix}`, insert: `${color.insert}${suffix}`, kind: 'property',
    detail: group ? SPACES[expr.prop as Space].label : def!.unit ?? `${def!.min}–${def!.max}`,
    doc: `Read ${group ? expr.prop.toUpperCase() : def!.label.toLowerCase()} from ${color.label}.`,
  })) : [];
  if (object !== 'parent' || ctx.hasParent) {
    const props = group ? SPACE_ORDER.map((s) => ({ key: s, detail: SPACES[s].label, doc: `Read this color in ${SPACES[s].label}.` }))
      : channelDefs(space).map((d) => ({ key: d.key, detail: d.unit ?? `${d.min}–${d.max}`, doc: d.hint }));
    items.push(...props.map((p): CompletionItem => ({ label: `${object}.${p.key}`, insert: `${object}.${p.key}`, kind: 'property', detail: p.detail, doc: p.doc })));
  }
  return items;
}

/** Suggestions replace one editable tag, using the closest expression or function argument. */
export function slotSuggestions(src: string, from: number, to: number, ctx: CompletionContext): CompletionResult | null {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  from = Math.max(0, Math.min(src.length, Math.floor(from)));
  to = Math.max(from, Math.min(src.length, Math.floor(to)));
  const all = scan(src);
  const candidate = all.find((t) => t.start <= from && from < t.end && to <= t.end);
  // An insertion before a comma, closing parenthesis or keyword must keep that delimiter.
  const token = candidate && (from !== to || !['punctuation', 'operator', 'keyword'].includes(candidate.kind)) ? candidate : undefined;
  if (token) { from = token.start; to = token.end; }
  if (token?.kind === 'comment' || all.some((t) => t.kind === 'comment' && t.start < to && from < t.end)) return null;
  const current = src.slice(from, to);
  const tokens = all.filter((t) => t.kind !== 'comment');
  const parts = segments(src, all);
  const locals = new Map(localInfo(src, parts).filter((l) => l.availableAt <= from).map((l) => [l.name, l.type]));
  if (parts.some((p) => p.tokens[0].start === from && p.tokens[0].end === to && p.tokens[1]?.text === '=')) return null;
  const finish = (items: CompletionItem[]): CompletionResult | null => {
    const seen = new Set([current]);
    const unique = items.filter((item) => { if (seen.has(item.insert)) return false; seen.add(item.insert); return true; });
    // Keep words apart, whether inserting at the caret or replacing a tag (`dark&&light` → `dark or light`).
    const spaced = unique.map((item) => {
      const prefix = /\w/.test(src[from - 1] ?? '') && /^\w/.test(item.insert) ? ' ' : '';
      const suffix = /\w/.test(src[to] ?? '') && /[\w)]$/.test(item.insert) ? ' ' : '';
      if (!prefix && !suffix) return item;
      return { ...item, insert: prefix + item.insert + suffix,
        ...(item.caret === undefined ? {} : { caret: item.caret + prefix.length }),
        ...(item.select ? { select: { from: item.select.from + prefix.length, to: item.select.to + prefix.length } } : {}),
      };
    });
    return spaced.length ? { from, to, items: spaced } : null;
  };
  const word = current.toLowerCase();
  if (arithmetic.has(word) || comparisons.has(word) || logical.has(word) || word === '!' || word === 'not') {
    const previous = tokens.findLast((t) => t.end <= from);
    const choices = arithmetic.has(word) ? previous && canEnd(previous) ? ['+', '-', '*', '/'] : ['+', '-']
      : comparisons.has(word) ? ['>', '>=', '<', '<=', '==', '!='] : logical.has(word) ? ['and', 'or'] : ['not'];
    const normalized = ({ '×': '*', '·': '*', '÷': '/', '−': '-', '≥': '>=', '≤': '<=', '≠': '!=', '&&': 'and', '||': 'or', '!': 'not' } as Record<string, string>)[word] ?? word;
    const descriptions: Record<string, string> = { '+': 'Add two values.', '-': 'Subtract the second value.', '*': 'Multiply two values.', '/': 'Divide by the second value.', '>': 'Greater than.', '>=': 'Greater than or equal to.', '<': 'Less than.', '<=': 'Less than or equal to.', '==': 'Equal to.', '!=': 'Not equal to.', and: 'Both conditions must be true.', or: 'Either condition can be true.', not: 'Reverse a condition.' };
    return finish(choices.filter((op) => op !== normalized).map((op) => ({ label: mathOperators[op] ?? op, insert: op, kind: 'operator', detail: arithmetic.has(word) ? 'Math' : comparisons.has(word) ? 'Comparison' : 'Logic', doc: descriptions[op] })));
  }
  if (['if', 'then', 'else', '=', '?', ':'].includes(word)) return null;
  if (token?.kind === 'function') return null;
  const index = token ? tokens.indexOf(token) : -1;
  if (index >= 0 && tokens[index - 1]?.text === '.') {
    const items = propertyItems(src, tokens, index - 1, ctx, locals);
    if (/^\s*\./.test(src.slice(to))) for (const item of items) if (item.kind === 'space') item.insert = item.label;
    return finish(items);
  }
  if (!current && tokens.findLast((t) => t.end <= from)?.text === '.') {
    const dot = tokens.findLastIndex((t) => t.end <= from);
    return finish(propertyItems(src, tokens, dot, ctx, locals));
  }
  const colors = slotColors(ctx, locals, localHexes(src, parts, from, ctx));
  try {
    const expr = parseCached(current);
    if (expr.k === 'member') return finish(memberItems(current, expr, ctx, locals, colors));
  } catch { /* A placeholder or empty slot does not need a complete surrounding formula. */ }
  const expected = expectedSlot(src, from, to, parts);
  if (expected.type === 'color') return finish(colors);
  if (expected.type === 'boolean') return finish(slotBooleans(ctx));
  if (expected.type === 'number') return finish(slotNumbers(ctx, locals, expected.param));
  return finish([...slotNumbers(ctx, locals), ...colors, ...slotBooleans(ctx), ...FORMULA_FUNCTIONS.map((fn): CompletionItem => {
    const snippet = functionSnippet(fn.name)!;
    return { label: fn.name, insert: snippet.text, ...(snippet.select ? { select: snippet.select } : {}), kind: 'function', detail: fn.signature, doc: fn.description };
  })]);
}

export function formulaCompletions(src: string, caret: number, ctx: CompletionContext): CompletionResult | null {
  try {
    if (!Number.isFinite(caret)) return null;
    caret = Math.max(0, Math.min(src.length, Math.floor(caret)));
    const all = scan(src);
    const at = all.find((t) => t.start === caret && (isWord(t.text) || ['ref', 'number', 'hex', 'placeholder', 'comment', 'error'].includes(t.kind)))
      ?? all.find((t) => t.start < caret && caret <= t.end);
    if (at?.kind === 'placeholder') return slotSuggestions(src, at.start, at.end, ctx);
    if (at?.kind === 'comment' || at?.kind === 'number' || at?.kind === 'hex' || (at?.kind === 'error' && /^[\d.#]/.test(at.text))) return null;
    const tokens = all.filter((t) => t.kind !== 'comment');
    if (at?.kind === 'ref') {
      const names = new Map(ctx.nodes.map((n) => [`@${n.slug}`, n.name]));
      const items = ranked(nodeItems(ctx.nodes), src.slice(at.start + 1, caret), (item) => names.get(item.label) ?? '');
      return items.length ? { from: at.start, to: at.end, items } : null;
    }
    const word = at && isWord(at.text) ? at : null;
    const from = word?.start ?? caret;
    const to = word?.end ?? caret;
    const query = src.slice(from, caret);
    const before = tokens.filter((t) => t.end <= from);
    const previous = before[before.length - 1];
    const locals = new Map(localInfo(src, segments(src, tokens)).filter((l) => l.availableAt <= from).map((l) => [l.name, l.type]));
    if (previous?.text === '.') {
      const items = ranked(propertyItems(src, before, before.length - 1, ctx, locals), query);
      if (/^\s*\./.test(src.slice(to))) {
        for (const item of items) if (item.kind === 'space') item.insert = item.label;
      }
      return items.length ? { from, to, items } : null;
    }
    if (at && at.kind === 'error') return null;
    const newLine = previous && /[\r\n]/.test(src.slice(previous.end, from));
    const keyword = conditionalKeyword(before);
    const expectValue = !previous || previous.text === ';' || !canEnd(previous) || (!!newLine && !keyword);
    if (!expectValue) {
      const items = ranked(keyword ? [keywordItem(keyword)] : [keywordItem('and'), keywordItem('or')], query);
      return items.length ? { from, to, items } : null;
    }
    const items: CompletionItem[] = [];
    if (!src.trim()) items.push(...examples(ctx));
    for (const [name, type] of [...locals].reverse()) {
      items.push({ label: name, insert: name, kind: 'local', detail: type === 'unknown' ? 'Local' : type, doc: 'Reuse a value from an earlier statement.' });
    }
    const help = signatureAt(src, caret);
    const colorArgument = help && (['contrast', 'apca', 'deltae'].includes(help.name) || help.name === 'luminance' || (help.name === 'mix' && help.active < 2));
    const order = colorArgument ? ['parent', 'self', 'white', 'black', 'dark', 'light', 'pi'] : ['parent', 'self', 'dark', 'light', 'white', 'black', 'pi'];
    for (const name of order) {
      if (name === 'parent' && !ctx.hasParent) continue;
      items.push({ label: name, insert: name, kind: 'variable', detail: ['parent', 'self', 'white', 'black'].includes(name) ? 'Color' : name === 'pi' ? 'Number' : 'Boolean', doc: variables.get(name)?.description });
    }
    if (colorArgument && !query) items.push(...nodeItems(ctx.nodes).slice(0, 8));
    items.push({ label: 'if … then … else', insert: 'if {condition} then {value} else {value}', select: { from: 3, to: 14 }, kind: 'keyword', doc: 'Choose a value based on a condition.' });
    const preferred = ctx.channel === 'h' ? ['huelerp', 'mod', 'clamp', 'lerp'] : ['clamp', 'min', 'max', 'lerp'];
    const fnOrder = [...FORMULA_FUNCTIONS].sort((a, b) => {
      const ai = preferred.indexOf(a.name); const bi = preferred.indexOf(b.name);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    const hasCall = /^\s*\(/.test(src.slice(to));
    for (const fn of fnOrder) {
      const snippet = functionSnippet(fn.name)!;
      items.push({ label: fn.name, insert: hasCall ? fn.name : snippet.text,
        ...(hasCall ? { caret: fn.name.length } : snippet.select ? { select: snippet.select } : {}),
        kind: 'function', detail: fn.signature, doc: fn.description });
    }
    items.push(keywordItem('not'),
      { label: 'true', insert: 'true', kind: 'keyword', detail: 'Boolean', doc: 'A condition that is always true.' },
      { label: 'false', insert: 'false', kind: 'keyword', detail: 'Boolean', doc: 'A condition that is always false.' });
    const result = ranked(items, query, (item) => item.kind === 'keyword' && item.label === 'if … then … else' ? 'if' : '');
    return result.length ? { from, to, items: result } : null;
  } catch { return null; }
}

export function signatureAt(src: string, caret: number): SignatureHelp | null {
  if (!Number.isFinite(caret)) return null;
  caret = Math.max(0, Math.min(src.length, Math.floor(caret)));
  const tokens = scan(src);
  if (tokens.some((t) => t.kind === 'comment' && t.start < caret && caret <= t.end)) return null;
  const stack: { name: string | null; active: number }[] = [];
  let previous: Lexeme | undefined;
  for (const t of tokens) {
    if (t.start >= caret) break;
    if (t.kind === 'comment') continue;
    if (t.text === '(') stack.push({ name: previous && isWord(previous.text) ? previous.text.toLowerCase() : null, active: 0 });
    else if (t.text === ')') stack.pop();
    else if (t.text === ',' && stack.length) stack[stack.length - 1].active++;
    else if (t.text === ';' && !stack.length) previous = undefined;
    previous = t;
  }
  const call = stack.findLast((s) => s.name !== null);
  const fn = call?.name ? functions.get(call.name) : undefined;
  return call && fn ? { name: fn.name, signature: fn.signature, params: [...fn.params], active: call.active, doc: fn.description } : null;
}

export interface FormulaRowInfo {
  index: number;
  start: number;
  end: number;
  name: string | null;
  exprStart: number;
  final: boolean;
}
export interface TextEdit {
  changes: { from: number; to: number; insert: string }[];
  selection: { anchor: number; head?: number };
}

/** The recovery lexer keeps unfinished statements editable, with the parser's line continuations. */
export function formulaRows(src: string): FormulaRowInfo[] {
  const parts = segments(src, scan(src));
  return parts.map((part, index) => {
    const first = part.tokens[0];
    const last = part.tokens[part.tokens.length - 1];
    const named = isWord(first.text) && part.tokens[1]?.text === '=';
    let exprStart = first.start;
    if (named) {
      exprStart = part.tokens[2]?.start ?? part.tokens[1].end;
      if (!part.tokens[2]) while (exprStart < src.length && /[^\S\r\n]/.test(src[exprStart])) exprStart++;
    }
    return { index, start: first.start, end: last.end, name: named ? first.text : null, exprStart, final: index === parts.length - 1 };
  });
}

export function nextRowName(src: string): string {
  let max = 0n;
  for (const token of scan(src)) {
    if (!['name', 'local'].includes(token.kind)) continue;
    const match = /^row(\d+)$/.exec(token.text);
    if (match && BigInt(match[1]) > max) max = BigInt(match[1]);
  }
  return `row${max + 1n}`;
}

// A trailing inline comment belongs to this row; whole comment lines belong to the next.
function rowSeparator(src: string, row: FormulaRowInfo): { start: number; end: number } {
  let i = row.end;
  while (i < src.length) {
    if (src.startsWith('//', i)) {
      while (i < src.length && !/[\r\n]/.test(src[i])) i++;
    } else if (/[;\r\n]/.test(src[i])) {
      return { start: i, end: i + (src[i] === '\r' && src[i + 1] === '\n' ? 2 : 1) };
    } else i++;
  }
  return { start: src.length, end: src.length };
}

export function addRowAfter(src: string, rowIndex: number): TextEdit {
  const row = formulaRows(src)[rowIndex];
  if (!row) return { changes: [], selection: { anchor: 0 } };
  const changes: TextEdit['changes'] = [];
  const name = row.name ?? nextRowName(src);
  const prefix = row.name === null ? `${name} = ` : '';
  if (prefix) changes.push({ from: row.start, to: row.start, insert: prefix });
  const next = row.name === null ? `row${BigInt(name.slice(3)) + 1n}` : nextRowName(src);
  const newline = src.includes('\r\n') ? '\r\n' : src.includes('\r') ? '\r' : '\n';
  const insert = `${newline}${row.final ? name : `${next} = ${name}`}`;
  const at = rowSeparator(src, row).start;
  changes.push({ from: at, to: at, insert });
  return { changes, selection: { anchor: at + prefix.length + insert.length } };
}

export function removeRow(src: string, rowIndex: number): TextEdit {
  const rows = formulaRows(src);
  const row = rows[rowIndex];
  if (!row) return { changes: [], selection: { anchor: 0 } };
  const previous = rows[rowIndex - 1];
  const separator = previous ? rowSeparator(src, previous) : { start: 0, end: 0 };
  const from = row.final ? separator.start : separator.end;
  const to = row.final ? src.length : rowSeparator(src, row).end;
  const changes: TextEdit['changes'] = [];
  let anchor = previous?.end ?? 0;
  if (row.final && previous && previous.name !== null) {
    let prefixEnd = src.indexOf('=', previous.start) + 1;
    while (prefixEnd < previous.exprStart && /\s/.test(src[prefixEnd])) prefixEnd++;
    changes.push({ from: previous.start, to: prefixEnd, insert: '' });
    anchor = Math.max(previous.start, anchor - (prefixEnd - previous.start));
  }
  changes.push({ from, to, insert: '' });
  return { changes, selection: { anchor } };
}

export function renameLocal(src: string, from: string, to: string): string | { error: string } {
  if (!/^[A-Za-z_]\w*$/.test(to)) return { error: 'Use letters, numbers and underscores; start with a letter or underscore.' };
  if (RESERVED_NAMES.has(to.toLowerCase())) return { error: `“${to}” is reserved. Choose another name.` };
  const rows = formulaRows(src);
  const declaration = rows.find((row) => row.name === from);
  if (!declaration) return { error: `No local named “${from}”.` };
  if (from === to) return src;
  if (rows.some((row) => row.name === to)) return { error: `“${to}” is already a local name.` };
  const tokens = scan(src).filter((t) => t.kind !== 'comment');
  const targets = tokens.filter((t, i) => t.start >= declaration.start && t.text === from && isWord(t.text) && tokens[i - 1]?.text !== '.');
  for (const token of targets.reverse()) src = src.slice(0, token.start) + to + src.slice(token.end);
  return src;
}

const precedence = (expr: Expr): number => {
  if (expr.k === 'cond' || (expr.k === 'call' && expr.fn === 'if' && expr.args.length === 3)) return 1;
  if (expr.k === 'bin') return ({ '||': 2, '&&': 3, '==': 4, '!=': 4, '<': 5, '<=': 5, '>': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7 })[expr.op] ?? 0;
  return expr.k === 'unary' ? 8 : expr.k === 'member' ? 9 : 10;
};
const mathOperators: Record<string, string> = { '*': '×', '/': '÷', '-': '−', '<=': '≤', '>=': '≥', '!=': '≠', '==': '=', '&&': 'and', '||': 'or', '!': 'not' };

export function formulaDisplay(src: string): DisplayToken[] | null {
  try {
    const ast = parseCached(src);
    const out: DisplayToken[] = [];
    const locals = new Set<string>();
    const put = (kind: DisplayToken['kind'], text: string, ref?: string) => out.push(ref === undefined ? { kind, text } : { kind, text, ref });
    const space = () => put('punctuation', ' ');
    const render = (expr: Expr, minPrecedence = 0) => {
      const parens = precedence(expr) < minPrecedence;
      if (parens) put('punctuation', '(');
      switch (expr.k) {
        case 'num': put('number', String(expr.v)); break;
        case 'bool': put('boolean', String(expr.v)); break;
        case 'hole': put('placeholder', expr.name); break;
        case 'hex': put('hex', expr.v); break;
        case 'ref': put('ref', `@${expr.name}`, expr.name); break;
        case 'id': put(locals.has(expr.name) ? 'local' : variables.has(expr.name) ? 'variable' : 'name', expr.name); break;
        case 'member':
          if (expr.obj.k === 'num') { put('punctuation', '('); render(expr.obj); put('punctuation', ')'); }
          else render(expr.obj, 9);
          put('punctuation', '.'); put('property', expr.prop);
          break;
        case 'unary':
          put(expr.op === '!' ? 'keyword' : 'operator', mathOperators[expr.op] ?? expr.op);
          if (expr.op === '!') space();
          render(expr.arg, 8);
          break;
        case 'bin': {
          const priority = precedence(expr);
          render(expr.l, priority); space();
          put(['&&', '||'].includes(expr.op) ? 'keyword' : 'operator', mathOperators[expr.op] ?? expr.op); space();
          render(expr.r, priority + 1);
          break;
        }
        case 'cond':
          put('keyword', 'if'); space(); render(expr.test, 2);
          space(); put('keyword', 'then'); space(); render(expr.a);
          space(); put('keyword', 'else'); space(); render(expr.b);
          break;
        case 'call':
          if (expr.fn === 'if' && expr.args.length === 3) {
            render({ k: 'cond', test: expr.args[0], a: expr.args[1], b: expr.args[2], s: expr.s, e: expr.e });
            break;
          }
          put('function', functions.get(expr.fn)?.signature.split('(')[0] ?? expr.fn); put('punctuation', '(');
          expr.args.forEach((arg, i) => { if (i) { put('punctuation', ','); space(); } render(arg); });
          put('punctuation', ')');
          break;
        case 'program':
          expr.statements.forEach((statement, i) => {
            if (i) put('newline', '\n');
            if (statement.name !== null) { put('local', statement.name); space(); put('operator', '='); space(); }
            render(statement.expr);
            if (statement.name !== null) locals.add(statement.name);
          });
          break;
      }
      if (parens) put('punctuation', ')');
    };
    render(ast);
    return out;
  } catch { return null; }
}
