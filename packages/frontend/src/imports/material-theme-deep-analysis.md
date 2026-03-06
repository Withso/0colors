# Deep Analysis: How Material Theme Builder ACTUALLY Works

## What Your Current Guide Gets Right vs Wrong

Your guide (material-theme-guide.md) is a solid starting point, but it simplifies several critical areas. Here's what needs correcting:

### CORRECT in current guide:
- HCT color space is the foundation
- Parent-child node hierarchy for key colors
- Per-theme token assignment for Light/Dark semantic tokens
- The general 4-page architecture

### WRONG or INCOMPLETE in current guide:

| Area | Current Guide Says | Reality |
|------|-------------------|---------|
| Primary chroma | `max(seedC, 48)` | Depends on **scheme variant**. TonalSpot uses 36, Content uses full seedC, Vibrant uses max(seedC, 48) |
| Neutral chroma | `seedC/12, max 4` | TonalSpot uses fixed 6, Content uses `seedC/8`, Fidelity uses `seedC/8` |
| Neutral Variant chroma | `seedC/6, max 8` | TonalSpot uses fixed 8, Content uses `seedC/8 + 4` |
| Tonal palette chroma | Constant across all tones | **Chroma is gamut-clamped per tone** - at T0, T5, T95, T100 the actual chroma is much lower than requested |
| Semantic tone values | Fixed (e.g., primary = T40 light, T80 dark) | Base values are T40/T80, but the **DynamicColor** system adjusts tones for contrast requirements |
| Tone assignments | Simple lookup table | Governed by `ContrastCurve` + `ToneDeltaPair` constraints |
| Tertiary hue | seed + 60 | Only in TonalSpot/Vibrant. In Content/Fidelity, it uses **temperature-based analogous color selection** |

---

## Part 1: Scheme Variants (The Foundation You're Missing)

The Material Theme Builder isn't one algorithm - it's **6 different algorithms** selected via a dropdown. Each is a "scheme variant" with different rules for deriving key colors from the seed.

### Variant: Tonal Spot (DEFAULT - most commonly used)

This is what the Material Theme Builder uses by default and what most apps ship with.

```
Seed = user's chosen HCT color

Primary palette:         H = seed.H,          C = 36 (FIXED, not max(seedC, 48))
Secondary palette:       H = seed.H,          C = 16
Tertiary palette:        H = seed.H + 60,     C = 24
Neutral palette:         H = seed.H,          C = 6
Neutral Variant palette: H = seed.H,          C = 8
Error palette:           H = 25,              C = 84
```

Key insight: **Chroma values are mostly FIXED constants**, not derived from seed chroma. The seed's chroma is essentially ignored for palette generation in TonalSpot.

### Variant: Content (preserves source color character)

```
Primary palette:         H = seed.H,          C = seed.C (FULL source chroma)
Secondary palette:       H = seed.H,          C = max(seed.C - 32, seed.C * 0.5)
Tertiary palette:        H = DislikeFixed(analogous[2]).H,  C = max(seed.C - 32, seed.C * 0.5)
Neutral palette:         H = seed.H,          C = seed.C / 8
Neutral Variant palette: H = seed.H,          C = seed.C / 8 + 4
Error palette:           H = 25,              C = 84
```

Key insight: Chroma IS derived from seed. Secondary/Tertiary get "desaturated source" chroma. Tertiary hue comes from **temperature-based analogous color selection** (not a simple +60 offset).

### Variant: Vibrant (high saturation)

```
Primary palette:         H = seed.H,          C = 200 (extremely high - gets gamut clamped)
Secondary palette:       H = seed.H,          C = 24 + (seed.C - 24) * 0.33
Tertiary palette:        H = seed.H + 60,     C = 32 + (seed.C - 32) * 0.33
Neutral palette:         H = seed.H,          C = 10
Neutral Variant palette: H = seed.H,          C = 12
```

### Variant: Expressive (colorful neutrals)

