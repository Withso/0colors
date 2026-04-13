/**
 * Multi-Tab Coordination via BroadcastChannel
 *
 * Pattern: Write IndexedDB → Broadcast "I changed X" → Other tabs re-read from IndexedDB
 *
 * This avoids sending full state over the channel (which would be large and slow).
 * Instead, tabs share IndexedDB as the source of truth and use the channel only
 * for lightweight notifications.
 */

import { db } from '../db';

// ── Types ──

export interface TabMessage {
  type: 'STATE_CHANGED' | 'SYNC_REQUESTED' | 'SYNC_COMPLETE' | 'LEADER_ELECTED' | 'LEADER_HEARTBEAT' | 'LEADER_RESIGN';
  tabId: string;
  timestamp: number;
  projectId?: string;
  entityTypes?: string[];
  data?: any;
}

// ── Module state ──

const TAB_ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let channel: BroadcastChannel | null = null;
let onRemoteChange: ((msg: TabMessage) => void) | null = null;

// ── Leader election state ──
let isLeader = false;
let leaderTabId: string | null = null;
let leaderHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
let leaderCheckTimeout: ReturnType<typeof setTimeout> | null = null;
const LEADER_HEARTBEAT_MS = 10_000; // 10s heartbeat
const LEADER_TIMEOUT_MS = 15_000;   // 15s — if no heartbeat, assume leader died

// ── Public API ──

export function getTabId(): string {
  return TAB_ID;
}

export function isTabLeader(): boolean {
  return isLeader;
}

export function initTabChannel() {
  if (typeof BroadcastChannel === 'undefined') {
    console.log('[TabChannel] BroadcastChannel not supported — single-tab mode');
    isLeader = true; // If no BroadcastChannel, this tab is always the leader
    return;
  }

  channel = new BroadcastChannel('0colors-sync');
  channel.onmessage = handleMessage;

  // Start leader election
  electLeader();

  // Clean up on page close
  window.addEventListener('beforeunload', () => {
    if (isLeader) {
      broadcastMessage({ type: 'LEADER_RESIGN', tabId: TAB_ID, timestamp: Date.now() });
    }
    destroyTabChannel();
  });

  console.log(`[TabChannel] Initialized (tabId: ${TAB_ID})`);
}

export function destroyTabChannel() {
  if (leaderHeartbeatInterval) {
    clearInterval(leaderHeartbeatInterval);
    leaderHeartbeatInterval = null;
  }
  if (leaderCheckTimeout) {
    clearTimeout(leaderCheckTimeout);
    leaderCheckTimeout = null;
  }
  if (channel) {
    channel.close();
    channel = null;
  }
}

/**
 * Broadcast that this tab changed entities for a project.
 * Other tabs will re-read the affected data from IndexedDB.
 */
export function broadcastChange(projectId: string, entityTypes: string[]) {
  broadcastMessage({
    type: 'STATE_CHANGED',
    tabId: TAB_ID,
    timestamp: Date.now(),
    projectId,
    entityTypes,
  });
}

/**
 * Request the leader tab to sync dirty projects to cloud.
 * Used by non-leader tabs when they mark a project as dirty.
 */
export function requestSync(projectId: string) {
  broadcastMessage({
    type: 'SYNC_REQUESTED',
    tabId: TAB_ID,
    timestamp: Date.now(),
    projectId,
  });
}

/**
 * Register a callback for when remote tabs change data.
 * The callback receives the message so the app can re-read from IndexedDB.
 */
export function onRemoteStateChange(callback: (msg: TabMessage) => void) {
  onRemoteChange = callback;
}

// ── Internal helpers ──

function broadcastMessage(msg: TabMessage) {
  try {
    channel?.postMessage(msg);
  } catch {
    // Channel may be closed
  }
}

