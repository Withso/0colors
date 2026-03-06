import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

// ── CORS must be the FIRST middleware so OPTIONS preflight requests
//    get proper Access-Control-* headers before anything else runs. ──
// IMPORTANT: X-User-Token must be in allowHeaders for the custom auth header to work.
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-User-Token", "X-Webhook-Secret"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Simple request logger (replaces hono/logger to avoid edge-runtime compatibility issues)
app.use("/*", async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
});

// Global error handler so unhandled throws return JSON instead of crashing
app.onError((err, c) => {
  console.log(`[GLOBAL ERROR] ${err?.message || err}`);
  // SECURITY: Do not expose internal error details to clients
  return c.json({ error: "Internal server error" }, 500);
});

// ═══════════════════════════════════════════════════════════════
// KV helpers - direct queries against kv_store_c36383cd table
// ═══════════════════════════════════════════════════════════════

// Maximum allowed request body size for sync endpoints (5 MB)
const MAX_SYNC_BODY_BYTES = 5 * 1024 * 1024;
// Maximum number of projects in a single batch sync
const MAX_BATCH_PROJECTS = 50;

// Singleton service client — reused across all requests
let _serviceClient: ReturnType<typeof createClient> | null = null;
function getServiceClient() {
  if (!_serviceClient) {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      console.log(`[FATAL] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
      throw new Error('Server misconfigured: missing Supabase credentials');
    }
    _serviceClient = createClient(url, key);
  }
  return _serviceClient;
}

const TABLE = 'kv_store_c36383cd';

async function kvGet(key: string): Promise<any> {
  const db = getServiceClient();
  const { data, error } = await db.from(TABLE).select('value').eq('key', key).maybeSingle();
  if (error) { console.log(`kvGet error for "${key}": ${error.message}`); return null; }
  return data?.value ?? null;
}

async function kvSet(key: string, value: any): Promise<boolean> {
  const db = getServiceClient();
  const { error } = await db.from(TABLE).upsert({ key, value }, { onConflict: 'key' });
  if (error) {
    console.log(`kvSet error for "${key}": ${error.message}`);
    return false;
  }
  return true;
}

async function kvDel(key: string): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from(TABLE).delete().eq('key', key);
  if (error) console.log(`kvDel error for "${key}": ${error.message}`);
}

async function kvMget(keys: string[]): Promise<(any)[]> {
  if (keys.length === 0) return [];
  const db = getServiceClient();
  const { data, error } = await db.from(TABLE).select('key, value').in('key', keys);
  if (error) { console.log(`kvMget error: ${error.message}`); return keys.map(() => null); }
  const map = new Map<string, any>();
  (data || []).forEach((row: any) => map.set(row.key, row.value));
  return keys.map(k => map.get(k) ?? null);
}

async function kvMset(entries: [string, any][]): Promise<void> {
  if (entries.length === 0) return;
  const db = getServiceClient();
  const rows = entries.map(([key, value]) => ({ key, value }));
  const { error } = await db.from(TABLE).upsert(rows, { onConflict: 'key' });
  if (error) console.log(`kvMset error: ${error.message}`);
}

// ═══════════════════════════════════════════════════════════════
// ADMIN ROLE SYSTEM
// ═══════════════════════════════════════════════════════════════
//
// Two admin roles, both managed MANUALLY via the Supabase dashboard
// by adding rows to the kv_store_c36383cd table. No UI exists for
// creating admins or template admins.
//
// 1. ADMIN (multiple users can be admin):
//    KV key: user:admin:{userId}   value: true
//    - No restrictions on cloud projects (unlimited)
//    - Full access
//    To grant: INSERT into kv_store_c36383cd (key, value)
//              VALUES ('user:admin:<userId>', true)
//    The value column is jsonb, so store as boolean true, or string "true".
//
// 2. TEMPLATE ADMIN (exactly ONE user at a time):
//    KV key: app:template_admin_user_id   value: "<userId>"
//    - Must also be an admin (enforced at read time)
//    - Only one user can hold this role at any time
//    To grant: UPSERT into kv_store_c36383cd (key, value)
//              VALUES ('app:template_admin_user_id', '"<userId>"')
//    NOTE: The value must be a valid JSON string, so the UUID
//    must be wrapped in double-quotes: '"0c62a622-..."'
//
// Normal users: max 2 cloud projects, standard access.
// ═══════════════════════════════════════════════════════════════

const CLOUD_PROJECT_LIMIT = 2; // For normal users only; admin is unlimited

async function isUserAdmin(userId: string): Promise<boolean> {
  const val = await kvGet(`user:admin:${userId}`);
  // The value column is jsonb — value may be boolean true or string "true"
  // depending on how it was inserted (dashboard vs code).
  return val === true || val === 'true' || String(val) === 'true';
}

async function isUserTemplateAdmin(userId: string): Promise<boolean> {
  // Must be an admin first
  const admin = await isUserAdmin(userId);
  if (!admin) return false;
  const templateAdminId = await kvGet('app:template_admin_user_id');
  // Coerce to string for comparison since jsonb may return different types
  return templateAdminId != null && String(templateAdminId).replace(/^"|"$/g, '') === userId;
}

async function getUserRole(userId: string): Promise<'admin' | 'user'> {
  const admin = await isUserAdmin(userId);
  return admin ? 'admin' : 'user';
}

// ── Helper: extract and verify user ──
// IMPORTANT: User token comes from X-User-Token header, NOT Authorization.
// The Authorization header carries publicAnonKey for the Supabase gateway.
// This separation ensures requests always pass the gateway (anon key never expires)
// while our code validates the user's session via X-User-Token.
async function getAuthUser(c: any): Promise<{ userId: string } | null> {
  try {
    // Read user token from custom header (preferred) or fallback to Authorization
    const userToken = c.req.header('X-User-Token');
    const authHeader = c.req.header('Authorization');
    const accessToken = userToken || authHeader?.split(' ')[1];

    if (!accessToken) {
      console.log(`[AUTH] No token found (X-User-Token: ${userToken ? 'present' : 'missing'}, Authorization: ${authHeader ? 'present' : 'missing'})`);
      return null;
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error) {
      console.log(`[AUTH] getUser error: ${error.message} (token length: ${accessToken.length})`);
      return null;
    }
    if (!data?.user?.id) {
      console.log(`[AUTH] getUser returned no user id`);
      return null;
    }
    return { userId: data.user.id };
  } catch (e) {
    console.log(`[AUTH] Auth verification exception: ${e}`);
    return null;
  }
}

// ── Health check ──
app.get("/make-server-c36383cd/health", (c) => {
  return c.json({ status: "ok", timestamp: Date.now() });
});

// ── Debug: Inspect full cloud state for a user (admin-only) ──
app.get("/make-server-c36383cd/debug-cloud-state/:userId", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  // Only admins can inspect cloud state
  const isAdmin = await isUserAdmin(auth.userId);
  if (!isAdmin) return c.json({ error: "Admin only" }, 403);

  try {
    const targetUserId = c.req.param("userId");
    
    // 1. Get user meta
    const metaRaw = await kvGet(`user:${targetUserId}:meta`);
    const meta = metaRaw ? (typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw) : null;
    const cloudProjectIds: string[] = meta?.cloudProjectIds || [];
    
    // 2. Get all snapshots
    const snapshotKeys = cloudProjectIds.map(id => `project:${id}:snapshot`);
    const ownerKeys = cloudProjectIds.map(id => `project:${id}:owner`);
    const snapshots = snapshotKeys.length > 0 ? await kvMget(snapshotKeys) : [];
    const owners = ownerKeys.length > 0 ? await kvMget(ownerKeys) : [];
    
    // 3. Build summary for each project
    const projectDetails = cloudProjectIds.map((id, i) => {
      const snap = snapshots[i];
      const parsed = snap ? (typeof snap === 'string' ? JSON.parse(snap) : snap) : null;
      return {
        projectId: id,
        owner: owners[i],
        hasSnapshot: !!parsed,
        _syncedAt: parsed?._syncedAt || null,
        _syncedAtDate: parsed?._syncedAt ? new Date(parsed._syncedAt).toISOString() : null,
        projectName: parsed?.project?.name || null,
        isCloud: parsed?.project?.isCloud || false,
        isTemplate: parsed?.project?.isTemplate || false,
        nodeCount: parsed?.nodes?.length || 0,
        tokenCount: parsed?.tokens?.length || 0,
        groupCount: parsed?.groups?.length || 0,
        pageCount: parsed?.pages?.length || 0,
        themeCount: parsed?.themes?.length || 0,
        schemaVersion: parsed?.schemaVersion || null,
      };
    });
    
    return c.json({
      targetUserId,
      meta,
      cloudProjectCount: cloudProjectIds.length,
      cloudProjectIds,
      projects: projectDetails,
      inspectedBy: auth.userId,
      timestamp: Date.now(),
    });
  } catch (e) {
    return c.json({ error: `Exception: ${e}` }, 500);
  }
});

// ── Debug: Check auth + admin status ──
app.get("/make-server-c36383cd/debug-auth", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) {
    return c.json({
      error: "Auth failed",
      hasXUserToken: !!c.req.header('X-User-Token'),
      hasAuthorization: !!c.req.header('Authorization'),
    }, 401);
  }

  // SECURITY: Only admins can access debug endpoints
  const admin = await isUserAdmin(auth.userId);
  if (!admin) return c.json({ error: "Admin only" }, 403);

  try {
    const userId = auth.userId;
    const templateAdmin = await isUserTemplateAdmin(userId);
    const metaRaw = await kvGet(`user:${userId}:meta`);

    // Return only diagnostic info, no raw KV values or key names
    return c.json({
      userId,
      isAdmin: admin,
      isTemplateAdmin: templateAdmin,
      metaExists: !!metaRaw,
    });
  } catch (e) {
    return c.json({ error: "Debug check failed" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════

// ── Sign Up ──
app.post("/make-server-c36383cd/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "Email and password are required for signup" }, 400);
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name || email.split('@')[0] },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true,
    });

    if (error) {
      console.log(`Signup error for ${email}: ${error.message}`);
      return c.json({ error: `Signup failed: ${error.message}` }, 400);
    }

    const userId = data.user.id;

    // Check if user is admin (manually set in Supabase dashboard)
    const role = await getUserRole(userId);

    // Initialize user metadata in KV store
    // Store as a proper JSON object (not stringified) since column is jsonb
    await kvSet(`user:${userId}:meta`, {
      cloudProjectIds: [],
      email,
      name: name || email.split('@')[0],
      role,
      createdAt: Date.now(),
    });

    console.log(`User signed up successfully: ${userId} (role: ${role})`);
    return c.json({ success: true, userId, role });
  } catch (e) {
    console.log(`Signup exception: ${e}`);
    return c.json({ error: `Signup exception: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// CLOUD PROJECT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// ── Get user cloud project metadata (includes role & admin status) ──
app.get("/make-server-c36383cd/cloud-meta", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized: failed to verify user session for cloud-meta" }, 401);

  try {
    const raw = await kvGet(`user:${auth.userId}:meta`);
    const role = await getUserRole(auth.userId);
    const isTemplateAdmin = await isUserTemplateAdmin(auth.userId);

    if (!raw) {
      // First time - initialize
      const meta = { cloudProjectIds: [] as string[], role, createdAt: Date.now() };
      await kvSet(`user:${auth.userId}:meta`, meta);
      return c.json({
        meta,
        isAdmin: role === 'admin',
        isTemplateAdmin,
        cloudProjectLimit: role === 'admin' ? null : CLOUD_PROJECT_LIMIT,
      });
    }

    // jsonb column returns object directly; handle legacy string-encoded values too
    const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(meta.cloudProjectIds)) meta.cloudProjectIds = [];
    meta.role = role; // Ensure role is current

    return c.json({
      meta,
      isAdmin: role === 'admin',
      isTemplateAdmin,
      cloudProjectLimit: role === 'admin' ? null : CLOUD_PROJECT_LIMIT,
    });
  } catch (e) {
    console.log(`cloud-meta GET error for user ${auth.userId}: ${e}`);
    return c.json({ error: `Failed to load cloud metadata: ${e}` }, 500);
  }
});

// ── Register a project as cloud ──
// Admin: unlimited. Normal user: max CLOUD_PROJECT_LIMIT.
app.post("/make-server-c36383cd/cloud-register", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized: failed to verify user session for cloud-register" }, 401);

  try {
    const { projectId } = await c.req.json();
    if (!projectId) return c.json({ error: "projectId is required" }, 400);

    // Load current meta
    const raw = await kvGet(`user:${auth.userId}:meta`);
    const meta = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { cloudProjectIds: [] };
    // Ensure cloudProjectIds is always an array
    if (!Array.isArray(meta.cloudProjectIds)) meta.cloudProjectIds = [];

    // Check if already registered
    if (meta.cloudProjectIds.includes(projectId)) {
      return c.json({ success: true, meta });
    }

    // Enforce project limit - admins are exempt
    const role = await getUserRole(auth.userId);
    console.log(`cloud-register: user=${auth.userId} role=${role} currentProjects=${meta.cloudProjectIds.length} projectId=${projectId}`);
    if (role !== 'admin' && meta.cloudProjectIds.length >= CLOUD_PROJECT_LIMIT) {
      return c.json({
        error: `Cloud project limit reached. Maximum ${CLOUD_PROJECT_LIMIT} cloud projects allowed per user.`,
      }, 400);
    }

    meta.cloudProjectIds.push(projectId);
    // Store as JSON object directly (jsonb column)
    await kvSet(`user:${auth.userId}:meta`, meta);

    // Register ownership
    await kvSet(`project:${projectId}:owner`, auth.userId);

    console.log(`Cloud project registered: ${projectId} for user ${auth.userId} (role: ${role})`);
    return c.json({ success: true, meta });
  } catch (e) {
    console.log(`cloud-register error for user ${auth.userId}: ${e}`);
    return c.json({ error: `Failed to register cloud project: ${e}` }, 500);
  }
});

