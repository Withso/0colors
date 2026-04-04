// ═══════════════════════════════════════════════════════════════════
// Advanced Logic Engine — Expression Parser & Evaluator
// Converts ExpressionToken[] → ExpressionAST and evaluates to
// a number or boolean result in a sandboxed context.
// ═══════════════════════════════════════════════════════════════════

import {
  ExpressionToken,
  ExpressionAST,
  ColorNode,
  ChannelLogic,
  TokenAssignmentLogic,
  DesignToken,
  NodeAdvancedLogic,
} from '../types';

import { hslToRgb, hslToOklch } from './color-conversions';
import { rgbToHct } from './hct-utils';

// ── Theme-aware logic resolution helpers ────────────────────────

/**
 * Returns the effective channel logic for a node given the current theme context.
 * - Primary theme → `logic.channels`
 * - Non-primary + node is inherited (linked to primary) → `logic.channels`
 * - Non-primary + node is unlinked + has theme-specific → `themeChannels[themeId]`
 * - Non-primary + node is unlinked + no theme-specific → inherits `logic.channels`
 *
 * @param nodeHasThemeOverride  True when the node is UNLINKED in this theme.
 */
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

/**
 * Returns the effective token assignment logic for a node given the current theme context.
 */
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

/**
 * Returns the effective base values (for `locked` keyword) given theme context.
 */
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
  mode: 'clamp' | 'wrap'; // wrap = modular arithmetic for cyclical values (hue)
}

/**
 * Per-channel range constraints — matches the slider configs in ColorNodeCard.tsx.
 * Hue channels use 'wrap' (cyclical), everything else uses 'clamp'.
 */
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

/** Result of applying a constraint to a raw value. */
export interface ConstraintResult {
  raw: number;              // The unconstrained value from evaluation
  constrained: number;      // The value after applying clamp/wrap
  wasConstrained: boolean;  // true if raw ≠ constrained
  mode: 'clamp' | 'wrap';  // Which mode was applied
  channelMin: number;       // The channel's min bound
  channelMax: number;       // The channel's max bound
}

/**
 * Apply range constraint to a value for a given channel.
 * - Hue channels (mode='wrap'): modular arithmetic `((val % range) + range) % range`
 * - Other channels (mode='clamp'): `Math.max(min, Math.min(max, val))`
 */
export function constrainChannelValue(channelKey: string, value: number): ConstraintResult {
  const constraint = CHANNEL_CONSTRAINTS[channelKey];
  if (!constraint) {
    return { raw: value, constrained: value, wasConstrained: false, mode: 'clamp', channelMin: 0, channelMax: Infinity };
  }

  const { min, max, mode } = constraint;
  let constrained: number;

  if (mode === 'wrap') {
    // Modular wrap for cyclical values (hue): ((val % range) + range) % range
    const range = max - min;
    constrained = ((((value - min) % range) + range) % range) + min;
  } else {
    // Clamp for bounded values
    constrained = Math.max(min, Math.min(max, value));
  }

  // Round to avoid floating point noise in comparison
  const wasConstrained = Math.abs(constrained - value) > 0.0001;

  return { raw: value, constrained, wasConstrained, mode, channelMin: min, channelMax: max };
}

// ── Evaluation Context ──────────────────────────────────────────

export interface EvalContext {
  self: Record<string, number>;   // Current node's channel values
  parent: Record<string, number> | null; // Parent node's channel values (null if root)
  allNodes: Map<string, Record<string, number>>; // nodeId → channel map
  locals?: Record<string, number>; // Output variables from previous rows (for sequential referencing)
  currentChannel?: string; // The channel key being evaluated (for `locked` keyword)
  lockedValues?: Record<string, number>; // Pre-logic base values for `locked` keyword (prevents feedback loops)
}

/** Build a flat channel-value map from a ColorNode. */
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
    // Common shorthand aliases for property access
    h: node.hue ?? 0,
    s: node.saturation ?? 0,
    l: node.lightness ?? 0,
    a: node.alpha ?? 100,
    r: node.red ?? 0,
    g: node.green ?? 0,
    b: node.blue ?? 0,
  };
}

/** Build a channel map from theme-aware values. */
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

