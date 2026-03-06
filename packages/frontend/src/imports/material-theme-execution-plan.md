# Material Theme Builder — Complete Node-by-Node Execution Plan

> Every node, every lock, every diff, every advanced logic expression.
> Built from deep analysis of `@material/material-color-utilities` source
> and cross-referenced against 0colors' advanced logic engine capabilities.

---

## Architecture Overview

```
Page 1: Source & Key Colors (7 HCT nodes)
  Seed ──┬── Primary
         ├── Secondary
         ├── Tertiary
         ├── Neutral
         └── Neutral Variant
  Error (independent root)

Page 2: Tonal Palettes (78 HCT child nodes + 78 tokens)
  Primary ──── 13 tone children (T0, T10, T20...T100)
  Secondary ── 13 tone children
  Tertiary ─── 13 tone children
  Neutral ──── 17 tone children (T0, T4, T6, T10, T12, T17, T20, T22, T24, T87, T90, T92, T94, T96, T98, T99, T100)
  NeutralVar ─ 13 tone children
  Error ────── 13 tone children

Page 3: Semantic Tokens (1 prefix + 45 token nodes = 46 nodes, 45 tokens)
  sys (prefix) ── 45 child token nodes with per-theme value assignments

Page 4: Component Tokens (optional, aliases only)
```

Total: 7 + 78 + 46 = ~131 nodes, ~123 tokens

---

## 0colors Capabilities Reference (What You Can Use)

### Node References in Expressions
```
@Self.hctH          Current node's HCT Hue
@Self.hctC          Current node's HCT Chroma
@Self.hctT          Current node's HCT Tone
@Parent.hctH        Parent node's HCT Hue
@Parent.hctC        Parent node's HCT Chroma
@Parent.hctT        Parent node's HCT Tone
@NodeName.hctH      Any node by reference name
locked              Pre-logic base value of current channel
```

### Functions Available
```
max(a, b)           clamp(min, val, max)    min(a, b)
lerp(a, b, t)       mod(a, b)              abs(x)
round(x)            floor(x)               ceil(x)
pow(base, exp)       sqrt(x)                step(edge, x)
smoothstep(e0, e1, x)  map(v, inMin, inMax, outMin, outMax)
sin(deg)            cos(deg)               huelerp(a, b, t)
inverselerp(a, b, v)  sign(x)              snap(val, grid)
luminance(r, g, b)   contrast(lum1, lum2)   contrast(@Node1, @Node2)
```

### Conditionals
```
if condition then valueA else valueB
```

### Multi-Row Local Variables
Each row produces a named output variable accessible in later rows.

### Token Assignment Logic (Token Nodes Only)
```
if @Self.hctT > 50 then {primary-80} else {primary-40}
```

### Channel Constraints
- hctH: 0-360 (wraps)
- hctC: 0-120 (clamps)
- hctT: 0-100 (clamps)

### Key Insight: Gamut Clamping is Automatic
When you set HCT(270, 36, 95), the HCT solver finds the closest in-gamut sRGB color.
At T95, the maximum achievable chroma for H270 is ~12, so the node DISPLAYS ~12 even
though you "requested" 36. This is correct M3 behavior — no advanced logic needed for gamut.

The chroma you set on a node is the REQUESTED chroma. The HCT solver automatically
gives you the maximum achievable chroma up to your request. This is exactly how
`TonalPalette.fromHueAndChroma(hue, chroma)` works in the M3 library.

---

## PAGE 1: Source & Key Colors

### Node 1: Seed (Root Node)

| Property | Value |
|----------|-------|
| Type | HCT color node (root) |
| Parent | None |
| Color Space | HCT |
| H | User-chosen (e.g., 270) |
| C | User-chosen (e.g., 36) |
| T | 50 |
| Reference Name | `Seed` |
| Lock H | No |
| Lock C | No |
| Lock T | Yes (50) |
| Advanced Logic | None |

The seed is the user's input. They drag H and C freely. T is locked at 50 (mid-tone for preview).

---

### Node 2: Primary (Child of Seed)

