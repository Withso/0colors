# Material Theme — Complete Advanced Logic Guide v2

> Revised and revamped. Incorporates:
> - 2-page layout (Primitives + Semantics)
> - 8 themes (Light, Light MC, Light HC, Dark, Dark MC, Dark HC, Mono Light, Mono Dark)
> - Seed Tone user-adjustable + key color T inheritance
> - Error as child of Seed
> - Complete per-theme semantic token assignments
> - ContrastCurve with pre-computed targets per theme
> - ToneDeltaPair + DislikeAnalyzer
> - Scheme Variant support via Variant parameter node

---

## How This Document Works

Each node lists its EXACT configuration and advanced logic expressions
as typed in the 0colors Advanced Logic popup. Multi-row logic is shown
as numbered rows with output variable names.

**Expression syntax key:**
- `@NodeName.hctT` — reads HCT Tone from a color node
- `@Parent.hctH` — reads HCT Hue from the parent node
- `@Self.hctH` — reads the current node's own resolved H
- `{token-name}` — resolves to a token's color value
- `{token-name}.hctT` — reads HCT Tone from a resolved token
- `contrast({token-a}, {token-b})` — WCAG 2.x contrast ratio (1-21)
- `$varName` — local variable from a previous row
- `if ... then ... else ...` — conditional expression

---

## Architecture

```
PAGE 1: Primitives
  ├── Control & Key Color Nodes (8 HCT nodes)
  │     Seed (T = user-adjustable)
  │       ├── Primary      (T inherits Seed)
  │       ├── Secondary    (T inherits Seed)
  │       ├── Tertiary     (T inherits Seed, DislikeAnalyzer)
  │       ├── Neutral      (T inherits Seed)
  │       ├── NeutralVariant (T inherits Seed)
  │       └── Error        (T inherits Seed; H=25 LOCKED, C=84 LOCKED)
  │     Variant (parameter — scheme selection)
  │
  └── Tonal Palettes (21 tones x 6 palettes = 126+ nodes, 126+ tokens)
        Primary:        T0-T100 every 5 (21 tones)
        Secondary:      T0-T100 every 5 (21 tones)
        Tertiary:       T0-T100 every 5 (21 tones)
        Neutral:        21 standard + 12 surface-specific (33 tones)
        NeutralVariant: T0-T100 every 5 (21 tones)
        Error:          T0-T100 every 5 (21 tones)

PAGE 2: Semantics (1 prefix + 45 token nodes)
  sys/primary, sys/on-primary, sys/primary-container, ...
  Each token has 8 theme assignments
  ContrastCurve logic on Medium/High contrast themes
  ToneDeltaPair on container tokens
```

---

## Eight Theme Definitions

The project contains **8 themes**. Each maps to a specific combination
of light/dark mode and contrast level.

| # | Theme Name | Short | Mode | Contrast Level | Notes |
|---|-----------|-------|------|---------------|-------|
| 1 | Light | LT | Light | Standard (0) | Default light theme |
| 2 | Light Medium Contrast | LMC | Light | Medium (+0.5) | Enhanced readability |
| 3 | Light High Contrast | LHC | Light | High (+1.0) | Maximum accessibility |
| 4 | Dark | DT | Dark | Standard (0) | Default dark theme |
| 5 | Dark Medium Contrast | DMC | Dark | Medium (+0.5) | Enhanced readability |
| 6 | Dark High Contrast | DHC | Dark | High (+1.0) | Maximum accessibility |
| 7 | Monochrome Light | MLT | Light | Standard (0) | Grayscale accent colors |
| 8 | Monochrome Dark | MDT | Dark | Standard (0) | Grayscale accent colors |

**How themes differ:**
- **LT / DT**: Standard M3 output. Simple palette-tone references.
- **LMC / DMC**: Uses `contrast()` checks to find tones meeting medium targets.
- **LHC / DHC**: Uses `contrast()` checks to find tones meeting high targets.
- **MLT / MDT**: Replaces accent palette references with `{neutral-N}` palette.
  Error family stays colored. Uses special monochrome base tones for primary family.

---

## Pre-Computed Contrast Targets per Theme

Each ContrastCurve has 4 values: `(low, normal, medium, high)`.
The contrast level maps to a specific target ratio:

| ContrastCurve | LT / DT | LMC / DMC | LHC / DHC |
|--------------|---------|-----------|-----------|
| **(3, 4.5, 7, 7)** | 4.5 | 7.0 | 7.0 |
| **(4.5, 7, 11, 21)** | 7.0 | 11.0 | 21.0 |
| **(1, 1, 3, 4.5)** | 1.0 | 3.0 | 4.5 |
| **(1.5, 3, 4.5, 7)** | 3.0 | 4.5 | 7.0 |
| **(3, 4.5, 7, 11)** | 4.5 | 7.0 | 11.0 |
| **(1, 1, 1, 3)** | 1.0 | 1.0 | 3.0 |
| **(1, 1, 1, 1)** | 1.0 | 1.0 | 1.0 |

> Note: For curve (3, 4.5, 7, 7), medium and high targets are BOTH 7.0.
> This means LMC and LHC produce identical results for tokens using this curve.
> Same for DMC and DHC.

**MLT / MDT** use standard contrast (target = "normal" column), but
reference the neutral palette instead of accent palettes.

---

## PAGE 1: Primitives — Control & Key Color Nodes

---

### Node: Seed

| Property | Value |
|----------|-------|
| Type | Root HCT node |
| Reference Name | `Seed` |
| H | User-chosen |
| C | User-chosen |
| T | **User-adjustable (default 50)** |
| Lock H | No |
| Lock C | No |
| Lock T | **No** |
| Advanced Logic | None |

> Seed Tone controls the display brightness of all key color swatches.
> It is purely cosmetic — it does NOT affect palettes or semantic tokens.
> Only Hue and Chroma flow downstream into the color system.

---

### Node: Variant (Parameter)

| Property | Value |
|----------|-------|
| Type | Root HCT node |
| Reference Name | `Variant` |
| H | 0 (unused) |
| C | 0 (unused) |
| T | User-adjustable: scheme selection |
| Lock T | No |

**T value mapping:**

| T Value | Scheme |
|---------|--------|
| 0 | Tonal Spot (default) |
| 10 | Content |
| 20 | Vibrant |
| 30 | Expressive |
| 40 | Fidelity |
| 50 | Monochrome |

> The Variant parameter controls key color H/C derivation on Page 1.
> The 6 non-monochrome themes (LT through DHC) use the current variant.
> The 2 monochrome themes (MLT, MDT) bypass accent palettes entirely
> and reference neutral palette, regardless of Variant setting.
>
> Note: Monochrome (T=50) sets all accent chroma to 0 via advanced logic,
> which is useful for preview. But the MLT/MDT themes work independently
> by referencing neutral palette directly.

---

### Node: Primary (Child of Seed)

| Property | Value |
|----------|-------|
| Parent | Seed |
| Color Space | HCT |
| Reference Name | `Primary` |
| Diff H | OFF |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No |
| Lock C | Yes → 36 |
| Lock T | **No** (inherits Seed T via parent propagation) |