/**
 * Parse a flat ExpressionToken[] into an AST.
 * Supports: if/then/else, AND/OR, comparisons, math +−×÷, clamp(), references.
 *
 * Grammar (recursive descent):
 *   expr       → conditional | logicOr
 *   conditional → IF logicOr THEN expr ELSE expr
 *   logicOr    → logicAnd ( OR logicAnd )*
 *   logicAnd   → comparison ( AND comparison )*
 *   comparison → addition (( > | < | >= | <= | == | != ) addition)?
 *   addition   → multiply (( + | - ) multiply)*
 *   multiply   → unary (( * | / | % ) unary)*
 *   unary      → ( - ) unary | atom
 *   atom       → LITERAL | BOOLEAN | REFERENCE.PROPERTY | @Parent.PROPERTY | @Self.PROPERTY
 *              | FUNCTION ( args ) | ( expr )
 */
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

    // ── Handle `@Self.X VALUE` pattern ──
    // Users often write `if ... then @Self.H 200` meaning "set hue to 200".
    // Since the channel column already determines the target, @Self.X is redundant.
    // If the consequent is a Self reference AND the next token is NOT a keyword/operator
    // but IS another parseable value, skip the Self ref and use the value instead.
    if (
      consequent.type === 'Self' &&
      pos < tokens.length &&
      peek()?.type !== 'keyword' &&
      peek()?.type !== 'operator'
    ) {
      // Re-parse: treat the next expression as the real consequent
      consequent = parseExpr();
    }

    // ── `else` is optional ──
    // If no `else`, the alternate is a NaN sentinel → evaluator treats it as "skip/fall-through"
    let alternate: ExpressionAST;
    if (peek()?.type === 'keyword' && peek()?.value === 'else') {
      advance(); // consume 'else'
      alternate = parseExpr();

      // Same @Self pattern for else clause
      if (
        alternate.type === 'Self' &&
        pos < tokens.length &&
        peek()?.type !== 'keyword' &&
        peek()?.type !== 'operator'
      ) {
        alternate = parseExpr();
      }
    } else {
      // No else clause → NaN sentinel means "condition false = fall through"
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
      // Implicit == : two adjacent value tokens with no operator between them
      // e.g. `$out_2 false`, `$var 100`, `@Parent.H $val`
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

    // Locked keyword — resolves to the channel's current base value
    if (t.type === 'keyword' && t.value === 'locked') {
      advance();
      return { type: 'Locked' };
    }

    // Literal number
    if (t.type === 'literal') {
      advance();
      return { type: 'Literal', value: parseFloat(t.value) };
    }

    // Boolean
    if (t.type === 'boolean') {
      advance();
      return { type: 'Boolean', value: t.value === 'true' };
    }

    // Function call: clamp( ... )
    if (t.type === 'function') {
      const fn = advance();
      expect('paren', '(');
      const args: ExpressionAST[] = [];
      if (peek()?.value !== ')') {
        args.push(parseExpr());
        while (peek()?.type === 'comma') {
          advance(); // consume comma
          args.push(parseExpr());
        }
      }
      expect('paren', ')');
      return { type: 'Call', fn: fn.value, args };
    }

    // Reference: @Parent or @Node(id)
    // Also handles legacy tokens that were saved as 'reference' but should be 'tokenRef'
    if (t.type === 'reference') {
      const ref = advance();
      // ── Legacy migration: reference tokens with refTokenId or {braces} are actually token refs ──
      // Older code paths sometimes saved token pills as type:'reference' instead of type:'tokenRef'
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
      // Next token should be a property token
      const prop = peek();
      if (prop && prop.type === 'property') {
        advance();
        const propKey = prop.refProperty || prop.value.replace('.', '').toLowerCase();
        if (ref.value === '@Parent') {
          return { type: 'Parent', property: propKey };
        }
        if (ref.value === '@Self') {
          return { type: 'Self', property: propKey };
        }
        return { type: 'Reference', nodeId: ref.refNodeId || '', property: propKey };
      }
      // Reference without property — bare node ref (for contrast/apca node-ref mode)
      if (ref.value === '@Parent') return { type: 'NodeRef', target: 'parent' };
      if (ref.value === '@Self') return { type: 'NodeRef', target: 'self' };
      return { type: 'NodeRef', target: 'node', nodeId: ref.refNodeId || '' };
    }

    // Local variable reference: $varName
    if (t.type === 'local') {
      const tok = advance();
      return { type: 'Local', name: tok.value };
    }

    // Token reference: {token-name} or {token-name}.H
    if (t.type === 'tokenRef') {
      const tok = advance();
      const tokenId = tok.refTokenId || '';
      const tokenValue = tok.value || tok.displayLabel || '';
      // Check if followed by a property token (.H, .S, .L, etc.)
      const prop = peek();
      if (prop && prop.type === 'property') {
        advance();
        const propKey = prop.refProperty || prop.value.replace('.', '').toLowerCase();
        return { type: 'TokenRef', tokenId, property: propKey, tokenValue };
      }
      // Bare token reference — resolves to token ID (for assignment) or color (for function args)
      return { type: 'TokenRef', tokenId, tokenValue };
    }

    // Parenthesized expression
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
    if (pos < tokens.length) {
      // There are unconsumed tokens — still return what we parsed
      // This allows partial expressions to evaluate
    }
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

/**
 * APCA-W3 contrast (WCAG 3.0 draft) — Accessible Perceptual Contrast Algorithm.
 * Asymmetric: text vs background produce different Lc values.
 * @param txtY — relative luminance of text (0-1)
 * @param bgY  — relative luminance of background (0-1)
 * @returns Lc (Lightness Contrast): positive = dark text on light bg, negative = light text on dark bg.
 *          |Lc| ≥ 75 recommended for body text, ≥ 60 for large text, ≥ 45 for non-text.
 *          Range roughly -108 to +106.
 */
function evalAPCA(txtY: number, bgY: number): EvalResult {
  // APCA-W3 constants (Myndex / SAPC specification)
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

  // Clamp negative luminance
  let tY = Math.max(0, txtY);
  let bY = Math.max(0, bgY);

  // Soft clamp black levels
  tY = tY > blkThrs ? tY : tY + Math.pow(blkThrs - tY, blkClmp);
  bY = bY > blkThrs ? bY : bY + Math.pow(blkThrs - bY, blkClmp);

  // If nearly identical, no contrast
  if (Math.abs(bY - tY) < deltaYmin) return { type: 'number', value: 0 };

  let SAPC: number;
  let Lc: number;

  if (bY > tY) {
    // Normal polarity: dark text on light background → positive Lc
    SAPC = (Math.pow(bY, normBG) - Math.pow(tY, normTXT)) * scaleBoW;
    Lc = SAPC < loClip ? 0 : (SAPC - loBoWoffset) * 100;
  } else {
    // Reverse polarity: light text on dark background → negative Lc
    SAPC = (Math.pow(bY, revBG) - Math.pow(tY, revTXT)) * scaleWoB;
    Lc = SAPC > -loClip ? 0 : (SAPC + loWoBoffset) * 100;
  }

  return { type: 'number', value: Lc };
}

// ── Shared helper: sRGB channel → linear ────────────────────────
function srgbChannelToLinear(v: number): number {
  const c = Math.max(0, Math.min(1, v / 255));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// ── Shared helper: Resolve NodeRef → channel map ────────────────
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

// ── Shared helper: Resolve NodeRef → RGB tuple ──────────────────
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

// ── RGB → CIELAB (CIE L*a*b*) conversion ───────────────────────
// Uses IEC 61966-2-1 sRGB→XYZ matrix and D65 illuminant.
function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const rLin = srgbChannelToLinear(r);
  const gLin = srgbChannelToLinear(g);
  const bLin = srgbChannelToLinear(b);

  // Linear sRGB → CIE XYZ (D65) — IEC 61966-2-1 matrix
  const X = 0.4124564 * rLin + 0.3575761 * gLin + 0.1804375 * bLin;
  const Y = 0.2126729 * rLin + 0.7151522 * gLin + 0.0721750 * bLin;
  const Z = 0.0193339 * rLin + 0.1191920 * gLin + 0.9503041 * bLin;

  // D65 reference white point
  const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;

  // CIE Lab nonlinear transform — exact rational constants from spec
  const epsilon = 216 / 24389; // ≈ 0.008856
  const kappa = 24389 / 27;    // ≈ 903.3
  const f = (t: number): number => t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116;

  const fx = f(X / Xn);
  const fy = f(Y / Yn);
  const fz = f(Z / Zn);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

// ── CIEDE2000 (ΔE*₀₀) — ISO/CIE 11664-6:2014 ─────────────────
// The gold-standard perceptual color difference metric.
// Returns 0 for identical colors; ~1 for just-noticeable difference;
// ~2.3 for "different but similar"; >5 for clearly different.
function computeCIEDE2000(
  L1: number, a1: number, b1: number,
  L2: number, a2: number, b2: number,
): number {
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const POW25_7 = Math.pow(25, 7); // 6103515625

  // Step 1: Calculate C*ab and mean, then G adjustment
  const C1ab = Math.sqrt(a1 * a1 + b1 * b1);
  const C2ab = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab_mean = (C1ab + C2ab) / 2;
  const Cab_mean_pow7 = Math.pow(Cab_mean, 7);
  const G = 0.5 * (1 - Math.sqrt(Cab_mean_pow7 / (Cab_mean_pow7 + POW25_7)));

  // Adjusted a' values
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  // Adjusted C' and h' values
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) * DEG;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * DEG;
  if (h2p < 0) h2p += 360;

  // Step 2: Compute ΔL', ΔC', Δh', ΔH'
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

  // Step 3: Calculate weighting functions
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

  // Rotation term
  const theta = 30 * Math.exp(-((hp_mean - 275) / 25) * ((hp_mean - 275) / 25));
  const Cp_mean_pow7 = Math.pow(Cp_mean, 7);
  const RC = 2 * Math.sqrt(Cp_mean_pow7 / (Cp_mean_pow7 + POW25_7));
  const RT = -Math.sin(2 * theta * RAD) * RC;

  // Final ΔE*₀₀ (with kL = kC = kH = 1)
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
      // Bare node references are only valid inside contrast() / apca() / deltaE() calls.
      // If we reach here, the ref is used outside a supported function.
      return { type: 'error', message: 'Bare node ref — use inside contrast(), apca(), or deltaE()' };
    }

    case 'Call': {
      // ── Node-ref aware functions ──────────────────────────────
      // contrast(), apca(), and deltaE() accept bare @Node references as arguments.
      // When NodeRef args are present, resolve RGB from the referenced node
      // and compute luminance/Lab internally instead of expecting pre-computed numbers.
      //
      // Also handles missing-comma case: `fn(@Parent @Self)` without a comma
      // gets parsed as `fn(@Parent == @Self)` (1 arg, implicit ==).
      // We detect this and auto-split into 2 NodeRef args.
      if (node.fn === 'contrast' || node.fn === 'apca' || node.fn === 'deltae') {
        let resolvedArgs: ExpressionAST[] = node.args;

        // Missing-comma recovery: 1 arg that's BinaryOp(==, NodeRef, NodeRef)
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
            // deltaE node-ref mode: resolve both nodes to Lab, compute CIEDE2000
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

          // contrast/apca node-ref mode: resolve both nodes to luminance
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
            // Not a NodeRef — evaluate normally to get a luminance number
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
          // apca
          return evalAPCA(y0, y1);
        }
      }

      // ── Standard path: evaluate all args to numbers ───────────
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

        // ── Tier 1: Essential for color work ─────────────────────
        case 'lerp': {
          // lerp(a, b, t) = a + (b - a) * t
          if (nums.length !== 3) return { type: 'error', message: 'lerp expects 3 arguments: lerp(a, b, t)' };
          return { type: 'number', value: nums[0] + (nums[1] - nums[0]) * nums[2] };
        }
        case 'mod': {
          // mod(a, b) — always-positive modulo: ((a % b) + b) % b
          if (nums.length !== 2) return { type: 'error', message: 'mod expects 2 arguments: mod(a, b)' };
          if (nums[1] === 0) return { type: 'number', value: 0 };
          return { type: 'number', value: ((nums[0] % nums[1]) + nums[1]) % nums[1] };
        }
        case 'map': {
          // map(value, inMin, inMax, outMin, outMax) — remap from one range to another
          if (nums.length !== 5) return { type: 'error', message: 'map expects 5 arguments: map(val, inMin, inMax, outMin, outMax)' };
          const inRange = nums[2] - nums[1];
          if (inRange === 0) return { type: 'number', value: nums[3] }; // degenerate: inMin == inMax → return outMin
          const t = (nums[0] - nums[1]) / inRange;
          return { type: 'number', value: nums[3] + (nums[4] - nums[3]) * t };
        }
        case 'pow': {
          // pow(base, exponent)
          if (nums.length !== 2) return { type: 'error', message: 'pow expects 2 arguments: pow(base, exp)' };
          return { type: 'number', value: Math.pow(nums[0], nums[1]) };
        }
        case 'sqrt': {
          // sqrt(value)
          if (nums.length !== 1) return { type: 'error', message: 'sqrt expects 1 argument' };
          return { type: 'number', value: Math.sqrt(Math.max(0, nums[0])) };
        }

        // ── Tier 2: Very useful ──────────────────────────────────
        case 'step': {
          // step(edge, x) → 0 if x < edge, 1 if x >= edge
          if (nums.length !== 2) return { type: 'error', message: 'step expects 2 arguments: step(edge, x)' };
          return { type: 'number', value: nums[1] >= nums[0] ? 1 : 0 };
        }
        case 'smoothstep': {
          // smoothstep(edge0, edge1, x) → Hermite S-curve interpolation
          if (nums.length !== 3) return { type: 'error', message: 'smoothstep expects 3 arguments: smoothstep(e0, e1, x)' };
          const edge0 = nums[0], edge1 = nums[1], x = nums[2];
          if (edge0 === edge1) return { type: 'number', value: x >= edge0 ? 1 : 0 };
          const st = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
          return { type: 'number', value: st * st * (3 - 2 * st) };
        }
        case 'sign': {
          // sign(value) → -1, 0, or 1
          if (nums.length !== 1) return { type: 'error', message: 'sign expects 1 argument' };
          return { type: 'number', value: Math.sign(nums[0]) };
        }
        case 'snap': {
          // snap(value, grid) → snap to nearest multiple of grid
          if (nums.length !== 2) return { type: 'error', message: 'snap expects 2 arguments: snap(value, grid)' };
          if (nums[1] === 0) return { type: 'number', value: nums[0] };
          return { type: 'number', value: Math.round(nums[0] / nums[1]) * nums[1] };
        }

        // ── Tier 3: Powerful but niche ───────────────────────────
        case 'sin': {
          // sin(degrees) → sine of angle in degrees (not radians)
          // Returns -1 to 1. Useful for cyclic/wave patterns on hue or lightness.
          if (nums.length !== 1) return { type: 'error', message: 'sin expects 1 argument: sin(degrees)' };
          return { type: 'number', value: Math.sin(nums[0] * Math.PI / 180) };
        }
        case 'cos': {
          // cos(degrees) → cosine of angle in degrees
          if (nums.length !== 1) return { type: 'error', message: 'cos expects 1 argument: cos(degrees)' };
          return { type: 'number', value: Math.cos(nums[0] * Math.PI / 180) };
        }
        case 'tan': {
          // tan(degrees) → tangent of angle in degrees
          // Capped to ±1e6 to avoid near-Infinity at 90°/270° (floating point never hits exact asymptote).
          if (nums.length !== 1) return { type: 'error', message: 'tan expects 1 argument: tan(degrees)' };
          const tanVal = Math.tan(nums[0] * Math.PI / 180);
          return { type: 'number', value: Math.max(-1e6, Math.min(1e6, tanVal)) };
        }
        case 'atan2': {
          // atan2(y, x) → angle in degrees, range [0, 360)
          // Follows the standard atan2 convention (y first, x second).
          // Useful for computing hue angles from Cartesian coordinates (e.g., Lab a*/b*).
          if (nums.length !== 2) return { type: 'error', message: 'atan2 expects 2 arguments: atan2(y, x)' };
          let angle = Math.atan2(nums[0], nums[1]) * 180 / Math.PI;
          if (angle < 0) angle += 360;
          return { type: 'number', value: angle };
        }
        case 'log': {
          // log(value) → natural logarithm (ln). Returns -Infinity for 0, NaN for negative.
          // Clamped to avoid NaN: log(max(0.0001, value))
          if (nums.length !== 1) return { type: 'error', message: 'log expects 1 argument: log(value)' };
          return { type: 'number', value: Math.log(Math.max(0.0001, nums[0])) };
        }
        case 'log2': {
          // log2(value) → base-2 logarithm. Clamped to avoid NaN.
          if (nums.length !== 1) return { type: 'error', message: 'log2 expects 1 argument: log2(value)' };
          return { type: 'number', value: Math.log2(Math.max(0.0001, nums[0])) };
        }
        case 'log10': {
          // log10(value) → base-10 logarithm. Clamped to avoid NaN.
          if (nums.length !== 1) return { type: 'error', message: 'log10 expects 1 argument: log10(value)' };
          return { type: 'number', value: Math.log10(Math.max(0.0001, nums[0])) };
        }
        case 'exp': {
          // exp(value) → e^value. Useful for exponential curves/gamma.
          // Capped at exp(88) ≈ 1.65e38 to avoid Infinity.
          if (nums.length !== 1) return { type: 'error', message: 'exp expects 1 argument: exp(value)' };
          return { type: 'number', value: Math.exp(Math.min(88, nums[0])) };
        }
        case 'fract': {
          // fract(value) → fractional part: value - floor(value). Always 0..1.
          // Useful for repeating patterns: fract(hue / 60) gives position within 60° segment.
          if (nums.length !== 1) return { type: 'error', message: 'fract expects 1 argument: fract(value)' };
          return { type: 'number', value: nums[0] - Math.floor(nums[0]) };
        }
        case 'inverselerp':
        case 'invlerp': {
          // inverseLerp(a, b, v) → where does v fall between a and b? Returns 0..1 (unclamped).
          // Inverse of lerp: if lerp(0, 100, 0.5) = 50, then inverseLerp(0, 100, 50) = 0.5
          if (nums.length !== 3) return { type: 'error', message: 'inverseLerp expects 3 arguments: inverseLerp(a, b, v)' };
          const iRange = nums[1] - nums[0];
          if (iRange === 0) return { type: 'number', value: 0 };
          return { type: 'number', value: (nums[2] - nums[0]) / iRange };
        }

        // ── Color functions ──────────────────────────────────────
        case 'luminance': {
          // luminance(r, g, b) → WCAG 2.x relative luminance from sRGB 0-255 values
          // Returns 0 (pure black) to 1 (pure white).
          // Uses the same sRGB→linear gamma-decode as color-conversions.ts:srgbToLinear().
          if (nums.length !== 3) return { type: 'error', message: 'luminance expects 3 arguments: luminance(r, g, b)' };
          const srgbToLin = (v: number): number => {
            const c = Math.max(0, Math.min(1, v / 255));
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          };
          const rL = srgbToLin(nums[0]);
          const gL = srgbToLin(nums[1]);
          const bL = srgbToLin(nums[2]);
          // ITU-R BT.709 coefficients
          return { type: 'number', value: 0.2126 * rL + 0.7152 * gL + 0.0722 * bL };
        }
        case 'contrast': {
          // contrast(lum1, lum2) → WCAG 2.x contrast ratio
          // Accepts two relative-luminance values (from luminance()).
          // Returns 1 (identical) to 21 (black vs white).
          if (nums.length !== 2) return { type: 'error', message: 'contrast expects 2 arguments: contrast(lum1, lum2)' };
          const lMax = Math.max(0, Math.max(nums[0], nums[1]));
          const lMin = Math.max(0, Math.min(nums[0], nums[1]));
          return { type: 'number', value: (lMax + 0.05) / (lMin + 0.05) };
        }
        case 'huelerp': {
          // huelerp(a, b, t) → shortest-path hue interpolation on 360° wheel
          // Unlike lerp(), handles the 0°/360° wrap correctly:
          //   huelerp(350, 10, 0.5) → 0  (shortest path through 360°)
          //   huelerp(10, 350, 0.5) → 0
          if (nums.length !== 3) return { type: 'error', message: 'huelerp expects 3 arguments: huelerp(a, b, t)' };
          const hA = ((nums[0] % 360) + 360) % 360;
          const hB = ((nums[1] % 360) + 360) % 360;
          let hDiff = hB - hA;
          if (hDiff > 180) hDiff -= 360;
          if (hDiff < -180) hDiff += 360;
          const hOut = ((hA + hDiff * nums[2]) % 360 + 360) % 360;
          return { type: 'number', value: hOut };
        }
        case 'apca': {
          // apca(lum_text, lum_bg) → APCA Lc contrast (WCAG 3.0 draft)
          // Accepts two relative-luminance values (from luminance()).
          // Returns Lc: positive = dark on light, negative = light on dark.
          if (nums.length !== 2) return { type: 'error', message: 'apca expects 2 arguments: apca(lum_text, lum_bg)' };
          return evalAPCA(nums[0], nums[1]);
        }
        case 'srgbtolinear': {
          // srgbToLinear(channel) → convert single sRGB 0-255 value to linear 0-1
          // The same gamma decode used inside luminance(). Useful for manual color math.
          //   srgbToLinear(128) ≈ 0.2159 (mid-gray is darker than you'd think)
          //   srgbToLinear(255) = 1.0, srgbToLinear(0) = 0.0
          if (nums.length !== 1) return { type: 'error', message: 'srgbToLinear expects 1 argument: srgbToLinear(channel 0-255)' };
          const cLin = Math.max(0, Math.min(1, nums[0] / 255));
          return { type: 'number', value: cLin <= 0.04045 ? cLin / 12.92 : Math.pow((cLin + 0.055) / 1.055, 2.4) };
        }
        case 'lineartosrgb': {
          // linearToSrgb(linear) → convert linear 0-1 back to sRGB 0-255
          // Inverse of srgbToLinear(). Applies gamma encoding.
          //   linearToSrgb(0.2159) ≈ 128, linearToSrgb(1.0) = 255
          if (nums.length !== 1) return { type: 'error', message: 'linearToSrgb expects 1 argument: linearToSrgb(linear 0-1)' };
          const vLin = Math.max(0, Math.min(1, nums[0]));
          const srgbVal = vLin <= 0.0031308 ? vLin * 12.92 : 1.055 * Math.pow(vLin, 1 / 2.4) - 0.055;
          return { type: 'number', value: Math.round(srgbVal * 255) };
        }
        case 'deltae': {
          // deltaE(L1, a1, b1, L2, a2, b2) → CIEDE2000 perceptual color difference
          // Takes two colors in CIELAB (L*a*b*) space. Returns ΔE*₀₀:
          //   0 = identical, ~1 = just-noticeable, ~2.3 = similar, >5 = clearly different.
          // Also supports node-ref mode: deltaE(@Parent, @Self) — handled above.
          if (nums.length !== 6) return { type: 'error', message: 'deltaE expects 6 arguments: deltaE(L1, a1, b1, L2, a2, b2) or 2 @node refs' };
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
      // Token references with a property → resolve to a number (the property value)
      // Requires tokenValues in the context (Map<string, TokenColor>)
      if (node.property) {
        const tokenCtx = (ctx as any).tokenValues as Map<string, TokenColor> | undefined;
        if (!tokenCtx) return { type: 'error', message: 'Token values not available in this context' };
        let tokenColor = tokenCtx.get(node.tokenId);
        // Fallback: if ID lookup fails (e.g. refTokenId was missing on pill),
        // try name-based lookup using the original token display value
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
        // Convert TokenColor { h, s, l, a } to full channel map { hue, saturation, h, s, oklchL, ... }
        const channelMap = tokenColorToChannelMap(tokenColor);
        const val = channelMap[node.property];
        if (val === undefined) return { type: 'error', message: `Unknown token property: ${node.property}` };
        return { type: 'number', value: val };
      }
      // Bare token reference without property — not valid as a standalone number expression
      // in the channel evaluator. Token assignment evaluator handles this separately.
      return { type: 'error', message: 'Bare token reference — use with .property or in token assignment context' };
    }

    default:
      return { type: 'error', message: 'Unknown AST node type' };
  }
}

