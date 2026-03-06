Complete Guide: Rebuilding Google's Material Theme Builder in 0colors
1. Project Structure Overview
Project name: Material Theme Builder

Themes (2):

Theme	Role
Light	Primary theme (default)
Dark	Secondary theme
Pages (4):

Page	Purpose
Source & Key Colors	Seed node + 6 key color derivations
Tonal Palettes	6 palette nodes generating all tonal scales
Semantic Tokens	~35 color role token nodes (primary, onPrimary, surface, etc.)
Component Tokens	Aliases to semantic tokens for specific UI components
2. Page 1 — Source & Key Colors
All nodes use HCT color space. This is critical — Material Design 3 is built entirely on HCT (Hue, Chroma, Tone) from @material/material-color-utilities, which 0colors already ships.

Node Tree (7 nodes)
Seed (root)
├── Primary (child)
├── Secondary (child)
├── Tertiary (child)
├── Neutral (child)
└── Neutral Variant (child)

Error (independent root)
Node Configuration Table
Node Name	Parent	Color Space	H	C	T	Lock H	Lock C	Lock T	Diff H	Diff C	Diff T
Seed	— (root)	HCT	user-chosen (e.g., 270)	user-chosen (e.g., 36)	50	—	—	—	—	—	—
Primary	Seed	HCT	inherit	48	40	✗	✓	✓	off	off	off
Secondary	Seed	HCT	inherit	16	40	✗	✓	✓	off	off	off
Tertiary	Seed	HCT	inherit	24	40	✗	✓	✓	+60° offset	off	off
Neutral	Seed	HCT	inherit	4	50	✗	✓	✓	off	off	off
Neutral Variant	Seed	HCT	inherit	8	50	✗	✓	✓	off	off	off
Error	— (root)	HCT	25	84	40	✓	✓	✓	—	—	—
How to set this up:

Create Seed as an HCT root node. Set H=270, C=36, T=50 (example starting values).
Create each key color as a child of Seed (click "+ child" on Seed).
For each child: turn Diff off for H (so it matches parent exactly), Lock C and set the fixed chroma value, Lock T and set the tone value.
For Tertiary: keep Diff H on with +60 offset, Lock C=24, Lock T=40.
Error is a standalone root node — Lock all three channels.
Advanced Logic on Key Color Nodes (optional, for M3 fidelity)
These are the exact M3 algorithms for deriving key colors from the seed. Open the Advanced Logic Popup (fx button) on each node:

Node	Channel	Advanced Logic Expression
Primary	hctC	max(@Parent.hctC, 48)
Neutral	hctC	clamp(0, @Parent.hctC / 12, 4)
Neutral Variant	hctC	clamp(0, @Parent.hctC / 6, 8)
Primary ensures minimum chroma of 48 (if seed chroma is below 48, primary gets boosted).
Neutral derives chroma as 1/12th of seed chroma, capped at 4.
Neutral Variant derives chroma as 1/6th of seed chroma, capped at 8.
Secondary and Tertiary use fixed chroma values, so no advanced logic is needed.
How to enter this in the Advanced Popup:

Click the fx button on the Primary node
In the hctC channel column, click to add a row
Type: max( → then click @Parent → then .hctC → then , 48)
Click Save (or Play to preview)
3. Page 2 — Tonal Palettes
You have two approaches. Choose based on your preference:

Approach A: Palette Nodes (recommended — compact visual)
Create 6 palette nodes, one per key color. Each palette node is a child of its key color from Page 1 (cross-page parent-child link).

Palette Node	Parent (from Page 1)	Shade Count	Curve Type	Lightness Start	Lightness End	Saturation Mode	Auto-Assign Prefix	Naming
Primary Palette	Primary	13	custom	0	100	constant	primary	100-900*
Secondary Palette	Secondary	13	custom	0	100	constant	secondary	100-900*
Tertiary Palette	Tertiary	13	custom	0	100	constant	tertiary	100-900*
Neutral Palette	Neutral	17	custom	0	100	constant	neutral	100-900*
Neutral Variant Palette	Neutral Variant	13	custom	0	100	constant	neutral-variant	100-900*
Error Palette	Error	13	custom	0	100	constant	error	100-900*
* Naming pattern 100-900 won't match M3 tone names. You'll need to rename tokens after auto-assign to match M3 convention (e.g., primary-100 → primary-0, primary-200 → primary-10, etc.).

