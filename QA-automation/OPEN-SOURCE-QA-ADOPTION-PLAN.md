# Open-Source QA Adoption Plan

## Goal

Keep the QA stack lightweight, deterministic, and outside the product bundle while scaling coverage for logic-heavy workflows.

## Bundling Policy

- `QA-automation/` is repo tooling and documentation. It does not bundle into the shipped app.
- `scripts/` are Node-side automation helpers. They do not bundle into the shipped app.
- `packages/frontend/src/**/*.test.*` and `packages/frontend/tests/e2e/*` are test sources. They do not bundle into the shipped app.
- `packages/frontend/public/qa-reports/*` and `packages/frontend/public/qa-docs/*` are static QA artifacts for the admin QA hub.
- `packages/frontend/src/components/admin/AdminQaDashboard.tsx` is app code because the QA hub is rendered in-app for admins, but it should remain lazy-loaded so non-QA app flows do not pay for it eagerly.

## Lightweight Tooling Stack

### Keep

- `@playwright/test`
  For real browser workflows and cross-surface checks.
- `vitest`
  For unit, domain, property, component, and integration layers.
- `@testing-library/react`
  For component behavior checks.
- `@testing-library/user-event`
  For realistic interaction in component tests.
- `fast-check`
  For generated/property and model-based testing.

### Add Next

- `msw`
  For deterministic mocked network flows shared across component, integration, and browser tests.
- `axe-core`
  For accessibility regression checks in key UI workflows.

### Add Later

- `@stryker-mutator/core` plus JS/TS runner
  For mutation testing on high-risk logic modules only.

## Adoption Order

1. Color engine pack
   Files:
   - `packages/frontend/src/utils/color-conversions.ts`
   - `packages/frontend/src/utils/hct-utils.ts`

   Add:
   - round-trip tolerance tests
   - gamut edge tests
   - cross-space equivalence checks

2. Token/theme propagation pack
   Files:
   - `packages/frontend/src/utils/computed-tokens.ts`
   - `packages/frontend/src/utils/visibility.ts`

   Add:
   - theme unlink/link matrices
   - token-node owner/value-token chain checks
   - hidden node/token behavior
   - consistency checks for table/export/code outputs

3. Store mutation pack
   Files:
   - `packages/frontend/src/store/useNodeMutations.ts`
   - `packages/frontend/src/store/usePageThemeOperations.ts`
   - `packages/frontend/src/store/useImportExport.ts`

   Add:
   - integration tests around mutations and persistence
   - import/export round-trip state integrity

4. Workflow pack
   Files:
   - `packages/frontend/tests/e2e/*.spec.ts`

   Add:
   - multi-surface business workflows
   - persistence/reload checks
   - token/theme/advanced-logic end-to-end journeys

5. QA hub metadata upgrade
   Add richer case metadata:
   - `kind`
   - `scenarioId`
   - `subcaseCount`
   - `surfacesChecked`
   - `stepList`
   - `generatedRuns`
   - `assertionCount`

## Guardrails

- Keep all heavy QA dependencies in `devDependencies`.
- Prefer pure-domain tests over browser tests when logic combinations explode.
- Use Playwright for business-critical workflows, not combinatorial math.
- Keep QA JSON and docs in `public/` only for the admin QA hub, not as runtime business logic.
- Lazy-load QA UI and admin-only tooling surfaces.

## Success Criteria

- A full run remains fast enough for daily use.
- Logic-heavy areas get deep coverage without pushing everything into Playwright.
- The shipped app bundle is not inflated by test sources or Node-side QA tooling.
- The QA hub explains not only pass/fail, but also what workflow or matrix was proven.
