/**
 * Session Lock Manager — Singleton (NOT a React hook)
 *
 * Runs outside React's lifecycle to avoid all timing issues:
 * - No useEffect dependency arrays
 * - No React Strict Mode double-mounting
 * - No stale closures
 * - No missed re-renders
 *
 * The App calls lockManager.setActiveProject(id) when the user
 * navigates to a cloud project. The manager handles everything else.
 *
 * Uses SSE for instant takeover detection + heartbeat to keep lock alive.
 */

import { SERVER_BASE } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

// ── Types ──
export type LockEvent =
  | { type: 'conflict'; projectId: string }
  | { type: 'taken-over'; projectId: string }
  | { type: 'cleared' };

type LockEventCallback = (event: LockEvent) => void;

// ── Singleton state ──
const SESSION_ID = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

let _currentProjectId: string | null = null;
let _lockedProjectId: string | null = null;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _eventSource: EventSource | null = null;
let _listeners: Set<LockEventCallback> = new Set();
let _getToken: (() => string | null) = () => null;

function makeHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = {
    'Authorization': `Bearer ${publicAnonKey}`,
    'X-User-Token': token,
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function emit(event: LockEvent) {
  for (const cb of _listeners) {
    try { cb(event); } catch {}
  }
}

// ── SSE connection ──
function connectSSE(projectId: string) {
  closeSSE();
  try {
    const url = `${SERVER_BASE}/project-lock-stream/${encodeURIComponent(projectId)}?sessionId=${encodeURIComponent(SESSION_ID)}`;
    _eventSource = new EventSource(url);

    _eventSource.addEventListener('lock-taken-over', () => {
      console.log(`[Lock] SSE: lock taken over for ${projectId}`);
      _lockedProjectId = null;
      stopHeartbeat();
      emit({ type: 'taken-over', projectId });
    });

    _eventSource.addEventListener('lock-acquired', () => {
      console.log(`[Lock] SSE: lock acquired by another session for ${projectId}`);
      _lockedProjectId = null;
      stopHeartbeat();
      emit({ type: 'taken-over', projectId });
    });

    _eventSource.addEventListener('connected', () => {
      console.log(`[Lock] SSE connected for ${projectId}`);
    });
  } catch (err) {
    console.log(`[Lock] SSE connection failed:`, err);
  }
}

function closeSSE() {
  if (_eventSource) {
    _eventSource.close();
    _eventSource = null;
  }
}

// ── Heartbeat ──
function startHeartbeat(projectId: string) {
  stopHeartbeat();
  _heartbeatTimer = setInterval(async () => {
    const token = _getToken();
    if (!token || _lockedProjectId !== projectId) {
      stopHeartbeat();
      return;
    }
    try {
      const res = await fetch(`${SERVER_BASE}/project-lock-heartbeat`, {
        method: 'POST',
        headers: makeHeaders(token, true),
        body: JSON.stringify({ projectId, sessionId: SESSION_ID }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.ok) {
          // Lock taken over (detected via heartbeat, SSE should have caught it first)
          _lockedProjectId = null;
          stopHeartbeat();
          emit({ type: 'taken-over', projectId });
        }
      }
    } catch {}
  }, 15_000);
}

function stopHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
}

// ── Lock operations ──
async function acquireLock(projectId: string): Promise<boolean> {
  const token = _getToken();
  if (!token) {
    console.log(`[Lock] No token — cannot acquire lock for ${projectId}`);
    return false;
  }

  console.log(`[Lock] Acquiring lock: project=${projectId}, session=${SESSION_ID}`);
  try {
    const res = await fetch(`${SERVER_BASE}/project-lock`, {
      method: 'POST',
      headers: makeHeaders(token, true),
      body: JSON.stringify({ projectId, sessionId: SESSION_ID }),
    });
    const data = await res.json();
    console.log(`[Lock] Acquire response:`, JSON.stringify(data));

    if (data.locked) {
      _lockedProjectId = projectId;
      startHeartbeat(projectId);
      connectSSE(projectId);
      emit({ type: 'cleared' });
      return true;
    } else {
      // Another session has the lock
      connectSSE(projectId); // Listen for changes
      emit({ type: 'conflict', projectId });
      return false;
    }
  } catch (err) {
    console.log(`[Lock] Acquire failed:`, err);
    return false;
  }
}

async function releaseLock(projectId: string) {
  const token = _getToken();
  _lockedProjectId = null;
  stopHeartbeat();
  closeSSE();

  if (!token) return;
  console.log(`[Lock] Releasing lock: project=${projectId}`);
  try {
    await fetch(`${SERVER_BASE}/project-unlock`, {
      method: 'POST',
      headers: makeHeaders(token, true),
      body: JSON.stringify({ projectId, sessionId: SESSION_ID }),
    });
  } catch {}
}

// ── Public API ──
export const lockManager = {
  /** Set the token getter (call once from App on mount) */
  setTokenGetter(getter: () => string | null) {
    _getToken = getter;
  },

  /** Subscribe to lock events. Returns unsubscribe function. */
  subscribe(callback: LockEventCallback): () => void {
    _listeners.add(callback);
    return () => _listeners.delete(callback);
  },

  /** Call when user navigates to a project. Pass null when leaving project view. */
  async setActiveProject(projectId: string | null, isCloud: boolean) {
    // Same project — no change
    if (projectId === _currentProjectId) return;

    // Release old lock
    if (_lockedProjectId) {
      await releaseLock(_lockedProjectId);
    }
    closeSSE();
    _currentProjectId = projectId;

    // No project or not cloud — clear
    if (!projectId || !isCloud) {
      emit({ type: 'cleared' });
      return;
    }

    // Acquire lock for new project
    await acquireLock(projectId);
  },

  /** Force-take the lock (user clicked "Open here") */
  async forceTake(projectId: string) {
    const token = _getToken();
    if (!token) return false;

    console.log(`[Lock] Force-taking lock: project=${projectId}`);
    try {
      const res = await fetch(`${SERVER_BASE}/project-lock-force`, {
        method: 'POST',
        headers: makeHeaders(token, true),
        body: JSON.stringify({ projectId, sessionId: SESSION_ID }),
      });
      const data = await res.json();
      if (data.ok) {
        _lockedProjectId = projectId;
        _currentProjectId = projectId;
        startHeartbeat(projectId);
        connectSSE(projectId);
        emit({ type: 'cleared' });
        return true;
      }
    } catch {}
    return false;
  },

  /** Get current lock state */
  get isLocked() { return _lockedProjectId !== null; },
  get currentProject() { return _currentProjectId; },
  get sessionId() { return SESSION_ID; },
};

// Release lock on page close
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    closeSSE();
    if (_lockedProjectId) {
      const token = _getToken();
      if (token) {
        const body = JSON.stringify({ projectId: _lockedProjectId, sessionId: SESSION_ID });
        try {
          fetch(`${SERVER_BASE}/project-unlock`, {
            method: 'POST',
            headers: makeHeaders(token, true),
            body,
            keepalive: true,
          }).catch(() => {});
        } catch {}
      }
    }
  });
}
