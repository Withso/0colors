import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err.message);
});

// ===========================================================================
//  Schema Initialization
// ===========================================================================

export async function initSchema(): Promise<void> {
    await pool.query(`
        -- Users table (replaces user:{id}:meta + user:admin:{id})
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

        -- Projects table (replaces project:{id}:snapshot + project:{id}:owner)
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            snapshot JSONB,
            synced_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

        -- AI Conversations (replaces user:{id}:ai-conversations)
        CREATE TABLE IF NOT EXISTS ai_conversations (
            user_id TEXT PRIMARY KEY,
            conversations JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- AI Settings (replaces user:{id}:ai-settings)
        CREATE TABLE IF NOT EXISTS ai_settings (
            user_id TEXT PRIMARY KEY,
            settings JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Token Outputs (replaces project:{id}:token-output:{format})
        CREATE TABLE IF NOT EXISTS token_outputs (
            project_id TEXT NOT NULL,
            format TEXT NOT NULL,
            content TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (project_id, format)
        );

        -- Dev Configs (replaces dev-config:{id})
        CREATE TABLE IF NOT EXISTS dev_configs (
            project_id TEXT PRIMARY KEY,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Webhook Pending (replaces webhook:{id}:pending)
        CREATE TABLE IF NOT EXISTS webhook_pending (
            project_id TEXT PRIMARY KEY,
            payload JSONB NOT NULL,
            received_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Community Publications (replaces community:meta/snapshot/thumbnail/slug)
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

        -- App Settings (replaces app:* keys)
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value JSONB,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    // ── Session locking columns (added post-initial schema) ──
    await pool.query(`
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS locked_by TEXT;
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS lock_session TEXT;
    `).catch(() => {}); // Ignore if columns already exist

    console.log('[db] Schema initialized (9 tables)');
}

// ===========================================================================
//  Users
// ===========================================================================

export interface UserRow {
    id: string;
    email: string;
    name: string;
    role: string;
    is_admin: boolean;
    cloud_project_ids: string[];
    created_at: Date;
    updated_at: Date;
}

export async function getUser(userId: string): Promise<UserRow | null> {
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        return rows[0] ?? null;
    } catch (err) {
        console.error(`[db] getUser failed for id="${userId}":`, err);
        throw err;
    }
}

export async function createUser(userId: string, data: { email: string; name: string; role?: string; is_admin?: boolean; cloud_project_ids?: string[] }): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO users (id, email, name, role, is_admin, cloud_project_ids, created_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
             ON CONFLICT (id) DO UPDATE SET
               email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role,
               is_admin = EXCLUDED.is_admin, cloud_project_ids = EXCLUDED.cloud_project_ids,
               updated_at = NOW()`,
            [userId, data.email, data.name, data.role ?? 'user', data.is_admin ?? false, JSON.stringify(data.cloud_project_ids ?? [])]
        );
    } catch (err) {
        console.error(`[db] createUser failed for id="${userId}":`, err);
        throw err;
    }
}

export async function updateUser(userId: string, data: Partial<Pick<UserRow, 'email' | 'name' | 'role' | 'is_admin' | 'cloud_project_ids'>>): Promise<void> {
    try {
        const sets: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (data.email !== undefined) { sets.push(`email = $${idx++}`); params.push(data.email); }
        if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
        if (data.role !== undefined) { sets.push(`role = $${idx++}`); params.push(data.role); }
        if (data.is_admin !== undefined) { sets.push(`is_admin = $${idx++}`); params.push(data.is_admin); }
        if (data.cloud_project_ids !== undefined) { sets.push(`cloud_project_ids = $${idx++}::jsonb`); params.push(JSON.stringify(data.cloud_project_ids)); }

        if (sets.length === 0) return;

        sets.push(`updated_at = NOW()`);
        params.push(userId);
        await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    } catch (err) {
        console.error(`[db] updateUser failed for id="${userId}":`, err);
        throw err;
    }
}

