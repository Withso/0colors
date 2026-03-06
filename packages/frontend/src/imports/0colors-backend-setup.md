Here is your complete, step-by-step guide. I've written it assuming zero technical background — every click, every field, every thing you need to copy-paste is listed.

PHASE 1: Set Up Railway (15 minutes)
Step 1: Create a New Railway Project
Go to railway.app and log in with your Pro account
Click "New Project" (top-right corner)
Select "Empty Project"
Railway creates a blank project. Click on the project name at the top and rename it to 0colors-backend
Step 2: Add a PostgreSQL Database
Inside your 0colors-backend project, click "+ New" button (top-right)
Select "Database"
Select "Add PostgreSQL"
Railway spins up a PostgreSQL database in ~30 seconds
Click on the PostgreSQL service card that appeared
Go to the "Variables" tab
You'll see variables like DATABASE_URL, PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
Copy the DATABASE_URL value — save it in a note. It looks like:
postgresql://postgres:SoMeRaNdOmPaSsWoRd@roundhouse.proxy.rlwy.net:12345/railway
Step 3: Create the KV Table in the Database
Still on the PostgreSQL service, click the "Data" tab (or "Query" tab — Railway has a built-in SQL editor)
If you see a "Query" tab, click it. If not, click "Data" → there should be a SQL query runner
Paste this SQL and click "Run Query":
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kv_key_prefix 
ON kv_store USING btree (key text_pattern_ops);
You should see "Query executed successfully" — this creates your database table
Step 4: Add the Backend Server Service
Click "+ New" again (top-right in the same project)
Select "Empty Service" (NOT GitHub repo — we'll deploy code later)
Click on the new service card, rename it to api-server
Go to the "Settings" tab of this service
Under "Networking" → click "Generate Domain" — this gives you a public URL like:
api-server-production-xxxx.up.railway.app
Copy this URL and save it. This is your new SERVER_BASE.
Step 5: Set Environment Variables on the Server Service
Still on the api-server service, click the "Variables" tab
Click "+ New Variable" for each of these (add them one by one):
Variable Name	Value	Where to Get It
DATABASE_URL	postgresql://postgres:...	From Step 2 (the PostgreSQL service Variables tab) — OR use Railway's variable reference: ${{Postgres.DATABASE_URL}}
SUPABASE_URL	https://xxxxxx.supabase.co	Your existing Supabase project → Settings → API → Project URL
SUPABASE_SERVICE_ROLE_KEY	eyJhbGciOiJI...	Your existing Supabase project → Settings → API → service_role key (the secret one)
SUPABASE_ANON_KEY	eyJhbGciOiJI...	Your existing Supabase project → Settings → API → anon public key
PORT	3000	Just type 3000
Tip for DATABASE_URL: Instead of copy-pasting, Railway lets you reference another service's variable. In the value field, type ${{Postgres.DATABASE_URL}} — Railway auto-fills it. This is the best approach.

PHASE 2: Prepare What to Tell Anti-Gravity IDE (The Prompt)
Anti-Gravity IDE is an AI coding tool. You'll create a new project in it and give it a very specific prompt. Here's exactly what to do:

Step 6: Create a New Project in Anti-Gravity
Open Anti-Gravity IDE
Create a new Node.js/TypeScript project
Name it 0colors-api
Step 7: The Master Prompt
Copy-paste the following prompt into Anti-Gravity's AI chat. This is the single prompt that tells the AI agent everything it needs to build your backend:

COPY EVERYTHING BELOW THIS LINE:

Build me a Node.js + TypeScript backend API server with these exact specifications:

## Stack
- Runtime: Node.js 20+
- Framework: Hono (npm package "hono")
- HTTP adapter: @hono/node-server
- Database: PostgreSQL via "pg" package (connection pool)
- Auth verification: @supabase/supabase-js (to verify JWT tokens only — we don't host auth, Supabase handles auth)
- Package manager: npm
- Build: tsx (for running TypeScript directly)

## Project Structure
/src /server.ts ← Main entry point (Hono app + all routes) /db.ts ← PostgreSQL connection pool + KV helper functions /auth.ts ← Supabase JWT verification helpers /computation/ ← Color computation engine (I'll provide these files later) /package.json /tsconfig.json /Dockerfile ← For Railway deployment /.env.example


## Database
Single PostgreSQL table (already exists, don't create migrations):

```sql
CREATE TABLE kv_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
db.ts — KV Helper Functions
Create these helper functions that use the "pg" Pool directly:

import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function kvGet(key: string): Promise<any> {
  const { rows } = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

export async function kvSet(key: string, value: any): Promise<boolean> {
  const { rowCount } = await pool.query(
    'INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()',
    [key, JSON.stringify(value)]
  );
  return (rowCount ?? 0) > 0;
}

export async function kvDel(key: string): Promise<void> {
  await pool.query('DELETE FROM kv_store WHERE key = $1', [key]);
}

export async function kvMget(keys: string[]): Promise<any[]> {
  if (keys.length === 0) return [];
  const { rows } = await pool.query('SELECT key, value FROM kv_store WHERE key = ANY($1)', [keys]);
  const map = new Map(rows.map((r: any) => [r.key, r.value]));
  return keys.map(k => map.get(k) ?? null);
}

export async function kvMset(entries: [string, any][]): Promise<void> {
  if (entries.length === 0) return;
  const values = entries.map((_, i) => `($${i*2+1}, $${i*2+2}::jsonb, NOW())`).join(', ');
  const params = entries.flatMap(([k, v]) => [k, JSON.stringify(v)]);
  await pool.query(
    `INSERT INTO kv_store (key, value, updated_at) VALUES ${values} ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    params
  );
}

export async function kvGetByPrefix(prefix: string): Promise<{key: string, value: any}[]> {
  const { rows } = await pool.query('SELECT key, value FROM kv_store WHERE key LIKE $1', [prefix + '%']);
  return rows;
}
auth.ts — JWT Verification
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function getAuthUser(c: any): Promise<{ userId: string } | null> {
  const userToken = c.req.header('X-User-Token');
  const authHeader = c.req.header('Authorization');
  const accessToken = userToken || authHeader?.split(' ')[1];
  if (!accessToken) return null;
  
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user?.id) return null;
  return { userId: data.user.id };
}

export async function createUser(email: string, password: string, name: string) {
  return supabase.auth.admin.createUser({
    email,
    password,
    user_metadata: { name: name || email.split('@')[0] },
    email_confirm: true,
  });
}
server.ts — Main Entry Point
Use Hono with @hono/node-server
CORS: allow all origins, allow headers: Content-Type, Authorization, X-User-Token, X-Webhook-Secret
All routes should be prefixed with /api/ (e.g., /api/health, /api/signup, /api/sync)
Listen on process.env.PORT || 3000
Start with just these routes for now (I'll give you the full list later):

GET /api/health → { status: "ok", timestamp: Date.now() }
POST /api/signup → Create user via Supabase auth + initialize KV meta
GET /api/cloud-meta → Return user metadata + role + project limit
POST /api/cloud-register → Register cloud project
POST /api/cloud-unregister → Unregister + delete cloud project
POST /api/sync → Save single project snapshot
GET /api/load/:projectId → Load single project snapshot
GET /api/load-all → Load all user cloud projects
POST /api/sync-batch → Batch sync multiple projects
For admin checking, use KV key pattern: user:admin:{userId} → value true. For user meta, use KV key: user:{userId}:meta. For project snapshots, use KV key: project:{projectId}:snapshot. For project ownership, use KV key: project:{projectId}:owner. Cloud project limit for normal users: 2 (admins are unlimited).

Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx tsc
CMD ["node", "dist/server.js"]
Environment Variables (via process.env)
DATABASE_URL (PostgreSQL connection string)
SUPABASE_URL (Supabase project URL for auth verification)
SUPABASE_SERVICE_ROLE_KEY (for admin operations)
PORT (default 3000)
Generate all files with proper TypeScript types and error handling. Log all errors with contextual messages.


**STOP COPYING HERE**

---

### Step 8: After Anti-Gravity Generates the Base, Add Remaining Routes

Once the AI creates the base project with the 9 routes above, send a **second prompt** to add the remaining routes. Copy-paste this:

---

**COPY THIS SECOND PROMPT:**

Now add these additional routes to server.ts. Use the same patterns (getAuthUser, kvGet/kvSet/kvDel, etc.):

Templates (3 routes)
GET /api/templates → Public (no auth). Load template admin's projects, filter for isTemplate flag.
KV key for template admin: app:template_admin_user_id
Load that user's meta → get cloudProjectIds → batch load snapshots → filter isTemplate
POST /api/seed-material-template → Template admin only. I'll provide the generation function later, just create a placeholder that returns { ok: true, message: "placeholder" }
POST /api/seed-material-template-direct → Same as above, placeholder
Figma Plugin (2 routes)
GET /api/figma-tokens/:projectId → Authenticated. Load project snapshot, return computedTokens field. Block isSample/isTemplate projects.
GET /api/figma-projects → Authenticated. Load all user projects, return summary (name, hasComputedTokens, theme count).
AI Chat (4 routes)
GET /api/ai-conversations → Auth. Return kvGet(user:{userId}:ai-conversations)
POST /api/ai-conversations → Auth. Save conversations array. Server-side limit: max 2 conversations, 40 messages each. Max payload: 1MB.
GET /api/ai-settings → Auth. Return kvGet(user:{userId}:ai-settings)
POST /api/ai-settings → Auth. Save settings object.
Dev Mode (9 routes)
POST /api/webhook/:projectId → PUBLIC, validated by X-Webhook-Secret header matching devConfig.webhookSecret. Store pending: kvSet(webhook:{pid}:pending, {value, format, receivedAt, targetNodeId})
GET /api/webhook-pending/:projectId → Auth. Return kvGet(webhook:{pid}:pending)
POST /api/webhook-clear/:projectId → Auth. kvDel(webhook:{pid}:pending)
GET /api/tokens/:projectId/:format → PUBLIC, rate-limited (100 req/hr per project). Serve cached token output from kvGet(project:{pid}:token-output:{format}). Formats: css, dtcg, tailwind, figma.
POST /api/dev/save-output → Auth. Save token output: kvSet(project:{pid}:token-output:{format}, output)
POST /api/dev/github-push → Auth. Proxy PUT to GitHub Contents API (body contains: owner, repo, path, content, sha, pat, message)
POST /api/dev/webhook-push → Auth. Proxy POST to arbitrary URL with JSON body (body contains: url, payload, headers)
POST /api/dev/save-config → Auth. Save dev config: kvSet(dev-config:{pid}, devConfig)
GET /api/dev/load-config/:projectId → Auth. Return kvGet(dev-config:{pid})
Admin Debug (2 routes)
GET /api/debug-auth → Admin only. Return userId, isAdmin, isTemplateAdmin.
GET /api/debug-cloud-state/:userId → Admin only. Inspect target user's cloud data.
Use in-memory Map for rate limiting on the Pull API. Add proper error handling and console.log for every error with context.


**STOP COPYING HERE**

---

### Step 9: Verify Anti-Gravity Output

After the AI generates code, check these things:

**Checklist — tell the AI to fix anything that's missing:**

- [ ] `package.json` has these dependencies: `hono`, `@hono/node-server`, `pg`, `@supabase/supabase-js`
- [ ] `package.json` has these dev dependencies: `typescript`, `tsx`, `@types/pg`, `@types/node`
- [ ] `tsconfig.json` exists with `"target": "ES2022"` and `"module": "NodeNext"`
- [ ] `Dockerfile` exists and works
- [ ] All routes are prefixed with `/api/`
- [ ] CORS middleware is the first middleware
- [ ] The server reads `PORT` from `process.env`
- [ ] All database operations use parameterized queries (`$1`, `$2`) — **never** string concatenation (for security)

---

## PHASE 3: Deploy to Railway (10 minutes)

### Step 10: Push Code to GitHub

1. In Anti-Gravity, push the project to a **GitHub repository**
   - If Anti-Gravity has Git integration, use it
   - Otherwise, create a new repo on GitHub called `0colors-api`
   - Push all the code there

### Step 11: Connect GitHub to Railway

1. Go back to **Railway** → your `0colors-backend` project
2. Click on the **`api-server`** service
3. Go to **"Settings"** tab
4. Under **"Source"**, click **"Connect Repo"**
5. Select your GitHub repo `0colors-api`
6. Railway will auto-detect the Dockerfile and start building
7. Wait for the build to complete (1-2 minutes)
8. You'll see a green **"Active"** badge when it's deployed

### Step 12: Test the Health Endpoint

1. Open a new browser tab
2. Go to: `https://api-server-production-xxxx.up.railway.app/api/health`
   (use YOUR Railway URL from Step 4)
3. You should see: `{"status":"ok","timestamp":1234567890}`
4. If you see this, **your backend is live!**

---

## PHASE 4: Migrate Existing Data (One-Time)

### Step 13: Export Data from Supabase

You need to move all existing KV data from Supabase to Railway PostgreSQL.

**Tell Anti-Gravity to create a migration script.** Use this prompt:

Create a file called migrate.ts that:

Connects to a SOURCE PostgreSQL (via SOURCE_DATABASE_URL env var) — this is my Supabase database
Connects to a TARGET PostgreSQL (via TARGET_DATABASE_URL env var) — this is my Railway database
Reads ALL rows from source table "kv_store_c36383cd" (columns: key TEXT, value JSONB)
Inserts them into target table "kv_store" (columns: key TEXT, value JSONB, updated_at TIMESTAMPTZ)
Uses ON CONFLICT DO UPDATE to handle duplicates
Logs progress: "Migrated X of Y rows"
Run with: npx tsx migrate.ts

**To run the migration:**

1. Get your Supabase database URL:
   - Go to Supabase Dashboard → your project → **Settings** → **Database**
   - Copy the **Connection string** (it says "URI" — starts with `postgresql://`)
   - The password is the one you set when creating the Supabase project

2. Get your Railway database URL:
   - Railway → PostgreSQL service → Variables tab → copy `DATABASE_URL`

3. In Anti-Gravity's terminal, run:
SOURCE_DATABASE_URL="postgresql://postgres:YOUR_SUPABASE_PASSWORD@db.xxxxx.supabase.co:5432/postgres" TARGET_DATABASE_URL="postgresql://postgres:RAILWAY_PASSWORD@roundhouse.proxy.rlwy.net:12345/railway" npx tsx migrate.ts


4. You should see: `"Migrated 150 of 150 rows"` (or however many rows you have)

---

## PHASE 5: Update the Frontend (I'll Do This Part)

Once your Railway backend is live and data is migrated, come back here and tell me:

1. **Your Railway server URL** (e.g., `https://api-server-production-xxxx.up.railway.app`)
2. **"Backend is ready, update the frontend"**

I will then make these changes in our codebase:
- Update `SERVER_BASE` to point to Railway
- Change route prefixes from `/make-server-c36383cd/` to `/api/`
- Everything else stays the same (Supabase Auth, localStorage, offline-first)

---

## PHASE 6: Set Up Cron (5 minutes)

For the Dev Mode `/cron-tick` endpoint (processes scheduled webhook workflows):

1. In Railway, click **"+ New"** → **"Cron Job"**
2. Set the schedule to: `*/5 * * * *` (every 5 minutes)
3. Set the command to:
curl -s https://api-server-production-xxxx.up.railway.app/api/cron-tick

4. Save

---

## Quick Reference: What Lives Where

| Service | What It Does | Where It Runs | Cost |
|---|---|---|---|
| **Frontend** (React SPA) | The 0colors app UI | Figma Make (current) or Vercel/Netlify later | Free |
| **Auth** | User signup, login, JWT tokens | **Supabase** (free tier) | $0 |
| **API Server** | All 29 endpoints, computation | **Railway** (api-server service) | ~$5-10/month |
| **Database** | KV store with all project data | **Railway** (PostgreSQL service) | Included in Pro |
| **Cron** | Scheduled webhook processing | **Railway** (Cron service) | Included in Pro |

---

## Summary of Your Action Items

1. ✅ **Railway**: Create project → Add PostgreSQL → Run the CREATE TABLE SQL → Add empty service → Set env vars → Generate domain
2. ✅ **Anti-Gravity**: Create Node.js project → Paste the master prompt → Paste the second prompt → Verify checklist
3. ✅ **Deploy**: Push to GitHub → Connect to Railway → Test `/api/health`
4. ✅ **Migrate**: Run the migration script to move Supabase data → Railway
5. ✅ **Come back here**: Give me the Railway URL → I update the frontend
6. ✅ **Cron**: Add a cron job for `/api/cron-tick`

You do steps 1-4, then come back to me for step 5. The whole process should take about 1-2 hours if Anti-Gravity cooperates well. The trickiest part will be getting Anti-Gravity to generate all 29 routes correctly — if it struggles, break it into smaller prompts (auth routes first, then cloud routes, then dev mode routes, etc.).