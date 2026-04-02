import { Hono } from 'hono';
import { getAIConversations, saveAIConversations, getAISettings, saveAISettings } from '../db.js';
import { AI_PAYLOAD_MAX_BYTES } from '../constants.js';
import { requireAuth } from '../middleware/auth.js';
import { trimAIConversations } from '../helpers/ai.js';

const router = new Hono();

// ---------------------------------------------------------------------------
// GET /api/ai-conversations — Authenticated
// ---------------------------------------------------------------------------
router.get('/ai-conversations', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const conversations = await getAIConversations(userId);
        return c.json({ ok: true, conversations });
    } catch (err: any) {
        console.error('[ai-conversations:get] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/ai-conversations — Authenticated
// ---------------------------------------------------------------------------
router.post('/ai-conversations', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        // Check payload size
        const contentLength = parseInt(c.req.header('Content-Length') || '0', 10);
        if (contentLength > AI_PAYLOAD_MAX_BYTES) {
            return c.json({ error: `Payload too large (max ${AI_PAYLOAD_MAX_BYTES / 1024}KB)` }, 413);
        }

        const body = await c.req.json();
        const { conversations } = body;

        if (!Array.isArray(conversations)) {
            return c.json({ error: 'conversations must be an array' }, 400);
        }

        // Server-side trim: keep most recent conversations, cap messages
        const trimmed = trimAIConversations(conversations);

        await saveAIConversations(userId, trimmed);
        return c.json({ ok: true, trimmedTo: trimmed.length });
    } catch (err: any) {
        console.error('[ai-conversations:post] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/ai-settings — Authenticated
// ---------------------------------------------------------------------------
router.get('/ai-settings', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const settings = await getAISettings(userId);
        return c.json({ ok: true, settings: settings ?? null });
    } catch (err: any) {
        console.error('[ai-settings:get] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/ai-settings — Authenticated
// ---------------------------------------------------------------------------
router.post('/ai-settings', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const body = await c.req.json();
        const { settings } = body;

        if (!settings || typeof settings !== 'object') {
            return c.json({ error: 'settings object is required' }, 400);
        }

        await saveAISettings(userId, settings);
        return c.json({ ok: true });
    } catch (err: any) {
        console.error('[ai-settings:post] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

export default router;