export async function isUserAdmin(userId: string): Promise<boolean> {
    try {
        const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
        return rows[0]?.is_admin === true;
    } catch (err) {
        console.error(`[db] isUserAdmin failed for id="${userId}":`, err);
        throw err;
    }
}

// ===========================================================================
//  Projects
// ===========================================================================

export interface ProjectRow {
    id: string;
    owner_id: string;
    snapshot: any;
    synced_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export async function getProject(projectId: string): Promise<ProjectRow | null> {
    try {
        const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
        return rows[0] ?? null;
    } catch (err) {
        console.error(`[db] getProject failed for id="${projectId}":`, err);
        throw err;
    }
}

export async function getProjectOwner(projectId: string): Promise<string | null> {
    try {
        const { rows } = await pool.query('SELECT owner_id FROM projects WHERE id = $1', [projectId]);
        return rows[0]?.owner_id ?? null;
    } catch (err) {
        console.error(`[db] getProjectOwner failed for id="${projectId}":`, err);
        throw err;
    }
}

export async function getProjectSnapshot(projectId: string): Promise<any | null> {
    try {
        const { rows } = await pool.query('SELECT snapshot FROM projects WHERE id = $1', [projectId]);
        return rows[0]?.snapshot ?? null;
    } catch (err) {
        console.error(`[db] getProjectSnapshot failed for id="${projectId}":`, err);
        throw err;
    }
}

export async function upsertProject(projectId: string, ownerId: string, snapshot: any): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO projects (id, owner_id, snapshot, synced_at, created_at)
             VALUES ($1, $2, $3::jsonb, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET
               owner_id = EXCLUDED.owner_id, snapshot = EXCLUDED.snapshot,
               synced_at = NOW(), updated_at = NOW()`,
            [projectId, ownerId, JSON.stringify(snapshot)]
        );
    } catch (err) {
        console.error(`[db] upsertProject failed for id="${projectId}":`, err);
        throw err;
    }
}

export async function upsertProjectOwner(projectId: string, ownerId: string): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO projects (id, owner_id)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, updated_at = NOW()`,
            [projectId, ownerId]
        );
    } catch (err) {
        console.error(`[db] upsertProjectOwner failed for id="${projectId}":`, err);
        throw err;
    }
}

export async function updateProjectSnapshot(projectId: string, snapshot: any): Promise<void> {
    try {
        await pool.query(
            `UPDATE projects SET snapshot = $1::jsonb, synced_at = NOW(), updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(snapshot), projectId]
        );
    } catch (err) {
        console.error(`[db] updateProjectSnapshot failed for id="${projectId}":`, err);
        throw err;
    }
}

export async function deleteProject(projectId: string): Promise<void> {
    try {
        await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
    } catch (err) {
        console.error(`[db] deleteProject failed for id="${projectId}":`, err);
        throw err;
    }
}

export async function getProjectsByOwner(ownerId: string): Promise<ProjectRow[]> {
    try {
        const { rows } = await pool.query('SELECT * FROM projects WHERE owner_id = $1', [ownerId]);
        return rows;
    } catch (err) {
        console.error(`[db] getProjectsByOwner failed for owner="${ownerId}":`, err);
        throw err;
    }
}

export async function getProjectsByIds(ids: string[]): Promise<ProjectRow[]> {
    if (ids.length === 0) return [];
    try {
        const { rows } = await pool.query('SELECT * FROM projects WHERE id = ANY($1)', [ids]);
        return rows;
    } catch (err) {
        console.error(`[db] getProjectsByIds failed for ${ids.length} ids:`, err);
        throw err;
    }
}

export async function batchUpsertProjects(entries: { id: string; ownerId: string; snapshot: any }[]): Promise<void> {
    if (entries.length === 0) return;
    try {
        const values = entries.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}::jsonb, NOW(), NOW())`).join(', ');
        const params = entries.flatMap(e => [e.id, e.ownerId, JSON.stringify(e.snapshot)]);
        await pool.query(
            `INSERT INTO projects (id, owner_id, snapshot, synced_at, created_at)
             VALUES ${values}
             ON CONFLICT (id) DO UPDATE SET
               owner_id = EXCLUDED.owner_id, snapshot = EXCLUDED.snapshot,
               synced_at = NOW(), updated_at = NOW()`,
            params
        );
    } catch (err) {
        console.error(`[db] batchUpsertProjects failed for ${entries.length} entries:`, err);
        throw err;
    }
}

