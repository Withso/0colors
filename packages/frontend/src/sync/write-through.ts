/**
 * Write-Through Sync Service
 *
 * Replaces the old lazy sync (1s debounce → IndexedDB, 3s debounce → cloud).
 * Every state change saves to BOTH IndexedDB and cloud simultaneously.
 *
 * Architecture:
 *   Action → Zustand setState
 *     → 500ms debounce per project (collapses rapid edits)
 *       → Save to IndexedDB (async, instant for UI)
 *       → POST to cloud (async, parallel)
 *           ├── Online: success → mark synced
 *           └── Offline: queue in IndexedDB → auto-retry on reconnect
 *
 * The 500ms debounce prevents hammering the server during rapid edits
 * (e.g., dragging a node) while still feeling instant to the user.
 */

import { SERVER_BASE } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { db, saveProjectEntities } from '../db';
import type { ProjectSnapshot } from '../utils/supabase/cloud-sync';
import { broadcastChange } from './tab-channel';

// ── Types ──
interface QueueEntry {
  projectId: string;
  timestamp: number;
  retryCount: number;
}

// ── State ──
let _getToken: () => string | null = () => null;
let _getSnapshot: ((projectId: string) => ProjectSnapshot | null) | null = null;
let _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
const _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const _syncQueue: QueueEntry[] = []; // In-memory queue for offline entries
let _queueFlushTimer: ReturnType<typeof setTimeout> | null = null;
let _onSyncStatusChange: ((status: 'syncing' | 'synced' | 'error' | 'offline') => void) | null = null;
let _onProjectSynced: ((projectId: string, syncedAt: number) => void) | null = null;

const DEBOUNCE_MS = 300; // 300ms per-project debounce — fast enough to feel instant
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000; // Exponential backoff: 2s, 4s, 8s

function makeHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${publicAnonKey}`,
    'X-User-Token': token,
    'Content-Type': 'application/json',
  };
}

// Callback invoked after online queue flush completes — triggers cloud data pull
let _onReconnected: (() => void) | null = null;

// ── Online/Offline detection ──
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    _isOnline = true;
    console.log('[Sync] Back online — flushing queue then pulling latest from cloud');
    await flushQueue();
    // After flushing local changes, pull latest from cloud (another device may have edited)
    _onReconnected?.();
  });
  window.addEventListener('offline', () => {
    _isOnline = false;
    console.log('[Sync] Offline — changes will queue locally');
    _onSyncStatusChange?.('offline');
  });
}

// ── Public API ──

export function initWriteThrough(config: {
  getToken: () => string | null;
  getSnapshot: (projectId: string) => ProjectSnapshot | null;
  onSyncStatusChange?: (status: 'syncing' | 'synced' | 'error' | 'offline') => void;
  onProjectSynced?: (projectId: string, syncedAt: number) => void;
  onReconnected?: () => void;
}) {
  _getToken = config.getToken;
  _getSnapshot = config.getSnapshot;
  _onSyncStatusChange = config.onSyncStatusChange || null;
  _onProjectSynced = config.onProjectSynced || null;
  _onReconnected = config.onReconnected || null;
}

/**
 * Called when a project's data changes.
 * Debounces per-project to collapse rapid edits (dragging, slider scrubbing).
 *
 * The debounce resets on each call. If no new calls come within DEBOUNCE_MS,
 * the sync fires. This means:
 * - Dragging a node: many calls, only one sync after dragging stops (500ms)
 * - Deleting a node: one call, sync fires after 500ms
 *
 * For the best UX, the 500ms is short enough to feel instant for discrete
 * actions while preventing server hammering during continuous ones.
 */
export function syncProject(projectId: string) {
  // Cancel existing debounce for this project
  const existing = _debounceTimers.get(projectId);
  if (existing) clearTimeout(existing);

  // Set new debounce
  _debounceTimers.set(projectId, setTimeout(() => {
    _debounceTimers.delete(projectId);
    executeSyncForProject(projectId);
  }, DEBOUNCE_MS));
}

/**
 * Sync immediately with no debounce. For discrete actions (delete, create, rename)
 * where the user expects instant feedback.
 */
export function syncProjectNow(projectId: string) {
  const existing = _debounceTimers.get(projectId);
  if (existing) {
    clearTimeout(existing);
    _debounceTimers.delete(projectId);
  }
  executeSyncForProject(projectId);
}

/**
 * Force immediate sync (no debounce). Used before page close or project switch.
 */
export async function forceSyncProject(projectId: string): Promise<boolean> {
  // Cancel any pending debounce
  const existing = _debounceTimers.get(projectId);
  if (existing) {
    clearTimeout(existing);
    _debounceTimers.delete(projectId);
  }
  return executeSyncForProject(projectId);
}

/**
 * Force sync all pending projects. Used before navigation.
 */
export async function forceSyncAll(): Promise<void> {
  // Cancel all debounce timers and sync immediately
  for (const [projectId, timer] of _debounceTimers) {
    clearTimeout(timer);
    _debounceTimers.delete(projectId);
    await executeSyncForProject(projectId);
  }
  // Also flush any queued offline entries
  await flushQueue();
}

export function destroyWriteThrough() {
  for (const timer of _debounceTimers.values()) clearTimeout(timer);
  _debounceTimers.clear();
  if (_queueFlushTimer) clearTimeout(_queueFlushTimer);
}

// ── Core sync execution ──

async function executeSyncForProject(projectId: string): Promise<boolean> {
  if (!_getSnapshot) return false;

  const snapshot = _getSnapshot(projectId);
  if (!snapshot) return false;

  // SAFETY: Never save an empty snapshot (0 nodes AND 0 tokens AND 0 groups).
  // This prevents data loss when the store is in a transitional state
  // (e.g., during template switch or reconciliation).
  if (snapshot.nodes.length === 0 && snapshot.tokens.length === 0 && snapshot.groups.length === 0) {
    console.warn(`[Sync] BLOCKED: refusing to save empty snapshot for ${projectId} (${snapshot.project?.name})`);
    return false;
  }

  _onSyncStatusChange?.('syncing');

  // Save to IndexedDB (always — even if cloud fails)
  try {
    await saveProjectEntities(projectId, {
      project: snapshot.project,
      nodes: snapshot.nodes,
      tokens: snapshot.tokens,
      groups: snapshot.groups,
      pages: snapshot.pages,
      themes: snapshot.themes,
      canvasStates: snapshot.canvasStates,
      advancedLogic: snapshot.advancedLogic,
    });
  } catch (err) {
    console.error('[Sync] IndexedDB save failed:', err);
  }

  // Broadcast to other tabs
  broadcastChange(projectId, ['nodes', 'tokens', 'groups', 'pages', 'themes']);

  // Save to cloud
  if (!_isOnline) {
    addToQueue(projectId);
    _onSyncStatusChange?.('offline');
    return false;
  }

  const token = _getToken();
  if (!token) {
    addToQueue(projectId);
    return false;
  }

  try {
    const res = await fetch(`${SERVER_BASE}/sync`, {
      method: 'POST',
      headers: makeHeaders(token),
      body: JSON.stringify({ projectId, snapshot }),
    });

    if (res.ok) {
      const syncedAt = Date.now();
      _onProjectSynced?.(projectId, syncedAt);
      _onSyncStatusChange?.('synced');
      return true;
    }

    if (res.status === 401) {
      // Token expired — queue for later
      console.log('[Sync] 401 — token expired, queuing');
      addToQueue(projectId);
      return false;
    }

    // Server error — queue for retry
    console.log(`[Sync] Server error ${res.status} — queuing`);
    addToQueue(projectId);
    _onSyncStatusChange?.('error');
    return false;
  } catch (err) {
    // Network error — queue for retry
    console.log('[Sync] Network error — queuing');
    addToQueue(projectId);
    _onSyncStatusChange?.(_isOnline ? 'error' : 'offline');
    return false;
  }
}

// ── Offline Queue ──

function addToQueue(projectId: string) {
  // Deduplicate — only keep the latest entry per project
  const existingIdx = _syncQueue.findIndex(e => e.projectId === projectId);
  if (existingIdx >= 0) {
    _syncQueue[existingIdx].timestamp = Date.now();
    _syncQueue[existingIdx].retryCount = 0;
  } else {
    _syncQueue.push({ projectId, timestamp: Date.now(), retryCount: 0 });
  }
}

async function flushQueue() {
  if (_syncQueue.length === 0) return;
  if (!_isOnline) return;

  const token = _getToken();
  if (!token) return;

  console.log(`[Sync] Flushing ${_syncQueue.length} queued project(s)`);
  _onSyncStatusChange?.('syncing');

  // Process oldest first
  const toProcess = [..._syncQueue];
  _syncQueue.length = 0;

  for (const entry of toProcess) {
    if (!_getSnapshot) continue;
    const snapshot = _getSnapshot(entry.projectId);
    if (!snapshot) continue;

    try {
      const res = await fetch(`${SERVER_BASE}/sync`, {
        method: 'POST',
        headers: makeHeaders(token),
        body: JSON.stringify({ projectId: entry.projectId, snapshot }),
      });

      if (!res.ok) {
        // Re-queue with incremented retry count
        if (entry.retryCount < MAX_RETRIES) {
          _syncQueue.push({ ...entry, retryCount: entry.retryCount + 1 });
        } else {
          console.error(`[Sync] Giving up on ${entry.projectId} after ${MAX_RETRIES} retries`);
        }
      }
    } catch {
      // Network error — re-queue
      if (entry.retryCount < MAX_RETRIES) {
        _syncQueue.push({ ...entry, retryCount: entry.retryCount + 1 });
      }
    }
  }

  if (_syncQueue.length === 0) {
    _onSyncStatusChange?.('synced');
  } else {
    // Schedule retry with exponential backoff
    const maxRetry = Math.max(..._syncQueue.map(e => e.retryCount));
    const delay = RETRY_BASE_MS * Math.pow(2, maxRetry - 1);
    _queueFlushTimer = setTimeout(flushQueue, delay);
  }
}

// Release on page close — try to sync remaining
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    // Flush any pending debounced syncs
    for (const [projectId, timer] of _debounceTimers) {
      clearTimeout(timer);
      // Best-effort keepalive sync
      if (_getSnapshot && _getToken()) {
        const snapshot = _getSnapshot(projectId);
        const token = _getToken();
        if (snapshot && token) {
          const body = JSON.stringify({ projectId, snapshot });
          if (body.length < 60000) {
            try {
              fetch(`${SERVER_BASE}/sync`, {
                method: 'POST',
                headers: makeHeaders(token),
                body,
                keepalive: true,
              }).catch(() => {});
            } catch {}
          }
        }
      }
    }
    _debounceTimers.clear();
  });
}
