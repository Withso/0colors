// ═══════════════════════════════════════════════════════════════════
// Advanced Logic Engine — Server-side port
// Expression Parser & Evaluator for headless pipeline execution.
// Ported from /utils/advanced-logic-engine.ts with Deno import paths.
// ═══════════════════════════════════════════════════════════════════

import type {
  ExpressionToken,
  ExpressionAST,
  ColorNode,
  ChannelLogic,
  TokenAssignmentLogic,
  DesignToken,
  NodeAdvancedLogic,
} from "./computation-types.js";

import { hslToRgb, hslToOklch } from "./color-conversions.js";
import { rgbToHct } from "./hct-utils.js";

// ── Theme-aware logic resolution helpers ────────────────────────

export function getEffectiveChannels(
  logic: NodeAdvancedLogic,
  themeId: string | undefined,
  isPrimary: boolean,
  nodeHasThemeOverride: boolean,
): Record<string, ChannelLogic> {
  if (isPrimary || !themeId) return logic.channels;
  if (!nodeHasThemeOverride) return logic.channels;
  return logic.themeChannels?.[themeId] ?? logic.channels;
}

export function getEffectiveTokenAssignment(
  logic: NodeAdvancedLogic,
  themeId: string | undefined,
  isPrimary: boolean,
  nodeIsUnlinked: boolean,
): TokenAssignmentLogic | undefined {
  if (isPrimary || !themeId) return logic.tokenAssignment;
  if (!nodeIsUnlinked) return logic.tokenAssignment;
  return logic.themeTokenAssignment?.[themeId] ?? logic.tokenAssignment;
}

export function getEffectiveBaseValues(
  logic: NodeAdvancedLogic,
  themeId: string | undefined,
  isPrimary: boolean,
  nodeHasThemeOverride: boolean,
): Record<string, number> | undefined {
  if (isPrimary || !themeId) return logic.baseValues;
  if (!nodeHasThemeOverride) return logic.baseValues;
  return logic.themeBaseValues?.[themeId] ?? logic.baseValues;
}

// ── Channel Constraints ─────────────────────────────────────────

export interface ChannelConstraint {
  min: number;
  max: number;
  mode: 'clamp' | 'wrap';
}

export const CHANNEL_CONSTRAINTS: Record<string, ChannelConstraint> = {
  hue:        { min: 0, max: 360, mode: 'wrap' },
  saturation: { min: 0, max: 100, mode: 'clamp' },
  lightness:  { min: 0, max: 100, mode: 'clamp' },
  alpha:      { min: 0, max: 100, mode: 'clamp' },
  red:        { min: 0, max: 255, mode: 'clamp' },
  green:      { min: 0, max: 255, mode: 'clamp' },
  blue:       { min: 0, max: 255, mode: 'clamp' },
  oklchL:     { min: 0, max: 100, mode: 'clamp' },
  oklchC:     { min: 0, max: 100, mode: 'clamp' },
  oklchH:     { min: 0, max: 360, mode: 'wrap' },
  hctH:       { min: 0, max: 360, mode: 'wrap' },
  hctC:       { min: 0, max: 120, mode: 'clamp' },
  hctT:       { min: 0, max: 100, mode: 'clamp' },
};

export interface ConstraintResult {
  raw: number;
  constrained: number;
  wasConstrained: boolean;
  mode: 'clamp' | 'wrap';
  channelMin: number;
  channelMax: number;
}

export function constrainChannelValue(channelKey: string, value: number): ConstraintResult {
  const constraint = CHANNEL_CONSTRAINTS[channelKey];
  if (!constraint) {
    return { raw: value, constrained: value, wasConstrained: false, mode: 'clamp', channelMin: 0, channelMax: Infinity };
  }

  const { min, max, mode } = constraint;
  let constrained: number;

  if (mode === 'wrap') {
    const range = max - min;
    constrained = ((((value - min) % range) + range) % range) + min;
  } else {
    constrained = Math.max(min, Math.min(max, value));
  }

  const wasConstrained = Math.abs(constrained - value) > 0.0001;
  return { raw: value, constrained, wasConstrained, mode, channelMin: min, channelMax: max };
}

// ── Evaluation Context ──────────────────────────────────────────

export interface EvalContext {
  self: Record<string, number>;
  parent: Record<string, number> | null;
  allNodes: Map<string, Record<string, number>>;
  locals?: Record<string, number>;
  currentChannel?: string;
  lockedValues?: Record<string, number>;
}

export function nodeToChannelMap(node: ColorNode): Record<string, number> {
  return {
    hue: node.hue ?? 0,
    saturation: node.saturation ?? 0,
    lightness: node.lightness ?? 0,
    alpha: node.alpha ?? 100,
    red: node.red ?? 0,
    green: node.green ?? 0,
    blue: node.blue ?? 0,
    oklchL: node.oklchL ?? 0,
    oklchC: node.oklchC ?? 0,
    oklchH: node.oklchH ?? 0,
    hctH: node.hctH ?? 0,
    hctC: node.hctC ?? 0,
    hctT: node.hctT ?? 0,
    h: node.hue ?? 0,
    s: node.saturation ?? 0,
    l: node.lightness ?? 0,
    a: node.alpha ?? 100,
    r: node.red ?? 0,
    g: node.green ?? 0,
    b: node.blue ?? 0,
  };
}

export function nodeToChannelMapThemeAware(
  node: ColorNode,
  activeThemeId?: string,
  isPrimaryTheme?: boolean,
): Record<string, number> {
  const isLinked = isPrimaryTheme || !activeThemeId || !node.themeOverrides || !node.themeOverrides[activeThemeId];
  const ov = !isLinked ? node.themeOverrides![activeThemeId] : null;

  const hue = ov?.hue ?? node.hue ?? 0;
  const sat = ov?.saturation ?? node.saturation ?? 0;
  const lit = ov?.lightness ?? node.lightness ?? 0;
  const alpha = ov?.alpha ?? node.alpha ?? 100;
  const red = (ov as any)?.red ?? node.red ?? 0;
  const green = (ov as any)?.green ?? node.green ?? 0;
  const blue = (ov as any)?.blue ?? node.blue ?? 0;
  const oklchL = (ov as any)?.oklchL ?? node.oklchL ?? 0;
  const oklchC = (ov as any)?.oklchC ?? node.oklchC ?? 0;
  const oklchH = (ov as any)?.oklchH ?? node.oklchH ?? 0;
  const hctH = (ov as any)?.hctH ?? node.hctH ?? 0;
  const hctC = (ov as any)?.hctC ?? node.hctC ?? 0;
  const hctT = (ov as any)?.hctT ?? node.hctT ?? 0;

  return {
    hue, saturation: sat, lightness: lit, alpha,
    red, green, blue,
    oklchL, oklchC, oklchH,
    hctH, hctC, hctT,
    h: hue, s: sat, l: lit, a: alpha,
    r: red, g: green, b: blue,
  };
}

// ── Token → AST Parser ─────────────────────────────────────────