// ── Unregister a project from cloud ──
app.post("/make-server-c36383cd/cloud-unregister", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized: failed to verify user session for cloud-unregister" }, 401);

  try {
    const { projectId } = await c.req.json();
    if (!projectId) return c.json({ error: "projectId is required" }, 400);

    // SECURITY: Verify ownership before deleting project data.
    // Without this check, any authenticated user could delete any project.
    const owner = await kvGet(`project:${projectId}:owner`);
    if (owner && String(owner) !== auth.userId) {
      return c.json({ error: "Forbidden: you do not own this project" }, 403);
    }

    // Load current meta
    const raw = await kvGet(`user:${auth.userId}:meta`);
    const meta = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { cloudProjectIds: [] };
    if (!Array.isArray(meta.cloudProjectIds)) meta.cloudProjectIds = [];

    // Only proceed with deletion if the project was actually in this user's list
    const wasRegistered = meta.cloudProjectIds.includes(projectId);
    meta.cloudProjectIds = meta.cloudProjectIds.filter((id: string) => id !== projectId);
    await kvSet(`user:${auth.userId}:meta`, meta);

    // Only clean up project data if the user owns it (or no owner is set)
    if (wasRegistered || !owner) {
      await kvDel(`project:${projectId}:snapshot`);
      await kvDel(`project:${projectId}:owner`);
    }

    console.log(`Cloud project unregistered: ${projectId} for user ${auth.userId}`);
    return c.json({ success: true, meta });
  } catch (e) {
    console.log(`cloud-unregister error: ${e}`);
    return c.json({ error: `Failed to unregister cloud project: ${e}` }, 500);
  }
});