// ===========================================================================
//  AI Conversations
// ===========================================================================

export async function getAIConversations(userId: string): Promise<any[]> {
    try {
        const { rows } = await pool.query('SELECT conversations FROM ai_conversations WHERE user_id = $1', [userId]);
        return rows[0]?.conversations ?? [];
    } catch (err) {
        console.error(`[db] getAIConversations failed for user="${userId}":`, err);
        throw err;
    }
}

export async function saveAIConversations(userId: string, conversations: any[]): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO ai_conversations (user_id, conversations, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (user_id) DO UPDATE SET conversations = EXCLUDED.conversations, updated_at = NOW()`,
            [userId, JSON.stringify(conversations)]
        );
    } catch (err) {
        console.error(`[db] saveAIConversations failed for user="${userId}":`, err);
        throw err;
    }
}

// ===========================================================================
//  AI Settings
// ===========================================================================

export async function getAISettings(userId: string): Promise<any | null> {
    try {
        const { rows } = await pool.query('SELECT settings FROM ai_settings WHERE user_id = $1', [userId]);
        return rows[0]?.settings ?? null;
    } catch (err) {
        console.error(`[db] getAISettings failed for user="${userId}":`, err);
        throw err;
    }
}

export async function saveAISettings(userId: string, settings: any): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO ai_settings (user_id, settings, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()`,
            [userId, JSON.stringify(settings)]
        );
    } catch (err) {
        console.error(`[db] saveAISettings failed for user="${userId}":`, err);
        throw err;
    }
}

// ===========================================================================
//  Token Outputs
// ===========================================================================

export async function getTokenOutput(projectId: string, format: string): Promise<string | null> {
    try {
        const { rows } = await pool.query('SELECT content FROM token_outputs WHERE project_id = $1 AND format = $2', [projectId, format]);
        return rows[0]?.content ?? null;
    } catch (err) {
        console.error(`[db] getTokenOutput failed for project="${projectId}", format="${format}":`, err);
        throw err;
    }
}

export async function saveTokenOutput(projectId: string, format: string, content: string): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO token_outputs (project_id, format, content, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (project_id, format) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
            [projectId, format, content]
        );
    } catch (err) {
        console.error(`[db] saveTokenOutput failed for project="${projectId}", format="${format}":`, err);
        throw err;
    }
}

export async function deleteTokenOutputs(projectId: string): Promise<void> {
    try {
        await pool.query('DELETE FROM token_outputs WHERE project_id = $1', [projectId]);
    } catch (err) {
        console.error(`[db] deleteTokenOutputs failed for project="${projectId}":`, err);
        throw err;
    }
}

// ===========================================================================
//  Dev Configs
// ===========================================================================

export async function getDevConfig(projectId: string): Promise<any | null> {
    try {
        const { rows } = await pool.query('SELECT config FROM dev_configs WHERE project_id = $1', [projectId]);
        return rows[0]?.config ?? null;
    } catch (err) {
        console.error(`[db] getDevConfig failed for project="${projectId}":`, err);
        throw err;
    }
}