export function parseTokensToAST(tokens: ExpressionToken[]): ExpressionAST | null {
  if (tokens.length === 0) return null;

  let pos = 0;
  const peek = (): ExpressionToken | undefined => tokens[pos];
  const advance = (): ExpressionToken => tokens[pos++];
  const expect = (type: string, value?: string): ExpressionToken => {
    const t = tokens[pos];
    if (!t || t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${type}${value ? `(${value})` : ''} at position ${pos}`);
    }
    return advance();
  };

  function parseExpr(): ExpressionAST {
    const t = peek();
    if (t && t.type === 'keyword' && t.value === 'if') {
      return parseConditional();
    }
    return parseLogicOr();
  }

  function parseConditional(): ExpressionAST {
    advance(); // consume 'if'
    const condition = parseLogicOr();
    expect('keyword', 'then');

    let consequent = parseExpr();

    if (
      consequent.type === 'Self' &&
      pos < tokens.length &&
      peek()?.type !== 'keyword' &&
      peek()?.type !== 'operator'
    ) {
      consequent = parseExpr();
    }

    let alternate: ExpressionAST;
    if (peek()?.type === 'keyword' && peek()?.value === 'else') {
      advance();
      alternate = parseExpr();

      if (
        alternate.type === 'Self' &&
        pos < tokens.length &&
        peek()?.type !== 'keyword' &&
        peek()?.type !== 'operator'
      ) {
        alternate = parseExpr();
      }
    } else {
      alternate = { type: 'Literal', value: NaN };
    }

    return { type: 'Conditional', condition, consequent, alternate };
  }

  function parseLogicOr(): ExpressionAST {
    let left = parseLogicAnd();
    while (peek()?.type === 'keyword' && peek()!.value === 'OR') {
      advance();
      const right = parseLogicAnd();
      left = { type: 'LogicalOp', op: 'OR', left, right };
    }
    return left;
  }

  function parseLogicAnd(): ExpressionAST {
    let left = parseComparison();
    while (peek()?.type === 'keyword' && peek()!.value === 'AND') {
      advance();
      const right = parseComparison();
      left = { type: 'LogicalOp', op: 'AND', left, right };
    }
    return left;
  }

  function parseComparison(): ExpressionAST {
    let left = parseAddition();
    const t = peek();
    if (t && t.type === 'operator' && ['>', '<', '>=', '<=', '==', '!='].includes(t.value)) {
      const op = advance().value;
      const right = parseAddition();
      left = { type: 'BinaryOp', op, left, right };
    } else if (
      t &&
      (t.type === 'literal' || t.type === 'boolean' || t.type === 'local' || t.type === 'reference')
    ) {
      const right = parseAddition();
      left = { type: 'BinaryOp', op: '==', left, right };
    }
    return left;
  }

  function parseAddition(): ExpressionAST {
    let left = parseMultiply();
    while (peek()?.type === 'operator' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = advance().value;
      const right = parseMultiply();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  function parseMultiply(): ExpressionAST {
    let left = parseUnary();
    while (peek()?.type === 'operator' && (peek()!.value === '*' || peek()!.value === '/' || peek()!.value === '%')) {
      const op = advance().value;
      const right = parseUnary();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  function parseUnary(): ExpressionAST {
    const t = peek();
    if (t && t.type === 'operator' && t.value === '-') {
      advance();
      const operand = parseUnary();
      return { type: 'BinaryOp', op: '*', left: { type: 'Literal', value: -1 }, right: operand };
    }
    return parseAtom();
  }

  function parseAtom(): ExpressionAST {
    const t = peek();
    if (!t) throw new Error('Unexpected end of expression');

    if (t.type === 'keyword' && t.value === 'locked') {
      advance();
      return { type: 'Locked' };
    }

    if (t.type === 'literal') {
      advance();
      return { type: 'Literal', value: parseFloat(t.value) };
    }

    if (t.type === 'boolean') {
      advance();
      return { type: 'Boolean', value: t.value === 'true' };
    }

    if (t.type === 'function') {
      const fn = advance();
      expect('paren', '(');
      const args: ExpressionAST[] = [];
      if (peek()?.value !== ')') {
        args.push(parseExpr());
        while (peek()?.type === 'comma') {
          advance();
          args.push(parseExpr());
        }
      }
      expect('paren', ')');
      return { type: 'Call', fn: fn.value, args };
    }

    if (t.type === 'reference') {
      const ref = advance();
      if (ref.refTokenId || (ref.value && ref.value.startsWith('{') && ref.value.endsWith('}'))) {
        const tokenId = ref.refTokenId || '';
        const tokenValue = ref.value || ref.displayLabel || '';
        const prop = peek();
        if (prop && prop.type === 'property') {
          advance();
          const propKey = prop.refProperty || prop.value.replace('.', '').toLowerCase();
          return { type: 'TokenRef', tokenId, property: propKey, tokenValue };
        }
        return { type: 'TokenRef', tokenId, tokenValue };
      }
      const prop = peek();
      if (prop && prop.type === 'property') {
        advance();
        const propKey = prop.refProperty || prop.value.replace('.', '').toLowerCase();
        if (ref.value === '@Parent') return { type: 'Parent', property: propKey };
        if (ref.value === '@Self') return { type: 'Self', property: propKey };
        return { type: 'Reference', nodeId: ref.refNodeId || '', property: propKey };
      }
      if (ref.value === '@Parent') return { type: 'NodeRef', target: 'parent' };
      if (ref.value === '@Self') return { type: 'NodeRef', target: 'self' };
      return { type: 'NodeRef', target: 'node', nodeId: ref.refNodeId || '' };
    }

    if (t.type === 'local') {
      const tok = advance();
      return { type: 'Local', name: tok.value };
    }

    if (t.type === 'tokenRef') {
      const tok = advance();
      const tokenId = tok.refTokenId || '';
      const tokenValue = tok.value || tok.displayLabel || '';
      const prop = peek();
      if (prop && prop.type === 'property') {
        advance();
        const propKey = prop.refProperty || prop.value.replace('.', '').toLowerCase();
        return { type: 'TokenRef', tokenId, property: propKey, tokenValue };
      }
      return { type: 'TokenRef', tokenId, tokenValue };
    }

    if (t.type === 'paren' && t.value === '(') {
      advance();
      const expr = parseExpr();
      expect('paren', ')');
      return expr;
    }

    throw new Error(`Unexpected token: ${t.type}(${t.value}) at position ${pos}`);
  }

  try {
    const ast = parseExpr();
    return ast;
  } catch {
    return null;
  }
}

// ── AST Evaluator ───────────────────────────────────────────────

export type EvalResult = { type: 'number'; value: number } | { type: 'boolean'; value: boolean } | { type: 'error'; message: string };

export function evaluateAST(ast: ExpressionAST, ctx: EvalContext): EvalResult {
  try {
    return evalNode(ast, ctx);
  } catch (e: any) {
    return { type: 'error', message: e.message || 'Evaluation error' };
  }
}

// ── APCA-W3 contrast ────────────────────────────────────────────

function evalAPCA(txtY: number, bgY: number): EvalResult {
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  const normBG = 0.56;
  const normTXT = 0.57;
  const revTXT = 0.62;
  const revBG = 0.65;
  const scaleBoW = 1.14;
  const scaleWoB = 1.14;
  const loBoWoffset = 0.027;
  const loWoBoffset = 0.027;
  const loClip = 0.1;
  const deltaYmin = 0.0005;

  let tY = Math.max(0, txtY);
  let bY = Math.max(0, bgY);

  tY = tY > blkThrs ? tY : tY + Math.pow(blkThrs - tY, blkClmp);
  bY = bY > blkThrs ? bY : bY + Math.pow(blkThrs - bY, blkClmp);

  if (Math.abs(bY - tY) < deltaYmin) return { type: 'number', value: 0 };

  let SAPC: number;
  let Lc: number;

  if (bY > tY) {
    SAPC = (Math.pow(bY, normBG) - Math.pow(tY, normTXT)) * scaleBoW;
    Lc = SAPC < loClip ? 0 : (SAPC - loBoWoffset) * 100;
  } else {
    SAPC = (Math.pow(bY, revBG) - Math.pow(tY, revTXT)) * scaleWoB;
    Lc = SAPC > -loClip ? 0 : (SAPC + loWoBoffset) * 100;
  }

  return { type: 'number', value: Lc };
}

// ── Shared helpers ──────────────────────────────────────────────

function srgbChannelToLinear(v: number): number {
  const c = Math.max(0, Math.min(1, v / 255));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function resolveNodeRefChannelMap(
  arg: ExpressionAST & { type: 'NodeRef' },
  ctx: EvalContext,
): Record<string, number> | EvalResult {
  let channelMap: Record<string, number> | null = null;
  if (arg.target === 'parent') {
    if (!ctx.parent) return { type: 'error', message: 'No parent node' };
    channelMap = ctx.parent;
  } else if (arg.target === 'self') {
    channelMap = ctx.self;
  } else {
    channelMap = ctx.allNodes.get(arg.nodeId || '') || null;
  }
  if (!channelMap) return { type: 'error', message: 'Referenced node not found' };
  return channelMap;
}

function resolveNodeRefRGB(
  arg: ExpressionAST & { type: 'NodeRef' },
  ctx: EvalContext,
): { r: number; g: number; b: number } | EvalResult {
  const result = resolveNodeRefChannelMap(arg, ctx);
  if ('type' in result && (result as EvalResult).type === 'error') return result as EvalResult;
  const channelMap = result as Record<string, number>;
  return {
    r: channelMap['red'] ?? channelMap['r'] ?? 0,
    g: channelMap['green'] ?? channelMap['g'] ?? 0,
    b: channelMap['blue'] ?? channelMap['b'] ?? 0,
  };
}

// ── RGB → CIELAB ────────────────────────────────────────────────

function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const rLin = srgbChannelToLinear(r);
  const gLin = srgbChannelToLinear(g);
  const bLin = srgbChannelToLinear(b);

  const X = 0.4124564 * rLin + 0.3575761 * gLin + 0.1804375 * bLin;
  const Y = 0.2126729 * rLin + 0.7151522 * gLin + 0.0721750 * bLin;
  const Z = 0.0193339 * rLin + 0.1191920 * gLin + 0.9503041 * bLin;

  const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const f = (t: number): number => t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116;

  const fx = f(X / Xn);
  const fy = f(Y / Yn);
  const fz = f(Z / Zn);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

// ── CIEDE2000 ───────────────────────────────────────────────────

function computeCIEDE2000(
  L1: number, a1: number, b1: number,
  L2: number, a2: number, b2: number,
): number {
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const POW25_7 = Math.pow(25, 7);

  const C1ab = Math.sqrt(a1 * a1 + b1 * b1);
  const C2ab = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab_mean = (C1ab + C2ab) / 2;
  const Cab_mean_pow7 = Math.pow(Cab_mean, 7);
  const G = 0.5 * (1 - Math.sqrt(Cab_mean_pow7 / (Cab_mean_pow7 + POW25_7)));

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) * DEG;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * DEG;
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

  const Lp_mean = (L1 + L2) / 2;
  const Cp_mean = (C1p + C2p) / 2;

  let hp_mean: number;
  if (C1p * C2p === 0) {
    hp_mean = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hp_mean = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hp_mean = (h1p + h2p + 360) / 2;
  } else {
    hp_mean = (h1p + h2p - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos((hp_mean - 30) * RAD)
    + 0.24 * Math.cos(2 * hp_mean * RAD)
    + 0.32 * Math.cos((3 * hp_mean + 6) * RAD)
    - 0.20 * Math.cos((4 * hp_mean - 63) * RAD);

  const Lp_50_sq = (Lp_mean - 50) * (Lp_mean - 50);
  const SL = 1 + 0.015 * Lp_50_sq / Math.sqrt(20 + Lp_50_sq);
  const SC = 1 + 0.045 * Cp_mean;
  const SH = 1 + 0.015 * Cp_mean * T;

  const theta = 30 * Math.exp(-((hp_mean - 275) / 25) * ((hp_mean - 275) / 25));
  const Cp_mean_pow7 = Math.pow(Cp_mean, 7);
  const RC = 2 * Math.sqrt(Cp_mean_pow7 / (Cp_mean_pow7 + POW25_7));
  const RT = -Math.sin(2 * theta * RAD) * RC;

  const dLP_SL = dLp / SL;
  const dCP_SC = dCp / SC;
  const dHP_SH = dHp / SH;

  return Math.sqrt(
    dLP_SL * dLP_SL +
    dCP_SC * dCP_SC +
    dHP_SH * dHP_SH +
    RT * dCP_SC * dHP_SH
  );
}

// ── AST Node Evaluator ──────────────────────────────────────────

function evalNode(node: ExpressionAST, ctx: EvalContext): EvalResult {
  switch (node.type) {
    case 'Literal':
      return { type: 'number', value: node.value };

    case 'Boolean':
      return { type: 'boolean', value: node.value };

    case 'Self': {
      const val = ctx.self[node.property];
      if (val === undefined) return { type: 'error', message: `Unknown property: ${node.property}` };
      return { type: 'number', value: val };
    }

    case 'Parent': {
      if (!ctx.parent) return { type: 'error', message: 'No parent node' };
      const val = ctx.parent[node.property];
      if (val === undefined) return { type: 'error', message: `Unknown parent property: ${node.property}` };
      return { type: 'number', value: val };
    }

    case 'Reference': {
      const refMap = ctx.allNodes.get(node.nodeId);
      if (!refMap) return { type: 'error', message: 'Referenced node not found' };
      const val = refMap[node.property];
      if (val === undefined) return { type: 'error', message: `Unknown property: ${node.property}` };
      return { type: 'number', value: val };
    }

    case 'Local': {
      const val = ctx.locals?.[node.name];
      if (val === undefined) return { type: 'error', message: `Unknown local variable: ${node.name}` };
      return { type: 'number', value: val };
    }

    case 'BinaryOp': {
      const leftR = evalNode(node.left, ctx);
      const rightR = evalNode(node.right, ctx);
      if (leftR.type === 'error') return leftR;
      if (rightR.type === 'error') return rightR;

      const l = leftR.type === 'boolean' ? (leftR.value ? 1 : 0) : leftR.value;
      const r = rightR.type === 'boolean' ? (rightR.value ? 1 : 0) : rightR.value;

      switch (node.op) {
        case '+': return { type: 'number', value: l + r };
        case '-': return { type: 'number', value: l - r };
        case '*': return { type: 'number', value: l * r };
        case '/': return { type: 'number', value: r === 0 ? 0 : l / r };
        case '%': return { type: 'number', value: r === 0 ? 0 : l % r };
        case '>': return { type: 'boolean', value: l > r };
        case '<': return { type: 'boolean', value: l < r };
        case '>=': return { type: 'boolean', value: l >= r };
        case '<=': return { type: 'boolean', value: l <= r };
        case '==': return { type: 'boolean', value: Math.abs(l - r) < 0.001 };
        case '!=': return { type: 'boolean', value: Math.abs(l - r) >= 0.001 };
        default: return { type: 'error', message: `Unknown operator: ${node.op}` };
      }
    }

    case 'LogicalOp': {
      const leftR = evalNode(node.left, ctx);
      const rightR = evalNode(node.right, ctx);
      if (leftR.type === 'error') return leftR;
      if (rightR.type === 'error') return rightR;

      const lb = leftR.type === 'boolean' ? leftR.value : (leftR.value !== 0);
      const rb = rightR.type === 'boolean' ? rightR.value : (rightR.value !== 0);

      if (node.op === 'AND') return { type: 'boolean', value: lb && rb };
      return { type: 'boolean', value: lb || rb };
    }

    case 'NodeRef': {
      return { type: 'error', message: 'Bare node ref — use inside contrast(), apca(), or deltaE()' };
    }

    case 'Call': {
      if (node.fn === 'contrast' || node.fn === 'apca' || node.fn === 'deltae') {
        let resolvedArgs: ExpressionAST[] = node.args;

        if (
          resolvedArgs.length === 1 &&
          resolvedArgs[0].type === 'BinaryOp' &&
          resolvedArgs[0].op === '==' &&
          resolvedArgs[0].left.type === 'NodeRef' &&
          resolvedArgs[0].right.type === 'NodeRef'
        ) {
          resolvedArgs = [resolvedArgs[0].left, resolvedArgs[0].right];
        }

        const hasNodeRef = resolvedArgs.some(a => a.type === 'NodeRef');
        if (hasNodeRef) {
          if (resolvedArgs.length !== 2) {
            return { type: 'error', message: `${node.fn} expects 2 arguments` };
          }

          if (node.fn === 'deltae') {
            const resolveLabArg = (arg: ExpressionAST): { L: number; a: number; b: number } | EvalResult => {
              if (arg.type === 'NodeRef') {
                const rgbResult = resolveNodeRefRGB(arg, ctx);
                if ('type' in rgbResult && (rgbResult as EvalResult).type === 'error') return rgbResult as EvalResult;
                const rgb = rgbResult as { r: number; g: number; b: number };
                return rgbToLab(rgb.r, rgb.g, rgb.b);
              }
              return { type: 'error', message: 'deltaE node-ref mode requires @Node references' };
            };
            const lab0 = resolveLabArg(resolvedArgs[0]);
            const lab1 = resolveLabArg(resolvedArgs[1]);
            if ('type' in lab0 && (lab0 as EvalResult).type === 'error') return lab0 as EvalResult;
            if ('type' in lab1 && (lab1 as EvalResult).type === 'error') return lab1 as EvalResult;
            const l0 = lab0 as { L: number; a: number; b: number };
            const l1 = lab1 as { L: number; a: number; b: number };
            return { type: 'number', value: computeCIEDE2000(l0.L, l0.a, l0.b, l1.L, l1.a, l1.b) };
          }

          const resolveLuminanceArg = (arg: ExpressionAST): EvalResult => {
            if (arg.type === 'NodeRef') {
              const rgbResult = resolveNodeRefRGB(arg, ctx);
              if ('type' in rgbResult && (rgbResult as EvalResult).type === 'error') return rgbResult as EvalResult;
              const rgb = rgbResult as { r: number; g: number; b: number };
              return {
                type: 'number',
                value: 0.2126 * srgbChannelToLinear(rgb.r) + 0.7152 * srgbChannelToLinear(rgb.g) + 0.0722 * srgbChannelToLinear(rgb.b),
              };
            }
            return evalNode(arg, ctx);
          };
          const lum0 = resolveLuminanceArg(resolvedArgs[0]);
          const lum1 = resolveLuminanceArg(resolvedArgs[1]);
          if (lum0.type === 'error') return lum0;
          if (lum1.type === 'error') return lum1;
          const y0 = lum0.type === 'boolean' ? (lum0.value ? 1 : 0) : lum0.value;
          const y1 = lum1.type === 'boolean' ? (lum1.value ? 1 : 0) : lum1.value;

          if (node.fn === 'contrast') {
            const lighter = Math.max(0, Math.max(y0, y1));
            const darker = Math.max(0, Math.min(y0, y1));
            return { type: 'number', value: (lighter + 0.05) / (darker + 0.05) };
          }
          return evalAPCA(y0, y1);
        }
      }

      // Standard path: evaluate all args to numbers
      const args = node.args.map(a => evalNode(a, ctx));
      for (const arg of args) {
        if (arg.type === 'error') return arg;
      }
      const nums = args.map(a => a.type === 'boolean' ? (a.value ? 1 : 0) : (a as any).value as number);

      switch (node.fn) {
        case 'clamp': {
          if (nums.length !== 3) return { type: 'error', message: 'clamp expects 3 arguments' };
          return { type: 'number', value: Math.max(nums[0], Math.min(nums[1], nums[2])) };
        }
        case 'min': return { type: 'number', value: Math.min(...nums) };
        case 'max': return { type: 'number', value: Math.max(...nums) };
        case 'round': return { type: 'number', value: Math.round(nums[0] ?? 0) };
        case 'abs': return { type: 'number', value: Math.abs(nums[0] ?? 0) };
        case 'floor': return { type: 'number', value: Math.floor(nums[0] ?? 0) };
        case 'ceil': return { type: 'number', value: Math.ceil(nums[0] ?? 0) };

        case 'lerp': {
          if (nums.length !== 3) return { type: 'error', message: 'lerp expects 3 arguments: lerp(a, b, t)' };
          return { type: 'number', value: nums[0] + (nums[1] - nums[0]) * nums[2] };
        }
        case 'mod': {
          if (nums.length !== 2) return { type: 'error', message: 'mod expects 2 arguments: mod(a, b)' };
          if (nums[1] === 0) return { type: 'number', value: 0 };
          return { type: 'number', value: ((nums[0] % nums[1]) + nums[1]) % nums[1] };
        }
        case 'map': {
          if (nums.length !== 5) return { type: 'error', message: 'map expects 5 arguments' };
          const inRange = nums[2] - nums[1];
          if (inRange === 0) return { type: 'number', value: nums[3] };
          const t = (nums[0] - nums[1]) / inRange;
          return { type: 'number', value: nums[3] + (nums[4] - nums[3]) * t };
        }
        case 'pow': {
          if (nums.length !== 2) return { type: 'error', message: 'pow expects 2 arguments' };
          return { type: 'number', value: Math.pow(nums[0], nums[1]) };
        }
        case 'sqrt': {
          if (nums.length !== 1) return { type: 'error', message: 'sqrt expects 1 argument' };
          return { type: 'number', value: Math.sqrt(Math.max(0, nums[0])) };
        }
        case 'step': {
          if (nums.length !== 2) return { type: 'error', message: 'step expects 2 arguments' };
          return { type: 'number', value: nums[1] >= nums[0] ? 1 : 0 };
        }
        case 'smoothstep': {
          if (nums.length !== 3) return { type: 'error', message: 'smoothstep expects 3 arguments' };
          const edge0 = nums[0], edge1 = nums[1], x = nums[2];
          if (edge0 === edge1) return { type: 'number', value: x >= edge0 ? 1 : 0 };
          const st = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
          return { type: 'number', value: st * st * (3 - 2 * st) };
        }
        case 'sign': {
          if (nums.length !== 1) return { type: 'error', message: 'sign expects 1 argument' };
          return { type: 'number', value: Math.sign(nums[0]) };
        }
        case 'snap': {
          if (nums.length !== 2) return { type: 'error', message: 'snap expects 2 arguments' };
          if (nums[1] === 0) return { type: 'number', value: nums[0] };
          return { type: 'number', value: Math.round(nums[0] / nums[1]) * nums[1] };
        }
        case 'sin': {
          if (nums.length !== 1) return { type: 'error', message: 'sin expects 1 argument' };
          return { type: 'number', value: Math.sin(nums[0] * Math.PI / 180) };
        }
        case 'cos': {
          if (nums.length !== 1) return { type: 'error', message: 'cos expects 1 argument' };
          return { type: 'number', value: Math.cos(nums[0] * Math.PI / 180) };
        }
        case 'tan': {
          if (nums.length !== 1) return { type: 'error', message: 'tan expects 1 argument' };
          const tanVal = Math.tan(nums[0] * Math.PI / 180);
          return { type: 'number', value: Math.max(-1e6, Math.min(1e6, tanVal)) };
        }
        case 'atan2': {
          if (nums.length !== 2) return { type: 'error', message: 'atan2 expects 2 arguments' };
          let angle = Math.atan2(nums[0], nums[1]) * 180 / Math.PI;
          if (angle < 0) angle += 360;
          return { type: 'number', value: angle };
        }
        case 'log': {
          if (nums.length !== 1) return { type: 'error', message: 'log expects 1 argument' };
          return { type: 'number', value: Math.log(Math.max(0.0001, nums[0])) };
        }
        case 'log2': {
          if (nums.length !== 1) return { type: 'error', message: 'log2 expects 1 argument' };
          return { type: 'number', value: Math.log2(Math.max(0.0001, nums[0])) };
        }
        case 'log10': {
          if (nums.length !== 1) return { type: 'error', message: 'log10 expects 1 argument' };
          return { type: 'number', value: Math.log10(Math.max(0.0001, nums[0])) };
        }
        case 'exp': {
          if (nums.length !== 1) return { type: 'error', message: 'exp expects 1 argument' };
          return { type: 'number', value: Math.exp(Math.min(88, nums[0])) };
        }
        case 'fract': {
          if (nums.length !== 1) return { type: 'error', message: 'fract expects 1 argument' };
          return { type: 'number', value: nums[0] - Math.floor(nums[0]) };
        }
        case 'inverselerp':
        case 'invlerp': {
          if (nums.length !== 3) return { type: 'error', message: 'inverseLerp expects 3 arguments' };
          const iRange = nums[1] - nums[0];
          if (iRange === 0) return { type: 'number', value: 0 };
          return { type: 'number', value: (nums[2] - nums[0]) / iRange };
        }
        case 'luminance': {
          if (nums.length !== 3) return { type: 'error', message: 'luminance expects 3 arguments' };
          const srgbToLin = (v: number): number => {
            const c = Math.max(0, Math.min(1, v / 255));
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          };
          return { type: 'number', value: 0.2126 * srgbToLin(nums[0]) + 0.7152 * srgbToLin(nums[1]) + 0.0722 * srgbToLin(nums[2]) };
        }
        case 'contrast': {
          if (nums.length !== 2) return { type: 'error', message: 'contrast expects 2 arguments' };
          const lMax = Math.max(0, Math.max(nums[0], nums[1]));
          const lMin = Math.max(0, Math.min(nums[0], nums[1]));
          return { type: 'number', value: (lMax + 0.05) / (lMin + 0.05) };
        }
        case 'huelerp': {
          if (nums.length !== 3) return { type: 'error', message: 'huelerp expects 3 arguments' };
          const hA = ((nums[0] % 360) + 360) % 360;
          const hB = ((nums[1] % 360) + 360) % 360;
          let hDiff = hB - hA;
          if (hDiff > 180) hDiff -= 360;
          if (hDiff < -180) hDiff += 360;
          const hOut = ((hA + hDiff * nums[2]) % 360 + 360) % 360;
          return { type: 'number', value: hOut };
        }
        case 'apca': {
          if (nums.length !== 2) return { type: 'error', message: 'apca expects 2 arguments' };
          return evalAPCA(nums[0], nums[1]);
        }
        case 'srgbtolinear': {
          if (nums.length !== 1) return { type: 'error', message: 'srgbToLinear expects 1 argument' };
          const cLin = Math.max(0, Math.min(1, nums[0] / 255));
          return { type: 'number', value: cLin <= 0.04045 ? cLin / 12.92 : Math.pow((cLin + 0.055) / 1.055, 2.4) };
        }
        case 'lineartosrgb': {
          if (nums.length !== 1) return { type: 'error', message: 'linearToSrgb expects 1 argument' };
          const vLin = Math.max(0, Math.min(1, nums[0]));
          const srgbVal = vLin <= 0.0031308 ? vLin * 12.92 : 1.055 * Math.pow(vLin, 1 / 2.4) - 0.055;
          return { type: 'number', value: Math.round(srgbVal * 255) };
        }
        case 'deltae': {
          if (nums.length !== 6) return { type: 'error', message: 'deltaE expects 6 arguments or 2 @node refs' };
          return { type: 'number', value: computeCIEDE2000(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]) };
        }

        default: return { type: 'error', message: `Unknown function: ${node.fn}` };
      }
    }

    case 'Conditional': {
      const condR = evalNode(node.condition, ctx);
      if (condR.type === 'error') return condR;
      const condBool = condR.type === 'boolean' ? condR.value : (condR.value !== 0);
      return condBool ? evalNode(node.consequent, ctx) : evalNode(node.alternate, ctx);
    }

    case 'Locked': {
      const vals = ctx.lockedValues || ctx.self;
      const val = vals[ctx.currentChannel || 'hue'];
      if (val === undefined) return { type: 'error', message: 'No current channel value' };
      return { type: 'number', value: val };
    }

    case 'TokenRef': {
      if (node.property) {
        const tokenCtx = (ctx as any).tokenValues as Map<string, TokenColor> | undefined;
        if (!tokenCtx) return { type: 'error', message: 'Token values not available in this context' };
        let tokenColor = tokenCtx.get(node.tokenId);
        if (!tokenColor && node.tokenValue) {
          const cleanName = node.tokenValue.replace(/^\{|\}$/g, '');
          const tokenNamesCtx = (ctx as any).tokenNames as Map<string, string> | undefined;
          if (tokenNamesCtx && cleanName) {
            for (const [id, name] of tokenNamesCtx) {
              if (name === cleanName || name.toLowerCase() === cleanName.toLowerCase()) {
                tokenColor = tokenCtx.get(id);
                if (tokenColor) break;
              }
            }
          }
        }
        if (!tokenColor) {
          const label = node.tokenValue ? node.tokenValue.replace(/^\{|\}$/g, '') : node.tokenId;
          return { type: 'error', message: `Token "${label}" not found or has no color values` };
        }
        const channelMap = tokenColorToChannelMap(tokenColor);
        const val = channelMap[node.property];
        if (val === undefined) return { type: 'error', message: `Unknown token property: ${node.property}` };
        return { type: 'number', value: val };
      }
      return { type: 'error', message: 'Bare token reference — use with .property or in token assignment context' };
    }

    default:
      return { type: 'error', message: 'Unknown AST node type' };
  }
}

// ── Channel Evaluation ──────────────────────────────────────────

export function evaluateChannelLogic(
  logic: ChannelLogic,
  ctx: EvalContext,
  nodeBaseValue: number,
): { value: number; source: 'logic' | 'fallback'; error?: string } {
  const locals: Record<string, number> = { ...(ctx.locals || {}) };
  const booleanLocals: Set<string> = new Set();
  let lastValidValue: number | null = null;
  let lastError: string | undefined;

  for (let i = 0; i < logic.rows.length; i++) {
    const row = logic.rows[i];
    if (!row.enabled || row.tokens.length === 0) continue;
    const outputName = row.outputName || `out_${i + 1}`;

    const ast = parseTokensToAST(row.tokens);
    if (!ast) continue;

    const rowCtx = { ...ctx, locals: { ...locals } };
    const result = evaluateAST(ast, rowCtx);

    if (result.type === 'error') {
      lastError = result.message;
      continue;
    }

    if (result.type === 'number') {
      if (isNaN(result.value)) continue;
      locals[outputName] = result.value;
      lastValidValue = result.value;
      lastError = undefined;
    }

    if (result.type === 'boolean') {
      const numVal = result.value ? 1 : 0;
      locals[outputName] = numVal;
      booleanLocals.add(outputName);
      lastError = undefined;
    }
  }

  const parentChannelVal = ctx.parent && ctx.currentChannel
    ? ctx.parent[ctx.currentChannel]
    : undefined;
  const fallbackVal = logic.fallbackMode === 'custom' && logic.fallbackValue !== undefined
    ? logic.fallbackValue
    : (parentChannelVal !== undefined ? parentChannelVal : nodeBaseValue);

  if (logic.finalOutputVar && locals[logic.finalOutputVar] !== undefined && !booleanLocals.has(logic.finalOutputVar)) {
    const rawVal = locals[logic.finalOutputVar];
    if (logic.autoConstrain !== false && ctx.currentChannel) {
      const cr = constrainChannelValue(ctx.currentChannel, rawVal);
      return { value: cr.constrained, source: 'logic' };
    }
    return { value: rawVal, source: 'logic' };
  }

  if (lastValidValue !== null) {
    if (logic.autoConstrain !== false && ctx.currentChannel) {
      const cr = constrainChannelValue(ctx.currentChannel, lastValidValue);
      return { value: cr.constrained, source: 'logic' };
    }
    return { value: lastValidValue, source: 'logic' };
  }

  return { value: fallbackVal, source: 'fallback', error: lastError };
}

// ═══════════════════════════════════════════════════════════════════
// Token Assignment Evaluation Engine
// ═══════════════════════════════════════════════════════════════════

export interface TokenColor {
  h: number; s: number; l: number; a: number;
}

export type TokenAssignResult =
  | { type: 'tokenRef'; tokenId: string; tokenName: string }
  | { type: 'computedColor'; color: TokenColor; cssColor: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; message: string };

export interface TokenEvalContext {
  self: Record<string, number>;
  parent: Record<string, number> | null;
  allNodes: Map<string, Record<string, number>>;
  tokenValues: Map<string, TokenColor>;
  tokenNames: Map<string, string>;
  locals?: Record<string, number>;
}

export function tokenColorToChannelMap(color: TokenColor): Record<string, number> {
  const map: Record<string, number> = {
    hue: color.h, saturation: color.s, lightness: color.l, alpha: color.a,
    h: color.h, s: color.s, l: color.l, a: color.a,
  };

  const oklch = hslToOklch(color.h, color.s, color.l);
  map.oklchL = oklch.l;
  map.oklchC = oklch.c;
  map.oklchH = oklch.h;

  const rgb = hslToRgb(color.h, color.s, color.l);
  map.red = rgb.r;
  map.green = rgb.g;
  map.blue = rgb.b;

  const hct = rgbToHct(rgb.r, rgb.g, rgb.b);
  map.hctH = hct.h;
  map.hctC = hct.c;
  map.hctT = hct.t;

  return map;
}

function tokenColorToCss(c: TokenColor): string {
  return `hsla(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%, ${(c.a / 100).toFixed(2)})`;
}

function clampN(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function evalTokenNode(ast: ExpressionAST, ctx: TokenEvalContext): TokenAssignResult {
  switch (ast.type) {
    case 'TokenRef': {
      const resolveTokenColor = (): { color: TokenColor; resolvedId: string } | null => {
        if (ast.tokenId) {
          const direct = ctx.tokenValues.get(ast.tokenId);
          if (direct) return { color: direct, resolvedId: ast.tokenId };
        }
        if (ast.tokenValue) {
          const cleanName = ast.tokenValue.replace(/^\{|\}$/g, '');
          if (cleanName) {
            for (const [id, name] of ctx.tokenNames) {
              if (name === cleanName || name.toLowerCase() === cleanName.toLowerCase()) {
                const c = ctx.tokenValues.get(id);
                if (c) return { color: c, resolvedId: id };
              }
            }
          }
        }
        return null;
      };

      if (ast.property) {
        const resolved = resolveTokenColor();
        if (!resolved) {
          const label = ast.tokenValue ? ast.tokenValue.replace(/^\{|\}$/g, '') : ast.tokenId;
          return { type: 'error', message: `Token "${label}" not found` };
        }
        const channelMap = tokenColorToChannelMap(resolved.color);
        const val = channelMap[ast.property];
        if (val === undefined) return { type: 'error', message: `Unknown token property: ${ast.property}` };
        return { type: 'number', value: val };
      }

      let resolvedId = ast.tokenId || '';
      let resolvedName = resolvedId ? ctx.tokenNames.get(resolvedId) : undefined;

      if (!resolvedName && ast.tokenValue) {
        const cleanName = ast.tokenValue.replace(/^\{|\}$/g, '');
        if (cleanName) {
          for (const [id, name] of ctx.tokenNames) {
            if (name === cleanName || name.toLowerCase() === cleanName.toLowerCase()) {
              resolvedId = id;
              resolvedName = name;
              break;
            }
          }
        }
      }

      const finalName = resolvedName || ast.tokenValue?.replace(/^\{|\}$/g, '') || resolvedId || 'unknown';
      return { type: 'tokenRef', tokenId: resolvedId, tokenName: finalName };
    }

    case 'Call': {
      const fnLower = ast.fn.toLowerCase();
      const tokenComputeFns = new Set([
        'lighten', 'darken', 'mix', 'saturate', 'desaturate',
        'adjusthue', 'complement', 'tint', 'shade', 'opacity', 'rgba',
        'contrast', 'wcag', 'apca', 'luminance', 'deltae',
        'isreadable', 'isreadablelarge',
      ]);

      if (tokenComputeFns.has(fnLower)) {
        return evalTokenComputeFunction(fnLower, ast.args, ctx);
      }

      const stdCtx: EvalContext = {
        self: ctx.self,
        parent: ctx.parent,
        allNodes: ctx.allNodes,
        locals: ctx.locals,
      };
      (stdCtx as any).tokenValues = ctx.tokenValues;
      (stdCtx as any).tokenNames = ctx.tokenNames;
      const stdResult = evaluateAST(ast, stdCtx);
      if (stdResult.type === 'error') return stdResult;
      if (stdResult.type === 'number') return { type: 'number', value: stdResult.value };
      if (stdResult.type === 'boolean') return { type: 'boolean', value: stdResult.value };
      return { type: 'error', message: 'Unexpected result type' };
    }

    case 'Conditional': {
      const condResult = evalTokenNode(ast.condition, ctx);
      if (condResult.type === 'error') return condResult;
      let condBool: boolean;
      if (condResult.type === 'boolean') condBool = condResult.value;
      else if (condResult.type === 'number') condBool = condResult.value !== 0;
      else condBool = true;
      return condBool
        ? evalTokenNode(ast.consequent, ctx)
        : evalTokenNode(ast.alternate, ctx);
    }

    case 'Local': {
      const val = ctx.locals?.[ast.name];
      if (val === undefined) return { type: 'error', message: `Unknown variable: ${ast.name}` };
      return { type: 'number', value: val };
    }

    case 'NodeRef': {
      return { type: 'error', message: 'Use {token} references for token assignment.' };
    }

    default: {
      const stdCtx2: EvalContext = {
        self: ctx.self,
        parent: ctx.parent,
        allNodes: ctx.allNodes,
        locals: ctx.locals,
      };
      (stdCtx2 as any).tokenValues = ctx.tokenValues;
      (stdCtx2 as any).tokenNames = ctx.tokenNames;
      const result = evaluateAST(ast, stdCtx2);
      if (result.type === 'error') return result;
      if (result.type === 'number') return { type: 'number', value: result.value };
      if (result.type === 'boolean') return { type: 'boolean', value: result.value };
      return { type: 'error', message: 'Unexpected result type' };
    }
  }
}

function resolveArgToColor(arg: ExpressionAST, ctx: TokenEvalContext): TokenColor | TokenAssignResult {
  if (arg.type === 'TokenRef' && !arg.property) {
    let color = ctx.tokenValues.get(arg.tokenId);
    if (!color && arg.tokenValue) {
      const cleanName = arg.tokenValue.replace(/^\{|\}$/g, '');
      if (cleanName) {
        for (const [id, name] of ctx.tokenNames) {
          if (name === cleanName || name.toLowerCase() === cleanName.toLowerCase()) {
            color = ctx.tokenValues.get(id);
            if (color) break;
          }
        }
      }
    }
    if (!color) {
      const label = arg.tokenValue ? arg.tokenValue.replace(/^\{|\}$/g, '') : arg.tokenId;
      return { type: 'error', message: `Token "${label}" has no color values` };
    }
    return color;
  }
  if (arg.type === 'Local') {
    return { type: 'error', message: `$${arg.name} is a number, not a color.` };
  }
  const result = evalTokenNode(arg, ctx);
  if (result.type === 'computedColor') return result.color;
  if (result.type === 'tokenRef') {
    const color = ctx.tokenValues.get(result.tokenId);
    if (!color) return { type: 'error', message: `Token "${result.tokenName}" has no color values` };
    return color;
  }
  if (result.type === 'number') {
    return { type: 'error', message: 'Got a number, expected a color.' };
  }
  return { type: 'error', message: 'Expected a color (token reference or color function)' };
}

function resolveArgToNumber(arg: ExpressionAST, ctx: TokenEvalContext): number | TokenAssignResult {
  const result = evalTokenNode(arg, ctx);
  if (result.type === 'number') return result.value;
  if (result.type === 'boolean') return result.value ? 1 : 0;
  if (result.type === 'error') return result;
  return { type: 'error', message: 'Expected a number' };
}

function evalTokenComputeFunction(
  fn: string,
  args: ExpressionAST[],
  ctx: TokenEvalContext,
): TokenAssignResult {
  switch (fn) {
    case 'lighten': {
      if (args.length !== 2) return { type: 'error', message: 'lighten expects 2 arguments' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const amountRes = resolveArgToNumber(args[1], ctx);
      if (typeof amountRes !== 'number') return amountRes;
      const color = colorRes as TokenColor;
      const newL = clampN(color.l + amountRes, 0, 100);
      const result: TokenColor = { ...color, l: newL };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'darken': {
      if (args.length !== 2) return { type: 'error', message: 'darken expects 2 arguments' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const amountRes = resolveArgToNumber(args[1], ctx);
      if (typeof amountRes !== 'number') return amountRes;
      const color = colorRes as TokenColor;
      const newL = clampN(color.l - amountRes, 0, 100);
      const result: TokenColor = { ...color, l: newL };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'saturate': {
      if (args.length !== 2) return { type: 'error', message: 'saturate expects 2 arguments' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const amountRes = resolveArgToNumber(args[1], ctx);
      if (typeof amountRes !== 'number') return amountRes;
      const color = colorRes as TokenColor;
      const newS = clampN(color.s + amountRes, 0, 100);
      const result: TokenColor = { ...color, s: newS };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'desaturate': {
      if (args.length !== 2) return { type: 'error', message: 'desaturate expects 2 arguments' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const amountRes = resolveArgToNumber(args[1], ctx);
      if (typeof amountRes !== 'number') return amountRes;
      const color = colorRes as TokenColor;
      const newS = clampN(color.s - amountRes, 0, 100);
      const result: TokenColor = { ...color, s: newS };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'adjusthue': {
      if (args.length !== 2) return { type: 'error', message: 'adjustHue expects 2 arguments' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const amountRes = resolveArgToNumber(args[1], ctx);
      if (typeof amountRes !== 'number') return amountRes;
      const color = colorRes as TokenColor;
      const newH = ((color.h + amountRes) % 360 + 360) % 360;
      const result: TokenColor = { ...color, h: newH };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'complement': {
      if (args.length !== 1) return { type: 'error', message: 'complement expects 1 argument' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const color = colorRes as TokenColor;
      const newH = (color.h + 180) % 360;
      const result: TokenColor = { ...color, h: newH };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'mix': {
      if (args.length !== 3) return { type: 'error', message: 'mix expects 3 arguments' };
      const c1Res = resolveArgToColor(args[0], ctx);
      if ('type' in c1Res) return c1Res as TokenAssignResult;
      const c2Res = resolveArgToColor(args[1], ctx);
      if ('type' in c2Res) return c2Res as TokenAssignResult;
      const wRes = resolveArgToNumber(args[2], ctx);
      if (typeof wRes !== 'number') return wRes;
      const c1 = c1Res as TokenColor;
      const c2 = c2Res as TokenColor;
      const w = clampN(wRes / 100, 0, 1);
      let hDiff = c2.h - c1.h;
      if (hDiff > 180) hDiff -= 360;
      if (hDiff < -180) hDiff += 360;
      const newH = ((c1.h + hDiff * w) % 360 + 360) % 360;
      const result: TokenColor = {
        h: newH,
        s: c1.s + (c2.s - c1.s) * w,
        l: c1.l + (c2.l - c1.l) * w,
        a: c1.a + (c2.a - c1.a) * w,
      };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'tint': {
      if (args.length !== 2) return { type: 'error', message: 'tint expects 2 arguments' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const amountRes = resolveArgToNumber(args[1], ctx);
      if (typeof amountRes !== 'number') return amountRes;
      const color = colorRes as TokenColor;
      const w = clampN(amountRes / 100, 0, 1);
      const result: TokenColor = { h: color.h, s: color.s * (1 - w), l: color.l + (100 - color.l) * w, a: color.a };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'shade': {
      if (args.length !== 2) return { type: 'error', message: 'shade expects 2 arguments' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const amountRes = resolveArgToNumber(args[1], ctx);
      if (typeof amountRes !== 'number') return amountRes;
      const color = colorRes as TokenColor;
      const w = clampN(amountRes / 100, 0, 1);
      const result: TokenColor = { h: color.h, s: color.s * (1 - w), l: color.l * (1 - w), a: color.a };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'opacity':
    case 'rgba': {
      if (args.length !== 2) return { type: 'error', message: `${fn} expects 2 arguments` };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const alphaRes = resolveArgToNumber(args[1], ctx);
      if (typeof alphaRes !== 'number') return alphaRes;
      const color = colorRes as TokenColor;
      const alphaVal = alphaRes <= 1 ? alphaRes * 100 : alphaRes;
      const result: TokenColor = { ...color, a: clampN(alphaVal, 0, 100) };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'contrast':
    case 'wcag': {
      if (args.length !== 2) return { type: 'error', message: `${fn} expects 2 arguments` };
      const c1 = resolveArgToColor(args[0], ctx);
      if ('type' in c1) return c1 as TokenAssignResult;
      const c2 = resolveArgToColor(args[1], ctx);
      if ('type' in c2) return c2 as TokenAssignResult;
      const rgb1 = hslToRgb((c1 as TokenColor).h, (c1 as TokenColor).s, (c1 as TokenColor).l);
      const rgb2 = hslToRgb((c2 as TokenColor).h, (c2 as TokenColor).s, (c2 as TokenColor).l);
      const lum1 = 0.2126 * srgbChannelToLinear(rgb1.r) + 0.7152 * srgbChannelToLinear(rgb1.g) + 0.0722 * srgbChannelToLinear(rgb1.b);
      const lum2 = 0.2126 * srgbChannelToLinear(rgb2.r) + 0.7152 * srgbChannelToLinear(rgb2.g) + 0.0722 * srgbChannelToLinear(rgb2.b);
      const lighter = Math.max(lum1, lum2);
      const darker = Math.min(lum1, lum2);
      return { type: 'number', value: (lighter + 0.05) / (darker + 0.05) };
    }

    case 'apca': {
      if (args.length !== 2) return { type: 'error', message: 'apca expects 2 arguments' };
      const ct = resolveArgToColor(args[0], ctx);
      if ('type' in ct) return ct as TokenAssignResult;
      const cb = resolveArgToColor(args[1], ctx);
      if ('type' in cb) return cb as TokenAssignResult;
      const rgbT = hslToRgb((ct as TokenColor).h, (ct as TokenColor).s, (ct as TokenColor).l);
      const rgbB = hslToRgb((cb as TokenColor).h, (cb as TokenColor).s, (cb as TokenColor).l);
      const lumT = 0.2126 * srgbChannelToLinear(rgbT.r) + 0.7152 * srgbChannelToLinear(rgbT.g) + 0.0722 * srgbChannelToLinear(rgbT.b);
      const lumB = 0.2126 * srgbChannelToLinear(rgbB.r) + 0.7152 * srgbChannelToLinear(rgbB.g) + 0.0722 * srgbChannelToLinear(rgbB.b);
      return evalAPCA(lumT, lumB);
    }

    case 'luminance': {
      if (args.length !== 1) return { type: 'error', message: 'luminance expects 1 argument' };
      const cLum = resolveArgToColor(args[0], ctx);
      if ('type' in cLum) return cLum as TokenAssignResult;
      const rgbLum = hslToRgb((cLum as TokenColor).h, (cLum as TokenColor).s, (cLum as TokenColor).l);
      return {
        type: 'number',
        value: 0.2126 * srgbChannelToLinear(rgbLum.r) + 0.7152 * srgbChannelToLinear(rgbLum.g) + 0.0722 * srgbChannelToLinear(rgbLum.b),
      };
    }

    case 'deltae': {
      if (args.length !== 2) return { type: 'error', message: 'deltaE expects 2 arguments' };
      const cd1 = resolveArgToColor(args[0], ctx);
      if ('type' in cd1) return cd1 as TokenAssignResult;
      const cd2 = resolveArgToColor(args[1], ctx);
      if ('type' in cd2) return cd2 as TokenAssignResult;
      const rgbD1 = hslToRgb((cd1 as TokenColor).h, (cd1 as TokenColor).s, (cd1 as TokenColor).l);
      const rgbD2 = hslToRgb((cd2 as TokenColor).h, (cd2 as TokenColor).s, (cd2 as TokenColor).l);
      const lab1 = rgbToLab(rgbD1.r, rgbD1.g, rgbD1.b);
      const lab2 = rgbToLab(rgbD2.r, rgbD2.g, rgbD2.b);
      return { type: 'number', value: computeCIEDE2000(lab1.L, lab1.a, lab1.b, lab2.L, lab2.a, lab2.b) };
    }

    case 'isreadable': {
      if (args.length !== 2) return { type: 'error', message: 'isReadable expects 2 arguments' };
      const cfr = resolveArgToColor(args[0], ctx);
      if ('type' in cfr) return cfr as TokenAssignResult;
      const cbr = resolveArgToColor(args[1], ctx);
      if ('type' in cbr) return cbr as TokenAssignResult;
      const rgbFr = hslToRgb((cfr as TokenColor).h, (cfr as TokenColor).s, (cfr as TokenColor).l);
      const rgbBr = hslToRgb((cbr as TokenColor).h, (cbr as TokenColor).s, (cbr as TokenColor).l);
      const lumFr = 0.2126 * srgbChannelToLinear(rgbFr.r) + 0.7152 * srgbChannelToLinear(rgbFr.g) + 0.0722 * srgbChannelToLinear(rgbFr.b);
      const lumBr = 0.2126 * srgbChannelToLinear(rgbBr.r) + 0.7152 * srgbChannelToLinear(rgbBr.g) + 0.0722 * srgbChannelToLinear(rgbBr.b);
      const ratio = (Math.max(lumFr, lumBr) + 0.05) / (Math.min(lumFr, lumBr) + 0.05);
      return { type: 'boolean', value: ratio >= 4.5 };
    }

    case 'isreadablelarge': {
      if (args.length !== 2) return { type: 'error', message: 'isReadableLarge expects 2 arguments' };
      const cfl = resolveArgToColor(args[0], ctx);
      if ('type' in cfl) return cfl as TokenAssignResult;
      const cbl = resolveArgToColor(args[1], ctx);
      if ('type' in cbl) return cbl as TokenAssignResult;
      const rgbFl = hslToRgb((cfl as TokenColor).h, (cfl as TokenColor).s, (cfl as TokenColor).l);
      const rgbBl = hslToRgb((cbl as TokenColor).h, (cbl as TokenColor).s, (cbl as TokenColor).l);
      const lumFl = 0.2126 * srgbChannelToLinear(rgbFl.r) + 0.7152 * srgbChannelToLinear(rgbFl.g) + 0.0722 * srgbChannelToLinear(rgbFl.b);
      const lumBl = 0.2126 * srgbChannelToLinear(rgbBl.r) + 0.7152 * srgbChannelToLinear(rgbBl.g) + 0.0722 * srgbChannelToLinear(rgbBl.b);
      const ratioL = (Math.max(lumFl, lumBl) + 0.05) / (Math.min(lumFl, lumBl) + 0.05);
      return { type: 'boolean', value: ratioL >= 3 };
    }

    default:
      return { type: 'error', message: `Unknown token function: ${fn}` };
  }
}

// ── Token Assignment Detailed Evaluation ────────────────────────

export interface TokenRowOutput {
  rowId: string;
  outputName: string;
  result: TokenAssignResult | null;
  skipped: boolean;
  isNaN: boolean;
}

export interface DetailedTokenAssignResult {
  rowOutputs: TokenRowOutput[];
  finalResult: TokenAssignResult | null;
  finalSource: 'logic' | 'fallback';
  locals: Record<string, number>;
}

export function evaluateTokenAssignmentDetailed(
  logic: TokenAssignmentLogic,
  ctx: TokenEvalContext,
): DetailedTokenAssignResult {
  const rowOutputs: TokenRowOutput[] = [];
  const locals: Record<string, number> = { ...(ctx.locals || {}) };
  let lastValidResult: TokenAssignResult | null = null;

  if (!ctx || !ctx.tokenNames || !ctx.tokenValues) {
    return { rowOutputs: [], finalResult: { type: 'error', message: 'Token evaluation context is incomplete' }, finalSource: 'fallback', locals: {} };
  }

  for (const row of logic.rows) {
    const outputName = row.outputName || `out_${rowOutputs.length + 1}`;

    if (!row.enabled || row.tokens.length === 0) {
      rowOutputs.push({ rowId: row.id, outputName, result: null, skipped: true, isNaN: false });
      continue;
    }

    let ast: ExpressionAST | null;
    try {
      ast = parseTokensToAST(row.tokens);
    } catch (parseErr: any) {
      rowOutputs.push({ rowId: row.id, outputName, result: { type: 'error', message: `Parse error: ${parseErr?.message || 'unknown'}` }, skipped: false, isNaN: false });
      continue;
    }
    if (!ast) {
      rowOutputs.push({ rowId: row.id, outputName, result: null, skipped: true, isNaN: false });
      continue;
    }

    const rowCtx: TokenEvalContext = { ...ctx, locals: { ...locals } };
    let result: TokenAssignResult;
    try {
      result = evalTokenNode(ast, rowCtx);
    } catch (e: any) {
      rowOutputs.push({ rowId: row.id, outputName, result: { type: 'error', message: e?.message || 'Unexpected evaluation error' }, skipped: false, isNaN: false });
      continue;
    }

    if (result.type === 'error') {
      rowOutputs.push({ rowId: row.id, outputName, result, skipped: false, isNaN: false });
      continue;
    }

    if (result.type === 'number') {
      if (isNaN(result.value)) {
        rowOutputs.push({ rowId: row.id, outputName, result: null, skipped: false, isNaN: true });
        continue;
      }
      locals[outputName] = result.value;
      rowOutputs.push({ rowId: row.id, outputName, result, skipped: false, isNaN: false });
      continue;
    }

    if (result.type === 'boolean') {
      locals[outputName] = result.value ? 1 : 0;
      rowOutputs.push({ rowId: row.id, outputName, result, skipped: false, isNaN: false });
      continue;
    }

    rowOutputs.push({ rowId: row.id, outputName, result, skipped: false, isNaN: false });
    lastValidResult = result;
  }

  return {
    rowOutputs,
    finalResult: lastValidResult,
    finalSource: lastValidResult ? 'logic' : 'fallback',
    locals,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Batch Token Assignment Evaluation (for Export / Pipeline)
// ═══════════════════════════════════════════════════════════════════

export interface TokenAssignExportResult {
  tokenId: string;
  result: TokenAssignResult;
  expressionText: string;
  isConditional: boolean;
}

export function conditionRowToExpressionText(row: { tokens: ExpressionToken[] }): string {
  return row.tokens
    .map(t => t.displayLabel || t.value)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildTokenEvalContextFromData(
  tokens: DesignToken[],
  nodes: ColorNode[],
  activeThemeId: string,
  primaryThemeId: string,
  targetNodeId?: string,
): TokenEvalContext {
  const tokenValues = new Map<string, TokenColor>();
  const tokenNames = new Map<string, string>();

  tokens.forEach(t => {
    const tv = t.themeValues ? (t.themeValues[activeThemeId] || Object.values(t.themeValues)[0]) : null;
    const h = tv?.hue ?? t.hue ?? 0;
    const s = tv?.saturation ?? t.saturation ?? 0;
    const l = tv?.lightness ?? t.lightness ?? 50;
    const a = tv?.alpha ?? t.alpha ?? 100;
    if (tv?.hue !== undefined || tv?.saturation !== undefined || tv?.lightness !== undefined || t.hue !== undefined) {
      tokenValues.set(t.id, { h, s, l, a });
    }
    tokenNames.set(t.id, t.name);
  });

  nodes.forEach(n => {
    if (!n.isTokenNode || n.isTokenPrefix || !n.ownTokenId) return;
    const vtId = n.valueTokenAssignments?.[activeThemeId]
      || (primaryThemeId ? n.valueTokenAssignments?.[primaryThemeId] : undefined)
      || n.valueTokenId;
    if (!vtId) return;
    const vt = tokens.find(t => t.id === vtId);
    if (!vt) return;
    const vtv = vt.themeValues ? (vt.themeValues[activeThemeId] || Object.values(vt.themeValues)[0]) : null;
    const h = vtv?.hue ?? vt.hue ?? 0;
    const s = vtv?.saturation ?? vt.saturation ?? 0;
    const l = vtv?.lightness ?? vt.lightness ?? 50;
    const a = vtv?.alpha ?? vt.alpha ?? 100;
    tokenValues.set(n.ownTokenId, { h, s, l, a });
  });

  const isPrimary = activeThemeId === primaryThemeId;
  const targetNode = targetNodeId ? nodes.find(n => n.id === targetNodeId) : undefined;
  const selfMap = targetNode ? nodeToChannelMapThemeAware(targetNode, activeThemeId, isPrimary) : {};
  let parentMap: Record<string, number> | null = null;
  if (targetNode?.parentId) {
    const pn = nodes.find(n => n.id === targetNode.parentId);
    if (pn) parentMap = nodeToChannelMapThemeAware(pn, activeThemeId, isPrimary);
  }
  const allNodesMap = new Map<string, Record<string, number>>();
  nodes.forEach(n => {
    if (!n.isSpacing && !n.isTokenNode) {
      allNodesMap.set(n.id, nodeToChannelMapThemeAware(n, activeThemeId, isPrimary));
    }
  });

  return { self: selfMap, parent: parentMap, allNodes: allNodesMap, tokenValues, tokenNames };
}

export function evaluateAllTokenAssignments(
  advancedLogic: NodeAdvancedLogic[],
  tokens: DesignToken[],
  nodes: ColorNode[],
  activeThemeId: string,
  primaryThemeId: string,
): Map<string, TokenAssignExportResult> {
  const results = new Map<string, TokenAssignExportResult>();

  const isPrimary = activeThemeId === primaryThemeId;

  for (const logic of advancedLogic) {
    const ownerNode = nodes.find(n => n.id === logic.nodeId);
    if (!ownerNode || !ownerNode.isTokenNode || ownerNode.isTokenPrefix || !ownerNode.ownTokenId) continue;

    const nodeIsUnlinked = !isPrimary && !!(ownerNode.themeOverrides?.[activeThemeId]);
    const tokenIsUnlinked = nodeIsUnlinked || (!isPrimary && !!(ownerNode.valueTokenAssignments?.[activeThemeId]));

    const ta = getEffectiveTokenAssignment(logic, activeThemeId, isPrimary, tokenIsUnlinked);
    if (!ta) continue;
    if (!ta.rows || ta.rows.length === 0) continue;
    const hasActiveRows = ta.rows.some(r => r.enabled && r.tokens.length > 0);
    if (!hasActiveRows) continue;

    let ctx: TokenEvalContext;
    let detailed: DetailedTokenAssignResult;
    try {
      ctx = buildTokenEvalContextFromData(tokens, nodes, activeThemeId, primaryThemeId, logic.nodeId);
      detailed = evaluateTokenAssignmentDetailed(ta, ctx);
    } catch {
      continue;
    }

    let finalResult: TokenAssignResult | null = null;
    if (ta.finalOutputVar) {
      const match = detailed.rowOutputs.find(ro => ro.outputName === ta.finalOutputVar && ro.result);
      finalResult = match?.result || null;
    } else {
      finalResult = detailed.finalResult;
    }

    if (!finalResult || finalResult.type === 'error') continue;

    const activeRows = ta.rows.filter(r => r.enabled && r.tokens.length > 0);
    const expressionText = activeRows.map(r => conditionRowToExpressionText(r)).join(' ; ');
    const isConditional = activeRows.some(r =>
      r.tokens.some(t => t.type === 'keyword' && (t.value === 'if' || t.value === 'then' || t.value === 'else'))
    );

    results.set(ownerNode.ownTokenId, {
      tokenId: ownerNode.ownTokenId,
      result: finalResult,
      expressionText,
      isConditional,
    });
  }

  return results;
}