// ── Channel Evaluation ──────────────────────────────────────────

/**
 * Evaluate the full logic stack for a single channel.
 * Returns the computed value, or null if no valid result (use fallback).
 *
 * Rules:
 * - Rows are evaluated top-to-bottom
 * - If a row produces a number → that is the final value, stop
 * - If a row produces a boolean → it becomes a flag that subsequent rows can use
 *   (but for MVP, the boolean is just the result of the condition)
 * - If no row produces a number → use the fallback
 */
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
      // NaN is used as a sentinel for "optional else, condition was false" → skip/fall through
      if (isNaN(result.value)) continue;
      locals[outputName] = result.value;
      lastValidValue = result.value;
      lastError = undefined;
    }

    if (result.type === 'boolean') {
      const numVal = result.value ? 1 : 0;
      locals[outputName] = numVal;
      booleanLocals.add(outputName);
      // Booleans are stored for reference but don't count as valid channel output
      lastError = undefined;
    }
  }

  // Default fallback: use parent's corresponding channel value (inherits from parent),
  // falling back to node's own base value if no parent exists.
  const parentChannelVal = ctx.parent && ctx.currentChannel
    ? ctx.parent[ctx.currentChannel]
    : undefined;
  const fallbackVal = logic.fallbackMode === 'custom' && logic.fallbackValue !== undefined
    ? logic.fallbackValue
    : (parentChannelVal !== undefined ? parentChannelVal : nodeBaseValue);

  // If a specific output variable is selected, use that — but NOT if it's boolean
  if (logic.finalOutputVar && locals[logic.finalOutputVar] !== undefined && !booleanLocals.has(logic.finalOutputVar)) {
    const rawVal = locals[logic.finalOutputVar];
    // Apply channel constraint if autoConstrain is enabled (default: true)
    if (logic.autoConstrain !== false && ctx.currentChannel) {
      const cr = constrainChannelValue(ctx.currentChannel, rawVal);
      return { value: cr.constrained, source: 'logic' };
    }
    return { value: rawVal, source: 'logic' };
  }

  if (lastValidValue !== null) {
    // Apply channel constraint if autoConstrain is enabled (default: true)
    if (logic.autoConstrain !== false && ctx.currentChannel) {
      const cr = constrainChannelValue(ctx.currentChannel, lastValidValue);
      return { value: cr.constrained, source: 'logic' };
    }
    return { value: lastValidValue, source: 'logic' };
  }

  return { value: fallbackVal, source: 'fallback', error: lastError };
}

