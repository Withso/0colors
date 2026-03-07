# Backend AI Prompt: Community Feature — Full Implementation + Deep Scan

## IMPORTANT: Read This First

This prompt has TWO parts:
1. **Part A**: Implement the Community API routes (new feature)
2. **Part B**: Deep-scan the ENTIRE existing backend codebase for bugs, missing error handling, edge cases, stale code, and correctness issues — then fix them

---

# PART A: Community Feature — New API Routes

## Context

The 0colors app has a **Community** feature on the frontend. Users can:
1. **Publish** any cloud project to a public community gallery
2. **Browse** all published projects at `/community`
3. **View** any published project in read-only mode at `/community/:slug`
4. **Remix** (duplicate) published projects if the author allows it
5. **Update/Unpublish** their published projects

The frontend makes API calls to `SERVER_BASE` (the Railway Hono backend) for all community operations. The frontend API client (`community-api.ts`) calls these endpoints:

```typescript
// All use Authorization: Bearer ${publicAnonKey} as gateway auth
// Auth-required routes also send X-User-Token: <JWT> for user identity

POST   ${SERVER_BASE}/community/publish          // Auth required
PUT    ${SERVER_BASE}/community/${projectId}      // Auth required
DELETE ${SERVER_BASE}/community/${projectId}      // Auth required
GET    ${SERVER_BASE}/community                   // Public (no auth)
GET    ${SERVER_BASE}/community/project/${slug}   // Public (no auth)
GET    ${SERVER_BASE}/community/status/${projectId} // Auth required
GET    ${SERVER_BASE}/community/thumbnail/${projectId} // Public
```

---

## New Routes to Add

Add community routes. If your codebase uses a routes directory pattern, create `src/routes/community.ts` and mount it on the main Hono app. Otherwise add the routes directly to the main server file.

### 1. `POST /api/community/publish` (Auth Required)

Publishes a project to the community.

**Request body:**
```json
{
  "projectId": "string — the user's cloud project ID",
  "title": "string — display title (2-80 chars)",
  "description": "string — optional description (0-500 chars)",
  "allowRemix": true,
  "snapshot": { /* full ProjectSnapshot object — same format as cloud sync */ },
  "thumbnailDataUrl": "data:image/webp;base64,... — base64 WebP thumbnail"
}
```

**Logic:**
1. Verify user auth (extract userId from JWT via `X-User-Token` header)
2. Validate inputs: title must be 2-80 chars, description max 500
3. Check the user owns this `projectId` — verify `cloud:project:{userId}:{projectId}` exists in KV
4. Generate a URL-safe slug from the title. If slug already taken by a DIFFERENT project, append `-2`, `-3`, etc.
5. Count nodes and tokens from the snapshot for metadata
6. Store in KV (4 keys):
   - `community:meta:{projectId}` → metadata JSON (see below)
   - `community:snapshot:{projectId}` → full snapshot JSON
   - `community:thumbnail:{projectId}` → the raw base64 data (strip `data:image/webp;base64,` prefix)
   - `community:slug:{slug}` → `{ projectId }` (reverse lookup)
7. Return `{ slug: "generated-slug" }`

**Metadata format** (stored at `community:meta:{projectId}`):
```json
{
  "projectId": "abc123",
  "slug": "my-color-palette",
  "title": "My Color Palette",
  "description": "A warm palette for...",
  "allowRemix": true,
  "userId": "user-uuid",
  "userName": "John Doe",
  "publishedAt": "2026-03-05T10:00:00.000Z",
  "updatedAt": "2026-03-05T10:00:00.000Z",
  "nodeCount": 12,
  "tokenCount": 45
}
```

**Getting userName**: Use Supabase admin API to get the user's display name:
```typescript
const { data: { user } } = await supabase.auth.getUser(userToken);
const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Anonymous';
```

### 2. `PUT /api/community/:projectId` (Auth Required)

Updates an existing community listing.

**Request body (all fields optional):**
```json
{
  "title": "string",
  "description": "string",
  "allowRemix": true,
  "snapshot": { /* updated ProjectSnapshot */ },
  "thumbnailDataUrl": "data:image/webp;base64,..."
}
```

**Logic:**
1. Verify auth + ownership (userId in meta must match requester)
2. Load existing meta from `community:meta:{projectId}`
3. If title changed → regenerate slug. If new slug conflicts with different project, add suffix. Delete old `community:slug:{oldSlug}`, create new `community:slug:{newSlug}`
4. Merge updates into meta, set `updatedAt` to now
5. If snapshot provided → overwrite `community:snapshot:{projectId}`, recalculate nodeCount/tokenCount
6. If thumbnail provided → overwrite `community:thumbnail:{projectId}`
7. Return `{ ok: true, slug: "current-slug" }`

### 3. `DELETE /api/community/:projectId` (Auth Required)

Unpublishes a project.