| Property | Value |
|----------|-------|
| Type | HCT color node |
| Parent | Seed |
| Color Space | HCT |
| Reference Name | `Primary` |
| Diff H | OFF (inherits parent hue exactly) |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No |
| Lock C | Yes → 36 (base value, overridden by advanced logic) |
| Lock T | Yes → 40 |

**Advanced Logic — hctC channel:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `max(@Parent.hctC, 36)` | `out_1` | TonalSpot: Ensures minimum chroma of 36. If seed C > 36, primary preserves it. |

> **Why 36 and not 48?** The `material-color-utilities` library's `SchemeTonalSpot` uses 36.
> The value 48 comes from the older `CorePalette.of()` API which is deprecated.
> The TonalPalette constructor then gamut-clamps per tone automatically.

---

### Node 3: Secondary (Child of Seed)

| Property | Value |
|----------|-------|
| Type | HCT color node |
| Parent | Seed |
| Color Space | HCT |
| Reference Name | `Secondary` |
| Diff H | OFF (inherits parent hue exactly) |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No |
| Lock C | Yes → 16 |
| Lock T | Yes → 40 |

**Advanced Logic:** None needed.
Secondary chroma is always 16 in TonalSpot. No derivation from seed.

---

### Node 4: Tertiary (Child of Seed)

| Property | Value |
|----------|-------|
| Type | HCT color node |
| Parent | Seed |
| Color Space | HCT |
| Reference Name | `Tertiary` |
| Diff H | ON, offset = +60 |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No |
| Lock C | Yes → 24 |
| Lock T | Yes → 40 |

**Advanced Logic:** None needed.
Hue is seed + 60 via the Diff H mechanism. Chroma is fixed 24.

---

### Node 5: Neutral (Child of Seed)

| Property | Value |
|----------|-------|
| Type | HCT color node |
| Parent | Seed |
| Color Space | HCT |
| Reference Name | `Neutral` |
| Diff H | OFF (inherits parent hue exactly) |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No |
| Lock C | Yes → 6 (base value, overridden by advanced logic) |
| Lock T | Yes → 50 |

**Advanced Logic — hctC channel:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `min(@Parent.hctC / 12, 4)` | `out_1` | Proportional to seed chroma, capped at 4. When seed C=36, neutral C=3. When seed C=120, neutral C=4. |

> **Alternative (stricter TonalSpot):** In the latest MCU source, TonalSpot neutral C is literally 6 (fixed constant). If you want exact latest behavior, remove the advanced logic and just lock C=6. The proportional formula is from the older CorePalette API. **Choose one:**
> - Fixed C=6 → exact latest SchemeTonalSpot
> - `min(@Parent.hctC / 12, 4)` → classic CorePalette behavior (more responsive to seed)

---

### Node 6: Neutral Variant (Child of Seed)

| Property | Value |
|----------|-------|
| Type | HCT color node |
| Parent | Seed |
| Color Space | HCT |
| Reference Name | `NeutralVariant` |
| Diff H | OFF (inherits parent hue exactly) |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No |
| Lock C | Yes → 8 (base value, overridden by advanced logic) |
| Lock T | Yes → 50 |

**Advanced Logic — hctC channel:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `min(@Parent.hctC / 6, 8)` | `out_1` | Proportional to seed chroma, capped at 8. When seed C=36, NV C=6. When seed C=120, NV C=8. |

> Same note as Neutral: latest SchemeTonalSpot uses fixed C=8. Choose proportional or fixed based on preference.

---

### Node 7: Error (Independent Root)

| Property | Value |
|----------|-------|
| Type | HCT color node (root) |
| Parent | None |
| Color Space | HCT |
| Reference Name | `Error` |
| Lock H | Yes → 25 |
| Lock C | Yes → 84 |
| Lock T | Yes → 40 |

**Advanced Logic:** None. Error is fully fixed and independent of the seed.

---

## PAGE 2: Tonal Palettes

Use **Approach B (Individual Child Nodes)** — one node per tone value.
This gives you full control and exact M3 tone naming.

### General Pattern for Each Tone Child

