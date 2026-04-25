/**
 * 0colors Cloud Sync Service
 * 
 * Handles periodic syncing of cloud project data to Supabase.
 * - Syncs every 2 minutes (configurable)
 * - Auto-saves when user is idle for 30 seconds
 * - Auto-saves when tab goes to background (after 30s idle)
 * - Tracks dirty state per project
 * - Flushes pending changes on page unload / project close / project switch
 * - Offline-resilient: all data lives in localStorage first
 * - Local data is ALWAYS the source of truth; dirty projects never get overwritten
 *
 * AUTH ARCHITECTURE:
 * - Authorization header always carries publicAnonKey (gateway auth — never expires)
 * - X-User-Token header carries the user's JWT (user identification — may expire)
 * - This separation ensures requests always reach our server code, even if the
 *   user's JWT has expired. The server validates the user token and returns
 *   meaningful error messages instead of the gateway's opaque 401.
 */

import { SERVER_BASE } from './client';
import { publicAnonKey } from './info';
import { logger } from '../logger';
import type { ColorNode, DesignToken, TokenProject, TokenGroup, Page, Theme, CanvasState, NodeAdvancedLogic } from '../../types';
import type { ProjectComputedTokens } from '../computed-tokens';
import { isTabLeader, broadcastChange, requestSync } from '../../sync/tab-channel';

// ── Types ──

export interface ProjectSnapshot {
  project: TokenProject;
  nodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  pages: Page[];
  themes: Theme[];
  canvasStates: CanvasState[];
  advancedLogic: NodeAdvancedLogic[];
  computedTokens?: ProjectComputedTokens; // Resolved token snapshots per theme
  schemaVersion?: number; // Data schema version for automatic migrations
}

interface SyncState {
  dirtyProjectIds: Set<string>;
  intervalId: ReturnType<typeof setInterval> | null;
  accessToken: string | null;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAttempt: number;
  pendingSyncQueue: string[]; // Project IDs queued for retry
}

// ── Constants ──
// ── Constants ──
const SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes — safety-net interval
const IDLE_SAVE_MS = 30 * 1000; // 30 seconds idle → auto save (still used by idle tracking)
const FETCH_TIMEOUT_MS = 30_000; // 30s timeout for safeFetch
const MAX_RETRIES = 2; // safeFetch retry count
const DIRTY_KEY = '0colors-cloud-dirty-projects'; // still referenced by saveDirtyState/loadDirtyState

// ── Module state ──
const state: SyncState = {
  dirtyProjectIds: new Set<string>(),
  intervalId: null,
  accessToken: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  lastSyncAttempt: 0,
  pendingSyncQueue: [],
};

// ── Debounced instant-save state ──
let _debounceSaveTimerId: ReturnType<typeof setTimeout> | null = null;

// ── Idle save state ──
let _idleTimerId: ReturnType<typeof setTimeout> | null = null;
let _lastActivityTs = Date.now();
let _idleListenersAttached = false;

// Callbacks for UI notifications
let onSyncStart: (() => void) | null = null;
let onSyncComplete: ((success: boolean, projectIds: string[]) => void) | null = null;
let onSyncError: ((error: string) => void) | null = null;
// Token refresh callback — invoked when sync gets a 401 so the app can refresh the JWT
let onTokenExpired: (() => Promise<string | null>) | null = null;
// Visibility resume callback — invoked when tab regains focus to check for remote changes
let onVisibilityResume: (() => void) | null = null;
// Remote poll callback — invoked every REMOTE_POLL_MS to check for changes from other browsers/devices
let onRemotePoll: (() => void) | null = null;
let _remotePollIntervalId: ReturnType<typeof setInterval> | null = null;

// Data getter — provided by App.tsx so sync service can grab current state
let getProjectSnapshot: ((projectId: string) => ProjectSnapshot | null) | null = null;
let onProjectsSynced: ((projectIds: string[], timestamps: Record<string, number>) => void) | null = null;

