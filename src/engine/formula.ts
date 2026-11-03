// ─────────────────────────────────────────────────────────────
// Formula language for channel logic.
//
//   parent.l > 60 ? 15 : 98          ternary on the parent's lightness
//   clamp(parent.c * 0.5, 0, 0.1)    math helpers
//   @background.l + (dark ? 20 : -20)  reference other nodes by name, react to theme
//   contrast(parent, white) >= 4.5 ? 100 : 0
//
// A small hand-written lexer + recursive-descent parser + evaluator.
// No eval(), no access to anything outside the provided environment.
// ─────────────────────────────────────────────────────────────
import { type ColorInfo, type ChannelValues, type Space, SPACES, describe, infoToSpace } from './color/spaces';
import { compositeOver, parseHex, wrapHue } from './color/convert';
import { apcaContrast, wcagContrast } from './color/contrast';
import { mixRgb } from './color/mix';
import { deltaEOK, rgbToOklab } from './color/convert';

export class FormulaError extends Error {
  constructor(message: string, public start = 0, public end = 0) {
    super(message);
  }
}

// ── Lexer ────────────────────────────────────────────────────
type TokType = 'num' | 'hex' | 'ref' | 'id' | 'op' | 'sep' | 'eof';
interface Tok { t: TokType; v: string; s: number; e: number }

const OPS2 = ['<=', '>=', '==', '!=', '&&', '||'];
const OPS1 = '+-*/%(),.?:<>!=';
const ALIASES: Record<string, string> = { '×': '*', '·': '*', '÷': '/', '−': '-', '≤': '<=', '≥': '>=', '≠': '!=' };

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n' || ch === '\r' || ch === ';') {
      const start = i++;
      if (ch === '\r' && src[i] === '\n') i++;
      out.push({ t: 'sep', v: ch === ';' ? ';' : '\n', s: start, e: i });
      continue;
    }
    if (/\s/.test(ch)) { i++; continue; }
    if (src.startsWith('//', i)) {
      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++;
      continue;
    }
    const start = i;
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      if (/[eE]/.test(src[i] ?? '')) {
        i++;
        if (src[i] === '+' || src[i] === '-') i++;
        const digits = i;
        while (i < src.length && /[0-9]/.test(src[i])) i++;
        if (i === digits) throw new FormulaError('Expected digits after the exponent', start, i);
      }
      const v = src.slice(start, i);
      if ((v.match(/\./g) ?? []).length > 1) throw new FormulaError(`Malformed number "${v}"`, start, i);
      out.push({ t: 'num', v, s: start, e: i });
      continue;
    }
    if (ch === '#') {
      i++;
      while (i < src.length && /[0-9a-f]/i.test(src[i])) i++;
      const v = src.slice(start, i);
      if (!parseHex(v)) throw new FormulaError(`"${v}" is not a valid hex color`, start, i);
      out.push({ t: 'hex', v, s: start, e: i });
      continue;
    }
    if (ch === '@') {
      i++;
      while (i < src.length && /[A-Za-z0-9_-]/.test(src[i])) i++;
      if (i === start + 1) throw new FormulaError('Expected a node name after @', start, i);
      out.push({ t: 'ref', v: src.slice(start + 1, i), s: start, e: i });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
      out.push({ t: 'id', v: src.slice(start, i), s: start, e: i });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) {
      out.push({ t: 'op', v: two, s: i, e: i + 2 });
      i += 2;
      continue;
    }
    if (ALIASES[ch]) {
      out.push({ t: 'op', v: ALIASES[ch], s: i, e: i + 1 });
      i++;
      continue;
    }
    if (OPS1.includes(ch)) {
      out.push({ t: 'op', v: ch, s: i, e: i + 1 });
      i++;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}"`, i, i + 1);
  }
  out.push({ t: 'eof', v: '', s: src.length, e: src.length });
  return out;
}

// ── Parser ───────────────────────────────────────────────────
interface Span { s: number; e: number }
export interface FormulaStatement extends Span { name: string | null; expr: Expr }
export type Expr = Span & (
  | { k: 'num'; v: number }
  | { k: 'bool'; v: boolean }
  | { k: 'hex'; v: string }
  | { k: 'ref'; name: string }
  | { k: 'id'; name: string }
  | { k: 'member'; obj: Expr; prop: string }
  | { k: 'call'; fn: string; args: Expr[] }
  | { k: 'unary'; op: string; arg: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'cond'; test: Expr; a: Expr; b: Expr }
  | { k: 'program'; statements: FormulaStatement[] }
);

