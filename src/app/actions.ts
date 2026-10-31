// ─────────────────────────────────────────────────────────────
// Domain operations on the project. UI components call these; each one is a
// single undoable step (or a coalesced run of steps for drags).
// ─────────────────────────────────────────────────────────────
import type { Draft } from 'immer';
import {
  type CanvasNode, type ChannelRule, type ColorNode, type Edge, type NodeType, type PaletteNode, type PreviewSlot, type Project,
  type Space, type Theme, type XY, hasOutput, inputHandles, slugify, tokenHandle, uid,
} from '@/engine/model';
import { channelDefs, channelDef, infoToSpace, round } from '@/engine/color/spaces';
import {
  createColorNode, createNode, createTokenNode, makeEdge, uniqueName, valuesFromInfo,
} from '@/engine/defaults';
import { type ColorResult, outputColor, wouldCreateCycle } from '@/engine/compute';
import { paletteKeys } from '@/engine/palette';
import { getEditor } from './store';

const update = (recipe: (d: Draft<Project>) => void, key?: string) => getEditor().update(recipe, { key });
const nodeIn = (d: Draft<Project>, id: string) => d.nodes.find((n) => n.id === id);

export interface Connection { source: string; sourceHandle: string; target: string; targetHandle: string }

// ── Nodes ────────────────────────────────────────────────────
export function addNode(type: NodeType, position: XY): string {
  const { project } = getEditor();
  const node = createNode(type, position, project.nodes);
  update((d) => { d.nodes.push(node as Draft<CanvasNode>); });
  getEditor().select([node.id]);
  return node.id;
}

/** Create a node already wired to an output (drag from a handle into empty space). */
export function addConnectedNode(from: { nodeId: string; handle: string }, type: NodeType, position: XY): string | null {
  const state = getEditor();
  const { project, result } = state;
  const sourceColor = outputColor(result.nodes[from.nodeId], from.handle);
  const source = project.nodes.find((n) => n.id === from.nodeId);
  if (!source) return null;

  let node: CanvasNode;
  let targetHandle: string;
  if (type === 'color') {
    const space: Space = source.type === 'color' ? source.data.space : 'oklch';
    node = createColorNode({
      name: uniqueName(project.nodes, `${source.name} ${from.handle !== 'out' ? '' : 'variant'}`.trim()),
      position, space,
      values: sourceColor ? valuesFromInfo(space, sourceColor) : undefined,
    });
    targetHandle = 'in';
  } else if (type === 'token') {
    node = createTokenNode({ name: uniqueName(project.nodes, `color/${slugify(source.name)}`), position });
    targetHandle = tokenHandle(state.themeId);
  } else {
    node = createNode(type, position, project.nodes);
    targetHandle = type === 'mix' ? 'a' : type === 'contrast' ? 'bg' : 'in';
  }
  update((d) => {
    d.nodes.push(node as Draft<CanvasNode>);
    d.edges.push(makeEdge(from.nodeId, from.handle, node.id, targetHandle));
  });
  getEditor().select([node.id]);
  return node.id;
}

export function deleteNodes(ids: string[]) {
  if (!ids.length) return;
  const gone = new Set(ids);
  update((d) => {
    d.nodes = d.nodes.filter((n) => !gone.has(n.id));
    d.edges = d.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target));
    for (const [slot, id] of Object.entries(d.preview.bindings)) if (id && gone.has(id)) delete d.preview.bindings[slot as PreviewSlot];
  });
  getEditor().select([]);
}

export function deleteSelection() {
  const { selection, edgeSelection } = getEditor();
  if (selection.length) deleteNodes(selection);
  else if (edgeSelection.length) removeEdges(edgeSelection);
}

/** Copy nodes (and the edges between them) with fresh ids and names. */
function cloneNodes(project: Project, sources: CanvasNode[], edges: Edge[], offset: XY) {
  const idMap = new Map<string, string>();
  const taken = [...project.nodes];
  const nodes = sources.map((n) => {
    const id = uid('n_');
    idMap.set(n.id, id);
    const name = n.type === 'note' ? n.name : uniqueName(taken, n.name);
    const copy = { ...structuredClone(n), id, name, position: { x: n.position.x + offset.x, y: n.position.y + offset.y } } as CanvasNode;
    taken.push(copy);
    return copy;
  });
  const newEdges = edges
    .filter((e) => idMap.has(e.target))
    .map((e) => ({ ...e, id: uid('e_'), source: idMap.get(e.source) ?? e.source, target: idMap.get(e.target)! }))
    .filter((e) => project.nodes.some((n) => n.id === e.source) || [...idMap.values()].includes(e.source));
  return { nodes, edges: newEdges };
}

