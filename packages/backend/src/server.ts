import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { csp } from './middleware/csp.js';
import { initSchema } from './db.js';
import { maybeSeedAdminFromEnv } from './auth-seed.js';

// In CommonJS (current backend target), __dirname is a built-in. server.js
// lives at packages/backend/dist/server.js, so dist/public/ is right next to it.
const FRONTEND_DIR = join(__dirname, 'public');

// Route imports
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import projectsRouter from './routes/projects.js';
import templatesRouter from './routes/templates.js';
import figmaRouter from './routes/figma.js';
import aiRouter from './routes/ai.js';
import devRouter from './routes/dev.js';
import adminRouter from './routes/admin.js';
import cronRouter from './routes/cron.js';
import communityRouter from './routes/community.js';

const app = new Hono();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
// CORS: restrict to known origins in production, allow all in development
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];

app.use('/*', cors({
    origin: process.env.NODE_ENV === 'production'
        ? (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
        : '*',
    allowHeaders: ['Content-Type', 'Authorization', 'X-User-Token', 'X-Webhook-Secret'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use('/*', csp());

// ---------------------------------------------------------------------------
// Mount Routes — order matters for webhook specificity
// ---------------------------------------------------------------------------
app.route('/api', healthRouter);
app.route('/api', authRouter);
app.route('/api', projectsRouter);
app.route('/api', templatesRouter);
app.route('/api', figmaRouter);
app.route('/api', aiRouter);
app.route('/api', devRouter);
app.route('/api', adminRouter);
app.route('/api', cronRouter);
app.route('/api', communityRouter);

// ---------------------------------------------------------------------------
// Static SPA serving (production only — dev runs Vite on :3000)
//
// The build pipeline copies packages/frontend/build/ into
// packages/backend/dist/public/. If that directory exists, we serve it for
// non-/api paths and fall back to index.html so client-side routes survive a
// hard refresh.
// ---------------------------------------------------------------------------
if (existsSync(FRONTEND_DIR)) {
    const indexHtml = readFileSync(join(FRONTEND_DIR, 'index.html'), 'utf-8');
    app.use('/*', serveStatic({ root: FRONTEND_DIR }));
    // SPA fallback for unmatched non-/api paths. /api/* falls through to 404
    // so missing endpoints don't get masked by index.html.
    app.get('*', (c) => {
        if (c.req.path.startsWith('/api/')) return c.notFound();
        return c.html(indexHtml);
    });
    console.log(`[server] Serving SPA from ${FRONTEND_DIR}`);
} else {
    console.log('[server] No SPA bundle present — running API-only (use Vite dev server for the frontend)');
}

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
const port = parseInt(process.env.PORT || '4455', 10);

console.log(`[server] Starting 0colors API server on port ${port}...`);

// Initialize database schema, optionally seed admin from env, then start server
initSchema()
    .then(() => maybeSeedAdminFromEnv())
    .then(() => {
        serve({
            fetch: app.fetch,
            port,
        }, (info) => {
            console.log(`[server] 0colors API server running at http://localhost:${info.port}`);
        });
    })
    .catch((err) => {
        console.error('[server] Failed to initialize:', err);
        process.exit(1);
    });