const KEYWORD_OPS: Record<string, string> = { and: '&&', or: '||', not: '!' };

export function parse(src: string): Expr {
  if (!src.trim()) throw new FormulaError('Write a formula, e.g. parent.l - 10', 0, 0);
  // Inside parentheses, line breaks have always been ordinary whitespace.
  let depth = 0;
  const toks = tokenize(src).filter((t) => {
    if (t.v === '(') depth++;
    if (t.v === ')') depth--;
    return !(t.t === 'sep' && t.v === '\n' && depth > 0);
  }).map((t) => (t.t === 'id' && Object.hasOwn(KEYWORD_OPS, t.v.toLowerCase())
    ? { ...t, t: 'op' as const, v: KEYWORD_OPS[t.v.toLowerCase()] } : t));
  let p = 0;
  const peek = () => toks[Math.min(p, toks.length - 1)];
  const next = () => { const t = peek(); if (t.t !== 'eof') p++; return t; };
  const isOp = (...ops: string[]) => peek().t === 'op' && ops.includes(peek().v);
  const skipLines = () => { while (peek().t === 'sep' && peek().v === '\n') next(); };
  const isKeyword = (word: string) => peek().t === 'id' && peek().v.toLowerCase() === word;
  const failEquals = (t: Tok) => {
    if (t.v === '=') throw new FormulaError('Use == to compare', t.s, t.e);
  };
  const expect = (op: string) => {
    skipLines();
    const t = peek();
    failEquals(t);
    if (t.t !== 'op' || t.v !== op) throw new FormulaError(t.t === 'eof' ? `Missing "${op}"` : `Expected "${op}" but found "${t.v}"`, t.s, t.e);
    return next();
  };
  const expectKeyword = (word: string) => {
    skipLines();
    const t = peek();
    failEquals(t);
    if (!isKeyword(word)) throw new FormulaError(`Expected "${word}"`, t.s, t.e);
    return next();
  };
  const continuesWith = (...ops: string[]) => {
    let q = p;
    while (toks[q]?.t === 'sep' && toks[q].v === '\n') q++;
    if (toks[q]?.t !== 'op' || !ops.includes(toks[q].v)) return false;
    p = q;
    return true;
  };

  const binary = (sub: () => Expr, ops: string[]) => (): Expr => {
    let left = sub();
    while (continuesWith(...ops)) {
      const op = next().v;
      const right = sub();
      left = { k: 'bin', op, l: left, r: right, s: left.s, e: right.e };
    }
    return left;
  };

  const primary = (): Expr => {
    skipLines();
    const t = next();
    switch (t.t) {
      case 'num': return { k: 'num', v: parseFloat(t.v), s: t.s, e: t.e };
      case 'hex': return { k: 'hex', v: t.v, s: t.s, e: t.e };
      case 'ref': return { k: 'ref', name: t.v.toLowerCase(), s: t.s, e: t.e };
      case 'id': {
        const word = t.v.toLowerCase();
        if (word === 'true' || word === 'false') return { k: 'bool', v: word === 'true', s: t.s, e: t.e };
        if (word === 'then' || word === 'else') throw new FormulaError(`Unexpected "${t.v}"`, t.s, t.e);
        if (word === 'if') {
          // `if(...)` remains a function; `if (condition) then ...` is a conditional.
          let q = p;
          while (toks[q]?.t === 'sep' && toks[q].v === '\n') q++;
          let nesting = 0;
          let functionForm = false;
          if (toks[q]?.v === '(') {
            for (; q < toks.length; q++) {
              if (toks[q].v === '(') nesting++;
              if (toks[q].v === ',' && nesting === 1) { functionForm = true; break; }
              if (toks[q].v === ')' && --nesting === 0) break;
            }
            // Preserve useful arity errors for `if()` and `if(true)` too.
            let after = q + 1;
            while (toks[after]?.t === 'sep' && toks[after].v === '\n') after++;
            const following = toks[after];
            const conditionContinues = following?.t === 'op' && ['+', '-', '*', '/', '%', '<', '<=', '>', '>=', '==', '!=', '&&', '||', '?', '.'].includes(following.v);
            if (toks[q]?.v === ')' && following?.v.toLowerCase() !== 'then' && !conditionContinues) functionForm = true;
          }
          if (!functionForm) {
            const test = ternary();
            expectKeyword('then');
            const a = ternary();
            expectKeyword('else');
            const b = ternary();
            return { k: 'cond', test, a, b, s: t.s, e: b.e };
          }
          skipLines();
        }
        if (continuesWith('(')) {
          next();
          const args: Expr[] = [];
          if (!isOp(')')) {
            do args.push(ternary()); while (isOp(',') && next());
          }
          const close = expect(')');
          return { k: 'call', fn: t.v.toLowerCase(), args, s: t.s, e: close.e };
        }
        return { k: 'id', name: t.v, s: t.s, e: t.e };
      }
      case 'op':
        failEquals(t);
        if (t.v === '(') {
          const inner = ternary();
          const close = expect(')');
          return { ...inner, s: t.s, e: close.e };
        }
        throw new FormulaError(`Unexpected "${t.v}"`, t.s, t.e);
      default:
        throw new FormulaError('Formula ends too early', t.s, t.e);
    }
  };

  const postfix = (): Expr => {
    let node = primary();
    while (continuesWith('.')) {
      next();
      skipLines();
      const prop = next();
      if (prop.t !== 'id') throw new FormulaError('Expected a property name after "."', prop.s, prop.e);
      node = { k: 'member', obj: node, prop: prop.v, s: node.s, e: prop.e };
    }
    return node;
  };

  const unary = (): Expr => {
    skipLines();
    if (isOp('-', '+', '!')) {
      const t = next();
      const arg = unary();
      return { k: 'unary', op: t.v, arg, s: t.s, e: arg.e };
    }
    return postfix();
  };

  const multiplicative = binary(unary, ['*', '/', '%']);
  const additive = binary(multiplicative, ['+', '-']);
  const comparison = binary(additive, ['<', '<=', '>', '>=']);
  const equality = binary(comparison, ['==', '!=']);
  const and = binary(equality, ['&&']);
  const or = binary(and, ['||']);

  function ternary(): Expr {
    const test = or();
    if (!continuesWith('?')) return test;
    next();
    const a = ternary();
    expect(':');
    const b = ternary();
    return { k: 'cond', test, a, b, s: test.s, e: b.e };
  }

  const statements: FormulaStatement[] = [];
  while (peek().t !== 'eof') {
    if (peek().t === 'sep') { next(); continue; }
    const first = peek();
    let name: string | null = null;
    if (first.t === 'id' && toks[p + 1]?.v === '=') {
      if (RESERVED_NAMES.has(first.v.toLowerCase())) {
        throw new FormulaError(`"${first.v}" is reserved — choose a local name like out_1`, first.s, first.e);
      }
      name = next().v;
      next();
    }
    const expr = ternary();
    statements.push({ name, expr, s: first.s, e: expr.e });
    const rest = peek();
    failEquals(rest);
    if (rest.t !== 'eof' && rest.t !== 'sep') {
      throw new FormulaError(`Unexpected "${rest.v}" — missing an operator?`, rest.s, rest.e);
    }
  }
  if (!statements.length) throw new FormulaError('Write a formula, e.g. parent.l - 10', 0, src.length);
  if (statements.length === 1 && statements[0].name === null) return statements[0].expr;
  return { k: 'program', statements, s: statements[0].s, e: statements[statements.length - 1].e };
}

