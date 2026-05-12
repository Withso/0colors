# API reference

0colors exposes a JSON API at `/api/*`. Most endpoints require a session
cookie issued by `POST /api/auth/login`. This document focuses on the auth
surface and the endpoints you're most likely to script against — the rest
of the API (projects, tokens, AI, community) is in flux and best read from
the source under `packages/backend/src/routes/`.

## Authentication

All authenticated requests carry the session cookie set by `/api/auth/login`,
`/api/auth/setup`, or `/api/auth/accept-invite`. Cookies are `HttpOnly` and
`SameSite=Lax`. Pass them automatically with `credentials: 'include'` in
browser fetches, or `-b/-c` in curl.

### `GET /api/auth/setup-status`

Public. Returns `{ "isSetupComplete": boolean }`. The frontend uses this to
decide whether to render the setup wizard at first visit.

```bash
curl https://your-instance.up.railway.app/api/auth/setup-status
# → {"isSetupComplete":true}
```

### `POST /api/auth/setup`

Public. Only succeeds when no user has activated yet (returns `409 Conflict`
otherwise). Creates the first admin and signs them in.

```bash
curl -X POST https://your-instance.up.railway.app/api/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"hunter2hunter","name":"You"}'
```

Response: `{ "success": true, "user": { "id": "…", "email": "…", "name": "…", "isAdmin": true } }`

### `POST /api/auth/login`

Public. Email + password → session cookie.

```bash
curl -c cookies.txt -X POST https://your-instance.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"hunter2hunter"}'
```

Wrong password returns 401 with a generic `"Invalid email or password"`
message (intentionally no leak about which side failed).

### `POST /api/auth/logout`

Deletes the session row server-side and clears the cookie.

```bash
curl -b cookies.txt -X POST https://your-instance.up.railway.app/api/auth/logout
```

### `GET /api/auth/me`

Returns the currently signed-in user (or `{ "user": null }` if no session —
always with HTTP 200, never 401).

```bash
curl -b cookies.txt https://your-instance.up.railway.app/api/auth/me
# → {"user":{"id":"…","email":"…","name":"…","isAdmin":true,"meta":{…}}}
```

## Inviting users

Until the admin UI lands at **Profile → Invite a user**, you can script
invites from the command line. All three of the endpoints below cooperate:

### `POST /api/auth/invite` (admin-only)

```bash
curl -b cookies.txt -X POST https://your-instance.up.railway.app/api/auth/invite \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","name":"Alice","isAdmin":false}'
# → {"success":true,"inviteToken":"…","userId":"…","expiresAt":"2026-…"}
```

Build the invite URL as `https://your-instance.up.railway.app/accept-invite/<inviteToken>`
and send it to the recipient. The token expires in 7 days.

If the email already belongs to an *unactivated* user, the endpoint reissues
the token instead of erroring. If the email belongs to an *activated* user,
it returns `409 Conflict`.

### `GET /api/auth/invite/:token`

Public. Lets the accept-invite UI pre-fill the email and warn on expired or
already-accepted invites.

```bash
curl https://your-instance.up.railway.app/api/auth/invite/<inviteToken>
# → {"valid":true,"email":"alice@example.com","name":"Alice","expiresAt":"…"}
# → {"valid":false,"reason":"expired"}
# → {"valid":false,"reason":"already-activated"}
# → {"valid":false,"reason":"unknown"}
```

### `POST /api/auth/accept-invite`

Public. The invitee submits a password to activate their account; succeeds
once per token.

```bash
curl -c cookies.txt -X POST https://your-instance.up.railway.app/api/auth/accept-invite \
  -H 'Content-Type: application/json' \
  -d '{"token":"<inviteToken>","password":"alice-picks-this"}'
# → {"success":true,"user":{"id":"…","email":"alice@…","name":"Alice","isAdmin":false}}
```

The response sets the session cookie, so the invitee is signed in immediately.

## Health

### `GET /api/health`

Public. Returns `{ "status": "ok", "db": "ok", "timestamp": … }` with HTTP
200 when the Postgres pool is reachable, or HTTP 503 with
`{ "status": "degraded", "db": "unreachable", … }` otherwise. Railway uses
this as the deploy health check (configured in `railway.json`).
