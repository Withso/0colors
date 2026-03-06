# 0colors AI Knowledge Base

> This document is the comprehensive reference used by the AI assistant
> to answer questions about 0colors. Every fact must be verifiable
> against the source code. Accuracy is critical.

---

## 1. What Is 0colors?

0colors is a node-based color design token tool. Users create color nodes
on an infinite canvas, link them in parent-child hierarchies, assign tokens,
and use advanced logic expressions to create dynamic, responsive color systems.

Key concepts:
- **Color Nodes**: Visual units on the canvas representing a single color value
- **Parent-Child Hierarchy**: Nodes link together; children inherit from parents
- **Lock / Diff System**: Fine-grained control over which properties inherit and how
- **Advanced Logic**: Per-channel expression system for dynamic color derivation
- **Design Tokens**: Named, exportable color references attached to nodes
- **Token Nodes**: Special nodes that ARE tokens (with prefix/suffix naming)
- **Multi-Theme**: Separate color values per theme (Light, Dark, etc.)
- **Multi-Page**: Organize nodes across pages within a project
- **Palette System**: Generate tonal scales with automatic shade creation

---

## 2. Color Spaces

0colors supports 5 color spaces. Each node is set to one color space.

| Space | Channels | Ranges | Best For |
|-------|----------|--------|----------|
| **HSL** | Hue, Saturation, Lightness, Alpha | H: 0-360, S: 0-100, L: 0-100, A: 0-100 | General purpose, familiar |
| **RGB** | Red, Green, Blue, Alpha | R: 0-255, G: 0-255, B: 0-255, A: 0-100 | Direct screen color control |
| **OKLCH** | Lightness, Chroma, Hue, Alpha | L: 0-100, C: 0-100, H: 0-360, A: 0-100 | Perceptually uniform color work |
| **HCT** | Hue, Chroma, Tone, Alpha | H: 0-360, C: 0-120, T: 0-100, A: 0-100 | Material Design 3 systems |
| **HEX** | (Displays as HSL internally) | Standard hex notation | Quick hex input |

### Channel Ranges and Constraints

Hue channels (H in HSL/OKLCH/HCT) use **wrap** mode: values above 360 wrap around (e.g., 370 becomes 10).

All other channels use **clamp** mode: values are clamped to their range (e.g., Lightness of 110 becomes 100).

### Property Keys for Advanced Logic

When referencing channels in expressions, use these exact keys:

| Color Space | Property Keys |
|------------|--------------|
| HSL | `hue`, `saturation`, `lightness`, `alpha` (shortcuts: `h`, `s`, `l`, `a`) |
| RGB | `red`, `green`, `blue`, `alpha` (shortcuts: `r`, `g`, `b`, `a`) |
| OKLCH | `oklchL`, `oklchC`, `oklchH`, `alpha` |
| HCT | `hctH`, `hctC`, `hctT`, `alpha` |

Short property names in the expression editor:

| Display | Full Key | Short |
|---------|---------|-------|
| H (HSL) | `hue` | `.H` |
| S (HSL) | `saturation` | `.S` |
| L (HSL) | `lightness` | `.L` |
| A | `alpha` | `.A` |
| R | `red` | `.R` |
| G | `green` | `.G` |
| B | `blue` | `.B` |
| L (OKLCH) | `oklchL` | `.L` |
| C (OKLCH) | `oklchC` | `.C` |
| H (OKLCH) | `oklchH` | `.H` |
| H (HCT) | `hctH` | `.H` |
| C (HCT) | `hctC` | `.C` |
| T (HCT) | `hctT` | `.T` |

### Cross-Space Reads

When a node is in HCT mode, you can still read its RGB values via `@Self.R`, `@Self.G`, `@Self.B`. The engine converts internally. All channels are always available regardless of the node's color space.

---

## 3. Node System

### Node Types

1. **Root Node**: No parent. Independent color value. Created on the canvas.
2. **Child Node**: Has a parent. Inherits properties based on lock/diff settings.
3. **Token Prefix Node**: `isTokenPrefix = true`. Acts as a namespace (e.g., "sys"). Has no token of its own.
4. **Token Node**: `isTokenNode = true`. IS a token itself. Has `tokenNodeSuffix` for naming. Has `ownTokenId` (the token it represents) and `valueTokenId` / `valueTokenAssignments` (which palette token it references per theme).
5. **Palette Node**: `isPalette = true`. Generates shade children automatically with customizable distribution curves.
6. **Spacing Node**: `isSpacing = true`. Holds numeric spacing values instead of colors.

### Node Properties

Every node has:

| Property | Description |
|----------|------------|
| `id` | Unique identifier |
| `colorSpace` | 'hsl', 'rgb', 'oklch', 'hct', or 'hex' |
| `position` | { x, y } on the canvas |
| `parentId` | ID of parent node (null for root) |
| `width` | Display width in pixels (default: 240) |
| `isExpanded` | Whether the node detail view is expanded |
| `referenceName` | User-visible name for the node |
| `referenceNameLocked` | If true, name won't auto-update |
| `projectId` | Which project this node belongs to |
| `pageId` | Which page this node is on |

Color values (per color space):
- HSL: `hue`, `saturation`, `lightness`, `alpha`
- RGB: `red`, `green`, `blue`
- OKLCH: `oklchL`, `oklchC`, `oklchH`
- HCT: `hctH`, `hctC`, `hctT`
- HEX: `hexValue`, `hexLocked`

### Creating Nodes

- Click on empty canvas to create a root node
- Drag the connection button from a node to create a child
- Or drag a connection wire from one node to another to reparent

---

## 4. Lock and Diff System

The Lock and Diff system controls how child nodes inherit values from parents.

### Lock

**When LOCKED** (`lockHue: true`):
- The property does NOT change when the parent changes
- The value stays fixed at whatever it was set to
- Lock icon shows as blue/active

**When UNLOCKED** (`lockHue: false` or undefined):
- The property inherits from parent based on diff state

### Diff

**When DIFF ENABLED** (`diffHue: true`):
- Child maintains an **offset** from parent
- `child value = parent value + offset`
- When parent changes, child moves by the same amount

**When DIFF DISABLED** (`diffHue: false` or undefined):
- Child **matches parent exactly**
- `child value = parent value`
- Offset is ignored

### Priority Rule

**Lock always wins.** If a property is locked, diff state is irrelevant.

| Lock | Diff | Behavior |
|------|------|----------|
| Locked | Any | Value stays fixed, no inheritance |
| Unlocked | Enabled | child = parent + offset |
| Unlocked | Disabled | child = parent (exact match) |

### Practical Examples

**Exact parent match (default for new children):**
All locks off, all diffs off. Child = Parent for all channels.

**Independent child:**
All properties locked. Child never changes when parent changes.

