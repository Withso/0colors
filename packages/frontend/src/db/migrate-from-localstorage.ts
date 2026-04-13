/**
 * One-time migration: localStorage → IndexedDB
 *
 * Reads the existing `color-tool-data` blob from localStorage,
 * runs schema migrations, and writes each entity type into its
 * own IndexedDB object store via a single Dexie transaction.
 *
 * After migration:
 * - IndexedDB is the primary persistence layer
 * - localStorage `color-tool-data` is kept as a fallback for 1 release cycle
 * - A `syncMeta` flag is set so migration doesn't re-run
 */

import { db, saveAllToDB, isMigratedFromLocalStorage, markMigrationComplete } from './index';
import { migrateToLatest, CURRENT_SCHEMA_VERSION } from '../utils/migrations';
import { migrateTokens } from '../utils/app-helpers';
import type { ColorNode, DesignToken, TokenProject, TokenGroup, Page, Theme, CanvasState, NodeAdvancedLogic } from '../types';

const STORAGE_KEY = 'color-tool-data';

/**
 * Migrate data from localStorage to IndexedDB.
 * Returns true if migration happened (or was already done), false if no data to migrate.
 */
export async function migrateLocalStorageToIndexedDB(): Promise<boolean> {
  // Already migrated?
  if (await isMigratedFromLocalStorage()) {
    return true;
  }

  // Read from localStorage
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // No localStorage data — mark as migrated (nothing to move)
    await markMigrationComplete();
    return false;
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('[Migration] Failed to parse localStorage data:', err);
    return false;
  }

  // Run token migrations (legacy per-theme tokens → base tokens with themeValues)
  if (data.tokens && data.themes) {
    data.tokens = migrateTokens(data.tokens, data.themes);

    // Update node tokenAssignments to reference base IDs
    if (data.nodes) {
      data.nodes = data.nodes.map((node: any) => {
        if (node.tokenAssignments) {
          const updatedAssignments: any = {};
          Object.keys(node.tokenAssignments).forEach((themeId: string) => {
            updatedAssignments[themeId] = node.tokenAssignments[themeId].map((tokenId: string) =>
              tokenId.replace(/-theme-\d+$/, '')
            );
          });
          return { ...node, tokenAssignments: updatedAssignments };
        }
        return node;
      });
    }
  }

  // Run schema migrations
  const migrationResult = migrateToLatest({
    nodes: data.nodes || [],
    tokens: data.tokens || [],
    groups: data.groups || [],
    pages: data.pages || [],
    themes: data.themes || [],
    projects: data.projects || [],
    canvasStates: data.canvasStates || [],
    advancedLogic: data.advancedLogic || [],
    schemaVersion: data.schemaVersion,
  });

  if (migrationResult.migrated) {
    console.log(`[Migration] Schema migration: v${migrationResult.fromVersion} → v${migrationResult.toVersion} (${migrationResult.appliedMigrations.join(', ')})`);
    data.nodes = migrationResult.data.nodes;
    data.tokens = migrationResult.data.tokens;
    data.groups = migrationResult.data.groups;
    data.pages = migrationResult.data.pages;
    data.themes = migrationResult.data.themes;
    data.projects = migrationResult.data.projects;
    data.canvasStates = migrationResult.data.canvasStates;
  }

  // Write to IndexedDB
  try {
    await saveAllToDB({
      projects: (data.projects || []) as TokenProject[],
      allNodes: (data.nodes || []) as ColorNode[],
      tokens: (data.tokens || []) as DesignToken[],
      groups: (data.groups || []) as TokenGroup[],
      pages: (data.pages || []) as Page[],
      themes: (data.themes || []) as Theme[],
      canvasStates: (data.canvasStates || []) as CanvasState[],
      advancedLogic: (data.advancedLogic || []) as NodeAdvancedLogic[],
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    // Mark migration as complete
    await markMigrationComplete();

    console.log(`[Migration] Successfully migrated ${data.projects?.length || 0} projects from localStorage to IndexedDB`);
    return true;
  } catch (err) {
    console.error('[Migration] Failed to write to IndexedDB:', err);
    return false;
  }
}
