/**
 * 0colors IndexedDB Database (via Dexie.js)
 *
 * Replaces localStorage as the primary persistence layer.
 * Each entity type gets its own object store with appropriate indexes
 * for fast queries (e.g., load all nodes for a specific project+page).
 *
 * Benefits over localStorage:
 * - Async writes — no main-thread blocking
 * - Practically unlimited storage (60%+ of disk vs 5MB)
 * - Per-entity queries instead of loading everything at once
 * - Compound indexes for efficient filtered reads
 * - Transactional writes for atomicity
 */

import Dexie, { type Table } from 'dexie';
import type {
  ColorNode, DesignToken, TokenProject, TokenGroup,
  Page, Theme, CanvasState, NodeAdvancedLogic,
} from '../types';

// ── Sync metadata record ──
export interface SyncMetaRecord {
  key: string;
  value: any;
  updatedAt?: number;
}

// ── Operation log record (foundation for undo/redo + future collaboration) ──
export interface OperationLogEntry {
  id?: number;           // Auto-incremented
  projectId: string;
  entityType: 'node' | 'token' | 'group' | 'page' | 'theme' | 'canvasState' | 'advancedLogic' | 'project';
  entityId: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  patch?: Record<string, any>; // Only changed fields (for UPDATE)
  timestamp: number;
  clientId: string;      // Tab/session identifier
  userId?: string;       // Authenticated user ID
  synced?: boolean;      // Whether this operation has been synced to the server
}

// ── Database class ──
export class ZeroColorsDB extends Dexie {
  projects!: Table<TokenProject, string>;
  nodes!: Table<ColorNode, string>;
  tokens!: Table<DesignToken, string>;
  groups!: Table<TokenGroup, string>;
  pages!: Table<Page, string>;
  themes!: Table<Theme, string>;
  canvasStates!: Table<CanvasState, [string, string]>; // compound key: [projectId, pageId]
  advancedLogic!: Table<NodeAdvancedLogic, string>;     // keyed by nodeId
  syncMeta!: Table<SyncMetaRecord, string>;             // key-value store for sync state
  syncLog!: Table<OperationLogEntry, number>;           // operation log for future collab

  constructor() {
    super('0colors');

    // Version 1: Initial schema
    this.version(1).stores({
      projects:      'id, name',
      nodes:         'id, projectId, pageId, [projectId+pageId]',
      tokens:        'id, projectId, pageId, groupId',
      groups:        'id, projectId, pageId',
      pages:         'id, projectId',
      themes:        'id, projectId',
      canvasStates:  '[projectId+pageId]',
      advancedLogic: 'nodeId, projectId',
      syncMeta:      'key',
    });

    // Version 2: Add operation log table for collaboration foundation
    this.version(2).stores({
      projects:      'id, name',
      nodes:         'id, projectId, pageId, [projectId+pageId]',
      tokens:        'id, projectId, pageId, groupId',
      groups:        'id, projectId, pageId',
      pages:         'id, projectId',
      themes:        'id, projectId',
      canvasStates:  '[projectId+pageId]',
      advancedLogic: 'nodeId, projectId',
      syncMeta:      'key',
      syncLog:       '++id, projectId, entityType, timestamp, synced',
    });
  }
}

export const db = new ZeroColorsDB();

// ── Helper: Load all entities for a specific project ──
export async function loadProjectEntities(projectId: string) {
  return db.transaction('r', [db.nodes, db.tokens, db.groups, db.pages, db.themes, db.canvasStates, db.advancedLogic], async () => {
    const [nodes, tokens, groups, pages, themes, canvasStates] = await Promise.all([
      db.nodes.where('projectId').equals(projectId).toArray(),
      db.tokens.where('projectId').equals(projectId).toArray(),
      db.groups.where('projectId').equals(projectId).toArray(),
      db.pages.where('projectId').equals(projectId).toArray(),
      db.themes.where('projectId').equals(projectId).toArray(),
      db.canvasStates.where('[projectId+pageId]').between(
        [projectId, Dexie.minKey],
        [projectId, Dexie.maxKey],
      ).toArray(),
    ]);

    // Advanced logic is keyed by nodeId — filter by project's node IDs
    const nodeIds = new Set(nodes.map(n => n.id));
    const advancedLogic = nodeIds.size > 0
      ? (await db.advancedLogic.where('nodeId').anyOf([...nodeIds]).toArray())
      : [];

    return { nodes, tokens, groups, pages, themes, canvasStates, advancedLogic };
  });
}