**Advanced Logic — hctH channel (4 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `seedH` | `@Parent.hctH` |
| 2 | `expH` | `mod(seedH + 240, 360)` |
| 3 | `isExp` | `@Variant.hctT >= 25 AND @Variant.hctT < 35` |
| 4 | `out_1` | `if isExp then expH else seedH` |

> Expressive rotates primary hue by +240. All other variants inherit seed hue.

**Advanced Logic — hctC channel (8 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `seedC` | `@Seed.hctC` |
| 2 | `vT` | `@Variant.hctT` |
| 3 | `tspot` | `max(seedC, 36)` |
| 4 | `content` | `seedC` |
| 5 | `vibrant` | `200` |
| 6 | `express` | `40` |
| 7 | `mono` | `0` |
| 8 | `out_1` | `if vT < 5 then tspot else if vT < 15 then content else if vT < 25 then vibrant else if vT < 35 then express else if vT < 45 then content else mono` |

**Advanced Logic — hctT channel: NONE**

> T is unlocked with no advanced logic. The 0colors propagation engine
> automatically copies the parent's (Seed's) T to this child node
> when `lockHctT=false` and `diffHctT=false`.

---

### Node: Secondary (Child of Seed)

| Property | Value |
|----------|-------|
| Parent | Seed |
| Reference Name | `Secondary` |
| Diff H | OFF |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No |
| Lock C | Yes → 16 |
| Lock T | **No** (inherits Seed T) |

**Advanced Logic — hctH channel (4 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `seedH` | `@Parent.hctH` |
| 2 | `expH` | `mod(seedH + 15, 360)` |
| 3 | `isExp` | `@Variant.hctT >= 25 AND @Variant.hctT < 35` |
| 4 | `out_1` | `if isExp then expH else seedH` |

**Advanced Logic — hctC channel (8 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `seedC` | `@Seed.hctC` |
| 2 | `vT` | `@Variant.hctT` |
| 3 | `tspot` | `16` |
| 4 | `content` | `max(seedC - 32, seedC * 0.5)` |
| 5 | `vibrant` | `24 + (seedC - 24) * 0.33` |
| 6 | `express` | `24` |
| 7 | `mono` | `0` |
| 8 | `out_1` | `if vT < 5 then tspot else if vT < 15 then content else if vT < 25 then vibrant else if vT < 35 then express else if vT < 45 then content else mono` |

**Advanced Logic — hctT channel: NONE** (inherits from Seed)

---

### Node: Tertiary (Child of Seed) — with DislikeAnalyzer

| Property | Value |
|----------|-------|
| Parent | Seed |
| Reference Name | `Tertiary` |
| Diff H | OFF (managed by advanced logic, NOT the diff mechanism) |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No |
| Lock C | Yes → 24 |
| Lock T | **No** (inherits Seed T, with DislikeAnalyzer override) |

**Advanced Logic — hctH channel (6 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `seedH` | `@Seed.hctH` |
| 2 | `vT` | `@Variant.hctT` |
| 3 | `tspotH` | `mod(seedH + 60, 360)` |
| 4 | `expressH` | `mod(seedH + 135, 360)` |
| 5 | `contentH` | `mod(seedH + 60, 360)` |
| 6 | `out_1` | `if vT < 5 then tspotH else if vT < 15 then contentH else if vT < 25 then tspotH else if vT < 35 then expressH else if vT < 45 then contentH else seedH` |

**Advanced Logic — hctC channel (8 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `seedC` | `@Seed.hctC` |
| 2 | `vT` | `@Variant.hctT` |
| 3 | `tspot` | `24` |
| 4 | `content` | `max(seedC - 32, seedC * 0.5)` |
| 5 | `vibrant` | `32 + (seedC - 32) * 0.33` |
| 6 | `express` | `32` |
| 7 | `mono` | `0` |
| 8 | `out_1` | `if vT < 5 then tspot else if vT < 15 then content else if vT < 25 then vibrant else if vT < 35 then express else if vT < 45 then content else mono` |

**Advanced Logic — hctT channel (DislikeAnalyzer) (3 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `baseT` | `@Parent.hctT` |
| 2 | `isDisliked` | `@Self.hctH >= 90 AND @Self.hctH <= 111 AND @Self.hctC > 16 AND baseT < 65` |
| 3 | `out_1` | `if isDisliked then 70 else baseT` |

> **DislikeAnalyzer explained:**
> Row 1 reads the live Seed T (via parent propagation).
> Colors in H 90-111 (yellow-green) with C > 16 and T < 65 look unpleasant.
> The fix: shift tone to 70, making it lighter and more palatable.
> If Seed T >= 65, the base tone is already light enough — no shift needed.

---

### Node: Neutral (Child of Seed)

| Property | Value |
|----------|-------|
| Parent | Seed |
| Reference Name | `Neutral` |
| Diff H | OFF |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No |
| Lock C | Yes → 6 |
| Lock T | **No** (inherits Seed T) |

**Advanced Logic — hctH channel (4 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `seedH` | `@Parent.hctH` |
| 2 | `expH` | `mod(seedH + 15, 360)` |
| 3 | `isExp` | `@Variant.hctT >= 25 AND @Variant.hctT < 35` |
| 4 | `out_1` | `if isExp then expH else seedH` |

**Advanced Logic — hctC channel (8 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `seedC` | `@Seed.hctC` |
| 2 | `vT` | `@Variant.hctT` |
| 3 | `tspot` | `6` |
| 4 | `content` | `seedC / 8` |
| 5 | `vibrant` | `10` |
| 6 | `express` | `8` |
| 7 | `mono` | `0` |
| 8 | `out_1` | `if vT < 5 then tspot else if vT < 15 then content else if vT < 25 then vibrant else if vT < 35 then express else if vT < 45 then content else mono` |

**Advanced Logic — hctT channel: NONE** (inherits from Seed)

---

### Node: NeutralVariant (Child of Seed)

| Property | Value |
|----------|-------|
| Parent | Seed |
| Reference Name | `NeutralVariant` |
| Diff H | OFF |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No |
| Lock C | Yes → 8 |
| Lock T | **No** (inherits Seed T) |

**Advanced Logic — hctH channel (4 rows):**

Same as Neutral (Expressive: +15, others: inherit seed).

**Advanced Logic — hctC channel (8 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `seedC` | `@Seed.hctC` |
| 2 | `vT` | `@Variant.hctT` |
| 3 | `tspot` | `8` |
| 4 | `content` | `seedC / 8 + 4` |
| 5 | `vibrant` | `12` |
| 6 | `express` | `12` |
| 7 | `mono` | `0` |
| 8 | `out_1` | `if vT < 5 then tspot else if vT < 15 then content else if vT < 25 then vibrant else if vT < 35 then express else if vT < 45 then content else mono` |

**Advanced Logic — hctT channel: NONE** (inherits from Seed)

---

### Node: Error (Child of Seed)

| Property | Value |
|----------|-------|
| Type | **Child of Seed** |
| Parent | **Seed** |
| Reference Name | `Error` |
| Diff H | OFF |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | **Yes → 25** |
| Lock C | **Yes → 84** |
| Lock T | **No** (inherits Seed T) |
| Advanced Logic | **None** |

> Error is a child of Seed with H and C LOCKED. The locks isolate
> Error's hue (25) and chroma (84) from the Seed. Only the unlocked
> T channel inherits from Seed, giving Error the same display tone
> as all other key colors.
>
> Error is constant across all scheme variants because H and C locks
> prevent any parent influence on those channels.

---

## PAGE 1: Primitives — Tonal Palettes

### Required Tone Stops

**IMPORTANT:** The ContrastCurve system tests specific intermediate tones
(T5, T15, T25, T35, T45, T55, T65, T75, T85). All palettes MUST include
the full 21-tone set with 5-unit spacing.

**Accent palettes (Primary, Secondary, Tertiary, Error):** 21 tones each

```
T0, T5, T10, T15, T20, T25, T30, T35, T40, T45, T50,
T55, T60, T65, T70, T75, T80, T85, T90, T95, T100
```

**Neutral palette:** 33 tones (21 standard + 12 surface-specific)

```
Standard: T0, T5, T10, T15, T20, T25, T30, T35, T40, T45, T50,
          T55, T60, T65, T70, T75, T80, T85, T90, T95, T100
Surface:  T4, T6, T12, T17, T22, T24, T87, T92, T94, T96, T98, T99
```

**NeutralVariant palette:** 21 tones (standard stops)

### Palette Node Configuration

Each tone node:

| Property | Value |
|----------|-------|
| Parent | Key color node from Page 1 (cross-page link or same page) |
| Color Space | HCT |
| Diff H | OFF |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No (inherits from key color) |
| Lock C | No (inherits from key color — HCT solver auto-gamut-clamps) |
| Lock T | **Yes → specific tone value** |
| Advanced Logic | **None** |

> Palette tone nodes have `lockHctT: true`. This BLOCKS the Seed T
> propagation at this level. Changing Seed T affects key color display
> but never reaches palette tones.

### Token Names

| Palette | Token Format | Example |
|---------|-------------|---------|
| Primary | `primary-{tone}` | `primary-0`, `primary-5` ... `primary-100` |
| Secondary | `secondary-{tone}` | `secondary-0` ... `secondary-100` |
| Tertiary | `tertiary-{tone}` | `tertiary-0` ... `tertiary-100` |
| Neutral | `neutral-{tone}` | `neutral-0`, `neutral-4` ... `neutral-100` |
| NeutralVariant | `neutral-variant-{tone}` | `neutral-variant-0` ... `neutral-variant-100` |
| Error | `error-{tone}` | `error-0` ... `error-100` |

### Token Theme Values

Each palette token has the **SAME color value** across all 8 themes.
Palette tokens are raw colors — themes only affect semantic tokens.

```
{primary-40} = same HCT(H, C, 40) in Light, Dark, LMC, DMC, LHC, DHC, MLT, MDT
```

### Why No Advanced Logic on Palette Nodes?

The HCT color space solver IS the gamut boundary. When a child inherits
C=36 from Primary but has T=95 locked, the solver returns HCT(270, ~12, 95)
— the maximum achievable chroma at that tone. This is EXACTLY what
`TonalPalette.fromHueAndChroma(hue, chroma).tone(95)` does in M3.

---

## Data Flow Summary

```
Seed H ──► Key Color H ──► Palette H ──► Semantic Token COLOR
Seed C ──► Key Color C ──► Palette C ──► (via palette token reference)
Seed T ──► Key Color T ──► STOPS HERE (palette nodes have lockHctT=true)
               │
               └── (cosmetic — canvas display only)

Variant T ──► Key Color H/C derivation ──► Palette H/C ──► Token COLOR
Theme selection ──► Semantic Token TONE (which palette stop to reference)
```

---

## PAGE 2: Semantics — Overview

### Setup

- Create `sys` as a **Token Prefix Node** (`isTokenPrefix = true`)
- Create 45 child token nodes under it
- Each token has **8 theme assignments** (one per theme)
- Standard themes use simple palette references
- Medium/High contrast themes use `contrast()` checking expressions
- Monochrome themes reference neutral palette

### Evaluation Order

Token nodes must be created in dependency order:

1. `surface` (background, no dependencies)
2. `primary`, `secondary`, `tertiary`, `error` (depend on surface)
3. `primary-container`, `secondary-container`, etc. (depend on surface + ToneDeltaPair)
4. `on-primary`, `on-secondary`, etc. (depend on their role)
5. `on-primary-container`, etc. (depend on their container)
6. All other tokens

---

## PAGE 2: Semantics — Token Family Definitions

Tokens are organized into **families** that share the same expression
pattern. Each family defines:
- The ContrastCurve values
- The background token for contrast checks
- The candidate tone direction
- Whether ToneDeltaPair applies

### Family A: Role Tokens

**Tokens:** `primary`, `secondary`, `tertiary`, `error`
**Curve:** (3, 4.5, 7, 7) — **Targets: LT/DT=4.5, LMC/DMC=7, LHC/DHC=7**
**Background:** `{sys/surface}` (= `{neutral-98}` light, `{neutral-6}` dark)
**ToneDeltaPair:** None

| Palette | Token |
|---------|-------|
| primary | `sys/primary` |
| secondary | `sys/secondary` |
| tertiary | `sys/tertiary` |
| error | `sys/error` |

### Family B: On-Role Tokens

**Tokens:** `on-primary`, `on-secondary`, `on-tertiary`, `on-error`
**Curve:** (4.5, 7, 11, 21) — **Targets: LT/DT=7, LMC/DMC=11, LHC/DHC=21**
**Background:** The corresponding role token (`{sys/primary}`, etc.)
**ToneDeltaPair:** None

### Family C: Container Tokens (with ToneDeltaPair)

**Tokens:** `primary-container`, `secondary-container`, `tertiary-container`, `error-container`
**Curve:** (1, 1, 3, 4.5) — **Targets: LT/DT=1, LMC/DMC=3, LHC/DHC=4.5**
**Background:** `{sys/surface}`
**ToneDeltaPair:** Paired with corresponding role token, **delta = 10**

### Family D: On-Container Tokens

**Tokens:** `on-primary-container`, `on-secondary-container`, `on-tertiary-container`, `on-error-container`
**Curve:** (4.5, 7, 11, 21) — **Targets: LT/DT=7, LMC/DMC=11, LHC/DHC=21**
**Background:** The corresponding container token

### Family E: Surface Tokens (No ContrastCurve)

**Curve:** (1, 1, 1, 1) — Always met. **No contrast adjustment needed.**
Simple static assignments for all themes.

**Tokens:** `surface`, `surface-dim`, `surface-bright`,
`surface-container-lowest`, `surface-container-low`, `surface-container`,
`surface-container-high`, `surface-container-highest`

### Family F: On-Surface Tokens

**Tokens:** `on-surface`
**Curve:** (4.5, 7, 11, 21) — **Targets: LT/DT=7, LMC/DMC=11, LHC/DHC=21**
**Background:** `{sys/surface}`
**Palette:** neutral

### Family G: Surface Variant & On-Surface-Variant

- `surface-variant` — Curve: (1, 1, 3, 4.5), BG: surface, Palette: neutral-variant
- `on-surface-variant` — Curve: (3, 4.5, 7, 11), BG: surface, Palette: neutral-variant

### Family H: Outline Tokens

- `outline` — Curve: (1.5, 3, 4.5, 7), BG: surface, Palette: neutral-variant
- `outline-variant` — Curve: (1, 1, 1, 3), BG: surface, Palette: neutral-variant

### Family I: Inverse Tokens

- `inverse-surface` — Curve: (1, 1, 1, 1), static assignment
- `inverse-on-surface` — Curve: (4.5, 7, 11, 21), BG: inverse-surface, Palette: neutral
- `inverse-primary` — Curve: (3, 4.5, 7, 7), BG: inverse-surface, Palette: primary

### Family J: Fixed Accent Tokens (Same in ALL Themes, No Contrast Adjustment)

These tokens are **identical** across all 8 themes. No ContrastCurve.

| Token | Assignment (all 8 themes) |
|-------|--------------------------|
| `sys/primary-fixed` | `{primary-90}` |
| `sys/primary-fixed-dim` | `{primary-80}` |
| `sys/on-primary-fixed` | `{primary-10}` |
| `sys/on-primary-fixed-variant` | `{primary-30}` |
| `sys/secondary-fixed` | `{secondary-90}` |
| `sys/secondary-fixed-dim` | `{secondary-80}` |
| `sys/on-secondary-fixed` | `{secondary-10}` |
| `sys/on-secondary-fixed-variant` | `{secondary-30}` |
| `sys/tertiary-fixed` | `{tertiary-90}` |
| `sys/tertiary-fixed-dim` | `{tertiary-80}` |
| `sys/on-tertiary-fixed` | `{tertiary-10}` |
| `sys/on-tertiary-fixed-variant` | `{tertiary-30}` |

> **Monochrome override for fixed tokens:**
> In MLT/MDT themes, replace accent palette with neutral:
> `{primary-90}` → `{neutral-90}`, `{primary-80}` → `{neutral-80}`, etc.
> Error fixed tokens stay as error palette (not shown above — error has no fixed variants in M3 standard).

### Family K: Utility Tokens

| Token | Assignment (all 8 themes) |
|-------|--------------------------|
| `sys/shadow` | `{neutral-0}` |
| `sys/scrim` | `{neutral-0}` |

---

## PAGE 2: Semantics — Master Token Table

### Legend

- Simple reference: `{palette-tone}` — no advanced logic needed
- `CC→N`: Contrast-check expression needed with target ratio N
- `TDP`: ToneDeltaPair also applies
- Mono cells show the neutral palette reference

---

### Primary Family

| Token | Curve | BG | LT | DT | LMC | DMC | LHC | DHC | MLT | MDT |
|-------|-------|----|----|----|-----|-----|-----|-----|-----|-----|
| **primary** | (3,4.5,7,7) | surface | `{p-40}` | `{p-80}` | CC→7 | CC→7 | CC→7 | CC→7 | `{n-0}` | `{n-100}` |
| **on-primary** | (4.5,7,11,21) | primary | `{p-100}` | `{p-20}` | CC→11 | CC→11 | CC→21 | CC→21 | `{n-90}` | `{n-10}` |
| **primary-container** | (1,1,3,4.5) | surface+TDP | `{p-90}` | `{p-30}` | CC→3+TDP | CC→3+TDP | CC→4.5+TDP | CC→4.5+TDP | `{n-25}` | `{n-85}` |
| **on-primary-container** | (4.5,7,11,21) | p-container | `{p-10}` | `{p-90}` | CC→11 | CC→11 | CC→21 | CC→21 | `{n-100}` | `{n-0}` |

> **p = primary, n = neutral**

### Secondary Family

| Token | Curve | BG | LT | DT | LMC | DMC | LHC | DHC | MLT | MDT |
|-------|-------|----|----|----|-----|-----|-----|-----|-----|-----|
| **secondary** | (3,4.5,7,7) | surface | `{s-40}` | `{s-80}` | CC→7 | CC→7 | CC→7 | CC→7 | `{n-40}` | `{n-80}` |
| **on-secondary** | (4.5,7,11,21) | secondary | `{s-100}` | `{s-20}` | CC→11 | CC→11 | CC→21 | CC→21 | `{n-100}` | `{n-20}` |
| **secondary-container** | (1,1,3,4.5) | surface+TDP | `{s-90}` | `{s-30}` | CC→3+TDP | CC→3+TDP | CC→4.5+TDP | CC→4.5+TDP | `{n-90}` | `{n-30}` |
| **on-secondary-container** | (4.5,7,11,21) | s-container | `{s-10}` | `{s-90}` | CC→11 | CC→11 | CC→21 | CC→21 | `{n-10}` | `{n-90}` |

> **s = secondary, n = neutral**
> Note: Monochrome secondary uses STANDARD tones (40/80) via neutral palette,
> unlike monochrome primary which uses extreme tones (0/100).

### Tertiary Family

| Token | Curve | BG | LT | DT | LMC | DMC | LHC | DHC | MLT | MDT |
|-------|-------|----|----|----|-----|-----|-----|-----|-----|-----|
| **tertiary** | (3,4.5,7,7) | surface | `{t-40}` | `{t-80}` | CC→7 | CC→7 | CC→7 | CC→7 | `{n-40}` | `{n-80}` |
| **on-tertiary** | (4.5,7,11,21) | tertiary | `{t-100}` | `{t-20}` | CC→11 | CC→11 | CC→21 | CC→21 | `{n-100}` | `{n-20}` |
| **tertiary-container** | (1,1,3,4.5) | surface+TDP | `{t-90}` | `{t-30}` | CC→3+TDP | CC→3+TDP | CC→4.5+TDP | CC→4.5+TDP | `{n-90}` | `{n-30}` |
| **on-tertiary-container** | (4.5,7,11,21) | t-container | `{t-10}` | `{t-90}` | CC→11 | CC→11 | CC→21 | CC→21 | `{n-10}` | `{n-90}` |

> **t = tertiary, n = neutral**

### Error Family

| Token | Curve | BG | LT | DT | LMC | DMC | LHC | DHC | MLT | MDT |
|-------|-------|----|----|----|-----|-----|-----|-----|-----|-----|
| **error** | (3,4.5,7,7) | surface | `{e-40}` | `{e-80}` | CC→7 | CC→7 | CC→7 | CC→7 | `{e-40}` | `{e-80}` |
| **on-error** | (4.5,7,11,21) | error | `{e-100}` | `{e-20}` | CC→11 | CC→11 | CC→21 | CC→21 | `{e-100}` | `{e-20}` |
| **error-container** | (1,1,3,4.5) | surface+TDP | `{e-90}` | `{e-30}` | CC→3+TDP | CC→3+TDP | CC→4.5+TDP | CC→4.5+TDP | `{e-90}` | `{e-30}` |
| **on-error-container** | (4.5,7,11,21) | e-container | `{e-10}` | `{e-90}` | CC→11 | CC→11 | CC→21 | CC→21 | `{e-10}` | `{e-90}` |

> **e = error**
> Error stays COLORED in Monochrome themes (H=25, C=84 always).

### Surface Family (No ContrastCurve)

| Token | LT | DT | LMC | DMC | LHC | DHC | MLT | MDT |
|-------|----|----|-----|-----|-----|-----|-----|-----|
| **surface** | `{n-98}` | `{n-6}` | `{n-98}` | `{n-6}` | `{n-98}` | `{n-6}` | `{n-98}` | `{n-6}` |
| **surface-dim** | `{n-87}` | `{n-6}` | `{n-87}` | `{n-6}` | `{n-87}` | `{n-6}` | `{n-87}` | `{n-6}` |
| **surface-bright** | `{n-98}` | `{n-24}` | `{n-98}` | `{n-24}` | `{n-98}` | `{n-24}` | `{n-98}` | `{n-24}` |
| **surface-container-lowest** | `{n-100}` | `{n-4}` | `{n-100}` | `{n-4}` | `{n-100}` | `{n-4}` | `{n-100}` | `{n-4}` |
| **surface-container-low** | `{n-96}` | `{n-10}` | `{n-96}` | `{n-10}` | `{n-96}` | `{n-10}` | `{n-96}` | `{n-10}` |
| **surface-container** | `{n-94}` | `{n-12}` | `{n-94}` | `{n-12}` | `{n-94}` | `{n-12}` | `{n-94}` | `{n-12}` |
| **surface-container-high** | `{n-92}` | `{n-17}` | `{n-92}` | `{n-17}` | `{n-92}` | `{n-17}` | `{n-92}` | `{n-17}` |
| **surface-container-highest** | `{n-90}` | `{n-22}` | `{n-90}` | `{n-22}` | `{n-90}` | `{n-22}` | `{n-90}` | `{n-22}` |

> All surface tokens use neutral palette. Same values across all 8 themes.
> Surface tones only depend on light/dark mode.

### On-Surface & Variant Tokens

| Token | Curve | BG | LT | DT | LMC | DMC | LHC | DHC | MLT | MDT |
|-------|-------|----|----|----|-----|-----|-----|-----|-----|-----|
| **on-surface** | (4.5,7,11,21) | surface | `{n-10}` | `{n-90}` | CC→11 | CC→11 | CC→21 | CC→21 | `{n-10}` | `{n-90}` |
| **surface-variant** | (1,1,3,4.5) | surface | `{nv-90}` | `{nv-30}` | CC→3 | CC→3 | CC→4.5 | CC→4.5 | `{nv-90}` | `{nv-30}` |
| **on-surface-variant** | (3,4.5,7,11) | surface | `{nv-30}` | `{nv-80}` | CC→7 | CC→7 | CC→11 | CC→11 | `{nv-30}` | `{nv-80}` |

> **n = neutral, nv = neutral-variant**

### Outline Tokens

| Token | Curve | BG | LT | DT | LMC | DMC | LHC | DHC | MLT | MDT |
|-------|-------|----|----|----|-----|-----|-----|-----|-----|-----|
| **outline** | (1.5,3,4.5,7) | surface | `{nv-50}` | `{nv-60}` | CC→4.5 | CC→4.5 | CC→7 | CC→7 | `{nv-50}` | `{nv-60}` |
| **outline-variant** | (1,1,1,3) | surface | `{nv-80}` | `{nv-30}` | `{nv-80}` | `{nv-30}` | CC→3 | CC→3 | `{nv-80}` | `{nv-30}` |

> outline-variant: Standard and Medium targets are both 1.0 — always met.
> Only High Contrast (target=3) needs a contrast check.

### Inverse Tokens

| Token | Curve | BG | LT | DT | LMC | DMC | LHC | DHC | MLT | MDT |
|-------|-------|----|----|----|-----|-----|-----|-----|-----|-----|
| **inverse-surface** | (1,1,1,1) | — | `{n-20}` | `{n-90}` | `{n-20}` | `{n-90}` | `{n-20}` | `{n-90}` | `{n-20}` | `{n-90}` |
| **inverse-on-surface** | (4.5,7,11,21) | inv-surface | `{n-95}` | `{n-20}` | CC→11 | CC→11 | CC→21 | CC→21 | `{n-95}` | `{n-20}` |
| **inverse-primary** | (3,4.5,7,7) | inv-surface | `{p-80}` | `{p-40}` | CC→7 | CC→7 | CC→7 | CC→7 | `{n-80}` | `{n-40}` |

### Utility Tokens

| Token | All 8 themes |
|-------|-------------|
| **shadow** | `{n-0}` |
| **scrim** | `{n-0}` |

---

## PAGE 2: Semantics — Expression Templates

### How to Read Expression Templates

Each template uses placeholders:
- `{PAL}` = palette prefix (e.g., `primary`, `secondary`, `neutral`)
- `{BG}` = background token (e.g., `{neutral-98}` or `{sys/surface}`)
- `TARGET` = the pre-computed contrast target for this theme
- `T_BASE` = the standard base tone (e.g., 40 for light role, 80 for dark role)
- `T±5, T±10, T±15, T±20` = candidate tones in the search direction

---

### Template 1: Light Role Token (Family A — Light MC/HC)

**Used by:** sys/primary, sys/secondary, sys/tertiary, sys/error in LMC & LHC themes
**Direction:** Darker (lower T = more contrast against light surface)

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c40` | `contrast({PAL-40}, {neutral-98})` |
| 2 | `c35` | `contrast({PAL-35}, {neutral-98})` |
| 3 | `c30` | `contrast({PAL-30}, {neutral-98})` |
| 4 | `c25` | `contrast({PAL-25}, {neutral-98})` |
| 5 | `c20` | `contrast({PAL-20}, {neutral-98})` |
| 6 | `out_1` | `if c40 >= TARGET then {PAL-40} else if c35 >= TARGET then {PAL-35} else if c30 >= TARGET then {PAL-30} else if c25 >= TARGET then {PAL-25} else {PAL-20}` |

**Substitutions:**

| Token | PAL | TARGET (LMC) | TARGET (LHC) |
|-------|-----|-------------|-------------|
| sys/primary LMC/LHC | `primary` | 7 | 7 |
| sys/secondary LMC/LHC | `secondary` | 7 | 7 |
| sys/tertiary LMC/LHC | `tertiary` | 7 | 7 |
| sys/error LMC/LHC | `error` | 7 | 7 |

> Note: Since curve (3,4.5,7,7) has medium=high=7, **LMC and LHC are identical** for role tokens.

**Concrete example for sys/primary LMC:**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c40` | `contrast({primary-40}, {neutral-98})` |
| 2 | `c35` | `contrast({primary-35}, {neutral-98})` |
| 3 | `c30` | `contrast({primary-30}, {neutral-98})` |
| 4 | `c25` | `contrast({primary-25}, {neutral-98})` |
| 5 | `c20` | `contrast({primary-20}, {neutral-98})` |
| 6 | `out_1` | `if c40 >= 7 then {primary-40} else if c35 >= 7 then {primary-35} else if c30 >= 7 then {primary-30} else if c25 >= 7 then {primary-25} else {primary-20}` |

---

### Template 2: Dark Role Token (Family A — Dark MC/HC)

**Direction:** Lighter (higher T = more contrast against dark surface)

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c80` | `contrast({PAL-80}, {neutral-6})` |
| 2 | `c85` | `contrast({PAL-85}, {neutral-6})` |
| 3 | `c90` | `contrast({PAL-90}, {neutral-6})` |
| 4 | `c95` | `contrast({PAL-95}, {neutral-6})` |
| 5 | `out_1` | `if c80 >= TARGET then {PAL-80} else if c85 >= TARGET then {PAL-85} else if c90 >= TARGET then {PAL-90} else {PAL-95}` |

> Same TARGET substitutions as Template 1 (7 for both DMC and DHC for role tokens).

---

### Template 3: Light On-Role Token (Family B — Light MC/HC)

**Background:** The resolved `{sys/ROLE}` token (NOT surface)
**Direction:** Lighter (on-role is light text on dark role in light theme)

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c100` | `contrast({PAL-100}, {sys/ROLE})` |
| 2 | `c95` | `contrast({PAL-95}, {sys/ROLE})` |
| 3 | `out_1` | `if c100 >= TARGET then {PAL-100} else {PAL-95}` |

**Substitutions:**

| Token | PAL | ROLE | TARGET (LMC) | TARGET (LHC) |
|-------|-----|------|-------------|-------------|
| sys/on-primary LMC | primary | primary | 11 | — |
| sys/on-primary LHC | primary | primary | — | 21 |
| sys/on-secondary LMC | secondary | secondary | 11 | — |
| sys/on-secondary LHC | secondary | secondary | — | 21 |
| etc. |

> For LMC (target=11): T100 on T40 ≈ 12:1+ → usually passes.
> For LHC (target=21): T100 on T40 ≈ 12:1 → may NOT reach 21. Falls to T95.
> At target=21 (maximum), ONLY pure white vs pure black reaches 21:1.
> The expression picks the best available option.

---

### Template 4: Dark On-Role Token (Family B — Dark MC/HC)

**Background:** `{sys/ROLE}` (light text role in dark theme)
**Direction:** Darker

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c20` | `contrast({PAL-20}, {sys/ROLE})` |
| 2 | `c15` | `contrast({PAL-15}, {sys/ROLE})` |
| 3 | `c10` | `contrast({PAL-10}, {sys/ROLE})` |
| 4 | `c0` | `contrast({PAL-0}, {sys/ROLE})` |
| 5 | `out_1` | `if c20 >= TARGET then {PAL-20} else if c15 >= TARGET then {PAL-15} else if c10 >= TARGET then {PAL-10} else {PAL-0}` |

---

### Template 5: Light Container Token with ToneDeltaPair (Family C — Light MC/HC)

**This is the most complex token.** Has BOTH ContrastCurve AND ToneDeltaPair.

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c90` | `contrast({PAL-90}, {neutral-98})` |
| 2 | `c85` | `contrast({PAL-85}, {neutral-98})` |
| 3 | `c80` | `contrast({PAL-80}, {neutral-98})` |
| 4 | `c75` | `contrast({PAL-75}, {neutral-98})` |
| 5 | `c70` | `contrast({PAL-70}, {neutral-98})` |
| 6 | `myTone` | `if c90 >= TARGET then 90 else if c85 >= TARGET then 85 else if c80 >= TARGET then 80 else if c75 >= TARGET then 75 else 70` |
| 7 | `pTone` | `{sys/ROLE}.hctT` |
| 8 | `delta` | `abs(myTone - pTone)` |
| 9 | `adjTone` | `if delta < 10 then myTone + 10 else myTone` |
| 10 | `out_1` | `if adjTone >= 88 then {PAL-90} else if adjTone >= 83 then {PAL-85} else if adjTone >= 78 then {PAL-80} else if adjTone >= 73 then {PAL-75} else {PAL-70}` |

**Substitutions:**

| Token | PAL | ROLE | TARGET (LMC) | TARGET (LHC) |
|-------|-----|------|-------------|-------------|
| sys/primary-container LMC | primary | primary | 3 | — |
| sys/primary-container LHC | primary | primary | — | 4.5 |
| sys/secondary-container LMC | secondary | secondary | 3 | — |
| etc. |

> **ToneDeltaPair logic (rows 7-9):**
> - Row 7: reads the resolved tone of the role token (e.g., sys/primary)
> - Row 8: computes the tone gap between container and role
> - Row 9: if gap < 10, pushes container lighter (in light theme)
> - At standard contrast: myTone=90, pTone≈40, gap=50 → no adjustment
> - At high contrast: myTone might be 75, pTone might be 30, gap=45 → no adjustment
> - Edge case: if both converge to similar tones, TDP activates

---

### Template 6: Dark Container Token with ToneDeltaPair (Family C — Dark MC/HC)

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c30` | `contrast({PAL-30}, {neutral-6})` |
| 2 | `c25` | `contrast({PAL-25}, {neutral-6})` |
| 3 | `c20` | `contrast({PAL-20}, {neutral-6})` |
| 4 | `c15` | `contrast({PAL-15}, {neutral-6})` |
| 5 | `myTone` | `if c30 >= TARGET then 30 else if c25 >= TARGET then 25 else if c20 >= TARGET then 20 else 15` |
| 6 | `pTone` | `{sys/ROLE}.hctT` |
| 7 | `delta` | `abs(myTone - pTone)` |
| 8 | `adjTone` | `if delta < 10 then myTone - 10 else myTone` |
| 9 | `out_1` | `if adjTone >= 28 then {PAL-30} else if adjTone >= 23 then {PAL-25} else if adjTone >= 18 then {PAL-20} else {PAL-15}` |

> In dark theme, TDP pushes container DARKER (lower T).

---

### Template 7: Light On-Container Token (Family D — Light MC/HC)

**Background:** `{sys/ROLE-container}`
**Direction:** Darker (dark text on light container)

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c10` | `contrast({PAL-10}, {sys/ROLE-container})` |
| 2 | `c5` | `contrast({PAL-5}, {sys/ROLE-container})` |
| 3 | `c0` | `contrast({PAL-0}, {sys/ROLE-container})` |
| 4 | `out_1` | `if c10 >= TARGET then {PAL-10} else if c5 >= TARGET then {PAL-5} else {PAL-0}` |

---

### Template 8: Dark On-Container Token (Family D — Dark MC/HC)

**Direction:** Lighter (light text on dark container)

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c90` | `contrast({PAL-90}, {sys/ROLE-container})` |
| 2 | `c95` | `contrast({PAL-95}, {sys/ROLE-container})` |
| 3 | `c100` | `contrast({PAL-100}, {sys/ROLE-container})` |
| 4 | `out_1` | `if c90 >= TARGET then {PAL-90} else if c95 >= TARGET then {PAL-95} else {PAL-100}` |

---

### Template 9: On-Surface & Similar (neutral palette, against surface)

Used for: `sys/on-surface`, `sys/on-surface-variant`, `sys/inverse-on-surface`

**Light MC/HC (darker direction):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c_base` | `contrast({PAL-BASE}, {BG})` |
| 2 | `c_minus5` | `contrast({PAL-BASE-5}, {BG})` |
| 3 | `c_minus10` | `contrast({PAL-BASE-10}, {BG})` |
| 4 | `c_0` | `contrast({PAL-0}, {BG})` |
| 5 | `out_1` | `if c_base >= TARGET then {PAL-BASE} else if c_minus5 >= TARGET then {PAL-BASE-5} else if c_minus10 >= TARGET then {PAL-BASE-10} else {PAL-0}` |

**Concrete example — sys/on-surface LHC:**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c10` | `contrast({neutral-10}, {neutral-98})` |
| 2 | `c5` | `contrast({neutral-5}, {neutral-98})` |
| 3 | `c0` | `contrast({neutral-0}, {neutral-98})` |
| 4 | `out_1` | `if c10 >= 21 then {neutral-10} else if c5 >= 21 then {neutral-5} else {neutral-0}` |

---

### Template 10: Surface-Variant & Outline (neutral-variant palette)

**Light MC/HC examples:**

**sys/surface-variant LMC** (Curve: 1,1,3,4.5 → target=3):

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c90` | `contrast({neutral-variant-90}, {neutral-98})` |
| 2 | `c85` | `contrast({neutral-variant-85}, {neutral-98})` |
| 3 | `c80` | `contrast({neutral-variant-80}, {neutral-98})` |
| 4 | `out_1` | `if c90 >= 3 then {neutral-variant-90} else if c85 >= 3 then {neutral-variant-85} else {neutral-variant-80}` |

**sys/outline LMC** (Curve: 1.5,3,4.5,7 → target=4.5):

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c50` | `contrast({neutral-variant-50}, {neutral-98})` |
| 2 | `c45` | `contrast({neutral-variant-45}, {neutral-98})` |
| 3 | `c40` | `contrast({neutral-variant-40}, {neutral-98})` |
| 4 | `c35` | `contrast({neutral-variant-35}, {neutral-98})` |
| 5 | `out_1` | `if c50 >= 4.5 then {neutral-variant-50} else if c45 >= 4.5 then {neutral-variant-45} else if c40 >= 4.5 then {neutral-variant-40} else {neutral-variant-35}` |

**sys/on-surface-variant LMC** (Curve: 3,4.5,7,11 → target=7):

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c30` | `contrast({neutral-variant-30}, {neutral-98})` |
| 2 | `c25` | `contrast({neutral-variant-25}, {neutral-98})` |
| 3 | `c20` | `contrast({neutral-variant-20}, {neutral-98})` |
| 4 | `out_1` | `if c30 >= 7 then {neutral-variant-30} else if c25 >= 7 then {neutral-variant-25} else {neutral-variant-20}` |

**sys/outline-variant LHC only** (Curve: 1,1,1,3 → target=3 ONLY at HC):

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c80` | `contrast({neutral-variant-80}, {neutral-98})` |
| 2 | `c75` | `contrast({neutral-variant-75}, {neutral-98})` |
| 3 | `c70` | `contrast({neutral-variant-70}, {neutral-98})` |
| 4 | `out_1` | `if c80 >= 3 then {neutral-variant-80} else if c75 >= 3 then {neutral-variant-75} else {neutral-variant-70}` |

**Dark equivalents** — mirror the direction (lighter candidates):

**sys/surface-variant DMC:**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c30` | `contrast({neutral-variant-30}, {neutral-6})` |
| 2 | `c25` | `contrast({neutral-variant-25}, {neutral-6})` |
| 3 | `c20` | `contrast({neutral-variant-20}, {neutral-6})` |
| 4 | `out_1` | `if c30 >= 3 then {neutral-variant-30} else if c25 >= 3 then {neutral-variant-25} else {neutral-variant-20}` |

**sys/outline DMC** (target=4.5):

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c60` | `contrast({neutral-variant-60}, {neutral-6})` |
| 2 | `c65` | `contrast({neutral-variant-65}, {neutral-6})` |
| 3 | `c70` | `contrast({neutral-variant-70}, {neutral-6})` |
| 4 | `out_1` | `if c60 >= 4.5 then {neutral-variant-60} else if c65 >= 4.5 then {neutral-variant-65} else {neutral-variant-70}` |

**sys/on-surface-variant DMC** (target=7):

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c80` | `contrast({neutral-variant-80}, {neutral-6})` |
| 2 | `c85` | `contrast({neutral-variant-85}, {neutral-6})` |
| 3 | `c90` | `contrast({neutral-variant-90}, {neutral-6})` |
| 4 | `out_1` | `if c80 >= 7 then {neutral-variant-80} else if c85 >= 7 then {neutral-variant-85} else {neutral-variant-90}` |

---

### Template 11: Inverse Tokens (Light MC/HC)

**sys/inverse-on-surface** uses `{sys/inverse-surface}` as background.

Light MC/HC (background = `{neutral-20}`, direction = lighter):

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c95` | `contrast({neutral-95}, {sys/inverse-surface})` |
| 2 | `c100` | `contrast({neutral-100}, {sys/inverse-surface})` |
| 3 | `out_1` | `if c95 >= TARGET then {neutral-95} else {neutral-100}` |

Dark MC/HC (background = `{neutral-90}`, direction = darker):

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c20` | `contrast({neutral-20}, {sys/inverse-surface})` |
| 2 | `c15` | `contrast({neutral-15}, {sys/inverse-surface})` |
| 3 | `c10` | `contrast({neutral-10}, {sys/inverse-surface})` |
| 4 | `out_1` | `if c20 >= TARGET then {neutral-20} else if c15 >= TARGET then {neutral-15} else {neutral-10}` |

**sys/inverse-primary** LMC/LHC (background = `{neutral-20}`):

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c80` | `contrast({primary-80}, {sys/inverse-surface})` |
| 2 | `c85` | `contrast({primary-85}, {sys/inverse-surface})` |
| 3 | `c90` | `contrast({primary-90}, {sys/inverse-surface})` |
| 4 | `out_1` | `if c80 >= 7 then {primary-80} else if c85 >= 7 then {primary-85} else {primary-90}` |

**sys/inverse-primary** DMC/DHC (background = `{neutral-90}`):

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `c40` | `contrast({primary-40}, {sys/inverse-surface})` |
| 2 | `c35` | `contrast({primary-35}, {sys/inverse-surface})` |
| 3 | `c30` | `contrast({primary-30}, {sys/inverse-surface})` |
| 4 | `out_1` | `if c40 >= 7 then {primary-40} else if c35 >= 7 then {primary-35} else {primary-30}` |

---

## Monochrome Theme Details

### Principles

1. **Accent palette references → Neutral palette:**
   `{primary-N}` → `{neutral-N}`, `{secondary-N}` → `{neutral-N}`, `{tertiary-N}` → `{neutral-N}`

2. **Error stays colored:**
   `{error-N}` remains `{error-N}` in monochrome themes.

3. **Primary family uses extreme tones** (from M3 `isMonochrome` overrides):
   - MLT: primary=T0, on-primary=T90, primary-container=T25, on-primary-container=T100
   - MDT: primary=T100, on-primary=T10, primary-container=T85, on-primary-container=T0

4. **Secondary/Tertiary families use standard tones** via neutral palette:
   - Same tone stops as LT/DT, just referenced from neutral palette instead.

5. **Surface/outline tokens unchanged** — they already use neutral/neutral-variant.

### Complete Monochrome Assignments

| Token | MLT | MDT |
|-------|-----|-----|
| primary | `{neutral-0}` | `{neutral-100}` |
| on-primary | `{neutral-90}` | `{neutral-10}` |
| primary-container | `{neutral-25}` | `{neutral-85}` |
| on-primary-container | `{neutral-100}` | `{neutral-0}` |
| secondary | `{neutral-40}` | `{neutral-80}` |
| on-secondary | `{neutral-100}` | `{neutral-20}` |
| secondary-container | `{neutral-90}` | `{neutral-30}` |
| on-secondary-container | `{neutral-10}` | `{neutral-90}` |
| tertiary | `{neutral-40}` | `{neutral-80}` |
| on-tertiary | `{neutral-100}` | `{neutral-20}` |
| tertiary-container | `{neutral-90}` | `{neutral-30}` |
| on-tertiary-container | `{neutral-10}` | `{neutral-90}` |
| error | `{error-40}` | `{error-80}` |
| on-error | `{error-100}` | `{error-20}` |
| error-container | `{error-90}` | `{error-30}` |
| on-error-container | `{error-10}` | `{error-90}` |
| surface | `{neutral-98}` | `{neutral-6}` |
| on-surface | `{neutral-10}` | `{neutral-90}` |
| surface-dim | `{neutral-87}` | `{neutral-6}` |
| surface-bright | `{neutral-98}` | `{neutral-24}` |
| surface-container-lowest | `{neutral-100}` | `{neutral-4}` |
| surface-container-low | `{neutral-96}` | `{neutral-10}` |
| surface-container | `{neutral-94}` | `{neutral-12}` |
| surface-container-high | `{neutral-92}` | `{neutral-17}` |
| surface-container-highest | `{neutral-90}` | `{neutral-22}` |
| surface-variant | `{neutral-variant-90}` | `{neutral-variant-30}` |
| on-surface-variant | `{neutral-variant-30}` | `{neutral-variant-80}` |
| outline | `{neutral-variant-50}` | `{neutral-variant-60}` |
| outline-variant | `{neutral-variant-80}` | `{neutral-variant-30}` |
| inverse-surface | `{neutral-20}` | `{neutral-90}` |
| inverse-on-surface | `{neutral-95}` | `{neutral-20}` |
| inverse-primary | `{neutral-80}` | `{neutral-40}` |
| shadow | `{neutral-0}` | `{neutral-0}` |
| scrim | `{neutral-0}` | `{neutral-0}` |
| primary-fixed | `{neutral-90}` | `{neutral-90}` |
| primary-fixed-dim | `{neutral-80}` | `{neutral-80}` |
| on-primary-fixed | `{neutral-10}` | `{neutral-10}` |
| on-primary-fixed-variant | `{neutral-30}` | `{neutral-30}` |
| secondary-fixed | `{neutral-90}` | `{neutral-90}` |
| secondary-fixed-dim | `{neutral-80}` | `{neutral-80}` |
| on-secondary-fixed | `{neutral-10}` | `{neutral-10}` |
| on-secondary-fixed-variant | `{neutral-30}` | `{neutral-30}` |
| tertiary-fixed | `{neutral-90}` | `{neutral-90}` |
| tertiary-fixed-dim | `{neutral-80}` | `{neutral-80}` |
| on-tertiary-fixed | `{neutral-10}` | `{neutral-10}` |
| on-tertiary-fixed-variant | `{neutral-30}` | `{neutral-30}` |

---

## How Standard Themes vs MC/HC Themes Differ: Side-by-Side

### Example: sys/primary across all 8 themes

```
Seed = HCT(270, 36, 50)

LT:  {primary-40}               → HCT(270, 48, 40)  → #485E92
DT:  {primary-80}               → HCT(270, 31, 80)  → #B0C6FF
LMC: contrast-checked, target=7 → likely {primary-35} or {primary-30}
DMC: contrast-checked, target=7 → likely {primary-80} (already 10:1+)
LHC: contrast-checked, target=7 → same as LMC (curve maxes at 7)
DHC: contrast-checked, target=7 → same as DMC
MLT: {neutral-0}                → HCT(270, 3, 0)    → #000000
MDT: {neutral-100}              → HCT(270, 0, 100)  → #FFFFFF
```

### Example: sys/on-primary across all 8 themes

```
LT:  {primary-100}              → white
DT:  {primary-20}               → dark
LMC: contrast-checked, target=11 → likely {primary-100}
DMC: contrast-checked, target=11 → likely {primary-15} or {primary-10}
LHC: contrast-checked, target=21 → {primary-100} (best possible)
DHC: contrast-checked, target=21 → {primary-0} (black)
MLT: {neutral-90}               → light gray
MDT: {neutral-10}               → dark gray
```

---

## Why Semantic Tokens Do NOT Follow Seed Tone

This is critical to understand. The Seed Tone controls key color DISPLAY only.

```
Seed T = 60 → Key colors display at T60 (cosmetic)
                      │
                      ▼
    Palette nodes: lockHctT=true → T propagation STOPS
                      │
                      ▼
    {primary-40} is always HCT(H, C, 40) regardless of Seed T
                      │
                      ▼
    sys/primary Light = {primary-40} (always, at standard contrast)
```

**Why?** Accessibility. sys/primary at T40 gives ~7:1 against T98 surface.
At T60 it would be ~2.5:1 — FAILS WCAG AA. The whole M3 system is designed
to decouple brand color brightness from functional token assignments.

---

## Complete Node Count

| Section | Nodes | Tokens |
|---------|-------|--------|
| Primitives: Controls | 8 (Seed, Primary, Secondary, Tertiary, Neutral, NeutralVariant, Error, Variant) | 0 |
| Primitives: Accent Palettes | 84 (21 × 4) | 84 |
| Primitives: Neutral Palette | 33 (21 + 12 surface) | 33 |
| Primitives: NeutralVariant | 21 | 21 |
| Semantics: Token Prefix + Children | 46 (1 prefix + 45) | 45 |
| **Total** | **192** | **183** |

| Resource | Count |
|----------|-------|
| Themes | 8 |
| Token assignments | 45 tokens × 8 themes = **360** |
| Advanced logic expressions (MC/HC themes) | ~100-120 (only tokens needing CC) |
| Pages | 2 |

---

## Build Order

### Phase 1: Primitives Page — Infrastructure

1. Create project with **8 themes**: Light, Light Medium Contrast, Light High Contrast, Dark, Dark Medium Contrast, Dark High Contrast, Monochrome Light, Monochrome Dark
2. Create Seed node (T=50, all unlocked)
3. Create Variant parameter node (T=0 default = TonalSpot)
4. Create key color nodes (Primary→Error) as children of Seed, lockHctT=false
5. Add hctH + hctC advanced logic to Primary, Secondary, Tertiary, Neutral, NeutralVariant
6. Add hctT DislikeAnalyzer to Tertiary
7. Verify: change Seed H/C → key colors update per variant

### Phase 2: Primitives Page — Palettes

8. Create 6 palette groups with 21+ tone children each
9. Each tone child: parent = key color, lockHctT = true at specific tone
10. Auto-assign tokens with correct naming prefixes
11. Token theme values: same color for all 8 themes (palette tokens are invariant)
12. Verify: change Seed → all palette tones update H/C

### Phase 3: Semantics Page — Standard Themes (LT + DT)

13. Create `sys` prefix + 45 children in dependency order
14. Set LT and DT theme assignments with simple palette references (from Master Token Table)
15. Verify: LT matches standard M3 output, DT matches standard M3 dark

### Phase 4: Semantics Page — Monochrome Themes (MLT + MDT)

16. Set MLT and MDT theme assignments from the Monochrome Assignments table
17. Verify: MLT shows grayscale accent colors, colored error
18. Verify: MDT shows grayscale with correct light/dark inversion

### Phase 5: Semantics Page — Medium Contrast (LMC + DMC)

19. For tokens with curves ≠ (1,1,1,1): add contrast-checking expressions
20. Use the Expression Templates, substituting palette prefix and TARGET values
21. For tokens with curves = (1,1,1,1): copy standard theme assignments
22. Verify: LMC shows darker foregrounds than LT, DMC shows lighter foregrounds than DT

### Phase 6: Semantics Page — High Contrast (LHC + DHC)

23. For tokens where HC target differs from MC: add separate expressions with HC targets
24. For tokens where HC = MC (e.g., role tokens with curve ending 7,7): copy MC assignments
25. Add ToneDeltaPair logic to container tokens in HC themes
26. Verify: LHC shows maximum contrast, near-black text, wide container gaps

### Phase 7: Integration Testing

27. Test all 6 variants × 3 contrast levels (standard from themes)
28. Test DislikeAnalyzer: Seed H=30, Variant=Content → tertiary yellow-green → tone shifts
29. Test ToneDeltaPair: LHC theme → containers stay 10+ tones from roles
30. Test Monochrome: verify grayscale output with colored error
31. Test Seed T change: verify key color display changes but no palette/semantic changes
32. Export: verify CSS custom properties include all 8 theme variants

---

## Validation Matrix

| Test | Expected Result |
|------|----------------|
| LT, Variant=TonalSpot | Matches Google Material Theme Builder standard output |
| DT, Variant=TonalSpot | Matches MTB dark output |
| LMC | Foregrounds darker than LT, containers more distinct |
| LHC | Maximum foreground contrast, near-black text, containers well-separated |
| DMC | Foregrounds lighter than DT |
| DHC | Maximum foreground contrast, near-white text |
| MLT | All accent tokens are grayscale, error stays red |
| MDT | Grayscale dark theme, colored error |
| MLT primary | Near-black (from neutral-0) |
| MDT primary | Near-white (from neutral-100) |
| Any theme, shadow/scrim | Always neutral-0 |
| Fixed tokens | Same in all 8 themes (except mono uses neutral palette) |
| Change Seed T only | Key color displays change, no palette/semantic changes |
| Change Seed H/C | Palettes and semantics update across all themes |
| Variant=Monochrome | Key colors become gray (C=0), affects palette tones |
| ContrastLevel=0 + LT | Same as LT standard |

---

## Quick Reference: Which Themes Need Expressions?

| Token Type | LT/DT | LMC/DMC | LHC/DHC | MLT/MDT |
|-----------|-------|---------|---------|---------|
| Role (primary, etc.) | Simple | CC expression | Same as MC* | Simple |
| On-Role | Simple | CC expression | CC expression (different target) | Simple |
| Container | Simple | CC+TDP expression | CC+TDP expression (different target) | Simple |
| On-Container | Simple | CC expression | CC expression (different target) | Simple |
| Surface family | Simple | Simple (same) | Simple (same) | Simple (same) |
| On-Surface | Simple | CC expression | CC expression (different target) | Simple |
| Surface-Variant | Simple | CC expression | CC expression (different target) | Simple |
| On-Surface-Variant | Simple | CC expression | CC expression (different target) | Simple |
| Outline | Simple | CC expression | CC expression (different target) | Simple |
| Outline-Variant | Simple | Simple (target=1) | CC expression (target=3) | Simple |
| Inverse-surface | Simple | Simple (same) | Simple (same) | Simple (same) |
| Inverse-on-surface | Simple | CC expression | CC expression (different target) | Simple |
| Inverse-primary | Simple | CC expression | Same as MC* | Simple |
| Fixed tokens | Simple | Simple (same) | Simple (same) | Simple (neutral) |
| Utility (shadow/scrim) | Simple | Simple (same) | Simple (same) | Simple (same) |

> *"Same as MC" means the ContrastCurve's medium and high values are identical (e.g., 7,7), so the expression is reusable.

---

## Summary of All Changes from v1

| Item | v1 (Previous) | v2 (This Guide) |
|------|--------------|-----------------|
| Pages | 3 (Source, Palettes, Semantics) | 2 (Primitives, Semantics) |
| Themes | 2 (Light, Dark) | 8 (LT, LMC, LHC, DT, DMC, DHC, MLT, MDT) |
| Seed T | Locked = 50 | User-adjustable, default 50 |
| Key Color Lock T | Yes (T=40 or T=50) | No (inherits Seed T) |
| Error node | Independent root | Child of Seed (H=25, C=84 locked) |
| Tertiary DislikeAnalyzer Row 1 | `locked` | `@Parent.hctT` |
| ContrastLevel node | Required parameter | Removed (contrast baked into themes) |
| Accent tone stops | 13 tones (0,10,20...100) | 21 tones (0,5,10,15...100) |
| Semantic token assignments | 2 per token (Light + Dark) | 8 per token |
| ContrastCurve | Dynamic via ContrastLevel param | Pre-computed targets per theme |
| Monochrome | Via Variant param (T=50) | Dedicated MLT/MDT themes + neutral palette |
| MC/HC contrast | Dynamic slider | Dedicated themes with contrast() expressions |

---

## Appendix: Propagation Engine Reference

From `App.tsx` lines 7186-7188:

```javascript
if (!node.lockHctT && hctTChange !== 0) {
  if (node.diffHctT === false) updates.hctT = parentNode.hctT;
}
```

When `lockHctT = false` and `diffHctT = false`:
- Parent T change propagates to child (child.T = parent.T)
- Cascade continues to grandchildren UNLESS they have `lockHctT: true`
- Palette tone nodes have `lockHctT: true` → propagation stops there
- Changing Seed T affects key color display but NEVER reaches palettes
