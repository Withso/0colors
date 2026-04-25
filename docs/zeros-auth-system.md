# Zeros Design — Authentication System Documentation

## Overview

The Zeros Design brand uses a **centralized authentication system** shared across all products (0colors, 0research, 0kit, Zero Docs, etc.). A user creates **one Zeros account** and uses it across all products. The system has four layers:

| Layer | Project | Role |
|---|---|---|
| **Auth Provider** | Supabase (shared project `qvayepdjxvkdeiczjzfj`) | JWT tokens, OAuth, session management |
| **Account Service** | 0accounts (`accounts.zeros.design`) | User profiles, product access, admin roles |
| **Shared Package** | 0shared (`@0zerosdesign/auth-client`) | Reusable auth client for all products |
| **Product App** | 0colors, 0research, etc. | Consumes the auth-client package |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    SUPABASE AUTH PROJECT                           │
│              Project: qvayepdjxvkdeiczjzfj                        │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ Google OAuth  │  │ Email/Pass   │  │ JWT Token Store    │     │
│  │ Provider      │  │ Auth         │  │ (auto-refresh)     │     │
│  └──────────────┘  └──────────────┘  └────────────────────┘     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  0accounts Database (migrated from Railway, Apr 2026)    │    │
│  │  zeros_profiles · zeros_product_access · zeros_audit_log │    │
│  │  zeros_products                                          │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────┬───────────────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              │            ▼                 │
              │  0accounts                   │
              │  accounts.zeros.design       │  RAILWAY (compute only)
              │                              │
              │  Frontend: Login/Signup UI   │
              │  Backend:  /api/v1/auth/*    │
              │  (DB hosted in Supabase ↑)   │
              └──────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              │            ▼                 │
              │  0shared                     │
              │  @0zerosdesign/auth-client   │  GITHUB PACKAGES
              │                              │
              │  - ZerosAuthProvider (React) │
              │  - useZerosAuth() hook       │
              │  - getSession(), signOut()   │
              │  - verifyWithAccounts()      │
              │  - redirectToLogin()         │
              └──────────────────────────────┘
                           │
          ┌────────────────┼────────────────────┐
          │                │                     │
          ▼                ▼                     ▼
     ┌─────────┐    ┌──────────┐         ┌──────────┐
     │ 0colors │    │ 0research│         │ Future   │
     │         │    │          │         │ products │
     └─────────┘    └──────────┘         └──────────┘
```

---

## Project Details

### 1. Supabase (Shared Auth Project)

**Project ID:** `qvayepdjxvkdeiczjzfj`
**URL:** `https://qvayepdjxvkdeiczjzfj.supabase.co`

This is the **single Supabase project** that handles authentication for the entire Zeros brand. It provides:

- **Google OAuth** — Configured in Supabase dashboard. Users click "Sign in with Google" → redirected to Google → back to 0accounts with tokens.
- **Email/Password auth** — Sign up with email + password, OTP verification via ZeptoMail SMTP.
- **JWT management** — Access tokens (short-lived), refresh tokens (long-lived). Auto-refresh enabled.
- **Session persistence** — Sessions stored in `localStorage` under key `sb-qvayepdjxvkdeiczjzfj-auth-token`.

**Important:** This Supabase project handles auth AND the 0accounts database (user profiles, product access). Product-specific data (e.g., 0research shots, 0colors projects) lives in separate Supabase projects.

### 2. 0accounts (`accounts.zeros.design`)

**Repo:** `github.com/Withso/0accounts`
**Stack:** React frontend + Hono backend on Railway
**Database:** Supabase Auth Project (migrated from Railway Postgres, April 2026)
**Connection:** Hono backend on Railway → Supabase session pooler (`aws-1-ap-southeast-2.pooler.supabase.com:6543`)

#### Frontend (accounts.zeros.design)

The centralized login/signup UI. All products redirect here for authentication.

**Login flow:**
1. Product redirects to `accounts.zeros.design/login?product_id=0research&redirect_url=https://0research.zeros.design/internal`
2. User signs in (Google OAuth or email/password)
3. Supabase returns a session with `access_token` and `refresh_token`
4. 0accounts constructs a redirect URL with tokens in the **hash fragment**:
   ```
   https://0research.zeros.design/internal#access_token=xxx&refresh_token=xxx&token_type=bearer&type=signup
   ```
5. Browser navigates to the product URL with tokens

**Why hash fragments?** Hash fragments (`#...`) are never sent to the server — only the browser sees them. This is secure because tokens don't appear in server logs or network requests.

#### Backend (accounts-api.zeros.design)

**Base URL:** `https://accounts-api.zeros.design/api/v1`

Key endpoints:

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/auth/verify` | POST | `X-User-Token` header | Verify JWT, auto-create profile, register product access. Returns `{ valid, user: { is_admin, ... } }` |
| `/auth/signup` | POST | None | Create user via Supabase admin API + profile |
| `/profile` | GET | `X-User-Token` | Get user profile + product access list |
| `/profile` | PUT | `X-User-Token` | Update profile (name, avatar, bio) |
| `/products/access` | POST | `X-User-Token` | Register product access |
| `/admin/users` | GET | `X-User-Token` (admin) | List all users |
| `/admin/stats` | GET | `X-User-Token` (admin) | Aggregate stats |

**Rate limiting:** 20 req/min for verify, 5 req/min for signup.

#### Database Schema (hosted in Supabase Auth Project)

```sql
-- User profiles (linked to Supabase auth.users by UUID)
zeros_profiles (
  id TEXT PRIMARY KEY,           -- matches Supabase auth user UUID
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  preferences JSONB DEFAULT '{}',
  role TEXT DEFAULT 'user',      -- 'user', 'admin', 'super_admin'
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Which products each user has accessed
zeros_product_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,      -- '0colors', '0research', etc.
  status TEXT DEFAULT 'active',  -- 'active', 'disabled', 'revoked'
  first_accessed_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  UNIQUE(user_id, product_id)
)

-- Audit log
zeros_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ
)
```

### 3. 0shared (`@0zerosdesign/auth-client`)

**Repo:** `github.com/Withso/0shared`
**Package:** `@0zerosdesign/auth-client` (published to GitHub Packages)
**Structure:** pnpm monorepo → `packages/auth-client/`

This is the shared authentication client used by all Zeros products. It provides:

#### Exports (main entry: `@0zerosdesign/auth-client`)

```typescript
// Auth methods
signInWithEmail(email, password)
signUpWithEmail(email, password, name?, redirectTo?)
signInWithGoogle(redirectTo?)
signOut()
resetPassword(email, redirectTo?)
updatePassword(newPassword)
getSession()                    // Returns ZerosSession | null
onAuthStateChange(callback)     // Listen for SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED

// Supabase client
getSupabase(url?, anonKey?)     // Singleton Supabase client

// 0accounts API
verifyWithAccounts(accessToken, productId?, apiUrl?)
getProfile(accessToken, apiUrl?)
registerProductAccess(accessToken, productId, apiUrl?)

// Redirect helpers
redirectToLogin(productId, loginUrl?, returnUrl?)
isAuthenticated()               // Quick sync check from localStorage
```

#### React exports (`@0zerosdesign/auth-client/react`)

```typescript
// Provider (wrap your App)
<ZerosAuthProvider config={{ productId: "0research" }}>
  <App />
</ZerosAuthProvider>

// Hook (use in any component)
const {
  session,          // ZerosSession | null
  user,             // ZerosUser | null (from 0accounts verification)
  loading,          // boolean
  isAuthenticated,  // boolean
  signOut,          // () => Promise<void>
  redirectToLogin,  // () => void
  refreshSession,   // () => Promise<void>
} = useZerosAuth();
```

#### Key Types

```typescript
interface ZerosAuthConfig {
  productId: string;          // Required: '0colors', '0research', etc.
  accountsApiUrl?: string;    // Defaults to https://accounts-api.zeros.design/api/v1
  supabaseUrl?: string;       // Defaults to shared Supabase project
  supabaseAnonKey?: string;
  loginUrl?: string;          // Defaults to https://accounts.zeros.design/login
  autoRedirect?: boolean;     // Auto-redirect to login if no session (default: false)
}

interface ZerosSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
  expiresAt: number;
}

interface ZerosUser {
  id: string;
  email: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  isAdmin: boolean;
}
```

#### Supabase Client Configuration

```typescript
createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,   // Disabled — products handle hash tokens manually
    storageKey: `sb-qvayepdjxvkdeiczjzfj-auth-token`,
  },
});
```

**Why `detectSessionInUrl: false`?** Supabase's built-in URL hash detection runs asynchronously during `createClient()` and fails silently if there's any timing issue. Products handle hash tokens explicitly via `supabase.auth.setSession()` for reliable, debuggable behavior.

#### Session Restore Strategy (Anti-Flicker Pattern)

The `ZerosAuthProvider` uses a **two-stage restore** to prevent the "flash of unauthenticated content":

```
Page Load
  │
  ├─ Stage 1 (SYNC, instant):
  │   Read Supabase session from `sb-qvayepdjxvkdeiczjzfj-auth-token`
  │   Read verified user from `zeros-verified-user` (includes isAdmin)
  │   If both exist → set session + user state immediately
  │   loading = false, isAuthenticated = true, isAdmin = true
  │   Components render correctly on FIRST render (no flash!)
  │
  └─ Stage 2 (ASYNC, background):
      Call supabase.auth.getSession() → may refresh token
      Call verifyWithAccounts() → confirm isAdmin, update cache
      Silently update — user never sees loading or "Access Denied"
```

**localStorage keys used:**
- `sb-qvayepdjxvkdeiczjzfj-auth-token` — Supabase session (managed by Supabase SDK)
- `zeros-verified-user` — Cached verified user from 0accounts (managed by ZerosAuthProvider)

Both are cleared on sign-out. This matches the proven 0colors dual-restore pattern.

#### API Response Mapping

The 0accounts backend returns snake_case fields. The `verifyWithAccounts()` function maps them to camelCase:

```
API Response (snake_case)     →  TypeScript Type (camelCase)
─────────────────────────────    ───────────────────────────
user.is_admin                 →  user.isAdmin
user.display_name             →  user.displayName
user.avatar_url               →  user.avatarUrl
product_access.product_id     →  productAccess.product_id
```

#### Redirect URL Safety

The `redirectToLogin()` function uses `window.location.origin + pathname + search` — **never includes hash fragments**. This prevents stale `#access_token` from being embedded in the `redirect_url` parameter, which previously caused an infinite redirect loop.

---

## How Products Integrate

### Installation

```bash
# .npmrc (configure GitHub Packages registry)
@0zerosdesign:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}

# Install
pnpm add @0zerosdesign/auth-client

# Or for local development (linked to 0shared repo):
pnpm add @0zerosdesign/auth-client@file:../0shared/packages/auth-client
```

### App Setup (App.tsx)

Every product needs two things:

1. **OAuth callback handler** — processes `#access_token` from the URL hash after redirect from accounts.zeros.design
2. **ZerosAuthProvider** — wraps the app with auth context

```tsx
import { useEffect, useState } from "react";
import { RouterProvider } from "react-router";
import { ZerosAuthProvider } from "@0zerosdesign/auth-client/react";
import { getSupabase } from "@0zerosdesign/auth-client";
import { router } from "./routes";

// Parses #access_token=xxx&refresh_token=xxx from URL hash
function parseHashTokens() {
  const hash = window.location.hash;
  if (!hash?.includes("access_token")) return null;
  const params = new URLSearchParams(hash.substring(1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

// Handles the OAuth callback (runs BEFORE router renders)
function useOAuthCallback() {
  const [ready, setReady] = useState(
    () => !window.location.hash.includes("access_token")
  );

  useEffect(() => {
    if (ready) return;
    const tokens = parseHashTokens();
    if (!tokens) {
      window.history.replaceState(null, "", window.location.pathname);
      setReady(true);
      return;
    }
    async function establish() {
      const supabase = getSupabase();
      await supabase.auth.setSession(tokens!);
      window.history.replaceState(null, "", window.location.pathname);
      setReady(true);
    }
    establish();
  }, [ready]);

  return ready;
}

export default function App() {
  const ready = useOAuthCallback();
  if (!ready) return <div>Signing in...</div>;

  return (
    <ZerosAuthProvider config={{ productId: "YOUR_PRODUCT_ID" }}>
      <RouterProvider router={router} />
    </ZerosAuthProvider>
  );
}
```

### Route Protection (RequireAdmin.tsx)

```tsx
import { useEffect, type ReactNode } from "react";
import { useZerosAuth } from "@0zerosdesign/auth-client/react";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated, redirectToLogin } = useZerosAuth();

  // Redirect via effect (not during render) to prevent loops
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      redirectToLogin();
    }
  }, [loading, isAuthenticated, redirectToLogin]);

  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return null; // Will redirect via effect
  if (!user?.isAdmin) return <div>Access Denied</div>;
  return <>{children}</>;
}
```

### Auth Button (SignIn/SignOut UI)

```tsx
import { useZerosAuth } from "@0zerosdesign/auth-client/react";

export function AuthButton() {
  const { user, session, loading, isAuthenticated, signOut, redirectToLogin } =
    useZerosAuth();

  if (loading) return null;
  if (!isAuthenticated) {
    return <button onClick={redirectToLogin}>Sign in</button>;
  }

  const initial = (user?.name || session?.email || "U")[0].toUpperCase();
  return (
    <button onClick={signOut}>{initial}</button>
    // Add dropdown with user info, sign out, etc.
  );
}
```

---

## Complete Auth Flow (Step by Step)

### Flow 1: First-Time Sign In

```
1. User visits 0research.zeros.design/internal
2. App.tsx: useOAuthCallback() — no hash tokens → ready = true
3. ZerosAuthProvider mounts:
   - Stage 1: localStorage empty → session = null, loading = true
   - Stage 2: getSession() returns null → loading = false
4. RequireAdmin: !loading && !isAuthenticated → redirectToLogin()
5. Browser navigates to:
   accounts.zeros.design/login?product_id=0research&redirect_url=https://0research.zeros.design/internal
6. User clicks "Sign in with Google"
7. Supabase Google OAuth flow → Google consent → back to 0accounts
8. 0accounts receives session from Supabase
9. 0accounts constructs redirect:
   https://0research.zeros.design/internal#access_token=xxx&refresh_token=xxx&token_type=bearer
10. Browser navigates to product URL with hash tokens
11. App.tsx: useOAuthCallback() detects hash tokens → ready = false → shows "Signing in..."
12. Calls supabase.auth.setSession({ access_token, refresh_token })
13. Session stored in localStorage under sb-qvayepdjxvkdeiczjzfj-auth-token
14. URL hash cleaned → ready = true → router renders
15. ZerosAuthProvider mounts:
    - Stage 1: localStorage has session → session set immediately, loading = false
    - Stage 2: verifyWithAccounts() called → gets isAdmin from 0accounts
16. RequireAdmin: isAuthenticated = true, user.isAdmin = true → renders page
```

### Flow 2: Returning User (Session Exists)

```
1. User visits 0research.zeros.design/internal
2. App.tsx: useOAuthCallback() — no hash tokens → ready = true
3. ZerosAuthProvider mounts:
   - Stage 1: localStorage has session → session set IMMEDIATELY, loading = false
   - Components see isAuthenticated = true on FIRST render (no flash!)
   - Stage 2 (background): getSession() refreshes token, verifyWithAccounts() updates isAdmin
4. RequireAdmin: isAuthenticated = true → renders page instantly
```

### Flow 3: Expired Session

```
1. User visits 0research.zeros.design/internal
2. ZerosAuthProvider Stage 1: localStorage has session → session set, loading = false
3. Stage 2: getSession() fails (expired) → session cleared
4. RequireAdmin: !isAuthenticated → redirectToLogin()
5. Redirected to accounts.zeros.design for re-authentication
```

### Flow 4: Sign Out

```
1. User clicks "Sign out"
2. useZerosAuth().signOut() called
3. supabase.auth.signOut() clears Supabase session + localStorage
4. session = null, user = null
5. Components see isAuthenticated = false
6. RequireAdmin redirects to login (or shows public content)
```

---

## Admin Role System

### How Admin is Set

The `is_admin` flag is stored in the `zeros_profiles` table in the Supabase Auth Project database. It's set manually:

```sql
UPDATE zeros_profiles SET is_admin = true WHERE email = 'admin@example.com';
```

### How Admin is Checked

1. Product calls `verifyWithAccounts(accessToken, productId)`
2. 0accounts backend verifies the JWT, looks up the profile, returns `is_admin`
3. `ZerosAuthProvider` maps `is_admin` → `isAdmin` and stores on the session
4. Components check `user.isAdmin` via `useZerosAuth()`

### Role Values

| role | is_admin | Access |
|---|---|---|
| `user` | `false` | Standard user — public features only |
| `admin` | `true` | Admin — internal tools, feature flags, content management |
| `super_admin` | `true` | Reserved for future use |

---

## Bugs Fixed (April 2026)

### 1. Infinite Redirect Loop

**Symptom:** Navigating to `/internal` caused infinite redirect between the product and accounts.zeros.design.

**Root cause:** `redirectToLogin()` used `window.location.href` as the return URL, which included `#access_token` from a previous auth attempt. The encoded hash tokens in the `redirect_url` parameter confused the flow.

**Fix:** `redirectToLogin()` now uses `window.location.origin + pathname + search` — never includes hash fragments.

### 2. Session Flash / Flicker on Navigation

**Symptom:** Every time a user navigated to a protected route, there was a brief flash of "loading" or a redirect to accounts.zeros.design, even though the user was already signed in.

**Root cause:** `ZerosAuthProvider` relied solely on async `getSession()` to detect sessions. During the async gap, components saw `isAuthenticated = false`.

**Fix:** Added **synchronous localStorage restore** (Stage 1) that reads the Supabase session from localStorage immediately on mount, before any async calls. Components see `isAuthenticated = true` on the very first render.

### 3. `isAdmin` Always False

**Symptom:** Admin users saw "Access Denied" on admin-only routes.

**Root cause:** The 0accounts API returns `is_admin` (snake_case) but the TypeScript type expects `isAdmin` (camelCase). The `verifyWithAccounts()` function returned the raw JSON without field mapping.

**Fix:** Added explicit snake_case → camelCase mapping in `verifyWithAccounts()`.

### 4. `detectSessionInUrl` Silent Failure

**Symptom:** After redirect from accounts.zeros.design, Supabase never established a session from the URL hash tokens, despite `detectSessionInUrl: true`.

**Root cause:** Supabase's internal `_initialize()` method processes hash tokens asynchronously during `createClient()`, but `getSession()` was called before processing completed. The error was swallowed silently.

**Fix:** Disabled `detectSessionInUrl`. Products now parse hash tokens manually and call `supabase.auth.setSession()` directly — explicit, synchronous, and debuggable.

### 5. "Access Denied" Flash for Admin Users

**Symptom:** Admin users briefly saw "Access Denied" for 2-3 seconds before the page loaded on admin-only routes.

**Root cause:** `restoreSessionFromStorage()` hardcoded `isAdmin: false` because Supabase's localStorage only stores the raw JWT, not our verified user data. The real `isAdmin` flag only arrived after the async `verifyWithAccounts()` call completed (2-3 seconds later).

**Fix:** Added a separate localStorage cache (`zeros-verified-user`) that stores the verified user data (including `isAdmin`). On page load, Stage 1 reads both the Supabase session AND the cached verified user — `isAdmin` is restored instantly. The `verifyWithAccounts()` call in Stage 2 silently updates the cache in the background.

### 6. 0colors Auto-Skip Race Condition

**Symptom:** In 0colors, returning from accounts.zeros.design triggered the "auto-skip auth" effect before the SIGNED_IN event could fire.

**Root cause:** The auto-skip effect checked `!authSession` without checking if hash tokens were being processed.

**Fix:** Added `hashHasTokens` check to prevent auto-skip when `#access_token` is in the URL.

---

## Infrastructure

### Database Hosting

All databases are hosted on Supabase (with daily automatic backups). Railway is used for compute (backend servers) only.

| Supabase Project | Database Contents | Connected From |
|---|---|---|
| **Zeros Auth** (`qvayepdjxvkdeiczjzfj`) | `auth.users`, `zeros_profiles`, `zeros_product_access`, `zeros_products`, `zeros_audit_log` | 0accounts Hono backend (Railway → session pooler) |
| **0research** (`jnkfagcdhwjrzqcgilmt`) | `shots`, `shot_sections`, `shot_blocks`, `user_preferences`, `feature_flags`, `shot_embeddings` | 0research frontend (Supabase JS client) |
| **0colors** (planned) | `users`, `projects`, `community_publications`, `ai_conversations`, etc. | 0colors backend (Railway → session pooler) |

### Railway Services (Compute Only)

| Service | Purpose | Database |
|---|---|---|
| 0accounts Hono backend | Auth API (`/api/v1/auth/*`) | → Supabase Auth Project (session pooler) |
| 0accounts frontend | Login/Signup UI | N/A (static) |
| Directus CMS | Content authoring for 0research | Railway Postgres (co-located) |
| 0colors backend | Cloud sync, AI, community | → Supabase 0colors Project (planned) |

### Connection String Format (Railway → Supabase)

Railway uses IPv4-only networking. Use the **session pooler** URL, not the direct connection:

```
postgresql://postgres.[project-ref]:[password]@aws-[region].pooler.supabase.com:6543/postgres
```

Direct connection (`db.[ref].supabase.co:5432`) uses IPv6 and will fail with `ENETUNREACH` on Railway.

---

## Adding Auth to a New Zeros Product

### Checklist

1. **Install the package:**
   ```bash
   pnpm add @0zerosdesign/auth-client
   ```

2. **Add `useOAuthCallback()` + `ZerosAuthProvider` to App.tsx** (see template above)

3. **Register your product in 0accounts:**
   ```sql
   INSERT INTO zeros_products (id, name, display_name, url, status)
   VALUES ('YOUR_PRODUCT_ID', 'Product Name', 'Display Name', 'https://product.zeros.design', 'active');
   ```

4. **Add route protection** where needed (see `RequireAdmin` template above)

5. **Add auth UI** (sign-in button, user avatar) using `useZerosAuth()` hook

6. **Configure Supabase redirect URLs** in the Supabase dashboard:
   - Add `https://your-product.zeros.design` to allowed redirect URLs
   - Add `http://localhost:5173` for local development

### Environment Variables

No env vars needed for auth — all config is hardcoded in the `@0zerosdesign/auth-client` package (shared Supabase project, 0accounts URLs). Override via `ZerosAuthConfig` if needed.

---

## File Reference

### 0accounts
| File | Purpose |
|---|---|
| `packages/frontend/src/pages/LoginPage.tsx` | Login UI, OAuth initiation, token redirect |
| `packages/frontend/src/hooks/useAuth.ts` | Auth hook, session management, SIGNED_IN handler |
| `packages/frontend/src/utils/supabase/client.ts` | Supabase client config |
| `packages/backend/src/routes/auth.ts` | `/auth/verify`, `/auth/signup` endpoints |
| `packages/backend/src/middleware/auth.ts` | `requireAuth`, `requireAdmin` middleware |
| `packages/backend/src/db.ts` | Database schema (zeros_profiles, zeros_product_access) |

### 0shared
| File | Purpose |
|---|---|
| `packages/auth-client/src/index.ts` | Package exports |
| `packages/auth-client/src/config.ts` | Supabase URLs, session storage key |
| `packages/auth-client/src/client.ts` | Supabase client singleton |
| `packages/auth-client/src/auth.ts` | Auth methods (getSession, signOut, etc.) |
| `packages/auth-client/src/api.ts` | 0accounts API client (verifyWithAccounts) |
| `packages/auth-client/src/redirect.ts` | redirectToLogin, getRedirectParams |
| `packages/auth-client/src/react/ZerosAuthProvider.tsx` | React context provider |
| `packages/auth-client/src/react/useZerosAuth.ts` | React hook |
| `packages/auth-client/src/types.ts` | TypeScript interfaces |

### 0research
| File | Purpose |
|---|---|
| `src/app/App.tsx` | useOAuthCallback + ZerosAuthProvider |
| `src/app/routes.ts` | Route definitions, RequireAdmin on /internal |
| `src/app/components/auth/RequireAdmin.tsx` | Admin route guard |
| `src/app/components/auth/AuthButton.tsx` | Sign-in/sign-out UI |

### 0colors
| File | Purpose |
|---|---|
| `packages/frontend/src/hooks/useCloudSyncAuth.ts` | Custom auth (doesn't use 0shared yet) |
| `packages/frontend/src/hooks/useLocalStorageRestore.ts` | Sync session restore |
| `packages/frontend/src/utils/supabase/client.ts` | Supabase client with resilient fetch |
| `packages/frontend/src/App.tsx` | Auth gate with authChecking flag |
