# Palette System

## Overview

The palette system automatically generates multiple color shade variations from a single base color. It's designed for creating consistent color scales for design systems (e.g., Material Design color palettes, Tailwind color scales).

## Palette Nodes

### What is a Palette Node?

A palette node is a special type of color node (`isPalette: true`) that:
- Generates multiple child "shade" nodes automatically
- Creates corresponding design tokens for each shade
- Updates all shades when the base color changes
- Provides controls for lightness distribution and naming patterns

### Palette Properties

```typescript
interface ColorNode {
  // ... base ColorNode properties
  
  // Palette-specific properties
  isPalette?: boolean;              // Marks this as a palette node
  paletteName?: string;             // Name for the palette (e.g., "blue")
  paletteNameLocked?: boolean;      // Prevents auto-updating name
  paletteColorFormat?: 'HEX' | 'HSLA' | 'OKLCH' | 'RGBA';
  paletteLightnessMode?: 'linear' | 'curve';
  paletteLightnessStart?: number;   // Starting lightness (0-100)
  paletteLightnessEnd?: number;     // Ending lightness (0-100)
  paletteNamingPattern?: '1-9' | '10-90' | '100-900' | 'a-z';
  paletteShadeCount?: number;       // Number of shades (5-20)
}
```

### Default Values

When creating a palette node:
```typescript
{
  isPalette: true,
  paletteName: "palette",          // Auto-generated from color
  paletteNameLocked: false,
  paletteColorFormat: "HEX",
  paletteLightnessMode: "linear",
  paletteLightnessStart: 95,       // Very light
  paletteLightnessEnd: 15,         // Very dark
  paletteNamingPattern: "1-9",
  paletteShadeCount: 10
}
```

## Palette UI

### Palette Controls

**Location**: Expanded palette node shows special palette controls section

**Components**:

1. **Name Input**
   - Text input for palette name
   - Lock/unlock button to prevent auto-updates
   - When unlocked: name auto-generates from color (e.g., "Blue", "Red")
   - When locked: name stays fixed even when color changes

2. **Color Section**
   - 2D color picker (saturation + lightness)
   - Hue slider (horizontal rainbow gradient)
   - Alpha slider (with transparency checkerboard)
   - Color format selector (HEX, HSLA, OKLCH, RGBA)
   - Current color display

3. **Lightness Mode**
   - Radio buttons: Linear or Curve
   - **Linear**: Equal steps between start and end
   - **Curve**: Eased distribution (more steps in middle)

4. **Lightness Range**
   - Start lightness slider (0-100)
   - End lightness slider (0-100)
   - Visual preview of distribution

5. **Naming Pattern**
   - Dropdown with options:
     - `1-9`: 1, 2, 3, ..., 9
     - `10-90`: 10, 20, 30, ..., 90
     - `100-900`: 100, 200, 300, ..., 900
     - `a-z`: a, b, c, ..., z
   - Determines shade token naming

6. **Shade Count**
   - Numeric input (5-20)
   - Number of shades to generate

### 2D Color Picker

**Dimensions**: 
- Width: Full node width
- Height: 128px

**Interaction**:
- Click or drag to set color
- X-axis: Saturation (0-100%)
- Y-axis: Lightness (100-0%, inverted)

**Visual**:
```
White ────────> Pure Color
  ↓                 ↓
Black ────────> Dark Color
```

**Indicator**:
- White circle with border
- Positioned at current saturation/lightness

### Color Format Display

Shows the current color in selected format:

- **HEX**: `#3B82F6`
- **HSLA**: `hsla(220, 80%, 50%, 1)`
- **OKLCH**: `oklch(60% 0.15 220)`
- **RGBA**: `rgba(59, 130, 246, 1)`

## Shade Generation

### Shade Creation Process

When palette is created or shade count changes:

1. **Delete old shades**: Remove all existing child nodes
2. **Calculate lightness values**: Based on mode and range
3. **Create shade nodes**: One for each count (5-20)
4. **Create shade tokens**: One token per shade
5. **Link tokens to shades**: Assign token to corresponding shade node

### Lightness Calculation