```
Primary palette:         H = seed.H + 240,    C = 40
Secondary palette:       H = seed.H + 15,     C = 24
Tertiary palette:        H = seed.H + 135,    C = 32
Neutral palette:         H = seed.H + 15,     C = 8
Neutral Variant palette: H = seed.H + 15,     C = 12
```

Note: Expressive ROTATES the primary hue by 240 degrees!

### Variant: Fidelity (closest to source)

```
Primary palette:         H = seed.H,          C = seed.C (exact source)
Secondary palette:       H = seed.H,          C = max(seed.C - 32, seed.C * 0.5)
Tertiary palette:        H = DislikeFixed(analogous(3, 6)[2]).H,  C = max(seed.C - 32, seed.C * 0.5)
Neutral palette:         H = seed.H,          C = seed.C / 8
Neutral Variant palette: H = seed.H,          C = seed.C / 8 + 4
```

### Variant: Monochrome

```
Primary palette:         H = seed.H,          C = 0
Secondary palette:       H = seed.H,          C = 0
Tertiary palette:        H = seed.H,          C = 0
Neutral palette:         H = seed.H,          C = 0
Neutral Variant palette: H = seed.H,          C = 0
```

All chroma = 0. Pure grayscale.

---

## Part 2: The Gamut Boundary (Why Chroma Isn't Constant Across Tones)

This is the #1 thing your current guide misses entirely.

### The Problem

When you create `TonalPalette.fromHueAndChroma(270, 36)`, you're saying "I want hue 270 with chroma 36 at every tone level." But **sRGB can't display chroma 36 at every tone**.

At extreme tones:
- **Tone 0** (pure black): max achievable chroma ~ 0
- **Tone 5**: max achievable chroma ~ 5-15 (depends on hue)
- **Tone 50**: max achievable chroma ~ 50-130 (depends on hue, this is the peak)
- **Tone 95**: max achievable chroma ~ 10-25 (depends on hue)
- **Tone 100** (pure white): max achievable chroma ~ 0

### What Actually Happens

The HCT solver does this for each tone in the palette:
```
requested: HCT(270, 36, tone)
actual:    HCT(270, min(36, maxChromaAt(270, tone)), tone)
```

So `primary-0` might actually be HCT(270, 0, 0) - pure black.
And `primary-100` is HCT(270, 0, 100) - pure white.
And `primary-95` might be HCT(270, 12.3, 95) - much less saturated than requested.

### The Gamut Boundary Varies by Hue

Different hues have VERY different gamut shapes:

| Hue | Peak chroma | Tone at peak | Notes |
|-----|------------|--------------|-------|
| ~0 (Red) | ~105 | ~55 | Medium gamut |
| ~60 (Orange) | ~120 | ~70 | Shifts lighter at peak |
| ~90 (Yellow) | ~110 | ~85 | Peak chroma is at very HIGH tone |
| ~145 (Green) | ~80 | ~55 | Relatively narrow gamut |
| ~210 (Cyan) | ~50 | ~60 | Very narrow gamut |
| ~270 (Blue/Purple) | ~130 | ~30 | Peak chroma is at very LOW tone |
| ~330 (Magenta) | ~105 | ~50 | Medium gamut |

### How This Affects 0colors Implementation

In your 0colors nodes, when you set a child node to `H=inherit, C=locked(36), T=locked(95)`:
- The HCT solver in 0colors should ALREADY handle gamut clamping automatically
- The node will display the actual achievable color, not the "requested" one
- This means the DISPLAYED chroma at T95 will be less than 36, even though you "locked" it at 36

**This is correct behavior** - you don't need advanced logic for gamut clamping. The HCT color space handles it internally.

However, if you want to SHOW the user that the actual chroma differs from requested (like Material Theme Builder does), you'd need to read back the actual chroma after HCT solving.

---

## Part 3: The DynamicColor System (Why Tones Aren't Always Fixed)

This is the most complex layer and the reason the Material Theme Builder can adjust tones dynamically.

