# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: node-operations.spec.ts >> Node operations >> add second HSL node after first
- Location: packages/frontend/tests/e2e/node-operations.spec.ts:51:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-testid^="canvas-node-card-"]')
Expected: 2
Received: 3
Timeout:  15000ms

Call log:
  - Expect "toHaveCount" with timeout 15000ms
  - waiting for locator('[data-testid^="canvas-node-card-"]')
    19 × locator resolved to 3 elements
       - unexpected value "3"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - region "Notifications alt+T"
    - generic [ref=e4]:
      - generic [ref=e6]:
        - heading "Project 1" [level=2] [ref=e7]:
          - img [ref=e8] [cursor=pointer]
          - generic "Project 1" [ref=e11]
        - img [ref=e14]
      - generic [ref=e18]:
        - generic [ref=e21]:
          - img
          - textbox "Search variables..." [ref=e22]
          - button [ref=e24] [cursor=pointer]:
            - img [ref=e25]
        - generic [ref=e26]:
          - button "Tokens" [ref=e27] [cursor=pointer]
          - button "Color Palettes" [ref=e28] [cursor=pointer]
        - generic [ref=e33]:
          - generic [ref=e35]:
            - button [ref=e36] [cursor=pointer]:
              - img [ref=e37]
            - generic "Page 1" [ref=e40]
            - button [ref=e41] [cursor=pointer]:
              - img [ref=e42]
            - button [ref=e44] [cursor=pointer]:
              - img [ref=e45]
          - generic [ref=e46]:
            - paragraph [ref=e47]: No variables yet
            - paragraph [ref=e48]: Create variables to organize your colors
        - generic "Resize panel" [ref=e49]:
          - img [ref=e50]
    - generic [ref=e52]:
      - generic [ref=e53]:
        - generic [ref=e54]:
          - generic [ref=e55]:
            - button [ref=e56] [cursor=pointer]:
              - img [ref=e57]
            - button [ref=e61] [cursor=pointer]:
              - img [ref=e62]
          - button [ref=e65] [cursor=pointer]:
            - img [ref=e66]
        - generic [ref=e70]:
          - generic [ref=e72]: Page 1
          - button [ref=e73] [cursor=pointer]:
            - img [ref=e74]
        - generic [ref=e76]:
          - button "Token Table" [ref=e77] [cursor=pointer]:
            - img [ref=e78]
            - generic [ref=e80]: Token Table
          - generic [ref=e81]:
            - generic [ref=e82]:
              - img [ref=e83]
              - generic [ref=e86]: Light
            - button [ref=e87] [cursor=pointer]:
              - img [ref=e88]
      - generic [ref=e90]:
        - button "Sign In" [ref=e92] [cursor=pointer]:
          - img [ref=e93]
          - generic [ref=e96]: Sign In
        - generic:
          - button "AI" [ref=e98] [cursor=pointer]:
            - img [ref=e99]
            - generic [ref=e101]: AI
          - generic [ref=e102]:
            - button [active] [ref=e103] [cursor=pointer]:
              - img [ref=e104]
              - img [ref=e108]
            - button [ref=e110] [cursor=pointer]:
              - img [ref=e111]
            - button [ref=e117] [cursor=pointer]:
              - img [ref=e118]
          - generic [ref=e121]:
            - button [ref=e122] [cursor=pointer]:
              - img [ref=e123]
            - button [ref=e128] [cursor=pointer]:
              - img [ref=e129]
          - button "⌘K" [ref=e132] [cursor=pointer]:
            - img [ref=e133]
            - generic [ref=e135]: ⌘K
          - button [ref=e137] [cursor=pointer]:
            - img [ref=e138]
        - generic [ref=e140]:
          - generic [ref=e141]:
            - button [ref=e142] [cursor=pointer]:
              - img [ref=e143]
            - generic: "2"
          - button [disabled] [ref=e147]:
            - img [ref=e148]
        - generic [ref=e153]:
          - img
          - generic [ref=e154]:
            - generic [ref=e155]:
              - generic [ref=e156]:
                - generic "Drag to move" [ref=e157]:
                  - img [ref=e158]
                - generic "Purple Heart (double-click to rename)" [ref=e166]: Purple Heart
              - generic:
                - button "Auto-assign tokens":
                  - img
            - generic [ref=e167]:
              - button "Add new parent or drag to connect" [ref=e169] [cursor=pointer]:
                - img [ref=e170]
              - button "Add child node or drag to connect" [ref=e172] [cursor=pointer]:
                - img [ref=e173]
              - generic [ref=e176]:
                - generic [ref=e177]:
                  - generic "Hide node" [ref=e178] [cursor=pointer]:
                    - img [ref=e179]
                  - generic [ref=e182]:
                    - button [ref=e183] [cursor=pointer]:
                      - img [ref=e184]
                    - button [ref=e190] [cursor=pointer]:
                      - img [ref=e191]
                  - generic [ref=e194]:
                    - button:
                      - img
                    - textbox "#000000" [ref=e195]: "#9D26D9"
                - combobox [ref=e199] [cursor=pointer]:
                  - generic [ref=e200]: Select token...
                  - img [ref=e201]
                - generic "Resize node" [ref=e204]:
                  - img [ref=e205]
          - generic [ref=e207]:
            - generic [ref=e208]:
              - generic [ref=e209]:
                - generic "Drag to move" [ref=e210]:
                  - img [ref=e211]
                - generic "Barberry (double-click to rename)" [ref=e219]: Barberry
              - generic:
                - button "Auto-assign tokens":
                  - img
            - generic [ref=e220]:
              - button "Add new parent or drag to connect" [ref=e222] [cursor=pointer]:
                - img [ref=e223]
              - button "Add child node or drag to connect" [ref=e225] [cursor=pointer]:
                - img [ref=e226]
              - generic [ref=e229]:
                - generic [ref=e230]:
                  - generic "Hide node" [ref=e231] [cursor=pointer]:
                    - img [ref=e232]
                  - generic [ref=e235]:
                    - button [ref=e236] [cursor=pointer]:
                      - img [ref=e237]
                    - button [ref=e243] [cursor=pointer]:
                      - img [ref=e244]
                  - generic [ref=e247]:
                    - button:
                      - img
                    - textbox "#000000" [ref=e248]: "#D9D926"
                - combobox [ref=e252] [cursor=pointer]:
                  - generic [ref=e253]: Select token...
                  - img [ref=e254]
                - generic "Resize node" [ref=e257]:
                  - img [ref=e258]
          - generic [ref=e260]:
            - generic [ref=e261]:
              - generic [ref=e262]:
                - generic "Drag to move" [ref=e263]:
                  - img [ref=e264]
                - generic "Royal Blue (double-click to rename)" [ref=e272]: Royal Blue
              - button "Auto-assign tokens" [ref=e274] [cursor=pointer]:
                - img [ref=e275]
            - generic [ref=e277]:
              - button "Add new parent or drag to connect" [ref=e279] [cursor=pointer]:
                - img [ref=e280]
              - button "Add child node or drag to connect" [ref=e282] [cursor=pointer]:
                - img [ref=e283]
              - generic [ref=e286]:
                - generic [ref=e287]:
                  - generic "Hide node" [ref=e288] [cursor=pointer]:
                    - img [ref=e289]
                  - generic [ref=e292]:
                    - button [ref=e293] [cursor=pointer]:
                      - img [ref=e294]
                    - button [ref=e300] [cursor=pointer]:
                      - img [ref=e301]
                  - generic [ref=e304]:
                    - button:
                      - img
                    - textbox "#000000" [ref=e305]: "#2656D9"
                - combobox [ref=e309] [cursor=pointer]:
                  - generic [ref=e310]: Select token...
                  - img [ref=e311]
                - generic "Resize node" [ref=e314]:
                  - img [ref=e315]
              - generic [ref=e317]:
                - generic [ref=e319]: Advanced
                - button [ref=e320] [cursor=pointer]:
                  - img [ref=e321]
  - generic [ref=e326]:
    - text: Add Color Node
    - tooltip "Add Color Node" [ref=e327]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { clearStorage, openEditorWithNewLocalProject } from './helpers';
  3  | 
  4  | test.describe('Node operations', () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await clearStorage(page);
  7  |     await openEditorWithNewLocalProject(page);
  8  |   });
  9  | 
  10 |   test('add HSL root node from toolbar', async ({ page }) => {
  11 |     await page.getByTestId('canvas-bottom-add-node-trigger').click();
  12 |     await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
  13 |     await page.getByTestId('canvas-bottom-add-node-hsl').click();
  14 |     await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
  15 |   });
  16 | 
  17 |   test('add palette node', async ({ page }) => {
  18 |     await page.getByTestId('canvas-bottom-add-palette-button').click();
  19 |     await expect(
  20 |       page.locator('[data-testid^="canvas-palette-node-card-"]').first(),
  21 |     ).toBeVisible({ timeout: 45_000 });
  22 |   });
  23 | 
  24 |   test('open token table from toolbar', async ({ page }) => {
  25 |     await page.getByTestId('toolbar-token-table-toggle').click();
  26 |     await expect(page.getByTestId('token-table-popup-panel')).toBeVisible({ timeout: 10_000 });
  27 |     await page.getByTestId('token-table-popup-close-button').click();
  28 |   });
  29 | 
  30 |   test('add RGB root node from toolbar', async ({ page }) => {
  31 |     await page.getByTestId('canvas-bottom-add-node-trigger').click();
  32 |     await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
  33 |     await page.getByTestId('canvas-bottom-add-node-rgb').click();
  34 |     await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
  35 |   });
  36 | 
  37 |   test('add OKLCH root node from toolbar', async ({ page }) => {
  38 |     await page.getByTestId('canvas-bottom-add-node-trigger').click();
  39 |     await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
  40 |     await page.getByTestId('canvas-bottom-add-node-oklch').click();
  41 |     await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
  42 |   });
  43 | 
  44 |   test('add HCT root node from toolbar', async ({ page }) => {
  45 |     await page.getByTestId('canvas-bottom-add-node-trigger').click();
  46 |     await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
  47 |     await page.getByTestId('canvas-bottom-add-node-hct').click();
  48 |     await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
  49 |   });
  50 | 
  51 |   test('add second HSL node after first', async ({ page }) => {
  52 |     // Add first node
  53 |     await page.getByTestId('canvas-bottom-add-node-trigger').click();
  54 |     await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
  55 |     await page.getByTestId('canvas-bottom-add-node-hsl').click();
  56 |     await expect(page.locator('[data-testid^="canvas-node-card-"]').first()).toBeVisible({ timeout: 15_000 });
  57 | 
  58 |     // Wait for menu to close fully before re-opening
  59 |     await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  60 |     await page.waitForTimeout(500);
  61 | 
  62 |     // Add second node
  63 |     await page.getByTestId('canvas-bottom-add-node-trigger').click();
  64 |     await page.getByTestId('canvas-bottom-add-node-menu').waitFor({ state: 'visible', timeout: 15_000 });
  65 |     await page.getByTestId('canvas-bottom-add-node-hsl').click();
  66 | 
  67 |     // Wait for at least 2 node cards
  68 |     const nodes = page.locator('[data-testid^="canvas-node-card-"]');
> 69 |     await expect(nodes).toHaveCount(2, { timeout: 15_000 });
     |                         ^ Error: expect(locator).toHaveCount(expected) failed
  70 |   });
  71 | });
  72 | 
```