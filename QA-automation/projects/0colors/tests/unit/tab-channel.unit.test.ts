/**
 * Tab Channel (BroadcastChannel) — Unit tests
 * Source: packages/frontend/src/sync/tab-channel.ts
 *
 * Tests multi-tab coordination: message broadcasting, leader election,
 * heartbeat, timeout, and cleanup.
 * Uses static import with cleanup between tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock BroadcastChannel ──

let channelInstances: MockBroadcastChannel[] = [];

class MockBroadcastChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  name: string;
  postMessage = vi.fn();
  close = vi.fn();

  constructor(name: string) {
    this.name = name;
    channelInstances.push(this);
  }

  _receive(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }
}

vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

// Mock Dexie db
const mockSyncMetaGet = vi.fn().mockResolvedValue(null);
const mockSyncMetaPut = vi.fn().mockResolvedValue(undefined);

vi.mock('@frontend/db', () => ({
  db: {
    syncMeta: {
      get: (...args: any[]) => mockSyncMetaGet(...args),
      put: (...args: any[]) => mockSyncMetaPut(...args),
    },
  },
}));

// Stub window
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// Static import
import {
  getTabId,
  isTabLeader,
  initTabChannel,
  destroyTabChannel,
  broadcastChange,
  requestSync,
  onRemoteStateChange,
} from '@frontend/sync/tab-channel';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  channelInstances = [];
});

afterEach(() => {
  destroyTabChannel();
  vi.useRealTimers();
});

describe('Tab Channel — Identity', () => {
  it('getTabId returns identifier with correct format', () => {
    expect(getTabId()).toMatch(/^tab-\d+-[a-z0-9]{6}$/);
  });

  it('getTabId returns consistent value within same module load', () => {
    expect(getTabId()).toBe(getTabId());
  });
});

describe('Tab Channel — Initialization', () => {
  it('creates BroadcastChannel with name "0colors-sync"', () => {
    initTabChannel();
    expect(channelInstances.length).toBeGreaterThanOrEqual(1);
    expect(channelInstances[0].name).toBe('0colors-sync');
  });
});

describe('Tab Channel — Broadcasting', () => {
  it('broadcastChange sends STATE_CHANGED message with correct shape', () => {
    initTabChannel();
    broadcastChange('proj-1', ['nodes', 'tokens']);

    const channel = channelInstances[0];
    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STATE_CHANGED',
        tabId: getTabId(),
        projectId: 'proj-1',
        entityTypes: ['nodes', 'tokens'],
      }),
    );
  });

  it('requestSync sends SYNC_REQUESTED message', () => {
    initTabChannel();
    requestSync('proj-1');

    const channel = channelInstances[0];
    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SYNC_REQUESTED',
        projectId: 'proj-1',
      }),
    );
  });

  it('message includes timestamp', () => {
    initTabChannel();
    broadcastChange('proj-1', ['nodes']);

    const channel = channelInstances[0];
    const msg = channel.postMessage.mock.calls[0][0];
    expect(msg.timestamp).toBeGreaterThan(0);
  });
});

describe('Tab Channel — Message Handling', () => {
  it('ignores own messages', () => {
    const cb = vi.fn();
    initTabChannel();
    onRemoteStateChange(cb);

    const channel = channelInstances[0];
    channel._receive({
      type: 'STATE_CHANGED',
      tabId: getTabId(), // Same tab
      timestamp: Date.now(),
      projectId: 'proj-1',
    });

    expect(cb).not.toHaveBeenCalled();
  });

  it('STATE_CHANGED from other tab triggers onRemoteChange callback', () => {
    const cb = vi.fn();
    initTabChannel();
    onRemoteStateChange(cb);

    const channel = channelInstances[0];
    const msg = {
      type: 'STATE_CHANGED',
      tabId: 'other-tab-id',
      timestamp: Date.now(),
      projectId: 'proj-1',
      entityTypes: ['nodes'],
    };
    channel._receive(msg);

    expect(cb).toHaveBeenCalledWith(msg);
  });
});

describe('Tab Channel — Leader Election', () => {
  it('attempts leadership claim via IndexedDB', async () => {
    mockSyncMetaGet.mockResolvedValue(null); // No existing leader

    initTabChannel();

    // Leader election has a random delay (50-250ms)
    await vi.advanceTimersByTimeAsync(500);

    expect(mockSyncMetaGet).toHaveBeenCalledWith('leader-claim');
  });

  it('LEADER_ELECTED from other tab clears local leadership', async () => {
    mockSyncMetaGet.mockResolvedValue(null);
    initTabChannel();

    // Let initial election happen
    await vi.advanceTimersByTimeAsync(500);

    const channel = channelInstances[0];
    channel._receive({
      type: 'LEADER_ELECTED',
      tabId: 'other-leader-tab',
      timestamp: Date.now(),
    });

    expect(isTabLeader()).toBe(false);
  });
});

describe('Tab Channel — Cleanup', () => {
  it('destroyTabChannel closes channel', () => {
    initTabChannel();
    const channel = channelInstances[0];

    destroyTabChannel();

    expect(channel.close).toHaveBeenCalled();
  });

  it('broadcastMessage catches closed channel error', () => {
    initTabChannel();
    const channel = channelInstances[0];
    channel.postMessage.mockImplementation(() => { throw new Error('Channel closed'); });

    // Should not throw
    expect(() => broadcastChange('proj-1', ['nodes'])).not.toThrow();
  });
});
