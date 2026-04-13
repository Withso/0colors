# 0colors Codebase Audit Report

**Date:** 2026-04-13
**Scope:** Complete codebase review — every module, every file
**Total lines audited:** ~25,000+ lines across 40+ files

---

## EXECUTIVE SUMMARY

The codebase has strong fundamentals — well-structured components, proper color math, good separation of concerns. However, **3 architectural issues** cause most of the bugs:

1. **Non-atomic state updates** — template switching makes 8+ separate setState calls, creating windows where the canvas renders with mismatched projectId/pageId
2. **No sample template fallback** — if the backend `/templates` endpoint fails or is slow, users see a blank canvas
3. **Session lock false positives** — heartbeat errors are silently swallowed, stale lock states persist across project switches

---

## MODULE-BY-MODULE AUDIT

### Core Canvas System

| File | Lines | Status | Issues |
|------|-------|--------|--------|
| ColorCanvas.tsx | 3,534 | Good | Connections array recalculated every render (should useMemo). 3 minor null-ref risks in wire rendering |
| ColorNodeCard.tsx | 4,664 | Needs optimization | 5 performance issues: color conversion helpers redefined every render, getDiffProps called 13x without memoization, perceived brightness runs unconditionally |
| PaletteNodeCard.css | 646 | Clean | No issues |
| ColorCanvas.css | 266 | Clean | No issues |

### Color Utilities

| File | Lines | Status | Issues |
|------|-------|--------|--------|
| color-conversions.ts | 172 | Clean | Precise OKLab/OKLCH implementation, no bugs |
| hct-utils.ts | 83 | Clean | Proper Material Design 3 HCT wrapper |

### Node Operations (Store Hooks)

| File | Lines | Status | Issues |
|------|-------|--------|--------|
| useNodeCreation.ts | 1,728 | Minor issues | Spiral collision spacing (50px) inconsistent with canvas minimum gap (40px). Bezier control points not validated |
| useNodeMutations.ts | 1,351 | Minor issues | 5-second deferred restoration doesn't handle rapid undo/redo. O(n^2) stale reference cleanup |
| useNodeUpdate.ts | 2,272 | Needs optimization | Recursive descendant propagation. Advanced logic evaluates ALL entries on every update. Token update O(n*m) complexity |

### Token System

| File | Lines | Status | Issues |
|------|-------|--------|--------|
| TokensPanel.tsx | 4,000+ | Functional | Read-only state now unified via useReadOnlyState hook. No critical bugs |
| TokenNodeCard.tsx | ~500 | Clean | Proper token-node rendering |
| useTokenOperations.ts | ~800 | Clean | Token CRUD properly guarded by isSampleMode |

### Store & State Management

| File | Lines | Status | Issues |
|------|-------|--------|--------|
| entity-slice.ts | 42 | Clean | Initializes from getDefaultData() |
| auth-slice.ts | ~170 | Clean | Proper auth state management |
| ui-slice.ts | ~170 | Clean | No issues |
| persistence-middleware.ts | ~90 | Functional | Writes to both IndexedDB + localStorage. Guards: isInitialLoad, isImporting, isSampleMode |
| useProjectOperations.ts | ~800 | Clean | Project CRUD, duplication, community handling |
| usePageThemeOperations.ts | ~500 | Clean | Page/theme switching properly guarded |
| useImportExport.ts | ~400 | Clean | Import validation, export formatting |

### Sync System

| File | Lines | Status | Critical Issues |
|------|-------|--------|-----------------|
| cloud-sync.ts | 851 | Functional | Remote polling disabled (intentional). Token refresh error handling incomplete |
| useCloudSyncAuth.ts | 1,390 | Complex but functional | Parallel fetch optimization working. Stale dirty flags cleared on load |
| useLocalStorageRestore.ts | 297 | Risk | saveAllToDB() clear-then-insert pattern risks data loss on quota errors |
| db/index.ts | 325 | Risk | saveAllToDB() not safely transactional. syncLog table can grow unbounded |
| db/migrate-from-localstorage.ts | 115 | Risk | Migration flag could be set before data fully persisted |
| tab-channel.ts | 252 | Functional | Leader election works. Falls back gracefully if IndexedDB unavailable |

### Routing & Templates

| File | Lines | Status | Critical Issues |
|------|-------|--------|-----------------|
| useUrlRouting.ts | 311 | Fixed | Duplicate routing removed from App.tsx. isInitialLoad guards in place. Sample-project URL guard active |
| useSampleTemplates.ts | 399 | Critical bug | NO FALLBACK when backend returns empty templates. handleSwitchSampleTemplate now uses atomic setState (fixed) |
| useSessionLock.ts | 185 | Bugs | Heartbeat errors silently swallowed. Lock state not auto-cleared on project switch |
| useReadOnlyState.ts | 58 | Clean | Single source of truth for read-only state |

### Backend

| File | Lines | Status | Issues |
|------|-------|--------|--------|
| db.ts | ~750 | Clean | 9 tables + session lock columns. Parameterized queries (SQL injection safe) |
| routes/projects.ts | ~300 | Clean | Cloud sync endpoints with ownership verification |
| routes/templates.ts | ~120 | Clean | Public templates + starred template endpoints |
| routes/community.ts | ~300 | Clean | Publish/unpublish with slug generation |
| routes/dev.ts | ~400 | Clean | Webhook pipeline, token pull API with rate limiting |
| routes/auth.ts | ~50 | Clean | Supabase JWT verification |
| computation/pipeline.ts | ~200 | Clean | Color pipeline execution |
| computation/advanced-logic-engine.ts | ~1,500 | Many unused exports | 12+ exported functions only used internally |

