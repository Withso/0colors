// ============================================================================
// CLI: db:migrate
//
// Runs initSchema() once and exits. Wired up as Railway's preDeployCommand so
// schema migrations apply between build and start, in a separate container
// (failure aborts the deploy cleanly). initSchema is idempotent — CREATE
// TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS throughout —
// so re-running is always safe.
//
// Local usage:
//   DATABASE_URL=postgres://… node packages/backend/dist/cli/migrate.js
// ============================================================================

import 'dotenv/config';
import { initSchema, pool } from '../db.js';

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('[db:migrate] DATABASE_URL is not set');
        process.exit(1);
    }
    try {
        await initSchema();
        console.log('[db:migrate] ✅ Schema is up to date');
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('[db:migrate] ❌ Migration failed:', err);
        process.exit(1);
    }
}

main();
