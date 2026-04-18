/**
 * Database Operations — Integration tests
 * Source: packages/frontend/src/db/index.ts
 *
 * Tests all Dexie helpers with real fake-indexeddb (no mocks).
 * Each test gets a fresh database.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

import {
  db,
  loadProjectEntities,
  loadAllFromDB,
  saveProjectEntities,
  deleteProjectFromDB,
  saveAllToDB,
  isMigratedFromLocalStorage,
  markMigrationComplete,
  logOperation,
  getUnsyncedOperations,
  markOperationsSynced,
  trimSyncLog,
} from '@frontend/db';

import {
  makeProject, makePage, makeTheme, makeNode,
  makeToken, makeGroup, makeCanvasState, makeAdvancedLogic,
} from '../helpers/sync-test-helpers';

beforeEach(async () => {
  // Fresh database for each test
  await db.delete();
  await db.open();
});

describe('saveProjectEntities + loadProjectEntities', () => {
  it('saves and loads all entity types for a project', async () => {
    const pid = 'proj-1';
    const page = makePage(pid, { id: 'page-1' });
    const theme = makeTheme(pid, { id: 'theme-1' });
    const node = makeNode(pid, page.id, { id: 'node-1' });
    const group = makeGroup(pid, page.id, { id: 'group-1' });
    const token = makeToken(pid, page.id, group.id, theme.id, { id: 'token-1' });
    const cs = makeCanvasState(pid, page.id);
    const logic = makeAdvancedLogic('node-1', { nodeId: 'node-1' });

    await saveProjectEntities(pid, {
      project: makeProject({ id: pid }),
      nodes: [node],
      tokens: [token],
      groups: [group],
      pages: [page],
      themes: [theme],
      canvasStates: [cs],
      advancedLogic: [logic],
    });

    const loaded = await loadProjectEntities(pid);
    expect(loaded.nodes).toHaveLength(1);
    expect(loaded.tokens).toHaveLength(1);
    expect(loaded.groups).toHaveLength(1);
    expect(loaded.pages).toHaveLength(1);
    expect(loaded.themes).toHaveLength(1);
    expect(loaded.canvasStates).toHaveLength(1);
    expect(loaded.advancedLogic).toHaveLength(1);
  });

  it('does not affect other projects', async () => {
    const page1 = makePage('p1', { id: 'p1-page' });
    const page2 = makePage('p2', { id: 'p2-page' });
    const theme1 = makeTheme('p1', { id: 'p1-theme' });
    const theme2 = makeTheme('p2', { id: 'p2-theme' });
    const group1 = makeGroup('p1', page1.id, { id: 'p1-group' });
    const group2 = makeGroup('p2', page2.id, { id: 'p2-group' });

    await saveProjectEntities('p1', {
      project: makeProject({ id: 'p1' }),
      nodes: [makeNode('p1', page1.id, { id: 'p1-n1' })],
      tokens: [makeToken('p1', page1.id, group1.id, theme1.id, { id: 'p1-t1' })],
      groups: [group1],
      pages: [page1],
      themes: [theme1],
      canvasStates: [makeCanvasState('p1', page1.id)],
      advancedLogic: [],
    });

    await saveProjectEntities('p2', {
      project: makeProject({ id: 'p2' }),
      nodes: [makeNode('p2', page2.id, { id: 'p2-n1' }), makeNode('p2', page2.id, { id: 'p2-n2' })],
      tokens: [makeToken('p2', page2.id, group2.id, theme2.id, { id: 'p2-t1' })],
      groups: [group2],
      pages: [page2],
      themes: [theme2],
      canvasStates: [makeCanvasState('p2', page2.id)],
      advancedLogic: [],
    });

    const p1 = await loadProjectEntities('p1');
    const p2 = await loadProjectEntities('p2');
    expect(p1.nodes).toHaveLength(1);
    expect(p2.nodes).toHaveLength(2);
  });

  it('returns empty arrays for non-existent project', async () => {
    const loaded = await loadProjectEntities('nonexistent');
    expect(loaded.nodes).toHaveLength(0);
    expect(loaded.tokens).toHaveLength(0);
    expect(loaded.groups).toHaveLength(0);
    expect(loaded.pages).toHaveLength(0);
    expect(loaded.themes).toHaveLength(0);
    expect(loaded.canvasStates).toHaveLength(0);
    expect(loaded.advancedLogic).toHaveLength(0);
  });

  it('replaces old data on re-save (delete + insert)', async () => {
    const pid = 'proj-1';
    const page = makePage(pid, { id: 'page-1' });
    const theme = makeTheme(pid, { id: 'theme-1' });
    const group = makeGroup(pid, page.id, { id: 'group-1' });

    // First save: 2 nodes
    await saveProjectEntities(pid, {
      project: makeProject({ id: pid }),
      nodes: [makeNode(pid, page.id, { id: 'n1' }), makeNode(pid, page.id, { id: 'n2' })],
      tokens: [makeToken(pid, page.id, group.id, theme.id, { id: 't1' })],
      groups: [group],
      pages: [page],
      themes: [theme],
      canvasStates: [makeCanvasState(pid, page.id)],
      advancedLogic: [],
    });

    // Second save: 1 node (different)
    await saveProjectEntities(pid, {
      project: makeProject({ id: pid }),
      nodes: [makeNode(pid, page.id, { id: 'n3' })],
      tokens: [],
      groups: [],
      pages: [page],
      themes: [theme],
      canvasStates: [makeCanvasState(pid, page.id)],
      advancedLogic: [],
    });

    const loaded = await loadProjectEntities(pid);
    expect(loaded.nodes).toHaveLength(1);
    expect(loaded.nodes[0].id).toBe('n3');
    expect(loaded.tokens).toHaveLength(0);
  });
});

describe('loadAllFromDB', () => {
  it('returns null for empty database', async () => {
    const result = await loadAllFromDB();
    expect(result).toBeNull();
  });

  it('returns all data when populated', async () => {
    const pid = 'proj-1';
    const page = makePage(pid, { id: 'page-1' });
    const theme = makeTheme(pid, { id: 'theme-1' });
    const group = makeGroup(pid, page.id, { id: 'group-1' });

    await saveProjectEntities(pid, {
      project: makeProject({ id: pid }),
      nodes: [makeNode(pid, page.id, { id: 'n1' })],
      tokens: [makeToken(pid, page.id, group.id, theme.id, { id: 't1' })],
      groups: [group],
      pages: [page],
      themes: [theme],
      canvasStates: [makeCanvasState(pid, page.id)],
      advancedLogic: [],
    });

    const result = await loadAllFromDB();
    expect(result).not.toBeNull();
    expect(result!.projects).toHaveLength(1);
    expect(result!.allNodes).toHaveLength(1);
    expect(result!.tokens).toHaveLength(1);
  });
});

describe('deleteProjectFromDB', () => {
  it('removes all project entities', async () => {
    const pid = 'proj-1';
    const page = makePage(pid, { id: 'page-1' });
    const theme = makeTheme(pid, { id: 'theme-1' });
    const group = makeGroup(pid, page.id, { id: 'group-1' });
    const node = makeNode(pid, page.id, { id: 'n1' });

    await saveProjectEntities(pid, {
      project: makeProject({ id: pid }),
      nodes: [node],
      tokens: [makeToken(pid, page.id, group.id, theme.id, { id: 't1' })],
      groups: [group],
      pages: [page],
      themes: [theme],
      canvasStates: [makeCanvasState(pid, page.id)],
      advancedLogic: [makeAdvancedLogic('n1')],
    });

    await deleteProjectFromDB(pid);

    const loaded = await loadProjectEntities(pid);
    expect(loaded.nodes).toHaveLength(0);
    expect(loaded.tokens).toHaveLength(0);
    expect(loaded.advancedLogic).toHaveLength(0);

    const project = await db.projects.get(pid);
    expect(project).toBeUndefined();
  });

  it('does not affect other projects', async () => {
    const page1 = makePage('p1', { id: 'p1-page' });
    const page2 = makePage('p2', { id: 'p2-page' });
    const theme1 = makeTheme('p1', { id: 'p1-theme' });
    const theme2 = makeTheme('p2', { id: 'p2-theme' });

    await saveProjectEntities('p1', {
      project: makeProject({ id: 'p1' }),
      nodes: [makeNode('p1', page1.id, { id: 'p1-n1' })],
      tokens: [],
      groups: [],
      pages: [page1],
      themes: [theme1],
      canvasStates: [makeCanvasState('p1', page1.id)],
      advancedLogic: [],
    });

    await saveProjectEntities('p2', {
      project: makeProject({ id: 'p2' }),
      nodes: [makeNode('p2', page2.id, { id: 'p2-n1' })],
      tokens: [],
      groups: [],
      pages: [page2],
      themes: [theme2],
      canvasStates: [makeCanvasState('p2', page2.id)],
      advancedLogic: [],
    });

    await deleteProjectFromDB('p1');

    const p2 = await loadProjectEntities('p2');
    expect(p2.nodes).toHaveLength(1);
  });
});

describe('saveAllToDB', () => {
  it('upserts all data and stores schemaVersion', async () => {
    const pid = 'proj-1';
    const page = makePage(pid, { id: 'page-1' });
    const theme = makeTheme(pid, { id: 'theme-1' });
    const node = makeNode(pid, page.id, { id: 'n1' });

    await saveAllToDB({
      projects: [makeProject({ id: pid })],
      allNodes: [node],
      tokens: [],
      groups: [],
      pages: [page],
      themes: [theme],
      canvasStates: [makeCanvasState(pid, page.id)],
      advancedLogic: [],
      schemaVersion: 5,
    });

    const result = await loadAllFromDB();
    expect(result).not.toBeNull();
    expect(result!.projects).toHaveLength(1);
    expect(result!.schemaVersion).toBe(5);
  });

  it('removes orphaned records not in new data', async () => {
    const page1 = makePage('p1', { id: 'p1-page' });
    const theme1 = makeTheme('p1', { id: 'p1-theme' });
    const page2 = makePage('p2', { id: 'p2-page' });
    const theme2 = makeTheme('p2', { id: 'p2-theme' });

    // Save two projects
    await saveAllToDB({
      projects: [makeProject({ id: 'p1' }), makeProject({ id: 'p2' })],
      allNodes: [makeNode('p1', page1.id, { id: 'n1' }), makeNode('p2', page2.id, { id: 'n2' })],
      tokens: [],
      groups: [],
      pages: [page1, page2],
      themes: [theme1, theme2],
      canvasStates: [],
      advancedLogic: [],
      schemaVersion: 2,
    });

    // Save only p1
    await saveAllToDB({
      projects: [makeProject({ id: 'p1' })],
      allNodes: [makeNode('p1', page1.id, { id: 'n1' })],
      tokens: [],
      groups: [],
      pages: [page1],
      themes: [theme1],
      canvasStates: [],
      advancedLogic: [],
      schemaVersion: 2,
    });

    const result = await loadAllFromDB();
    expect(result!.projects).toHaveLength(1);
    expect(result!.projects[0].id).toBe('p1');
    expect(result!.allNodes).toHaveLength(1);
  });
});

describe('Migration helpers', () => {
  it('isMigratedFromLocalStorage returns false initially', async () => {
    expect(await isMigratedFromLocalStorage()).toBe(false);
  });

  it('markMigrationComplete sets flag', async () => {
    await markMigrationComplete();
    expect(await isMigratedFromLocalStorage()).toBe(true);
  });
});

describe('Sync Log operations', () => {
  it('logOperation adds entry with auto-incremented id', async () => {
    await logOperation({
      projectId: 'p1',
      entityType: 'node',
      entityId: 'n1',
      type: 'CREATE',
      timestamp: Date.now(),
      clientId: 'tab-1',
    });

    const entries = await db.syncLog.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBeGreaterThan(0);
    expect(entries[0].projectId).toBe('p1');
  });

  it('getUnsyncedOperations returns only unsynced entries for project', async () => {
    await logOperation({ projectId: 'p1', entityType: 'node', entityId: 'n1', type: 'CREATE', timestamp: 1, clientId: 'c1', synced: false });
    await logOperation({ projectId: 'p1', entityType: 'node', entityId: 'n2', type: 'UPDATE', timestamp: 2, clientId: 'c1', synced: true });
    await logOperation({ projectId: 'p2', entityType: 'node', entityId: 'n3', type: 'CREATE', timestamp: 3, clientId: 'c1', synced: false });

    const unsynced = await getUnsyncedOperations('p1');
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].entityId).toBe('n1');
  });

  it('markOperationsSynced marks entries', async () => {
    await logOperation({ projectId: 'p1', entityType: 'node', entityId: 'n1', type: 'CREATE', timestamp: 1, clientId: 'c1' });
    await logOperation({ projectId: 'p1', entityType: 'token', entityId: 't1', type: 'CREATE', timestamp: 2, clientId: 'c1' });

    const entries = await db.syncLog.toArray();
    await markOperationsSynced(entries.map(e => e.id!));

    const unsynced = await getUnsyncedOperations('p1');
    expect(unsynced).toHaveLength(0);
  });

  it('trimSyncLog is no-op when under limit', async () => {
    await logOperation({ projectId: 'p1', entityType: 'node', entityId: 'n1', type: 'CREATE', timestamp: 1, clientId: 'c1', synced: true });

    await trimSyncLog(10);

    const count = await db.syncLog.count();
    expect(count).toBe(1);
  });
});

describe('CanvasState compound key', () => {
  it('compound key [projectId+pageId] stores and retrieves correctly', async () => {
    const pid = 'proj-1';
    const page1 = makePage(pid, { id: 'page-1' });
    const page2 = makePage(pid, { id: 'page-2' });

    await saveProjectEntities(pid, {
      project: makeProject({ id: pid }),
      nodes: [makeNode(pid, page1.id, { id: 'n1' })],
      tokens: [],
      groups: [],
      pages: [page1, page2],
      themes: [makeTheme(pid, { id: 'theme-1' })],
      canvasStates: [
        makeCanvasState(pid, 'page-1', { zoom: 1.5 }),
        makeCanvasState(pid, 'page-2', { zoom: 2.0 }),
      ],
      advancedLogic: [],
    });

    const loaded = await loadProjectEntities(pid);
    expect(loaded.canvasStates).toHaveLength(2);

    const zooms = loaded.canvasStates.map(cs => cs.zoom).sort();
    expect(zooms).toEqual([1.5, 2.0]);
  });
});