Each tone child of a key color:
- **Parent:** The key color node from Page 1 (cross-page parent link)
- **Color Space:** HCT
- **Diff H:** OFF (inherits parent hue)
- **Diff C:** OFF (inherits parent chroma — HCT solver auto-gamut-clamps)
- **Diff T:** OFF
- **Lock H:** No
- **Lock C:** No (inherits from parent; solver clamps to max achievable)
- **Lock T:** Yes → the specific tone value
- **Auto-Assign Token:** Yes, with proper naming
- **Advanced Logic:** None needed (gamut clamping is handled by HCT solver)

### Why No Advanced Logic on Palette Tones?

The HCT color space solver IS the gamut boundary logic. When you create:
```
HCT(hue=270, chroma=36, tone=95)
```
The solver internally searches for the sRGB color closest to this request.
At T95, H270, the max achievable chroma is ~12. The solver returns HCT(270, 12, 95).
This is EXACTLY what `TonalPalette.fromHueAndChroma(270, 36).tone(95)` does.

The node will DISPLAY the clamped chroma. The "requested" chroma (from parent) is just an upper bound.

**If you want to SHOW the gamut boundary explicitly** (as a visible advanced logic expression), you CAN add it, but it's an approximation since the real boundary is a complex 3D surface. See the Optional Gamut Boundary section at the end.

---

### Primary Palette (13 nodes, children of Primary)

| Node Name | Lock T | Token Name |
|-----------|--------|------------|
| primary-0 | 0 | `primary-0` |
| primary-10 | 10 | `primary-10` |
| primary-20 | 20 | `primary-20` |
| primary-30 | 30 | `primary-30` |
| primary-40 | 40 | `primary-40` |
| primary-50 | 50 | `primary-50` |
| primary-60 | 60 | `primary-60` |
| primary-70 | 70 | `primary-70` |
| primary-80 | 80 | `primary-80` |
| primary-90 | 90 | `primary-90` |
| primary-95 | 95 | `primary-95` |
| primary-99 | 99 | `primary-99` |
| primary-100 | 100 | `primary-100` |

Setup for each: Parent=Primary, DiffH=OFF, DiffC=OFF, DiffT=OFF, LockT=Yes(value), autoAssign with `primary` prefix.

Alternative: Use a **Palette node** with paletteShadeCount=13, paletteCurveType=`custom`, paletteCustomCurvePoints=`[0, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 0.99, 1.0]`, then rename the generated tokens.

---

### Secondary Palette (13 nodes, children of Secondary)

Same pattern as Primary. Token prefix: `secondary`.

| Node Name | Lock T | Token Name |
|-----------|--------|------------|
| secondary-0 | 0 | `secondary-0` |
| secondary-10 | 10 | `secondary-10` |
| ... | ... | ... |
| secondary-100 | 100 | `secondary-100` |

---

### Tertiary Palette (13 nodes, children of Tertiary)

Same pattern. Token prefix: `tertiary`.

---

### Error Palette (13 nodes, children of Error)

Same pattern. Token prefix: `error`.

---

### Neutral Palette (17 nodes, children of Neutral)

Neutral needs MORE tones for the surface container system.

| Node Name | Lock T | Token Name |
|-----------|--------|------------|
| neutral-0 | 0 | `neutral-0` |
| neutral-4 | 4 | `neutral-4` |
| neutral-6 | 6 | `neutral-6` |
| neutral-10 | 10 | `neutral-10` |
| neutral-12 | 12 | `neutral-12` |
| neutral-17 | 17 | `neutral-17` |
| neutral-20 | 20 | `neutral-20` |
| neutral-22 | 22 | `neutral-22` |
| neutral-24 | 24 | `neutral-24` |
| neutral-87 | 87 | `neutral-87` |
| neutral-90 | 90 | `neutral-90` |
| neutral-92 | 92 | `neutral-92` |
| neutral-94 | 94 | `neutral-94` |
| neutral-95 | 95 | `neutral-95` |
| neutral-96 | 96 | `neutral-96` |
| neutral-98 | 98 | `neutral-98` |
| neutral-99 | 99 | `neutral-99` |
| neutral-100 | 100 | `neutral-100` |

That's actually 18 tones (I added T95 which is needed for `inverse-on-surface` in light mode).

---

### Neutral Variant Palette (13 nodes, children of NeutralVariant)