const cache = new Map<string, Expr | FormulaError>();
export function parseCached(src: string): Expr {
  let hit = cache.get(src);
  if (!hit) {
    try { hit = parse(src); } catch (err) { hit = err instanceof FormulaError ? err : new FormulaError(String(err)); }
    if (cache.size > 500) cache.clear();
    cache.set(src, hit);
  }
  if (hit instanceof FormulaError) throw hit;
  return hit;
}

/** All @names referenced anywhere in a formula. */
export function collectRefs(ast: Expr, out = new Set<string>()): Set<string> {
  switch (ast.k) {
    case 'ref': out.add(ast.name); break;
    case 'member': collectRefs(ast.obj, out); break;
    case 'call': ast.args.forEach((a) => collectRefs(a, out)); break;
    case 'unary': collectRefs(ast.arg, out); break;
    case 'bin': collectRefs(ast.l, out); collectRefs(ast.r, out); break;
    case 'cond': collectRefs(ast.test, out); collectRefs(ast.a, out); collectRefs(ast.b, out); break;
    case 'program': ast.statements.forEach((s) => collectRefs(s.expr, out)); break;
  }
  return out;
}

// ── Evaluator ────────────────────────────────────────────────
export interface ColorRef {
  info: ColorInfo;
  /** Exact channel values when the color natively lives in a space (keeps grays' hue). */
  native?: { space: Space; values: ChannelValues };
  label: string;
}

export interface FormulaEnv {
  space: Space;
  parent: ColorRef | null;
  self: ColorRef;
  dark: boolean;
  ref: (name: string) => ColorRef;
}