### What DynamicColor Does

Each semantic color (like `sys/primary`) isn't just "pick tone 40 from primary palette." It's defined as:

```
DynamicColor {
  palette:         Which TonalPalette to use (primary, secondary, etc.)
  tone:            Base tone value (can be a function)
  background:      What color this sits on top of (for contrast calc)
  contrastCurve:   Min contrast ratios at 4 contrast levels
  toneDeltaPair:   Paired color that must maintain minimum tone distance
}
```

### Standard Tone Values (Contrast Level = 0, "Standard")

At the default contrast level, the tone values ARE the fixed ones you already have:

| Semantic Color | Light Tone | Dark Tone | Palette |
|---------------|-----------|----------|---------|
| primary | 40 | 80 | primary |
| onPrimary | 100 | 20 | primary |
| primaryContainer | 90 | 30 | primary |
| onPrimaryContainer | 10 | 90 | primary |
| surface | 98 | 6 | neutral |
| onSurface | 10 | 90 | neutral |
| surfaceVariant | 90 | 30 | neutralVariant |
| onSurfaceVariant | 30 | 80 | neutralVariant |
| outline | 50 | 60 | neutralVariant |
| outlineVariant | 80 | 30 | neutralVariant |

**For the basic implementation, these fixed values are CORRECT.** The DynamicColor system only changes tones when:

1. **Contrast level is adjusted** (the user drags a contrast slider)
2. **Gamut constraints force adjustments** (rare, only with very high/low chroma seeds)

### ContrastCurve: How Tones Shift with Contrast

Each semantic color has a `ContrastCurve(low, normal, medium, high)` defining minimum contrast ratios:

```
primary:              ContrastCurve(3.0,  4.5, 7.0, 7.0)
onPrimary:            ContrastCurve(4.5,  7.0, 11.0, 21.0)
primaryContainer:     ContrastCurve(1.0,  1.0, 3.0, 4.5)
onPrimaryContainer:   ContrastCurve(4.5,  7.0, 11.0, 21.0)
surface:              ContrastCurve(1.0,  1.0, 1.0, 1.0)
onSurface:            ContrastCurve(4.5,  7.0, 11.0, 21.0)
```

When contrast level increases from 0 (standard) to 1.0 (high):
- `primary` must maintain 7:1 contrast against the highest surface
- `onPrimary` must maintain 21:1 contrast against primary
- This means `primary` might shift from T40 to T33, and `onPrimary` from T100 to T100 (already max)

**For your 0colors implementation:** You can SKIP contrast curves initially. They only matter if you want to add a contrast slider. The fixed tone values work perfectly at standard contrast.

### ToneDeltaPair: Paired Colors Must Stay Apart

Some color pairs have a constraint: their tones must differ by at least N units.

```
ToneDeltaPair(primaryContainer, primary, delta=10, polarity='nearer', stayTogether=false)
ToneDeltaPair(secondaryContainer, secondary, delta=10, polarity='nearer', stayTogether=false)
ToneDeltaPair(tertiaryContainer, tertiary, delta=10, polarity='nearer', stayTogether=false)
ToneDeltaPair(errorContainer, error, delta=10, polarity='nearer', stayTogether=false)
```

Meaning: `primary` (T40) and `primaryContainer` (T90) must be at least 10 tone units apart. At standard contrast, they're 50 apart, so no adjustment needed. But at high contrast, if both tones shift toward each other, the system pushes them apart.

**For your 0colors implementation:** Again, skip this for now. Only matters with contrast adjustment.

---

## Part 4: Fidelity Tone Adjustment (SchemeContent/SchemeFidelity only)

This is where the "primary can be T40 or T60 or anything" behavior comes from.

### The Algorithm: performAlbers

In `SchemeContent` and `SchemeFidelity`, the `primaryContainer` tone is NOT a fixed value. Instead, it uses the **Albers algorithm** to find the tone where the source color's chroma is best preserved:

```
function performAlbers(sourceHct, scheme):
  1. Start with the initial tone (90 for light, 30 for dark)
  2. Binary search: find the tone where HCT(source.H, source.C, tone) produces
     the closest match to the requested chroma
  3. Return that tone
```

This means if your seed has very high chroma (say C=80), the container tone will shift to where C=80 is actually achievable in sRGB - which might be T55 instead of T90.

### How This Cascades

When `primaryContainer` shifts from T90 to T55:
- `onPrimaryContainer` must maintain contrast against T55 (not T90)
- So `onPrimaryContainer` shifts too (maybe from T10 to T95)
- The `ToneDeltaPair(primaryContainer, primary, 10)` constraint kicks in
- `primary` might shift from T40 to T45 to stay 10 tones away

**This cascading adjustment is why "primary can be T40 or T60 or anything."**

### In 0colors Advanced Logic

To implement this in 0colors, you would need advanced logic on the `primaryContainer` node:

```
hctT channel logic:
  Row 1: set tone = if isDark then 30 else 90    (base tone)
  Row 2: set bestTone = findAlbersTone(@Seed.hctH, @Seed.hctC, tone)
  Row 3: output bestTone
```

But `findAlbersTone` requires iterative binary search, which may not be expressible in 0colors' expression language. **This is an advanced feature you'd need to evaluate whether your expression engine supports.**

For the basic implementation: **just use fixed tones (T90 light, T30 dark).** This matches the default TonalSpot scheme behavior.

---

## Part 5: DislikeAnalyzer (Color Preference Correction)

M3 detects colors that most people find unappealing and shifts them.

### The Rule

```
isDisliked(hct):
  return hct.hue >= 90.0 && hct.hue <= 111.0
         && hct.chroma > 16.0
         && hct.tone < 65.0

fixIfDisliked(hct):
  if isDisliked(hct):
    return HCT(hct.hue, hct.chroma, 70)    // shift tone to 70
  return hct
```

Colors in the yellow-green range (H 90-111) with moderate+ chroma and dark-ish tone get their tone bumped to 70 to appear more pleasant.

### Where It Applies

- **Tertiary key color** in `SchemeContent` and `SchemeFidelity` passes through `fixIfDisliked()`
- The **analogous color** selection for tertiary also uses it
- It does NOT apply in `SchemeTonalSpot` (tertiary is just seed+60, no fix)

### In 0colors Advanced Logic

On the Tertiary node:
```
hctT channel:
  if @Self.hctH >= 90 AND @Self.hctH <= 111 AND @Self.hctC > 16 AND @Self.hctT < 65 then 70 else @Self.hctT
```

---

## Part 6: Temperature-Based Analogous Colors (Content/Fidelity Tertiary)

In `SchemeContent` and `SchemeFidelity`, the tertiary hue isn't seed+60. It's derived from **color temperature analysis**.

### The Algorithm

1. Calculate the "temperature" of the seed color (how warm or cool it appears)
2. Generate a set of analogous colors around the same temperature region
3. Pick the 3rd analogous color (index 2) as the tertiary
4. Run it through `DislikeAnalyzer.fixIfDisliked()`

The temperature calculation involves:
- Mapping HCT hue to a warmth value
- Finding hues that are "complementary" in temperature space
- The complement is the hue 180 degrees away in temperature space (NOT 180 in hue)

### Simplified Analogous Selection

The `analogous(count=3, divisions=6)` function:
1. Creates 6 evenly-spaced temperature divisions around the hue circle
2. Centers on the seed's temperature position
3. Returns `count` hues centered on the seed

For most seeds, the 3rd analogous hue is roughly **seed + 50-70 degrees** (similar to the simple +60, but temperature-adjusted).

### In 0colors Advanced Logic

This is extremely complex to replicate in expressions. **Recommendation: use the simple seed+60 approximation for TonalSpot, which is exact. Only implement temperature-based selection if you specifically need Content/Fidelity variants.**