| Node Name | Lock T | Token Name |
|-----------|--------|------------|
| neutral-variant-0 | 0 | `neutral-variant-0` |
| neutral-variant-10 | 10 | `neutral-variant-10` |
| neutral-variant-20 | 20 | `neutral-variant-20` |
| neutral-variant-30 | 30 | `neutral-variant-30` |
| neutral-variant-40 | 40 | `neutral-variant-40` |
| neutral-variant-50 | 50 | `neutral-variant-50` |
| neutral-variant-60 | 60 | `neutral-variant-60` |
| neutral-variant-70 | 70 | `neutral-variant-70` |
| neutral-variant-80 | 80 | `neutral-variant-80` |
| neutral-variant-90 | 90 | `neutral-variant-90` |
| neutral-variant-95 | 95 | `neutral-variant-95` |
| neutral-variant-99 | 99 | `neutral-variant-99` |
| neutral-variant-100 | 100 | `neutral-variant-100` |

---

## PAGE 3: Semantic Tokens (Color Roles)

### Setup

1. Create `sys` as a **Token Prefix Node** (isTokenPrefix=true)
2. Add 45 child token nodes under `sys`
3. For each child, set the `tokenNodeSuffix`
4. Assign `valueTokenAssignments` per theme

### Per-Theme Value Token Assignment Table

Each row = one token node child of `sys`.
The Light theme column = the palette token assigned in the primary (Light) theme.
The Dark theme column = the palette token assigned in the Dark theme (unlinked from primary).

**No advanced logic needed** — 0colors' native per-theme `valueTokenAssignments` handles this.

#### Accent Colors (Primary family)

| Token Suffix | Light → Palette Token | Dark → Palette Token |
|-------------|----------------------|---------------------|
| `primary` | `primary-40` | `primary-80` |
| `on-primary` | `primary-100` | `primary-20` |
| `primary-container` | `primary-90` | `primary-30` |
| `on-primary-container` | `primary-10` | `primary-90` |

#### Accent Colors (Secondary family)

| Token Suffix | Light → Palette Token | Dark → Palette Token |
|-------------|----------------------|---------------------|
| `secondary` | `secondary-40` | `secondary-80` |
| `on-secondary` | `secondary-100` | `secondary-20` |
| `secondary-container` | `secondary-90` | `secondary-30` |
| `on-secondary-container` | `secondary-10` | `secondary-90` |

#### Accent Colors (Tertiary family)

| Token Suffix | Light → Palette Token | Dark → Palette Token |
|-------------|----------------------|---------------------|
| `tertiary` | `tertiary-40` | `tertiary-80` |
| `on-tertiary` | `tertiary-100` | `tertiary-20` |
| `tertiary-container` | `tertiary-90` | `tertiary-30` |
| `on-tertiary-container` | `tertiary-10` | `tertiary-90` |

#### Error Colors

| Token Suffix | Light → Palette Token | Dark → Palette Token |
|-------------|----------------------|---------------------|
| `error` | `error-40` | `error-80` |
| `on-error` | `error-100` | `error-20` |
| `error-container` | `error-90` | `error-30` |
| `on-error-container` | `error-10` | `error-90` |

#### Surface Colors

| Token Suffix | Light → Palette Token | Dark → Palette Token |
|-------------|----------------------|---------------------|
| `surface` | `neutral-98` | `neutral-6` |
| `on-surface` | `neutral-10` | `neutral-90` |
| `surface-variant` | `neutral-variant-90` | `neutral-variant-30` |
| `on-surface-variant` | `neutral-variant-30` | `neutral-variant-80` |
| `surface-dim` | `neutral-87` | `neutral-6` |
| `surface-bright` | `neutral-98` | `neutral-24` |
| `surface-container-lowest` | `neutral-100` | `neutral-4` |
| `surface-container-low` | `neutral-96` | `neutral-10` |
| `surface-container` | `neutral-94` | `neutral-12` |
| `surface-container-high` | `neutral-92` | `neutral-17` |
| `surface-container-highest` | `neutral-90` | `neutral-22` |

#### Outline Colors