// ── Helper: build headers for server requests ──
// Always use publicAnonKey for Authorization (gateway) and user token in X-User-Token
function makeHeaders(userToken: string, includeContentType = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${publicAnonKey}`,
    'X-User-Token': userToken,
  };
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

/**
 * Resilient fetch wrapper with timeout and retry.
 * Edge functions can take several seconds on cold start, so we use
 * a generous timeout and a single retry on network failure.
 */
async function safeFetch(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('Cloud sync fetch timeout'), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (err: any) {
      clearTimeout(timeout);
      const isAbort = err?.name === 'AbortError';
      const label = isAbort ? 'timeout' : 'network error';
      logger.debug(`☁️ safeFetch ${label} (attempt ${attempt + 1}/${retries + 1}) — ${url}: ${err?.message || err}`);
      if (attempt < retries) {
        // Wait before retrying (1s, 2s, ...)
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('safeFetch: exhausted retries');
}

// ── Public API ──

export function initCloudSync(config: {
  accessToken: string;
  getSnapshot: (projectId: string) => ProjectSnapshot | null;
  onStart?: () => void;
  onComplete?: (success: boolean, projectIds: string[]) => void;
  onError?: (error: string) => void;
  onSynced?: (projectIds: string[], timestamps: Record<string, number>) => void;
  onTokenExpired?: () => Promise<string | null>;
  onVisibilityResume?: () => void;
  onRemotePoll?: () => void;
}) {
  state.accessToken = config.accessToken;
  getProjectSnapshot = config.getSnapshot;
  onSyncStart = config.onStart || null;
  onSyncComplete = config.onComplete || null;
  onSyncError = config.onError || null;
  onProjectsSynced = config.onSynced || null;
  onTokenExpired = config.onTokenExpired || null;
  onVisibilityResume = config.onVisibilityResume || null;
  onRemotePoll = config.onRemotePoll || null;

  // ── DISABLED: Write-through sync (write-through.ts) handles all saves now ──
  // The old periodic interval, dirty tracking, idle save, and beforeunload flush
  // are no longer needed. Write-through saves to IndexedDB + cloud on every action.
  //
  // What's still active from initCloudSync:
  // - onTokenExpired callback (for 401 handling)
  // - onVisibilityResume callback (for tab focus refetch)
  // - online/offline listeners (for status tracking)

  // Listen for online/offline (still needed for status)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  // Clear any stale dirty state from localStorage
  try { localStorage.removeItem('0colors-cloud-dirty-projects'); } catch {}

  logger.debug('☁️ Cloud sync initialized (write-through mode)');
}

export function destroyCloudSync() {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  if (_remotePollIntervalId) {
    clearInterval(_remotePollIntervalId);
    _remotePollIntervalId = null;
  }
  // Clear debounced save timer
  if (_debounceSaveTimerId) {
    clearTimeout(_debounceSaveTimerId);
    _debounceSaveTimerId = null;
  }
  // Stop idle tracking
  stopIdleTracking();
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  }
  logger.debug('☁️ Cloud sync destroyed');
}

export function updateAccessToken(token: string | null) {
  state.accessToken = token;
}

/** Mark a cloud project as dirty (needs sync).
 *  Triggers a debounced auto-flush (3 s) so changes are saved near-instantly
 *  without hammering the server during rapid edits.
 *  Also broadcasts the change to other tabs and requests sync from the leader. */
export function markDirty(projectId: string) {
  state.dirtyProjectIds.add(projectId);
  saveDirtyState();
  _scheduleDebouncedFlush();

  // Notify other tabs that this project changed
  broadcastChange(projectId, ['nodes', 'tokens', 'groups', 'pages', 'themes']);

  // If this tab is not the leader, request the leader to sync
  if (!isTabLeader()) {
    requestSync(projectId);
  }
}

/** Schedule a debounced flush — resets the timer on every call so rapid
 *  markDirty() calls collapse into a single sync 3 s after the last one. */
function _scheduleDebouncedFlush() {
  if (_debounceSaveTimerId) clearTimeout(_debounceSaveTimerId);
  _debounceSaveTimerId = setTimeout(() => {
    _debounceSaveTimerId = null;
    if (state.dirtyProjectIds.size > 0 && state.accessToken && state.isOnline) {
      logger.debug('☁️ Debounced auto-save triggered (3 s after last change)');
      flushDirtyProjects();
    }
  }, DEBOUNCE_SAVE_MS);
}

/** Remove a project from the dirty set (e.g. after deletion) */
export function removeDirty(projectId: string) {
  state.dirtyProjectIds.delete(projectId);
  saveDirtyState();
}

/** Check if a project has pending changes */
export function isDirty(projectId: string): boolean {
  return state.dirtyProjectIds.has(projectId);
}

/** Get count of dirty projects */
export function getDirtyCount(): number {
  return state.dirtyProjectIds.size;
}

/** Check if a sync is already in progress */
export function isSyncInProgress(): boolean {
  return state.isSyncing;
}

/** Force an immediate sync of all dirty projects.
 *  If a sync is already in progress, waits for it to finish and then
 *  re-syncs any remaining dirty projects (so the caller's latest
 *  snapshot always reaches the server). */
export async function forceSyncNow(): Promise<boolean> {
  // If a sync is already running (e.g. the 5-min auto-sync),
  // wait for it to complete, then flush again so the caller's
  // freshly-updated data is guaranteed to be sent.
  if (state.isSyncing) {
    logger.debug('☁️ Sync already in progress — waiting for it to finish…');
    await waitForSyncIdle();
    // After the previous sync completes, re-flush any still-dirty projects
    return flushDirtyProjects();
  }
  return flushDirtyProjects();
}

/** Returns a promise that resolves once `state.isSyncing` becomes false.
 *  Polls every 250 ms with a hard ceiling of 30 s to avoid infinite waits. */
function waitForSyncIdle(maxWaitMs = 30_000): Promise<void> {
  if (!state.isSyncing) return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    const id = setInterval(() => {
      if (!state.isSyncing || Date.now() - start > maxWaitMs) {
        clearInterval(id);
        resolve();
      }
    }, 250);
  });
}

/** Sync a specific project immediately */
export async function syncProject(projectId: string): Promise<boolean> {
  if (!state.accessToken || !getProjectSnapshot) return false;

  const snapshot = getProjectSnapshot(projectId);
  if (!snapshot) return false;

  try {
    const res = await safeFetch(`${SERVER_BASE}/sync`, {
      method: 'POST',
      headers: makeHeaders(state.accessToken, true),
      body: JSON.stringify({ projectId, snapshot }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      logger.debug(`☁️ Sync failed for ${projectId}: ${err.error}`);
      return false;
    }

    const result = await res.json();
    state.dirtyProjectIds.delete(projectId);
    saveDirtyState();

    if (onProjectsSynced && result.syncedAt) {
      onProjectsSynced([projectId], { [projectId]: result.syncedAt });
    }

    return true;
  } catch (e) {
    logger.debug(`☁️ Sync error for ${projectId}: ${e}`);
    return false;
  }
}

/** Load a single cloud project snapshot from server (lightweight — for polling) */
export async function loadSingleProject(projectId: string, accessToken: string): Promise<ProjectSnapshot | null> {
  try {
    const res = await safeFetch(`${SERVER_BASE}/load/${encodeURIComponent(projectId)}`, {
      method: 'GET',
      headers: makeHeaders(accessToken),
    }, 1, 10_000); // 1 retry, 10s timeout (lightweight)

    if (!res.ok) return null;
    const data = await res.json();
    return data.snapshot || null;
  } catch {
    return null;
  }
}

/** Load all cloud project snapshots from server */
export async function loadCloudProjects(accessToken: string): Promise<{
  projectId: string;
  snapshot: ProjectSnapshot | null;
}[]> {
  try {
    const res = await safeFetch(`${SERVER_BASE}/load-all`, {
      method: 'GET',
      headers: makeHeaders(accessToken),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      logger.debug(`☁️ Load-all failed (${res.status}): ${err.error}`);
      return [];
    }

    const data = await res.json();
    return data.projects || [];
  } catch (e) {
    logger.debug(`☁️ Load-all error: ${e}`);
    return [];
  }
}

/**
 * Load public template project snapshots.
 * These are template projects created by template admins, publicly readable
 * by all users (no auth required). Falls back to empty array on failure.
 *
 * BACKEND ACTION NEEDED: Requires a GET /templates endpoint on Railway that
 * returns { templates: [{ templateId, snapshot, name, description }] }
 * reading from the same KV store but filtered to isTemplate projects.
 */
export async function loadPublicTemplates(): Promise<{
  templates: {
    templateId: string;
    snapshot: ProjectSnapshot | null;
    name?: string;
    description?: string;
  }[];
  starredTemplateId: string | null;
}> {
  try {
    const res = await safeFetch(`${SERVER_BASE}/templates`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
      },
    });

    if (!res.ok) {
      // Expected to fail until backend endpoint is deployed
      logger.debug(`☁️ Load public templates failed (${res.status}) — using built-in templates`);
      return { templates: [], starredTemplateId: null };
    }

    const data = await res.json();
    // Backend returns { templates: [{projectId, name, snapshot}], starredTemplateId }
    const templates = (data.templates || []).map((t: any) => ({
      templateId: t.templateId || t.projectId,
      snapshot: t.snapshot || null,
      name: t.name,
      description: t.description,
    }));
    return { templates, starredTemplateId: data.starredTemplateId || null };
  } catch (e) {
    logger.debug(`☁️ Load public templates error: ${e} — using built-in templates`);
    return { templates: [], starredTemplateId: null };
  }
}

/** Set or clear the starred template (template admin only) */
export async function setStarredTemplate(templateId: string | null, accessToken: string): Promise<boolean> {
  try {
    const res = await safeFetch(`${SERVER_BASE}/templates/starred`, {
      method: 'PUT',
      headers: makeHeaders(accessToken, true),
      body: JSON.stringify({ templateId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Register a project as cloud — returns { ok, error? } */
export async function registerCloudProject(projectId: string, accessToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await safeFetch(`${SERVER_BASE}/cloud-register`, {
      method: 'POST',
      headers: makeHeaders(accessToken, true),
      body: JSON.stringify({ projectId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      logger.debug(`☁️ Register failed (${res.status}): ${err.error}`);
      return { ok: false, error: err.error || `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (e) {
    logger.debug(`☁️ Register error: ${e}`);
    return { ok: false, error: `Network error: ${e}` };
  }
}