// ── Detailed Channel Evaluation (per-row outputs) ───────────────

export interface RowOutput {
  rowId: string;
  outputName: string;
  value: number | null;   // null = skipped or no result
  error?: string;
  skipped: boolean;       // true if disabled or empty
  isNaN: boolean;         // true if condition was false (no else) → fell through
  isBoolean: boolean;     // true if the result was a boolean (display as true/false)
}

export interface DetailedChannelResult {
  rowOutputs: RowOutput[];
  finalValue: number;
  finalSource: 'logic' | 'fallback';
  finalError?: string;
  locals: Record<string, number>; // accumulated local variables
  booleanLocals: Set<string>;     // variable names that hold boolean results
}

/**
 * Evaluate all rows with per-row output tracking.
 * Each row's output is stored as a local variable available to subsequent rows.
 * The last row that produces a valid number becomes the final output.
 */
export function evaluateChannelLogicDetailed(
  logic: ChannelLogic,
  ctx: EvalContext,
  nodeBaseValue: number,
): DetailedChannelResult {
  const rowOutputs: RowOutput[] = [];
  const locals: Record<string, number> = { ...(ctx.locals || {}) };
  const booleanLocals: Set<string> = new Set();
  let lastValidValue: number | null = null;
  let lastValidSource: 'logic' | 'fallback' = 'fallback';
  let lastError: string | undefined;

  for (const row of logic.rows) {
    const outputName = row.outputName || `out_${rowOutputs.length + 1}`;

    if (!row.enabled || row.tokens.length === 0) {
      rowOutputs.push({ rowId: row.id, outputName, value: null, skipped: true, isNaN: false, isBoolean: false });
      continue;
    }

    const ast = parseTokensToAST(row.tokens);
    if (!ast) {
      rowOutputs.push({ rowId: row.id, outputName, value: null, skipped: true, isNaN: false, isBoolean: false });
      continue;
    }

    // Evaluate with current locals injected into context
    const rowCtx = { ...ctx, locals: { ...locals } };
    const result = evaluateAST(ast, rowCtx);

    if (result.type === 'error') {
      rowOutputs.push({ rowId: row.id, outputName, value: null, error: result.message, skipped: false, isNaN: false, isBoolean: false });
      lastError = result.message;
      continue;
    }

    if (result.type === 'number') {
      if (isNaN(result.value)) {
        // NaN sentinel = condition false, no else → skip/fall-through
        rowOutputs.push({ rowId: row.id, outputName, value: null, skipped: false, isNaN: true, isBoolean: false });
        continue;
      }
      // Valid number output
      locals[outputName] = result.value;
      rowOutputs.push({ rowId: row.id, outputName, value: result.value, skipped: false, isNaN: false, isBoolean: false });
      lastValidValue = result.value;
      lastValidSource = 'logic';
      lastError = undefined;
      continue;
    }

    if (result.type === 'boolean') {
      const numVal = result.value ? 1 : 0;
      locals[outputName] = numVal;
      rowOutputs.push({ rowId: row.id, outputName, value: numVal, skipped: false, isNaN: false, isBoolean: true });
      booleanLocals.add(outputName);
      // Booleans are stored for reference but don't count as valid channel output
      lastError = undefined;
      continue;
    }
  }

  // Default fallback: use parent's corresponding channel value (inherits from parent),
  // falling back to node's own base value if no parent exists.
  const parentChannelVal = ctx.parent && ctx.currentChannel
    ? ctx.parent[ctx.currentChannel]
    : undefined;
  const fallbackVal = logic.fallbackMode === 'custom' && logic.fallbackValue !== undefined
    ? logic.fallbackValue
    : (parentChannelVal !== undefined ? parentChannelVal : nodeBaseValue);

  // If a specific output variable is selected, use that — but NOT if it's boolean
  let finalValue = lastValidValue !== null ? lastValidValue : fallbackVal;
  let finalSource = lastValidSource;

  if (logic.finalOutputVar && locals[logic.finalOutputVar] !== undefined && !booleanLocals.has(logic.finalOutputVar)) {
    finalValue = locals[logic.finalOutputVar];
    finalSource = 'logic';
  }

  return {
    rowOutputs,
    finalValue,
    finalSource,
    finalError: lastError,
    locals,
    booleanLocals,
  };
}

