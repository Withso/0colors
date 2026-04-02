import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { initSchema } from './db.js';

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
app.use('/*', cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization', 'X-User-Token', 'X-Webhook-Secret'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

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
// Start Server
// ---------------------------------------------------------------------------
const port = parseInt(process.env.PORT || '4455', 10);

console.log(`[server] Starting 0colors API server on port ${port}...`);

// Initialize database schema, then start server
initSchema()
    .then(() => {
        serve({
            fetch: app.fetch,
            port,
        }, (info) => {
            console.log(`[server] 0colors API server running at http://localhost:${info.port}`);
        });
    })
    .catch((err) => {
        console.error('[server] Failed to initialize database schema:', err);
        process.exit(1);
    });
