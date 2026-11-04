// ─────────────────────────────────────────────────────────────
// Domain operations on the project. UI components call these; each one is a
// single undoable step (or a coalesced run of steps for drags).
// ─────────────────────────────────────────────────────────────
import type { Draft } from 'immer';
import {
  type CanvasNode, type ChannelRule, type ColorNode, type Edge, type NodeType, type PaletteNode, type PreviewSlot, type Project,
  type SectionNode, type Space, type Theme, type XY, hasOutput, inputHandles, isAnnotation, slugify, tokenHandle, uid,
} from '@/engine/model';
import { channelDefs, channelDef, describe, infoToSpace, round } from '@/engine/color/spaces';
import { parseHex } from '@/engine/color/convert';
import {
  createColorNode, createNode, createSectionNode, createTokenNode, makeEdge, uniqueName, valuesFromInfo,
} from '@/engine/defaults';
import { type ColorResult, outputColor, outputLabel, wouldCreateCycle } from '@/engine/compute';
import type { ParsedColor } from '@/engine/color/parse';
import { normalizeProject } from '@/engine/schema';
import { paletteKeys } from '@/engine/palette';
import { type UpdateOptions, getEditor } from './store';

const update = (recipe: (d: Draft<Project>) => void, key?: string | UpdateOptions) =>
  getEditor().update(recipe, typeof key === 'object' ? key : { key });
const nodeIn = (d: Draft<Project>, id: string) => d.nodes.find((n) => n.id === id);
/** Escape every RegExp metacharacter, so a name can be matched literally. */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
/** Matches `@name` as a whole reference (not a prefix of a longer name). */
const refPattern = (slug: string) => new RegExp(`@${escapeRegExp(slug)}(?![A-Za-z0-9_-])`, 'gi');

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
    const name = isAnnotation(n.type) ? n.name : uniqueName(taken, n.name);
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

export function duplicateNodes(ids: string[], offset: XY = { x: 48, y: 48 }): string[] {
  const { project } = getEditor();
  const sources = project.nodes.filter((n) => ids.includes(n.id));
  if (!sources.length) return [];
  const { nodes, edges } = cloneNodes(project, sources, project.edges.filter((e) => ids.includes(e.target)), offset);
  update((d) => {
    d.nodes.push(...(nodes as Draft<CanvasNode>[]));
    d.edges.push(...edges);
  });
  getEditor().select(nodes.map((n) => n.id));
  return nodes.map((n) => n.id);
}

/**
 * ⌥-drag duplicates the way Figma does: the nodes under the pointer become the copies and travel,
 * while the originals stay put with their names, @references and downstream connections. Because
 * the drag is already holding the original ids, the copies are created in place and take over
 * the originals' identity (name, outgoing edges, preview bindings); the dragged nodes get fresh names.
 */
