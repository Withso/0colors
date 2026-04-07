# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: a11y.audit.ts >> Accessibility smoke >> projects dashboard has no serious or critical accessibility violations
- Location: packages/frontend/tests/e2e/a11y.audit.ts:17:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: ""
Received: "color-contrast: Elements must meet minimum color contrast ratio thresholds"
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - heading "0colors" [level=1] [ref=e7]
      - paragraph [ref=e8]: 1 projects
    - navigation [ref=e9]:
      - button "Projects" [ref=e10] [cursor=pointer]:
        - img [ref=e11]
        - text: Projects
      - button "Community" [ref=e13] [cursor=pointer]:
        - img [ref=e14]
        - text: Community
    - button "Sign in" [ref=e19] [cursor=pointer]:
      - img [ref=e20]
      - text: Sign in
  - main [ref=e23]:
    - generic [ref=e24]:
      - generic [ref=e25]:
        - heading "Projects" [level=1] [ref=e26]
        - button "Import" [ref=e28] [cursor=pointer]:
          - img [ref=e29]
          - text: Import
      - generic [ref=e32]:
        - generic [ref=e34]:
          - generic [ref=e35]: Cloud Projects
          - generic [ref=e36]: "1"
          - button "Force re-download all cloud projects from server" [ref=e37] [cursor=pointer]:
            - img [ref=e38]
        - generic [ref=e44] [cursor=pointer]:
          - generic [ref=e46]: Sample Project
          - generic [ref=e47]:
            - img [ref=e48]
            - text: Read-only
          - generic [ref=e51]: 10 tokens · 1 nodes
      - generic [ref=e52]:
        - generic [ref=e53]:
          - generic [ref=e54]:
            - generic [ref=e55]: Local Projects
            - generic [ref=e56]: "0"
          - button "New local project" [ref=e57] [cursor=pointer]:
            - img [ref=e58]
            - text: New local project
        - generic [ref=e60]: No projects yet
```

# Test source

```ts
  1  | import AxeBuilder from '@axe-core/playwright';
  2  | import { expect, test, type Page } from '@playwright/test';
  3  | import { clearStorage, openEditorWithNewLocalProject } from './helpers';
  4  | 
  5  | function seriousViolationsOnly(page: Page) {
  6  |   return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  7  | }
  8  | 
  9  | function summarizeSerious(violations: Awaited<ReturnType<typeof seriousViolationsOnly>>['violations']) {
  10 |   return violations
  11 |     .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
  12 |     .map((violation) => `${violation.id}: ${violation.help}`)
  13 |     .join('\n');
  14 | }
  15 | 
  16 | test.describe('Accessibility smoke', () => {
  17 |   test('projects dashboard has no serious or critical accessibility violations', async ({ page }) => {
  18 |     await clearStorage(page);
  19 |     await page.goto('/projects');
  20 |     await page.getByTestId('page-projects').waitFor({ state: 'visible', timeout: 120_000 });
  21 | 
  22 |     const results = await seriousViolationsOnly(page);
  23 |     const severe = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
> 24 |     expect(summarizeSerious(severe)).toBe('');
     |                                      ^ Error: expect(received).toBe(expected) // Object.is equality
  25 |   });
  26 | 
  27 |   test('advanced popup has no serious or critical accessibility violations in its visible state', async ({ page }) => {
  28 |     await clearStorage(page);
  29 |     await openEditorWithNewLocalProject(page);
  30 |     await page.getByTestId('canvas-bottom-add-node-trigger').click();
  31 |     await page.getByTestId('canvas-bottom-add-node-hsl').click();
  32 | 
  33 |     const nodeCard = page.locator('[data-testid^="canvas-node-card-"]').first();
  34 |     await expect(nodeCard).toBeVisible({ timeout: 15_000 });
  35 |     await nodeCard.click();
  36 | 
  37 |     const openAdvanced = page.locator('[data-testid^="canvas-node-advanced-open-"]').first();
  38 |     await openAdvanced.click();
  39 |     const popup = page.locator('[data-testid^="advanced-popup-panel-"]').first();
  40 |     await expect(popup).toBeVisible({ timeout: 10_000 });
  41 | 
  42 |     const results = await new AxeBuilder({ page })
  43 |       .include('[data-testid^="advanced-popup-panel-"]')
  44 |       .withTags(['wcag2a', 'wcag2aa'])
  45 |       .analyze();
  46 |     const severe = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  47 |     expect(summarizeSerious(severe)).toBe('');
  48 |   });
  49 | });
  50 | 
```