/** Unregister a project from cloud */
export async function unregisterCloudProject(projectId: string, accessToken: string): Promise<boolean> {
  try {
    const res = await safeFetch(`${SERVER_BASE}/cloud-unregister`, {
      method: 'POST',
      headers: makeHeaders(accessToken, true),
      body: JSON.stringify({ projectId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      logger.debug(`☁️ Unregister failed (${res.status}): ${err.error}`);
      return false;
    }

    return true;
  } catch (e) {
    logger.debug(`☁️ Unregister error: ${e}`);
    return false;
  }
}

/** Get user's cloud metadata */
export async function getCloudMeta(accessToken: string): Promise<{
  cloudProjectIds: string[];
  isAdmin?: boolean;
  isTemplateAdmin?: boolean;
  cloudProjectLimit?: number | null; // null = unlimited (admin)
} | null> {
  try {
    const res = await safeFetch(`${SERVER_BASE}/cloud-meta`, {
      method: 'GET',
      headers: makeHeaders(accessToken),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      logger.debug(`☁️ Cloud meta failed (${res.status}): ${err.error}`);
      return null;
    }
    const data = await res.json();
    // Normalize: Railway server may return cloudProjectsList instead of cloudProjectIds
    const meta = data.meta || {};
    const cloudProjectIds = meta.cloudProjectIds || meta.cloudProjectsList || [];
    return {
      ...meta,
      cloudProjectIds,
      isAdmin: data.isAdmin ?? false,
      isTemplateAdmin: data.isTemplateAdmin ?? false,
      cloudProjectLimit: data.cloudProjectLimit !== undefined ? data.cloudProjectLimit : 20,
    };
  } catch (e) {
    logger.debug(`Cloud meta error: ${e}`);
    return null;
  }
}

// ── Internal helpers ──

async function flushDirtyProjects(): Promise<boolean> {
  if (state.isSyncing) return false;
  if (!state.accessToken || !getProjectSnapshot) return false;
  if (state.dirtyProjectIds.size === 0) return true;
  if (!state.isOnline) {
    logger.debug('☁️ Offline — skipping sync');
    return false;
  }

  state.isSyncing = true;
  state.lastSyncAttempt = Date.now();
  onSyncStart?.();

  const projectIds = [...state.dirtyProjectIds];
  const snapshots: { projectId: string; snapshot: ProjectSnapshot }[] = [];
  const staleIds: string[] = [];

  for (const pid of projectIds) {
    const snapshot = getProjectSnapshot(pid);
    if (snapshot) {
      snapshots.push({ projectId: pid, snapshot });
    } else {
      // Project no longer exists (deleted) — mark as stale
      staleIds.push(pid);
    }
  }

  // Remove stale (deleted) projects from dirty set
  if (staleIds.length > 0) {
    for (const pid of staleIds) {
      state.dirtyProjectIds.delete(pid);
    }
    logger.debug(`☁️ Removed ${staleIds.length} stale project(s) from dirty set`);
  }

  if (snapshots.length === 0) {
    // All dirty projects returned null snapshots (e.g. local-only or deleted).
    saveDirtyState();
    state.isSyncing = false;
    onSyncComplete?.(true, projectIds);
    return true;
  }

  try {
    // Use batch sync for efficiency
    let res = await safeFetch(`${SERVER_BASE}/sync-batch`, {
      method: 'POST',
      headers: makeHeaders(state.accessToken, true),
      body: JSON.stringify({ projects: snapshots }),
    });

    // ── 401 Unauthorized: attempt token refresh and retry once ──
    if (res.status === 401 && onTokenExpired) {
      logger.debug('☁️ Sync got 401 — attempting token refresh…');
      const newToken = await onTokenExpired();
      if (newToken) {
        state.accessToken = newToken;
        res = await safeFetch(`${SERVER_BASE}/sync-batch`, {
          method: 'POST',
          headers: makeHeaders(newToken, true),
          body: JSON.stringify({ projects: snapshots }),
        });
      }
    }

    // ── 403 Forbidden: fall back to individual project syncs ──
    // One unregistered project in the batch fails the whole request,
    // so retry each project individually to save the ones that work.
    if (res.status === 403 && snapshots.length > 1) {
      const err403 = await res.json().catch(() => ({ error: 'Unknown' }));
      logger.debug(`☁️ Batch sync 403 — falling back to individual syncs: ${err403.error}`);
      let anySuccess = false;
      const successPids: string[] = [];
      const timestamps: Record<string, number> = {};
      for (const { projectId: pid, snapshot } of snapshots) {
        try {
          const indRes = await safeFetch(`${SERVER_BASE}/sync`, {
            method: 'POST',
            headers: makeHeaders(state.accessToken, true),
            body: JSON.stringify({ projectId: pid, snapshot }),
          }, 1); // 1 retry for individual syncs
          if (indRes.ok) {
            const indResult = await indRes.json();
            state.dirtyProjectIds.delete(pid);
            anySuccess = true;
            successPids.push(pid);
            if (indResult.syncedAt) timestamps[pid] = indResult.syncedAt;
          } else {
            const indErr = await indRes.json().catch(() => ({ error: 'Unknown' }));
            logger.debug(`☁️ Individual sync failed for ${pid} (${indRes.status}): ${indErr.error}`);
            // If 403 for this specific project, remove it from dirty set
            // to prevent it from blocking future batch syncs
            if (indRes.status === 403) {
              state.dirtyProjectIds.delete(pid);
              logger.debug(`☁️ Removed unregistered project ${pid} from dirty set`);
            }
          }
        } catch (indE) {
          logger.debug(`☁️ Individual sync error for ${pid}: ${indE}`);
        }
      }
      saveDirtyState();
      if (successPids.length > 0 && onProjectsSynced) {
        onProjectsSynced(successPids, timestamps);
      }
      if (anySuccess) {
        logger.debug(`☁️ Individual sync: ${successPids.length}/${snapshots.length} succeeded`);
        onSyncComplete?.(state.dirtyProjectIds.size === 0, projectIds);
      } else {
        onSyncError?.(`Sync failed: ${err403.error}`);
        onSyncComplete?.(false, projectIds);
      }
      state.isSyncing = false;
      return anySuccess;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      logger.debug(`☁️ Batch sync failed (${res.status}): ${err.error}`);
      onSyncError?.(`Sync failed (${res.status}): ${err.error}`);
      state.isSyncing = false;
      onSyncComplete?.(false, projectIds);
      return false;
    }

    const result = await res.json();

    // Clear dirty flags for synced projects
    for (const pid of projectIds) {
      state.dirtyProjectIds.delete(pid);
    }
    saveDirtyState();

    // Notify about sync timestamps
    if (onProjectsSynced && result.syncedAt) {
      const timestamps: Record<string, number> = {};
      for (const pid of projectIds) {
        timestamps[pid] = result.syncedAt;
      }
      onProjectsSynced(projectIds, timestamps);
    }

    logger.debug(`☁️ Batch sync complete: ${projectIds.length} projects`);
    onSyncComplete?.(true, projectIds);
    state.isSyncing = false;
    return true;
  } catch (e) {
    logger.debug(`☁️ Batch sync error: ${e}`);
    onSyncError?.(`Sync error: ${e}`);
    state.isSyncing = false;
    onSyncComplete?.(false, projectIds);
    return false;
  }
}

function handleOnline() {
  state.isOnline = true;
  logger.debug('☁️ Back online — will sync on next interval');
  // Sync soon after coming back online
  setTimeout(() => flushDirtyProjects(), 5000);
}

function handleOffline() {
  state.isOnline = false;
  logger.debug('☁️ Offline — sync paused');
}

function handleBeforeUnload() {
  // Best-effort sync on page unload using sendBeacon or keepalive fetch
  if (state.dirtyProjectIds.size === 0 || !state.accessToken || !getProjectSnapshot) return;

  const projectIds = [...state.dirtyProjectIds];
  const snapshots: { projectId: string; snapshot: ProjectSnapshot }[] = [];

  for (const pid of projectIds) {
    const snapshot = getProjectSnapshot(pid);
    if (snapshot) {
      snapshots.push({ projectId: pid, snapshot });
    }
  }

  if (snapshots.length === 0) return;

  // Try fetch with keepalive (works up to 64KB)
  // NOTE: sendBeacon cannot send custom headers (Authorization, X-User-Token),
  // so we always prefer keepalive fetch. If the payload is too large, we just
  // rely on localStorage dirty state to retry on the next app load.
  try {
    const body = JSON.stringify({ projects: snapshots });
    
    if (body.length < 60000) {
      fetch(`${SERVER_BASE}/sync-batch`, {
        method: 'POST',
        headers: makeHeaders(state.accessToken, true),
        body,
        keepalive: true,
      }).catch(() => {});
    }
    // For larger payloads, dirty state is persisted in localStorage
    // and will be synced on next app load — no sendBeacon (lacks auth headers).
  } catch {
    // Dirty state is already saved in localStorage; will be retried on next app load
    logger.debug('☁️ beforeunload sync failed — will retry on next load');
  }
}

function saveDirtyState() {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...state.dirtyProjectIds]));
  } catch { /* ignore */ }
}

