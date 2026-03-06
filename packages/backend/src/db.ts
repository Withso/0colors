import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err.message);
});

/** Get a single value by key */
export async function kvGet(key: string): Promise<any> {
    try {
        const { rows } = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
        return rows[0]?.value ?? null;
    } catch (err) {
        console.error(`[db] kvGet failed for key="${key}":`, err);
        throw err;
    }
}

/** Set a single key-value pair (upsert) */
export async function kvSet(key: string, value: any): Promise<boolean> {
    try {
        const { rowCount } = await pool.query(
            'INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()',
            [key, JSON.stringify(value)]
        );
        return (rowCount ?? 0) > 0;
    } catch (err) {
        console.error(`[db] kvSet failed for key="${key}":`, err);
        throw err;
    }
}

/** Delete a single key */
export async function kvDel(key: string): Promise<void> {
    try {
        await pool.query('DELETE FROM kv_store WHERE key = $1', [key]);
    } catch (err) {
        console.error(`[db] kvDel failed for key="${key}":`, err);
        throw err;
    }
}

/** Get multiple values by keys (preserves order, null for missing) */
export async function kvMget(keys: string[]): Promise<any[]> {
    if (keys.length === 0) return [];
    try {
        const { rows } = await pool.query('SELECT key, value FROM kv_store WHERE key = ANY($1)', [keys]);
        const map = new Map(rows.map((r: any) => [r.key, r.value]));
        return keys.map(k => map.get(k) ?? null);
    } catch (err) {
        console.error(`[db] kvMget failed for ${keys.length} keys:`, err);
        throw err;
    }
}

/** Set multiple key-value pairs (upsert) */
export async function kvMset(entries: [string, any][]): Promise<void> {
    if (entries.length === 0) return;
    try {
        const values = entries.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::jsonb, NOW())`).join(', ');
        const params = entries.flatMap(([k, v]) => [k, JSON.stringify(v)]);
        await pool.query(
            `INSERT INTO kv_store (key, value, updated_at) VALUES ${values} ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            params
        );
    } catch (err) {
        console.error(`[db] kvMset failed for ${entries.length} entries:`, err);
        throw err;
    }
}

/** Get all key-value pairs matching a prefix */
export async function kvGetByPrefix(prefix: string): Promise<{ key: string; value: any }[]> {
    try {
        const { rows } = await pool.query('SELECT key, value FROM kv_store WHERE key LIKE $1', [prefix + '%']);
        return rows;
    } catch (err) {
        console.error(`[db] kvGetByPrefix failed for prefix="${prefix}":`, err);
        throw err;
    }
}

export { pool };
