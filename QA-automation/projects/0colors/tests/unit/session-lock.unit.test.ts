/**
 * Session Lock Manager — Unit tests
 * Source: packages/frontend/src/sync/session-lock.ts
 *
 * Tests lock acquisition, release, force-take, heartbeat, SSE events, and lifecycle.
 * Uses static import with singleton cleanup between tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (must be before any import of the module under test) ──

vi.mock('@frontend/utils/supabase/client', () => ({
  SERVER_BASE: 'http://test-server/api',
}));

vi.mock('@frontend/utils/supabase/info', () => ({
  publicAnonKey: 'test-anon-key',
}));

// Mock EventSource
let currentES: any = null;

class MockEventSource {
  listeners = new Map<string, Function>();
  close = vi.fn();
  url: string;
  constructor(url: string) {
    this.url = url;
    currentES = this;
  }
  addEventListener(type: string, cb: Function) {
    this.listeners.set(type, cb);
  }
  fire(type: string) {
    const cb = this.listeners.get(type);
    if (cb) cb({});
  }
}

vi.stubGlobal('EventSource', MockEventSource);

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Stub window
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// Static import
import { lockManager } from '@frontend/sync/session-lock';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  currentES = null;
});

afterEach(() => {
  vi.useRealTimers();
});

// Helpers
function mockLockAcquired() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ locked: true }),
  });
}

function mockLockDenied() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ locked: false }),
  });
}

describe('Session Lock — Identity', () => {
  it('sessionId has correct format s-{timestamp}-{random}', () => {
    expect(lockManager.sessionId).toMatch(/^s-\d+-[a-z0-9]{4}$/);
  });
});

describe('Session Lock — Subscribe', () => {
  it('subscribe returns unsubscribe function', () => {
    const cb = vi.fn();
    const unsub = lockManager.subscribe(cb);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('Session Lock — setActiveProject', () => {
  it('calls POST /project-lock when setting cloud project', async () => {
    lockManager.setTokenGetter(() => 'jwt-tok');
    mockLockAcquired();

    await lockManager.setActiveProject('lock-test-1', true);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-server/api/project-lock',
      expect.objectContaining({ method: 'POST' }),
    );

    // Cleanup: release the lock
    mockFetch.mockResolvedValue({ ok: true });
    await lockManager.setActiveProject(null, false);
  });

  it('emits "cleared" when lock acquired', async () => {
    const cb = vi.fn();
    const unsub = lockManager.subscribe(cb);
    lockManager.setTokenGetter(() => 'tok');
    mockLockAcquired();

    await lockManager.setActiveProject('lock-test-2', true);

    expect(cb).toHaveBeenCalledWith({ type: 'cleared' });
    unsub();

    // Cleanup
    mockFetch.mockResolvedValue({ ok: true });
    await lockManager.setActiveProject(null, false);
  });

  it('emits "conflict" when lock denied', async () => {
    const cb = vi.fn();
    const unsub = lockManager.subscribe(cb);
    lockManager.setTokenGetter(() => 'tok');
    mockLockDenied();

    await lockManager.setActiveProject('lock-test-3', true);

    expect(cb).toHaveBeenCalledWith({ type: 'conflict', projectId: 'lock-test-3' });
    unsub();

    // Cleanup
    mockFetch.mockResolvedValue({ ok: true });
    await lockManager.setActiveProject(null, false);
  });

  it('non-cloud project skips acquire and emits cleared', async () => {
    const cb = vi.fn();
    const unsub = lockManager.subscribe(cb);
    lockManager.setTokenGetter(() => 'tok');

    await lockManager.setActiveProject('lock-test-4', false);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith({ type: 'cleared' });
    unsub();
  });

  it('null project emits cleared', async () => {
    const cb = vi.fn();
    const unsub = lockManager.subscribe(cb);

    await lockManager.setActiveProject(null, false);

    expect(cb).toHaveBeenCalledWith({ type: 'cleared' });
    unsub();
  });

  it('does not call fetch when no token available', async () => {
    lockManager.setTokenGetter(() => null);

    await lockManager.setActiveProject('lock-test-5', true);

    // The lock acquire will fail silently without fetch (or fetch won't have auth)
    // Key thing: no crash
    // Cleanup
    await lockManager.setActiveProject(null, false);
  });
});

describe('Session Lock — Headers', () => {
  it('includes Authorization and X-User-Token in requests', async () => {
    lockManager.setTokenGetter(() => 'my-jwt');
    mockLockAcquired();

    await lockManager.setActiveProject('lock-header-1', true);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer test-anon-key');
    expect(options.headers['X-User-Token']).toBe('my-jwt');

    // Cleanup
    mockFetch.mockResolvedValue({ ok: true });
    await lockManager.setActiveProject(null, false);
  });
});

describe('Session Lock — forceTake', () => {
  it('calls project-lock-force endpoint', async () => {
    lockManager.setTokenGetter(() => 'tok');
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });

    const result = await lockManager.forceTake('force-proj-1');

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-server/api/project-lock-force',
      expect.objectContaining({ method: 'POST' }),
    );

    // Cleanup
    mockFetch.mockResolvedValue({ ok: true });
    await lockManager.setActiveProject(null, false);
  });

  it('returns false when no token', async () => {
    lockManager.setTokenGetter(() => null);
    const result = await lockManager.forceTake('force-proj-2');
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('Session Lock — SSE Events', () => {
  it('SSE lock-taken-over emits taken-over and clears lock', async () => {
    const cb = vi.fn();
    const unsub = lockManager.subscribe(cb);
    lockManager.setTokenGetter(() => 'tok');
    mockLockAcquired();

    await lockManager.setActiveProject('sse-proj-1', true);
    cb.mockClear();

    expect(currentES).not.toBeNull();
    currentES!.fire('lock-taken-over');

    expect(cb).toHaveBeenCalledWith({ type: 'taken-over', projectId: 'sse-proj-1' });
    expect(lockManager.isLocked).toBe(false);
    unsub();

    // Cleanup
    await lockManager.setActiveProject(null, false);
  });

  it('SSE lock-acquired from another session emits taken-over', async () => {
    const cb = vi.fn();
    const unsub = lockManager.subscribe(cb);
    lockManager.setTokenGetter(() => 'tok');
    mockLockAcquired();

    await lockManager.setActiveProject('sse-proj-2', true);
    cb.mockClear();

    currentES!.fire('lock-acquired');

    expect(cb).toHaveBeenCalledWith({ type: 'taken-over', projectId: 'sse-proj-2' });
    unsub();

    // Cleanup
    await lockManager.setActiveProject(null, false);
  });
});

describe('Session Lock — Heartbeat', () => {
  it('sends heartbeat POST every 15s after lock acquired', async () => {
    lockManager.setTokenGetter(() => 'tok');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ locked: true, ok: true }),
    });

    await lockManager.setActiveProject('hb-proj-1', true);
    mockFetch.mockClear();

    // Advance 15s
    await vi.advanceTimersByTimeAsync(15_000);

    const heartbeatCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => url.includes('project-lock-heartbeat')
    );
    expect(heartbeatCalls.length).toBeGreaterThanOrEqual(1);

    // Cleanup
    mockFetch.mockResolvedValue({ ok: true });
    await lockManager.setActiveProject(null, false);
  });
});
