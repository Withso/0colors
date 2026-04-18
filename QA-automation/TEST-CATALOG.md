# 0colors — master test catalog

Single source for **what** to verify across the product. Automated suites (Playwright, Vitest) implement a **subset**; rows here stay the backlog and regression checklist until automated.

**QA automation role (policy):** a QA automation pass **reports** failures (repro steps, logs, artifacts). **Fixing** the product is a separate change, tracked like any other engineering work.

**Companion files**


| Artifact                                                   | Purpose                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/frontend/tests/e2e/*.spec.ts`                    | Implemented browser (E2E) tests                                  |
| `packages/frontend/src/**/*.unit.test.ts`                  | Fast unit tests (Vitest)                                         |
| `QA-automation/projects/0colors/tests/**/*`                | QA harness tests for auth, cloud sync, DB, route, smoke, and browser flows |
| `QA-automation/reports/runs/<run-id>/*.json`               | Raw Vitest / Playwright JSON reports (generated per run)          |
| `packages/frontend/public/qa-reports/latest-run.json`      | Dashboard payload (**gitignored**; run `npm run qa:sync-report`) |
| Admin **QA hub** (signed-in admin → Projects → **QA hub**) | View last ingested run, upload JSON, CLI hint                    |


**Legacy:** `projects/0colors/MANUAL-TEST-CASES.md` — short suite labels; this document supersedes it for structure and traceability.

---

## 1. Test layers (efficient placement)


| Layer                 | Best for                                              | Speed | This repo                                                    |
| --------------------- | ----------------------------------------------------- | ----- | ------------------------------------------------------------ |
| **Unit**              | Pure functions, URL helpers, math, parsers without UI | ms    | `npm run test:unit` — `slugify` today; expand `utils/pure/`* |
| **Component**         | Isolated React + store stubs                          | s     | `npm run test:component`                                     |
| **E2E (Playwright)**  | Full flows, routing, real Zustand + canvas            | min   | `npm run test:e2e`; QA harness browser flows run in `npm run qa:full` |
| **Contract / API**    | Hono/Supabase shapes                                  | s–min | QA integration layer in `QA-automation/projects/0colors/tests/integration` |
| **Visual regression** | Pixel-stable layouts                                  | min   | *Backlog* — snapshots + baselines                            |


**Advanced logic / expressions:** the evaluator (`advanced-logic-engine.ts`) pulls heavy color dependencies; **full unit coverage** either needs **mocked imports** or **extracted pure helpers** into a side-effect-free module. Until then, catalog rows below are **E2E + manual + future unit**.

**Combinatorial explosion:** do **not** list thousands of AST combinations as separate rows. Use **equivalence classes** + **property tests** (future) + spot E2E scenarios.

---

## 2. Implemented automation (inventory)

### 2.1 Playwright (`packages/frontend/tests/e2e/`)


| File                         | Rough scope                                                   |
| ---------------------------- | ------------------------------------------------------------- |
| `app-navigation.spec.ts`     | Load, home redirect, `/projects`, `/sample-project`, back nav |
| `project-management.spec.ts` | Create local, cards, import button                            |
| `node-operations.spec.ts`    | Add HSL, palette, token table popup                           |
| `token-operations.spec.ts`   | Panel, add variable, search                                   |
| `themes-pages.spec.ts`       | Page/theme dropdowns, add page                                |
| `undo-redo.spec.ts`          | Undo/redo after add node                                      |
| `command-palette.spec.ts`    | Open/close, search                                            |
| `keyboard-shortcuts.spec.ts` | Cmd/Ctrl+K, code view, shortcuts panel                        |
| `import-export.spec.ts`      | Import entry, code preview buttons                            |
| `persistence.spec.ts`        | Reload keeps nodes                                            |
| `sample-templates.spec.ts`   | Sample route shell                                            |
| `ai-chat.spec.ts`            | Local project AI gate                                         |
| `persistence.spec.ts`        | (as above)                                                    |


Selectors: `data-testid` only (project convention).

### 2.2 Vitest (unit / domain / property / component / integration)


| File                                           | Layer       | Scope                                           |
| ---------------------------------------------- | ----------- | ----------------------------------------------- |
| `slugify.unit.test.ts`                         | unit        | `slugify`, `findProjectBySlug`                  |
| `advanced-logic-engine.domain.test.ts`         | domain      | Parser, evaluator, constraints, themes, tokens, golden fixtures |
| `advanced-logic-engine.property.test.ts`       | property    | Generated: channel rows, conditionals, constraints, token assignment |
| `color-conversions.domain.test.ts`             | domain      | HSL, RGB, HEX, OKLCH round-trips, gamut clamping |
| `hct-utils.domain.test.ts`                     | domain      | HCT normalization, RGB conversion, max chroma   |
| `visibility.domain.test.ts`                    | domain      | Hidden-node/token rules, palette inheritance     |
| `computed-tokens.domain.test.ts`               | domain      | Token export, alias chains, hidden propagation   |
| `AdvancedPopup.component.test.tsx`             | component   | Popup selectors: multi-row, disabled, multi-channel, fallback, token |
| `useAdvancedLogicEffect.integration.test.tsx`  | integration | Store/effect: recompute, siblings, multi-channel, literal |


### 2.3 QA automation harness (`QA-automation/projects/0colors/tests/`)

| Area | Files | Scope |
| ---- | ----- | ----- |
| `tests/unit/*.unit.test.ts` | 7 files / 92 checks | Backend auth helpers, auth middleware, frontend auth slice, cloud sync service, write-through sync, session lock, tab channel |
| `tests/domain/*.domain.test.ts` | 1 | Built-in sample/template structure and cross-reference validation |
| `tests/integration/*.integration.test.ts` | 3 | IndexedDB operations, auth routes, project/cloud-sync routes, lock endpoints |
| `tests/e2e/*.spec.ts` | 2 | Auth flow and cloud-sync browser workflows |
| root `tests/*.spec.ts` | 4 | App shell, routing, command palette, optional credential-backed cloud auth smoke |


---

## 3. Module → feature → test cases (IDs)

Convention: **TC-****-**** — priority ****P0** (ship blocker) … **P3** (nice).

### M01 — App shell & routing (`App.tsx`, `routes.ts`, URL hooks)


| ID         | Layer  | Priority | Case                                                               |
| ---------- | ------ | -------- | ------------------------------------------------------------------ |
| TC-M01-001 | E2E    | P0       | Cold load: no white screen; errors logged                          |
| TC-M01-002 | E2E    | P0       | `/` resolves to `/projects` or `/sample-project/...` per auth/data |
| TC-M01-003 | E2E    | P0       | `/project/:slug` opens editor; slug mismatch handled               |
| TC-M01-004 | E2E    | P1       | `/project/:slug/code` and `/export` view modes                     |
| TC-M01-005 | E2E    | P1       | Browser back/forward keeps coherent state                          |
| TC-M01-006 | Manual | P2       | Deep link with dirty local data                                    |


### M02 — Projects dashboard (`ProjectsPage.tsx`)


| ID                 | Layer  | Priority | Case                                                                |
| ------------------ | ------ | -------- | ------------------------------------------------------------------- |
| TC-M02-001         | E2E    | P0       | Projects list visible; create **local** opens **non-sample** editor |
| TC-M02-002         | E2E    | P1       | Import button present                                               |
| TC-M02-003         | E2E    | P1       | Project cards count after create                                    |
| TC-M02-004         | Manual | P1       | Cloud/template sections when authenticated                          |
| TC-M02-005         | **E2E** | P2      | Delete / duplicate / export per row *(AUTO-E2E-M02-004 thru -006)* |
| TC-M02-006         | Manual | P2       | Published badge when applicable                                     |
| **TC-M02-ADM-001** | Manual | P2       | **Admin:** QA hub shows last run; upload JSON; history              |


### M03 — Editor canvas (`ColorCanvas.tsx`, `AppCanvasArea.tsx`)


| ID         | Layer  | Priority | Case                                           |
| ---------- | ------ | -------- | ---------------------------------------------- |
| TC-M03-001 | E2E    | P0       | Add root HSL node; card visible                |
| TC-M03-002 | E2E    | P0       | Add palette; palette card visible              |
| TC-M03-003 | E2E    | P1       | Bottom bar only on primary theme + canvas mode |
| TC-M03-004 | E2E    | P1       | Multi-select bar when >1 node selected         |
| TC-M03-005 | E2E    | P1       | Undo/redo after structural edits               |
| TC-M03-006 | Manual | P1       | Pan/zoom; fit all                              |
| TC-M03-007 | Manual | P2       | Drag node; snap; collision                     |
| TC-M03-008 | Manual | P2       | Child attach / detach parent                   |


### M04 — Node cards (`ColorNodeCard`, `PaletteNodeCard`, `SpacingNodeCard`, `TokenNodeCard`)


| ID         | Layer  | Priority | Case                                      |
| ---------- | ------ | -------- | ----------------------------------------- |
| TC-M04-001 | Manual | P0       | HSL sliders update color + token preview  |
| TC-M04-002 | Manual | P0       | RGB / OKLCH / HCT switch preserves intent |
| TC-M04-003 | Manual | P1       | Locks + diff flags interaction            |
| TC-M04-004 | Manual | P1       | Rename node; auto-name from color         |
| TC-M04-005 | Manual | P1       | Palette shade ladder edits                |
| TC-M04-006 | Manual | P2       | Spacing node inputs                       |
| TC-M04-007 | Manual | P2       | Token node prefix toggle                  |


### M05 — Advanced logic (`AdvancedPopup.tsx`, `advanced-logic-engine.ts`, `useAdvancedLogicEffect`)

**Matrix (document equivalence classes; automate samples + future unit/property tests)**


| Dimension   | Values to combine (spot-check + samples)           |
| ----------- | -------------------------------------------------- |
| Theme       | Primary vs non-primary                             |
| Inheritance | Linked vs unlinked (theme override)                |
| Channel     | hue, saturation, lightness, alpha, rgb, oklch, hct |
| Row state   | enabled/disabled rows, empty tokens                |
| Output      | numeric vs error vs conditional branch             |



| ID         | Layer    | Priority | Case                                                                         |
| ---------- | -------- | -------- | ---------------------------------------------------------------------------- |
| TC-M05-001 | **E2E**  | P0       | Open advanced popup; save empty → no crash *(AUTO-E2E-M05-002)*              |
| TC-M05-002 | Manual   | P0       | Single `mix` / `lighten` row drives channel                                  |
| TC-M05-003 | Manual   | P1       | Conditional on token presence                                                |
| TC-M05-004 | Manual   | P1       | Non-primary unlinked uses `themeChannels` / `themeTokenAssignment`           |
| TC-M05-005 | Manual   | P2       | Token ref by name fallback vs id                                             |
| TC-M05-006 | **Domain** | P2     | `constrainChannelValue`, `getEffectiveChannels` *(AUTO-DOM-M05-005, -010 thru -020)* |
| TC-M05-007 | **Property** | P3   | Random AST within grammar → no throw *(AUTO-PROP-M05-001 thru -007)*         |


### M06 — Tokens panel (`TokensPanel.tsx`, `TokenSearchBar.tsx`, `TokenTablePopup.tsx`)


| ID         | Layer  | Priority | Case                                  |
| ---------- | ------ | -------- | ------------------------------------- |
| TC-M06-001 | E2E    | P0       | Search + add variable (primary theme) |
| TC-M06-002 | Manual | P0       | Assign/unassign token to node         |
| TC-M06-003 | Manual | P1       | Groups, drag reorder, palette entries |
| TC-M06-004 | E2E    | P1       | Token table open/close from toolbar   |
| TC-M06-005 | Manual | P2       | Bulk delete / auto-assign edge cases  |


### M07 — Themes & pages (toolbar + store)


| ID         | Layer  | Priority | Case                              |
| ---------- | ------ | -------- | --------------------------------- |
| TC-M07-001 | E2E    | P1       | Page dropdown; add page           |
| TC-M07-002 | E2E    | P1       | Theme dropdown; add theme         |
| TC-M07-003 | Manual | P0       | Switch page → correct nodes       |
| TC-M07-004 | Manual | P0       | Switch theme → colors / overrides |
| TC-M07-005 | Manual | P1       | Delete page/theme confirmations   |
| TC-M07-006 | Manual | P1       | Rename page/theme inline          |


### M08 — Undo / redo (`undo-middleware.ts`)


| ID         | Layer  | Priority | Case                                |
| ---------- | ------ | -------- | ----------------------------------- |
| TC-M08-001 | E2E    | P1       | Undo add node                       |
| TC-M08-002 | Manual | P1       | Debounced slider → single undo step |
| TC-M08-003 | Manual | P2       | Pause/resume (AI build)             |


### M09 — Import / export (`useImportExport.ts`, code preview, multi-page export)


| ID         | Layer  | Priority | Case                               |
| ---------- | ------ | -------- | ---------------------------------- |
| TC-M09-001 | E2E    | P1       | Code preview copy/download visible |
| TC-M09-002 | Manual | P0       | JSON round-trip                    |
| TC-M09-003 | Manual | P1       | Bad JSON error UX                  |
| TC-M09-004 | Manual | P2       | Multi-page export content          |
| TC-M09-005 | Manual | P2       | Figma / clipboard formats          |


### M10 — Command palette & shortcuts (`CommandPalette.tsx`, `ShortcutsPanel.tsx`, keyboard hooks)


| ID         | Layer  | Priority | Case                          |
| ---------- | ------ | -------- | ----------------------------- |
| TC-M10-001 | E2E    | P1       | Cmd/Ctrl+K; Escape            |
| TC-M10-002 | E2E    | P1       | Shortcuts panel toggle        |
| TC-M10-003 | Manual | P2       | Navigate to node from palette |


### M11 — Sample mode & templates (`useSampleTemplates.ts`)


| ID         | Layer  | Priority | Case                              |
| ---------- | ------ | -------- | --------------------------------- |
| TC-M11-001 | E2E    | P1       | Sample route loads                |
| TC-M11-002 | Manual | P0       | Edit blocked + toast              |
| TC-M11-003 | Manual | P1       | Duplicate sample → editable local |


### M12 — Auth & cloud (`AuthPage`, Supabase sync, cloud projects)


| ID         | Layer    | Priority | Case                         |
| ---------- | -------- | -------- | ---------------------------- |
| TC-M12-001 | Manual   | P0       | Sign in / sign out           |
| TC-M12-002 | Manual   | P1       | Cloud sync indicators        |
| TC-M12-003 | Manual   | P2       | 20-project limit (non-admin) |
| TC-M12-004 | QA integration | P1 | Mocked auth/cloud route success and failure paths |
| TC-M12-005 | QA unit | P1 | Session lock, tab channel, write-through sync, and cloud metadata helpers |
| TC-M12-006 | QA E2E | P1 | Auth route/session browser flow and cloud-sync/local persistence browser flow |


### M13 — AI (`AskAIChat.tsx`, AI settings)


| ID         | Layer       | Priority | Case                         |
| ---------- | ----------- | -------- | ---------------------------- |
| TC-M13-001 | E2E         | P2       | Local: gate / no dock        |
| TC-M13-002 | Manual      | P1       | Cloud/template: send; stream |
| TC-M13-003 | Manual      | P2       | Dock/undock; persistence     |
| TC-M13-004 | Integration | P3       | Rate limit / API key failure |


### M14 — Publish & community (`PublishPopup`, `CommunityPage`)


| ID         | Layer  | Priority | Case                   |
| ---------- | ------ | -------- | ---------------------- |
| TC-M14-001 | Manual | P1       | Publish flow with auth |
| TC-M14-002 | Manual | P2       | Community open / remix |


### M15 — Dev mode (`DevModePanel.tsx`)


| ID         | Layer  | Priority | Case           |
| ---------- | ------ | -------- | -------------- |
| TC-M15-001 | Manual | P2       | Config persist |
| TC-M15-002 | Manual | P3       | Webhook test   |


### M16 — Persistence & migrations (`persistence-middleware`, `app-helpers` load/save)


| ID         | Layer | Priority | Case                              |
| ---------- | ----- | -------- | --------------------------------- |
| TC-M16-001 | E2E   | P1       | Reload keeps project              |
| TC-M16-002 | Unit  | P2       | *Future:* migration version bumps |


---

## 4. External systems — how to cover without “fixing” them


| System             | Recommended approach                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| OpenAI / streaming | Record fixtures; mock `fetch` / MSW; E2E `page.route`                                 |
| Supabase auth      | Staging test user; **never** commit secrets; optional `@playwright/test` storageState |
| Webhooks / backend | Hit dev server with test payload; assert HTTP + DB                                    |


Failures here are **reported** with environment notes, not silently patched in the app during QA.

---

## 5. Running everything & feeding the QA hub

```bash
# Unit
npm run test:unit

# E2E (starts dev servers per playwright.config unless SKIP)
npm run test:e2e

# Refresh dashboard JSON for local dev (merges all run-scoped Vitest + Playwright layers, text report, history, copies this catalog to /qa-docs/)
npm run qa:sync-report

# Full local pipeline: frontend Vitest, QA Vitest, frontend Playwright, QA Playwright, sync report
npm run qa:full
```

### In-browser “Run all tests” (localhost only)

1. Terminal A: `npm run dev` (Vite on :3000).
2. Terminal B: `npm run qa:runner` (binds **127.0.0.1:47841** only).
3. Sign in as **admin** → **Projects → QA hub** → **Run all QA tests**.

The runner executes frontend Vitest layers → QA harness Vitest layers → frontend Playwright → QA harness Playwright (`qa-e2e` and `qa-smoke`) with `PLAYWRIGHT_SKIP_WEB_SERVER=1` and your current app URL → `qa:sync-report`. The hub reloads `latest-run.json` and `runs-history.json` when the pipeline finishes.

Vite proxies `/__qa-runner/`* to the runner so the browser stays same-origin (no CORS).

Then open the app as **admin**, go to **Projects → QA hub**, and use **Reload reports** if needed. If `latest-run.json` is missing, use **Run all QA tests** or `npm run qa:full`.

---

## 6. Adding rows to this catalog

1. Pick module **Mxx**.
2. Assign next **TC-Mxx-nnn**.
3. Mark **Layer** and **Priority**.
4. Implement **E2E** in `*.spec.ts` or **unit** in `*.unit.test.ts`.
5. Run suites; **report** failures via Playwright HTML + QA hub **bugs** list (from sync script).

---

*End of master catalog (living document).*