type Val =
  | { t: 'num'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'color'; c: ColorRef }
  | { t: 'ns'; space: Space; values: ChannelValues; label: string };

interface Lookup { s: number; e: number; text: string }

const SPACE_NAMES: Space[] = ['oklch', 'hct', 'hsl', 'rgb'];
const WHITE: ColorRef = { info: describe({ r: 1, g: 1, b: 1 }), label: 'white' };
const BLACK: ColorRef = { info: describe({ r: 0, g: 0, b: 0 }), label: 'black' };

export interface FormulaFunction {
  name: string;
  signature: string;
  params: string[];
  category: 'math' | 'logic' | 'color';
  description: string;
}

export const FORMULA_FUNCTIONS: FormulaFunction[] = [
  { name: 'clamp', signature: 'clamp(x, min, max)', params: ['x', 'min', 'max'], category: 'math', description: 'Keep x between min and max.' },
  { name: 'min', signature: 'min(a, b, …)', params: ['a', 'b', '…'], category: 'math', description: 'Smallest value.' },
  { name: 'max', signature: 'max(a, b, …)', params: ['a', 'b', '…'], category: 'math', description: 'Largest value.' },
  { name: 'lerp', signature: 'lerp(a, b, t)', params: ['a', 'b', 't'], category: 'math', description: 'Blend from a to b; t = 0..1.' },
  { name: 'map', signature: 'map(x, inMin, inMax, outMin, outMax)', params: ['x', 'inMin', 'inMax', 'outMin', 'outMax'], category: 'math', description: 'Re-map x from one range to another.' },
  { name: 'round', signature: 'round(x, step?)', params: ['x', 'step?'], category: 'math', description: 'Round to the nearest step (default 1).' },
  { name: 'floor', signature: 'floor(x)', params: ['x'], category: 'math', description: 'Round down.' },
  { name: 'ceil', signature: 'ceil(x)', params: ['x'], category: 'math', description: 'Round up.' },
  { name: 'abs', signature: 'abs(x)', params: ['x'], category: 'math', description: 'Absolute value.' },
  { name: 'pow', signature: 'pow(x, y)', params: ['x', 'y'], category: 'math', description: 'x to the power of y.' },
  { name: 'sqrt', signature: 'sqrt(x)', params: ['x'], category: 'math', description: 'Square root.' },
  { name: 'mod', signature: 'mod(x, y)', params: ['x', 'y'], category: 'math', description: 'Remainder that stays positive (handy for hue).' },
  { name: 'step', signature: 'step(edge, x)', params: ['edge', 'x'], category: 'math', description: '0 below the edge, 1 at or above it.' },
  { name: 'smoothstep', signature: 'smoothstep(e0, e1, x)', params: ['e0', 'e1', 'x'], category: 'math', description: 'Smooth 0→1 transition between two edges.' },
  { name: 'sin', signature: 'sin(degrees)', params: ['degrees'], category: 'math', description: 'Sine of an angle in degrees.' },
  { name: 'cos', signature: 'cos(degrees)', params: ['degrees'], category: 'math', description: 'Cosine of an angle in degrees.' },
  { name: 'sign', signature: 'sign(x)', params: ['x'], category: 'math', description: '−1 for negative x, 0 for zero, 1 for positive x.' },
  { name: 'tan', signature: 'tan(degrees)', params: ['degrees'], category: 'math', description: 'Tangent of an angle in degrees.' },
  { name: 'atan2', signature: 'atan2(y, x)', params: ['y', 'x'], category: 'math', description: 'Direction of (x, y) in degrees, wrapped to 0–360.' },
  { name: 'log', signature: 'log(x)', params: ['x'], category: 'math', description: 'Natural logarithm; x must be positive.' },
  { name: 'log2', signature: 'log2(x)', params: ['x'], category: 'math', description: 'Base-2 logarithm; x must be positive.' },
  { name: 'log10', signature: 'log10(x)', params: ['x'], category: 'math', description: 'Base-10 logarithm; x must be positive.' },
  { name: 'exp', signature: 'exp(x)', params: ['x'], category: 'math', description: 'Euler’s number raised to x.' },
  { name: 'fract', signature: 'fract(x)', params: ['x'], category: 'math', description: 'Fractional part x − floor(x), always between 0 and 1.' },
  { name: 'invlerp', signature: 'invlerp(a, b, v)', params: ['a', 'b', 'v'], category: 'math', description: 'Position of v between a and b; returns 0 when a equals b.' },
  { name: 'inverselerp', signature: 'inverselerp(a, b, v)', params: ['a', 'b', 'v'], category: 'math', description: 'Alias for invlerp: position of v between a and b.' },
  { name: 'huelerp', signature: 'huelerp(a, b, t)', params: ['a', 'b', 't'], category: 'color', description: 'Blend hue angles along the shortest arc; t = 0..1, result in degrees.' },
  { name: 'if', signature: 'if(condition, then, else)', params: ['condition', 'then', 'else'], category: 'logic', description: 'Same as condition ? then : else.' },
  { name: 'contrast', signature: 'contrast(a, b)', params: ['a', 'b'], category: 'color', description: 'WCAG 2 ratio of a over background b (1–21), including a’s alpha.' },
  { name: 'apca', signature: 'apca(text, background)', params: ['text', 'background'], category: 'color', description: 'APCA lightness contrast Lc (about −108 to 106), including text alpha.' },
  { name: 'luminance', signature: 'luminance(color)', params: ['color'], category: 'color', description: 'WCAG relative luminance (0–1).' },
  { name: 'deltae', signature: 'deltaE(a, b)', params: ['a', 'b'], category: 'color', description: 'Perceptual difference (ΔE OK ×100; ~2 is barely visible).' },
  { name: 'mix', signature: 'mix(a, b, t)', params: ['a', 'b', 't'], category: 'color', description: 'Blend two colors in OKLab; returns a color.' },
];

