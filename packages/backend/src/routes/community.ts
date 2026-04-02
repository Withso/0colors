import { Hono } from 'hono';
import {
    getProjectOwner, getCommunityMeta, getCommunityBySlug,
    checkSlugExists, createCommunityPublication, updateCommunityPublication,
    deleteCommunityPublication, listCommunityPublications,
    getCommunityThumbnail, getCommunitySnapshot,
} from '../db.js';
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
        const exists = await checkSlugExists(slug, excludeProjectId);
        if (!exists) {
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
        const owner = await getProjectOwner(projectId);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        // Check if already published
        const existingMeta = await getCommunityMeta(projectId);
        if (existingMeta) {
            return c.json({ error: 'Project is already published. Use PUT to update.' }, 409);
        }

        // Generate unique slug
        const slug = await getUniqueSlug(title);

        // Count nodes and tokens from snapshot
        const nodeCount = Array.isArray(snapshot.nodes) ? snapshot.nodes.length : 0;
        const tokenCount = Array.isArray(snapshot.tokens) ? snapshot.tokens.length : 0;

        // Store thumbnail (strip data URL prefix if present)
        let thumbnail: string | undefined;
        if (thumbnailDataUrl) {
            thumbnail = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, '');
        }

        await createCommunityPublication({
            project_id: projectId,
            slug,
            title,
            description: description || '',
            allow_remix: allowRemix !== false,
            user_id: userId,
            user_name: userName,
            snapshot,
            thumbnail,
            node_count: nodeCount,
            token_count: tokenCount,
        });

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
        const existingMeta = await getCommunityMeta(projectId);
        if (!existingMeta) {
            return c.json({ error: 'Project is not published' }, 404);
        }
        if (existingMeta.user_id !== userId) {
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

        const updateData: any = {};

        // If title changed, regenerate slug
        if (title && title !== existingMeta.title) {
            const newSlug = await getUniqueSlug(title, projectId);
            updateData.slug = newSlug;
            updateData.title = title;
        } else if (title !== undefined) {
            updateData.title = title;
        }

        if (description !== undefined) updateData.description = description;
        if (allowRemix !== undefined) updateData.allow_remix = allowRemix;

        // Update snapshot if provided
        if (snapshot) {
            updateData.snapshot = snapshot;
            updateData.node_count = Array.isArray(snapshot.nodes) ? snapshot.nodes.length : existingMeta.node_count;
            updateData.token_count = Array.isArray(snapshot.tokens) ? snapshot.tokens.length : existingMeta.token_count;
        }

        if (thumbnailDataUrl) {
            updateData.thumbnail = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, '');
        }

        await updateCommunityPublication(projectId, updateData);

        invalidateCommunityListCache();
        return c.json({ ok: true, slug: updateData.slug || existingMeta.slug });
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
        const existingMeta = await getCommunityMeta(projectId);
        if (!existingMeta) {
            return c.json({ error: 'Project is not published' }, 404);
        }
        if (existingMeta.user_id !== userId) {
            return c.json({ error: 'Not the publisher of this project' }, 403);
        }

        await deleteCommunityPublication(projectId);

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

        const metas = await listCommunityPublications();

        const projects = metas.map((meta: any) => ({
            projectId: meta.project_id,
            slug: meta.slug,
            title: meta.title,
            description: meta.description,
            allowRemix: meta.allow_remix,
            thumbnailUrl: `/api/community/thumbnail/${meta.project_id}`,
            userName: meta.user_name,
            userId: meta.user_id,
            publishedAt: meta.published_at,
            updatedAt: meta.updated_at,
            nodeCount: meta.node_count,
            tokenCount: meta.token_count,
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
        const publication = await getCommunityBySlug(slug);
        if (!publication) {
            return c.json({ error: 'Project not found' }, 404);
        }

        return c.json({
            projectId: publication.project_id,
            slug: publication.slug,
            title: publication.title,
            description: publication.description,
            allowRemix: publication.allow_remix,
            thumbnailUrl: `/api/community/thumbnail/${publication.project_id}`,
            userName: publication.user_name,
            userId: publication.user_id,
            publishedAt: publication.published_at,
            updatedAt: publication.updated_at,
            nodeCount: publication.node_count,
            tokenCount: publication.token_count,
            snapshot: publication.snapshot ?? null,
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
        const meta = await getCommunityMeta(projectId);

        if (!meta || meta.user_id !== userId) {
            return c.json({ error: 'Not published or not the publisher' }, 404);
        }

        // Return in camelCase format for frontend compatibility
        return c.json({
            projectId: meta.project_id,
            slug: meta.slug,
            title: meta.title,
            description: meta.description,
            allowRemix: meta.allow_remix,
            userId: meta.user_id,
            userName: meta.user_name,
            publishedAt: meta.published_at,
            updatedAt: meta.updated_at,
            nodeCount: meta.node_count,
            tokenCount: meta.token_count,
        });
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
        const thumbnailData = await getCommunityThumbnail(projectId);

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