**Hue offset, same lightness:**
`lockHue: false, diffHue: true, hueOffset: 30` — child hue is always parent + 30.
`lockLightness: false, diffLightness: false` — child lightness matches parent exactly.

**Fixed chroma, inherited hue and tone (HCT):**
`lockHctH: false, diffHctH: false` — inherits H from parent
`lockHctC: true` — C stays at whatever you set it to
`lockHctT: false, diffHctT: false` — inherits T from parent

This is the exact pattern used for key color nodes in Material Theme!

### Offset Properties

Each inheritable channel has an offset stored on the node:
- `hueOffset`, `saturationOffset`, `lightnessOffset`, `alphaOffset`
- `redOffset`, `greenOffset`, `blueOffset`
- `oklchLOffset`, `oklchCOffset`, `oklchHOffset`
- `hctHOffset`, `hctCOffset`, `hctTOffset`

Offsets are calculated when the user adjusts a child with diff enabled:
`offset = childValue - parentValue`

---

## 5. Advanced Logic System

### Overview

Each node can have **Advanced Logic** — per-channel expressions that dynamically compute the node's color values. This is the core power feature of 0colors.

There are TWO types of advanced logic:

1. **Channel Logic**: Runs on each color channel (H, S, L, etc.) of a regular color node
2. **Token Assignment Logic**: Runs on token nodes to determine which token to reference per theme

### How Expressions Work

