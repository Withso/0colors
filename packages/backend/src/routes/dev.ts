import { Hono } from 'hono';
import {
    getDevConfig, saveDevConfig, getProjectOwner, getProjectSnapshot,
    updateProjectSnapshot, saveTokenOutput, getTokenOutput,
    saveWebhookPending, getWebhookPending, deleteWebhookPending,
} from '../db.js';
import { RATE_LIMIT_MAX, VALID_TOKEN_FORMATS, TOKEN_CONTENT_TYPES } from '../constants.js';
import { requireAuth } from '../middleware/auth.js';
import { checkRateLimit } from '../helpers/rate-limit.js';
import { runPipeline } from '../computation/pipeline.js';

const router = new Hono();

// ---------------------------------------------------------------------------
// POST /api/webhook/:projectId/run — PUBLIC, validated by X-Webhook-Secret
// Enhanced webhook that runs server-side pipeline
// ---------------------------------------------------------------------------
router.post('/webhook/:projectId/run', async (c) => {
    try {
        const projectId = c.req.param('projectId');

        const devConfig = await getDevConfig(projectId);
        if (!devConfig?.webhookSecret) {
            return c.json({ error: 'Webhook not configured for this project' }, 404);
        }

        const secret = c.req.header('X-Webhook-Secret');
        if (!secret || secret !== devConfig.webhookSecret) {
            return c.json({ error: 'Invalid webhook secret' }, 401);
        }

        const body = await c.req.json().catch(() => ({}));
        const { value, format, targetNodeId, outputFormat } = body;

        // Load project snapshot
        const snapshot = await getProjectSnapshot(projectId);
        if (!snapshot) {
            return c.json({ error: 'Project snapshot not found' }, 404);
        }

        const nodeId = targetNodeId || devConfig.webhookTargetNodeId;
        if (!nodeId) {
            return c.json({ error: 'No target node specified' }, 400);
        }

        const result = runPipeline(
            snapshot as any,
            nodeId,
            value,
            format || 'hex',
            outputFormat || devConfig.outputFormat || 'css',
            devConfig.outputTheme || null,
        );

        if (!result.success) {
            return c.json({ error: result.error }, 500);
        }

        // Save updated snapshot
        if (result.updatedSnapshot) {
            await updateProjectSnapshot(projectId, {
                ...result.updatedSnapshot,
                _syncedAt: Date.now(),
            });
        }

        // Save output for Pull API
        if (result.output) {
            for (const [fmt, content] of Object.entries(result.output)) {
                if (!fmt.includes(':')) {
                    await saveTokenOutput(projectId, fmt, content as string);
                }
            }
        }

        return c.json({ ok: true, mode: 'pipeline', output: result.output, pushResults: [] });
    } catch (err: any) {
        console.error('[webhook/run] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/webhook/:projectId/:nodeId — PUBLIC, validated by X-Webhook-Secret
// Per-node webhook targeting specific node
// ---------------------------------------------------------------------------
router.post('/webhook/:projectId/:nodeId', async (c) => {
    try {
        const projectId = c.req.param('projectId');
        const nodeId = c.req.param('nodeId');

        const devConfig = await getDevConfig(projectId);
        if (!devConfig?.webhookSecret) {
            return c.json({ error: 'Webhook not configured for this project' }, 404);
        }

        const secret = c.req.header('X-Webhook-Secret');
        if (!secret || secret !== devConfig.webhookSecret) {
            return c.json({ error: 'Invalid webhook secret' }, 401);
        }

        const body = await c.req.json().catch(() => ({}));
        const { value, format, outputFormat } = body;

        // Load project snapshot
        const snapshot = await getProjectSnapshot(projectId);
        if (!snapshot) {
            return c.json({ error: 'Project snapshot not found' }, 404);
        }

        const result = runPipeline(
            snapshot as any,
            nodeId,
            value,
            format || 'hex',
            outputFormat || devConfig?.outputFormat || 'css',
            devConfig?.outputTheme || null,
        );

        if (!result.success) {
            return c.json({ error: result.error }, 500);
        }

        // Save updated snapshot
        if (result.updatedSnapshot) {
            await updateProjectSnapshot(projectId, {
                ...result.updatedSnapshot,
                _syncedAt: Date.now(),
            });
        }

        // Save output for Pull API
        if (result.output) {
            for (const [fmt, content] of Object.entries(result.output)) {
                if (!fmt.includes(':')) {
                    await saveTokenOutput(projectId, fmt, content as string);
                }
            }
        }

        return c.json({ ok: true, mode: 'pipeline', nodeId, output: result.output, pushResults: [] });
    } catch (err: any) {
        console.error('[webhook/:nodeId] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/webhook/:projectId — PUBLIC, validated by X-Webhook-Secret
// Basic webhook: stores pending input
// NOTE: This must be registered AFTER the more specific /run and /:nodeId routes
// ---------------------------------------------------------------------------
router.post('/webhook/:projectId', async (c) => {
    try {
        const projectId = c.req.param('projectId');

        // Load dev config to verify webhook secret
        const devConfig = await getDevConfig(projectId);
        if (!devConfig?.webhookSecret) {
            return c.json({ error: 'Webhook not configured for this project' }, 404);
        }

        const secret = c.req.header('X-Webhook-Secret');
        if (!secret || secret !== devConfig.webhookSecret) {
            return c.json({ error: 'Invalid webhook secret' }, 401);
        }

        const body = await c.req.json();
        const { value, format, targetNodeId } = body;

        await saveWebhookPending(projectId, {
            value,
            format: format ?? null,
            receivedAt: new Date().toISOString(),
            targetNodeId: targetNodeId ?? null,
        });

        return c.json({ ok: true, message: 'Webhook data received' });
    } catch (err: any) {
        console.error('[webhook] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/webhook-pending/:projectId — Authenticated
// ---------------------------------------------------------------------------
router.get('/webhook-pending/:projectId', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const projectId = c.req.param('projectId');

        // Verify ownership
        const owner = await getProjectOwner(projectId);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        const pending = await getWebhookPending(projectId);
        return c.json({ pending: pending ?? null });
    } catch (err: any) {
        console.error('[webhook-pending] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/webhook-clear/:projectId — Authenticated
// ---------------------------------------------------------------------------
router.post('/webhook-clear/:projectId', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const projectId = c.req.param('projectId');

        // Verify ownership
        const owner = await getProjectOwner(projectId);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        await deleteWebhookPending(projectId);
        return c.json({ ok: true });
    } catch (err: any) {
        console.error('[webhook-clear] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/tokens/:projectId/:format/etag — PUBLIC, rate-limited, ETag support
// ---------------------------------------------------------------------------
router.get('/tokens/:projectId/:format/etag', async (c) => {
    try {
        const projectId = c.req.param('projectId');
        const format = c.req.param('format');

        if (!VALID_TOKEN_FORMATS.includes(format as any)) {
            return c.json({ error: `Invalid format. Must be one of: ${VALID_TOKEN_FORMATS.join(', ')}` }, 400);
        }

        const rl = checkRateLimit(`tokens:${projectId}`);
        c.header('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
        c.header('X-RateLimit-Remaining', String(rl.remaining));
        c.header('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));
        if (!rl.allowed) {
            return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429);
        }

        // Check pullApiEnabled
        const devConfig = await getDevConfig(projectId);
        if (!devConfig?.pullApiEnabled) {
            return c.json({ error: 'Pull API not enabled for this project' }, 403);
        }

        const output = await getTokenOutput(projectId, format);
        if (!output) {
            return c.json({ error: 'Token output not found for this project/format' }, 404);
        }

        const content = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
        // Simple hash for ETag
        let hash = 0;
        for (let i = 0; i < content.length; i++) hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
        const etag = `"${Math.abs(hash).toString(36)}"`;

        c.header('ETag', etag);
        c.header('Cache-Control', 'public, max-age=60');

        const ifNoneMatch = c.req.header('If-None-Match');
        if (ifNoneMatch === etag) {
            return c.body(null, 304);
        }

        const contentType = TOKEN_CONTENT_TYPES[format] || 'text/plain';
        return c.body(content, 200, { 'Content-Type': contentType });
    } catch (err: any) {
        console.error('[tokens/etag] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/tokens/:projectId/:format — PUBLIC, rate-limited
// ---------------------------------------------------------------------------
router.get('/tokens/:projectId/:format', async (c) => {
    try {
        const projectId = c.req.param('projectId');
        const format = c.req.param('format');

        // Validate format
        if (!VALID_TOKEN_FORMATS.includes(format as any)) {
            return c.json({
                error: `Invalid format. Must be one of: ${VALID_TOKEN_FORMATS.join(', ')}`,
            }, 400);
        }

        // Rate limit per project
        const rl = checkRateLimit(`tokens:${projectId}`);
        c.header('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
        c.header('X-RateLimit-Remaining', String(rl.remaining));
        c.header('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));

        if (!rl.allowed) {
            return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429);
        }

        // Check pullApiEnabled
        const devConfig = await getDevConfig(projectId);
        if (!devConfig?.pullApiEnabled) {
            return c.json({ error: 'Pull API not enabled for this project' }, 403);
        }

        const output = await getTokenOutput(projectId, format);
        if (!output) {
            return c.json({ error: 'Token output not found for this project/format' }, 404);
        }

        // Return with proper Content-Type
        const content = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
        const contentType = TOKEN_CONTENT_TYPES[format] || 'text/plain';
        return c.body(content, 200, { 'Content-Type': contentType });
    } catch (err: any) {
        console.error('[tokens] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/dev/save-output — Authenticated
// ---------------------------------------------------------------------------
router.post('/dev/save-output', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const body = await c.req.json();
        const { projectId, format, output } = body;

        if (!projectId || !format || output === undefined) {
            return c.json({ error: 'projectId, format, and output are required' }, 400);
        }

        if (!VALID_TOKEN_FORMATS.includes(format as any)) {
            return c.json({
                error: `Invalid format. Must be one of: ${VALID_TOKEN_FORMATS.join(', ')}`,
            }, 400);
        }

        // Verify ownership
        const owner = await getProjectOwner(projectId);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        await saveTokenOutput(projectId, format, output);
        return c.json({ ok: true });
    } catch (err: any) {
        console.error('[dev/save-output] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/dev/github-push — Authenticated (proxy to GitHub Contents API)
// ---------------------------------------------------------------------------
router.post('/dev/github-push', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const body = await c.req.json();
        let { owner, repo, path, content, sha, pat, message } = body;

        // Support "owner/repo" combined format
        if (!owner && repo?.includes('/')) {
            [owner, repo] = repo.split('/');
        }
        // Also accept commitMessage as fallback for message
        message = message || body.commitMessage;

        if (!owner || !repo || !path || content === undefined || !pat) {
            return c.json({ error: 'owner, repo, path, content, and pat are required' }, 400);
        }

        // Base64 safety check: if content looks like raw text, encode it
        let finalContent = content;
        if (typeof content === 'string' && /^[{:<\w\/\*]/.test(content.trim())) {
            finalContent = Buffer.from(content).toString('base64');
        }

        const githubUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

        // Try to get current file sha for update
        let currentSha = sha;
        if (!currentSha) {
            try {
                const getRes = await fetch(
                    `${githubUrl}?ref=${body.branch || 'main'}`,
                    { headers: { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github+json' } }
                );
                if (getRes.ok) {
                    const existing = await getRes.json() as any;
                    currentSha = existing.sha;
                }
            } catch { /* file doesn't exist yet, that's fine */ }
        }

        const githubBody: any = {
            message: message || `Update ${path} via 0colors`,
            content: finalContent,
            branch: body.branch || 'main',
        };
        if (currentSha) githubBody.sha = currentSha;

        const response = await fetch(githubUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${pat}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify(githubBody),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('[dev/github-push] GitHub API error:', response.status, result);
            return c.json({
                error: 'GitHub API error',
                status: response.status,
                details: result,
            }, response.status as any);
        }

        return c.json({ success: true, result });
    } catch (err: any) {
        console.error('[dev/github-push] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/dev/webhook-push — Authenticated (proxy POST to arbitrary URL)
// ---------------------------------------------------------------------------
router.post('/dev/webhook-push', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const body = await c.req.json();
        const { url, payload, headers: customHeaders } = body;

        if (!url || !payload) {
            return c.json({ error: 'url and payload are required' }, 400);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(customHeaders ?? {}),
            },
            body: JSON.stringify(payload),
        });

        let result: any;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            result = await response.json();
        } else {
            result = await response.text();
        }

        return c.json({
            success: true,
            status: response.status,
            result,
        });
    } catch (err: any) {
        console.error('[dev/webhook-push] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /api/dev/save-config — Authenticated
// ---------------------------------------------------------------------------
router.post('/dev/save-config', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const body = await c.req.json();
        const { projectId, devConfig } = body;

        if (!projectId || !devConfig) {
            return c.json({ error: 'projectId and devConfig are required' }, 400);
        }

        // Verify ownership
        const owner = await getProjectOwner(projectId);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        await saveDevConfig(projectId, devConfig);
        return c.json({ ok: true });
    } catch (err: any) {
        console.error('[dev/save-config] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /api/dev/load-config/:projectId — Authenticated
// ---------------------------------------------------------------------------
router.get('/dev/load-config/:projectId', async (c) => {
    try {
        const userId = await requireAuth(c);
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const projectId = c.req.param('projectId');

        // Verify ownership
        const owner = await getProjectOwner(projectId);
        if (owner !== userId) {
            return c.json({ error: 'Not the owner of this project' }, 403);
        }

        const devConfig = await getDevConfig(projectId);
        return c.json({ devConfig: devConfig ?? null });
    } catch (err: any) {
        console.error('[dev/load-config] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

export default router;
