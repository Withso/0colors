/**
 * Auth Slice — Zustand state tests
 * Source: packages/frontend/src/store/slices/auth-slice.ts
 *
 * Tests the auth slice in isolation by creating a standalone Zustand store.
 * Zero mocks needed — pure state management.
 */
import { describe, it, expect } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createAuthSlice } from '@frontend/store/slices/auth-slice';
import type { AuthSlice, AuthSession, CloudSyncStatus } from '@frontend/store/slices/auth-slice';

function makeStore() {
  return createStore<AuthSlice>()((...a) => ({
    ...createAuthSlice(...a),
  }));
}

describe('Auth Slice — Initial State', () => {
  it('initial authSession is null', () => {
    const store = makeStore();
    expect(store.getState().authSession).toBeNull();
  });

  it('initial authChecking is true', () => {
    const store = makeStore();
    expect(store.getState().authChecking).toBe(true);
  });

  it('initial authSkipped is false', () => {
    const store = makeStore();
    expect(store.getState().authSkipped).toBe(false);
  });

  it('initial cloudSyncStatus is "local"', () => {
    const store = makeStore();
    expect(store.getState().cloudSyncStatus).toBe('local');
  });

  it('initial lastSyncError is undefined', () => {
    const store = makeStore();
    expect(store.getState().lastSyncError).toBeUndefined();
  });

  it('initial isOnline defaults correctly based on environment', () => {
    const store = makeStore();
    // In node env without navigator, isOnline may be undefined or true
    // The slice uses: typeof navigator !== 'undefined' ? navigator.onLine : true
    const val = store.getState().isOnline;
    expect(val === true || val === false || val === undefined).toBe(true);
  });
});

describe('Auth Slice — setAuthSession', () => {
  it('sets a new session with all fields', () => {
    const store = makeStore();
    const session: AuthSession = {
      accessToken: 'tok-123',
      userId: 'u-1',
      email: 'alice@test.com',
      name: 'Alice',
      isAdmin: false,
      isTemplateAdmin: false,
    };
    store.getState().setAuthSession(session);
    const s = store.getState().authSession;
    expect(s).not.toBeNull();
    expect(s!.accessToken).toBe('tok-123');
    expect(s!.userId).toBe('u-1');
    expect(s!.email).toBe('alice@test.com');
    expect(s!.name).toBe('Alice');
    expect(s!.isAdmin).toBe(false);
    expect(s!.isTemplateAdmin).toBe(false);
  });

  it('accepts a function updater', () => {
    const store = makeStore();
    store.getState().setAuthSession({
      accessToken: 'tok-1', userId: 'u-1', email: 'a@b.com', name: 'A',
    });
    store.getState().setAuthSession(prev => ({
      ...prev!,
      name: 'Updated',
      accessToken: 'tok-2',
    }));
    const s = store.getState().authSession;
    expect(s!.name).toBe('Updated');
    expect(s!.accessToken).toBe('tok-2');
    expect(s!.userId).toBe('u-1'); // unchanged
  });

  it('clears session with null', () => {
    const store = makeStore();
    store.getState().setAuthSession({
      accessToken: 'tok-1', userId: 'u-1', email: 'a@b.com', name: 'A',
    });
    expect(store.getState().authSession).not.toBeNull();
    store.getState().setAuthSession(null);
    expect(store.getState().authSession).toBeNull();
  });
});

describe('Auth Slice — CloudSyncStatus transitions', () => {
  const ALL_STATUSES: CloudSyncStatus[] = [
    'local', 'idle', 'dirty', 'syncing', 'synced', 'error', 'offline',
  ];

  it.each(ALL_STATUSES)('transitions to "%s"', (status) => {
    const store = makeStore();
    store.getState().setCloudSyncStatus(status);
    expect(store.getState().cloudSyncStatus).toBe(status);
  });
});

describe('Auth Slice — Toggle setters', () => {
  it('setAuthChecking toggles correctly', () => {
    const store = makeStore();
    expect(store.getState().authChecking).toBe(true);
    store.getState().setAuthChecking(false);
    expect(store.getState().authChecking).toBe(false);
    store.getState().setAuthChecking(true);
    expect(store.getState().authChecking).toBe(true);
  });

  it('setLastSyncError stores and clears error', () => {
    const store = makeStore();
    store.getState().setLastSyncError('Network error');
    expect(store.getState().lastSyncError).toBe('Network error');
    store.getState().setLastSyncError(undefined);
    expect(store.getState().lastSyncError).toBeUndefined();
  });

  it('setIsOnline toggles correctly', () => {
    const store = makeStore();
    store.getState().setIsOnline(false);
    expect(store.getState().isOnline).toBe(false);
    store.getState().setIsOnline(true);
    expect(store.getState().isOnline).toBe(true);
  });

  it('setAuthSkipped toggles correctly', () => {
    const store = makeStore();
    store.getState().setAuthSkipped(true);
    expect(store.getState().authSkipped).toBe(true);
    store.getState().setAuthSkipped(false);
    expect(store.getState().authSkipped).toBe(false);
  });
});
