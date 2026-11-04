// ─────────────────────────────────────────────────────────────
// Graph evaluation. Resolves every node for one theme, following edges and
// formula @references depth-first, with cycle protection. Every color channel
// records a trace so the UI can explain exactly how a value was produced.
// ─────────────────────────────────────────────────────────────
import {
  type CanvasNode, type ColorNode, type Edge, type NodeType, type PaletteNode, type Project, type RuleMode,
  type Theme, isAnnotation, slugify, tokenHandle,
} from './model';
import {
  type ChannelValues, type ColorInfo, type Space, channelDefs, constrainChannel, describe, infoToSpace, spaceToRgb,
} from './color/spaces';
import { compositeOver, lerp, parseHex } from './color/convert';
import { apcaContrast, wcagContrast } from './color/contrast';
import { mixRgb } from './color/mix';
import { type ColorRef, type EvalResult, type FormulaEnv, FormulaError, collectRefs, evaluateFormula, parseCached } from './formula';
import { type Shade, generatePalette, paletteKeys } from './palette';

export interface ChannelTrace {
  key: string;
  /** 'root' = node has no input, the channel uses its own value. */
  mode: RuleMode | 'root';
  value: number;
  raw: number;
  adjusted: 'clamp' | 'wrap' | null;
  parent?: number;
  delta?: number;
  expr?: string;
  explain?: Pick<EvalResult, 'lookups' | 'substituted' | 'steps'>;
  error?: { message: string; start: number; end: number };
}

export interface ColorResult {
  type: 'color';
  color: ColorInfo;
  space: Space;
  values: ChannelValues;
  channels: ChannelTrace[];
  parentId: string | null;
  parentLabel: string | null;
  warnings: string[];
}

export interface PaletteResult {
  type: 'palette';
  space: PaletteNode['data']['space'];
  base: ColorInfo;
  baseFromInput: boolean;
  shades: Shade[];
}

export interface MixResult {
  type: 'mix';
  color: ColorInfo;
  a: ColorInfo;
  b: ColorInfo;
  aConnected: boolean;
  bConnected: boolean;
}

export interface ContrastResult {
  type: 'contrast';
  fg: ColorInfo;
  bg: ColorInfo;
  /** The text color as actually seen (alpha composited over the background). */
  seen: ColorInfo;
  fgConnected: boolean;
  bgConnected: boolean;
  wcag: number;
  apca: number;
}

export interface ChainLink { nodeId: string; label: string; type: NodeType }

export interface TokenResult {
  type: 'token';
  color: ColorInfo | null;
  /** True when this theme has no input of its own and uses the primary theme's. */
  inherited: boolean;
  source: { nodeId: string; handle: string; label: string } | null;
  /** This token → aliased tokens → the primitive that provides the value. */
  chain: ChainLink[];
}

export interface NoteResult { type: 'note' }
export interface SectionResult { type: 'section' }
export interface HtmlResult { type: 'html' }

export type NodeResult = ColorResult | PaletteResult | MixResult | ContrastResult | TokenResult | NoteResult | SectionResult | HtmlResult;

export interface ComputeResult {
  themeId: string;
  nodes: Record<string, NodeResult>;
  /** Formula dependencies: `source` is referenced by a formula on `target`. */
  refs: { id: string; source: string; target: string }[];
}

const WHITE = describe({ r: 1, g: 1, b: 1 });
const shadeIndex = (handle: string) => /^s\d+$/.test(handle) ? Number(handle.slice(1)) : -1;

export function hexInfo(hex: string, fallback = WHITE): ColorInfo {
  const parsed = parseHex(hex);
  return parsed ? describe(parsed.rgb, parsed.alpha) : fallback;
}

/** The color a node emits on a given output handle. */
export function outputColor(result: NodeResult | undefined | null, handle = 'out'): ColorInfo | null {
  if (!result) return null;
  switch (result.type) {
    case 'color':
    case 'mix':
    case 'token':
      return handle === 'out' ? result.color : null;
    case 'palette':
      if (handle === 'out') return result.base;
      return result.shades[shadeIndex(handle)]?.color ?? null;
    default:
      return null;
  }
}

