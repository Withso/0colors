import 'dotenv/config';
import { Pool } from 'pg';

const BATCH_SIZE = 100;

async function migrate() {
    const sourceUrl = process.env.SOURCE_DATABASE_URL;
    const targetUrl = process.env.TARGET_DATABASE_URL;

    if (!sourceUrl || !targetUrl) {
        console.error('ERROR: Set both SOURCE_DATABASE_URL and TARGET_DATABASE_URL in .env');
        process.exit(1);
    }

    const source = new Pool({ connectionString: sourceUrl });
    const target = new Pool({ connectionString: targetUrl });

    try {
        // Read all rows from source
        console.log('[migrate] Reading from source table "kv_store"...');
        const { rows } = await source.query('SELECT key, value FROM kv_store');
        const total = rows.length;
        console.log(`[migrate] Found ${total} rows to migrate.`);

        if (total === 0) {
            console.log('[migrate] Nothing to migrate.');
            return;
        }

        // Insert in batches
        let migrated = 0;
        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);

            const values = batch.map((_, idx) =>
                `($${idx * 2 + 1}, $${idx * 2 + 2}::jsonb, NOW())`
            ).join(', ');

            const params = batch.flatMap(row => [row.key, JSON.stringify(row.value)]);

            await target.query(
                `INSERT INTO kv_store (key, value, updated_at) VALUES ${values}
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
                params
            );

            migrated += batch.length;
            console.log(`[migrate] Migrated ${migrated} of ${total} rows`);
        }

        console.log(`[migrate] ✅ Done! Migrated ${total} rows successfully.`);
    } catch (err) {
        console.error('[migrate] ❌ Migration failed:', err);
        process.exit(1);
    } finally {
        await source.end();
        await target.end();
    }
}

migrate();
