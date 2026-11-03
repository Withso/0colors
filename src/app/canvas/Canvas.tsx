// ─────────────────────────────────────────────────────────────
// The infinite canvas (React Flow). The project document in the store is the
// source of truth; React Flow nodes/edges are derived from it.
// ─────────────────────────────────────────────────────────────
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, type Connection as RFConnection, type EdgeChange, MiniMap, type NodeChange,
  type OnConnectEnd, type OnConnectStart, ReactFlow, useNodesInitialized, useReactFlow, useStoreApi, useViewport, ViewportPortal,
} from '@xyflow/react';
import {
  Blend, BoxSelect, Contrast, Copy, Crosshair, Frame, Hand, Map as MapIcon, Maximize, Minus, MousePointer2, Palette, Pencil, Plus,
  Square, StickyNote, Tag, Trash2, Unlink,
} from 'lucide-react';
import type { CanvasNode, NodeType, XY } from '@/engine/model';
import { outputColor } from '@/engine/compute';
import { createColorNode, makeEdge, uniqueName } from '@/engine/defaults';
import { getEditor, useEditor } from '../store';
import { type Backdrop, useUI } from '../ui-store';
import {
  CLIPBOARD_MIME, type Rect, addConnectedNode, addNode, canConnect, canSplice, clipboardPayload, compatibleInputs, connect, copyNodes,
  deleteNodes, deleteSelection, duplicateForAltDrag, duplicateNodes, hasClipboard, insertColorOnEdge, moveNodes,
  pasteClipboardJson, pasteColors, pasteNodes, reconnectEdge, removeEdges, resizeNodes, selectAll, setViewport, spliceNodeIntoEdge,
  wrapInSection,
} from '../actions';
import { type Pt, crossesPolyline } from './knife';
import { parseColors } from '@/engine/color/parse';
import { boundsOf, freeSpot as nearestFreeSpot, snapToGuides } from './geometry';
import { type FlowNode, nodeTypes } from './nodes';
import { type ColorFlowEdge, ConnectionLine, type RefFlowEdge, edgeTypes } from './edges';
import { useHover } from './hover';
import { useInteraction, useIsConnecting } from './interaction';
import { IconButton, Kbd, MENU_ITEM, MENU_SURFACE, Tooltip, cn } from '../ui';
import { isSampleId } from '../sample';

const NODE_SIZE: Record<NodeType, XY> = {
  color: { x: 208, y: 156 }, palette: { x: 228, y: 290 }, mix: { x: 228, y: 196 },
  contrast: { x: 248, y: 206 }, token: { x: 228, y: 104 }, note: { x: 260, y: 100 }, section: { x: 640, y: 420 },
  html: { x: 960, y: 560 },
};

export const ADD_ITEMS: { type: NodeType; label: string; key: string; icon: ReactNode; hint: string }[] = [
  { type: 'color', label: 'Color', key: 'C', icon: <Square size={17} />, hint: 'A color in OKLCH, HCT, HSL or RGB' },
  { type: 'palette', label: 'Palette', key: 'P', icon: <Palette size={17} />, hint: 'A lightness scale from one hue' },
  { type: 'mix', label: 'Mix', key: 'M', icon: <Blend size={17} />, hint: 'Blend two colors in a chosen space' },
  { type: 'contrast', label: 'Contrast', key: 'K', icon: <Contrast size={17} />, hint: 'Check text/background readability' },
  { type: 'token', label: 'Token', key: 'T', icon: <Tag size={17} />, hint: 'A semantic name with one input per theme' },
  { type: 'note', label: 'Note', key: 'N', icon: <StickyNote size={17} />, hint: 'Write an explanation on the canvas' },
  { type: 'section', label: 'Section', key: 'S', icon: <Frame size={17} />, hint: 'A frame that groups nodes' },
];

const BACKDROPS: Record<Backdrop, { bg: string; dots: string; label: string }> = {
  app: { bg: 'var(--app-canvas)', dots: 'var(--app-dots)', label: 'Match app' },
  dark: { bg: 'oklch(0.16 0 0)', dots: 'oklch(1 0 0 / 0.08)', label: 'Dark' },
  gray: { bg: 'oklch(0.6 0 0)', dots: 'oklch(0 0 0 / 0.12)', label: 'Mid gray' },
  light: { bg: 'oklch(0.97 0 0)', dots: 'oklch(0 0 0 / 0.1)', label: 'Light' },
};

/** MIME type used when dragging a node type from the toolbar onto the canvas. */
const DRAG_TYPE = 'application/x-0colors-node';

interface MenuState {
  x: number;
  y: number;
  flow: XY;
  kind: 'pane' | 'node' | 'edge' | 'connect';
  targetId?: string;
  from?: { nodeId: string; handle: string };
}

/** The end of a connection that stays put while the other end is dragged. */
interface DragFrom { nodeId: string; handle: string; type: 'source' | 'target' }

const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
  && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

export function Canvas() {
  return <CanvasInner />;
}