// ── Property display mapping ────────────────────────────────────

export const PROPERTY_OPTIONS: Record<string, { label: string; key: string; short: string }[]> = {
  hsl: [
    { label: 'Hue', key: 'hue', short: 'H' },
    { label: 'Saturation', key: 'saturation', short: 'S' },
    { label: 'Lightness', key: 'lightness', short: 'L' },
    { label: 'Alpha', key: 'alpha', short: 'A' },
  ],
  rgb: [
    { label: 'Red', key: 'red', short: 'R' },
    { label: 'Green', key: 'green', short: 'G' },
    { label: 'Blue', key: 'blue', short: 'B' },
    { label: 'Alpha', key: 'alpha', short: 'A' },
  ],
  oklch: [
    { label: 'Lightness', key: 'oklchL', short: 'L' },
    { label: 'Chroma', key: 'oklchC', short: 'C' },
    { label: 'Hue', key: 'oklchH', short: 'H' },
    { label: 'Alpha', key: 'alpha', short: 'A' },
  ],
  hct: [
    { label: 'Hue', key: 'hctH', short: 'H' },
    { label: 'Chroma', key: 'hctC', short: 'C' },
    { label: 'Tone', key: 'hctT', short: 'T' },
    { label: 'Alpha', key: 'alpha', short: 'A' },
  ],
  hex: [
    { label: 'Hue', key: 'hue', short: 'H' },
    { label: 'Saturation', key: 'saturation', short: 'S' },
    { label: 'Lightness', key: 'lightness', short: 'L' },
    { label: 'Alpha', key: 'alpha', short: 'A' },
  ],
};

