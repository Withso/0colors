import { Hono } from 'hono';
import { kvGet, kvSet, kvDel, kvGetByPrefix } from '../db.js';
import { getAuthUserWithName } from '../auth.js';

const router = new Hono();

// ---------------------------------------------------------------------------
// Slug Helpers
// ---------------------------------------------------------------------------

function generateSlug(title: string): string {
    return title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'untitled';
}

async function getUniqueSlug(title: string, excludeProjectId?: string): Promise<string> {
    const base = generateSlug(title);
    let slug = base;
    let counter = 1;

    while (true) {
        const existing = await kvGet(`community:slug:${slug}`);
        if (!existing || (excludeProjectId && existing.projectId === excludeProjectId)) {
            return slug;
        }
        counter++;
        slug = `${base}-${counter}`;
        if (counter > 100) {
            // Safety valve — prevent infinite loop, use timestamp suffix
            slug = `${base}-${Date.now().toString(36)}`;
            break;
        }
    }
    return slug;
}

/** Invalidate the community list cache (call after publish/update/unpublish) */
export function invalidateCommunityListCache(): void {
    listCache = null;
}

// ---------------------------------------------------------------------------
// POST /api/community/publish — Auth required
// ---------------------------------------------------------------------------
router.post('/community/publish', async (c) => {
    try {
        const user = await getAuthUserWithName(c);
        if (!user) return c.json({ error: 'Unauthorized' }, 401);
        const { userId, userName } = user;

        const body = await c.req.json();
        const { projectId, title, description, allowRemix, snapshot, thumbnailDataUrl } = body;

        // Validation
        if (!projectId || !title || !snapshot) {
            return c.json({ error: 'projectId, title, and snapshot are required' }, 400);
        }
        if (typeof title !== 'string' || title.length < 2 || title.length > 80) {
            return c.json({ error: 'Title must be 2-80 characters' }, 400);
        }
        if (description && (typeof description !== 'string' || description.length > 500)) {
            return c.json({ error: 'Description must be 0-500 characters' }, 400);
        }

        // Verify ownership
        const owner = await kvGet(`project:${projectId}:owner`);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        // Check if already published
        const existingMeta = await kvGet(`community:meta:${projectId}`);
        if (existingMeta) {
            return c.json({ error: 'Project is already published. Use PUT to update.' }, 409);
        }

        // Generate unique slug
        const slug = await getUniqueSlug(title);

        // Count nodes and tokens from snapshot
        const nodeCount = Array.isArray(snapshot.nodes) ? snapshot.nodes.length : 0;
        const tokenCount = Array.isArray(snapshot.tokens) ? snapshot.tokens.length : 0;

        const now = new Date().toISOString();
        const meta = {
            projectId,
            slug,
            title,
            description: description || '',
            allowRemix: allowRemix !== false,
            userId,
            userName,
            publishedAt: now,
            updatedAt: now,
            nodeCount,
            tokenCount,
        };

        // Store all KV entries
        await kvSet(`community:meta:${projectId}`, meta);
        await kvSet(`community:snapshot:${projectId}`, snapshot);
        await kvSet(`community:slug:${slug}`, { projectId });

        // Store thumbnail (strip data URL prefix if present)
        if (thumbnailDataUrl) {
            const base64Data = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, '');
            await kvSet(`community:thumbnail:${projectId}`, base64Data);
        }

        invalidateCommunityListCache();
        return c.json({ slug });
    } catch (err: any) {
        console.error('[community/publish] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// PUT /api/community/:projectId — Auth required (update listing)
// ---------------------------------------------------------------------------
router.put('/community/:projectId', async (c) => {
    try {
        const user = await getAuthUserWithName(c);
        if (!user) return c.json({ error: 'Unauthorized' }, 401);
        const { userId } = user;

        const projectId = c.req.param('projectId');
        const existingMeta = await kvGet(`community:meta:${projectId}`);
        if (!existingMeta) {
            return c.json({ error: 'Project is not published' }, 404);
        }
        if (existingMeta.userId !== userId) {
            return c.json({ error: 'Not the publisher of this project' }, 403);
        }

        const body = await c.req.json();
        const { title, description, allowRemix, snapshot, thumbnailDataUrl } = body;

        // Validate optional fields
        if (title !== undefined && (typeof title !== 'string' || title.length < 2 || title.length > 80)) {
            return c.json({ error: 'Title must be 2-80 characters' }, 400);
        }
        if (description !== undefined && (typeof description !== 'string' || description.length > 500)) {
            return c.json({ error: 'Description must be 0-500 characters' }, 400);
        }

        let currentSlug = existingMeta.slug;

        // If title changed, regenerate slug
        if (title && title !== existingMeta.title) {
            const newSlug = await getUniqueSlug(title, projectId);
            if (newSlug !== currentSlug) {
                // Delete old slug mapping, create new one
                await kvDel(`community:slug:${currentSlug}`);
                await kvSet(`community:slug:${newSlug}`, { projectId });
                currentSlug = newSlug;
            }
        }

        // Merge updates into meta
        const updatedMeta = {
            ...existingMeta,
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(allowRemix !== undefined && { allowRemix }),
            slug: currentSlug,
            updatedAt: new Date().toISOString(),
        };

        // Update node/token counts if snapshot provided
        if (snapshot) {
            updatedMeta.nodeCount = Array.isArray(snapshot.nodes) ? snapshot.nodes.length : existingMeta.nodeCount;
            updatedMeta.tokenCount = Array.isArray(snapshot.tokens) ? snapshot.tokens.length : existingMeta.tokenCount;
            await kvSet(`community:snapshot:${projectId}`, snapshot);
        }

        await kvSet(`community:meta:${projectId}`, updatedMeta);

        if (thumbnailDataUrl) {
            const base64Data = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, '');
            await kvSet(`community:thumbnail:${projectId}`, base64Data);
        }

        invalidateCommunityListCache();
        return c.json({ ok: true, slug: currentSlug });
    } catch (err: any) {
        console.error('[community/update] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/community/:projectId — Auth required (unpublish)
// ---------------------------------------------------------------------------
router.delete('/community/:projectId', async (c) => {
    try {
        const user = await getAuthUserWithName(c);
        if (!user) return c.json({ error: 'Unauthorized' }, 401);
        const { userId } = user;

        const projectId = c.req.param('projectId');
        const existingMeta = await kvGet(`community:meta:${projectId}`);
        if (!existingMeta) {
            return c.json({ error: 'Project is not published' }, 404);
        }
        if (existingMeta.userId !== userId) {
            return c.json({ error: 'Not the publisher of this project' }, 403);
        }

        // Delete all community KV keys
        await kvDel(`community:meta:${projectId}`);
        await kvDel(`community:snapshot:${projectId}`);
        await kvDel(`community:thumbnail:${projectId}`);
        await kvDel(`community:slug:${existingMeta.slug}`);

        invalidateCommunityListCache();
        return c.json({ ok: true });
    } catch (err: any) {
        console.error('[community/unpublish] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/community — Public (list all published projects)
// ---------------------------------------------------------------------------

// Simple in-memory cache for the community list (60s TTL)
let listCache: { data: any; expiresAt: number } | null = null;

router.get('/community', async (c) => {
    try {
        const now = Date.now();

        // Return cached list if fresh
        if (listCache && now < listCache.expiresAt) {
            return c.json(listCache.data);
        }

        const metas = await kvGetByPrefix('community:meta:');

        const projects = metas
            .map(m => m.value)
            .filter(Boolean)
            .sort((a: any, b: any) => {
                const dateA = new Date(a.publishedAt || 0).getTime();
                const dateB = new Date(b.publishedAt || 0).getTime();
                return dateB - dateA; // newest first
            })
            .map((meta: any) => ({
                projectId: meta.projectId,
                slug: meta.slug,
                title: meta.title,
                description: meta.description,
                allowRemix: meta.allowRemix,
                thumbnailUrl: `/api/community/thumbnail/${meta.projectId}`,
                userName: meta.userName,
                userId: meta.userId,
                publishedAt: meta.publishedAt,
                updatedAt: meta.updatedAt,
                nodeCount: meta.nodeCount,
                tokenCount: meta.tokenCount,
            }));

        const response = { projects };

        // Cache for 60 seconds
        listCache = { data: response, expiresAt: now + 60_000 };

        return c.json(response);
    } catch (err: any) {
        console.error('[community/list] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/community/project/:slug — Public (view single project + snapshot)
// ---------------------------------------------------------------------------
router.get('/community/project/:slug', async (c) => {
    try {
        const slug = c.req.param('slug');
        const slugEntry = await kvGet(`community:slug:${slug}`);
        if (!slugEntry?.projectId) {
            return c.json({ error: 'Project not found' }, 404);
        }

        const projectId = slugEntry.projectId;
        const [meta, snapshot] = await Promise.all([
            kvGet(`community:meta:${projectId}`),
            kvGet(`community:snapshot:${projectId}`),
        ]);

        if (!meta) {
            return c.json({ error: 'Project not found' }, 404);
        }

        return c.json({
            projectId: meta.projectId,
            slug: meta.slug,
            title: meta.title,
            description: meta.description,
            allowRemix: meta.allowRemix,
            thumbnailUrl: `/api/community/thumbnail/${meta.projectId}`,
            userName: meta.userName,
            userId: meta.userId,
            publishedAt: meta.publishedAt,
            updatedAt: meta.updatedAt,
            nodeCount: meta.nodeCount,
            tokenCount: meta.tokenCount,
            snapshot: snapshot ?? null,
        });
    } catch (err: any) {
        console.error('[community/project] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/community/status/:projectId — Auth required (check publish status)
// ---------------------------------------------------------------------------
router.get('/community/status/:projectId', async (c) => {
    try {
        const user = await getAuthUserWithName(c);
        if (!user) return c.json({ error: 'Unauthorized' }, 401);
        const { userId } = user;

        const projectId = c.req.param('projectId');
        const meta = await kvGet(`community:meta:${projectId}`);

        if (!meta || meta.userId !== userId) {
            return c.json({ error: 'Not published or not the publisher' }, 404);
        }

        return c.json(meta);
    } catch (err: any) {
        console.error('[community/status] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/community/thumbnail/:projectId — Public (serve thumbnail image)
// ---------------------------------------------------------------------------
router.get('/community/thumbnail/:projectId', async (c) => {
    try {
        const projectId = c.req.param('projectId');
        const thumbnailData = await kvGet(`community:thumbnail:${projectId}`);

        if (!thumbnailData) {
            return c.body(null, 404);
        }

        // Strip data URL prefix if present, then decode base64
        const base64 = typeof thumbnailData === 'string'
            ? thumbnailData.replace(/^data:image\/\w+;base64,/, '')
            : '';

        if (!base64) {
            return c.body(null, 404);
        }

        const buffer = Buffer.from(base64, 'base64');

        c.header('Content-Type', 'image/webp');
        c.header('Cache-Control', 'public, max-age=3600');
        return c.body(buffer);
    } catch (err: any) {
        console.error('[community/thumbnail] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

export default router;
