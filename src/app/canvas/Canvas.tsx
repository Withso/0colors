// ─────────────────────────────────────────────────────────────
// The infinite canvas (React Flow). The project document in the store is the
// source of truth; React Flow nodes/edges are derived from it.
// ─────────────────────────────────────────────────────────────
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, type Connection as RFConnection, type EdgeChange, MiniMap, type NodeChange,
  type OnConnectEnd, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, useViewport,
} from '@xyflow/react';
import {
  Blend, Contrast, Copy, Crosshair, Hand, Map as MapIcon, Maximize, Minus, MousePointer2, Palette, Plus,
  Square, StickyNote, Tag, Trash2, Unlink,
} from 'lucide-react';
import type { CanvasNode, NodeType, XY } from '@/engine/model';
import { outputColor } from '@/engine/compute';
import { createColorNode, makeEdge, uniqueName } from '@/engine/defaults';
import { getEditor, useEditor } from '../store';
import { type Backdrop, useUI } from '../ui-store';
import {
  addConnectedNode, addNode, canConnect, connect, copyNodes, deleteNodes, deleteSelection, duplicateNodes,
  hasClipboard, moveNodes, pasteNodes, removeEdges, selectAll, setViewport,
} from '../actions';
import { type FlowNode, nodeTypes } from './nodes';
import { type ColorFlowEdge, type RefFlowEdge, edgeTypes } from './edges';
import { IconButton, Kbd, Tooltip, cn } from '../ui';

const NODE_SIZE: Record<NodeType, XY> = {
  color: { x: 216, y: 150 }, palette: { x: 236, y: 330 }, mix: { x: 236, y: 190 },
  contrast: { x: 256, y: 210 }, token: { x: 236, y: 120 }, note: { x: 260, y: 100 },
};

export const ADD_ITEMS: { type: NodeType; label: string; key: string; icon: ReactNode; hint: string }[] = [
  { type: 'color', label: 'Color', key: 'C', icon: <Square size={16} />, hint: 'A color in OKLCH, HCT, HSL or RGB' },
  { type: 'palette', label: 'Palette', key: 'P', icon: <Palette size={16} />, hint: 'A lightness scale from one hue' },
  { type: 'mix', label: 'Mix', key: 'M', icon: <Blend size={16} />, hint: 'Blend two colors in a chosen space' },
  { type: 'contrast', label: 'Contrast', key: 'K', icon: <Contrast size={16} />, hint: 'Check text/background readability' },
  { type: 'token', label: 'Token', key: 'T', icon: <Tag size={16} />, hint: 'A semantic name with one input per theme' },
  { type: 'note', label: 'Note', key: 'N', icon: <StickyNote size={16} />, hint: 'Write an explanation on the canvas' },
];

const BACKDROPS: Record<Backdrop, { bg: string; dots: string; label: string }> = {
  app: { bg: 'var(--app-canvas)', dots: 'var(--app-dots)', label: 'Match app' },
  dark: { bg: 'oklch(0.16 0 0)', dots: 'oklch(1 0 0 / 0.08)', label: 'Dark' },
  gray: { bg: 'oklch(0.6 0 0)', dots: 'oklch(0 0 0 / 0.12)', label: 'Mid gray' },
  light: { bg: 'oklch(0.97 0 0)', dots: 'oklch(0 0 0 / 0.1)', label: 'Light' },
};

