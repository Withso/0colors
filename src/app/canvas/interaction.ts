// Transient canvas interaction state shared between the canvas and node/edge views:
// where a dragged connection would land, which edge is hovered, alignment guides.
import { useMemo } from 'react';
import { create } from 'zustand';
import { useConnection } from '@xyflow/react';
import { getEditor } from '../store';
import { canConnect, compatibleInputs } from '../actions';

/** An alignment guide in flow coordinates: a vertical (axis 'x') or horizontal (axis 'y') line. */
export interface Guide { axis: 'x' | 'y'; pos: number; from: number; to: number }

interface InteractionState {
  /** Node a connection being dragged would attach to if released now. */
  dropTarget: string | null;
  hoveredEdge: string | null;
  /** An existing connection picked up by dragging from the input it feeds. */
  pickedEdge: string | null;
  /** The connection a dragged node would be spliced into if released now. */
  spliceEdge: string | null;
  /** Connections the cut stroke currently crosses. */
  cutEdges: string[];
  guides: Guide[];
  setSpliceEdge: (id: string | null) => void;
  setCutEdges: (ids: string[]) => void;
  setPickedEdge: (id: string | null) => void;
  setDropTarget: (id: string | null) => void;
  setHoveredEdge: (id: string | null) => void;
  setGuides: (guides: Guide[]) => void;
}

const NO_GUIDES: Guide[] = [];

export const useInteraction = create<InteractionState>()((set, get) => ({
  dropTarget: null,
  hoveredEdge: null,
  pickedEdge: null,
  spliceEdge: null,
  cutEdges: [],
  guides: NO_GUIDES,
  setSpliceEdge: (spliceEdge) => { if (get().spliceEdge !== spliceEdge) set({ spliceEdge }); },
  setCutEdges: (cutEdges) => {
    const prev = get().cutEdges;
    if (prev.length === cutEdges.length && prev.every((id, i) => id === cutEdges[i])) return;
    set({ cutEdges });
  },
  setPickedEdge: (pickedEdge) => { if (get().pickedEdge !== pickedEdge) set({ pickedEdge }); },
  setDropTarget: (dropTarget) => { if (get().dropTarget !== dropTarget) set({ dropTarget }); },
  setHoveredEdge: (hoveredEdge) => { if (get().hoveredEdge !== hoveredEdge) set({ hoveredEdge }); },
  setGuides: (guides) => {
    const prev = get().guides;
    if (!guides.length && !prev.length) return;
    set({ guides: guides.length ? guides : NO_GUIDES });
  },
}));

export const useIsDropTarget = (id: string) => useInteraction((s) => s.dropTarget === id);

/** Identity of the connection being dragged (its fixed end), or null. Changes only when a drag starts or ends. */
const connectionKey = (c: { inProgress: boolean; fromHandle: { nodeId: string; id?: string | null; type: 'source' | 'target' } | null }) =>
  c.inProgress && c.fromHandle ? `${c.fromHandle.nodeId}|${c.fromHandle.id ?? ''}|${c.fromHandle.type}` : null;

/**
 * Handles on this node that could complete the connection being dragged — highlighted so people
 * can see where a link may go before they get there. null when no connection is in progress.
 */
export function useCompatibleHandles(nodeId: string): Set<string> | null {
  const key = useConnection(connectionKey);
  return useMemo(() => {
    if (!key) return null;
    const [fromNode, fromHandle, type] = key.split('|');
    if (fromNode === nodeId) return new Set<string>();
    if (type === 'source') {
      return new Set(compatibleInputs(nodeId, { nodeId: fromNode, handle: fromHandle || 'out' }).map((h) => h.handle));
    }
    const node = getEditor().project.nodes.find((n) => n.id === nodeId);
    if (!node) return new Set<string>();
    const outputs = node.type === 'palette'
      ? ['out', ...Array.from({ length: Math.round(node.data.steps) }, (_, i) => `s${i}`)]
      : ['out'];
    return new Set(outputs.filter((h) => canConnect({ source: nodeId, sourceHandle: h, target: fromNode, targetHandle: fromHandle || 'in' })));
  }, [key, nodeId]);
}

export const useIsConnecting = () => useConnection((c) => c.inProgress);