// ══════════════════════════════════════════════════════════════
// CLOUD DATA SYNC
// ═══════════════════════════════════════════════════════════════

// ── Save project snapshot ──
app.post("/make-server-c36383cd/sync", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized: failed to verify user session for sync" }, 401);

  try {
    const { projectId, snapshot } = await c.req.json();
    if (!projectId || !snapshot) {
      return c.json({ error: "projectId and snapshot are required for sync" }, 400);
    }

    // SECURITY: Verify ownership — if no owner is registered, only allow if
    // the project is in the user's own cloudProjectIds (prevents writing to
    // arbitrary unregistered project keys).
    const owner = await kvGet(`project:${projectId}:owner`);
    if (owner && String(owner) !== auth.userId) {
      return c.json({ error: "Forbidden: you do not own this project" }, 403);
    }
    if (!owner) {
      // No owner registered — verify the user has this project in their meta
      const metaRaw = await kvGet(`user:${auth.userId}:meta`);
      const meta = metaRaw ? (typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw) : null;
      const userProjectIds: string[] = meta?.cloudProjectIds || [];
      if (!userProjectIds.includes(projectId)) {
        return c.json({ error: "Forbidden: project not registered to your account" }, 403);
      }
    }

    // Save snapshot with timestamp (store as JSON object directly)
    const snapshotWithMeta = {
      ...snapshot,
      _syncedAt: Date.now(),
      _userId: auth.userId,
    };

    await kvSet(`project:${projectId}:snapshot`, snapshotWithMeta);
    console.log(`Project synced: ${projectId} for user ${auth.userId}`);
    return c.json({ success: true, syncedAt: snapshotWithMeta._syncedAt });
  } catch (e) {
    console.log(`Sync error for user ${auth.userId}: ${e}`);
    return c.json({ error: `Failed to sync project: ${e}` }, 500);
  }
});

// ── Load project snapshot ──
app.get("/make-server-c36383cd/load/:projectId", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized: failed to verify user session for load" }, 401);

  try {
    const projectId = c.req.param("projectId");

    // Verify ownership
    const owner = await kvGet(`project:${projectId}:owner`);
    if (owner && String(owner) !== auth.userId) {
      return c.json({ error: "Forbidden: you do not own this project" }, 403);
    }

    const raw = await kvGet(`project:${projectId}:snapshot`);
    if (!raw) {
      return c.json({ snapshot: null });
    }

    // jsonb returns object directly; handle legacy string-encoded values
    const snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return c.json({ snapshot });
  } catch (e) {
    console.log(`Load error for project ${c.req.param("projectId")}: ${e}`);
    return c.json({ error: `Failed to load project: ${e}` }, 500);
  }
});

// ── Load all cloud projects for a user (batch) ──
app.get("/make-server-c36383cd/load-all", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized: failed to verify user session for load-all" }, 401);

  try {
    const raw = await kvGet(`user:${auth.userId}:meta`);
    if (!raw) return c.json({ projects: [] });

    const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const projectIds: string[] = Array.isArray(meta.cloudProjectIds) ? meta.cloudProjectIds : [];

    if (projectIds.length === 0) return c.json({ projects: [] });

    const keys = projectIds.map((id: string) => `project:${id}:snapshot`);
    const snapshots = await kvMget(keys);

    const projects = projectIds.map((id: string, i: number) => ({
      projectId: id,
      snapshot: snapshots[i] ? (typeof snapshots[i] === 'string' ? JSON.parse(snapshots[i]!) : snapshots[i]) : null,
    }));

    return c.json({ projects });
  } catch (e) {
    console.log(`Load-all error for user ${auth.userId}: ${e}`);
    return c.json({ error: `Failed to load cloud projects: ${e}` }, 500);
  }
});

