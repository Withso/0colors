/**
 * 0colors Data Migration System
 *
 * Automatic, version-based migration pipeline that transforms project data
 * from any historical schema to the latest schema on every load boundary
 * (localStorage hydration and cloud snapshot pull).
 *
 * ARCHITECTURE:
 * - Each schema change gets a monotonically increasing version number.
 * - Migration functions are pure transforms: (data) => data.
 * - The pipeline runs sequentially from the data's current version
 *   through every intermediate version up to CURRENT_SCHEMA_VERSION.
 * - Migrations are idempotent: running them on already-migrated data is safe.
 * - After migration, the data is saved back through normal save flows,
 *   so old data is lazily upgraded and eventually consistent everywhere.
 *
 * HOW TO ADD A NEW MIGRATION:
 * 1. Bump CURRENT_SCHEMA_VERSION by 1.
 * 2. Add a new entry to the `migrations` array with { version, name, migrate }.
 * 3. The `migrate` function receives the full MigratableData and must return
 *    the transformed data. It can inspect/modify tokens, nodes, groups, etc.
 * 4. Add a clear description string so the migration log is self-documenting.
 *
 * IMPORTANT RULES:
 * - NEVER remove or reorder existing migrations.
 * - NEVER change an existing migration function after it ships.
 * - Migrations must be defensive: handle missing/undefined fields gracefully.
 * - Migrations must NOT break existing data that already conforms to the new shape.
 */

import type {
  ColorNode,
  DesignToken,
  TokenGroup,
  Page,
  Theme,
  CanvasState,
  NodeAdvancedLogic,
  TokenProject,
} from '../types';

// ═══════════════════════════════════════════════════════════════════
// Schema Version — bump this for every data-structure change
// ═══════════════════════════════════════════════════════════════════
export const CURRENT_SCHEMA_VERSION = 3;

// ═══════════════════════════════════════════════════════════════════
// Migratable Data — the superset of fields available to migrations
// ═══════════════════════════════════════════════════════════════════
export interface MigratableData {
  nodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  pages: Page[];
  themes: Theme[];
  projects?: TokenProject[];
  canvasStates?: CanvasState[];
  advancedLogic?: NodeAdvancedLogic[];
  computedTokens?: Record<string, any>;
  schemaVersion?: number;
  // Allow pass-through of any extra fields (activeProjectId, etc.)
  [key: string]: any;
}

// ═══════════════════════════════════════════════════════════════════
// Migration Registry
// ═══════════════════════════════════════════════════════════════════

interface Migration {
  /** Target version this migration produces */
  version: number;
  /** Human-readable description (logged during migration) */
  name: string;
  /** Pure transform function */
  migrate: (data: MigratableData) => MigratableData;
}

const migrations: Migration[] = [
  // ─── v1 → v2: Baseline + consolidated legacy migrations ─────────
  // Consolidates all pre-versioning ad-hoc migrations into one place:
  //   • Node: tokenId → tokenIds array
  //   • Node: default colorSpace = 'hsl'
  //   • Node: default pageId = 'page-1'
  //   • Token: default pageId = 'page-1'
  //   • Group: default pageId = 'page-1'
  //   • Token: empty themeValues baseline (new tokens start empty)
  //
  // All transforms are idempotent — safe to run on already-migrated data.
  {
    version: 2,
    name: 'Baseline + legacy consolidation (tokenIds, colorSpace, pageId, empty tokens)',
    migrate: (data) => {
      // ── Migrate nodes ──
      const migratedNodes = data.nodes.map((node: any) => {
        let n = { ...node };

        // tokenId (single) → tokenIds (array)
        if (n.tokenId !== undefined && n.tokenIds === undefined) {
          const { tokenId, ...rest } = n;
          n = { ...rest, tokenIds: tokenId ? [tokenId] : [] };
        }

        // Default colorSpace
        if (!n.colorSpace) {
          n.colorSpace = 'hsl';
        }

        // Default pageId
        if (!n.pageId) {
          n.pageId = 'page-1';
        }

        return n;
      });

      // ── Migrate tokens ──
      const migratedTokens = data.tokens.map((token: any) => {
        if (!token.pageId) {
          return { ...token, pageId: 'page-1' };
        }
        return token;
      });

      // ── Migrate groups ──
      const migratedGroups = data.groups.map((group: any) => {
        if (!group.pageId) {
          return { ...group, pageId: 'page-1' };
        }
        return group;
      });

      return {
        ...data,
        nodes: migratedNodes,
        tokens: migratedTokens,
        groups: migratedGroups,
      };
    },
  },

  // ─── v2 → v3: Add computedTokens field ──────────────────────────
  // Introduces the `computedTokens` data structure — a per-project,
  // per-theme snapshot of resolved/visible tokens.  This is derived data
  // (recomputed on every save), so the migration simply initializes the
  // field as an empty object.  Actual computation happens in App.tsx.
  {
    version: 3,
    name: 'Add computedTokens (per-project, per-theme resolved token snapshots)',
    migrate: (data) => {
      return {
        ...data,
        computedTokens: data.computedTokens || {},
      };
    },
  },

  // ─── TEMPLATE: Copy this block for the next migration ───────────
  // {
  //   version: 4,
  //   name: 'Description of what changed',
  //   migrate: (data) => {
  //     return data;
  //   },
  // },
];

// ═══════════════════════════════════════════════════════════════════
// Migration Engine
// ═══════════════════════════════════════════════════════════════════

export interface MigrationResult {
  /** The migrated data */
  data: MigratableData;
  /** Whether any migrations were applied */
  migrated: boolean;
  /** Version the data started at */
  fromVersion: number;
  /** Version the data ended at */
  toVersion: number;
  /** Names of migrations that were applied */
  appliedMigrations: string[];
}