/** Exact channel values behind an output, when it natively lives in a space. */
export function outputNative(result: NodeResult | undefined | null, handle = 'out'): { space: Space; values: ChannelValues } | undefined {
  if (!result) return undefined;
  if (result.type === 'color' && handle === 'out') return { space: result.space, values: result.values };
  if (result.type === 'palette' && handle !== 'out') {
    const shade = result.shades[shadeIndex(handle)];
    return shade ? { space: result.space, values: shade.values } : undefined;
  }
  return undefined;
}

export function outputLabel(node: CanvasNode | undefined, handle: string, result?: NodeResult | null): string {
  if (!node) return 'missing';
  if (node.type === 'palette' && shadeIndex(handle) >= 0) {
    const shade = result?.type === 'palette' ? result.shades[shadeIndex(handle)] : undefined;
    return `${node.name} ${shade?.name ?? handle.slice(1)}`;
  }
  return node.name;
}

const edgeKey = (target: string, handle: string) => `${target}\u0000${handle}`;

export function computeProject(project: Project, themeId?: string, previous?: ComputeResult | null): ComputeResult {
  const themes: Theme[] = project.themes.length ? project.themes : [{ id: 'default', name: 'Default', dark: false }];
  const theme = themes.find((t) => t.id === themeId) ?? themes[0];
  const primary = themes[0];

  const byId = new Map<string, CanvasNode>(project.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, Edge>();
  for (const e of project.edges) {
    if (byId.has(e.source) && byId.has(e.target)) incoming.set(edgeKey(e.target, e.targetHandle), e);
  }
  const bySlug = new Map<string, string>();
  for (const n of project.nodes) {
    if (isAnnotation(n.type)) continue;
    const s = slugify(n.name);
    if (!bySlug.has(s)) bySlug.set(s, n.id);
  }

  // Imported ids are arbitrary strings, including Object.prototype property names.
  const results: Record<string, NodeResult> = Object.create(null);
  const visiting = new Set<string>();

  const resolve = (id: string): NodeResult | null => {
    const done = results[id];
    if (done) return done;
    const node = byId.get(id);
    if (!node || visiting.has(id)) return null;
    visiting.add(id);
    try {
      const r = computeNode(node);
      results[id] = r;
      return r;
    } finally {
      visiting.delete(id);
    }
  };

  interface Input { edge: Edge; color: ColorInfo | null; native?: { space: Space; values: ChannelValues }; label: string; cycle: boolean }
  const input = (nodeId: string, handle: string): Input | null => {
    const edge = incoming.get(edgeKey(nodeId, handle));
    if (!edge) return null;
    const src = resolve(edge.source);
    return {
      edge,
      color: outputColor(src, edge.sourceHandle),
      native: outputNative(src, edge.sourceHandle),
      label: outputLabel(byId.get(edge.source), edge.sourceHandle, src),
      cycle: src === null,
    };
  };

  const refFor = (owner: CanvasNode, name: string): ColorRef => {
    const fail = (msg: string) => new FormulaError(msg);
    const id = bySlug.get(name);
    if (!id) throw fail(`No node named @${name}`);
    if (id === owner.id) throw fail(`@${name} is this node — use self instead`);
    const r = resolve(id);
    if (!r) throw fail(`Circular reference: @${name} depends on this node`);
    const info = outputColor(r, 'out');
    if (!info) throw fail(`@${name} does not output a color`);
    return { info, native: outputNative(r, 'out'), label: `@${name}` };
  };

  function computeColor(node: ColorNode): ColorResult {
    const { space } = node.data;
    const defs = channelDefs(space);
    const warnings: string[] = [];
    const parentIn = input(node.id, 'in');
    if (parentIn?.cycle) warnings.push('Input is part of a loop, so it is ignored.');
    const parent = parentIn?.color ?? null;

    let parentValues: ChannelValues | null = null;
    if (parent) {
      parentValues = parentIn?.native?.space === space ? { ...parentIn.native.values } : infoToSpace(space, parent);
      parentValues.alpha = parent.alpha * 100;
    }

    const own: ChannelValues = {};
    for (const def of defs) own[def.key] = constrainChannel(def, node.data.values[def.key] ?? (def.key === 'alpha' ? 100 : 0));

    let selfRef: ColorRef | null = null;
    const env = (channel: string): FormulaEnv => ({
      space,
      channel,
      parent: parent && parentValues ? { info: parent, native: { space, values: parentValues }, label: 'parent' } : null,
      get self() {
        if (!selfRef) {
          const { rgb, inGamut } = spaceToRgb(space, own);
          selfRef = { info: describe(rgb, own.alpha / 100, inGamut), native: { space, values: own }, label: 'self' };
        }
        return selfRef;
      },
      dark: theme.dark,
      ref: (name) => refFor(node, name),
    });

    const values: ChannelValues = {};
    const channels: ChannelTrace[] = defs.map((def) => {
      const rule = node.data.rules[def.key];
      let mode: ChannelTrace['mode'] = rule?.mode ?? 'inherit';
      if (!parentValues && mode !== 'formula') mode = 'root';
      const trace: Partial<ChannelTrace> = {};
      let raw: number;
      switch (mode) {
        case 'inherit':
          raw = parentValues![def.key];
          trace.parent = raw;
          break;
        case 'offset':
          trace.parent = parentValues![def.key];
          trace.delta = rule?.delta ?? 0;
          raw = trace.parent + trace.delta;
          break;
        case 'formula': {
          const expr = rule?.expr ?? '';
          trace.expr = expr;
          if (parentValues) trace.parent = parentValues[def.key];
          try {
            const r = evaluateFormula(expr, env(def.key));
            raw = r.value;
            trace.explain = { lookups: r.lookups, substituted: r.substituted, steps: r.steps };
          } catch (err) {
            const e = err instanceof FormulaError ? err : new FormulaError(String(err));
            trace.error = { message: e.message, start: e.start, end: e.end };
            if (e.steps) trace.explain = { lookups: [], substituted: '', steps: e.steps };
            raw = parentValues?.[def.key] ?? own[def.key];
          }
          break;
        }
        default:
          raw = own[def.key];
      }
      const value = constrainChannel(def, raw);
      values[def.key] = value;
      const adjusted = Math.abs(value - raw) > 1e-9 ? (def.wrap ? 'wrap' : 'clamp') : null;
      return { key: def.key, mode, value, raw, adjusted, ...trace };
    });

    const { rgb, inGamut } = spaceToRgb(space, values);
    return {
      type: 'color',
      color: describe(rgb, values.alpha / 100, inGamut),
      space,
      values,
      channels,
      parentId: parent ? parentIn!.edge.source : null,
      parentLabel: parent ? parentIn!.label : null,
      warnings,
    };
  }

  function computePalette(node: PaletteNode): PaletteResult {
    const { data } = node;
    const keys = paletteKeys(data.space);
    const inp = input(node.id, 'in');
    let base = { hue: data.hue, chroma: data.chroma };
    if (inp?.color) {
      const v = inp.native?.space === data.space ? inp.native.values : infoToSpace(data.space, inp.color);
      base = { hue: v[keys.h], chroma: v[keys.c] };
    }
    const shades = generatePalette(data, base);
    return {
      type: 'palette',
      space: data.space,
      base: inp?.color ?? shades[Math.floor(shades.length / 2)].color,
      baseFromInput: !!inp?.color,
      shades,
    };
  }

  function computeNode(node: CanvasNode): NodeResult {
    switch (node.type) {
      case 'color':
        return computeColor(node);
      case 'palette':
        return computePalette(node);
      case 'mix': {
        const ia = input(node.id, 'a');
        const ib = input(node.id, 'b');
        const a = ia?.color ?? hexInfo(node.data.a);
        const b = ib?.color ?? hexInfo(node.data.b);
        const t = Math.min(Math.max(node.data.ratio, 0), 1);
        const mixed = mixRgb(a.rgb, b.rgb, t, node.data.space);
        return {
          type: 'mix', color: describe(mixed.rgb, lerp(a.alpha, b.alpha, t), mixed.inGamut),
          a, b, aConnected: !!ia?.color, bConnected: !!ib?.color,
        };
      }
      case 'contrast': {
        const ifg = input(node.id, 'fg');
        const ibg = input(node.id, 'bg');
        const fg = ifg?.color ?? hexInfo(node.data.fg);
        const bg = ibg?.color ?? hexInfo(node.data.bg);
        const seenRgb = fg.alpha < 1 ? compositeOver(fg.rgb, fg.alpha, bg.rgb) : fg.rgb;
        return {
          type: 'contrast', fg, bg, seen: describe(seenRgb),
          fgConnected: !!ifg?.color, bgConnected: !!ibg?.color,
          wcag: wcagContrast(seenRgb, bg.rgb), apca: apcaContrast(seenRgb, bg.rgb),
        };
      }
      case 'token': {
        let inp = input(node.id, tokenHandle(theme.id));
        let inherited = false;
        if (!inp && theme.id !== primary.id) {
          inp = input(node.id, tokenHandle(primary.id));
          inherited = !!inp;
        }
        const self: ChainLink = { nodeId: node.id, label: node.name, type: 'token' };
        if (!inp || !inp.color) return { type: 'token', color: null, inherited, source: null, chain: [self] };
        const srcNode = byId.get(inp.edge.source)!;
        const srcResult = results[inp.edge.source];
        const chain = srcResult?.type === 'token'
          ? [self, ...srcResult.chain]
          : [self, { nodeId: srcNode.id, label: inp.label, type: srcNode.type }];
        return {
          type: 'token', color: inp.color, inherited,
          source: { nodeId: inp.edge.source, handle: inp.edge.sourceHandle, label: inp.label }, chain,
        };
      }
      case 'note':
        return { type: 'note' };
      case 'section':
        return { type: 'section' };
      case 'html':
        return { type: 'html' };
    }
  }

  for (const n of project.nodes) resolve(n.id);

  // Formula references, drawn as dashed "logic" edges on the canvas.
  const refs: ComputeResult['refs'] = [];
  const seen = new Set<string>();
  for (const n of project.nodes) {
    if (n.type !== 'color') continue;
    for (const rule of Object.values(n.data.rules)) {
      if (rule.mode !== 'formula' || !rule.expr) continue;
      let names: Set<string>;
      try { names = collectRefs(parseCached(rule.expr)); } catch { continue; }
      for (const name of names) {
        const src = bySlug.get(name);
        const id = `ref:${src}->${n.id}`;
        if (src && src !== n.id && !seen.has(id)) {
          seen.add(id);
          refs.push({ id, source: src, target: n.id });
        }
      }
    }
  }

  return reconcile(previous ?? null, { themeId: theme.id, nodes: results, refs });
}

/** Reuse unchanged result objects so React only re-renders nodes whose output changed. */
function reconcile(prev: ComputeResult | null, next: ComputeResult): ComputeResult {
  if (!prev || prev.themeId !== next.themeId) return next;
  let same = Object.keys(prev.nodes).length === Object.keys(next.nodes).length;
  for (const id of Object.keys(next.nodes)) {
    const old = prev.nodes[id];
    if (old && sameValue(old, next.nodes[id])) next.nodes[id] = old;
    else same = false;
  }
  const sameRefs = prev.refs.length === next.refs.length && prev.refs.every((r, i) => r.id === next.refs[i].id && r.source === next.refs[i].source && r.target === next.refs[i].target);
  if (sameRefs) next.refs = prev.refs;
  return same && sameRefs ? prev : next;
}

/** Compare the small plain result trees without allocating serialized copies on every edit. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const left = a as Record<string, unknown>; const right = b as Record<string, unknown>;
  let leftSize = 0; let rightSize = 0;
  for (const key in left) {
    if (!Object.hasOwn(left, key)) continue;
    leftSize++;
    if (!Object.hasOwn(right, key) || !sameValue(left[key], right[key])) return false;
  }
  for (const key in right) if (Object.hasOwn(right, key)) rightSize++;
  return leftSize === rightSize;
}

/** Compute every theme at once (tokens table, preview, export). */
export function computeAllThemes(project: Project): Record<string, ComputeResult> {
  const out: Record<string, ComputeResult> = Object.create(null);
  for (const t of project.themes) out[t.id] = computeProject(project, t.id);
  return out;
}

/** Would connecting source → target create a loop through edges? */
export function wouldCreateCycle(edges: Edge[], source: string, target: string): boolean {
  if (source === target) return true;
  const out = new Map<string, string[]>();
  for (const e of edges) {
    const targets = out.get(e.source);
    if (targets) targets.push(e.target);
    else out.set(e.source, [e.target]);
  }
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === source) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(out.get(id) ?? []));
  }
  return false;
}
