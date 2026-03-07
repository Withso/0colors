# 0colors Figma Plugin - Implementation Guide for AI Agent

## What This Document Is

A complete, self-contained specification for building a Figma plugin that syncs design tokens from the 0colors web app into Figma Variables. The 0colors backend already exposes two REST endpoints specifically for this plugin. The plugin is a **read-only consumer** - it fetches pre-computed tokens from the server and creates/updates Figma Variables. It does NOT write back to the server.

---

## Answer: Do You Need Supabase Integration in the Plugin?

**No. You do NOT integrate Supabase into the plugin.** The plugin talks to the 0colors REST API over plain HTTPS. Supabase is an implementation detail hidden behind the server. The plugin only needs:

1. The **server base URL** (hardcoded constant).
2. The **Supabase anon key** (hardcoded constant, used as gateway auth in the `Authorization` header).
3. The **user's access token** (obtained by having the user sign in via email/password against the Supabase Auth endpoint, then stored in `figma.clientStorage`).

The plugin never imports `@supabase/supabase-js`. All communication is `fetch()` calls.

---

## Architecture Overview

```
[Figma Plugin UI]  ──fetch()──>  [0colors Supabase Edge Function]  ──reads──>  [KV Store]
     |                                                                              ^
     |                                                                              |
     v                                                                   [0colors Web App]
[Figma Plugin Sandbox]                                                   writes computed tokens
     |                                                                   on every save/sync
     v
[Figma Variables API]
  - createVariable()
  - setValueForMode()
```

**Data flow:**
1. User designs tokens in the 0colors web app.
2. Web app computes a `ProjectComputedTokens` snapshot (all visibility/filtering/resolution already applied).
3. Web app syncs snapshot to Supabase cloud (includes `computedTokens` field).
4. Figma plugin authenticates, fetches computed tokens via REST.
5. Plugin maps each `ComputedToken` to a Figma Variable.

---

## Server Constants

```typescript
const SERVER_BASE = "https://api-server-production-0064.up.railway.app/api";
const PUBLIC_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YXllcGRqeHZrZGVpY3pqemZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTMxNTUsImV4cCI6MjA4NzU4OTE1NX0.3mAW-M5p2GxU0wHO6PYQS-ihlaJYdhWOzWL0WtiCFaY";
```

---

## Authentication Flow

The server uses a **dual-header auth scheme**:

| Header | Value | Purpose |
|--------|-------|---------|
| `Authorization` | `Bearer <PUBLIC_ANON_KEY>` | Gateway auth (always the same, never expires) |
| `X-User-Token` | `Bearer <user_access_token>` | User identity (JWT from Supabase Auth) |

### Step 1: Sign In (get access token)

The plugin must implement a simple email/password sign-in form. Call the Supabase Auth REST API directly (no SDK needed):

```
POST https://qvayepdjxvkdeiczjzfj.supabase.co/auth/v1/token?grant_type=password
Headers:
  apikey: <PUBLIC_ANON_KEY>
  Content-Type: application/json
Body:
  { "email": "user@example.com", "password": "their-password" }
```

**Response (200):**
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "v1.MQ...",
  "expires_in": 3600,
  "token_type": "bearer",
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "user_metadata": { "name": "User Name" }
  }
}
```

**Store in plugin:**
```typescript
await figma.clientStorage.setAsync('0colors_access_token', data.access_token);
await figma.clientStorage.setAsync('0colors_refresh_token', data.refresh_token);
await figma.clientStorage.setAsync('0colors_user_email', data.user.email);
```

### Step 2: Token Refresh

Access tokens expire in 3600s. Refresh before expiry:

```
POST https://qvayepdjxvkdeiczjzfj.supabase.co/auth/v1/token?grant_type=refresh_token
Headers:
  apikey: <PUBLIC_ANON_KEY>
  Content-Type: application/json
Body:
  { "refresh_token": "<stored_refresh_token>" }