// ── Helper: Load ALL data from IndexedDB (full hydration) ──
export async function loadAllFromDB(): Promise<{
  projects: TokenProject[];
  allNodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  pages: Page[];
  themes: Theme[];
  canvasStates: CanvasState[];
  advancedLogic: NodeAdvancedLogic[];
  schemaVersion?: number;
} | null> {
  try {
    const [projects, allNodes, tokens, groups, pages, themes, canvasStates, advancedLogic, schemaMeta] = await Promise.all([
      db.projects.toArray(),
      db.nodes.toArray(),
      db.tokens.toArray(),
      db.groups.toArray(),
      db.pages.toArray(),
      db.themes.toArray(),
      db.canvasStates.toArray(),
      db.advancedLogic.toArray(),
      db.syncMeta.get('schemaVersion'),
    ]);

    if (projects.length === 0 && allNodes.length === 0) {
      return null; // Empty database — probably first run or migration needed
    }

    return {
      projects,
      allNodes,
      tokens,
      groups,
      pages,
      themes,
      canvasStates,
      advancedLogic,
      schemaVersion: schemaMeta?.value,
    };
  } catch (err) {
    console.error('[IndexedDB] Failed to load all data:', err);
    return null;
  }
}

// ── Helper: Save all entities for a project (atomic write) ──
export async function saveProjectEntities(
  projectId: string,
  data: {
    project: TokenProject;
    nodes: ColorNode[];
    tokens: DesignToken[];
    groups: TokenGroup[];
    pages: Page[];
    themes: Theme[];
    canvasStates: CanvasState[];
    advancedLogic: NodeAdvancedLogic[];
  },
) {
  await db.transaction('rw', [db.projects, db.nodes, db.tokens, db.groups, db.pages, db.themes, db.canvasStates, db.advancedLogic], async () => {
    // Upsert project
    await db.projects.put(data.project);

    // Replace all project-specific entities (delete old + insert new)
    await Promise.all([
      db.nodes.where('projectId').equals(projectId).delete().then(() => db.nodes.bulkPut(data.nodes)),
      db.tokens.where('projectId').equals(projectId).delete().then(() => db.tokens.bulkPut(data.tokens)),
      db.groups.where('projectId').equals(projectId).delete().then(() => db.groups.bulkPut(data.groups)),
      db.pages.where('projectId').equals(projectId).delete().then(() => db.pages.bulkPut(data.pages)),
      db.themes.where('projectId').equals(projectId).delete().then(() => db.themes.bulkPut(data.themes)),
      db.canvasStates.where('[projectId+pageId]').between(
        [projectId, Dexie.minKey],
        [projectId, Dexie.maxKey],
      ).delete().then(() => db.canvasStates.bulkPut(data.canvasStates)),
    ]);

    // Advanced logic — keyed by nodeId, not projectId
    const nodeIds = data.nodes.map(n => n.id);
    if (nodeIds.length > 0) {
      await db.advancedLogic.where('nodeId').anyOf(nodeIds).delete();
    }
    if (data.advancedLogic.length > 0) {
      await db.advancedLogic.bulkPut(data.advancedLogic);
    }
  });
}

// ── Helper: Delete all entities for a project ──
export async function deleteProjectFromDB(projectId: string) {
  await db.transaction('rw', [db.projects, db.nodes, db.tokens, db.groups, db.pages, db.themes, db.canvasStates, db.advancedLogic], async () => {
    // Get node IDs first (for advanced logic cleanup)
    const nodeIds = (await db.nodes.where('projectId').equals(projectId).primaryKeys()) as string[];

    await Promise.all([
      db.projects.delete(projectId),
      db.nodes.where('projectId').equals(projectId).delete(),
      db.tokens.where('projectId').equals(projectId).delete(),
      db.groups.where('projectId').equals(projectId).delete(),
      db.pages.where('projectId').equals(projectId).delete(),
      db.themes.where('projectId').equals(projectId).delete(),
      db.canvasStates.where('[projectId+pageId]').between(
        [projectId, Dexie.minKey],
        [projectId, Dexie.maxKey],
      ).delete(),
      ...(nodeIds.length > 0
        ? [db.advancedLogic.where('nodeId').anyOf(nodeIds).delete()]
        : []),
    ]);
  });
}