**Logic:**
1. Verify auth + ownership
2. Load meta to get the slug
3. Delete ALL 4 KV keys: `community:meta:{projectId}`, `community:snapshot:{projectId}`, `community:thumbnail:{projectId}`, `community:slug:{slug}`
4. Return `{ ok: true }`

### 4. `GET /api/community` (Public — No Auth Required)

Lists all published community projects for the browse page.

**Logic:**
1. Query all KV keys with prefix `community:meta:` (use `getByPrefix` or direct SQL: `SELECT key, value FROM kv_store WHERE key LIKE 'community:meta:%' ORDER BY value->>'publishedAt' DESC`)
2. For each meta entry, construct the thumbnail URL as `${SERVER_BASE}/api/community/thumbnail/${projectId}` (or null if no thumbnail exists)
3. Return:
```json
{
  "projects": [
    {
      "projectId": "...",
      "slug": "...",
      "title": "...",
      "description": "...",
      "allowRemix": true,
      "thumbnailUrl": "https://.../api/community/thumbnail/abc123",
      "userName": "...",
      "userId": "...",
      "publishedAt": "2026-03-05T10:00:00.000Z",
      "updatedAt": "2026-03-05T10:00:00.000Z",
      "nodeCount": 12,
      "tokenCount": 45
    }
  ]
}
```

**CRITICAL**: Do NOT return snapshot data in the list — only metadata. Snapshots can be 100KB–2MB each.

### 5. `GET /api/community/project/:slug` (Public — No Auth Required)

Fetches a single published project with its full snapshot for the read-only viewer.

**Logic:**
1. Look up `community:slug:{slug}` to get `projectId`
2. If not found → 404
3. Load `community:meta:{projectId}` and `community:snapshot:{projectId}`
4. Return combined data:
```json
{
  "projectId": "...",
  "slug": "...",
  "title": "...",
  "description": "...",
  "allowRemix": true,
  "thumbnailUrl": "...",
  "userName": "...",
  "userId": "...",
  "publishedAt": "...",
  "updatedAt": "...",
  "nodeCount": 12,
  "tokenCount": 45,
  "snapshot": { /* full ProjectSnapshot */ }
}
```

### 6. `GET /api/community/status/:projectId` (Auth Required)

Checks if a specific project is published. Used by the Publish popup to detect existing listings.

**Logic:**
1. Verify auth (user must be logged in)
2. Load `community:meta:{projectId}`
3. If exists AND userId matches → return the full meta object (same shape as in the list, with thumbnailUrl)
4. If not found → return 404 `{ error: "Not published" }`
5. If userId doesn't match → return 404 (don't leak that it's published by someone else)

### 7. `GET /api/community/thumbnail/:projectId` (Public)

Serves the thumbnail image binary.

**Logic:**
1. Load `community:thumbnail:{projectId}` from KV
2. If not found → 404
3. The stored value is a base64 string (without the `data:image/webp;base64,` prefix)
4. Decode the base64 to a binary buffer
5. Return with headers:
   - `Content-Type: image/webp`
   - `Cache-Control: public, max-age=3600` (1 hour)
6. If the stored value includes the `data:` prefix, strip it before decoding

---

## Slug Generation Function

```typescript
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')          // Trim leading/trailing hyphens
    || 'untitled';
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
      // Safety valve — add random suffix
      slug = `${base}-${Date.now().toString(36)}`;
      break;
    }
  }
  return slug;
}
```

---

## Auth Pattern

Follow the EXISTING auth pattern in the codebase. The frontend sends two headers:
```
Authorization: Bearer <publicAnonKey>     // Gateway auth (always present)
X-User-Token: <user-JWT>                   // User auth (present for auth-required routes)
```

For auth-required routes:
```typescript
const userToken = c.req.header('X-User-Token');
if (!userToken) return c.json({ error: 'Unauthorized — no user token' }, 401);

const { data: { user }, error } = await supabase.auth.getUser(userToken);
if (error || !user) return c.json({ error: 'Invalid or expired token' }, 401);

const userId = user.id;
const userName = user.user_metadata?.name || user.email?.split('@')[0] || 'Anonymous';
```

---

## KV Key Summary

| Key Pattern | Value | Purpose |
|---|---|---|
| `community:meta:{projectId}` | Project metadata JSON | Published project info (searchable by prefix) |
| `community:snapshot:{projectId}` | Full ProjectSnapshot JSON | Project data for read-only viewing |
| `community:thumbnail:{projectId}` | Raw base64 string | Thumbnail image data |
| `community:slug:{slug}` | `{ projectId: "..." }` | Slug → projectId reverse lookup |

---

## Ownership Verification

To verify the user owns a project, check that `cloud:project:{userId}:{projectId}` exists in the KV store. This is the key pattern used by the existing cloud sync system.

**IMPORTANT**: Only the project owner can publish/update/unpublish their project.

---