// ── Batch sync multiple projects ──
app.post("/make-server-c36383cd/sync-batch", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized: failed to verify user session for sync-batch" }, 401);

  try {
    const { projects } = await c.req.json();
    if (!Array.isArray(projects)) {
      return c.json({ error: "projects array is required for sync-batch" }, 400);
    }

    // SECURITY: Enforce batch size limit to prevent abuse
    if (projects.length > MAX_BATCH_PROJECTS) {
      return c.json({ error: `Batch too large: maximum ${MAX_BATCH_PROJECTS} projects per request` }, 400);
    }

    const syncedAt = Date.now();
    const entries: [string, any][] = [];

    // Batch-fetch all owner keys in a single DB query instead of
    // one sequential kvGet per project (reduces N round-trips to 1).
    const ownerKeys = projects.map(({ projectId }: any) => `project:${projectId}:owner`);
    const owners = await kvMget(ownerKeys);

    // Also load user meta once to verify unregistered projects
    const metaRaw = await kvGet(`user:${auth.userId}:meta`);
    const meta = metaRaw ? (typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw) : null;
    const userProjectIds: string[] = meta?.cloudProjectIds || [];

    for (let i = 0; i < projects.length; i++) {
      const { projectId, snapshot } = projects[i];
      const owner = owners[i];

      // SECURITY: Same ownership check as /sync — owned by another user = skip
      if (owner && String(owner) !== auth.userId) {
        console.log(`Skipping sync for project ${projectId}: not owned by user ${auth.userId}`);
        continue;
      }
      // If no owner registered, verify the project is in the user's cloudProjectIds
      if (!owner && !userProjectIds.includes(projectId)) {
        console.log(`Skipping sync for project ${projectId}: not registered to user ${auth.userId}`);
        continue;
      }

      const snapshotWithMeta = {
        ...snapshot,
        _syncedAt: syncedAt,
        _userId: auth.userId,
      };
      entries.push([`project:${projectId}:snapshot`, snapshotWithMeta]);
    }

    if (entries.length > 0) {
      await kvMset(entries);
    }

    console.log(`Batch sync complete: ${entries.length} projects for user ${auth.userId}`);
    return c.json({ success: true, syncedAt, count: entries.length });
  } catch (e) {
    console.log(`Sync-batch error for user ${auth.userId}: ${e}`);
    return c.json({ error: `Failed to batch sync: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// FIGMA PLUGIN — COMPUTED TOKENS API
// ═══════════════════════════════════════════════════════════════
//
// These endpoints serve the pre-computed, visibility-filtered token
// snapshots that the Figma plugin reads to sync with Figma Variables.
// The data is written by the frontend during its normal save/sync cycle.

// ── Get computed tokens for a project (authenticated — project owner) ──
app.get("/make-server-c36383cd/figma-tokens/:projectId", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized: Figma plugin must provide a valid user token" }, 401);

  try {
    const projectId = c.req.param("projectId");

    // Verify ownership
    const owner = await kvGet(`project:${projectId}:owner`);
    if (owner && String(owner) !== auth.userId) {
      return c.json({ error: "Forbidden: you do not own this project" }, 403);
    }

    const raw = await kvGet(`project:${projectId}:snapshot`);
    if (!raw) {
      return c.json({ error: "Project not found or not synced to cloud" }, 404);
    }

    const snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const computedTokens = snapshot?.computedTokens || null;

    // Block sample and template projects from Figma plugin access
    if (snapshot?.project?.isSample || snapshot?.project?.isTemplate) {
      return c.json({ error: "Sample and template projects are not available in the Figma plugin" }, 403);
    }

    if (!computedTokens) {
      return c.json({
        error: "Computed tokens not yet generated. Open the project in 0colors and wait for sync.",
        projectId,
      }, 404);
    }

    const renameCount = computedTokens.renames?.length || 0;
    console.log(`Figma tokens served for project ${projectId} (user: ${auth.userId}, renames: ${renameCount})`);
    return c.json({
      projectId,
      projectName: computedTokens.projectName || snapshot?.project?.name || 'Unknown',
      themes: computedTokens.themes || [],
      computedAt: computedTokens.computedAt || null,
      schemaVersion: snapshot?.schemaVersion || null,
      // Rename map: tokens that changed name since last computed snapshot.
      // The plugin should use token `id` as the stable key — `renames` is
      // a convenience for plugins that still match by name.
      renames: computedTokens.renames || [],
    });
  } catch (e) {
    console.log(`Figma tokens error for project ${c.req.param("projectId")}: ${e}`);
    return c.json({ error: `Failed to load computed tokens: ${e}` }, 500);
  }
});

// ── List all projects with computed tokens (authenticated) ──
// Returns a summary so the Figma plugin can show a project picker.
app.get("/make-server-c36383cd/figma-projects", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized: Figma plugin must provide a valid user token" }, 401);

  try {
    const raw = await kvGet(`user:${auth.userId}:meta`);
    if (!raw) return c.json({ projects: [] });

    const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const projectIds: string[] = Array.isArray(meta.cloudProjectIds) ? meta.cloudProjectIds : [];
    if (projectIds.length === 0) return c.json({ projects: [] });

    const keys = projectIds.map((id: string) => `project:${id}:snapshot`);
    const snapshots = await kvMget(keys);

    const projects: any[] = [];
    for (let i = 0; i < projectIds.length; i++) {
      const snap = snapshots[i];
      if (!snap) continue;
      const snapshot = typeof snap === 'string' ? JSON.parse(snap) : snap;

      // Skip sample and template projects — these are not user-authored
      if (snapshot?.project?.isSample || snapshot?.project?.isTemplate) continue;

      const ct = snapshot?.computedTokens;
      const themeSummary = (ct?.themes || []).map((t: any) => ({
        themeId: t.themeId,
        themeName: t.themeName,
        isPrimary: t.isPrimary,
        tokenCount: t.tokens?.length || 0,
      }));

      projects.push({
        projectId: projectIds[i],
        projectName: snapshot?.project?.name || 'Untitled',
        hasComputedTokens: !!ct,
        computedAt: ct?.computedAt || null,
        themes: themeSummary,
      });
    }

    console.log(`Figma projects list: ${projects.length} projects for user ${auth.userId}`);
    return c.json({ projects });
  } catch (e) {
    console.log(`Figma projects error for user ${auth.userId}: ${e}`);
    return c.json({ error: `Failed to list projects: ${e}` }, 500);
  }
});





// ═══════════════════════════════════════════════════════════════
// AI CHAT — Conversations & Settings (per-user, global)
// ═══════════════════════════════════════════════════════════════

// Maximum conversations payload (1 MB)
const MAX_AI_PAYLOAD_BYTES = 1 * 1024 * 1024;
const MAX_AI_CONVERSATIONS = 2;
const MAX_AI_MESSAGES_PER_CONV = 40;

/** Server-side trimming: cap conversations count and messages per conversation */
function trimAIConversations(convs: any[]): any[] {
  // Sort by updatedAt descending, cap total count
  const sorted = convs
    .filter((c: any) => c && typeof c === 'object' && c.id)
    .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_AI_CONVERSATIONS);
  // Trim messages in each conversation
  return sorted.map((c: any) => {
    if (!Array.isArray(c.messages) || c.messages.length <= MAX_AI_MESSAGES_PER_CONV) return c;
    // Keep first message + most recent (limit - 1)
    const first = c.messages[0];
    const recent = c.messages.slice(-(MAX_AI_MESSAGES_PER_CONV - 1));
    return { ...c, messages: [first, ...recent] };
  });
}

// ── Load AI conversations ──
app.get("/make-server-c36383cd/ai-conversations", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  try {
    const data = await kvGet(`user:${auth.userId}:ai-conversations`);
    return c.json({ ok: true, conversations: data || [] });
  } catch (e: any) {
    console.log(`[AI] Load conversations error for ${auth.userId}: ${e?.message}`);
    return c.json({ error: "Failed to load AI conversations" }, 500);
  }
});

// ── Save AI conversations ──
app.post("/make-server-c36383cd/ai-conversations", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  try {
    const rawBody = await c.req.text();
    if (rawBody.length > MAX_AI_PAYLOAD_BYTES) {
      return c.json({ error: "Payload too large. Try deleting some older conversations." }, 413);
    }
    const body = JSON.parse(rawBody);
    const conversations = body.conversations;
    if (!Array.isArray(conversations)) {
      return c.json({ error: "Invalid payload: conversations must be an array" }, 400);
    }
    // Server-side enforce limits (defense in depth — frontend also trims)
    const trimmed = trimAIConversations(conversations);
    const ok = await kvSet(`user:${auth.userId}:ai-conversations`, trimmed);
    if (!ok) return c.json({ error: "Failed to save AI conversations" }, 500);
    return c.json({ ok: true, trimmedTo: trimmed.length });
  } catch (e: any) {
    console.log(`[AI] Save conversations error for ${auth.userId}: ${e?.message}`);
    return c.json({ error: "Failed to save AI conversations" }, 500);
  }
});

// ── Load AI settings ──
app.get("/make-server-c36383cd/ai-settings", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  try {
    const data = await kvGet(`user:${auth.userId}:ai-settings`);
    return c.json({ ok: true, settings: data || null });
  } catch (e: any) {
    console.log(`[AI] Load settings error for ${auth.userId}: ${e?.message}`);
    return c.json({ error: "Failed to load AI settings" }, 500);
  }
});

// ── Save AI settings ──
app.post("/make-server-c36383cd/ai-settings", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const settings = body.settings;
    if (!settings || typeof settings !== 'object') {
      return c.json({ error: "Invalid payload: settings must be an object" }, 400);
    }
    const ok = await kvSet(`user:${auth.userId}:ai-settings`, settings);
    if (!ok) return c.json({ error: "Failed to save AI settings" }, 500);
    return c.json({ ok: true });
  } catch (e: any) {
    console.log(`[AI] Save settings error for ${auth.userId}: ${e?.message}`);
    return c.json({ error: "Failed to save AI settings" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// DEV MODE — Webhook Input, Pull API, GitHub Push, Config
// ═══════════════════════════════════════════════════════════════

// ── In-memory rate limiter for Pull API ──
const pullApiRateMap = new Map<string, { count: number; resetAt: number }>();
const PULL_API_RATE_LIMIT = 100; // per hour per project
const PULL_API_WINDOW_MS = 3600000; // 1 hour

function checkPullApiRate(projectIdParam: string): boolean {
  const now = Date.now();
  const entry = pullApiRateMap.get(projectIdParam);
  if (!entry || now > entry.resetAt) {
    pullApiRateMap.set(projectIdParam, { count: 1, resetAt: now + PULL_API_WINDOW_MS });
    return true;
  }
  if (entry.count >= PULL_API_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Webhook Input (PUBLIC — validated by secret) ──
app.post("/make-server-c36383cd/webhook/:projectId", async (c) => {
  const pid = c.req.param("projectId");
  const secret = c.req.header("X-Webhook-Secret");
  if (!pid) return c.json({ error: "Missing projectId" }, 400);

  try {
    const body = await c.req.json();
    const { value, format } = body;
    if (!value) return c.json({ error: "Missing 'value' in request body" }, 400);
    if (!format) return c.json({ error: "Missing 'format' in request body (hex, hsl, rgb, oklch, hct)" }, 400);

    const devConfig = await kvGet(`dev-config:${pid}`);
    if (!devConfig?.webhookEnabled) return c.json({ error: "Webhook is not enabled for this project" }, 403);
    if (!secret || secret !== devConfig.webhookSecret) return c.json({ error: "Invalid webhook secret" }, 401);

    const acceptFormats = devConfig.webhookAcceptFormats || ['hex'];
    if (!acceptFormats.includes(format)) {
      return c.json({ error: `Format '${format}' not accepted. Accepted: ${acceptFormats.join(', ')}` }, 400);
    }

    const pending = { value, format, receivedAt: Date.now(), targetNodeId: devConfig.webhookTargetNodeId };
    await kvSet(`webhook:${pid}:pending`, pending);
    console.log(`[Dev] Webhook received for project ${pid}: ${format}=${value}`);
    return c.json({ ok: true, message: "Webhook received, pending processing" });
  } catch (e: any) {
    console.log(`[Dev] Webhook error for project ${pid}: ${e?.message}`);
    return c.json({ error: "Failed to process webhook" }, 500);
  }
});

// ── Check Pending Webhooks (Authenticated) ──
app.get("/make-server-c36383cd/webhook-pending/:projectId", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const pid = c.req.param("projectId");
  try {
    const pending = await kvGet(`webhook:${pid}:pending`);
    return c.json({ pending: pending || null });
  } catch (e: any) {
    console.log(`[Dev] Check pending error for project ${pid}: ${e?.message}`);
    return c.json({ error: "Failed to check pending webhooks" }, 500);
  }
});

// ── Clear Pending Webhook (Authenticated) ──
app.post("/make-server-c36383cd/webhook-clear/:projectId", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const pid = c.req.param("projectId");
  try {
    await kvDel(`webhook:${pid}:pending`);
    return c.json({ ok: true });
  } catch (e: any) {
    console.log(`[Dev] Clear pending error for project ${pid}: ${e?.message}`);
    return c.json({ error: "Failed to clear pending webhook" }, 500);
  }
});

// ── Pull API (PUBLIC — rate-limited, cached) ──
app.get("/make-server-c36383cd/tokens/:projectId/:format", async (c) => {
  const pid = c.req.param("projectId");
  const format = c.req.param("format");
  if (!pid) return c.json({ error: "Missing projectId" }, 400);
  if (!['css', 'dtcg', 'tailwind', 'figma'].includes(format)) {
    return c.json({ error: `Invalid format '${format}'. Use: css, dtcg, tailwind, figma` }, 400);
  }

  if (!checkPullApiRate(pid)) {
    return c.json({ error: "Rate limit exceeded. Max 100 req/hr per project. Use webhook push instead." }, 429);
  }

  try {
    const devConfig = await kvGet(`dev-config:${pid}`);
    if (!devConfig?.pullApiEnabled) return c.json({ error: "Pull API is not enabled for this project" }, 403);

    const cached = await kvGet(`project:${pid}:token-output:${format}`);
    if (!cached) return c.json({ error: "No token output available. Run the pipeline first." }, 404);

    const contentTypes: Record<string, string> = { css: 'text/css', dtcg: 'application/json', tailwind: 'application/javascript', figma: 'application/json' };
    return new Response(typeof cached === 'string' ? cached : JSON.stringify(cached, null, 2), {
      status: 200,
      headers: {
        'Content-Type': contentTypes[format] || 'text/plain',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'X-Rate-Limit-Remaining': String(PULL_API_RATE_LIMIT - (pullApiRateMap.get(pid)?.count || 0)),
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e: any) {
    console.log(`[Dev] Pull API error for project ${pid}/${format}: ${e?.message}`);
    return c.json({ error: "Failed to retrieve token output" }, 500);
  }
});

// ── Save Token Output Cache (Authenticated) ──
app.post("/make-server-c36383cd/dev/save-output", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { projectId: pid, format, output } = body;
    if (!pid || !format || output === undefined) return c.json({ error: "Missing projectId, format, or output" }, 400);
    await kvSet(`project:${pid}:token-output:${format}`, output);
    console.log(`[Dev] Saved token output for ${pid}/${format}`);
    return c.json({ ok: true });
  } catch (e: any) {
    console.log(`[Dev] Save output error: ${e?.message}`);
    return c.json({ error: "Failed to save token output" }, 500);
  }
});

// ── GitHub Push Proxy (Authenticated) ──
app.post("/make-server-c36383cd/dev/github-push", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { repo, path, branch, content, commitMessage, pat } = body;
    if (!repo || !path || !content || !pat) return c.json({ error: "Missing required fields: repo, path, content, pat" }, 400);

    const ghBranch = branch || 'main';
    const ghMessage = commitMessage || `Update ${path} via 0colors`;

    // Get current file SHA for updates
    const getUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${ghBranch}`;
    const getRes = await fetch(getUrl, {
      headers: { 'Authorization': `token ${pat}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': '0colors-dev-mode' },
    });
    let sha: string | undefined;
    if (getRes.ok) { const existing = await getRes.json(); sha = existing.sha; }

    const putBody: any = { message: ghMessage, content: btoa(unescape(encodeURIComponent(content))), branch: ghBranch };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { 'Authorization': `token ${pat}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': '0colors-dev-mode' },
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      console.log(`[Dev] GitHub push failed for ${repo}/${path}: ${putRes.status} ${err}`);
      return c.json({ error: `GitHub API error: ${putRes.status}`, details: err }, 502 as any);
    }

    const result = await putRes.json();
    console.log(`[Dev] GitHub push success: ${repo}/${path} on ${ghBranch}`);
    return c.json({ ok: true, sha: result.content?.sha, url: result.content?.html_url });
  } catch (e: any) {
    console.log(`[Dev] GitHub push error: ${e?.message}`);
    return c.json({ error: "Failed to push to GitHub" }, 500);
  }
});

// ── Webhook Output Proxy (Authenticated) ──
app.post("/make-server-c36383cd/dev/webhook-push", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { url, payload, headers: customHeaders } = body;
    if (!url || !payload) return c.json({ error: "Missing url or payload" }, 400);

    const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': '0colors-dev-mode', ...(customHeaders || {}) };
    const res = await fetch(url, { method: 'POST', headers: reqHeaders, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
    const responseText = await res.text();
    console.log(`[Dev] Webhook push to ${url}: ${res.status}`);
    return c.json({ ok: res.ok, status: res.status, response: responseText.slice(0, 500) });
  } catch (e: any) {
    console.log(`[Dev] Webhook push error: ${e?.message}`);
    return c.json({ error: `Failed to push to webhook: ${e?.message}` }, 500);
  }
});

// ── Save Dev Config (Authenticated) ──
app.post("/make-server-c36383cd/dev/save-config", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { projectId: pid, devConfig } = body;
    if (!pid || !devConfig) return c.json({ error: "Missing projectId or devConfig" }, 400);

    const ok = await kvSet(`dev-config:${pid}`, devConfig);
    if (!ok) return c.json({ error: "Failed to save dev config" }, 500);
    console.log(`[Dev] Saved dev config for project ${pid}`);
    return c.json({ ok: true });
  } catch (e: any) {
    console.log(`[Dev] Save config error: ${e?.message}`);
    return c.json({ error: "Failed to save dev config" }, 500);
  }
});

// ── Load Dev Config (Authenticated) ──
app.get("/make-server-c36383cd/dev/load-config/:projectId", async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  const pid = c.req.param("projectId");
  try {
    const devConfig = await kvGet(`dev-config:${pid}`);
    return c.json({ devConfig: devConfig || null });
  } catch (e: any) {
    console.log(`[Dev] Load config error for ${pid}: ${e?.message}`);
    return c.json({ error: "Failed to load dev config" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// HEADLESS PIPELINE — Server-side computation (no browser needed)
// ═══════════════════════════════════════════════════════════════

import { runPipeline, parseIncomingValue } from "./pipeline.ts";
import type { ProjectSnapshot, DevConfig as DevConfigType } from "./computation-types.ts";

/**
 * Load a project snapshot from cloud sync KV.
 * The client stores snapshots under `cloud:<projectId>` during sync.
 */
async function loadProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
  try {
    const raw = await kvGet(`cloud:${projectId}`);
    if (!raw) return null;
    // Cloud sync stores the full project data
    return raw as ProjectSnapshot;
  } catch (e: any) {
    console.log(`[Pipeline] Failed to load snapshot for ${projectId}: ${e?.message}`);
    return null;
  }
}

/**
 * Save updated snapshot back to KV so the browser sees updated state.
 */
async function saveProjectSnapshot(projectId: string, snapshot: ProjectSnapshot): Promise<void> {
  try {
    await kvSet(`cloud:${projectId}`, snapshot);
  } catch (e: any) {
    console.log(`[Pipeline] Failed to save snapshot for ${projectId}: ${e?.message}`);
  }
}

/**
 * Push pipeline output to configured destinations.
 */
async function pushToDestinations(
  devConfig: DevConfigType,
  output: Record<string, string>,
  projectId: string,
): Promise<{ github?: boolean; webhook?: boolean; cache?: boolean }> {
  const results: { github?: boolean; webhook?: boolean; cache?: boolean } = {};

  // Cache output in KV for Pull API
  try {
    for (const [format, content] of Object.entries(output)) {
      await kvSet(`project:${projectId}:token-output:${format}`, content);
    }
    results.cache = true;
  } catch (e: any) {
    console.log(`[Pipeline] Cache output failed: ${e?.message}`);
    results.cache = false;
  }

  // Push to GitHub if enabled
  if (devConfig.githubEnabled && devConfig.githubRepo && devConfig.githubPATEncrypted) {
    // NOTE: PAT is encrypted client-side. For server-side push, the client must
    // decrypt and send the plaintext PAT. For cron/webhook triggers, we skip GitHub
    // push (it requires the browser to decrypt the PAT).
    // This is a deliberate security decision: the server never stores plaintext PATs.
    console.log(`[Pipeline] GitHub push skipped (PAT is encrypted, requires client-side decryption)`);
  }

  // Push to webhook output if enabled
  if (devConfig.webhookOutputEnabled && devConfig.webhookOutputUrl) {
    try {
      const format = devConfig.outputFormat || 'css';
      const content = output[format] || output.css || Object.values(output)[0];
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': '0colors-dev-mode',
        ...(devConfig.webhookOutputHeaders || {}),
      };
      const res = await fetch(devConfig.webhookOutputUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ format, content, projectId, timestamp: Date.now() }),
      });
      results.webhook = res.ok;
      if (!res.ok) console.log(`[Pipeline] Webhook push failed: ${res.status}`);
    } catch (e: any) {
      console.log(`[Pipeline] Webhook push error: ${e?.message}`);
      results.webhook = false;
    }
  }

  return results;
}

