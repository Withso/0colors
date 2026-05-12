import { Hono } from 'hono';
import { pool } from '../db.js';

const router = new Hono();

// ---------------------------------------------------------------------------
// Health check
//
// Returns 200 only if the DB is reachable. Used by Railway's healthcheck —
// the deploy is rolled back automatically when this fails for the configured
// timeout window.
// ---------------------------------------------------------------------------
router.get('/health', async (c) => {
    try {
        await pool.query('SELECT 1');
        return c.json({ status: 'ok', db: 'ok', timestamp: Date.now() });
    } catch (err: any) {
        console.error('[health] DB ping failed:', err?.message ?? err);
        return c.json({ status: 'degraded', db: 'unreachable', timestamp: Date.now() }, 503);
    }
});

export default router;