---

## CRITICAL BUGS (Must Fix)

### Bug 1: Sample Project Shows No Data on Refresh
**Severity:** HIGH
**Root cause:** When backend `/templates` endpoint is slow or returns empty, `sampleTemplates` is `[]`. `handleSwitchSampleTemplate(0)` gets `undefined` template and returns silently. Canvas shows empty/stale data.
**Fix:** Add a minimal hardcoded fallback OR ensure the template loading gate blocks rendering until templates arrive (partially fixed but not complete for all paths).

### Bug 2: Non-Atomic Template Switch (Cloud Data Leak)
**Severity:** HIGH (Security)
**Root cause:** Previously 8 separate setState calls created a window where activePageId pointed to a cloud project while nodes were being swapped. Canvas rendered cloud nodes in sample project view.
**Status:** FIXED — handleSwitchSampleTemplate now uses single atomic useStore.setState()

### Bug 3: Session Lock False Positives
**Severity:** MEDIUM
**Root cause:** (a) Heartbeat `catch {}` swallows network errors, treating them as lock takeover. (b) lockState not auto-cleared when switching to a different project.
**Fix:** Distinguish network errors from actual takeover. Auto-clear lockState when activeProjectId changes.

### Bug 4: IndexedDB saveAllToDB() Data Loss Risk
**Severity:** MEDIUM (rare but catastrophic)
**Root cause:** `saveAllToDB()` clears all tables then bulk-inserts. If insert fails (quota exceeded), data is gone. Dexie transaction rollback should prevent this, but edge cases exist.
**Fix:** Insert first, then clear old data. Or use put() instead of clear()+add().

---

## PERFORMANCE HOTSPOTS

| Location | Issue | Impact | Fix |
|----------|-------|--------|-----|
| ColorNodeCard.tsx | Color conversion helpers redefined every render | High on large canvases | Extract to module scope |
| ColorNodeCard.tsx | getDiffProps called 13x per render | Medium | useMemo |
| ColorNodeCard.tsx | Perceived brightness runs unconditionally | Medium | useMemo + conditional |
| ColorCanvas.tsx | Connections array recalculated every render | Medium on 100+ nodes | useMemo |
| useNodeUpdate.ts | Descendant propagation is recursive | Medium on deep hierarchies | Iterative + caching |
| useNodeUpdate.ts | Advanced logic evaluates ALL entries per update | Medium with many logic rules | Evaluate only changed channels |
| useNodeMutations.ts | O(n^2) stale reference cleanup | Low-Medium on large projects | Use Set for lookups |

---

## DEAD CODE

| File | What | Action |
|------|------|--------|
| app-helpers.ts | 15 exported functions never imported | Remove |
| App.css | 36 unused CSS classes | Remove |
| advanced-logic-engine.ts (backend) | 12+ exports only used internally | Change to non-exported |
| tokenFormatters.ts (backend) | 3 unused exports | Remove or mark internal |

---

## SECURITY ASSESSMENT

| Area | Status | Notes |
|------|--------|-------|
| SQL injection | Safe | All queries use parameterized $1, $2 syntax |
| XSS | Safe | React's JSX escaping handles output |
| Auth token storage | Improved | Access token now in-memory only (stripped from localStorage) |
| CORS | Permissive | `origin: '*'` in backend — should restrict in production |
| Rate limiting | Present | Token pull API: 100 req/hr per project |
| Session locking | Functional | Same-user can re-acquire own locks. Heartbeat error handling needs improvement |
| Sample project isolation | Correct | Sample data never synced to cloud. Cloud data properly filtered by projectId+pageId |

---

## ARCHITECTURE ASSESSMENT

### What's Good
- Clean separation: store slices, hooks, components
- Zustand store with middleware (undo, persistence)
- Cloud sync with dirty-state tracking and batch operations
- Multi-tab coordination via BroadcastChannel + leader election
- IndexedDB as primary persistence with localStorage fallback
- Centralized read-only state via useReadOnlyState hook
- URL-based routing with proper guards

### What Needs Improvement
- **Non-atomic state updates** — Most multi-entity operations should use `useStore.setState({...})` instead of individual setter calls
- **Template loading resilience** — Need fallback when backend is unavailable
- **Session lock robustness** — Need proper error handling in heartbeat, auto-clear stale states
- **IndexedDB safety** — saveAllToDB should be insert-first, clear-after (not clear-first)
- **Console noise** — 243 console.log statements (production build strips them via esbuild.pure config)

### Infrastructure Notes
- Backend runs on Railway (production) and localhost:4455 (dev)
- Frontend on Cloudflare Pages (production) and localhost:3000 (dev)
- **Backend changes not yet deployed to Railway** — session locking, starred template, lock columns only work locally
- Database on Railway PostgreSQL (moving to Supabase Pro for 7-day backups)
- Supabase used only for auth (JWT verification), not data storage

---

## RECOMMENDED NEXT STEPS (Priority Order)

1. **Deploy backend to Railway** — session locking and starred template endpoints only work locally
2. **Add sample template fallback** — prevent blank canvas when backend is slow
3. **Fix session lock error handling** — distinguish network errors from actual takeover
4. **Fix IndexedDB saveAllToDB safety** — insert-first pattern to prevent data loss
5. **Performance: memoize ColorNodeCard** — extract color helpers, useMemo for diff props
6. **Performance: memoize ColorCanvas connections** — useMemo with node dependencies
7. **Remove dead code** — 15 unused exports, 36 unused CSS classes
8. **Restrict CORS in production** — change `origin: '*'` to specific domains