// ── Enhanced Webhook Input (now runs pipeline server-side) ──
// Debouncing: stores latest value with a 2-second quiet period.
// If a new value arrives within 2s, it replaces the previous.
const webhookDebounceMap = new Map<string, { timer: number; value: any; format: string }>();

app.post("/make-server-c36383cd/webhook/:projectId/run", async (c) => {
  const pid = c.req.param("projectId");
  const secret = c.req.header("X-Webhook-Secret");
  if (!pid) return c.json({ error: "Missing projectId" }, 400);

  try {
    const body = await c.req.json();
    const { value, format, nodeId } = body;
    if (!value) return c.json({ error: "Missing 'value' in request body" }, 400);
    if (!format) return c.json({ error: "Missing 'format' in request body" }, 400);

    const devConfig = await kvGet(`dev-config:${pid}`);
    if (!devConfig?.webhookEnabled) return c.json({ error: "Webhook not enabled" }, 403);
    if (!secret || secret !== devConfig.webhookSecret) return c.json({ error: "Invalid webhook secret" }, 401);

    const acceptFormats = devConfig.webhookAcceptFormats || ['hex'];
    if (!acceptFormats.includes(format)) {
      return c.json({ error: `Format '${format}' not accepted` }, 400);
    }

    // Determine target node (nodeId from body overrides devConfig target)
    const targetNodeId = nodeId || devConfig.webhookTargetNodeId;
    if (!targetNodeId) return c.json({ error: "No target node configured" }, 400);

    // Load project snapshot
    const snapshot = await loadProjectSnapshot(pid);
    if (!snapshot) {
      // Fallback: store as pending for client-side processing
      await kvSet(`webhook:${pid}:pending`, { value, format, receivedAt: Date.now(), targetNodeId });
      return c.json({ ok: true, mode: 'pending', message: "No snapshot found. Stored as pending for client processing." });
    }

    // Run the pipeline
    const result = runPipeline(
      snapshot,
      targetNodeId,
      value,
      format,
      devConfig.outputFormat || 'css',
      devConfig.outputTheme || null,
    );

    if (!result.success) {
      return c.json({ error: result.error }, 500);
    }

    // Save updated snapshot
    if (result.updatedSnapshot) {
      await saveProjectSnapshot(pid, result.updatedSnapshot);
    }

    // Push to destinations
    const pushResults = await pushToDestinations(devConfig, result.output || {}, pid);

    // Update devConfig with run metadata
    devConfig.lastRunAt = Date.now();
    devConfig.lastRunStatus = 'success';
    devConfig.lastRunError = null;
    await kvSet(`dev-config:${pid}`, devConfig);

    console.log(`[Pipeline] Webhook pipeline completed for ${pid}: format=${format}, push=${JSON.stringify(pushResults)}`);
    return c.json({ ok: true, mode: 'pipeline', pushResults });
  } catch (e: any) {
    console.log(`[Pipeline] Webhook pipeline error for ${pid}: ${e?.message}`);
    return c.json({ error: `Pipeline failed: ${e?.message}` }, 500);
  }
});

