// Lineage highlighting: hovering a node lights up everything it depends on and
// everything that depends on it (edges and formula references); the rest fades.
import { create } from 'zustand';
import { getEditor } from '../store';

interface HoverState {
  nodeId: string | null;
  lineage: Set<string> | null;
  setHovered: (id: string | null) => void;
}

function lineageOf(id: string): Set<string> {
  const { project, result } = getEditor();
  const links = [...project.edges.map((e) => [e.source, e.target]), ...result.refs.map((r) => [r.source, r.target])];
  const walk = (start: string, forward: boolean) => {
    const seen = new Set<string>([start]);
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const [s, t] of links) {
        const next = forward ? (s === cur ? t : null) : (t === cur ? s : null);
        if (next && !seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    return seen;
  };
  return new Set([...walk(id, false), ...walk(id, true)]);
}

export const useHover = create<HoverState>()((set) => ({
  nodeId: null,
  lineage: null,
  setHovered: (nodeId) => set({ nodeId, lineage: nodeId ? lineageOf(nodeId) : null }),
}));

/** 'none' when nothing is hovered, otherwise whether this link is part of the hovered lineage. */
export function useLinkEmphasis(source: string, target: string): 'none' | 'on' | 'off' {
  return useHover((s) => (s.lineage === null ? 'none' : s.lineage.has(source) && s.lineage.has(target) ? 'on' : 'off'));
}