Custom Curve Points (these are the exact M3 tone values, normalized 0-1):

For accent palettes (Primary, Secondary, Tertiary, Error) — 13 tones:

[0, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 0.99, 1.0]
This generates tones: 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100

For Neutral palette — 17 tones (needs additional surface granularity):

[0, 0.04, 0.06, 0.10, 0.12, 0.17, 0.20, 0.22, 0.24, 0.87, 0.90, 0.92, 0.94, 0.96, 0.98, 0.99, 1.0]
This generates tones: 0, 4, 6, 10, 12, 17, 20, 22, 24, 87, 90, 92, 94, 96, 98, 99, 100

For Neutral Variant palette — 13 tones:

[0, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 0.99, 1.0]
After auto-assign, rename each token to match M3 naming:

Auto-generated name	Rename to
primary-100	primary-0
primary-200	primary-10
primary-300	primary-20
...	...
primary-1300	primary-100
Repeat for all 6 palettes. This gives you the complete M3 tonal token set.

Approach B: Individual Child Nodes (alternative — more control)
Instead of palettes, create individual HCT child nodes per tone value. For each key color, create children with:

H: inherit from parent (Diff off)
C: inherit from parent (Diff off)
T: Locked to the specific tone value
Example for Primary:

Primary (from Page 1)
├── primary-0   (T locked = 0)
├── primary-10  (T locked = 10)
├── primary-20  (T locked = 20)
├── primary-30  (T locked = 30)
├── primary-40  (T locked = 40)
├── primary-50  (T locked = 50)
├── primary-60  (T locked = 60)
├── primary-70  (T locked = 70)
├── primary-80  (T locked = 80)
├── primary-90  (T locked = 90)
├── primary-95  (T locked = 95)
├── primary-99  (T locked = 99)
└── primary-100 (T locked = 100)
Use auto-assign tokens on the Primary node (enable auto-assign, set prefix "primary").

This approach gives you: exact naming, exact tone values, and each node individually addressable. But it creates ~54-70 nodes on this page.

4. Page 3 — Semantic Tokens (Color Roles)
This is where the Light/Dark theme switching happens. Use Token Nodes (prefix + children) with per-theme value token assignments.

Token Node Tree Structure
sys (Token Prefix Node — root namespace)
├── primary (child token node)
├── on-primary
├── primary-container
├── on-primary-container
├── secondary
├── on-secondary
├── secondary-container
├── on-secondary-container
├── tertiary
├── on-tertiary
├── tertiary-container
├── on-tertiary-container
├── error
├── on-error
├── error-container
├── on-error-container
├── surface
├── on-surface
├── surface-variant
├── on-surface-variant
├── outline
├── outline-variant
├── surface-container
├── surface-container-low
├── surface-container-lowest
├── surface-container-high
├── surface-container-highest
├── surface-dim
├── surface-bright
├── inverse-surface
├── inverse-on-surface
├── inverse-primary
├── shadow
└── scrim
Total: 1 prefix + 33 child token nodes = 34 nodes

How to Create This
Add a Token Node to the canvas → name it sys → toggle it as a Prefix node
Add children to sys (right-click → Add child token) for each color role
For each child token node, set the suffix (e.g., primary, on-primary, etc.)
Per-Theme Value Token Assignments
This is the core of theme switching. For each semantic token node, assign different palette tokens per theme:

Click the token dropdown on each node and select the source palette token. Do this separately for Light theme and Dark theme.