export function duplicateForAltDrag(ids: string[], gestureKey?: string) {
  const { project } = getEditor();
  const dragged = project.nodes.filter((n) => ids.includes(n.id));
  if (!dragged.length) return;
  const inSet = new Set(dragged.map((n) => n.id));
  const stay = new Map<string, string>(); // dragged id → id of the copy that stays behind
  for (const n of dragged) stay.set(n.id, uid('n_'));
  update((d) => {
    const taken: CanvasNode[] = [...(d.nodes as CanvasNode[])];
    for (const n of dragged) {
      const live = nodeIn(d, n.id);
      if (!live) continue;
      const copy = { ...structuredClone(n), id: stay.get(n.id)!, position: { ...n.position } } as CanvasNode;
      d.nodes.push(copy as Draft<CanvasNode>);
      taken.push(copy);
      if (!isAnnotation(n.type)) live.name = uniqueName(taken, n.name, n.id);
    }
    // Formulas inside the travelling group keep pointing at the travelling copies.
    const renamed = dragged
      .map((n) => ({ from: slugify(n.name), to: slugify(nodeIn(d, n.id)?.name ?? n.name) }))
      .filter((r) => r.from !== r.to);
    for (const n of d.nodes) {
      if (!inSet.has(n.id) || n.type !== 'color') continue;
      for (const rule of Object.values(n.data.rules)) {
        if (!rule.expr) continue;
        for (const r of renamed) rule.expr = rule.expr.replace(refPattern(r.from), `@${r.to}`);
      }
    }
    const next: Edge[] = [];
    for (const e of d.edges) {
      const fromSet = inSet.has(e.source);
      const toSet = inSet.has(e.target);
      if (fromSet && !toSet) {
        // Downstream links stay with the original.
        next.push({ ...e, source: stay.get(e.source)! });
      } else if (!fromSet && toSet) {
        // Both the original and the travelling copy keep their parents.
        next.push(e, { ...e, id: uid('e_'), target: stay.get(e.target)! });
      } else if (fromSet && toSet) {
        // Links inside the selection exist in both groups.
        next.push(e, { ...e, id: uid('e_'), source: stay.get(e.source)!, target: stay.get(e.target)! });
      } else next.push(e);
    }
    d.edges = next;
    for (const [slot, id] of Object.entries(d.preview.bindings)) {
      if (id && stay.has(id)) d.preview.bindings[slot as PreviewSlot] = stay.get(id)!;
    }
  }, { key: gestureKey, gesture: !!gestureKey });
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

/** Custom clipboard type, so nodes copied in one tab paste in another. */
export const CLIPBOARD_MIME = 'application/x-0colors-nodes';

/** What to put on the system clipboard for a copy: app data plus the copied colors as text. */
export function clipboardPayload(ids: string[]): { json: string; text: string } | null {
  if (!copyNodes(ids) || !clipboard) return null;
  const { result } = getEditor();
  const hexes = clipboard.nodes.map((n) => outputColor(result.nodes[n.id], 'out')?.hexa).filter((h): h is string => !!h);
  return { json: JSON.stringify({ format: '0colors/nodes', version: 1, ...clipboard }), text: hexes.join('\n') };
}

/** Paste nodes copied from any 0colors tab. Returns false if the data isn't ours. */
export function pasteClipboardJson(json: string, at?: XY): boolean {
  try {
    const data = JSON.parse(json) as { format?: string; nodes?: unknown[]; edges?: unknown[]; themeIds?: unknown[] };
    if (data.format !== '0colors/nodes' || !Array.isArray(data.nodes)) return false;
    const themeIds = Array.isArray(data.themeIds) ? data.themeIds.filter((t): t is string => typeof t === 'string') : [];
    // Run the payload through the same validation as imported files.
    const clean = normalizeProject({ nodes: data.nodes, edges: data.edges ?? [], themes: themeIds.map((id, i) => ({ id, name: `Theme ${i + 1}` })) });
    if (!clean.nodes.length) return false;
    clipboard = { nodes: clean.nodes, edges: clean.edges, themeIds: clean.themes.map((t) => t.id) };
    pasteNodes(at);
    return true;
  } catch {
    return false;
  }
}

/** Colors found in pasted text become color nodes, laid out in rows near `at` (one undo step). */
export function pasteColors(colors: ParsedColor[], at: XY): string[] {
  if (!colors.length) return [];
  const { project } = getEditor();
  const taken = [...project.nodes];
  const perRow = Math.min(6, colors.length);
  const w = 208 + 32;
  const h = 156 + 32;
  const origin = { x: Math.round(at.x - (perRow * w - 32) / 2), y: Math.round(at.y - 78) };
  const nodes = colors.slice(0, 48).map((c, i) => {
    const name = uniqueName(taken, c.name ? c.name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : `Pasted ${i + 1}`);
    const node = createColorNode({
      name, position: { x: origin.x + (i % perRow) * w, y: origin.y + Math.floor(i / perRow) * h },
      values: valuesFromInfo('oklch', describe(c.rgb, c.alpha)),
    });
    taken.push(node);
    return node;
  });
  update((d) => { d.nodes.push(...(nodes as Draft<CanvasNode>[])); });
  getEditor().select(nodes.map((n) => n.id));
  return nodes.map((n) => n.id);
}

/** Move nodes. Pass the same `gestureKey` for every step of one drag so it undoes as one step. */
export function moveNodes(moves: { id: string; position: XY }[], gestureKey?: string) {
  getEditor().update((d) => {
    for (const m of moves) {
      const n = nodeIn(d, m.id);
      const x = Math.round(m.position.x);
      const y = Math.round(m.position.y);
      // Untouched positions keep their identity, so a no-op move adds no history entry.
      if (n && (n.position.x !== x || n.position.y !== y)) n.position = { x, y };
    }
  }, { key: gestureKey ?? `move:${moves.map((m) => m.id).join(',')}`, compute: false, gesture: true });
}

/** Apply a resize from the canvas (sections: width + height; notes: width) as one undo step per gesture. */
export function resizeNodes(changes: { id: string; width?: number; height?: number; position?: XY }[]) {
  if (!changes.length) return;
  getEditor().update((d) => {
    for (const c of changes) {
      const n = nodeIn(d, c.id);
      if (!n) continue;
      if (c.position) n.position = { x: Math.round(c.position.x), y: Math.round(c.position.y) };
      if (n.type === 'section') {
        if (c.width !== undefined) n.data.width = Math.max(160, Math.round(c.width));
        if (c.height !== undefined) n.data.height = Math.max(120, Math.round(c.height));
      } else if (n.type === 'note' && c.width !== undefined) {
        n.data.width = Math.min(1200, Math.max(160, Math.round(c.width)));
      }
    }
  }, { key: `resize:${changes.map((c) => c.id).join(',')}`, compute: false, gesture: true });
}

export interface Rect { x: number; y: number; width: number; height: number }

/** Add a section around the given rectangles (flow coordinates), leaving room for its title. */
export function wrapInSection(rects: Rect[], name = 'Section'): string | null {
  if (!rects.length) return null;
  const pad = 40;
  const top = 64;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  const section = createSectionNode({
    name, position: { x: Math.round(minX - pad), y: Math.round(minY - top) },
    width: maxX - minX + pad * 2, height: maxY - minY + top + pad,
  });
  update((d) => { d.nodes.unshift(section as Draft<SectionNode>); });
  getEditor().select([section.id]);
  return section.id;
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-x' | 'distribute-y';

/** Align or evenly distribute nodes, given their current rectangles (one undo step). */
export function alignNodes(mode: AlignMode, rects: Record<string, Rect>) {
  const ids = Object.keys(rects);
  if (ids.length < 2) return;
  const list = ids.map((id) => ({ id, ...rects[id] }));
  const minX = Math.min(...list.map((r) => r.x));
  const minY = Math.min(...list.map((r) => r.y));
  const maxX = Math.max(...list.map((r) => r.x + r.width));
  const maxY = Math.max(...list.map((r) => r.y + r.height));
  const moves: { id: string; position: XY }[] = [];
  if (mode === 'distribute-x' || mode === 'distribute-y') {
    if (list.length < 3) return;
    const horizontal = mode === 'distribute-x';
    const sorted = [...list].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    const total = sorted.reduce((sum, r) => sum + (horizontal ? r.width : r.height), 0);
    const gap = ((horizontal ? maxX - minX : maxY - minY) - total) / (sorted.length - 1);
    let at = horizontal ? minX : minY;
    for (const r of sorted) {
      moves.push({ id: r.id, position: horizontal ? { x: at, y: r.y } : { x: r.x, y: at } });
      at += (horizontal ? r.width : r.height) + gap;
    }
  } else {
    for (const r of list) {
      const x = mode === 'left' ? minX : mode === 'center' ? (minX + maxX) / 2 - r.width / 2 : mode === 'right' ? maxX - r.width : r.x;
      const y = mode === 'top' ? minY : mode === 'middle' ? (minY + maxY) / 2 - r.height / 2 : mode === 'bottom' ? maxY - r.height : r.y;
      moves.push({ id: r.id, position: { x, y } });
    }
  }
  getEditor().breakCoalesce();
  moveNodes(moves);
  getEditor().breakCoalesce();
}

/** Rename a node; formulas that referenced the old name are updated too. */
export function renameNode(id: string, rawName: string) {
  const { project } = getEditor();
  const node = project.nodes.find((n) => n.id === id);
  if (!node) return;
  const name = isAnnotation(node.type) ? rawName : uniqueName(project.nodes, rawName, id);
  const before = slugify(node.name);
  const after = slugify(name);
  update((d) => {
    const n = nodeIn(d, id);
    if (n) n.name = name;
    // Notes, sections and frames have no @name, so formulas never point at them.
    if (before === after || isAnnotation(node.type)) return;
    const re = refPattern(before);
    for (const other of d.nodes) {
      if (other.type !== 'color') continue;
      for (const rule of Object.values(other.data.rules)) {
        if (rule.expr) rule.expr = rule.expr.replace(re, `@${after}`);
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

/**
 * Set a color node to an exact color (typed hex, eyedropper, paste) while keeping its relationships:
 * linked channels become offsets from the parent, fixed and root channels take the value, formulas stay.
 */
export function setColorHex(id: string, hex: string): boolean {
  const parsed = parseHex(hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`);
  return parsed ? setColorRgb(id, parsed.rgb, parsed.alpha, `hex:${id}`) : false;
}

/** Like setColorHex, from sRGB (0–1) — used by the eyedropper and the 2D picker on RGB nodes. */
export function setColorRgb(id: string, rgb: { r: number; g: number; b: number }, alpha?: number, key = `hex:${id}`): boolean {
  const { project, result } = getEditor();
  const node = project.nodes.find((n) => n.id === id);
  const res = result.nodes[id] as ColorResult | undefined;
  if (!node || node.type !== 'color' || res?.type !== 'color') return false;
  const values = valuesFromInfo(node.data.space, describe(rgb, alpha ?? res.color.alpha));
  update((d) => {
    const n = nodeIn(d, id) as Draft<ColorNode> | undefined;
    if (!n) return;
    for (const def of channelDefs(node.data.space)) {
      const trace = res.channels.find((c) => c.key === def.key);
      const mode = node.data.rules[def.key]?.mode ?? 'inherit';
      const target = values[def.key];
      if (target === undefined || mode === 'formula') continue;
      if (!res.parentId || mode === 'fixed' || trace?.parent === undefined) {
        n.data.values[def.key] = target;
        continue;
      }
      const delta = round(shortestDelta(def, target, trace.parent), def.decimals + 1);
      n.data.rules[def.key] = Math.abs(delta) < 10 ** -(def.decimals + 1) ? { mode: 'inherit' } : { mode: 'offset', delta };
    }
  }, key);
  return true;
}

/** Set several channels at once as one step (the 2D picker). Same rules as dragging each slider. */
export function setChannelValues(id: string, values: Record<string, number>, key = `pad:${id}`) {
  const { project, result } = getEditor();
  const node = project.nodes.find((n) => n.id === id);
  if (!node || node.type !== 'color') return;
  const res = result.nodes[id] as ColorResult | undefined;
  update((d) => {
    const n = nodeIn(d, id) as Draft<ColorNode> | undefined;
    if (!n) return;
    for (const [ch, value] of Object.entries(values)) {
      const def = channelDef(node.data.space, ch);
      if (!def) continue;
      const mode = node.data.rules[ch]?.mode ?? 'inherit';
      if (mode === 'formula') continue;
      const trace = res?.channels.find((c) => c.key === ch);
      const asOffset = !!res?.parentId && (mode === 'inherit' || mode === 'offset') && trace?.parent !== undefined;
      if (asOffset) n.data.rules[ch] = { mode: 'offset', delta: round(shortestDelta(def, value, trace!.parent!), def.decimals + 1) };
      else n.data.values[ch] = round(value, def.decimals + 1);
    }
  }, key);
}

export function setChannelRule(id: string, key: string, rule: ChannelRule) {
  const { project, result } = getEditor();
  const node = project.nodes.find((n) => n.id === id);
  if (!node || node.type !== 'color') return;
  const res = result.nodes[id] as ColorResult | undefined;
  const trace = res?.channels.find((c) => c.key === key);
  const def = channelDef(node.data.space, key);
  let next: ChannelRule = { ...rule };
  // Leaving Formula keeps the text, so switching back restores it instead of starting over.
  const kept = node.data.rules[key]?.expr;
  if (next.mode !== 'formula' && next.expr === undefined && kept) next.expr = kept;
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
function validWith(project: Project, edges: Edge[], c: Connection): boolean {
  const source = project.nodes.find((n) => n.id === c.source);
  const target = project.nodes.find((n) => n.id === c.target);
  if (!source || !target || source.id === target.id) return false;
  if (!hasOutput(source.type)) return false;
  if (source.type === 'palette' ? !/^(out|s\d+)$/.test(c.sourceHandle) : c.sourceHandle !== 'out') return false;
  if (!inputHandles(target, project.themes).includes(c.targetHandle)) return false;
  const others = edges.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle));
  // Formula references (@name) are dependencies too: a wire must not close a loop through them.
  const refs = getEditor().result.refs.map((r) => ({ id: r.id, source: r.source, sourceHandle: 'out', target: r.target, targetHandle: 'ref' }));
  return !wouldCreateCycle([...others, ...refs], c.source, c.target);
}

export function canConnect(c: Connection): boolean {
  const { project } = getEditor();
  return validWith(project, project.edges, c);
}

/** Inputs of `targetId` that could accept `source`, free ones first (tokens: the active theme only). */
export function compatibleInputs(targetId: string, source: { nodeId: string; handle: string }): { handle: string; free: boolean }[] {
  const { project, themeId } = getEditor();
  const target = project.nodes.find((n) => n.id === targetId);
  if (!target) return [];
  const handles = target.type === 'token' ? [tokenHandle(themeId)] : inputHandles(target, project.themes);
  return handles
    .filter((h) => validWith(project, project.edges, { source: source.nodeId, sourceHandle: source.handle, target: targetId, targetHandle: h }))
    .map((h) => ({ handle: h, free: !project.edges.some((e) => e.target === targetId && e.targetHandle === h) }));
}

export function connect(c: Connection) {
  if (!canConnect(c)) return false;
  const { project } = getEditor();
  if (project.edges.some((e) => e.source === c.source && e.sourceHandle === c.sourceHandle && e.target === c.target && e.targetHandle === c.targetHandle)) return true;
  update((d) => {
    d.edges = d.edges.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle));
    d.edges.push(makeEdge(c.source, c.sourceHandle, c.target, c.targetHandle));
  });
  return true;
}

/** Move one end of an existing edge (one undo step). Fails without changes if the result would be invalid. */
export function reconnectEdge(edgeId: string, c: Connection): boolean {
  const { project } = getEditor();
  const old = project.edges.find((e) => e.id === edgeId);
  if (!old) return false;
  const others = project.edges.filter((e) => e.id !== edgeId);
  if (!validWith(project, others, c)) return false;
  update((d) => {
    d.edges = d.edges.filter((e) => e.id !== edgeId && !(e.target === c.target && e.targetHandle === c.targetHandle));
    d.edges.push({ ...makeEdge(c.source, c.sourceHandle, c.target, c.targetHandle), id: old.id });
  });
  return true;
}

/** The input a node takes when it's dropped onto a connection, or null if it can't be spliced in. */
function spliceInput(project: Project, themeId: string, node: CanvasNode): string | null {
  if (!hasOutput(node.type)) return null;
  const handle = node.type === 'token' ? tokenHandle(themeId) : node.type === 'mix' ? 'a' : 'in';
  return inputHandles(node, project.themes).includes(handle) ? handle : null;
}

/** The two connections that would replace `edgeId` if `nodeId` were dropped onto it (null if not allowed). */
function splicePlan(nodeId: string, edgeId: string): { edge: Edge; a: Connection; b: Connection } | null {
  const { project, themeId } = getEditor();
  const edge = project.edges.find((e) => e.id === edgeId);
  const node = project.nodes.find((n) => n.id === nodeId);
  if (!edge || !node || edge.source === nodeId || edge.target === nodeId) return null;
  // Only a node that isn't wired up yet can be spliced, so nothing it already does gets rewired by surprise.
  if (project.edges.some((e) => e.source === nodeId || e.target === nodeId)) return null;
  const input = spliceInput(project, themeId, node);
  if (!input) return null;
  const others = project.edges.filter((e) => e.id !== edgeId);
  const a: Connection = { source: edge.source, sourceHandle: edge.sourceHandle, target: nodeId, targetHandle: input };
  const b: Connection = { source: nodeId, sourceHandle: 'out', target: edge.target, targetHandle: edge.targetHandle };
  if (!validWith(project, others, a)) return null;
  if (!validWith(project, [...others, { ...a, id: 'pending' }], b)) return null;
  return { edge, a, b };
}

export const canSplice = (nodeId: string, edgeId: string) => splicePlan(nodeId, edgeId) !== null;

/** Insert an unconnected node into a connection: source → node → target. */
export function spliceNodeIntoEdge(nodeId: string, edgeId: string, gestureKey?: string): boolean {
  const plan = splicePlan(nodeId, edgeId);
  if (!plan) return false;
  update((d) => {
    d.edges = d.edges.filter((e) => e.id !== edgeId);
    d.edges.push(makeEdge(plan.a.source, plan.a.sourceHandle, plan.a.target, plan.a.targetHandle));
    d.edges.push(makeEdge(plan.b.source, plan.b.sourceHandle, plan.b.target, plan.b.targetHandle));
  }, { key: gestureKey, gesture: !!gestureKey });
  return true;
}

/** Split an edge with a new color that inherits everything from the edge's source. */
export function insertColorOnEdge(edgeId: string, position: XY): string | null {
  const { project, result } = getEditor();
  const edge = project.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const source = project.nodes.find((n) => n.id === edge.source);
  const target = project.nodes.find((n) => n.id === edge.target);
  if (!source || !target) return null;
  const info = outputColor(result.nodes[source.id], edge.sourceHandle);
  const space: Space = source.type === 'color' ? source.data.space : 'oklch';
  const node = createColorNode({
    name: uniqueName(project.nodes, `${outputLabel(source, edge.sourceHandle, result.nodes[source.id])} step`),
    position: { x: Math.round(position.x - 104), y: Math.round(position.y - 78) },
    space,
    values: info ? valuesFromInfo(space, info) : undefined,
  });
  update((d) => {
    d.nodes.push(node as Draft<CanvasNode>);
    d.edges = d.edges.filter((e) => e.id !== edgeId);
    d.edges.push(makeEdge(edge.source, edge.sourceHandle, node.id, 'in'));
    d.edges.push(makeEdge(node.id, 'out', edge.target, edge.targetHandle));
  });
  getEditor().select([node.id]);
  return node.id;
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