**Linear Mode**:
```typescript
const t = i / (shadeCount - 1);  // 0.0 to 1.0
const shadeLightness = lightnessStart + (lightnessEnd - lightnessStart) * t;
```

**Example (10 shades, start=95, end=15)**:
```
Shade 1:  95% (lightest)
Shade 2:  86%
Shade 3:  77%
Shade 4:  68%
Shade 5:  59%
Shade 6:  50% (middle)
Shade 7:  41%
Shade 8:  32%
Shade 9:  23%
Shade 10: 15% (darkest)
```

**Curve Mode**:
```typescript
const t = i / (shadeCount - 1);
// Ease in-out quad curve
const easedT = t < 0.5 
  ? 2 * t * t 
  : 1 - Math.pow(-2 * t + 2, 2) / 2;
const shadeLightness = lightnessStart + (lightnessEnd - lightnessStart) * easedT;
```

**Example (10 shades, start=95, end=15)**:
```
Shade 1:  95% (lightest)
Shade 2:  93% (slower change)
Shade 3:  86%
Shade 4:  74%
Shade 5:  59%
Shade 6:  50% (middle)
Shade 7:  30%
Shade 8:  18%
Shade 9:  16% (slower change)
Shade 10: 15% (darkest)
```

**Use Case**:
- **Linear**: Even distribution, good for gradients
- **Curve**: More shades in middle range, better for UI scales

### Shade Positioning

Shades are positioned to the right of the palette node:

```typescript
position: {
  x: paletteNode.position.x + 450,  // 450px to the right
  y: paletteNode.position.y + (i * 90)  // Stacked vertically
}
```

**Visual Layout**:
```
[Palette Node] ──────> [Shade 1]
                       [Shade 2]
                       [Shade 3]
                       [Shade 4]
                       [Shade 5]
                       ...
```

### Shade Properties

Each shade node has:

```typescript
{
  id: `${Date.now()}-shade-${i}-${Math.random()}`,
  colorSpace: "hsl",
  hue: paletteNode.hue,           // Same as palette
  saturation: paletteNode.saturation,  // Same as palette
  lightness: calculatedLightness,      // Varies per shade
  alpha: paletteNode.alpha,            // Same as palette
  parentId: paletteNode.id,
  hueOffset: 0,
  saturationOffset: 0,
  lightnessOffset: calculatedLightness - paletteNode.lightness,
  alphaOffset: 0,
  tokenIds: [shadeTokenId],
  lockHue: false,
  lockSaturation: false,
  lockLightness: false,  // Lightness is managed by palette
  lockAlpha: false,
  diffHue: false,
  diffSaturation: false,
  diffLightness: false,
  diffAlpha: false,
  isExpanded: false
}
```

**Key Properties**:
- Shades inherit hue, saturation, and alpha from palette
- Only lightness varies per shade
- `lightnessOffset` stores difference from palette lightness
- Shades are children of the palette node

## Token Generation

### Shade Token Creation

For each shade, a design token is created:

```typescript
const token: DesignToken = {
  id: `${Date.now()}-token-${i}-${Math.random()}`,
  name: `${paletteName}/${shadeName}`,
  type: "color",
  groupId: paletteEntryGroupId,
  projectId: paletteNode.projectId,
  pageId: paletteNode.pageId,
  hue: paletteNode.hue,
  saturation: paletteNode.saturation,
  lightness: calculatedLightness,
  alpha: paletteNode.alpha
};
```

### Token Naming

Based on `paletteNamingPattern`:

**Pattern: `1-9`**
```
blue/1, blue/2, blue/3, ..., blue/9
```

**Pattern: `10-90`**
```
blue/10, blue/20, blue/30, ..., blue/90
```

**Pattern: `100-900`**
```
blue/100, blue/200, blue/300, ..., blue/900
```

**Pattern: `a-z`**
```
blue/a, blue/b, blue/c, ..., blue/z
```

**Example (10 shades, "100-900" pattern)**:
```
primary/100 (lightest)
primary/200
primary/300
primary/400
primary/500 (middle)
primary/600
primary/700
primary/800
primary/900
primary/1000 (darkest)
```

### Palette Entry Group

Each palette creates a special token group:

