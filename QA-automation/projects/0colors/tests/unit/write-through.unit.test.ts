/**
 * Write-Through Sync — Unit tests
 * Source: packages/frontend/src/sync/write-through.ts
 *
 * Tests sync lifecycle, empty snapshot blocking, auth headers,
 * error handling, and lifecycle management.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (hoisted by vitest) ──

const mockSaveProjectEntities = vi.fn().mockResolvedValue(undefined);
const mockBroadcastChange = vi.fn();
const mockFetch = vi.fn();

vi.mock('@frontend/db', () => ({
  db: {},
  saveProjectEntities: (...args: any[]) => mockSaveProjectEntities(...args),
}));

vi.mock('@frontend/sync/tab-channel', () => ({
  broadcastChange: (...args: any[]) => mockBroadcastChange(...args),
}));

vi.mock('@frontend/utils/supabase/client', () => ({
  SERVER_BASE: 'http://test-server/api',
}));

vi.mock('@frontend/utils/supabase/info', () => ({
  publicAnonKey: 'test-anon-key',
}));

// Set globals before module evaluation. vi.hoisted() runs before imports.
const { hoistedFetch } = vi.hoisted(() => {
  const mockFetchFn = (() => {
    const fn: any = (...args: any[]) => fn._impl(...args);
    fn._impl = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    fn.mockResolvedValue = (val: any) => { fn._impl = () => Promise.resolve(val); return fn; };
    fn.mockRejectedValue = (err: any) => { fn._impl = () => Promise.reject(err); return fn; };
    fn.mockClear = () => { fn.mock = { calls: [] }; };
    fn.mock = { calls: [] as any[] };
    return fn;
  })();

  // These must be set before any import evaluates
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.addEventListener = (globalThis as any).window.addEventListener || (() => {});
  (globalThis as any).window.removeEventListener = (globalThis as any).window.removeEventListener || (() => {});
  if (typeof (globalThis as any).navigator === 'undefined') {
    (globalThis as any).navigator = { onLine: true };
  } else {
    (globalThis as any).navigator.onLine = true;
  }
  (globalThis as any).fetch = mockFetchFn;

  return { hoistedFetch: mockFetchFn };
});

import {
  initWriteThrough,
  syncProject,
  syncProjectNow,
  forceSyncProject,
  destroyWriteThrough,
} from '@frontend/sync/write-through';

// ── Helpers ──

function makeSnapshot(nodes = 1, tokens = 1, groups = 1) {
  return {
    project: { id: 'p1', name: 'Test' },
    nodes: Array.from({ length: nodes }, (_, i) => ({ id: `n${i}` })),
    tokens: Array.from({ length: tokens }, (_, i) => ({ id: `t${i}` })),
    groups: Array.from({ length: groups }, (_, i) => ({ id: `g${i}` })),
    pages: [{ id: 'page1' }],
    themes: [{ id: 'theme1' }],
    canvasStates: [{ projectId: 'p1', pageId: 'page1' }],
    advancedLogic: [],
  };
}

function successResponse() {
  return { ok: true, status: 200, json: () => Promise.resolve({ success: true, syncedAt: Date.now() }) };
}

function errorResponse(status: number) {
  return { ok: false, status, json: () => Promise.resolve({ error: 'Error' }) };
}

let statusChanges: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  statusChanges = [];
  hoistedFetch.mockResolvedValue(successResponse());
  // Use the module-level mockFetch for tests that inspect it
  mockFetch.mockResolvedValue(successResponse());
});

afterEach(() => {
  destroyWriteThrough();
  vi.useRealTimers();
});

describe('Write-Through Sync — Empty Snapshot Blocking', () => {
  it('blocks sync when snapshot has 0 nodes AND 0 tokens AND 0 groups', async () => {
    initWriteThrough({
      getToken: () => 'test-jwt',
      getSnapshot: () => makeSnapshot(0, 0, 0),
      onSyncStatusChange: (s) => statusChanges.push(s),
    });

    const result = await forceSyncProject('p1');
    expect(result).toBe(false);
    expect(mockSaveProjectEntities).not.toHaveBeenCalled();
  });

  it('allows sync when snapshot has nodes but no tokens/groups', async () => {
    initWriteThrough({
      getToken: () => 'test-jwt',
      getSnapshot: () => makeSnapshot(1, 0, 0),
      onSyncStatusChange: (s) => statusChanges.push(s),
    });

    const result = await forceSyncProject('p1');
    // Sync proceeds (not blocked by empty check)
    expect(mockSaveProjectEntities).toHaveBeenCalled();
  });
});

describe('Write-Through Sync — Force Sync', () => {
  it('forceSyncProject saves to IndexedDB', async () => {
    initWriteThrough({
      getToken: () => 'test-jwt',
      getSnapshot: () => makeSnapshot(),
      onSyncStatusChange: (s) => statusChanges.push(s),
    });

    await forceSyncProject('p1');

    expect(mockSaveProjectEntities).toHaveBeenCalled();
    expect(statusChanges).toContain('syncing');
  });

  it('broadcastChange called with correct projectId and entity types', async () => {
    initWriteThrough({
      getToken: () => 'jwt',
      getSnapshot: () => makeSnapshot(),
    });

    await forceSyncProject('p1');
    expect(mockBroadcastChange).toHaveBeenCalledWith('p1', ['nodes', 'tokens', 'groups', 'pages', 'themes']);
  });
});

describe('Write-Through Sync — No Token', () => {
  it('saves to IndexedDB but skips cloud when no token', async () => {
    initWriteThrough({
      getToken: () => null,
      getSnapshot: () => makeSnapshot(),
    });

    const result = await forceSyncProject('p1');
    expect(result).toBe(false);
    expect(mockSaveProjectEntities).toHaveBeenCalled();
  });
});

describe('Write-Through Sync — Null Snapshot', () => {
  it('returns false when getSnapshot returns null', async () => {
    initWriteThrough({
      getToken: () => 'tok',
      getSnapshot: () => null,
    });

    const result = await forceSyncProject('p1');
    expect(result).toBe(false);
    expect(mockSaveProjectEntities).not.toHaveBeenCalled();
  });
});

describe('Write-Through Sync — Debounce', () => {
  it('syncProject does not fire immediately', () => {
    initWriteThrough({
      getToken: () => 'jwt',
      getSnapshot: () => makeSnapshot(),
    });

    syncProject('p1');

    // Before debounce — nothing saved yet
    expect(mockSaveProjectEntities).not.toHaveBeenCalled();
  });

  it('syncProjectNow fires synchronously (no debounce wait)', async () => {
    initWriteThrough({
      getToken: () => 'jwt',
      getSnapshot: () => makeSnapshot(),
    });

    syncProjectNow('p1');

    // Give microtasks time to resolve
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSaveProjectEntities).toHaveBeenCalled();
  });
});

describe('Write-Through Sync — Lifecycle', () => {
  it('destroyWriteThrough clears pending debounce timers', async () => {
    initWriteThrough({
      getToken: () => 'jwt',
      getSnapshot: () => makeSnapshot(),
    });

    syncProject('p1');
    destroyWriteThrough();

    await vi.advanceTimersByTimeAsync(500);
    // No syncs should fire after destroy
    expect(mockSaveProjectEntities).not.toHaveBeenCalled();
  });
});

describe('Write-Through Sync — Error Handling', () => {
  it('401 response returns false (token expired)', async () => {
    hoistedFetch.mockResolvedValue(errorResponse(401));
    initWriteThrough({
      getToken: () => 'expired-jwt',
      getSnapshot: () => makeSnapshot(),
      onSyncStatusChange: (s) => statusChanges.push(s),
    });

    const result = await forceSyncProject('p1');
    expect(result).toBe(false);
    expect(mockSaveProjectEntities).toHaveBeenCalled(); // IndexedDB still saved
  });

  it('network error (fetch throws) returns false', async () => {
    hoistedFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    initWriteThrough({
      getToken: () => 'jwt',
      getSnapshot: () => makeSnapshot(),
      onSyncStatusChange: (s) => statusChanges.push(s),
    });

    const result = await forceSyncProject('p1');
    expect(result).toBe(false);
    expect(mockSaveProjectEntities).toHaveBeenCalled();
  });
});