---

## Part 7: Complete Execution Plan (Updated)

### Phase 1: Basic TonalSpot (matches 95% of Material Theme Builder usage)

This is what you should build FIRST. It perfectly replicates the default scheme.

#### Page 1: Source & Key Colors (CORRECTED values)

| Node | Parent | H | C | T | Advanced Logic |
|------|--------|---|---|---|----------------|
| Seed | root | user | user | 50 | none |
| Primary | Seed | inherit | 36 | 40 | none (C is fixed 36 in TonalSpot) |
| Secondary | Seed | inherit | 16 | 40 | none |
| Tertiary | Seed | inherit +60 | 24 | 40 | none |
| Neutral | Seed | inherit | 6 | 50 | none |
| Neutral Variant | Seed | inherit | 8 | 50 | none |
| Error | root | 25 | 84 | 40 | none |

**NOTE:** No advanced logic needed for Phase 1! All chroma values are constants in TonalSpot.

#### Page 2: Tonal Palettes

Same as your current guide. Each palette creates child nodes at the M3 tone stops.

Important reminder: The HCT solver automatically gamut-clamps chroma at extreme tones. The child nodes will show the correct clamped chroma - this is expected behavior, not a bug.

#### Page 3: Semantic Tokens

Same as your current guide. Fixed tone assignments with per-theme switching.

#### Page 4: Component Tokens

Same as your current guide.

### Phase 2: Add Content/Fidelity Variant Support

Only implement if you want to match the "Content" scheme where the seed's own chroma is preserved.

#### Advanced Logic additions to Page 1:

| Node | Channel | Expression | Purpose |
|------|---------|-----------|---------|
| Primary | hctC | @Parent.hctC | Pass through full seed chroma |
| Secondary | hctC | max(@Parent.hctC - 32, @Parent.hctC * 0.5) | Desaturated source |
| Tertiary | hctC | max(@Parent.hctC - 32, @Parent.hctC * 0.5) | Desaturated source |
| Tertiary | hctH | @Parent.hctH + 60 | Simplified (real version uses temperature) |
| Neutral | hctC | @Parent.hctC / 8 | Proportional neutral |
| Neutral Variant | hctC | @Parent.hctC / 8 + 4 | Proportional + offset |

#### DislikeAnalyzer on Tertiary:
```
hctT: if @Self.hctH >= 90 AND @Self.hctH <= 111 AND @Self.hctC > 16 AND @Self.hctT < 65 then 70 else @Self.hctT
```

### Phase 3: Add Contrast Level Support (Advanced)

This requires a "contrast level" parameter node (a value from -1.0 to 1.0) and rewriting all semantic token tone assignments as advanced logic expressions.

#### The Contrast Tone Calculation

For each semantic color, the tone is:
```
adjustedTone = findToneForContrast(baseTone, backgroundTone, contrastCurveValue)
```

Where `contrastCurveValue` interpolates between the 4 contrast levels:
```
if level <= -1.0: return curve.low
if level < 0.0:   return lerp(curve.low, curve.normal, (level + 1.0))
if level < 0.5:   return lerp(curve.normal, curve.medium, level * 2)
if level <= 1.0:  return lerp(curve.medium, curve.high, (level - 0.5) * 2)
```

Then `findToneForContrast` does:
```
For light scheme: try going darker (lower tone) until contrast >= target
For dark scheme:  try going lighter (higher tone) until contrast >= target
```

The contrast ratio formula (WCAG):
```
contrastRatio(toneA, toneB) = 
  let lighter = max(yFromTone(toneA), yFromTone(toneB))
  let darker = min(yFromTone(toneA), yFromTone(toneB))
  return (lighter + 5) / (darker + 5)
```

**This is very complex to express in 0colors' advanced logic.** You would need:
- A "contrast level" parameter node
- Tone-to-Y conversion functions
- Iterative tone finding

**Recommendation:** Skip this unless you specifically want contrast adjustment. The fixed tones at standard contrast (level 0) are correct and accessible.

