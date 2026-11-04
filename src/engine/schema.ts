// Validation for projects coming from IndexedDB, imported files and share links.
// Anything unknown or malformed is dropped or replaced with a sensible default.
import {
  type CanvasNode, type ChannelRule, type Edge, type PreviewSlot, type Project, type Theme, type Viewport,
  PREVIEW_SLOTS, hasOutput, inputHandles, isHtmlDoc, uid,
} from './model';
import {
  createColorNode, createContrastNode, createHtmlNode, createMixNode, createNoteNode, createPaletteNode, createSectionNode, createTokenNode,
  defaultThemes,
} from './defaults';
import { wouldCreateCycle } from './compute';
import { SPACES, type Space, channelDefs } from './color/spaces';
import { MIX_SPACES } from './color/mix';
import { CURVES, NAMINGS } from './palette';
import { parseHex } from './color/convert';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const nonEmpty = (v: unknown): v is string => isStr(v) && v.trim().length > 0;
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
const clampNum = (v: unknown, lo: number, hi: number, fallback: number) => (isNum(v) ? Math.min(Math.max(v, lo), hi) : fallback);
const hexOr = (v: unknown, fallback: string) => (isStr(v) && parseHex(v) ? v : fallback);

const SPACE_KEYS = Object.keys(SPACES) as Space[];
const PALETTE_SPACES = ['oklch', 'hct', 'hsl'] as const;
const RULE_MODES = ['inherit', 'offset', 'fixed', 'formula'] as const;
const CHROMA_MODES = ['constant', 'taper', 'manual'] as const;
const NOTE_TONES = ['neutral', 'yellow', 'blue', 'green', 'pink', 'purple'] as const;
const MIX_KEYS = Object.keys(MIX_SPACES) as (keyof typeof MIX_SPACES)[];
const CURVE_KEYS = Object.keys(CURVES) as (keyof typeof CURVES)[];
const NAMING_KEYS = Object.keys(NAMINGS) as (keyof typeof NAMINGS)[];

function normalizeRule(v: unknown): ChannelRule | null {
  if (!isObj(v) || !(RULE_MODES as readonly unknown[]).includes(v.mode)) return null;
  const rule: ChannelRule = { mode: v.mode as ChannelRule['mode'] };
  if (isNum(v.delta)) rule.delta = v.delta;
  // One newline convention, so editor and evaluator offsets always agree.
  if (isStr(v.expr)) rule.expr = v.expr.replace(/\r\n?/g, '\n');
  return rule;
}

function normalizeNode(raw: unknown): CanvasNode | null {
  if (!isObj(raw) || !nonEmpty(raw.id)) return null;
  const pos = raw.position;
  if (!isObj(pos) || !isNum(pos.x) || !isNum(pos.y)) return null;
  const id = raw.id;
  const position = { x: pos.x, y: pos.y };
  const name = isStr(raw.name) ? raw.name : undefined;
  const d: Obj = isObj(raw.data) ? raw.data : {};

  switch (raw.type) {
    case 'color': {
      const space = pick(d.space, SPACE_KEYS, 'oklch');
      const base = createColorNode({ id, name: name ?? 'Color', position, space });
      const defs = channelDefs(space);
      const values = { ...base.data.values };
      const rawValues = isObj(d.values) ? d.values : {};
      for (const def of defs) if (isNum(rawValues[def.key])) values[def.key] = rawValues[def.key] as number;
      const rules: Record<string, ChannelRule> = {};
      const rawRules = isObj(d.rules) ? d.rules : {};
      for (const def of defs) {
        const rule = normalizeRule(rawRules[def.key]);
        if (rule) rules[def.key] = rule;
      }
      return { ...base, data: { space, values, rules } };
    }
    case 'palette': {
      const base = createPaletteNode({ id, name: name ?? 'Palette', position });
      const b = base.data;
      return {
        ...base,
        data: {
          space: pick(d.space, PALETTE_SPACES, b.space),
          hue: isNum(d.hue) ? d.hue : b.hue,
          chroma: isNum(d.chroma) ? Math.max(0, d.chroma) : b.chroma,
          steps: Math.round(clampNum(d.steps, 2, 24, b.steps)),
          naming: pick(d.naming, NAMING_KEYS, b.naming),
          lightStart: clampNum(d.lightStart, 0, 100, b.lightStart),
          lightEnd: clampNum(d.lightEnd, 0, 100, b.lightEnd),
          curve: pick(d.curve, CURVE_KEYS, b.curve),
          chromaMode: pick(d.chromaMode, CHROMA_MODES, b.chromaMode),
          chromaStart: isNum(d.chromaStart) ? Math.max(0, d.chromaStart) : b.chromaStart,
          chromaEnd: isNum(d.chromaEnd) ? Math.max(0, d.chromaEnd) : b.chromaEnd,
          hueShift: clampNum(d.hueShift, -180, 180, b.hueShift),
        },
      };
    }
    case 'mix': {
      const base = createMixNode({ id, name: name ?? 'Mix', position });
      return {
        ...base,
        data: {
          space: pick(d.space, MIX_KEYS, base.data.space),
          ratio: clampNum(d.ratio, 0, 1, base.data.ratio),
          a: hexOr(d.a, base.data.a),
          b: hexOr(d.b, base.data.b),
        },
      };
    }
    case 'contrast': {
      const base = createContrastNode({ id, name: name ?? 'Contrast', position });
      return {
        ...base,
        data: {
          fg: hexOr(d.fg, base.data.fg),
          bg: hexOr(d.bg, base.data.bg),
          sample: isStr(d.sample) ? d.sample : base.data.sample,
        },
      };
    }
    case 'token': {
      const base = createTokenNode({ id, name: name ?? 'color/token', position });
      return { ...base, data: { description: isStr(d.description) ? d.description : '' } };
    }
    case 'note': {
      const base = createNoteNode({ id, position });
      return {
        ...base,
        name: name ?? base.name,
        data: {
          text: isStr(d.text) ? d.text : base.data.text,
          tone: pick(d.tone, NOTE_TONES, base.data.tone),
          width: clampNum(d.width, 120, 1200, base.data.width),
        },
      };
    }
    case 'section': {
      const base = createSectionNode({ id, name: name ?? 'Section', position });
      return {
        ...base,
        data: {
          width: Math.round(clampNum(d.width, 160, 8000, base.data.width)),
          height: Math.round(clampNum(d.height, 120, 8000, base.data.height)),
          tone: pick(d.tone, NOTE_TONES, base.data.tone),
        },
      };
    }
    case 'html': {
      if (!isHtmlDoc(d.doc)) return null;
      const base = createHtmlNode({ id, name, position, doc: d.doc });
      return {
        ...base,
        data: {
          doc: d.doc,
          width: Math.round(clampNum(d.width, 240, 4000, base.data.width)),
          height: Math.round(clampNum(d.height, 160, 4000, base.data.height)),
        },
      };
    }
    default:
      return null;
  }
}

