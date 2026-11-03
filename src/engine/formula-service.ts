import { type NodeType, hasOutput } from './model';
import { type Space, SPACE_ORDER, SPACES, channelDefs } from './color/spaces';
import { parseHex } from './color/convert';
import { type Expr, FORMULA_FUNCTIONS, FORMULA_VARIABLES, parseCached } from './formula';

export type FormulaTokenKind =
  | 'number' | 'hex' | 'ref' | 'variable' | 'function' | 'property' | 'operator' | 'keyword'
  | 'boolean' | 'local' | 'name' | 'punctuation' | 'comment' | 'error';
export interface FormulaSpan { start: number; end: number; kind: FormulaTokenKind }

export interface CompletionNodeInfo { slug: string; name: string; type: NodeType; hex?: string | null }
export interface CompletionContext {
  space: Space;
  channel: string;
  hasParent: boolean;
  nodes: CompletionNodeInfo[];
}
export type CompletionKind = 'node' | 'variable' | 'function' | 'property' | 'space' | 'keyword' | 'local' | 'example';
export interface CompletionItem {
  label: string;
  insert: string;
  caret?: number;
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
  return t.text === ')' || ['number', 'hex', 'ref', 'variable', 'function', 'property', 'boolean', 'local', 'name'].includes(t.kind);
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

function valueType(expr: Expr, locals: Map<string, ValueType>): ValueType {
  switch (expr.k) {
    case 'num': return 'number';
    case 'bool': return 'boolean';
    case 'ref':
    case 'hex': return 'color';
    case 'id': return locals.get(expr.name) ?? (['parent', 'self', 'white', 'black'].includes(expr.name) ? 'color'
      : ['dark', 'light'].includes(expr.name) ? 'boolean' : expr.name === 'pi' ? 'number' : 'unknown');
    case 'member': return valueType(expr.obj, locals) === 'color' && isSpace(expr.prop) ? expr.prop : 'number';
    case 'unary': return expr.op === '!' ? 'boolean' : 'number';
    case 'bin': return ['+', '-', '*', '/', '%'].includes(expr.op) ? 'number' : 'boolean';
    case 'cond': {
      const a = valueType(expr.a, locals);
      return a === valueType(expr.b, locals) ? a : 'unknown';
    }
    case 'call': {
      if (expr.fn === 'mix') return 'color';
      if (expr.fn === 'if' && expr.args.length === 3) {
        const a = valueType(expr.args[1], locals);
        return a === valueType(expr.args[2], locals) ? a : 'unknown';
      }
      return functions.has(expr.fn) ? 'number' : 'unknown';
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
  const rows = `out_1 = ${start}\n${key === 'h' ? 'huelerp(out_1, 280, 0.5)' : `clamp(out_1 * 0.8, ${def.min}, ${def.max})`}`;
  const make = (label: string, insert: string, description: string): CompletionItem => ({ label, insert, kind: 'example', detail: 'Example', doc: description });
  const out = [
    make(offset, offset, doc),
    make(conditional, conditional, 'Use a different value in light and dark themes.'),
    make('Reuse an earlier result', rows, 'Name a result, then use it on the next line.'),
  ];
  if (key === 'l' || key === 't' || ctx.space === 'rgb') {
    const contrast = `if contrast(${base}, white) >= 4.5 then ${ctx.space === 'rgb' ? 255 : 98} else ${ctx.space === 'rgb' ? 0 : 12}`;
    out.push(make('Choose readable text', contrast, `Choose a light or dark channel value for text on ${subject}.`));
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

export function formulaCompletions(src: string, caret: number, ctx: CompletionContext): CompletionResult | null {
  try {
    if (!Number.isFinite(caret)) return null;
    caret = Math.max(0, Math.min(src.length, Math.floor(caret)));
    const all = scan(src);
    const at = all.find((t) => t.start === caret && (isWord(t.text) || ['ref', 'number', 'hex', 'comment', 'error'].includes(t.kind)))
      ?? all.find((t) => t.start < caret && caret <= t.end);
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
    items.push({ label: 'if … then … else', insert: 'if  then  else ', caret: 3, kind: 'keyword', doc: 'Choose a value based on a condition.' });
    const preferred = ctx.channel === 'h' ? ['huelerp', 'mod', 'clamp', 'lerp'] : ['clamp', 'min', 'max', 'lerp'];
    const fnOrder = [...FORMULA_FUNCTIONS].sort((a, b) => {
      const ai = preferred.indexOf(a.name); const bi = preferred.indexOf(b.name);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    const hasCall = /^\s*\(/.test(src.slice(to));
    for (const fn of fnOrder) {
      items.push({ label: fn.name, insert: hasCall ? fn.name : `${fn.name}()`, caret: fn.name.length + (hasCall ? 0 : 1), kind: 'function', detail: fn.signature, doc: fn.description });
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
