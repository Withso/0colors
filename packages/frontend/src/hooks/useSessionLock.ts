/**
 * useSessionLock — Session locking for cloud projects.
 *
 * Lock acquisition is called IMPERATIVELY from:
 *   - handleSelectProject (user clicks a project)
 *   - URL routing handler (page load / refresh)
 * This avoids all React timing issues.
 *
 * This hook provides:
 *   - lockState for the dialog UI
 *   - forceTakeLock for the "Open here" button
 *   - SSE listener for instant takeover detection
 *   - Heartbeat to keep the lock alive
 *   - Cleanup on unmount
 *
 * The lockManager singleton (sync/session-lock.ts) handles the actual API calls
 * and SSE connection. This hook just bridges it to React state.
 */

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store';
import { lockManager, type LockEvent } from '../sync/session-lock';

export type LockState =
  | null
  | { type: 'conflict'; projectId: string }
  | { type: 'taken-over'; projectId: string };

export function useSessionLock() {
  const [lockState, setLockState] = useState<LockState>(null);

  // Set token getter (reads from Zustand store — always has the latest refreshed token)
  useEffect(() => {
    lockManager.setTokenGetter(() => useStore.getState().authSession?.accessToken || null);
  }, []);

  // Subscribe to lock events from the manager
  useEffect(() => {
    return lockManager.subscribe((event: LockEvent) => {
      if (event.type === 'cleared') {
        setLockState(null);
      } else {
        setLockState(event);
      }
    });
  }, []);

  // Clear stale lock state when active project changes
  const activeProjectId = useStore(s => s.activeProjectId);
  useEffect(() => {
    if (lockState && lockState.projectId !== activeProjectId) {
      setLockState(null);
    }
  }, [activeProjectId, lockState]);

  // Force-take lock (user clicked "Open here")
  const forceTakeLock = useCallback(async () => {
    if (!lockState) return;
    await lockManager.forceTake(lockState.projectId);
  }, [lockState]);

  const dismissLockState = useCallback(() => setLockState(null), []);

  return { lockState, forceTakeLock, dismissLockState, sessionId: lockManager.sessionId };
}