export async function saveDevConfig(projectId: string, config: any): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO dev_configs (project_id, config, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (project_id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()`,
            [projectId, JSON.stringify(config)]
        );
    } catch (err) {
        console.error(`[db] saveDevConfig failed for project="${projectId}":`, err);
        throw err;
    }
}

export async function deleteDevConfig(projectId: string): Promise<void> {
    try {
        await pool.query('DELETE FROM dev_configs WHERE project_id = $1', [projectId]);
    } catch (err) {
        console.error(`[db] deleteDevConfig failed for project="${projectId}":`, err);
        throw err;
    }
}

export async function getAllDevConfigs(): Promise<{ project_id: string; config: any }[]> {
    try {
        const { rows } = await pool.query('SELECT project_id, config FROM dev_configs');
        return rows;
    } catch (err) {
        console.error(`[db] getAllDevConfigs failed:`, err);
        throw err;
    }
}

// ===========================================================================
//  Webhook Pending
// ===========================================================================

export async function getWebhookPending(projectId: string): Promise<any | null> {
    try {
        const { rows } = await pool.query('SELECT payload, received_at FROM webhook_pending WHERE project_id = $1', [projectId]);
        if (!rows[0]) return null;
        return rows[0].payload;
    } catch (err) {
        console.error(`[db] getWebhookPending failed for project="${projectId}":`, err);
        throw err;
    }
}

export async function saveWebhookPending(projectId: string, payload: any): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO webhook_pending (project_id, payload, received_at, updated_at)
             VALUES ($1, $2::jsonb, NOW(), NOW())
             ON CONFLICT (project_id) DO UPDATE SET payload = EXCLUDED.payload, received_at = NOW(), updated_at = NOW()`,
            [projectId, JSON.stringify(payload)]
        );
    } catch (err) {
        console.error(`[db] saveWebhookPending failed for project="${projectId}":`, err);
        throw err;
    }
}

export async function deleteWebhookPending(projectId: string): Promise<void> {
    try {
        await pool.query('DELETE FROM webhook_pending WHERE project_id = $1', [projectId]);
    } catch (err) {
        console.error(`[db] deleteWebhookPending failed for project="${projectId}":`, err);
        throw err;
    }
}

// ===========================================================================
//  Community Publications
// ===========================================================================

export interface CommunityRow {
    project_id: string;
    slug: string;
    title: string;
    description: string;
    allow_remix: boolean;
    user_id: string;
    user_name: string;
    snapshot: any;
    thumbnail: string | null;
    node_count: number;
    token_count: number;
    published_at: Date;
    updated_at: Date;
}

export async function getCommunityPublication(projectId: string): Promise<CommunityRow | null> {
    try {
        const { rows } = await pool.query('SELECT * FROM community_publications WHERE project_id = $1', [projectId]);
        return rows[0] ?? null;
    } catch (err) {
        console.error(`[db] getCommunityPublication failed for project="${projectId}":`, err);
        throw err;
    }
}

export async function getCommunityMeta(projectId: string): Promise<Omit<CommunityRow, 'snapshot' | 'thumbnail'> | null> {
    try {
        const { rows } = await pool.query(
            `SELECT project_id, slug, title, description, allow_remix, user_id, user_name,
                    node_count, token_count, published_at, updated_at
             FROM community_publications WHERE project_id = $1`,
            [projectId]
        );
        return rows[0] ?? null;
    } catch (err) {
        console.error(`[db] getCommunityMeta failed for project="${projectId}":`, err);
        throw err;
    }
}

export async function getCommunityBySlug(slug: string): Promise<CommunityRow | null> {
    try {
        const { rows } = await pool.query('SELECT * FROM community_publications WHERE slug = $1', [slug]);
        return rows[0] ?? null;
    } catch (err) {
        console.error(`[db] getCommunityBySlug failed for slug="${slug}":`, err);
        throw err;
    }
}

