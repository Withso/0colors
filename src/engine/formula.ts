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
import { parseHex } from './color/convert';
import { apcaContrast, wcagContrast } from './color/contrast';
import { mixRgb } from './color/mix';
import { deltaEOK, rgbToOklab } from './color/convert';

export class FormulaError extends Error {
  constructor(message: string, public start = 0, public end = 0) {
    super(message);
  }
}

// ── Lexer ────────────────────────────────────────────────────
type TokType = 'num' | 'hex' | 'ref' | 'id' | 'op' | 'eof';
interface Tok { t: TokType; v: string; s: number; e: number }

const OPS2 = ['<=', '>=', '==', '!=', '&&', '||'];
const OPS1 = '+-*/%(),.?:<>!';

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const start = i;
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
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
);

const KEYWORD_OPS: Record<string, string> = { and: '&&', or: '||', not: '!' };

export function parse(src: string): Expr {
  if (!src.trim()) throw new FormulaError('Write a formula, e.g. parent.l - 10', 0, 0);
  const toks = tokenize(src).map((t) => (t.t === 'id' && KEYWORD_OPS[t.v] ? { ...t, t: 'op' as const, v: KEYWORD_OPS[t.v] } : t));
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const isOp = (...ops: string[]) => peek().t === 'op' && ops.includes(peek().v);
  const expect = (op: string) => {
    const t = peek();
    if (t.t !== 'op' || t.v !== op) throw new FormulaError(t.t === 'eof' ? `Missing "${op}"` : `Expected "${op}" but found "${t.v}"`, t.s, t.e);
    return next();
  };

  const binary = (sub: () => Expr, ops: string[]) => (): Expr => {
    let left = sub();
    while (isOp(...ops)) {
      const op = next().v;
      const right = sub();
      left = { k: 'bin', op, l: left, r: right, s: left.s, e: right.e };
    }
    return left;
  };

  const primary = (): Expr => {
    const t = next();
    switch (t.t) {
      case 'num': return { k: 'num', v: parseFloat(t.v), s: t.s, e: t.e };
      case 'hex': return { k: 'hex', v: t.v, s: t.s, e: t.e };
      case 'ref': return { k: 'ref', name: t.v.toLowerCase(), s: t.s, e: t.e };
      case 'id': {
        if (t.v === 'true' || t.v === 'false') return { k: 'bool', v: t.v === 'true', s: t.s, e: t.e };
        if (isOp('(')) {
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
    while (isOp('.')) {
      next();
      const prop = next();
      if (prop.t !== 'id') throw new FormulaError('Expected a property name after "."', prop.s, prop.e);
      node = { k: 'member', obj: node, prop: prop.v, s: node.s, e: prop.e };
    }
    return node;
  };

  const unary = (): Expr => {
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
    if (!isOp('?')) return test;
    next();
    const a = ternary();
    expect(':');
    const b = ternary();
    return { k: 'cond', test, a, b, s: test.s, e: b.e };
  }

  const ast = ternary();
  const rest = peek();
  if (rest.t !== 'eof') throw new FormulaError(`Unexpected "${rest.v}" — missing an operator?`, rest.s, rest.e);
  return ast;
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

export const FORMULA_FUNCTIONS: { name: string; signature: string; description: string }[] = [
  { name: 'clamp', signature: 'clamp(x, min, max)', description: 'Keep x between min and max.' },
  { name: 'min', signature: 'min(a, b, …)', description: 'Smallest value.' },
  { name: 'max', signature: 'max(a, b, …)', description: 'Largest value.' },
  { name: 'lerp', signature: 'lerp(a, b, t)', description: 'Blend from a to b; t = 0..1.' },
  { name: 'map', signature: 'map(x, inMin, inMax, outMin, outMax)', description: 'Re-map x from one range to another.' },
  { name: 'round', signature: 'round(x, step?)', description: 'Round to the nearest step (default 1).' },
  { name: 'floor', signature: 'floor(x)', description: 'Round down.' },
  { name: 'ceil', signature: 'ceil(x)', description: 'Round up.' },
  { name: 'abs', signature: 'abs(x)', description: 'Absolute value.' },
  { name: 'pow', signature: 'pow(x, y)', description: 'x to the power of y.' },
  { name: 'sqrt', signature: 'sqrt(x)', description: 'Square root.' },
  { name: 'mod', signature: 'mod(x, y)', description: 'Remainder that stays positive (handy for hue).' },
  { name: 'step', signature: 'step(edge, x)', description: '0 below the edge, 1 at or above it.' },
  { name: 'smoothstep', signature: 'smoothstep(e0, e1, x)', description: 'Smooth 0→1 transition between two edges.' },
  { name: 'sin', signature: 'sin(degrees)', description: 'Sine of an angle in degrees.' },
  { name: 'cos', signature: 'cos(degrees)', description: 'Cosine of an angle in degrees.' },
  { name: 'if', signature: 'if(condition, then, else)', description: 'Same as condition ? then : else.' },
  { name: 'contrast', signature: 'contrast(a, b)', description: 'WCAG 2 contrast ratio between two colors (1–21).' },
  { name: 'apca', signature: 'apca(text, background)', description: 'APCA lightness contrast Lc (about −108 to 106).' },
  { name: 'luminance', signature: 'luminance(color)', description: 'WCAG relative luminance (0–1).' },
  { name: 'deltae', signature: 'deltaE(a, b)', description: 'Perceptual difference (ΔE OK ×100; ~2 is barely visible).' },
  { name: 'mix', signature: 'mix(a, b, t)', description: 'Blend two colors in OKLab; returns a color.' },
];

export const FORMULA_VARIABLES: { name: string; description: string }[] = [
  { name: 'parent', description: 'The color connected to this node’s input.' },
  { name: 'self', description: 'This node’s own stored values (what the sliders hold).' },
  { name: '@name', description: 'Any other node, by name — e.g. @brand or @neutral.' },
  { name: 'dark', description: 'true while a dark theme is active (light is the opposite).' },
  { name: 'white / black', description: 'Handy reference colors.' },
  { name: '#3b82f6', description: 'Any hex color literal.' },
];

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
}

export function evaluateFormula(src: string, env: FormulaEnv): EvalResult {
  const ast = parseCached(src);
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
    if (!(key in values)) {
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
      case 'ref': return { t: 'color', c: env.ref(node.name) };
      case 'id': {
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
        throw new FormulaError(`Unknown name "${node.name}" — did you mean @${node.name}?`, node.s, node.e);
      }
      case 'member': {
        const obj = ev(node.obj);
        const prop = node.prop;
        let out: Val;
        if (obj.t === 'color') {
          if ((SPACE_NAMES as string[]).includes(prop)) {
            const space = prop as Space;
            const values = obj.c.native?.space === space ? obj.c.native.values : infoToSpace(space, obj.c.info);
            return { t: 'ns', space, values, label: `${obj.c.label}.${space}` };
          }
          if (prop === 'alpha' || prop === 'a') out = { t: 'num', v: obj.c.info.alpha * 100 };
          else out = { t: 'num', v: channelOf(obj.c, env.space, prop, node) };
        } else if (obj.t === 'ns') {
          if (!(prop in obj.values)) {
            const keys = SPACES[obj.space].channels.map((ch) => ch.key).join(', ');
            throw new FormulaError(`"${prop}" is not a ${SPACES[obj.space].label} channel (use ${keys})`, node.s, node.e);
          }
          out = { t: 'num', v: obj.values[prop] };
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
      case 'contrast': arity(2); return done(wcagContrast(c(0).info.rgb, c(1).info.rgb));
      case 'apca': arity(2); return done(apcaContrast(c(0).info.rgb, c(1).info.rgb));
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
    throw new FormulaError(`Unknown function "${fn}()"`, node.s, node.e);
  };

  const result = ev(ast);
  if (result.t === 'bool') throw new FormulaError('The formula gives true/false — wrap it like: condition ? 20 : 90', ast.s, ast.e);
  if (result.t !== 'num') throw new FormulaError(`The formula gives ${result.t === 'color' ? 'a color' : 'a channel group'} — pick a channel, e.g. parent.l`, ast.s, ast.e);
  if (!Number.isFinite(result.v)) throw new FormulaError('The formula produced an invalid number', ast.s, ast.e);

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
  };
}