export function duplicateNodes(ids: string[]) {
  const { project } = getEditor();
  const sources = project.nodes.filter((n) => ids.includes(n.id));
  if (!sources.length) return;
  const { nodes, edges } = cloneNodes(project, sources, project.edges.filter((e) => ids.includes(e.target)), { x: 48, y: 48 });
  update((d) => {
    d.nodes.push(...(nodes as Draft<CanvasNode>[]));
    d.edges.push(...edges);
  });
  getEditor().select(nodes.map((n) => n.id));
}

let clipboard: { nodes: CanvasNode[]; edges: Edge[]; themeIds: string[] } | null = null;

export function copyNodes(ids: string[]) {
  const { project } = getEditor();
  const nodes = project.nodes.filter((n) => ids.includes(n.id));
  if (!nodes.length) return false;
  clipboard = {
    nodes: structuredClone(nodes),
    edges: structuredClone(project.edges.filter((e) => ids.includes(e.target))),
    themeIds: project.themes.map((t) => t.id),
  };
  return true;
}

export function pasteNodes(at?: XY) {
  if (!clipboard) return;
  const { project } = getEditor();
  const minX = Math.min(...clipboard.nodes.map((n) => n.position.x));
  const minY = Math.min(...clipboard.nodes.map((n) => n.position.y));
  const offset = at ? { x: at.x - minX, y: at.y - minY } : { x: 48, y: 48 };
  // Token inputs are per theme; map them by theme position when pasting into another canvas.
  const themeMap = new Map(clipboard.themeIds.map((id, i) => [id, project.themes[i]?.id]));
  const remapped = clipboard.edges.map((e) => {
    if (!e.targetHandle.startsWith('t:')) return e;
    const mapped = themeMap.get(e.targetHandle.slice(2));
    return { ...e, targetHandle: mapped ? tokenHandle(mapped) : '' };
  }).filter((e) => e.targetHandle);
  const { nodes, edges } = cloneNodes(project, clipboard.nodes, remapped, offset);
  update((d) => {
    d.nodes.push(...(nodes as Draft<CanvasNode>[]));
    d.edges.push(...edges.filter((e) => {
      const target = d.nodes.find((n) => n.id === e.target);
      return d.nodes.some((n) => n.id === e.source) && !!target && inputHandles(target as CanvasNode, d.themes).includes(e.targetHandle)
        && !d.edges.some((x) => x.target === e.target && x.targetHandle === e.targetHandle);
    }));
  });
  getEditor().select(nodes.map((n) => n.id));
}

export const hasClipboard = () => !!clipboard;

export function moveNodes(moves: { id: string; position: XY }[]) {
  getEditor().update((d) => {
    for (const m of moves) {
      const n = nodeIn(d, m.id);
      if (n) n.position = { x: Math.round(m.position.x), y: Math.round(m.position.y) };
    }
  }, { key: `move:${moves.map((m) => m.id).join(',')}`, compute: false });
}

/** Rename a node; formulas that referenced the old name are updated too. */
export function renameNode(id: string, rawName: string) {
  const { project } = getEditor();
  const node = project.nodes.find((n) => n.id === id);
  if (!node) return;
  const name = node.type === 'note' ? rawName : uniqueName(project.nodes, rawName, id);
  const before = slugify(node.name);
  const after = slugify(name);
  update((d) => {
    const n = nodeIn(d, id);
    if (n) n.name = name;
    if (before === after) return;
    const re = new RegExp(`@${before.replace(/[-]/g, '\\-')}(?![A-Za-z0-9_-])`, 'gi');
    for (const other of d.nodes) {
      if (other.type !== 'color') continue;
      for (const rule of Object.values(other.data.rules)) {
        if (rule.mode === 'formula' && rule.expr) rule.expr = rule.expr.replace(re, `@${after}`);
      }
    }
  }, `rename:${id}`);
}

export function updateNodeData<T extends CanvasNode>(id: string, recipe: (data: Draft<T['data']>) => void, key?: string) {
  update((d) => {
    const n = nodeIn(d, id);
    if (n) recipe(n.data as Draft<T['data']>);
  }, key);
}