| Token Suffix | Light → Palette Token | Dark → Palette Token |
|-------------|----------------------|---------------------|
| `outline` | `neutral-variant-50` | `neutral-variant-60` |
| `outline-variant` | `neutral-variant-80` | `neutral-variant-30` |

#### Inverse Colors

| Token Suffix | Light → Palette Token | Dark → Palette Token |
|-------------|----------------------|---------------------|
| `inverse-surface` | `neutral-20` | `neutral-90` |
| `inverse-on-surface` | `neutral-95` | `neutral-20` |
| `inverse-primary` | `primary-80` | `primary-40` |

#### Utility Colors

| Token Suffix | Light → Palette Token | Dark → Palette Token |
|-------------|----------------------|---------------------|
| `shadow` | `neutral-0` | `neutral-0` |
| `scrim` | `neutral-0` | `neutral-0` |

#### Fixed Accent Colors (SAME in both themes)

These are M3's "fixed" colors that do NOT change between light and dark.
Assign the SAME palette token in both themes (or leave Dark inherited from Light).

| Token Suffix | Both Themes → Palette Token |
|-------------|---------------------------|
| `primary-fixed` | `primary-90` |
| `primary-fixed-dim` | `primary-80` |
| `on-primary-fixed` | `primary-10` |
| `on-primary-fixed-variant` | `primary-30` |
| `secondary-fixed` | `secondary-90` |
| `secondary-fixed-dim` | `secondary-80` |
| `on-secondary-fixed` | `secondary-10` |
| `on-secondary-fixed-variant` | `secondary-30` |
| `tertiary-fixed` | `tertiary-90` |
| `tertiary-fixed-dim` | `tertiary-80` |
| `on-tertiary-fixed` | `tertiary-10` |
| `on-tertiary-fixed-variant` | `tertiary-30` |

---

## ADVANCED LOGIC LAYER: Scheme Variant Support

If you want to support multiple scheme variants (beyond the default TonalSpot), you need a **Variant Selector** node and conditional advanced logic on each key color.

### Variant Selector Node

| Property | Value |
|----------|-------|
| Type | HCT root node |
| Reference Name | `Variant` |
| Lock H | No |
| Lock C | No |
| Lock T | Yes |
| T value | Use T to represent variant: 0=TonalSpot, 10=Content, 20=Vibrant, 30=Expressive, 40=Fidelity, 50=Monochrome |
| Purpose | This node acts as a parameter. Its T value selects the scheme variant. |

### Primary — Advanced Logic with Variant Support

**hctC channel (multi-row):**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `@Seed.hctC` | `seedC` | Cache seed chroma for reuse |
| 2 | `max(seedC, 36)` | `tonalspot` | TonalSpot: min 36 |
| 3 | `seedC` | `content` | Content/Fidelity: exact seed chroma |
| 4 | `200` | `vibrant` | Vibrant: request 200 (gamut clamps to max) |
| 5 | `40` | `expressive` | Expressive: fixed 40 |
| 6 | `0` | `mono` | Monochrome: 0 chroma |
| 7 | `if @Variant.hctT < 5 then tonalspot else if @Variant.hctT < 15 then content else if @Variant.hctT < 25 then vibrant else if @Variant.hctT < 35 then expressive else if @Variant.hctT < 45 then content else mono` | `final` | Select based on variant |

**hctH channel (for Expressive only — Expressive rotates primary hue by +240):**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `if @Variant.hctT >= 25 AND @Variant.hctT < 35 then mod(@Parent.hctH + 240, 360) else @Parent.hctH` | `out_1` | Expressive: +240 rotation. Others: inherit seed hue. |

### Secondary — Advanced Logic with Variant Support

**hctC channel:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `@Seed.hctC` | `seedC` | Cache |
| 2 | `16` | `tonalspot` | TonalSpot: fixed 16 |
| 3 | `max(seedC - 32, seedC * 0.5)` | `content` | Content/Fidelity: desaturated source |
| 4 | `24 + (seedC - 24) * 0.33` | `vibrant` | Vibrant: boosted |
| 5 | `24` | `expressive` | Expressive: fixed 24 |
| 6 | `0` | `mono` | Monochrome |
| 7 | `if @Variant.hctT < 5 then tonalspot else if @Variant.hctT < 15 then content else if @Variant.hctT < 25 then vibrant else if @Variant.hctT < 35 then expressive else if @Variant.hctT < 45 then content else mono` | `final` | Select |

