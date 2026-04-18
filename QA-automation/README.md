# QA automation — overview

This folder holds the **human test catalog**, **automation metadata**, **generated raw reports**, and the reusable QA harness for auth, cloud sync, database, route, smoke, and browser-flow tests.

**Policy:** Automation **reports** problems (repro, logs, artifacts). **Fixing** the product is separate engineering work. See `TEST-CATALOG.md` for the full stance.

---

## 1. Contents of `QA-automation/`

| Path | Authored vs generated | What it does | Typical use |
|------|----------------------|--------------|-------------|
| **`TEST-CATALOG.md`** | Authored | Master checklist: modules, priorities, manual vs automated intent, links to implemented suites. | Planning regressions, onboarding QA, knowing what is **not** automated yet. |
| **`automation-overlays.json`** | Authored | Maps spec/unit files → module name, **plain-language** descriptions per test, intro copy, `notYetAutomatedInPlaywright` (e.g. Advanced Logic). | Consumed by `scripts/sync-qa-dashboard.mjs` to enrich dashboard JSON and text reports. |
| **`reports/runs/<run-id>/*.json`** | **Generated** (gitignored) | Run-scoped Vitest and Playwright JSON for every frontend and QA harness layer. | Input to `npm run qa:sync-report`; do not edit by hand. |
| **`reports/html/`** (if present) | Generated | Optional HTML report area from tooling; not required for the hub. | Local browsing if you generate HTML reports. |
| **`projects/`** | Mixed | `_template/` plus `0colors/` tests and metadata. | Product-specific QA harness tests. |
| **`test-results/`**, **`node_modules/`** (if present) | Generated / install | Playwright artifacts or local installs if tools were run from this subtree. | Debugging failed runs; not part of the default hub pipeline. |

---

## 2. Related paths outside this folder

| Location | Role |
|----------|------|
| **`playwright.config.ts`** (repo root) | Frontend E2E `testDir` = `packages/frontend/tests/e2e`, JSON → run-scoped report. |
| **`QA-automation/playwright.config.ts`** | QA harness browser projects: `0colors` (`tests/e2e`) and `0colors-smoke` (root smoke specs). |
| **`QA-automation/vitest.config.ts`** | QA harness Vitest projects: unit, domain, integration. |
| **`packages/frontend/tests/e2e/*.spec.ts`** | **Primary** Playwright coverage. |
| **`packages/frontend/src/**/*.unit.test.ts`** | Frontend Vitest unit/domain/property/component/integration tests (see `packages/frontend/vitest.config.ts`). |
| **`scripts/sync-qa-dashboard.mjs`** | Merges E2E + unit JSON, applies overlays, writes `packages/frontend/public/qa-reports/latest-run.json`, updates `runs-history.json`, copies catalog to `public/qa-docs/`. |
| **`scripts/qa-local-runner.mjs`** | Local HTTP on **`127.0.0.1:47841`**: frontend Vitest → QA Vitest → frontend Playwright → QA Playwright → sync. |
| **Root `package.json`** | `qa:sync-report`, `qa:runner`, `dev:qa`, `test:e2e:report`, etc. |
| **`packages/frontend/vite.config.ts`** | Proxies `/__qa-runner/*` to the runner (same-origin in dev). |
| **`packages/frontend/public/qa-reports/`** | `latest-run.json`, `runs-history.json` (often gitignored), `latest-run.sample.json` (committed). |
| **`packages/frontend/public/qa-docs/TEST-CATALOG.md`** | Synced copy of this folder’s catalog for the in-app **Test catalog** tab. |
| **`packages/frontend/src/components/admin/AdminQaDashboard.tsx`** (+ `.css`) | QA hub UI. |
| **`packages/frontend/src/pages/ProjectsPage.tsx`** | Shows QA hub only for **admin** users. |
| **`.gitignore`** | Ignores generated dashboard payloads and run-scoped QA reports. |

---

## 3. Data flow (short)

1. **Frontend Vitest** → run-scoped `unit/domain/property/component/integration-results.json`.
2. **QA Vitest** → run-scoped `qa-unit/qa-domain/qa-integration-results.json`.
3. **Frontend Playwright** → run-scoped `e2e-results.json`.
4. **QA Playwright** → run-scoped `qa-e2e-results.json` and `qa-smoke-results.json`.
5. **`npm run qa:sync-report`** → reads every reported layer + `automation-overlays.json` + manifest → writes dashboard JSON, history, copies `TEST-CATALOG.md` into `public/qa-docs/`.
6. **QA hub** fetches those static files and displays runs, tables, coverage notes, bugs, and text report.