function loadDirtyState() {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    if (raw) {
      const ids: string[] = JSON.parse(raw);
      ids.forEach(id => state.dirtyProjectIds.add(id));
    }
  } catch { /* ignore */ }
}

// ── Idle-based auto-save ──
// Tracks user activity; when the user is idle for IDLE_SAVE_MS (30 s) and there
// are dirty projects, trigger a cloud flush automatically.

function _resetIdleTimer() {
  _lastActivityTs = Date.now();
  if (_idleTimerId) clearTimeout(_idleTimerId);
  _idleTimerId = setTimeout(_onIdleTick, IDLE_SAVE_MS);
}

function _onIdleTick() {
  _idleTimerId = null;
  if (state.dirtyProjectIds.size > 0 && state.accessToken && state.isOnline) {
    logger.debug('☁️ User idle for 30 s — auto-saving dirty projects to cloud');
    flushDirtyProjects();
  }
}

function _handleUserActivity() {
  _resetIdleTimer();
}

function _handleVisibilityChange() {
  if (document.hidden) {
    // Tab going to background — start a 30 s idle timer; if user doesn't
    // come back, we flush dirty projects even while in the background.
    if (state.dirtyProjectIds.size > 0) {
      if (_idleTimerId) clearTimeout(_idleTimerId);
      _idleTimerId = setTimeout(() => {
        if (state.dirtyProjectIds.size > 0 && state.accessToken && state.isOnline) {
          logger.debug('☁️ Tab hidden for 30 s — auto-saving dirty projects to cloud');
          flushDirtyProjects();
        }
      }, IDLE_SAVE_MS);
    }
  } else {
    // Tab coming back — reset idle timer
    _resetIdleTimer();

    // Check for remote changes when tab regains focus.
    // This handles the "edited on laptop, now on desktop" scenario:
    // the server may have newer data from another device/browser.
    if (state.accessToken && state.isOnline && isTabLeader()) {
      logger.debug('☁️ Tab visible — checking for remote changes');
      onVisibilityResume?.();
    }
  }
}

