// ─────────────────────────────────────────────────────────────
// Local-only persistence. Canvases live in IndexedDB (idb-keyval), with a
// localStorage fallback for browsers where IndexedDB is unavailable.
//
// Keys:  canvas:<id> → Project   ·   canvases → CanvasMeta[]   ·   last → id
// ─────────────────────────────────────────────────────────────
import { createStore, del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { toast } from 'sonner';
import type { Project } from '@/engine/model';
import { type ComputeResult, computeProject, outputColor } from '@/engine/compute';
import { createBlankProject } from '@/engine/defaults';
import { normalizeProject } from '@/engine/schema';
import { decodeShare, readShareCode } from '@/engine/share';
import { createSampleProject } from './sample';
import { getEditor, useEditor } from './store';

export interface CanvasMeta {
  id: string;
  name: string;
  updatedAt: number;
  /** Up to 6 distinct hex colors, for the canvas list. */
  swatches: string[];
}

// ── Key/value layer ──────────────────────────────────────────
const LOCAL_PREFIX = '0colors:kv:';
let idbStore: ReturnType<typeof createStore> | null = null;
let useLocal = typeof indexedDB === 'undefined';

const store = () => (idbStore ??= createStore('0colors', 'kv'));

const FALLBACK_FLAG = '0colors:kv-fallback';
let warnedFull = false;

/** IndexedDB failed mid-session: remember it so the next load can recover the newer copies. */
function markFallback() {
  try { localStorage.setItem(FALLBACK_FLAG, String(Date.now())); } catch { /* ignore */ }
}

/**
 * If a previous session had to fall back to localStorage, those copies are the newest.
 * Move them back into IndexedDB before anything is read, so a reload never shows stale work.
 */
async function recoverFallback(): Promise<void> {
  let flagged = false;
  try { flagged = !!localStorage.getItem(FALLBACK_FLAG); } catch { return; }
  if (!flagged || useLocal) return;
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(LOCAL_PREFIX));
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw !== null) await idbSet(k.slice(LOCAL_PREFIX.length), JSON.parse(raw), store());
    }
    for (const k of keys) localStorage.removeItem(k);
    localStorage.removeItem(FALLBACK_FLAG);
  } catch {
    useLocal = true; // IndexedDB still unavailable: keep reading the localStorage copies.
  }
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!useLocal) {
    try {
      return await idbGet<T>(key, store());
    } catch {
      useLocal = true;
    }
  }
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  if (!useLocal) {
    try {
      await idbSet(key, value, store());
      return;
    } catch {
      // Safari can drop the connection; retry once with a fresh store before falling back.
      idbStore = null;
      try {
        await idbSet(key, value, store());
        return;
      } catch {
        useLocal = true;
        markFallback();
      }
    }
  }
  try {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  } catch {
    if (!warnedFull) {
      warnedFull = true;
      toast.error('Couldn’t save — browser storage is full or blocked. Export JSON from the canvas menu to keep your work.');
    }
  }
}

async function kvDel(key: string): Promise<void> {
  if (!useLocal) {
    try {
      await idbDel(key, store());
      return;
    } catch {
      useLocal = true;
      markFallback();
    }
  }
  try {
    localStorage.removeItem(LOCAL_PREFIX + key);
  } catch {
    // ignore
  }
}

/** Run storage writes one at a time so the canvas index never loses an update. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

// ── Canvas records ───────────────────────────────────────────
function swatchesFor(project: Project, result?: ComputeResult): string[] {
  const res = result ?? computeProject(project);
  const out: string[] = [];
  const push = (hex: string | null | undefined) => {
    if (hex && out.length < 6 && !out.includes(hex)) out.push(hex);
  };
  for (const node of project.nodes) {
    if (out.length >= 6) break;
    const r = res.nodes[node.id];
    if (!r) continue;
    if (r.type === 'palette') push(r.shades[Math.floor(r.shades.length / 2)]?.color.hex);
    else if (r.type === 'color' || r.type === 'mix' || r.type === 'token') push(outputColor(r)?.hex);
  }
  return out;
}

/** Use the editor's live results when saving the open project; compute otherwise. */
function resultFor(project: Project): ComputeResult | undefined {
  const state = getEditor();
  return state.project === project ? state.result : undefined;
}

function writeProject(project: Project, swatches?: string[]): Promise<void> {
  const meta: CanvasMeta = {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    swatches: swatches ?? swatchesFor(project, resultFor(project)),
  };
  return serial(async () => {
    await kvSet(`canvas:${project.id}`, project);
    const metas = (await kvGet<CanvasMeta[]>('canvases')) ?? [];
    await kvSet('canvases', [meta, ...metas.filter((m) => m.id !== project.id)]);
    await kvSet('last', project.id);
  });
}