function CanvasInner() {
  const nodes = useEditor((s) => s.project.nodes);
  const edges = useEditor((s) => s.project.edges);
  const refs = useEditor((s) => s.result.refs);
  const selection = useEditor((s) => s.selection);
  const edgeSelection = useEditor((s) => s.edgeSelection);
  const loadCount = useEditor((s) => s.loadCount);
  const { tool, backdrop, minimap, resolvedTheme } = useUI();
  const rf = useReactFlow<FlowNode, ColorFlowEdge | RefFlowEdge>();
  const wrapper = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<Record<string, { width: number; height: number }>>({});
  const [menu, setMenu] = useState<MenuState | null>(null);
  const cascade = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const connecting = useIsConnecting();

  // ── Derived React Flow nodes (cached so unchanged nodes keep identity) ──
  const cache = useRef(new Map<string, { node: CanvasNode; selected: boolean; dims?: { width: number; height: number }; rf: FlowNode }>());
  const rfNodes = useMemo(() => {
    const selected = new Set(selection);
    return nodes.map((n) => {
      const sel = selected.has(n.id);
      const d = dims[n.id];
      const hit = cache.current.get(n.id);
      if (hit && hit.node === n && hit.selected === sel && hit.dims === d) return hit.rf;
      const node: FlowNode = { id: n.id, type: n.type, position: n.position, data: { node: n }, selected: sel, measured: d };
      if (n.type === 'section') {
        // Behind everything (even when selected), click-through except for its title and resize handles.
        node.zIndex = -2000;
        node.dragHandle = '.section-drag';
        node.style = { pointerEvents: 'none' };
      }
      cache.current.set(n.id, { node: n, selected: sel, dims: d, rf: node });
      return node;
    });
  }, [nodes, selection, dims]);

  const rfEdges = useMemo(() => {
    const selected = new Set(edgeSelection);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    // Edges from palette shades that no longer exist (steps were reduced) stay in the
    // document, so raising the step count reconnects them, but are not drawn.
    const live = edges.filter((e) => {
      const src = byId.get(e.source);
      if (src?.type !== 'palette' || e.sourceHandle === 'out') return true;
      return Number(e.sourceHandle.slice(1)) < Math.round(src.data.steps);
    });
    const color: ColorFlowEdge[] = live.map((e) => ({
      id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle,
      type: 'color', selected: selected.has(e.id), data: { kind: 'color' },
    }));
    const ref: RefFlowEdge[] = refs.map((r) => ({
      id: r.id, source: r.source, target: r.target, type: 'ref', selectable: false, focusable: false, deletable: false,
      reconnectable: false, data: { kind: 'ref' }, zIndex: 0,
    }));
    return [...ref, ...color];
  }, [nodes, edges, refs, edgeSelection]);

  // ── Geometry helpers (flow coordinates, from React Flow's measurements) ──
  const rectOf = useCallback((id: string): Rect | null => {
    const n = rf.getInternalNode(id);
    if (!n) return null;
    return { x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, width: n.measured.width ?? 0, height: n.measured.height ?? 0 };
  }, [rf]);

  /** Ids of the nodes that sit fully inside a section right now. */
  const contentsOf = useCallback((sectionId: string): string[] => {
    const box = rectOf(sectionId);
    if (!box) return [];
    return getEditor().project.nodes
      .filter((n) => n.id !== sectionId)
      .filter((n) => { const r = rectOf(n.id); return !!r && inside(box, r); })
      .map((n) => n.id);
  }, [rectOf]);

  // ── Node drags: sections carry their contents; ⌥ leaves a copy behind; guides align ──
  const carry = useRef(new Map<string, string[]>());
  const gesture = useRef<string | undefined>(undefined);
  const snapOff = useRef(false);
  useEffect(() => {
    const onMod = (e: KeyboardEvent) => { snapOff.current = e.metaKey || e.ctrlKey; };
    window.addEventListener('keydown', onMod);
    window.addEventListener('keyup', onMod);
    return () => { window.removeEventListener('keydown', onMod); window.removeEventListener('keyup', onMod); };
  }, []);

  /** Snap the dragged selection's box to nearby nodes' edges and centers (⌘/Ctrl turns it off). */
  const snapMoves = useCallback((moves: Map<string, XY>, showGuides = true) => {
    const ids = [...moves.keys()];
    const boxes = ids.map((id) => {
      const n = rf.getInternalNode(id);
      const p = moves.get(id)!;
      return n ? { x: p.x, y: p.y, width: n.measured.width ?? 0, height: n.measured.height ?? 0 } : null;
    }).filter((r): r is Rect => !!r);
    const box = boundsOf(boxes);
    if (!box || snapOff.current) { useInteraction.getState().setGuides([]); return; }
    if (!showGuides) useInteraction.getState().setGuides([]);
    const zoom = rf.getZoom();
    const vp = rf.getViewport();
    const el = wrapper.current?.getBoundingClientRect();
    const view = el ? { x: -vp.x / zoom, y: -vp.y / zoom, width: el.width / zoom, height: el.height / zoom } : null;
    const exclude = new Set([...ids, ...[...carry.current.values()].flat()]);
    const others = rf.getNodes()
      .filter((n) => !exclude.has(n.id) && n.type !== 'section')
      .map((n) => ({ x: n.position.x, y: n.position.y, width: n.measured?.width ?? 0, height: n.measured?.height ?? 0 }))
      .filter((r) => !view || (r.x < view.x + view.width && r.x + r.width > view.x && r.y < view.y + view.height && r.y + r.height > view.y));
    const snap = snapToGuides(box, others, 6 / zoom);
    const dx = snap.x - box.x;
    const dy = snap.y - box.y;
    if (dx || dy) for (const [id, p] of moves) moves.set(id, { x: p.x + dx, y: p.y + dy });
    if (showGuides) useInteraction.getState().setGuides(snap.guides);
  }, [rf]);
  const onNodeDragStart = useCallback((event: MouseEvent | TouchEvent, _node: FlowNode, dragged: FlowNode[]) => {
    useHover.getState().setHovered(null);
    setMenu(null);
    getEditor().breakCoalesce();
    gesture.current = `drag:${Date.now()}`;
    const ids = dragged.map((n) => n.id);
    carry.current.clear();
    const moving = new Set(ids);
    for (const n of dragged) {
      if (n.type !== 'section') continue;
      const contents = contentsOf(n.id).filter((id) => !moving.has(id));
      contents.forEach((id) => moving.add(id));
      carry.current.set(n.id, contents);
    }
    // ⌥: everything that travels (a frame's contents too) leaves a copy behind — same undo step as the drag.
    if (event.altKey) duplicateForAltDrag([...moving], gesture.current);
  }, [contentsOf]);

  /** The connection under a point (flow coordinates), using each connection's wide hit path. */
  const edgeAt = useCallback((p: XY): string | null => {
    const point = new DOMPoint(p.x, p.y);
    for (const g of document.querySelectorAll<SVGGElement>('.react-flow__edge-color')) {
      const hit = g.querySelector<SVGPathElement>('path.react-flow__edge-interaction');
      if (hit?.isPointInStroke(point)) return g.getAttribute('data-id');
    }
    return null;
  }, []);

  // Dragging a lone, unconnected node over a connection offers to splice it in.
  const onNodeDrag = useCallback((event: MouseEvent | TouchEvent, node: FlowNode, dragged: FlowNode[]) => {
    const { project } = getEditor();
    const free = dragged.length === 1 && !event.altKey && !project.edges.some((e) => e.source === node.id || e.target === node.id);
    if (!free) { useInteraction.getState().setSpliceEdge(null); return; }
    const w = node.measured?.width ?? 0;
    const h = node.measured?.height ?? 0;
    const p = 'touches' in event ? event.touches[0] : event;
    let edge = edgeAt({ x: node.position.x + w / 2, y: node.position.y + h / 2 });
    if (!edge && p) edge = edgeAt(rf.screenToFlowPosition({ x: p.clientX, y: p.clientY }));
    useInteraction.getState().setSpliceEdge(edge && canSplice(node.id, edge) ? edge : null);
  }, [rf, edgeAt]);

  const onNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: FlowNode) => {
    const splice = useInteraction.getState().spliceEdge;
    useInteraction.getState().setSpliceEdge(null);
    if (splice) spliceNodeIntoEdge(node.id, splice, gesture.current);
    carry.current.clear();
    useInteraction.getState().setGuides([]);
    // React Flow may still send the final position after this; end the gesture once that has landed.
    requestAnimationFrame(() => { gesture.current = undefined; getEditor().breakCoalesce(); });
  }, []);

  // ── Changes from React Flow ──
  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const { project } = getEditor();
    const byId = new Map(project.nodes.map((n) => [n.id, n]));
    const moves = new Map<string, XY>();
    const sizes: Record<string, { width: number; height: number }> = {};
    const resizes = new Map<string, { id: string; width?: number; height?: number; position?: XY }>();
    let resizeEnded = false;
    let selectionChanged = false;
    const nextSel = new Set(getEditor().selection);
    let dragging = false;
    for (const c of changes) {
      if (c.type === 'position' && c.position) { moves.set(c.id, c.position); if (c.dragging) dragging = true; }
      else if (c.type === 'dimensions' && c.dimensions) {
        sizes[c.id] = c.dimensions;
        if (c.resizing !== undefined) {
          // A user resize (NodeResizer), not just a measurement.
          resizes.set(c.id, { id: c.id, width: c.dimensions.width, height: c.dimensions.height });
          if (!c.resizing) resizeEnded = true;
        }
      } else if (c.type === 'select') {
        selectionChanged = true;
        if (c.selected) nextSel.add(c.id); else nextSel.delete(c.id);
      }
    }
    if (resizes.size) {
      for (const [id, pos] of moves) {
        const r = resizes.get(id);
        if (r) { r.position = pos; moves.delete(id); }
      }
      resizeNodes([...resizes.values()]);
      if (resizeEnded) getEditor().breakCoalesce();
    }
    if (moves.size) {
      // React Flow's last position of a drag is unsnapped; snap it too so a node stays on its guide.
      if (dragging) snapMoves(moves);
      else if (gesture.current) snapMoves(moves, false);
      const all = [...moves.entries()].map(([id, position]) => ({ id, position }));
      // A dragged section moves everything that was inside it when the drag began.
      for (const [sectionId, contents] of carry.current) {
        const next = moves.get(sectionId);
        const prev = byId.get(sectionId)?.position;
        if (!next || !prev) continue;
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (!dx && !dy) continue;
        for (const id of contents) {
          const n = byId.get(id);
          if (n && !moves.has(id)) all.push({ id, position: { x: n.position.x + dx, y: n.position.y + dy } });
        }
      }
      moveNodes(all, gesture.current);
    }
    if (Object.keys(sizes).length) setDims((prev) => ({ ...prev, ...sizes }));
    if (!dragging && moves.size) useInteraction.getState().setGuides([]);
    if (selectionChanged) {
      const ids = getEditor().project.nodes.map((n) => n.id).filter((id) => nextSel.has(id));
      getEditor().select(ids, ids.length ? [] : getEditor().edgeSelection);
    }
  }, [snapMoves]);

  const onEdgesChange = useCallback((changes: EdgeChange<ColorFlowEdge | RefFlowEdge>[]) => {
    const next = new Set(getEditor().edgeSelection);
    let changed = false;
    for (const c of changes) {
      if (c.type === 'select') {
        changed = true;
        if (c.selected) next.add(c.id); else next.delete(c.id);
      }
    }
    // React Flow selects the edges between box-selected nodes too; keep the nodes selected.
    if (changed) getEditor().select(getEditor().selection, [...next]);
  }, []);

  const toConn = (c: RFConnection) => ({ source: c.source, sourceHandle: c.sourceHandle ?? 'out', target: c.target, targetHandle: c.targetHandle ?? 'in' });
  const reconnecting = useRef<{ edgeId: string; done: boolean } | null>(null);
  const onConnect = useCallback((c: RFConnection) => { if (!reconnecting.current && !cancelled.current) connect(toConn(c)); }, []);
  const isValidConnection = useCallback((c: RFConnection | { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => {
    const conn = { source: c.source, sourceHandle: c.sourceHandle ?? 'out', target: c.target, targetHandle: c.targetHandle ?? 'in' };
    const moving = reconnecting.current;
    if (!moving) return canConnect(conn);
    // While reconnecting, the edge being moved doesn't count against its own input.
    const edge = getEditor().project.edges.find((e) => e.id === moving.edgeId);
    return !!edge && (canConnect(conn) || (edge.target === conn.target && edge.targetHandle === conn.targetHandle));
  }, []);

  // ── Dragging a connection: find the node under the pointer that could take it ──
  const dragFrom = useRef<DragFrom | null>(null);
  const nodeUnder = useCallback((x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)?.closest('.react-flow__node');
    const id = el?.getAttribute('data-id') ?? null;
    const from = dragFrom.current;
    if (!id || !from || id === from.nodeId) return null;
    // A body drop never silently replaces a connection: it needs a free input (or drop on a dot to replace).
    if (from.type === 'source') return compatibleInputs(id, from).some((h) => h.free) ? id : null;
    return canConnect({ source: id, sourceHandle: 'out', target: from.nodeId, targetHandle: from.handle }) ? id : null;
  }, []);
  const trackDrop = useCallback((e: MouseEvent | TouchEvent) => {
    const p = 'touches' in e ? e.touches[0] : e;
    if (p) useInteraction.getState().setDropTarget(nodeUnder(p.clientX, p.clientY));
  }, [nodeUnder]);
  const stopTracking = useCallback(() => {
    window.removeEventListener('mousemove', trackDrop);
    window.removeEventListener('touchmove', trackDrop);
    useInteraction.getState().setDropTarget(null);
  }, [trackDrop]);

  const picked = useRef<string | null>(null);
  const cancelled = useRef(false);
  const store = useStoreApi();
  useEffect(() => {
    // Escape while dragging a connection cancels it: nothing connects, moves or disconnects.
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !dragFrom.current) return;
      // This press only cancels the gesture; the selection stays (a second Escape clears it).
      e.preventDefault();
      e.stopImmediatePropagation();
      cancelled.current = true;
      useInteraction.getState().setDropTarget(null);
      useInteraction.getState().setPickedEdge(null);
      store.getState().cancelConnection();
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [store]);
  // ── Cut connections: hold X and drag, or right-drag, across connections ──
  interface Knife { button: number; active: boolean; start: Pt; pts: Pt[]; wires: { id: string; pts: Pt[] }[]; cut: Set<string> }
  const knife = useRef<Knife | null>(null);
  const xHeld = useRef(false);
  const [cutMode, setCutMode] = useState(false);
  const [knifeLine, setKnifeLine] = useState('');
  const pendingMenu = useRef<MenuState | null>(null);
  const suppressMenu = useRef(false);

  /** Every color connection as a polyline in flow coordinates (sampled from its rendered path). */
  const wirePolylines = useCallback(() => {
    const out: { id: string; pts: Pt[] }[] = [];
    for (const g of document.querySelectorAll<SVGGElement>('.react-flow__edge-color')) {
      const path = g.querySelector<SVGPathElement>('path.react-flow__edge-path');
      const id = g.getAttribute('data-id');
      if (!path || !id) continue;
      const len = path.getTotalLength();
      const n = Math.max(8, Math.min(64, Math.ceil(len / 20)));
      const pts: Pt[] = [];
      for (let i = 0; i <= n; i++) { const p = path.getPointAtLength((len * i) / n); pts.push({ x: p.x, y: p.y }); }
      out.push({ id, pts });
    }
    return out;
  }, []);

  const endKnife = useCallback((commit: boolean) => {
    const k = knife.current;
    knife.current = null;
    setKnifeLine('');
    useInteraction.getState().setCutEdges([]);
    if (!k) return;
    if (k.active) {
      if (commit && k.cut.size) removeEdges([...k.cut]);
      pendingMenu.current = null;
      if (k.button === 2) {
        // Some platforms fire contextmenu after the release; a cut stroke isn't a right-click.
        suppressMenu.current = true;
        setTimeout(() => { suppressMenu.current = false; }, 400);
      }
    } else if (commit && pendingMenu.current) {
      setMenu(pendingMenu.current);
      pendingMenu.current = null;
    }
  }, []);

  useEffect(() => {
    const field = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && knife.current) { e.preventDefault(); e.stopImmediatePropagation(); endKnife(false); return; }
      if (e.key.toLowerCase() !== 'x' || e.metaKey || e.ctrlKey || e.altKey || field(e.target)) return;
      if (!xHeld.current) { xHeld.current = true; setCutMode(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'x') { xHeld.current = false; setCutMode(false); } };
    const blur = () => { xHeld.current = false; setCutMode(false); };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [endKnife]);

  const onKnifeDown = useCallback((e: React.PointerEvent) => {
    const t = e.target as Element;
    if (!t.closest('.react-flow') || t.closest('.react-flow__node:not(.react-flow__node-section), button, input, textarea, .react-flow__minimap, .react-flow__panel')) return;
    const cutting = e.button === 0 && xHeld.current;
    if (!cutting && e.button !== 2) return;
    if (cutting) { e.preventDefault(); e.stopPropagation(); }
    const rect = wrapper.current!.getBoundingClientRect();
    const start = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    knife.current = { button: e.button, active: cutting, start, pts: [start], wires: wirePolylines(), cut: new Set() };
    pendingMenu.current = null;
    const move = (ev: PointerEvent) => {
      const k = knife.current;
      if (!k) return;
      const p = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      if (!k.active) {
        if (Math.hypot(p.x - k.start.x, p.y - k.start.y) < 6) return;
        k.active = true; // a right-drag became a cut
        setMenu(null);
      }
      const last = k.pts[k.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 3) return;
      k.pts.push(p);
      const a = rf.screenToFlowPosition({ x: last.x + rect.left, y: last.y + rect.top });
      const b = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      for (const w of k.wires) if (!k.cut.has(w.id) && crossesPolyline(a, b, w.pts)) k.cut.add(w.id);
      useInteraction.getState().setCutEdges([...k.cut]);
      setKnifeLine(k.pts.map((q) => `${q.x},${q.y}`).join(' '));
    };
    const finish = (commit: boolean) => () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      endKnife(commit);
    };
    const up = finish(true);
    // A cancelled pointer (or losing the window) is never a cut.
    const cancel = finish(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
  }, [rf, wirePolylines, endKnife]);

  /** Context menus wait for a right-press to end: a right-drag is a cut, not a menu. */
  const openMenu = useCallback((m: MenuState) => {
    if (suppressMenu.current) { suppressMenu.current = false; return; }
    const k = knife.current;
    if (k && k.button === 2) { if (!k.active) pendingMenu.current = m; return; }
    setMenu(m);
  }, []);

  const onConnectStart: OnConnectStart = useCallback((_, params) => {
    if (!params.nodeId || !params.handleType) return;
    cancelled.current = false;
    const fallback = params.handleType === 'source' ? 'out' : 'in';
    dragFrom.current = { nodeId: params.nodeId, handle: params.handleId ?? fallback, type: params.handleType };
    // Dragging out of a connected input picks its connection up (move it, or drop it on empty canvas to remove it).
    picked.current = null;
    if (params.handleType === 'target' && !reconnecting.current) {
      const edge = getEditor().project.edges.find((e) => e.target === params.nodeId && e.targetHandle === (params.handleId ?? fallback));
      if (edge) { picked.current = edge.id; useInteraction.getState().setPickedEdge(edge.id); }
    }
    window.addEventListener('mousemove', trackDrop);
    window.addEventListener('touchmove', trackDrop);
  }, [trackDrop]);

  /** Attach a dragged connection to a node body: the compatible input nearest the pointer, free ones first. */
  const connectToNode = useCallback((from: DragFrom, targetId: string, client: XY, edgeId?: string): boolean => {
    if (from.type === 'target') {
      const c = { source: targetId, sourceHandle: 'out', target: from.nodeId, targetHandle: from.handle };
      return edgeId ? reconnectEdge(edgeId, c) : connect(c);
    }
    const options = compatibleInputs(targetId, from).filter((h) => h.free);
    if (!options.length) return false;
    const flow = rf.screenToFlowPosition(client);
    const internal = rf.getInternalNode(targetId);
    const bounds = internal?.internals.handleBounds?.target ?? [];
    const origin = internal?.internals.positionAbsolute ?? { x: 0, y: 0 };
    const distance = (handle: string) => {
      const b = bounds.find((h) => h.id === handle);
      if (!b) return Infinity;
      return Math.abs(origin.y + b.y + b.height / 2 - flow.y);
    };
    const pick = [...options].sort((a, b) => distance(a.handle) - distance(b.handle))[0];
    const c = { source: from.nodeId, sourceHandle: from.handle, target: targetId, targetHandle: pick.handle };
    return edgeId ? reconnectEdge(edgeId, c) : connect(c);
  }, [rf]);

  const onConnectEnd: OnConnectEnd = useCallback((event, state) => {
    // A reconnect ends in onReconnectEnd, which React Flow calls right after this; it needs the drop target.
    if (reconnecting.current) return;
    const target = useInteraction.getState().dropTarget;
    stopTracking();
    const from = dragFrom.current;
    dragFrom.current = null;
    const pickedId = picked.current;
    picked.current = null;
    useInteraction.getState().setPickedEdge(null);
    if (cancelled.current) { cancelled.current = false; return; }
    if (state.isValid || !from) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (target) {
      connectToNode(from, target, { x: point.clientX, y: point.clientY });
      return;
    }
    const el = event.target as Element | null;
    if (!el?.classList.contains('react-flow__pane')) return;
    if (pickedId) { removeEdges([pickedId]); return; }
    const flow = rf.screenToFlowPosition({ x: point.clientX, y: point.clientY });
    if (from.type === 'source') {
      setMenu({ x: point.clientX, y: point.clientY, flow, kind: 'connect', from: { nodeId: from.nodeId, handle: from.handle } });
    } else {
      // Dragged backwards out of an input: create the color that feeds it.
      const { project, result } = getEditor();
      const node = project.nodes.find((n) => n.id === from.nodeId);
      if (!node) return;
      const current = result.nodes[from.nodeId];
      const hex = current && current.type === 'mix' ? (from.handle === 'a' ? current.a.hex : current.b.hex)
        : current && current.type === 'contrast' ? (from.handle === 'fg' ? current.fg.hex : current.bg.hex)
        : outputColor(current, 'out')?.hex;
      const color = createColorNode({ name: uniqueName(project.nodes, `${node.name} source`), position: { x: flow.x - 208, y: flow.y - 40 }, hex });
      getEditor().update((d) => {
        d.nodes.push(color);
        d.edges = d.edges.filter((e) => !(e.target === from.nodeId && e.targetHandle === from.handle));
        d.edges.push(makeEdge(color.id, 'out', from.nodeId, from.handle));
      });
      getEditor().select([color.id]);
    }
  }, [rf, stopTracking, connectToNode]);

  // ── Reconnecting: drag an edge's end to another input, onto a node, or off into space to disconnect ──
  const onReconnectStart = useCallback((_: React.MouseEvent, edge: ColorFlowEdge | RefFlowEdge) => {
    reconnecting.current = { edgeId: edge.id, done: false };
  }, []);
  const onReconnect = useCallback((old: ColorFlowEdge | RefFlowEdge, c: RFConnection) => {
    if (reconnecting.current && !cancelled.current) reconnecting.current.done = reconnectEdge(old.id, toConn(c));
  }, []);
  const onReconnectEnd = useCallback((event: MouseEvent | TouchEvent, edge: ColorFlowEdge | RefFlowEdge, fixedType: 'source' | 'target') => {
    const state = reconnecting.current;
    reconnecting.current = null;
    const target = useInteraction.getState().dropTarget;
    stopTracking();
    dragFrom.current = null;
    if (cancelled.current) { cancelled.current = false; return; }
    if (!state || state.done) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    const doc = getEditor().project.edges.find((e) => e.id === edge.id);
    if (!doc) return;
    if (target) {
      const from: DragFrom = fixedType === 'source'
        ? { nodeId: doc.source, handle: doc.sourceHandle, type: 'source' }
        : { nodeId: doc.target, handle: doc.targetHandle, type: 'target' };
      if (connectToNode(from, target, { x: point.clientX, y: point.clientY }, edge.id)) return;
    }
    // Only a release on empty canvas disconnects; over a node, the panel or outside the canvas the edge stays.
    const el = document.elementFromPoint(point.clientX, point.clientY);
    if (el?.classList.contains('react-flow__pane')) removeEdges([edge.id]);
  }, [stopTracking, connectToNode]);

  // ── Adding nodes ──
  const viewportCenter = useCallback((): XY => {
    const rect = wrapper.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }, [rf]);

  /** Nearest spot to `want` where a node of `size` doesn't overlap existing nodes (sections don't count). */
  const freeSpot = useCallback((want: XY, size: XY): XY => {
    const rects = rf.getNodes().filter((n) => n.type !== 'section').map((n) => ({
      x: n.position.x, y: n.position.y, width: n.measured?.width ?? 220, height: n.measured?.height ?? 140,
    }));
    const p = nearestFreeSpot(want, size, rects, 24);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }, [rf]);

  const addAtCenter = useCallback((type: NodeType) => {
    const c = viewportCenter();
    const k = cascade.current++ % 6;
    const size = NODE_SIZE[type];
    const want = { x: Math.round(c.x - size.x / 2 + k * 12), y: Math.round(c.y - size.y / 2 + k * 12) };
    addNode(type, type === 'section' ? want : freeSpot(want, size));
  }, [viewportCenter, freeSpot]);

  const addAt = useCallback((type: NodeType, flow: XY) => {
    const size = NODE_SIZE[type];
    addNode(type, { x: Math.round(flow.x - size.x / 2), y: Math.round(flow.y - (type === 'section' ? 24 : 30)) });
  }, []);

  /** Where the pointer is over the canvas (flow coordinates), or the viewport center. */
  const pointerFlow = useCallback((): XY => {
    const p = pointer.current;
    return p ? rf.screenToFlowPosition(p) : viewportCenter();
  }, [rf, viewportCenter]);

  const wrapSelection = useCallback(() => {
    const ids = getEditor().selection;
    const rects = ids.map(rectOf).filter((r): r is Rect => !!r);
    if (rects.length) wrapInSection(rects);
  }, [rectOf]);

  const zoomToSelection = useCallback(() => {
    const ids = getEditor().selection;
    if (!ids.length) { rf.fitView({ padding: 0.12, duration: 350, maxZoom: 1.2 }); return; }
    rf.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.2, duration: 350, maxZoom: 1.4 });
  }, [rf]);

  // ── Load / focus / viewport ──
  const initialized = useNodesInitialized();
  const pendingFit = useRef(true);
  useEffect(() => { pendingFit.current = true; setDims({}); cache.current.clear(); }, [loadCount]);
  useEffect(() => {
    if (!pendingFit.current || !initialized) return;
    pendingFit.current = false;
    const { project } = getEditor();
    if (project.viewport) { rf.setViewport(project.viewport); return; }
    const all = rf.getNodes();
    if (!all.length) return;
    // The demo opens on its first frame ("Start here"), fitted to the window.
    if (isSampleId(project.id)) {
      const first = [...all].filter((n) => n.type === 'section').sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)[0];
      if (first) { rf.fitView({ nodes: [{ id: first.id }], padding: 0.05, maxZoom: 0.95 }); return; }
    }
    // Fit everything, unless that makes text unreadable — then start at the top-left corner.
    const minX = Math.min(...all.map((n) => n.position.x));
    const minY = Math.min(...all.map((n) => n.position.y));
    const maxX = Math.max(...all.map((n) => n.position.x + (n.measured?.width ?? 200)));
    const maxY = Math.max(...all.map((n) => n.position.y + (n.measured?.height ?? 120)));
    const rect = wrapper.current?.getBoundingClientRect();
    const fitZoom = rect ? Math.min(rect.width / (maxX - minX + 120), rect.height / (maxY - minY + 120)) : 1;
    if (fitZoom >= 0.55) { rf.fitView({ padding: 0.08, maxZoom: 1 }); return; }
    const zoom = 0.9;
    rf.setViewport({ x: -minX * zoom + 48, y: -minY * zoom + 40, zoom });
  }, [initialized, loadCount, rf]);

  useEffect(() => {
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const n = rf.getNode(id);
      if (!n) return;
      const w = n.measured?.width ?? 200;
      const h = n.measured?.height ?? 120;
      if (n.type === 'section') { rf.fitView({ nodes: [{ id }], padding: 0.08, duration: 450, maxZoom: 1 }); return; }
      rf.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: Math.max(rf.getZoom(), 0.9), duration: 450 });
    };
    window.addEventListener('0colors:focus-node', onFocus);
    return () => window.removeEventListener('0colors:focus-node', onFocus);
  }, [rf]);

  // Actions other parts of the app (command palette, menus) can trigger on the canvas.
  useEffect(() => {
    const onCommand = (e: Event) => {
      const { command, type, at } = (e as CustomEvent<{ command: string; type?: NodeType; at?: XY }>).detail ?? {};
      if (command === 'add' && type) addAtCenter(type);
      else if (command === 'add-at' && type && at) addAt(type, at);
      else if (command === 'add-at-pointer' && type) addAt(type, pointerFlow());
      else if (command === 'fit') rf.fitView({ padding: 0.12, duration: 350, maxZoom: 1.2 });
      else if (command === 'zoom-selection') zoomToSelection();
      else if (command === 'zoom-100') rf.zoomTo(1, { duration: 220 });
      else if (command === 'wrap') wrapSelection();
      else if (command === 'paste') pasteNodes(viewportCenter());
    };
    window.addEventListener('0colors:canvas', onCommand);
    return () => window.removeEventListener('0colors:canvas', onCommand);
  }, [rf, addAtCenter, addAt, pointerFlow, zoomToSelection, wrapSelection, viewportCenter]);

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'k') {
        e.preventDefault();
        const ui = useUI.getState();
        if (ui.palette) ui.closePalette(); else ui.openPalette('all');
        return;
      }
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
      const { selection, undo, redo, select } = getEditor();

      // ── Global: work wherever focus is (outside text fields) ──
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (!mod && !e.altKey) {
        if (k === 'escape') { select([], []); setMenu(null); return; }
        if (e.key === '?') { useUI.getState().setShortcutsOpen(true); return; }
        if (e.key === '/') { e.preventDefault(); useUI.getState().openPalette('add', pointerFlow()); return; }
        // Tab is quick-add only while the canvas itself has focus; elsewhere it keeps moving focus.
        if (k === 'tab' && !e.shiftKey && (t === document.body || !!t?.classList.contains('react-flow__pane'))) {
          e.preventDefault();
          useUI.getState().openPalette('add', pointerFlow());
          return;
        }
        if (k === 'f' || (e.shiftKey && e.code === 'Digit1')) { e.preventDefault(); rf.fitView({ padding: 0.12, duration: 350, maxZoom: 1.2 }); return; }
        if (e.shiftKey && e.code === 'Digit2') { e.preventDefault(); zoomToSelection(); return; }
        if (e.shiftKey && e.code === 'Digit0') { e.preventDefault(); rf.zoomTo(1, { duration: 220 }); return; }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); rf.zoomOut({ duration: 200 }); return; }
        if (e.key === '=' || e.key === '+') { e.preventDefault(); rf.zoomIn({ duration: 200 }); return; }
        if (k === 'v') { useUI.getState().setTool('select'); return; }
        if (k === 'h') { useUI.getState().setTool('hand'); return; }
        const item = ADD_ITEMS.find((i) => i.key.toLowerCase() === k);
        if (item && !e.shiftKey) { e.preventDefault(); addAtCenter(item.type); return; }
      }

      // ── Canvas-only: selection, clipboard, delete, nudge ──
      // The side panel keeps native behavior (text selection, arrow keys on controls).
      if (t?.closest('aside')) return;
      const textSelected = (window.getSelection()?.toString() ?? '').length > 0;
      if (mod && e.altKey && k === 'g') { e.preventDefault(); wrapSelection(); return; }
      if (mod && k === 'd') { e.preventDefault(); duplicateNodes(selection); return; }
      // Copy/paste go through the clipboard events below (system clipboard, other tabs, pasted hex codes).
      // Keyboard fallbacks cover browsers that don't fire them without a text selection.
      if (mod && k === 'c') { if (!textSelected) copyNodes(selection); return; }
      if (mod && k === 'v') {
        pasteSeen.current = false;
        const at = pointerFlow();
        setTimeout(() => { if (!pasteSeen.current && hasClipboard()) pasteNodes(at); }, 80);
        return;
      }
      if (mod && k === 'a') { if (!textSelected) { e.preventDefault(); selectAll(); } return; }
      if (mod || e.altKey) return;
      if (k === 'enter' && selection.length === 1 && !t?.closest('button, a, [role="button"]')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('0colors:rename-node', { detail: { id: selection[0] } }));
        return;
      }
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelection(); return; }
      if (k.startsWith('arrow') && selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 40 : 8;
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
        const { project } = getEditor();
        const ids = new Set(selection);
        for (const id of selection) {
          if (project.nodes.find((n) => n.id === id)?.type === 'section') contentsOf(id).forEach((c) => ids.add(c));
        }
        moveNodes(project.nodes.filter((n) => ids.has(n.id)).map((n) => ({ id: n.id, position: { x: n.position.x + dx, y: n.position.y + dy } })));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rf, addAtCenter, viewportCenter, pointerFlow, zoomToSelection, wrapSelection, contentsOf]);

  // ── System clipboard: copy nodes across tabs, paste hex / CSS colors as color nodes ──
  const pasteSeen = useRef(false);
  useEffect(() => {
    const inField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
    const onCopy = (e: ClipboardEvent) => {
      if (inField(e.target) || (window.getSelection()?.toString() ?? '').length > 0) return;
      const payload = clipboardPayload(getEditor().selection);
      if (!payload || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData(CLIPBOARD_MIME, payload.json);
      e.clipboardData.setData('text/plain', payload.text);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e.target) || document.querySelector('[role="dialog"]')) return;
      pasteSeen.current = true;
      const at = pointerFlow();
      const json = e.clipboardData?.getData(CLIPBOARD_MIME);
      if (json && pasteClipboardJson(json, at)) { e.preventDefault(); return; }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const colors = text ? parseColors(text) : [];
      if (colors.length) {
        e.preventDefault();
        pasteColors(colors, at);
        return;
      }
      if (hasClipboard()) { e.preventDefault(); pasteNodes(at); }
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('copy', onCopy); window.removeEventListener('paste', onPaste); };
  }, [pointerFlow]);

  const miniColor = useCallback((n: FlowNode) => {
    const r = getEditor().result.nodes[n.id];
    if (!r) return 'transparent';
    if (r.type === 'section') return 'oklch(0.6 0 0 / 0.1)';
    if (r.type === 'palette') return r.shades[Math.floor(r.shades.length / 2)]?.color.hex ?? 'gray';
    if (r.type === 'note') return 'oklch(0.8 0.1 90 / 0.4)';
    if (r.type === 'html') return 'oklch(0.7 0 0 / 0.35)';
    if (r.type === 'contrast') return r.bg.hex;
    return outputColor(r, 'out')?.hex ?? 'gray';
  }, []);

  const bd = BACKDROPS[backdrop];

  return (
    <div
      ref={wrapper}
      className={cn('relative h-full w-full', cutMode && 'cut-mode')}
      style={{ background: bd.bg, ['--canvas-bd' as string]: bd.bg }}
      onPointerDownCapture={onKnifeDown}
      onPointerMove={(e) => { pointer.current = { x: e.clientX, y: e.clientY }; }}
      onPointerLeave={() => { pointer.current = null; }}
      onDoubleClick={(e) => {
        if (!(e.target as Element).classList.contains('react-flow__pane')) return;
        addAt('color', rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        const type = e.dataTransfer.getData(DRAG_TYPE) as NodeType;
        if (!type || !(type in NODE_SIZE)) return;
        e.preventDefault();
        addAt(type, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }}
    >
      <ReactFlow<FlowNode, ColorFlowEdge | RefFlowEdge>
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        reconnectRadius={14}
        isValidConnection={isValidConnection}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeMouseEnter={(_, n) => { if (n.type !== 'section' && n.type !== 'note' && n.type !== 'html') useHover.getState().setHovered(n.id); }}
        onNodeMouseLeave={() => useHover.getState().setHovered(null)}
        onEdgeMouseEnter={(_, e) => { if (e.type === 'color') useInteraction.getState().setHoveredEdge(e.id); }}
        onEdgeMouseLeave={() => useInteraction.getState().setHoveredEdge(null)}
        snapToGrid
        snapGrid={[8, 8]}
        onMoveEnd={(_, vp) => setViewport({ x: Math.round(vp.x), y: Math.round(vp.y), zoom: Math.round(vp.zoom * 1000) / 1000 })}
        onPaneClick={() => setMenu(null)}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          openMenu({ x: e.clientX, y: e.clientY, flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), kind: 'pane' });
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          if (!getEditor().selection.includes(node.id)) getEditor().select([node.id]);
          setMenu({ x: e.clientX, y: e.clientY, flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), kind: 'node', targetId: node.id });
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          if (edge.type !== 'color') return;
          getEditor().select([], [edge.id]);
          openMenu({ x: e.clientX, y: e.clientY, flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), kind: 'edge', targetId: edge.id });
        }}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        selectionOnDrag={tool === 'select'}
        panOnDrag={tool === 'hand' ? true : [1]}
        panOnScroll={tool === 'select'}
        zoomOnDoubleClick={false}
        connectionRadius={32}
        minZoom={0.08}
        maxZoom={2.5}
        colorMode={resolvedTheme}
        connectionLineComponent={ConnectionLine}
        className={cn(tool === 'hand' && '[&_.react-flow__pane]:cursor-grab', connecting && 'is-connecting')}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color={bd.dots} />
        <Guides />
        {minimap && (
          <MiniMap<FlowNode>
            pannable
            zoomable
            position="bottom-left"
            nodeColor={miniColor}
            nodeStrokeWidth={0}
            nodeBorderRadius={6}
            maskColor="transparent"
            style={{ width: 176, height: 112, marginBottom: 60, marginLeft: 12 }}
          />
        )}
      </ReactFlow>

      {knifeLine && (
        <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden>
          <polyline points={knifeLine} fill="none" stroke="var(--app-danger)" strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <ZoomControls />
      <Toolbar onAdd={addAtCenter} />
      {nodes.length === 0 && <EmptyHint />}
      {menu && (
        <CanvasMenu
          menu={menu}
          close={() => setMenu(null)}
          addAt={addAt}
          contentsOf={contentsOf}
          wrapSelection={wrapSelection}
        />
      )}
    </div>
  );
}

