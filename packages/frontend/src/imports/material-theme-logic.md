# Material Theme — Complete Advanced Logic Implementation

> Every node. Every expression. Every advanced system.
> Scheme Variants + DislikeAnalyzer + ContrastCurve + ToneDeltaPair
> All unified in a single 0colors project.

---

## How This Document Works

Each node lists its EXACT advanced logic expressions as you would type them in the 0colors Advanced Logic popup. Multi-row logic is shown as numbered rows with output variable names.

**Expression syntax key:**
- `@NodeName.hctT` — reads HCT Tone from a color node (works in both channel logic and token assignment)
- `{token-name}.hctT` — reads HCT Tone from a resolved token's color (token assignment only)
- `contrast({token-a}, {token-b})` — WCAG 2.x contrast ratio between two tokens (returns 1-21)
- `$varName` — local variable from a previous row
- `if ... then ... else ...` — conditional

---

## Architecture

```
PAGE 1: Source & Controls (9 HCT nodes)
  Seed ──┬── Primary
         ├── Secondary
         ├── Tertiary ← DislikeAnalyzer active here
         ├── Neutral
         └── Neutral Variant
  Error (independent root)
  Variant (parameter node — controls which scheme)
  ContrastLevel (parameter node — controls contrast slider)

PAGE 2: Tonal Palettes (21 tones × 6 palettes = 126 nodes, 126 tokens)
  Each palette: T0, T5, T10, T15, T20, T25, T30, T35, T40, T45, T50,
                T55, T60, T65, T70, T75, T80, T85, T90, T95, T100
  Neutral adds: T4, T6, T12, T17, T22, T24, T87, T92, T94, T96, T98, T99
  (Neutral total: 33 tones)

PAGE 3: Semantic Tokens (1 prefix + 45 token nodes)
  sys/primary, sys/on-primary, sys/primary-container, ...
  Each has ContrastCurve logic + ToneDeltaPair where applicable
  Per-theme token assignment with conditional contrast adjustment
```

---

## PAGE 1: Source & Control Nodes

---

### Node: Seed

| Property | Value |
|----------|-------|
| Type | Root HCT node |
| Reference Name | `Seed` |
| H | User-chosen |
| C | User-chosen |
| T | Locked = 50 |
| Advanced Logic | None |

---

### Node: Variant (Parameter)

| Property | Value |
|----------|-------|
| Type | Root HCT node |
| Reference Name | `Variant` |
| H | 0 (unused) |
| C | 0 (unused) |
| T | User-adjustable: represents scheme selection |
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

> Set T to 0 for standard Material behavior. Change to switch schemes.

---

### Node: ContrastLevel (Parameter)

| Property | Value |
|----------|-------|
| Type | Root HCT node |
| Reference Name | `ContrastLevel` |
| H | 0 (unused) |
| C | 0 (unused) |
| T | User-adjustable: 0-100 maps to contrast -1.0 to +1.0 |
| Lock T | No |

**T value mapping:**
| T Value | Contrast Level | Meaning |
|---------|---------------|---------|
| 0 | -1.0 | Reduced contrast |
| 25 | -0.5 | Slightly reduced |
| 50 | 0.0 | Standard (default) |
| 75 | +0.5 | Medium enhanced |
| 100 | +1.0 | High contrast |

> Set T to 50 for standard contrast. Drag to adjust.

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
| Lock T | Yes → 40 |

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

> - TonalSpot: min 36 (matches exactly if seed C >= 36, boosts if lower)
> - Content/Fidelity (T10/T40): passes through exact seed chroma
> - Vibrant: requests 200 (HCT solver gamut-clamps to max achievable)
> - Expressive: fixed 40
> - Monochrome: 0

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
| Lock T | Yes → 40 |

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
| Lock T | Yes → 40 |