Semantic Token	Light Theme → Palette Token	Dark Theme → Palette Token
sys/primary	primary-40	primary-80
sys/on-primary	primary-100	primary-20
sys/primary-container	primary-90	primary-30
sys/on-primary-container	primary-10	primary-90
sys/secondary	secondary-40	secondary-80
sys/on-secondary	secondary-100	secondary-20
sys/secondary-container	secondary-90	secondary-30
sys/on-secondary-container	secondary-10	secondary-90
sys/tertiary	tertiary-40	tertiary-80
sys/on-tertiary	tertiary-100	tertiary-20
sys/tertiary-container	tertiary-90	tertiary-30
sys/on-tertiary-container	tertiary-10	tertiary-90
sys/error	error-40	error-80
sys/on-error	error-100	error-20
sys/error-container	error-90	error-30
sys/on-error-container	error-10	error-90
sys/surface	neutral-98	neutral-6
sys/on-surface	neutral-10	neutral-90
sys/surface-variant	neutral-variant-90	neutral-variant-30
sys/on-surface-variant	neutral-variant-30	neutral-variant-80
sys/outline	neutral-variant-50	neutral-variant-60
sys/outline-variant	neutral-variant-80	neutral-variant-30
sys/surface-container	neutral-94	neutral-12
sys/surface-container-low	neutral-96	neutral-10
sys/surface-container-lowest	neutral-100	neutral-4
sys/surface-container-high	neutral-92	neutral-17
sys/surface-container-highest	neutral-90	neutral-22
sys/surface-dim	neutral-87	neutral-6
sys/surface-bright	neutral-98	neutral-24
sys/inverse-surface	neutral-20	neutral-90
sys/inverse-on-surface	neutral-95	neutral-20
sys/inverse-primary	primary-80	primary-40
sys/shadow	neutral-0	neutral-0
sys/scrim	neutral-0	neutral-0
How to set per-theme assignments:

Switch to Light theme (the primary theme) in the theme switcher
On each semantic token node, click the value token dropdown and select the correct palette token
Switch to Dark theme
On the same token node, the value will show as inherited — click the unlink icon to unlink from primary
Now select the dark-theme palette token
No advanced logic is needed here! The built-in per-theme valueTokenAssignment handles the light/dark switching natively.

5. Page 4 — Component Tokens (Optional)
These are aliases that point from component-specific names to semantic tokens. Same technique — Token Prefix nodes with children pointing to semantic tokens.

Token Node Tree
comp (Token Prefix Node)
├── button (Prefix)
│   ├── filled-container      → sys/primary
│   ├── filled-label          → sys/on-primary
│   ├── outlined-container    → sys/surface
│   ├── outlined-label        → sys/primary
│   ├── tonal-container       → sys/secondary-container
│   └── tonal-label           → sys/on-secondary-container
├── card (Prefix)
│   ├── filled-container      → sys/surface-container-highest
│   ├── elevated-container    → sys/surface-container-low
│   └── outlined-container    → sys/surface
├── fab (Prefix)
│   ├── container             → sys/primary-container
│   └── icon                  → sys/on-primary-container
├── chip (Prefix)
│   ├── container             → sys/surface-container-low
│   ├── label                 → sys/on-surface-variant
│   └── selected-container    → sys/secondary-container
├── navigation (Prefix)
│   ├── container             → sys/surface
│   ├── indicator             → sys/secondary-container
│   └── label                 → sys/on-surface-variant
├── text-field (Prefix)
│   ├── container             → sys/surface-container-highest
│   ├── label                 → sys/on-surface-variant
│   └── input                 → sys/on-surface
└── dialog (Prefix)
    ├── container             → sys/surface-container-high
    ├── headline              → sys/on-surface
    └── body                  → sys/on-surface-variant
These token nodes simply alias semantic tokens — their valueTokenAssignment points to the semantic tokens from Page 3. No per-theme switching needed here because the semantic layer already handles it.

6. Where Advanced Logic IS Needed
Most of the system works with basic parent-child inheritance + per-theme token assignments. Advanced Logic is only needed for:

6a. Key Color Chroma Derivation (Page 1)
Already covered above. Open the fx popup on the node, write the expression in the hctC channel:

Node	Channel	Expression	What it does
Primary	hctC	max(@Parent.hctC, 48)	Ensures min chroma 48
Neutral	hctC	clamp(0, @Parent.hctC / 12, 4)	Proportional chroma, max 4
Neutral Variant	hctC	clamp(0, @Parent.hctC / 6, 8)	Proportional chroma, max 8
6b. Fixed Color Roles (same in both themes)
Shadow and Scrim are always Neutral T0 — no switching needed, same token in both themes.

6c. Surface Tint / Elevation Overlays (advanced, optional)
M3's elevated surfaces blend the primary color onto neutral surfaces at low opacity. If you want to replicate surface1 through surface5 (elevation levels), you'd need computed colors:

Create additional HCT nodes named surface-1 through surface-5 with advanced logic:

Node	Channel	Expression	Purpose
surface-1	hctT	lerp(@Neutral.hctT, @Primary.hctT, 0.05)	5% primary tint on surface
surface-2	hctT	lerp(@Neutral.hctT, @Primary.hctT, 0.08)	8% primary tint
surface-3	hctT	lerp(@Neutral.hctT, @Primary.hctT, 0.11)	11% primary tint
surface-4	hctT	lerp(@Neutral.hctT, @Primary.hctT, 0.12)	12% primary tint
surface-5	hctT	lerp(@Neutral.hctT, @Primary.hctT, 0.14)	14% primary tint
And similarly for hctC:

lerp(@Neutral.hctC, @Primary.hctC, 0.05)
And for hctH:

@Primary.hctH
(Surface tint takes the primary hue)

6d. Conditional Token Assignment (Alternative to per-theme switching)
If you prefer using advanced logic for token assignment instead of per-theme valueTokenAssignment, you can write conditional expressions in the token node's fx popup. However, this is more complex and not necessary since 0colors already supports per-theme assignments natively. Only use this if you need computed/dynamic behavior beyond simple theme switching.

Example for sys/primary using advanced logic token assignment:

if @Self.hctT > 50 then {primary-80} else {primary-40}
This would dynamically switch based on a condition — but again, per-theme assignment is simpler and recommended.

7. Complete Node & Token Count Summary
Page	Nodes	Tokens Created
Source & Key Colors	7 (1 seed + 5 children + 1 error root)	0
Tonal Palettes	6 palette nodes	~72 auto-assigned tokens (13×4 + 17×1 + 13×1)
Semantic Tokens	34 token nodes (1 prefix + 33 children)	33 tokens (auto-created by token nodes)
Component Tokens	~25 token nodes (prefixes + children)	~20 tokens
Total	~72 nodes	~125 tokens
8. Step-by-Step Build Order
Create the project → name it "Material Theme Builder"
Create themes: Rename default theme to "Light", create "Dark" theme
Page 1 → Create Seed HCT node → Add 5 children → Create Error root → Set all channel values and locks → Add advanced logic to Primary, Neutral, Neutral Variant
Page 2 → Create 6 palette nodes as children of their key colors → Configure shade count, custom curve points, auto-assign prefixes → Enable auto-assign → Rename generated tokens to M3 naming convention
Page 3 → Create sys prefix token node → Add 33 child token nodes → In Light theme, assign value tokens to correct palette tokens → Switch to Dark theme, unlink each node, assign dark palette tokens
Page 4 → Create comp prefix → Add component sub-prefixes → Add children pointing to semantic tokens
Test → Change Seed H value → Watch all palettes, semantic tokens, and component tokens update automatically
9. Testing Checklist
 Change Seed Hue → all 6 key colors update H (except Error)
 Change Seed Chroma → Primary C adjusts (min 48), Neutral/NV adjust proportionally
 Switch Light ↔ Dark theme → all semantic tokens flip to correct tone values
 Palette tokens show correct HCT values at each tone level
 Token Table shows correct Figma variable paths: sys/primary, comp/button/filled-container
 Code View exports correct CSS custom properties / design tokens
 Multi-Page Export generates correct token files
10. Key M3 Reference Values Quick-Reference
Chroma values for key colors:

Primary: max(seedC, 48)
Secondary: 16
Tertiary: 24
Neutral: min(seedC/12, 4)
Neutral Variant: min(seedC/6, 8)
Error: 84 (fixed)
Hue derivation:

Primary, Secondary, Neutral, NV: same as seed
Tertiary: seed + 60°
Error: 25° (fixed)
Light scheme tone assignments:

Accent roles: T40 / T100 / T90 / T10
Surface: N98, onSurface N10
Containers: N94 / N96 / N100 / N92 / N90
Dark scheme tone assignments:

Accent roles: T80 / T20 / T30 / T90
Surface: N6, onSurface N90
Containers: N12 / N10 / N4 / N17 / N22
This guide gives you the complete blueprint. The most powerful insight is that 0colors' HCT color space + parent-child inheritance + per-theme token assignments maps almost 1:1 to Material Design 3's architecture — most of the system works without any advanced logic at all, just proper node hierarchy and theme configuration.