**hctH channel:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `if @Variant.hctT >= 25 AND @Variant.hctT < 35 then mod(@Parent.hctH + 15, 360) else @Parent.hctH` | `out_1` | Expressive: +15. Others: inherit seed. |

### Tertiary — Advanced Logic with Variant Support

**hctC channel:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `@Seed.hctC` | `seedC` | Cache |
| 2 | `24` | `tonalspot` | TonalSpot: fixed 24 |
| 3 | `max(seedC - 32, seedC * 0.5)` | `content` | Content/Fidelity: desaturated |
| 4 | `32 + (seedC - 32) * 0.33` | `vibrant` | Vibrant: boosted |
| 5 | `32` | `expressive` | Expressive: fixed 32 |
| 6 | `0` | `mono` | Monochrome |
| 7 | variant selector (same pattern as above) | `final` | Select |

**hctH channel:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `mod(@Seed.hctH + 60, 360)` | `tspot` | TonalSpot/Vibrant: +60 |
| 2 | `mod(@Seed.hctH + 60, 360)` | `contentH` | Content/Fidelity: should use temperature-based analogous, but +60 is a close approximation |
| 3 | `mod(@Seed.hctH + 135, 360)` | `expressive` | Expressive: +135 |
| 4 | `if @Variant.hctT >= 25 AND @Variant.hctT < 35 then expressive else tspot` | `final` | Select |

### Neutral — Advanced Logic with Variant Support

**hctC channel:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `@Seed.hctC` | `seedC` | Cache |
| 2 | `min(seedC / 12, 4)` | `tonalspot` | TonalSpot: proportional, max 4 |
| 3 | `seedC / 8` | `content` | Content/Fidelity: seedC/8 |
| 4 | `10` | `vibrant` | Vibrant: fixed 10 |
| 5 | `8` | `expressive` | Expressive: fixed 8 |
| 6 | `0` | `mono` | Monochrome |
| 7 | variant selector (same pattern) | `final` | Select |

**hctH channel:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `if @Variant.hctT >= 25 AND @Variant.hctT < 35 then mod(@Parent.hctH + 15, 360) else @Parent.hctH` | `out_1` | Expressive: +15. Others: inherit. |

### Neutral Variant — Advanced Logic with Variant Support

**hctC channel:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `@Seed.hctC` | `seedC` | Cache |
| 2 | `min(seedC / 6, 8)` | `tonalspot` | TonalSpot: proportional, max 8 |
| 3 | `seedC / 8 + 4` | `content` | Content/Fidelity: seedC/8 + 4 |
| 4 | `12` | `vibrant` | Vibrant: fixed 12 |
| 5 | `12` | `expressive` | Expressive: fixed 12 |
| 6 | `0` | `mono` | Monochrome |
| 7 | variant selector (same pattern) | `final` | Select |

**hctH channel:**

Same as Neutral (Expressive: +15, others: inherit).

---

## ADVANCED LOGIC LAYER: DislikeAnalyzer (Tertiary Only)

This corrects unpleasant yellow-green colors. Apply to the Tertiary node's hctT channel.

**On Tertiary node — hctT channel — add AFTER the existing logic:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| (existing rows for Lock T = 40) | ... | ... | ... |
| New | `if @Self.hctH >= 90 AND @Self.hctH <= 111 AND @Self.hctC > 16 AND locked < 65 then 70 else locked` | `dislike_fix` | Shift tone to 70 if color falls in the "disliked" yellow-green range |

> Note: `locked` returns the pre-logic value (40). This only activates for Content/Fidelity schemes where the tertiary hue might land in the disliked range.

---

## ADVANCED LOGIC LAYER: Contrast Level Support

This is the most complex layer. It requires:
1. A **Contrast Level** parameter node
2. Additional palette tone stops for finer granularity
3. Advanced token assignment logic on EVERY semantic token node

### Contrast Level Parameter Node