```

Returns the same shape as sign-in. Store the new tokens.

### Step 3: Make Authenticated API Calls

Every API call to the 0colors server uses BOTH headers:

```typescript
function makeHeaders(userAccessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${PUBLIC_ANON_KEY}`,
    'X-User-Token': userAccessToken,
  };
}
```

---

## API Endpoints (2 endpoints, both GET, both require auth)

### GET /figma-projects

Lists all cloud projects for the authenticated user. Use this for the project picker UI.
**Sample projects (`isSample`) and template projects (`isTemplate`) are automatically excluded server-side.** Only user-authored projects appear.

```
GET {SERVER_BASE}/figma-projects
Headers: makeHeaders(accessToken)
```

**Response (200):**
```json
{
  "projects": [
    {
      "projectId": "abc-123",
      "projectName": "My Design System",
      "hasComputedTokens": true,
      "computedAt": 1740000000000,
      "themes": [
        {
          "themeId": "theme-1",
          "themeName": "Light",
          "isPrimary": true,
          "tokenCount": 47
        },
        {
          "themeId": "theme-2",
          "themeName": "Dark",
          "isPrimary": false,
          "tokenCount": 47
        }
      ]
    }
  ]
}
```

**Error responses:** `401` (bad token), `500` (server error).

### GET /figma-tokens/:projectId

Fetches the full computed tokens for a specific project.

```
GET {SERVER_BASE}/figma-tokens/{projectId}
Headers: makeHeaders(accessToken)
```

**Response (200):**
```json
{
  "projectId": "abc-123",
  "projectName": "My Design System",
  "schemaVersion": 3,
  "computedAt": 1740000000000,
  "themes": [
    {
      "themeId": "theme-1",
      "themeName": "Light",
      "isPrimary": true,
      "tokens": [
        {
          "id": "tok-uuid-1",
          "name": "bg-primary",
          "variableName": "bg-primary",
          "type": "color",
          "groupId": "grp-1",
          "groupName": "Background",
          "pageId": "page-1",
          "pageName": "Colors",
          "resolvedValue": "hsl(220, 15%, 10%)",
          "rawHSL": { "h": 220, "s": 15, "l": 10, "a": 100 },
          "hex": "#161922",
          "hexWithAlpha": "#161922FF",
          "rgba": { "r": 0.086, "g": 0.098, "b": 0.133, "a": 1.0 },
          "colorSpace": "hsl",
          "isAlias": false,
          "sortOrder": 0,
          "figmaPath": "Colors/Background/bg-primary"
        },
        {
          "id": "tok-uuid-2",
          "name": "text-accent",
          "variableName": "text-accent",
          "type": "color",
          "groupId": "grp-2",
          "groupName": "Text",
          "pageId": "page-1",
          "pageName": "Colors",
          "resolvedValue": "var(--brand-blue)",
          "isAlias": true,
          "aliasOf": "brand-blue",
          "aliasOfId": "tok-uuid-99",
          "sortOrder": 3,
          "figmaPath": "Colors/Text/text-accent"
        },
        {
          "id": "tok-uuid-3",
          "name": "spacing-md",
          "variableName": "spacing-md",
          "type": "spacing",
          "groupId": null,
          "groupName": null,
          "pageId": "page-2",
          "pageName": "Spacing",
          "resolvedValue": "16px",
          "numericValue": 16,
          "unit": "px",
          "isAlias": false,
          "sortOrder": 1,
          "figmaPath": "Spacing/spacing-md"
        }
      ]
    }
  ]
}
```

**Error responses:** `401`, `403` (not owner), `404` (no project / no computed tokens).

---

## ComputedToken Schema (Complete Reference)

```typescript
interface ComputedToken {
  id: string;              // Original token UUID
  name: string;            // Display name (e.g. "bg-primary")
  variableName: string;    // kebab-case, no -- prefix (e.g. "bg-primary")
  type: 'color' | 'spacing' | 'radius' | 'fontSize' | 'lineHeight' | 'fontWeight' | 'shadow' | 'opacity';
  groupId: string | null;
  groupName: string | null;
  pageId: string;
  pageName: string;
  resolvedValue: string;   // CSS value string

  // COLOR tokens only:
  rawHSL?: { h: number; s: number; l: number; a: number }; // a is 0-100
  hex?: string;            // "#RRGGBB" (no alpha)
  hexWithAlpha?: string;   // "#RRGGBBAA" (8 chars)
  rgba?: { r: number; g: number; b: number; a: number };   // ALL 0-1 floats. USE THIS FOR FIGMA.

  // NON-COLOR tokens only:
  numericValue?: number;
  unit?: string;           // "px", "rem", etc.

  colorSpace?: string;     // "hsl", "oklch", "rgb", "hex"

  // Alias/reference:
  isAlias: boolean;
  aliasOf?: string;        // Referenced token's variableName
  aliasOfId?: string;      // Referenced token's id

  sortOrder?: number;

  // Rename tracking (populated when token was renamed since last computed snapshot):
  previousName?: string;           // Old token name before rename
  previousVariableName?: string;   // Old kebab-case variable name before rename

  // Pre-computed hierarchy path:
  figmaPath: string;               // "pageName/groupName/tokenName" or "pageName/tokenName"
}
```

---

## Mapping ComputedToken to Figma Variables

### Figma Variable Types

| ComputedToken.type | Figma VariableResolvedDataType |
|---|---|
| `color` | `COLOR` |
| `spacing`, `radius`, `fontSize` | `FLOAT` |
| `fontWeight`, `lineHeight`, `opacity` | `FLOAT` |
| `shadow` | Not supported by Figma Variables API (skip) |

### Collection Strategy

**One Figma Variable Collection per 0colors project.**

- Collection name = `projectName` (e.g. "My Design System")
- Each 0colors **theme** = one Figma **mode** within the collection
- Variable name = `token.figmaPath` — pre-computed by the server:
  - `pageName/groupName/tokenName` for grouped tokens
  - `pageName/tokenName` for ungrouped tokens

**Hierarchy in Figma:**
- Top-level folder = page name (e.g. "Colors", "Spacing")
- Sub-folder = group name (e.g. "Background", "Text")
- Variable = token name (e.g. "bg-primary")

### Creating Variables - Color Tokens

```typescript
// For each color ComputedToken:
const variable = figma.variables.createVariable(
  token.figmaPath,             // e.g. "Colors/Background/bg-primary"
  collection,
  'COLOR'
);

// Use the rgba field directly (it's already 0-1 floats)
variable.setValueForMode(modeId, {
  r: token.rgba.r,
  g: token.rgba.g,
  b: token.rgba.b,
  a: token.rgba.a,
});
```

### Creating Variables - Non-Color Tokens

```typescript
const variable = figma.variables.createVariable(
  token.figmaPath,             // e.g. "Spacing/spacing-md"
  collection,
  'FLOAT'
);

variable.setValueForMode(modeId, token.numericValue);
```

### Handling Aliases

When `token.isAlias === true`, the token references another token via `aliasOfId`.

```typescript
if (token.isAlias && token.aliasOfId) {
  // Find the referenced variable (must be created first)
  const referencedVariable = variableMap.get(token.aliasOfId);
  if (referencedVariable) {
    variable.setValueForMode(modeId,
      figma.variables.createVariableAlias(referencedVariable)
    );
  }
}
```

**Important:** Create non-alias tokens FIRST, then alias tokens. This ensures referenced variables exist.

### Handling Groups (Hierarchy)

Figma Variables support `/` in names for folder hierarchy. Use `token.figmaPath` directly — it is pre-computed by the server with the correct page/group/token hierarchy:

```typescript
function getVariableName(token: ComputedToken): string {
  // figmaPath is pre-computed: "pageName/groupName/tokenName" or "pageName/tokenName"
  return token.figmaPath;
}
```

---

## Full Sync Algorithm

```
1. Fetch /figma-projects -> show project picker
2. User selects project
3. Fetch /figma-tokens/{projectId}
4. Load stored ID mapping from figma.clientStorage (tokenId -> figmaVariableId)
5. Find or create ONE Figma VariableCollection named after projectName
6. For each theme in response:
   a. Find or create a Mode for this theme within the collection
   b. Sort tokens: non-aliases first, then aliases
   c. For each token:
      * Match to existing Figma Variable by stored tokenId mapping (PRIMARY)
      * If not found by ID, fall back to matching by figmaPath (SECONDARY)
      * If matched: update name (using figmaPath) + value (handles renames!)
      * If not matched: create new Variable using token.figmaPath as the name
      * Store the mapping: tokenId -> variable.id
      * Set value for mode:
        - COLOR: use token.rgba
        - FLOAT: use token.numericValue
        - ALIAS: use figma.variables.createVariableAlias()
7. Remove Variables that no longer have a matching tokenId in computed tokens
8. Save updated ID mapping to figma.clientStorage
```

---

## CRITICAL: Why Match by ID, Not Name

Token names change when:
- **Palette auto-rename:** User changes a palette's hue, auto-renaming changes "blue/1" to "purple/1"
- **Manual rename:** User renames a token or palette in the UI
- **Palette naming pattern change:** User switches from "100-900" to "a-z"

In all cases, the **token `id` is stable** and never changes. The `name` and `variableName` change.
If you match by name, renamed tokens appear as NEW tokens (duplicates). **Match by `id` instead.**

### ID-Based Matching Implementation

```typescript
// Persistent storage key for the token-to-variable mapping
const MAPPING_KEY = '0colors_token_variable_map';

interface TokenVariableMap {
  [tokenId: string]: {
    figmaVariableId: string;
    collectionId: string;
    lastName: string;
  };
}

// Load on plugin start:
const storedMap: TokenVariableMap =
  await figma.clientStorage.getAsync(MAPPING_KEY) || {};

// During sync, for each token:
function findOrCreateVariable(
  token: ComputedToken,
  collection: VariableCollection,
  modeId: string,
  storedMap: TokenVariableMap,
  figmaType: VariableResolvedDataType,
): Variable {
  let variable: Variable | null = null;

  // 1. Try to find by stored ID mapping (handles renames)
  const mapping = storedMap[token.id];
  if (mapping?.figmaVariableId) {
    try {
      variable = figma.variables.getVariableById(mapping.figmaVariableId);
    } catch { /* variable was deleted in Figma */ }
  }

  // 2. Fall back to name matching (first-time sync or mapping lost)
  if (!variable) {
    const varName = getVariableName(token);
    const existing = figma.variables.getLocalVariables(figmaType);
    variable = existing.find(v =>
      v.variableCollectionId === collection.id && v.name === varName
    ) || null;
  }

  // 3. Create if not found
  if (!variable) {
    variable = figma.variables.createVariable(
      getVariableName(token),
      collection,
      figmaType,
    );
  }

  // 4. Always update the name (handles renames!)
  const newName = getVariableName(token);
  if (variable.name !== newName) {
    variable.name = newName;
  }

  // 5. Store the mapping for next sync
  storedMap[token.id] = {
    figmaVariableId: variable.id,
    collectionId: collection.id,
    lastName: token.name,
  };

  return variable;
}

// After sync, save the mapping:
await figma.clientStorage.setAsync(MAPPING_KEY, storedMap);
```

### Using the `renames` Array (Convenience Helper)

The API response now includes a `renames` array listing tokens whose names changed since
the last computed snapshot. Each entry has:

```typescript
// Response shape:
{
  renames: [
    {
      tokenId: "tok-uuid-1",
      previousName: "blue/100",
      previousVariableName: "blue/100",
      currentName: "purple/100",
      currentVariableName: "purple/100"
    }
  ]
}
```

Each `ComputedToken` also includes `previousName` and `previousVariableName` fields when
a rename was detected. This is a convenience for plugins that haven't yet implemented
full ID-based matching. **Note:** `renames` only covers the most recent rename. For
robust handling across multiple renames, use the ID-based mapping above.

### Alternative: Full Re-Apply Strategy

If ID-based matching is too complex, use a simpler "delete and recreate" approach:

```typescript
async function fullReApplySync(themes: ThemeComputedTokens[]) {
  // 1. Find all 0colors-managed collections (by stored IDs)
  const managedIds: string[] =
    await figma.clientStorage.getAsync('0colors_collections') || [];

  // 2. Delete all variables in managed collections
  for (const collId of managedIds) {
    const coll = figma.variables.getVariableCollectionById(collId);
    if (!coll) continue;
    for (const varId of coll.variableIds) {
      const v = figma.variables.getVariableById(varId);
      if (v) v.remove();
    }
    coll.remove();
  }

  // 3. Recreate everything from scratch
  const newCollectionIds: string[] = [];
  // ... create collections, variables, set values ...

  // 4. Store new collection IDs
  await figma.clientStorage.setAsync('0colors_collections', newCollectionIds);
}
```

**Pros:** Simple, always correct, no stale variables.
**Cons:** Variables get new Figma IDs (breaks Figma-side style references), slightly slower.

---

## Plugin File Structure

```
figma-plugin/
  manifest.json
  code.ts          # Plugin sandbox (Figma API access)
  ui.html          # Plugin UI (iframe)
  ui.ts            # UI logic (auth, API calls, message passing)
```

### manifest.json

```json
{
  "name": "0colors",
  "id": "0colors-figma-plugin",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "networkAccess": {
    "allowedDomains": ["https://qvayepdjxvkdeiczjzfj.supabase.co"]
  }
}
```

### Communication Pattern

The Figma plugin sandbox (`code.ts`) cannot make network requests. The UI iframe (`ui.html`) handles all fetch calls and sends data to the sandbox via `postMessage`:

```
[ui.html]                          [code.ts]
  |                                   |
  |-- fetch /figma-projects --------->|
  |<-- project list ------------------|
  |                                   |
  | (user picks project)              |
  |                                   |
  |-- fetch /figma-tokens/xyz ------->|
  |<-- computed tokens ---------------|
  |                                   |
  |-- postMessage({type:'sync',       |
  |     tokens, themes}) ------------>|
  |                                   |-- figma.variables.createVariable()
  |                                   |-- variable.setValueForMode()
  |<-- postMessage({type:'done'}) ----|
```

### code.ts (sandbox)

```typescript
figma.showUI(__html__, { width: 400, height: 500 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'get-stored-token') {
    const token = await figma.clientStorage.getAsync('0colors_access_token');
    const refresh = await figma.clientStorage.getAsync('0colors_refresh_token');
    figma.ui.postMessage({ type: 'stored-token', token, refresh });
  }

  if (msg.type === 'store-token') {
    await figma.clientStorage.setAsync('0colors_access_token', msg.token);
    await figma.clientStorage.setAsync('0colors_refresh_token', msg.refresh);
    figma.ui.postMessage({ type: 'token-stored' });
  }

  if (msg.type === 'sync-tokens') {
    const { themes } = msg;
    try {
      const result = syncToFigmaVariables(themes);
      figma.ui.postMessage({ type: 'sync-complete', ...result });
    } catch (e) {
      figma.ui.postMessage({ type: 'sync-error', error: String(e) });
    }
  }
};

function syncToFigmaVariables(themes: ThemeComputedTokens[]) {
  // Implementation using Figma Variables API
  // See "Full Sync Algorithm" above
}
```

### ui.ts (network + UI)

```typescript
// All fetch calls happen here
// All UI rendering happens here
// Sends token data to code.ts via parent.postMessage()

parent.postMessage({ pluginMessage: { type: 'sync-tokens', themes } }, '*');
```

---

## Edge Cases to Handle

1. **Token not yet computed:** If `/figma-tokens/:id` returns 404 with `"Computed tokens not yet generated"`, show: "Open this project in 0colors and save it first."

2. **Expired access token:** If any API returns 401, try refreshing the token. If refresh also fails, show sign-in form.

3. **Alias target not found:** If `aliasOfId` references a token not in the current theme's list, fall back to setting the resolved color value directly (not an alias).

4. **Shadow tokens:** Skip them. Figma Variables API does not support shadow/effect variables.

5. **Multiple pages:** All pages are part of a single Variable Collection per project. Pages appear as top-level groups (folders) in Figma, with groups within pages as sub-groups. Use `token.figmaPath` for the variable name — it automatically encodes the page/group/token hierarchy.

6. **Variable name conflicts:** Use `token.figmaPath` as the canonical variable name. If a variable with that name already exists in the collection, update it instead of creating a duplicate.

7. **Re-sync (update existing):** On subsequent syncs, **match existing variables by token `id`** (stored in `figma.clientStorage`), NOT by name. Update name + value. This correctly handles palette auto-renames and manual token renames. See "CRITICAL: Why Match by ID, Not Name" section above.

8. **Token renames:** The API response includes a `renames` array and each renamed token has `previousName`/`previousVariableName` fields. Use ID-based matching for robustness, or use `renames` as a convenience fallback.

---

## What You (the Human) Need to Do

1. **Create a new Figma plugin project** (outside this codebase). Use `npx create-figma-plugin` or set up manually with the file structure above.

2. **Give the AI agent this document** as the complete spec. The AI agent does NOT need access to the 0colors Supabase account, dashboard, or database. It only needs:
   - This document (the API contract)
   - The server base URL and anon key (listed above)
   - A test user's email/password to verify auth works

3. **No Supabase integration needed in the plugin.** The plugin is a plain REST API client. No Supabase SDK, no Supabase project linking, no environment variables beyond the two hardcoded constants.

4. **Test by:**
   - Creating a project in 0colors web app
   - Adding some tokens and assigning them to nodes
   - Enabling cloud sync (sign in, register project as cloud)
   - Waiting for sync (or triggering it manually)
   - Running the Figma plugin and verifying variables appear

---

## Quick Reference: Complete Auth + Fetch Example

```typescript
const SERVER_BASE = "https://api-server-production-0064.up.railway.app/api";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2YXllcGRqeHZrZGVpY3pqemZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTMxNTUsImV4cCI6MjA4NzU4OTE1NX0.3mAW-M5p2GxU0wHO6PYQS-ihlaJYdhWOzWL0WtiCFaY";
const AUTH_URL = "https://qvayepdjxvkdeiczjzfj.supabase.co/auth/v1";

// Sign in
async function signIn(email: string, password: string) {
  const res = await fetch(`${AUTH_URL}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign in failed: ${res.status}`);
  return res.json(); // { access_token, refresh_token, user, ... }
}

// Refresh token
async function refreshToken(refreshToken: string) {
  const res = await fetch(`${AUTH_URL}/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return res.json();
}

// Fetch projects
async function fetchProjects(accessToken: string) {
  const res = await fetch(`${SERVER_BASE}/figma-projects`, {
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'X-User-Token': accessToken,
    },
  });
  if (!res.ok) throw new Error(`Fetch projects failed: ${res.status}`);
  return res.json(); // { projects: [...] }
}

// Fetch computed tokens
async function fetchTokens(projectId: string, accessToken: string) {
  const res = await fetch(`${SERVER_BASE}/figma-tokens/${projectId}`, {
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'X-User-Token': accessToken,
    },
  });
  if (!res.ok) throw new Error(`Fetch tokens failed: ${res.status}`);
  return res.json(); // { projectId, projectName, themes: [...], computedAt }
}
```