```typescript
const paletteEntryGroup: TokenGroup = {
  id: `palette-entry-${paletteNodeId}`,
  name: paletteName,  // e.g., "blue"
  projectId: paletteNode.projectId,
  pageId: paletteNode.pageId,
  isExpanded: true,
  isPaletteEntry: true,
  paletteNodeId: paletteNode.id,
  createdAt: Date.now()
};
```

**Characteristics**:
- `isPaletteEntry: true` marks it as auto-generated
- Name matches palette name
- Contains all shade tokens for this palette
- Deleted when palette node is deleted

## Palette Updates

### Changing Base Color

When palette node's hue, saturation, or alpha changes:

**Current Behavior** (Needs Enhancement):
- Shades DO NOT auto-update to match new base color
- User must manually delete and recreate palette

**Expected Behavior** (To Implement):
1. Detect color change on palette node
2. Update all shade nodes:
   - `hue = paletteNode.hue`
   - `saturation = paletteNode.saturation`
   - `alpha = paletteNode.alpha`
   - Recalculate lightness based on current mode/range
3. Update all shade tokens with new color values

### Changing Lightness Range

When `paletteLightnessStart` or `paletteLightnessEnd` changes:

**Current Behavior**: ✅ Works correctly

**Process**:
1. Find all shade nodes (children of palette)
2. Sort by Y position (to maintain order)
3. For each shade, recalculate lightness:
   ```typescript
   const t = index / (shadeCount - 1);
   const shadeLightness = lightnessStart + (lightnessEnd - lightnessStart) * t;
   ```
4. Update shade node and its token

### Changing Lightness Mode

When `paletteLightnessMode` changes (`linear` ↔ `curve`):

**Current Behavior**: ✅ Works correctly

**Process**: Same as lightness range change, but uses different calculation formula

### Changing Shade Count

When `paletteShadeCount` changes:

**Current Behavior**: ✅ Works correctly

**Process**:
1. Delete ALL existing shade nodes
2. Delete ALL existing shade tokens
3. Regenerate shades with new count
4. Create new tokens for all shades

**Note**: This is destructive - any manual adjustments to shades are lost

### Changing Naming Pattern

When `paletteNamingPattern` changes:

**Current Behavior** (Needs Enhancement):
- Tokens keep old names
- New shades created use new pattern

**Expected Behavior** (To Implement):
- Rename all existing shade tokens to match new pattern
- Update token names in-place without recreating tokens

### Changing Palette Name

When `paletteName` changes:

**Behavior**:
- If `paletteNameLocked: true`: Manual name change
- If `paletteNameLocked: false`: Auto-generated name updates

**Token Impact** (Current):
- Existing tokens keep old palette name
- New shades use new palette name

**Expected Behavior** (To Implement):
- Rename all shade tokens when palette name changes
- Update palette entry group name
- Format: `{newPaletteName}/{shadeName}`

## Palette Shades Grid

**Component**: `/components/PaletteShadesGrid.tsx`

**Purpose**: Display palette shades in a grid view (alternative to node view)

**Layout**:
```
┌──────┬──────┬──────┬──────┬──────┐
│Shade1│Shade2│Shade3│Shade4│Shade5│
│ 100  │ 200  │ 300  │ 400  │ 500  │
├──────┼──────┼──────┼──────┼──────┤
│Shade6│Shade7│Shade8│Shade9│Shade │
│ 600  │ 700  │ 800  │ 900  │ 1000 │
└──────┴──────┴──────┴──────┴──────┘
```

**Features**:
- Click shade to navigate to node
- Copy hex value on click
- Shows token name and value
- Responsive grid layout

## Palette Use Cases

### Material Design Color Palette

```
Palette: "red"
Shades: 10
Pattern: "100-900"
Start: 95
End: 15
Mode: curve

Result:
red/100  (very light red)
red/200
red/300
red/400
red/500  (base red)
red/600
red/700
red/800
red/900  (very dark red)
```

### Tailwind Color Scale

```
Palette: "blue"
Shades: 10
Pattern: "100-900"
Start: 97
End: 12
Mode: linear

Result:
blue/100  #DBEAFE
blue/200  #BFDBFE
blue/300  #93C5FD
blue/400  #60A5FA
blue/500  #3B82F6
blue/600  #2563EB
blue/700  #1D4ED8
blue/800  #1E40AF
blue/900  #1E3A8A
```