| Property | Value |
|----------|-------|
| Type | HCT root node |
| Reference Name | `ContrastLevel` |
| Lock T | No (user adjusts this as the contrast slider) |
| T range interpretation | T=0 → contrast level -1.0 (low), T=50 → contrast 0.0 (standard), T=100 → contrast 1.0 (high) |
| H, C | Don't matter (only T is read) |

### Additional Palette Tones Needed

For contrast adjustment, you need palette stops at every 5 units:
```
Each palette: T0, T5, T10, T15, T20, T25, T30, T35, T40, T45, T50, T55, T60, T65, T70, T75, T80, T85, T90, T95, T100
```

That's 21 tones per palette x 6 palettes = **126 additional tone nodes**.

### How ContrastCurve Works

Each semantic color has 4 contrast ratio targets:
```
ContrastCurve(low, normal, medium, high)
```

The actual target is interpolated based on the contrast level:
```
level = map(@ContrastLevel.hctT, 0, 100, -1, 1)

if level <= -1: target = low
if level in [-1, 0]: target = lerp(low, normal, level + 1)
if level in [0, 0.5]: target = lerp(normal, medium, level * 2)
if level in [0.5, 1]: target = lerp(medium, high, (level - 0.5) * 2)
```

### How Tone is Adjusted for Contrast

Given a target contrast ratio against a background tone, the algorithm finds the tone that achieves that ratio:

```
For light scheme (primary on surface T98):
  Start at base tone (e.g., T40 for primary)
  Check contrast(T40, T98) against target
  If insufficient, go darker (T39, T38, T37...)
  Until contrast >= target

For dark scheme (primary on surface T6):
  Start at base tone (T80)
  If insufficient, go lighter (T81, T82, T83...)
```

### Example: sys/primary with Contrast Logic

**Token assignment advanced logic on `sys/primary` node:**

For Light theme:

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` | `level` | Normalize to -1..+1 |
| 2 | `if level <= 0 then lerp(3, 4.5, level + 1) else if level <= 0.5 then lerp(4.5, 7, level * 2) else lerp(7, 7, (level - 0.5) * 2)` | `target` | ContrastCurve(3, 4.5, 7, 7) interpolation |
| 3 | `if target <= 4.5 then {primary-40} else if target <= 5.5 then {primary-35} else if target <= 7 then {primary-30} else {primary-25}` | `out_1` | Pick the darkest tone that meets the target contrast against neutral-98 surface |

> **Practical note:** This is an approximation. The exact algorithm requires computing contrast ratios dynamically, which would need `contrast(@Node1, @Node2)` between the candidate tone node and the surface node. This IS possible using 0colors' `contrast()` function with node refs!

**More precise version using contrast() node-ref:**

| Row | Expression | Output Var | Purpose |
|-----|-----------|------------|---------|
| 1 | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` | `level` | Normalize |
| 2 | `if level <= 0 then lerp(3, 4.5, level + 1) else if level <= 0.5 then lerp(4.5, 7, level * 2) else lerp(7, 7, (level - 0.5) * 2)` | `target` | Target contrast ratio |
| 3 | `contrast(@primary-40, @neutral-98)` | `c40` | Actual contrast of T40 vs surface |
| 4 | `contrast(@primary-35, @neutral-98)` | `c35` | T35 vs surface |
| 5 | `contrast(@primary-30, @neutral-98)` | `c30` | T30 vs surface |
| 6 | `contrast(@primary-25, @neutral-98)` | `c25` | T25 vs surface |
| 7 | `if c40 >= target then {primary-40} else if c35 >= target then {primary-35} else if c30 >= target then {primary-30} else {primary-25}` | `out_1` | Pick the lightest tone that meets contrast |

> This WORKS in 0colors because `contrast()` with node refs resolves the actual RGB luminance. You need the extra palette tone nodes (primary-25, primary-35, etc.) to have candidates to test.

---

## ADVANCED LOGIC LAYER: ToneDeltaPair Constraints

ToneDeltaPair ensures `primary` and `primaryContainer` stay at least 10 tone units apart.

At standard contrast, primary=T40 and primaryContainer=T90, so they're 50 apart (no issue).