function normalizeThemes(raw: unknown): Theme[] {
  const themes: Theme[] = [];
  const ids = new Set<string>();
  if (Array.isArray(raw)) {
    for (const t of raw) {
      if (!isObj(t)) continue;
      let id = nonEmpty(t.id) ? t.id : uid('th_');
      if (ids.has(id)) id = uid('th_');
      ids.add(id);
      themes.push({ id, name: nonEmpty(t.name) ? t.name : `Theme ${themes.length + 1}`, dark: t.dark === true });
    }
  }
  return themes.length ? themes : defaultThemes();
}

function validSourceHandle(node: CanvasNode, handle: string): boolean {
  if (!hasOutput(node.type)) return false;
  if (node.type === 'palette') {
    if (handle === 'out') return true;
    // Shades beyond the current step count are kept: raising the count reconnects them.
    return /^s\d+$/.test(handle);
  }
  return handle === 'out';
}

function normalizeEdges(raw: unknown, nodes: CanvasNode[], themes: Theme[]): Edge[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let edges: Edge[] = [];
  const ids = new Set<string>();
  for (const e of raw) {
    if (!isObj(e) || !isStr(e.source) || !isStr(e.target)) continue;
    const source = byId.get(e.source);
    const target = byId.get(e.target);
    if (!source || !target) continue;
    const sourceHandle = isStr(e.sourceHandle) ? e.sourceHandle : 'out';
    const handles = inputHandles(target, themes);
    const targetHandle = isStr(e.targetHandle) ? e.targetHandle : handles.length === 1 ? handles[0] : '';
    if (!handles.includes(targetHandle) || !validSourceHandle(source, sourceHandle)) continue;

    // One edge per input: a later edge replaces an earlier one, unless it would form a loop.
    const others = edges.filter((x) => !(x.target === target.id && x.targetHandle === targetHandle));
    if (wouldCreateCycle(others, source.id, target.id)) continue;
    let id = nonEmpty(e.id) ? e.id : uid('e_');
    if (ids.has(id)) id = uid('e_');
    ids.add(id);
    edges = [...others, { id, source: source.id, sourceHandle, target: target.id, targetHandle }];
  }
  return edges;
}

export function normalizeProject(input: unknown): Project {
  if (!isObj(input) || !Array.isArray(input.nodes)) throw new Error('This file is not a 0colors project.');
  if (input.schema !== undefined && input.schema !== 2) {
    throw new Error(`This project uses an unsupported format (schema ${String(input.schema)}).`);
  }
  const now = Date.now();
  const themes = normalizeThemes(input.themes);

  const nodes: CanvasNode[] = [];
  const nodeIds = new Set<string>();
  for (const raw of input.nodes) {
    const node = normalizeNode(raw);
    if (!node || nodeIds.has(node.id)) continue;
    nodeIds.add(node.id);
    nodes.push(node);
  }

  const edges = normalizeEdges(input.edges, nodes, themes);

  const bindings: Partial<Record<PreviewSlot, string>> = {};
  const rawBindings = isObj(input.preview) && isObj(input.preview.bindings) ? input.preview.bindings : {};
  for (const slot of PREVIEW_SLOTS) {
    const id = rawBindings[slot];
    if (isStr(id) && nodes.some((n) => n.id === id && n.type === 'token')) bindings[slot] = id;
  }

  const vp = input.viewport;
  const viewport: Viewport | undefined =
    isObj(vp) && isNum(vp.x) && isNum(vp.y) && isNum(vp.zoom) && vp.zoom > 0 ? { x: vp.x, y: vp.y, zoom: vp.zoom } : undefined;

  return {
    schema: 2,
    id: nonEmpty(input.id) ? input.id : uid('p_'),
    name: nonEmpty(input.name) ? input.name : 'Untitled canvas',
    createdAt: isNum(input.createdAt) ? input.createdAt : now,
    updatedAt: isNum(input.updatedAt) ? input.updatedAt : now,
    themes,
    nodes,
    edges,
    preview: { bindings },
    ...(viewport ? { viewport } : {}),
  };
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}