---

## 4. QA hub UI (admin, in the app)

**Navigation:** Projects → **QA hub** (visible only if the user is an **admin**).

### Runs & actions

- **Run all QA tests** — Vite dev only; calls `/__qa-runner/run` (requires `npm run qa:runner` or `npm run dev:qa`). Shows live phase, elapsed time, runner log, and clear errors if the runner is unreachable.
- **Reload reports** — Refetches `latest-run.json` and `runs-history.json`.
- **Copy setup CLI** — Copies recommended commands (`dev:qa`, separate `qa:runner`, etc.).
- **Upload run JSON** — Ingests a dashboard payload (e.g. from CI) into local state/history.
- **Latest run** + **Automation runs** — Open a run for full detail: stats; unit and browser tables **grouped by module** with **plain-language** descriptions; skipped cases; categorized **issues**; full **text report**; **coverage** (this run vs repo file counts; warning if E2E count looks stale); **automation gaps** (major UI not yet driven by Playwright).

### Test catalog

- Renders `/qa-docs/TEST-CATALOG.md` (synced from `QA-automation/TEST-CATALOG.md`).

### Time zone

- Run titles and timestamps use **IST** (`Asia/Kolkata`) where ISO timestamps are available.

### Scope

- **Local automation only:** the runner binds to **127.0.0.1**; the browser does not run tests on a remote production server.

---

## 5. Quick reference — when to use what

| Goal | Command / action |
|------|------------------|
| Run unit tests | `npm run test:unit` |
| Run E2E (may start dev servers per Playwright config) | `npm run test:e2e` |
| Refresh hub JSON after tests | `npm run qa:sync-report` |
| Full layered QA pipeline from CLI | `npm run qa:full` |
| QA harness auth/cloud browser flows only | `npm run test:qa:e2e` |
| QA harness smoke browser flows only | `npm run test:qa:smoke` |
| Dev + backend + frontend + QA runner | `npm run dev:qa` |
| Runner only (second terminal) | `npm run qa:runner` |
| Trigger from browser | With dev app + runner up → QA hub **Run all QA tests** |
| Human checklist | This folder’s `TEST-CATALOG.md` or hub **Test catalog** tab |

---

## 6. Environment files and GitHub safety

- The QA system should be pushed with **templates**, not real secrets.
- Safe to commit:
  - `QA-automation/.env.example`
  - `packages/backend/.env.example`
- Do **not** commit:
  - `packages/backend/.env`
  - any real `.env` file with credentials or machine-local values

### QA variables (optional)

`QA-automation/.env.example` documents the main QA-side variables:

- `BASE_URL` — target app URL for browser runs
- `PLAYWRIGHT_SKIP_WEB_SERVER` — set to `1` when the app is already running
- `QA_RUNNER_PORT` — local-only runner port
- `QA_TEST_EMAIL` / `QA_TEST_PASSWORD` — optional manual cloud/auth smoke credentials

### Current repo status

- Real local env file found: `packages/backend/.env`
- Existing safe backend template: `packages/backend/.env.example`
- Added safe QA template: `QA-automation/.env.example`

---

## 7. Companion table (from `TEST-CATALOG.md`)

| Artifact | Purpose |
|----------|---------|
| `packages/frontend/tests/e2e/*.spec.ts` | Implemented browser (E2E) tests |
| `packages/frontend/src/**/*.unit.test.ts` | Fast unit tests (Vitest) |
| `QA-automation/projects/0colors/tests/**/*` | QA harness auth/cloud/sync/database/smoke tests |
| `QA-automation/reports/runs/<run-id>/*.json` | Raw layered JSON reports (generated) |
| `packages/frontend/public/qa-reports/latest-run.json` | Dashboard payload (generated; run `npm run qa:sync-report`) |
| Admin **QA hub** | View runs, upload JSON, local runner, catalog tab |

**Legacy:** `projects/0colors/MANUAL-TEST-CASES.md` — older labels; `TEST-CATALOG.md` is the structured source of truth.