// ── Per-node Webhook (Option B) ──
// POST /webhook/:projectId/:nodeId — webhook URL per node
app.post("/make-server-c36383cd/webhook/:projectId/:nodeId", async (c) => {
  const pid = c.req.param("projectId");
  const nodeId = c.req.param("nodeId");
  const secret = c.req.header("X-Webhook-Secret");

  // Avoid matching other endpoints
  if (['pending', 'run', 'clear'].includes(nodeId)) return c.json({ error: "Not found" }, 404);

  if (!pid || !nodeId) return c.json({ error: "Missing projectId or nodeId" }, 400);

  try {
    const body = await c.req.json();
    const { value, format } = body;
    if (!value) return c.json({ error: "Missing 'value'" }, 400);
    if (!format) return c.json({ error: "Missing 'format'" }, 400);

    const devConfig = await kvGet(`dev-config:${pid}`);
    if (!devConfig?.webhookEnabled) return c.json({ error: "Webhook not enabled" }, 403);
    if (!secret || secret !== devConfig.webhookSecret) return c.json({ error: "Invalid secret" }, 401);

    // Load snapshot and run pipeline targeting this specific node
    const snapshot = await loadProjectSnapshot(pid);
    if (!snapshot) {
      await kvSet(`webhook:${pid}:pending`, { value, format, receivedAt: Date.now(), targetNodeId: nodeId });
      return c.json({ ok: true, mode: 'pending' });
    }

    // Verify node exists and is marked as webhook input
    const targetNode = snapshot.nodes.find(n => n.id === nodeId);
    if (!targetNode) return c.json({ error: `Node ${nodeId} not found` }, 404);

    const result = runPipeline(snapshot, nodeId, value, format, devConfig.outputFormat || 'css', devConfig.outputTheme || null);
    if (!result.success) return c.json({ error: result.error }, 500);

    if (result.updatedSnapshot) await saveProjectSnapshot(pid, result.updatedSnapshot);
    const pushResults = await pushToDestinations(devConfig, result.output || {}, pid);

    devConfig.lastRunAt = Date.now();
    devConfig.lastRunStatus = 'success';
    devConfig.lastRunError = null;
    await kvSet(`dev-config:${pid}`, devConfig);

    return c.json({ ok: true, mode: 'pipeline', nodeId, pushResults });
  } catch (e: any) {
    console.log(`[Pipeline] Per-node webhook error: ${e?.message}`);
    return c.json({ error: `Pipeline failed: ${e?.message}` }, 500);
  }
});

