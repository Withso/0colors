import { Hono } from 'hono';
import { kvGet, kvSet, kvGetByPrefix } from '../db.js';
import { runPipeline } from '../computation/pipeline.js';

const router = new Hono();

// ---------------------------------------------------------------------------
// GET /api/cron-tick — Protected by X-Cron-Secret header
// ---------------------------------------------------------------------------
router.get('/cron-tick', async (c) => {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        console.error('[cron-tick] CRON_SECRET env var is not set');
        return c.json({ error: 'Cron not configured' }, 500);
    }
    const secret = c.req.header('X-Cron-Secret');
    if (!secret || secret !== cronSecret) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
        const startTime = Date.now();
        const results: any[] = [];
        let processed = 0;

        // Scan all dev-config keys for active schedules
        const configs = await kvGetByPrefix('dev-config:');
        for (const cfg of configs) {
            const devConfig = cfg.value;
            if (!devConfig?.cronEnabled || !devConfig?.cronSchedule) continue;

            const projectId = cfg.key.replace('dev-config:', '');

            // Load snapshot and run pipeline
            const snapshot = await kvGet(`project:${projectId}:snapshot`);
            if (!snapshot || !devConfig.webhookTargetNodeId) {
                results.push({ projectId, status: 'skipped', message: 'No snapshot or target node' });
                processed++;
                continue;
            }

            const pipelineResult = runPipeline(
                snapshot as any,
                devConfig.webhookTargetNodeId,
                devConfig.scheduleValues?.[devConfig.scheduleCurrentIndex || 0] || '',
                'hex',
                devConfig.outputFormat || 'css',
                devConfig.outputTheme || null,
            );

            if (pipelineResult.success && pipelineResult.output) {
                for (const [fmt, content] of Object.entries(pipelineResult.output)) {
                    if (!fmt.includes(':')) {
                        await kvSet(`project:${projectId}:token-output:${fmt}`, content);
                    }
                }
            }

            results.push({
                projectId,
                status: pipelineResult.success ? 'ok' : 'error',
                error: pipelineResult.error,
            });
            processed++;
        }

        const elapsed = `${Date.now() - startTime}ms`;
        return c.json({ ok: true, processed, elapsed, results });
    } catch (err: any) {
        console.error('[cron-tick] Error:', err);
        return c.json({ error: err.message || 'Internal server error' }, 500);
    }
});

export default router;
