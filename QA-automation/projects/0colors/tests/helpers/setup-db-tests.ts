/**
 * Setup file for integration tests that need IndexedDB (via fake-indexeddb).
 *
 * IMPORTANT: This import MUST come before any Dexie import — it patches globalThis
 * with an in-memory IndexedDB implementation.
 */
import 'fake-indexeddb/auto';
import { beforeEach, afterAll, afterEach, beforeAll } from 'vitest';

// ── localStorage / sessionStorage mocks ──

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

if (typeof globalThis.localStorage?.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: createStorageMock(),
  });
}

if (typeof globalThis.sessionStorage?.getItem !== 'function') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: createStorageMock(),
  });
}

beforeEach(() => {
  globalThis.localStorage?.clear?.();
  globalThis.sessionStorage?.clear?.();
});