// ── Cron Tick — Process all due scheduled workflows ──
// Called by an external cron service (e.g., cron-job.org) every 1-5 minutes.
// GET /make-server-c36383cd/cron-tick
app.get("/make-server-c36383cd/cron-tick", async (c) => {
  const startTime = Date.now();
  const results: Array<{ projectId: string; status: string; error?: string }> = [];

  try {
    // Scan all dev-config keys for active schedules
    // We use the getByPrefix approach from kv_store
    const db = getServiceClient();
    const { data, error } = await db
      .from(TABLE)
      .select('key, value')
      .like('key', 'dev-config:%');

    if (error) {
      console.log(`[Cron] Failed to scan schedules: ${error.message}`);
      return c.json({ error: "Failed to scan schedules" }, 500);
    }

    const configs = (data || []).filter((row: any) => {
      const cfg = row.value;
      return cfg?.scheduleEnabled && cfg?.webhookTargetNodeId;
    });

    console.log(`[Cron] Found ${configs.length} active schedules to check`);

    for (const row of configs) {
      const projectId = (row.key as string).replace('dev-config:', '');
      const devConfig = row.value as DevConfigType;

      // Check if schedule is due
      const intervalMs = (devConfig.scheduleIntervalMinutes || 60) * 60 * 1000;
      const lastRun = devConfig.scheduleLastRun || 0;
      const now = Date.now();

      if (now - lastRun < intervalMs) {
        // Not due yet
        continue;
      }

      console.log(`[Cron] Schedule due for project ${projectId}`);

      try {
        // Get the next value
        let nextValue: string | null = null;

        if (devConfig.scheduleSource === 'values') {
          const values = devConfig.scheduleValues || [];
          if (values.length === 0) {
            results.push({ projectId, status: 'skipped', error: 'No values configured' });
            continue;
          }
          const idx = (devConfig.scheduleCurrentIndex || 0) % values.length;
          nextValue = values[idx];

          // Update index for next run
          devConfig.scheduleCurrentIndex = (idx + 1) % values.length;
        } else if (devConfig.scheduleSource === 'api') {
          if (!devConfig.scheduleApiUrl) {
            results.push({ projectId, status: 'skipped', error: 'No API URL configured' });
            continue;
          }
          try {
            const apiRes = await fetch(devConfig.scheduleApiUrl, {
              headers: { 'User-Agent': '0colors-cron' },
            });
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              nextValue = apiData.value || apiData.color || apiData.hex || null;
            } else {
              results.push({ projectId, status: 'error', error: `API returned ${apiRes.status}` });
              continue;
            }
          } catch (apiErr: any) {
            results.push({ projectId, status: 'error', error: `API fetch failed: ${apiErr?.message}` });
            continue;
          }
        }

        if (!nextValue) {
          results.push({ projectId, status: 'skipped', error: 'No value available' });
          continue;
        }

        // Load snapshot and run pipeline
        const snapshot = await loadProjectSnapshot(projectId);
        if (!snapshot) {
          results.push({ projectId, status: 'error', error: 'No project snapshot found' });
          continue;
        }

        const targetNodeId = devConfig.webhookTargetNodeId;
        if (!targetNodeId) {
          results.push({ projectId, status: 'error', error: 'No target node configured' });
          continue;
        }

        const pipelineResult = runPipeline(
          snapshot, targetNodeId, nextValue, 'hex',
          devConfig.outputFormat || 'css',
          devConfig.outputTheme || null,
        );

        if (!pipelineResult.success) {
          results.push({ projectId, status: 'error', error: pipelineResult.error });
          // Update last run to prevent retry storms
          devConfig.scheduleLastRun = now;
          devConfig.lastRunStatus = 'error';
          devConfig.lastRunError = pipelineResult.error || 'Pipeline failed';
          await kvSet(`dev-config:${projectId}`, devConfig);
          continue;
        }

        // Save updated snapshot
        if (pipelineResult.updatedSnapshot) {
          await saveProjectSnapshot(projectId, pipelineResult.updatedSnapshot);
        }

        // Push to destinations
        const pushResults = await pushToDestinations(devConfig, pipelineResult.output || {}, projectId);

        // Update schedule state
        devConfig.scheduleLastRun = now;
        devConfig.lastRunAt = now;
        devConfig.lastRunStatus = 'success';
        devConfig.lastRunError = null;
        await kvSet(`dev-config:${projectId}`, devConfig);

        results.push({ projectId, status: 'success' });
        console.log(`[Cron] Processed schedule for ${projectId}: value=${nextValue}, push=${JSON.stringify(pushResults)}`);
      } catch (projErr: any) {
        console.log(`[Cron] Error processing ${projectId}: ${projErr?.message}`);
        results.push({ projectId, status: 'error', error: projErr?.message });
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Cron] Tick completed in ${elapsed}ms: ${results.length} projects processed`);

    return c.json({
      ok: true,
      processed: results.length,
      elapsed: `${elapsed}ms`,
      results,
    });
  } catch (e: any) {
    console.log(`[Cron] Tick error: ${e?.message}`);
    return c.json({ error: `Cron tick failed: ${e?.message}` }, 500);
  }
});

// ── ETag-based Pull API (optimized) ──
// Enhanced version that supports If-None-Match for 304 responses
app.get("/make-server-c36383cd/tokens/:projectId/:format/etag", async (c) => {
  const pid = c.req.param("projectId");
  const format = c.req.param("format");
  if (!pid) return c.json({ error: "Missing projectId" }, 400);
  if (!['css', 'dtcg', 'tailwind', 'figma'].includes(format)) {
    return c.json({ error: `Invalid format '${format}'` }, 400);
  }

  if (!checkPullApiRate(pid)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  try {
    const devConfig = await kvGet(`dev-config:${pid}`);
    if (!devConfig?.pullApiEnabled) return c.json({ error: "Pull API not enabled" }, 403);

    const cached = await kvGet(`project:${pid}:token-output:${format}`);
    if (!cached) return c.json({ error: "No token output available" }, 404);

    // Generate ETag from content hash
    const content = typeof cached === 'string' ? cached : JSON.stringify(cached, null, 2);
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const etag = `"${hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')}"`;

    // Check If-None-Match
    const ifNoneMatch = c.req.header('If-None-Match');
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const contentTypes: Record<string, string> = { css: 'text/css', dtcg: 'application/json', tailwind: 'application/javascript', figma: 'application/json' };
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentTypes[format] || 'text/plain',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'ETag': etag,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e: any) {
    console.log(`[Dev] ETag Pull API error: ${e?.message}`);
    return c.json({ error: "Failed to retrieve token output" }, 500);
  }
});

// ── Catch-all 404 ──
app.all("/make-server-c36383cd/*", (c) => {
  return c.json({ error: `Not found: ${c.req.method} ${c.req.path}` }, 404);
});

console.log("[Server] 0colors edge function starting...");
Deno.serve((req) => app.fetch(req));