export const FORMULA_VARIABLES: { name: string; description: string }[] = [
  { name: 'parent', description: 'The color connected to this node’s input.' },
  { name: 'self', description: 'This node’s own stored values (what the sliders hold).' },
  { name: '@name', description: 'Any other node, by name — e.g. @brand or @neutral.' },
  { name: 'dark', description: 'true while a dark theme is active.' },
  { name: 'light', description: 'true while a light theme is active.' },
  { name: 'white', description: 'Pure white, useful for contrast checks and mixing.' },
  { name: 'black', description: 'Pure black, useful for contrast checks and mixing.' },
  { name: 'pi', description: 'The mathematical constant π (about 3.14159).' },
  { name: '#3b82f6', description: 'Any hex color literal.' },
];

const VARIABLE_NAMES = ['parent', 'self', 'dark', 'light', 'white', 'black', 'pi'];
const RESERVED_NAMES = new Set([...VARIABLE_NAMES, ...FORMULA_FUNCTIONS.map((f) => f.name), 'if', 'then', 'else', 'true', 'false', 'and', 'or', 'not']);

/** Small spelling corrections, including a swapped pair of letters. */
function suggestName(name: string, candidates: Iterable<string>): string | null {
  const needle = name.toLowerCase();
  let best: string | null = null;
  let distance = Math.min(2, Math.floor(needle.length / 2));
  for (const candidate of candidates) {
    const word = candidate.toLowerCase();
    if (Math.abs(word.length - needle.length) > distance) continue;
    const rows = Array.from({ length: needle.length + 1 }, (_, i) => [i]);
    rows[0] = Array.from({ length: word.length + 1 }, (_, i) => i);
    for (let i = 1; i <= needle.length; i++) {
      for (let j = 1; j <= word.length; j++) {
        rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (needle[i - 1] === word[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && needle[i - 1] === word[j - 2] && needle[i - 2] === word[j - 1]) {
          rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
        }
      }
    }
    const d = rows[needle.length][word.length];
    if (d < distance || (d === distance && best === null)) { best = candidate; distance = d; }
  }
  return best;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

function describeVal(v: Val): string {
  switch (v.t) {
    case 'num': return fmt(v.v);
    case 'bool': return String(v.v);
    case 'color': return v.c.info.hexa;
    case 'ns': return v.space;
  }
}

export interface EvalResult {
  value: number;
  lookups: { text: string; value: string }[];
  substituted: string;
  steps: { name: string | null; text: string; value: string; start: number; end: number }[];
}

export function evaluateFormula(src: string, env: FormulaEnv): EvalResult {
  const ast = parseCached(src);
  const statements: FormulaStatement[] = ast.k === 'program' ? ast.statements : [{ name: null, expr: ast, s: ast.s, e: ast.e }];
  const locals = new Map<string, Val>();
  const declared = new Set(statements.flatMap((s) => s.name === null ? [] : [s.name]));
  const steps: EvalResult['steps'] = [];
  const lookups: Lookup[] = [];
  const record = (node: Expr, v: Val) => lookups.push({ s: node.s, e: node.e, text: describeVal(v) });

  const num = (node: Expr, v: Val, what = 'a number'): number => {
    if (v.t === 'num') return v.v;
    if (v.t === 'bool') return v.v ? 1 : 0;
    if (v.t === 'color') throw new FormulaError(`Expected ${what} but got a color — pick a channel, e.g. ${src.slice(node.s, node.e)}.l`, node.s, node.e);
    throw new FormulaError(`Expected ${what} but got the ${v.space} group — add a channel, e.g. .${SPACES[v.space].channels[0].key}`, node.s, node.e);
  };
  const truthy = (v: Val) => (v.t === 'bool' ? v.v : v.t === 'num' ? v.v !== 0 : true);
  const color = (node: Expr, v: Val): ColorRef => {
    if (v.t === 'color') return v.c;
    throw new FormulaError('Expected a color here (parent, self, @name, white, black or #hex)', node.s, node.e);
  };

  const channelOf = (c: ColorRef, space: Space, key: string, node: Expr): number => {
    const values = c.native?.space === space ? c.native.values : infoToSpace(space, c.info);
    if (!Object.hasOwn(values, key)) {
      const keys = SPACES[space].channels.map((ch) => ch.key).join(', ');
      throw new FormulaError(`"${key}" is not a ${SPACES[space].label} channel (use ${keys}, alpha)`, node.s, node.e);
    }
    return values[key];
  };

  const ev = (node: Expr): Val => {
    switch (node.k) {
      case 'num': return { t: 'num', v: node.v };
      case 'bool': return { t: 'bool', v: node.v };
      case 'hex': {
        const parsed = parseHex(node.v)!;
        return { t: 'color', c: { info: describe(parsed.rgb, parsed.alpha), label: node.v } };
      }
      case 'ref': {
        try { return { t: 'color', c: env.ref(node.name) }; }
        catch (err) {
          // The same @name can occur in a comment, an untaken branch and several rows.
          if (err instanceof FormulaError) throw new FormulaError(err.message, node.s, node.e);
          throw err;
        }
      }
      case 'id': {
        const local = locals.get(node.name);
        if (local) { record(node, local); return local; }
        switch (node.name) {
          case 'parent':
            if (!env.parent) throw new FormulaError('This node has no parent — connect one, or use @name', node.s, node.e);
            return { t: 'color', c: env.parent };
          case 'self': return { t: 'color', c: env.self };
          case 'dark': { const v: Val = { t: 'bool', v: env.dark }; record(node, v); return v; }
          case 'light': { const v: Val = { t: 'bool', v: !env.dark }; record(node, v); return v; }
          case 'white': return { t: 'color', c: WHITE };
          case 'black': return { t: 'color', c: BLACK };
          case 'pi': return { t: 'num', v: Math.PI };
        }
        if (declared.has(node.name)) throw new FormulaError(`Local "${node.name}" is used before it is defined`, node.s, node.e);
        const suggestion = suggestName(node.name, [...locals.keys(), ...VARIABLE_NAMES, ...FORMULA_FUNCTIONS.map((f) => f.name)]);
        throw new FormulaError(`Unknown name "${node.name}" — did you mean ${suggestion ?? `@${node.name}`}?`, node.s, node.e);
      }
      case 'member': {
        const obj = ev(node.obj);
        const prop = node.prop;
        let out: Val;
        if (obj.t === 'color') {
          if ((SPACE_NAMES as string[]).includes(prop)) {
            const space = prop as Space;
            const values = obj.c.native?.space === space ? obj.c.native.values : infoToSpace(space, obj.c.info);
            return { t: 'ns', space, values: { ...values, alpha: obj.c.info.alpha * 100 }, label: `${obj.c.label}.${space}` };
          }
          if (prop === 'alpha' || prop === 'a') out = { t: 'num', v: obj.c.info.alpha * 100 };
          else out = { t: 'num', v: channelOf(obj.c, env.space, prop, node) };
        } else if (obj.t === 'ns') {
          if (prop === 'alpha' || prop === 'a') {
            out = { t: 'num', v: obj.values.alpha };
          } else if (!Object.hasOwn(obj.values, prop)) {
            const keys = SPACES[obj.space].channels.map((ch) => ch.key).join(', ');
            throw new FormulaError(`"${prop}" is not a ${SPACES[obj.space].label} channel (use ${keys})`, node.s, node.e);
          } else out = { t: 'num', v: obj.values[prop] };
        } else {
          throw new FormulaError(`Numbers have no ".${prop}"`, node.s, node.e);
        }
        record(node, out);
        return out;
      }
      case 'unary': {
        const v = ev(node.arg);
        if (node.op === '!') return { t: 'bool', v: !truthy(v) };
        const n = num(node.arg, v);
        return { t: 'num', v: node.op === '-' ? -n : n };
      }
      case 'bin': {
        if (node.op === '&&') return { t: 'bool', v: truthy(ev(node.l)) && truthy(ev(node.r)) };
        if (node.op === '||') return { t: 'bool', v: truthy(ev(node.l)) || truthy(ev(node.r)) };
        const a = num(node.l, ev(node.l));
        const b = num(node.r, ev(node.r));
        switch (node.op) {
          case '+': return { t: 'num', v: a + b };
          case '-': return { t: 'num', v: a - b };
          case '*': return { t: 'num', v: a * b };
          case '/':
            if (b === 0) throw new FormulaError('Division by zero', node.r.s, node.r.e);
            return { t: 'num', v: a / b };
          case '%': return { t: 'num', v: b === 0 ? 0 : a % b };
          case '<': return { t: 'bool', v: a < b };
          case '<=': return { t: 'bool', v: a <= b };
          case '>': return { t: 'bool', v: a > b };
          case '>=': return { t: 'bool', v: a >= b };
          case '==': return { t: 'bool', v: Math.abs(a - b) < 1e-9 };
          case '!=': return { t: 'bool', v: Math.abs(a - b) >= 1e-9 };
        }
        throw new FormulaError(`Unknown operator ${node.op}`, node.s, node.e);
      }
      case 'cond':
        return truthy(ev(node.test)) ? ev(node.a) : ev(node.b);
      case 'call':
        return call(node);
      case 'program':
        throw new FormulaError('Statements can only appear at the top level', node.s, node.e);
    }
  };

  const call = (node: Expr & { k: 'call' }): Val => {
    const { fn, args } = node;
    const arity = (min: number, max = min) => {
      if (args.length < min || args.length > max) {
        const sig = FORMULA_FUNCTIONS.find((f) => f.name === fn)?.signature ?? fn;
        throw new FormulaError(`${sig} takes ${min === max ? min : `${min}–${max}`} argument${max === 1 ? '' : 's'}`, node.s, node.e);
      }
    };
    const n = (i: number) => num(args[i], ev(args[i]));
    const c = (i: number) => color(args[i], ev(args[i]));
    const done = (v: number): Val => { const out: Val = { t: 'num', v }; record(node, out); return out; };

    switch (fn) {
      case 'if': arity(3); return truthy(ev(args[0])) ? ev(args[1]) : ev(args[2]);
      case 'clamp': arity(3); return { t: 'num', v: Math.min(Math.max(n(0), n(1)), n(2)) };
      case 'min': if (!args.length) arity(1, 99); return { t: 'num', v: Math.min(...args.map((_, i) => n(i))) };
      case 'max': if (!args.length) arity(1, 99); return { t: 'num', v: Math.max(...args.map((_, i) => n(i))) };
      case 'lerp': arity(3); { const a = n(0); return { t: 'num', v: a + (n(1) - a) * n(2) }; }
      case 'map': {
        arity(5);
        const [x, a, b, c2, d] = [n(0), n(1), n(2), n(3), n(4)];
        return { t: 'num', v: b === a ? c2 : c2 + ((x - a) / (b - a)) * (d - c2) };
      }
      case 'round': {
        arity(1, 2);
        const step = args.length === 2 ? n(1) : 1;
        return { t: 'num', v: step === 0 ? n(0) : Math.round(n(0) / step) * step };
      }
      case 'floor': arity(1); return { t: 'num', v: Math.floor(n(0)) };
      case 'ceil': arity(1); return { t: 'num', v: Math.ceil(n(0)) };
      case 'abs': arity(1); return { t: 'num', v: Math.abs(n(0)) };
      case 'pow': arity(2); return { t: 'num', v: Math.pow(n(0), n(1)) };
      case 'sqrt': arity(1); return { t: 'num', v: Math.sqrt(Math.max(0, n(0))) };
      case 'mod': { arity(2); const m = n(1); return { t: 'num', v: m === 0 ? 0 : ((n(0) % m) + m) % m }; }
      case 'step': arity(2); return { t: 'num', v: n(1) >= n(0) ? 1 : 0 };
      case 'smoothstep': {
        arity(3);
        const [e0, e1, x] = [n(0), n(1), n(2)];
        const t = e1 === e0 ? (x >= e1 ? 1 : 0) : Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
        return { t: 'num', v: t * t * (3 - 2 * t) };
      }
      case 'sin': arity(1); return { t: 'num', v: Math.sin((n(0) * Math.PI) / 180) };
      case 'cos': arity(1); return { t: 'num', v: Math.cos((n(0) * Math.PI) / 180) };
      case 'sign': arity(1); return { t: 'num', v: Math.sign(n(0)) };
      case 'tan': arity(1); return { t: 'num', v: Math.tan((n(0) * Math.PI) / 180) };
      case 'atan2': arity(2); return { t: 'num', v: wrapHue(Math.atan2(n(0), n(1)) * 180 / Math.PI) };
      case 'log':
      case 'log2':
      case 'log10': {
        arity(1);
        const x = n(0);
        if (x <= 0) throw new FormulaError(`${fn}() needs a positive value`, args[0].s, args[0].e);
        return { t: 'num', v: fn === 'log' ? Math.log(x) : fn === 'log2' ? Math.log2(x) : Math.log10(x) };
      }
      case 'exp': arity(1); return { t: 'num', v: Math.exp(n(0)) };
      case 'fract': { arity(1); const x = n(0); return { t: 'num', v: x - Math.floor(x) }; }
      case 'invlerp':
      case 'inverselerp': {
        arity(3);
        const [a, b, v] = [n(0), n(1), n(2)];
        return { t: 'num', v: a === b ? 0 : (v - a) / (b - a) };
      }
      case 'huelerp': {
        arity(3);
        const [a, b, t] = [wrapHue(n(0)), wrapHue(n(1)), n(2)];
        let arc = wrapHue(b - a);
        if (arc > 180) arc -= 360;
        return { t: 'num', v: wrapHue(a + arc * t) };
      }
      case 'contrast':
      case 'apca': {
        arity(2);
        const fg = c(0).info; const bg = c(1).info;
        const seen = fg.alpha < 1 ? compositeOver(fg.rgb, fg.alpha, bg.rgb) : fg.rgb;
        return done(fn === 'contrast' ? wcagContrast(seen, bg.rgb) : apcaContrast(seen, bg.rgb));
      }
      case 'luminance': arity(1); return done(c(0).info.luminance);
      case 'deltae': arity(2); return done(deltaEOK(rgbToOklab(c(0).info.rgb), rgbToOklab(c(1).info.rgb)) * 100);
      case 'mix': {
        arity(3);
        const a = c(0);
        const b = c(1);
        const t = Math.min(Math.max(n(2), 0), 1);
        const mixed = mixRgb(a.info.rgb, b.info.rgb, t, 'oklab');
        return { t: 'color', c: { info: describe(mixed.rgb, a.info.alpha + (b.info.alpha - a.info.alpha) * t), label: 'mix' } };
      }
    }
    const suggestion = suggestName(fn, FORMULA_FUNCTIONS.map((f) => f.name));
    throw new FormulaError(`Unknown function "${fn}()"${suggestion ? ` — did you mean ${suggestion}?` : ''}`, node.s, node.e);
  };

  let result: Val = { t: 'num', v: 0 };
  for (const statement of statements) {
    result = ev(statement.expr);
    if (result.t === 'num' && !Number.isFinite(result.v)) {
      throw new FormulaError('The formula produced an invalid number', statement.expr.s, statement.expr.e);
    }
    if (statement.name !== null) locals.set(statement.name, result);
    steps.push({ name: statement.name, text: src.slice(statement.s, statement.e), value: describeVal(result), start: statement.s, end: statement.e });
  }
  const last = statements[statements.length - 1].expr;
  if (result.t === 'bool') throw new FormulaError('The formula gives true/false — wrap it like: condition ? 20 : 90', last.s, last.e);
  if (result.t !== 'num') throw new FormulaError(`The formula gives ${result.t === 'color' ? 'a color' : 'a channel group'} — pick a channel, e.g. parent.l`, last.s, last.e);

  // Keep only the outermost lookups, then splice their values into the source.
  const sorted = [...lookups].sort((a, b) => a.s - b.s || b.e - a.e);
  const outer: Lookup[] = [];
  for (const l of sorted) {
    const last = outer[outer.length - 1];
    if (last && l.s >= last.s && l.e <= last.e) continue;
    outer.push(l);
  }
  let substituted = src;
  for (const l of [...outer].reverse()) substituted = substituted.slice(0, l.s) + l.text + substituted.slice(l.e);

  return {
    value: result.v,
    lookups: outer.map((l) => ({ text: src.slice(l.s, l.e), value: l.text })),
    substituted: substituted.trim(),
    steps,
  };
}