interface MenuState {
  x: number;
  y: number;
  flow: XY;
  kind: 'pane' | 'node' | 'edge' | 'connect';
  targetId?: string;
  from?: { nodeId: string; handle: string };
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function CanvasInner() {
  const nodes = useEditor((s) => s.project.nodes);
  const edges = useEditor((s) => s.project.edges);
  const refs = useEditor((s) => s.result.refs);
  const selection = useEditor((s) => s.selection);
  const edgeSelection = useEditor((s) => s.edgeSelection);
  const loadCount = useEditor((s) => s.loadCount);
  const { tool, backdrop, minimap, resolvedTheme } = useUI();
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<Record<string, { width: number; height: number }>>({});
  const [menu, setMenu] = useState<MenuState | null>(null);
  const cascade = useRef(0);

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
      id: r.id, source: r.source, target: r.target, type: 'ref', selectable: false, focusable: false, deletable: false, data: { kind: 'ref' }, zIndex: 0,
    }));
    return [...ref, ...color];
  }, [nodes, edges, refs, edgeSelection]);

  // ── Changes from React Flow ──
  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const moves: { id: string; position: XY }[] = [];
    const sizes: Record<string, { width: number; height: number }> = {};
    let selectionChanged = false;
    const nextSel = new Set(getEditor().selection);
    for (const c of changes) {
      if (c.type === 'position' && c.position) moves.push({ id: c.id, position: c.position });
      else if (c.type === 'dimensions' && c.dimensions) sizes[c.id] = c.dimensions;
      else if (c.type === 'select') {
        selectionChanged = true;
        if (c.selected) nextSel.add(c.id); else nextSel.delete(c.id);
      }
    }
    if (moves.length) moveNodes(moves);
    if (Object.keys(sizes).length) setDims((prev) => ({ ...prev, ...sizes }));
    if (selectionChanged) {
      const ids = getEditor().project.nodes.map((n) => n.id).filter((id) => nextSel.has(id));
      getEditor().select(ids, ids.length ? [] : getEditor().edgeSelection);
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<ColorFlowEdge | RefFlowEdge>[]) => {
    const next = new Set(getEditor().edgeSelection);
    let changed = false;
    for (const c of changes) {
      if (c.type === 'select') {
        changed = true;
        if (c.selected) next.add(c.id); else next.delete(c.id);
      }
    }
    if (changed) getEditor().select(next.size ? [] : getEditor().selection, [...next]);
  }, []);

  const toConn = (c: RFConnection) => ({ source: c.source, sourceHandle: c.sourceHandle ?? 'out', target: c.target, targetHandle: c.targetHandle ?? 'in' });
  const onConnect = useCallback((c: RFConnection) => connect(toConn(c)), []);
  const isValidConnection = useCallback((c: RFConnection | { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) =>
    canConnect({ source: c.source, sourceHandle: c.sourceHandle ?? 'out', target: c.target, targetHandle: c.targetHandle ?? 'in' }), []);

  const onConnectEnd: OnConnectEnd = useCallback((event, state) => {
    if (state.isValid || !state.fromNode || !state.fromHandle) return;
    const el = event.target as Element | null;
    if (!el?.classList.contains('react-flow__pane')) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    const flow = rf.screenToFlowPosition({ x: point.clientX, y: point.clientY });
    const fromNode = state.fromNode.id;
    const handle = state.fromHandle.id ?? (state.fromHandle.type === 'source' ? 'out' : 'in');
    if (state.fromHandle.type === 'source') {
      setMenu({ x: point.clientX, y: point.clientY, flow, kind: 'connect', from: { nodeId: fromNode, handle } });
    } else {
      // Dragged backwards out of an input: create the color that feeds it.
      const { project, result } = getEditor();
      const target = project.nodes.find((n) => n.id === fromNode);
      if (!target) return;
      const current = result.nodes[fromNode];
      const hex = current && current.type === 'mix' ? (handle === 'a' ? current.a.hex : current.b.hex)
        : current && current.type === 'contrast' ? (handle === 'fg' ? current.fg.hex : current.bg.hex)
        : outputColor(current, 'out')?.hex;
      const node = createColorNode({ name: uniqueName(project.nodes, `${target.name} source`), position: { x: flow.x - 216, y: flow.y - 40 }, hex });
      getEditor().update((d) => {
        d.nodes.push(node);
        d.edges = d.edges.filter((e) => !(e.target === fromNode && e.targetHandle === handle));
        d.edges.push(makeEdge(node.id, 'out', fromNode, handle));
      });
      getEditor().select([node.id]);
    }
  }, [rf]);

  // ── Adding nodes ──
  const viewportCenter = useCallback((): XY => {
    const rect = wrapper.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }, [rf]);

  /** Nearest spot to `want` where a node of `size` doesn't overlap existing nodes. */
  const freeSpot = useCallback((want: XY, size: XY): XY => {
    const boxes = rf.getNodes().map((n) => ({
      x: n.position.x, y: n.position.y, w: n.measured?.width ?? 220, h: n.measured?.height ?? 140,
    }));
    const gap = 24;
    const fits = (p: XY) => boxes.every((b) => p.x + size.x + gap <= b.x || b.x + b.w + gap <= p.x || p.y + size.y + gap <= b.y || b.y + b.h + gap <= p.y);
    if (fits(want)) return want;
    for (let r = 1; r <= 24; r++) {
      const step = 40 * r;
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const p = { x: Math.round(want.x + Math.cos(ang) * step), y: Math.round(want.y + Math.sin(ang) * step) };
        if (fits(p)) return p;
      }
    }
    return want;
  }, [rf]);

  const addAtCenter = useCallback((type: NodeType) => {
    const c = viewportCenter();
    const k = cascade.current++ % 6;
    const size = NODE_SIZE[type];
    addNode(type, freeSpot({ x: Math.round(c.x - size.x / 2 + k * 12), y: Math.round(c.y - size.y / 2 + k * 12) }, size));
  }, [viewportCenter, freeSpot]);

  const addAt = (type: NodeType, flow: XY) => {
    const size = NODE_SIZE[type];
    addNode(type, { x: Math.round(flow.x - size.x / 2), y: Math.round(flow.y - 30) });
  };

  // ── Load / focus / viewport ──
  const initialized = useNodesInitialized();
  const pendingFit = useRef(true);
  useEffect(() => { pendingFit.current = true; setDims({}); cache.current.clear(); }, [loadCount]);
  useEffect(() => {
    if (!pendingFit.current || !initialized) return;
    pendingFit.current = false;
    const { project } = getEditor();
    if (project.viewport) { rf.setViewport(project.viewport); return; }
    // Fit everything, unless that makes text unreadable — then start at the top-left corner.
    const all = rf.getNodes();
    if (!all.length) return;
    const minX = Math.min(...all.map((n) => n.position.x));
    const minY = Math.min(...all.map((n) => n.position.y));
    const maxX = Math.max(...all.map((n) => n.position.x + (n.measured?.width ?? 200)));
    const maxY = Math.max(...all.map((n) => n.position.y + (n.measured?.height ?? 120)));
    const rect = wrapper.current?.getBoundingClientRect();
    const fitZoom = rect ? Math.min(rect.width / (maxX - minX + 120), rect.height / (maxY - minY + 120)) : 1;
    if (fitZoom >= 0.55) { rf.fitView({ padding: 0.08, maxZoom: 1 }); return; }
    const zoom = 0.8;
    rf.setViewport({ x: -minX * zoom + 48, y: -minY * zoom + 40, zoom });
  }, [initialized, loadCount, rf]);

  useEffect(() => {
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const n = rf.getNode(id);
      if (!n) return;
      const w = n.measured?.width ?? 200;
      const h = n.measured?.height ?? 120;
      rf.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: Math.max(rf.getZoom(), 0.9), duration: 450 });
    };
    window.addEventListener('0colors:focus-node', onFocus);
    return () => window.removeEventListener('0colors:focus-node', onFocus);
  }, [rf]);

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const { selection, undo, redo, select } = getEditor();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k === 'd') { e.preventDefault(); duplicateNodes(selection); return; }
      if (mod && k === 'c') { if (copyNodes(selection)) e.preventDefault(); return; }
      if (mod && k === 'v') { if (hasClipboard()) { e.preventDefault(); pasteNodes(viewportCenter()); } return; }
      if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
      if (mod || e.altKey) return;
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelection(); return; }
      if (k === 'escape') { select([], []); setMenu(null); return; }
      if (k === 'f') { rf.fitView({ padding: 0.12, duration: 350, maxZoom: 1.2 }); return; }
      if (e.key === '?') { useUI.getState().setShortcutsOpen(true); return; }
      if (k === 'v') { useUI.getState().setTool('select'); return; }
      if (k === 'h') { useUI.getState().setTool('hand'); return; }
      if (k.startsWith('arrow') && selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 40 : 8;
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
        const { project } = getEditor();
        moveNodes(project.nodes.filter((n) => selection.includes(n.id)).map((n) => ({ id: n.id, position: { x: n.position.x + dx, y: n.position.y + dy } })));
        return;
      }
      const item = ADD_ITEMS.find((i) => i.key.toLowerCase() === k);
      if (item) { e.preventDefault(); addAtCenter(item.type); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rf, addAtCenter, viewportCenter]);

  const miniColor = useCallback((n: FlowNode) => {
    const r = getEditor().result.nodes[n.id];
    if (!r) return 'transparent';
    if (r.type === 'palette') return r.shades[Math.floor(r.shades.length / 2)]?.color.hex ?? 'gray';
    if (r.type === 'note') return 'oklch(0.8 0.1 90 / 0.4)';
    if (r.type === 'contrast') return r.bg.hex;
    return outputColor(r, 'out')?.hex ?? 'gray';
  }, []);

  const bd = BACKDROPS[backdrop];

  return (
    <div
      ref={wrapper}
      className="relative h-full w-full"
      style={{ background: bd.bg }}
      onDoubleClick={(e) => {
        if (!(e.target as Element).classList.contains('react-flow__pane')) return;
        addAt('color', rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
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
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onNodeDragStop={() => getEditor().breakCoalesce()}
        onMoveEnd={(_, vp) => setViewport({ x: Math.round(vp.x), y: Math.round(vp.y), zoom: Math.round(vp.zoom * 1000) / 1000 })}
        onPaneClick={() => setMenu(null)}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), kind: 'pane' });
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
          setMenu({ x: e.clientX, y: e.clientY, flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), kind: 'edge', targetId: edge.id });
        }}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        selectionOnDrag={tool === 'select'}
        panOnDrag={tool === 'hand' ? true : [1]}
        panOnScroll={tool === 'select'}
        zoomOnDoubleClick={false}
        connectionRadius={28}
        minZoom={0.08}
        maxZoom={2.5}
        colorMode={resolvedTheme}
        className={cn(tool === 'hand' && '[&_.react-flow__pane]:cursor-grab')}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color={bd.dots} />
        {minimap && (
          <MiniMap<FlowNode>
            pannable
            zoomable
            position="bottom-left"
            nodeColor={miniColor}
            nodeStrokeWidth={0}
            nodeBorderRadius={6}
            maskColor="transparent"
            style={{ width: 168, height: 110, marginBottom: 56, marginLeft: 12 }}
          />
        )}
      </ReactFlow>

      <ZoomControls />
      <Toolbar onAdd={addAtCenter} />
      {nodes.length === 0 && <EmptyHint />}
      {menu && <CanvasMenu menu={menu} close={() => setMenu(null)} addAt={addAt} />}
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="max-w-sm rounded-2xl border border-dashed border-line-strong bg-surface/70 px-6 py-5 text-center backdrop-blur">
        <div className="text-[14px] font-semibold text-fg">An empty canvas</div>
        <p className="mt-1.5 text-[13px] text-fg-2">Double-click anywhere to add a color, or pick a node from the toolbar below. Press <Kbd>?</Kbd> for shortcuts.</p>
      </div>
    </div>
  );
}