## CORS

Ensure the community routes have the **same CORS configuration** as all existing routes. The frontend origin is `https://0colors.figma.site`. Check that your CORS middleware allows this origin, plus any localhost origins used in development.

---

## Error Handling

- 400 for validation errors (bad title length, missing fields)
- 401 for missing or invalid auth
- 403 for ownership mismatch
- 404 for not found
- 500 for server errors
- Always return JSON: `{ error: "descriptive message" }`
- Log errors server-side via `console.log` for debugging

---

## Performance Notes

- `GET /api/community` list endpoint: consider caching the result in memory with a 60-second TTL to avoid hitting the DB on every page view
- Thumbnail serving should include `Cache-Control: public, max-age=3600`
- Snapshot payloads can be 100KB–2MB. Consider enabling gzip/brotli compression if not already configured
- Sort community list by `publishedAt` DESC (newest first)

---

# PART B: Deep-Scan & Verify Entire Backend Codebase

Now that the community routes are implemented, perform a THOROUGH deep-scan of the ENTIRE backend codebase. Check every file, every route, every function. Here is your checklist:

## 1. Route Correctness Audit

For EVERY route in the server:
- [ ] Does it handle errors properly? (try/catch, error responses)
- [ ] Does it validate input? (missing fields, wrong types, too long, etc.)
- [ ] Does it return proper HTTP status codes?
- [ ] Does it have proper auth checks where needed?
- [ ] Are there any routes that accept user input without sanitization?
- [ ] Are there any routes that leak sensitive data (e.g., other users' data)?

## 2. KV Store Consistency

- [ ] Are all KV keys properly prefixed and namespaced?
- [ ] When deleting a project, are ALL related KV keys cleaned up? (e.g., if a cloud project is deleted, is its community listing also cleaned up?)
- [ ] Are there any orphaned KV entries possible? (e.g., slug points to a deleted project)
- [ ] Is there a race condition when two users publish projects with the same slug simultaneously?

## 3. Auth Security

- [ ] Is the `SUPABASE_SERVICE_ROLE_KEY` used ONLY server-side, never leaked in responses?
- [ ] Are auth tokens validated correctly using `supabase.auth.getUser()`?
- [ ] Are there any routes that should require auth but don't?
- [ ] Are there any routes that return data belonging to other users?
- [ ] Is the `X-User-Token` header checked for all protected routes?

## 4. Cloud Sync Routes

- [ ] Do project save/load routes properly scope data to the authenticated user?
- [ ] Is there proper error handling when the database is unreachable?
- [ ] Are timestamps handled consistently (ISO strings, UTC)?
- [ ] Can a user overwrite another user's project data?

## 5. Error Handling & Logging

- [ ] Does every route have a try/catch with detailed error logging?
- [ ] Are error messages descriptive enough for debugging?
- [ ] Are stack traces logged server-side but NOT sent to the client?
- [ ] Is there a global error handler / middleware?

## 6. CORS & Headers

- [ ] Is CORS configured to allow the production origin (`https://0colors.figma.site`)?
- [ ] Are OPTIONS preflight requests handled?
- [ ] Is `Content-Type` set correctly on all responses?
- [ ] Are cache headers appropriate for each route?

## 7. Database / KV Performance

- [ ] Are there any N+1 query patterns? (e.g., fetching 50 project metas one by one instead of batch)
- [ ] Are large payloads stored efficiently?
- [ ] Is there a risk of the KV table growing unboundedly?

## 8. Template Sync Routes

If you have cloud template routes:
- [ ] Can non-admin users create/modify templates?
- [ ] Are template reads public (needed for the sample project flow)?
- [ ] Is the admin check robust (using `isAdmin` from user metadata)?

## 9. General Code Quality

- [ ] Are there any unused imports or dead code?
- [ ] Are there any TODO/FIXME comments that need addressing?
- [ ] Are environment variables properly validated on startup?
- [ ] Is the server gracefully handling startup failures?
- [ ] Are there any hardcoded secrets or URLs?

## 10. Community Feature Specific Checks

After implementing the community routes:
- [ ] Test: Can a user publish a project they don't own? (should fail)
- [ ] Test: Can a user update someone else's community listing? (should fail)
- [ ] Test: Can two users publish projects with the same title? (should generate unique slugs)
- [ ] Test: Is the snapshot properly returned with all required fields?
- [ ] Test: Does the thumbnail endpoint return binary data with correct Content-Type?
- [ ] Test: Does the list endpoint work when there are 0 published projects?
- [ ] Test: Does unpublishing clean up ALL 4 KV keys?
- [ ] Test: Is the slug reverse lookup updated when the title changes?

---

## Action Required

1. Implement all 7 community routes from Part A
2. Run through EVERY check in Part B
3. Fix any issues found
4. Report what you found and fixed

Do NOT skip Part B. The deep-scan is critical for production readiness.