// ── Token Colors (for pill rendering) ───────────────────────────

export const TOKEN_COLORS: Record<ExpressionToken['type'], string> = {
  keyword: 'var(--fuchsia-400)',
  operator: 'var(--red-400)',
  reference: 'var(--blue-500)',
  function: 'var(--green-400)',
  literal: 'var(--grey-400)',
  boolean: 'var(--yellow-400)',
  property: 'var(--blue-500)',
  paren: 'var(--grey-600)',
  comma: 'var(--grey-600)',
  local: 'var(--purple-300)',
  tokenRef: 'var(--pink-500)',
};

// ═══════════════════════════════════════════════════════════════════
// Token Assignment Evaluation Engine
// Evaluates conditional token assignment logic for token nodes.
// Output is either a token reference or a computed color.
// ═══════════════════════════════════════════════════════════════════

/** Resolved color from a token (HSL + alpha) */
export interface TokenColor {
  h: number; s: number; l: number; a: number;
}

/** Result of evaluating a token assignment expression */
export type TokenAssignResult =
  | { type: 'tokenRef'; tokenId: string; tokenName: string }
  | { type: 'computedColor'; color: TokenColor; cssColor: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; message: string };

/** Context for token assignment evaluation */
export interface TokenEvalContext {
  self: Record<string, number>;
  parent: Record<string, number> | null;
  allNodes: Map<string, Record<string, number>>;
  tokenValues: Map<string, TokenColor>;   // tokenId → HSL color
  tokenNames: Map<string, string>;        // tokenId → display name
  locals?: Record<string, number>;
}

/** Build a channel map for a token's color values (for property access like {token}.H) */
export function tokenColorToChannelMap(color: TokenColor): Record<string, number> {
  // HSL base
  const map: Record<string, number> = {
    hue: color.h, saturation: color.s, lightness: color.l, alpha: color.a,
    h: color.h, s: color.s, l: color.l, a: color.a,
  };

  // OKLCH derived values (L 0-100, C 0-40 raw×100, H 0-360)
  const oklch = hslToOklch(color.h, color.s, color.l);
  map.oklchL = oklch.l;
  map.oklchC = oklch.c;
  map.oklchH = oklch.h;

  // RGB derived values (0-255)
  const rgb = hslToRgb(color.h, color.s, color.l);
  map.red = rgb.r;
  map.green = rgb.g;
  map.blue = rgb.b;

  // HCT derived values
  const hct = rgbToHct(rgb.r, rgb.g, rgb.b);
  map.hctH = hct.h;
  map.hctC = hct.c;
  map.hctT = hct.t;

  return map;
}

/** Format a TokenColor as a renderable CSS string (always HSLA for swatch rendering) */
function tokenColorToCss(c: TokenColor): string {
  return `hsla(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%, ${(c.a / 100).toFixed(2)})`;
}

/**
 * Format a TokenColor as a human-readable display string in the given color space.
 * Used for UI labels/descriptions — NOT for CSS rendering (use tokenColorToCss for that).
 */
export function tokenColorToDisplayString(c: TokenColor, colorSpace: string): string {
  const a = c.a;
  const alphaFrac = (a / 100).toFixed(2);
  switch (colorSpace) {
    case 'oklch': {
      const oklch = hslToOklch(c.h, c.s, c.l);
      // oklch returns l: 0-100, c: 0-40 (raw×100), h: 0-360
      // CSS oklch uses L: 0-1, C: 0-0.4 (raw chroma), H: degrees
      const L = (oklch.l / 100).toFixed(2);
      const C = (oklch.c / 100).toFixed(3);
      const H = Math.round(oklch.h);
      if (a < 100) return `oklch(${L} ${C} ${H} / ${alphaFrac})`;
      return `oklch(${L} ${C} ${H})`;
    }
    case 'rgb': {
      const rgb = hslToRgb(c.h, c.s, c.l);
      if (a < 100) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alphaFrac})`;
      return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    }
    case 'hct': {
      const rgb = hslToRgb(c.h, c.s, c.l);
      const hct = rgbToHct(rgb.r, rgb.g, rgb.b);
      if (a < 100) return `hct(${hct.h}, ${hct.c}, ${hct.t} / ${alphaFrac})`;
      return `hct(${hct.h}, ${hct.c}, ${hct.t})`;
    }
    case 'hex': {
      const rgb = hslToRgb(c.h, c.s, c.l);
      const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
      const hex = `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
      if (a < 100) return `${hex}${toHex(Math.round(a * 2.55))}`;
      return hex;
    }
    case 'hsl':
    default: {
      if (a < 100) return `hsla(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%, ${alphaFrac})`;
      return `hsl(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%)`;
    }
  }
}