function Toolbar({ onAdd }: { onAdd: (t: NodeType) => void }) {
  const { tool, setTool } = useUI();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-2xl border border-line bg-surface/95 p-1 shadow-panel backdrop-blur">
        <IconButton label="Select" shortcut="V" active={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={16} /></IconButton>
        <IconButton label="Pan" shortcut="H · Space" active={tool === 'hand'} onClick={() => setTool('hand')}><Hand size={16} /></IconButton>
        <div className="mx-1 h-5 w-px bg-line" />
        {ADD_ITEMS.map((item) => (
          <Tooltip key={item.type} content={<span><b className="font-semibold">{item.label}</b> — {item.hint}</span>} shortcut={item.key}>
            <button
              type="button"
              aria-label={`Add ${item.label}`}
              onClick={() => onAdd(item.type)}
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg"
            >
              {item.icon}
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          </Tooltip>
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
    <div className="absolute bottom-4 left-3 hidden items-center gap-0.5 rounded-xl border border-line bg-surface/95 p-1 shadow-panel backdrop-blur sm:flex">
      <IconButton label="Zoom out" size="icon-sm" onClick={() => rf.zoomOut({ duration: 200 })}><Minus size={14} /></IconButton>
      <Tooltip content="Reset to 100%">
        <button type="button" className="num h-6 w-11 rounded-md text-[11px] text-fg-2 hover:bg-surface-3 hover:text-fg" onClick={() => rf.zoomTo(1, { duration: 200 })}>
          {Math.round(zoom * 100)}%
        </button>
      </Tooltip>
      <IconButton label="Zoom in" size="icon-sm" onClick={() => rf.zoomIn({ duration: 200 })}><Plus size={14} /></IconButton>
      <IconButton label="Fit everything" shortcut="F" size="icon-sm" onClick={() => rf.fitView({ padding: 0.12, duration: 350, maxZoom: 1.2 })}><Maximize size={13} /></IconButton>
      <div className="mx-0.5 h-4 w-px bg-line" />
      <IconButton label={minimap ? 'Hide minimap' : 'Show minimap'} size="icon-sm" active={minimap} onClick={() => setMinimap(!minimap)}><MapIcon size={13} /></IconButton>
      <Tooltip content={`Canvas backdrop: ${BACKDROPS[backdrop].label} — colors look different on different surroundings`}>
        <button
          type="button"
          aria-label="Change canvas backdrop"
          onClick={() => setBackdrop(order[(order.indexOf(backdrop) + 1) % order.length])}
          className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-3"
        >
          <span className="h-3.5 w-3.5 rounded-full ring-1 ring-line-strong" style={{ background: BACKDROPS[backdrop].bg }} />
        </button>
      </Tooltip>
    </div>
  );
}

function CanvasMenu({ menu, close, addAt }: { menu: MenuState; close: () => void; addAt: (t: NodeType, flow: XY) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ x: Math.min(menu.x, innerWidth - r.width - 8), y: Math.min(menu.y, innerHeight - r.height - 8) });
    }
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [menu, close]);

  const item = (label: string, icon: ReactNode, run: () => void, opts: { danger?: boolean; shortcut?: string } = {}) => (
    <button
      key={label}
      type="button"
      onClick={() => { run(); close(); }}
      className={cn('flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] hover:bg-surface-3', opts.danger ? 'text-danger' : 'text-fg')}
    >
      <span className="flex w-4 justify-center text-fg-2">{icon}</span>
      <span className="flex-1">{label}</span>
      {opts.shortcut && <span className="num text-[11px] text-fg-3">{opts.shortcut}</span>}
    </button>
  );

  const { selection } = getEditor();
  const ids = menu.targetId && selection.includes(menu.targetId) ? selection : menu.targetId ? [menu.targetId] : [];
  let content: ReactNode;
  if (menu.kind === 'connect' && menu.from) {
    const from = menu.from;
    content = (
      <>
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-3">Connect a new…</div>
        {item('Color (derived)', <Square size={14} />, () => addConnectedNode(from, 'color', { x: menu.flow.x, y: menu.flow.y - 38 }))}
        {item('Token', <Tag size={14} />, () => addConnectedNode(from, 'token', { x: menu.flow.x, y: menu.flow.y - 20 }))}
        {item('Palette', <Palette size={14} />, () => addConnectedNode(from, 'palette', { x: menu.flow.x, y: menu.flow.y - 18 }))}
        {item('Mix (as A)', <Blend size={14} />, () => addConnectedNode(from, 'mix', { x: menu.flow.x, y: menu.flow.y - 50 }))}
        {item('Contrast (as background)', <Contrast size={14} />, () => addConnectedNode(from, 'contrast', { x: menu.flow.x, y: menu.flow.y - 64 }))}
      </>
    );
  } else if (menu.kind === 'node') {
    const node = getEditor().project.nodes.find((n) => n.id === menu.targetId);
    content = (
      <>
        {node?.type === 'color' && item('Derive a new color', <Plus size={14} />, () => addConnectedNode({ nodeId: node.id, handle: 'out' }, 'color', { x: node.position.x + 300, y: node.position.y }))}
        {item(ids.length > 1 ? `Duplicate ${ids.length} nodes` : 'Duplicate', <Copy size={14} />, () => duplicateNodes(ids), { shortcut: '⌘D' })}
        {item('Copy', <Copy size={14} />, () => copyNodes(ids), { shortcut: '⌘C' })}
        {node && node.type !== 'note' && item('Disconnect inputs', <Unlink size={14} />, () => {
          getEditor().update((d) => { d.edges = d.edges.filter((e) => !ids.includes(e.target)); });
        })}
        {item('Center in view', <Crosshair size={14} />, () => window.dispatchEvent(new CustomEvent('0colors:focus-node', { detail: { id: menu.targetId } })))}
        <div className="my-1 h-px bg-line" />
        {item(ids.length > 1 ? `Delete ${ids.length} nodes` : 'Delete', <Trash2 size={14} />, () => deleteNodes(ids), { danger: true, shortcut: '⌫' })}
      </>
    );
  } else if (menu.kind === 'edge') {
    content = item('Delete connection', <Trash2 size={14} />, () => removeEdges([menu.targetId!]), { danger: true, shortcut: '⌫' });
  } else {
    content = (
      <>
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-3">Add here</div>
        {ADD_ITEMS.map((i) => item(i.label, i.icon, () => addAt(i.type, menu.flow), { shortcut: i.key }))}
        <div className="my-1 h-px bg-line" />
        {item('Paste', <Copy size={14} />, () => pasteNodes(menu.flow), { shortcut: '⌘V' })}
        {item('Select all', <MousePointer2 size={14} />, () => selectAll(), { shortcut: '⌘A' })}
      </>
    );
  }

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-56 rounded-xl border border-line bg-surface p-1 shadow-panel"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {content}
    </div>
  );
}