// ── Helper: Save full state (all projects, used during persistence + migration) ──
// Uses bulkPut (upsert) instead of clear+insert to prevent data loss if the
// transaction fails partway through. After successful insert, removes orphaned
// records that no longer exist in the new data.
export async function saveAllToDB(data: {
  projects: TokenProject[];
  allNodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  pages: Page[];
  themes: Theme[];
  canvasStates: CanvasState[];
  advancedLogic: NodeAdvancedLogic[];
  schemaVersion: number;
}) {
  await db.transaction('rw', [db.projects, db.nodes, db.tokens, db.groups, db.pages, db.themes, db.canvasStates, db.advancedLogic, db.syncMeta], async () => {
    // Step 1: Upsert all new data (insert or update existing records)
    await Promise.all([
      data.projects.length > 0 ? db.projects.bulkPut(data.projects) : Promise.resolve(),
      data.allNodes.length > 0 ? db.nodes.bulkPut(data.allNodes) : Promise.resolve(),
      data.tokens.length > 0 ? db.tokens.bulkPut(data.tokens) : Promise.resolve(),
      data.groups.length > 0 ? db.groups.bulkPut(data.groups) : Promise.resolve(),
      data.pages.length > 0 ? db.pages.bulkPut(data.pages) : Promise.resolve(),
      data.themes.length > 0 ? db.themes.bulkPut(data.themes) : Promise.resolve(),
      data.canvasStates.length > 0 ? db.canvasStates.bulkPut(data.canvasStates) : Promise.resolve(),
      data.advancedLogic.length > 0 ? db.advancedLogic.bulkPut(data.advancedLogic) : Promise.resolve(),
      db.syncMeta.put({ key: 'schemaVersion', value: data.schemaVersion }),
    ]);

    // Step 2: Remove orphaned records not in the new data set.
    // Only runs AFTER successful insert, so no data loss if step 1 fails.
    const projectIds = new Set(data.projects.map(p => p.id));
    const nodeIds = new Set(data.allNodes.map(n => n.id));
    const tokenIds = new Set(data.tokens.map(t => t.id));
    const groupIds = new Set(data.groups.map(g => g.id));
    const pageIds = new Set(data.pages.map(p => p.id));
    const themeIds = new Set(data.themes.map(t => t.id));
    const logicNodeIds = new Set(data.advancedLogic.map(l => l.nodeId));

    await Promise.all([
      db.projects.filter(p => !projectIds.has(p.id)).delete(),
      db.nodes.filter(n => !nodeIds.has(n.id)).delete(),
      db.tokens.filter(t => !tokenIds.has(t.id)).delete(),
      db.groups.filter(g => !groupIds.has(g.id)).delete(),
      db.pages.filter(p => !pageIds.has(p.id)).delete(),
      db.themes.filter(t => !themeIds.has(t.id)).delete(),
      db.advancedLogic.filter(l => !logicNodeIds.has(l.nodeId)).delete(),
      // canvasStates: clear all, then the bulkPut above already inserted the new ones
      // (canvasStates don't have a simple ID to filter by)
    ]);
  });
}

// ── Helper: Check if migration from localStorage has been done ──
export async function isMigratedFromLocalStorage(): Promise<boolean> {
  try {
    const record = await db.syncMeta.get('migrated-from-localstorage');
    return record?.value === true;
  } catch {
    return false;
  }
}

// ── Helper: Mark migration as complete ──
export async function markMigrationComplete() {
  await db.syncMeta.put({
    key: 'migrated-from-localstorage',
    value: true,
    updatedAt: Date.now(),
  });
}

// ── Helper: Log an operation (for future collaboration + undo/redo) ──
export async function logOperation(entry: Omit<OperationLogEntry, 'id'>) {
  try {
    await db.syncLog.add(entry as OperationLogEntry);
  } catch {
    // Non-critical — don't block the main flow if logging fails
  }
}

// ── Helper: Get unsynced operations for a project ──
export async function getUnsyncedOperations(projectId: string): Promise<OperationLogEntry[]> {
  return db.syncLog
    .where('projectId').equals(projectId)
    .filter(e => e.synced !== true)
    .toArray()
    .catch(() => []);
}

// ── Helper: Mark operations as synced ──
export async function markOperationsSynced(ids: number[]) {
  if (ids.length === 0) return;
  await db.syncLog.where('id').anyOf(ids).modify({ synced: true });
}

// ── Helper: Trim old synced operations (keep only recent N) ──
export async function trimSyncLog(maxEntries = 10000) {
  const count = await db.syncLog.count();
  if (count <= maxEntries) return;
  const excess = count - maxEntries;
  // Delete oldest synced entries first
  const oldEntries = await db.syncLog
    .orderBy('id')
    .filter(e => e.synced === true)
    .limit(excess)
    .primaryKeys();
  if (oldEntries.length > 0) {
    await db.syncLog.bulkDelete(oldEntries as number[]);
  }
}