/** Clamp a number to 0..max */
function clampN(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Evaluate an AST node in the token assignment context.
 *  Returns a TokenAssignResult which can be a token ref, computed color, number, boolean, or error. */
function evalTokenNode(ast: ExpressionAST, ctx: TokenEvalContext): TokenAssignResult {
  // For most AST types, delegate to the standard numeric evaluator
  // then wrap the result
  switch (ast.type) {
    case 'TokenRef': {
      // ── Helper: resolve token by ID, with name-based fallback ──
      const resolveTokenColor = (): { color: TokenColor; resolvedId: string } | null => {
        // Direct ID lookup
        if (ast.tokenId) {
          const direct = ctx.tokenValues.get(ast.tokenId);
          if (direct) return { color: direct, resolvedId: ast.tokenId };
        }
        // Fallback: name-based lookup when refTokenId was missing/stale
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
        // {token}.H → resolve to number
        const resolved = resolveTokenColor();
        if (!resolved) {
          const label = ast.tokenValue ? ast.tokenValue.replace(/^\{|\}$/g, '') : ast.tokenId;
          return { type: 'error', message: `Token "${label}" not found or has no color values` };
        }
        const channelMap = tokenColorToChannelMap(resolved.color);
        const val = channelMap[ast.property];
        if (val === undefined) return { type: 'error', message: `Unknown token property: ${ast.property}` };
        return { type: 'number', value: val };
      }
      // ── Bare {token} → token reference (for assignment output) ──
      // This is the PRIMARY use case in token assignment mode:
      // a bare token without property is a valid output that assigns this token.
      let resolvedId = ast.tokenId || '';
      let resolvedName = resolvedId ? ctx.tokenNames.get(resolvedId) : undefined;

      // Name-based fallback: resolve by display name when ID is empty or not found
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
      // Empty ID is expected for tokens not yet resolved — silently continue
      return { type: 'tokenRef', tokenId: resolvedId, tokenName: finalName };
    }

    case 'Call': {
      // Check for token-specific computational functions
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

      // Standard numeric functions — delegate to standard evaluator
      const stdCtx: EvalContext = {
        self: ctx.self,
        parent: ctx.parent,
        allNodes: ctx.allNodes,
        locals: ctx.locals,
      };
      // Inject tokenValues + tokenNames so TokenRef with property works (incl. name fallback)
      (stdCtx as any).tokenValues = ctx.tokenValues;
      (stdCtx as any).tokenNames = ctx.tokenNames;
      const stdResult = evaluateAST(ast, stdCtx);
      if (stdResult.type === 'error') return stdResult;
      if (stdResult.type === 'number') return { type: 'number', value: stdResult.value };
      if (stdResult.type === 'boolean') return { type: 'boolean', value: stdResult.value };
      return { type: 'error', message: 'Unexpected result type' };
    }

    case 'Conditional': {
      // Evaluate condition as a number/boolean
      const condResult = evalTokenNode(ast.condition, ctx);
      if (condResult.type === 'error') return condResult;
      let condBool: boolean;
      if (condResult.type === 'boolean') condBool = condResult.value;
      else if (condResult.type === 'number') condBool = condResult.value !== 0;
      else condBool = true; // tokenRef/color in condition = truthy
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
      // Bare @Node references are not valid as token assignment outputs.
      // Give a helpful error message instead of the generic "Bare node ref" from the standard evaluator.
      return { type: 'error', message: 'Use {token} references (not @Node) for token assignment. @Node refs work inside contrast()/apca()/deltaE().' };
    }

    default: {
      // Delegate to standard evaluator for Literal, Boolean, BinaryOp, LogicalOp, Reference, etc.
      const stdCtx2: EvalContext = {
        self: ctx.self,
        parent: ctx.parent,
        allNodes: ctx.allNodes,
        locals: ctx.locals,
      };
      // Inject tokenValues + tokenNames so TokenRef with property works (incl. name fallback)
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

/** Resolve a function argument to a TokenColor */
function resolveArgToColor(arg: ExpressionAST, ctx: TokenEvalContext): TokenColor | TokenAssignResult {
  if (arg.type === 'TokenRef' && !arg.property) {
    let color = ctx.tokenValues.get(arg.tokenId);
    // Name-based fallback when refTokenId was missing/stale
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
    // If the local came from a previous computed-color row, we don't track colors in locals
    // For now, local variables are numbers only
    return { type: 'error', message: `$${arg.name} is a number, not a color. Use a {token} reference.` };
  }
  // Try evaluating to see if it's a nested token compute function
  const result = evalTokenNode(arg, ctx);
  if (result.type === 'computedColor') return result.color;
  if (result.type === 'tokenRef') {
    const color = ctx.tokenValues.get(result.tokenId);
    if (!color) return { type: 'error', message: `Token "${result.tokenName}" has no color values` };
    return color;
  }
  // Provide a more specific error for property accesses that resolve to numbers
  if (result.type === 'number' && arg.type === 'TokenRef' && arg.property) {
    const label = arg.tokenValue ? arg.tokenValue.replace(/^\{|\}$/g, '') : arg.tokenId;
    return { type: 'error', message: `{${label}}.${arg.property} is a number, not a color. Use {${label}} without the property.` };
  }
  if (result.type === 'number') {
    return { type: 'error', message: 'Got a number, expected a color. Use a {token} reference or color function.' };
  }
  return { type: 'error', message: 'Expected a color (token reference or color function)' };
}

/** Resolve a function argument to a number */
function resolveArgToNumber(arg: ExpressionAST, ctx: TokenEvalContext): number | TokenAssignResult {
  const result = evalTokenNode(arg, ctx);
  if (result.type === 'number') return result.value;
  if (result.type === 'boolean') return result.value ? 1 : 0;
  if (result.type === 'error') return result;
  return { type: 'error', message: 'Expected a number' };
}

/** Evaluate token-specific computational color functions */
function evalTokenComputeFunction(
  fn: string,
  args: ExpressionAST[],
  ctx: TokenEvalContext,
): TokenAssignResult {
  switch (fn) {
    case 'lighten': {
      // lighten({token}, amount) — increase lightness by amount%
      if (args.length !== 2) return { type: 'error', message: 'lighten expects 2 arguments: lighten({token}, amount)' };
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
      if (args.length !== 2) return { type: 'error', message: 'darken expects 2 arguments: darken({token}, amount)' };
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
      if (args.length !== 2) return { type: 'error', message: 'saturate expects 2 arguments: saturate({token}, amount)' };
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
      if (args.length !== 2) return { type: 'error', message: 'desaturate expects 2 arguments: desaturate({token}, amount)' };
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
      if (args.length !== 2) return { type: 'error', message: 'adjustHue expects 2 arguments: adjustHue({token}, degrees)' };
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
      if (args.length !== 1) return { type: 'error', message: 'complement expects 1 argument: complement({token})' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const color = colorRes as TokenColor;
      const newH = (color.h + 180) % 360;
      const result: TokenColor = { ...color, h: newH };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'mix': {
      // mix({token1}, {token2}, weight) — blend two colors
      if (args.length !== 3) return { type: 'error', message: 'mix expects 3 arguments: mix({color1}, {color2}, weight)' };
      const c1Res = resolveArgToColor(args[0], ctx);
      if ('type' in c1Res) return c1Res as TokenAssignResult;
      const c2Res = resolveArgToColor(args[1], ctx);
      if ('type' in c2Res) return c2Res as TokenAssignResult;
      const wRes = resolveArgToNumber(args[2], ctx);
      if (typeof wRes !== 'number') return wRes;
      const c1 = c1Res as TokenColor;
      const c2 = c2Res as TokenColor;
      const w = clampN(wRes / 100, 0, 1); // weight as 0-1
      // Hue interpolation: shortest path
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
      // tint({token}, amount) — mix with white (h=0, s=0, l=100)
      if (args.length !== 2) return { type: 'error', message: 'tint expects 2 arguments: tint({token}, amount)' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const amountRes = resolveArgToNumber(args[1], ctx);
      if (typeof amountRes !== 'number') return amountRes;
      const color = colorRes as TokenColor;
      const w = clampN(amountRes / 100, 0, 1);
      const result: TokenColor = {
        h: color.h,
        s: color.s * (1 - w),
        l: color.l + (100 - color.l) * w,
        a: color.a,
      };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'shade': {
      // shade({token}, amount) — mix with black (h=0, s=0, l=0)
      if (args.length !== 2) return { type: 'error', message: 'shade expects 2 arguments: shade({token}, amount)' };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const amountRes = resolveArgToNumber(args[1], ctx);
      if (typeof amountRes !== 'number') return amountRes;
      const color = colorRes as TokenColor;
      const w = clampN(amountRes / 100, 0, 1);
      const result: TokenColor = {
        h: color.h,
        s: color.s * (1 - w),
        l: color.l * (1 - w),
        a: color.a,
      };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    case 'opacity':
    case 'rgba': {
      // opacity({token}, alpha) or rgba({token}, alpha) — set alpha (0-100)
      if (args.length !== 2) return { type: 'error', message: `${fn} expects 2 arguments: ${fn}({token}, alpha)` };
      const colorRes = resolveArgToColor(args[0], ctx);
      if ('type' in colorRes) return colorRes as TokenAssignResult;
      const alphaRes = resolveArgToNumber(args[1], ctx);
      if (typeof alphaRes !== 'number') return alphaRes;
      const color = colorRes as TokenColor;
      // Accept alpha as 0-1 or 0-100; auto-detect based on range
      const alphaVal = alphaRes <= 1 ? alphaRes * 100 : alphaRes;
      const result: TokenColor = { ...color, a: clampN(alphaVal, 0, 100) };
      return { type: 'computedColor', color: result, cssColor: tokenColorToCss(result) };
    }

    // ── Accessibility / Contrast functions (token-aware) ─────────
    case 'contrast':
    case 'wcag': {
      // contrast({token1}, {token2}) or wcag({token1}, {token2}) → WCAG 2.x contrast ratio (1–21)
      if (args.length !== 2) return { type: 'error', message: `${fn} expects 2 arguments: ${fn}({token1}, {token2})` };
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
      // apca({tokenText}, {tokenBg}) → APCA Lc contrast value
      if (args.length !== 2) return { type: 'error', message: 'apca expects 2 arguments: apca({text}, {bg})' };
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
      // luminance({token}) → WCAG relative luminance (0–1)
      if (args.length !== 1) return { type: 'error', message: 'luminance expects 1 argument: luminance({token})' };
      const cLum = resolveArgToColor(args[0], ctx);
      if ('type' in cLum) return cLum as TokenAssignResult;
      const rgbLum = hslToRgb((cLum as TokenColor).h, (cLum as TokenColor).s, (cLum as TokenColor).l);
      return {
        type: 'number',
        value: 0.2126 * srgbChannelToLinear(rgbLum.r) + 0.7152 * srgbChannelToLinear(rgbLum.g) + 0.0722 * srgbChannelToLinear(rgbLum.b),
      };
    }

    case 'deltae': {
      // deltaE({token1}, {token2}) → CIEDE2000 perceptual color difference
      if (args.length !== 2) return { type: 'error', message: 'deltaE expects 2 arguments: deltaE({token1}, {token2})' };
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
      // isReadable({fg}, {bg}) → boolean: WCAG AA pass for normal text (contrast >= 4.5)
      if (args.length !== 2) return { type: 'error', message: 'isReadable expects 2 arguments: isReadable({fg}, {bg})' };
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
      // isReadableLarge({fg}, {bg}) → boolean: WCAG AA pass for large text (contrast >= 3)
      if (args.length !== 2) return { type: 'error', message: 'isReadableLarge expects 2 arguments: isReadableLarge({fg}, {bg})' };
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

// ── Token Assignment Row Output ──────────────────────────────────

export interface TokenRowOutput {
  rowId: string;
  outputName: string;
  result: TokenAssignResult | null; // null = skipped
  skipped: boolean;
  isNaN: boolean; // condition false, no else → fell through
}

export interface DetailedTokenAssignResult {
  rowOutputs: TokenRowOutput[];
  finalResult: TokenAssignResult | null;
  finalSource: 'logic' | 'fallback';
  locals: Record<string, number>;
}

/**
 * Evaluate all token assignment rows with per-row tracking.
 * The last row that produces a valid token reference or computed color is the output.
 */
export function evaluateTokenAssignmentDetailed(
  logic: TokenAssignmentLogic,
  ctx: TokenEvalContext,
): DetailedTokenAssignResult {
  const rowOutputs: TokenRowOutput[] = [];
  const locals: Record<string, number> = { ...(ctx.locals || {}) };
  let lastValidResult: TokenAssignResult | null = null;

  // Validate context
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
      // Incomplete expression (user still typing) — skip silently
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
      // Numbers don't count as valid token outputs but are stored for reference
      continue;
    }

    if (result.type === 'boolean') {
      locals[outputName] = result.value ? 1 : 0;
      rowOutputs.push({ rowId: row.id, outputName, result, skipped: false, isNaN: false });
      continue;
    }

    // tokenRef or computedColor — valid token assignment result
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

/** Set of known token computational function names (for palette and auto-commit) */
export const TOKEN_COMPUTE_FUNCTIONS = new Set([
  'lighten', 'darken', 'mix', 'saturate', 'desaturate',
  'adjusthue', 'complement', 'tint', 'shade', 'opacity', 'rgba',
  'contrast', 'wcag', 'apca', 'luminance', 'deltae',
  'isreadable', 'isreadablelarge',
]);

/** Property options for token references (always HSL since tokens store HSL internally) */
export const TOKEN_PROPERTY_OPTIONS = [
  { label: 'Hue', key: 'hue', short: 'H' },
  { label: 'Saturation', key: 'saturation', short: 'S' },
  { label: 'Lightness', key: 'lightness', short: 'L' },
  { label: 'Alpha', key: 'alpha', short: 'A' },
];

// ═══════════════════════════════════════════════════════════════════
// Batch Token Assignment Evaluation (for Code View / Export / Token Table)
// ═══════════════════════════════════════════════════════════════════

/** Result of evaluating a token node's advanced logic for export purposes */
export interface TokenAssignExportResult {
  /** The owning token node's ownTokenId */
  tokenId: string;
  /** The evaluation result */
  result: TokenAssignResult;
  /** Human-readable expression string (for CSS comments) */
  expressionText: string;
  /** Whether this came from conditional logic (if/then/else) */
  isConditional: boolean;
}

/** Convert a ConditionRow's tokens to a human-readable expression string */
export function conditionRowToExpressionText(row: { tokens: ExpressionToken[] }): string {
  return row.tokens
    .map(t => t.displayLabel || t.value)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build a TokenEvalContext from raw data (for use outside AdvancedPopup) */
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

  // Resolve token node tokens through value token assignments.
  // ALWAYS overwrite first-pass defaults (which may be placeholder hue:200)
  // with the correctly resolved color from the value token chain.
  nodes.forEach(n => {
    if (!n.isTokenNode || n.isTokenPrefix || !n.ownTokenId) return;
    // Resolve value token
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

  // Build node channel maps for @Self/@Parent/@Node references
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

/**
 * Evaluate all token assignment logic across all nodes.
 * Returns a Map of ownTokenId → export result (computed color or token ref).
 * Only returns entries for token nodes that have active token assignment logic.
 */
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
    // Find the owning node
    const ownerNode = nodes.find(n => n.id === logic.nodeId);
    if (!ownerNode || !ownerNode.isTokenNode || ownerNode.isTokenPrefix || !ownerNode.ownTokenId) continue;

    // Determine whether this token node is "unlinked" in the current theme
    const nodeIsUnlinked = !isPrimary && !!(ownerNode.themeOverrides?.[activeThemeId]);
    // For token nodes, also check if valueTokenAssignments has a theme-specific entry
    const tokenIsUnlinked = nodeIsUnlinked || (!isPrimary && !!(ownerNode.valueTokenAssignments?.[activeThemeId]));

    // Resolve theme-effective token assignment logic
    const ta = getEffectiveTokenAssignment(logic, activeThemeId, isPrimary, tokenIsUnlinked);
    if (!ta) continue;
    if (!ta.rows || ta.rows.length === 0) continue;
    // Check if any rows are enabled with tokens
    const hasActiveRows = ta.rows.some(r => r.enabled && r.tokens.length > 0);
    if (!hasActiveRows) continue;

    // Build eval context for this node
    let ctx: TokenEvalContext;
    let detailed: DetailedTokenAssignResult;
    try {
      ctx = buildTokenEvalContextFromData(tokens, nodes, activeThemeId, primaryThemeId, logic.nodeId);
      detailed = evaluateTokenAssignmentDetailed(ta, ctx);
    } catch {
      continue; // Skip nodes that fail to evaluate
    }
    
    // Determine final result
    let finalResult: TokenAssignResult | null = null;
    if (ta.finalOutputVar) {
      const match = detailed.rowOutputs.find(ro => ro.outputName === ta.finalOutputVar && ro.result);
      finalResult = match?.result || null;
    } else {
      finalResult = detailed.finalResult;
    }

    if (!finalResult || finalResult.type === 'error') continue;

    // Build expression text from all active rows
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