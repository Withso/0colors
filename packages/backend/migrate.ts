import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Migration script: kv_store → normalized tables
 *
 * This reads ALL rows from kv_store, classifies them by key pattern,
 * and inserts into the appropriate new table. The kv_store table is
 * kept intact as a backup — it is NOT dropped.
 *
 * Usage:
 *   DATABASE_URL=<your-db-url> npx tsx migrate.ts
 *
 * Or for cross-database migration:
 *   SOURCE_DATABASE_URL=<source> TARGET_DATABASE_URL=<target> npx tsx migrate.ts
 */

async function migrate() {
    const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
    const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

    if (!sourceUrl || !targetUrl) {
        console.error('ERROR: Set DATABASE_URL (or both SOURCE_DATABASE_URL and TARGET_DATABASE_URL)');
        process.exit(1);
    }

    const source = new Pool({ connectionString: sourceUrl });
    const target = sourceUrl === targetUrl ? source : new Pool({ connectionString: targetUrl });

    try {
        // ---------------------------------------------------------------
        // Step 1: Create new tables on target
        // ---------------------------------------------------------------
        console.log('[migrate] Creating new tables...');
        await target.query(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL DEFAULT 'user',
                is_admin BOOLEAN NOT NULL DEFAULT FALSE,
                cloud_project_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                snapshot JSONB,
                synced_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

            CREATE TABLE IF NOT EXISTS ai_conversations (
                user_id TEXT PRIMARY KEY,
                conversations JSONB NOT NULL DEFAULT '[]'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS ai_settings (
                user_id TEXT PRIMARY KEY,
                settings JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS token_outputs (
                project_id TEXT NOT NULL,
                format TEXT NOT NULL,
                content TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (project_id, format)
            );

            CREATE TABLE IF NOT EXISTS dev_configs (
                project_id TEXT PRIMARY KEY,
                config JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS webhook_pending (
                project_id TEXT PRIMARY KEY,
                payload JSONB NOT NULL,
                received_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS community_publications (
                project_id TEXT PRIMARY KEY,
                slug TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                allow_remix BOOLEAN NOT NULL DEFAULT TRUE,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL DEFAULT '',
                snapshot JSONB,
                thumbnail TEXT,
                node_count INTEGER NOT NULL DEFAULT 0,
                token_count INTEGER NOT NULL DEFAULT 0,
                published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_community_slug ON community_publications(slug);
            CREATE INDEX IF NOT EXISTS idx_community_user ON community_publications(user_id);
            CREATE INDEX IF NOT EXISTS idx_community_published ON community_publications(published_at DESC);

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value JSONB,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        console.log('[migrate] Tables created.');

        // ---------------------------------------------------------------
        // Step 2: Read all rows from kv_store
        // ---------------------------------------------------------------
        console.log('[migrate] Reading kv_store...');
        const { rows } = await source.query('SELECT key, value, updated_at FROM kv_store');
        console.log(`[migrate] Found ${rows.length} rows in kv_store.`);

        if (rows.length === 0) {
            console.log('[migrate] Nothing to migrate.');
            return;
        }

        // ---------------------------------------------------------------
        // Step 3: Classify and collect rows by type
        // ---------------------------------------------------------------
        const userMetas: Map<string, { value: any; updated_at: any }> = new Map();
        const userAdmins: Map<string, boolean> = new Map();
        const projectSnapshots: Map<string, { value: any; updated_at: any }> = new Map();
        const projectOwners: Map<string, string> = new Map();
        const aiConvos: Map<string, { value: any; updated_at: any }> = new Map();
        const aiSettingsMap: Map<string, { value: any; updated_at: any }> = new Map();
        const tokenOutputs: { projectId: string; format: string; content: string; updated_at: any }[] = [];
        const devConfigs: Map<string, { value: any; updated_at: any }> = new Map();
        const webhookPendings: Map<string, { value: any; updated_at: any }> = new Map();
        const communityMetas: Map<string, any> = new Map();
        const communitySnapshots: Map<string, any> = new Map();
        const communityThumbnails: Map<string, string> = new Map();
        const appSettings: { key: string; value: any; updated_at: any }[] = [];
        let unclassified = 0;

        for (const row of rows) {
            const key: string = row.key;
            const value = row.value;
            const updated_at = row.updated_at;

            // user:{userId}:meta
            const userMetaMatch = key.match(/^user:([^:]+):meta$/);
            if (userMetaMatch) {
                userMetas.set(userMetaMatch[1], { value, updated_at });
                continue;
            }

            // user:admin:{userId}
            const userAdminMatch = key.match(/^user:admin:(.+)$/);
            if (userAdminMatch) {
                userAdmins.set(userAdminMatch[1], value === true || value === 'true' || String(value) === 'true');
                continue;
            }

            // user:{userId}:ai-conversations
            const aiConvoMatch = key.match(/^user:([^:]+):ai-conversations$/);
            if (aiConvoMatch) {
                aiConvos.set(aiConvoMatch[1], { value, updated_at });
                continue;
            }

            // user:{userId}:ai-settings
            const aiSettingsMatch = key.match(/^user:([^:]+):ai-settings$/);
            if (aiSettingsMatch) {
                aiSettingsMap.set(aiSettingsMatch[1], { value, updated_at });
                continue;
            }

            // project:{projectId}:snapshot
            const projSnapMatch = key.match(/^project:([^:]+):snapshot$/);
            if (projSnapMatch) {
                projectSnapshots.set(projSnapMatch[1], { value, updated_at });
                continue;
            }

            // project:{projectId}:owner
            const projOwnerMatch = key.match(/^project:([^:]+):owner$/);
            if (projOwnerMatch) {
                const ownerId = typeof value === 'string' ? value.replace(/^"|"$/g, '') : String(value);
                projectOwners.set(projOwnerMatch[1], ownerId);
                continue;
            }

            // project:{projectId}:token-output:{format}
            const tokenMatch = key.match(/^project:([^:]+):token-output:(.+)$/);
            if (tokenMatch) {
                const content = typeof value === 'string' ? value : JSON.stringify(value);
                tokenOutputs.push({ projectId: tokenMatch[1], format: tokenMatch[2], content, updated_at });
                continue;
            }

            // dev-config:{projectId}
            const devConfigMatch = key.match(/^dev-config:(.+)$/);
            if (devConfigMatch) {
                devConfigs.set(devConfigMatch[1], { value, updated_at });
                continue;
            }

            // webhook:{projectId}:pending
            const webhookMatch = key.match(/^webhook:([^:]+):pending$/);
            if (webhookMatch) {
                webhookPendings.set(webhookMatch[1], { value, updated_at });
                continue;
            }

            // community:meta:{projectId}
            const communityMetaMatch = key.match(/^community:meta:(.+)$/);
            if (communityMetaMatch) {
                communityMetas.set(communityMetaMatch[1], value);
                continue;
            }

            // community:snapshot:{projectId}
            const communitySnapMatch = key.match(/^community:snapshot:(.+)$/);
            if (communitySnapMatch) {
                communitySnapshots.set(communitySnapMatch[1], value);
                continue;
            }

            // community:thumbnail:{projectId}
            const communityThumbMatch = key.match(/^community:thumbnail:(.+)$/);
            if (communityThumbMatch) {
                communityThumbnails.set(communityThumbMatch[1], typeof value === 'string' ? value : String(value));
                continue;
            }

            // community:slug:{slug} — these are just lookup keys, data is in community:meta
            if (key.startsWith('community:slug:')) {
                continue; // slug is stored as a column in community_publications
            }

            // app:*
            if (key.startsWith('app:')) {
                const appKey = key.replace(/^app:/, '');
                appSettings.push({ key: appKey, value, updated_at });
                continue;
            }

            unclassified++;
            console.log(`[migrate] Unclassified key: ${key}`);
        }

        console.log('[migrate] Classification complete:');
        console.log(`  users:              ${userMetas.size} metas, ${userAdmins.size} admin flags`);
        console.log(`  projects:           ${projectSnapshots.size} snapshots, ${projectOwners.size} owners`);
        console.log(`  ai_conversations:   ${aiConvos.size}`);
        console.log(`  ai_settings:        ${aiSettingsMap.size}`);
        console.log(`  token_outputs:      ${tokenOutputs.length}`);
        console.log(`  dev_configs:        ${devConfigs.size}`);
        console.log(`  webhook_pending:    ${webhookPendings.size}`);
        console.log(`  community:          ${communityMetas.size} publications`);
        console.log(`  app_settings:       ${appSettings.length}`);
        console.log(`  unclassified:       ${unclassified}`);

        // ---------------------------------------------------------------
        // Step 4: Insert into new tables
        // ---------------------------------------------------------------

        // --- Users ---
        console.log('[migrate] Migrating users...');
        for (const [userId, { value: meta, updated_at }] of userMetas) {
            const isAdmin = userAdmins.get(userId) ?? false;
            const cloudProjectIds = meta.cloudProjectIds || meta.cloudProjectsList || meta.cloudProjects || [];
            await target.query(
                `INSERT INTO users (id, email, name, role, is_admin, cloud_project_ids, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
                 ON CONFLICT (id) DO UPDATE SET
                   email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role,
                   is_admin = EXCLUDED.is_admin, cloud_project_ids = EXCLUDED.cloud_project_ids,
                   updated_at = EXCLUDED.updated_at`,
                [
                    userId,
                    meta.email || '',
                    meta.name || '',
                    meta.role || 'user',
                    isAdmin,
                    JSON.stringify(cloudProjectIds),
                    meta.createdAt ? new Date(meta.createdAt) : (updated_at || new Date()),
                    updated_at || new Date(),
                ]
            );
        }
        console.log(`[migrate] Migrated ${userMetas.size} users.`);

        // --- Projects ---
        console.log('[migrate] Migrating projects...');
        // Collect all project IDs from both snapshots and owners
        const allProjectIds = new Set([...projectSnapshots.keys(), ...projectOwners.keys()]);
        for (const projectId of allProjectIds) {
            const snap = projectSnapshots.get(projectId);
            const ownerId = projectOwners.get(projectId) || snap?.value?._userId || 'unknown';
            const snapshot = snap?.value ?? null;
            const updated_at = snap?.updated_at || new Date();

            await target.query(
                `INSERT INTO projects (id, owner_id, snapshot, synced_at, created_at, updated_at)
                 VALUES ($1, $2, $3::jsonb, $4, $5, $5)
                 ON CONFLICT (id) DO UPDATE SET
                   owner_id = EXCLUDED.owner_id, snapshot = EXCLUDED.snapshot,
                   synced_at = EXCLUDED.synced_at, updated_at = EXCLUDED.updated_at`,
                [projectId, ownerId, snapshot ? JSON.stringify(snapshot) : null, updated_at, updated_at]
            );
        }
        console.log(`[migrate] Migrated ${allProjectIds.size} projects.`);

        // --- AI Conversations ---
        console.log('[migrate] Migrating AI conversations...');
        for (const [userId, { value, updated_at }] of aiConvos) {
            await target.query(
                `INSERT INTO ai_conversations (user_id, conversations, updated_at)
                 VALUES ($1, $2::jsonb, $3)
                 ON CONFLICT (user_id) DO UPDATE SET conversations = EXCLUDED.conversations, updated_at = EXCLUDED.updated_at`,
                [userId, JSON.stringify(value), updated_at || new Date()]
            );
        }
        console.log(`[migrate] Migrated ${aiConvos.size} AI conversations.`);

        // --- AI Settings ---
        console.log('[migrate] Migrating AI settings...');
        for (const [userId, { value, updated_at }] of aiSettingsMap) {
            await target.query(
                `INSERT INTO ai_settings (user_id, settings, updated_at)
                 VALUES ($1, $2::jsonb, $3)
                 ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = EXCLUDED.updated_at`,
                [userId, JSON.stringify(value), updated_at || new Date()]
            );
        }
        console.log(`[migrate] Migrated ${aiSettingsMap.size} AI settings.`);

        // --- Token Outputs ---
        console.log('[migrate] Migrating token outputs...');
        for (const tok of tokenOutputs) {
            await target.query(
                `INSERT INTO token_outputs (project_id, format, content, updated_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (project_id, format) DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at`,
                [tok.projectId, tok.format, tok.content, tok.updated_at || new Date()]
            );
        }
        console.log(`[migrate] Migrated ${tokenOutputs.length} token outputs.`);

        // --- Dev Configs ---
        console.log('[migrate] Migrating dev configs...');
        for (const [projectId, { value, updated_at }] of devConfigs) {
            await target.query(
                `INSERT INTO dev_configs (project_id, config, updated_at)
                 VALUES ($1, $2::jsonb, $3)
                 ON CONFLICT (project_id) DO UPDATE SET config = EXCLUDED.config, updated_at = EXCLUDED.updated_at`,
                [projectId, JSON.stringify(value), updated_at || new Date()]
            );
        }
        console.log(`[migrate] Migrated ${devConfigs.size} dev configs.`);

        // --- Webhook Pending ---
        console.log('[migrate] Migrating webhook pending...');
        for (const [projectId, { value, updated_at }] of webhookPendings) {
            await target.query(
                `INSERT INTO webhook_pending (project_id, payload, received_at, updated_at)
                 VALUES ($1, $2::jsonb, $3, $3)
                 ON CONFLICT (project_id) DO UPDATE SET payload = EXCLUDED.payload, received_at = EXCLUDED.received_at, updated_at = EXCLUDED.updated_at`,
                [projectId, JSON.stringify(value), updated_at || new Date()]
            );
        }
        console.log(`[migrate] Migrated ${webhookPendings.size} webhook pending entries.`);

        // --- Community Publications ---
        console.log('[migrate] Migrating community publications...');
        for (const [projectId, meta] of communityMetas) {
            const snapshot = communitySnapshots.get(projectId) ?? null;
            const thumbnail = communityThumbnails.get(projectId) ?? null;

            await target.query(
                `INSERT INTO community_publications
                 (project_id, slug, title, description, allow_remix, user_id, user_name,
                  snapshot, thumbnail, node_count, token_count, published_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
                 ON CONFLICT (project_id) DO UPDATE SET
                   slug = EXCLUDED.slug, title = EXCLUDED.title, description = EXCLUDED.description,
                   allow_remix = EXCLUDED.allow_remix, snapshot = EXCLUDED.snapshot,
                   thumbnail = EXCLUDED.thumbnail, node_count = EXCLUDED.node_count,
                   token_count = EXCLUDED.token_count, updated_at = EXCLUDED.updated_at`,
                [
                    projectId,
                    meta.slug || projectId,
                    meta.title || 'Untitled',
                    meta.description || '',
                    meta.allowRemix !== false,
                    meta.userId || 'unknown',
                    meta.userName || '',
                    snapshot ? JSON.stringify(snapshot) : null,
                    thumbnail,
                    meta.nodeCount || 0,
                    meta.tokenCount || 0,
                    meta.publishedAt ? new Date(meta.publishedAt) : new Date(),
                    meta.updatedAt ? new Date(meta.updatedAt) : new Date(),
                ]
            );
        }
        console.log(`[migrate] Migrated ${communityMetas.size} community publications.`);

        // --- App Settings ---
        console.log('[migrate] Migrating app settings...');
        for (const setting of appSettings) {
            await target.query(
                `INSERT INTO app_settings (key, value, updated_at)
                 VALUES ($1, $2::jsonb, $3)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
                [setting.key, JSON.stringify(setting.value), setting.updated_at || new Date()]
            );
        }
        console.log(`[migrate] Migrated ${appSettings.length} app settings.`);

        // ---------------------------------------------------------------
        // Done — kv_store is preserved as backup
        // ---------------------------------------------------------------
        console.log('\n[migrate] ✅ Migration complete!');
        console.log('[migrate] The kv_store table has been preserved as a backup.');
        console.log('[migrate] You can drop it later with: DROP TABLE IF EXISTS kv_store;');

    } catch (err) {
        console.error('[migrate] ❌ Migration failed:', err);
        process.exit(1);
    } finally {
        await source.end();
        if (source !== target) await target.end();
    }
}

migrate();