### Brand Color Variations

```
Palette: "brand"
Shades: 5
Pattern: "1-9"
Start: 80
End: 20
Mode: linear

Result:
brand/1  (light)
brand/2
brand/3  (base)
brand/4
brand/5  (dark)
```

## Palette Deletion

### Deleting Palette Node

When a palette node is deleted:

**Process**:
1. Delete palette node
2. Delete all shade nodes (children of palette)
3. Delete all shade tokens
4. Delete palette entry group
5. Remove from canvas

**Cascade**:
- All shades are deleted
- All tokens in palette entry group are deleted
- Group is removed from token panel

**Cannot be undone**: This is a destructive operation

## Palette Performance

### Optimization for Large Palettes

**Current**: 
- Maximum 20 shades (enforced by UI)
- All shades rendered simultaneously

**Performance Considerations**:
- Each shade is a full ColorNode component
- 20 shades = 20 node renders
- Token panel shows all shade tokens

**Optimization Strategies**:
- Use React.memo for shade nodes
- Virtualize token list for large palettes
- Lazy load shade nodes outside viewport

## Palette Limitations

### Current Limitations

1. **Fixed Hue**: All shades have same hue as palette
   - Cannot create color scales with hue variation
   - Example: Can't create rainbow gradient

2. **Fixed Saturation**: All shades have same saturation
   - Cannot create desaturating scales
   - Example: Can't fade to gray

3. **Lightness Only**: Only lightness varies between shades
   - Limits creative color scales
   - Example: Can't create warm-to-cool transitions

4. **No Manual Shade Editing**: Shades regenerate on palette changes
   - Cannot manually adjust individual shades
   - Any custom changes are lost

5. **No Shade Reordering**: Shades are always ordered by lightness
   - Cannot create custom orderings
   - Shade order is fixed

### Future Enhancements

**Advanced Shade Control**:
```typescript
{
  paletteHueStart?: number;      // Hue shift from start to end
  paletteHueEnd?: number;
  paletteSaturationStart?: number;  // Saturation shift
  paletteSaturationEnd?: number;
}
```

**Manual Shade Overrides**:
```typescript
{
  isManualOverride?: boolean;  // Shade won't regenerate
  manualHue?: number;          // Custom hue for this shade
}
```

**Custom Shade Formulas**:
```typescript
{
  shadeFormula?: string;  // e.g., "lighten(20%)" or "hue(+30)"
}
```

## Palette Best Practices

### Naming Conventions

- Use descriptive palette names: `"primary"`, `"accent"`, `"gray"`
- Use consistent patterns across palettes
- Material Design: `100-900` pattern
- Tailwind: `100-900` pattern
- Custom: `1-9` or `a-z` for fewer shades

### Lightness Range Selection

**UI Color Scales** (high contrast):
```
Start: 95-97 (very light backgrounds)
End: 10-15 (very dark text)
```

**Illustration Palettes** (narrower range):
```
Start: 70-80 (light)
End: 20-30 (dark)
```

**Monochrome Scales** (full range):
```
Start: 100 (white)
End: 0 (black)
```

### Shade Count Guidelines

- **5 shades**: Minimal scale (light, base, dark)
- **7 shades**: Standard UI scale
- **9-10 shades**: Material Design / Tailwind style
- **15+ shades**: Illustration / gradient work

### Color Space Selection

- **HSL**: Best for most UI color scales
- **OKLCH**: Perceptually uniform, better for accessibility
- **RGB**: Direct control, but less intuitive for scales
- **HEX**: Not recommended for palettes (use HSL/OKLCH instead)

## Integration with Token System

### Token Assignment

Each shade is automatically assigned its token:
```typescript
shadeNode.tokenIds = [shadeTokenId];
```

### Token Display

In token panel:
```
▼ Color Palettes
  ▼ blue (Palette Entry)
    ■ blue/100  #E3F2FD
    ■ blue/200  #BBDEFB
    ■ blue/300  #90CAF9
    ...
```

### Token Export

When exporting project, palette tokens are included with their group structure.
