import { Hono } from 'hono';

const router = new Hono();

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
router.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: Date.now() });
});

export default router;