/**
 * Run all pending migrations on the given data, bringing it up to
 * CURRENT_SCHEMA_VERSION. Returns the migrated data and metadata
 * about what was applied.
 *
 * Safe to call on already-current data (returns immediately with migrated=false).
 */
export function migrateToLatest(data: MigratableData): MigrationResult {
  const fromVersion = data.schemaVersion || 1;

  if (fromVersion >= CURRENT_SCHEMA_VERSION) {
    return {
      data: { ...data, schemaVersion: CURRENT_SCHEMA_VERSION },
      migrated: false,
      fromVersion,
      toVersion: CURRENT_SCHEMA_VERSION,
      appliedMigrations: [],
    };
  }

  let current = { ...data };
  const appliedMigrations: string[] = [];

  // Sort migrations by version (defensive — they should already be in order)
  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of sorted) {
    if (migration.version > fromVersion && migration.version <= CURRENT_SCHEMA_VERSION) {
      console.log(
        `[Migration] v${migration.version - 1} → v${migration.version}: ${migration.name}`
      );
      try {
        current = migration.migrate(current);
        current.schemaVersion = migration.version;
        appliedMigrations.push(migration.name);
      } catch (error) {
        // Migration failure is non-fatal — log and continue with what we have.
        // Better to show slightly stale data than to crash the app.
        console.error(
          `[Migration] FAILED v${migration.version} (${migration.name}):`,
          error
        );
        // Stop applying further migrations — downstream ones may depend on this one
        break;
      }
    }
  }

  current.schemaVersion = CURRENT_SCHEMA_VERSION;

  if (appliedMigrations.length > 0) {
    console.log(
      `[Migration] Complete: v${fromVersion} → v${CURRENT_SCHEMA_VERSION} ` +
      `(${appliedMigrations.length} migration${appliedMigrations.length > 1 ? 's' : ''} applied)`
    );
  }

  return {
    data: current,
    migrated: appliedMigrations.length > 0,
    fromVersion,
    toVersion: CURRENT_SCHEMA_VERSION,
    appliedMigrations,
  };
}

/**
 * Convenience: migrate a cloud ProjectSnapshot.
 * Wraps/unwraps the snapshot shape so callers don't have to restructure.
 */
export function migrateSnapshot(snapshot: {
  project: TokenProject;
  nodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  pages: Page[];
  themes: Theme[];
  canvasStates: CanvasState[];
  advancedLogic?: NodeAdvancedLogic[];
  schemaVersion?: number;
  [key: string]: any;
}): {
  snapshot: typeof snapshot;
  migrated: boolean;
  appliedMigrations: string[];
} {
  const result = migrateToLatest({
    nodes: snapshot.nodes || [],
    tokens: snapshot.tokens || [],
    groups: snapshot.groups || [],
    pages: snapshot.pages || [],
    themes: snapshot.themes || [],
    projects: snapshot.project ? [snapshot.project] : [],
    canvasStates: snapshot.canvasStates || [],
    advancedLogic: snapshot.advancedLogic || [],
    schemaVersion: snapshot.schemaVersion,
  });

  return {
    snapshot: {
      ...snapshot,
      nodes: result.data.nodes,
      tokens: result.data.tokens,
      groups: result.data.groups,
      pages: result.data.pages,
      themes: result.data.themes,
      canvasStates: result.data.canvasStates || snapshot.canvasStates || [],
      advancedLogic: result.data.advancedLogic || snapshot.advancedLogic || [],
      computedTokens: result.data.computedTokens || snapshot.computedTokens,
      schemaVersion: result.data.schemaVersion,
    },
    migrated: result.migrated,
    appliedMigrations: result.appliedMigrations,
  };
}

/**
 * Get the current schema version. Useful for stamping into saved data.
 */
export function getCurrentSchemaVersion(): number {
  return CURRENT_SCHEMA_VERSION;
}

// ═══════════════════════════════════════════════════════════════════
// Separate-storage migration helpers
// ═══════════════════════════════════════════════════════════════════

const ADV_LOGIC_VERSION_KEY = '0colors-advanced-logic-schema-version';

/**
 * Migrate advancedLogic loaded from localStorage (stored separately
 * from the main data blob). Reads/writes its own version stamp so
 * it participates in the same migration pipeline.
 *
 * Returns { data, migrated } — caller should persist data back if migrated.
 */
export function migrateAdvancedLogic(
  advancedLogic: NodeAdvancedLogic[]
): { data: NodeAdvancedLogic[]; migrated: boolean } {
  let storedVersion = 1;
  try {
    const raw = localStorage.getItem(ADV_LOGIC_VERSION_KEY);
    if (raw) storedVersion = parseInt(raw, 10) || 1;
  } catch { /* ignore */ }

  if (storedVersion >= CURRENT_SCHEMA_VERSION) {
    return { data: advancedLogic, migrated: false };
  }

  // Run through the migration pipeline with advancedLogic as the primary payload.
  // We provide empty arrays for other fields since we only care about advancedLogic here.
  const result = migrateToLatest({
    nodes: [],
    tokens: [],
    groups: [],
    pages: [],
    themes: [],
    advancedLogic,
    schemaVersion: storedVersion,
  });

  // Persist the new version so we don't re-run on next load
  try {
    localStorage.setItem(ADV_LOGIC_VERSION_KEY, String(CURRENT_SCHEMA_VERSION));
  } catch { /* ignore */ }

  if (result.migrated) {
    console.log(`[Migration] advancedLogic migrated: ${result.appliedMigrations.join(', ')}`);
  }

  return {
    data: result.data.advancedLogic || advancedLogic,
    migrated: result.migrated,
  };
}