// ── Color channels ───────────────────────────────────────────
function shortestDelta(def: { wrap?: boolean }, value: number, parent: number) {
  if (!def.wrap) return value - parent;
  return ((((value - parent) % 360) + 540) % 360) - 180;
}

/** Drag a channel slider. Connected channels become offsets from the parent. */
export function setChannelValue(id: string, key: string, value: number) {
  const { project, result } = getEditor();
  const node = project.nodes.find((n) => n.id === id);
  if (!node || node.type !== 'color') return;
  const res = result.nodes[id] as ColorResult | undefined;
  const def = channelDef(node.data.space, key);
  if (!def) return;
  const trace = res?.channels.find((c) => c.key === key);
  const mode = node.data.rules[key]?.mode ?? 'inherit';
  if (mode === 'formula') return; // the formula drives this channel
  const asOffset = !!res?.parentId && (mode === 'inherit' || mode === 'offset') && trace?.parent !== undefined;
  update((d) => {
    const n = nodeIn(d, id) as Draft<ColorNode> | undefined;
    if (!n) return;
    if (asOffset) n.data.rules[key] = { mode: 'offset', delta: round(shortestDelta(def, value, trace!.parent!), def.decimals + 1) };
    else n.data.values[key] = round(value, def.decimals + 1);
  }, `channel:${id}:${key}`);
}

export function setChannelRule(id: string, key: string, rule: ChannelRule) {
  const { project, result } = getEditor();
  const node = project.nodes.find((n) => n.id === id);
  if (!node || node.type !== 'color') return;
  const res = result.nodes[id] as ColorResult | undefined;
  const trace = res?.channels.find((c) => c.key === key);
  const def = channelDef(node.data.space, key);
  let next: ChannelRule = { ...rule };
  if (next.mode === 'offset' && next.delta === undefined) {
    next.delta = trace?.parent !== undefined && def ? round(shortestDelta(def, trace.value, trace.parent), def.decimals + 1) : 0;
  }
  if (next.mode === 'formula' && next.expr === undefined) {
    next.expr = node.data.rules[key]?.expr ?? (res?.parentId ? `parent.${key}` : String(round(trace?.value ?? 0, 3)));
  }
  update((d) => {
    const n = nodeIn(d, id) as Draft<ColorNode> | undefined;
    if (!n) return;
    // Switching to Fixed keeps the color exactly where it is right now.
    if (next.mode === 'fixed' && trace) n.data.values[key] = trace.value;
    n.data.rules[key] = next as Draft<ChannelRule>;
  }, next.mode === 'formula' ? `formula:${id}:${key}` : undefined);
}

/** Change a color node's space while keeping its current color and its relationships. */
export function setColorSpace(id: string, space: Space) {
  const { project, result } = getEditor();
  const node = project.nodes.find((n) => n.id === id);
  const res = result.nodes[id];
  if (!node || node.type !== 'color' || node.data.space === space || res?.type !== 'color') return;
  const values = valuesFromInfo(space, res.color);
  const parentEdge = project.edges.find((e) => e.target === id && e.targetHandle === 'in');
  const parentInfo = parentEdge ? outputColor(result.nodes[parentEdge.source], parentEdge.sourceHandle) : null;
  const parentValues = parentInfo ? infoToSpace(space, parentInfo) : null;
  update((d) => {
    const n = nodeIn(d, id) as Draft<ColorNode> | undefined;
    if (!n) return;
    const old = n.data.rules;
    const rules: Record<string, ChannelRule> = {};
    const anyOld = (mode: ChannelRule['mode']) => Object.entries(old).some(([k, r]) => k !== 'alpha' && r.mode === mode);
    for (const def of channelDefs(space, false)) {
      if (!parentValues) {
        if (anyOld('formula')) rules[def.key] = { mode: 'fixed' };
        continue;
      }
      // Channels don't map 1:1 between spaces, so carry over the overall intent.
      if (anyOld('offset') || anyOld('fixed') || anyOld('formula')) {
        rules[def.key] = { mode: 'offset', delta: round(shortestDelta(def, values[def.key], parentValues[def.key]), def.decimals + 1) };
      } else {
        rules[def.key] = { mode: 'inherit' };
      }
    }
    if (old.alpha) rules.alpha = old.alpha;
    n.data.space = space;
    n.data.values = values;
    n.data.rules = rules;
  });
}