export async function checkSlugExists(slug: string, excludeProjectId?: string): Promise<boolean> {
    try {
        if (excludeProjectId) {
            const { rows } = await pool.query(
                'SELECT 1 FROM community_publications WHERE slug = $1 AND project_id != $2',
                [slug, excludeProjectId]
            );
            return rows.length > 0;
        }
        const { rows } = await pool.query('SELECT 1 FROM community_publications WHERE slug = $1', [slug]);
        return rows.length > 0;
    } catch (err) {
        console.error(`[db] checkSlugExists failed for slug="${slug}":`, err);
        throw err;
    }
}

export async function createCommunityPublication(data: {
    project_id: string; slug: string; title: string; description: string;
    allow_remix: boolean; user_id: string; user_name: string;
    snapshot: any; thumbnail?: string;
    node_count: number; token_count: number;
}): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO community_publications
             (project_id, slug, title, description, allow_remix, user_id, user_name,
              snapshot, thumbnail, node_count, token_count, published_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, NOW())`,
            [data.project_id, data.slug, data.title, data.description, data.allow_remix,
             data.user_id, data.user_name, JSON.stringify(data.snapshot),
             data.thumbnail ?? null, data.node_count, data.token_count]
        );
    } catch (err) {
        console.error(`[db] createCommunityPublication failed for project="${data.project_id}":`, err);
        throw err;
    }
}

export async function updateCommunityPublication(projectId: string, data: Partial<{
    slug: string; title: string; description: string; allow_remix: boolean;
    snapshot: any; thumbnail: string; node_count: number; token_count: number;
}>): Promise<void> {
    try {
        const sets: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (data.slug !== undefined) { sets.push(`slug = $${idx++}`); params.push(data.slug); }
        if (data.title !== undefined) { sets.push(`title = $${idx++}`); params.push(data.title); }
        if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
        if (data.allow_remix !== undefined) { sets.push(`allow_remix = $${idx++}`); params.push(data.allow_remix); }
        if (data.snapshot !== undefined) { sets.push(`snapshot = $${idx++}::jsonb`); params.push(JSON.stringify(data.snapshot)); }
        if (data.thumbnail !== undefined) { sets.push(`thumbnail = $${idx++}`); params.push(data.thumbnail); }
        if (data.node_count !== undefined) { sets.push(`node_count = $${idx++}`); params.push(data.node_count); }
        if (data.token_count !== undefined) { sets.push(`token_count = $${idx++}`); params.push(data.token_count); }

        if (sets.length === 0) return;

        sets.push(`updated_at = NOW()`);
        params.push(projectId);
        await pool.query(`UPDATE community_publications SET ${sets.join(', ')} WHERE project_id = $${idx}`, params);
    } catch (err) {
        console.error(`[db] updateCommunityPublication failed for project="${projectId}":`, err);
        throw err;
    }
}

export async function deleteCommunityPublication(projectId: string): Promise<void> {
    try {
        await pool.query('DELETE FROM community_publications WHERE project_id = $1', [projectId]);
    } catch (err) {
        console.error(`[db] deleteCommunityPublication failed for project="${projectId}":`, err);
        throw err;
    }
}

export async function listCommunityPublications(): Promise<Omit<CommunityRow, 'snapshot' | 'thumbnail'>[]> {
    try {
        const { rows } = await pool.query(
            `SELECT project_id, slug, title, description, allow_remix, user_id, user_name,
                    node_count, token_count, published_at, updated_at
             FROM community_publications
             ORDER BY published_at DESC`
        );
        return rows;
    } catch (err) {
        console.error(`[db] listCommunityPublications failed:`, err);
        throw err;
    }
}

export async function getCommunityThumbnail(projectId: string): Promise<string | null> {
    try {
        const { rows } = await pool.query('SELECT thumbnail FROM community_publications WHERE project_id = $1', [projectId]);
        return rows[0]?.thumbnail ?? null;
    } catch (err) {
        console.error(`[db] getCommunityThumbnail failed for project="${projectId}":`, err);
        throw err;
    }
}

export async function getCommunitySnapshot(projectId: string): Promise<any | null> {
    try {
        const { rows } = await pool.query('SELECT snapshot FROM community_publications WHERE project_id = $1', [projectId]);
        return rows[0]?.snapshot ?? null;
    } catch (err) {
        console.error(`[db] getCommunitySnapshot failed for project="${projectId}":`, err);
        throw err;
    }
}

// ===========================================================================
//  App Settings
// ===========================================================================

export async function getAppSetting(key: string): Promise<any | null> {
    try {
        const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
        return rows[0]?.value ?? null;
    } catch (err) {
        console.error(`[db] getAppSetting failed for key="${key}":`, err);
        throw err;
    }
}

export async function setAppSetting(key: string, value: any): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO app_settings (key, value, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [key, JSON.stringify(value)]
        );
    } catch (err) {
        console.error(`[db] setAppSetting failed for key="${key}":`, err);
        throw err;
    }
}

// ===========================================================================
//  Session Locking
// ===========================================================================

const LOCK_STALE_MS = 30 * 1000; // Lock expires after 30s without heartbeat (heartbeat is 15s)

/** Attempt to lock a project for a session. Returns { locked, lockedBy, lockSession } */
export async function lockProject(projectId: string, userId: string, sessionId: string): Promise<{
    locked: boolean;
    lockedBy?: string;
    lockSession?: string;
}> {
    try {
        // Check for existing lock
        const { rows } = await pool.query(
            'SELECT locked_by, locked_at, lock_session FROM projects WHERE id = $1',
            [projectId]
        );
        if (rows.length === 0) return { locked: false };

        const existing = rows[0];
        const now = Date.now();
        const lockAge = existing.locked_at ? now - new Date(existing.locked_at).getTime() : Infinity;

        // Can take the lock if:
        // 1. No existing lock
        // 2. Lock is stale (no heartbeat for 30s — old session died without releasing)
        // 3. Same session (re-acquire after reconnect within same tab)
        // Otherwise: show conflict dialog. User clicks "Open here" to force-take.
        console.log(`[lock] Project ${projectId}: locked_by=${existing.locked_by}, lock_session=${existing.lock_session}, lockAge=${Math.round(lockAge/1000)}s, requesting=${sessionId}`);
        if (!existing.locked_by || lockAge > LOCK_STALE_MS || existing.lock_session === sessionId) {
            await pool.query(
                'UPDATE projects SET locked_by = $1, locked_at = NOW(), lock_session = $2 WHERE id = $3',
                [userId, sessionId, projectId]
            );
            return { locked: true };
        }

        // Locked by another session
        return { locked: false, lockedBy: existing.locked_by, lockSession: existing.lock_session };
    } catch (err) {
        console.error(`[db] lockProject failed for ${projectId}:`, err);
        return { locked: false };
    }
}

/** Refresh lock heartbeat */
export async function refreshLock(projectId: string, sessionId: string): Promise<boolean> {
    try {
        const { rowCount } = await pool.query(
            'UPDATE projects SET locked_at = NOW() WHERE id = $1 AND lock_session = $2',
            [projectId, sessionId]
        );
        return (rowCount ?? 0) > 0;
    } catch {
        return false;
    }
}

/** Release lock */
export async function unlockProject(projectId: string, sessionId: string): Promise<boolean> {
    try {
        const { rowCount } = await pool.query(
            'UPDATE projects SET locked_by = NULL, locked_at = NULL, lock_session = NULL WHERE id = $1 AND lock_session = $2',
            [projectId, sessionId]
        );
        return (rowCount ?? 0) > 0;
    } catch {
        return false;
    }
}

/** Force-take a lock (when user confirms "continue here") */
export async function forceLockProject(projectId: string, userId: string, sessionId: string): Promise<boolean> {
    try {
        await pool.query(
            'UPDATE projects SET locked_by = $1, locked_at = NOW(), lock_session = $2 WHERE id = $3',
            [userId, sessionId, projectId]
        );
        return true;
    } catch {
        return false;
    }
}

export { pool };