/** Alignment guides while dragging, drawn in flow coordinates. */
function Guides() {
  const guides = useInteraction((s) => s.guides);
  const { zoom } = useViewport();
  if (!guides.length) return null;
  return (
    <ViewportPortal>
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
        {guides.map((g, i) => (
          <line
            key={i}
            x1={g.axis === 'x' ? g.pos : g.from}
            x2={g.axis === 'x' ? g.pos : g.to}
            y1={g.axis === 'x' ? g.from : g.pos}
            y2={g.axis === 'x' ? g.to : g.pos}
            stroke="var(--app-guide)"
            strokeWidth={1 / zoom}
          />
        ))}
      </svg>
    </ViewportPortal>
  );
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="animate-pop max-w-[320px] text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[12px] bg-surface-2 text-fg-2 shadow-[inset_0_0_0_0.5px_var(--app-line-strong)]">
          <Square size={18} />
        </div>
        <div className="text-[14px] font-semibold tracking-[-0.01em] text-fg">Start with a color</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-2">
          Double-click the canvas, press <Kbd>C</Kbd>, or paste a hex code. <Kbd>⌘K</Kbd> finds everything else.
        </p>
      </div>
    </div>
  );
}

const FLOAT = 'glass rounded-[14px] shadow-panel';

function ToolButton({ label, ariaLabel, shortcut, hint, active, onClick, children, dragType }: {
  label: string; ariaLabel?: string; shortcut: string; hint?: string; active?: boolean; onClick: () => void; children: ReactNode; dragType?: NodeType;
}) {
  return (
    <Tooltip content={hint ? <span><span className="font-semibold">{label}</span><span className="text-white/65"> · {hint}</span></span> : label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={ariaLabel ?? label}
        aria-pressed={active}
        onClick={onClick}
        draggable={!!dragType}
        onDragStart={dragType ? (e) => { e.dataTransfer.setData(DRAG_TYPE, dragType); e.dataTransfer.effectAllowed = 'copy'; } : undefined}
        className={cn(
          'grid h-9 w-9 place-items-center rounded-[10px] outline-none transition-[background-color,color,transform] duration-150 active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-accent/60',
          active ? 'bg-accent text-accent-fg' : 'text-fg-2 hover:bg-surface-3/80 hover:text-fg',
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Toolbar({ onAdd }: { onAdd: (t: NodeType) => void }) {
  const { tool, setTool } = useUI();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
      <div className={cn('pointer-events-auto flex items-center gap-0.5 p-1', FLOAT)}>
        <ToolButton label="Select" shortcut="V" active={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={17} /></ToolButton>
        <ToolButton label="Hand" shortcut="H" hint="drag to pan" active={tool === 'hand'} onClick={() => setTool('hand')}><Hand size={17} /></ToolButton>
        <div className="mx-1 h-5 w-px bg-line-strong" />
        {ADD_ITEMS.map((item) => (
          <ToolButton
            key={item.type}
            label={item.label}
            ariaLabel={`Add ${item.label}`}
            shortcut={item.key}
            hint={`${item.hint} — click, or drag onto the canvas`}
            onClick={() => onAdd(item.type)}
            dragType={item.type}
          >
            {item.icon}
          </ToolButton>
        ))}
      </div>
    </div>
  );
}

function ZoomControls() {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const { minimap, setMinimap, backdrop, setBackdrop } = useUI();
  const order: Backdrop[] = ['app', 'dark', 'gray', 'light'];
  return (
    <div className={cn('absolute bottom-4 left-3 hidden items-center gap-px p-1 sm:flex', FLOAT)}>
      <IconButton label="Zoom out" shortcut="−" size="icon-sm" onClick={() => rf.zoomOut({ duration: 200 })}><Minus size={14} /></IconButton>
      <Tooltip content="Zoom to 100%" shortcut="⇧0">
        <button type="button" className="num h-7 w-12 rounded-[7px] text-[11.5px] font-medium text-fg-2 outline-none transition-colors hover:bg-surface-3/80 hover:text-fg" onClick={() => rf.zoomTo(1, { duration: 220 })}>
          {Math.round(zoom * 100)}%
        </button>
      </Tooltip>
      <IconButton label="Zoom in" shortcut="+" size="icon-sm" onClick={() => rf.zoomIn({ duration: 200 })}><Plus size={14} /></IconButton>
      <IconButton label="Zoom to fit" shortcut="F · ⇧1" size="icon-sm" onClick={() => rf.fitView({ padding: 0.12, duration: 380, maxZoom: 1.2 })}><Maximize size={13} /></IconButton>
      <div className="mx-1 h-4 w-px bg-line-strong" />
      <IconButton label={minimap ? 'Hide minimap' : 'Show minimap'} size="icon-sm" active={minimap} onClick={() => setMinimap(!minimap)}><MapIcon size={13} /></IconButton>
      <Tooltip content={`Backdrop: ${BACKDROPS[backdrop].label} — the same color looks different on different surroundings`}>
        <button
          type="button"
          aria-label="Change canvas backdrop"
          onClick={() => setBackdrop(order[(order.indexOf(backdrop) + 1) % order.length])}
          className="grid h-7 w-7 place-items-center rounded-[7px] outline-none transition-colors hover:bg-surface-3/80"
        >
          <span className="h-3.5 w-3.5 rounded-full shadow-[inset_0_0_0_1px_var(--app-line-strong),0_0_0_2px_var(--app-surface-3)]" style={{ background: BACKDROPS[backdrop].bg }} />
        </button>
      </Tooltip>
    </div>
  );
}

function CanvasMenu({ menu, close, addAt, contentsOf, wrapSelection }: {
  menu: MenuState; close: () => void; addAt: (t: NodeType, flow: XY) => void;
  contentsOf: (sectionId: string) => string[]; wrapSelection: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ x: Math.min(menu.x, innerWidth - r.width - 8), y: Math.min(menu.y, innerHeight - r.height - 8) });
      el.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [menu, close]);

  const item = (label: string, icon: ReactNode, run: () => void, opts: { danger?: boolean; shortcut?: string } = {}) => (
    <button
      key={label}
      type="button"
      onClick={() => { run(); close(); }}
      className={cn(MENU_ITEM, 'hover:bg-accent hover:text-accent-fg focus-visible:bg-accent focus-visible:text-accent-fg', opts.danger ? 'text-danger' : 'text-fg')}
    >
      <span className="flex w-4 justify-center text-fg-2 group-hover:text-accent-fg group-focus-visible:text-accent-fg">{icon}</span>
      <span className="flex-1">{label}</span>
      {opts.shortcut && <span className="num text-[11px] text-fg-3 group-hover:text-accent-fg/80 group-focus-visible:text-accent-fg/80">{opts.shortcut}</span>}
    </button>
  );
  const sep = (key: string) => <div key={key} className="mx-2 my-[5px] h-px bg-line" />;

  const { selection } = getEditor();
  const ids = menu.targetId && selection.includes(menu.targetId) ? selection : menu.targetId ? [menu.targetId] : [];
  let content: ReactNode;
  if (menu.kind === 'connect' && menu.from) {
    const from = menu.from;
    content = (
      <>
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-fg-3">Create a connected node</div>
        {item('Color (derived)', <Square size={14} />, () => addConnectedNode(from, 'color', { x: menu.flow.x, y: menu.flow.y - 38 }))}
        {item('Token', <Tag size={14} />, () => addConnectedNode(from, 'token', { x: menu.flow.x, y: menu.flow.y - 20 }))}
        {item('Palette', <Palette size={14} />, () => addConnectedNode(from, 'palette', { x: menu.flow.x, y: menu.flow.y - 18 }))}
        {item('Mix (as A)', <Blend size={14} />, () => addConnectedNode(from, 'mix', { x: menu.flow.x, y: menu.flow.y - 50 }))}
        {item('Contrast (as background)', <Contrast size={14} />, () => addConnectedNode(from, 'contrast', { x: menu.flow.x, y: menu.flow.y - 64 }))}
      </>
    );
  } else if (menu.kind === 'node') {
    const node = getEditor().project.nodes.find((n) => n.id === menu.targetId);
    const many = ids.length > 1;
    if (node?.type === 'section' && !many) {
      content = (
        <>
          {item('Select contents', <BoxSelect size={14} />, () => getEditor().select(contentsOf(node.id)))}
          {item('Rename', <Pencil size={14} />, () => window.dispatchEvent(new CustomEvent('0colors:rename-node', { detail: { id: node.id } })), { shortcut: '↵' })}
          {item('Zoom to section', <Crosshair size={14} />, () => window.dispatchEvent(new CustomEvent('0colors:focus-node', { detail: { id: node.id } })))}
          {sep('s1')}
          {item('Delete section', <Trash2 size={14} />, () => deleteNodes([node.id]), { danger: true, shortcut: '⌫' })}
          {item('Delete section and contents', <Trash2 size={14} />, () => deleteNodes([node.id, ...contentsOf(node.id)]), { danger: true })}
        </>
      );
    } else {
      content = (
        <>
          {node?.type === 'color' && !many && item('Derive a new color', <Plus size={14} />, () => addConnectedNode({ nodeId: node.id, handle: 'out' }, 'color', { x: node.position.x + 300, y: node.position.y }))}
          {item(many ? `Duplicate ${ids.length} nodes` : 'Duplicate', <Copy size={14} />, () => duplicateNodes(ids), { shortcut: '⌘D' })}
          {item('Copy', <Copy size={14} />, () => copyNodes(ids), { shortcut: '⌘C' })}
          {item(many ? 'Wrap in a section' : 'Add a section around it', <Frame size={14} />, wrapSelection, { shortcut: '⌥⌘G' })}
          {node && node.type !== 'note' && item('Disconnect inputs', <Unlink size={14} />, () => {
            getEditor().update((d) => { d.edges = d.edges.filter((e) => !ids.includes(e.target)); });
          })}
          {!many && item('Center in view', <Crosshair size={14} />, () => window.dispatchEvent(new CustomEvent('0colors:focus-node', { detail: { id: menu.targetId } })))}
          {sep('n1')}
          {item(many ? `Delete ${ids.length} nodes` : 'Delete', <Trash2 size={14} />, () => deleteNodes(ids), { danger: true, shortcut: '⌫' })}
        </>
      );
    }
  } else if (menu.kind === 'edge') {
    content = (
      <>
        {item('Insert a color between', <Plus size={14} />, () => insertColorOnEdge(menu.targetId!, menu.flow))}
        {sep('e1')}
        {item('Delete connection', <Trash2 size={14} />, () => removeEdges([menu.targetId!]), { danger: true, shortcut: '⌫' })}
      </>
    );
  } else {
    content = (
      <>
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-fg-3">Add here</div>
        {ADD_ITEMS.map((i) => item(i.label, i.icon, () => addAt(i.type, menu.flow), { shortcut: i.key }))}
        {sep('p1')}
        {item('Paste', <Copy size={14} />, () => pasteNodes(menu.flow), { shortcut: '⌘V' })}
        {item('Select all', <MousePointer2 size={14} />, () => selectAll(), { shortcut: '⌘A' })}
      </>
    );
  }

  return (
    <div
      ref={ref}
      role="menu"
      className={cn(MENU_SURFACE, 'fixed')}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {content}
    </div>
  );
}