### Phase 4: Fidelity Container Tones (Very Advanced)

The Albers algorithm for finding optimal container tones:

```
performAlbers(sourceHct, scheme):
  let startTone = isDark ? 30 : 90
  let closestChroma = HCT(source.H, source.C, startTone).chroma
  let bestTone = startTone
  
  // Binary search across tones to find where chroma is closest to source
  for delta in [1, 2, 3, ..., 50]:
    let tonePlus = startTone + delta
    let toneMinus = startTone - delta
    
    let chromaPlus = HCT(source.H, source.C, tonePlus).chroma
    let chromaMinus = HCT(source.H, source.C, toneMinus).chroma
    
    if chromaPlus closer to source.C: bestTone = tonePlus
    if chromaMinus closer to source.C: bestTone = toneMinus
  
  return bestTone
```

**This requires reading back actual chroma from HCT solving, which may not be possible in 0colors' expression language.** Consider this a stretch goal.

---

## Part 8: The Complete ContrastCurve and ToneDeltaPair Reference

For completeness, here are ALL the DynamicColor definitions:

### ContrastCurves (low, normal, medium, high)

| Color | Low | Normal | Medium | High |
|-------|-----|--------|--------|------|
| primary | 3.0 | 4.5 | 7.0 | 7.0 |
| onPrimary | 4.5 | 7.0 | 11.0 | 21.0 |
| primaryContainer | 1.0 | 1.0 | 3.0 | 4.5 |
| onPrimaryContainer | 4.5 | 7.0 | 11.0 | 21.0 |
| secondary | 3.0 | 4.5 | 7.0 | 7.0 |
| onSecondary | 4.5 | 7.0 | 11.0 | 21.0 |
| secondaryContainer | 1.0 | 1.0 | 3.0 | 4.5 |
| onSecondaryContainer | 4.5 | 7.0 | 11.0 | 21.0 |
| tertiary | 3.0 | 4.5 | 7.0 | 7.0 |
| onTertiary | 4.5 | 7.0 | 11.0 | 21.0 |
| tertiaryContainer | 1.0 | 1.0 | 3.0 | 4.5 |
| onTertiaryContainer | 4.5 | 7.0 | 11.0 | 21.0 |
| error | 3.0 | 4.5 | 7.0 | 7.0 |
| onError | 4.5 | 7.0 | 11.0 | 21.0 |
| errorContainer | 1.0 | 1.0 | 3.0 | 4.5 |
| onErrorContainer | 4.5 | 7.0 | 11.0 | 21.0 |
| surface | 1.0 | 1.0 | 1.0 | 1.0 |
| onSurface | 4.5 | 7.0 | 11.0 | 21.0 |
| surfaceVariant | 1.0 | 1.0 | 3.0 | 4.5 |
| onSurfaceVariant | 3.0 | 4.5 | 7.0 | 11.0 |
| outline | 1.5 | 3.0 | 4.5 | 7.0 |
| outlineVariant | 1.0 | 1.0 | 1.0 | 3.0 |
| inverseSurface | 1.0 | 1.0 | 1.0 | 1.0 |
| inverseOnSurface | 4.5 | 7.0 | 11.0 | 21.0 |
| inversePrimary | 3.0 | 4.5 | 7.0 | 7.0 |

### ToneDeltaPairs

| Role A | Role B | Delta | Polarity | Stay Together |
|--------|--------|-------|----------|---------------|
| primaryContainer | primary | 10 | nearer | false |
| secondaryContainer | secondary | 10 | nearer | false |
| tertiaryContainer | tertiary | 10 | nearer | false |
| errorContainer | error | 10 | nearer | false |

---

## Part 9: Fixed Colors (New in M3 2023 Update)

Material 3 added "fixed" accent colors that DON'T change between light and dark:

| Semantic Token | Palette | Tone (both themes) |
|---------------|---------|-------------------|
| primaryFixed | primary | 90 |
| primaryFixedDim | primary | 80 |
| onPrimaryFixed | primary | 10 |
| onPrimaryFixedVariant | primary | 30 |
| secondaryFixed | secondary | 90 |
| secondaryFixedDim | secondary | 80 |
| onSecondaryFixed | secondary | 10 |
| onSecondaryFixedVariant | secondary | 30 |
| tertiaryFixed | tertiary | 90 |
| tertiaryFixedDim | tertiary | 80 |
| onTertiaryFixed | tertiary | 10 |
| onTertiaryFixedVariant | tertiary | 30 |

These use the SAME token in both Light and Dark themes. In 0colors, you'd assign the same palette token for both themes (or just leave it inherited).

---

## Part 10: Surface Elevation Tones (Corrected)

The current guide uses `lerp()` for surface tints, which was the M3 **original** approach (opacity-based elevation). The **current** M3 approach uses distinct neutral tones:

| Surface Level | Light Tone | Dark Tone | Palette |
|--------------|-----------|----------|---------|
| surfaceDim | 87 | 6 | neutral |
| surface | 98 | 6 | neutral |
| surfaceBright | 98 | 24 | neutral |
| surfaceContainerLowest | 100 | 4 | neutral |
| surfaceContainerLow | 96 | 10 | neutral |
| surfaceContainer | 94 | 12 | neutral |
| surfaceContainerHigh | 92 | 17 | neutral |
| surfaceContainerHighest | 90 | 22 | neutral |

No lerp needed! These are just fixed tone picks from the neutral palette. The old surface1-5 elevation system is deprecated.

---

## Part 11: Recommended Execution Order

### Step 1: Build TonalSpot (1-2 hours manual work)

Use FIXED chroma values (36, 16, 24, 6, 8) for key colors. No advanced logic needed.
This gives you an EXACT match to Material Theme Builder's default output.

### Step 2: Add Fixed Colors to Semantic Tokens (15 min)

Add the 12 `*Fixed` and `*FixedDim` semantic tokens from Part 9.

### Step 3: Verify against Material Theme Builder (30 min)

Pick 3-4 seed colors and compare your output with https://www.figma.com/community/plugin/1034969338659738588/material-theme-builder

The hex values should match within 1-2 units of rounding for TonalSpot.

### Step 4 (Optional): Add Scheme Variant Support

If you want Content/Fidelity/Vibrant variants, add advanced logic expressions from Phase 2. You could create separate "variant" pages or use conditional logic based on a parameter node.

### Step 5 (Optional): Add Contrast Level

This is the most complex feature. Only implement if your users specifically need WCAG contrast adjustment.

---

## Key Source Files for Reference

The canonical implementation is in `@nicolo-ribaudo/material-color-utilities` (or `@material/material-color-utilities`):

- `scheme/scheme_tonal_spot.ts` - Default variant algorithm
- `scheme/scheme_content.ts` - Content variant
- `scheme/scheme_vibrant.ts` - Vibrant variant  
- `scheme/scheme_expressive.ts` - Expressive variant
- `scheme/scheme_fidelity.ts` - Fidelity variant
- `scheme/scheme_monochrome.ts` - Monochrome variant
- `dynamiccolor/material_dynamic_colors.ts` - All 40+ semantic color definitions
- `dynamiccolor/dynamic_color.ts` - The DynamicColor engine
- `dynamiccolor/contrast_curve.ts` - Contrast calculation
- `dynamiccolor/tone_delta_pair.ts` - Paired tone constraints
- `hct/hct.ts` - HCT color space implementation
- `palettes/tonal_palette.ts` - TonalPalette (gamut-clamped chroma per tone)
- `dislike/dislike_analyzer.ts` - Yellow-green preference correction
- `temperature/temperature_cache.ts` - Color temperature for analogous selection

GitHub: https://github.com/nicolo-ribaudo/material-color-utilities (or search @nicolo-ribaudo/material-color-utilities on npm)
