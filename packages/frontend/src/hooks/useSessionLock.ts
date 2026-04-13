/**
 * useSessionLock — Multi-tab/browser session locking
 *
 * Flow:
 * 1. User opens a cloud project → acquires lock on server
 * 2. Heartbeat every 15s keeps the lock alive AND checks if still held
 * 3. If another session force-takes the lock, heartbeat returns ok=false
 *    → old session shows "Session taken over" dialog
 * 4. User in new session sees project load normally
 * 5. Lock released on page close / project switch
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '../store';
import { SERVER_BASE } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

const SESSION_ID = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const HEARTBEAT_MS = 15_000; // 15s — fast enough to detect takeover quickly

function makeHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = {
    'Authorization': `Bearer ${publicAnonKey}`,
    'X-User-Token': token,
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export type LockState =
  | null                                          // No lock issue
  | { type: 'conflict'; projectId: string }       // Another session has the lock (new session dialog)
  | { type: 'taken-over'; projectId: string };    // This session's lock was taken by another (old session dialog)

export function useSessionLock() {
  const activeProjectId = useStore(s => s.activeProjectId);
  const authSession = useStore(s => s.authSession);
  const projects = useStore(s => s.projects);
  const isInitialLoad = useStore(s => s.isInitialLoad);

  const [lockState, setLockState] = useState<LockState>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockedProjectRef = useRef<string | null>(null);
  const authTokenRef = useRef(authSession?.accessToken);
  authTokenRef.current = authSession?.accessToken;

  const activeProject = projects.find(p => p.id === activeProjectId);
  const isCloudProject = activeProject?.isCloud === true && !activeProject?.isSample && !activeProject?.isTemplate;

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // Start heartbeat — also detects if lock was taken over.
  // Distinguishes network errors (retry silently) from actual lock takeover (show dialog).
  const startHeartbeat = useCallback((projectId: string) => {
    stopHeartbeat();
    let consecutiveFailures = 0;
    heartbeatRef.current = setInterval(async () => {
      const token = authTokenRef.current;
      if (!token) return;
      try {
        const res = await fetch(`${SERVER_BASE}/project-lock-heartbeat`, {
          method: 'POST',
          headers: makeHeaders(token, true),
          body: JSON.stringify({ projectId, sessionId: SESSION_ID }),
        });
        if (!res.ok) {
          // Server error (5XX) — network issue, retry silently
          consecutiveFailures++;
          return;
        }
        const data = await res.json();
        consecutiveFailures = 0; // Reset on successful response
        if (!data.ok) {
          // Lock genuinely taken over by another session
          stopHeartbeat();
          lockedProjectRef.current = null;
          setLockState({ type: 'taken-over', projectId });
        }
      } catch {
        // Network error (timeout, offline, etc.) — retry silently
        consecutiveFailures++;
        // Only show taken-over after 4 consecutive failures (60s of no contact)
        if (consecutiveFailures >= 4) {
          stopHeartbeat();
          lockedProjectRef.current = null;
          setLockState({ type: 'taken-over', projectId });
        }
      }
    }, HEARTBEAT_MS);
  }, [stopHeartbeat]);

  // Acquire lock
  const acquireLock = useCallback(async (projectId: string) => {
    const token = authTokenRef.current;
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_BASE}/project-lock`, {
        method: 'POST',
        headers: makeHeaders(token, true),
        body: JSON.stringify({ projectId, sessionId: SESSION_ID }),
      });
      const data = await res.json();
      if (data.locked) {
        lockedProjectRef.current = projectId;
        startHeartbeat(projectId);
        setLockState(null);
      } else {
        setLockState({ type: 'conflict', projectId });
      }
    } catch {
      // Network error — don't block the user
    }
  }, [startHeartbeat]);

  // Force-take lock (user chose "Continue here")
  const forceTakeLock = useCallback(async () => {
    if (!lockState || lockState.type !== 'conflict') return;
    const token = authTokenRef.current;
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_BASE}/project-lock-force`, {
        method: 'POST',
        headers: makeHeaders(token, true),
        body: JSON.stringify({ projectId: lockState.projectId, sessionId: SESSION_ID }),
      });
      const data = await res.json();
      if (data.ok) {
        lockedProjectRef.current = lockState.projectId;
        startHeartbeat(lockState.projectId);
        setLockState(null);
      }
    } catch {}
  }, [lockState, startHeartbeat]);

  // Release lock
  const releaseLock = useCallback(async (projectId: string) => {
    stopHeartbeat();
    lockedProjectRef.current = null;
    const token = authTokenRef.current;
    if (!token) return;
    try {
      await fetch(`${SERVER_BASE}/project-unlock`, {
        method: 'POST',
        headers: makeHeaders(token, true),
        body: JSON.stringify({ projectId, sessionId: SESSION_ID }),
      });
    } catch {}
  }, [stopHeartbeat]);

  // Auto-clear stale lock state when switching to a different project.
  // Without this, a conflict/taken-over dialog for Project A persists when
  // the user navigates to Project B.
  useEffect(() => {
    if (lockState && lockState.projectId !== activeProjectId) {
      setLockState(null);
    }
  }, [activeProjectId, lockState]);

  // Acquire/release on project change
  useEffect(() => {
    if (isInitialLoad || !isCloudProject || !authSession?.accessToken) return;

    // Release previous lock
    if (lockedProjectRef.current && lockedProjectRef.current !== activeProjectId) {
      releaseLock(lockedProjectRef.current);
    }

    // Acquire new lock
    acquireLock(activeProjectId);

    return () => {
      if (lockedProjectRef.current) {
        releaseLock(lockedProjectRef.current);
      }
    };
  }, [activeProjectId, isCloudProject, isInitialLoad, authSession?.accessToken]);

  // Release on page close
  useEffect(() => {
    const handleUnload = () => {
      if (lockedProjectRef.current && authTokenRef.current) {
        const body = JSON.stringify({ projectId: lockedProjectRef.current, sessionId: SESSION_ID });
        try {
          fetch(`${SERVER_BASE}/project-unlock`, {
            method: 'POST',
            headers: makeHeaders(authTokenRef.current, true),
            body,
            keepalive: true,
          }).catch(() => {});
        } catch {}
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const dismissLockState = useCallback(() => setLockState(null), []);

  return {
    lockState,
    forceTakeLock,
    dismissLockState,
    sessionId: SESSION_ID,
  };
}
