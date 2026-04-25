# Security notes — 0colors

## Content Security Policy (not yet enforced)

CSP should be delivered as an HTTP header on the HTML root document by
whatever serves the frontend (Railway static, `npx serve`, reverse proxy).
Because there is no staging environment, roll out in two stages.

### Recommended directives

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
img-src 'self' data: blob: https:;
connect-src 'self'
  https://qvayepdjxvkdeiczjzfj.supabase.co
  wss://qvayepdjxvkdeiczjzfj.supabase.co
  https://accounts-api.zeros.design
  https://accounts.zeros.design
  https://api-server-production-0064.up.railway.app;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
```

`'unsafe-inline' 'unsafe-eval'` on `script-src` are Vite's build output
requirements; tighten once you've verified with hashes/nonces.

### Rollout

1. Deploy with header name `Content-Security-Policy-Report-Only` instead
   of `Content-Security-Policy`. This flags violations without blocking.
2. Exercise every user flow (sign-in, sign-up, forgot password, cloud
   sync, canvas editing, AI chat, exports). Watch the browser console
   for "Refused to…" messages.
3. Update directives to accommodate any legitimate third-party resources
   that appear.
4. After 48 hours with a clean report, flip the header name to
   `Content-Security-Policy` to enforce.

## Auth flow

Authentication is handled by [`@0zerosdesign/auth-client`](https://github.com/Withso/0shared)
against the shared Supabase project + `accounts.zeros.design`. See the
auth-client [README](https://github.com/Withso/0shared/blob/main/packages/auth-client/README.md)
for architecture and the `signOut` local-scope trade-off.

## Known hardenings

- Backend validates every JWT via `supabase.auth.getUser()` on every request
  (see `middleware/auth.ts`); no trusted-client paths.
- Project ownership enforced at the application layer: `owner.user_id ===
  userId` checked on every read/write.
- Signup endpoint returns generic errors to prevent account enumeration.
- Auth tokens never leave the `Authorization` / `X-User-Token` headers
  (never query strings).
- OAuth callback hash is stripped immediately after `setSession()`.
- Production builds gate debug logs behind `import.meta.env.DEV` via
  `src/utils/logger.ts`.

## Known gaps

- Supabase RLS policies are not codified in `supabase/migrations/`.
  Backend uses the service role key which bypasses RLS anyway, but adding
  RLS would provide defense-in-depth against a compromised backend.
- CSP headers (above) are not yet enforced.