async function readProject(id: string): Promise<Project | null> {
  const raw = await kvGet<unknown>(`canvas:${id}`);
  return raw ? normalizeProject(raw) : null;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// ── Autosave ─────────────────────────────────────────────────
let pending: Project | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let autosaveRunning = false;

function flushPending(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const project = pending;
  pending = null;
  return project ? writeProject(project) : Promise.resolve();
}

function dropPending(id: string) {
  if (pending?.id !== id) return;
  pending = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function startAutosave(): () => void {
  autosaveRunning = true;
  const unsubscribe = useEditor.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    pending = state.project;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flushPending(), 500);
  });
  const onHide = () => void flushPending();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void flushPending();
  };
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    void flushPending();
    unsubscribe();
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('visibilitychange', onVisibility);
    autosaveRunning = false;
  };
}

/** Write any unsaved changes right now. */
export async function saveNow(): Promise<void> {
  if (autosaveRunning) return flushPending();
  return writeProject(getEditor().project);
}

// ── Boot ─────────────────────────────────────────────────────
async function loadLastOrSample(): Promise<{ project: Project; source: 'saved' | 'sample'; error?: string }> {
  let error: string | undefined;
  try {
    const last = await kvGet<string>('last');
    const candidates = [last, ...((await kvGet<CanvasMeta[]>('canvases')) ?? []).map((m) => m.id)].filter(Boolean) as string[];
    for (const id of candidates) {
      try {
        const project = await readProject(id);
        if (project) return { project, source: 'saved' };
      } catch (err) {
        error = `A saved canvas could not be opened: ${message(err)}`;
      }
    }
  } catch (err) {
    error = message(err);
  }
  const project = createSampleProject();
  await writeProject(project).catch(() => undefined);
  return { project, source: 'sample', error };
}

/**
 * Decide what to open on startup: a shared link in the URL hash, else the last
 * canvas, else a fresh copy of the sample.
 */
export async function bootProject(): Promise<{ project: Project; source: 'share' | 'saved' | 'sample'; error?: string }> {
  await recoverFallback();
  const code = typeof location !== 'undefined' ? readShareCode(location.hash) : null;
  if (code) {
    const clearHash = () => history.replaceState(null, '', location.pathname + location.search);
    try {
      const project = await decodeShare(code);
      await writeProject(project);
      clearHash();
      return { project, source: 'share' };
    } catch (err) {
      clearHash();
      // Keep the visitor's own work in front of them rather than dropping them into the sample.
      const fallback = await loadLastOrSample();
      return { ...fallback, error: message(err) };
    }
  }
  try {
    return await loadLastOrSample();
  } catch (err) {
    return { project: createSampleProject(), source: 'sample', error: message(err) };
  }
}

// ── Canvas management ────────────────────────────────────────
export async function listCanvases(): Promise<CanvasMeta[]> {
  const metas = (await kvGet<CanvasMeta[]>('canvases')) ?? [];
  const { project } = getEditor();
  // The open canvas may be up to one autosave behind; show its live name and time.
  const live = metas.map((m) => (m.id === project.id ? { ...m, name: project.name, updatedAt: project.updatedAt } : m));
  if (!live.some((m) => m.id === project.id)) {
    live.push({ id: project.id, name: project.name, updatedAt: project.updatedAt, swatches: swatchesFor(project, resultFor(project)) });
  }
  return live.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function openWithoutSaving(id: string): Promise<void> {
  const project = await readProject(id);
  if (!project) throw new Error('That canvas could not be found in this browser.');
  getEditor().load(project);
  await serial(() => kvSet('last', project.id));
}

export async function openCanvas(id: string): Promise<void> {
  if (getEditor().project.id === id) return;
  await saveNow();
  await openWithoutSaving(id);
}

export async function createCanvas(project: Project): Promise<void> {
  await saveNow();
  await writeProject(project, swatchesFor(project));
  getEditor().load(project);
}

export async function deleteCanvas(id: string): Promise<void> {
  const isOpen = getEditor().project.id === id;
  if (isOpen) dropPending(id);
  await serial(async () => {
    await kvDel(`canvas:${id}`);
    const metas = (await kvGet<CanvasMeta[]>('canvases')) ?? [];
    await kvSet('canvases', metas.filter((m) => m.id !== id));
  });
  if (!isOpen) return;
  const remaining = ((await kvGet<CanvasMeta[]>('canvases')) ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const meta of remaining) {
    try {
      await openWithoutSaving(meta.id);
      return;
    } catch {
      // Try the next one.
    }
  }
  const blank = createBlankProject();
  await writeProject(blank, swatchesFor(blank));
  getEditor().load(blank);
}