At high contrast, if primary shifts to T25 and container shifts to T30, they'd only be 5 apart. ToneDeltaPair forces them to be >= 10 apart.

### Implementation

On `sys/primary-container` token node, add logic that checks the primary's tone:

```
(After computing the container's contrast-adjusted tone)
if abs({primary-X}.hctT - container_tone) < 10 then
  shift container tone away by 10
```

This requires the container's logic to READ the primary's resolved tone, which creates a circular dependency concern. In M3's library this is handled by a global solver. In 0colors, you'd need to:

1. Evaluate primary first (it doesn't depend on container)
2. Then evaluate container (which reads primary's resolved tone)

**In practice:** If you're not implementing contrast adjustment, ToneDeltaPair never activates because the default tones (T40/T90, T80/T30) are already 50+ apart.

---

## COMPLETE NODE COUNT

| Page | Regular Nodes | Token Nodes | Tokens |
|------|---------------|-------------|--------|
| Page 1: Key Colors | 7 (+ optional Variant, ContrastLevel) | 0 | 0 |
| Page 2: Tonal Palettes | 82 (13+13+13+18+13+13) | 0 | 82 |
| Page 3: Semantic Tokens | 0 | 46 (1 prefix + 45 children) | 45 |
| Page 4: Components | 0 | ~25 | ~20 |
| **Total** | **89** | **71** | **147** |

With contrast support (21 tones x 6 palettes): 126 + 7 + 46 + 25 = **~204 nodes, ~173 tokens**

---

## BUILD ORDER

### Phase 1: Foundation (can be done in one session)
1. Create project, add Light and Dark themes
2. Page 1: Create Seed + 5 children + Error root (7 nodes)
3. Add advanced logic to Primary (hctC: `max(@Parent.hctC, 36)`)
4. Add advanced logic to Neutral (hctC: `min(@Parent.hctC / 12, 4)`)
5. Add advanced logic to NeutralVariant (hctC: `min(@Parent.hctC / 6, 8)`)
6. Page 2: Create 82 tone child nodes with locked T values
7. Enable auto-assign on each key color, set prefixes, rename tokens to M3 names

### Phase 2: Semantic Layer (second session)
8. Page 3: Create `sys` prefix node + 45 child token nodes
9. In Light theme: assign each token node to its Light palette token
10. Switch to Dark theme: unlink each, assign Dark palette token
11. Test: change Seed H → verify entire chain updates

### Phase 3: Scheme Variants (optional)
12. Add Variant selector node
13. Replace simple advanced logic on key colors with variant-aware multi-row logic

### Phase 4: Contrast Level (optional, complex)
14. Add ContrastLevel node
15. Add finer palette tone stops (every 5 units)
16. Add contrast-curve token assignment logic to all semantic tokens

### Phase 5: Component Tokens (optional)
17. Page 4: Create `comp` prefix + component sub-prefixes + alias children

---

## VALIDATION CHECKLIST

- [ ] Change Seed H → all key colors update H (except Error and Tertiary which offsets)
- [ ] Change Seed C → Primary C adjusts (min 36), Neutral/NV adjust proportionally
- [ ] Seed C=10 → Primary C=36 (boosted), Neutral C=0.83, NV C=1.67
- [ ] Seed C=60 → Primary C=60 (passed through), Neutral C=4 (capped), NV C=8 (capped)
- [ ] Seed C=120 → Primary C=120, Neutral C=4 (capped), NV C=8 (capped)
- [ ] primary-0 displays as near-black (T0 = black regardless of chroma)
- [ ] primary-100 displays as near-white (T100 = white regardless of chroma)
- [ ] primary-50 shows higher visible chroma than primary-95
- [ ] Switch Light → Dark → all semantic tokens flip correctly
- [ ] sys/shadow and sys/scrim are both neutral-0 in both themes
- [ ] Fixed tokens (primary-fixed etc.) are SAME in both themes
- [ ] Token table shows proper paths: `sys/primary`, `sys/on-primary`, etc.
- [ ] Changing Seed H to 90 (yellow-green) → verify Tertiary doesn't look "ugly" if DislikeAnalyzer is enabled
- [ ] Export/Code View shows correct CSS custom properties