/** Switch a palette's space, converting its base hue/chroma so the palette keeps its character. */
export function setPaletteSpace(id: string, space: PaletteNode['data']['space']) {
  const { project, result } = getEditor();
  const node = project.nodes.find((n) => n.id === id);
  const res = result.nodes[id];
  if (!node || node.type !== 'palette' || node.data.space === space || res?.type !== 'palette') return;
  const mid = res.shades[Math.floor(res.shades.length / 2)]?.color ?? res.base;
  const keys = paletteKeys(space);
  const v = infoToSpace(space, mid);
  const scale = (c: number) => {
    // Rough unit conversion for the manual chroma endpoints.
    const from = node.data.space === 'oklch' ? 0.4 : node.data.space === 'hct' ? 150 : 100;
    const to = space === 'oklch' ? 0.4 : space === 'hct' ? 150 : 100;
    return round((c / from) * to, space === 'oklch' ? 3 : 1);
  };
  update((d) => {
    const n = nodeIn(d, id) as Draft<PaletteNode> | undefined;
    if (!n) return;
    n.data.space = space;
    n.data.hue = round(v[keys.h], 1);
    n.data.chroma = round(v[keys.c], space === 'oklch' ? 3 : 1);
    n.data.chromaStart = scale(n.data.chromaStart);
    n.data.chromaEnd = scale(n.data.chromaEnd);
  });
}

// ── Edges ────────────────────────────────────────────────────
export function canConnect(c: Connection): boolean {
  const { project } = getEditor();
  const source = project.nodes.find((n) => n.id === c.source);
  const target = project.nodes.find((n) => n.id === c.target);
  if (!source || !target || source.id === target.id) return false;
  if (!hasOutput(source.type)) return false;
  if (!inputHandles(target, project.themes).includes(c.targetHandle)) return false;
  const others = project.edges.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle));
  return !wouldCreateCycle(others, c.source, c.target);
}

export function connect(c: Connection) {
  if (!canConnect(c)) return;
  update((d) => {
    d.edges = d.edges.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle));
    d.edges.push(makeEdge(c.source, c.sourceHandle, c.target, c.targetHandle));
  });
}

export function removeEdges(ids: string[]) {
  const gone = new Set(ids);
  update((d) => { d.edges = d.edges.filter((e) => !gone.has(e.id)); });
  getEditor().select([], []);
}

export function disconnectInput(nodeId: string, handle: string) {
  update((d) => { d.edges = d.edges.filter((e) => !(e.target === nodeId && e.targetHandle === handle)); });
}

// ── Themes ───────────────────────────────────────────────────
export function addTheme(name: string, dark: boolean): string {
  const theme: Theme = { id: uid('th_'), name, dark };
  update((d) => { d.themes.push(theme); });
  getEditor().setTheme(theme.id);
  return theme.id;
}

export function updateTheme(id: string, patch: Partial<Omit<Theme, 'id'>>) {
  update((d) => {
    const t = d.themes.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  }, `theme:${id}`);
}

export function removeTheme(id: string) {
  const { project } = getEditor();
  if (project.themes.length <= 1) return;
  update((d) => {
    d.themes = d.themes.filter((t) => t.id !== id);
    d.edges = d.edges.filter((e) => e.targetHandle !== tokenHandle(id));
  });
}

/** Make a theme the primary one (first); other themes fall back to it. */
export function makePrimaryTheme(id: string) {
  update((d) => {
    const i = d.themes.findIndex((t) => t.id === id);
    if (i > 0) d.themes.unshift(...d.themes.splice(i, 1));
  });
}

// ── Project ──────────────────────────────────────────────────
export function renameProject(name: string) {
  update((d) => { d.name = name.trim() || 'Untitled canvas'; }, 'project-name');
}

export function setPreviewBinding(slot: PreviewSlot, tokenId: string | null) {
  update((d) => {
    if (tokenId) d.preview.bindings[slot] = tokenId;
    else delete d.preview.bindings[slot];
  });
}

export function setViewport(viewport: Project['viewport']) {
  getEditor().update((d) => { d.viewport = viewport; }, { history: false, compute: false });
}

export function selectAll() {
  const { project } = getEditor();
  getEditor().select(project.nodes.map((n) => n.id));
}