**Advanced Logic — hctH channel (6 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `seedH` | `@Seed.hctH` |
| 2 | `vT` | `@Variant.hctT` |
| 3 | `tspotH` | `mod(seedH + 60, 360)` |
| 4 | `expressH` | `mod(seedH + 135, 360)` |
| 5 | `contentH` | `mod(seedH + 60, 360)` |
| 6 | `out_1` | `if vT < 5 then tspotH else if vT < 15 then contentH else if vT < 25 then tspotH else if vT < 35 then expressH else if vT < 45 then contentH else seedH` |

> Note: Content/Fidelity tertiary ideally uses temperature-based analogous selection.
> The `seedH + 60` approximation works for most hues. Monochrome keeps seed hue (chroma is 0 anyway).

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
| 1 | `baseT` | `locked` |
| 2 | `isDisliked` | `@Self.hctH >= 90 AND @Self.hctH <= 111 AND @Self.hctC > 16 AND baseT < 65` |
| 3 | `out_1` | `if isDisliked then 70 else baseT` |

> **DislikeAnalyzer explained:**
> Colors in H 90-111 (yellow-green) with C > 16 and T < 65 look unpleasant.
> The fix: shift tone to 70, making it lighter and more palatable.
> This activates mainly when Content/Fidelity variants send tertiary into the yellow-green zone.
> In TonalSpot (seed+60), it rarely triggers since tertiary hue is offset from seed.

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
| Lock T | Yes → 50 |

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
| Lock T | Yes → 50 |

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

---

### Node: Error (Independent Root)

| Property | Value |
|----------|-------|
| Type | Root HCT node |
| Reference Name | `Error` |
| Lock H | Yes → 25 |
| Lock C | Yes → 84 |
| Lock T | Yes → 40 |
| Advanced Logic | None |

> Error is constant across all variants and contrast levels.

---

## PAGE 2: Tonal Palettes

### Tone Stops

**Accent palettes (Primary, Secondary, Tertiary, Error):** 21 tones each
```
T0, T5, T10, T15, T20, T25, T30, T35, T40, T45, T50, T55, T60, T65, T70, T75, T80, T85, T90, T95, T100
```

**Neutral palette:** 33 tones (21 standard + 12 surface-specific)
```
Standard: T0, T5, T10, T15, T20, T25, T30, T35, T40, T45, T50, T55, T60, T65, T70, T75, T80, T85, T90, T95, T100
Surface:  T4, T6, T12, T17, T22, T24, T87, T92, T94, T96, T98, T99
```

**Neutral Variant palette:** 21 tones (standard stops)

### Node Pattern for Each Tone

| Property | Value |
|----------|-------|
| Parent | Key color node from Page 1 (cross-page link) |
| Color Space | HCT |
| Diff H | OFF |
| Diff C | OFF |
| Diff T | OFF |
| Lock H | No (inherits from parent) |
| Lock C | No (inherits from parent — HCT solver auto-gamut-clamps) |
| Lock T | Yes → specific tone value |
| Advanced Logic | **None** |

### Token Names

Each tone child auto-creates a token via auto-assign:

| Palette | Token Format | Example |
|---------|-------------|---------|
| Primary | `primary-{tone}` | `primary-0`, `primary-5`, `primary-10` ... `primary-100` |
| Secondary | `secondary-{tone}` | `secondary-0` ... `secondary-100` |
| Tertiary | `tertiary-{tone}` | `tertiary-0` ... `tertiary-100` |
| Neutral | `neutral-{tone}` | `neutral-0`, `neutral-4`, `neutral-5`, `neutral-6` ... `neutral-100` |
| NeutralVariant | `neutral-variant-{tone}` | `neutral-variant-0` ... `neutral-variant-100` |
| Error | `error-{tone}` | `error-0` ... `error-100` |

### Why No Advanced Logic on Tonal Palette Nodes?

The HCT color space solver IS the gamut boundary. When a child inherits C=36 from Primary but has T=95 locked, the solver returns HCT(270, ~12, 95) — the maximum achievable chroma at that tone. This is EXACTLY what `TonalPalette.fromHueAndChroma(hue, chroma).tone(95)` does in the M3 library.

The "gamut clamping" is not missing — it's built into the color space itself. Every palette tone node automatically displays the gamut-clamped result.

**The 5-unit spacing (T0, T5, T10...T100)** provides fine enough granularity for the ContrastCurve system to find nearby tones when adjusting for contrast.

---

## PAGE 3: Semantic Tokens with Full Advanced Logic

### Setup

- Create `sys` as a **Token Prefix Node** (isTokenPrefix = true)
- Create 45 child token nodes under it
- Each has Light and Dark theme token assignments
- Tokens that need ContrastCurve/ToneDeltaPair get multi-row advanced logic

### How ContrastCurve Works (Reference)

Each semantic color has `ContrastCurve(low, normal, medium, high)` — four minimum contrast ratios. The actual target is interpolated based on the ContrastLevel parameter:

```
level = map(@ContrastLevel.hctT, 0, 100, -1, 1)

Interpolation:
  level <= -1  → target = low
  -1 < level <= 0  → target = lerp(low, normal, level + 1)
  0 < level <= 0.5 → target = lerp(normal, medium, level * 2)
  0.5 < level <= 1 → target = lerp(medium, high, (level - 0.5) * 2)
```

**Compact expression (reused in every token):**
```
Row 1: map(@ContrastLevel.hctT, 0, 100, -1, 1)  → level
Row 2: if level <= 0 then lerp(LOW, NORM, level + 1) else if level <= 0.5 then lerp(NORM, MED, level * 2) else lerp(MED, HIGH, (level - 0.5) * 2)  → target
```

Replace LOW, NORM, MED, HIGH with the specific ContrastCurve values per token.

### How ToneDeltaPair Works (Reference)

Container tokens are paired with their role tokens. The constraint:
- `primaryContainer` and `primary` must be >= 10 tones apart
- Same for secondary, tertiary, error pairs

Implementation: after the container's contrast-adjusted tone selection, check:
```
if abs(myTone - {sys/paired-role}.hctT) < 10 then shift away else keep
```

### Evaluation Order Dependency

Token nodes must evaluate in this order (create them in this sequence):
1. `surface` (background, no dependencies)
2. `primary`, `secondary`, `tertiary`, `error` (depend on surface for contrast)
3. `primary-container`, `secondary-container`, etc. (depend on surface + ToneDeltaPair with roles)
4. `on-primary`, `on-secondary`, etc. (depend on their role for contrast background)
5. `on-primary-container`, etc. (depend on their container for contrast background)
6. All other tokens

---

### COMPLETE CONTRAST CURVE REFERENCE TABLE

| Semantic Token | Curve (low, norm, med, high) | Background | ToneDeltaPair |
|---------------|------------------------------|------------|---------------|
| primary | (3, 4.5, 7, 7) | surface | — |
| on-primary | (4.5, 7, 11, 21) | primary | — |
| primary-container | (1, 1, 3, 4.5) | surface | paired with primary, delta=10 |
| on-primary-container | (4.5, 7, 11, 21) | primary-container | — |
| secondary | (3, 4.5, 7, 7) | surface | — |
| on-secondary | (4.5, 7, 11, 21) | secondary | — |
| secondary-container | (1, 1, 3, 4.5) | surface | paired with secondary, delta=10 |
| on-secondary-container | (4.5, 7, 11, 21) | secondary-container | — |
| tertiary | (3, 4.5, 7, 7) | surface | — |
| on-tertiary | (4.5, 7, 11, 21) | tertiary | — |
| tertiary-container | (1, 1, 3, 4.5) | surface | paired with tertiary, delta=10 |
| on-tertiary-container | (4.5, 7, 11, 21) | tertiary-container | — |
| error | (3, 4.5, 7, 7) | surface | — |
| on-error | (4.5, 7, 11, 21) | error | — |
| error-container | (1, 1, 3, 4.5) | surface | paired with error, delta=10 |
| on-error-container | (4.5, 7, 11, 21) | error-container | — |
| surface | (1, 1, 1, 1) | — (self-referential) | — |
| on-surface | (4.5, 7, 11, 21) | surface | — |
| surface-variant | (1, 1, 3, 4.5) | surface | — |
| on-surface-variant | (3, 4.5, 7, 11) | surface | — |
| outline | (1.5, 3, 4.5, 7) | surface | — |
| outline-variant | (1, 1, 1, 3) | surface | — |
| inverse-surface | (1, 1, 1, 1) | — | — |
| inverse-on-surface | (4.5, 7, 11, 21) | inverse-surface | — |
| inverse-primary | (3, 4.5, 7, 7) | inverse-surface | — |

---

## INDIVIDUAL TOKEN NODE SPECIFICATIONS

### Legend

For each token, I specify:
- **Light Base / Dark Base**: the palette token at standard contrast (level = 0)
- **Candidates**: palette tones tested when contrast increases
- **Direction**: "darker" (lower T in light) or "lighter" (higher T in dark)
- **Full expression**: exact multi-row logic for the token assignment popup

Tokens WITHOUT ContrastCurve adjustment (curve is 1,1,1,1 or no background) just use simple per-theme assignment with no advanced logic.

---

### sys/surface

**No advanced logic needed.** Curve is (1, 1, 1, 1) — always meets any background requirement.

| Theme | Assignment |
|-------|-----------|
| Light | `{neutral-98}` |
| Dark | `{neutral-6}` |

---

### sys/on-surface

Curve: **(4.5, 7, 11, 21)** — Background: **surface**

**LIGHT theme — Token Assignment Logic (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(4.5, 7, level + 1) else if level <= 0.5 then lerp(7, 11, level * 2) else lerp(11, 21, (level - 0.5) * 2)` |
| 3 | `c10` | `contrast({neutral-10}, {neutral-98})` |
| 4 | `c5` | `contrast({neutral-5}, {neutral-98})` |
| 5 | `c0` | `contrast({neutral-0}, {neutral-98})` |
| 6 | `out_1` | `if c10 >= target then {neutral-10} else if c5 >= target then {neutral-5} else {neutral-0}` |

> At standard contrast (level=0): target=7, neutral-10 vs neutral-98 gives ~14:1, so neutral-10 is selected.
> At high contrast (level=1): target=21, only neutral-0 (black) meets 21:1 against neutral-98.

**DARK theme — Token Assignment Logic (6 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(4.5, 7, level + 1) else if level <= 0.5 then lerp(7, 11, level * 2) else lerp(11, 21, (level - 0.5) * 2)` |
| 3 | `c90` | `contrast({neutral-90}, {neutral-6})` |
| 4 | `c95` | `contrast({neutral-95}, {neutral-6})` |
| 5 | `c100` | `contrast({neutral-100}, {neutral-6})` |
| 6 | `out_1` | `if c90 >= target then {neutral-90} else if c95 >= target then {neutral-95} else {neutral-100}` |

---

### sys/primary

Curve: **(3, 4.5, 7, 7)** — Background: **surface**

**LIGHT theme — Token Assignment Logic (8 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(3, 4.5, level + 1) else if level <= 0.5 then lerp(4.5, 7, level * 2) else lerp(7, 7, (level - 0.5) * 2)` |
| 3 | `c40` | `contrast({primary-40}, {neutral-98})` |
| 4 | `c35` | `contrast({primary-35}, {neutral-98})` |
| 5 | `c30` | `contrast({primary-30}, {neutral-98})` |
| 6 | `c25` | `contrast({primary-25}, {neutral-98})` |
| 7 | `c20` | `contrast({primary-20}, {neutral-98})` |
| 8 | `out_1` | `if c40 >= target then {primary-40} else if c35 >= target then {primary-35} else if c30 >= target then {primary-30} else if c25 >= target then {primary-25} else {primary-20}` |

> Standard (level=0): target=4.5, primary-40 vs neutral-98 typically exceeds 4.5:1, so {primary-40} selected.
> High (level=1): target=7, may need primary-30 or darker.

**DARK theme — Token Assignment Logic (8 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(3, 4.5, level + 1) else if level <= 0.5 then lerp(4.5, 7, level * 2) else lerp(7, 7, (level - 0.5) * 2)` |
| 3 | `c80` | `contrast({primary-80}, {neutral-6})` |
| 4 | `c85` | `contrast({primary-85}, {neutral-6})` |
| 5 | `c90` | `contrast({primary-90}, {neutral-6})` |
| 6 | `c95` | `contrast({primary-95}, {neutral-6})` |
| 7 | `out_1` | `if c80 >= target then {primary-80} else if c85 >= target then {primary-85} else if c90 >= target then {primary-90} else {primary-95}` |

---

### sys/on-primary

Curve: **(4.5, 7, 11, 21)** — Background: **primary** (NOT surface)

The background is the `sys/primary` token itself, which was already resolved above.

**LIGHT theme — Token Assignment Logic (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(4.5, 7, level + 1) else if level <= 0.5 then lerp(7, 11, level * 2) else lerp(11, 21, (level - 0.5) * 2)` |
| 3 | `c100` | `contrast({primary-100}, {sys/primary})` |
| 4 | `c95` | `contrast({primary-95}, {sys/primary})` |
| 5 | `out_1` | `if c100 >= target then {primary-100} else {primary-95}` |

> onPrimary is typically white (T100). At standard contrast, T100 on T40 gives ~8:1 which exceeds 7:1.
> At very high contrast, it stays T100 (max possible).

**DARK theme — Token Assignment Logic (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(4.5, 7, level + 1) else if level <= 0.5 then lerp(7, 11, level * 2) else lerp(11, 21, (level - 0.5) * 2)` |
| 3 | `c20` | `contrast({primary-20}, {sys/primary})` |
| 4 | `c15` | `contrast({primary-15}, {sys/primary})` |
| 5 | `c10` | `contrast({primary-10}, {sys/primary})` |
| 6 | `c0` | `contrast({primary-0}, {sys/primary})` |
| 7 | `out_1` | `if c20 >= target then {primary-20} else if c15 >= target then {primary-15} else if c10 >= target then {primary-10} else {primary-0}` |

---

### sys/primary-container — with ToneDeltaPair

Curve: **(1, 1, 3, 4.5)** — Background: **surface** — ToneDeltaPair: **primary, delta=10**

This is the most complex token. It has BOTH ContrastCurve AND ToneDeltaPair.

**LIGHT theme — Token Assignment Logic (12 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(1, 1, level + 1) else if level <= 0.5 then lerp(1, 3, level * 2) else lerp(3, 4.5, (level - 0.5) * 2)` |
| 3 | `c90` | `contrast({primary-90}, {neutral-98})` |
| 4 | `c85` | `contrast({primary-85}, {neutral-98})` |
| 5 | `c80` | `contrast({primary-80}, {neutral-98})` |
| 6 | `c75` | `contrast({primary-75}, {neutral-98})` |
| 7 | `c70` | `contrast({primary-70}, {neutral-98})` |
| 8 | `myTone` | `if c90 >= target then 90 else if c85 >= target then 85 else if c80 >= target then 80 else if c75 >= target then 75 else 70` |
| 9 | `pTone` | `{sys/primary}.hctT` |
| 10 | `delta` | `abs(myTone - pTone)` |
| 11 | `adjTone` | `if delta < 10 then myTone + 10 else myTone` |
| 12 | `out_1` | `if adjTone >= 88 then {primary-90} else if adjTone >= 83 then {primary-85} else if adjTone >= 78 then {primary-80} else if adjTone >= 73 then {primary-75} else {primary-70}` |

> **ToneDeltaPair logic explained (rows 9-11):**
> - Row 9 reads the resolved HCT Tone of sys/primary (e.g., T40 at standard, T30 at high contrast)
> - Row 10 computes the gap between container tone and primary tone
> - Row 11: if they're closer than 10, push container AWAY (lighter in light scheme, always moving toward the lighter end since container > primary in light mode)
>
> At standard contrast: myTone=90, pTone~=40, delta=50 → no adjustment needed
> At high contrast: myTone might be 75, pTone might be 30, delta=45 → still fine
> Edge case: if both shift to ~45 and ~50, delta=5 → adjust to 55+

**DARK theme — Token Assignment Logic (12 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(1, 1, level + 1) else if level <= 0.5 then lerp(1, 3, level * 2) else lerp(3, 4.5, (level - 0.5) * 2)` |
| 3 | `c30` | `contrast({primary-30}, {neutral-6})` |
| 4 | `c25` | `contrast({primary-25}, {neutral-6})` |
| 5 | `c20` | `contrast({primary-20}, {neutral-6})` |
| 6 | `c15` | `contrast({primary-15}, {neutral-6})` |
| 7 | `myTone` | `if c30 >= target then 30 else if c25 >= target then 25 else if c20 >= target then 20 else 15` |
| 8 | `pTone` | `{sys/primary}.hctT` |
| 9 | `delta` | `abs(myTone - pTone)` |
| 10 | `adjTone` | `if delta < 10 then myTone - 10 else myTone` |
| 11 | `out_1` | `if adjTone >= 28 then {primary-30} else if adjTone >= 23 then {primary-25} else if adjTone >= 18 then {primary-20} else {primary-15}` |

---

### sys/on-primary-container

Curve: **(4.5, 7, 11, 21)** — Background: **primary-container**

**LIGHT theme (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(4.5, 7, level + 1) else if level <= 0.5 then lerp(7, 11, level * 2) else lerp(11, 21, (level - 0.5) * 2)` |
| 3 | `c10` | `contrast({primary-10}, {sys/primary-container})` |
| 4 | `c5` | `contrast({primary-5}, {sys/primary-container})` |
| 5 | `c0` | `contrast({primary-0}, {sys/primary-container})` |
| 6 | `out_1` | `if c10 >= target then {primary-10} else if c5 >= target then {primary-5} else {primary-0}` |

**DARK theme (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(4.5, 7, level + 1) else if level <= 0.5 then lerp(7, 11, level * 2) else lerp(11, 21, (level - 0.5) * 2)` |
| 3 | `c90` | `contrast({primary-90}, {sys/primary-container})` |
| 4 | `c95` | `contrast({primary-95}, {sys/primary-container})` |
| 5 | `c100` | `contrast({primary-100}, {sys/primary-container})` |
| 6 | `out_1` | `if c90 >= target then {primary-90} else if c95 >= target then {primary-95} else {primary-100}` |

---

### SECONDARY FAMILY — Same Pattern as Primary

The expressions are identical in structure, just swap the palette prefix:

### sys/secondary

Same as sys/primary but with `{secondary-N}` tokens.
Curve: **(3, 4.5, 7, 7)** — Background: surface

Light candidates: `{secondary-40}` → `{secondary-35}` → `{secondary-30}` → `{secondary-25}` → `{secondary-20}`
Dark candidates: `{secondary-80}` → `{secondary-85}` → `{secondary-90}` → `{secondary-95}`

### sys/on-secondary

Same as sys/on-primary but with `{secondary-N}` tokens.
Curve: **(4.5, 7, 11, 21)** — Background: sys/secondary

### sys/secondary-container — with ToneDeltaPair

Same as sys/primary-container but with `{secondary-N}` tokens.
Curve: **(1, 1, 3, 4.5)** — ToneDeltaPair: secondary, delta=10

ToneDeltaPair row reads: `{sys/secondary}.hctT` instead of `{sys/primary}.hctT`

### sys/on-secondary-container

Same as sys/on-primary-container but with `{secondary-N}` tokens.
Curve: **(4.5, 7, 11, 21)** — Background: sys/secondary-container

---

### TERTIARY FAMILY — Same Pattern

### sys/tertiary
Curve: **(3, 4.5, 7, 7)** — Background: surface
Uses `{tertiary-N}` tokens.

### sys/on-tertiary
Curve: **(4.5, 7, 11, 21)** — Background: sys/tertiary

### sys/tertiary-container — with ToneDeltaPair
Curve: **(1, 1, 3, 4.5)** — ToneDeltaPair: tertiary, delta=10
Reads `{sys/tertiary}.hctT`

### sys/on-tertiary-container
Curve: **(4.5, 7, 11, 21)** — Background: sys/tertiary-container

---

### ERROR FAMILY — Same Pattern

### sys/error
Curve: **(3, 4.5, 7, 7)** — Background: surface
Uses `{error-N}` tokens.

### sys/on-error
Curve: **(4.5, 7, 11, 21)** — Background: sys/error

### sys/error-container — with ToneDeltaPair
Curve: **(1, 1, 3, 4.5)** — ToneDeltaPair: error, delta=10
Reads `{sys/error}.hctT`

### sys/on-error-container
Curve: **(4.5, 7, 11, 21)** — Background: sys/error-container

---

### SURFACE FAMILY

### sys/surface
No advanced logic. Curve: (1, 1, 1, 1)

| Theme | Assignment |
|-------|-----------|
| Light | `{neutral-98}` |
| Dark | `{neutral-6}` |

### sys/surface-dim
No advanced logic. Curve: (1, 1, 1, 1)

| Theme | Assignment |
|-------|-----------|
| Light | `{neutral-87}` |
| Dark | `{neutral-6}` |

### sys/surface-bright
No advanced logic. Curve: (1, 1, 1, 1)

| Theme | Assignment |
|-------|-----------|
| Light | `{neutral-98}` |
| Dark | `{neutral-24}` |

### sys/surface-container-lowest

| Theme | Assignment |
|-------|-----------|
| Light | `{neutral-100}` |
| Dark | `{neutral-4}` |

### sys/surface-container-low

| Theme | Assignment |
|-------|-----------|
| Light | `{neutral-96}` |
| Dark | `{neutral-10}` |

### sys/surface-container

| Theme | Assignment |
|-------|-----------|
| Light | `{neutral-94}` |
| Dark | `{neutral-12}` |

### sys/surface-container-high

| Theme | Assignment |
|-------|-----------|
| Light | `{neutral-92}` |
| Dark | `{neutral-17}` |

### sys/surface-container-highest

| Theme | Assignment |
|-------|-----------|
| Light | `{neutral-90}` |
| Dark | `{neutral-22}` |

---

### sys/on-surface

Curve: **(4.5, 7, 11, 21)** — Background: surface
(Full expression shown above in the detailed section)

---

### sys/surface-variant

No advanced logic needed at standard contrast. For full contrast support:

Curve: **(1, 1, 3, 4.5)** — Background: surface

**LIGHT (6 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(1, 1, level + 1) else if level <= 0.5 then lerp(1, 3, level * 2) else lerp(3, 4.5, (level - 0.5) * 2)` |
| 3 | `c90` | `contrast({neutral-variant-90}, {neutral-98})` |
| 4 | `c85` | `contrast({neutral-variant-85}, {neutral-98})` |
| 5 | `c80` | `contrast({neutral-variant-80}, {neutral-98})` |
| 6 | `out_1` | `if c90 >= target then {neutral-variant-90} else if c85 >= target then {neutral-variant-85} else {neutral-variant-80}` |

**DARK (6 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(1, 1, level + 1) else if level <= 0.5 then lerp(1, 3, level * 2) else lerp(3, 4.5, (level - 0.5) * 2)` |
| 3 | `c30` | `contrast({neutral-variant-30}, {neutral-6})` |
| 4 | `c25` | `contrast({neutral-variant-25}, {neutral-6})` |
| 5 | `c20` | `contrast({neutral-variant-20}, {neutral-6})` |
| 6 | `out_1` | `if c30 >= target then {neutral-variant-30} else if c25 >= target then {neutral-variant-25} else {neutral-variant-20}` |

---

### sys/on-surface-variant

Curve: **(3, 4.5, 7, 11)** — Background: surface

**LIGHT (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(3, 4.5, level + 1) else if level <= 0.5 then lerp(4.5, 7, level * 2) else lerp(7, 11, (level - 0.5) * 2)` |
| 3 | `c30` | `contrast({neutral-variant-30}, {neutral-98})` |
| 4 | `c25` | `contrast({neutral-variant-25}, {neutral-98})` |
| 5 | `c20` | `contrast({neutral-variant-20}, {neutral-98})` |
| 6 | `out_1` | `if c30 >= target then {neutral-variant-30} else if c25 >= target then {neutral-variant-25} else {neutral-variant-20}` |

**DARK (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(3, 4.5, level + 1) else if level <= 0.5 then lerp(4.5, 7, level * 2) else lerp(7, 11, (level - 0.5) * 2)` |
| 3 | `c80` | `contrast({neutral-variant-80}, {neutral-6})` |
| 4 | `c85` | `contrast({neutral-variant-85}, {neutral-6})` |
| 5 | `c90` | `contrast({neutral-variant-90}, {neutral-6})` |
| 6 | `out_1` | `if c80 >= target then {neutral-variant-80} else if c85 >= target then {neutral-variant-85} else {neutral-variant-90}` |

---

### sys/outline

Curve: **(1.5, 3, 4.5, 7)** — Background: surface

**LIGHT (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(1.5, 3, level + 1) else if level <= 0.5 then lerp(3, 4.5, level * 2) else lerp(4.5, 7, (level - 0.5) * 2)` |
| 3 | `c50` | `contrast({neutral-variant-50}, {neutral-98})` |
| 4 | `c45` | `contrast({neutral-variant-45}, {neutral-98})` |
| 5 | `c40` | `contrast({neutral-variant-40}, {neutral-98})` |
| 6 | `c35` | `contrast({neutral-variant-35}, {neutral-98})` |
| 7 | `out_1` | `if c50 >= target then {neutral-variant-50} else if c45 >= target then {neutral-variant-45} else if c40 >= target then {neutral-variant-40} else {neutral-variant-35}` |

**DARK (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(1.5, 3, level + 1) else if level <= 0.5 then lerp(3, 4.5, level * 2) else lerp(4.5, 7, (level - 0.5) * 2)` |
| 3 | `c60` | `contrast({neutral-variant-60}, {neutral-6})` |
| 4 | `c65` | `contrast({neutral-variant-65}, {neutral-6})` |
| 5 | `c70` | `contrast({neutral-variant-70}, {neutral-6})` |
| 6 | `out_1` | `if c60 >= target then {neutral-variant-60} else if c65 >= target then {neutral-variant-65} else {neutral-variant-70}` |

---

### sys/outline-variant

Curve: **(1, 1, 1, 3)** — Background: surface

**LIGHT:** At standard contrast, curve is 1 (always met). Only at HIGH contrast does it need 3:1.

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then 1 else if level <= 0.5 then 1 else lerp(1, 3, (level - 0.5) * 2)` |
| 3 | `c80` | `contrast({neutral-variant-80}, {neutral-98})` |
| 4 | `c75` | `contrast({neutral-variant-75}, {neutral-98})` |
| 5 | `c70` | `contrast({neutral-variant-70}, {neutral-98})` |
| 6 | `out_1` | `if c80 >= target then {neutral-variant-80} else if c75 >= target then {neutral-variant-75} else {neutral-variant-70}` |

**DARK:**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then 1 else if level <= 0.5 then 1 else lerp(1, 3, (level - 0.5) * 2)` |
| 3 | `c30` | `contrast({neutral-variant-30}, {neutral-6})` |
| 4 | `c35` | `contrast({neutral-variant-35}, {neutral-6})` |
| 5 | `c40` | `contrast({neutral-variant-40}, {neutral-6})` |
| 6 | `out_1` | `if c30 >= target then {neutral-variant-30} else if c35 >= target then {neutral-variant-35} else {neutral-variant-40}` |

---

### INVERSE COLORS

### sys/inverse-surface
No advanced logic. Curve: (1, 1, 1, 1)

| Theme | Assignment |
|-------|-----------|
| Light | `{neutral-20}` |
| Dark | `{neutral-90}` |

### sys/inverse-on-surface

Curve: **(4.5, 7, 11, 21)** — Background: **inverse-surface**

**LIGHT (6 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(4.5, 7, level + 1) else if level <= 0.5 then lerp(7, 11, level * 2) else lerp(11, 21, (level - 0.5) * 2)` |
| 3 | `c95` | `contrast({neutral-95}, {sys/inverse-surface})` |
| 4 | `c100` | `contrast({neutral-100}, {sys/inverse-surface})` |
| 5 | `out_1` | `if c95 >= target then {neutral-95} else {neutral-100}` |

**DARK (6 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(4.5, 7, level + 1) else if level <= 0.5 then lerp(7, 11, level * 2) else lerp(11, 21, (level - 0.5) * 2)` |
| 3 | `c20` | `contrast({neutral-20}, {sys/inverse-surface})` |
| 4 | `c15` | `contrast({neutral-15}, {sys/inverse-surface})` |
| 5 | `c10` | `contrast({neutral-10}, {sys/inverse-surface})` |
| 6 | `out_1` | `if c20 >= target then {neutral-20} else if c15 >= target then {neutral-15} else {neutral-10}` |

### sys/inverse-primary

Curve: **(3, 4.5, 7, 7)** — Background: **inverse-surface**

**LIGHT (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(3, 4.5, level + 1) else if level <= 0.5 then lerp(4.5, 7, level * 2) else lerp(7, 7, (level - 0.5) * 2)` |
| 3 | `c80` | `contrast({primary-80}, {sys/inverse-surface})` |
| 4 | `c85` | `contrast({primary-85}, {sys/inverse-surface})` |
| 5 | `c90` | `contrast({primary-90}, {sys/inverse-surface})` |
| 6 | `out_1` | `if c80 >= target then {primary-80} else if c85 >= target then {primary-85} else {primary-90}` |

**DARK (7 rows):**

| Row | Output Var | Expression |
|-----|-----------|------------|
| 1 | `level` | `map(@ContrastLevel.hctT, 0, 100, -1, 1)` |
| 2 | `target` | `if level <= 0 then lerp(3, 4.5, level + 1) else if level <= 0.5 then lerp(4.5, 7, level * 2) else lerp(7, 7, (level - 0.5) * 2)` |
| 3 | `c40` | `contrast({primary-40}, {sys/inverse-surface})` |
| 4 | `c35` | `contrast({primary-35}, {sys/inverse-surface})` |
| 5 | `c30` | `contrast({primary-30}, {sys/inverse-surface})` |
| 6 | `out_1` | `if c40 >= target then {primary-40} else if c35 >= target then {primary-35} else {primary-30}` |

---

### UTILITY COLORS

### sys/shadow
No advanced logic. Same in all themes.
| Theme | Assignment |
|-------|-----------|
| Both | `{neutral-0}` |

### sys/scrim
No advanced logic. Same in all themes.
| Theme | Assignment |
|-------|-----------|
| Both | `{neutral-0}` |

---

### FIXED ACCENT COLORS (Same in Both Themes, No Contrast Adjustment)

These tokens do NOT change between Light and Dark. They have NO ContrastCurve.
Assign the same palette token for both themes.

| Token | Assignment (both themes) |
|-------|-------------------------|
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

---

## ADVANCED LOGIC SYSTEM SUMMARY

### 1. Scheme Variant Support

**What:** 6 different algorithms for deriving key color H/C from the seed.
**Where:** Advanced logic on hctH + hctC channels of Primary, Secondary, Tertiary, Neutral, NeutralVariant nodes (Page 1).
**How:** `Variant` parameter node's T value selects the algorithm via conditional branching.
**Affects:** Only the 5 key color nodes. Everything downstream (palettes, tokens) is automatic.

### 2. DislikeAnalyzer

**What:** Corrects visually unpleasant yellow-green colors.
**Where:** Advanced logic on hctT channel of the Tertiary node ONLY.
**How:** `if @Self.hctH >= 90 AND @Self.hctH <= 111 AND @Self.hctC > 16 AND baseT < 65 then 70 else baseT`
**When it activates:** Only when Content/Fidelity variant sends the tertiary hue into H 90-111.
**Effect:** Shifts tone from <65 to 70 (lighter = more pleasant appearance).

### 3. ContrastCurve

**What:** Dynamic tone adjustment based on a contrast level slider.
**Where:** Token assignment logic on EVERY semantic token in Page 3.
**How:** `ContrastLevel` parameter node's T value (0-100 maps to -1 to +1) determines the minimum contrast ratio target. Token logic tests multiple palette tone candidates against the background token using `contrast({candidate}, {background})` and picks the lightest/darkest tone that meets the target.
**Interpolation formula:**
```
level = map(T, 0, 100, -1, 1)
target = piecewise lerp through [low, normal, medium, high] at breakpoints [-1, 0, 0.5, 1]
```

### 4. ToneDeltaPair

**What:** Ensures paired tokens (role + container) stay >= 10 tone units apart.
**Where:** Token assignment logic on container tokens ONLY (primary-container, secondary-container, tertiary-container, error-container).
**How:** After computing the contrast-adjusted tone, reads `{sys/paired-role}.hctT` and checks if the gap is < 10. If so, pushes the container away.
**When it activates:** Only at high contrast where both tones shift toward the middle.
**Pairs:** primary-container/primary, secondary-container/secondary, tertiary-container/tertiary, error-container/error. All with delta=10.

---

## COMPLETE NODE COUNT

| Section | Nodes | Tokens |
|---------|-------|--------|
| Page 1: Source & Controls | 9 (Seed, Primary, Secondary, Tertiary, Neutral, NeutralVariant, Error, Variant, ContrastLevel) | 0 |
| Page 2: Accent Palettes | 84 (21 × 4 palettes) | 84 |
| Page 2: Neutral Palette | 33 (21 standard + 12 surface) | 33 |
| Page 2: NeutralVariant Palette | 21 | 21 |
| Page 3: Semantic Tokens | 46 (1 prefix + 45 children) | 45 |
| **Total** | **193** | **183** |

---

## BUILD ORDER

### Session 1: Infrastructure
1. Create project with Light + Dark themes
2. Page 1: Create all 9 nodes with locks/diffs
3. Add ALL advanced logic to Primary, Secondary, Tertiary, Neutral, NeutralVariant
4. Verify: change Variant T → key colors update correctly
5. Verify: change Seed H/C → all key colors respond per variant

### Session 2: Palettes
6. Page 2: Create 6 palette parent nodes (cross-page linked to Page 1 key colors)
7. Create 21 tone children per accent palette (T0-T100 every 5)
8. Create 33 tone children for Neutral (21 standard + 12 surface)
9. Create 21 tone children for NeutralVariant
10. Auto-assign tokens with correct naming prefixes
11. Verify: change Seed → all 183 palette tones update

### Session 3: Semantic Tokens
12. Page 3: Create `sys` prefix + 45 children IN DEPENDENCY ORDER
13. Start with surface tokens (no deps) → simple assignment
14. Add role tokens (primary, secondary, etc.) with ContrastCurve logic
15. Add container tokens with ContrastCurve + ToneDeltaPair logic
16. Add on-role and on-container tokens with ContrastCurve logic
17. Add inverse, outline, fixed, utility tokens
18. Verify: ContrastLevel T=50 → matches standard M3 output
19. Verify: ContrastLevel T=0 → reduced contrast
20. Verify: ContrastLevel T=100 → high contrast

### Session 4: Integration Testing
21. Test all 6 variants with ContrastLevel at 0, 50, 100
22. Test DislikeAnalyzer: set Seed H=30, Variant=Content → tertiary should land near H 90 → tone shifts to 70
23. Test ToneDeltaPair: set ContrastLevel T=100 → verify containers stay 10+ tones from their roles
24. Test edge cases: Seed C=0 (achromatic), Seed C=120 (maximum)
25. Verify theme switching: Light ↔ Dark → all 45 semantic tokens flip correctly
26. Export/Code View: verify CSS custom properties

---

## VALIDATION MATRIX

| Test | Expected |
|------|----------|
| Variant=TonalSpot, ContrastLevel=50 | Matches Google's Material Theme Builder exactly |
| Variant=Monochrome | All colors are grayscale |
| Variant=Expressive | Primary hue rotated +240, neutrals have visible color |
| ContrastLevel=0 (T=0) | Reduced contrast, lighter foregrounds, subtler containers |
| ContrastLevel=100 (T=100) | Maximum contrast, near-black text, near-white containers |
| Seed H=100, Variant=Content | Tertiary lands in H 90-111 zone → DislikeAnalyzer activates → T shifts to 70 |
| ContrastLevel=100, any variant | ToneDeltaPair keeps containers 10+ tones from roles |
| Any seed, standard contrast | Fixed tokens same in Light and Dark |
| Shadow/Scrim | Always neutral-0 regardless of anything |