function handleMessage(event: MessageEvent<TabMessage>) {
  const msg = event.data;
  if (!msg || msg.tabId === TAB_ID) return; // Ignore own messages

  switch (msg.type) {
    case 'STATE_CHANGED':
      // Another tab changed data — notify the app to re-read from IndexedDB
      onRemoteChange?.(msg);
      break;

    case 'SYNC_REQUESTED':
      // A non-leader tab wants us to sync — only process if we're the leader
      if (isLeader) {
        // The cloud-sync module will handle this via its own dirty tracking
        console.log(`[TabChannel] Sync requested by ${msg.tabId} for project ${msg.projectId}`);
      }
      break;

    case 'LEADER_ELECTED':
      leaderTabId = msg.tabId;
      if (msg.tabId !== TAB_ID) {
        isLeader = false;
        stopLeaderHeartbeat();
        resetLeaderCheck();
      }
      console.log(`[TabChannel] Leader elected: ${msg.tabId}${msg.tabId === TAB_ID ? ' (this tab)' : ''}`);
      break;

    case 'LEADER_HEARTBEAT':
      leaderTabId = msg.tabId;
      resetLeaderCheck();
      break;

    case 'LEADER_RESIGN':
      if (msg.tabId === leaderTabId) {
        console.log(`[TabChannel] Leader ${msg.tabId} resigned — re-electing`);
        leaderTabId = null;
        electLeader();
      }
      break;
  }
}

// ── Leader election ──

function electLeader() {
  // Simple strategy: the tab that reaches this point claims leadership.
  // If another tab already claimed, their LEADER_ELECTED message will override.
  // A small random delay avoids ties when multiple tabs open simultaneously.
  const delay = Math.random() * 200 + 50; // 50-250ms

  setTimeout(async () => {
    // Check if someone else already became leader while we waited
    if (leaderTabId && leaderTabId !== TAB_ID) return;

    // Try to claim leadership via IndexedDB (atomic check)
    try {
      const claim = await db.syncMeta.get('leader-claim');
      const now = Date.now();

      // If there's a recent claim from another tab, don't override
      if (claim && claim.value?.tabId !== TAB_ID && (now - (claim.value?.timestamp || 0)) < LEADER_TIMEOUT_MS) {
        leaderTabId = claim.value.tabId;
        resetLeaderCheck();
        return;
      }

      // Claim leadership
      await db.syncMeta.put({
        key: 'leader-claim',
        value: { tabId: TAB_ID, timestamp: now },
      });

      // Wait briefly, then verify our claim is still there
      await new Promise(r => setTimeout(r, 100));
      const verify = await db.syncMeta.get('leader-claim');
      if (verify?.value?.tabId === TAB_ID) {
        isLeader = true;
        leaderTabId = TAB_ID;
        broadcastMessage({ type: 'LEADER_ELECTED', tabId: TAB_ID, timestamp: now });
        startLeaderHeartbeat();
        console.log(`[TabChannel] This tab is now the leader`);
      }
    } catch (err) {
      // IndexedDB failed — become leader anyway (single-tab fallback)
      console.warn('[TabChannel] Leader election via IndexedDB failed:', err);
      isLeader = true;
      leaderTabId = TAB_ID;
    }
  }, delay);
}

function startLeaderHeartbeat() {
  stopLeaderHeartbeat();
  leaderHeartbeatInterval = setInterval(() => {
    broadcastMessage({ type: 'LEADER_HEARTBEAT', tabId: TAB_ID, timestamp: Date.now() });
    // Also update IndexedDB claim
    db.syncMeta.put({
      key: 'leader-claim',
      value: { tabId: TAB_ID, timestamp: Date.now() },
    }).catch(() => {});
  }, LEADER_HEARTBEAT_MS);
}

function stopLeaderHeartbeat() {
  if (leaderHeartbeatInterval) {
    clearInterval(leaderHeartbeatInterval);
    leaderHeartbeatInterval = null;
  }
}

function resetLeaderCheck() {
  if (leaderCheckTimeout) clearTimeout(leaderCheckTimeout);
  leaderCheckTimeout = setTimeout(() => {
    // Leader hasn't sent a heartbeat — re-elect
    console.log(`[TabChannel] Leader timeout — re-electing`);
    leaderTabId = null;
    electLeader();
  }, LEADER_TIMEOUT_MS);
}
