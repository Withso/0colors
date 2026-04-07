# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: a11y.audit.ts >> Accessibility smoke >> advanced popup has no serious or critical accessibility violations in its visible state
- Location: packages/frontend/tests/e2e/a11y.audit.ts:27:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: ""
Received: "button-name: Buttons must have discernible text
color-contrast: Elements must meet minimum color contrast ratio thresholds"
```

# Page snapshot

```yaml
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
          - button [ref=e103] [cursor=pointer]:
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
      - generic [ref=e152]:
        - generic [ref=e153]:
          - img
          - generic [ref=e154]:
            - generic [ref=e155]:
              - generic [ref=e156]:
                - generic "Drag to move" [ref=e157]:
                  - img [ref=e158]
                - generic "Persian Blue (double-click to rename)" [ref=e166]: Persian Blue
              - button "Auto-assign tokens" [ref=e168] [cursor=pointer]:
                - img [ref=e169]
            - generic [ref=e171]:
              - button "Add new parent or drag to connect" [ref=e173] [cursor=pointer]:
                - img [ref=e174]
              - button "Add child node or drag to connect" [ref=e176] [cursor=pointer]:
                - img [ref=e177]
              - generic [ref=e180]:
                - generic [ref=e181]:
                  - generic "Hide node" [ref=e182] [cursor=pointer]:
                    - img [ref=e183]
                  - generic [ref=e186]:
                    - button [ref=e187] [cursor=pointer]:
                      - img [ref=e188]
                    - button [ref=e194] [cursor=pointer]:
                      - img [ref=e195]
                  - generic [ref=e198]:
                    - button:
                      - img
                    - textbox "#000000" [ref=e199]: "#2650D9"
                - combobox [ref=e203] [cursor=pointer]:
                  - generic [ref=e204]: Select token...
                  - img [ref=e205]
                - generic "Resize node" [ref=e208]:
                  - img [ref=e209]
              - generic [ref=e211]:
                - generic [ref=e213]: Advanced
                - button [active] [ref=e214] [cursor=pointer]:
                  - img [ref=e215]
          - generic [ref=e219]:
            - generic [ref=e220]:
              - generic [ref=e221]:
                - generic "Drag to move" [ref=e222]:
                  - img [ref=e223]
                - generic "Orange Roughy (double-click to rename)" [ref=e231]: Orange Roughy
              - button "Auto-assign tokens" [ref=e233] [cursor=pointer]:
                - img [ref=e234]
            - generic [ref=e236]:
              - button "Add new parent or drag to connect" [ref=e238] [cursor=pointer]:
                - img [ref=e239]
              - button "Add child node or drag to connect" [ref=e241] [cursor=pointer]:
                - img [ref=e242]
              - generic [ref=e245]:
                - generic [ref=e246]:
                  - generic "Hide node" [ref=e247] [cursor=pointer]:
                    - img [ref=e248]
                  - generic [ref=e251]:
                    - button [ref=e252] [cursor=pointer]:
                      - img [ref=e253]
                    - button [ref=e259] [cursor=pointer]:
                      - img [ref=e260]
                  - generic [ref=e263]:
                    - button:
                      - img
                    - textbox "#000000" [ref=e264]: "#D96226"
                - combobox [ref=e268] [cursor=pointer]:
                  - generic [ref=e269]: Select token...
                  - img [ref=e270]
                - generic "Resize node" [ref=e273]:
                  - img [ref=e274]
            - button "Auto-assign tokens" [ref=e279] [cursor=pointer]:
              - img [ref=e281]
              - generic [ref=e283]: Auto-assign tokens
              - img [ref=e284]
        - generic [ref=e287]:
          - generic [ref=e289]:
            - generic [ref=e290]:
              - img [ref=e291]
              - generic [ref=e295]: Advanced
              - generic [ref=e296]: Persian Blue
            - generic [ref=e297]:
              - button "Minimize" [ref=e298] [cursor=pointer]:
                - img [ref=e299]
              - button [ref=e300] [cursor=pointer]:
                - img [ref=e301]
          - generic [ref=e306]:
            - generic [ref=e307]:
              - generic [ref=e308]:
                - generic [ref=e311]: HSL
                - generic [ref=e312]:
                  - generic [ref=e313]:
                    - generic [ref=e314]: Hue
                    - generic [ref=e315]: 226°
                  - generic [ref=e316]:
                    - generic [ref=e317]: Saturation
                    - generic [ref=e318]: 70%
                  - generic [ref=e319]:
                    - generic [ref=e320]: Lightness
                    - generic [ref=e321]: 50%
                  - generic [ref=e322]:
                    - generic [ref=e323]: Alpha
                    - generic [ref=e324]: 100%
                - generic [ref=e326]:
                  - generic [ref=e327]: Hex
                  - generic [ref=e328]: "#2650D9"
                - button "Node View" [ref=e331] [cursor=pointer]:
                  - img [ref=e332]
                  - generic [ref=e334]: Node View
              - button "Reference Guide" [ref=e336] [cursor=pointer]:
                - img [ref=e337]
                - generic [ref=e340]: Reference Guide
            - generic [ref=e341]:
              - generic [ref=e342]:
                - generic [ref=e344]: Hue
                - generic [ref=e346]: 226°
              - button "Add condition" [ref=e348] [cursor=pointer]:
                - img [ref=e349]
                - generic [ref=e350]: Add condition
              - generic [ref=e351]:
                - generic [ref=e352]: Fallback
                - generic [ref=e353]: 226°
            - generic [ref=e354]:
              - generic [ref=e355]:
                - generic [ref=e357]: Saturation
                - generic [ref=e359]: 70%
              - button "Add condition" [ref=e361] [cursor=pointer]:
                - img [ref=e362]
                - generic [ref=e363]: Add condition
              - generic [ref=e364]:
                - generic [ref=e365]: Fallback
                - generic [ref=e366]: 70%
            - generic [ref=e367]:
              - generic [ref=e368]:
                - generic [ref=e370]: Lightness
                - generic [ref=e372]: 50%
              - button "Add condition" [ref=e374] [cursor=pointer]:
                - img [ref=e375]
                - generic [ref=e376]: Add condition
              - generic [ref=e377]:
                - generic [ref=e378]: Fallback
                - generic [ref=e379]: 50%
            - generic [ref=e380]:
              - generic [ref=e381]:
                - generic [ref=e383]: Alpha
                - generic [ref=e385]: "100"
              - button "Add condition" [ref=e387] [cursor=pointer]:
                - img [ref=e388]
                - generic [ref=e389]: Add condition
              - generic [ref=e390]:
                - generic [ref=e391]: Fallback
                - generic [ref=e392]: "100"
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
  24 |     expect(summarizeSerious(severe)).toBe('');
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
> 47 |     expect(summarizeSerious(severe)).toBe('');
     |                                      ^ Error: expect(received).toBe(expected) // Object.is equality
  48 |   });
  49 | });
  50 | 
```