- Each channel gets its own **column** of expression rows
- Rows evaluate **top-to-bottom**
- Each row has an **output variable** (default: `out_1`, `out_2`, etc. — renameable)
- The **last row that produces a valid number** becomes the channel's output
- Rows that produce **booleans** are stored as variables but don't set the channel
- If no row produces a valid number, the **fallback** is used (parent's value or custom)
- Row variables from earlier rows can be referenced as `$varName` in later rows

### Expression Syntax

#### References

| Syntax | Meaning | Example |
|--------|---------|---------|
| `@Parent.property` | Parent node's property | `@Parent.hctH` |
| `@Self.property` | This node's own property | `@Self.hctC` |
| `@NodeName.property` | Any node by reference name | `@Seed.hctH` |
| `{token-name}` | Design token (token assignment only) | `{primary-40}` |
| `{token-name}.property` | Token's property value | `{primary-40}.hctT` |
| `$varName` | Local variable from earlier row | `$out_1`, `$seedH` |
| `locked` | Current base value (prevents feedback loops) | `locked` |

#### Keywords

| Keyword | Usage |
|---------|-------|
| `if` | Start conditional: `if <condition> then <value> else <fallback>` |
| `then` | Separates condition from true branch |
| `else` | Separates true branch from false branch (OPTIONAL — if omitted, false falls through) |
| `AND` | Logical AND in conditions |
| `OR` | Logical OR in conditions |
| `true` / `false` | Boolean literals |
| `locked` | Resolves to the channel's pre-logic base value |

#### Operators

| Operator | Description | Example |
|----------|------------|---------|
| `+` | Add | `@Parent.H + 30` |
| `-` | Subtract | `@Self.L - 10` |
| `*` | Multiply | `@Parent.S * 0.5` |
| `/` | Divide (safe: /0 = 0) | `@Self.L / 2` |
| `%` | Modulo | `@Self.H % 60` |
| `>` | Greater than | `@Parent.L > 50` |
| `<` | Less than | `@Self.S < 10` |
| `>=` | Greater or equal | `@Self.H >= 180` |
| `<=` | Less or equal | `@Parent.A <= 50` |
| `==` | Equal (0.001 tolerance) | `@Self.R == 255` |
| `!=` | Not equal | `@Parent.H != 0` |

### All Functions (34 total)

#### Core Math (12 functions)

| Function | Syntax | Description |
|----------|--------|------------|
| `clamp` | `clamp(min, value, max)` | Force value within [min, max] bounds |
| `min` | `min(a, b, ...)` | Smallest of all arguments |
| `max` | `max(a, b, ...)` | Largest of all arguments |
| `round` | `round(value)` | Round to nearest integer |
| `abs` | `abs(value)` | Absolute value |
| `floor` | `floor(value)` | Round down |
| `ceil` | `ceil(value)` | Round up |
| `lerp` | `lerp(a, b, t)` | Linear interpolation: a + (b-a)*t |
| `map` | `map(val, inMin, inMax, outMin, outMax)` | Remap from one range to another |
| `mod` | `mod(a, b)` | Always-positive modulo (unlike %, never negative) |
| `pow` | `pow(base, exponent)` | Power function |
| `sqrt` | `sqrt(value)` | Square root (negative clamped to 0) |

#### Threshold & Stepping (4 functions)

| Function | Syntax | Description |
|----------|--------|------------|
| `step` | `step(edge, x)` | Binary: 0 if x < edge, 1 if x >= edge |
| `smoothstep` | `smoothstep(e0, e1, x)` | Smooth S-curve between edges |
| `sign` | `sign(value)` | Returns -1, 0, or 1 |
| `snap` | `snap(value, grid)` | Snap to nearest multiple of grid |

#### Advanced Math (10 functions)

| Function | Syntax | Description |
|----------|--------|------------|
| `sin` | `sin(degrees)` | Sine in degrees |
| `cos` | `cos(degrees)` | Cosine in degrees |
| `tan` | `tan(degrees)` | Tangent in degrees (capped at +/-1M) |
| `atan2` | `atan2(y, x)` | Angle in degrees [0, 360) |
| `log` | `log(value)` | Natural logarithm (min 0.0001) |
| `log2` | `log2(value)` | Base-2 logarithm |
| `log10` | `log10(value)` | Base-10 logarithm |
| `exp` | `exp(value)` | e^value (capped at exp(88)) |
| `fract` | `fract(value)` | Fractional part: value - floor(value) |
| `inverseLerp` / `invLerp` | `inverseLerp(a, b, v)` | Where v falls between a and b as 0..1 |

#### Color & Accessibility Functions (8 functions)

| Function | Syntax | Description |
|----------|--------|------------|
| `luminance` | `luminance(r, g, b)` | WCAG 2.x relative luminance (0-1) from sRGB 0-255 |
| `contrast` | `contrast(lum1, lum2)` or `contrast(@Node, @Node)` | WCAG 2.x contrast ratio (1-21). AA normal >= 4.5, AA large >= 3 |
| `apca` | `apca(lumText, lumBg)` or `apca(@Node, @Node)` | APCA Lc contrast (WCAG 3.0 draft). Body >= 75, large >= 60 |
| `huelerp` | `huelerp(a, b, t)` | Shortest-path hue interpolation on 360 wheel |
| `srgbToLinear` | `srgbToLinear(channel)` | sRGB 0-255 to linear 0-1 (gamma decode) |
| `linearToSrgb` | `linearToSrgb(linear)` | Linear 0-1 to sRGB 0-255 (gamma encode) |
| `deltaE` | `deltaE(@A, @B)` or `deltaE(L1,a1,b1,L2,a2,b2)` | CIEDE2000 perceptual color difference. 0=identical, ~1=JND, >5=clearly different |

**Bare node references:** `contrast(@Self, @Parent)` passes the whole node — the engine auto-resolves RGB and computes luminance internally. This also works for `apca()` and `deltaE()`.

### Token Assignment Functions (Token Nodes Only)

These functions are ONLY available inside Token Assignment Logic (not channel logic):

| Function | Syntax | Description |
|----------|--------|------------|
| `lighten` | `lighten({token}, amount)` | Increase lightness by amount |
| `darken` | `darken({token}, amount)` | Decrease lightness by amount |
| `saturate` | `saturate({token}, amount)` | Increase saturation by amount |
| `desaturate` | `desaturate({token}, amount)` | Decrease saturation by amount |
| `adjustHue` | `adjustHue({token}, degrees)` | Rotate hue by degrees |
| `complement` | `complement({token})` | Rotate hue by 180 degrees |
| `mix` | `mix({token1}, {token2}, weight)` | Blend two colors (weight 0-100) |
| `tint` | `tint({token}, amount)` | Mix with white (amount 0-100) |
| `shade` | `shade({token}, amount)` | Mix with black (amount 0-100) |
| `opacity` / `rgba` | `opacity({token}, alpha)` | Set alpha (0-100 or 0-1 auto-detected) |
| `contrast` / `wcag` | `contrast({token1}, {token2})` | WCAG 2.x contrast ratio between two tokens |
| `apca` | `apca({text}, {bg})` | APCA contrast between two tokens |
| `luminance` | `luminance({token})` | Relative luminance of a token (0-1) |
| `deltaE` | `deltaE({token1}, {token2})` | CIEDE2000 difference between two tokens |
| `isReadable` | `isReadable({fg}, {bg})` | Boolean: WCAG AA pass for normal text (>= 4.5) |
| `isReadableLarge` | `isReadableLarge({fg}, {bg})` | Boolean: WCAG AA pass for large text (>= 3) |

### Channel Logic vs Token Assignment Logic

| Feature | Channel Logic | Token Assignment Logic |
|---------|--------------|----------------------|
| Available on | Any node | Token nodes only |
| Output | Number (channel value) | Token reference or computed color |
| `@Node` references | Yes | Yes |
| `{token}` references | With .property only | Full support (bare = assignment output) |
| Color functions (lighten, etc.) | No | Yes |
| Where to access | Green fx button on each channel | Token assignment section in advanced popup |

### Multi-Row Expression Pattern

A common pattern uses multiple rows to build up to a final value:

```
Row 1: seedH = @Parent.hctH                    → stores as $seedH
Row 2: shifted = mod($seedH + 60, 360)         → stores as $shifted
Row 3: isExp = @Variant.hctT >= 25 AND @Variant.hctT < 35 → stores as boolean $isExp
Row 4: out_1 = if $isExp then $shifted else $seedH → FINAL OUTPUT
```

The last row producing a valid number becomes the output. Boolean rows (like row 3) are stored as variables (1 or 0) but don't become the output.

### The `locked` Keyword

`locked` resolves to the channel's value BEFORE any advanced logic was applied. This prevents feedback loops:

```
Row 1: out_1 = if @Self.S < 5 then locked else @Self.H + 30
```

If saturation is low, keep the current hue. Otherwise, shift by 30.

### Auto-Constrain

By default, the engine auto-constrains the output to the channel's valid range:
- Hue: wraps 0-360
- Lightness/Saturation: clamps 0-100
- RGB: clamps 0-255
- etc.

This can be disabled per channel in the logic settings.

---

## 6. Token System

### Design Tokens

A design token is a named value that can be exported and used in code.

| Property | Description |
|----------|------------|
| `name` | Display name (e.g., "primary-40", "brand/blue") |
| `type` | 'color', 'spacing', etc. |
| `groupId` | Token group for organization |
| `projectId` / `pageId` | Where the token lives |
| `themeValues` | Per-theme color values |
| `themeVisibility` | Show/hide per theme |

### Token Groups

Tokens are organized into groups (like folders):
- Groups have names and belong to a project/page
- Groups can be expanded/collapsed in the Tokens Panel
- Special types: `isColorPaletteGroup`, `isAutoAssignCreated`, `isTokenNodeGroup`

### Assigning Tokens to Nodes

- A regular color node can have tokens assigned to it
- The node's color value is reflected in the token
- When the node changes, the token updates
- Multiple tokens can reference the same node
- `tokenAssignments` maps theme IDs to arrays of token IDs

### Token Nodes (Special)

Token Nodes are nodes that ARE tokens themselves. They have:

- **Token Prefix Node** (`isTokenPrefix: true`): Acts as a namespace (e.g., "sys", "ref")
  - Has NO token of its own
  - All children use this as their prefix: `sys/primary`, `sys/on-primary`
  - Creates a `TokenGroup` with `isTokenNodeGroup: true`

- **Token Child Node**: A child of a prefix node
  - `tokenNodeSuffix`: The suffix part (e.g., "primary")
  - `ownTokenId`: The auto-created token this node represents
  - `valueTokenId`: Which palette token provides the value (alias/reference)
  - `valueTokenAssignments`: Per-theme token references (e.g., Light: {primary-40}, Dark: {primary-80})

**Token Assignment** on a token node means: "This token's value comes from THAT other token." This is how semantic tokens reference palette tokens.

### Auto-Assign Tokens

When enabled on a parent node, auto-assign creates tokens for all direct children automatically.

Configuration:
- **Prefix**: Name prefix for tokens (defaults to parent's reference name)
- **Suffix Pattern**: How children are numbered
  - `1-9`: 1, 2, 3, ...
  - `10-90`: 10, 20, 30, ...
  - `100-900`: 100, 200, 300, ...
  - `a-z`: a, b, c, ...
  - `custom-N`: Custom increment (e.g., `custom-5` → 5, 10, 15, 20...)
- **Start From**: Starting value (e.g., 0 for 0, 10, 20...)
- **Group**: Which token group to place tokens in

**Shortcut**: Alt+T opens the auto-assign menu

### Token Theme Values

Each token has per-theme values:
```
{
  themeValues: {
    [lightThemeId]: { hue: 220, saturation: 80, lightness: 50, alpha: 100 },
    [darkThemeId]: { hue: 220, saturation: 60, lightness: 80, alpha: 100 },
  }
}
```

---

## 7. Theme System

### What Themes Do

Themes allow the same token to have different color values. A project can have unlimited themes.

| Property | Description |
|----------|------------|
| `name` | Theme display name (e.g., "Light", "Dark") |
| `isPrimary` | The default/primary theme |
| `projectId` | Parent project |

### Primary vs Non-Primary Themes

The **primary theme** is the default. Non-primary themes can:

- **Linked (default)**: Node inherits all values and logic from the primary theme
- **Unlinked**: Node has its own color values and/or logic for that theme

When unlinked, a node stores:
- `themeOverrides[themeId]`: Separate color values
- `themeChannels[themeId]`: Separate advanced logic
- `themeTokenAssignment[themeId]`: Separate token assignment logic

### Switching Themes

- Press keys `1` through `9` to switch between themes
- Theme selector in the header bar
- Tokens panel shows values for the active theme

### Per-Theme Token Assignments

Token nodes use `valueTokenAssignments` to map different tokens per theme:
```
valueTokenAssignments: {
  [lightThemeId]: "primary-40-token-id",
  [darkThemeId]: "primary-80-token-id",
}
```

This means: in Light theme, sys/primary = {primary-40}. In Dark theme, sys/primary = {primary-80}.

---

## 8. Palette System

### Palette Nodes

A palette node (`isPalette: true`) automatically generates shade children.

Configuration:
- **Shade Count**: 5-20 shades
- **Lightness Mode**: Linear or curve-based distribution
- **Curve Type**: linear, ease-in, ease-out, ease-in-out, sine, exponential, material, custom
- **Lightness Range**: Start and end lightness (default: 5-95)
- **Saturation Mode**: Constant, auto, or manual
- **Hue Shift**: -30 to +30 degrees across the scale
- **Naming Pattern**: 1-9, 10-90, 100-900, a-z
- **Custom Curve Points**: Per-shade lightness values when curve = custom

### Manual Palette Creation (Without Palette Nodes)

Many users prefer creating palettes manually for precise control:

1. Create a parent "key color" node (e.g., HCT with your brand color)
2. Create children for each tone stop (e.g., T0, T10, T20... T100)
3. Each child: unlock H and C (inherit from parent), lock T at the desired tone
4. Enable auto-assign on the parent to create tokens for all children

This approach gives:
- Exact control over each tone
- HCT gamut-mapping automatically handles chroma limits
- Changing the parent's hue/chroma updates all tones

---

## 9. Pages and Projects

### Projects
- Projects contain pages, nodes, tokens, themes
- `isCloud`: Synced to Supabase cloud
- `isTemplate`: Template project (admin only)
- `folderColor`: Random hue for the project card

### Pages
- Each project has one or more pages
- Nodes exist on a specific page
- Pages help organize different parts of a design system
  - Example: Page 1 = Primitives (key colors + palettes), Page 2 = Semantics (token nodes)

### Cross-Page Connections

Nodes on different pages CAN reference each other:
- A palette parent on Page 2 can have its parent be a key color on Page 1
- Advanced logic can reference `@NodeName` from any page

---

## 10. Keyboard Shortcuts

### Global
| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + Z | Undo |
| Cmd/Ctrl + Shift + Z | Redo |
| Cmd/Ctrl + C | Copy node |
| Cmd/Ctrl + V | Paste node |
| Cmd/Ctrl + D | Duplicate node |
| Delete / Backspace | Delete selected node(s) |
| Esc | Deselect all |
| O | Toggle show all visible |
| Alt + T | Open auto-assign tokens |
| 1-9 | Switch to theme 1-9 |
| Cmd/Ctrl + K | Open Command Palette |

### Canvas
| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + Plus | Zoom in |
| Cmd/Ctrl + Minus | Zoom out |
| Shift + 1 | Zoom to fit all nodes |
| Shift + 0 | Reset view |
| Arrow Left | Navigate to parent node |
| Arrow Right | Navigate to first child |
| Arrow Up / Down | Navigate between siblings |
| Space (hold) | Pan canvas |

### Nodes
| Shortcut | Action |
|----------|--------|
| C | Open / close color picker |
| Shift + C | Close color picker |
| Tab | Focus navigation in picker |
| Enter | Commit input value |
| H, S, L, A | Focus HSL property directly |
| R, G, B | Focus RGB property |

### Advanced Logic
| Shortcut | Action |
|----------|--------|
| Alt + F | Open advanced logic popup |
| E | Expand popup (when minimized) |
| M | Minimize popup |
| Esc | Close popup |

### Tokens Panel
| Shortcut | Action |
|----------|--------|
| Esc | Deselect all tokens |
| Cmd/Ctrl + A | Select all tokens |
| Alt + Up/Down | Reorder selected tokens |
| Shift + Up/Down | Extend / shrink selection |

---

## 11. Tips and Interactions

### Canvas
- **Double-click node**: Select node and all its descendants (useful for moving hierarchies)
- **Drag on empty canvas**: Draw selection rectangle for multi-select
- **Shift + click node**: Toggle in/out of multi-selection
- **Shift + drag**: Additive selection rectangle
- **Scroll / trackpad**: Pan canvas
- **Cmd + scroll or pinch**: Zoom centered on cursor
- **Drag connection button**: Create parent-child wire

### Nodes
- **Hover hex value**: Reveals copy button — click to copy hex
- **Drag scrubber inputs**: Drag horizontally to scrub values
- **Click scrubber input**: Click to type precise value
- **Lock icon on property**: Lock channel so children inherit exact parent value
- **Diff icon on property**: Maintain offset from parent instead of exact match

### Tokens Panel
- **Click token**: Navigate to the token's node on canvas
- **Double-click token name**: Rename inline
- **Right-click token**: Context menu (rename, move, reorder, delete)
- **Drag token**: Reorder within group or move between groups

### General
- **Double-click page name**: Rename page
- **Double-click theme name**: Rename theme
- **Double-click group name**: Rename group
- **Double-click project name**: Rename project

---

## 12. Code Export Formats

0colors exports tokens in 4 formats:

| Format | Language | Description |
|--------|---------|------------|
| **CSS Variables** | CSS | `--token-name: #HEXVAL;` custom properties |
| **DTCG JSON** | JSON | Design Token Community Group standard format |
| **Tailwind Config** | JavaScript | `module.exports = { theme: { extend: { colors: {...} } } }` |
| **Figma Variables** | JSON | Figma-compatible variable import format |

Export is per-page and respects the active theme.

---

## 13. Common Patterns and Recipes

### Pattern: Tonal Palette from Seed Color

1. Create root "Seed" node in HCT (e.g., H=270, C=36, T=50)
2. Create child "Primary" (lockC=true at desired chroma, lockT=false to inherit Seed T)
3. Create children under "Primary" for each tone: T0, T5, T10, T15, T20, T25, T30, T35, T40, T45, T50, T55, T60, T65, T70, T75, T80, T85, T90, T95, T100
4. Each tone child: lockHctH=false (inherit), lockHctC=false (inherit), lockHctT=true (fixed tone)
5. Enable auto-assign on "Primary" with prefix "primary" and suffix "custom-5" starting from 0

Result: Tokens `primary-0` through `primary-100` in 5-unit steps.

### Pattern: Semantic Token with Theme Switching

1. Create token prefix node "sys"
2. Create child token node with suffix "primary"
3. In Light theme: assign `{primary-40}` as value token
4. In Dark theme: assign `{primary-80}` as value token
5. `sys/primary` now outputs different palette tones per theme

### Pattern: Contrast-Aware Token Assignment

Use token assignment logic to dynamically pick the right palette tone:

```
Row 1: c40 = contrast({primary-40}, {neutral-98})
Row 2: c35 = contrast({primary-35}, {neutral-98})
Row 3: c30 = contrast({primary-30}, {neutral-98})
Row 4: out_1 = if $c40 >= 7 then {primary-40} else if $c35 >= 7 then {primary-35} else {primary-30}
```

This picks the lightest tone that still meets 7:1 contrast.

### Pattern: Complementary Color

HCT channel logic on hue:
```
Row 1: out_1 = mod(@Parent.hctH + 180, 360)
```

### Pattern: Analogous Colors

Children with hue offsets:
```
Child 1 hue: mod(@Parent.hctH + 30, 360)
Child 2 hue: mod(@Parent.hctH - 30, 360)
```

### Pattern: Accessible Text Color

Lightness channel logic:
```
Row 1: out_1 = if contrast(@Self, @Parent) < 4.5 then @Self.L - 15 else @Self.L
```

### Pattern: Desaturate Near-Grays

Saturation channel logic:
```
Row 1: out_1 = if @Self.S < 5 then 0 else @Self.S
```

### Pattern: Material Theme Variant Switching

Using a Variant parameter node (T value = scheme type):
```
Row 1: vT = @Variant.hctT
Row 2: tspot = max(@Seed.hctC, 36)
Row 3: content = @Seed.hctC
Row 4: vibrant = 200
Row 5: mono = 0
Row 6: out_1 = if $vT < 5 then $tspot else if $vT < 15 then $content else if $vT < 25 then $vibrant else $mono
```

### Pattern: DislikeAnalyzer (Material Design)

Some hues at certain tones look unpleasant. Fix by adjusting tone:
```
Row 1: baseT = @Parent.hctT
Row 2: isDisliked = @Self.hctH >= 90 AND @Self.hctH <= 111 AND @Self.hctC > 16 AND $baseT < 65
Row 3: out_1 = if $isDisliked then 70 else $baseT
```

### Pattern: Build a Full Design System

1. **Page 1 — Primitives:**
   - Seed node (root, user-chosen H/C/T)
   - Key color children (Primary, Secondary, Tertiary, Neutral, NeutralVariant, Error)
   - Tonal palette children under each key color (21 tones per palette)
   - Auto-assign tokens on each palette

2. **Page 2 — Semantics:**
   - Token prefix "sys"
   - Token node children: primary, on-primary, primary-container, on-primary-container, etc.
   - Per-theme token assignments: Light → palette-40, Dark → palette-80
   - Advanced contrast logic for high-contrast themes

---

## 14. Propagation Engine Rules

When a parent node changes, the engine propagates to children:

```
For each child of the changed parent:
  For each channel (hue, saturation, lightness, ...):
    IF channel is LOCKED → no change
    ELSE IF channel has ADVANCED LOGIC → evaluate logic with new parent values
    ELSE IF diff is ENABLED → child = parent + offset
    ELSE → child = parent (exact match)
```

Advanced logic takes priority over the lock/diff system. If a channel has logic, the logic's output determines the value.

### Propagation Cascade

Changes cascade through the hierarchy:
```
Seed changes → Primary updates → Palette tones update → Semantic tokens resolve new colors
```

But palette tone nodes have `lockHctT: true`, so the Tone propagation STOPS there. Only Hue and Chroma cascade through.

---

## 15. Theme-Specific Logic

### How Theme Overrides Work

For non-primary themes, a node can be **unlinked**:
- Unlinked node gets its own `themeOverrides[themeId]` for color values
- Unlinked node can have its own `themeChannels[themeId]` for logic
- Unlinked node can have its own `themeTokenAssignment[themeId]`

The resolution order:
1. Is this the primary theme? → Use base values and base logic
2. Is the node unlinked in this theme? → Use theme-specific values/logic
3. Is the node linked? → Inherit from primary theme

### Per-Theme Token Assignment

Token nodes can assign different source tokens per theme:
```
sys/primary:
  Light theme: → {primary-40}
  Dark theme: → {primary-80}
  Light HC: → (contrast logic finding darkest meeting 7:1)
  Monochrome Light: → {neutral-0}
```

Each theme assignment can have its own advanced logic expression.

---

## 16. Data Storage

0colors uses an offline-first architecture:

- **localStorage**: Primary storage. All projects, nodes, tokens, themes, pages stored locally.
- **Supabase Cloud Sync**: Optional. Projects marked `isCloud` sync to Supabase via a KV store.
- **Undo/Redo**: Full undo/redo support via history stack.

---

## 17. Node View Configuration

Advanced Logic includes a **Node View** feature to customize the UI:

- **Hide channels**: Hide irrelevant sliders (e.g., hide H and C for a node where only T matters)
- **Custom slider range**: Set min/max for sliders (e.g., constrain Tone slider to 20-80)

This is purely visual — does NOT affect the underlying data.

---

## 18. Copy, Paste, and Duplicate Behavior

### How Copy Works

When you copy a node (Cmd/Ctrl+C):
- The selected node AND all its descendants are copied
- If multiple nodes are selected, all are copied with their descendants
- Token child nodes auto-include their prefix ancestor (token children cannot exist without their prefix parent)

### How Paste Works

When you paste (Cmd/Ctrl+V):
- **Primary theme only**: Paste is blocked in non-primary themes with an alert message. You must switch to the primary theme first.
- **Positioning**: Pasted nodes appear at the **viewport center** (not at a fixed offset from originals)
- **New IDs**: All nodes get fresh unique IDs
- **Parent-child relationships**: Preserved within the pasted group (mapped to new IDs)
- **Reference names**: Locked reference names get a "-Copy" suffix with uniqueness validation

**Token handling on paste:**
- All token assignments, auto-assign state, and token references are **cleared** from pasted regular nodes
- For **token nodes**: New tokens and groups are automatically recreated with the same structure. If token names conflict, a "-copy" suffix is added (e.g., `sys/primary` becomes `sys/primary-copy`)
- **Token Restore Prompt**: For regular (non-token) nodes that had token assignments, a prompt appears for **15 seconds** offering to reassign tokens. Click the button to create duplicate tokens with "-Copy" names and restore all assignments.

### How Duplicate Works (Cmd/Ctrl+D)

Duplicate works identically to paste but operates on the currently selected nodes. Same rules apply: primary theme only, new IDs, token handling, and the restore prompt.

### Token Restore Prompt Details

When you paste or duplicate nodes that had tokens:
1. A prompt appears at the bottom of the screen for 15 seconds
2. Clicking "Reassign tokens" creates new copies of all referenced tokens (with "-Copy" suffix)
3. Token groups are also duplicated if needed (with "-Copy" suffix)
4. All token assignments are remapped to the new token copies
5. Auto-assign configurations are restored on the duplicate parent nodes
6. The prompt auto-dismisses after 15 seconds or if all pasted nodes are deleted

### What Gets Preserved vs Cleared on Duplicate/Paste

| Property | Preserved? | Notes |
|----------|-----------|-------|
| Color values (H, S, L, etc.) | Yes | Exact same colors |
| Lock states | Yes | Same inheritance behavior |
| Diff states and offsets | Yes | Same offset relationships |
| Advanced logic | Yes | Same expressions (references point to original nodes by name) |
| Theme overrides | Yes | Per-theme values preserved |
| Parent-child hierarchy | Yes | Mapped to new IDs within the pasted set |
| Token assignments | Cleared | Restored via the prompt, or auto-created for token nodes |
| Auto-assign config | Cleared | Restored via the prompt |
| Reference name | Modified | Gets "-Copy" suffix if the name was locked |
| Position | Changed | Placed at the current viewport center |

---

## 19. Visibility System

### Per-Theme Node Visibility

Nodes can be hidden in specific themes without being deleted:
- Hiding a node in the Light theme does NOT affect its visibility in the Dark theme
- Each theme's visibility is **fully independent** — there is no cascade from primary to non-primary
- Toggle visibility via the eye/eye-off icon on the node card

### Token Visibility Rules

A token is hidden in a theme if ANY of these conditions is true:
1. **Explicitly hidden**: The token's `themeVisibility[themeId]` is set to `false`
2. **All assigned nodes hidden**: Every node the token is assigned to is hidden in this theme
3. **Owning token node hidden**: The canvas token node that owns this token is hidden in this theme

### "Show All Visible" Toggle (O key)

In non-primary themes, some nodes may appear dimmed (because they are linked to primary). Press **O** to toggle the "show all visible" override, which renders all nodes at full opacity regardless of linking state. This automatically resets when switching back to the primary theme.

### Palette Shade Visibility

Palette shade children (auto-generated by a palette node) inherit visibility from their parent palette node. Hiding a palette automatically hides all its shades in that theme.

---

## 20. Command Palette (Cmd/Ctrl + K)

The Command Palette is a universal search and action bar for fast navigation:

### What You Can Search
- **Nodes**: By reference name, color space, or hex value
- **Tokens**: By token name, group, or color
- **Palettes**: By palette name
- **Pages**: Navigate to any page in the project
- **Themes**: Switch to any theme

### Actions Available
- Create new HSL, RGB, OKLCH, or HCT color node
- Create palette node
- Create token node
- Create spacing node
- Create new page
- Create new theme
- Open Token Table view
- Open Code View (export)

### Features
- **Recent history**: Last 8 visited items appear at the top when the palette opens
- **Pinning**: Pin frequently used items for quick access (up to 12)
- **Fuzzy search**: Partial matching, substring matching, and segment matching with relevance scoring
- **Keyboard navigation**: Arrow keys to move, Enter to select, Esc to close

---

## 21. Token Search and Filters

The Tokens Panel includes a search bar with advanced filtering:

### Smart Search
- Search by token name (fuzzy matching)
- Search by color name (e.g., typing "blue" finds tokens with blue-ish hues)
- Color name to hue range matching (red: 345-15, blue: 210-260, green: 100-160, etc.)

### Filter Options
| Filter | What it shows |
|--------|-------------|
| Color Space | Only tokens from specific color spaces (HSL, RGB, OKLCH, HCT, HEX, TOKEN) |
| Hidden Only | Only tokens that are currently hidden in this theme |
| Unassigned Only | Only tokens not assigned to any node |
| Token Nodes Only | Only tokens managed by token node groups |
| Modified Only | Only tokens whose values differ from the primary theme |
| Has Alpha | Only tokens with alpha less than 100% |
| Palette Only | Only tokens from color palette groups |

---

## 22. Theme Linking and Unlinking

### Linked (Default)

When a node is **linked** to primary in a non-primary theme:
- It shows the same color values as in the primary theme
- Changing the node in the primary theme also changes it in this theme
- Indicated by a link icon on the node card

### Unlinking

When you **unlink** a node from primary:
- The node gets its own independent color values for this theme
- Changes in primary no longer affect this node in this theme
- You can adjust sliders freely for this theme only
- Advanced logic can also be set independently per theme
- Indicated by an unlink icon on the node card

### Re-linking

When you re-link a node:
- The theme-specific color overrides are discarded
- The node returns to inheriting values from the primary theme
- Theme-specific advanced logic can optionally be cleared as well

### Important Rules
- You can only edit node color values in the primary theme OR in a non-primary theme when the node is unlinked
- Node creation, deletion, paste, and duplicate are restricted to the primary theme only
- Structure (parent-child relationships) is shared across all themes — you cannot have different hierarchies per theme

---

## 23. Cloud Sync and Projects

### Local vs Cloud Projects

| Feature | Local | Cloud |
|---------|-------|-------|
| Storage | localStorage only | localStorage + Supabase |
| Requires auth | No | Yes |
| Accessible from other devices | No | Yes (with same account) |
| Limit | Unlimited | 2 cloud projects per user |

### Template Projects

Templates are read-only example projects (e.g., the Material Theme template):
- Cannot be edited directly
- Can be duplicated as either a local or cloud project
- "Duplicate as" menu offers both options (cloud requires auth)

### Cloud Sync Behavior
- Sync happens automatically on save
- A sync status indicator shows the current state: synced, syncing, or error
- Offline changes are preserved locally and sync when the connection returns

---

## 24. Advanced Popup — Detailed Workflow

### Opening the Advanced Logic Popup
- Click the green **fx** button on any channel → opens focused on that channel
- Click the **Advanced** island badge on a node → opens the full popup
- Press **Alt + F** with a node selected → opens via keyboard

### Popup Modes
- **Expanded**: Full view with all channels visible, row-by-row output display
- **Minimized**: Compact view that stays on screen while you work with other nodes

### Editing Expressions
- Click in a row to start typing
- Tokens auto-complete as colored pills:
  - Keywords (pink): `if`, `then`, `else`, `AND`, `OR`
  - Functions (green): `clamp`, `contrast`, `lerp`, etc.
  - References (blue): `@Parent`, `@Self`, `@NodeName`
  - Operators (orange): `+`, `-`, `>`, `<`, etc.
  - Numbers (gray): `50`, `0.5`, `360`
  - Booleans (purple): `true`, `false`
  - Properties (gold): `.H`, `.S`, `.L`, `.T`
  - Variables (tomato): `$out_1`, `$myVar`
  - Token refs (amber): `{primary-40}`, `{neutral-98}`
- Each row shows its output value in real-time
- The final output (highlighted) is the value that drives the channel

### Row Variables
- Each row's output is stored as a variable: `$out_1`, `$out_2`, etc.
- Variables are renameable — click the output name to give it a descriptive name
- Later rows can reference earlier ones: `if $out_1 > 50 then ...`
- Boolean rows store 1 (true) or 0 (false) as the variable value

### Fallback Behavior
- If no row produces a valid number, the **fallback** is used
- Default fallback: parent's channel value (inherits from parent)
- Custom fallback: you can manually set a fixed fallback number
- If all rows have errors, the fallback is used

### Final Output Variable
- By default, the last valid number row is the output
- You can pin a specific variable as the "final output" (e.g., always use `$out_1`)
- Boolean variables cannot be selected as the final output

---

## 25. Computed Tokens

Computed tokens are the **resolved, final values** of all visible tokens per theme:

- Combines static token values with advanced logic outputs
- Only includes visible tokens (not hidden or force-hidden)
- Only includes tokens with resolvable values
- Advanced-logic computed tokens override static resolution
- Stored in localStorage and synced to cloud for external consumers (e.g., Figma plugin)
- Format: flat array per theme with hex, HSLA, and native CSS values

---

## 26. Common User Scenarios and How-To Guides

### Scenario: "I want to create a brand color palette"

**Recommended approach:**
1. Create a root node in HCT with your brand color
2. Create 11 children (or 21 for finer granularity at every 5 units)
3. Each child: lock Tone at the desired stop (0, 10, 20, ..., 100)
4. Leave Hue and Chroma unlocked so they inherit from the parent
5. Enable auto-assign on the parent: prefix = "brand", suffix = "custom-10", start from = 0
6. Tokens `brand-0` through `brand-100` are created automatically
7. Change the parent's hue → the entire palette updates harmoniously

### Scenario: "I want light and dark themes"

1. Create your palette on the primary theme (this is your "Light" theme, or rename the primary to "Light")
2. Create a new theme called "Dark"
3. Create token prefix "sys" → add token children for each semantic color
4. For each token child, set the value token per theme:
   - Light: `{brand-40}` (darker tones for foreground on light backgrounds)
   - Dark: `{brand-80}` (lighter tones for foreground on dark backgrounds)
5. Export CSS → each theme gets its own set of CSS variables

### Scenario: "I duplicated nodes and lost my tokens"

This is expected behavior — it prevents two nodes from accidentally sharing one token. When you duplicate or paste nodes:
- Token assignments are cleared to avoid conflicts
- **Look for the restore prompt** at the bottom of the screen (it appears for 15 seconds)
- Click the prompt button to recreate tokens with "-Copy" names and restore all assignments
- If the prompt expired, you can re-create tokens manually or use auto-assign again

### Scenario: "My child node won't follow the parent's changes"

Check these in order:
1. Is the channel **locked**? (Blue lock icon = locked = won't follow parent)
2. Is **diff** enabled with a large offset? (The child follows but with an offset)
3. Does the child have **advanced logic** on that channel? (Logic overrides lock/diff)
4. Are you on a **non-primary theme**? Is the node **unlinked**? (Unlinked nodes are independent in that theme)

### Scenario: "I want to ensure WCAG AA compliance"

Use the `contrast()` function in advanced logic:
```
Row 1: ratio = contrast(@Self, @Parent)
Row 2: out_1 = if $ratio < 4.5 then @Self.L - 10 else @Self.L
```
This adjusts lightness until contrast meets AA standards.

For token nodes, use `isReadable({fg-token}, {bg-token})` to check compliance.

### Scenario: "I want a monochrome version of my color system"

1. Create a new theme (e.g., "Monochrome Light")
2. For semantic token assignments in this theme, point to neutral palette tokens instead of accent palette tokens:
   - `sys/primary` → `{neutral-40}` instead of `{primary-40}`
   - `sys/primary-container` → `{neutral-90}` instead of `{primary-90}`
3. All accent colors are replaced with grayscale versions

### Scenario: "How do I create analogous/triadic/split-complementary colors?"

Use advanced logic on the Hue channel:

**Analogous (±30 degrees):**
```
mod(@Parent.hctH + 30, 360)
```

**Triadic (±120 degrees):**
```
Child 1: mod(@Parent.hctH + 120, 360)
Child 2: mod(@Parent.hctH + 240, 360)
```

**Split-complementary (±150 degrees):**
```
Child 1: mod(@Parent.hctH + 150, 360)
Child 2: mod(@Parent.hctH + 210, 360)
```

### Scenario: "I want to mix two colors"

In token assignment logic:
```
mix({color-a}, {color-b}, 50)
```
Weight 50 = equal blend. Weight 0 = all color-a, 100 = all color-b.

### Scenario: "How do I create a color that always follows another node?"

Use cross-node references in advanced logic:
```
Row 1: out_1 = @BrandBlue.hctH
```
This makes the current node's hue always match the "BrandBlue" node's hue, even if BrandBlue is on a different page.

### Scenario: "I want tokens with Tailwind-style naming (50, 100, 200...)"

Use auto-assign with:
- Prefix: "blue" (or your color name)
- Suffix: "custom-50"
- Start from: 50
- Result: blue-50, blue-100, blue-150, blue-200, blue-250, ...

Or for the standard Tailwind scale (50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950):
Create children manually for each stop and assign names individually.

### Scenario: "Can I use 0colors to build something like Material Theme Builder?"

Absolutely — this is one of the most powerful use cases:
1. **Page 1 (Primitives)**: Seed node → Key colors (Primary, Secondary, Tertiary, Error, Neutral, NeutralVariant) → 21-tone palettes under each
2. **Page 2 (Semantics)**: Token prefix "sys" → Token children for every semantic role → Per-theme assignments
3. **Themes**: Light, Dark, Light Medium Contrast, Light High Contrast, Dark Medium Contrast, Dark High Contrast, Monochrome Light, Monochrome Dark
4. **Advanced Logic**: Use `contrast()` expressions for medium/high contrast themes, neutral palette references for monochrome themes

### Scenario: "How do I find a specific node or token quickly?"

Use the **Command Palette** (Cmd/Ctrl + K):
- Type any part of the node's reference name, hex color, or token name
- Results show the page location and color preview
- Select a result to navigate directly to it on the canvas

### Scenario: "I want to hide certain tokens in specific themes"

Use the **visibility system**:
- Click the eye icon on a token in the Tokens Panel to hide it in the current theme
- Or hide the source node on the canvas — if all nodes assigned to a token are hidden, the token auto-hides
- Hidden tokens are excluded from code exports

### Scenario: "How do I make a node only show relevant sliders?"

Use **Node View Configuration** in the Advanced Logic popup:
- Open Advanced Logic (Alt+F)
- Go to the Node View tab
- Toggle channels on/off (e.g., hide H and C, show only T for a tone-only node)
- Set custom slider ranges (e.g., T: 20-80 instead of 0-100)
- This is purely visual — the underlying data is not affected

### Scenario: "How do I use the output variable system effectively?"

Multi-row patterns with named variables:

**Computing intermediate values:**
```
Row 1: srcH = @Seed.hctH                          → $srcH
Row 2: shifted = mod($srcH + 60, 360)              → $shifted
Row 3: chroma = max(@Seed.hctC, 36)                → $chroma
Row 4: out_1 = if @Self.hctC > $chroma then $chroma else @Self.hctC
```

**Boolean flags:**
```
Row 1: isDark = @Parent.hctT < 50                   → $isDark (boolean, stored as 1 or 0)
Row 2: out_1 = if $isDark then 90 else 10           → FINAL OUTPUT
```

**Chaining conditionals for contrast targets:**
```
Row 1: t1 = contrast({primary-40}, {neutral-98})    → $t1
Row 2: t2 = contrast({primary-35}, {neutral-98})    → $t2
Row 3: out_1 = if $t1 >= 4.5 then {primary-40} else if $t2 >= 4.5 then {primary-35} else {primary-30}
```

### Scenario: "How do I exclude a child from auto-assign?"

When auto-assign is enabled on a parent:
- Each child gets a token automatically
- To exclude a specific child: delete the auto-assigned token from that child
- A confirmation dialog will ask if you want to exclude the child from auto-assign
- Confirm to mark it as excluded (`autoAssignExcluded: true`)
- The excluded child will be skipped in future auto-assign operations

### Scenario: "How do I change a node's color space?"

- Click on the node to select it
- In the expanded node view, find the color space selector
- Switch between HSL, RGB, OKLCH, HCT, or HEX
- The color is converted between spaces automatically
- Note: HCT is recommended for Material Design work, OKLCH for perceptually uniform palettes

### Scenario: "What is the difference between a palette node and manual children?"

**Palette Node** (auto-generated):
- Quick setup: just choose shade count and distribution curve
- Limited control: curve presets determine lightness distribution
- Good for rapid prototyping

**Manual Children** (recommended for production):
- Full control over every tone's exact value
- Can use advanced logic for dynamic relationships
- HCT ensures perceptual uniformity
- Works perfectly with auto-assign for token naming

---

## 27. Frequently Asked Questions

**Q: How do I make a child inherit only the hue from its parent?**
A: Set `lockHctH: false` (inherit hue), `lockHctC: true` (keep own chroma), `lockHctT: true` (keep own tone). In HCT mode.

**Q: Why doesn't my token update when I change the Seed?**
A: Check if the palette tone node has `lockHctT: true`. It should — this means only H and C propagate. The token's color changes because H/C changed, not T. If H/C aren't propagating, check that the intermediate nodes don't have those channels locked.

**Q: How do I create contrast-aware tokens?**
A: Use Token Assignment Logic with the `contrast()` function. Example:
```
if contrast({primary-40}, {neutral-98}) >= 4.5 then {primary-40} else {primary-35}
```

**Q: What's the difference between channel logic and token assignment logic?**
A: Channel logic outputs a NUMBER (e.g., hue = 270). Token assignment logic outputs a TOKEN REFERENCE (e.g., {primary-40}) or computed color. Channel logic runs on any node. Token assignment logic only runs on token nodes.

**Q: Can I reference nodes from other pages?**
A: Yes! Use `@NodeName.property` with the node's reference name. Cross-page references work.

**Q: How do I use the contrast function with token references?**
A: In token assignment context: `contrast({primary-40}, {neutral-98})` — takes two token references and returns the WCAG contrast ratio. In channel logic: `contrast(@Self, @Parent)` — takes two node references.

**Q: What happens if my expression has an error?**
A: The row is skipped. If all rows error, the fallback value is used (parent's value or custom fallback).

**Q: Can I nest if/then/else?**
A: Yes! `if a > 5 then if b > 3 then 100 else 50 else 0` works.

**Q: What's the `mod` function for?**
A: `mod(a, b)` is always-positive modulo. Essential for hue math: `mod(@Parent.H + 120, 360)` gives a correct 120-degree rotation even when H is near 0 or 360.

**Q: How do auto-assigned tokens work?**
A: Enable auto-assign on a parent node. Set prefix (e.g., "primary"), suffix pattern (e.g., "custom-5"), and start value (e.g., 0). Each direct child gets a token: primary-0, primary-5, primary-10, etc. New children added later are automatically assigned. You can exclude specific children.

**Q: Can I have different advanced logic per theme?**
A: Yes! Unlink the node in a non-primary theme. Then you can set separate logic for that theme's channel or token assignment.

---

## 28. Glossary

| Term | Definition |
|------|-----------|
| **Node** | A color unit on the canvas. Can be root or child. |
| **Parent** | The node that this node inherits from |
| **Child** | A node that inherits from another node |
| **Lock** | Prevents a channel from inheriting parent changes |
| **Diff** | Maintains an offset from parent (vs exact match) |
| **Token** | A named, exportable design value |
| **Token Node** | A node that IS a token (prefix + suffix naming) |
| **Token Assignment** | Mapping a token node to reference another token per theme |
| **Advanced Logic** | Expression system for dynamic color computation |
| **Channel Logic** | Advanced logic on a specific color channel (H, S, L, etc.) |
| **Palette** | A set of tone variations from a source color |
| **Theme** | A named variant of the design system (Light, Dark, etc.) |
| **Primary Theme** | The default theme. Other themes inherit from it unless unlinked. |
| **Reference Name** | A user-visible name on a node, used for `@Name` references |
| **HCT** | Hue-Chroma-Tone color space from Material Design 3 |
| **OKLCH** | Perceptually uniform color space (Oklab-based) |
| **Gamut Mapping** | When HCT solver reduces chroma to fit sRGB at a given tone |
| **ContrastCurve** | M3 concept: dynamic contrast targets based on accessibility level |
| **ToneDeltaPair** | M3 concept: ensures minimum tone distance between paired tokens |
| **DislikeAnalyzer** | M3 concept: fixes unpleasant yellow-green tones by shifting them lighter |