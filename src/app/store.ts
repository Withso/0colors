// ─────────────────────────────────────────────────────────────
// Editor store: the project document (with undo/redo), the active theme,
// selection, and the computed results for the active theme.
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { type Draft, produce } from 'immer';
import type { CanvasNode, Edge, Project } from '@/engine/model';
import { type ComputeResult, computeProject } from '@/engine/compute';
import { createBlankProject } from '@/engine/defaults';

const HISTORY_LIMIT = 150;
const COALESCE_MS = 1200;

export interface UpdateOptions {
  /** Consecutive updates with the same key (e.g. one slider drag) merge into one undo step. */
  key?: string;
  /** false = do not record in history (viewport, transient UI). */
  history?: boolean;
  /** false = the change cannot affect colors (positions, viewport), skip recomputing. */
  compute?: boolean;
}

export interface EditorState {
  project: Project;
  past: Project[];
  future: Project[];
  lastKey: string | null;
  lastTime: number;
  themeId: string;
  result: ComputeResult;
  selection: string[];
  edgeSelection: string[];
  /** Bumped when a whole new project is loaded, so the canvas can re-fit. */
  loadCount: number;

  load: (project: Project) => void;
  update: (recipe: (draft: Draft<Project>) => void, options?: UpdateOptions) => void;
  breakCoalesce: () => void;
  undo: () => void;
  redo: () => void;
  setTheme: (themeId: string) => void;
  select: (nodeIds: string[], edgeIds?: string[]) => void;
}

const initial = createBlankProject();

function pruneSelection(project: Project, ids: string[]): string[] {
  const exists = new Set(project.nodes.map((n) => n.id));
  return ids.filter((id) => exists.has(id));
}

export const useEditor = create<EditorState>()((set, get) => ({
  project: initial,
  past: [],
  future: [],
  lastKey: null,
  lastTime: 0,
  themeId: initial.themes[0].id,
  result: computeProject(initial, initial.themes[0].id),
  selection: [],
  edgeSelection: [],
  loadCount: 0,

  load: (project) => {
    const themeId = project.themes[0]?.id ?? '';
    set({
      project, past: [], future: [], lastKey: null, lastTime: 0, themeId,
      result: computeProject(project, themeId), selection: [], edgeSelection: [], loadCount: get().loadCount + 1,
    });
  },

  update: (recipe, options = {}) => {
    const state = get();
    const changed = produce(state.project, recipe);
    if (changed === state.project) return;
    const now = Date.now();
    const next = produce(changed, (d) => { d.updatedAt = now; });
    const record = options.history !== false;
    let past = state.past;
    if (record) {
      const merge = options.key && options.key === state.lastKey && now - state.lastTime < COALESCE_MS;
      if (!merge) past = [...past.slice(-(HISTORY_LIMIT - 1)), state.project];
    }
    const themeId = next.themes.some((t) => t.id === state.themeId) ? state.themeId : next.themes[0]?.id ?? '';
    set({
      project: next,
      past,
      future: record ? [] : state.future,
      lastKey: record ? options.key ?? null : state.lastKey,
      lastTime: record ? now : state.lastTime,
      themeId,
      result: options.compute === false && themeId === state.themeId ? state.result : computeProject(next, themeId, state.result),
      selection: pruneSelection(next, state.selection),
    });
  },

  breakCoalesce: () => set({ lastKey: null }),

  undo: () => {
    const { past, future, project, themeId, result, selection } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    const nextTheme = prev.themes.some((t) => t.id === themeId) ? themeId : prev.themes[0]?.id ?? '';
    set({
      project: prev, past: past.slice(0, -1), future: [project, ...future].slice(0, HISTORY_LIMIT),
      lastKey: null, themeId: nextTheme, result: computeProject(prev, nextTheme, result),
      selection: pruneSelection(prev, selection),
    });
  },

  redo: () => {
    const { past, future, project, themeId, result, selection } = get();
    if (!future.length) return;
    const next = future[0];
    const nextTheme = next.themes.some((t) => t.id === themeId) ? themeId : next.themes[0]?.id ?? '';
    set({
      project: next, past: [...past, project].slice(-HISTORY_LIMIT), future: future.slice(1),
      lastKey: null, themeId: nextTheme, result: computeProject(next, nextTheme, result),
      selection: pruneSelection(next, selection),
    });
  },

  setTheme: (themeId) => {
    const { project, themeId: current } = get();
    if (themeId === current || !project.themes.some((t) => t.id === themeId)) return;
    set({ themeId, result: computeProject(project, themeId) });
  },

  select: (nodeIds, edgeIds = []) => {
    const { selection, edgeSelection } = get();
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
    if (same(selection, nodeIds) && same(edgeSelection, edgeIds)) return;
    set({ selection: nodeIds, edgeSelection: edgeIds });
  },
}));

// ── Convenience selectors ────────────────────────────────────
export const getEditor = () => useEditor.getState();
export const findNode = (project: Project, id: string): CanvasNode | undefined => project.nodes.find((n) => n.id === id);
export const edgesInto = (project: Project, id: string): Edge[] => project.edges.filter((e) => e.target === id);

export function useNode(id: string | null | undefined) {
  return useEditor((s) => (id ? s.project.nodes.find((n) => n.id === id) : undefined));
}

export function useResult(id: string | null | undefined) {
  return useEditor((s) => (id ? s.result.nodes[id] : undefined));
}

export function useActiveTheme() {
  return useEditor((s) => s.project.themes.find((t) => t.id === s.themeId) ?? s.project.themes[0]);
}