/** Start idle & visibility tracking. Called once from initCloudSync or from App. */
export function startIdleTracking() {
  if (_idleListenersAttached || typeof window === 'undefined') return;
  _idleListenersAttached = true;

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
  for (const evt of events) {
    window.addEventListener(evt, _handleUserActivity, { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', _handleVisibilityChange);

  // Kick off the first idle timer
  _resetIdleTimer();
  logger.debug('☁️ Idle tracking started (30 s threshold)');
}

/** Stop idle & visibility tracking. Called from destroyCloudSync or cleanup. */
export function stopIdleTracking() {
  if (!_idleListenersAttached || typeof window === 'undefined') return;
  _idleListenersAttached = false;

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
  for (const evt of events) {
    window.removeEventListener(evt, _handleUserActivity, { capture: true });
  }
  document.removeEventListener('visibilitychange', _handleVisibilityChange);

  if (_idleTimerId) {
    clearTimeout(_idleTimerId);
    _idleTimerId = null;
  }
  logger.debug('☁️ Idle tracking stopped');
}

/** Check if any cloud project has unsaved local changes (dirty flag set). */
export function hasDirtyProjects(): boolean {
  return state.dirtyProjectIds.size > 0;
}

/** Clear ALL dirty flags — used on session start to remove stale flags
 *  from previous sessions that didn't flush properly. */
export function clearAllDirtyFlags() {
  state.dirtyProjectIds.clear();
  saveDirtyState();
}

/** Get all dirty project IDs (for pre-reconcile flush). */
export function getDirtyProjectIds(): string[] {
  return [...state.dirtyProjectIds];
}